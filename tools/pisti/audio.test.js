"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("./audio.js"), "utf8");

function harness({ deferred = false, blocked = false } = {}) {
    const contexts = [];
    let resume;
    const parameter = (value = 0) => ({ value, targets: [], ramps: [],
        cancelScheduledValues() {},
        setValueAtTime(next) { this.value = next; },
        setTargetAtTime(next) { this.value = next; this.targets.push(next); },
        linearRampToValueAtTime(next, time) { this.ramps.push({ value: next, time }); },
    });
    const node = (properties = {}) => ({ ...properties, connect(target) { return target; }, disconnect() {} });
    class AudioContext {
        constructor() {
            this.state = "suspended";
            this.sampleRate = 4000;
            this.currentTime = 0;
            this.destination = node();
            this.sources = [];
            this.gains = [];
            this.buffers = [];
            contexts.push(this);
        }
        resume() {
            if (blocked) return Promise.reject(new Error("Gesture required"));
            if (deferred) return new Promise((resolve) => { resume = () => { this.state = "running"; resolve(); }; });
            this.state = "running";
            return Promise.resolve();
        }
        createGain() { const gain = node({ gain: parameter() }); this.gains.push(gain); return gain; }
        createBiquadFilter() { return node({ frequency: parameter(), Q: parameter() }); }
        createBuffer(_channels, length, sampleRate) {
            const samples = new Float32Array(length);
            const buffer = { duration: length / sampleRate, getChannelData: () => samples };
            this.buffers.push(buffer);
            return buffer;
        }
        createBufferSource() {
            const voice = node({ start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } });
            this.sources.push(voice);
            return voice;
        }
        close() { this.state = "closed"; return Promise.resolve(); }
    }
    const context = vm.createContext({ AudioContext });
    vm.runInContext(source, context);
    return { create: context.OmniPistiAudio.create, contexts, resume: () => resume() };
}

test("paper effects initialize only on interaction and never loop or exceed the quiet mix", async () => {
    const env = harness();
    const audio = env.create({ volume: 1 });
    assert.equal(env.contexts.length, 0);
    for (const kind of ["deal", "play", "collect", "pisti", "win"]) {
        assert.equal(await audio.play(kind), true);
        const context = env.contexts[0];
        const voice = context.sources.at(-1);
        assert.equal(voice.loop, false);
        assert.equal(voice.started, true);
        assert.ok(voice.buffer.duration <= 0.3);
        const envelope = context.gains.at(-1).gain;
        assert.ok(envelope.ramps[0].value <= 0.2);
        assert.equal(envelope.ramps.at(-1).value, 0);
        assert.ok(envelope.ramps[0].time < envelope.ramps.at(-1).time);
        voice.onended();
        context.currentTime += 1;
    }
    assert.equal(env.contexts.length, 1);
    assert.equal(env.contexts[0].gains[0].gain.value, 0.32);
    audio.destroy();
});

test("noise is deterministic, peak limited, finite and has silent boundaries", async () => {
    const first = harness();
    const second = harness();
    await first.create().play("play");
    await second.create().play("play");
    const samples = first.contexts[0].buffers[0].getChannelData(0);
    assert.deepEqual(samples, second.contexts[0].buffers[0].getChannelData(0));
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    assert.ok(samples.some((value) => value !== 0));
    assert.ok(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.55));
});

test("mute and volume zero suppress pending playback and recover without changing preferences", async () => {
    const env = harness({ deferred: true });
    const audio = env.create({ volume: 0.25 });
    const pending = audio.play("play");
    audio.setMuted(true);
    audio.setMuted(false);
    env.resume();
    assert.equal(await pending, false);
    assert.equal(env.contexts[0].sources.length, 0);
    assert.equal(env.contexts[0].gains[0].gain.value, 0.25 * 0.32);
    audio.setVolume(0);
    assert.equal(await audio.play("play"), false);
    audio.setVolume(2);
    assert.equal(env.contexts[0].gains[0].gain.value, 0.32);
    audio.setVolume(NaN);
    assert.equal(env.contexts[0].gains[0].gain.value, 0.32);
    assert.equal(await audio.play("play"), true);
    audio.destroy();
});

test("rapid repeats are throttled and simultaneous voices stay bounded", async () => {
    const env = harness();
    const audio = env.create();
    assert.equal(await audio.play("deal"), true);
    assert.equal(await audio.play("deal"), false);
    assert.equal(await audio.play("play"), true);
    assert.equal(await audio.play("capture"), true);
    assert.equal(await audio.play("pisti"), false);
    assert.equal(env.contexts[0].sources.length, 3);
    audio.destroy();
    assert.ok(env.contexts[0].sources.every((voice) => voice.stopped));
    assert.equal(env.contexts[0].state, "closed");
    assert.equal(await audio.play("win"), false);
    assert.equal(await audio.unlock(), false);
});

test("unavailable audio and denied resume stay silent instead of disrupting the game", async () => {
    const context = vm.createContext({});
    vm.runInContext(source, context);
    assert.equal(await context.OmniPistiAudio.create().play("play"), false);
    const env = harness({ blocked: true });
    assert.equal(await env.create().play("play"), false);
    assert.equal(env.contexts[0].sources.length, 0);
});

test("Safari interruption recovers and muting stops every live paper voice", async () => {
    const env = harness();
    const audio = env.create();
    await audio.unlock();
    env.contexts[0].state = "interrupted";
    assert.equal(await audio.play("play"), true);
    assert.equal(env.contexts[0].state, "running");
    audio.setMuted(true);
    assert.ok(env.contexts[0].sources[0].stopped);
    assert.equal(env.contexts[0].gains[0].gain.value, 0);
});
