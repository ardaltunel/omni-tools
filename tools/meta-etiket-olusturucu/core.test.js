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
    return context.globalThis.MetaTagGeneratorCore;
}

function validData(overrides = {}) {
    return {
        title: "Omni Tools - Ücretsiz Web Araçları",
        description: "Tarayıcıda çalışan PDF, görsel, SEO ve geliştirici araçlarını kurulum yapmadan güvenli ve hızlı şekilde kullanın. Tüm işlemler cihazınızda gerçekleşir.",
        pageUrl: "https://example.com/tools",
        siteName: "Omni Tools",
        author: "Arda Altunel",
        keywords: "web araçları, seo, pdf",
        language: "tr",
        canonical: "https://example.com/tools",
        themeColor: "#18A999",
        robots: ["index", "follow"],
        socialTitle: "",
        socialDescription: "",
        imageUrl: "https://example.com/og-image.png",
        ogType: "website",
        twitterCard: "summary_large_image",
        twitterSite: "@omnitools",
        twitterCreator: "ardaltunel",
        ...overrides,
    };
}

test("HTML özel karakterlerini başlık ve attribute değerlerinde güvenli biçimde kaçırır", () => {
    const core = loadCore();
    assert.equal(core.escapeHtmlAttribute(`A&B <test> "x" 'y'`), "A&amp;B &lt;test&gt; &quot;x&quot; &#39;y&#39;");
    const output = core.generateSeoTags(validData({ title: "<script>alert('x')</script>", description: `A&B "test"` }));
    assert.doesNotMatch(output, /<script>/u);
    assert.match(output, /&lt;script&gt;/u);
    assert.match(output, /A&amp;B &quot;test&quot;/u);
});

test("SEO, Open Graph ve Twitter etiketlerini ayrı ve birleşik çıktılar olarak üretir", () => {
    const core = loadCore();
    const output = core.generateMetaTags(validData());
    assert.match(output.seo, /<title>Omni Tools/u);
    assert.match(output.seo, /name="robots" content="index, follow"/u);
    assert.match(output.seo, /rel="canonical" href="https:\/\/example\.com\/tools"/u);
    assert.match(output.openGraph, /property="og:type" content="website"/u);
    assert.match(output.openGraph, /property="og:locale" content="tr_TR"/u);
    assert.match(output.twitter, /name="twitter:card" content="summary_large_image"/u);
    assert.match(output.all, /og:title/u);
    assert.match(output.all, /twitter:title/u);
});

test("boş sosyal alanlarda temel SEO başlığı ve açıklamasını kullanır", () => {
    const core = loadCore();
    const data = validData({ socialTitle: "", socialDescription: "" });
    const openGraph = core.generateOpenGraphTags(data);
    const twitter = core.generateTwitterTags(data);
    assert.match(openGraph, /og:title" content="Omni Tools - Ücretsiz Web Araçları/u);
    assert.match(twitter, /twitter:description" content="Tarayıcıda çalışan/u);
});

test("canonical boşsa etiketi üretmez, doluysa yalnızca HTTP veya HTTPS kabul eder", () => {
    const core = loadCore();
    assert.doesNotMatch(core.generateSeoTags(validData({ canonical: "" })), /canonical/u);
    assert.equal(core.validateHttpUrl("https://example.com").valid, true);
    assert.equal(core.validateHttpUrl("javascript:alert(1)").valid, false);
    assert.equal(core.validateHttpUrl("data:text/html,test").valid, false);
});

test("robots seçeneklerindeki index/noindex ve follow/nofollow çelişkilerini temizler", () => {
    const core = loadCore();
    assert.deepEqual(Array.from(core.normalizeRobots(["index", "noindex", "follow", "nofollow", "noarchive"])), ["noindex", "nofollow", "noarchive"]);
});

test("tema rengini ve Twitter/X kullanıcı adlarını doğrular", () => {
    const core = loadCore();
    assert.equal(core.validateThemeColor("#18A999").valid, true);
    assert.equal(core.validateThemeColor("18A999").valid, false);
    assert.equal(core.normalizeTwitterHandle("ardaltunel").value, "@ardaltunel");
    assert.equal(core.normalizeTwitterHandle("yanlış kullanıcı").valid, false);
});

test("zorunlu alanları, URL'leri ve yaklaşık uzunluk önerilerini denetler", () => {
    const core = loadCore();
    const invalid = core.validateMetaForm(validData({ title: "", description: "kısa", pageUrl: "bozuk", imageUrl: "ftp://example.com/a.png", themeColor: "red" }));
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((message) => message.includes("başlığı")));
    assert.ok(invalid.errors.some((message) => message.includes("sayfa URL")));
    assert.ok(invalid.errors.some((message) => message.includes("görsel URL")));
    assert.ok(invalid.warnings.some((message) => message.includes("Açıklama")));
    assert.equal(core.validateMetaForm(validData()).valid, true);
});

test("dil listesi kolay genişletilebilir locale kayıtları içerir", () => {
    const core = loadCore();
    assert.equal(core.LANGUAGES.length, 7);
    assert.deepEqual(Array.from(core.LANGUAGES.map((item) => item.value)), ["tr", "en", "de", "fr", "es", "it", "pt"]);
});

test("araç navigation, arama, route metadata, stil ve script sistemine bağlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const indexScript = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="meta-tag-generator"/u);
    assert.match(html, /id="meta-tag-generator"/u);
    assert.match(html, /Meta Etiket Oluşturucu/u);
    assert.match(html, /tools\/meta-etiket-olusturucu\/style\.css/u);
    assert.match(html, /tools\/meta-etiket-olusturucu\/core\.js/u);
    assert.match(html, /tools\/meta-etiket-olusturucu\/app\.js/u);
    assert.match(html, /id="meta-tag-open-sitemap"/u);
    assert.match(html, /id="meta-tag-open-robots"/u);
    assert.match(indexScript, /"meta-tag-generator"\s*:/u);
});

test("uygulama backend, API veya kalıcı depolama kullanmaz ve güvenli DOM işlemleri yapar", () => {
    const source = `${fs.readFileSync(path.join(toolRoot, "core.js"), "utf8")}\n${fs.readFileSync(path.join(toolRoot, "app.js"), "utf8")}`;
    for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console.log", "innerHTML"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /text\/html;charset=utf-8/u);
    assert.match(source, /link\.download = "meta-tags\.html"/u);
});
