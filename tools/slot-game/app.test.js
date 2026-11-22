"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const engine = require("./engine.js");
const { createWallet } = require("../shared/game-wallet.js");
const source = fs.readFileSync(require.resolve("./app.js"), "utf8");

function appFunction(name) {
    const found = new RegExp(`^    (?:async )?function ${name}\\(`, "m").exec(source);
    assert.ok(found, name);
    const next = /\n    (?:async )?function [A-Za-z_$]/u.exec(source.slice(found.index + 1));
    assert.ok(next, name);
    const boundary = found.index + 1 + next.index;
    const end = source.lastIndexOf("\n    }", boundary);
    return source.slice(found.index, end + "\n    }".length);
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createBank({ balance = 1000, bet = 100, freeSpins = 0, freeMultiplier = 0, version = 2 } = {}) {
    const data = new Map([["omni-slot-game-v1", JSON.stringify({ version, balance, bet, freeSpins, freeMultiplier, lastWin: 0 })]]);
    return createWallet({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
}

function createHarness({ bank = createBank(), result = {}, pauseAnimation = false, failAnimation = false, pauseCommit = false } = {}) {
    const commits = [];
    const pendingCommits = [];
    const animations = [];
    const timers = new Map();
    const messages = [];
    let timerId = 0;
    let active = true;
    const wallet = {
        read: bank.read,
        subscribe: bank.subscribe,
        commit(id, change) {
            commits.push(plain({ id, ...change }));
            if (!pauseCommit) return bank.commit(id, change);
            return new Promise((resolve) => pendingCommits.push(() => bank.commit(id, change).then(resolve)));
        },
    };
    function element() {
        return {
            hidden: false, textContent: "", dataset: {}, disabled: false,
            classList: { add() {}, remove() {}, toggle() {} },
            setAttribute() {}, focus() {},
            querySelector: () => element(), querySelectorAll: () => [],
        };
    }
    const elements = new Proxy({}, { get(target, name) { return target[name] ??= element(); } });
    const resolved = {
        initialGrid: [], finalGrid: [], steps: [], collectedMultipliers: [], capped: false,
        baseWin: 0, multiplierTotal: 0, maxScatterCount: 0, ...result,
    };
    const context = vm.createContext({
        wallet,
        engine: { ...engine, createGrid: () => [], resolveCascades: () => resolved },
        elements,
        structuredClone,
        window: {
            clearTimeout(id) { timers.delete(id); },
            setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
        },
        document: { hidden: false, getElementById: () => ({ classList: { contains: () => active } }) },
        app: { dataset: {} },
        formatCredit: String,
        timing: (normal) => normal,
        wait: () => Promise.resolve(),
        updateControls() {}, updateSoundButton() {}, playSound() {}, renderGrid() {}, createBurst() {},
        setPhase() {}, setStatus(title, message) { messages.push({ title, message }); },
        createBonusTriggerGrid: () => [],
        closeBonusModal() { vm.runInContext("buyModalOpen = false", context); },
        showCelebration: () => Promise.resolve(),
        console: { error() {} },
        animateRound(_result, spinContext) {
            const saved = bank.read("slot-game").snapshot;
            assert.equal(saved.lastWin, vm.runInContext("durableRoundState.lastWin", context));
            if (spinContext.mode === "free") assert.equal(saved.freeSpins, vm.runInContext("durableRoundState.freeSpins", context));
            if (failAnimation) return Promise.reject(new Error("Animation failed"));
            if (!pauseAnimation) return Promise.resolve();
            return new Promise((resolve) => animations.push(resolve));
        },
    });
    const functions = [
        "loadSavedState", "savedEnvelope", "adoptWallet", "syncWallet", "handleWalletChange",
        "commitCheckpoint", "saveState", "flushSettingsSave", "updateHud", "scheduleNextSpin",
        "stopAuto", "syncVisibility", "runSpin", "purchaseBonus",
    ].map(appFunction).join("\n");
    vm.runInContext(`
        const WALLET_GAME_ID = 'slot-game';
        const initial = wallet.read(WALLET_GAME_ID);
        let walletRevision = initial.revision;
        let walletPending = false;
        let pendingSettingsSave = false;
        let roundSerial = 0;
        let presentationBusy = false;
        let durableRoundState = null;
        let nextSpinTimer = 0;
        let autoRemaining = 0;
        let buyModalOpen = false;
        let soundEnabled = true;
        let soundVolume = 70;
        let turboEnabled = false;
        let lastCompletedFreeMultiplier = 1;
        let currentGrid = [];
        ${functions}
        const loaded = loadSavedState(initial.snapshot);
        const state = engine.createState({...loaded, balance: initial.balance});
        state.lastWin = loaded.lastWin;
        wallet.subscribe(handleWalletChange);
        this.spin = runSpin;
        this.purchase = () => { buyModalOpen = true; return purchaseBonus(); };
        this.current = () => state;
        this.pending = () => walletPending || presentationBusy;
        this.save = saveState;
        this.setVolume = (value) => { soundVolume = value; return saveState(); };
        this.refresh = handleWalletChange;
    `, context);
    return {
        bank, commits, timers, messages,
        spin: context.spin, purchase: context.purchase, current: context.current,
        pending: context.pending, save: context.save, setVolume: context.setVolume,
        finishAnimation() { assert.ok(animations.length); animations.shift()(); },
        releaseCommit() { assert.ok(pendingCommits.length); pendingCommits.shift()(); },
        async otherGame(delta) {
            const game = bank.read("roulette");
            return bank.commit("roulette", { revision: game.revision, delta, snapshot: { game: null } });
        },
        setActive(value) { active = value; },
    };
}

test("a paid result, cost and durable bonus checkpoint commit once before animation", async () => {
    const app = createHarness({ bank: createBank({ balance: 100, bet: 20 }), result: { baseWin: 12.34 }, pauseAnimation: true });
    const spinning = app.spin();
    await flush();
    assert.equal(app.commits.length, 1);
    assert.equal(app.commits[0].required, 20);
    assert.equal(app.commits[0].delta, -7.66);
    assert.equal(app.bank.read("slot-game").balance, 92.34);
    assert.equal(app.bank.read("slot-game").snapshot.lastWin, 12.34);
    await app.spin();
    assert.equal(app.commits.length, 1, "a second click cannot submit a second spin");
    app.finishAnimation();
    await spinning;
    assert.equal(app.current().lastWin, 12.34);
    assert.equal(app.current().isSpinning, false);
    assert.equal(app.pending(), false);
});

test("another game changing credits during animation survives slot completion and settings saves", async () => {
    const app = createHarness({ bank: createBank({ balance: 100, bet: 20 }), result: { baseWin: 12.34 }, pauseAnimation: true });
    const spinning = app.spin();
    await flush();
    await app.otherGame(7.89);
    await app.setVolume(15);
    assert.equal(app.commits.length, 1, "preferences wait for the settled visual state");
    app.finishAnimation();
    await spinning;
    await flush();
    assert.equal(app.bank.read("slot-game").balance, 100.23);
    assert.equal(app.current().balance, 100.23);
    assert.equal(app.bank.read("slot-game").snapshot.soundVolume, 15);
    assert.deepEqual(app.commits.map((change) => change.delta), [-7.66, 0]);
});

test("free spins spend zero, keep the bonus stake and preserve multiplier progression across reload", async () => {
    const bank = createBank({ balance: 0, bet: 100, freeSpins: 4, freeMultiplier: 3 });
    const app = createHarness({ bank, result: { baseWin: 1.25, multiplierTotal: 2 } });
    await app.spin();
    assert.equal(app.commits.length, 1);
    assert.equal(app.commits[0].required, 0);
    assert.equal(app.commits[0].delta, 6.25);
    const saved = bank.read("slot-game");
    assert.equal(saved.balance, 6.25);
    assert.equal(saved.snapshot.freeSpins, 3);
    assert.equal(saved.snapshot.freeMultiplier, 5);
    assert.equal(saved.snapshot.bet, 100);
    const reloaded = createHarness({ bank });
    assert.equal(reloaded.current().freeSpins, 3);
    assert.equal(reloaded.current().freeMultiplier, 5);
    assert.equal(reloaded.current().balance, 6.25);
});

test("buying the bonus debits once and grants ten spins in the same wallet checkpoint", async () => {
    const app = createHarness({ bank: createBank({ balance: 1500, bet: 20 }), pauseCommit: true });
    const purchase = app.purchase();
    await app.purchase();
    assert.equal(app.commits.length, 1);
    assert.equal(app.commits[0].delta, -1000);
    assert.equal(app.commits[0].required, 1000);
    assert.equal(app.commits[0].snapshot.freeSpins, 10);
    app.releaseCommit();
    await purchase;
    assert.equal(app.bank.read("slot-game").balance, 500);
    assert.equal(app.current().freeSpins, 10);
    const reloaded = createHarness({ bank: app.bank });
    assert.equal(reloaded.current().freeSpins, 10);
    assert.equal(reloaded.current().balance, 500);
});

test("an unfunded paid spin cannot receive a net-positive payout after another game spends the stake", async () => {
    const app = createHarness({ bank: createBank({ balance: 100, bet: 100 }), result: { baseWin: 500 }, pauseCommit: true });
    const spinning = app.spin();
    await app.otherGame(-99);
    app.releaseCommit();
    await spinning;
    assert.equal(app.bank.read("slot-game").balance, 1);
    assert.equal(app.bank.read("slot-game").revision, 0);
    assert.equal(app.current().balance, 1);
    assert.equal(app.current().isSpinning, false);
    assert.equal(app.current().lastWin, 0);
});

test("a bonus purchase rejected by fresh shared funds never grants the free-spin package", async () => {
    const app = createHarness({ bank: createBank({ balance: 1000, bet: 20 }), pauseCommit: true });
    const purchase = app.purchase();
    await app.otherGame(-1);
    app.releaseCommit();
    await purchase;
    assert.equal(app.bank.read("slot-game").balance, 999);
    assert.equal(app.bank.read("slot-game").revision, 0);
    assert.equal(app.current().freeSpins, 0);
    assert.equal(app.current().balance, 999);
});

test("two stale slot tabs cannot both pay or duplicate a free-spin trigger", async () => {
    const bank = createBank({ balance: 1000, bet: 100 });
    const result = { baseWin: 50, maxScatterCount: 4 };
    const first = createHarness({ bank, result, pauseCommit: true });
    const second = createHarness({ bank, result, pauseCommit: true });
    const firstSpin = first.spin();
    const secondSpin = second.spin();
    first.releaseCommit();
    second.releaseCommit();
    await Promise.all([firstSpin, secondSpin]);
    assert.equal(bank.read("slot-game").balance, 950);
    assert.equal(bank.read("slot-game").revision, 1);
    assert.equal(bank.read("slot-game").snapshot.freeSpins, 10);
    assert.equal(first.current().freeSpins, 10);
    assert.equal(second.current().freeSpins, 10);
});

test("a newer same-game checkpoint invalidates an old animation without reverting bonus progress", async () => {
    const app = createHarness({ bank: createBank({ balance: 1000, bet: 100 }), result: { baseWin: 50, maxScatterCount: 4 }, pauseAnimation: true });
    const oldSpin = app.spin();
    await flush();
    const before = app.bank.read("slot-game");
    await app.bank.commit("slot-game", {
        revision: before.revision, delta: 5, required: 0,
        snapshot: { ...before.snapshot, freeSpins: 9, lastWin: 5 },
    });
    await flush();
    assert.equal(app.current().freeSpins, 9);
    app.finishAnimation();
    await oldSpin;
    assert.equal(app.bank.read("slot-game").balance, 955);
    assert.equal(app.current().freeSpins, 9);
    assert.equal(app.current().lastWin, 5);
    assert.equal(app.current().balance, 955);
    assert.equal(app.commits.length, 1);
});

test("a presentation failure keeps the committed money and awarded free spins", async () => {
    const app = createHarness({ bank: createBank({ balance: 100, bet: 20 }), result: { baseWin: 10, maxScatterCount: 4 }, failAnimation: true });
    await app.spin();
    assert.equal(app.bank.read("slot-game").balance, 90);
    assert.equal(app.current().lastWin, 10);
    assert.equal(app.current().freeSpins, 10);
    assert.equal(app.current().isSpinning, false);
    assert.equal(app.commits.length, 1);
    assert.equal(app.messages.at(-1).title, "Dönüş sonucu kaydedildi");
});

test("low shared balances are preserved and slot never independently refills them", async () => {
    const app = createHarness({ bank: createBank({ balance: 19, bet: 100 }) });
    await app.spin();
    assert.equal(app.bank.read("slot-game").balance, 19);
    assert.equal(app.current().balance, 19);
    assert.equal(app.commits.length, 0);
    assert.equal(source.includes("engine.replenishBalanceIfEmpty"), false);
    assert.equal(source.includes("localStorage.setItem"), false);
});

test("legacy bonus multiplier migration is retained and a final free spin resets it once", async () => {
    const app = createHarness({ bank: createBank({ balance: 0, bet: 100, freeSpins: 1, freeMultiplier: 6, version: 1 }), result: { baseWin: 2, multiplierTotal: 2 } });
    assert.equal(app.current().freeMultiplier, 5);
    await app.spin();
    assert.equal(app.bank.read("slot-game").balance, 14);
    assert.equal(app.bank.read("slot-game").snapshot.freeSpins, 0);
    assert.equal(app.bank.read("slot-game").snapshot.freeMultiplier, 0);
    assert.equal(app.current().lastWin, 14);
    assert.equal(app.commits.length, 1);
});
