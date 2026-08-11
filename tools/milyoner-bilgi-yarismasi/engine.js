(function initMillionaireEngine(root, factory) {
    "use strict";

    const engine = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = engine;
    } else {
        root.OmniMillionaireEngine = engine;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createMillionaireEngine() {
    "use strict";

    const VERSION = 3;
    const PRIZES = Object.freeze([
        1000, 2000, 3000, 5000, 10000,
        20000, 30000, 50000, 75000, 100000,
        200000, 300000, 500000, 750000, 1000000,
    ]);
    const DIFFICULTY_SCHEDULE = Object.freeze([1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
    const ADVISERS = Object.freeze([
        Object.freeze({ id: "history", name: "Tarih Uzmanı", categories: ["Tarih", "Coğrafya"] }),
        Object.freeze({ id: "science", name: "Bilim Meraklısı", categories: ["Bilim", "Teknoloji", "Matematik", "Doğa"] }),
        Object.freeze({ id: "arts", name: "Sanat Tutkunu", categories: ["Sanat ve Edebiyat", "Sinema", "Müzik"] }),
        Object.freeze({ id: "sports", name: "Spor Uzmanı", categories: ["Spor"] }),
        Object.freeze({ id: "general", name: "Genel Kültür Ustası", categories: ["Genel Kültür", "Günlük Yaşam", "Mantık"] }),
    ]);

    function createGame(options = {}) {
        const random = typeof options.random === "function" ? options.random : Math.random;
        const questions = buildQuestionSet(options.questions || [], options.recentIds || [], random);
        const now = Number(options.now) || Date.now();
        const state = {
            version: VERSION,
            id: `milyoner-${now}-${Math.floor(random() * 1000000)}`,
            questions,
            questionIndex: 0,
            selectedOption: null,
            hiddenOptions: [],
            status: "playing",
            lifelines: { fifty: false, audience: false, phone: false },
            audienceResult: null,
            phoneResult: null,
            answers: [],
            currentPrize: 0,
            startedAt: now,
            questionStartedAt: now,
            timerEndsAt: null,
            result: null,
        };
        resetTimer(state, now);
        return state;
    }

    function buildQuestionSet(questionBank, recentIds = [], random = Math.random) {
        if (!validateQuestionBank(questionBank)) throw new Error("Geçerli bir soru havuzu gerekli.");
        const recent = new Set(Array.isArray(recentIds) ? recentIds : []);
        const used = new Set();
        const selected = [];
        let previousCategory = "";

        DIFFICULTY_SCHEDULE.forEach((difficulty) => {
            let candidates = questionBank.filter((question) => question.difficulty === difficulty && !used.has(question.id) && !recent.has(question.id));
            if (!candidates.length) candidates = questionBank.filter((question) => question.difficulty === difficulty && !used.has(question.id));
            if (!candidates.length) candidates = questionBank.filter((question) => !used.has(question.id));

            const varied = candidates.filter((question) => question.category !== previousCategory);
            const pool = varied.length ? varied : candidates;
            const question = pool[Math.floor(random() * pool.length)];
            if (!question) throw new Error("Soru seti oluşturulamadı.");

            selected.push(question);
            used.add(question.id);
            previousCategory = question.category;
        });

        return selected;
    }

    function validateQuestionBank(questionBank) {
        return Array.isArray(questionBank)
            && questionBank.length >= 15
            && questionBank.every(isQuestionValid);
    }

    function getCurrentQuestion(state) {
        return state?.questions?.[state.questionIndex] || null;
    }

    function selectAnswer(state, optionIndex) {
        const question = getCurrentQuestion(state);
        if (!question || state.status !== "playing" || !Number.isInteger(optionIndex)) return false;
        if (optionIndex < 0 || optionIndex >= question.options.length || state.hiddenOptions.includes(optionIndex)) return false;
        state.selectedOption = optionIndex;
        return true;
    }

    function clearSelection(state) {
        if (!state || state.status !== "playing" || state.selectedOption === null) return false;
        state.selectedOption = null;
        return true;
    }

    function confirmAnswer(state, now = Date.now()) {
        if (!state || state.status !== "playing" || state.selectedOption === null) return null;
        return resolveAnswer(state, state.selectedOption, now, false);
    }

    function expireQuestion(state, now = Date.now()) {
        if (!state || state.status !== "playing") return null;
        return resolveAnswer(state, -1, now, true);
    }

    function resolveAnswer(state, selectedIndex, now, timedOut) {
        const question = getCurrentQuestion(state);
        if (!question) return null;
        const isCorrect = selectedIndex === question.correctIndex;
        const elapsedMs = Math.max(0, Number(now) - Number(state.questionStartedAt || now));
        const outcome = {
            questionId: question.id,
            questionNumber: state.questionIndex + 1,
            selectedIndex,
            correctIndex: question.correctIndex,
            isCorrect,
            timedOut: Boolean(timedOut),
            elapsedMs,
            prize: isCorrect ? getPrizeForIndex(state.questionIndex) : getWrongAnswerPayout(state.questionIndex),
        };

        state.status = "review";
        state.timerEndsAt = null;
        state.answers.push(outcome);
        if (isCorrect) state.currentPrize = getPrizeForIndex(state.questionIndex);
        return outcome;
    }

    function advance(state, now = Date.now()) {
        if (!state || state.status !== "review") return null;
        const outcome = state.answers[state.answers.length - 1];
        if (!outcome) return null;

        if (!outcome.isCorrect) {
            return finishGame(state, "wrong", getWrongAnswerPayout(state.questionIndex), now);
        }

        if (state.questionIndex >= state.questions.length - 1) {
            return finishGame(state, "completed", state.currentPrize, now);
        }

        state.questionIndex += 1;
        state.selectedOption = null;
        state.hiddenOptions = [];
        state.audienceResult = null;
        state.phoneResult = null;
        state.status = "playing";
        state.questionStartedAt = now;
        resetTimer(state, now);
        return { finished: false, questionIndex: state.questionIndex };
    }

    function withdraw(state, now = Date.now()) {
        if (!state || !["playing", "review"].includes(state.status)) return null;
        return finishGame(state, "withdrawn", state.currentPrize, now);
    }

    function finishGame(state, reason, winnings, now) {
        state.status = "finished";
        state.timerEndsAt = null;
        state.result = {
            reason,
            winnings,
            reachedQuestion: Math.min(state.questions.length, state.questionIndex + 1),
            correctCount: state.answers.filter((answer) => answer.isCorrect).length,
            wrongCount: state.answers.filter((answer) => !answer.isCorrect).length,
            usedLifelines: Object.entries(state.lifelines).filter(([, used]) => used).map(([name]) => name),
            totalDurationMs: Math.max(0, Number(now) - Number(state.startedAt || now)),
            averageAnswerMs: average(state.answers.map((answer) => answer.elapsedMs)),
        };
        return { finished: true, result: state.result };
    }

    function useFifty(state, random = Math.random) {
        const question = getCurrentQuestion(state);
        if (!question || state.status !== "playing" || state.lifelines.fifty) return null;
        const wrongIndices = shuffle([0, 1, 2, 3].filter((index) => index !== question.correctIndex), random);
        state.hiddenOptions = wrongIndices.slice(0, 2);
        state.lifelines.fifty = true;
        if (state.hiddenOptions.includes(state.selectedOption)) state.selectedOption = null;
        return state.hiddenOptions.slice();
    }

    function useAudience(state, random = Math.random) {
        const question = getCurrentQuestion(state);
        if (!question || state.status !== "playing" || state.lifelines.audience) return null;
        const visible = [0, 1, 2, 3].filter((index) => !state.hiddenOptions.includes(index));
        const baseByDifficulty = [0, 0.82, 0.74, 0.65, 0.57, 0.49, 0.41, 0.34];
        const correctShare = clamp(baseByDifficulty[question.difficulty] + ((random() - 0.5) * 0.14) + (visible.length === 2 ? 0.08 : 0), 0.24, 0.92);
        const result = distributePercentages(visible, question.correctIndex, correctShare, random);
        state.lifelines.audience = true;
        state.audienceResult = result;
        return result.slice();
    }

    function usePhone(state, adviserId, random = Math.random) {
        const question = getCurrentQuestion(state);
        const adviser = ADVISERS.find((item) => item.id === adviserId);
        if (!question || !adviser || state.status !== "playing" || state.lifelines.phone) return null;
        const visible = [0, 1, 2, 3].filter((index) => !state.hiddenOptions.includes(index));
        const expertise = adviser.categories.includes(question.category) ? 0.16 : adviser.id === "general" ? 0.06 : 0;
        const successChance = clamp(0.91 - ((question.difficulty - 1) * 0.085) + expertise + (visible.length === 2 ? 0.08 : 0), 0.3, 0.96);
        const isCorrect = random() < successChance;
        const wrongOptions = visible.filter((index) => index !== question.correctIndex);
        const advisedIndex = isCorrect
            ? question.correctIndex
            : wrongOptions[Math.floor(random() * wrongOptions.length)];
        const alternativePool = visible.filter((index) => index !== advisedIndex);
        const alternativeIndex = alternativePool[Math.floor(random() * alternativePool.length)];
        const letter = optionLetter(advisedIndex);
        let message;

        if (successChance >= 0.76 && isCorrect) {
            message = `Bu konuda oldukça eminim, bana göre cevap ${letter}.`;
        } else if (successChance >= 0.56) {
            message = `${optionLetter(advisedIndex)} ile ${optionLetter(alternativeIndex)} arasında düşündüm; ${letter} seçeneğine daha yakınım.`;
        } else {
            message = `Kesin konuşamam ama ilk tahminim ${letter}. Bu soruda kendi değerlendirmeni de kullan.`;
        }

        const result = { adviserId, adviserName: adviser.name, advisedIndex, successChance, message };
        state.lifelines.phone = true;
        state.phoneResult = result;
        return result;
    }

    function getTimerLimitMs(questionIndex) {
        return Number(questionIndex) < 6 ? 30000 : null;
    }

    function resetTimer(state, now = Date.now()) {
        const limit = getTimerLimitMs(state.questionIndex);
        state.timerEndsAt = limit ? Number(now) + limit : null;
    }

    function getWrongAnswerPayout(questionIndex) {
        if (questionIndex < 4) return 0;
        if (questionIndex < 9) return 10000;
        return 100000;
    }

    function getPrizeForIndex(questionIndex) {
        return PRIZES[clamp(Number(questionIndex) || 0, 0, PRIZES.length - 1)];
    }

    function isValidSavedGame(value) {
        if (!value || value.version !== VERSION) return false;
        if (!Array.isArray(value.questions)
            || value.questions.length !== DIFFICULTY_SCHEDULE.length
            || !value.questions.every(isQuestionValid)) return false;
        if (!Number.isInteger(value.questionIndex) || value.questionIndex < 0 || value.questionIndex >= value.questions.length) return false;
        if (!Array.isArray(value.answers) || !value.lifelines || typeof value.lifelines !== "object") return false;
        return ["playing", "review", "finished"].includes(value.status);
    }

    function isQuestionValid(question) {
        return Boolean(question
            && typeof question.id === "string"
            && typeof question.text === "string"
            && Array.isArray(question.options)
            && question.options.length === 4
            && Number.isInteger(question.correctIndex)
            && question.correctIndex >= 0
            && question.correctIndex < 4
            && Number.isInteger(question.difficulty)
            && question.difficulty >= 1
            && question.difficulty <= 7);
    }

    function distributePercentages(visibleIndices, correctIndex, correctShare, random) {
        const shares = [0, 0, 0, 0];
        const correctPercent = Math.round(correctShare * 100);
        shares[correctIndex] = correctPercent;
        const wrongIndices = visibleIndices.filter((index) => index !== correctIndex);
        let remaining = 100 - correctPercent;
        const weights = wrongIndices.map(() => 0.35 + random());
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

        wrongIndices.forEach((index, position) => {
            if (position === wrongIndices.length - 1) {
                shares[index] = remaining;
                return;
            }
            const share = Math.max(0, Math.round((100 - correctPercent) * (weights[position] / totalWeight)));
            shares[index] = Math.min(remaining, share);
            remaining -= shares[index];
        });
        return shares;
    }

    function optionLetter(index) {
        return ["A", "B", "C", "D"][index] || "-";
    }

    function shuffle(values, random = Math.random) {
        const result = values.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    }

    function average(values) {
        return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    return Object.freeze({
        ADVISERS,
        DIFFICULTY_SCHEDULE,
        PRIZES,
        VERSION,
        advance,
        buildQuestionSet,
        clearSelection,
        confirmAnswer,
        createGame,
        expireQuestion,
        getCurrentQuestion,
        getPrizeForIndex,
        getTimerLimitMs,
        getWrongAnswerPayout,
        isValidSavedGame,
        optionLetter,
        selectAnswer,
        useAudience,
        useFifty,
        usePhone,
        validateQuestionBank,
        withdraw,
    });
});
