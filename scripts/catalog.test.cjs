"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");
const catalog = require("./generate-catalog.cjs");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
const result = catalog.generateCatalog(html, source);

test("committed first paint contains every canonical tool and category", () => {
    assert.equal(result.tools.length, 58);
    assert.equal(result.categories.length, 8);
    assert.equal((html.match(/class="app-home-card"/g) || []).length, result.tools.length);
    assert.equal((html.match(/class="app-home-category-section"/g) || []).length, result.categories.length);
    assert.equal((html.match(/class="app-home-category-filter"/g) || []).length, result.categories.length);
    assert.equal((html.match(/class="app-home-category-symbol"[^>]*><svg /g) || []).length, result.categories.length);
    for (const tool of result.tools) {
        assert.equal((html.match(new RegExp(`class="app-home-card"[^>]*data-tool="${tool.id}"`, "g")) || []).length, 1);
    }
    assert.match(html, /<body class="is-app-home">/);
});

test("source navigation and generated cards use the same Turkish ordering", () => {
    const original = [...html.matchAll(/class="nav-item"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((match) => catalog.decodeHtml(match[1]));
    assert.deepEqual(original, result.tools.map((tool) => tool.name));
    assert.deepEqual(result.tools.map((tool) => tool.name), [...original].sort((a, b) => a.localeCompare(b, "tr", { sensitivity: "base" })));
    for (const category of result.categories) {
        const block = html.split(`id="app-home-category-${category.id}"`)[1].split("</section>")[0];
        const ids = [...block.matchAll(/class="app-home-card"[^>]*data-tool="([^"]+)"/g)].map((match) => match[1]);
        const expected = result.tools.filter((tool) => (result.categories.find((item) => item.sourceCategories.includes(tool.category)) || result.categories[2]).id === category.id).map((tool) => tool.id);
        assert.deepEqual(ids, expected);
    }
});

test("generation is deterministic and --check rejects stale generated content", () => {
    assert.equal(result.html, html);
    assert.equal(catalog.generateCatalog(result.html, source).html, result.html);
    const stale = html.replace('class="app-home-card-name">Ambiyans Ekranı', 'class="app-home-card-name">Old Ambient');
    assert.notEqual(catalog.generateCatalog(stale, source).html, stale);
    const check = spawnSync(process.execPath, [path.join(__dirname, "generate-catalog.cjs"), "--check"], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr || check.stdout);
});

test("navigation text and attribute content are decoded once and safely escaped", () => {
    const fixture = '<nav id="tool-nav"><button class="nav-item" data-tool="sample" data-category="Araçlar" data-description="&quot;A&amp;B&quot; &lt;img src=x onerror=alert(1)&gt;"><span>İş &amp; &quot;Araç&quot;</span></button></nav>';
    const [tool] = catalog.readNavigation(fixture);
    assert.equal(tool.name, 'İş & "Araç"');
    assert.equal(tool.description, '"A&B" <img src=x onerror=alert(1)>');
    const cards = catalog.renderCards([tool], result.categories, result.icons);
    assert.match(cards, /İş &amp; &quot;Araç&quot;/);
    assert.match(cards, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(cards, /<img src=x/);
    assert.equal(catalog.escapeHtml("<&>\"'"), "&lt;&amp;&gt;&quot;&#39;");
    assert.equal(catalog.decodeHtml("&#x130;&#351;"), "İş");
});

test("only catalog literals execute and malformed source or duplicate IDs fail", () => {
    assert.deepEqual(catalog.readFrozenConstant('throw new Error("page boot must not run");\nconst values = Object.freeze([{ name: "A (B)", count: 2 }]);\nthrow new Error("later boot must not run");', "values"), [{ name: "A (B)", count: 2 }]);
    assert.throws(() => catalog.readFrozenConstant("const other = [];", "values"), /Missing catalog constant/);
    assert.throws(() => catalog.generateCatalog(html.replace("<!-- catalog:cards:end -->", ""), source), /markers/);
    assert.throws(() => catalog.readNavigation('<nav id="tool-nav"><button class="nav-item" data-tool="same"><span>Bir</span></button><button class="nav-item" data-tool="same"><span>İki</span></button></nav>'), /duplicate tool IDs/);
});

test("critical local bootstrap and direct selection precede remote dependencies", () => {
    const footer = html.slice(html.indexOf("// Select real tool content"));
    assert.ok(footer.indexOf('src="index.js?v=home5"') < footer.indexOf('id="qr-code-library"'));
    assert.ok(footer.indexOf('src="tools/ambient-display/app.js') < footer.indexOf('id="qr-code-library"'));
    assert.match(html, /rel="preload" as="script" href="index.js\?v=home5" fetchpriority="high"/);
    assert.match(html, /id="qr-code-library"[^>]* async>/);
    assert.match(html, /window\.coi = \{ quiet: true, doReload: \(\) => \{\} \}/);
    assert.ok(source.lastIndexOf("initializeToolRouting();") > source.lastIndexOf("prepareTypingTest(true);"));
    assert.doesNotMatch(source.slice(source.indexOf("function initializeToolRouting()"), source.indexOf("function getRequestedToolFromLocation()")), /setTimeout/);
});

test("head route selection avoids a catalog flash for query, path, file and legacy routes", () => {
    const script = catalog.renderInitialRoute(result.tools, source).match(/<script>([\s\S]*)<\/script>/)[1];
    const select = (url, base = "https://example.test/") => {
        const document = {
            baseURI: base, documentElement: { dataset: {} },
            createElement: () => ({}), head: { children: [], append(element) { this.children.push(element); } },
        };
        vm.runInNewContext(script, { document, window: { location: { href: url } }, URL });
        return document;
    };
    for (const [url, base, expected] of [
        ["https://example.test/?tool=ambient-display", undefined, "ambient-display"],
        ["https://example.test/?tool=ambiyans-ekrani", undefined, "ambient-display"],
        ["https://example.test/ambient-display", undefined, "ambient-display"],
        ["https://example.test/ambiyans-ekrani", undefined, "ambient-display"],
        ["https://example.test/qr-kod-olusturucu", undefined, "qr"],
        ["https://example.test/kripto-kurlari", undefined, "crypto"],
        ["https://example.test/?tool=converter", undefined, "uzanti-donusturucu"],
        ["https://owner.github.io/omni-tools/ambient-display", "https://owner.github.io/omni-tools/", "ambient-display"],
        ["file:///C:/site/index.html#/ambient-display", "file:///C:/site/", "ambient-display"],
    ]) {
        const document = select(url, base);
        assert.equal(document.documentElement.dataset.initialTool, expected);
        assert.equal(document.head.children[0].textContent, `#app-home{display:none}#${expected}.tool-panel{display:block}`);
    }
    for (const url of ["https://example.test/", "https://example.test/index.html", "https://example.test/missing", "https://example.test/?tool=__proto__", "https://example.test/%E0%A4%A", "https://example.test/one/two"]) {
        assert.equal(select(url).head.children.length, 0, url);
    }
});

test("Ambiyans Ekranı preserves its internal ID and previous route while adding its Turkish route", () => {
    const tool = result.tools.find((item) => item.id === "ambient-display");
    assert.equal(tool.name, "Ambiyans Ekranı");
    assert.equal(result.tools.length, 58);
    assert.match(html, /data-tool="ambient-display"[^>]*aria-label="Ambiyans Ekranı uygulamasını aç"/);
    assert.match(html, /class="app-home-card-name">Ambiyans Ekranı<\/span>/);
    const definitions = source.slice(source.indexOf("const legacyToolRoutes"), source.indexOf("const appHomeCategories"));
    const functions = source.slice(source.indexOf("function createToolRouteSlug"), source.indexOf("function updateToolHistory"));
    const routes = vm.runInNewContext(`${definitions}\n${functions}\n({ old: resolveToolRoute("ambient-display"), current: resolveToolRoute("ambiyans-ekrani"), preferred: getPreferredToolRoute("ambient-display") });`, {
        navItems: result.tools.map((item) => ({ dataset: { tool: item.id }, querySelector: () => ({ textContent: item.name }) })),
    });
    assert.equal(routes.old, "ambient-display");
    assert.equal(routes.current, "ambient-display");
    assert.equal(routes.preferred, "ambiyans-ekrani");
});

function createQRHarness() {
    const listeners = {};
    const timers = [];
    const elements = new Map();
    const element = (id) => {
        const value = { id, value: "", textContent: "", attributes: {}, listeners: {}, disabled: false, canvas: null,
            addEventListener(type, callback) { this.listeners[type] = callback; },
            setAttribute(name, next) { this.attributes[name] = next; },
            querySelector(selector) { return selector === "canvas" ? this.canvas : null; },
            set innerHTML(next) { this.canvas = null; this.textContent = next; },
        };
        elements.set(id, value);
        return value;
    };
    ["qr-text", "qr-light", "qr-dark", "qr-size", "qr-code", "qr-download", "qr-share", "qr-size-label"].forEach(element);
    elements.get("qr-text").value = "https://example.test";
    elements.get("qr-size").value = "240";
    elements.get("qr-light").value = "#ffffff";
    elements.get("qr-dark").value = "#000000";
    const context = vm.createContext({
        document: { getElementById: (id) => elements.get(id), addEventListener: (type, callback) => { listeners[type] = callback; } },
        setTimeout: (callback) => { timers.push(callback); return timers.length; },
    });
    const qrSource = source.slice(source.indexOf('const qrText = document.getElementById("qr-text");'), source.indexOf('const speechForm = document.getElementById("speech-form");'));
    vm.runInContext(qrSource, context);
    const run = () => vm.runInContext("generateQRCode()", context);
    const ready = () => {
        context.QRCode = function QRCode(container, options) {
            container.canvas = { toDataURL: () => `data:image/png;base64,${options.text}` };
        };
        listeners.load({ target: { id: "qr-code-library" } });
    };
    const flush = async () => {
        while (timers.length) timers.shift()();
        await Promise.resolve();
        await Promise.resolve();
    };
    return { context, elements, listeners, timers, run, ready, flush };
}

test("async QR library readiness never enables actions without a generated image", async () => {
    const harness = createQRHarness();
    await harness.run();
    assert.match(harness.elements.get("qr-code").textContent, /yükleniyor/);
    assert.equal(harness.elements.get("qr-share").disabled, true);
    assert.equal(harness.elements.get("qr-download").attributes["aria-disabled"], "true");
    let prevented = false;
    harness.elements.get("qr-download").listeners.click({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    harness.ready();
    await harness.flush();
    assert.equal(harness.elements.get("qr-share").disabled, false);
    assert.equal(harness.elements.get("qr-download").href, "data:image/png;base64,https://example.test");
    assert.equal(harness.elements.get("qr-code").attributes["aria-busy"], "false");
});

test("a failed QR CDN leaves an actionable failure message and disabled exports", async () => {
    const harness = createQRHarness();
    await harness.run();
    harness.listeners.error({ target: { id: "qr-code-library" } });
    assert.match(harness.elements.get("qr-code").textContent, /yüklenemedi/);
    assert.equal(harness.elements.get("qr-code").attributes["aria-busy"], "false");
    assert.equal(harness.elements.get("qr-share").disabled, true);
    assert.equal(harness.elements.get("qr-download").href, "#");
});

test("older QR renders cannot re-enable actions while a newer input is pending", async () => {
    const harness = createQRHarness();
    harness.ready();
    await harness.flush();
    harness.elements.get("qr-text").value = "first";
    const first = harness.run();
    harness.elements.get("qr-text").value = "second";
    const second = harness.run();
    harness.timers.shift()();
    await first;
    assert.equal(harness.elements.get("qr-share").disabled, true);
    assert.equal(harness.elements.get("qr-code").attributes["aria-busy"], "true");
    harness.timers.shift()();
    await second;
    assert.equal(harness.elements.get("qr-download").href, "data:image/png;base64,second");
    assert.equal(harness.elements.get("qr-share").disabled, false);
});
