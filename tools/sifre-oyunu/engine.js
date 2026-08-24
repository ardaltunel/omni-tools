(function initPasswordGameEngine(root) {
    "use strict";

    const data = root.PasswordGameData;
    const utils = root.PasswordGameUtils;
    const rules = root.PasswordGameRules;
    if (!data || !utils || !rules) return;

    function createGameContext(options = {}) {
        const now = options.date instanceof Date ? options.date : new Date();
        const seed = String(options.seed ?? `${now.getTime()}-${Math.random()}`);
        const random = utils.createRandom(seed);
        const emojiChoices = utils.sample(random, data.emojis, 3);
        const city = utils.pick(random, data.cities);
        const reverseWord = utils.pick(random, data.reverseWords);
        const riddle = utils.pick(random, data.riddles);
        const color = utils.pick(random, data.colors);
        const colorOptions = utils.sample(random, [color, ...utils.sample(random, data.colors.filter((item) => item.hex !== color.hex), 2)], 3);
        const answer = utils.pick(random, [10, 11, 12, 13, 14]);
        const left = 2 + Math.floor(random() * (answer - 3));
        const dayName = now.toLocaleDateString("tr-TR", { weekday: "long" });
        const forcedText = [city, dayName, "OMNI", utils.reverseText(reverseWord), riddle.answer].map(utils.normalize).join("");
        const availableForbidden = data.forbiddenCandidates.filter((letter) => !forcedText.includes(letter));

        return Object.freeze({
            seed,
            emojiChoices: Object.freeze(emojiChoices),
            allEmojis: data.emojis,
            city,
            math: Object.freeze({ left, right: answer - left, answer }),
            color,
            colorOptions: Object.freeze(colorOptions),
            dayName,
            reverseWord,
            reversedWord: utils.reverseText(reverseWord),
            forbiddenLetter: utils.pick(random, availableForbidden.length ? availableForbidden : ["q"]),
            luckyNumber: utils.pick(random, [1, 2, 3]),
            riddle,
        });
    }

    function evaluateRules(password, context, count = rules.length) {
        const limit = Math.max(0, Math.min(rules.length, Number(count) || 0));
        const results = [];
        for (let index = 0; index < limit; index += 1) {
            const rule = rules[index];
            const enrichedContext = index === 29
                ? { ...context, allPreviousValid: results.every((result) => result.passed) }
                : context;
            results.push({ id: rule.id, passed: Boolean(rule.validate(String(password || ""), enrichedContext)) });
        }
        return results;
    }

    function allRulesPass(password, context) {
        const results = evaluateRules(password, context, rules.length);
        return results.length === rules.length && results.every((result) => result.passed);
    }

    function createGuaranteedSolution(context) {
        const emoji = context.emojiChoices[0];
        const month = data.months.find((item) => !utils.normalize(item).includes(context.forbiddenLetter)) || "ocak";
        const parts = [
            "OMNI0",
            context.city,
            context.dayName,
            month,
            context.reversedWord,
            context.riddle.answer,
            "aba",
            context.color.hex,
            String(context.math.answer),
            `${emoji}${emoji}`,
            "@",
        ];
        let solution = parts.join("");
        if (!solution.includes(String(context.luckyNumber))) solution += String(context.luckyNumber);
        if ((solution.match(/0/g) || []).length < 2) solution += "00";

        let remaining = 18 - utils.digitSum(solution);
        if (remaining < 0) throw new Error("Oyun bağlamı rakam toplamı kuralıyla çelişiyor.");
        while (remaining > 9) {
            solution += "9";
            remaining -= 9;
        }
        if (remaining > 0) solution += String(remaining);
        while ((solution.match(/[0-9]/g) || []).length < 5) solution += "0";

        const targetLength = utils.nextPrime(Math.max(31, utils.characters(solution).length + 1));
        solution += "a".repeat(targetLength - utils.characters(solution).length - 1);
        solution += "?";
        return solution;
    }

    function verifySolvable(context) {
        const solution = createGuaranteedSolution(context);
        return { solvable: allRulesPass(solution, context), solutionLength: utils.characters(solution).length };
    }

    root.PasswordGameEngine = Object.freeze({
        createGameContext,
        evaluateRules,
        allRulesPass,
        createGuaranteedSolution,
        verifySolvable,
    });
}(typeof window !== "undefined" ? window : globalThis));
