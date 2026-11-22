(function exposeBlackjackAudio(root, factory) {
    "use strict";
    const audio = factory(root);
    if (typeof module === "object" && module.exports) module.exports = audio;
    else root.OmniBlackjackAudio = audio;
})(typeof globalThis !== "undefined" ? globalThis : window, function blackjackAudioFactory(root) {
    "use strict";

    const CUES = Object.freeze({
        deal: { type: "card", duration: 0.14, gain: 0.8 },
        flip: { type: "card", duration: 0.2, gain: 0.7 },
        shuffle: { type: "shuffle", duration: 0.52, gain: 0.6 },
        chip: { type: "chip", duration: 0.12, gain: 0.75, hits: [0, 0.027] },
        collect: { type: "slide", duration: 0.2, gain: 0.7 },
        pay: { type: "chip", duration: 0.31, gain: 0.65, hits: [0, 0.055, 0.12, 0.19] },
        push: { type: "chip", duration: 0.1, gain: 0.35, hits: [0] },
        tap: { type: "chip", duration: 0.08, gain: 0.3, hits: [0] },
        bust: { type: "slide", duration: 0.14, gain: 0.35 },
        win: { type: "chip", duration: 0.24, gain: 0.55, hits: [0, 0.052, 0.12] },
        blackjack: { type: "chip", duration: 0.38, gain: 0.65, hits: [0, 0.047, 0.1, 0.17, 0.25] },
    });

    function volumeValue(value, fallback = 0.6) { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback; }

    function makeBuffer(context, kind) {
        const cue = kind === "ambience" ? { type: "room", duration: 2 } : CUES[kind];
        const rate = context.sampleRate;
        const buffer = context.createBuffer(1, Math.ceil(cue.duration * rate), rate);
        const samples = buffer.getChannelData(0);
        let seed = 0x38a7853 + Object.keys(CUES).indexOf(kind) * 173;
        let grain = 0;
        let felt = 0;
        let peak = 0;
        let energy = 0;
        for (let index = 0; index < samples.length; index += 1) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const noise = seed / 0x80000000 - 1;
            grain += 0.24 * (noise - grain);
            felt += 0.025 * (noise - felt);
            const time = index / rate;
            let value = 0;
            if (cue.type === "room") value = felt * 0.08;
            else if (cue.type === "chip") {
                for (const [hit, start] of cue.hits.entries()) {
                    const at = time - start;
                    if (at >= 0 && at < 0.055) {
                        // Short damped material resonances and grain form a chip impact.
                        const resonance = Math.sin(at * Math.PI * 2 * 1170) * 0.12 + Math.sin(at * Math.PI * 2 * 1830) * 0.065;
                        value += (resonance + grain * 0.16) * Math.exp(-at / 0.009) / (1 + hit * 0.45);
                    }
                }
            } else if (cue.type === "shuffle") {
                const pulse = Math.max(0, Math.sin(time * Math.PI * 2 * 13));
                value = grain * pulse * 0.19 + felt * 0.2;
            } else if (cue.type === "slide") {
                const envelope = Math.sin(Math.PI * time / cue.duration);
                value = (grain * 0.11 + felt * 0.25) * envelope;
            } else {
                const brush = Math.exp(-time / 0.043) * Math.min(1, time / 0.008);
                const second = kind === "flip" && time > 0.06 ? Math.exp(-(time - 0.06) / 0.033) * 0.65 : 0;
                value = grain * 0.28 * (brush + second) + felt * 0.2 * Math.exp(-time / 0.025);
            }
            const edge = Math.min(1, time / 0.003, (samples.length - index - 1) / (rate * 0.008));
            value *= Math.max(0, edge);
            samples[index] = value;
            peak = Math.max(peak, Math.abs(value));
            energy += value * value;
        }
        const rms = Math.sqrt(energy / samples.length);
        const attenuation = Math.min(1, 0.4 / Math.max(peak, 0.000001), 0.055 / Math.max(rms, 0.000001));
        if (attenuation < 1) for (let index = 0; index < samples.length; index += 1) samples[index] *= attenuation;
        samples[0] = 0;
        samples[samples.length - 1] = 0;
        return buffer;
    }

    function create(options = {}) {
        const host = options.host || root;
        const document = host.document;
        const isActive = typeof options.isActive === "function" ? options.isActive : () => true;
        let active = true;
        let volume = volumeValue(options.volume);
        let muted = Boolean(options.muted);
        let ambience = Boolean(options.ambience);
        let destroyed = false;
        let generation = 0;
        let context;
        let master;
        let filter;
        let room = null;
        const voices = new Set();
        const buffers = new Map();
        const lastPlayed = new Map();

        function allowed() { return !destroyed && active && isActive() && !document?.hidden && !muted && volume > 0; }
        function updateMaster() {
            if (!master) return;
            master.gain.cancelScheduledValues(context.currentTime);
            master.gain.setTargetAtTime(allowed() ? volume * 0.24 : 0, context.currentTime, 0.025);
        }

        async function unlock() {
            if (destroyed) return false;
            try {
                if (!context) {
                    const AudioContext = host.AudioContext || host.webkitAudioContext;
                    if (!AudioContext) return false;
                    context = new AudioContext({ latencyHint: "interactive" });
                    master = context.createGain();
                    master.gain.value = allowed() ? volume * 0.24 : 0;
                    filter = context.createBiquadFilter();
                    filter.type = "lowpass";
                    filter.frequency.value = 4200;
                    filter.Q.value = 0.5;
                    const compressor = context.createDynamicsCompressor();
                    compressor.threshold.value = -20;
                    compressor.knee.value = 14;
                    compressor.ratio.value = 3;
                    compressor.attack.value = 0.004;
                    compressor.release.value = 0.12;
                    filter.connect(compressor).connect(master).connect(context.destination);
                }
                if (context.state === "suspended" || context.state === "interrupted") await context.resume();
                if (context.state === "running" && ambience && allowed() && !room) room = startVoice("ambience", 0.04, true);
                return !destroyed && context.state === "running";
            } catch { return false; }
        }

        function startVoice(kind, gain, loop = false) {
            if (!allowed() || context?.state !== "running") return null;
            if (!buffers.has(kind)) buffers.set(kind, makeBuffer(context, kind));
            const source = context.createBufferSource();
            const envelope = context.createGain();
            source.buffer = buffers.get(kind);
            source.loop = loop;
            source.connect(envelope).connect(filter);
            envelope.gain.setValueAtTime(0, context.currentTime);
            envelope.gain.linearRampToValueAtTime(gain, context.currentTime + (loop ? 0.3 : 0.003));
            const voice = { source, envelope };
            source.onended = () => {
                voices.delete(voice);
                if (room === voice) room = null;
                source.disconnect();
                envelope.disconnect();
            };
            source.start();
            voices.add(voice);
            return voice;
        }

        async function play(kind) {
            const cue = CUES[kind];
            if (!cue || !allowed()) return false;
            const token = generation;
            if (!(await unlock()) || token !== generation || !allowed()) return false;
            if (context.currentTime - (lastPlayed.get(kind) ?? -Infinity) < 0.045 || voices.size >= 6) return false;
            try {
                const voice = startVoice(kind, cue.gain);
                if (!voice) return false;
                lastPlayed.set(kind, context.currentTime);
                return true;
            } catch { return false; }
        }

        function stopVoice(voice) {
            if (!voice) return;
            voice.envelope.gain.cancelScheduledValues(context.currentTime);
            voice.envelope.gain.setTargetAtTime(0, context.currentTime, 0.008);
            try { voice.source.stop(context.currentTime + 0.035); } catch { /* The sound already ended. */ }
        }

        function cancelSounds() {
            generation += 1;
            [...voices].forEach(stopVoice);
            room = null;
        }

        async function refreshAmbience() {
            if (!ambience || !allowed() || room) return;
            const token = generation;
            if (!(await unlock()) || token !== generation || !ambience || !allowed() || room) return;
            try { room = startVoice("ambience", 0.04, true); } catch { /* Ambient audio is optional. */ }
        }

        function refresh() {
            if (destroyed) return;
            updateMaster();
            if (!allowed()) cancelSounds();
            else refreshAmbience();
        }
        function visibilityChanged() { refresh(); }
        function pageHidden() { cancelSounds(); }
        document?.addEventListener?.("visibilitychange", visibilityChanged);
        host.addEventListener?.("pagehide", pageHidden);

        return Object.freeze({
            unlock, play,
            setVolume(value) { volume = volumeValue(value, volume); refresh(); },
            setMuted(value) { muted = Boolean(value); refresh(); },
            setActive(value) { active = Boolean(value); refresh(); },
            setAmbience(value) { if (destroyed) return; ambience = Boolean(value); if (!ambience) { stopVoice(room); room = null; } else refreshAmbience(); },
            destroy() {
                if (destroyed) return;
                destroyed = true;
                cancelSounds();
                buffers.clear();
                context?.close().catch(() => {});
                document?.removeEventListener?.("visibilitychange", visibilityChanged);
                host.removeEventListener?.("pagehide", pageHidden);
            },
        });
    }

    return Object.freeze({ create });
});
