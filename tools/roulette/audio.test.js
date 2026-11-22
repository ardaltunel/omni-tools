"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("./audio.js"), "utf8");

function createHarness({ deferred = false, failedFile = "", resumeBlocked = false } = {}) {
    const contexts = [];
    const requests = [];
    const downloads = [];
    let blocked = resumeBlocked;

    function parameter(value = 0) {
        return {
            value,
            targets: [],
            cancelScheduledValues() {},
            setValueAtTime(next) { this.value = next; },
            linearRampToValueAtTime(next) { this.value = next; },
            setTargetAtTime(next) { this.targets.push(next); },
        };
    }

    function node(properties = {}) {
        return { ...properties, connect(target) { return target; }, disconnect() { this.disconnected = true; } };
    }

    class AudioContext {
        constructor() {
            this.state = "suspended";
            this.currentTime = 0;
            this.destination = node();
            this.gains = [];
            this.sources = [];
            this.decoded = [];
            contexts.push(this);
        }
        createGain() {
            const gain = node({ gain: parameter() });
            this.gains.push(gain);
            return gain;
        }
        createBiquadFilter() { return node({ frequency: parameter(), Q: parameter() }); }
        createDynamicsCompressor() {
            return node({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() });
        }
        resume() {
            if (blocked) return Promise.reject(new Error("User gesture required"));
            this.state = "running";
            return Promise.resolve();
        }
        async decodeAudioData() {
            const samples = Float32Array.from({ length: 100 }, () => 0.95);
            const buffer = { numberOfChannels: 1, sampleRate: 1000, length: samples.length, getChannelData: () => samples };
            this.decoded.push(buffer);
            return buffer;
        }
        createBufferSource() {
            const voice = node({
                started: false,
                stopTimes: [],
                start() { this.started = true; },
                stop(time) { this.stopTimes.push(time); this.onended?.(); },
            });
            this.sources.push(voice);
            return voice;
        }
        close() { this.state = "closed"; return Promise.resolve(); }
    }

    const context = vm.createContext({
        AudioContext,
        URL,
        document: { currentScript: { src: "https://example.test/omni-tools/tools/roulette/audio.js?v=2" } },
        fetch(url) {
            requests.push(url);
            const response = { ok: !failedFile || !url.endsWith(failedFile), arrayBuffer: async () => new ArrayBuffer(4) };
            if (!deferred) return Promise.resolve(response);
            return new Promise((resolve) => downloads.push(() => resolve(response)));
        },
    });
    vm.runInContext(source, context);
    return {
        create: context.OmniRouletteAudio.create,
        contexts,
        requests,
        allowResume() { blocked = false; },
        finishDownloads() { downloads.splice(0).forEach((finish) => finish()); },
    };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("audio recordings ship with valid audio headers and explicit CC0 provenance", () => {
    for (const file of ["chip-lay-1.mp3", "chips-collide-1.mp3", "chips-stack-3.mp3", "roulette-spin.mp3"]) {
        const bytes = fs.readFileSync(path.join(__dirname, "audio", file));
        assert.ok(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
        assert.ok(bytes.length > 1000);
    }
    const attribution = fs.readFileSync(path.join(__dirname, "audio", "ATTRIBUTION.md"), "utf8");
    assert.match(attribution, /CC0 1\.0/);
    assert.match(attribution, /freesound\.org\/people\/takecoins\/sounds\/588351/);
    assert.match(attribution, /Kenney/);
});

test("first interaction unlocks and loads samples once relative to the audio script", async () => {
    const harness = createHarness();
    const audio = harness.create({ volume: 0.5 });
    assert.equal(harness.contexts.length, 0);
    assert.equal(harness.requests.length, 0);
    assert.equal(await audio.play("chip"), true);
    assert.equal(harness.contexts.length, 1);
    assert.equal(harness.requests.length, 4);
    assert.ok(harness.requests.every((url) => url.startsWith("https://example.test/omni-tools/tools/roulette/audio/")));
    assert.ok(harness.requests.every((url) => url.endsWith(".mp3")));
    assert.equal(harness.contexts[0].sources.length, 1);
    assert.equal(harness.contexts[0].gains[0].gain.value, 0.5 * 0.5 * 0.65);
    assert.equal(await audio.play("win"), true);
    assert.equal(await audio.unlock(), true);
    assert.equal(harness.requests.length, 4);
    audio.destroy();
});

test("volume is clamped and smoothly updated, and mute blocks all one-shots", async () => {
    const harness = createHarness();
    const audio = harness.create();
    await audio.unlock();
    const master = harness.contexts[0].gains[0].gain;
    audio.setVolume(2);
    assert.equal(master.targets.at(-1), 0.65);
    audio.setVolume(-1);
    assert.equal(master.targets.at(-1), 0);
    assert.equal(await audio.play("chip"), false);
    audio.setVolume(0.4);
    assert.equal(master.targets.at(-1), 0.4 * 0.4 * 0.65);
    audio.setVolume(NaN);
    assert.equal(master.targets.at(-1), 0.4 * 0.4 * 0.65);
    audio.setMuted(true);
    assert.equal(master.targets.at(-1), 0);
    assert.equal(await audio.play("win"), false);
    audio.setMuted(false);
    assert.equal(await audio.play("chip"), true);
    audio.destroy();
});

test("normalization caps sample peaks and RMS and fades edges before playback", async () => {
    const harness = createHarness();
    const audio = harness.create();
    await audio.unlock();
    for (const buffer of harness.contexts[0].decoded) {
        const samples = buffer.getChannelData(0);
        assert.ok(Math.max(...samples.map(Math.abs)) <= 0.600001);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        assert.ok(rms <= 0.120001);
        assert.equal(samples[0], 0);
        assert.equal(samples.at(-1), 0);
    }
    audio.destroy();
});

test("failed samples stay silent while other sounds work and suspended contexts can retry", async () => {
    const harness = createHarness({ failedFile: "chip-lay-1.mp3", resumeBlocked: true });
    const audio = harness.create();
    assert.equal(await audio.play("chip"), false);
    harness.allowResume();
    assert.equal(await audio.play("chip"), false);
    assert.equal(await audio.play("bounce"), true);
    assert.equal(harness.contexts.length, 1);
    assert.equal(harness.requests.length, 4);
    audio.destroy();
});

test("an interrupted Safari audio context resumes on the next interaction", async () => {
    const harness = createHarness();
    const audio = harness.create();
    await audio.unlock();
    harness.contexts[0].state = "interrupted";
    assert.equal(await audio.play("chip"), true);
    assert.equal(harness.contexts[0].state, "running");
    assert.equal(harness.contexts.length, 1);
    assert.equal(harness.requests.length, 4);
    audio.destroy();
});

test("an old delayed spin cannot start sound after stop or after a newer spin begins", async () => {
    const harness = createHarness({ deferred: true });
    const audio = harness.create();
    audio.startSpin();
    audio.stopSpin();
    harness.finishDownloads();
    await flush();
    assert.equal(harness.contexts[0].sources.length, 0);
    audio.startSpin();
    audio.startSpin();
    await flush();
    assert.equal(harness.contexts[0].sources.filter((voice) => voice.loop).length, 1);
    audio.stopSpin();
    assert.equal(harness.contexts[0].sources[0].stopTimes.length, 1);
    assert.equal(harness.contexts[0].sources[0].stopTimes[0], 0.16);
    audio.destroy();
});

test("rapid wheel ticks are throttled and voice count remains bounded", async () => {
    const harness = createHarness();
    const audio = harness.create();
    assert.equal(await audio.play("tick"), true);
    assert.equal(await audio.play("tick"), false);
    harness.contexts[0].currentTime = 0.1;
    assert.equal(await audio.play("tick"), true);
    for (let index = 0; index < 20; index += 1) await audio.play("chip");
    assert.equal(harness.contexts[0].sources.length, 8);
    audio.destroy();
    assert.equal(harness.contexts[0].state, "closed");
    assert.equal(await audio.play("chip"), false);
    assert.equal(await audio.unlock(), false);
});

test("mute or destroy during loading never produces a delayed sound", async () => {
    const harness = createHarness({ deferred: true });
    const audio = harness.create();
    const pending = audio.play("chip");
    audio.setMuted(true);
    audio.destroy();
    harness.finishDownloads();
    assert.equal(await pending, false);
    assert.equal(harness.contexts[0].sources.length, 0);
});

test("a hidden or stopped spin cannot release queued ticks or restart on unmute", async () => {
    const harness = createHarness({ deferred: true });
    const audio = harness.create();
    audio.startSpin();
    const tick = audio.play("tick");
    audio.stopSpin();
    audio.setMuted(true);
    audio.setMuted(false);
    harness.finishDownloads();
    assert.equal(await tick, false);
    await flush();
    assert.equal(harness.contexts[0].sources.length, 0);
    audio.startSpin();
    await flush();
    assert.equal(harness.contexts[0].sources.length, 1);
    audio.setMuted(true);
    audio.setMuted(false);
    await flush();
    assert.equal(harness.contexts[0].sources.length, 1, "unmute reuses the current loop");
    audio.destroy();
});
