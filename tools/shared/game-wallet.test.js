"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createWallet, STORAGE_KEY } = require("./game-wallet.js");

function storage(seed = {}) {
    const data = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function lockManager() {
    let tail = Promise.resolve();
    return { request(_name, _options, action) { const work = tail.then(action); tail = work.catch(() => {}); return work; } };
}
const snapshot = (id, extra = {}) => id === "slot-game" ? { balance: 0, freeSpins: 0, ...extra }
    : { game: { balance: 0, phase: "BETTING", ...extra } };

test("fresh wallet grants one shared 10000, and legacy bankrolls migrate once with Blackjack units converted", async () => {
    const fresh = createWallet({ storage: storage() });
    for (const id of ["blackjack", "roulette", "slot-game"]) assert.equal(fresh.read(id).balance, 10000);
    const saved = storage({
        "omni-blackjack-v1": { balance: 999999, game: { balance: 2469, phase: "PLAYER_TURN" } },
        "omni-roulette-v1": { game: { balance: 350, pending: { id: 1 } } },
        "omni-slot-game-v1": { balance: 12.75, freeSpins: 5 },
    });
    const first = createWallet({ storage: saved });
    assert.equal(first.read("blackjack").balance, 1597.25);
    assert.equal(first.read("blackjack").snapshot.game.phase, "PLAYER_TURN");
    assert.equal(first.read("roulette").snapshot.game.pending.id, 1);
    assert.equal(first.read("slot-game").snapshot.freeSpins, 5);
    await first.commit("roulette", { revision: 0, delta: -100, snapshot: snapshot("roulette") });
    saved.setItem("omni-blackjack-v1", JSON.stringify({ balance: 99999999 }));
    assert.equal(createWallet({ storage: saved }).read("slot-game").balance, 1497.25);
});

test("debits, payouts and snapshots commit together; other games share exact cents without copying a stale balance", async () => {
    const saved = storage();
    const wallet = createWallet({ storage: saved });
    await wallet.commit("blackjack", { revision: 0, delta: -100, required: 100, snapshot: snapshot("blackjack", { phase: "PLAYER_TURN" }) });
    assert.equal(wallet.read("slot-game").balance, 9900);
    await wallet.commit("roulette", { revision: 0, delta: -25, snapshot: snapshot("roulette") });
    await wallet.commit("blackjack", { revision: 1, delta: 250.5, snapshot: snapshot("blackjack", { phase: "ROUND_OVER" }) });
    await wallet.commit("slot-game", { revision: 0, delta: -100 + 2.37, required: 100, snapshot: snapshot("slot-game", { lastWin: 2.37 }) });
    for (const id of ["blackjack", "roulette", "slot-game"]) assert.equal(wallet.read(id).balance, 10027.87);
    const record = JSON.parse(saved.getItem(STORAGE_KEY));
    assert.equal(record.balanceCents, 1002787);
    assert.equal(record.games["slot-game"].snapshot.lastWin, 2.37);
    assert.equal(record.games.blackjack.snapshot.game.phase, "ROUND_OVER");
});

test("same-game stale checkpoints cannot duplicate payouts or roll back a newer hand", async () => {
    const wallet = createWallet({ storage: storage() });
    const first = await wallet.commit("blackjack", { revision: 0, delta: 50, snapshot: snapshot("blackjack", { phase: "ROUND_OVER" }) });
    assert.equal(first.ok, true);
    const duplicate = await wallet.commit("blackjack", { revision: 0, delta: 50, snapshot: snapshot("blackjack", { phase: "RESOLVING" }) });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.reason, "conflict");
    assert.equal(duplicate.balance, 10050);
    assert.equal(duplicate.snapshot.game.phase, "ROUND_OVER");
});

test("opening funds are required even for a positive net winning spin or insurance", async () => {
    const wallet = createWallet({ storage: storage({ "omni-slot-game-v1": { balance: 20 } }) });
    const rejected = await wallet.commit("slot-game", { revision: 0, delta: 400, required: 100, snapshot: snapshot("slot-game", { freeSpins: 10 }) });
    assert.equal(rejected.reason, "funds");
    assert.equal(wallet.read("slot-game").balance, 20);
    assert.equal(wallet.read("slot-game").revision, 0);
    assert.equal(wallet.read("slot-game").snapshot.freeSpins, undefined);
    assert.equal((await wallet.commit("blackjack", { revision: 0, delta: -21, snapshot: snapshot("blackjack") })).reason, "funds");
});

test("independent tabs serialize competing spends and settlement replays under the shared Web Lock", async () => {
    const saved = storage({ "omni-slot-game-v1": { balance: 100 } });
    const locks = lockManager();
    const left = createWallet({ storage: saved, locks });
    const right = createWallet({ storage: saved, locks });
    const outcomes = await Promise.all([
        left.commit("roulette", { revision: 0, delta: -80, snapshot: snapshot("roulette") }),
        right.commit("slot-game", { revision: 0, delta: -80, snapshot: snapshot("slot-game") }),
    ]);
    assert.equal(outcomes.filter((item) => item.ok).length, 1);
    assert.equal(left.read("blackjack").balance, 20);
    const revision = left.read("roulette").revision;
    const payouts = await Promise.all([
        left.commit("roulette", { revision, delta: 160, snapshot: snapshot("roulette", { phase: "betting" }) }),
        right.commit("roulette", { revision, delta: 160, snapshot: snapshot("roulette", { phase: "betting" }) }),
    ]);
    assert.equal(payouts.filter((item) => item.ok).length, 1);
    assert.equal(right.read("slot-game").balance, 180);
});

test("refill is global, cannot be farmed through another game and waits for active hands or bonuses", async () => {
    for (const [id, checkpoint] of [
        ["blackjack", snapshot("blackjack", { phase: "PLAYER_TURN" })],
        ["roulette", snapshot("roulette", { pending: { id: 1 } })],
        ["slot-game", snapshot("slot-game", { freeSpins: 1 })],
    ]) {
        const wallet = createWallet({ storage: storage({ "omni-slot-game-v1": { balance: 0.5 } }) });
        await wallet.commit(id, { revision: 0, delta: 0, snapshot: checkpoint });
        assert.equal(wallet.canRefill(), false, id);
        assert.equal((await wallet.refill()).ok, false, id);
        await wallet.commit(id, { revision: 1, delta: 0, snapshot: snapshot(id) });
        assert.equal((await wallet.refill()).ok, true, id);
        assert.equal(wallet.read("blackjack").balance, 10000);
        assert.equal((await wallet.refill()).ok, false, id);
    }
});

test("blocked storage keeps one shared session wallet; invalid saves, NaNs and unsafe balances cannot mint funds", async () => {
    const wallet = createWallet({ storage: { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } } });
    await wallet.commit("slot-game", { revision: 0, delta: -1.25, snapshot: snapshot("slot-game") });
    assert.equal(wallet.read("roulette").balance, 9998.75);
    for (const delta of [NaN, Infinity, 0.001, Number.MAX_SAFE_INTEGER]) {
        assert.equal((await wallet.commit("roulette", { revision: 0, delta, snapshot: snapshot("roulette") })).ok, false);
    }
    const damaged = storage({ "omni-blackjack-v1": { balance: 20000 } });
    damaged.setItem(STORAGE_KEY, "broken JSON");
    assert.equal(createWallet({ storage: damaged }).read("blackjack").balance, 0);
    assert.equal(wallet.read("blackjack").balance, 9998.75);
});

test("subscriptions see the complete checkpoint and returned snapshots cannot mutate the wallet", async () => {
    const wallet = createWallet({ storage: storage() });
    let observed;
    const unsubscribe = wallet.subscribe(() => { observed = wallet.read("roulette"); });
    const changed = await wallet.commit("roulette", { revision: 0, delta: -30, snapshot: snapshot("roulette", { pending: { number: 32 } }) });
    assert.equal(observed.balance, 9970);
    assert.equal(observed.snapshot.game.pending.number, 32);
    changed.snapshot.game.pending.number = 0;
    assert.equal(wallet.read("roulette").snapshot.game.pending.number, 32);
    unsubscribe();
    wallet.destroy();
});

test("the wallet loads before all bankroll apps and the three existing balance displays identify the shared account", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const html = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
    const service = html.indexOf('src="tools/shared/game-wallet.js');
    assert.ok(service > 0);
    for (const id of ["blackjack", "roulette", "slot-game"]) {
        assert.ok(service < html.indexOf(`src="tools/${id}/app.js`), id);
        assert.match(html, new RegExp(`id="${id}-balance"`));
    }
    assert.match(html, /ORTAK BAKİYE/);
    assert.match(html, /Ortak cüzdan/);
    assert.match(html, /Ortak bakiye/);
});
