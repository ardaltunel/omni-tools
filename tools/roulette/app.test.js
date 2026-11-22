"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const core = require("./core.js");
const layout = require("./layout.js");
const walletModule = require("../shared/game-wallet.js");
const flushWallet = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };

const appSource = fs.readFileSync(require.resolve("./app.js"), "utf8");

function readAppFunction(name) {
    const declaration = new RegExp(`^    (?:async )?function ${name}\\(`, "m").exec(appSource);
    assert.ok(declaration, `Missing application function ${name}`);
    const start = declaration.index;
    const next = /\n    (?:async )?function [A-Za-z_$]/u.exec(appSource.slice(start + 1));
    assert.ok(next, `Missing boundary after application function ${name}`);
    return appSource.slice(start, start + 1 + next.index);
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
        layout,
        document: { createElement: () => new Element() },
        get,
        app: get("app"),
        table: get("table"),
        chips: get("chips"),
        wagers: get("wagers"),
        denominations: [1, 5, 25, 50, 100, 500, 1000, 5000, 10000],
        colors: { red: "Kırmızı", black: "Siyah", green: "Yeşil" },
        format: new Intl.NumberFormat("tr-TR"),
        updateSoundControls() {},
        wheel: { setInteractive() {} },
        wallet: { canRefill: () => false },
        panel: { classList: { contains: () => true } },
    });
    const functions = ["buildTable", "chipLabel", "buildChips", "render", "renderWagers", "renderHistory", "highlightBet"]
        .map(readAppFunction).join("\n");
    vm.runInContext(`
        let state = core.createState();
        let walletBusy = false;
        let walletBalance = state.balance;
        let selectedChip = 25;
        let muted = true;
        let focusedBet = "straight:0";
        let currentLayout = layout.createLayout("landscape");
        ${functions}
        const tableButtons = buildTable();
        buildChips();
        this.renderGame = render;
        this.selectChip = (value) => { selectedChip = value; render(); };
        this.setGame = (next) => { state = next; walletBalance = state.balance; render(); };
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

function createInteractionHarness(initial = core.createState(), { chip = 25, sharedWallet = null, extraBalance = 0 } = {}) {
    const values = new Map([["omni-roulette-v1", JSON.stringify({ game: core.serializeState(initial), chip, muted: true, volume: 0.45 })]]);
    if (extraBalance) values.set("omni-slot-game-v1", JSON.stringify({ balance: extraBalance }));
    const storage = { getItem: (key) => values.get(key) ?? null, setItem(key, value) { values.set(key, value); writes += 1; } };
    const wallet = sharedWallet || walletModule.createWallet({ storage });
    let writes = 0;
    const spins = [];
    const finishes = [];
    const audioVolumes = [];
    const interactiveStates = [];
    const documentListeners = new Map();
    let wheelOptions;
    let panelMutation;
    const animationFrames = new Map();
    let nextFrame = 1;
    const elements = new Map();
    class Element {
        constructor(tagName = "div") {
            this.tagName = tagName;
            this.children = [];
            this.dataset = {};
            this.style = {};
            this.attributes = {};
            this.classes = new Set();
            this.listeners = new Map();
            this.captured = new Set();
            this.classList = {
                contains: (token) => this.classes.has(token),
                add: (...tokens) => tokens.forEach((token) => this.classes.add(token)),
                remove: (...tokens) => tokens.forEach((token) => this.classes.delete(token)),
                toggle: (token, force) => {
                    const include = force === undefined ? !this.classes.has(token) : Boolean(force);
                    if (include) this.classes.add(token);
                    else this.classes.delete(token);
                    return include;
                },
            };
        }
        get className() { return [...this.classes].join(" "); }
        set className(value) { this.classes = new Set(value.split(/\s+/u).filter(Boolean)); }
        append(...children) {
            children.forEach((child) => { child.parentElement = this; });
            this.children.push(...children);
        }
        replaceChildren(...children) {
            this.children.forEach((child) => { child.parentElement = null; });
            this.children = [];
            this.append(...children);
        }
        matches(selector) {
            if (selector.startsWith(".")) return this.classes.has(selector.slice(1));
            return selector === "span" ? this.tagName === "span"
                : selector === "button[data-action]" && this.tagName === "button" && this.dataset.action !== undefined;
        }
        querySelectorAll(selector) {
            return this.children.flatMap((child) => [
                ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
            ]);
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
        contains(element) { return this === element || this.children.some((child) => child.contains(element)); }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        removeAttribute(name) {
            delete this.attributes[name];
            if (name === "data-roulette-chip") delete this.dataset.rouletteChip;
        }
        addEventListener(name, listener) {
            if (!this.listeners.has(name)) this.listeners.set(name, []);
            this.listeners.get(name).push(listener);
        }
        dispatch(name, event = {}) {
            const payload = { target: this, currentTarget: this, preventDefault() {}, ...event };
            for (const listener of this.listeners.get(name) || []) listener(payload);
        }
        setPointerCapture(id) { this.captured.add(id); }
        hasPointerCapture(id) { return this.captured.has(id); }
        releasePointerCapture(id) { this.captured.delete(id); }
        cloneNode(deep) {
            const clone = new Element(this.tagName);
            clone.className = this.className;
            clone.dataset = { ...this.dataset };
            clone.attributes = { ...this.attributes };
            if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
            return clone;
        }
        remove() {
            if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
            this.parentElement = null;
        }
        focus() { document.activeElement = this; }
        blur() { document.activeElement = null; }
        getBoundingClientRect() {
            const height = 800 / layout.createLayout("landscape").aspectRatio;
            return { left: 40, top: 100, width: 800, height, right: 840, bottom: 100 + height };
        }
    }
    const get = (name) => {
        if (!elements.has(name)) elements.set(name, new Element());
        return elements.get(name);
    };
    const panel = get("panel");
    panel.classList.add("active");
    get("sound").append(new Element("span"));
    const volumeControl = new Element();
    volumeControl.className = "roulette-volume-control";
    volumeControl.append(get("volume"));
    const document = {
        body: get("body"),
        hidden: false,
        activeElement: null,
        getElementById: (id) => id === "roulette" ? panel : get(id.replace(/^roulette-/u, "")),
        createElement: (name) => new Element(name),
        addEventListener(name, callback) { documentListeners.set(name, callback); },
    };
    const audio = {
        unlock() {}, play() {}, startSpin() {}, stopSpin() {}, setMuted() {},
        setVolume(value) { audioVolumes.push(value); },
    };
    const context = vm.createContext({
        document,
        window: {
            OmniRouletteCore: { ...core, beginSpin: (game) => core.beginSpin(game, draw(7)) },
            OmniGameWallet: wallet,
            OmniRouletteLayout: layout,
            OmniRouletteWheel: { create: (_canvas, options) => { wheelOptions = options; return {
                cancel() {}, showResult() {},
                setInteractive(value) { interactiveStates.push(value); },
                spin(number) { spins.push(number); return new Promise((resolve) => finishes.push(resolve)); },
            }; } },
            OmniRouletteAudio: { create: () => audio },
            matchMedia: () => ({ matches: false }),
            addEventListener() {},
            innerHeight: 900,
        },
        ResizeObserver: class { observe() {} },
        MutationObserver: class { constructor(callback) { panelMutation = callback; } observe() {} },
        performance: { now: () => 0 },
        requestAnimationFrame(callback) {
            const id = nextFrame++;
            animationFrames.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) { animationFrames.delete(id); },
        localStorage: storage,
    });
    // Run the complete production initializer so these tests dispatch its actual listeners.
    vm.runInContext(appSource, context);
    writes = 0;
    return {
        wallet,
        flush: flushWallet,
        finishSpin: async (index = 0) => { finishes[index]({ number: spins[index] }); await flushWallet(); },
        get,
        spins,
        audioVolumes,
        interactiveStates,
        releaseWheel: () => wheelOptions.onRelease(),
        setHidden(value) { document.hidden = value; documentListeners.get("visibilitychange")(); },
        setActive(value) { panel.classList.toggle("active", value); panelMutation(); },
        pendingFrames: () => animationFrames.size,
        snapshot: () => wallet.read("roulette").snapshot,
        writes: () => writes,
        async updateStored(game, volume = 0.12) {
            const current = wallet.read("roulette");
            await wallet.commit("roulette", { revision: current.revision, delta: game.balance - current.balance, snapshot: { game: core.serializeState(game), chip: 25, muted: true, volume } });
            await flushWallet();
            writes = 0;
        },
        chip: (amount) => get("chips").children.find((button) => Number(button.dataset.rouletteChip) === amount),
        bet: (id) => get("table").children.find((button) => button.dataset.betId === id),
        point(id) {
            const geometry = layout.createLayout("landscape");
            const spot = geometry.spots.find((entry) => entry.id === id);
            const bounds = get("table").getBoundingClientRect();
            return { clientX: bounds.left + spot.x / geometry.width * bounds.width,
                clientY: bounds.top + spot.y / geometry.height * bounds.height };
        },
    };
}

test("winner highlighting stays stable across chip selections, zero results and spinning", async () => {
    const app = createRenderHarness();
    app.render();
    assert.equal(app.get("table").children.length, 157);
    assert.deepEqual(app.winners(), []);

    for (const chip of [1, 5, 25, 50, 100, 500, 1000, 5000, 10000, 5]) {
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

test("son sonuç sabit alanda kalır, yalnızca önceki sonuçlar kaydırılır", async () => {
    const app = createRenderHarness();
    app.render();
    assert.equal(app.get("history-row").hidden, true);
    assert.equal(app.get("empty-history").hidden, false);
    let game = core.settleSpin(core.beginSpin(core.addBet(core.createState(), "red", 1), draw(0))).state;
    app.setGame(game);
    assert.equal(app.get("history-row").hidden, false);
    assert.equal(app.get("history").hidden, true);
    assert.equal(app.get("history-newest").dataset.color, "green");
    assert.equal(app.get("history-newest").querySelector(".roulette-history-number").textContent, 0);
    assert.equal(app.get("empty-history").hidden, true);
    for (let number = 1; number < 20; number += 1) {
        game = core.settleSpin(core.beginSpin(core.addBet(game, "red", 1), draw(number))).state;
    }
    app.setGame(game);
    assert.equal(app.get("history-newest").querySelector(".roulette-history-number").textContent, 19);
    assert.equal(app.get("history").children.length, 19);
    assert.equal(app.get("history").children[0].querySelector(".roulette-history-number").textContent, 18);
    assert.equal(app.get("history").querySelectorAll(".roulette-history-latest").length, 0);
    assert.equal(app.get("history").hidden, false);
    app.get("history").scrollLeft = 140;
    app.selectChip(50);
    assert.equal(app.get("history").scrollLeft, 140);
    game = core.settleSpin(core.beginSpin(core.addBet(game, "red", 1), draw(20))).state;
    app.setGame(game);
    assert.equal(app.get("history").scrollLeft, 0);
    assert.equal(app.get("history-newest").querySelector(".roulette-history-number").textContent, 20);
    assert.equal(app.get("history").children[0].querySelector(".roulette-history-number").textContent, 19);
    app.setGame(core.createState());
    assert.equal(app.get("history-row").hidden, true);
    assert.equal(app.get("history-newest").children.length, 0);
    assert.equal(app.get("empty-history").hidden, false);
});

for (const pending of [false, true]) {
    test(`ses seviyesi değişikliği diğer sekmedeki yeni ${pending ? "bekleyen turu" : "bahisleri"} korur`, async () => {
        const app = createInteractionHarness();
        const bets = core.addBet(core.addBet(core.createState(), "red", 100), "straight:0", 50);
        const latest = pending ? core.beginSpin(bets, draw(17)) : bets;
        // The storage event has not arrived; the range input must synchronize the ledger itself.
        await app.updateStored(latest, 0.12);
        app.get("volume").value = "83";
        app.get("volume").dispatch("input");
    await app.flush();

        assert.deepEqual(app.snapshot().game, core.serializeState(latest));
        assert.equal(app.snapshot().volume, 0.83);
        assert.equal(app.get("volume").value, "83");
        assert.equal(app.get("volume-value").textContent, "%83");
        assert.equal(app.audioVolumes.at(-1), 0.83);
        assert.equal(app.writes(), 1);
        assert.equal(app.get("app").dataset.phase, pending ? "spinning" : "betting");
        assert.deepEqual(app.spins, pending ? [17] : []);
        assert.equal(app.bet("straight:0").querySelector(".roulette-stake-marker").textContent, "50");
    });
}

test("50 ve 1000 kredilik çipler fare ve klavye ile doğrudan kanonik bahse eklenir", async () => {
    const app = createInteractionHarness();
    app.get("chips").dispatch("click", { target: app.chip(50), detail: 1 });
    await app.flush();
    assert.equal(app.snapshot().chip, 50);
    assert.equal(app.chip(50).attributes["aria-pressed"], "true");
    // Pointer coordinates take precedence over the underlying straight-number button.
    app.get("table").dispatch("click", {
        target: app.bet("straight:1"), detail: 1, ...app.point("corner:1-2-4-5"),
    });
    await app.flush();
    assert.deepEqual(app.snapshot().game.bets, { "corner:1-2-4-5": 50 });
    assert.equal(app.bet("corner:1-2-4-5").tabIndex, 0);

    app.get("chips").dispatch("click", { target: app.chip(1000), detail: 0 });
    await app.flush();
    app.get("table").dispatch("click", { target: app.bet("split:0-2"), detail: 0 });
    await app.flush();
    assert.equal(app.snapshot().chip, 1000);
    assert.equal(app.chip(1000).attributes["aria-pressed"], "true");
    assert.deepEqual(app.snapshot().game.bets, { "corner:1-2-4-5": 50, "split:0-2": 1000 });
    assert.equal(app.bet("split:0-2").tabIndex, 0);
    assert.equal(app.bet("corner:1-2-4-5").tabIndex, -1);
    assert.equal(core.totalBet(core.restoreState(app.snapshot().game)), 1050);
});

test("fare ile köşeye sürüklenen çip tek bahis koyar ve son tıklama ikinci bahis koymaz", async () => {
    const app = createInteractionHarness();
    const chip = app.chip(1000);
    const point = app.point("corner:32-33-35-36");
    const pointer = { target: chip, pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 80, clientY: 550 });
    await app.flush();
    assert.equal(chip.hasPointerCapture(7), true);
    app.get("chips").dispatch("pointermove", { ...pointer, ...point });
    await app.flush();
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 1);
    assert.equal(app.bet("corner:32-33-35-36").classList.contains("is-target"), true);
    app.get("chips").dispatch("pointerup", { ...pointer, ...point });
    await app.flush();

    assert.deepEqual(app.snapshot().game.bets, { "corner:32-33-35-36": 1000 });
    assert.equal(app.snapshot().chip, 1000);
    assert.equal(chip.hasPointerCapture(7), false);
    assert.equal(chip.classList.contains("is-dragging"), false);
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(app.pendingFrames(), 0);
    const writes = app.writes();
    app.get("chips").dispatch("click", { target: chip, detail: 1 });
    await app.flush();
    assert.equal(app.writes(), writes);
    assert.deepEqual(app.snapshot().game.bets, { "corner:32-33-35-36": 1000 });
});

test("kredisi yetmeyen sürükleme önceki çip seçimini ve sonraki bahis tutarını korur", async () => {
    const app = createInteractionHarness(core.createState({ balance: 100 }));
    const chip = app.chip(1000);
    const point = app.point("corner:1-2-4-5");
    const pointer = { target: chip, pointerId: 9, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 80, clientY: 550 });
    await app.flush();
    app.get("chips").dispatch("pointermove", { ...pointer, ...point });
    await app.flush();
    app.get("chips").dispatch("pointerup", { ...pointer, ...point });
    await app.flush();

    assert.equal(app.chip(25).attributes["aria-pressed"], "true");
    assert.equal(app.chip(1000).attributes["aria-pressed"], "false");
    assert.equal(app.writes(), 0);
    app.get("table").dispatch("click", { target: app.bet("straight:17"), detail: 0 });
    await app.flush();
    assert.deepEqual(app.snapshot().game.bets, { "straight:17": 25 });
    assert.equal(app.snapshot().chip, 25);
});

test("1K, 5K ve 10K çipleri tam kredi tutarlarıyla oynanır ve kayıttan geri gelir", async () => {
    const app = createInteractionHarness(core.createState(), { chip: 10000 });
    assert.equal(app.chip(10000).attributes["aria-pressed"], "true");
    assert.deepEqual(app.get("chips").children.map((button) => button.textContent),
        ["1", "5", "25", "50", "100", "500", "1K", "5K", "10K"]);
    for (const amount of [1000, 5000, 10000]) {
        app.get("clear").dispatch("click");
    await app.flush();
        app.get("chips").dispatch("click", { target: app.chip(amount), detail: 0 });
    await app.flush();
        app.get("table").dispatch("click", { target: app.bet("straight:0"), detail: 0 });
    await app.flush();
        assert.deepEqual(app.snapshot().game.bets, { "straight:0": amount });
        assert.equal(app.snapshot().chip, amount);
        assert.equal(app.bet("straight:0").querySelector(".roulette-stake-marker").textContent, `${amount / 1000}K`);
    }
    app.get("table").dispatch("click", { target: app.bet("red"), detail: 0 });
    await app.flush();
    assert.deepEqual(app.snapshot().game.bets, { "straight:0": 10000 });
    assert.equal(app.get("balance").textContent, "10.000");
});

test("çark etkileşimi gizli araçta ve bahisli dönüş sırasında kapatılır", async () => {
    const app = createInteractionHarness();
    assert.equal(app.interactiveStates.at(-1), true);
    app.setHidden(true);
    assert.equal(app.interactiveStates.at(-1), false);
    app.setHidden(false);
    assert.equal(app.interactiveStates.at(-1), true);
    app.setActive(false);
    assert.equal(app.interactiveStates.at(-1), false);
    app.setActive(true);
    assert.equal(app.interactiveStates.at(-1), true);
    app.get("table").dispatch("click", { target: app.bet("red"), detail: 0 });
    await app.flush();
    app.get("spin").dispatch("click");
    await app.flush();
    assert.equal(app.interactiveStates.at(-1), false);
    assert.equal(app.get("app").dataset.phase, "spinning");
    assert.ok(app.get("chips").children.every((button) => button.disabled));
    app.setHidden(true);
    app.setHidden(false);
    assert.equal(app.interactiveStates.at(-1), false);
});

test("çarkı bırakmak mevcut bahsi tek kez başlatır ve bakiyeyi bir kez düşer", async () => {
    const app = createInteractionHarness();
    assert.equal(app.releaseWheel(), false);
    await app.flush();
    assert.equal(app.spins.length, 0);
    assert.equal(app.writes(), 0);
    app.get("table").dispatch("click", { target: app.bet("corner:1-2-4-5"), detail: 0 });
    await app.flush();
    assert.equal(app.releaseWheel(), true);
    await app.flush();
    const pending = app.snapshot().game;
    assert.equal(pending.phase, "spinning");
    assert.equal(pending.balance, 9975);
    assert.equal(pending.pending.stake, 25);
    assert.deepEqual(pending.pending.bets, { "corner:1-2-4-5": 25 });
    assert.equal(app.spins.length, 1);
    const writes = app.writes();
    assert.equal(app.releaseWheel(), false);
    await app.flush();
    assert.equal(app.spins.length, 1);
    assert.equal(app.writes(), writes);
    assert.deepEqual(app.snapshot().game, pending);
});

test("sürüklenen çip boyutunu, rengini ve tutulan noktayı koruyarak anında fareyi izler", async () => {
    const app = createInteractionHarness();
    const chip = app.chip(5000);
    chip.getBoundingClientRect = () => ({ left: 120, top: 650, width: 44, height: 44 });
    const pointer = { target: chip, pointerId: 17, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 130, clientY: 660 });
    await app.flush();
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 300, clientY: 400 });
    await app.flush();
    const ghost = app.get("body").querySelector(".roulette-chip-ghost");
    assert.ok(ghost, "the live chip is outside layout/query containers");
    assert.equal(app.get("app").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(ghost.dataset.rouletteChip, 5000);
    assert.equal(ghost.style.width, "44px");
    assert.equal(ghost.style.height, "44px");
    assert.equal(ghost.style.transform, "translate3d(290px, 390px, 0)");
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 310, clientY: 415 });
    await app.flush();
    assert.equal(ghost.style.transform, "translate3d(300px, 405px, 0)");
    app.get("chips").dispatch("pointercancel", pointer);
    await app.flush();
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(chip.hasPointerCapture(17), false);
    assert.equal(app.pendingFrames(), 0);
    assert.equal(app.writes(), 0);
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 130, clientY: 660 });
    await app.flush();
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 300, clientY: 400 });
    await app.flush();
    app.setHidden(true);
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(chip.hasPointerCapture(17), false);
    assert.equal(app.pendingFrames(), 0);
    assert.equal(app.writes(), 0);
});

async function spendElsewhere(wallet, delta) {
    const current = wallet.read("blackjack");
    const result = await wallet.commit("blackjack", {
        revision: current.revision, delta,
        snapshot: { game: { phase: "BETTING", balance: 0 } },
    });
    assert.equal(result.ok, true);
    await flushWallet();
}

test("ortak cüzdan kesirli krediyi korur; bahis ve ödeme ayrı ayrı yalnızca bir kez işlenir", async () => {
    const app = createInteractionHarness(core.createState(), { extraBalance: 0.5 });
    app.get("chips").dispatch("click", { target: app.chip(1000), detail: 0 });
    await app.flush();
    app.get("table").dispatch("click", { target: app.bet("straight:7"), detail: 0 });
    await app.flush();
    assert.equal(app.wallet.read("roulette").balance, 10000.5);
    assert.equal(app.releaseWheel(), true);
    assert.equal(app.releaseWheel(), false, "a pending wallet commit locks a second release");
    assert.equal(app.spins.length, 0, "animation waits for the durable debit and outcome");
    await app.flush();
    assert.equal(app.wallet.read("roulette").balance, 9000.5);
    assert.equal(app.snapshot().game.pending.number, 7);
    assert.equal(app.spins.length, 1);
    await spendElsewhere(app.wallet, -500);
    assert.equal(app.get("balance").textContent, "8.500,5");
    await app.finishSpin();
    assert.equal(app.wallet.read("roulette").balance, 44500.5);
    assert.equal(app.snapshot().game.pending, null);
    assert.equal(app.snapshot().game.history.length, 1);
    const revision = app.wallet.read("roulette").revision;
    await app.finishSpin();
    assert.equal(app.wallet.read("roulette").revision, revision);
    assert.equal(app.wallet.read("roulette").balance, 44500.5);
});

test("bekleyen tur yeniden yüklenir ve iki sekmenin bitişi ortak ödülü iki kez vermez", async () => {
    const first = createInteractionHarness();
    first.get("table").dispatch("click", { target: first.bet("straight:7"), detail: 0 });
    await first.flush();
    assert.equal(first.releaseWheel(), true);
    await first.flush();
    const pending = first.snapshot().game;
    const revision = first.wallet.read("roulette").revision;
    const reloaded = createInteractionHarness(core.createState(), { sharedWallet: first.wallet });
    assert.deepEqual(reloaded.snapshot().game, pending);
    assert.deepEqual(reloaded.spins, [7]);
    assert.equal(first.wallet.read("roulette").balance, 9975);
    await Promise.all([first.finishSpin(), reloaded.finishSpin()]);
    assert.equal(first.wallet.read("roulette").balance, 10875);
    assert.equal(first.wallet.read("roulette").revision, revision + 1);
    assert.equal(first.snapshot().game.history.length, 1);
    assert.equal(first.snapshot().game.history[0].number, 7);
    assert.equal(first.snapshot().game.pending, null);
});

test("başka oyun önce harcarsa yetersiz tur atomik reddedilir ve animasyon başlamaz", async () => {
    const app = createInteractionHarness(core.createState({ balance: 1000 }), { chip: 1000 });
    app.get("table").dispatch("click", { target: app.bet("straight:7"), detail: 0 });
    await app.flush();
    const other = app.wallet.read("blackjack");
    const competing = app.wallet.commit("blackjack", {
        revision: other.revision, delta: -900,
        snapshot: { game: { phase: "BETTING", balance: 0 } },
    });
    assert.equal(app.releaseWheel(), true);
    await competing;
    await app.flush();
    assert.equal(app.wallet.read("roulette").balance, 100);
    assert.equal(app.snapshot().game.pending, null);
    assert.equal(app.spins.length, 0);
    assert.equal(app.get("spin").disabled, true);
    assert.equal(app.bet("straight:7").querySelector(".roulette-stake-marker").hidden, true);
});

test("aynı tam sayıdaki kesir değişimi ve pasif araç tercihleri ortak parayı geri yazmaz", async () => {
    const app = createInteractionHarness(core.createState({ balance: 100 }), { extraBalance: 0.25 });
    assert.equal(app.get("balance").textContent, "100,25");
    const revision = app.wallet.read("roulette").revision;
    app.setActive(false);
    await spendElsewhere(app.wallet, 0.5);
    assert.equal(app.get("balance").textContent, "100,75");
    assert.equal(app.wallet.read("roulette").revision, revision, "external balance display does not save the inactive game");
    app.setActive(true);
    app.get("volume").value = "38";
    app.get("volume").dispatch("input");
    await app.flush();
    assert.equal(app.wallet.read("roulette").balance, 100.75);
    assert.equal(app.snapshot().game.balance, 100);
    assert.equal(app.snapshot().volume, 0.38);
});

test("dış harcama karşılanamayan bahisleri ve eski geri alma tutarlarını temizler", async () => {
    const app = createInteractionHarness(core.createState({ balance: 100 }));
    for (let index = 0; index < 2; index += 1) {
        app.get("table").dispatch("click", { target: app.bet("red"), detail: 0 });
        await app.flush();
    }
    await spendElsewhere(app.wallet, -90);
    assert.equal(app.get("spin").disabled, true);
    assert.equal(app.bet("red").querySelector(".roulette-stake-marker").hidden, true);
    await spendElsewhere(app.wallet, 90);
    app.get("undo").dispatch("click");
    await app.flush();
    assert.deepEqual(app.snapshot().game.bets, {});
    assert.ok(core.restoreState(app.snapshot().game));
    assert.equal(app.wallet.read("roulette").balance, 100);
});
