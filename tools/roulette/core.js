(function initRouletteCore(root, factory) {
    "use strict";

    const core = factory();
    if (typeof module === "object" && module.exports) module.exports = core;
    else root.OmniRouletteCore = core;
})(typeof globalThis !== "undefined" ? globalThis : window, function createRouletteCore() {
    "use strict";

    const STARTING_BALANCE = 10000;
    const HISTORY_LIMIT = 20;
    const UNDO_LIMIT = 50;
    const SNAPSHOT_VERSION = 1;
    const WHEEL_ORDER = Object.freeze([
        0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
        5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
    ]);
    const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    function validNumber(number) {
        return Number.isInteger(number) && number >= 0 && number <= 36;
    }

    function getColor(number) {
        if (!validNumber(number)) return null;
        if (number === 0) return "green";
        return RED_NUMBERS.has(number) ? "red" : "black";
    }

    const POCKETS = Object.freeze(WHEEL_ORDER.map((number) => Object.freeze({ number, color: getColor(number) })));

    function defineBets() {
        const bets = [];
        const add = (type, numbers, multiplier, id = `${type}:${numbers.join("-")}`, label = numbers.join(" / ")) => {
            bets.push(Object.freeze({ id, type, numbers: Object.freeze(numbers), payoutMultiplier: multiplier, label }));
        };
        for (let number = 0; number <= 36; number += 1) add("straight", [number], 36);
        for (let number = 1; number <= 3; number += 1) add("split", [0, number], 18);
        for (let first = 1; first <= 34; first += 3) {
            add("street", [first, first + 1, first + 2], 12);
            for (let column = 0; column < 2; column += 1) add("split", [first + column, first + column + 1], 18);
            if (first > 31) continue;
            add("sixline", Array.from({ length: 6 }, (_, offset) => first + offset), 6);
            for (let column = 0; column < 3; column += 1) add("split", [first + column, first + column + 3], 18);
            for (let column = 0; column < 2; column += 1) {
                add("corner", [first + column, first + column + 1, first + column + 3, first + column + 4], 9);
            }
        }
        add("trio", [0, 1, 2], 12);
        add("trio", [0, 2, 3], 12);
        add("firstfour", [0, 1, 2, 3], 9);
        for (let index = 1; index <= 3; index += 1) {
            add("dozen", Array.from({ length: 12 }, (_, offset) => (index - 1) * 12 + offset + 1), 3, `dozen:${index}`, `${index}. 12`);
            add("column", Array.from({ length: 12 }, (_, offset) => index + offset * 3), 3, `column:${index}`, `${index}. sütun`);
        }
        const nonzero = Array.from({ length: 36 }, (_, index) => index + 1);
        add("red", nonzero.filter((number) => RED_NUMBERS.has(number)), 2, "red", "Kırmızı");
        add("black", nonzero.filter((number) => !RED_NUMBERS.has(number)), 2, "black", "Siyah");
        add("even", nonzero.filter((number) => number % 2 === 0), 2, "even", "Çift");
        add("odd", nonzero.filter((number) => number % 2 === 1), 2, "odd", "Tek");
        add("low", nonzero.slice(0, 18), 2, "low", "1–18");
        add("high", nonzero.slice(18), 2, "high", "19–36");
        return Object.freeze(bets);
    }

    const BET_DEFINITIONS = defineBets();
    const BETS_BY_ID = new Map(BET_DEFINITIONS.map((bet) => [bet.id, bet]));

    function getBet(id) {
        return BETS_BY_ID.get(id) || null;
    }

    function isMoney(amount) {
        return Number.isSafeInteger(amount) && amount >= 0;
    }

    function sumBets(bets) {
        return Object.values(bets).reduce((sum, amount) => sum + amount, 0);
    }

    function readBets(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const bets = {};
        for (const [id, amount] of Object.entries(value)) {
            if (!getBet(id) || !isMoney(amount) || amount === 0) return null;
            bets[id] = amount;
        }
        return isMoney(sumBets(bets)) ? bets : null;
    }

    function evaluateBets(bets, number) {
        const winningBets = [];
        let payout = 0;
        for (const [id, amount] of Object.entries(bets)) {
            const bet = getBet(id);
            if (bet.numbers.includes(number)) {
                const betPayout = amount * bet.payoutMultiplier;
                payout += betPayout;
                winningBets.push({ id, amount, payout: betPayout });
            }
        }
        return { payout, winningBets };
    }

    function calculatePayout(bets, number) {
        const validBets = readBets(bets);
        if (!validBets || !validNumber(number)) return null;
        const { payout } = evaluateBets(validBets, number);
        return isMoney(payout) ? payout : null;
    }

    function secureRandomInt(max, cryptoSource = globalThis.crypto) {
        if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new RangeError("Rastgele sayı aralığı geçersiz.");
        if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") throw new Error("Güvenli rastgele sayı üretimi kullanılamıyor.");
        const sample = new Uint32Array(1);
        const limit = 0x100000000 - (0x100000000 % max);
        do {
            cryptoSource.getRandomValues(sample);
        } while (sample[0] >= limit);
        return sample[0] % max;
    }

    function createState(options = {}) {
        return {
            balance: isMoney(options.balance) ? options.balance : STARTING_BALANCE,
            bets: {},
            lastBets: {},
            undoStack: [],
            phase: "betting",
            pending: null,
            history: [],
            nextSpinId: 1,
        };
    }

    function totalBet(state) {
        return state?.bets ? sumBets(state.bets) : 0;
    }

    function changeBets(state, bets) {
        if (!state || state.phase !== "betting" || !bets || sumBets(bets) > state.balance || sameBets(state.bets, bets)) return null;
        return { ...state, bets, undoStack: [...state.undoStack, { ...state.bets }].slice(-UNDO_LIMIT) };
    }

    function setBet(state, id, amount) {
        if (!state || !getBet(id) || !isMoney(amount)) return null;
        const bets = { ...state.bets };
        if (amount === 0) delete bets[id];
        else bets[id] = amount;
        if (!isMoney(sumBets(bets))) return null;
        return changeBets(state, bets);
    }

    function addBet(state, id, amount) {
        if (!state || !isMoney(amount) || amount === 0) return null;
        return setBet(state, id, (state.bets[id] || 0) + amount);
    }

    function undoBet(state) {
        if (!state || state.phase !== "betting" || !state.undoStack.length) return null;
        const bets = state.undoStack[state.undoStack.length - 1];
        return { ...state, bets: { ...bets }, undoStack: state.undoStack.slice(0, -1) };
    }

    function clearBets(state) {
        return totalBet(state) ? changeBets(state, {}) : null;
    }

    function repeatBets(state) {
        return state && sumBets(state.lastBets) ? changeBets(state, { ...state.lastBets }) : null;
    }

    function doubleBets(state) {
        if (!state) return null;
        const doubled = Object.fromEntries(Object.entries(state.bets).map(([id, amount]) => [id, amount * 2]));
        return readBets(doubled) && sumBets(doubled) ? changeBets(state, doubled) : null;
    }

    function beginSpin(state, cryptoSource = globalThis.crypto) {
        if (!state || state.phase !== "betting" || !totalBet(state) || totalBet(state) > state.balance
            || !Number.isSafeInteger(state.nextSpinId + 1)) return null;
        const stake = totalBet(state);
        const balance = state.balance - stake;
        if (WHEEL_ORDER.some((number) => !isMoney(balance + evaluateBets(state.bets, number).payout))) return null;

        const number = secureRandomInt(37, cryptoSource);
        return {
            ...state,
            balance,
            bets: { ...state.bets },
            lastBets: { ...state.bets },
            undoStack: [],
            phase: "spinning",
            pending: { id: state.nextSpinId, number, bets: { ...state.bets }, stake },
            nextSpinId: state.nextSpinId + 1,
        };
    }

    function settleSpin(state) {
        if (!state || state.phase !== "spinning" || !state.pending) return null;
        const { id, number, bets, stake } = state.pending;
        const { payout, winningBets } = evaluateBets(bets, number);
        const result = {
            id, number, color: getColor(number), bets: { ...bets }, stake, payout,
            net: payout - stake, balance: state.balance + payout, winningBets,
        };
        return {
            state: {
                ...state, balance: result.balance, bets: {}, pending: null, phase: "betting",
                history: [result, ...state.history].slice(0, HISTORY_LIMIT),
            },
            result,
        };
    }

    function replenishBalance(state) {
        if (!state || state.phase !== "betting" || state.balance >= 1 || totalBet(state)) return null;
        return { ...state, balance: STARTING_BALANCE, undoStack: [] };
    }

    function serializeState(state) {
        return {
            version: SNAPSHOT_VERSION,
            balance: state.balance,
            bets: { ...state.bets },
            lastBets: { ...state.lastBets },
            undoStack: state.undoStack.map((bets) => ({ ...bets })),
            phase: state.phase,
            pending: state.pending ? { ...state.pending, bets: { ...state.pending.bets } } : null,
            history: state.history.map((result) => ({ ...result, bets: { ...result.bets }, winningBets: result.winningBets.map((bet) => ({ ...bet })) })),
            nextSpinId: state.nextSpinId,
        };
    }

    function sameBets(first, second) {
        const keys = Object.keys(first);
        return keys.length === Object.keys(second).length && keys.every((id) => first[id] === second[id]);
    }

    function readResult(value) {
        if (!value || !Number.isSafeInteger(value.id) || value.id < 1 || !validNumber(value.number) || !isMoney(value.balance)) return null;
        const bets = readBets(value.bets);
        if (!bets || !sumBets(bets)) return null;
        const stake = sumBets(bets);
        const { payout, winningBets } = evaluateBets(bets, value.number);
        if (!isMoney(payout) || value.balance < payout || value.stake !== stake || value.payout !== payout || value.net !== payout - stake) return null;
        return { id: value.id, number: value.number, color: getColor(value.number), bets, stake, payout, net: payout - stake, balance: value.balance, winningBets };
    }

    function restoreState(snapshot) {
        if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !isMoney(snapshot.balance)
            || !["betting", "spinning"].includes(snapshot.phase)
            || !Number.isSafeInteger(snapshot.nextSpinId) || snapshot.nextSpinId < 1
            || !Array.isArray(snapshot.undoStack) || snapshot.undoStack.length > UNDO_LIMIT
            || !Array.isArray(snapshot.history) || snapshot.history.length > HISTORY_LIMIT) return null;
        const bets = readBets(snapshot.bets);
        const lastBets = readBets(snapshot.lastBets);
        const undoStack = Array.from(snapshot.undoStack, readBets);
        const history = Array.from(snapshot.history, readResult);
        if (!bets || !lastBets || undoStack.includes(null) || history.includes(null)) return null;
        let previousId = snapshot.nextSpinId;
        for (const result of history) {
            if (result.id >= previousId) return null;
            previousId = result.id;
        }

        let pending = null;
        if (snapshot.phase === "spinning") {
            const value = snapshot.pending;
            const pendingBets = readBets(value?.bets);
            if (!value || value.id !== snapshot.nextSpinId - 1 || value.id < 1 || !validNumber(value.number)
                || !pendingBets || !sameBets(pendingBets, bets) || !sameBets(pendingBets, lastBets)
                || !value.stake || value.stake !== sumBets(pendingBets) || undoStack.length
                || !isMoney(snapshot.balance + value.stake)
                || (history.length && history[0].id >= value.id)
                || WHEEL_ORDER.some((number) => !isMoney(snapshot.balance + evaluateBets(pendingBets, number).payout))) return null;
            pending = { id: value.id, number: value.number, bets: pendingBets, stake: value.stake };
        } else if (snapshot.pending !== null || sumBets(bets) > snapshot.balance) return null;
        if (undoStack.some((entry) => sumBets(entry) > snapshot.balance)) return null;
        return { balance: snapshot.balance, bets, lastBets, undoStack, phase: snapshot.phase, pending, history, nextSpinId: snapshot.nextSpinId };
    }

    return Object.freeze({
        STARTING_BALANCE, HISTORY_LIMIT, UNDO_LIMIT, WHEEL_ORDER, POCKETS, BET_DEFINITIONS,
        getColor, getBet, calculatePayout, secureRandomInt, createState, totalBet,
        setBet, addBet, undoBet, clearBets, repeatBets, doubleBets,
        beginSpin, settleSpin, replenishBalance, serializeState, restoreState,
    });
});
