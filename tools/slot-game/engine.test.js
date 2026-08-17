"use strict";

const assert = require("node:assert/strict");
const engine = require("./engine.js");

let testUid = 0;
const regular = (id) => engine.createCell("regular", id, null, `test-${testUid += 1}`);
const multiplier = (value) => engine.createCell("multiplier", "power-orb", value, `test-${testUid += 1}`);
const scatter = () => engine.createCell("scatter", "gateway", null, `test-${testUid += 1}`);

function gridFromCells(cells) {
    assert.equal(cells.length, engine.ROWS * engine.COLUMNS);
    return Array.from({ length: engine.ROWS }, (_, row) => (
        cells.slice(row * engine.COLUMNS, (row + 1) * engine.COLUMNS)
    ));
}

function test(name, callback) {
    callback();
    console.log(`✓ ${name}`);
}

test("grid her üretimde 6x5 ve 30 sembol içeriyor", () => {
    const grid = engine.createGrid(() => 0.12);
    assert.equal(grid.length, 5);
    assert.equal(grid.every((row) => row.length === 6), true);
    assert.equal(grid.flat().length, 30);
    assert.equal(engine.isValidGrid(grid), true);
});

test("8+ aynı sembol grid'in herhangi bir yerinde kazanç oluşturuyor", () => {
    const ids = [
        ...Array.from({ length: 8 }, () => "sigil"),
        ...Array.from({ length: 22 }, (_, index) => ["spark", "orbit", "moon", "prism", "bloom"][index % 5]),
    ];
    const wins = engine.findWins(gridFromCells(ids.map(regular)));
    assert.equal(wins.length, 1);
    assert.equal(wins[0].symbolId, "sigil");
    assert.equal(wins[0].count, 8);
    assert.equal(engine.calculateCascadeWin(wins, 100), 75);
    assert.equal(engine.payoutFor("sigil", 25), 25);
    assert.equal(engine.payoutFor("sigil", 7), 0);
});

test("patlayan hücreler kaldırılıyor, semboller aşağı düşüyor ve üstten yenileri geliyor", () => {
    const ids = Array.from({ length: 30 }, (_, index) => engine.SYMBOLS[index % engine.SYMBOLS.length].id);
    const grid = gridFromCells(ids.map(regular));
    const originalTop = grid[0][0];
    const originalMiddle = grid[2][0];
    const tumble = engine.tumbleGrid(grid, [
        { row: 3, column: 0 },
        { row: 4, column: 0 },
    ], () => 0, { cellFactory: () => multiplier(2) });

    assert.equal(tumble.incomingUids.length, 2);
    assert.equal(tumble.grid[4][0], originalMiddle);
    assert.equal(tumble.grid[2][0], originalTop);
    assert.equal(tumble.grid[0][0].kind, "multiplier");
    assert.equal(tumble.grid[1][0].kind, "multiplier");
});

test("aynı spin içinde yeni kombinasyon geldikçe cascade devam ediyor", () => {
    const initialIds = [
        ...Array.from({ length: 8 }, () => "spark"),
        ...Array.from({ length: 22 }, (_, index) => ["orbit", "moon", "prism", "bloom", "sigil"][index % 5]),
    ];
    let incomingIndex = 0;
    const factory = () => {
        incomingIndex += 1;
        return incomingIndex <= 8 ? regular("bloom") : multiplier(2);
    };
    const result = engine.resolveCascades(
        gridFromCells(initialIds.map(regular)),
        100,
        () => 0.5,
        { cellFactory: factory },
    );

    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0].wins[0].symbolId, "spark");
    assert.equal(result.steps[1].wins[0].symbolId, "bloom");
    assert.ok(result.baseWin > result.steps[0].cascadeWin);
    assert.equal(engine.findWins(result.finalGrid).length, 0);
    assert.equal(result.multiplierTotal, 24);
});

test("scatter sayısı 4, 5 ve 6+ için doğru Free Spins ödülünü veriyor", () => {
    assert.equal(engine.freeSpinsForScatterCount(3), 0);
    assert.equal(engine.freeSpinsForScatterCount(4), 10);
    assert.equal(engine.freeSpinsForScatterCount(5), 12);
    assert.equal(engine.freeSpinsForScatterCount(6), 15);
    assert.equal(engine.freeSpinsForScatterCount(9), 15);

    const cells = [
        scatter(), scatter(), scatter(), scatter(),
        ...Array.from({ length: 26 }, (_, index) => regular(engine.SYMBOLS[index % engine.SYMBOLS.length].id)),
    ];
    assert.equal(engine.countScatters(gridFromCells(cells)), 4);
});

test("Free Spins sembol havuzu Geçit ve çarpanları daha görünür üretir", () => {
    assert.equal(engine.createRandomCell(() => 0.955).kind, "regular");
    assert.equal(engine.createFreeSpinCell(() => 0.965).kind, "scatter");
    assert.equal(engine.createFreeSpinCell(() => 0.99).kind, "multiplier");
});

test("ücretli spin bahsi düşüyor, kazanç ve çarpan doğru bakiyeye ekleniyor", () => {
    const state = engine.createState({ balance: 10000, bet: 100 });
    const context = engine.startRound(state);
    assert.equal(context.mode, "paid");
    assert.equal(state.balance, 9900);
    assert.equal(engine.startRound(state), null, "spin kilidi ikinci tetiklemeyi engellemeli");

    const summary = engine.settleRound(state, {
        baseWin: 200,
        multiplierTotal: 5,
        maxScatterCount: 0,
    }, context);
    assert.equal(summary.appliedMultiplier, 5);
    assert.equal(summary.totalWin, 1000);
    assert.equal(state.balance, 10900);
    assert.equal(state.isSpinning, false);
});

test("4 scatter ücretli spinden sonra 10 Free Spins açıyor ve ek bahis düşmüyor", () => {
    const state = engine.createState({ balance: 10000, bet: 200 });
    const paidContext = engine.startRound(state);
    const trigger = engine.settleRound(state, {
        baseWin: 0,
        multiplierTotal: 0,
        maxScatterCount: 4,
    }, paidContext);
    assert.equal(state.balance, 9800);
    assert.equal(trigger.awardedFreeSpins, 10);
    assert.equal(state.freeSpins, 10);

    const freeContext = engine.startRound(state);
    assert.equal(freeContext.mode, "free");
    assert.equal(state.balance, 9800);
    assert.equal(state.freeSpins, 9);
});

test("Free Spins çarpanları gerçek x değeriyle birikiyor ve seri sonunda sıfırlanıyor", () => {
    const state = engine.createState({ balance: 5000, bet: 100, freeSpins: 2, freeMultiplier: 0 });
    const firstContext = engine.startRound(state);
    const first = engine.settleRound(state, {
        baseWin: 100,
        multiplierTotal: 5,
        maxScatterCount: 0,
    }, firstContext);
    assert.equal(first.appliedMultiplier, 5, "5x küresi x1 tabanına fazladan eklenmemeli");
    assert.equal(first.totalWin, 500);
    assert.equal(state.freeMultiplier, 5);
    assert.equal(state.balance, 5500);

    const secondContext = engine.startRound(state);
    const second = engine.settleRound(state, {
        baseWin: 50,
        multiplierTotal: 2,
        maxScatterCount: 0,
    }, secondContext);
    assert.equal(second.appliedMultiplier, 7);
    assert.equal(second.totalWin, 350);
    assert.equal(second.accumulatedMultiplier, 7);
    assert.equal(second.freeSessionEnded, true);
    assert.equal(state.freeMultiplier, 0);
    assert.equal(state.balance, 5850);
});

test("Bonus Buy 50x bahis bedeliyle 10 Free Spins paketini güvenli biçimde açıyor", () => {
    const state = engine.createState({ balance: 10000, bet: 100 });
    assert.equal(engine.BONUS_BUY_COST_MULTIPLIER, 50);
    assert.equal(engine.bonusBuyCost(100), 5000);
    assert.equal(engine.canBuyBonus(state), true);

    const purchase = engine.buyBonus(state);
    assert.deepEqual(purchase, { cost: 5000, freeSpins: 10, balance: 5000 });
    assert.equal(state.balance, 5000);
    assert.equal(state.freeSpins, 10);
    assert.equal(state.freeMultiplier, 0);
    assert.equal(state.stats.bonusBuys, 1);
    assert.equal(engine.buyBonus(state), null, "aktif bonus sırasında ikinci satın alma engellenmeli");

    const freeContext = engine.startRound(state);
    assert.equal(freeContext.mode, "free");
    assert.equal(state.balance, 5000, "satın alınan Free Spin ayrıca bahis düşmemeli");

    const insufficient = engine.createState({ balance: 4999, bet: 100 });
    assert.equal(engine.canBuyBonus(insufficient), false);
    assert.equal(engine.buyBonus(insufficient), null);
    assert.equal(insufficient.balance, 4999);
});

test("bahis seçenekleri, yetersiz bakiye ve reset güvenli çalışıyor", () => {
    const state = engine.createState({ balance: 40, bet: 20 });
    assert.equal(engine.setBet(state, 50), true);
    assert.equal(engine.startRound(state), null);
    assert.equal(engine.setBet(state, 35), false);
    assert.equal(engine.setBet(state, 20), true);
    assert.ok(engine.startRound(state));
    assert.equal(engine.resetState(state), false, "aktif spin sırasında reset engellenmeli");
    engine.settleRound(state, { baseWin: 0, multiplierTotal: 0, maxScatterCount: 0 }, { mode: "paid", bet: 20 });
    assert.equal(engine.resetState(state), true);
    assert.equal(state.balance, 10000);
    assert.equal(state.bet, 100);
});

test("maksimum bahis 500.000 sanal krediye kadar çıkıyor", () => {
    assert.equal(engine.BET_OPTIONS.at(-1), 500000);
    const state = engine.createState({ balance: 1000000, bet: 1000 });
    assert.equal(engine.setBet(state, 500000), true);
    assert.equal(state.bet, 500000);

    const context = engine.startRound(state);
    assert.equal(context.bet, 500000);
    assert.equal(state.balance, 500000);
    assert.equal(engine.setBet(state, 500001), false);
});

test("oynanabilir bakiye bittiğinde sanal kredi otomatik yenileniyor", () => {
    const state = engine.createState({ balance: 0, bet: 500000 });
    assert.equal(engine.replenishBalanceIfEmpty(state), true);
    assert.equal(state.balance, engine.STARTING_BALANCE);
    assert.equal(state.bet, 100, "yenilenen bakiyeyi aşan bahis güvenli varsayılana dönmeli");
    assert.equal(engine.replenishBalanceIfEmpty(state), false, "dolu bakiye yeniden yazılmamalı");

    const activeBonus = engine.createState({ balance: 0, bet: 20, freeSpins: 1 });
    assert.equal(engine.replenishBalanceIfEmpty(activeBonus), false, "aktif Free Spin sırasında bakiye yenilenmemeli");
});

test("uzun vadeli kazanma ve bonus sıklığı hedeflenen dengeli aralıkta kalıyor", () => {
    let seed = 0x51a7c0de;
    const random = () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const spinCount = 25000;
    let wins = 0;
    let continuedCascades = 0;
    let multiplierLandings = 0;
    let freeSpinTriggers = 0;

    for (let index = 0; index < spinCount; index += 1) {
        const result = engine.resolveCascades(engine.createGrid(random), 100, random);
        if (result.baseWin > 0) wins += 1;
        if (result.steps.length > 1) continuedCascades += 1;
        if (result.multiplierTotal > 0) multiplierLandings += 1;
        if (result.awardedFreeSpins > 0) freeSpinTriggers += 1;
    }

    const hitRate = wins / spinCount;
    const cascadeContinuationRate = continuedCascades / spinCount;
    const multiplierLandingRate = multiplierLandings / spinCount;
    const freeSpinTriggerRate = freeSpinTriggers / spinCount;
    assert.ok(hitRate >= 0.44 && hitRate <= 0.52, `Kazanma sıklığı: ${hitRate}`);
    assert.ok(cascadeContinuationRate < 0.26, `Devam cascade sıklığı: ${cascadeContinuationRate}`);
    assert.ok(multiplierLandingRate >= 0.42 && multiplierLandingRate <= 0.52, `Çarpan sıklığı: ${multiplierLandingRate}`);
    assert.ok(freeSpinTriggerRate >= 0.006 && freeSpinTriggerRate <= 0.012, `Free Spins sıklığı: ${freeSpinTriggerRate}`);
});

console.log("Slot Game motor testleri başarılı: 6x5 grid, ödeme, cascade, çarpan, scatter, Free Spins, bakiye ve spin kilidi.");
