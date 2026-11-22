"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const core = require("./core.js");
const layout = require("./layout.js");

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
        audio: { startSpin() {}, stopSpin() {}, setVolume() {}, setMuted() {} },
        panel: { classList: { contains: () => true } },
        document: { hidden: false },
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
        let soundVolume = 0.45;
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
        panel: { classList: { contains: () => true } },
    });
    const functions = ["buildTable", "chipLabel", "buildChips", "render", "renderWagers", "renderHistory", "highlightBet"]
        .map(readAppFunction).join("\n");
    vm.runInContext(`
        let state = core.createState();
        let selectedChip = 25;
        let muted = true;
        let focusedBet = "straight:0";
        let currentLayout = layout.createLayout("landscape");
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

function createInteractionHarness(initial = core.createState(), { chip = 25 } = {}) {
    let saved = JSON.stringify({ game: core.serializeState(initial), chip, muted: true, volume: 0.45 });
    let writes = 0;
    const spins = [];
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
            OmniRouletteCore: core,
            OmniRouletteLayout: layout,
            OmniRouletteWheel: { create: (_canvas, options) => { wheelOptions = options; return {
                cancel() {}, showResult() {},
                setInteractive(value) { interactiveStates.push(value); },
                spin(number) { spins.push(number); return new Promise(() => {}); },
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
        localStorage: {
            getItem: () => saved,
            setItem(_key, value) { saved = value; writes += 1; },
        },
    });
    // Run the complete production initializer so these tests dispatch its actual listeners.
    vm.runInContext(appSource, context);
    return {
        get,
        spins,
        audioVolumes,
        interactiveStates,
        releaseWheel: () => wheelOptions.onRelease(),
        setHidden(value) { document.hidden = value; documentListeners.get("visibilitychange")(); },
        setActive(value) { panel.classList.toggle("active", value); panelMutation(); },
        pendingFrames: () => animationFrames.size,
        snapshot: () => JSON.parse(saved),
        writes: () => writes,
        updateStored(game, volume = 0.12) {
            saved = JSON.stringify({ game: core.serializeState(game), chip: 25, muted: true, volume });
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

test("winner highlighting stays stable across chip selections, zero results and spinning", () => {
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

for (const pending of [false, true]) {
    test(`ses seviyesi değişikliği diğer sekmedeki yeni ${pending ? "bekleyen turu" : "bahisleri"} korur`, () => {
        const app = createInteractionHarness();
        const bets = core.addBet(core.addBet(core.createState(), "red", 100), "straight:0", 50);
        const latest = pending ? core.beginSpin(bets, draw(17)) : bets;
        // The storage event has not arrived; the range input must synchronize the ledger itself.
        app.updateStored(latest, 0.12);
        app.get("volume").value = "83";
        app.get("volume").dispatch("input");

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

test("50 ve 1000 kredilik çipler fare ve klavye ile doğrudan kanonik bahse eklenir", () => {
    const app = createInteractionHarness();
    app.get("chips").dispatch("click", { target: app.chip(50), detail: 1 });
    assert.equal(app.snapshot().chip, 50);
    assert.equal(app.chip(50).attributes["aria-pressed"], "true");
    // Pointer coordinates take precedence over the underlying straight-number button.
    app.get("table").dispatch("click", {
        target: app.bet("straight:1"), detail: 1, ...app.point("corner:1-2-4-5"),
    });
    assert.deepEqual(app.snapshot().game.bets, { "corner:1-2-4-5": 50 });
    assert.equal(app.bet("corner:1-2-4-5").tabIndex, 0);

    app.get("chips").dispatch("click", { target: app.chip(1000), detail: 0 });
    app.get("table").dispatch("click", { target: app.bet("split:0-2"), detail: 0 });
    assert.equal(app.snapshot().chip, 1000);
    assert.equal(app.chip(1000).attributes["aria-pressed"], "true");
    assert.deepEqual(app.snapshot().game.bets, { "corner:1-2-4-5": 50, "split:0-2": 1000 });
    assert.equal(app.bet("split:0-2").tabIndex, 0);
    assert.equal(app.bet("corner:1-2-4-5").tabIndex, -1);
    assert.equal(core.totalBet(core.restoreState(app.snapshot().game)), 1050);
});

test("fare ile köşeye sürüklenen çip tek bahis koyar ve son tıklama ikinci bahis koymaz", () => {
    const app = createInteractionHarness();
    const chip = app.chip(1000);
    const point = app.point("corner:32-33-35-36");
    const pointer = { target: chip, pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 80, clientY: 550 });
    assert.equal(chip.hasPointerCapture(7), true);
    app.get("chips").dispatch("pointermove", { ...pointer, ...point });
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 1);
    assert.equal(app.bet("corner:32-33-35-36").classList.contains("is-target"), true);
    app.get("chips").dispatch("pointerup", { ...pointer, ...point });

    assert.deepEqual(app.snapshot().game.bets, { "corner:32-33-35-36": 1000 });
    assert.equal(app.snapshot().chip, 1000);
    assert.equal(chip.hasPointerCapture(7), false);
    assert.equal(chip.classList.contains("is-dragging"), false);
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(app.pendingFrames(), 0);
    const writes = app.writes();
    app.get("chips").dispatch("click", { target: chip, detail: 1 });
    assert.equal(app.writes(), writes);
    assert.deepEqual(app.snapshot().game.bets, { "corner:32-33-35-36": 1000 });
});

test("kredisi yetmeyen sürükleme önceki çip seçimini ve sonraki bahis tutarını korur", () => {
    const app = createInteractionHarness(core.createState({ balance: 100 }));
    const chip = app.chip(1000);
    const point = app.point("corner:1-2-4-5");
    const pointer = { target: chip, pointerId: 9, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 80, clientY: 550 });
    app.get("chips").dispatch("pointermove", { ...pointer, ...point });
    app.get("chips").dispatch("pointerup", { ...pointer, ...point });

    assert.equal(app.chip(25).attributes["aria-pressed"], "true");
    assert.equal(app.chip(1000).attributes["aria-pressed"], "false");
    assert.equal(app.writes(), 0);
    app.get("table").dispatch("click", { target: app.bet("straight:17"), detail: 0 });
    assert.deepEqual(app.snapshot().game.bets, { "straight:17": 25 });
    assert.equal(app.snapshot().chip, 25);
});

test("1K, 5K ve 10K çipleri tam kredi tutarlarıyla oynanır ve kayıttan geri gelir", () => {
    const app = createInteractionHarness(core.createState(), { chip: 10000 });
    assert.equal(app.chip(10000).attributes["aria-pressed"], "true");
    assert.deepEqual(app.get("chips").children.map((button) => button.textContent),
        ["1", "5", "25", "50", "100", "500", "1K", "5K", "10K"]);
    for (const amount of [1000, 5000, 10000]) {
        app.get("clear").dispatch("click");
        app.get("chips").dispatch("click", { target: app.chip(amount), detail: 0 });
        app.get("table").dispatch("click", { target: app.bet("straight:0"), detail: 0 });
        assert.deepEqual(app.snapshot().game.bets, { "straight:0": amount });
        assert.equal(app.snapshot().chip, amount);
        assert.equal(app.bet("straight:0").querySelector(".roulette-stake-marker").textContent, `${amount / 1000}K`);
    }
    app.get("table").dispatch("click", { target: app.bet("red"), detail: 0 });
    assert.deepEqual(app.snapshot().game.bets, { "straight:0": 10000 });
    assert.equal(app.get("balance").textContent, "10.000");
});

test("çark etkileşimi gizli araçta ve bahisli dönüş sırasında kapatılır", () => {
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
    app.get("spin").dispatch("click");
    assert.equal(app.interactiveStates.at(-1), false);
    assert.equal(app.get("app").dataset.phase, "spinning");
    assert.ok(app.get("chips").children.every((button) => button.disabled));
    app.setHidden(true);
    app.setHidden(false);
    assert.equal(app.interactiveStates.at(-1), false);
});

test("çarkı bırakmak mevcut bahsi tek kez başlatır ve bakiyeyi bir kez düşer", () => {
    const app = createInteractionHarness();
    assert.equal(app.releaseWheel(), false);
    assert.equal(app.spins.length, 0);
    assert.equal(app.writes(), 0);
    app.get("table").dispatch("click", { target: app.bet("corner:1-2-4-5"), detail: 0 });
    assert.equal(app.releaseWheel(), true);
    const pending = app.snapshot().game;
    assert.equal(pending.phase, "spinning");
    assert.equal(pending.balance, 9975);
    assert.equal(pending.pending.stake, 25);
    assert.deepEqual(pending.pending.bets, { "corner:1-2-4-5": 25 });
    assert.equal(app.spins.length, 1);
    const writes = app.writes();
    assert.equal(app.releaseWheel(), false);
    assert.equal(app.spins.length, 1);
    assert.equal(app.writes(), writes);
    assert.deepEqual(app.snapshot().game, pending);
});

test("sürüklenen çip boyutunu, rengini ve tutulan noktayı koruyarak anında fareyi izler", () => {
    const app = createInteractionHarness();
    const chip = app.chip(5000);
    chip.getBoundingClientRect = () => ({ left: 120, top: 650, width: 44, height: 44 });
    const pointer = { target: chip, pointerId: 17, pointerType: "mouse", isPrimary: true, button: 0 };
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 130, clientY: 660 });
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 300, clientY: 400 });
    const ghost = app.get("body").querySelector(".roulette-chip-ghost");
    assert.ok(ghost, "the live chip is outside layout/query containers");
    assert.equal(app.get("app").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(ghost.dataset.rouletteChip, 5000);
    assert.equal(ghost.style.width, "44px");
    assert.equal(ghost.style.height, "44px");
    assert.equal(ghost.style.transform, "translate3d(290px, 390px, 0)");
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 310, clientY: 415 });
    assert.equal(ghost.style.transform, "translate3d(300px, 405px, 0)");
    app.get("chips").dispatch("pointercancel", pointer);
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(chip.hasPointerCapture(17), false);
    assert.equal(app.pendingFrames(), 0);
    assert.equal(app.writes(), 0);
    app.get("chips").dispatch("pointerdown", { ...pointer, clientX: 130, clientY: 660 });
    app.get("chips").dispatch("pointermove", { ...pointer, clientX: 300, clientY: 400 });
    app.setHidden(true);
    assert.equal(app.get("body").querySelectorAll(".roulette-chip-ghost").length, 0);
    assert.equal(chip.hasPointerCapture(17), false);
    assert.equal(app.pendingFrames(), 0);
    assert.equal(app.writes(), 0);
});
