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

function draw(number) {
    return { getRandomValues(buffer) { buffer[0] = number; return buffer; } };
}

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
