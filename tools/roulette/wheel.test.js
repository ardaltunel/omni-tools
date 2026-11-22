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
    let frameId = 0;
    let bounds = { width: 440, height: 390 };
    const context = new Proxy({}, {
        get(_target, name) {
            if (name === "createRadialGradient" || name === "createLinearGradient") return () => ({ addColorStop() {} });
            return () => {};
        },
    });
    const view = {
        devicePixelRatio: 2,
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
    const document = { defaultView: view, createElement() { return { getContext: () => context }; } };
    const canvas = {
        ownerDocument: document,
        getContext: () => context,
        getBoundingClientRect: () => bounds,
        setAttribute(name, value) { attributes.set(name, value); },
    };
    return {
        canvas, frames, listeners, attributes, observers,
        resize(width, height) { bounds = { width, height }; observers[0].callback(); },
        tick(timestamp) { for (const [id, callback] of [...frames]) { frames.delete(id); callback(timestamp); } },
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
