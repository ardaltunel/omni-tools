const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");

function loadCore() {
    const sandbox = { URL, TextEncoder };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "core.js"), "utf8"), sandbox, { filename: "core.js" });
    return sandbox.SitemapGeneratorCore;
}

test("yalnızca HTTP ve HTTPS URL’lerini kabul eder", () => {
    const core = loadCore();
    assert.equal(core.validateHttpUrl("https://example.com/page").valid, true);
    assert.equal(core.validateHttpUrl("http://example.com").valid, true);
    for (const value of ["", "javascript:alert(1)", "data:text/plain,test", "ftp://example.com", "example", "https://"]) {
        const result = core.validateHttpUrl(value);
        assert.equal(result.valid, false, value);
        assert.equal(result.error, "Geçerli bir HTTP veya HTTPS URL’si girin.");
    }
});

test("çok satırlı girdiyi ayırır, tekrarları normalleştirerek kaldırır ve hataları bildirir", () => {
    const core = loadCore();
    const result = core.collectUrls("https://example.com\nhttps://example.com/\nbozuk\nhttps://example.com/about");

    assert.deepEqual(Array.from(result.valid), ["https://example.com/", "https://example.com/about"]);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.invalid.length, 1);
    assert.equal(result.total, 4);
});

test("basit sitemap yalnızca loc alanını SEO uyumlu XML olarak üretir", () => {
    const core = loadCore();
    const xml = core.generateSitemap([{ loc: "https://example.com/?a=1&b=2", lastmod: "2026-08-24", changefreq: "weekly", priority: "1.0" }]);

    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/u);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/u);
    assert.match(xml, /<loc>https:\/\/example\.com\/\?a=1&amp;b=2<\/loc>/u);
    assert.doesNotMatch(xml, /<lastmod>|<changefreq>|<priority>/u);
});

test("gelişmiş sitemap isteğe bağlı alanları gerçek XML değerleriyle üretir", () => {
    const core = loadCore();
    const xml = core.generateSitemap([{
        loc: "https://example.com/about",
        lastmod: "2026-08-24",
        changefreq: "monthly",
        priority: "0.8",
    }], { advanced: true });

    assert.match(xml, /<lastmod>2026-08-24<\/lastmod>/u);
    assert.match(xml, /<changefreq>monthly<\/changefreq>/u);
    assert.match(xml, /<priority>0\.8<\/priority>/u);
});

test("sitemap index standart sitemapindex yapısını üretir", () => {
    const core = loadCore();
    const xml = core.generateSitemapIndex([
        { loc: "https://example.com/sitemap-pages.xml" },
        { loc: "https://example.com/sitemap-posts.xml" },
    ]);

    assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/u);
    assert.equal((xml.match(/<sitemap>/gu) || []).length, 2);
    assert.match(xml, /<loc>https:\/\/example\.com\/sitemap-posts\.xml<\/loc>/u);
});

test("lastmod, changefreq ve priority alanlarını sınırlar içinde doğrular", () => {
    const core = loadCore();
    assert.equal(core.validateLastmod("2026-08-24").valid, true);
    assert.equal(core.validateLastmod("2026-02-30").valid, false);
    assert.equal(core.validateChangefreq("weekly").valid, true);
    assert.equal(core.validateChangefreq("sometimes").valid, false);
    assert.equal(core.validatePriority("0.8").value, "0.8");
    assert.equal(core.validatePriority("1.0").valid, true);
    assert.equal(core.validatePriority("1.1").valid, false);
    assert.equal(core.validatePriority("0.85").value, "0.85");
});

test("farklı alan adlarını ve robots.txt satırını belirler", () => {
    const core = loadCore();
    const entries = [{ loc: "https://example.com/" }, { loc: "https://shop.example.org/page" }];
    const domains = core.analyzeDomains(entries);

    assert.equal(domains.primaryDomain, "example.com");
    assert.equal(domains.hasMultipleDomains, true);
    assert.deepEqual(Array.from(domains.domains), ["example.com", "shop.example.org"]);
    assert.equal(core.buildRobotsLine(entries), "Sitemap: https://example.com/sitemap.xml");
});

test("hatalı ve tekrar eden kayıtlar XML üretimini engeller", () => {
    const core = loadCore();
    assert.throws(() => core.generateSitemap([{ loc: "javascript:alert(1)" }]), /hatalı URL/u);
    assert.throws(() => core.generateSitemap([{ loc: "https://example.com" }, { loc: "https://example.com/" }]), /hatalı URL/u);
    assert.throws(() => core.generateSitemap([]), /en az bir/u);
});

test("araç navigation, route metadata, stiller ve istemci dosyalarıyla kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");

    assert.match(html, /data-tool="sitemap-generator"/u);
    assert.match(html, /id="sitemap-generator"/u);
    assert.match(html, /tools\/sitemap-olusturucu\/style\.css/u);
    assert.match(html, /tools\/sitemap-olusturucu\/core\.js/u);
    assert.match(html, /tools\/sitemap-olusturucu\/app\.js/u);
    assert.match(html, /id="sitemap-simple-input"/u);
    assert.match(html, /id="sitemap-simple-xml"/u);
    assert.doesNotMatch(html, /Girdiğiniz URL’ler yalnızca tarayıcınızda işlenir/u);
    assert.match(script, /"sitemap-generator"\s*:/u);
});

test("uygulama ağ, sunucu veya kalıcı tarayıcı depolaması kullanmaz", () => {
    const source = `${fs.readFileSync(path.join(__dirname, "core.js"), "utf8")}\n${fs.readFileSync(path.join(__dirname, "app.js"), "utf8")}`;
    for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /application\/xml;charset=utf-8/u);
    assert.match(source, /sitemap\.xml/u);
});
