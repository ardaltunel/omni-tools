"use strict";

const assert = require("node:assert/strict");
const config = require("./config.js");
const core = require("./core.js");

function test(name, callback) {
    callback();
    console.log(`✓ ${name}`);
}

function seededRandom(seed = 0x0ddc0107) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

test("her turda yalnızca bir farklı renkli kare üretiliyor", () => {
    for (let level = 1; level <= 80; level += 1) {
        const round = core.createRound(level, seededRandom(level));
        assert.notEqual(round.baseColor, round.oddColor);
        assert.equal(round.cells.filter((color) => color === round.oddColor).length, 1);
        assert.equal(round.cells.filter((color) => color === round.baseColor).length, round.cellCount - 1);
    }
});

test("yenileme farklı kareyi başka konuma taşırken tur durumunu koruyor", () => {
    const round = core.createRound(7, seededRandom(77));
    const shuffled = core.shuffleRound(round, () => 0);
    assert.notEqual(shuffled.oddIndex, round.oddIndex);
    assert.equal(shuffled.cells.filter((color) => color === shuffled.oddColor).length, 1);
    assert.equal(shuffled.level, round.level);
    assert.equal(shuffled.gridSize, round.gridSize);
    assert.equal(shuffled.baseColor, round.baseColor);
    assert.equal(shuffled.oddColor, round.oddColor);
});

test("yenileme animasyonu renkleri koruyarak farklı kareyi yeni konuma taşıyor", () => {
    for (let cellCount = 4; cellCount <= 36; cellCount += 1) {
        for (let oldOddIndex = 0; oldOddIndex < cellCount; oldOddIndex += 1) {
            const newOddIndex = (oldOddIndex + 1) % cellCount;
            const order = core.createShuffleOrder(cellCount, oldOddIndex, newOddIndex, seededRandom(cellCount + oldOddIndex));
            assert.equal(new Set(order).size, cellCount);
            assert.equal(order[newOddIndex], oldOddIndex);
        }
    }
});

test("grid level ile 2x2'den başlayarak doğru büyüyor", () => {
    assert.equal(core.getGridSize(1), 2);
    assert.equal(core.getGridSize(2), 3);
    assert.equal(core.getGridSize(3), 4);
    assert.equal(core.getGridSize(5), 6);
});

test("grid hiçbir seviyede 6x6 sınırını aşmıyor", () => {
    assert.equal(core.getGridSize(6), 6);
    assert.equal(core.getGridSize(10000), 6);
    assert.equal(core.createRound(500).cellCount, 36);
});

test("yanlış seçim hakkı bir azaltıyor ve doğru kareyi değiştirmiyor", () => {
    const state = core.startGame(seededRandom());
    const wrongIndex = state.round.oddIndex === 0 ? 1 : 0;
    const result = core.selectCell(state, wrongIndex, seededRandom(2));
    assert.equal(result.outcome, "wrong");
    assert.equal(result.state.lives, 2);
    assert.equal(result.state.round.oddIndex, state.round.oddIndex);
});

test("üç yanlış seçim oyunu bitiriyor", () => {
    let state = core.startGame(seededRandom());
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const wrongIndex = state.round.oddIndex === 0 ? 1 : 0;
        state = core.selectCell(state, wrongIndex, seededRandom(attempt + 10)).state;
    }
    assert.equal(state.lives, 0);
    assert.equal(state.status, "finished");
    assert.equal(state.endReason, "lives");
    assert.equal(state.wrongSelections, 3);
});

test("doğru seçim level artırıyor, hakkı yeniliyor ve skoru kaydediyor", () => {
    let state = core.startGame(seededRandom());
    state = core.selectCell(state, state.round.oddIndex, seededRandom(4)).state;
    assert.equal(state.level, 2);
    assert.equal(state.lives, config.STARTING_LIVES);
    assert.equal(state.correctAnswers, 1);
    assert.equal(state.round.level, 2);
});

test("renk farkı seviyeler yükseldikçe düzenli azalıyor ama sıfırlanmıyor", () => {
    let previous = core.getColorDifference(1);
    for (let level = 2; level <= 250; level += 1) {
        const current = core.getColorDifference(level);
        assert.ok(current < previous, `Level ${level}: ${current} < ${previous}`);
        assert.ok(current > 0);
        previous = current;
    }
});

test("localStorage istatistikleri güvenli normalize ediliyor ve rekorlar korunuyor", () => {
    const malformed = core.normalizeStats({ highestLevel: "NaN", totalGames: -4, bestScore: undefined });
    assert.deepEqual(malformed, { highestLevel: 0, totalGames: 0, bestScore: 0 });

    const first = core.updateStats({ highestLevel: 7, totalGames: 3, bestScore: 6 }, {
        level: 5,
        correctAnswers: 4,
    });
    assert.deepEqual(first, { highestLevel: 7, totalGames: 4, bestScore: 6 });

    const record = core.updateStats(first, { level: 12, correctAnswers: 11 });
    assert.deepEqual(record, { highestLevel: 12, totalGames: 5, bestScore: 11 });
});

test("geçersiz girdiler NaN veya undefined üretmiyor", () => {
    const round = core.createRound(undefined, () => Number.NaN);
    assert.equal(round.gridSize, 2);
    assert.equal(round.cells.length, 4);
    assert.equal(round.cells.some((value) => /NaN|undefined/.test(value)), false);
    assert.equal(Number.isFinite(round.colorDifference), true);

    const stats = core.updateStats(undefined, undefined);
    Object.values(stats).forEach((value) => assert.equal(Number.isFinite(value), true));
});

console.log("Farklı Rengi Bul çekirdek testleri tamamlandı.");
