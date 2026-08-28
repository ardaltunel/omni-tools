(function initOddColorCore(root, factory) {
    "use strict";

    const config = typeof module === "object" && module.exports
        ? require("./config.js")
        : root.OddColorConfig;
    const api = factory(config);

    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.OddColorCore = api;
}(typeof globalThis !== "undefined" ? globalThis : window, function createOddColorCore(config) {
    "use strict";

    if (!config) throw new Error("Farklı Rengi Bul yapılandırması bulunamadı.");

    const EMPTY_STATS = Object.freeze({ highestLevel: 0, totalGames: 0, bestScore: 0 });

    function toLevel(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 1;
    }

    function safeRandom(random) {
        const value = Number((typeof random === "function" ? random : Math.random)());
        if (!Number.isFinite(value)) return 0.5;
        return Math.min(0.999999999999, Math.max(0, value));
    }

    function round(value, precision = 2) {
        const factor = 10 ** precision;
        return Math.round(value * factor) / factor;
    }

    function getGridSize(level) {
        return Math.min(config.MAX_GRID_SIZE, config.STARTING_GRID_SIZE + toLevel(level) - 1);
    }

    function getColorDifference(level) {
        // Üstel azalma ilk turları erişilebilir tutarken farkı hiçbir zaman sıfırlamaz.
        return 0.35 + (18.5 * Math.exp(-0.085 * (toLevel(level) - 1)));
    }

    function hslToCss(color) {
        return `hsl(${round(color.h)} ${round(color.s)}% ${round(color.l)}%)`;
    }

    function applyBoundedOffset(value, difference, min, max, preferPositive) {
        const canAdd = value + difference <= max;
        const canSubtract = value - difference >= min;
        if ((preferPositive && canAdd) || !canSubtract) return value + difference;
        return value - difference;
    }

    function createColorPair(level, random = Math.random) {
        const difference = getColorDifference(level);
        const base = {
            h: safeRandom(random) * 360,
            s: 45 + (safeRandom(random) * 30),
            l: 35 + (safeRandom(random) * 30),
        };
        const odd = { ...base };
        const channel = Math.floor(safeRandom(random) * 3);
        const preferPositive = safeRandom(random) >= 0.5;

        if (channel === 0) {
            const hueDifference = difference * 1.35;
            odd.h = (base.h + (preferPositive ? hueDifference : -hueDifference) + 360) % 360;
        } else if (channel === 1) {
            odd.s = applyBoundedOffset(base.s, difference, 15, 95, preferPositive);
        } else {
            odd.l = applyBoundedOffset(base.l, difference, 10, 90, preferPositive);
        }

        const baseCss = hslToCss(base);
        let oddCss = hslToCss(odd);
        // Yuvarlama çok ileri seviyelerde bile renklerin eşit metne dönüşmesine izin vermez.
        if (oddCss === baseCss) {
            odd.l = Math.min(90, base.l + 0.01);
            if (odd.l === base.l) odd.l = Math.max(10, base.l - 0.01);
            oddCss = hslToCss(odd);
        }

        return { base, odd, baseCss, oddCss, difference };
    }

    function createRound(level, random = Math.random) {
        const safeLevel = toLevel(level);
        const gridSize = getGridSize(safeLevel);
        const cellCount = gridSize * gridSize;
        const colors = createColorPair(safeLevel, random);
        const oddIndex = Math.floor(safeRandom(random) * cellCount);
        const cells = Array.from({ length: cellCount }, (_, index) => (
            index === oddIndex ? colors.oddCss : colors.baseCss
        ));

        return {
            level: safeLevel,
            gridSize,
            cellCount,
            oddIndex,
            baseColor: colors.baseCss,
            oddColor: colors.oddCss,
            colorDifference: colors.difference,
            cells,
        };
    }

    function shuffleRound(round, random = Math.random) {
        if (!round || !Number.isInteger(round.cellCount) || round.cellCount < 2) return round;
        const currentOddIndex = Number.isInteger(round.oddIndex) ? round.oddIndex : 0;
        const offset = 1 + Math.floor(safeRandom(random) * (round.cellCount - 1));
        const oddIndex = (currentOddIndex + offset) % round.cellCount;
        const cells = Array.from({ length: round.cellCount }, (_, index) => (
            index === oddIndex ? round.oddColor : round.baseColor
        ));

        return { ...round, oddIndex, cells };
    }

    function createShuffleOrder(cellCount, oldOddIndex, newOddIndex, random = Math.random) {
        const count = Math.max(0, Math.floor(Number(cellCount)) || 0);
        if (count < 2) return Array.from({ length: count }, (_, index) => index);

        const oldIndex = Math.max(0, Math.min(count - 1, Math.floor(Number(oldOddIndex)) || 0));
        const newIndex = Math.max(0, Math.min(count - 1, Math.floor(Number(newOddIndex)) || 0));
        const sourceIndexes = Array.from({ length: count }, (_, index) => index)
            .filter((index) => index !== oldIndex);
        const targetIndexes = Array.from({ length: count }, (_, index) => index)
            .filter((index) => index !== newIndex);

        for (let index = sourceIndexes.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(safeRandom(random) * (index + 1));
            [sourceIndexes[index], sourceIndexes[swapIndex]] = [sourceIndexes[swapIndex], sourceIndexes[index]];
        }

        const order = Array(count);
        order[newIndex] = oldIndex;
        targetIndexes.forEach((targetIndex, index) => {
            order[targetIndex] = sourceIndexes[index];
        });
        return order;
    }

    function createInitialState() {
        return {
            status: "idle",
            level: 1,
            lives: config.STARTING_LIVES,
            correctAnswers: 0,
            wrongSelections: 0,
            endReason: null,
            round: null,
        };
    }

    function startGame(random = Math.random) {
        return {
            ...createInitialState(),
            status: "playing",
            round: createRound(1, random),
        };
    }

    function endGame(state, reason = "lives") {
        if (!state || state.status === "finished") return state;
        return { ...state, status: "finished", endReason: reason };
    }

    function selectCell(state, index, random = Math.random) {
        if (!state || state.status !== "playing" || !state.round) {
            return { state, outcome: "ignored" };
        }

        const safeIndex = Number(index);
        if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= state.round.cellCount) {
            return { state, outcome: "ignored" };
        }

        if (safeIndex === state.round.oddIndex) {
            const nextLevel = state.level + 1;
            return {
                outcome: "correct",
                state: {
                    ...state,
                    level: nextLevel,
                    lives: config.STARTING_LIVES,
                    correctAnswers: state.correctAnswers + 1,
                    round: createRound(nextLevel, random),
                },
            };
        }

        const lives = Math.max(0, state.lives - 1);
        const nextState = {
            ...state,
            lives,
            wrongSelections: state.wrongSelections + 1,
        };
        return {
            outcome: lives === 0 ? "gameover" : "wrong",
            state: lives === 0 ? endGame(nextState, "lives") : nextState,
        };
    }

    function normalizeStat(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
    }

    function normalizeStats(value) {
        const source = value && typeof value === "object" ? value : EMPTY_STATS;
        return {
            highestLevel: normalizeStat(source.highestLevel),
            totalGames: normalizeStat(source.totalGames),
            bestScore: normalizeStat(source.bestScore),
        };
    }

    function updateStats(value, state) {
        const stats = normalizeStats(value);
        const game = state && typeof state === "object" ? state : createInitialState();
        return {
            highestLevel: Math.max(stats.highestLevel, toLevel(game.level)),
            totalGames: stats.totalGames + 1,
            bestScore: Math.max(stats.bestScore, normalizeStat(game.correctAnswers)),
        };
    }

    return Object.freeze({
        EMPTY_STATS,
        getGridSize,
        getColorDifference,
        createColorPair,
        createRound,
        shuffleRound,
        createShuffleOrder,
        createInitialState,
        startGame,
        selectCell,
        endGame,
        normalizeStats,
        updateStats,
    });
}));
