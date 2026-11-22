"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");
const { createController } = require("./app.js");

function seededCrypto(seed = 42) {
    return { getRandomValues(buffer) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; buffer[0] = seed; return buffer; } };
}

function fakeClock() {
    let id = 0;
    const tasks = new Map();
    return {
        tasks,
        setTimeout(callback) { const handle = ++id; tasks.set(handle, callback); return handle; },
        clearTimeout(handle) { tasks.delete(handle); },
        next() {
            const entry = tasks.entries().next().value;
            assert.ok(entry, "An AI callback should be scheduled");
            tasks.delete(entry[0]);
            entry[1]();
        },
    };
}

const settle = async () => { for (let turn = 0; turn < 5; turn += 1) await Promise.resolve(); };

function harness({ initial, controlledAnimations = false, brokenAnimations = false, blockedWrites = false, sharedStorage } = {}) {
    const random = seededCrypto();
    const clock = fakeClock();
    const animations = [];
    const renders = [];
    const endings = [];
    const choiceDifficulties = [];
    const preferenceCalls = [];
    let writes = 0;
    let choices = 0;
    let cancellations = 0;
    let visible = true;
    const storage = sharedStorage || {
        value: initial ? JSON.stringify({ game: core.serializeState(initial), muted: false, volume: 0.25 }) : null,
        getItem() { return this.value; },
        setItem(_key, value) { if (blockedWrites) throw new Error("Storage blocked"); this.value = value; writes += 1; },
    };
    const controller = createController({
        core: {
            ...core,
            createGame: (settings) => core.createGame(settings, random),
            nextRound: (state) => core.nextRound(state, random),
            chooseMove(...args) { choices += 1; choiceDifficulties.push(args[2]); return core.chooseMove(...args); },
        },
        clock,
        storage,
        isVisible: () => visible,
        render(game, ui) { renders.push({ game, ui }); },
        prepare(game) {
            assert.ok(game.hands.slice(1).every((hand) => hand === null));
            return { previousMove: game.moveNumber };
        },
        animate(before, game, context) {
            const persisted = storage.value && core.restoreState(JSON.parse(storage.value).game);
            if (!blockedWrites) {
                assert.equal(persisted.moveNumber, game.moveNumber);
                assert.equal(persisted.roundNumber, game.roundNumber);
            }
            assert.ok(game.hands.slice(1).every((hand) => hand === null));
            assert.equal("deck" in game, false);
            if (before) assert.equal(context.prepared.previousMove, before.moveNumber);
            if (brokenAnimations) return Promise.reject(new Error("Animation unavailable"));
            if (!controlledAnimations) return Promise.resolve();
            return new Promise((resolve) => animations.push({ resolve, game, context }));
        },
        cancelAnimations() { cancellations += 1; },
        onRoundEnd(game) { endings.push(game); },
        onPreferences(preferences) { preferenceCalls.push(preferences); },
    });
    return {
        controller, clock, storage, animations, renders, endings, choiceDifficulties, preferenceCalls,
        writes: () => writes,
        choices: () => choices,
        cancellations: () => cancellations,
        visible(value) { visible = value; },
        finish(index = animations.length - 1) { animations[index].resolve(); },
    };
}

test("ilk dağıtım ve insan hamlesi animasyondan önce kaydedilir, çift tıklama ikinci kartı oynatmaz", async () => {
    const app = harness({ controlledAnimations: true });
    app.controller.start();
    assert.equal(app.writes(), 1);
    assert.equal(app.controller.isBusy(), true);
    const initialRenders = app.renders.length;
    app.controller.setActive(true);
    assert.equal(app.renders.length, initialRenders, "Repeated visible events must not replace cards during a deal");
    assert.equal(app.renders.at(-1).game.table.filter((card) => card === null).length, 3);
    const cardId = app.controller.getView().hand[0].id;
    assert.equal(app.controller.play(cardId), false);
    app.finish(0);
    await settle();
    assert.equal(app.controller.play(cardId), true);
    assert.equal(app.controller.play(app.controller.getView().hand[0].id), false);
    assert.equal(app.writes(), 2);
    assert.equal(core.restoreState(JSON.parse(app.storage.value).game).moveNumber, 1);
    assert.equal(app.controller.getView().hand.length, 3);
    assert.equal(app.clock.tasks.size, 0);
    app.finish(1);
    await settle();
    assert.equal(app.clock.tasks.size, 1);
    app.controller.destroy();
});

test("rota ve görünürlük değişimleri AI zamanlayıcısını durdurur, eski callback yeni turu etkileyemez", async () => {
    const initial = core.createGame({ mode: "teams" }, seededCrypto(7));
    const app = harness({ initial, controlledAnimations: true });
    app.controller.start();
    app.controller.play(app.controller.getView().hand[0].id);
    app.finish();
    await settle();
    const stale = [...app.clock.tasks.values()][0];
    app.controller.setActive(false);
    assert.equal(app.clock.tasks.size, 0);
    stale();
    assert.equal(app.controller.getState().moveNumber, 1);
    assert.equal(app.choices(), 0);
    app.controller.setActive(true);
    app.controller.setActive(true);
    assert.equal(app.clock.tasks.size, 1);
    app.visible(false);
    app.clock.next();
    assert.equal(app.controller.getState().moveNumber, 1);
    app.visible(true);
    app.controller.setActive(true);
    app.clock.next();
    assert.equal(app.controller.getState().moveNumber, 2);
    assert.equal(app.choices(), 1);
    assert.equal(app.controller.isBusy(), true);
    app.controller.setActive(false);
    app.finish();
    await settle();
    assert.equal(app.clock.tasks.size, 0);
    app.controller.setActive(true);
    assert.equal(app.clock.tasks.size, 1);
    assert.equal(app.controller.getState().currentSeat, 2);
    app.controller.destroy();
});

test("yeni oyun eski dağıtım ve AI callbacklerini geçersiz kılar", async () => {
    const app = harness({ controlledAnimations: true });
    app.controller.start();
    const oldAnimation = app.animations[0];
    app.controller.newGame({ mode: "teams", difficulty: "hard", target: 51 });
    assert.equal(oldAnimation.context.isCurrent(), false);
    oldAnimation.resolve();
    await settle();
    assert.equal(app.controller.isBusy(), true);
    app.finish();
    await settle();
    app.controller.play(app.controller.getView().hand[0].id);
    app.finish();
    await settle();
    const oldAI = [...app.clock.tasks.values()][0];
    app.controller.newGame({ mode: "duel", difficulty: "easy", target: 101 });
    oldAI();
    app.finish();
    await settle();
    assert.equal(app.controller.getState().moveNumber, 0);
    assert.equal(app.controller.getState().mode, "duel");
    assert.equal(app.controller.getState().target, 101);
    assert.equal(app.clock.tasks.size, 0);
    assert.equal(app.choices(), 0);
    app.controller.destroy();
});

test("animasyon ortasında yeniden yükleme oynanmış kartı ikinci kez oynamaz veya tekrar dağıtmaz", async () => {
    const first = harness({ controlledAnimations: true });
    first.controller.start();
    first.finish();
    await settle();
    const played = first.controller.getView().hand[0].id;
    first.controller.play(played);
    const committed = first.controller.getState();
    first.controller.destroy();
    const second = harness({ sharedStorage: first.storage });
    second.controller.start();
    assert.deepEqual(second.controller.getState(), committed);
    assert.equal(second.controller.getState().hands[0].some((card) => card.id === played), false);
    assert.equal(second.clock.tasks.size, 1);
    second.clock.next();
    await settle();
    first.finish();
    await settle();
    assert.equal(second.controller.getState().moveNumber, 2);
    assert.equal(core.restoreState(JSON.parse(first.storage.value).game).moveNumber, 2);
    assert.equal(first.clock.tasks.size, 0);
    second.controller.destroy();
});

for (const mode of ["duel", "teams"]) {
    test(`${mode === "duel" ? "iki kişilik" : "eşli"} el 48 hamlede tek kez puanlanır ve sonraki el sıfırdan dağıtılır`, async () => {
        const initial = core.createGame({ mode, target: 151, difficulty: "hard" }, seededCrypto(19));
        const app = harness({ initial });
        app.controller.start();
        while (app.controller.getState().phase === "playing") {
            const state = app.controller.getState();
            if (state.currentSeat === 0) assert.equal(app.controller.play(core.chooseMove(state, 0)), true);
            else app.clock.next();
            await settle();
        }
        const ended = app.controller.getState();
        assert.equal(ended.moveNumber, 48);
        assert.equal(ended.captures.flat().length, 52);
        assert.equal(app.endings.length, 1);
        assert.equal(app.clock.tasks.size, 0);
        app.controller.setActive(false);
        app.controller.setActive(true);
        assert.equal(app.endings.length, 1);
        assert.equal(app.controller.nextRound(), true);
        assert.equal(app.controller.nextRound(), false);
        await settle();
        assert.equal(app.controller.getState().roundNumber, 2);
        assert.equal(app.controller.getState().moveNumber, 0);
        assert.deepEqual(app.controller.getState().scores, ended.scores);
        assert.equal(app.controller.getState().hands.every((hand) => hand.length === 4), true);
        assert.equal(app.controller.getState().difficulty, "medium");
        assert.ok(app.choiceDifficulties.length > 0);
        assert.ok(app.choiceDifficulties.every((difficulty) => difficulty === "medium"));
        assert.ok(core.restoreState(JSON.parse(app.storage.value).game));
        assert.equal(JSON.parse(app.storage.value).game.difficulty, "medium");
        app.clock.next();
        await settle();
        assert.equal(app.choiceDifficulties.at(-1), "medium");
        app.controller.destroy();
    });
}

test("animasyon veya depolama hatası oyunu kilitlemez ve ses tercihleri güvenle sınırlandırılır", async () => {
    const app = harness({ brokenAnimations: true, blockedWrites: true });
    app.controller.start();
    await settle();
    assert.equal(app.controller.isBusy(), false);
    assert.equal(app.controller.play(app.controller.getView().hand[0].id), true);
    await settle();
    assert.equal(app.controller.getState().moveNumber, 1);
    assert.equal(app.clock.tasks.size, 1);
    app.controller.setPreferences({ muted: true, volume: 5 });
    assert.deepEqual(app.controller.getPreferences(), { muted: true, volume: 1 });
    app.controller.setPreferences({ volume: NaN });
    assert.equal(app.controller.getPreferences().volume, 1);
    app.controller.destroy();
    assert.equal(app.clock.tasks.size, 0);
});

test("kaydedilmiş maç sonucu tekrar puanlanmaz ve yeni maç ses tercihini koruyarak sıfırlanır", async () => {
    let ended = core.createGame({ target: 1 }, seededCrypto(19));
    while (ended.phase === "playing") ended = core.playCard(ended, ended.currentSeat, core.chooseMove(ended, ended.currentSeat));
    assert.equal(ended.phase, "match-over");
    const app = harness({ initial: ended });
    app.controller.start();
    assert.deepEqual(app.controller.getState().scores, ended.scores);
    assert.equal(app.writes(), 0);
    assert.equal(app.endings.length, 1);
    assert.equal(app.clock.tasks.size, 0);
    assert.equal(app.controller.nextRound(), false);
    app.controller.setActive(false);
    app.controller.setActive(true);
    assert.equal(app.endings.length, 1);
    app.controller.setPreferences({ muted: true, volume: 0.1 });
    app.controller.newGame({ mode: "teams", target: 51, difficulty: "hard" });
    await settle();
    assert.deepEqual(app.controller.getState().scores, [0, 0]);
    assert.equal(app.controller.getState().roundNumber, 1);
    assert.equal(app.controller.getState().currentSeat, 0);
    assert.deepEqual(app.controller.getPreferences(), { muted: true, volume: 0.1 });
    assert.ok(core.restoreState(JSON.parse(app.storage.value).game));
    app.controller.destroy();
});

for (const difficulty of ["easy", "hard"]) {
    test(`eski ${difficulty} kaydı kartlar, puanlar ve sıra korunarak orta seviyeye taşınır`, () => {
        const random = seededCrypto(19);
        let progress = core.createGame({ mode: "teams", difficulty, target: 151 }, random);
        while (progress.phase === "playing") {
            progress = core.playCard(progress, progress.currentSeat, core.chooseMove(progress, progress.currentSeat));
        }
        assert.equal(progress.phase, "round-over");
        progress = core.nextRound(progress, random);
        progress = core.playCard(progress, progress.currentSeat, core.chooseMove(progress, progress.currentSeat));
        const original = core.serializeState(progress);
        assert.ok(original.scores.some((score) => score > 0));
        assert.ok(original.hands.some((hand) => hand.length !== 4));
        const expected = { ...original, difficulty: "medium" };
        const app = harness({ initial: progress });
        app.controller.start();

        assert.deepEqual(core.serializeState(app.controller.getState()), expected);
        assert.deepEqual(JSON.parse(app.storage.value).game, expected);
        assert.equal(app.writes(), 1);
        assert.equal(app.choices(), 0);
        assert.equal(app.clock.tasks.size, 1);
        assert.ok(core.restoreState(JSON.parse(app.storage.value).game));
        app.controller.destroy();
    });
}

test("yeni oyundaki kolay veya zor isteği modu ve hedefi koruyarak her zaman orta seviyeyi kullanır", async () => {
    const app = harness();
    app.controller.start();
    await settle();
    for (const [difficulty, mode, target] of [["hard", "teams", 51], ["easy", "duel", 101]]) {
        assert.equal(app.controller.newGame({ difficulty, mode, target }), true);
        await settle();
        const state = app.controller.getState();
        assert.equal(state.difficulty, "medium");
        assert.equal(state.mode, mode);
        assert.equal(state.target, target);
        assert.deepEqual(state.scores, [0, 0]);
        assert.equal(JSON.parse(app.storage.value).game.difficulty, "medium");
        assert.equal(app.controller.play(state.hands[0][0].id), true);
        await settle();
        app.clock.next();
        await settle();
        assert.equal(app.choiceDifficulties.at(-1), "medium");
    }
    assert.deepEqual(app.choiceDifficulties, ["medium", "medium"]);
    app.controller.destroy();
});

test("dağıtım sırasında ses değişikliği kartları yeniden çizmez ve bitişte güncel tercihler görünür", async () => {
    const app = harness({ controlledAnimations: true });
    app.controller.start();
    const renderCount = app.renders.length;
    const cancellationCount = app.cancellations();
    const snapshot = core.serializeState(app.controller.getState());
    const cardId = app.controller.getView().hand[0].id;
    app.controller.setPreferences({ muted: true, volume: 0.65 });

    assert.equal(app.renders.length, renderCount);
    assert.equal(app.cancellations(), cancellationCount);
    assert.equal(app.controller.isBusy(), true);
    assert.equal(app.controller.play(cardId), false);
    assert.equal(app.clock.tasks.size, 0);
    assert.deepEqual(app.preferenceCalls, [{ muted: true, volume: 0.65 }]);
    assert.deepEqual(JSON.parse(app.storage.value).game, snapshot);
    assert.equal(JSON.parse(app.storage.value).muted, true);
    assert.equal(JSON.parse(app.storage.value).volume, 0.65);

    app.finish();
    await settle();
    assert.equal(app.controller.isBusy(), false);
    assert.deepEqual(app.renders.at(-1).ui.preferences, { muted: true, volume: 0.65 });
    assert.equal(app.controller.play(cardId), true);
    app.controller.destroy();
});
