const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const config = require("./config.js");
const core = require("./core.js");
const listing = require("./listing.js");
const valuation = require("./valuation.js");

// Exercise the actual application and event handlers with a small DOM adapter.
// IDs, named controls and select options come from the real page markup.
function createApp() {
    const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
    const start = html.indexOf('<section id="emlak-portfoy-analizi"');
    const markup = html.slice(start, html.indexOf('<section id="farkli-rengi-bul"', start));
    const nodes = new Map();
    const allNodes = [];
    const timers = new Map();
    const copies = [];
    const networkRequests = [];
    let nextTimer = 0;
    const datasetKey = (key) => key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    class Element {
        constructor(tag = "div", attrs = {}) {
            this.tagName = tag.toUpperCase();
            this.attrs = {};
            this.children = [];
            this.dataset = {};
            this.style = {};
            this.events = new Map();
            this.value = "";
            this.hidden = false;
            this.lastChild = { textContent: "" };
            Object.entries(attrs).forEach(([key, value]) => this.setAttribute(key, value));
        }
        setAttribute(key, value) {
            this.attrs[key] = String(value);
            if (key === "id") { this.id = String(value); nodes.set(this.id, this); }
            else if (key.startsWith("data-")) this.dataset[datasetKey(key.slice(5))] = String(value);
            else if (key === "hidden") this.hidden = true;
            else if (["name", "value", "class", "type"].includes(key)) this[key === "class" ? "className" : key] = String(value);
        }
        removeAttribute(key) { delete this.attrs[key]; }
        addEventListener(type, handler) { this.events.set(type, [...(this.events.get(type) || []), handler]); }
        async dispatch(type, target = this) { for (const handler of this.events.get(type) || []) await handler({ target, preventDefault() {} }); }
        append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
        replaceChildren(...children) { this.children = []; this.append(...children); }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
        get options() { return this.children.filter((child) => child.tagName === "OPTION"); }
        add(option) { this.append(option); }
        focus() {}
        scrollIntoView() {}
        closest() { return this.parent || new Element("section"); }
        querySelectorAll(selector) {
            const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
            return descendants(this).filter((element) => matches(element, selector));
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    }
    class Input extends Element {}
    function matches(element, selector) {
        if (selector.startsWith(".")) return (element.className || "").split(/\s+/).includes(selector.slice(1));
        const tag = selector.match(/^[a-z]+/i)?.[0];
        if (tag && element.tagName !== tag.toUpperCase()) return false;
        for (const match of selector.matchAll(/\[([^=\]]+)(?:=["']([^"']*)["'])?\]/g)) {
            const value = match[1].startsWith("data-") ? element.dataset[datasetKey(match[1].slice(5))] : element[match[1]] ?? element.attrs[match[1]];
            if (value === undefined || (match[2] !== undefined && String(value) !== match[2])) return false;
        }
        return true;
    }
    const attrsOf = (text) => Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] || ""]));
    for (const match of markup.matchAll(/<(\w+)\b([^>]*)>/g)) {
        const attrs = attrsOf(match[2]);
        if (!attrs.id && !attrs.name && !attrs["data-estate-example"] && !attrs.class?.includes("real-estate-building-details")) continue;
        const element = new (match[1] === "input" ? Input : Element)(match[1], attrs);
        allNodes.push(element);
        if (match[1] === "select") {
            const optionsMarkup = markup.slice(match.index + match[0].length, markup.indexOf("</select>", match.index));
            for (const option of optionsMarkup.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)) {
                const optionAttrs = attrsOf(option[1]);
                element.add(new Element("option", { ...optionAttrs, value: optionAttrs.value ?? option[2] }));
            }
            element.value = element.options[0]?.value || "";
        }
    }
    const form = nodes.get("real-estate-form");
    form.elements = {};
    for (const element of allNodes.filter((node) => node.name)) {
        if (element.name === "transactionType") continue;
        form.elements[element.name] = element;
    }
    const radios = allNodes.filter((node) => node.name === "transactionType");
    const radioGroup = { value: "sale" };
    for (const radio of radios) Object.defineProperty(radio, "checked", { set(value) { if (value) radioGroup.value = radio.value; }, get() { return radioGroup.value === radio.value; } });
    form.elements.transactionType = radioGroup;
    const submitButton = new Element("button", { type: "submit" });
    const normalFormQuery = form.querySelector.bind(form);
    form.querySelector = (selector) => selector === 'button[type="submit"]' ? submitButton : radios.find((radio) => matches(radio, selector)) || normalFormQuery(selector);
    const panel = nodes.get("emlak-portfoy-analizi");
    panel.querySelector = (selector) => allNodes.find((node) => matches(node, selector)) || null;
    panel.querySelectorAll = (selector) => allNodes.filter((node) => matches(node, selector));
    const window = {
        RealEstateAnalysisConfig: config, RealEstateAnalysisCore: core,
        RealEstateValuation: valuation, RealEstateListing: listing,
        localStorage: { removeItem() {} }, matchMedia: () => ({ matches: true }),
        setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout: (id) => timers.delete(id),
    };
    const document = {
        getElementById: (id) => nodes.get(id) || null,
        createElement: (tag) => new (tag === "input" ? Input : Element)(tag),
        createDocumentFragment: () => new Element("fragment"), body: new Element("body"),
    };
    const context = vm.createContext({ window, document, HTMLInputElement: Input,
        Option: function Option(text, value) { const option = new Element("option", { value }); option.textContent = text; return option; },
        navigator: { clipboard: { writeText: async (text) => copies.push(text) } },
        fetch: (...args) => { networkRequests.push(args); throw new Error("Unexpected network request"); },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), context, { filename: "app.js" });
    const byId = (suffix) => nodes.get(`real-estate-${suffix}`);
    return {
        form, byId, copies, networkRequests,
        submit: () => form.dispatch("submit"),
        click: (suffix) => byId(suffix).dispatch("click"),
        set: (name, value) => { form.elements[name].value = String(value); },
        change: async (name, value) => { form.elements[name].value = String(value); await form.dispatch("change", form.elements[name]); },
        input: async (name, value) => { form.elements[name].value = String(value); await form.dispatch("input", form.elements[name]); },
        flushCalculations: async () => {
            for (const [id, timer] of [...timers]) if (timer.delay === config.autoCalculationDelayMs) { timers.delete(id); await timer.callback(); }
        },
    };
}

test("a reference valuation works without an asking price and can be copied", async () => {
    const app = createApp();
    app.set("grossArea", 100);
    app.set("referencePricePerM2", 50000);
    await app.submit();
    assert.equal(app.byId("valuation-result").hidden, false);
    assert.match(app.byId("valuation-midpoint").textContent, /5\.000\.000 TL/);
    assert.equal(app.byId("sale-result").hidden, true);
    assert.equal(app.byId("valuation-position").hidden, true);
    await app.click("valuation-copy");
    assert.match(app.copies[0], /Orta değer: 5\.000\.000 TL/);
});

test("entering only net area selects the available basis without inventing gross area", async () => {
    const app = createApp();
    await app.input("netArea", "85");
    app.set("referencePricePerM2", 50000);
    await app.submit();
    assert.equal(app.form.elements.areaBasis.value, "net");
    assert.equal(app.form.elements.grossArea.value, "");
    assert.match(app.byId("valuation-midpoint").textContent, /4\.250\.000 TL/);
});

test("Turkish grouped land area survives input and yields the correct total value", async () => {
    const app = createApp();
    await app.change("propertyType", "Arsa");
    await app.input("totalArea", "5.360");
    app.set("referencePricePerM2", 2400);
    await app.submit();
    assert.match(app.byId("valuation-midpoint").textContent, /12\.864\.000 TL/);
});

test("asking price without a valuation source produces costs but no invented market value", async () => {
    const app = createApp();
    app.set("price", 6000000);
    app.set("grossArea", 100);
    await app.submit();
    assert.equal(app.byId("sale-result").hidden, false);
    assert.equal(app.byId("valuation-range").textContent, "Henüz hesaplanmadı");
    assert.equal(app.byId("valuation-copy").hidden, true);
});

test("importing another property clears previous reference, rent and comparable assumptions", async () => {
    const app = createApp();
    app.set("referencePricePerM2", 70000);
    app.set("monthlyRent", 50000);
    app.set("targetYield", 6);
    await app.click("add-comparable");
    app.byId("listing-text").value = "Satılık daire\nFiyat: 4.000.000 TL\nm² (Brüt): 100\nm² (Net): 80";
    await app.click("parse-text");
    assert.equal(app.form.elements.price.value, "4.000.000");
    assert.equal(app.form.elements.grossArea.value, "100");
    assert.equal(app.form.elements.referencePricePerM2.value, "");
    assert.equal(app.form.elements.monthlyRent.value, "");
    assert.equal(app.form.elements.targetYield.value, "");
    assert.equal(app.byId("valuation-comparables").children.length, 0);
    assert.equal(app.byId("valuation-copy").hidden, true);
    assert.equal(app.networkRequests.length, 0);
});

test("importing a comparable uses its actual matching area and preserves the subject", async () => {
    const app = createApp();
    app.set("grossArea", 100);
    app.set("price", 5000000);
    app.byId("import-target").value = "comparable";
    app.byId("listing-text").value = "Satılık daire\nFiyat: 4.000.000 TL\nm² (Brüt): 100\nm² (Net): 80";
    await app.click("parse-text");
    assert.equal(app.form.elements.price.value, "5000000");
    assert.equal(app.form.elements.valuationMethod.value, "comparables");
    assert.match(app.byId("valuation-midpoint").textContent, /4\.000\.000 TL/);
    assert.match(app.byId("valuation-position").textContent, /%25,0 üzerinde/);
    assert.equal(app.networkRequests.length, 0);
});

test("rental-target valuation can run with neither area nor asking price", async () => {
    const app = createApp();
    await app.change("valuationMethod", "rental");
    app.set("monthlyRent", 30000);
    app.set("targetYield", 6);
    await app.submit();
    assert.equal(app.byId("valuation-result").hidden, false);
    assert.match(app.byId("valuation-midpoint").textContent, /6\.000\.000 TL/);
    assert.match(app.byId("valuation-title").textContent, /Hedef getiriye/);
});

test("editing the reference recomputes the displayed valuation automatically", async () => {
    const app = createApp();
    app.set("grossArea", 100);
    app.set("referencePricePerM2", 50000);
    await app.submit();
    await app.input("referencePricePerM2", "60000");
    await app.flushCalculations();
    assert.match(app.byId("valuation-midpoint").textContent, /6\.000\.000 TL/);
});

test("an empty paste reports an error while preserving the current property and valuation", async () => {
    const app = createApp();
    await app.input("price", "7000000");
    app.set("grossArea", 120);
    app.set("referencePricePerM2", 40000);
    await app.submit();
    const previousValuation = app.byId("valuation-midpoint").textContent;
    app.byId("listing-text").value = "  \n  ";
    await app.click("parse-text");
    assert.equal(app.form.elements.price.value, "7.000.000");
    assert.equal(app.form.elements.grossArea.value, "120");
    assert.equal(app.form.elements.referencePricePerM2.value, "40000");
    assert.equal(app.byId("valuation-result").hidden, false);
    assert.equal(app.byId("valuation-midpoint").textContent, previousValuation);
    assert.equal(app.byId("import-status").dataset.error, "true");
    assert.match(app.byId("import-status").textContent, /ilan metnini/);
    assert.equal(app.networkRequests.length, 0);
});

test("pasting land details fills actual area and supports valuation without a network request", async () => {
    const app = createApp();
    app.byId("listing-text").value = "Satılık imarlı arsa\nFiyat: 3.000.000 TL\nToplam alan: 500\nİmar durumu: Konut imarlı\nKaks (Emsal): 0,30";
    await app.click("parse-text");
    assert.equal(app.form.elements.propertyType.value, "Arsa");
    assert.equal(app.form.elements.price.value, "3.000.000");
    assert.equal(app.form.elements.totalArea.value, "500");
    assert.equal(app.form.elements.grossArea.value, "");
    assert.equal(app.form.elements.zoningStatus.value, "Konut imarlı");
    app.set("referencePricePerM2", 5500);
    await app.submit();
    assert.equal(app.byId("land-result").hidden, false);
    assert.match(app.byId("valuation-midpoint").textContent, /2\.750\.000 TL/);
    assert.equal(app.networkRequests.length, 0);
});

test("reset clears pasted text, comparables and the current valuation", async () => {
    const app = createApp();
    app.set("grossArea", 100);
    app.set("price", 5000000);
    app.byId("import-target").value = "comparable";
    app.byId("listing-text").value = "Satılık daire\nFiyat: 4.000.000 TL\nm² (Brüt): 100\nm² (Net): 80";
    await app.click("parse-text");
    assert.equal(app.byId("valuation-result").hidden, false);
    assert.equal(app.byId("valuation-comparables").children.length, 1);
    await app.input("price", "5500000");
    await app.click("reset");
    await app.flushCalculations();
    assert.equal(app.byId("listing-text").value, "");
    assert.equal(app.byId("import-target").value, "property");
    assert.equal(app.form.elements.price.value, "");
    assert.equal(app.form.elements.grossArea.value, "");
    assert.equal(app.form.elements.referencePricePerM2.value, "");
    assert.equal(app.byId("valuation-comparables").children.length, 0);
    assert.equal(app.byId("valuation-result").hidden, true);
    assert.equal(app.byId("empty-result").hidden, false);
    assert.equal(app.networkRequests.length, 0);
});
