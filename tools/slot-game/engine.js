(function initSlotGameEngine(root, factory) {
    "use strict";

    const engine = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = engine;
    } else {
        root.OmniSlotGameEngine = engine;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createSlotGameEngine() {
    "use strict";

    const ROWS = 5;
    const COLUMNS = 6;
    const STARTING_BALANCE = 10000;
    const AUTO_REPLENISH_THRESHOLD = 100;
    const BET_OPTIONS = Object.freeze([
        20,
        50,
        100,
        200,
        500,
        1000,
        2000,
        5000,
        10000,
        20000,
        50000,
        100000,
        200000,
        500000,
    ]);
    const MULTIPLIER_VALUES = Object.freeze([2, 3, 5, 10, 25, 50, 100]);
    const PAYOUT_THRESHOLDS = Object.freeze([8, 10, 12, 15, 20, 25]);
    const BONUS_BUY_COST_MULTIPLIER = 50;
    const BONUS_BUY_FREE_SPINS = 10;

    const SYMBOLS = Object.freeze([
        Object.freeze({ id: "spark", label: "Astral Kıvılcım", weight: 20, pays: Object.freeze([0.2, 0.35, 0.6, 1, 2, 5]) }),
        Object.freeze({ id: "orbit", label: "Yörünge", weight: 17, pays: Object.freeze([0.25, 0.45, 0.75, 1.25, 2.5, 6]) }),
        Object.freeze({ id: "moon", label: "Hilal", weight: 14, pays: Object.freeze([0.3, 0.55, 0.9, 1.5, 3, 7.5]) }),
        Object.freeze({ id: "prism", label: "Prizma", weight: 12, pays: Object.freeze([0.4, 0.75, 1.2, 2, 4, 10]) }),
        Object.freeze({ id: "bloom", label: "Nebula Çiçeği", weight: 10, pays: Object.freeze([0.5, 1, 1.75, 3, 6, 15]) }),
        Object.freeze({ id: "sigil", label: "Yıldız Mührü", weight: 9, pays: Object.freeze([0.75, 1.5, 2.5, 5, 10, 25]) }),
        Object.freeze({ id: "rune", label: "Kozmik Rün", weight: 7, pays: Object.freeze([0.35, 0.65, 1.1, 1.8, 3.5, 9]) }),
        Object.freeze({ id: "nova", label: "Nova Çekirdeği", weight: 5, pays: Object.freeze([0.6, 1.2, 2, 4, 8, 20]) }),
    ]);

    const SYMBOL_BY_ID = Object.freeze(Object.fromEntries(SYMBOLS.map((symbol) => [symbol.id, symbol])));
    const MULTIPLIER_WEIGHTS = Object.freeze([
        Object.freeze({ value: 2, weight: 52 }),
        Object.freeze({ value: 3, weight: 27 }),
        Object.freeze({ value: 5, weight: 12 }),
        Object.freeze({ value: 10, weight: 6 }),
        Object.freeze({ value: 25, weight: 2 }),
        Object.freeze({ value: 50, weight: 0.8 }),
        Object.freeze({ value: 100, weight: 0.2 }),
    ]);

    let cellSequence = 0;

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function normalizeRandomValue(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.min(0.999999999, Math.max(0, value));
    }

    function weightedPick(entries, random = Math.random) {
        const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
        let cursor = normalizeRandomValue(random()) * totalWeight;
        for (const entry of entries) {
            cursor -= entry.weight;
            if (cursor < 0) return entry;
        }
        return entries[entries.length - 1];
    }

    function nextUid() {
        cellSequence += 1;
        return `slot-cell-${cellSequence}`;
    }

    function createCell(kind, id, value = null, uid = nextUid()) {
        return Object.freeze({ kind, id, value, uid });
    }

    function createCellWithFeatureWeights(random = Math.random, weights = {}) {
        const scatterWeight = Number.isFinite(weights.scatter) ? weights.scatter : 2.2;
        const multiplierWeight = Number.isFinite(weights.multiplier) ? weights.multiplier : 1.6;
        const type = weightedPick([
            { kind: "regular", weight: Math.max(0, 100 - scatterWeight - multiplierWeight) },
            { kind: "scatter", weight: scatterWeight },
            { kind: "multiplier", weight: multiplierWeight },
        ], random);

        if (type.kind === "scatter") return createCell("scatter", "gateway");
        if (type.kind === "multiplier") {
            const multiplier = weightedPick(MULTIPLIER_WEIGHTS, random).value;
            return createCell("multiplier", "power-orb", multiplier);
        }

        const symbol = weightedPick(SYMBOLS, random);
        return createCell("regular", symbol.id);
    }

    function createRandomCell(random = Math.random) {
        return createCellWithFeatureWeights(random);
    }

    function createFreeSpinCell(random = Math.random) {
        return createCellWithFeatureWeights(random, { scatter: 2.4, multiplier: 1.8 });
    }

    function createGrid(random = Math.random, cellFactory = createRandomCell) {
        return Array.from({ length: ROWS }, () => (
            Array.from({ length: COLUMNS }, () => cellFactory(random))
        ));
    }

    function isValidGrid(grid) {
        return Array.isArray(grid)
            && grid.length === ROWS
            && grid.every((row) => Array.isArray(row) && row.length === COLUMNS && row.every(Boolean));
    }

    function cloneGrid(grid) {
        if (!isValidGrid(grid)) throw new Error("Slot grid'i 6x5 olmalıdır.");
        return grid.map((row) => row.slice());
    }

    function payoutFor(symbolId, count) {
        const symbol = SYMBOL_BY_ID[symbolId];
        if (!symbol || count < PAYOUT_THRESHOLDS[0]) return 0;
        let tier = 0;
        PAYOUT_THRESHOLDS.forEach((threshold, index) => {
            if (count >= threshold) tier = index;
        });
        return symbol.pays[tier];
    }

    function findWins(grid) {
        if (!isValidGrid(grid)) return [];
        const positionsBySymbol = new Map();

        grid.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                if (cell.kind !== "regular" || !SYMBOL_BY_ID[cell.id]) return;
                if (!positionsBySymbol.has(cell.id)) positionsBySymbol.set(cell.id, []);
                positionsBySymbol.get(cell.id).push({ row: rowIndex, column: columnIndex, uid: cell.uid });
            });
        });

        return Array.from(positionsBySymbol, ([symbolId, positions]) => ({
            symbolId,
            label: SYMBOL_BY_ID[symbolId].label,
            count: positions.length,
            positions,
            payoutMultiplier: payoutFor(symbolId, positions.length),
        }))
            .filter((win) => win.payoutMultiplier > 0)
            .sort((left, right) => right.payoutMultiplier - left.payoutMultiplier);
    }

    function calculateCascadeWin(wins, bet) {
        const normalizedBet = Math.max(0, Number(bet) || 0);
        return roundMoney((wins || []).reduce((total, win) => total + win.payoutMultiplier, 0) * normalizedBet);
    }

    function uniqueWinningPositions(wins) {
        const seen = new Set();
        return (wins || []).flatMap((win) => win.positions).filter((position) => {
            const key = `${position.row}:${position.column}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function tumbleGrid(grid, removedPositions, random = Math.random, options = {}) {
        if (!isValidGrid(grid)) throw new Error("Slot grid'i 6x5 olmalıdır.");
        const removed = new Set((removedPositions || []).map((position) => `${position.row}:${position.column}`));
        const cellFactory = options.cellFactory || createRandomCell;
        const nextGrid = Array.from({ length: ROWS }, () => Array(COLUMNS));
        const incomingUids = [];

        for (let column = 0; column < COLUMNS; column += 1) {
            const survivors = [];
            for (let row = ROWS - 1; row >= 0; row -= 1) {
                if (!removed.has(`${row}:${column}`)) survivors.push(grid[row][column]);
            }

            for (let row = ROWS - 1; row >= 0; row -= 1) {
                const survivor = survivors.shift();
                if (survivor) {
                    nextGrid[row][column] = survivor;
                } else {
                    const incoming = cellFactory(random);
                    nextGrid[row][column] = incoming;
                    incomingUids.push(incoming.uid);
                }
            }
        }

        return { grid: nextGrid, incomingUids };
    }

    function countScatters(grid) {
        if (!isValidGrid(grid)) return 0;
        return grid.flat().filter((cell) => cell.kind === "scatter").length;
    }

    function listMultipliers(grid) {
        if (!isValidGrid(grid)) return [];
        const multipliers = [];
        grid.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                if (cell.kind === "multiplier" && MULTIPLIER_VALUES.includes(cell.value)) {
                    multipliers.push({ uid: cell.uid, value: cell.value, row: rowIndex, column: columnIndex });
                }
            });
        });
        return multipliers;
    }

    function freeSpinsForScatterCount(scatterCount) {
        if (scatterCount >= 6) return 15;
        if (scatterCount === 5) return 12;
        if (scatterCount === 4) return 10;
        return 0;
    }

    function resolveCascades(initialGrid, bet, random = Math.random, options = {}) {
        if (!isValidGrid(initialGrid)) throw new Error("Slot grid'i 6x5 olmalıdır.");
        const maxCascades = Math.max(1, Math.floor(options.maxCascades || 24));
        const cellFactory = options.cellFactory || createRandomCell;
        const collectedByUid = new Map();
        const steps = [];
        let grid = cloneGrid(initialGrid);
        let baseWin = 0;
        let maxScatterCount = 0;

        const inspectGrid = () => {
            maxScatterCount = Math.max(maxScatterCount, countScatters(grid));
            listMultipliers(grid).forEach((multiplier) => {
                if (!collectedByUid.has(multiplier.uid)) collectedByUid.set(multiplier.uid, multiplier);
            });
        };

        while (steps.length < maxCascades) {
            inspectGrid();
            const wins = findWins(grid);
            if (!wins.length) break;

            const removedPositions = uniqueWinningPositions(wins);
            const cascadeWin = calculateCascadeWin(wins, bet);
            const tumble = tumbleGrid(grid, removedPositions, random, { cellFactory });
            const currentGrid = cloneGrid(grid);
            grid = tumble.grid;
            baseWin = roundMoney(baseWin + cascadeWin);
            steps.push(Object.freeze({
                index: steps.length + 1,
                grid: currentGrid,
                wins,
                removedPositions,
                cascadeWin,
                nextGrid: cloneGrid(grid),
                incomingUids: tumble.incomingUids.slice(),
            }));
        }

        inspectGrid();
        const collectedMultipliers = Array.from(collectedByUid.values());
        const multiplierTotal = collectedMultipliers.reduce((total, multiplier) => total + multiplier.value, 0);
        const capped = steps.length === maxCascades && findWins(grid).length > 0;

        return Object.freeze({
            initialGrid: cloneGrid(initialGrid),
            finalGrid: cloneGrid(grid),
            steps,
            baseWin,
            maxScatterCount,
            awardedFreeSpins: freeSpinsForScatterCount(maxScatterCount),
            collectedMultipliers,
            multiplierTotal,
            capped,
        });
    }

    function normalizeBet(value) {
        const numericValue = Number(value);
        return BET_OPTIONS.includes(numericValue) ? numericValue : BET_OPTIONS[2];
    }

    function createState(options = {}) {
        const balance = roundMoney(Number.isFinite(options.balance) ? options.balance : STARTING_BALANCE);
        const bet = normalizeBet(options.bet);
        return {
            balance: Math.max(0, balance),
            bet,
            freeSpins: Math.max(0, Math.floor(options.freeSpins || 0)),
            // Free Spin küreleri "x" değeri kadar eklenir. 0, henüz küre
            // toplanmadığını; ödeme hesabında ise bunun doğal karşılığı x1'i ifade eder.
            freeMultiplier: Math.max(0, Math.floor(options.freeMultiplier || 0)),
            isSpinning: false,
            lastWin: 0,
            stats: {
                bonusBuys: 0,
                paidSpins: 0,
                freeSpinsPlayed: 0,
                totalWon: 0,
                biggestWin: 0,
            },
        };
    }

    function setBet(state, value) {
        if (!state || state.isSpinning || state.freeSpins > 0) return false;
        const normalized = Number(value);
        if (!BET_OPTIONS.includes(normalized)) return false;
        state.bet = normalized;
        return true;
    }

    function bonusBuyCost(bet) {
        return roundMoney(normalizeBet(bet) * BONUS_BUY_COST_MULTIPLIER);
    }

    function canBuyBonus(state) {
        return Boolean(state)
            && !state.isSpinning
            && state.freeSpins === 0
            && state.balance >= bonusBuyCost(state.bet);
    }

    function buyBonus(state) {
        if (!canBuyBonus(state)) return null;
        const cost = bonusBuyCost(state.bet);
        state.balance = roundMoney(state.balance - cost);
        state.freeSpins = BONUS_BUY_FREE_SPINS;
        state.freeMultiplier = 0;
        state.lastWin = 0;
        state.stats.bonusBuys += 1;
        return Object.freeze({
            cost,
            freeSpins: BONUS_BUY_FREE_SPINS,
            balance: state.balance,
        });
    }

    function startRound(state) {
        if (!state || state.isSpinning) return null;
        const isFreeSpin = state.freeSpins > 0;
        if (!isFreeSpin && state.balance < state.bet) return null;

        const context = Object.freeze({
            mode: isFreeSpin ? "free" : "paid",
            bet: state.bet,
            openingBalance: state.balance,
            openingFreeMultiplier: state.freeMultiplier,
        });

        if (isFreeSpin) {
            state.freeSpins -= 1;
            state.stats.freeSpinsPlayed += 1;
        } else {
            state.balance = roundMoney(state.balance - state.bet);
            state.stats.paidSpins += 1;
        }
        state.lastWin = 0;
        state.isSpinning = true;
        return context;
    }

    function settleRound(state, result, context) {
        if (!state || !state.isSpinning || !context) return null;
        const baseWin = roundMoney(Math.max(0, result?.baseWin || 0));
        const landedMultiplier = Math.max(0, Math.floor(result?.multiplierTotal || 0));
        const scatterCount = Math.max(0, Math.floor(result?.maxScatterCount || 0));
        const awardedFreeSpins = freeSpinsForScatterCount(scatterCount);

        let appliedMultiplier = 1;
        if (context.mode === "free") {
            state.freeMultiplier += landedMultiplier;
            appliedMultiplier = Math.max(1, state.freeMultiplier);
        } else if (baseWin > 0 && landedMultiplier > 0) {
            appliedMultiplier = landedMultiplier;
        }

        const totalWin = roundMoney(baseWin * appliedMultiplier);
        state.balance = roundMoney(state.balance + totalWin);
        state.lastWin = totalWin;
        state.stats.totalWon = roundMoney(state.stats.totalWon + totalWin);
        state.stats.biggestWin = Math.max(state.stats.biggestWin, totalWin);

        if (awardedFreeSpins > 0) {
            state.freeSpins += awardedFreeSpins;
            if (context.mode === "paid") state.freeMultiplier = 0;
        }

        const accumulatedMultiplier = Math.max(1, state.freeMultiplier);
        const freeSessionEnded = context.mode === "free" && state.freeSpins === 0 && awardedFreeSpins === 0;
        if (freeSessionEnded) state.freeMultiplier = 0;
        state.isSpinning = false;

        return Object.freeze({
            mode: context.mode,
            baseWin,
            landedMultiplier,
            appliedMultiplier,
            accumulatedMultiplier,
            totalWin,
            scatterCount,
            awardedFreeSpins,
            freeSpinsRemaining: state.freeSpins,
            freeSessionEnded,
            balance: state.balance,
        });
    }

    function resetState(state) {
        if (!state || state.isSpinning) return false;
        const fresh = createState();
        Object.assign(state, fresh);
        return true;
    }

    function replenishBalanceIfEmpty(state) {
        if (!state || state.isSpinning || state.freeSpins > 0 || state.balance >= AUTO_REPLENISH_THRESHOLD) return false;
        state.balance = STARTING_BALANCE;
        if (state.bet > state.balance) state.bet = BET_OPTIONS[2];
        state.lastWin = 0;
        return true;
    }

    return Object.freeze({
        AUTO_REPLENISH_THRESHOLD,
        BET_OPTIONS,
        BONUS_BUY_COST_MULTIPLIER,
        BONUS_BUY_FREE_SPINS,
        COLUMNS,
        MULTIPLIER_VALUES,
        PAYOUT_THRESHOLDS,
        ROWS,
        STARTING_BALANCE,
        SYMBOLS,
        bonusBuyCost,
        buyBonus,
        calculateCascadeWin,
        canBuyBonus,
        cloneGrid,
        countScatters,
        createCell,
        createFreeSpinCell,
        createGrid,
        createRandomCell,
        createState,
        findWins,
        freeSpinsForScatterCount,
        isValidGrid,
        listMultipliers,
        payoutFor,
        replenishBalanceIfEmpty,
        resetState,
        resolveCascades,
        roundMoney,
        setBet,
        settleRound,
        startRound,
        tumbleGrid,
        uniqueWinningPositions,
        weightedPick,
    });
});
