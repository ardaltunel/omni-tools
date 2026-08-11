(function initForeheadCore(root, factory) {
    "use strict";

    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.OmniForeheadCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createForeheadCore() {
    "use strict";

    const STATES = Object.freeze({
        MENU: "MENU",
        PREPARING: "PREPARING",
        COUNTDOWN: "COUNTDOWN",
        PLAYING: "PLAYING",
        PAUSED_ORIENTATION: "PAUSED_ORIENTATION",
        FINISHED: "FINISHED",
    });

    const ALLOWED_TRANSITIONS = Object.freeze({
        [STATES.MENU]: new Set([STATES.PREPARING]),
        [STATES.PREPARING]: new Set([STATES.MENU, STATES.COUNTDOWN, STATES.PAUSED_ORIENTATION]),
        [STATES.COUNTDOWN]: new Set([STATES.MENU, STATES.PLAYING, STATES.PAUSED_ORIENTATION]),
        [STATES.PLAYING]: new Set([STATES.MENU, STATES.PAUSED_ORIENTATION, STATES.FINISHED]),
        [STATES.PAUSED_ORIENTATION]: new Set([STATES.MENU, STATES.PREPARING, STATES.COUNTDOWN, STATES.PLAYING, STATES.FINISHED]),
        [STATES.FINISHED]: new Set([STATES.MENU, STATES.PREPARING]),
    });

    function canTransition(from, to) {
        return Boolean(ALLOWED_TRANSITIONS[from]?.has(to));
    }

    function shuffle(values, random = Math.random) {
        const result = values.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    }

    function createDeck(categoryId, wordData, random = Math.random) {
        const category = wordData?.byId?.[categoryId];
        if (!category || !Array.isArray(category.words) || !category.words.length) {
            throw new TypeError("Geçerli bir kategori bulunamadı.");
        }
        return shuffle([...new Set(category.words)], random);
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function normalizeOrientationAngle(value) {
        const angle = Number(value || 0);
        return ((angle % 360) + 360) % 360;
    }

    function getTiltAxis(sample = {}) {
        const beta = Number(sample.beta);
        const gamma = Number(sample.gamma);
        const angle = normalizeOrientationAngle(sample.angle);
        if (angle === 90) return Number.isFinite(gamma) ? -gamma : null;
        if (angle === 270) return Number.isFinite(gamma) ? gamma : null;
        return Number.isFinite(beta) ? beta : null;
    }

    function angularDifference(value, reference) {
        let difference = value - reference;
        while (difference > 180) difference -= 360;
        while (difference < -180) difference += 360;
        return difference;
    }

    function median(values) {
        if (!values.length) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function createMotionDetector(options = {}) {
        const settings = {
            threshold: Number(options.threshold) || 24,
            neutralThreshold: Number(options.neutralThreshold) || 9,
            debounceMs: Number(options.debounceMs) || 520,
            calibrationSamples: Number(options.calibrationSamples) || 10,
            neutralSamples: Number(options.neutralSamples) || 3,
        };
        let samples = [];
        let reference = null;
        let current = null;
        let delta = 0;
        let locked = false;
        let neutralStreak = 0;
        let lastActionAt = -Infinity;
        let detectedAction = "-";

        function ingest(sample, now = Date.now()) {
            const axis = getTiltAxis(sample);
            if (!Number.isFinite(axis)) return snapshot("invalid");
            current = axis;

            if (!Number.isFinite(reference)) {
                samples.push(axis);
                if (samples.length >= settings.calibrationSamples) {
                    reference = median(samples);
                    delta = 0;
                    samples = [];
                    locked = false;
                    neutralStreak = settings.neutralSamples;
                    return snapshot("ready");
                }
                return snapshot("calibrating");
            }

            delta = angularDifference(axis, reference);
            if (locked) {
                if (Math.abs(delta) <= settings.neutralThreshold) neutralStreak += 1;
                else neutralStreak = 0;
                if (neutralStreak >= settings.neutralSamples) {
                    locked = false;
                    neutralStreak = settings.neutralSamples;
                    detectedAction = "neutral";
                    return snapshot("neutral");
                }
                return snapshot("locked");
            }

            if (Math.abs(delta) <= settings.neutralThreshold) {
                neutralStreak = Math.min(settings.neutralSamples, neutralStreak + 1);
                reference += delta * 0.025;
                delta = angularDifference(axis, reference);
                return snapshot("neutral");
            }

            neutralStreak = 0;
            if (Math.abs(delta) < settings.threshold || now - lastActionAt < settings.debounceMs) {
                return snapshot("moving");
            }

            locked = true;
            lastActionAt = now;
            detectedAction = delta > 0 ? "correct" : "pass";
            return { ...snapshot("action"), action: detectedAction };
        }

        function reset() {
            samples = [];
            reference = null;
            current = null;
            delta = 0;
            locked = false;
            neutralStreak = 0;
            lastActionAt = -Infinity;
            detectedAction = "-";
        }

        function forceLock(now = Date.now()) {
            locked = true;
            neutralStreak = 0;
            lastActionAt = now;
        }

        function snapshot(status = "idle") {
            return {
                status,
                calibrated: Number.isFinite(reference),
                reference,
                current,
                delta,
                locked,
                neutralStreak,
                detectedAction,
                calibrationProgress: Number.isFinite(reference) ? 1 : samples.length / settings.calibrationSamples,
            };
        }

        return Object.freeze({ forceLock, ingest, reset, snapshot });
    }

    function detectDevice(environment = {}) {
        const userAgent = String(environment.userAgent || "");
        const viewportWidth = Number(environment.viewportWidth || 0);
        const maxTouchPoints = Number(environment.maxTouchPoints || 0);
        const touchCapable = Boolean(environment.touchCapable || maxTouchPoints > 0);
        const coarsePointer = Boolean(environment.coarsePointer);
        const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(userAgent);
        const tabletUa = /iPad|Tablet|Silk/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
        const compactViewport = viewportWidth > 0 && viewportWidth <= 1180;
        const mobileLike = Boolean(environment.mobileDebug || (touchCapable && coarsePointer && (compactViewport || mobileUa)) || (mobileUa && touchCapable));
        return {
            mobileLike,
            deviceType: tabletUa ? "Tablet" : (mobileLike ? "Telefon" : "Masaüstü"),
            touchCapable,
            coarsePointer,
            orientationSupported: Boolean(environment.orientationSupported),
        };
    }

    return Object.freeze({
        STATES,
        canTransition,
        createDeck,
        createMotionDetector,
        detectDevice,
        formatTime,
        getTiltAxis,
        normalizeOrientationAngle,
        shuffle,
    });
});
