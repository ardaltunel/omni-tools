(function () {
    "use strict";

    const CASE_COUNT = 24;
    const ROUND_SCHEDULE = [6, 5, 4, 3, 2, 1, 1];
    const HIGH_VALUE_THRESHOLD = 100000;
    const VALUES = [
        1, 2, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000,
        2500, 5000, 10000, 15000, 20000, 25000, 50000,
        100000, 125000, 250000, 500000, 1000000,
    ];

    function createGame() {
        const shuffledValues = shuffle(VALUES);
        return {
            version: 1,
            phase: "selecting",
            cases: Array.from({ length: CASE_COUNT }, (_, index) => ({
                id: index + 1,
                value: shuffledValues[index],
                status: "closed",
            })),
            ownCaseId: null,
            originalOwnCaseId: null,
            roundIndex: 0,
            boxesToOpen: 0,
            openedThisRound: [],
            openedValues: [],
            offers: [],
            currentOffer: null,
            acceptedOffer: null,
            finalSwapped: false,
            winnings: null,
            startedAt: Date.now(),
        };
    }

    function selectOwnCase(state, caseId) {
        const selectedCase = getCase(state, caseId);
        if (!selectedCase || state.phase !== "selecting" || selectedCase.status !== "closed") return false;

        state.ownCaseId = caseId;
        state.originalOwnCaseId = caseId;
        selectedCase.status = "owned";
        state.phase = "opening";
        state.roundIndex = 0;
        state.boxesToOpen = getRoundTarget(state);
        return true;
    }

    function openCase(state, caseId) {
        const selectedCase = getCase(state, caseId);
        if (!selectedCase || state.phase !== "opening" || state.boxesToOpen <= 0) return null;
        if (selectedCase.status !== "closed" || caseId === state.ownCaseId) return null;

        selectedCase.status = "opened";
        state.boxesToOpen -= 1;
        state.openedThisRound.push(selectedCase.value);
        state.openedValues.push(selectedCase.value);
        return selectedCase.value;
    }

    function calculateOffer(state) {
        const remainingValues = getRemainingCases(state).map((item) => item.value).sort((a, b) => a - b);
        const mean = average(remainingValues);
        const middle = median(remainingValues);
        const deviation = standardDeviation(remainingValues, mean);
        const riskRatio = mean > 0 ? Math.min(1.5, deviation / mean) : 0;
        const highValueCount = remainingValues.filter((value) => value >= HIGH_VALUE_THRESHOLD).length;
        const highValueChance = remainingValues.length ? highValueCount / remainingValues.length : 0;
        const recentHighLosses = state.openedThisRound.filter((value) => value >= HIGH_VALUE_THRESHOLD).length;
        const recentLossRatio = state.openedThisRound.length ? recentHighLosses / state.openedThisRound.length : 0;
        const progress = Math.min(1, state.openedValues.length / (CASE_COUNT - 2));

        const expectedValue = (mean * 0.84) + (middle * 0.16);
        const roundFactor = 0.24 + (progress * 0.58);
        const riskAdjustment = 0.95
            - (Math.min(1, riskRatio) * 0.08)
            + (highValueChance * 0.08)
            - (recentLossRatio * 0.1);
        const rawOffer = Math.max(1, expectedValue * roundFactor * riskAdjustment);
        const cappedOffer = Math.min(rawOffer, mean * 0.92, Math.max(...remainingValues) * 0.88);
        const amount = roundOffer(cappedOffer);
        const analysis = {
            amount,
            mean: Math.round(mean),
            median: Math.round(middle),
            riskLevel: riskRatio > 0.95 ? "Yüksek" : riskRatio > 0.55 ? "Orta" : "Düşük",
            highValueChance: Math.round(highValueChance * 100),
            highValueCount,
            remainingCount: remainingValues.length,
        };

        state.currentOffer = analysis;
        state.offers.push({ ...analysis, round: state.roundIndex + 1, createdAt: Date.now() });
        state.phase = "bank";
        return analysis;
    }

    function rejectOffer(state) {
        if (state.phase !== "bank") return false;
        state.currentOffer = null;
        state.openedThisRound = [];

        if (getRemainingCases(state).length <= 2) {
            state.phase = "final-choice";
            state.boxesToOpen = 0;
            return true;
        }

        state.roundIndex += 1;
        state.phase = "opening";
        state.boxesToOpen = getRoundTarget(state);
        return true;
    }

    function acceptOffer(state) {
        if (state.phase !== "bank" || !state.currentOffer) return null;
        state.acceptedOffer = state.currentOffer.amount;
        state.winnings = state.acceptedOffer;
        state.phase = "finished";
        return {
            winnings: state.winnings,
            ownValue: getCase(state, state.ownCaseId)?.value || 0,
        };
    }

    function swapOwnCase(state) {
        if (state.phase !== "final-choice") return false;
        const otherCase = getRemainingCases(state).find((item) => item.id !== state.ownCaseId);
        const currentCase = getCase(state, state.ownCaseId);
        if (!otherCase || !currentCase) return false;

        currentCase.status = "closed";
        otherCase.status = "owned";
        state.ownCaseId = otherCase.id;
        state.finalSwapped = true;
        return true;
    }

    function finishFinal(state) {
        if (state.phase !== "final-choice") return null;
        const ownCase = getCase(state, state.ownCaseId);
        const otherCase = getRemainingCases(state).find((item) => item.id !== state.ownCaseId);
        if (!ownCase || !otherCase) return null;

        state.phase = "finished";
        state.winnings = ownCase.value;
        return {
            winnings: ownCase.value,
            ownValue: ownCase.value,
            otherValue: otherCase.value,
            ownCaseId: ownCase.id,
            otherCaseId: otherCase.id,
            swapped: state.finalSwapped,
        };
    }

    function getRoundTarget(state) {
        const remainingToOpen = Math.max(0, getRemainingCases(state).length - 2);
        return Math.min(ROUND_SCHEDULE[state.roundIndex] || 1, remainingToOpen);
    }

    function getRemainingCases(state) {
        return state.cases.filter((item) => item.status !== "opened");
    }

    function getCase(state, caseId) {
        return state.cases.find((item) => item.id === Number(caseId));
    }

    function isValidSavedGame(value) {
        if (!value || value.version !== 1 || !Array.isArray(value.cases) || value.cases.length !== CASE_COUNT) return false;
        const ids = new Set(value.cases.map((item) => item.id));
        const values = value.cases.map((item) => item.value).sort((a, b) => a - b);
        return ids.size === CASE_COUNT && VALUES.every((amount, index) => amount === values[index]);
    }

    function shuffle(values) {
        const result = [...values];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
        }
        return result;
    }

    function average(values) {
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }

    function median(values) {
        if (!values.length) return 0;
        const middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }

    function standardDeviation(values, mean) {
        if (!values.length) return 0;
        const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    function roundOffer(value) {
        const step = value >= 100000 ? 1000 : value >= 10000 ? 500 : value >= 1000 ? 100 : 50;
        return Math.max(1, Math.round(value / step) * step);
    }

    window.OmniDealEngine = Object.freeze({
        CASE_COUNT,
        HIGH_VALUE_THRESHOLD,
        ROUND_SCHEDULE: [...ROUND_SCHEDULE],
        VALUES: [...VALUES],
        acceptOffer,
        calculateOffer,
        createGame,
        finishFinal,
        getCase,
        getRemainingCases,
        isValidSavedGame,
        openCase,
        rejectOffer,
        selectOwnCase,
        swapOwnCase,
    });
}());
