"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const cards = require("./cards.js");
const engine = require("./engine.js");
const anonymous = (svg) => svg.replace(/blackjack-svg-card-\d+/g, "blackjack-svg-card-INSTANCE");

test("all 52 faces have Turkish labels, correct pips and self-contained artwork", () => {
    const labels = new Set();
    for (const card of engine.createDeck()) {
        const label = cards.label(card);
        assert.match(label, /^(Maça|Kupa|Karo|Sinek) (As|Vale|Kız|Papaz|[2-9]|10)$/);
        labels.add(label);
        const svg = cards.svg(card);
        assert.match(svg, /^<svg\b[^>]*viewBox="0 0 180 252"/);
        assert.match(svg, /<\/svg>$/);
        assert.doesNotMatch(svg, /<(?:script|foreignObject|image)\b|\bon\w+\s*=|PİŞTİ/i);
        if (/^\d+$/.test(card.rank)) {
            assert.equal([...svg.matchAll(/<use\s+href="#[^"]+-suit"/g)].length - 2, Number(card.rank));
        }
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
        const references = [
            ...[...svg.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]),
            ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]),
        ];
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(references.length);
        references.forEach((id) => assert.ok(ids.includes(id), `${card.id}: unresolved ${id}`));
    }
    assert.equal(labels.size, 52);
});

test("six-deck SVG IDs stay unique even when multiple copies of one card are visible", () => {
    const ids = new Set();
    for (let deck = 0; deck < 6; deck += 1) {
        for (const card of engine.createDeck(deck)) {
            for (const match of cards.svg(card).matchAll(/\bid="([^"]+)"/g)) {
                assert.equal(ids.has(match[1]), false, match[1]);
                ids.add(match[1]);
            }
        }
    }
    assert.ok(ids.size >= 312 * 3);
});

test("every closed card has the same Blackjack back without any private identity", () => {
    const back = anonymous(cards.svg(null));
    assert.match(back, />21<\/text>/);
    assert.match(back, /BLACKJACK/);
    for (const card of engine.createDeck()) assert.equal(anonymous(cards.svg(card, { faceDown: true })), back);
    const concealed = {};
    for (const key of ["id", "rank", "suit", "color", "suitName", "suitSymbol"]) {
        Object.defineProperty(concealed, key, { get() { throw new Error(`Private ${key} accessed`); } });
    }
    assert.equal(anonymous(cards.svg(concealed, { faceDown: true })), back);
    Object.defineProperty(concealed, "hidden", { value: true });
    assert.equal(anonymous(cards.svg(concealed)), back);
    assert.equal(cards.label(concealed), "Kapalı kart");
});

test("face artwork rejects invalid ranks and suits before they can reach markup", () => {
    for (const card of [
        { rank: "1", suit: "clubs" }, { rank: 10, suit: "spades" },
        { rank: "K", suit: "__proto__" }, { rank: "K", suit: "constructor" },
        { rank: '<script>alert("rank")</script>', suit: "clubs" },
        { rank: "Q", suit: '<image onload="evil">' },
    ]) {
        assert.throws(() => cards.svg(card), TypeError);
        assert.throws(() => cards.label(card), TypeError);
    }
});
