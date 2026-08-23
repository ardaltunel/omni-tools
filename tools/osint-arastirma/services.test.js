"use strict";

const assert = require("node:assert/strict");
require("./core.js");
const { createOsintServices } = require("./services.js");

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function createMockFetch() {
    const calls = [];
    const mock = async (url, options = {}) => {
        const value = String(url);
        calls.push({ url: value, options });
        if (value === "https://data.iana.org/rdap/dns.json") {
            return json({ services: [[['com'], ["https://rdap.test/"]]] });
        }
        if (value === "https://rdap.test/domain/google.com") {
            return json({
                objectClassName: "domain",
                ldhName: "GOOGLE.COM",
                events: [{ eventAction: "registration", eventDate: "1997-09-15T00:00:00Z" }],
                nameservers: [{ ldhName: "NS1.GOOGLE.COM" }],
                secureDNS: { delegationSigned: false },
            });
        }
        if (value.startsWith("https://dns.google/resolve")) {
            const parsed = new URL(value);
            const name = parsed.searchParams.get("name");
            const type = parsed.searchParams.get("type");
            if (type === "MX") return json({ Status: 0, Answer: [{ name: `${name}.`, TTL: 300, data: `10 mail.${name}.` }] });
            if (type === "PTR") return json({ Status: 0, Answer: [{ name: `${name}.`, TTL: 60, data: "dns.google." }] });
            if (type === "A") return json({ Status: 0, Answer: [{ name: `${name}.`, TTL: 60, data: "1.2.3.4" }] });
            return json({ Status: 0, Answer: [] });
        }
        if (value === "https://ipwho.is/8.8.8.8") {
            return json({ success: true, country: "United States", country_code: "US", city: "Mountain View", latitude: 37.4, longitude: -122.1, timezone: { id: "America/Los_Angeles" }, connection: { asn: 15169, org: "Google LLC", isp: "Google" } });
        }
        if (value === "https://rdap.org/ip/8.8.8.8") {
            return json({ name: "GOGL", cidr0_cidrs: [{ v4prefix: "8.8.8.0", length: 24 }] });
        }
        if (value.startsWith("https://api.certspotter.com/v1/issuances")) {
            return json([{ dns_names: ["*.example.com", "api.example.com", "evil-example.com"] }]);
        }
        throw new TypeError(`Unhandled mock URL: ${value}`);
    };
    mock.calls = calls;
    return mock;
}

async function test(name, fn) {
    try {
        await fn();
        process.stdout.write(`✓ ${name}\n`);
    } catch (error) {
        process.stderr.write(`✗ ${name}\n`);
        throw error;
    }
}

(async () => {
    const mockFetch = createMockFetch();
    const services = createOsintServices({ fetchImpl: mockFetch, timeoutMs: 1000 });

    await test("DNS tüm kayıt türlerini hata toleranslı sorgular", async () => {
        const result = await services.lookupDns("cloudflare.com", "ALL");
        assert.equal(Object.keys(result.records).length, 8);
        assert.equal(result.records.A.records[0].value, "1.2.3.4");
        assert.equal(result.records.MX.records[0].priority, 10);
    });

    await test("WHOIS IANA bootstrap üzerinden authoritative RDAP servisini kullanır", async () => {
        const result = await services.lookupWhois("google.com");
        assert.equal(result.domain, "google.com");
        assert.equal(result.protocol, "RDAP");
        assert.equal(result.source, "https://rdap.test/domain/google.com");
    });

    await test("IP lookup geolocation, PTR ve RDAP sonuçlarını birleştirir", async () => {
        const result = await services.lookupIp("8.8.8.8");
        assert.equal(result.asn, 15169);
        assert.deepEqual(result.reverseHostnames, ["dns.google"]);
        assert.equal(result.rdap.network, "8.8.8.0/24");
    });

    await test("private IP için dış servise istek atılmaz", async () => {
        const before = mockFetch.calls.length;
        const result = await services.lookupIp("192.168.1.1");
        assert.equal(result.isPrivate, true);
        assert.equal(mockFetch.calls.length, before);
    });

    await test("subdomain keşfi wildcard ve kapsam dışı isimleri temizler", async () => {
        const result = await services.discoverSubdomains("example.com");
        assert.deepEqual(result.results.map((item) => item.subdomain), ["api.example.com", "example.com"]);
        assert.equal(result.resolvedCount, 2);
    });

    await test("e-posta araştırması yalnızca alan adı DNS/MX bilgisi toplar", async () => {
        const result = await services.lookupEmail("test@gmail.com");
        assert.equal(result.mxAvailable, true);
        assert.equal(result.localPart, "test");
        assert.equal(Object.prototype.hasOwnProperty.call(result, "mailboxExists"), false);
    });

    await test("geçersiz girdiler ağ çağrısından önce reddedilir", async () => {
        await assert.rejects(() => services.lookupDns("example..com", "A"), /Geçersiz alan adı/);
        await assert.rejects(() => services.lookupIp("999.999.999.999"), /Geçersiz IP/);
    });

    await test("konum hizmeti istek sınırında ikinci anahtarsız kaynağa geçer", async () => {
        const fallbackFetch = async (url) => {
            const value = String(url);
            if (value === "https://ipwho.is/8.8.4.4") return json({ message: "limit" }, 429);
            if (value === "https://free.freeipapi.com/api/json/8.8.4.4") {
                return json({ countryName: "United States", countryCode: "US", cityName: "Mountain View", latitude: 37.4, longitude: -122.1, asn: 15169, asnOrganization: "Google LLC" });
            }
            if (value === "https://rdap.org/ip/8.8.4.4") return json({ name: "GOGL", cidr0_cidrs: [{ v4prefix: "8.8.4.0", length: 24 }] });
            if (value.includes("type=PTR")) return json({ Status: 0, Answer: [] });
            if (value.includes("origin.asn.cymru.com") && value.includes("type=TXT")) return json({ Status: 0, Answer: [{ data: '"15169 | 8.8.4.0/24 | US | arin | 1992-12-01"' }] });
            if (value.includes("AS15169.asn.cymru.com")) return json({ Status: 0, Answer: [{ data: '"15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC, US"' }] });
            throw new TypeError(`Unhandled fallback URL: ${value}`);
        };
        const fallbackServices = createOsintServices({ fetchImpl: fallbackFetch, timeoutMs: 1000 });
        const result = await fallbackServices.lookupIp("8.8.4.4");
        assert.equal(result.geolocationSource, "FreeIPAPI");
        assert.equal(result.organization, "Google LLC");
        assert.equal(result.network, "8.8.4.0/24");
    });

    await test("yanıt vermeyen kaynak timeout ile sonlandırılır", async () => {
        const hangingFetch = (_url, options = {}) => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        });
        const timeoutServices = createOsintServices({ fetchImpl: hangingFetch, timeoutMs: 15 });
        await assert.rejects(() => timeoutServices.lookupDns("example.com", "A"), (error) => error.code === "TIMEOUT");
    });

    process.stdout.write("OSINT service testleri tamamlandı.\n");
})().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
});
