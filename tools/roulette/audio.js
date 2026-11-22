(function initRouletteAudio(root, factory) {
    "use strict";

    const audio = factory(root);
    if (typeof module === "object" && module.exports) module.exports = audio;
    else root.OmniRouletteAudio = audio;
})(typeof globalThis !== "undefined" ? globalThis : window, function createRouletteAudio(root) {
    "use strict";

    const scriptUrl = root.document?.currentScript?.src;
    const assetBase = scriptUrl ? new URL("./audio/", scriptUrl).href : "./audio/";
    const FILES = {
        chip: "chip-lay-1.mp3",
        collision: "chips-collide-1.mp3",
        stack: "chips-stack-3.mp3",
        spin: "roulette-spin.mp3",
    };
    const EFFECTS = {
        chip: { sample: "chip", gain: 0.7 },
        tick: { sample: "collision", gain: 0.13 },
        bounce: { sample: "collision", gain: 0.4 },
        win: { sample: "stack", gain: 0.65 },
        lose: { sample: "chip", gain: 0.28 },
    };

    function normalizedVolume(value, fallback = 0.45) {
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    }

    function softenBuffer(buffer) {
        let peak = 0;
        let energy = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel);
            for (const sample of samples) {
                peak = Math.max(peak, Math.abs(sample));
                energy += sample * sample;
            }
        }
        const rms = Math.sqrt(energy / Math.max(1, buffer.length * buffer.numberOfChannels));
        const gain = Math.min(8, 0.6 / Math.max(peak, 0.0001), 0.12 / Math.max(rms, 0.0001));
        const edgeLength = Math.min(Math.floor(buffer.sampleRate * 0.005), Math.floor(buffer.length / 2));
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel);
            for (let index = 0; index < samples.length; index += 1) {
                const edge = edgeLength ? Math.min(1, index / edgeLength, (samples.length - 1 - index) / edgeLength) : 1;
                samples[index] *= gain * edge;
            }
        }
        return buffer;
    }

    function create(options = {}) {
        let volume = normalizedVolume(options.volume);
        let muted = Boolean(options.muted);
        let destroyed = false;
        let context;
        let master;
        let filter;
        let loading;
        let spinning = false;
        let spinVoice = null;
        let spinGeneration = 0;
        let lastTick = -Infinity;
        const buffers = new Map();
        const voices = new Set();

        function updateMaster() {
            if (!master) return;
            const level = muted ? 0 : volume * volume * 0.65;
            master.gain.cancelScheduledValues(context.currentTime);
            master.gain.setTargetAtTime(level, context.currentTime, 0.025);
        }

        function initialize() {
            if (destroyed) return false;
            if (context) return true;
            const AudioContext = root.AudioContext || root.webkitAudioContext;
            if (!AudioContext || typeof root.fetch !== "function") return false;
            try {
                context = new AudioContext({ latencyHint: "interactive" });
                master = context.createGain();
                master.gain.value = muted ? 0 : volume * volume * 0.65;
                filter = context.createBiquadFilter();
                filter.type = "lowpass";
                filter.frequency.value = 4800;
                filter.Q.value = 0.5;
                const compressor = context.createDynamicsCompressor();
                compressor.threshold.value = -18;
                compressor.knee.value = 18;
                compressor.ratio.value = 3;
                compressor.attack.value = 0.008;
                compressor.release.value = 0.15;
                filter.connect(compressor).connect(master).connect(context.destination);
                loading = Promise.all(Object.entries(FILES).map(async ([name, file]) => {
                    try {
                        const response = await root.fetch(assetBase + file);
                        if (!response.ok) return;
                        const buffer = await context.decodeAudioData(await response.arrayBuffer());
                        if (!destroyed) buffers.set(name, softenBuffer(buffer));
                    } catch {
                        // A failed recording stays silent while the other samples remain usable.
                    }
                }));
                return true;
            } catch {
                context?.close().catch(() => {});
                context = null;
                return false;
            }
        }

        async function unlock() {
            if (!initialize()) return false;
            try {
                if (context.state === "suspended" || context.state === "interrupted") await context.resume();
                await loading;
                return !destroyed && context.state === "running";
            } catch {
                return false;
            }
        }

        function makeVoice(sample, gain, loop) {
            if (destroyed || muted || volume === 0 || !buffers.has(sample) || context.state !== "running") return null;
            try {
                const source = context.createBufferSource();
                const envelope = context.createGain();
                source.buffer = buffers.get(sample);
                source.loop = loop;
                envelope.gain.setValueAtTime(0, context.currentTime);
                envelope.gain.linearRampToValueAtTime(gain, context.currentTime + (loop ? 0.18 : 0.006));
                source.connect(envelope).connect(filter);
                const voice = { source, envelope };
                source.onended = () => {
                    voices.delete(voice);
                    source.disconnect();
                    envelope.disconnect();
                };
                source.start();
                voices.add(voice);
                return voice;
            } catch {
                return null;
            }
        }

        async function play(kind) {
            const effect = EFFECTS[kind];
            if (!effect || destroyed || muted || volume === 0) return false;
            const generation = spinGeneration;
            if (!(await unlock()) || muted || volume === 0 || generation !== spinGeneration) return false;
            if (kind === "tick") {
                if (context.currentTime - lastTick < 0.09) return false;
                lastTick = context.currentTime;
            }
            if (voices.size >= 8) return false;
            return Boolean(makeVoice(effect.sample, effect.gain, false));
        }

        function fadeVoice(voice, duration) {
            if (!voice) return;
            const now = context.currentTime;
            voice.envelope.gain.cancelScheduledValues(now);
            voice.envelope.gain.setTargetAtTime(0, now, duration / 4);
            try { voice.source.stop(now + duration); } catch { /* The recording may have just ended. */ }
        }

        async function resumeSpin(generation) {
            if (!(await unlock()) || !spinning || generation !== spinGeneration || spinVoice) return;
            spinVoice = makeVoice("spin", 0.58, true);
        }

        function startSpin() {
            if (destroyed || spinning) return;
            spinning = true;
            spinGeneration += 1;
            resumeSpin(spinGeneration);
        }

        function stopSpin() {
            spinning = false;
            spinGeneration += 1;
            fadeVoice(spinVoice, 0.16);
            spinVoice = null;
        }

        function setVolume(value) {
            volume = normalizedVolume(value, volume);
            updateMaster();
            if (spinning && !muted && volume > 0 && !spinVoice) resumeSpin(spinGeneration);
        }

        function setMuted(value) {
            muted = Boolean(value);
            updateMaster();
            if (spinning && !muted && volume > 0 && !spinVoice) resumeSpin(spinGeneration);
        }

        function destroy() {
            if (destroyed) return;
            stopSpin();
            destroyed = true;
            for (const voice of voices) fadeVoice(voice, 0.03);
            buffers.clear();
            if (context) context.close().catch(() => {});
        }

        return Object.freeze({ unlock, setVolume, setMuted, play, startSpin, stopSpin, destroy });
    }

    return Object.freeze({ create });
});
