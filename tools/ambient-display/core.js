(function initAmbientCore(root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.AmbientCore = api;
}(typeof globalThis !== "undefined" ? globalThis : window, function createAmbientCore() {
    "use strict";

    const STORAGE_KEY = "omni-ambient-display-v1";
    const DEFAULTS = Object.freeze({
        design: "aurora", palette: "black", language: "tr", hourFormat: "24",
        size: 100, position: "center", seconds: false, date: true,
        animations: true, intensity: 65, drift: false, wake: false, quality: "balanced",
    });

    function languageCode(value) {
        return typeof value === "string" && /^en(?:-|$)/i.test(value) ? "en" : "tr";
    }

    function boundedNumber(value, fallback, min, max) {
        if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
    }

    function normalizeSettings(input, fallbackLanguage = "tr") {
        const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
        const result = { ...DEFAULTS, language: languageCode(fallbackLanguage) };
        const choices = {
            design: ["aurora", "studio", "cyber"], palette: ["black", "ivory", "charcoal"],
            language: ["tr", "en"], hourFormat: ["24", "12"], position: ["center", "left", "right"],
            quality: ["low", "balanced", "high"],
        };
        Object.keys(choices).forEach((key) => {
            if (choices[key].includes(source[key])) result[key] = source[key];
        });
        ["seconds", "date", "animations", "drift", "wake"].forEach((key) => {
            if (typeof source[key] === "boolean") result[key] = source[key];
        });
        result.size = boundedNumber(source.size, DEFAULTS.size, 65, 130);
        result.intensity = boundedNumber(source.intensity, DEFAULTS.intensity, 0, 100);
        return result;
    }

    function formatClock(date, hourFormat = "24", language = "tr") {
        const hour = date.getHours();
        const twelveHour = hourFormat === "12";
        const hours = String(twelveHour ? (hour % 12 || 12) : hour).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        const period = twelveHour ? (language === "tr" ? (hour < 12 ? "ÖÖ" : "ÖS") : (hour < 12 ? "AM" : "PM")) : "";
        return { hours, minutes, seconds, period };
    }

    function formatDate(date, language = "tr") {
        return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "tr-TR", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
        }).format(date);
    }

    function localDateTime(date) {
        const pad = (value) => String(value).padStart(2, "0");
        const offset = -date.getTimezoneOffset();
        const zone = `${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
    }

    function nextClockDelay(date, showSeconds) {
        // A small margin avoids rendering the old second when a timer fires early.
        return (showSeconds ? 1000 : 60000) - date.getMilliseconds() - (showSeconds ? 0 : date.getSeconds() * 1000) + 12;
    }

    return Object.freeze({ STORAGE_KEY, DEFAULTS, languageCode, normalizeSettings, formatClock, formatDate, localDateTime, nextClockDelay });
}));
