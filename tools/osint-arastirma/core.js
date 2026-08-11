(function (globalScope) {
    "use strict";

    const DNS_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "CAA"];
    const DISPOSABLE_DOMAINS = new Set([
        "10minutemail.com",
        "dispostable.com",
        "fakeinbox.com",
        "getnada.com",
        "guerrillamail.com",
        "maildrop.cc",
        "mailinator.com",
        "moakt.com",
        "sharklasers.com",
        "temp-mail.org",
        "tempmail.com",
        "throwawaymail.com",
        "trashmail.com",
        "yopmail.com",
    ]);

    function normalizeWhitespace(value) {
        return String(value == null ? "" : value).trim();
    }

    function stripTrailingDot(value) {
        return String(value || "").replace(/\.+$/, "");
    }

    function normalizeDomain(value) {
        let candidate = normalizeWhitespace(value).toLowerCase();
        if (!candidate) return "";

        try {
            const url = candidate.includes("://") ? new URL(candidate) : new URL(`https://${candidate}`);
            candidate = url.hostname;
        } catch (_error) {
            candidate = candidate.split(/[/?#]/, 1)[0];
        }

        return stripTrailingDot(candidate.replace(/^\[|\]$/g, ""));
    }

    function isValidDomain(value) {
        const domain = normalizeDomain(value);
        if (!domain || domain.length > 253 || !domain.includes(".")) return false;
        if (isValidIp(domain)) return false;
        if (/^\d+(?:\.\d+)+$/.test(domain)) return false;
        const labels = domain.split(".");
        return labels.every((label) => (
            label.length >= 1
            && label.length <= 63
            && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
        ));
    }

    function isValidIPv4(value) {
        const input = normalizeWhitespace(value);
        const parts = input.split(".");
        if (parts.length !== 4) return false;
        return parts.every((part) => (
            /^\d{1,3}$/.test(part)
            && !(part.length > 1 && part.startsWith("0"))
            && Number(part) >= 0
            && Number(part) <= 255
        ));
    }

    function isValidIPv6(value) {
        let input = normalizeWhitespace(value).replace(/^\[|\]$/g, "").toLowerCase();
        if (!input || input.includes(":::")) return false;
        const zoneIndex = input.indexOf("%");
        if (zoneIndex !== -1) input = input.slice(0, zoneIndex);
        if ((input.match(/::/g) || []).length > 1) return false;

        let ipv4Groups = 0;
        if (input.includes(".")) {
            const lastColon = input.lastIndexOf(":");
            if (lastColon === -1 || !isValidIPv4(input.slice(lastColon + 1))) return false;
            input = `${input.slice(0, lastColon)}:v4`;
            ipv4Groups = 2;
        }

        const halves = input.split("::");
        const left = halves[0] ? halves[0].split(":") : [];
        const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
        const validGroup = (group) => group === "v4" || /^[0-9a-f]{1,4}$/.test(group);
        if (![...left, ...right].every(validGroup)) return false;

        const groupCount = left.length + right.length + ipv4Groups - ([...left, ...right].includes("v4") ? 1 : 0);
        return halves.length === 2 ? groupCount < 8 : groupCount === 8;
    }

    function getIpVersion(value) {
        if (isValidIPv4(value)) return 4;
        if (isValidIPv6(value)) return 6;
        return null;
    }

    function isValidIp(value) {
        return getIpVersion(value) !== null;
    }

    function isPrivateIp(value) {
        const input = normalizeWhitespace(value).replace(/^\[|\]$/g, "").toLowerCase();
        if (isValidIPv4(input)) {
            const [a, b] = input.split(".").map(Number);
            return a === 10
                || a === 127
                || (a === 169 && b === 254)
                || (a === 172 && b >= 16 && b <= 31)
                || (a === 192 && b === 168)
                || (a === 100 && b >= 64 && b <= 127)
                || a === 0
                || a >= 224;
        }
        if (!isValidIPv6(input)) return false;
        return input === "::"
            || input === "::1"
            || input.startsWith("fc")
            || input.startsWith("fd")
            || /^fe[89ab]/.test(input)
            || input.startsWith("ff");
    }

    function isValidEmail(value) {
        const email = normalizeWhitespace(value);
        if (!email || email.length > 254 || /\s/.test(email)) return false;
        const at = email.lastIndexOf("@");
        if (at <= 0 || at === email.length - 1 || email.indexOf("@") !== at) return false;
        const local = email.slice(0, at);
        const domain = email.slice(at + 1);
        if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
        return /^[^<>()[\]\\,;:\s@"]+$/.test(local) && isValidDomain(domain);
    }

    function normalizeUrl(value) {
        const input = normalizeWhitespace(value);
        if (!input) throw new TypeError("Geçersiz URL.");
        let url;
        try {
            url = new URL(input);
        } catch (_error) {
            throw new TypeError("Geçersiz URL.");
        }
        if (!/^https?:$/.test(url.protocol)) throw new TypeError("Yalnızca HTTP ve HTTPS adresleri desteklenir.");
        if (!url.hostname) throw new TypeError("Geçersiz URL.");
        return url;
    }

    function looksLikeUserAgent(value) {
        const input = normalizeWhitespace(value);
        return input.length >= 20 && /(mozilla\/|curl\/|wget\/|postmanruntime\/|bot|crawler|spider)/i.test(input);
    }

    function detectQueryType(value) {
        const input = normalizeWhitespace(value);
        if (!input) return { type: "unknown", label: "Bilinmiyor" };
        if (looksLikeUserAgent(input)) return { type: "user-agent", label: "User-Agent" };
        if (isValidEmail(input)) return { type: "email", label: "E-posta" };
        const ipVersion = getIpVersion(input);
        if (ipVersion) return { type: "ip", label: `IPv${ipVersion}` };
        try {
            normalizeUrl(input);
            return { type: "url", label: "URL" };
        } catch (_error) {
            // Domain detection continues below.
        }
        if (isValidDomain(input)) return { type: "domain", label: "Alan adı" };
        return { type: "unknown", label: "Bilinmiyor" };
    }

    function getTld(hostname) {
        const labels = String(hostname || "").split(".").filter(Boolean);
        return labels.length > 1 ? labels[labels.length - 1] : "";
    }

    function analyzeUrl(value) {
        const url = normalizeUrl(value);
        const encodedMatches = url.href.match(/%[0-9a-f]{2}/gi) || [];
        const queryParameters = [];
        url.searchParams.forEach((parameterValue, key) => {
            queryParameters.push({ key, value: parameterValue });
        });
        return {
            originalUrl: normalizeWhitespace(value),
            normalizedUrl: url.href,
            protocol: url.protocol.replace(":", ""),
            hostname: url.hostname,
            port: url.port || (url.protocol === "https:" ? "443 (varsayılan)" : "80 (varsayılan)"),
            pathname: url.pathname,
            query: url.search || "Yok",
            fragment: url.hash || "Yok",
            queryParameters,
            isHttps: url.protocol === "https:",
            length: url.href.length,
            tld: getTld(url.hostname),
            hasCredentials: Boolean(url.username || url.password),
            usernamePresent: Boolean(url.username),
            passwordPresent: Boolean(url.password),
            hasPunycode: url.hostname.split(".").some((label) => label.startsWith("xn--")),
            encodedCharacterCount: encodedMatches.length,
        };
    }

    function parseVersion(match) {
        return match && match[1] ? match[1].replace(/_/g, ".") : "Bilinmiyor";
    }

    function analyzeUserAgent(value) {
        const ua = normalizeWhitespace(value);
        if (!ua) throw new TypeError("User-Agent bilgisi boş olamaz.");
        const lower = ua.toLowerCase();
        const bot = /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome)/i.test(ua);

        let browser = "Bilinmiyor";
        let browserVersion = "Bilinmiyor";
        const browserRules = [
            ["Microsoft Edge", /EdgA?\/([\d.]+)/i],
            ["Opera", /(?:OPR|Opera)\/([\d.]+)/i],
            ["Samsung Internet", /SamsungBrowser\/([\d.]+)/i],
            ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/i],
            ["Google Chrome", /(?:Chrome|CriOS)\/([\d.]+)/i],
            ["Safari", /Version\/([\d.]+).*Safari/i],
            ["Internet Explorer", /(?:MSIE\s|rv:)([\d.]+)/i],
            ["curl", /curl\/([\d.]+)/i],
            ["Wget", /Wget\/([\d.]+)/i],
        ];
        for (const [name, pattern] of browserRules) {
            const match = ua.match(pattern);
            if (match) {
                browser = name;
                browserVersion = parseVersion(match);
                break;
            }
        }
        if (bot) browser = browser === "Bilinmiyor" ? "Bot / Crawler" : browser;

        let engine = "Bilinmiyor";
        if (/AppleWebKit/i.test(ua) && /(?:Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser)/i.test(ua)) engine = "Blink";
        else if (/Gecko\//i.test(ua) && /Firefox/i.test(ua)) engine = "Gecko";
        else if (/AppleWebKit/i.test(ua)) engine = "WebKit";
        else if (/Trident/i.test(ua)) engine = "Trident";

        let operatingSystem = "Bilinmiyor";
        let osVersion = "Bilinmiyor";
        let match;
        if ((match = ua.match(/Windows NT ([\d.]+)/i))) {
            operatingSystem = "Windows";
            const versions = { "10.0": "10 / 11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
            osVersion = versions[match[1]] || match[1];
        } else if ((match = ua.match(/Android\s([\d.]+)/i))) {
            operatingSystem = "Android";
            osVersion = match[1];
        } else if ((match = ua.match(/(?:iPhone OS|CPU OS)\s([\d_]+)/i))) {
            operatingSystem = "iOS / iPadOS";
            osVersion = match[1].replace(/_/g, ".");
        } else if ((match = ua.match(/Mac OS X\s([\d_]+)/i))) {
            operatingSystem = "macOS";
            osVersion = match[1].replace(/_/g, ".");
        } else if (/Linux/i.test(ua)) {
            operatingSystem = "Linux";
        }

        let deviceType = "Masaüstü";
        if (bot) deviceType = "Bot / Crawler";
        else if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) deviceType = "Tablet";
        else if (/Mobile|iPhone|Android.*Mobile|Windows Phone/i.test(ua)) deviceType = "Mobil";

        let architecture = "Bilinmiyor";
        if (/(x86_64|Win64|x64|amd64|WOW64)/i.test(ua)) architecture = "64-bit x86";
        else if (/(i[3-6]86|x86)/i.test(ua)) architecture = "32-bit x86";
        else if (/(aarch64|arm64)/i.test(ua)) architecture = "ARM64";
        else if (/arm/i.test(ua)) architecture = "ARM";

        return {
            raw: ua,
            browser,
            browserVersion,
            engine,
            operatingSystem,
            osVersion,
            deviceType,
            architecture,
            isMobile: /mobile/i.test(lower),
            isBot: bot,
        };
    }

    function analyzeEmail(value) {
        const email = normalizeWhitespace(value);
        if (!isValidEmail(email)) throw new TypeError("Geçersiz e-posta adresi.");
        const at = email.lastIndexOf("@");
        const localPart = email.slice(0, at);
        const domain = normalizeDomain(email.slice(at + 1));
        return {
            email,
            syntaxValid: true,
            localPart,
            domain,
            tld: getTld(domain),
            disposable: DISPOSABLE_DOMAINS.has(domain),
            disposableCheckCoverage: "Yaygın geçici e-posta sağlayıcılarından oluşan yerel liste",
        };
    }

    function calculateDomainAge(creationDate, nowValue) {
        if (!creationDate) return null;
        const created = new Date(creationDate);
        const now = nowValue ? new Date(nowValue) : new Date();
        if (Number.isNaN(created.getTime()) || created > now) return null;
        let years = now.getUTCFullYear() - created.getUTCFullYear();
        let months = now.getUTCMonth() - created.getUTCMonth();
        if (now.getUTCDate() < created.getUTCDate()) months -= 1;
        if (months < 0) {
            years -= 1;
            months += 12;
        }
        return { years, months, text: `${years} yıl ${months} ay` };
    }

    function findRdapEvent(events, actions) {
        const accepted = Array.isArray(actions) ? actions : [actions];
        const event = (events || []).find((item) => accepted.includes(String(item.eventAction || "").toLowerCase()));
        return event ? event.eventDate || null : null;
    }

    function readVcard(entity) {
        const rows = entity && entity.vcardArray && Array.isArray(entity.vcardArray[1]) ? entity.vcardArray[1] : [];
        const get = (key) => {
            const row = rows.find((entry) => entry[0] === key);
            return row ? row[3] : null;
        };
        return { name: get("fn"), organization: get("org"), email: get("email") };
    }

    function parseRdapDomain(data, nowValue) {
        if (!data || typeof data !== "object") throw new TypeError("Geçersiz RDAP cevabı.");
        const events = data.events || [];
        const creationDate = findRdapEvent(events, ["registration"]);
        const expirationDate = findRdapEvent(events, ["expiration"]);
        const updatedDate = findRdapEvent(events, ["last changed", "last update of rdap database"]);
        const registrarEntity = (data.entities || []).find((entity) => (entity.roles || []).includes("registrar"));
        const registrar = registrarEntity ? readVcard(registrarEntity) : {};
        const nameservers = (data.nameservers || [])
            .map((item) => stripTrailingDot(item.ldhName || item.unicodeName || "").toLowerCase())
            .filter(Boolean);
        return {
            domain: String(data.ldhName || data.unicodeName || "").toLowerCase(),
            handle: data.handle || null,
            registrar: registrar.organization || registrar.name || null,
            registrarHandle: registrarEntity ? registrarEntity.handle || null : null,
            creationDate,
            expirationDate,
            updatedDate,
            age: calculateDomainAge(creationDate, nowValue),
            statuses: Array.from(new Set(data.status || [])),
            nameservers: Array.from(new Set(nameservers)).sort(),
            dnssec: data.secureDNS && typeof data.secureDNS.delegationSigned === "boolean"
                ? (data.secureDNS.delegationSigned ? "İmzalı" : "İmzasız")
                : "Bilinmiyor",
            port43: data.port43 || null,
            notices: (data.notices || []).map((notice) => notice.title).filter(Boolean),
            raw: data,
        };
    }

    function unquoteDnsText(value) {
        return String(value || "").replace(/^"|"$/g, "").replace(/"\s+"/g, "");
    }

    function parseDnsAnswer(type, answer) {
        const data = String(answer.data || "");
        const base = { name: stripTrailingDot(answer.name || ""), ttl: answer.TTL == null ? null : answer.TTL };
        if (type === "MX") {
            const match = data.match(/^(\d+)\s+(.+)$/);
            return { ...base, priority: match ? Number(match[1]) : null, exchange: stripTrailingDot(match ? match[2] : data) };
        }
        if (type === "SOA") {
            const parts = data.split(/\s+/);
            return {
                ...base,
                primaryNameserver: stripTrailingDot(parts[0]),
                responsibleMailbox: stripTrailingDot(parts[1]),
                serial: parts[2] || null,
                refresh: parts[3] || null,
                retry: parts[4] || null,
                expire: parts[5] || null,
                minimumTtl: parts[6] || null,
            };
        }
        if (type === "CAA") {
            const match = data.match(/^(\d+)\s+(\S+)\s+"?(.*?)"?$/);
            return { ...base, flags: match ? Number(match[1]) : null, tag: match ? match[2] : null, value: match ? match[3] : data };
        }
        return { ...base, value: type === "TXT" ? unquoteDnsText(data) : stripTrailingDot(data) };
    }

    function parseDnsResponse(type, data) {
        const answers = Array.isArray(data && data.Answer) ? data.Answer : [];
        return {
            type,
            status: data && Number.isFinite(data.Status) ? data.Status : null,
            authoritative: Boolean(data && data.AA),
            truncated: Boolean(data && data.TC),
            records: answers.map((answer) => parseDnsAnswer(type, answer)),
            comment: data && data.Comment ? data.Comment : null,
        };
    }

    function ipv4ReverseName(value) {
        if (!isValidIPv4(value)) throw new TypeError("Geçersiz IPv4 adresi.");
        return `${value.split(".").reverse().join(".")}.in-addr.arpa`;
    }

    function expandIPv6(value) {
        let input = normalizeWhitespace(value).replace(/^\[|\]$/g, "").toLowerCase();
        if (!isValidIPv6(input) || input.includes(".")) throw new TypeError("Geçersiz IPv6 adresi.");
        const parts = input.split("::");
        const left = parts[0] ? parts[0].split(":") : [];
        const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
        const missing = 8 - left.length - right.length;
        const groups = parts.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
        return groups.map((group) => group.padStart(4, "0")).join("");
    }

    function ipReverseName(value) {
        if (isValidIPv4(value)) return ipv4ReverseName(value);
        const expanded = expandIPv6(value);
        return `${expanded.split("").reverse().join(".")}.ip6.arpa`;
    }

    function cleanSubdomain(value, rootDomain) {
        const root = normalizeDomain(rootDomain);
        const candidate = stripTrailingDot(String(value || "").trim().toLowerCase().replace(/^\*\./, ""));
        if (!candidate || !isValidDomain(candidate)) return null;
        if (candidate !== root && !candidate.endsWith(`.${root}`)) return null;
        return candidate;
    }

    function createExportPayload(query, queryType, results, timestamp) {
        const payload = {
            query: String(query || ""),
            queryType: String(queryType || ""),
            timestamp: timestamp || new Date().toISOString(),
            results: results == null ? {} : results,
        };
        JSON.stringify(payload);
        return payload;
    }

    function sanitizeHistoryQuery(query, moduleId) {
        const value = String(query || "");
        if (String(moduleId || "") !== "url") return value;
        try {
            const url = normalizeUrl(value);
            url.username = "";
            url.password = "";
            return url.href;
        } catch (_error) {
            return value;
        }
    }

    const api = {
        DNS_TYPES,
        normalizeDomain,
        isValidDomain,
        isValidIPv4,
        isValidIPv6,
        getIpVersion,
        isValidIp,
        isPrivateIp,
        isValidEmail,
        normalizeUrl,
        detectQueryType,
        analyzeUrl,
        analyzeUserAgent,
        analyzeEmail,
        calculateDomainAge,
        parseRdapDomain,
        parseDnsResponse,
        ipReverseName,
        cleanSubdomain,
        createExportPayload,
        sanitizeHistoryQuery,
    };

    globalScope.OsintCenterCore = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
