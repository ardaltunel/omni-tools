const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const toolRoot = __dirname;
const projectRoot = path.resolve(toolRoot, "..", "..");

function loadCore() {
    const context = { globalThis: {}, URL };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(toolRoot, "core.js"), "utf8"), context);
    return context.globalThis.RobotsTxtCore;
}

test("yalnızca geçerli HTTP ve HTTPS site adreslerini kabul eder", () => {
    const core = loadCore();
    assert.equal(core.validateHttpUrl("https://example.com").valid, true);
    assert.equal(core.validateHttpUrl("http://example.com/path").valid, true);
    assert.equal(core.validateHttpUrl("javascript:alert(1)").valid, false);
    assert.equal(core.validateHttpUrl("data:text/plain,test").valid, false);
    assert.equal(core.validateHttpUrl("bozuk adres").valid, false);
});

test("çok satırlı kuralları ayırır, yolları düzeltir ve tekrarları kaldırır", () => {
    const core = loadCore();
    assert.deepEqual(Array.from(core.parseLines(" /admin/\n\n/private/ \n/admin/")), ["/admin/", "/private/", "/admin/"]);
    assert.equal(core.normalizePath("admin/"), "/admin/");
    const group = core.normalizeGroup({ userAgents: ["*", "*"], allow: ["public/", "/public/"], disallow: ["admin/"] });
    assert.deepEqual(Array.from(group.userAgents), ["*"]);
    assert.deepEqual(Array.from(group.allow), ["/public/"]);
    assert.deepEqual(Array.from(group.disallow), ["/admin/"]);
});

test("birden fazla bot grubunu ve sitemap adresini temiz robots.txt sözdizimiyle üretir", () => {
    const core = loadCore();
    const text = core.generateRobots([
        { userAgents: ["*"], allow: ["/public/"], disallow: ["/admin/"] },
        { userAgents: ["Googlebot", "Googlebot-Image"], allow: ["/images/"], disallow: [], crawlDelay: 5 },
    ], ["https://example.com/sitemap.xml"]);
    assert.equal(text, [
        "User-agent: *",
        "Allow: /public/",
        "Disallow: /admin/",
        "",
        "User-agent: Googlebot",
        "User-agent: Googlebot-Image",
        "Allow: /images/",
        "Crawl-delay: 5",
        "",
        "Sitemap: https://example.com/sitemap.xml",
    ].join("\n"));
});

test("tüm botlara izin şablonu boş Disallow, engelleme şablonu kök Disallow üretir", () => {
    const core = loadCore();
    assert.equal(core.generateRobots([{ userAgents: ["*"], includeEmptyDisallow: true }]), "User-agent: *\nDisallow:");
    assert.equal(core.generateRobots([{ userAgents: ["*"], disallow: ["/"] }]), "User-agent: *\nDisallow: /");
});

test("kritik engelleme, çakışma, tekrar ve farklı sitemap alan adını bildirir", () => {
    const core = loadCore();
    const result = core.validateConfiguration({
        siteUrl: "https://example.com",
        groups: [{ userAgents: ["*"], allow: ["/", "/"], disallow: ["/"] }],
        sitemaps: ["https://other.example/sitemap.xml", "https://other.example/sitemap.xml"],
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((message) => message.includes("tüm arama motorlarının")));
    assert.ok(result.warnings.some((message) => message.includes("hem izin verilen hem engellenen")));
    assert.ok(result.warnings.some((message) => message.includes("tekrar eden Allow")));
    assert.ok(result.warnings.some((message) => message.includes("alan adıyla eşleşmiyor")));
    assert.ok(result.warnings.some((message) => message.includes("sitemap adresleri tekilleştirildi")));
});

test("eksik user-agent, hatalı sitemap ve negatif crawl-delay dosyayı geçersiz yapar", () => {
    const core = loadCore();
    const result = core.validateConfiguration({
        siteUrl: "https://example.com",
        groups: [{ userAgents: [], crawlDelay: -1 }],
        sitemaps: ["ftp://example.com/sitemap.xml"],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((message) => message.includes("user-agent")));
    assert.ok(result.errors.some((message) => message.includes("crawl-delay")));
    assert.ok(result.errors.some((message) => message.includes("Geçersiz sitemap")));
});

test("site adresinden sitemap önerisi oluşturur", () => {
    const core = loadCore();
    assert.equal(core.createSitemapSuggestion("https://example.com/blog"), "https://example.com/sitemap.xml");
    assert.equal(core.createSitemapSuggestion("javascript:alert(1)"), "");
});

test("araç navigation, route metadata, stiller ve istemci dosyalarıyla kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="robots-txt-generator"/u);
    assert.match(html, /id="robots-txt-generator"/u);
    assert.match(html, /Robots\.txt Oluşturucu/u);
    assert.match(html, /tools\/robots-txt-olusturucu\/style\.css/u);
    assert.match(html, /tools\/robots-txt-olusturucu\/core\.js/u);
    assert.match(html, /tools\/robots-txt-olusturucu\/app\.js/u);
    assert.match(html, /data-tool="sitemap-generator"/u);
    assert.match(script, /"robots-txt-generator"\s*:/u);
});

test("uygulama yalnızca tarayıcıda çalışır ve robots.txt olarak indirir", () => {
    const source = `${fs.readFileSync(path.join(toolRoot, "core.js"), "utf8")}\n${fs.readFileSync(path.join(toolRoot, "app.js"), "utf8")}`;
    for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /text\/plain;charset=utf-8/u);
    assert.match(source, /link\.download = "robots\.txt"/u);
    assert.match(source, /setTimeout\(\(\) => \{/u);
    assert.match(source, /\}, 3000\)/u);
});
