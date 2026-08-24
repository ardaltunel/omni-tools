(function initPasswordGameUtils(root) {
    "use strict";

    function hashSeed(value) {
        let hash = 2166136261;
        for (const character of String(value)) {
            hash ^= character.codePointAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function createRandom(seed) {
        let state = hashSeed(seed) || 0x9e3779b9;
        return function random() {
            state += 0x6d2b79f5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pick(random, values) {
        return values[Math.floor(random() * values.length)];
    }

    function sample(random, values, count) {
        const pool = Array.from(values);
        const selected = [];
        while (pool.length && selected.length < count) {
            selected.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
        }
        return selected;
    }

    function normalize(value) {
        return String(value || "").normalize("NFKC").toLocaleLowerCase("tr-TR");
    }

    function characters(value) {
        return Array.from(String(value || ""));
    }

    function digitSum(value) {
        return (String(value || "").match(/[0-9]/g) || []).reduce((sum, digit) => sum + Number(digit), 0);
    }

    function reverseText(value) {
        return characters(value).reverse().join("");
    }

    function isPrime(value) {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 2) return false;
        if (number === 2) return true;
        if (number % 2 === 0) return false;
        for (let divisor = 3; divisor * divisor <= number; divisor += 2) {
            if (number % divisor === 0) return false;
        }
        return true;
    }

    function nextPrime(value) {
        let candidate = Math.max(2, Math.ceil(value));
        while (!isPrime(candidate)) candidate += 1;
        return candidate;
    }

    function formatTime(totalSeconds) {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }

    root.PasswordGameUtils = Object.freeze({
        hashSeed,
        createRandom,
        pick,
        sample,
        normalize,
        characters,
        digitSum,
        reverseText,
        isPrime,
        nextPrime,
        formatTime,
    });
}(typeof window !== "undefined" ? window : globalThis));
