"use strict";

const assert = require("node:assert/strict");
const questions = require("./questions.js");
const engine = require("./engine.js");

let seed = 20260722;
const random = () => ((seed = ((seed * 1664525) + 1013904223) >>> 0) / 4294967296);

assert.equal(questions.length, 208);
assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
assert.equal(new Set(questions.map((question) => question.category)).size, 13);
assert.deepEqual([0, 1, 2, 3].map((index) => questions.filter((question) => question.correctIndex === index).length), [52, 52, 52, 52]);
assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((difficulty) => questions.filter((question) => question.difficulty === difficulty).length), [30, 30, 30, 30, 30, 30, 28]);
assert.equal(new Set(questions.map((question) => question.text)).size, questions.length);

questions.forEach((question) => {
    assert.match(question.id, /^milyoner-v2-\d{3}$/);
    assert.equal(question.text, question.text.trim());
    assert.match(question.text, /\?$/);
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(Number.isInteger(question.correctIndex), true);
    assert.equal(question.correctIndex >= 0 && question.correctIndex < 4, true);
    assert.equal(question.options.every((option) => typeof option === "string" && option.trim() === option && option.length > 0), true);
    assert.equal(typeof question.explanation, "string");
    assert.match(question.explanation, /\.$/);
    assert.doesNotMatch(question.text, /\{(?:subject|answer)\}/);
    assert.doesNotMatch(question.text, /\b([\p{L}]+)\s+\1\b/iu);
});

for (let run = 0; run < 150; run += 1) {
    const game = engine.createGame({ questions, random, now: 1000 + run });
    assert.equal(game.questions.length, 15);
    assert.equal(new Set(game.questions.map((question) => question.id)).size, 15);
    assert.deepEqual(game.questions.map((question) => question.difficulty), engine.DIFFICULTY_SCHEDULE);
    assert.equal(engine.isValidSavedGame(game), true);
}

const perfectGame = engine.createGame({ questions, random, now: 1000 });
assert.equal(perfectGame.timerEndsAt, 31000);
for (let index = 0; index < perfectGame.questions.length; index += 1) {
    const question = engine.getCurrentQuestion(perfectGame);
    assert.equal(engine.selectAnswer(perfectGame, question.correctIndex), true);
    assert.equal(engine.confirmAnswer(perfectGame, 2000 + (index * 1000)).isCorrect, true);
    engine.advance(perfectGame, 2500 + (index * 1000));
}
assert.equal(perfectGame.result.reason, "completed");
assert.equal(perfectGame.result.winnings, 1000000);
assert.equal(perfectGame.result.correctCount, 15);
assert.equal(engine.getTimerLimitMs(0), 30000);
assert.equal(engine.getTimerLimitMs(5), 30000);
assert.equal(engine.getTimerLimitMs(6), null);
assert.equal(engine.getTimerLimitMs(14), null);

assert.equal(engine.getWrongAnswerPayout(0), 0);
assert.equal(engine.getWrongAnswerPayout(4), 10000);
assert.equal(engine.getWrongAnswerPayout(9), 100000);

const lifelineGame = engine.createGame({ questions, random, now: 1000 });
const hiddenOptions = engine.useFifty(lifelineGame, random);
assert.equal(hiddenOptions.length, 2);
assert.equal(hiddenOptions.includes(engine.getCurrentQuestion(lifelineGame).correctIndex), false);
const audience = engine.useAudience(lifelineGame, random);
assert.equal(audience.reduce((sum, percentage) => sum + percentage, 0), 100);
assert.equal(audience.filter((percentage) => percentage > 0).length <= 2, true);
assert.match(engine.usePhone(lifelineGame, "general", random).message, /cevap|tahminim|seçeneğine/);

const withdrawalGame = engine.createGame({ questions, random, now: 1000 });
withdrawalGame.currentPrize = 5000;
engine.withdraw(withdrawalGame, 5000);
assert.equal(withdrawalGame.result.reason, "withdrawn");
assert.equal(withdrawalGame.result.winnings, 5000);

console.log("Milyoner testleri başarılı: 208 özgün soru, dengeli şıklar, kolaydan zora 150 oyun üretimi, süre, ödüller ve jokerler.");
