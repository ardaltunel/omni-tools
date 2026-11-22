"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const wheel = require("./wheel.js");
const core = require("./core.js");
const TAU = 2 * Math.PI;
const distance = (first, second) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

test("all 37 outcomes finish with the ball centered in the exact numbered pocket", () => {
    for (const number of core.WHEEL_ORDER) {
        for (const start of [0, 0.3, 4.8, -12.2, 79.1]) {
            const plan = wheel.createSpinTimeline(number, { wheelAngle: start, ballAngle: start * 2, ballRadius: 0.615 });
            const result = wheel.sampleSpin(plan, plan.durationMs);
            const pocket = result.wheelAngle + wheel.TOP + core.WHEEL_ORDER.indexOf(number) * wheel.STEP;
            assert.equal(result.number, number);
            assert.equal(result.index, core.WHEEL_ORDER.indexOf(number));
            assert.equal(result.phase, "settled");
            assert.equal(result.ballRadius, 0.615);
            assert.ok(distance(result.ballAngle, pocket) < 1e-10, `Ball must match pocket ${number}`);
            assert.ok(distance(pocket, wheel.TOP) < 1e-10, `Pocket ${number} must face the landing reference`);
        }
    }
});

test("wheel decelerates forward while the ball initially circles in the opposite direction", () => {
    const plan = wheel.createSpinTimeline(24, { ballAngle: 0 });
    let previous = wheel.sampleSpin(plan, 0);
    let previousStep = Infinity;
    for (let index = 1; index <= 100; index += 1) {
        const current = wheel.sampleSpin(plan, plan.durationMs * index / 100);
        const step = current.wheelAngle - previous.wheelAngle;
        assert.ok(step >= 0 && step <= previousStep + 1e-10);
        if (index <= 59) assert.ok(current.ballAngle < previous.ballAngle);
        assert.ok(Number.isFinite(current.ballRadius) && Number.isFinite(current.ballHeight));
        previousStep = step;
        previous = current;
    }
});

test("the drop is continuous and the captured ball stays inside its target pocket", () => {
    for (const number of core.WHEEL_ORDER) {
        const plan = wheel.createSpinTimeline(number, { wheelAngle: 3.1, ballAngle: 5.3 });
        const before = wheel.sampleSpin(plan, plan.durationMs * (0.82 - 1e-8));
        const after = wheel.sampleSpin(plan, plan.durationMs * (0.82 + 1e-8));
        assert.ok(Math.abs(before.ballAngle - after.ballAngle) < 1e-5);
        assert.ok(Math.abs(before.ballRadius - after.ballRadius) < 1e-5);
        for (let index = 82; index <= 100; index += 1) {
            const sample = wheel.sampleSpin(plan, plan.durationMs * index / 100);
            assert.ok(distance(sample.ballAngle, sample.wheelAngle + wheel.TOP + sample.index * wheel.STEP) < wheel.STEP / 2);
        }
    }
});

test("timeline rejects invalid targets and duration, and samples are deterministic and clamped", () => {
    for (const number of [-1, 37, 1.5, "17", null, NaN]) assert.throws(() => wheel.createSpinTimeline(number), RangeError);
    for (const durationMs of [0, -1, NaN, Infinity]) assert.throws(() => wheel.createSpinTimeline(0, { durationMs }), RangeError);
    const plan = wheel.createSpinTimeline(0);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(wheel.sampleSpin(plan, -100).progress, 0);
    assert.deepEqual(wheel.sampleSpin(plan, 2300), wheel.sampleSpin(plan, 2300));
    assert.deepEqual(wheel.sampleSpin(plan, plan.durationMs + 100), wheel.sampleSpin(plan, plan.durationMs));
});

function mockCanvas() {
    const frames = new Map();
    const listeners = new Map();
    const attributes = new Map();
    const observers = [];
    const canvasListeners = new Map();
    const documentListeners = new Map();
    const motionListeners = new Map();
    const captured = new Set();
    const motion = {
        matches: false,
        addEventListener(name, handler) { motionListeners.set(name, handler); },
        removeEventListener(name) { motionListeners.delete(name); },
    };
    let frameId = 0;
    let time = 0;
    let bounds = { left: 30, top: 50, width: 440, height: 390 };
    const context = new Proxy({}, {
        get(_target, name) {
            if (name === "createRadialGradient" || name === "createLinearGradient") return () => ({ addColorStop() {} });
            return () => {};
        },
    });
    const view = {
        devicePixelRatio: 2,
        performance: { now: () => time },
        matchMedia: () => motion,
        requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        addEventListener(name, handler) { listeners.set(name, handler); },
        removeEventListener(name) { listeners.delete(name); },
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        },
    };
    const document = {
        hidden: false,
        defaultView: view,
        createElement() { return { getContext: () => context }; },
        addEventListener(name, handler) { documentListeners.set(name, handler); },
        removeEventListener(name) { documentListeners.delete(name); },
    };
    const canvas = {
        dataset: {},
        ownerDocument: document,
        getContext: () => context,
        getBoundingClientRect: () => bounds,
        setAttribute(name, value) { attributes.set(name, value); },
        addEventListener(name, handler) { canvasListeners.set(name, handler); },
        removeEventListener(name) { canvasListeners.delete(name); },
        setPointerCapture(id) { captured.add(id); },
        hasPointerCapture(id) { return captured.has(id); },
        releasePointerCapture(id) {
            captured.delete(id);
            canvasListeners.get("lostpointercapture")?.({ pointerId: id });
        },
        focus() {},
    };
    function dispatch(name, event = {}) {
        canvasListeners.get(name)?.({ preventDefault() {}, ...event });
    }
    return {
        canvas, frames, listeners, attributes, observers, captured, canvasListeners, documentListeners, motionListeners,
        dispatch,
        pointer(name, angle, options = {}) {
            if (options.time !== undefined) time = options.time;
            const radius = Math.min(bounds.width * 0.475, bounds.height * 0.54) * (options.radius ?? 0.7);
            dispatch(name, {
                isPrimary: true, button: 0, pointerId: 1,
                clientX: bounds.left + bounds.width / 2 + Math.cos(angle) * radius,
                clientY: bounds.top + bounds.height * 0.46 + Math.sin(angle) * radius * 0.79,
                ...options,
            });
        },
        resize(width, height) { bounds = { ...bounds, width, height }; observers[0].callback(); },
        tick(timestamp) {
            time = timestamp;
            for (const [id, callback] of [...frames]) { frames.delete(id); callback(timestamp); }
        },
        hide(hidden = true) { document.hidden = hidden; documentListeners.get("visibilitychange")?.(); },
        reducedMotion(matches) { motion.matches = matches; motionListeners.get("change")?.(); },
    };
}

test("canvas spin resolves its generated target and restores all 37 results without animation", async () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    assert.equal(mock.canvas.width, 880);
    assert.equal(mock.canvas.height, 780);
    const pending = renderer.spin(17, { onTick() { throw new Error("Unavailable sound"); } });
    mock.tick(100);
    mock.tick(100 + wheel.DEFAULT_DURATION);
    const result = await pending;
    assert.equal(result.number, 17);
    assert.equal(result.phase, "settled");
    assert.equal(mock.attributes.get("aria-label"), "Rulet çarkı, sonuç 17");
    for (const number of core.WHEEL_ORDER) {
        const restored = renderer.showResult(number);
        assert.equal(restored.number, number);
        assert.ok(distance(restored.ballAngle, restored.wheelAngle + wheel.TOP + restored.index * wheel.STEP) < 1e-10);
    }
    const reduced = await renderer.spin(0, { reducedMotion: true });
    assert.equal(reduced.number, 0);
    assert.equal(reduced.phase, "settled");
    assert.equal(mock.frames.size, 0);
    mock.resize(320, 280);
    assert.equal(mock.canvas.width, 640);
    assert.equal(mock.canvas.height, 560);
    renderer.destroy();
});

test("cancellation, replacement spin and destruction release animation and resize callbacks", async () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    const first = renderer.spin(8);
    mock.tick(10);
    mock.tick(800);
    const next = renderer.spin(32);
    assert.equal((await first).cancelled, true);
    mock.tick(1000);
    mock.tick(1000 + wheel.DEFAULT_DURATION);
    assert.equal((await next).number, 32);
    const stopped = renderer.spin(4);
    renderer.cancel();
    assert.equal((await stopped).cancelled, true);
    assert.equal(mock.frames.size, 0);
    renderer.destroy();
    assert.equal(mock.observers[0].disconnected, true);
    assert.equal(mock.listeners.size, 0);
    await assert.rejects(renderer.spin(0));
});

test("ters yöndeki 37 dönüş de doğru cebe iner ve yakalama anında kesintisizdir", () => {
    for (const number of core.WHEEL_ORDER) {
        const plan = wheel.createSpinTimeline(number, { wheelAngle: 4.9, ballAngle: 1.7, direction: -1 });
        const first = wheel.sampleSpin(plan, 0);
        const moving = wheel.sampleSpin(plan, 100);
        assert.ok(moving.wheelAngle < first.wheelAngle);
        assert.ok(moving.ballAngle > first.ballAngle);
        const before = wheel.sampleSpin(plan, plan.durationMs * (0.82 - 1e-8));
        const after = wheel.sampleSpin(plan, plan.durationMs * (0.82 + 1e-8));
        assert.ok(Math.abs(after.ballAngle - before.ballAngle) < 1e-5);
        const final = wheel.sampleSpin(plan, plan.durationMs);
        assert.equal(final.number, number);
        assert.ok(distance(final.ballAngle, final.wheelAngle + wheel.TOP + final.index * wheel.STEP) < 1e-10);
        assert.ok(distance(final.ballAngle, wheel.TOP) < 1e-10);
    }
    assert.throws(() => wheel.createSpinTimeline(0, { direction: 0 }), RangeError);
});

test("yakalanan işaretçi elips eğimini düzeltir ve açı sınırını iki yönde kısa yoldan geçer", () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    assert.equal(mock.canvas.dataset.interactive, "true");
    mock.pointer("pointerdown", 0, { time: 0 });
    assert.equal(mock.captured.has(1), true);
    assert.equal(mock.canvas.dataset.interaction, "dragging");
    mock.pointer("pointermove", 0.7, { time: 16 });
    assert.ok(distance(renderer.getState().wheelAngle, 0.7) < 1e-10);
    assert.equal(mock.frames.size, 0);
    mock.pointer("pointercancel", 0.7);

    for (const [from, to, delta] of [[170, -170, 20], [-170, 170, -20]]) {
        const start = renderer.getState().wheelAngle;
        mock.pointer("pointerdown", from * Math.PI / 180, { time: 100 });
        mock.pointer("pointermove", to * Math.PI / 180, { time: 116 });
        assert.ok(distance(renderer.getState().wheelAngle, start + delta * Math.PI / 180) < 1e-10);
        mock.pointer("pointercancel", to * Math.PI / 180);
    }
    assert.equal(mock.captured.size, 0);
    assert.equal(mock.canvas.dataset.interaction, "idle");
    renderer.destroy();
});

test("merkez, çark dışından başlama ve başka işaretçiler açı sıçraması oluşturmaz", () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    for (const options of [{ radius: 1.1 }, { button: 2 }, { isPrimary: false }]) {
        mock.pointer("pointerdown", 0, options);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        assert.equal(mock.captured.size, 0);
    }
    mock.pointer("pointerdown", 0, { time: 0 });
    mock.pointer("pointermove", 2, { time: 16, pointerId: 2 });
    assert.equal(renderer.getState().wheelAngle, 0);
    mock.pointer("pointermove", 1, { time: 20, radius: 0.05 });
    mock.pointer("pointermove", 2, { time: 30 });
    assert.equal(renderer.getState().wheelAngle, 0);
    mock.pointer("pointermove", 2.2, { time: 46 });
    assert.ok(distance(renderer.getState().wheelAngle, 0.2) < 1e-10);
    mock.pointer("pointermove", 2.5, { time: 50, radius: 1.1 });
    assert.ok(distance(renderer.getState().wheelAngle, 0.5) < 1e-10);
    mock.pointer("pointermove", 2.7, { time: 60 });
    assert.ok(distance(renderer.getState().wheelAngle, 0.7) < 1e-10);
    renderer.cancel();
    assert.equal(mock.frames.size, 0);
    renderer.destroy();
});

test("bırakma ataleti kare hızından bağımsız yavaşlar, hızı sınırlıdır ve sonunda RAF bırakmaz", () => {
    function coastAtRate(rate) {
        const mock = mockCanvas();
        const renderer = wheel.create(mock.canvas);
        mock.pointer("pointerdown", 0, { time: 0 });
        mock.pointer("pointermove", 0.8, { time: 16 });
        mock.pointer("pointerup", 0.8, { time: 16 });
        assert.equal(mock.canvas.dataset.interaction, "coasting");
        assert.equal(mock.captured.size, 0);
        const start = renderer.getState().wheelAngle;
        for (let frame = 1; frame <= rate; frame += 1) mock.tick(16 + frame * 1000 / rate);
        const afterSecond = renderer.getState().wheelAngle;
        assert.ok(afterSecond > start);
        assert.ok(afterSecond - start < 9 / 3.2);
        mock.tick(5016);
        assert.equal(mock.frames.size, 0);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        const final = renderer.getState();
        mock.tick(20000);
        assert.deepEqual(renderer.getState(), final);
        renderer.destroy();
        return afterSecond;
    }
    assert.ok(distance(coastAtRate(30), coastAtRate(120)) < 1e-10);

    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    mock.pointer("pointerdown", 0, { time: 0 });
    mock.pointer("pointermove", 2.9, { time: 1 });
    mock.pointer("pointerup", 2.9, { time: 1 });
    const start = renderer.getState().wheelAngle;
    mock.tick(1001);
    // A one-millisecond sample cannot create an unbounded release velocity.
    assert.ok(distance(renderer.getState().wheelAngle, start) < 0.1);
    renderer.cancel();
    mock.pointer("pointerdown", 0, { time: 2000 });
    mock.pointer("pointermove", 0.7, { time: 2016 });
    mock.pointer("pointerup", 0.7, { time: 2200 });
    assert.equal(mock.canvas.dataset.interaction, "idle");
    assert.equal(mock.frames.size, 0);
    renderer.destroy();
});

test("elle ters çevrilen çark resmi dönüşte aynı yönü sürdürür ve 37 sonucu da değiştirmez", async () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    let time = 0;
    for (const number of core.WHEEL_ORDER) {
        renderer.showResult(number);
        const settled = renderer.getState();
        mock.pointer("pointerdown", 0.8, { time });
        mock.pointer("pointermove", 0.1, { time: time + 16 });
        let manual = renderer.getState();
        assert.ok(distance(manual.ballAngle, manual.wheelAngle + wheel.TOP + manual.index * wheel.STEP) < 1e-10);
        assert.ok(distance(manual.ballAngle, settled.ballAngle - 0.7) < 1e-10);
        mock.pointer("pointerup", 0.1, { time: time + 16 });
        mock.tick(time + 116);
        manual = renderer.getState();
        assert.ok(distance(manual.ballAngle, manual.wheelAngle + wheel.TOP + manual.index * wheel.STEP) < 1e-10);

        const pending = renderer.spin(number);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        assert.equal(mock.canvas.dataset.interactive, "false");
        assert.equal(mock.frames.size, 1);
        mock.pointer("pointerdown", 1, { time: time + 120 });
        assert.equal(mock.captured.size, 0);
        mock.tick(time + 121);
        const start = renderer.getState();
        mock.tick(time + 221);
        assert.ok(renderer.getState().wheelAngle < start.wheelAngle);
        assert.ok(renderer.getState().ballAngle > start.ballAngle);
        mock.tick(time + 121 + wheel.DEFAULT_DURATION);
        const final = await pending;
        assert.equal(final.number, number);
        assert.ok(distance(final.ballAngle, final.wheelAngle + wheel.TOP + final.index * wheel.STEP) < 1e-10);
        assert.equal(mock.frames.size, 0);
        assert.equal(mock.canvas.dataset.interactive, "true");
        time += 8000;
    }
    renderer.destroy();
});

test("iptal, odak kaybı, gizlenme ve rota kapanışı yakalamayı ve ataleti temizler", () => {
    for (const stage of ["dragging", "coasting"]) {
        for (const reason of ["cancel", "blur", "hidden", "route", "restore", "destroy"]) {
            const mock = mockCanvas();
            const renderer = wheel.create(mock.canvas);
            mock.pointer("pointerdown", 0, { time: 0 });
            mock.pointer("pointermove", 0.8, { time: 16 });
            if (stage === "coasting") mock.pointer("pointerup", 0.8, { time: 16 });
            assert.equal(mock.canvas.dataset.interaction, stage);
            const staleFrame = [...mock.frames.values()][0];
            if (reason === "cancel") renderer.cancel();
            if (reason === "blur") mock.listeners.get("blur")();
            if (reason === "hidden") mock.hide();
            if (reason === "route") renderer.setInteractive(false);
            if (reason === "restore") renderer.showResult(0);
            if (reason === "destroy") renderer.destroy();
            assert.equal(mock.captured.size, 0, `${stage}: ${reason}`);
            assert.equal(mock.frames.size, 0, `${stage}: ${reason}`);
            assert.equal(mock.canvas.dataset.interaction, "idle");
            const stopped = renderer.getState();
            staleFrame?.(1000);
            assert.deepEqual(renderer.getState(), stopped);
            if (reason === "destroy") {
                assert.equal(mock.canvasListeners.size, 0);
                assert.equal(mock.documentListeners.size, 0);
                assert.equal(mock.motionListeners.size, 0);
                assert.equal(mock.listeners.size, 0);
                renderer.setInteractive(true);
                assert.equal(mock.canvas.dataset.interactive, "false");
            } else {
                mock.hide(false);
                renderer.setInteractive(true);
                mock.pointer("pointerdown", 0, { time: 2000 });
                assert.equal(mock.canvas.dataset.interaction, "dragging");
                renderer.destroy();
            }
        }
    }
    for (const name of ["pointercancel", "lostpointercapture"]) {
        const mock = mockCanvas();
        const renderer = wheel.create(mock.canvas);
        mock.pointer("pointerdown", 0);
        mock.pointer("pointermove", 1, { time: 16 });
        mock.pointer(name, 1);
        assert.equal(mock.captured.size, 0);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        assert.equal(mock.frames.size, 0);
        renderer.destroy();
    }
});

test("boyut değişimi yakalanan sürüklemeyi bırakır ve resmi dönüş aktif sürüklemeyi devralır", async () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    mock.pointer("pointerdown", 0, { time: 0 });
    mock.pointer("pointermove", 0.5, { time: 16 });
    mock.resize(320, 280);
    assert.equal(mock.captured.size, 0);
    assert.equal(mock.canvas.dataset.interaction, "idle");
    const resized = renderer.getState();
    mock.pointer("pointermove", 1.4, { time: 32 });
    assert.deepEqual(renderer.getState(), resized);
    mock.pointer("pointerdown", 1, { time: 100 });
    mock.pointer("pointermove", 0.5, { time: 116 });
    assert.equal(mock.captured.size, 1);
    const pending = renderer.spin(26);
    assert.equal(mock.captured.size, 0);
    assert.equal(mock.canvas.dataset.interaction, "idle");
    assert.equal(mock.canvas.dataset.interactive, "false");
    assert.equal(mock.frames.size, 1);
    renderer.setInteractive(false);
    mock.tick(200);
    mock.tick(200 + wheel.DEFAULT_DURATION);
    const final = await pending;
    assert.equal(final.number, 26);
    assert.ok(distance(final.ballAngle, final.wheelAngle + wheel.TOP + final.index * wheel.STEP) < 1e-10);
    assert.equal(mock.canvas.dataset.interactive, "false");
    renderer.setInteractive(true);
    assert.equal(mock.canvas.dataset.interactive, "true");
    renderer.destroy();
});

test("klavye ve azaltılmış hareket ayarı resmi sonucu koruyarak gereksiz animasyonu durdurur", async () => {
    const mock = mockCanvas();
    const renderer = wheel.create(mock.canvas);
    renderer.showResult(17);
    const before = renderer.getState();
    let prevented = 0;
    mock.dispatch("keydown", { key: "ArrowRight", preventDefault() { prevented += 1; } });
    assert.equal(prevented, 1);
    assert.ok(distance(renderer.getState().wheelAngle, before.wheelAngle + wheel.STEP) < 1e-10);
    assert.equal(mock.canvas.dataset.interaction, "coasting");
    mock.reducedMotion(true);
    assert.equal(mock.frames.size, 0);
    assert.equal(mock.canvas.dataset.interaction, "idle");
    const atRest = renderer.getState();
    mock.dispatch("keydown", { key: "ArrowLeft" });
    assert.ok(distance(renderer.getState().wheelAngle, atRest.wheelAngle - wheel.STEP) < 1e-10);
    assert.equal(mock.frames.size, 0);
    mock.pointer("pointerdown", 0, { time: 0 });
    mock.pointer("pointermove", 0.8, { time: 16 });
    mock.pointer("pointerup", 0.8, { time: 16 });
    assert.equal(mock.frames.size, 0);
    assert.equal((await renderer.spin(8)).number, 8);
    assert.equal(mock.frames.size, 0);

    mock.reducedMotion(false);
    const spinning = renderer.spin(32);
    mock.tick(100);
    mock.tick(400);
    mock.reducedMotion(true);
    assert.equal((await spinning).number, 32);
    assert.equal(mock.frames.size, 0);
    renderer.setInteractive(false);
    const disabled = renderer.getState();
    mock.dispatch("keydown", { key: "ArrowRight" });
    mock.pointer("pointerdown", 0);
    assert.deepEqual(renderer.getState(), disabled);
    assert.equal(mock.captured.size, 0);
    renderer.destroy();

    const explicit = mockCanvas();
    const reduced = wheel.create(explicit.canvas, { reducedMotion: true });
    explicit.dispatch("keydown", { key: "ArrowRight" });
    assert.equal(explicit.frames.size, 0);
    assert.equal((await reduced.spin(0)).number, 0);
    assert.equal(explicit.frames.size, 0);
    reduced.destroy();
});

test("tamamlanan bilinçli sürükleme bırakma kancasını yakalama temizlendikten sonra yalnızca bir kez çağırır", () => {
    for (const direction of [1, -1]) {
        const mock = mockCanvas();
        const releases = [];
        const renderer = wheel.create(mock.canvas, {
            onRelease(release) {
                assert.equal(mock.captured.size, 0);
                assert.equal(mock.canvas.dataset.interaction, "idle");
                releases.push(release);
                return true;
            },
        });
        mock.pointer("pointerdown", 0, { time: 0 });
        mock.pointer("pointermove", direction * 0.8, { time: 16 });
        mock.pointer("pointerup", direction * 0.8, { time: 16 });
        mock.pointer("pointerup", direction * 0.8, { time: 20 });
        assert.equal(releases.length, 1);
        assert.equal(releases[0].direction, direction);
        assert.equal(Math.sign(releases[0].velocity), direction);
        assert.ok(Math.abs(releases[0].velocity) <= 9);
        assert.ok(Math.abs(releases[0].rotation - direction * 0.8) < 1e-10);
        assert.ok(Math.abs(releases[0].angularTravel - 0.8) < 1e-10);
        assert.ok(releases[0].distance > 6);
        assert.equal(mock.frames.size, 0);
        renderer.destroy();
    }
});

test("çarktan başlayan yakalanmış sürükleme canvas dışında bırakılınca da turu başlatır", () => {
    for (const direction of [1, -1]) {
        const mock = mockCanvas();
        const releases = [];
        const renderer = wheel.create(mock.canvas, { onRelease(release) { releases.push(release); return true; } });
        mock.pointer("pointerdown", 0, { time: 0 });
        mock.pointer("pointermove", direction * 0.3, { time: 16, radius: 1.2 });
        assert.ok(distance(renderer.getState().wheelAngle, direction * 0.3) < 1e-10);
        assert.equal(mock.captured.has(1), true);
        mock.pointer("pointerup", direction * 0.8, { time: 32, radius: 2 });
        assert.ok(distance(renderer.getState().wheelAngle, direction * 0.8) < 1e-10);
        assert.equal(releases.length, 1);
        assert.equal(releases[0].direction, direction);
        assert.ok(Math.abs(releases[0].rotation - direction * 0.8) < 1e-10);
        assert.equal(mock.captured.size, 0);
        assert.equal(mock.frames.size, 0);
        mock.pointer("pointerup", direction * 0.8, { radius: 2 });
        assert.equal(releases.length, 1);
        renderer.destroy();
    }
});

test("merkezden yatay veya dikey çekme iki yönde de döner ve dışarıda bırakılınca tur başlatır", () => {
    for (const [dx, dy, direction] of [[50, 3, 1], [-50, 3, -1], [3, -50, 1], [3, 50, -1]]) {
        const mock = mockCanvas();
        const releases = [];
        const renderer = wheel.create(mock.canvas, { onRelease(release) { releases.push(release); return true; } });
        const bounds = mock.canvas.getBoundingClientRect();
        const radius = Math.min(bounds.width * 0.475, bounds.height * 0.54);
        const point = (name, x, y, time) => mock.pointer(name, 0, {
            radius: 0, clientX: bounds.left + bounds.width / 2 + x,
            clientY: bounds.top + bounds.height * 0.46 + y, time,
        });
        point("pointerdown", 0, 0, 0);
        assert.equal(mock.captured.has(1), true);
        point("pointermove", 2, 1, 8);
        assert.equal(renderer.getState().wheelAngle, 0);
        point("pointermove", dx, dy, 24);
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const expected = (horizontal ? dx : -dy) / radius;
        assert.ok(distance(renderer.getState().wheelAngle, expected) < 1e-10);
        point("pointerup", horizontal ? direction * bounds.width * 2 : 3,
            horizontal ? 3 : -direction * bounds.height * 2, 40);
        assert.equal(releases.length, 1);
        assert.equal(releases[0].direction, direction);
        assert.ok(Math.abs(releases[0].velocity) <= 9);
        assert.equal(mock.captured.size, 0);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        assert.equal(mock.frames.size, 0);
        renderer.destroy();
    }
});

test("merkezden çekmenin ekseni ilk belirgin harekette sabitlenir ve kutupsal moda sıçramaz", () => {
    for (const axis of ["x", "y"]) {
        const mock = mockCanvas();
        const renderer = wheel.create(mock.canvas);
        const bounds = mock.canvas.getBoundingClientRect();
        const radius = Math.min(bounds.width * 0.475, bounds.height * 0.54);
        const point = (name, dx, dy, time) => mock.pointer(name, 0, {
            radius: 0, clientX: bounds.left + bounds.width / 2 + dx,
            clientY: bounds.top + bounds.height * 0.46 + dy, time,
        });
        point("pointerdown", 0, 0, 0);
        point("pointermove", axis === "x" ? 10 : 1, axis === "x" ? 1 : -10, 16);
        assert.ok(distance(renderer.getState().wheelAngle, 10 / radius) < 1e-10);
        point("pointermove", axis === "x" ? 20 : 1000, axis === "x" ? 1000 : -20, 32);
        assert.ok(distance(renderer.getState().wheelAngle, 20 / radius) < 1e-10);
        renderer.destroy();
    }
});

test("merkez tıklaması ve altı pikselden küçük titreşim tur başlatmaz, iptal edilen çekme de başlatmaz", () => {
    for (const action of ["click", "jitter", "cancel"]) {
        const mock = mockCanvas();
        let releases = 0;
        const renderer = wheel.create(mock.canvas, { onRelease() { releases += 1; return true; } });
        const bounds = mock.canvas.getBoundingClientRect();
        const point = (name, dx, dy, time) => mock.pointer(name, 0, {
            radius: 0, clientX: bounds.left + bounds.width / 2 + dx,
            clientY: bounds.top + bounds.height * 0.46 + dy, time,
        });
        point("pointerdown", 0, 0, 0);
        if (action === "jitter") {
            for (let move = 1; move <= 12; move += 1) point("pointermove", move % 2 ? 2 : -2, 1, move * 16);
        }
        if (action === "cancel") {
            point("pointermove", 50, 1, 16);
            mock.dispatch("pointercancel", { pointerId: 1 });
        }
        point("pointerup", action === "cancel" ? 50 : 0, 0, 200);
        assert.equal(releases, 0, action);
        assert.equal(mock.frames.size, 0);
        assert.equal(mock.captured.size, 0);
        renderer.destroy();
    }
});

test("son taşıma olayı gelmese veya çekme merkezden geçse de bırakmanın son koordinatı değerlendirilir", () => {
    for (const gesture of ["radial", "center", "cross-center"]) {
        const mock = mockCanvas();
        const releases = [];
        const renderer = wheel.create(mock.canvas, { onRelease(release) { releases.push(release); return true; } });
        mock.pointer("pointerdown", 0, { time: 0, radius: gesture === "center" ? 0 : 0.7 });
        if (gesture === "cross-center") mock.pointer("pointermove", 0, { time: 16, radius: 0.05 });
        mock.pointer("pointerup", 0, { time: 32, radius: gesture === "cross-center" ? 0.05 : 2 });
        assert.equal(releases.length, 1, gesture);
        assert.ok(releases[0].distance >= 6);
        if (gesture === "center") assert.ok(releases[0].rotation > 0);
        assert.equal(mock.captured.size, 0);
        assert.equal(mock.frames.size, 0);
        renderer.destroy();
    }
});

test("tıklama, küçük titreşim veya iptal edilmiş sürükleme bahis turu başlatmaz", () => {
    for (const reason of ["click", "jitter", "pointercancel", "lostpointercapture", "blur", "hidden", "resize", "route", "cancel", "destroy"]) {
        const mock = mockCanvas();
        let releases = 0;
        const renderer = wheel.create(mock.canvas, { onRelease() { releases += 1; return true; } });
        mock.pointer("pointerdown", 0, { time: 0 });
        if (reason === "jitter") {
            // Accumulated movement is large, but the cursor never leaves a tiny neighborhood.
            for (let move = 1; move <= 12; move += 1) {
                mock.pointer("pointermove", move % 2 ? 0.01 : -0.01, { time: move * 16 });
            }
        } else if (reason !== "click") mock.pointer("pointermove", 0.8, { time: 16 });
        if (reason === "pointercancel" || reason === "lostpointercapture") mock.pointer(reason, 0.8);
        if (reason === "blur") mock.listeners.get("blur")();
        if (reason === "hidden") mock.hide();
        if (reason === "resize") mock.resize(320, 280);
        if (reason === "route") renderer.setInteractive(false);
        if (reason === "cancel") renderer.cancel();
        if (reason === "destroy") renderer.destroy();
        const angle = reason === "click" ? 0 : reason === "jitter" ? -0.01 : 0.8;
        mock.pointer("pointerup", angle);
        assert.equal(releases, 0, reason);
        renderer.destroy();
    }
});

test("bırakma kancası turu üstlenmediğinde serbest çevirmenin ataleti devam eder", () => {
    for (const response of [false, undefined, "throw"]) {
        const mock = mockCanvas();
        let releases = 0;
        const renderer = wheel.create(mock.canvas, {
            onRelease() {
                releases += 1;
                if (response === "throw") throw new Error("Round unavailable");
                return response;
            },
        });
        renderer.showResult(17);
        mock.pointer("pointerdown", 0, { time: 0 });
        mock.pointer("pointermove", 0.8, { time: 16 });
        mock.pointer("pointerup", 0.8, { time: 16, radius: response === false ? 2 : 0.7 });
        assert.equal(releases, 1);
        assert.equal(mock.canvas.dataset.interaction, "coasting");
        assert.equal(mock.frames.size, 1);
        const before = renderer.getState();
        mock.tick(116);
        const after = renderer.getState();
        assert.ok(after.wheelAngle > before.wheelAngle);
        assert.ok(distance(after.ballAngle, after.wheelAngle + wheel.TOP + after.index * wheel.STEP) < 1e-10);
        mock.tick(5016);
        assert.equal(mock.frames.size, 0);
        renderer.destroy();
    }
});

test("bırakma kancasının başlattığı gerçek dönüş 37 güvenli sonucu da tek animasyonla doğru cebe indirir", async () => {
    for (const number of core.WHEEL_ORDER) {
        const mock = mockCanvas();
        let releases = 0;
        let pending;
        let state = core.addBet(core.createState(), "red", 25);
        const direction = number % 2 ? -1 : 1;
        const renderer = wheel.create(mock.canvas, {
            onRelease(release) {
                releases += 1;
                assert.equal(release.direction, direction);
                assert.equal(mock.captured.size, 0);
                state = core.beginSpin(state, { getRandomValues(buffer) { buffer[0] = number; return buffer; } });
                assert.equal(state.pending.number, number);
                renderer.setInteractive(false);
                pending = renderer.spin(state.pending.number);
                return true;
            },
        });
        mock.pointer("pointerdown", 0, { time: 0 });
        mock.pointer("pointermove", direction * 0.8, { time: 16 });
        mock.pointer("pointerup", direction * 0.8, { time: 16, radius: number % 2 ? 2 : 0.7 });
        assert.equal(releases, 1);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        assert.equal(mock.canvas.dataset.interactive, "false");
        assert.equal(mock.frames.size, 1);
        mock.pointer("pointerup", direction * 0.8, { time: 17 });
        assert.equal(releases, 1);
        mock.tick(20);
        const start = renderer.getState();
        mock.tick(120);
        assert.equal(Math.sign(renderer.getState().wheelAngle - start.wheelAngle), direction);
        assert.equal(mock.canvas.dataset.interaction, "idle");
        mock.tick(20 + wheel.DEFAULT_DURATION);
        const final = await pending;
        assert.equal(final.number, number);
        assert.ok(distance(final.ballAngle, final.wheelAngle + wheel.TOP + final.index * wheel.STEP) < 1e-10);
        assert.equal(mock.frames.size, 0);
        assert.equal(state.balance, 9975);
        const settled = core.settleSpin(state);
        assert.equal(settled.result.number, number);
        assert.equal(settled.state.history.length, 1);
        renderer.destroy();
    }
});
