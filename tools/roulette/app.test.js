"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const core = require("./core.js");

const appSource = fs.readFileSync(require.resolve("./app.js"), "utf8");

function readAppFunction(name) {
    const declaration = new RegExp(`^    (?:async )?function ${name}\\(`, "m").exec(appSource);
    assert.ok(declaration, `Missing application function ${name}`);
    const start = declaration.index;
    const next = /\n    (?:async )?function [A-Za-z_$]/u.exec(appSource.slice(start + 1));
    assert.ok(next, `Missing boundary after application function ${name}`);
    return appSource.slice(start, start + 1 + next.index);
}

function createSettlementHarness(initial, { stored = initial, blockedWrites = false } = {}) {
    let saved = JSON.stringify({ game: core.serializeState(stored), chip: 25, muted: true });
    let writes = 0;
    const spins = [];
    let activeSpin = null;
    const wheel = {
        spin(number) {
            return new Promise((resolve) => {
                activeSpin = { number, resolve };
                spins.push(activeSpin);
            });
        },
        cancel() {
            activeSpin?.resolve({ cancelled: true });
            activeSpin = null;
        },
        showResult() { this.cancel(); },
    };
    const context = vm.createContext({
        core,
        initial,
        storageKey: "omni-roulette-v1",
        localStorage: {
            getItem() { return saved; },
            setItem(_key, value) {
                if (blockedWrites) throw new Error("Storage quota exceeded");
                saved = value;
                writes += 1;
            },
        },
        wheel,
        motion: { matches: false },
        status: { textContent: "" },
        colors: { red: "Kırmızı", black: "Siyah", green: "Yeşil" },
        format: new Intl.NumberFormat("tr-TR"),
        performance: { now: () => 0 },
        render() {},
        cancelDrag() {},
        playSound() {},
        get() { return { setAttribute() {} }; },
    });
    const functions = ["readSaved", "save", "adoptSavedGame", "syncSavedGame", "animatePending"]
        .map(readAppFunction).join("\n");
    // Exercise the production settlement and storage callbacks without canvas or DOM rendering.
    vm.runInContext(`
        let state = initial;
        let selectedChip = 25;
        let muted = true;
        let storageWritable = true;
        let spinToken = 0;
        let tickTime = 0;
        ${functions}
        this.animate = animatePending;
        this.saveGame = save;
        this.currentState = () => state;
    `, context);
    return {
        spins,
        animate: context.animate,
        save: context.saveGame,
        current: context.currentState,
        stored: () => JSON.parse(saved).game,
        writes: () => writes,
        updateStored(game) {
            saved = JSON.stringify({ game: core.serializeState(game), chip: 25, muted: true });
        },
        finish(index) { spins[index].resolve({ number: spins[index].number }); },
    };
}

function createRenderHarness() {
    class Element {
        constructor() {
            this.children = [];
            this.dataset = {};
            this.style = {};
            this.attributes = {};
            this.classes = new Set();
            this.classList = {
                contains: (token) => this.classes.has(token),
                toggle: (token, force) => {
                    // An omitted or undefined optional force toggles the token.
                    const include = force === undefined ? !this.classes.has(token) : Boolean(force);
                    if (include) this.classes.add(token);
                    else this.classes.delete(token);
                    return include;
                },
            };
        }

        set className(value) { this.classes = new Set(value.split(/\s+/u).filter(Boolean)); }
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this.children = children; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        querySelectorAll(selector) {
            const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)]);
            return descendants.filter((element) => element.classList.contains(selector.slice(1)));
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    }

    const elements = new Map();
    const get = (name) => {
        if (!elements.has(name)) elements.set(name, new Element());
        return elements.get(name);
    };
    const context = vm.createContext({
        core,
        document: { createElement: () => new Element() },
        get,
        app: get("app"),
        table: get("table"),
        chips: get("chips"),
        wagers: get("wagers"),
        betType: get("bet-type"),
        betOption: get("bet-option"),
        denominations: [1, 5, 25, 100, 500],
        colors: { red: "Kırmızı", black: "Siyah", green: "Yeşil" },
        format: new Intl.NumberFormat("tr-TR"),
    });
    const functions = ["betButton", "buildTable", "buildChips", "totalStake", "render", "renderWagers", "renderHistory", "highlightBet"]
        .map(readAppFunction).join("\n");
    vm.runInContext(`
        let state = core.createState();
        let selectedChip = 25;
        let muted = true;
        ${functions}
        const tableButtons = buildTable();
        buildChips();
        this.renderGame = render;
        this.selectChip = (value) => { selectedChip = value; render(); };
        this.setGame = (next) => { state = next; render(); };
        this.currentState = () => state;
    `, context);
    return {
        get,
        render: context.renderGame,
        selectChip: context.selectChip,
        setGame: context.setGame,
        current: context.currentState,
        winners: () => get("table").querySelectorAll(".is-winner").map((button) => button.dataset.betId),
    };
}

function draw(number) {
    return { getRandomValues(buffer) { buffer[0] = number; return buffer; } };
}

test("winner highlighting stays stable across chip selections, zero results and spinning", () => {
    const app = createRenderHarness();
    app.render();
    assert.equal(app.get("table").children.length, 49);
    assert.deepEqual(app.winners(), []);

    for (const chip of [5, 25, 5, 25, 5]) {
        app.selectChip(chip);
        assert.deepEqual(app.winners(), []);
        assert.equal(app.get("table").querySelectorAll(".is-covered").length, 0);
        assert.equal(app.current().balance, 10000);
        assert.equal(core.totalBet(app.current()), 0);
        assert.equal(app.get("wagers").children.length, 0);
        assert.deepEqual(app.get("chips").querySelectorAll(".is-selected").map((button) => Number(button.dataset.rouletteChip)), [chip]);
    }

    for (const number of [0, 17]) {
        const pending = core.beginSpin(core.addBet(core.createState(), "red", 25), draw(number));
        app.setGame(core.settleSpin(pending).state);
        assert.deepEqual(app.winners(), [`straight:${number}`]);
        app.selectChip(25);
        app.selectChip(5);
        assert.deepEqual(app.winners(), [`straight:${number}`]);
    }

    app.setGame(core.beginSpin(core.addBet(app.current(), "red", 25), draw(0)));
    assert.deepEqual(app.winners(), []);
    app.setGame(core.createState());
    assert.deepEqual(app.winners(), []);
});

test("a stale wheel completion adopts a newer stored spin before its storage event arrives", async () => {
    const first = core.beginSpin(core.addBet(core.createState(), "red", 25), draw(1));
    const firstSettled = core.settleSpin(first).state;
    const second = core.beginSpin(core.addBet(firstSettled, "black", 100), draw(2));
    const app = createSettlementHarness(first);
    const finishingFirst = app.animate();

    app.updateStored(second);
    app.finish(0);
    await finishingFirst;

    assert.deepEqual(app.current(), second);
    assert.deepEqual(app.stored(), core.serializeState(second));
    assert.equal(app.writes(), 0);
    assert.deepEqual(app.spins.map(({ number }) => number), [1, 2]);

    app.finish(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(app.current(), core.settleSpin(second).state);
    assert.equal(app.writes(), 1);
    assert.deepEqual(app.current().history.map(({ id }) => id), [2, 1]);
});

test("a blocked pending-spin save still settles the generated result within the session", async () => {
    const betting = core.addBet(core.createState(), "red", 25);
    const pending = core.beginSpin(betting, draw(1));
    const app = createSettlementHarness(pending, { stored: betting, blockedWrites: true });
    app.save();
    const finishing = app.animate();
    app.finish(0);
    await finishing;

    assert.deepEqual(app.current(), core.settleSpin(pending).state);
    assert.equal(app.current().balance, 10025);
    assert.equal(app.current().history.length, 1);
    assert.equal(app.writes(), 0);
    assert.deepEqual(app.stored(), core.serializeState(betting));
});
