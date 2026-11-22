(function exposePistiAudio(root, factory) {
    "use strict";
    const audio = factory(root);
    if (typeof module === "object" && module.exports) module.exports = audio;
    else root.OmniPistiAudio = audio;
})(typeof globalThis === "undefined" ? window : globalThis, function pistiAudioFactory(root) {
    "use strict";

    // Short, original paper noises. No recordings, oscillators, downloads or looping voices.
    const EFFECTS = Object.freeze({
        deal: { duration: 0.085, gain: 0.14, frequency: 1250, seed: 119 },
        play: { duration: 0.105, gain: 0.20, frequency: 900, seed: 331 },
        collect: { duration: 0.17, gain: 0.16, frequency: 700, seed: 641 },
        pisti: { duration: 0.23, gain: 0.17, frequency: 1050, seed: 971 },
        win: { duration: 0.29, gain: 0.14, frequency: 780, seed: 1229 },
    });
    const clampVolume = (value, fallback = 0.35) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

    function create(options = {}) {
        let volume = clampVolume(options.volume);
        let muted = Boolean(options.muted);
        let destroyed = false;
        let context;
        let master;
        let generation = 0;
        const buffers = new Map();
        const voices = new Set();
        const lastPlayed = new Map();

        function updateVolume() {
            if (!master) return;
            master.gain.cancelScheduledValues(context.currentTime);
            master.gain.setTargetAtTime(muted ? 0 : volume * 0.32, context.currentTime, 0.02);
        }

        function initialize() {
            if (destroyed) return false;
            if (context) return true;
            const AudioContext = root.AudioContext || root.webkitAudioContext;
            if (!AudioContext) return false;
            try {
                context = new AudioContext({ latencyHint: "interactive" });
                master = context.createGain();
                master.gain.value = muted ? 0 : volume * 0.32;
                const filter = context.createBiquadFilter();
                filter.type = "lowpass";
                filter.frequency.value = 2400;
                filter.Q.value = 0.45;
                master.connect(filter).connect(context.destination);
                return true;
            } catch {
                try { context?.close()?.catch(() => {}); } catch { /* Audio is optional. */ }
                context = null;
                master = null;
                return false;
            }
        }

        async function unlock() {
            if (!initialize()) return false;
            try {
                if (context.state === "suspended" || context.state === "interrupted") await context.resume();
                return !destroyed && context.state === "running";
            } catch {
                return false;
            }
        }

        function paperBuffer(kind) {
            if (buffers.has(kind)) return buffers.get(kind);
            const effect = EFFECTS[kind];
            const length = Math.max(2, Math.round(context.sampleRate * effect.duration));
            const buffer = context.createBuffer(1, length, context.sampleRate);
            const samples = buffer.getChannelData(0);
            let seed = effect.seed;
            let smooth = 0;
            for (let index = 0; index < length; index += 1) {
                seed ^= seed << 13;
                seed ^= seed >>> 17;
                seed ^= seed << 5;
                const noise = (seed >>> 0) / 2147483648 - 1;
                smooth = smooth * 0.58 + noise * 0.42;
                const progress = index / (length - 1);
                const shape = Math.pow(Math.sin(Math.PI * progress), 1.45);
                const flutter = 0.76 + 0.24 * Math.cos(progress * Math.PI * (kind === "pisti" ? 9 : 5));
                samples[index] = smooth * shape * flutter * 0.55;
            }
            samples[0] = 0;
            samples[length - 1] = 0;
            buffers.set(kind, buffer);
            return buffer;
        }

        function stopVoices() {
            for (const voice of voices) {
                try {
                    voice.envelope.gain.cancelScheduledValues(context.currentTime);
                    voice.envelope.gain.setTargetAtTime(0, context.currentTime, 0.006);
                    voice.source.stop(context.currentTime + 0.025);
                } catch { /* A short paper sound may have already ended. */ }
            }
        }

        async function play(requestedKind) {
            const kind = requestedKind === "capture" ? "collect" : requestedKind;
            const effect = EFFECTS[kind];
            if (!effect || destroyed || muted || volume === 0) return false;
            const requestedGeneration = generation;
            if (!(await unlock()) || requestedGeneration !== generation || muted || volume === 0 || voices.size >= 3) return false;
            const now = context.currentTime;
            if (now - (lastPlayed.get(kind) ?? -Infinity) < 0.055) return false;
            try {
                const source = context.createBufferSource();
                const envelope = context.createGain();
                const filter = context.createBiquadFilter();
                filter.type = "bandpass";
                filter.frequency.value = effect.frequency;
                filter.Q.value = 0.55;
                source.buffer = paperBuffer(kind);
                source.loop = false;
                envelope.gain.setValueAtTime(0, now);
                envelope.gain.linearRampToValueAtTime(effect.gain, now + 0.012);
                envelope.gain.linearRampToValueAtTime(0, now + effect.duration);
                source.connect(filter).connect(envelope).connect(master);
                const voice = { source, envelope };
                source.onended = () => {
                    voices.delete(voice);
                    source.disconnect();
                    filter.disconnect();
                    envelope.disconnect();
                };
                source.start();
                voices.add(voice);
                lastPlayed.set(kind, now);
                return true;
            } catch {
                return false;
            }
        }

        function setVolume(value) {
            volume = clampVolume(value, volume);
            updateVolume();
            if (!volume) { generation += 1; stopVoices(); }
        }

        function setMuted(value) {
            muted = Boolean(value);
            updateVolume();
            if (muted) { generation += 1; stopVoices(); }
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            generation += 1;
            stopVoices();
            buffers.clear();
            try { context?.close()?.catch(() => {}); } catch { /* Audio is optional. */ }
        }

        return Object.freeze({ unlock, play, setVolume, setMuted, destroy });
    }

    return Object.freeze({ create });
});
