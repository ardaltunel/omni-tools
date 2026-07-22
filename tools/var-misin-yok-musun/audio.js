(function () {
    "use strict";

    let context = null;
    let master = null;
    let enabled = true;

    function setEnabled(value) {
        enabled = Boolean(value);
    }

    function getContext() {
        if (!enabled) return null;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!context) context = new AudioContextClass();
        if (!master) createMasterBus();
        if (context.state === "suspended") context.resume().catch(() => {});
        return context;
    }

    function createMasterBus() {
        master = context.createDynamicsCompressor();
        master.threshold.value = -18;
        master.knee.value = 18;
        master.ratio.value = 5;
        master.attack.value = 0.004;
        master.release.value = 0.22;
        master.connect(context.destination);
    }

    function tone(frequency, duration, options = {}) {
        const audio = getContext();
        if (!audio) return;

        const oscillator = audio.createOscillator();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const start = audio.currentTime + (options.delay || 0);
        const attack = Math.min(options.attack ?? 0.012, duration * 0.3);
        const release = Math.min(options.release ?? 0.16, duration * 0.55);
        const volume = options.volume ?? 0.035;

        oscillator.type = options.type || "sine";
        oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
        if (options.detune) oscillator.detune.setValueAtTime(options.detune, start);
        if (options.endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), start + duration);
        }

        filter.type = options.filterType || "lowpass";
        filter.frequency.setValueAtTime(options.filterFrequency || 7600, start);
        filter.Q.value = options.filterQ || 0.6;

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + attack);
        gain.gain.setValueAtTime(volume, Math.max(start + attack, start + duration - release));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(filter).connect(gain).connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.04);
    }

    function noise(duration = 0.18, options = {}) {
        const audio = getContext();
        if (!audio) return;

        const start = audio.currentTime + (options.delay || 0);
        const length = Math.floor(audio.sampleRate * duration);
        const buffer = audio.createBuffer(1, length, audio.sampleRate);
        const channel = buffer.getChannelData(0);
        const source = audio.createBufferSource();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const volume = options.volume ?? 0.018;

        for (let index = 0; index < length; index += 1) {
            const envelope = 1 - (index / length);
            channel[index] = ((Math.random() * 2) - 1) * envelope;
        }

        source.buffer = buffer;
        filter.type = options.filterType || "bandpass";
        filter.frequency.value = options.filterFrequency || 1400;
        filter.Q.value = options.filterQ || 0.8;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter).connect(gain).connect(master);
        source.start(start);
    }

    function chord(frequencies, duration, options = {}) {
        frequencies.forEach((frequency, index) => tone(frequency, duration, {
            ...options,
            delay: (options.delay || 0) + (index * (options.spacing || 0)),
            volume: (options.volume ?? 0.035) / Math.max(1, Math.sqrt(frequencies.length)),
        }));
    }

    function ringBurst(delay) {
        [425, 475].forEach((frequency) => {
            tone(frequency, 0.34, {
                delay,
                type: "sine",
                volume: 0.034,
                attack: 0.018,
                release: 0.05,
                filterFrequency: 1900,
            });
        });
        tone(850, 0.34, {
            delay,
            type: "triangle",
            volume: 0.008,
            attack: 0.018,
            release: 0.05,
            filterFrequency: 2300,
        });
    }

    const effects = {
        button() {
            tone(760, 0.065, { type: "triangle", volume: 0.018, endFrequency: 980, release: 0.025 });
            tone(1280, 0.045, { delay: 0.025, type: "sine", volume: 0.009, release: 0.018 });
        },
        start() {
            tone(147, 0.72, { type: "sine", volume: 0.035, endFrequency: 196, filterFrequency: 900 });
            [294, 370, 440, 587].forEach((frequency, index) => tone(frequency, 0.4, {
                delay: 0.08 + (index * 0.11),
                type: "triangle",
                volume: 0.032,
                attack: 0.018,
                release: 0.2,
                filterFrequency: 3200,
            }));
        },
        caseOpen() {
            tone(84, 0.3, { type: "sine", volume: 0.065, endFrequency: 46, attack: 0.004, filterFrequency: 520 });
            tone(1380, 0.12, { delay: 0.018, type: "triangle", volume: 0.025, endFrequency: 310, release: 0.07, filterFrequency: 2600 });
            tone(910, 0.08, { delay: 0.085, type: "sine", volume: 0.018, endFrequency: 520, release: 0.04 });
            noise(0.19, { volume: 0.024, filterType: "highpass", filterFrequency: 1050, filterQ: 0.5 });
        },
        reveal(isHigh) {
            if (isHigh) {
                tone(196, 0.72, { type: "triangle", volume: 0.048, endFrequency: 131, attack: 0.012, filterFrequency: 1500 });
                tone(98, 0.86, { delay: 0.045, type: "sine", volume: 0.055, endFrequency: 55, filterFrequency: 480 });
                tone(294, 0.58, { delay: 0.12, type: "sine", volume: 0.024, endFrequency: 185, filterFrequency: 1800 });
                noise(0.42, { delay: 0.02, volume: 0.018, filterType: "lowpass", filterFrequency: 420 });
                return;
            }
            chord([523, 659, 784], 0.52, { type: "triangle", volume: 0.045, spacing: 0.075, filterFrequency: 4200, release: 0.28 });
            tone(1047, 0.34, { delay: 0.24, type: "sine", volume: 0.018, filterFrequency: 5200 });
        },
        phone() {
            ringBurst(0);
            ringBurst(0.62);
            noise(0.08, { delay: 0.02, volume: 0.008, filterType: "bandpass", filterFrequency: 1100 });
            noise(0.08, { delay: 0.64, volume: 0.008, filterType: "bandpass", filterFrequency: 1100 });
        },
        accept() {
            tone(131, 0.82, { type: "sine", volume: 0.042, endFrequency: 196, filterFrequency: 700 });
            [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, 0.48, {
                delay: index * 0.095,
                type: "triangle",
                volume: 0.04,
                attack: 0.012,
                release: 0.24,
                filterFrequency: 4600,
            }));
        },
        reject() {
            noise(0.2, { volume: 0.015, filterType: "highpass", filterFrequency: 1250 });
            tone(220, 0.28, { type: "triangle", volume: 0.035, endFrequency: 294, filterFrequency: 1800 });
            tone(392, 0.3, { delay: 0.12, type: "sine", volume: 0.025, endFrequency: 440, filterFrequency: 2800 });
        },
        dramatic() {
            tone(73, 1.42, { type: "sine", volume: 0.052, endFrequency: 55, attack: 0.08, release: 0.4, filterFrequency: 420 });
            tone(110, 1.32, { delay: 0.05, type: "triangle", volume: 0.03, endFrequency: 82, attack: 0.12, release: 0.38, filterFrequency: 760 });
            tone(180, 1.18, { delay: 0.12, type: "sawtooth", volume: 0.012, endFrequency: 360, attack: 0.32, release: 0.28, filterFrequency: 1150 });
            noise(1.05, { delay: 0.15, volume: 0.009, filterType: "lowpass", filterFrequency: 360 });
        },
        win() {
            noise(1.25, { volume: 0.014, filterType: "bandpass", filterFrequency: 1850, filterQ: 0.35 });
            tone(196, 1.1, { type: "sine", volume: 0.04, endFrequency: 262, filterFrequency: 800 });
            [392, 523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, 0.58, {
                delay: 0.04 + (index * 0.11),
                type: "triangle",
                volume: 0.044,
                attack: 0.015,
                release: 0.3,
                filterFrequency: 5200,
            }));
        },
    };

    window.OmniDealAudio = Object.freeze({ effects, setEnabled });
}());
