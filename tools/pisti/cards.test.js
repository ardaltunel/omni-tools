"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const cards = require("./cards.js");

const SUITS = { clubs: "Sinek", diamonds: "Karo", hearts: "Kupa", spades: "Maça" };
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const NAMES = { A: "As", J: "Vale", Q: "Kız", K: "Papaz" };
const DECK = Object.keys(SUITS).flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}-${rank}`, rank, suit })));
const anonymous = (svg) => svg.replace(/pisti-card-\d+/g, "pisti-card-INSTANCE");

function domCards() {
    const context = vm.createContext({
        document: {
            createElement(tagName) {
                return { tagName, attributes: {}, innerHTML: "", setAttribute(name, value) { this.attributes[name] = value; } };
            },
        },
    });
    vm.runInContext(fs.readFileSync(require.resolve("./cards.js"), "utf8"), context);
    return context.OmniPistiCards;
}

test("all 52 faces have correct Turkish labels and independent, fully resolved SVG definitions", () => {
    const renderer = domCards();
    const allIds = new Set();
    const labels = new Set();
    for (const card of DECK) {
        const expected = `${SUITS[card.suit]} ${NAMES[card.rank] || card.rank}`;
        assert.equal(cards.label(card), expected);
        labels.add(expected);
        const element = renderer.create(card);
        assert.equal(element.tagName, "span");
        assert.equal(element.attributes.role, "img");
        assert.equal(element.attributes["aria-label"], expected);
        assert.match(element.className, /\bis-face-up\b/);
        const svg = element.innerHTML;
        assert.match(svg, /^<svg\b[^>]*viewBox="0 0 180 252"/);
        assert.match(svg, /<\/svg>$/);
        assert.doesNotMatch(svg, /<(?:script|foreignObject|image)\b|\bon\w+\s*=/i);
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
        assert.equal(new Set(ids).size, ids.length, card.id);
        for (const id of ids) {
            assert.equal(allIds.has(id), false, `SVG ID reused by ${card.id}: ${id}`);
            allIds.add(id);
        }
        const references = [
            ...[...svg.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]),
            ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]),
        ];
        assert.ok(references.length, card.id);
        for (const reference of references) assert.ok(ids.includes(reference), `${card.id}: missing ${reference}`);
    }
    assert.equal(labels.size, 52);
});

test("every numbered face has its exact central pip count plus two corner suit marks", () => {
    for (const card of DECK.filter(({ rank }) => /^\d+$/.test(rank))) {
        const svg = cards.svg(card);
        const suitMarks = [...svg.matchAll(/<use\s+href="#[^"]+-suit"/g)].length;
        assert.equal(suitMarks - 2, Number(card.rank), card.id);
    }
});

test("closed cards share one anonymous back and never expose rank, suit or card ID", () => {
    const renderer = domCards();
    const reference = anonymous(cards.svg(null));
    for (const card of DECK) {
        assert.equal(anonymous(cards.svg(card, { faceDown: true })), reference, card.id);
        const element = renderer.create(card, { faceDown: true });
        assert.equal(element.attributes["aria-label"], "Kapalı kart");
        assert.match(element.className, /\bis-face-down\b/);
        assert.equal(anonymous(element.innerHTML), reference);
        assert.equal(Object.keys(element.attributes).sort().join(","), "aria-label,role");
        assert.equal(Object.hasOwn(element, "title"), false);
        assert.equal(Object.hasOwn(element, "dataset"), false);
    }
    assert.equal(renderer.create(null).attributes["aria-label"], "Kapalı kart");
});

test("hidden rendering does not even read concealed rank, suit or ID getters", () => {
    const renderer = domCards();
    const concealed = {};
    for (const key of ["rank", "suit", "id"]) {
        Object.defineProperty(concealed, key, { get() { throw new Error(`Private ${key} accessed`); } });
    }
    assert.doesNotThrow(() => cards.svg(concealed, { faceDown: true }));
    assert.doesNotThrow(() => renderer.create(concealed, { faceDown: true }));
    Object.defineProperty(concealed, "hidden", { value: true });
    assert.equal(cards.label(concealed), "Kapalı kart");
    assert.equal(renderer.create(concealed).attributes["aria-label"], "Kapalı kart");
    assert.equal(anonymous(cards.svg(concealed)), anonymous(cards.svg(null)));
});

test("invalid ranks and suits cannot enter face artwork or accessible labels", () => {
    for (const card of [
        { suit: "clubs", rank: "1" }, { suit: "hearts", rank: 10 },
        { suit: "clubs", rank: '<script>alert("rank")</script>' },
        { suit: '<script>alert("suit")</script>', rank: "A" },
        { suit: "__proto__", rank: "K" }, { suit: "spades", rank: "" },
    ]) {
        assert.throws(() => cards.svg(card), TypeError);
        assert.throws(() => cards.label(card), TypeError);
    }
});
