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
        isTableActive: () => true,
        audio: { unlock() {} },
        effects: { cancel() {} },
        cancelPresentation() {},
        scheduleResume() {},
        syncWallet: () => bridge.sync(),
        saveState() {},
        render() {
            assert.equal(app.wallet.read("blackjack").snapshot.game.phase, bridge.game.phase);
            events.push("render");
        },
        playSound: (kind) => events.push(kind),
        delay: () => Promise.resolve(),
        presentInitialDeal(sequence) {
            assert.equal(bridge.game.phase, engine.PHASES.DEALING);
            assert.equal(sequence.length, 4);
            events.push("deal");
            return new Promise((resolve) => { finishDeal = () => resolve(true); });
        },
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

function controllerFunction(name) {
    const source = fs.readFileSync(require.resolve("./app.js"), "utf8");
    const declaration = new RegExp(`^    (?:async )?function ${name}\\(`, "m").exec(source);
    assert.ok(declaration, name);
    const next = /\n    (?:async )?function [A-Za-z_$]/u.exec(source.slice(declaration.index + 1));
    assert.ok(next, name);
    const boundary = declaration.index + 1 + next.index;
    const end = source.lastIndexOf("\n    }", boundary);
    return source.slice(declaration.index, end + "\n    }".length);
}

const flushPresentation = () => new Promise((resolve) => setImmediate(resolve));

test("kapalı kart oluşturulurken özel kartın rank, suit, id veya başka alanları hiç okunmaz", () => {
    const svgCalls = [];
    function element(tag) {
        return {
            tag, className: "", dataset: {}, attributes: {}, children: [], innerHTML: "",
            style: { setProperty() {} },
            setAttribute(name, value) { this.attributes[name] = value; },
            append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
        };
    }
    const context = vm.createContext({
        document: { createElement: element },
        window: { OmniBlackjackCards: { svg(card, options) { svgCalls.push({ card, options }); return "<svg>generic back</svg>"; } } },
        cardLabel() { assert.fail("A hidden card must not be labeled from private data"); },
    });
    vm.runInContext(`${controllerFunction("createCard")} this.makeCard=createCard;`, context);
    const secret = new Proxy({}, { get(_target, name) { assert.fail(`Hidden field read: ${String(name)}`); } });
    const hidden = context.makeCard(secret, { hidden: true });
    assert.equal(hidden.dataset.cardId, "dealer-hole");
    assert.equal(hidden.attributes["aria-label"], "Kapalı kart");
    assert.equal(hidden.children[0].children[1].innerHTML, "");
    const pending = context.makeCard(secret, { hidden: true, pending: true, index: 3 });
    assert.equal(pending.dataset.cardId, "pending-3");
    assert.equal(pending.style.visibility, "hidden");
    assert.equal(pending.attributes["aria-hidden"], "true");
    assert.equal(svgCalls.length, 2);
    assert.ok(svgCalls.every(({ card, options }) => card === null && options.faceDown === true));
});

function presentationHarness({ game = fixture(), effectMode = "deferred", missingNode = false, controlledGaps = false } = {}) {
    const bank = setup(game);
    const flights = [];
    const gaps = [];
    const timers = new Map();
    const renders = [];
    const shoeClasses = new Set();
    let active = true;
    let nextTimer = 0;
    const nodes = new Map(game.shoe.map((card) => [card.id, { id: card.id, getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 112 }) }]));
    [...game.dealerHand, ...game.playerHands.flatMap((hand) => hand.cards)].forEach((card) => nodes.set(card.id, { id: card.id, getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 112 }) }));
    const hole = { id: "dealer-hole", getBoundingClientRect: () => ({ left: 200, top: 80, width: 80, height: 112 }) };
    const effects = {
        flyCard(node, from, to, options) {
            const flight = { node, from, to, options, finished: false };
            flights.push(flight);
            if (effectMode === "reject") return Promise.reject(new Error("Graphics device unavailable"));
            if (effectMode === "cancel") return Promise.resolve({ cancelled: true });
            return new Promise((resolve) => { flight.resolve = (result) => { flight.finished = true; resolve(result); }; });
        },
        cancel() { flights.filter((flight) => !flight.finished && flight.resolve).forEach((flight) => flight.resolve({ cancelled: true })); },
    };
    const context = vm.createContext({
        engine, game: bank.bridge.game, walletBridge: bank.bridge, effects,
        audio: { unlock() {}, setActive() {} },
        isTableActive: () => active,
        canDeal: () => bank.bridge.game.phase === engine.PHASES.BETTING && !context.isBusy(),
        cardNode: (id) => missingNode ? null : nodes.get(id),
        shoeOrigin: () => ({ left: 500, top: 20, width: 40, height: 56 }),
        elements: {
            shoe: { classList: { add: (name) => shoeClasses.add(name), remove: (...names) => names.forEach((name) => shoeClasses.delete(name)) } },
            dealerCards: { querySelector: () => missingNode ? null : hole },
        },
        render() { renders.push(bank.bridge.game.phase); },
        saveState() {}, playSound() {}, cancelChipDrag() {},
        syncWallet: () => bank.bridge.sync(),
        delay() {
            if (!controlledGaps) return Promise.resolve();
            return new Promise((resolve) => gaps.push(resolve));
        },
        resolveNaturalRound() { assert.fail("This fixture has no natural blackjack"); },
        runDealerTurn() {}, revealDealerCard() {}, completeRound() {},
        window: {
            setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
            clearTimeout(id) { timers.delete(id); },
        },
    });
    const names = ["createViewState", "commitAction", "cancelPresentation", "scheduleResume", "deliverCard", "initialDealSequence", "presentInitialDeal", "beginDeal", "resumeSavedGame", "syncPresentationActivity"];
    vm.runInContext(`
        let busy=false; let actionGeneration=0; let resumeTimer=0; let lastActive=true;
        let roundStartingBalance=0; const localAnimations=new Set(); let view;
        ${names.map(controllerFunction).join("\n")}
        view=createViewState();
        this.begin=beginDeal;
        this.deliver=deliverCard;
        this.present=presentInitialDeal;
        this.activity=syncPresentationActivity;
        this.isBusy=()=>busy;
        this.presentation=()=>view;
        this.token=()=>actionGeneration;
    `, context);
    return {
        ...bank, flights, gaps, timers, renders, shoeClasses,
        begin: context.begin, deliver: context.deliver, present: context.present,
        isBusy: context.isBusy, presentation: context.presentation,
        setActive(value) { active = value; context.activity(); },
        finishFlight(result = { cancelled: false }) {
            const flight = flights.find((item) => !item.finished && item.resolve);
            assert.ok(flight, "Expected one pending card flight");
            flight.resolve(result);
        },
        finishGap() { assert.ok(gaps.length); gaps.shift()(); },
        runResume() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
    };
}

test("beş yerin ilk dağıtımı her kart uçuşunu ve aradaki boşluğu sırayla bekler", async () => {
    const game = engine.createState({ balance: 20000 });
    for (let spot = 0; spot < 5; spot += 1) engine.setBet(game, 20, spot);
    const deal = engine.beginRound(game);
    const app = presentationHarness({ game, controlledGaps: true });
    const presentation = app.present(deal.sequence, 0);
    for (let index = 0; index < 12; index += 1) {
        assert.equal(app.flights.length, index + 1);
        assert.equal(app.flights[index].node.id, deal.sequence[index].hidden ? "dealer-hole" : deal.sequence[index].card.id);
        assert.equal(app.flights[index].options.flip, !deal.sequence[index].hidden);
        app.finishFlight();
        await flushPresentation();
        assert.equal(app.flights.length, index + 1, "The next card waits for the inter-card gap");
        app.finishGap();
        await flushPresentation();
    }
    assert.equal(await presentation, true);
    assert.equal(app.presentation().pendingCardIds.size, 0);
    assert.equal(app.presentation().inFlightCardId, null);
    assert.equal(app.shoeClasses.has("is-dealing"), false);
});

for (const effectMode of ["cancel", "reject"]) {
    test(`${effectMode} sonucu etkin ve güncel hamleyi kilitlemeden anlık gösterime döner`, async () => {
        const app = presentationHarness({ effectMode });
        await app.begin();
        assert.equal(app.bridge.game.phase, engine.PHASES.PLAYER_TURN);
        assert.equal(app.isBusy(), false);
        assert.equal(app.presentation().inFlightCardId, null);
        assert.equal(app.shoeClasses.has("is-dealing"), false);
        assert.equal(app.wallet.read("blackjack").balance, 900);
        assert.equal(app.flights.length, 4);
    });
}

test("DOM kart hedefi kaybolsa bile kayıtlı dağıtım tamamlanır ve kontroller açılır", async () => {
    const app = presentationHarness({ missingNode: true });
    await app.begin();
    assert.equal(app.bridge.game.phase, engine.PHASES.PLAYER_TURN);
    assert.equal(app.isBusy(), false);
    assert.equal(app.presentation().inFlightCardId, null);
    assert.equal(app.flights.length, 0);
    assert.equal(app.wallet.read("blackjack").balance, 900);
});

test("gizlenen dağıtım iptal edilir, dönüşte kanonik kartlar ek ücret olmadan tamamlanır", async () => {
    const app = presentationHarness();
    const initial = app.begin();
    await flushPresentation();
    assert.equal(app.flights.length, 1);
    assert.equal(app.wallet.read("blackjack").balance, 900);
    const savedCards = engine.serializeState(app.bridge.game).playerHands;
    app.finishFlight();
    await flushPresentation();
    assert.equal(app.flights.length, 2);
    app.setActive(false);
    await initial;
    assert.equal(app.isBusy(), false);
    assert.equal(app.bridge.game.phase, engine.PHASES.DEALING);
    assert.deepEqual(engine.serializeState(app.bridge.game).playerHands, savedCards);
    app.setActive(true);
    assert.equal(app.timers.size, 1);
    app.runResume();
    await flushPresentation();
    for (let index = 0; index < 4; index += 1) {
        app.finishFlight();
        await flushPresentation();
    }
    assert.equal(app.bridge.game.phase, engine.PHASES.PLAYER_TURN);
    assert.equal(app.isBusy(), false);
    assert.equal(app.wallet.read("blackjack").balance, 900);
    assert.deepEqual(engine.serializeState(app.bridge.game).playerHands, savedCards);
    assert.equal(app.presentation().pendingCardIds.size, 0);
});

test("başka oyunun harcaması geçersiz bahisleri temizlediğinde masadaki çipler de yeniden çizilir", async () => {
    const app = setup(fixture());
    const displayed = { bet: app.bridge.game.currentBet, spots: app.bridge.game.spotBets.slice() };
    let renders = 0;
    let controlOnlyRenders = 0;
    const context = vm.createContext({
        engine, game: app.bridge.game, walletBridge: app.bridge,
        render() {
            renders += 1;
            displayed.bet = app.bridge.game.currentBet;
            displayed.spots = app.bridge.game.spotBets.slice();
        },
        renderControls() { controlOnlyRenders += 1; },
        elements: { balance: { textContent: "" } },
        formatCredits: String,
        cancelPresentation() { assert.fail("A balance-only update must preserve the current presentation generation"); },
        scheduleResume() { assert.fail("Betting has no unfinished deal to resume"); },
    });
    vm.runInContext(`let actionGeneration=0; let busy=false; let view; let roundStartingBalance=0;
        ${controllerFunction("syncWallet")} this.sync=syncWallet;`, context);
    await otherSpend(app.wallet, -950);
    context.sync();
    assert.equal(app.bridge.game.currentBet, 0);
    assert.equal(displayed.bet, 0);
    assert.deepEqual(displayed.spots, [0, 0, 0, 0, 0]);
    assert.equal(renders, 1);
    assert.equal(controlOnlyRenders, 0);
    assert.equal(app.wallet.read("blackjack").balance, 50);
});

test("oynanmakta olan elde yalnızca ortak bakiye değişince kart uçuşları iptal edilmez", async () => {
    const game = fixture();
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    const app = setup(game);
    let fullRenders = 0;
    let controls = 0;
    const balance = { textContent: "" };
    const context = vm.createContext({
        engine, game: app.bridge.game, walletBridge: app.bridge,
        render() { fullRenders += 1; }, renderControls() { controls += 1; },
        elements: { balance }, formatCredits: (units) => String(units / engine.MONEY_SCALE),
        cancelPresentation() { assert.fail("Existing cards must remain in place"); },
        scheduleResume() { assert.fail("A balance update must not restart a deal"); },
    });
    vm.runInContext(`let actionGeneration=0; let busy=true; let view; let roundStartingBalance=0;
        ${controllerFunction("syncWallet")} this.sync=syncWallet; this.generation=()=>actionGeneration;`, context);
    await otherSpend(app.wallet, -100);
    context.sync();
    assert.equal(fullRenders, 0);
    assert.equal(controls, 1);
    assert.equal(balance.textContent, "800");
    assert.equal(context.generation(), 0);
    assert.equal(app.bridge.game.phase, engine.PHASES.PLAYER_TURN);
});

test("yerel animasyon oluşturulamazsa kayıtlı Dur hamlesi krupiye sırasına devam eder", async () => {
    const game = fixture();
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    const app = setup(game);
    let animationAttempts = 0;
    let dealerTurns = 0;
    const localAnimations = new Set();
    const node = {
        dataset: { handId: game.playerHands[0].id },
        animate() { animationAttempts += 1; throw new Error("Unsupported animation timeline"); },
    };
    const context = vm.createContext({
        engine, game: app.bridge.game, walletBridge: app.bridge, localAnimations,
        prefersReducedMotion: { matches: false },
        isTableActive: () => true, saveState() {}, render() {}, playSound() {},
        elements: { playerHands: { querySelectorAll: () => [node] } },
        runDealerTurn() { dealerTurns += 1; context.releaseBusy(); },
        scheduleResume() { assert.fail("A current successful action needs no replay"); },
    });
    vm.runInContext(`let busy=false; let actionGeneration=0;
        ${["commitAction", "animateNode", "takeStand"].map(controllerFunction).join("\n")}
        this.stand=takeStand; this.isBusy=()=>busy; this.releaseBusy=()=>{busy=false;};`, context);
    await assert.doesNotReject(() => context.stand());
    assert.equal(animationAttempts, 1);
    assert.equal(localAnimations.size, 0);
    assert.equal(dealerTurns, 1);
    assert.equal(context.isBusy(), false);
    assert.equal(app.bridge.game.phase, engine.PHASES.DEALER_TURN);
    assert.equal(app.bridge.game.playerHands[0].status, "standing");
    assert.equal(app.wallet.read("blackjack").snapshot.game.phase, engine.PHASES.DEALER_TURN);
    assert.equal(app.wallet.read("blackjack").balance, 900);
});

function chipPresentationHarness() {
    function element() {
        const classes = new Set();
        const strong = { textContent: "" };
        return {
            className: "", dataset: {}, textContent: "", children: [], attributes: {}, innerHTML: "",
            classList: { add: (value) => classes.add(value), contains: (value) => classes.has(value) },
            style: { setProperty() {} },
            append(child) { this.children.push(child); },
            replaceChildren(...children) { this.children = children; },
            setAttribute(name, value) { this.attributes[name] = value; },
            querySelector(selector) { assert.equal(selector, "strong"); return strong; },
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
        };
    }
    const chips = [10, 25, 50, 100, 500, 1000, 10000].map((value) => {
        const chip = element();
        chip.className = "blackjack-chip";
        chip.dataset.blackjackChip = String(value);
        chip.innerHTML = `<strong>${value}</strong>`;
        return chip;
    });
    const seats = Array.from({ length: engine.MAX_SPOTS }, (_, index) => {
        const target = element();
        const button = { dataset: { seat: String(index + 1) }, querySelector(selector) { assert.equal(selector, ".blackjack-seat-bet"); return target; } };
        return { button, target, bet: element() };
    });
    const flights = [];
    const context = vm.createContext({
        engine, document: { createElement: element }, elements: { chips, shoe: element() }, seats,
        formatCredits: (units) => String(units / engine.MONEY_SCALE),
        isTableActive: () => true, playSound() {},
        effects: { flyChip(node, from, to, options) {
            return new Promise((resolve) => flights.push({ node, from, to, options, resolve }));
        } },
    });
    vm.runInContext(`let view={settledSpotChips:new Set()}; let actionGeneration=0;
        ${["visualChip", "renderSpotChips", "chipRect", "presentPayouts"].map(controllerFunction).join("\n")}
        this.chip=visualChip; this.renderStake=renderSpotChips; this.payouts=presentPayouts;
        this.settled=()=>view.settledSpotChips; this.invalidate=()=>{actionGeneration+=1;};`, context);
    return { ...context, seats, flights };
}

test("görsel çip yığınları 150 ve 35 krediyi doğru kupürlerle gösterir; 5 kredi 10'a yuvarlanmaz", () => {
    const app = chipPresentationHarness();
    for (const [credits, expected] of [[150, [100, 50]], [35, [25, 10]], [5, [5]]]) {
        app.renderStake(app.seats[0].button, credits * engine.MONEY_SCALE);
        const [stack, amount] = app.seats[0].target.children;
        assert.deepEqual(stack.children.map((chip) => Number(chip.dataset.blackjackChip)), expected);
        assert.equal(amount.textContent, String(credits));
        assert.equal(stack.children.reduce((sum, chip) => sum + Number(chip.dataset.blackjackChip), 0), credits);
    }
    const small = app.chip(5);
    assert.equal(small.dataset.blackjackChip, "5");
    assert.equal(small.querySelector("strong").textContent, "5");
});

test("bölünmüş yerin çipleri son elin ödeme uçuşu tamamlanınca temizlenir", async () => {
    const app = chipPresentationHarness();
    app.renderStake(app.seats[0].button, 40);
    app.renderStake(app.seats[1].button, 20);
    const presentation = app.payouts([
        { spotIndex: 0, outcome: "lose", payout: 0, handBet: 20 },
        { spotIndex: 0, outcome: "win", payout: 40, handBet: 20 },
        { spotIndex: 1, outcome: "push", payout: 20, handBet: 20 },
    ], 0);
    assert.equal(app.flights.length, 1);
    assert.equal(app.settled().size, 0);
    app.flights[0].resolve();
    await flushPresentation();
    assert.equal(app.flights.length, 2);
    assert.equal(app.settled().has(0), false, "The first split hand cannot clear the remaining hand's stake");
    assert.ok(app.seats[0].target.children[0].children.length);
    app.flights[1].resolve();
    await flushPresentation();
    assert.equal(app.flights.length, 3);
    assert.equal(app.settled().has(0), false, "Incoming winnings still need to return to the tray");
    app.flights[2].resolve();
    await flushPresentation();
    assert.equal(app.flights.length, 4);
    assert.equal(app.settled().has(0), true);
    assert.equal(app.seats[0].target.children[0].children.length, 0);
    assert.equal(app.seats[0].target.children[1].textContent, "");
    assert.equal(app.settled().has(1), false);
    assert.ok(app.seats[1].target.children[0].children.length);
    app.flights[3].resolve();
    await presentation;
    assert.equal(app.settled().has(1), true);
    assert.equal(app.seats[1].target.children[0].children.length, 0);
    app.renderStake(app.seats[0].button, 40);
    assert.equal(app.seats[0].target.children[0].children.length, 0, "A later render cannot restore collected chips");
});

test("iptal edilmiş ödeme uçuşu yeni sunumun çiplerini temizlemez", async () => {
    const app = chipPresentationHarness();
    app.renderStake(app.seats[0].button, 20);
    const presentation = app.payouts([{ spotIndex: 0, outcome: "lose", payout: 0, handBet: 20 }], 0);
    app.invalidate();
    app.flights[0].resolve({ cancelled: true });
    await presentation;
    assert.equal(app.settled().size, 0);
    assert.ok(app.seats[0].target.children[0].children.length);
});

test("tamamlanmış tur geri yüklenince sonuçlanan yerlerin çipleri geri gelmez", () => {
    const game = fixture();
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    engine.stand(game);
    engine.dealerPlay(game);
    engine.resolveRound(game);
    const restored = engine.restoreState(engine.serializeState(game));
    assert.ok(restored);
    const context = vm.createContext({ engine, game: restored });
    vm.runInContext(`${controllerFunction("createViewState")} this.view=createViewState();`, context);
    assert.equal(restored.phase, engine.PHASES.ROUND_OVER);
    assert.deepEqual([...context.view.settledSpotChips], [...new Set(restored.playerHands.map((hand) => hand.spotIndex))]);
});

test("bekleyen kartın toplamı ve hamle mesajı kart masaya gelmeden açıklanmaz", () => {
    const game = fixture(["8", "6", "9", "10", "2"]);
    engine.beginRound(game);
    engine.afterInitialDeal(game);
    const result = engine.hit(game);
    assert.equal(game.phase, engine.PHASES.PLAYER_TURN);
    game.message = "Elin toplamı 19.";
    const title = { textContent: "" };
    const detail = { textContent: "" };
    const status = { className: "", querySelector: (selector) => selector === "strong" ? title : detail };
    const context = vm.createContext({
        engine, game, elements: { status },
        handText: (cards) => String(engine.calculateHand(cards).total),
    });
    vm.runInContext(`let busy=true; let view={pendingCardIds:new Set([${JSON.stringify(result.card.id)}]), inFlightCardId:null, playerVisible:new Map()};
        ${["getStatusPresentation", "renderStatus", "getActionKicker"].map(controllerFunction).join("\n")}
        this.status=renderStatus; this.kicker=getActionKicker;
        this.fly=()=>{view.pendingCardIds.clear();view.inFlightCardId=${JSON.stringify(result.card.id)};};
        this.arrive=()=>{view.inFlightCardId=null;busy=false;};`, context);
    context.status();
    assert.equal(title.textContent, "KART DAĞITILIYOR");
    assert.equal(detail.textContent, "Kartlar masaya geliyor…");
    assert.equal(context.kicker(), "KARTLAR DAĞITILIYOR");
    context.fly();
    context.status();
    assert.equal(title.textContent, "KART DAĞITILIYOR");
    assert.equal(detail.textContent, "Kartlar masaya geliyor…");
    assert.equal(context.kicker(), "1. YER · 17");
    context.arrive();
    context.status();
    assert.equal(title.textContent, "SIRA 1. YERDE");
    assert.equal(detail.textContent, "Elin toplamı 19.");
    assert.equal(context.kicker(), "1. YER · 19");
});
