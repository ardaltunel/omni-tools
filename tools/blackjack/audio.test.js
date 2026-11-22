"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const audioModule = require("./audio.js");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({ blocked = false, delayed = false } = {}) {
    const contexts = [];
    const listeners = new Map();
    const resumes = [];
    let blockedResume = blocked;
    function parameter(value = 0) {
        return { value, targets: [], cancelScheduledValues() {}, setValueAtTime(next) { this.value = next; },
            linearRampToValueAtTime(next) { this.value = next; }, setTargetAtTime(next) { this.targets.push(next); } };
    }
    function node(extra = {}) { return { ...extra, connect(target) { return target; }, disconnect() {} }; }
    class AudioContext {
        constructor() {
            this.state = "suspended";
            this.currentTime = 0;
            this.sampleRate = 22050;
            this.destination = node();
            this.sources = [];
            this.gains = [];
            this.buffers = [];
            contexts.push(this);
        }
        createGain() { const gain = node({ gain: parameter() }); this.gains.push(gain); return gain; }
        createBiquadFilter() { return node({ frequency: parameter(), Q: parameter() }); }
        createDynamicsCompressor() { return node({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() }); }
        createBuffer(channels, length, rate) {
            const samples = Array.from({ length: channels }, () => new Float32Array(length));
            const buffer = { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (index) => samples[index] };
            this.buffers.push(buffer);
            return buffer;
        }
        createBufferSource() {
            const source = node({ loop: false, started: false, stops: [],
                start() { this.started = true; }, stop(at) { this.stops.push(at); this.onended?.(); } });
            this.sources.push(source);
            return source;
        }
        resume() {
            if (blockedResume) return Promise.reject(new Error("Gesture required"));
            if (delayed) return new Promise((resolve) => resumes.push(() => { this.state = "running"; resolve(); }));
            this.state = "running";
            return Promise.resolve();
        }
        close() { this.state = "closed"; return Promise.resolve(); }
    }
    const document = {
        hidden: false,
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const host = {
        document, AudioContext,
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
        fetch() { throw new Error("Original sound buffers should not load network assets"); },
    };
    return { host, document, contexts, listeners,
        allowResume() { blockedResume = false; },
        finishResume() { resumes.splice(0).forEach((resume) => resume()); },
    };
}

test("SSR import is safe and audio is created only on interaction", async () => {
    const unavailable = audioModule.create({ host: {} });
    assert.equal(await unavailable.play("deal"), false);
    assert.equal(await unavailable.unlock(), false);
    unavailable.destroy();
    const env = harness();
    const audio = audioModule.create({ host: env.host, volume: 0.5 });
    assert.equal(env.contexts.length, 0);
    assert.equal(await audio.play("deal"), true);
    assert.equal(env.contexts.length, 1);
    assert.equal(env.contexts[0].gains[0].gain.value, 0.12);
    assert.equal(env.contexts[0].sources[0].loop, false);
    audio.destroy();
});

test("every cue uses bounded short physical buffers with silent edges and no oscillator fallback", async () => {
    const env = harness();
    const audio = audioModule.create({ host: env.host });
    await audio.unlock();
    const context = env.contexts[0];
    for (const kind of ["deal", "flip", "chip", "collect", "pay", "push", "tap", "bust", "win", "blackjack", "shuffle"]) {
        context.currentTime += 1;
        assert.equal(await audio.play(kind), true, kind);
        const voice = context.sources.at(-1);
        const samples = voice.buffer.getChannelData(0);
        const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        assert.ok(peak > 0 && peak <= 0.400001, kind);
        assert.ok(rms <= 0.055001, kind);
        assert.equal(samples[0], 0);
        assert.equal(samples.at(-1), 0);
        assert.ok(voice.buffer.duration <= 0.53);
        assert.equal(voice.loop, false);
        voice.onended();
    }
    assert.equal(await audio.play("unknown"), false);
    audio.destroy();
});

test("volume changes are smooth and mute and inactive views stop existing voices", async () => {
    const env = harness();
    const audio = audioModule.create({ host: env.host });
    await audio.play("chip");
    const context = env.contexts[0];
    const master = context.gains[0].gain;
    audio.setVolume(10);
    assert.equal(master.targets.at(-1), 0.24);
    audio.setVolume(NaN);
    assert.equal(master.targets.at(-1), 0.24);
    audio.setMuted(true);
    assert.equal(master.targets.at(-1), 0);
    assert.equal(context.sources[0].stops.length, 1);
    assert.equal(await audio.play("deal"), false);
    audio.setMuted(false);
    context.currentTime += 1;
    assert.equal(await audio.play("deal"), true);
    audio.setActive(false);
    assert.equal(context.sources[1].stops.length, 1);
    assert.equal(await audio.play("pay"), false);
    audio.setActive(true);
    audio.setVolume(-1);
    assert.equal(await audio.play("deal"), false);
    audio.destroy();
});

test("repeated cues and total active voices remain bounded", async () => {
    const env = harness();
    const audio = audioModule.create({ host: env.host });
    assert.equal(await audio.play("deal"), true);
    assert.equal(await audio.play("deal"), false);
    const context = env.contexts[0];
    for (const kind of ["flip", "chip", "collect", "pay", "shuffle", "win", "blackjack"]) await audio.play(kind);
    assert.equal(context.sources.length, 6);
    audio.destroy();
});

test("ambience is off by default and its optional quiet loop stops when hidden", async () => {
    const env = harness();
    const audio = audioModule.create({ host: env.host });
    await audio.unlock();
    const context = env.contexts[0];
    assert.equal(context.sources.length, 0);
    audio.setAmbience(true);
    await flush();
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].loop, true);
    const samples = context.sources[0].buffer.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    assert.ok(rms < 0.01);
    env.document.hidden = true;
    env.listeners.get("visibilitychange")();
    assert.equal(context.sources[0].stops.length, 1);
    assert.equal(await audio.play("deal"), false);
    env.document.hidden = false;
    env.listeners.get("visibilitychange")();
    await flush();
    assert.equal(context.sources.length, 2);
    audio.setAmbience(false);
    assert.equal(context.sources[1].stops.length, 1);
    audio.destroy();
});

test("delayed audio unlock cannot release an old sound after inactivity or destruction", async () => {
    const env = harness({ delayed: true });
    const audio = audioModule.create({ host: env.host });
    const pending = audio.play("deal");
    audio.setActive(false);
    env.finishResume();
    assert.equal(await pending, false);
    assert.equal(env.contexts[0].sources.length, 0);
    audio.destroy();
    assert.equal(env.contexts[0].state, "closed");
    assert.equal(env.listeners.size, 0);
    assert.equal(await audio.unlock(), false);
});

test("blocked gestures recover and Safari interrupted state resumes on interaction", async () => {
    const env = harness({ blocked: true });
    const audio = audioModule.create({ host: env.host });
    assert.equal(await audio.play("deal"), false);
    env.allowResume();
    assert.equal(await audio.play("deal"), true);
    env.contexts[0].sources.at(-1).onended();
    env.contexts[0].state = "interrupted";
    env.contexts[0].currentTime += 1;
    assert.equal(await audio.play("flip"), true);
    assert.equal(env.contexts[0].state, "running");
    audio.destroy();
});
