const assert = require("node:assert/strict");
const test = require("node:test");
const listing = require("./listing.js");

test("supports individual Sahibinden and official short links; removes tracking", () => {
    assert.equal(listing.normalizeUrl("www.sahibinden.com/ilan/emlak-konut-satilik-test-1234567890/detay?utm_source=test#x"), "https://www.sahibinden.com/ilan/emlak-konut-satilik-test-1234567890/detay");
    assert.equal(listing.normalizeUrl("https://shbd.io/ABC123?utm_source=test"), "https://shbd.io/ABC123");
    assert.equal(listing.normalizeUrl("https://shbd.io/s/TltMFDjo"), "https://shbd.io/s/TltMFDjo");
});

test("rejects arbitrary hosts, credentials, ports, protocols, searches and malicious paths", () => {
    for (const url of [
        "http://www.sahibinden.com/ilan/test-123/detay", "https://sahibinden.com.attacker.example/ilan/test/detay",
        "https://sahibinden.com@127.0.0.1/ilan/test", "https://user:pass@sahibinden.com/ilan/test",
        "https://sahibinden.com:8443/ilan/test", "https://sahibinden.com/satilik-daire", "https://sahibinden.com/",
        "javascript:alert(1)", "https://shbd.io/../../internal", "https://example.com/ilan/test",
    ]) assert.throws(() => listing.normalizeUrl(url), Error, url);
    assert.equal(listing.normalizeUrl("https://shbd.io/ABC123"), "https://shbd.io/ABC123");
    assert.equal(listing.normalizeUrl("https://m.sahibinden.com/s/ABC123"), "https://m.sahibinden.com/s/ABC123");
});

test("extracts actual residential copy with Turkish numbers and multiline labels", () => {
    const parsed = listing.parseText(`Kadıköy satılık daire
Fiyat: 6.500.000 TL
Emlak Tipi
Satılık Daire
m² (Brüt)
110
m² (Net)
85
Oda Sayısı 2+1
Bina Yaşı 5
Bulunduğu Kat 3
Kat Sayısı 8
Aidat (TL) 3.500
Konum: İstanbul / Kadıköy / Kozyatağı
Tahmini aylık kira: 40.000 TL`, { sourceUrl: "https://www.sahibinden.com/ilan/test/detay" });
    assert.deepEqual(parsed.fields, {
        propertyType: "Daire", transactionType: "sale", price: 6500000,
        grossArea: 110, netArea: 85, buildingAge: 5, totalFloors: 8,
        dues: 3500, monthlyRent: 40000, location: "İstanbul / Kadıköy / Kozyatağı", roomCount: "2+1", floor: "3",
    });
    assert.equal(parsed.sourceUrl, "https://www.sahibinden.com/ilan/test/detay");
    assert.ok(parsed.extractedFields.includes("netArea"));
});

test("extracts land area and zoning without residential defaults", () => {
    const parsed = listing.parseText(`500 m² Satılık Arsa
Fiyat: 2.500.000 TL
Emlak Tipi: Satılık Arsa
m²
5.360
Ada No 7
Parsel No 179
Kaks (Emsal) 0,30
İmar Durumu: Konut
Tapu Durumu: Müstakil Tapulu`);
    assert.equal(parsed.fields.propertyType, "Arsa");
    assert.equal(parsed.fields.price, 2500000);
    assert.equal(parsed.fields.totalArea, 5360);
    assert.equal(parsed.fields.floorAreaRatio, 0.3);
    assert.equal(parsed.fields.blockNo, "7");
    assert.equal(parsed.fields.parcelNo, "179");
    assert.equal(parsed.fields.zoningStatus, "Konut");
    assert.equal(parsed.fields.titleDeedType, "Müstakil Tapulu");
    assert.equal(parsed.fields.netArea, undefined);
});

test("does not invent sale price from aidat, m² price, room count, or age interval", () => {
    const parsed = listing.parseText(`Satılık daire\nAidat: 3.500 TL\nBina Yaşı 5-10\nOda Sayısı 3+1\nm² Fiyatı 40.000 TL`);
    assert.equal(parsed.fields.price, undefined);
    assert.equal(parsed.fields.buildingAge, undefined);
    assert.equal(parsed.fields.grossArea, undefined);
    assert.ok(parsed.warnings.some((item) => item.includes("aralık")));
    assert.equal(listing.parseText("Satılık daire\nAidat\n3.500 TL").fields.price, undefined);
    assert.equal(listing.parseText("Satılık daire\nHizmet bedeli\n25.000 TL").fields.price, undefined);
});

test("does not treat non-TL price as TL", () => {
    const parsed = listing.parseText("Satılık villa\nFiyat: 500.000 EUR\nBrüt m²: 250");
    assert.equal(parsed.fields.price, undefined);
    assert.equal(parsed.fields.grossArea, 250);
    assert.ok(parsed.warnings.length);
    for (const currency of ["EUR", "USD", "$", "Euro", "Amerikan Doları"]) {
        assert.equal(listing.parseText(`Satılık villa\nFiyat\n500.000\n${currency}\nBrüt m² 250`).fields.price, undefined, currency);
    }
    assert.equal(listing.parseHtml('<h1>Satılık villa</h1><p>Fiyat 500.000 USD</p><script type="application/ld+json">{"@type":"Product","offers":{"price":500000,"priceCurrency":"USD"}}</script>').fields.price, undefined);
});

test("keeps net and gross independent and finds land type from actual HTML title", () => {
    const net = listing.parseText("Satılık daire\nNet m² 85").fields;
    assert.equal(net.netArea, 85);
    assert.equal(net.grossArea, undefined);
    const land = listing.parseHtml("<nav>Sahibinden ilanlar</nav><h1>Satılık Arsa</h1><p>m²</p><p>500</p>").fields;
    assert.equal(land.propertyType, "Arsa");
    assert.equal(land.totalArea, 500);
    assert.equal(land.grossArea, undefined);
});

test("parses safe HTML text and TRY structured offers without executing scripts", () => {
    const parsed = listing.parseHtml(`<html><head><title>İlan</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Satılık Villa","offers":{"price":"7250000","priceCurrency":"TRY"},"address":{"addressRegion":"İzmir","addressLocality":"Urla"}}</script>
<script>throw new Error('never run')</script></head><body><h1>Deniz &amp; bahçe manzaralı satılık villa</h1>
<ul><li><strong>m&sup2; (Brüt)</strong><span>200</span></li><li><strong>m² (Net)</strong><span>160</span></li></ul></body></html>`);
    assert.equal(parsed.fields.price, 7250000);
    assert.equal(parsed.fields.grossArea, 200);
    assert.equal(parsed.fields.netArea, 160);
    assert.equal(parsed.fields.propertyType, "Villa");
    assert.equal(parsed.fields.location, "İzmir / Urla");
    assert.equal(parsed.title, "Deniz & bahçe manzaralı satılık villa");
});

test("ignores malformed JSON-LD and missing values", () => {
    const parsed = listing.parseHtml('<script type="application/ld+json">{broken}</script><h1>Satılık daire</h1><p>m² (Brüt): 120</p>');
    assert.equal(parsed.fields.grossArea, 120);
    assert.equal(parsed.fields.price, undefined);
    assert.deepEqual(listing.parseText("").fields, {});
});
