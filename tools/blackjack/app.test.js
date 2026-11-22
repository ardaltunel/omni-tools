"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const engine = require("./engine.js");
const { createWallet } = require("../shared/game-wallet.js");
const { createWalletBridge } = require("./app.js");

function fixture(ranks = ["8", "6", "9", "10"], { credits = 1000, bet = 100 } = {}) {
    const deck = engine.createDeck();
    const chosen = ranks.map((rank) => deck.splice(deck.findIndex((card) => card.rank === rank), 1)[0]);
    const game = engine.createState({ balance: credits * engine.MONEY_SCALE, deckCount: 1, reshuffleAt: 0.05, shoe: [...deck, ...chosen.reverse()] });
    if (bet) engine.setBet(game, bet * engine.MONEY_SCALE);
    return game;
}

function envelope(game) { return { version: 2, balance: game.balance, game: engine.serializeState(game) }; }

function setup(game = fixture()) {
    const data = new Map([["omni-blackjack-v1", JSON.stringify(envelope(game))]]);
    const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
    let queue = Promise.resolve();
    const locks = { request(_name, _options, operation) {
        const pending = queue.then(operation);
        queue = pending.catch(() => {});
        return pending;
    } };
    const wallet = createWallet({ storage, locks });
    const bridge = createWalletBridge(engine, wallet, envelope(game), envelope);
    return { bridge, wallet, storage, locks, data };
}

async function otherSpend(wallet, delta) {
    const current = wallet.read("roulette");
    const result = await wallet.commit("roulette", { revision: current.revision, delta, snapshot: { game: { phase: "betting", pending: null } } });
    assert.equal(result.ok, true);
}

test("ortak bakiye yarım kredi birimleriyle harcanır ve desteklenmeyen kuruşlar kaybolmaz", async () => {
    const app = setup(fixture(undefined, { bet: 0 }));
    await otherSpend(app.wallet, 0.13);
    app.bridge.sync();
    assert.equal(app.bridge.balance(), 1000.13);
    assert.equal(app.bridge.game.balance, 2000);
    assert.equal((await app.bridge.act((game) => engine.setBet(game, 200))).ok, true);
    assert.equal(app.wallet.read("blackjack").balance, 1000.13);
    const dealt = await app.bridge.act((game) => engine.beginRound(game), (game) => game.currentBet);
    assert.equal(dealt.ok, true);
    assert.equal(app.bridge.balance(), 900.13);
    assert.equal(app.bridge.game.balance, 1800);
    assert.equal(app.wallet.read("blackjack").snapshot.game.phase, engine.PHASES.DEALING);
    const restored = createWalletBridge(engine, app.wallet, envelope(fixture()), envelope);
    assert.deepEqual(restored.game.playerHands, app.bridge.game.playerHands);
    assert.equal(restored.balance(), 900.13);
});

test("başka oyun harcaması tamamlanmamış elleri korur ve eski Blackjack bakiyesini geri yazmaz", async () => {
    const game = fixture();
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    const app = setup(game);
    const cards = engine.serializeState(app.bridge.game).playerHands;
    await otherSpend(app.wallet, -250);
    app.bridge.sync();
    assert.equal(app.bridge.balance(), 650);
    assert.deepEqual(engine.serializeState(app.bridge.game).playerHands, cards);
    assert.equal((await app.bridge.act((state) => engine.stand(state))).ok, true);
    assert.equal(app.wallet.read("blackjack").balance, 650);
    assert.deepEqual(engine.serializeState(app.bridge.game).playerHands[0].cards, cards[0].cards);
});

test("iki sekmenin eşzamanlı dağıtımı bir kere tahsil edilir ve kaybeden kanonik kartları benimser", async () => {
    const app = setup();
    const secondWallet = createWallet({ storage: app.storage, locks: app.locks });
    const second = createWalletBridge(engine, secondWallet, {}, envelope);
    const [first, other] = await Promise.all([
        app.bridge.act((game) => engine.beginRound(game), (game) => game.currentBet),
        second.act((game) => engine.beginRound(game), (game) => game.currentBet),
    ]);
    assert.equal([first, other].filter((result) => result.ok).length, 1);
    assert.equal([first, other].find((result) => !result.ok).reason, "conflict");
    app.bridge.sync();
    second.sync();
    assert.equal(app.wallet.read("blackjack").balance, 900);
    assert.deepEqual(engine.serializeState(second.game), engine.serializeState(app.bridge.game));
    assert.equal(second.game.playerHands[0].cards.length, 2);
});

test("yarım kalan sonuç iki sekmede veya yeniden yüklemede yalnızca bir defa ödenir", async () => {
    const game = fixture(["A", "9", "K", "8"]);
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    assert.equal(game.phase, engine.PHASES.RESOLVING);
    const app = setup(game);
    const second = createWalletBridge(engine, createWallet({ storage: app.storage, locks: app.locks }), {}, envelope);
    const results = await Promise.all([
        app.bridge.act((state) => engine.resolveRound(state)),
        second.act((state) => engine.resolveRound(state)),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(app.wallet.read("blackjack").balance, 1150);
    const restored = createWalletBridge(engine, app.wallet, envelope(game), envelope);
    assert.equal(restored.game.phase, engine.PHASES.ROUND_OVER);
    assert.equal(restored.game.stats.hands, 1);
    assert.equal((await restored.act((state) => engine.resolveRound(state))).ok, false);
    assert.equal(app.wallet.read("blackjack").balance, 1150);
});

test("dağıtım ile tahsilat arasındaki başka oyun harcaması yetersiz bahsi atomik olarak reddeder", async () => {
    const app = setup();
    const racingWallet = { ...app.wallet, async commit(id, change) {
        await otherSpend(app.wallet, -950);
        return app.wallet.commit(id, change);
    } };
    const bridge = createWalletBridge(engine, racingWallet, {}, envelope);
    const shoe = engine.serializeState(bridge.game).shoe;
    const result = await bridge.act((game) => engine.beginRound(game), (game) => game.currentBet);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "funds");
    assert.equal(bridge.balance(), 50);
    assert.equal(bridge.game.phase, engine.PHASES.BETTING);
    assert.equal(bridge.game.currentBet, 0);
    assert.deepEqual(engine.serializeState(bridge.game).shoe, shoe);
    assert.deepEqual(bridge.game.playerHands, []);
});

test("anında kazanan sigorta bile net kazançtan önce açılış bakiyesi gerektirir", async () => {
    const game = fixture(["10", "A", "8", "K"]);
    engine.beginRound(game);
    assert.equal(engine.afterInitialDeal(game).type, "insurance");
    const app = setup(game);
    const racingWallet = { ...app.wallet, async commit(id, change) {
        assert.equal(change.delta, 100);
        assert.equal(change.required, 50);
        await otherSpend(app.wallet, -880);
        return app.wallet.commit(id, change);
    } };
    const bridge = createWalletBridge(engine, racingWallet, {}, envelope);
    const result = await bridge.act((state) => engine.takeInsurance(state), (state) => Math.floor(state.currentBet / 2));
    assert.equal(result.reason, "funds");
    assert.equal(bridge.balance(), 20);
    assert.equal(bridge.game.phase, engine.PHASES.INSURANCE);
    assert.equal(bridge.game.insuranceBet, 0);
    assert.equal(bridge.game.round.insuranceResolved, false);
});

test("ikiye katlama ve ayırma ortak bakiyeden ilave bahsi tam bir kez düşer", async () => {
    for (const split of [false, true]) {
        const game = fixture(split ? ["8", "6", "8", "10", "2", "3"] : ["5", "6", "6", "10", "9"]);
        engine.beginRound(game);
        engine.afterInitialDeal(game);
        const app = setup(game);
        const result = await app.bridge.act((state) => split ? engine.split(state) : engine.doubleDown(state), (state) => state.playerHands[state.activeHandIndex].bet);
        assert.equal(result.ok, true);
        assert.equal(app.bridge.balance(), 800);
        assert.equal(app.bridge.game.playerHands.length, split ? 2 : 1);
        assert.equal(app.bridge.game.playerHands.reduce((sum, hand) => sum + hand.bet, 0), 400);
        assert.ok(engine.restoreState(app.wallet.read("blackjack").snapshot.game));
    }
});

test("boş bakiyeyi açmak veya yeni bahis turuna geçmek kendiliğinden kredi üretmez", async () => {
    const app = setup(fixture(undefined, { credits: 0, bet: 0 }));
    assert.equal(app.bridge.balance(), 0);
    assert.equal(app.bridge.game.balance, 0);
    assert.equal((await app.bridge.act((game) => engine.addBet(game, 20))).ok, false);
    assert.equal(app.wallet.read("blackjack").balance, 0);
    assert.equal(app.wallet.canRefill(), true);
    const ended = fixture(["10", "10", "6", "9"], { credits: 100, bet: 100 });
    engine.beginRound(ended);
    engine.afterInitialDeal(ended);
    engine.stand(ended);
    engine.dealerPlay(ended);
    engine.resolveRound(ended);
    assert.equal(ended.balance, 0);
    const settled = setup(ended);
    assert.equal((await settled.bridge.act((game) => engine.prepareNextRound(game))).ok, true);
    assert.equal(settled.bridge.game.phase, engine.PHASES.BETTING);
    assert.equal(settled.wallet.read("blackjack").balance, 0);
});

test("bekleyen cüzdan işlemi sırasında ikinci hamle başlayamaz", async () => {
    const app = setup();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const delayed = { ...app.wallet, async commit(id, change) { await gate; return app.wallet.commit(id, change); } };
    const bridge = createWalletBridge(engine, delayed, {}, envelope);
    const first = bridge.act((game) => engine.beginRound(game), (game) => game.currentBet);
    assert.equal(bridge.isPending(), true);
    assert.equal(bridge.game.phase, engine.PHASES.BETTING);
    assert.equal((await bridge.act((game) => engine.beginRound(game), (game) => game.currentBet)).reason, "busy");
    release();
    assert.equal((await first).ok, true);
    assert.equal(bridge.balance(), 900);
});

test("gerçek dağıtım callbacki cüzdan onayından önce kart veya animasyon başlatmaz", async () => {
    const source = fs.readFileSync(require.resolve("./app.js"), "utf8");
    function readFunction(name) {
        const declaration = new RegExp(`^    (?:async )?function ${name}\\(`, "m").exec(source);
        assert.ok(declaration);
        const next = /\n    (?:async )?function [A-Za-z_$]/u.exec(source.slice(declaration.index + 1));
        assert.ok(next);
        return source.slice(declaration.index, declaration.index + 1 + next.index);
    }
    const app = setup();
    let release;
    let finishDeal;
    const gate = new Promise((resolve) => { release = resolve; });
    const delayed = { ...app.wallet, async commit(id, change) { await gate; return app.wallet.commit(id, change); } };
    const bridge = createWalletBridge(engine, delayed, {}, envelope);
    const events = [];
    const context = vm.createContext({
        engine, game: bridge.game, walletBridge: bridge,
        canDeal: () => true,
        syncWallet: () => bridge.sync(),
        saveState() {},
        render() {
            assert.equal(app.wallet.read("blackjack").snapshot.game.phase, bridge.game.phase);
            events.push("render");
        },
        playSound: (kind) => events.push(kind),
        delay: () => new Promise((resolve) => { finishDeal = resolve; }),
        resolveNaturalRound() { assert.fail("Fixture is not a natural hand"); },
        resumeSavedGame() {},
        window: { setTimeout() {} },
    });
    vm.runInContext(`let busy=false; let actionGeneration=0; let view; let roundStartingBalance=0;
        ${readFunction("createViewState")}
        ${readFunction("commitAction")}
        ${readFunction("beginDeal")}
        this.begin=beginDeal; this.isBusy=()=>busy;`, context);
    const pending = context.begin();
    assert.equal(context.isBusy(), true);
    assert.deepEqual(events, []);
    assert.equal(bridge.game.phase, engine.PHASES.BETTING);
    release();
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    assert.equal(bridge.game.phase, engine.PHASES.DEALING);
    assert.ok(events.includes("deal"));
    finishDeal();
    await pending;
    assert.equal(bridge.game.phase, engine.PHASES.PLAYER_TURN);
    assert.equal(context.isBusy(), false);
    assert.equal(app.wallet.read("blackjack").balance, 900);
});
