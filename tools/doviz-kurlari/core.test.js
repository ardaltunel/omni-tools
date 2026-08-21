const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

const entries = [
    { code: "TRY", perTry: 1 },
    { code: "USD", perTry: 0.025 },
    { code: "EUR", perTry: 0.02 },
];

test("TRY tabanlı çapraz kur dönüşümü yapar", () => {
    assert.equal(core.convertAmount(50, "TRY", "USD", entries), 1.25);
    assert.ok(Math.abs(core.convertAmount(20, "USD", "EUR", entries) - 16) < Number.EPSILON * 100);
    assert.equal(core.convertAmount(100, "EUR", "TRY", entries), 5000);
});

test("geçersiz miktar ve eksik para birimini reddeder", () => {
    assert.equal(core.convertAmount(-1, "TRY", "USD", entries), null);
    assert.equal(core.convertAmount("abc", "TRY", "USD", entries), null);
    assert.equal(core.convertAmount(1, "TRY", "ABC", entries), null);
});

test("para birimlerini öncelikli ve sonra alfabetik sıralar", () => {
    const metadata = [
        { iso_code: "JPY", name: "Japanese Yen", symbol: "¥" },
        { iso_code: "TRY", name: "Turkish Lira", symbol: "₺" },
        { iso_code: "USD", name: "US Dollar", symbol: "$" },
        { iso_code: "EUR", name: "Euro", symbol: "€" },
        { iso_code: "GBP", name: "British Pound", symbol: "£" },
    ];
    const rows = metadata.map((currency, index) => ({
        quote: currency.iso_code,
        rate: index + 1,
        date: "2026-08-21",
    }));
    const result = core.buildCurrencyEntries(metadata, rows, null);
    assert.deepEqual(result.slice(0, 4).map((entry) => entry.code), ["TRY", "USD", "EUR", "GBP"]);
    assert.equal(result[0].tryValue, 1 / 2);
});

test("Türkçe arama metnini aksanlardan arındırır", () => {
    assert.equal(core.normalizeSearchText("İsviçre Frangı"), "isvicre frangi");
});

test("para birimlerini gerçek bayrak bölgelerine ve anlamlı rozetlere eşler", () => {
    assert.equal(core.getFlagRegion("TRY"), "TR");
    assert.equal(core.getFlagRegion("GBP"), "GB");
    assert.equal(core.getFlagRegion("EUR"), "EU");
    assert.equal(core.getFlagRegion("XOF"), "");
    assert.equal(core.getCurrencyBadge("XOF"), "CFA");
    assert.equal(core.getCurrencyBadge("XAU"), "Au");
    assert.equal(core.getCurrencyVisualKind("XOF"), "regional");
    assert.equal(core.getCurrencyVisualKind("XDR"), "reserve");
    assert.equal(core.getCurrencyVisualKind("XAU"), "metal");
    assert.equal(core.getCurrencyVisualKind("TRY"), "flag");
});
