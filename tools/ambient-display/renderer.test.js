"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "renderer.js"), "utf8");

function harness({ bounds = { width: 1920, height: 1080 }, context = true, resizeObserver = true, devicePixelRatio = 1 } = {}) {
    const frames = new Map();
    const timers = new Map();
    const events = new Map();
    const windowEvents = new Map();
    const classes = new Set();
    const observers = [];
    const created = { program: [], shader: [], buffer: [] };
    const deleted = { program: [], shader: [], buffer: [] };
    const draws = [];
    const uniformPrograms = [];
    const uniformValues = [];
    const scheduled = { frames: 0, timers: 0 };
    let nextId = 1;
    let currentProgram = null;
    let compiled = true;
    let viewport = null;
    function resource(type) {
        const value = { type, id: nextId++ };
        created[type].push(value);
        return value;
    }
    const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
        createProgram: () => resource("program"), createShader: () => resource("shader"), createBuffer: () => resource("buffer"),
        shaderSource() {}, compileShader() {}, getShaderParameter: () => compiled,
        attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
        useProgram: program => { currentProgram = program; }, bindBuffer() {}, bufferData() {},
        getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
        getUniformLocation: (program, name) => ({ program, name }),
        viewport: (x, y, width, height) => { viewport = { width, height }; },
        uniform2f: (location, x, y) => {
            uniformPrograms.push(location.program);
            uniformValues.push({ program: location.program, name: location.name, value: [x, y] });
        },
        uniform1f: (location, value) => {
            uniformPrograms.push(location.program);
            uniformValues.push({ program: location.program, name: location.name, value });
        },
        drawArrays: () => draws.push({ program: currentProgram, ...viewport }),
        deleteShader: value => deleted.shader.push(value),
        deleteProgram: value => deleted.program.push(value),
        deleteBuffer: value => deleted.buffer.push(value),
    };
    function add(map, name, callback) {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name).add(callback);
    }
    function remove(map, name, callback) { map.get(name)?.delete(callback); }
    const canvas = {
        width: 1, height: 1,
        getContext: () => context ? gl : null,
        getBoundingClientRect: () => bounds,
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        addEventListener: (name, callback) => add(events, name, callback),
        removeEventListener: (name, callback) => remove(events, name, callback),
    };
    const root = {
        document: { hidden: false },
        devicePixelRatio,
        requestAnimationFrame(callback) { scheduled.frames += 1; const id = nextId++; frames.set(id, callback); return id; },
        cancelAnimationFrame: id => frames.delete(id),
        setTimeout(callback, delay) { scheduled.timers += 1; const id = nextId++; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        addEventListener: (name, callback) => add(windowEvents, name, callback),
        removeEventListener: (name, callback) => remove(windowEvents, name, callback),
    };
    if (resizeObserver) root.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe(target) { this.target = target; }
        disconnect() { this.disconnected = true; }
    };
    vm.runInNewContext(source, { window: root });
    const renderer = root.AmbientRenderer.create(canvas);
    function frame(now = 100) {
        const queued = [...frames.values()];
        frames.clear();
        queued.forEach(callback => callback(now));
    }
    function timeout() {
        const queued = [...timers.values()];
        timers.clear();
        queued.forEach(item => item.callback());
    }
    function dispatch(name) {
        let prevented = false;
        [...(events.get(name) || [])].forEach(callback => callback({ preventDefault: () => { prevented = true; } }));
        return prevented;
    }
    const uniform = name => uniformValues.filter(item => item.name === name).at(-1);
    return { renderer, canvas, root, frames, timers, classes, events, windowEvents, observers, created, deleted, draws, uniformPrograms, uniform, scheduled, frame, timeout, dispatch, failCompilation: value => { compiled = !value; } };
}

test("motion disabled draws one static frame and leaves no animation work queued", () => {
    const h = harness();
    assert.equal(h.frames.size + h.timers.size, 0);
    h.renderer.update({ active: true, animated: false, intensity: .5 });
    h.frame();
    assert.equal(h.draws.length, 1);
    assert.equal(h.classes.has("is-ready"), true);
    assert.equal(h.frames.size + h.timers.size, 0);
    h.frame(1000);
    h.timeout();
    assert.equal(h.draws.length, 1);
    h.renderer.update({ intensity: .7 });
    h.frame(2000);
    assert.equal(h.draws.length, 2);
    assert.equal(h.frames.size + h.timers.size, 0);
});

test("inactive and Studio displays cancel the animation loop", () => {
    const h = harness();
    h.renderer.update({ active: true, animated: true });
    h.frame();
    assert.equal(h.draws.length, 1);
    assert.equal(h.timers.size, 1);
    assert.ok([...h.timers.values()][0].delay >= 1000 / 24);
    h.renderer.update({ active: false });
    assert.equal(h.frames.size + h.timers.size, 0);
    h.timeout();
    h.frame(1000);
    assert.equal(h.draws.length, 1);
    h.renderer.update({ active: true, design: "studio" });
    assert.equal(h.frames.size + h.timers.size, 0);
    h.frame(2000);
    assert.equal(h.draws.length, 1);
});

test("render surface preserves native desktop detail within width and total pixel budgets", () => {
    for (const [width, height, devicePixelRatio] of [[7680, 4320, 1], [3840, 2160, 2], [7680, 2160, 1], [3440, 1440, 1], [2560, 1440, 1], [1920, 1080, 1], [1000, 2000, 1.5], [977, 503, 1], [375, 812, 3]]) {
        const h = harness({ bounds: { width, height }, devicePixelRatio });
        h.renderer.update({ active: true });
        h.frame();
        assert.ok(h.canvas.width <= 3200, `${width}×${height}: width`);
        assert.ok(h.canvas.width * h.canvas.height <= 3200000, `${width}×${height}: area`);
        assert.ok(h.canvas.width > 0 && h.canvas.height > 0);
        if (width === 1920 && height === 1080) {
            assert.equal(h.canvas.width, 1920, "1080p must render at native CSS width");
            assert.equal(h.canvas.height, 1080, "1080p must render at native CSS height");
        }
        assert.deepEqual(h.draws[0], { program: h.created.program[0], width: h.canvas.width, height: h.canvas.height });
        h.renderer.destroy();
    }
});

test("device density sharpens smaller displays with bounded mobile sampling and a safe fallback", () => {
    const cases = [
        { width: 960, height: 540, density: 1.5, expected: [1440, 810] },
        { width: 375, height: 812, density: 3, expected: [562, 1218] },
        { width: 1920, height: 1080, density: NaN, expected: [1920, 1080] },
        { width: 960, height: 540, density: 0, expected: [960, 540] },
    ];
    for (const { width, height, density, expected } of cases) {
        const h = harness({ bounds: { width, height }, devicePixelRatio: density });
        h.renderer.update({ active: true });
        h.frame();
        assert.deepEqual([h.canvas.width, h.canvas.height], expected);
        h.renderer.destroy();
    }
});

test("context restoration rebuilds GPU resources and resumes the latest active scene once", () => {
    const h = harness();
    h.renderer.update({ active: true, animated: true });
    h.frame();
    assert.equal(h.dispatch("webglcontextlost"), true);
    assert.equal(h.frames.size + h.timers.size, 0);
    assert.equal(h.classes.has("is-ready"), false);
    h.renderer.update({ design: "cyber", intensity: .4 });
    assert.equal(h.frames.size + h.timers.size, 0);
    h.dispatch("webglcontextrestored");
    assert.equal(h.created.program.length, 2);
    assert.equal(h.created.shader.length, 4);
    assert.equal(h.created.buffer.length, 2);
    assert.equal(h.frames.size, 1);
    assert.equal(h.observers.length, 1);
    assert.equal(h.events.get("webglcontextlost").size, 1);
    h.uniformPrograms.length = 0;
    h.frame(1000);
    assert.equal(h.draws.length, 2);
    assert.equal(h.draws[1].program, h.created.program[1]);
    assert.ok(h.uniformPrograms.every(program => program === h.created.program[1]));
    assert.equal(h.uniform("pointer").program, h.created.program[1]);
    assert.deepEqual(h.uniform("pointer").value, [0, 0]);
    assert.equal(h.timers.size, 1);
});

test("context recovery does not resume inactive, Studio, or hidden displays", () => {
    for (const state of ["inactive", "studio", "hidden"]) {
        const h = harness();
        h.renderer.update({ active: true, animated: true });
        h.frame();
        h.dispatch("webglcontextlost");
        if (state === "inactive") h.renderer.update({ active: false });
        if (state === "studio") h.renderer.update({ design: "studio" });
        if (state === "hidden") h.root.document.hidden = true;
        h.dispatch("webglcontextrestored");
        assert.equal(h.frames.size + h.timers.size, 0, state);
        h.frame(500);
        assert.equal(h.draws.length, 1, state);
        h.root.document.hidden = false;
        h.renderer.update({ active: true, design: "aurora" });
        h.frame(1000);
        assert.equal(h.draws.length, 2, state);
        h.renderer.destroy();
    }
});

test("a failed restored shader keeps the CSS fallback without queued work", () => {
    const h = harness();
    h.renderer.update({ active: true, animated: true });
    h.frame();
    h.dispatch("webglcontextlost");
    h.failCompilation(true);
    assert.doesNotThrow(() => h.dispatch("webglcontextrestored"));
    h.renderer.update({ intensity: .3 });
    assert.equal(h.frames.size + h.timers.size, 0);
    assert.equal(h.classes.has("is-ready"), false);
    assert.equal(h.draws.length, 1);
    assert.equal(h.deleted.program.length, 1);
    assert.equal(h.deleted.shader.length, 1);
    h.renderer.destroy();
});

test("destroy cancels scheduled work, removes listeners, and releases current resources once", () => {
    for (const resizeObserver of [true, false]) {
        const h = harness({ resizeObserver });
        h.renderer.update({ active: true, animated: true });
        h.frame();
        h.renderer.destroy();
        h.renderer.destroy();
        h.renderer.update({ active: true });
        h.timeout();
        h.frame(1000);
        h.dispatch("webglcontextrestored");
        assert.equal(h.draws.length, 1);
        assert.equal(h.frames.size + h.timers.size, 0);
        assert.equal(h.events.get("webglcontextlost").size, 0);
        assert.equal(h.events.get("webglcontextrestored").size, 0);
        assert.equal(h.windowEvents.get("resize")?.size || 0, 0);
        assert.ok(h.observers.every(observer => observer.disconnected));
        assert.deepEqual(h.deleted, h.created);
        assert.equal(h.classes.has("is-ready"), false);
    }
});

test("unavailable WebGL remains a harmless CSS-only display", () => {
    const h = harness({ context: false });
    assert.doesNotThrow(() => {
        h.renderer.update({ active: true, animated: true });
        h.renderer.setPointer(1, -1);
        h.renderer.destroy();
    });
    assert.equal(h.frames.size + h.timers.size, 0);
    assert.equal(h.events.size, 0);
});

test("pointer targets clamp safely and follow with inertia without scheduling extra frames", () => {
    const h = harness();
    h.renderer.update({ active: true, animated: true });
    h.frame(0);
    const workBeforeInput = { ...h.scheduled };
    for (let i = 0; i < 150; i += 1) h.renderer.setPointer(999, -999);
    assert.deepEqual(h.scheduled, workBeforeInput);
    assert.equal(h.draws.length, 1);
    assert.deepEqual(h.uniform("pointer").value, [0, 0]);
    h.timeout();
    h.frame(100);
    const first = h.uniform("pointer").value;
    assert.ok(first[0] > .3 && first[0] < .4);
    assert.equal(first[0], -first[1]);
    for (let now = 200; now <= 500; now += 100) { h.timeout(); h.frame(now); }
    const settled = h.uniform("pointer").value;
    assert.ok(settled[0] > .85 && settled[0] < .9);
    assert.equal(settled[0], -settled[1]);
    h.renderer.setPointer(NaN, Infinity);
    h.timeout();
    h.frame(600);
    const returning = h.uniform("pointer").value;
    assert.ok(returning[0] < settled[0] && returning[0] > 0);
    assert.equal(returning[0], -returning[1]);
    h.renderer.destroy();
});

test("pointer smoothing depends on elapsed time rather than frame count", () => {
    function followedAt(intervals) {
        const h = harness();
        h.renderer.update({ active: true, animated: true });
        h.frame(0);
        h.renderer.setPointer(.7, -.4);
        for (const time of intervals) { h.timeout(); h.frame(time); }
        const value = h.uniform("pointer").value;
        h.renderer.destroy();
        return value;
    }
    const one = followedAt([100]);
    const two = followedAt([50, 100]);
    assert.ok(Math.abs(one[0] - two[0]) < 1e-12);
    assert.ok(Math.abs(one[1] - two[1]) < 1e-12);
});

test("paused, static, Studio, and hidden displays ignore pointer input and resume neutral", () => {
    for (const mode of ["inactive", "static", "studio", "hidden"]) {
        const h = harness();
        h.renderer.update({ active: true, animated: true });
        h.frame(0);
        h.renderer.setPointer(.8, -.6);
        h.timeout();
        h.frame(100);
        assert.ok(h.uniform("pointer").value[0] > 0);
        if (mode === "hidden") h.root.document.hidden = true;
        h.renderer.update({ active: mode !== "inactive", animated: mode !== "static", design: mode === "studio" ? "studio" : "aurora" });
        const workBeforeInput = { ...h.scheduled };
        for (let i = 0; i < 20; i += 1) h.renderer.setPointer(-1, 1);
        assert.deepEqual(h.scheduled, workBeforeInput, mode);
        h.timeout();
        h.frame(200);
        if (mode === "static") assert.deepEqual(h.uniform("pointer").value, [0, 0]);
        assert.equal(h.frames.size + h.timers.size, 0, mode);
        h.root.document.hidden = false;
        h.renderer.update({ active: true, animated: true, design: "aurora" });
        h.frame(300);
        assert.deepEqual(h.uniform("pointer").value, [0, 0], mode);
        h.renderer.destroy();
    }
});
