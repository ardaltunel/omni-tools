(function initMillionaireAudio(root) {
    "use strict";

    let context = null;
    let musicTimer = 0;
    let settings = { sound: true, music: false };

    function ensureContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        if (!context) context = new AudioContext();
        if (context.state === "suspended") context.resume().catch(() => {});
        return context;
    }

    function setSettings(nextSettings = {}) {
        settings = { ...settings, ...nextSettings };
        if (!settings.music) stopMusic();
    }

    function playTone(frequency, duration, options = {}) {
        if (!settings.sound && !options.music) return;
        if (options.music && !settings.music) return;
        const audioContext = ensureContext();
        if (!audioContext) return;
        const startAt = audioContext.currentTime + (options.delay || 0);
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = options.type || "sine";
        oscillator.frequency.setValueAtTime(frequency, startAt);
        if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, startAt + duration);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(options.volume || 0.035, startAt + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.03);
    }

    function playSequence(notes, options = {}) {
        notes.forEach((note, index) => {
            playTone(note.frequency, note.duration || 0.18, {
                ...options,
                delay: (options.delay || 0) + (note.delay ?? index * 0.12),
                volume: note.volume || options.volume,
                type: note.type || options.type,
            });
        });
    }

    function startMusic() {
        if (!settings.music || musicTimer) return;
        ensureContext();
        const playAmbientBar = () => {
            [110, 146.83, 164.81].forEach((frequency, index) => {
                playTone(frequency, 3.4, { music: true, volume: 0.008, type: "sine", delay: index * 0.08 });
            });
        };
        playAmbientBar();
        musicTimer = window.setInterval(playAmbientBar, 3800);
    }

    function stopMusic() {
        if (musicTimer) window.clearInterval(musicTimer);
        musicTimer = 0;
    }

    const effects = Object.freeze({
        select() {
            playTone(420, 0.08, { volume: 0.02, endFrequency: 520 });
        },
        lock() {
            playSequence([
                { frequency: 220, duration: 0.22 },
                { frequency: 277.18, duration: 0.32 },
            ], { volume: 0.025, type: "triangle" });
        },
        correct() {
            playSequence([
                { frequency: 392, duration: 0.18 },
                { frequency: 523.25, duration: 0.22 },
                { frequency: 659.25, duration: 0.38 },
            ], { volume: 0.035, type: "sine" });
        },
        wrong() {
            playSequence([
                { frequency: 220, duration: 0.28 },
                { frequency: 164.81, duration: 0.46 },
            ], { volume: 0.035, type: "sawtooth" });
        },
        lifeline() {
            playSequence([
                { frequency: 330, duration: 0.14 },
                { frequency: 440, duration: 0.14 },
                { frequency: 554.37, duration: 0.28 },
            ], { volume: 0.022, type: "triangle" });
        },
        final() {
            playSequence([
                { frequency: 261.63, duration: 0.28 },
                { frequency: 329.63, duration: 0.28 },
                { frequency: 392, duration: 0.28 },
                { frequency: 523.25, duration: 0.7 },
            ], { volume: 0.04, type: "sine" });
        },
    });

    root.OmniMillionaireAudio = Object.freeze({ effects, setSettings, startMusic, stopMusic });
})(typeof globalThis !== "undefined" ? globalThis : window);
