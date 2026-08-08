"use strict";

const assert = require("node:assert/strict");
const Core = require("./core.js");

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`✓ ${name}\n`);
    } catch (error) {
        process.stderr.write(`✗ ${name}\n`);
        throw error;
    }
}

test("domain doğrulaması geçerli alan adlarını kabul eder", () => {
    assert.equal(Core.isValidDomain("github.com"), true);
    assert.equal(Core.normalizeDomain(" https://WWW.Example.com/path "), "www.example.com");
    assert.equal(Core.isValidDomain("xn--bcher-kva.example"), true);
});

test("istenen geçersiz domain örneklerini reddeder", () => {
    ["999.999.999.999", "not a domain", "http://", "@", "example..com"].forEach((value) => {
        assert.equal(Core.isValidDomain(value), false, value);
    });
});

test("IPv4 ve IPv6 doğrulaması katıdır", () => {
    assert.equal(Core.isValidIPv4("8.8.8.8"), true);
    assert.equal(Core.isValidIPv4("999.999.999.999"), false);
    assert.equal(Core.isValidIPv4("01.2.3.4"), false);
    assert.equal(Core.isValidIPv6("2001:4860:4860::8888"), true);
    assert.equal(Core.isValidIPv6("2001:::1"), false);
});

test("private ve public IP adreslerini ayırır", () => {
    assert.equal(Core.isPrivateIp("192.168.1.1"), true);
    assert.equal(Core.isPrivateIp("172.16.0.1"), true);
    assert.equal(Core.isPrivateIp("8.8.8.8"), false);
    assert.equal(Core.isPrivateIp("::1"), true);
    assert.equal(Core.isPrivateIp("2001:4860:4860::8888"), false);
});

test("hızlı araştırma sorgu türlerini algılar", () => {
    assert.equal(Core.detectQueryType("8.8.8.8").type, "ip");
    assert.equal(Core.detectQueryType("github.com").type, "domain");
    assert.equal(Core.detectQueryType("https://github.com").type, "url");
    assert.equal(Core.detectQueryType("test@example.com").type, "email");
    assert.equal(Core.detectQueryType("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0").type, "user-agent");
});

test("URL analizi query, credentials, encoding ve punycode sinyallerini çıkarır", () => {
    const result = Core.analyzeUrl("https://user:pass@xn--bcher-kva.example:8443/a%20b?page=2&lang=tr#x");
    assert.equal(result.hostname, "xn--bcher-kva.example");
    assert.equal(result.port, "8443");
    assert.equal(result.hasCredentials, true);
    assert.equal(result.hasPunycode, true);
    assert.equal(result.encodedCharacterCount, 1);
    assert.deepEqual(result.queryParameters, [{ key: "page", value: "2" }, { key: "lang", value: "tr" }]);
});

test("URL analizi HTTP dışındaki protokolleri reddeder", () => {
    assert.throws(() => Core.analyzeUrl("javascript:alert(1)"), /HTTP ve HTTPS/);
    assert.throws(() => Core.analyzeUrl("http://"), /Geçersiz URL/);
});

test("User-Agent analizi browser, engine, OS ve mimariyi çıkarır", () => {
    const result = Core.analyzeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36");
    assert.equal(result.browser, "Google Chrome");
    assert.equal(result.engine, "Blink");
    assert.equal(result.operatingSystem, "Windows");
    assert.equal(result.architecture, "64-bit x86");
    assert.equal(result.isBot, false);
});

test("e-posta analizi mailbox probing yapmadan domain bilgisi çıkarır", () => {
    const result = Core.analyzeEmail("test@gmail.com");
    assert.equal(result.localPart, "test");
    assert.equal(result.domain, "gmail.com");
    assert.equal(result.disposable, false);
    assert.throws(() => Core.analyzeEmail("@"), /Geçersiz/);
});

test("domain yaşı yıl ve ay olarak hesaplanır", () => {
    assert.deepEqual(Core.calculateDomainAge("2008-04-01T00:00:00Z", "2026-08-08T00:00:00Z"), {
        years: 18,
        months: 4,
        text: "18 yıl 4 ay",
    });
});

test("RDAP cevabı okunabilir WHOIS modeline dönüştürülür", () => {
    const result = Core.parseRdapDomain({
        ldhName: "EXAMPLE.COM",
        handle: "123",
        status: ["client transfer prohibited"],
        events: [
            { eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" },
            { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" },
        ],
        entities: [{
            roles: ["registrar"],
            handle: "REG",
            vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]],
        }],
        nameservers: [{ ldhName: "NS1.EXAMPLE.COM." }],
        secureDNS: { delegationSigned: true },
    }, "2026-08-08T00:00:00Z");
    assert.equal(result.domain, "example.com");
    assert.equal(result.registrar, "Example Registrar");
    assert.deepEqual(result.nameservers, ["ns1.example.com"]);
    assert.equal(result.dnssec, "İmzalı");
});

test("DNS MX, SOA, CAA ve TXT kayıtları veri odaklı ayrıştırılır", () => {
    const mx = Core.parseDnsResponse("MX", { Status: 0, Answer: [{ name: "example.com.", TTL: 300, data: "10 mail.example.com." }] });
    assert.equal(mx.records[0].priority, 10);
    assert.equal(mx.records[0].exchange, "mail.example.com");
    const txt = Core.parseDnsResponse("TXT", { Status: 0, Answer: [{ name: "example.com.", TTL: 60, data: '"v=spf1" " -all"' }] });
    assert.equal(txt.records[0].value, "v=spf1 -all");
});

test("subdomain temizleme wildcard, duplicate hazırlığı ve kapsam kontrolü yapar", () => {
    assert.equal(Core.cleanSubdomain("*.API.Example.com.", "example.com"), "api.example.com");
    assert.equal(Core.cleanSubdomain("evil-example.com", "example.com"), null);
});

test("IPv4 ve IPv6 reverse DNS adları üretilir", () => {
    assert.equal(Core.ipReverseName("8.8.8.8"), "8.8.8.8.in-addr.arpa");
    assert.match(Core.ipReverseName("2001:db8::1"), /ip6\.arpa$/);
});

test("JSON export şeması geçerli ve serileştirilebilirdir", () => {
    const payload = Core.createExportPayload("github.com", "Domain Intelligence", { dns: { active: true } }, "2026-08-08T12:00:00.000Z");
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
        query: "github.com",
        queryType: "Domain Intelligence",
        timestamp: "2026-08-08T12:00:00.000Z",
        results: { dns: { active: true } },
    });
});

test("URL credentials araştırma geçmişine kalıcı olarak yazılmaz", () => {
    assert.equal(
        Core.sanitizeHistoryQuery("https://user:secret@example.com/path?q=1", "url"),
        "https://example.com/path?q=1",
    );
    assert.equal(Core.sanitizeHistoryQuery("test@gmail.com", "email"), "test@gmail.com");
});

process.stdout.write("OSINT core testleri tamamlandı.\n");
