(function (globalScope) {
    "use strict";

    const Core = globalScope.OsintCenterCore || (typeof require === "function" ? require("./core.js") : null);
    if (!Core) throw new Error("OSINT çekirdek modülü yüklenemedi.");

    const DEFAULT_TIMEOUT = 10000;
    const CACHE_TTL = 5 * 60 * 1000;
    const CERTSPOTTER_ENDPOINT = "https://api.certspotter.com/v1/issuances";
    const CRTSH_ENDPOINT = "https://crt.sh/";
    const IANA_DNS_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";

    class OsintServiceError extends Error {
        constructor(message, code, details) {
            super(message);
            this.name = "OsintServiceError";
            this.code = code || "UNKNOWN";
            this.details = details || null;
        }
    }

    function classifyFetchError(error) {
        if (error instanceof OsintServiceError) return error;
        if (error && error.name === "AbortError") return new OsintServiceError("İstek iptal edildi.", "ABORTED");
        if (error instanceof TypeError) {
            return new OsintServiceError(
                "Tarayıcı güvenlik politikası (CORS) veya ağ bağlantısı nedeniyle bu kaynağa erişilemedi.",
                "NETWORK_OR_CORS",
                error.message,
            );
        }
        return new OsintServiceError("Bu kaynak şu anda yanıt vermiyor.", "NETWORK", error && error.message);
    }

    function makeRequestContext(parentSignal, timeoutMs) {
        const controller = new AbortController();
        let timedOut = false;
        const abortFromParent = () => controller.abort(parentSignal && parentSignal.reason);
        if (parentSignal) {
            if (parentSignal.aborted) controller.abort(parentSignal.reason);
            else parentSignal.addEventListener("abort", abortFromParent, { once: true });
        }
        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        return {
            signal: controller.signal,
            didTimeout: () => timedOut,
            cleanup() {
                clearTimeout(timeoutId);
                if (parentSignal) parentSignal.removeEventListener("abort", abortFromParent);
            },
        };
    }

    function createOsintServices(options = {}) {
        const fetchImpl = options.fetchImpl || globalScope.fetch;
        const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT;
        const cache = new Map();
        if (typeof fetchImpl !== "function") throw new Error("Fetch API kullanılamıyor.");

        async function request(url, requestOptions = {}) {
            const context = makeRequestContext(requestOptions.signal, requestOptions.timeoutMs || timeoutMs);
            try {
                const response = await fetchImpl(url, {
                    method: requestOptions.method || "GET",
                    headers: requestOptions.headers,
                    redirect: requestOptions.redirect || "follow",
                    mode: requestOptions.mode || "cors",
                    cache: requestOptions.cache || "default",
                    signal: context.signal,
                });
                if (response.status === 429) {
                    throw new OsintServiceError("API istek sınırına ulaşıldı. Lütfen kısa bir süre sonra tekrar deneyin.", "RATE_LIMIT");
                }
                if (!response.ok) {
                    throw new OsintServiceError(
                        response.status === 404 ? "Kayıt bulunamadı." : `Kaynak HTTP ${response.status} yanıtı verdi.`,
                        response.status === 404 ? "NOT_FOUND" : "HTTP_ERROR",
                        { status: response.status },
                    );
                }
                return response;
            } catch (error) {
                if (context.didTimeout()) throw new OsintServiceError("İstek zaman aşımına uğradı.", "TIMEOUT");
                throw classifyFetchError(error);
            } finally {
                context.cleanup();
            }
        }

        async function requestJson(url, requestOptions = {}) {
            const cacheKey = requestOptions.cacheKey || null;
            if (cacheKey) {
                const cached = cache.get(cacheKey);
                if (cached && Date.now() - cached.time < (requestOptions.cacheTtl || CACHE_TTL)) return cached.value;
            }
            const response = await request(url, requestOptions);
            let data;
            try {
                data = await response.json();
            } catch (error) {
                throw new OsintServiceError("Kaynak geçerli JSON döndürmedi.", "INVALID_RESPONSE", error.message);
            }
            if (cacheKey) cache.set(cacheKey, { time: Date.now(), value: data });
            return data;
        }

        async function lookupDns(domainValue, type = "ALL", signal) {
            const domain = Core.normalizeDomain(domainValue);
            if (!Core.isValidDomain(domain)) throw new OsintServiceError("Geçersiz alan adı.", "INVALID_INPUT");
            const types = type === "ALL" ? Core.DNS_TYPES : [String(type).toUpperCase()];
            if (types.some((recordType) => !Core.DNS_TYPES.includes(recordType))) {
                throw new OsintServiceError("Desteklenmeyen DNS kayıt türü.", "INVALID_INPUT");
            }
            const settled = await Promise.allSettled(types.map(async (recordType) => {
                const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${recordType}`;
                const data = await requestJson(url, {
                    signal,
                    cacheKey: `dns:${domain}:${recordType}`,
                    headers: { Accept: "application/dns-json" },
                });
                return Core.parseDnsResponse(recordType, data);
            }));
            const records = {};
            const errors = {};
            settled.forEach((outcome, index) => {
                const recordType = types[index];
                if (outcome.status === "fulfilled") records[recordType] = outcome.value;
                else errors[recordType] = serializeError(outcome.reason);
            });
            if (!Object.keys(records).length) throw settled[0].reason;
            return { domain, requestedType: type, records, errors };
        }

        async function getDomainRdapBase(domain, signal) {
            const tld = domain.split(".").pop();
            const bootstrap = await requestJson(IANA_DNS_BOOTSTRAP, {
                signal,
                cacheKey: "rdap:dns-bootstrap",
                cacheTtl: 24 * 60 * 60 * 1000,
            });
            const service = (bootstrap.services || []).find((entry) => (
                Array.isArray(entry[0]) && entry[0].some((label) => String(label).toLowerCase() === tld)
            ));
            if (!service || !Array.isArray(service[1]) || !service[1][0]) {
                throw new OsintServiceError("Bu alan adı uzantısı için RDAP servisi bulunamadı.", "RDAP_UNAVAILABLE");
            }
            return service[1][0];
        }

        async function lookupWhois(domainValue, signal) {
            const domain = Core.normalizeDomain(domainValue);
            if (!Core.isValidDomain(domain)) throw new OsintServiceError("Geçersiz alan adı.", "INVALID_INPUT");
            let primaryError = null;
            try {
                const baseUrl = await getDomainRdapBase(domain, signal);
                const endpoint = `${baseUrl.replace(/\/?$/, "/")}domain/${encodeURIComponent(domain)}`;
                const data = await requestJson(endpoint, { signal, cacheKey: `rdap:${domain}` });
                return { ...Core.parseRdapDomain(data), source: endpoint, protocol: "RDAP" };
            } catch (error) {
                primaryError = error;
                if (error && error.code === "ABORTED") throw error;
            }
            try {
                const fallback = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
                const data = await requestJson(fallback, { signal, cacheKey: `rdap-fallback:${domain}` });
                return { ...Core.parseRdapDomain(data), source: fallback, protocol: "RDAP" };
            } catch (fallbackError) {
                throw new OsintServiceError(
                    "WHOIS/RDAP bilgisi alınamadı. Kayıt servisi tarayıcı erişimine kapalı veya şu anda yanıt vermiyor.",
                    fallbackError.code || primaryError.code || "RDAP_UNAVAILABLE",
                    { primary: serializeError(primaryError), fallback: serializeError(fallbackError) },
                );
            }
        }

        async function lookupPtr(ip, signal) {
            const reverseName = Core.ipReverseName(ip);
            const data = await requestJson(`https://dns.google/resolve?name=${encodeURIComponent(reverseName)}&type=PTR`, {
                signal,
                cacheKey: `ptr:${ip}`,
                headers: { Accept: "application/dns-json" },
            });
            const records = (data.Answer || []).map((answer) => String(answer.data || "").replace(/\.$/, "")).filter(Boolean);
            return records;
        }

        async function lookupIpRdap(ip, signal) {
            const endpoint = `https://rdap.org/ip/${encodeURIComponent(ip)}`;
            const data = await requestJson(endpoint, { signal, cacheKey: `ip-rdap:${ip}` });
            const cidr = Array.isArray(data.cidr0_cidrs) && data.cidr0_cidrs[0]
                ? `${data.cidr0_cidrs[0].v4prefix || data.cidr0_cidrs[0].v6prefix}/${data.cidr0_cidrs[0].length}`
                : null;
            return {
                name: data.name || null,
                handle: data.handle || null,
                type: data.type || null,
                country: data.country || null,
                startAddress: data.startAddress || null,
                endAddress: data.endAddress || null,
                network: cidr,
                port43: data.port43 || null,
                source: endpoint,
            };
        }

        async function lookupCymru(ip, signal) {
            const version = Core.getIpVersion(ip);
            const originName = version === 4
                ? `${ip.split(".").reverse().join(".")}.origin.asn.cymru.com`
                : Core.ipReverseName(ip).replace(/\.ip6\.arpa$/, ".origin6.asn.cymru.com");
            const originData = await requestJson(`https://dns.google/resolve?name=${encodeURIComponent(originName)}&type=TXT`, {
                signal,
                cacheKey: `cymru-origin:${ip}`,
                headers: { Accept: "application/dns-json" },
            });
            const originText = originData.Answer && originData.Answer[0]
                ? String(originData.Answer[0].data || "").replace(/^"|"$/g, "")
                : "";
            if (!originText) throw new OsintServiceError("IP için ASN kaydı bulunamadı.", "NOT_FOUND");
            const originParts = originText.split("|").map((part) => part.trim());
            const asn = originParts[0] || null;
            let organization = null;
            let asnCountry = null;
            if (asn) {
                try {
                    const asnData = await requestJson(`https://dns.google/resolve?name=${encodeURIComponent(`AS${asn}.asn.cymru.com`)}&type=TXT`, {
                        signal,
                        cacheKey: `cymru-asn:${asn}`,
                        headers: { Accept: "application/dns-json" },
                    });
                    const asnText = asnData.Answer && asnData.Answer[0]
                        ? String(asnData.Answer[0].data || "").replace(/^"|"$/g, "")
                        : "";
                    const asnParts = asnText.split("|").map((part) => part.trim());
                    asnCountry = asnParts[1] || null;
                    organization = asnParts[4] || null;
                } catch (_error) {
                    // Origin ASN and prefix remain useful without the description lookup.
                }
            }
            return {
                asn,
                prefix: originParts[1] || null,
                countryCode: originParts[2] || asnCountry,
                registry: originParts[3] || null,
                allocatedAt: originParts[4] || null,
                organization,
                source: "Team Cymru IP to ASN DNS",
            };
        }

        function normalizeGeo(data, source) {
            if (!data || typeof data !== "object") return null;
            if (source === "ipwho.is") {
                if (data.success === false) throw new OsintServiceError(data.message || "IP konum bilgisi alınamadı.", "IP_API_ERROR");
                return {
                    source,
                    asn: data.connection ? data.connection.asn || null : null,
                    organization: data.connection ? data.connection.org || null : null,
                    isp: data.connection ? data.connection.isp || null : null,
                    country: data.country || null,
                    countryCode: data.country_code || null,
                    region: data.region || null,
                    city: data.city || null,
                    postalCode: data.postal || null,
                    timezone: data.timezone ? data.timezone.id || null : null,
                    latitude: Number.isFinite(data.latitude) ? data.latitude : null,
                    longitude: Number.isFinite(data.longitude) ? data.longitude : null,
                };
            }
            return {
                source,
                asn: data.asn || null,
                organization: data.asnOrganization || data.asn_organization || null,
                isp: data.asnOrganization || data.asn_organization || null,
                country: data.countryName || data.country_name || null,
                countryCode: data.countryCode || data.country_code || null,
                region: data.regionName || data.region_name || null,
                city: data.cityName || data.city_name || null,
                postalCode: data.zipCode || data.zip_code || null,
                timezone: Array.isArray(data.timeZones) ? data.timeZones[0] : (data.timeZone || data.timezone || null),
                latitude: Number.isFinite(data.latitude) ? data.latitude : null,
                longitude: Number.isFinite(data.longitude) ? data.longitude : null,
            };
        }

        async function lookupGeolocation(ip, signal) {
            let primaryError;
            try {
                const data = await requestJson(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal, cacheKey: `ip-geo:ipwho:${ip}` });
                return normalizeGeo(data, "ipwho.is");
            } catch (error) {
                primaryError = error;
                if (error && error.code === "ABORTED") throw error;
            }
            try {
                const data = await requestJson(`https://free.freeipapi.com/api/json/${encodeURIComponent(ip)}`, {
                    signal,
                    cacheKey: `ip-geo:freeipapi:${ip}`,
                });
                return normalizeGeo(data, "FreeIPAPI");
            } catch (fallbackError) {
                throw new OsintServiceError(
                    "IP geolocation kaynakları şu anda yanıt vermiyor veya istek sınırına ulaştı.",
                    fallbackError.code || primaryError.code || "IP_API_ERROR",
                    { primary: serializeError(primaryError), fallback: serializeError(fallbackError) },
                );
            }
        }

        async function lookupIp(ipValue, signal) {
            const ip = String(ipValue || "").trim().replace(/^\[|\]$/g, "");
            const version = Core.getIpVersion(ip);
            if (!version) throw new OsintServiceError("Geçersiz IP adresi.", "INVALID_INPUT");
            if (Core.isPrivateIp(ip)) {
                return { ip, version, isPrivate: true, note: "Bu özel bir IP adresidir ve herkese açık internet konum bilgisi bulunmaz." };
            }

            const [geoResult, ptrResult, rdapResult, cymruResult] = await Promise.allSettled([
                lookupGeolocation(ip, signal),
                lookupPtr(ip, signal),
                lookupIpRdap(ip, signal),
                lookupCymru(ip, signal),
            ]);
            if (geoResult.status === "rejected" && ptrResult.status === "rejected" && rdapResult.status === "rejected" && cymruResult.status === "rejected") {
                throw geoResult.reason;
            }
            const geo = geoResult.status === "fulfilled" ? geoResult.value : null;
            const cymru = cymruResult.status === "fulfilled" ? cymruResult.value : null;
            const rdap = rdapResult.status === "fulfilled" ? rdapResult.value : null;
            return {
                ip,
                version,
                isPrivate: false,
                reverseHostnames: ptrResult.status === "fulfilled" ? ptrResult.value : [],
                asn: (geo && geo.asn) || (cymru && cymru.asn) || null,
                organization: (geo && geo.organization) || (cymru && cymru.organization) || (rdap && rdap.name) || null,
                isp: geo ? geo.isp : null,
                country: geo ? geo.country : null,
                countryCode: (geo && geo.countryCode) || (cymru && cymru.countryCode) || (rdap && rdap.country) || null,
                region: geo ? geo.region : null,
                city: geo ? geo.city : null,
                postalCode: geo ? geo.postalCode : null,
                timezone: geo ? geo.timezone : null,
                latitude: geo ? geo.latitude : null,
                longitude: geo ? geo.longitude : null,
                network: (rdap && (rdap.network || rdap.name)) || (cymru && cymru.prefix) || null,
                registry: cymru ? cymru.registry : null,
                rdap,
                cymru,
                geolocationSource: geo ? geo.source : null,
                errors: {
                    geolocation: geoResult.status === "rejected" ? serializeError(geoResult.reason) : null,
                    reverseDns: ptrResult.status === "rejected" ? serializeError(ptrResult.reason) : null,
                    rdap: rdapResult.status === "rejected" ? serializeError(rdapResult.reason) : null,
                    asnDns: cymruResult.status === "rejected" ? serializeError(cymruResult.reason) : null,
                },
                geolocationNotice: "Konum bilgileri IP tabanlıdır, yaklaşık olabilir ve fiziksel adres göstermez.",
            };
        }

        async function requestCertificateNames(domain, signal) {
            const certSpotterUrl = `${CERTSPOTTER_ENDPOINT}?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
            try {
                const issuances = await requestJson(certSpotterUrl, { signal, cacheKey: `ct:certspotter:${domain}` });
                return {
                    source: "Cert Spotter Sertifika Şeffaflığı",
                    names: (issuances || []).flatMap((issuance) => issuance.dns_names || []),
                };
            } catch (primaryError) {
                if (primaryError.code === "ABORTED") throw primaryError;
                try {
                    const crtUrl = `${CRTSH_ENDPOINT}?q=${encodeURIComponent(`%.${domain}`)}&output=json`;
                    const rows = await requestJson(crtUrl, { signal, cacheKey: `ct:crtsh:${domain}` });
                    return {
                        source: "crt.sh Sertifika Şeffaflığı",
                        names: (rows || []).flatMap((row) => String(row.name_value || "").split(/\r?\n/)),
                    };
                } catch (fallbackError) {
                    throw new OsintServiceError(
                        "Sertifika Şeffaflığı kaynağına tarayıcıdan erişilemiyor veya kaynak şu anda yanıt vermiyor.",
                        fallbackError.code || primaryError.code || "CT_UNAVAILABLE",
                        { primary: serializeError(primaryError), fallback: serializeError(fallbackError) },
                    );
                }
            }
        }

        async function mapLimit(items, limit, worker) {
            const results = new Array(items.length);
            let nextIndex = 0;
            async function run() {
                while (nextIndex < items.length) {
                    const index = nextIndex;
                    nextIndex += 1;
                    try {
                        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
                    } catch (error) {
                        results[index] = { status: "rejected", reason: error };
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
            return results;
        }

        async function discoverSubdomains(domainValue, signal, onProgress) {
            const domain = Core.normalizeDomain(domainValue);
            if (!Core.isValidDomain(domain)) throw new OsintServiceError("Geçersiz alan adı.", "INVALID_INPUT");
            const certificates = await requestCertificateNames(domain, signal);
            const uniqueNames = Array.from(new Set(certificates.names.map((name) => Core.cleanSubdomain(name, domain)).filter(Boolean))).sort();
            const limitedNames = uniqueNames.slice(0, 200);
            let completed = 0;
            const settled = await mapLimit(limitedNames, 6, async (name) => {
                const lookup = await lookupDns(name, "A", signal);
                const records = lookup.records.A ? lookup.records.A.records.map((record) => record.value) : [];
                completed += 1;
                if (typeof onProgress === "function") onProgress(completed, limitedNames.length);
                return { subdomain: name, ips: records, dnsStatus: records.length ? "Çözümlendi" : "Kayıt yok" };
            });
            const results = settled.map((outcome, index) => {
                if (outcome.status === "fulfilled") return outcome.value;
                completed += 1;
                if (typeof onProgress === "function") onProgress(completed, limitedNames.length);
                return {
                    subdomain: limitedNames[index],
                    ips: [],
                    dnsStatus: outcome.reason && outcome.reason.code === "ABORTED" ? "İptal edildi" : "Kontrol edilemedi",
                };
            });
            return {
                domain,
                source: certificates.source,
                total: uniqueNames.length,
                resolvedCount: results.filter((item) => item.ips.length).length,
                results,
                limited: uniqueNames.length > limitedNames.length,
                limit: limitedNames.length,
            };
        }

        async function lookupEmail(emailValue, signal) {
            const analysis = Core.analyzeEmail(emailValue);
            const dns = await lookupDns(analysis.domain, "ALL", signal);
            const mx = dns.records.MX ? dns.records.MX.records : [];
            const addresses = ["A", "AAAA"].flatMap((type) => dns.records[type] ? dns.records[type].records : []);
            return {
                ...analysis,
                mxAvailable: mx.length > 0,
                mxServers: mx,
                domainDnsActive: mx.length > 0 || addresses.length > 0,
                dnsErrors: dns.errors,
                privacyNotice: "Bu denetim posta kutusunun varlığını sorgulamaz; yalnızca e-posta biçimini ve alan adının herkese açık DNS kayıtlarını inceler.",
            };
        }

        async function researchDomain(domainValue, signal) {
            const domain = Core.normalizeDomain(domainValue);
            if (!Core.isValidDomain(domain)) throw new OsintServiceError("Geçersiz alan adı.", "INVALID_INPUT");
            const [whoisResult, dnsResult] = await Promise.allSettled([
                lookupWhois(domain, signal),
                lookupDns(domain, "ALL", signal),
            ]);
            if ([whoisResult, dnsResult].every((item) => item.status === "rejected")) {
                throw dnsResult.reason || whoisResult.reason;
            }
            return {
                domain,
                whois: whoisResult.status === "fulfilled" ? whoisResult.value : null,
                dns: dnsResult.status === "fulfilled" ? dnsResult.value : null,
                errors: {
                    whois: whoisResult.status === "rejected" ? serializeError(whoisResult.reason) : null,
                    dns: dnsResult.status === "rejected" ? serializeError(dnsResult.reason) : null,
                },
            };
        }

        function serializeError(error) {
            if (!error) return null;
            return { name: error.name || "Error", code: error.code || "UNKNOWN", message: error.message || String(error) };
        }

        return {
            lookupDns,
            lookupWhois,
            lookupIp,
            discoverSubdomains,
            lookupEmail,
            researchDomain,
            serializeError,
            clearCache: () => cache.clear(),
        };
    }

    const api = { createOsintServices, OsintServiceError, classifyFetchError };
    globalScope.OsintCenterServices = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
