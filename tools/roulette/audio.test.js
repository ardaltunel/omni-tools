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
    let time = 0;

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
            const buffer = { numberOfChannels: 1, sampleRate: 1000, duration: 6.8, length: samples.length, getChannelData: () => samples };
            this.decoded.push(buffer);
            return buffer;
        }
        createBufferSource() {
            const voice = node({
                started: false,
                stopTimes: [],
                playbackRate: parameter(1),
                start(_time, offset) { this.started = true; this.offset = offset; },
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
        performance: { now: () => time },
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
        advanceTime(milliseconds) { time += milliseconds; },
        finishDownloads() { downloads.splice(0).forEach((finish) => finish()); },
    };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("audio recordings ship with valid audio headers and explicit CC0 provenance", () => {
    for (const file of ["chip-lay-1.mp3", "chips-collide-1.mp3", "chips-stack-3.mp3", "roulette-roll.mp3"]) {
        const bytes = fs.readFileSync(path.join(__dirname, "audio", file));
        assert.ok(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
        assert.ok(bytes.length > 1000);
    }
    const attribution = fs.readFileSync(path.join(__dirname, "audio", "ATTRIBUTION.md"), "utf8");
    assert.match(attribution, /CC0 1\.0/);
    assert.match(attribution, /freesound\.org\/people\/KaleidacousticsAudio\/sounds\/629002/);
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
    assert.equal(harness.contexts[0].gains[0].gain.value, 0.5 * 0.6);
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
    assert.equal(master.targets.at(-1), 0.6);
    audio.setVolume(-1);
    assert.equal(master.targets.at(-1), 0);
    assert.equal(await audio.play("chip"), false);
    audio.setVolume(0.4);
    assert.equal(master.targets.at(-1), 0.4 * 0.6);
    audio.setVolume(NaN);
    assert.equal(master.targets.at(-1), 0.4 * 0.6);
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
        assert.ok(Math.max(...samples.map(Math.abs)) <= 0.400001);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        assert.ok(rms <= 0.060001);
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
    assert.equal(harness.contexts[0].sources.length, 1);
    assert.equal(harness.contexts[0].sources[0].loop, false);
    audio.stopSpin();
    assert.equal(harness.contexts[0].sources[0].stopTimes.length, 1);
    assert.equal(harness.contexts[0].sources[0].stopTimes[0], 0.16);
    audio.destroy();
});

test("repeated wheel ticks remain quiet and other voice counts are bounded", async () => {
    const harness = createHarness();
    const audio = harness.create();
    assert.equal(await audio.play("tick"), false);
    assert.equal(await audio.play("tick"), false);
    for (let index = 0; index < 20; index += 1) await audio.play("chip");
    assert.equal(harness.contexts[0].sources.length, 8);
    audio.destroy();
    assert.equal(harness.contexts[0].state, "closed");
    assert.equal(await audio.play("chip"), false);
    assert.equal(await audio.unlock(), false);
});

test("a spin is one timed recording that skips elapsed audio after loading or unmute", async () => {
    const harness = createHarness({ deferred: true });
    const audio = harness.create();
    audio.startSpin();
    harness.advanceTime(1800);
    harness.finishDownloads();
    await flush();
    const voice = harness.contexts[0].sources[0];
    assert.equal(voice.loop, false);
    assert.equal(voice.playbackRate.value, 1);
    assert.equal(voice.offset, 1.8);
    assert.equal(await audio.play("tick"), false);
    assert.equal(await audio.play("bounce"), false);
    audio.stopSpin();
    audio.setMuted(true);
    audio.startSpin({ durationMs: 3400 });
    await flush();
    harness.advanceTime(1000);
    audio.setMuted(false);
    await flush();
    const shorterVoice = harness.contexts[0].sources[1];
    assert.equal(shorterVoice.loop, false);
    assert.equal(shorterVoice.playbackRate.value, 2);
    assert.equal(shorterVoice.offset, 2);
    audio.destroy();
});

test("an expired spin cannot start a full recording when a download finally completes", async () => {
    const harness = createHarness({ deferred: true });
    const audio = harness.create();
    audio.startSpin();
    harness.advanceTime(7000);
    harness.finishDownloads();
    await flush();
    assert.equal(harness.contexts[0].sources.length, 0);
    audio.setMuted(true);
    audio.setMuted(false);
    await flush();
    assert.equal(harness.contexts[0].sources.length, 0);
    audio.destroy();
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
