"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

function cryptoSequence(...samples) {
    return {
        calls: 0,
        getRandomValues(buffer) {
            assert.ok(buffer instanceof Uint32Array);
            assert.equal(buffer.length, 1);
            assert.ok(this.calls < samples.length, "unexpected outcome generation");
            buffer[0] = samples[this.calls++];
            return buffer;
        },
    };
}

function wager(bets, balance = 1000) {
    let state = core.createState({ balance });
    for (const [id, amount] of Object.entries(bets)) {
        state = core.setBet(state, id, amount);
        assert.ok(state);
    }
    return state;
}

function roundTrip(state) {
    const restored = core.restoreState(JSON.parse(JSON.stringify(core.serializeState(state))));
    assert.deepEqual(restored, state);
    return restored;
}

test("European wheel has all 37 pockets in the fixed order and exact colors", () => {
    assert.deepEqual(core.WHEEL_ORDER, [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);
    assert.equal(new Set(core.WHEEL_ORDER).size, 37);
    assert.deepEqual(core.POCKETS.map(({ number }) => number), core.WHEEL_ORDER);
    assert.equal(core.POCKETS.filter(({ color }) => color === "red").length, 18);
    assert.equal(core.POCKETS.filter(({ color }) => color === "black").length, 18);
    assert.equal(core.getColor(0), "green");
    assert.equal(core.getColor(32), "red");
    assert.equal(core.getColor(15), "black");
    assert.equal(core.getColor("0"), null);
    assert.equal(core.getColor(37), null);
});

test("all inside and outside definitions have the standard coverage and inclusive payout", () => {
    const expected = { straight: [37, 1, 36], split: [60, 2, 18], street: [12, 3, 12], corner: [22, 4, 9], sixline: [11, 6, 6], trio: [2, 3, 12], firstfour: [1, 4, 9], dozen: [3, 12, 3], column: [3, 12, 3], red: [1, 18, 2], black: [1, 18, 2], even: [1, 18, 2], odd: [1, 18, 2], low: [1, 18, 2], high: [1, 18, 2] };
    assert.equal(new Set(core.BET_DEFINITIONS.map(({ id }) => id)).size, core.BET_DEFINITIONS.length);
    for (const [type, [count, coverage, multiplier]] of Object.entries(expected)) {
        const definitions = core.BET_DEFINITIONS.filter((bet) => bet.type === type);
        assert.equal(definitions.length, count, type);
        for (const definition of definitions) {
            assert.equal(definition.numbers.length, coverage);
            assert.equal(new Set(definition.numbers).size, coverage);
            assert.equal(definition.payoutMultiplier, multiplier);
            for (let number = 0; number <= 36; number += 1) {
                assert.equal(core.calculatePayout({ [definition.id]: 7 }, number), definition.numbers.includes(number) ? 7 * multiplier : 0, `${definition.id} on ${number}`);
            }
        }
    }
    assert.deepEqual(core.getBet("corner:1-2-4-5").numbers, [1, 2, 4, 5]);
    assert.equal(core.getBet("split:3-4"), null, "row boundaries do not create horizontal splits");
    assert.equal(core.getBet("corner:2-3-4-5"), null);
});

test("zero pays straight, its three splits, both trios and first four while every outside bet loses", () => {
    const expected = { "straight:0": 36, "split:0-1": 18, "split:0-2": 18, "split:0-3": 18, "trio:0-1-2": 12, "trio:0-2-3": 12, "firstfour:0-1-2-3": 9 };
    assert.deepEqual(core.BET_DEFINITIONS.filter((bet) => bet.numbers.includes(0)).map(({ id }) => id).sort(), Object.keys(expected).sort());
    for (const [id, payout] of Object.entries(expected)) assert.equal(core.calculatePayout({ [id]: 1 }, 0), payout);
    for (const bet of core.BET_DEFINITIONS.filter((bet) => ["dozen", "column", "red", "black", "even", "odd", "low", "high"].includes(bet.type))) {
        assert.equal(core.calculatePayout({ [bet.id]: 100 }, 0), 0);
    }
});

test("crypto rejection sampling discards the biased tail and handles the complete uint32 range", () => {
    const limit = 0x100000000 - (0x100000000 % 37);
    const source = cryptoSequence(0xffffffff, limit, limit - 1);
    assert.equal(core.secureRandomInt(37, source), (limit - 1) % 37);
    assert.equal(source.calls, 3);
    assert.equal(core.secureRandomInt(37, cryptoSequence(0)), 0);
    assert.equal(core.secureRandomInt(37, cryptoSequence(36)), 36);
    assert.equal(core.secureRandomInt(0x100000000, cryptoSequence(0xffffffff)), 0xffffffff);
    for (const max of [0, -1, 1.5, NaN, Infinity, 0x100000001]) assert.throws(() => core.secureRandomInt(max), RangeError);
    assert.throws(() => core.secureRandomInt(37, {}), /Güvenli/);
});

test("bet changes, undo, clear and doubling reserve against one bankroll atomically", () => {
    const start = core.createState({ balance: 100 });
    const first = core.addBet(start, "red", 20);
    const second = core.addBet(first, "straight:0", 10);
    const third = core.addBet(second, "red", 5);
    assert.equal(core.totalBet(third), 35);
    assert.equal(third.balance, 100);
    assert.deepEqual(start.bets, {});
    assert.deepEqual(core.undoBet(third).bets, second.bets);
    assert.deepEqual(core.undoBet(core.undoBet(third)).bets, first.bets);
    assert.equal(core.undoBet(start), null);
    assert.deepEqual(core.doubleBets(third).bets, { red: 50, "straight:0": 20 });
    assert.equal(core.doubleBets(core.doubleBets(third)), null);
    assert.equal(core.setBet(third, "black", 100), null);
    assert.deepEqual(third.bets, { red: 25, "straight:0": 10 });
    assert.deepEqual(core.clearBets(third).bets, {});
    assert.deepEqual(core.undoBet(core.clearBets(third)).bets, third.bets);
    assert.equal(core.setBet(third, "red", 25), null);
    assert.deepEqual(core.setBet(third, "straight:0", 0).bets, { red: 25 });
    roundTrip(third);
});

test("negative, fractional, unknown and unsafe monetary inputs never enter the ledger", () => {
    const start = core.createState();
    for (const amount of [-1, 0.5, NaN, Infinity, "25", Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal(core.setBet(start, "red", amount), null);
        assert.equal(core.addBet(start, "red", amount), null);
    }
    assert.equal(core.setBet(start, "unknown", 10), null);
    assert.equal(core.calculatePayout({ unknown: 1 }, 1), null);
    assert.equal(core.calculatePayout({ red: -1 }, 1), null);
    assert.equal(core.calculatePayout({ red: 0 }, 1), null);
    assert.equal(core.calculatePayout({ red: 10 }, 37), null);
    assert.equal(core.calculatePayout({ "straight:1": Number.MAX_SAFE_INTEGER }, 1), null);
    const huge = wager({ "straight:1": Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER);
    const source = cryptoSequence();
    assert.equal(core.beginSpin(huge, source), null);
    assert.equal(source.calls, 0, "overflow is checked before the outcome is requested");
});

test("a failed secure draw preserves bankroll and wagers for a safe retry", () => {
    const state = wager({ red: 50 });
    const before = core.serializeState(state);
    assert.throws(() => core.beginSpin(state, {
        getRandomValues() { throw new Error("crypto unavailable"); },
    }), /crypto unavailable/);
    assert.deepEqual(core.serializeState(state), before);
    assert.equal(core.beginSpin(core.createState(), cryptoSequence()), null);
    assert.equal(core.beginSpin(state, cryptoSequence(32)).pending.number, 32);
});

test("a spin generates once, debits exactly once, locks bets and settles inclusive payouts once", () => {
    const state = wager({ "straight:7": 10, red: 20, "column:1": 5 });
    const source = cryptoSequence(7);
    const pending = core.beginSpin(state, source);
    assert.equal(source.calls, 1);
    assert.equal(state.balance, 1000);
    assert.equal(pending.balance, 965);
    assert.equal(pending.pending.number, 7);
    assert.equal(pending.pending.stake, 35);
    assert.equal(core.beginSpin(pending, source), null);
    assert.equal(core.addBet(pending, "red", 1), null);
    assert.equal(core.undoBet(pending), null);
    assert.equal(core.clearBets(pending), null);
    assert.equal(core.repeatBets(pending), null);
    assert.equal(core.doubleBets(pending), null);

    const settled = core.settleSpin(roundTrip(pending));
    assert.deepEqual(settled.result, { id: 1, number: 7, color: "red", bets: { "straight:7": 10, red: 20, "column:1": 5 }, stake: 35, payout: 415, net: 380, balance: 1380, winningBets: [{ id: "straight:7", amount: 10, payout: 360 }, { id: "red", amount: 20, payout: 40 }, { id: "column:1", amount: 5, payout: 15 }] });
    assert.equal(settled.state.balance, 1380);
    assert.equal(settled.state.pending, null);
    assert.deepEqual(settled.state.bets, {});
    assert.equal(core.settleSpin(settled.state), null);
    assert.equal(core.settleSpin(roundTrip(settled.state)), null);
    assert.equal(source.calls, 1);
    assert.deepEqual(core.repeatBets(settled.state).bets, state.bets);
});

test("repeated wagers fail atomically if the previous layout exceeds the remaining credits", () => {
    const state = wager({ "straight:1": 80 }, 100);
    const settled = core.settleSpin(core.beginSpin(state, cryptoSequence(0))).state;
    assert.equal(settled.balance, 20);
    assert.equal(core.repeatBets(settled), null);
    assert.deepEqual(settled.bets, {});
});

test("pending spins survive JSON restore without drawing a second outcome or paying twice", () => {
    const source = cryptoSequence(0);
    let state = core.beginSpin(wager({ "split:0-1": 25, black: 20 }), source);
    state = roundTrip(state);
    state = core.settleSpin(state).state;
    state = roundTrip(state);
    assert.equal(state.balance, 1405);
    assert.equal(core.settleSpin(state), null);
    assert.equal(source.calls, 1);
    const snapshot = core.serializeState(state);
    snapshot.history[0].winningBets[0].payout = 1;
    snapshot.history[0].color = "black";
    const restored = core.restoreState(snapshot);
    assert.equal(restored.history[0].winningBets[0].payout, 450);
    assert.equal(restored.history[0].color, "green");
});

test("history and undo are bounded through repeated actions and restored without aliases", () => {
    let state = core.createState({ balance: 10000 });
    for (let amount = 1; amount <= core.UNDO_LIMIT + 10; amount += 1) state = core.setBet(state, "red", amount);
    assert.equal(state.undoStack.length, core.UNDO_LIMIT);
    for (let index = 0; index < core.HISTORY_LIMIT + 5; index += 1) {
        if (!core.totalBet(state)) state = core.setBet(state, "red", 1);
        state = core.settleSpin(core.beginSpin(state, cryptoSequence(1))).state;
        state = roundTrip(state);
    }
    assert.equal(state.history.length, core.HISTORY_LIMIT);
    assert.equal(state.history[0].id, core.HISTORY_LIMIT + 5);
    assert.equal(state.history.at(-1).id, 6);
    const saved = core.serializeState(state);
    const restored = core.restoreState(saved);
    saved.history[0].bets.red = 500;
    assert.equal(restored.history[0].bets.red, 1);
});

test("corrupt or inconsistent saved amounts, wager IDs, outcomes and phases are rejected", () => {
    const pending = core.beginSpin(wager({ red: 20 }), cryptoSequence(0));
    const invalidChanges = [
        (save) => { save.version = 2; },
        (save) => { save.balance = -1; },
        (save) => { save.bets.red = 0; },
        (save) => { save.bets.fake = 10; },
        (save) => { save.pending.number = 37; },
        (save) => { save.pending.id += 1; },
        (save) => { save.pending.stake = 100; },
        (save) => { save.pending.bets.red = 30; },
        (save) => { save.lastBets.red = 1; },
        (save) => { save.phase = "betting"; },
        (save) => { save.undoStack = [{ red: 10 }]; },
        (save) => { save.nextSpinId = Infinity; },
    ];
    for (const corrupt of invalidChanges) {
        const saved = core.serializeState(pending);
        corrupt(saved);
        assert.equal(core.restoreState(saved), null);
    }
    const settled = core.settleSpin(pending).state;
    const paidSave = core.serializeState(settled);
    paidSave.phase = "spinning";
    paidSave.bets = { red: 20 };
    paidSave.pending = { ...pending.pending };
    assert.equal(core.restoreState(paidSave), null, "a recorded spin cannot be restored as unpaid");
});

test("empty virtual bankroll can be replenished while a spin or funded account is preserved", () => {
    const empty = core.createState({ balance: 0 });
    const replenished = core.replenishBalance(empty);
    assert.equal(replenished.balance, core.STARTING_BALANCE);
    assert.equal(core.replenishBalance(replenished), null);
    const pending = core.beginSpin(wager({ red: 100 }, 100), cryptoSequence(0));
    assert.equal(core.replenishBalance(pending), null);
    const lost = core.settleSpin(pending).state;
    assert.equal(lost.balance, 0);
    assert.equal(core.replenishBalance(roundTrip(lost)).balance, core.STARTING_BALANCE);
});
