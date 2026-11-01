const assert = require("node:assert/strict");
const test = require("node:test");
const valuation = require("./valuation.js");

test("asking price alone cannot become a valuation", () => {
    const result = valuation.estimate({ propertyType: "Daire", price: 6000000, grossArea: 100 });
    assert.equal(result.available, false);
    assert.equal(result.estimate, null);
    assert.equal(result.position, "unknown");
    assert.ok(result.reasons.length);
});

test("reference prices support Turkish number formatting and an asking-price comparison", () => {
    const result = valuation.estimate({ propertyType: "Daire", price: "6.000.000", grossArea: "120", referencePricePerM2: "40.000" });
    assert.equal(result.method, "reference");
    assert.equal(result.estimate, 4800000);
    assert.equal(result.low, 4320000);
    assert.equal(result.high, 5280000);
    assert.equal(result.differencePercent, 25);
    assert.equal(result.position, "above");
    assert.equal(result.confidenceLabel, "Sınırlı veri");
});

test("net and gross comparables cannot be mixed and asking price does not influence median", () => {
    const input = {
        propertyType: "Daire", price: 5000000, grossArea: 100, areaBasis: "gross",
        comparables: [
            { propertyType: "Daire", price: 3000000, area: 100, areaBasis: "gross" },
            { propertyType: "Daire", price: 5000000, area: 100, areaBasis: "gross" },
            { propertyType: "Daire", price: 4000000, area: 100, areaBasis: "gross" },
            { propertyType: "Daire", price: 90000000, area: 100, areaBasis: "net" },
            { propertyType: "Villa", price: 90000000, area: 100, areaBasis: "gross" },
            { propertyType: "Daire", price: 90000000, area: 100 },
        ],
    };
    const result = valuation.estimate(input);
    assert.equal(result.method, "comparables");
    assert.equal(result.sampleCount, 3);
    assert.equal(result.pricePerM2, 40000);
    assert.equal(result.estimate, 4000000);
    assert.equal(valuation.estimate({ ...input, price: 1000000 }).estimate, result.estimate);
    assert.ok(result.warnings.some((text) => text.includes("3 emsal")));
});

test("net valuation uses only the net area", () => {
    const result = valuation.estimate({ propertyType: "Daire", areaBasis: "net", netArea: 80, grossArea: 110, referencePricePerM2: 50000 });
    assert.equal(result.estimate, 4000000);
    assert.equal(result.areaBasis, "net");
    assert.equal(result.area, 80);
    assert.equal(valuation.estimate({ propertyType: "Daire", areaBasis: "net", grossArea: 110, referencePricePerM2: 50000 }).available, false);
});

test("land valuation uses total area and excludes housing and field comparables", () => {
    const result = valuation.estimate({
        propertyType: "Arsa", totalArea: "1.000", grossArea: 50,
        comparables: [
            { propertyType: "Arsa", price: 3000000, area: 500, areaBasis: "total" },
            { propertyType: "Tarla", price: 500000, area: 1000, areaBasis: "total" },
            { propertyType: "Daire", price: 5000000, area: 100, areaBasis: "gross" },
        ],
    });
    assert.equal(result.areaBasis, "total");
    assert.equal(result.estimate, 6000000);
    assert.equal(result.sampleCount, 1);
    assert.equal(result.confidenceLabel, "Az sayıda emsal");
});

test("duplicate listing URLs cannot inflate the comparable count", () => {
    const result = valuation.estimate({
        propertyType: "Daire", grossArea: 100,
        comparables: [
            { price: 4000000, area: 100, areaBasis: "gross", sourceUrl: "https://example.com/listing/1?tracking=a" },
            { price: 4000000, area: 100, areaBasis: "gross", sourceUrl: "https://example.com/listing/1/#description" },
        ],
    });
    assert.equal(result.sampleCount, 1);
});

test("rental valuation requires explicit yield and never applies to land", () => {
    const input = { propertyType: "Daire", monthlyRent: 30000, targetYield: 6 };
    const result = valuation.estimate(input);
    assert.equal(result.method, "rental");
    assert.equal(result.estimate, 6000000);
    assert.equal(result.pricePerM2, null);
    assert.equal(result.low, 5100000);
    assert.equal(valuation.estimate({ ...input, targetYield: null }).available, false);
    assert.equal(valuation.estimate({ ...input, targetYield: 101 }).available, false);
    assert.equal(valuation.estimate({ ...input, propertyType: "Tarla", totalArea: 500 }).available, false);
});

test("valid comparable data takes precedence over reference and rental assumptions", () => {
    const result = valuation.estimate({
        propertyType: "Daire", grossArea: 100, referencePricePerM2: 30000, monthlyRent: 50000, targetYield: 5,
        comparables: [{ price: 4000000, area: 100, areaBasis: "gross" }],
    });
    assert.equal(result.method, "comparables");
    assert.equal(result.estimate, 4000000);
});

test("invalid, empty, zero and overflowing values cannot produce an amount", () => {
    for (const value of [0, -1, null, undefined, "", "abc", Infinity, true, {}, []]) {
        assert.equal(valuation.positiveNumber(value), null);
        assert.equal(valuation.estimate({ propertyType: "Arsa", totalArea: value, referencePricePerM2: 5000 }).available, false);
    }
    assert.equal(valuation.estimate({ totalArea: 1e308, propertyType: "Arsa", referencePricePerM2: 1e308 }).available, false);
    assert.equal(valuation.estimate(null).available, false);
});
