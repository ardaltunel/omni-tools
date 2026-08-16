"use strict";

const assert = require("node:assert/strict");
const engine = require("./engine.js");

const card = (rank, suit = "spades") => {
    const meta = engine.SUITS.find((item) => item.id === suit);
    return { id: `${rank}-${suit}`, rank, suit, suitSymbol: meta.symbol, suitName: meta.name, color: meta.color };
};
const hand = (cards, bet = 200) => ({ cards, bet, status: "playing", naturalBlackjack: false, isSplit: false, doubled: false });

assert.equal(engine.createDeck().length, 52);
assert.equal(new Set(engine.createDeck().map((item) => item.id)).size, 52);
assert.equal(engine.createShoe(6).length, 312);
assert.deepEqual(engine.shuffle([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);

assert.deepEqual(engine.calculateHand([card("A"), card("A"), card("9")]), { total: 21, hardTotal: 11, isSoft: true, softAces: 1, aceCount: 2 });
assert.deepEqual(engine.calculateHand([card("A"), card("6")]), { total: 17, hardTotal: 7, isSoft: true, softAces: 1, aceCount: 1 });
assert.deepEqual(engine.calculateHand([card("A"), card("6"), card("10")]), { total: 17, hardTotal: 17, isSoft: false, softAces: 0, aceCount: 1 });
assert.equal(engine.isBlackjack([card("A"), card("K")]), true);
assert.equal(engine.isBlackjack([card("A"), card("A"), card("9")]), false);
assert.equal(engine.calculateHand([card("10"), card("6"), card("5")]).total, 21);
assert.equal(engine.isBust([card("10"), card("6"), card("6")]), true);
assert.equal(engine.canSplit(hand([card("K"), card("Q")])), true);
assert.equal(engine.canSplit(hand([card("8"), card("7")])), false);
assert.equal(engine.canDouble(hand([card("8"), card("7")])), true);

assert.equal(engine.dealerShouldHit([card("A"), card("6")]), false);
assert.equal(engine.dealerShouldHit([card("A"), card("6")], true), true);
assert.equal(engine.dealerShouldHit([card("10"), card("6")]), true);
assert.equal(engine.dealerShouldHit([card("10"), card("7")]), false);

const blackjackHand = hand([card("A"), card("K")], 200);
blackjackHand.naturalBlackjack = true;
assert.equal(engine.resolveHand(blackjackHand, [card("10"), card("7")]).payout, 500);
assert.equal(engine.resolveHand(blackjackHand, [card("A"), card("Q")]).outcome, "push");
assert.equal(engine.resolveHand(hand([card("10"), card("8")]), [card("10"), card("8")]).outcome, "push");
assert.equal(engine.resolveHand(hand([card("10"), card("8")]), [card("10"), card("9")]).outcome, "lose");
assert.equal(engine.resolveHand(hand([card("10"), card("8")]), [card("10"), card("6"), card("8")]).outcome, "dealer-bust");
assert.equal(engine.calculatePayout("blackjack", 50), 125);

const state = engine.createState({ balance: 1000, deckCount: 1, reshuffleAt: 0.05, shoe: [card("7"), card("K"), card("9"), card("A")] });
assert.equal(engine.setBet(state, 200), true);
const deal = engine.beginRound(state);
assert.equal(deal.sequence.length, 4);
assert.equal(state.balance, 800);
const decision = engine.afterInitialDeal(state);
assert.equal(decision.type, "player-blackjack");
assert.equal(state.phase, engine.PHASES.RESOLVING);
const round = engine.resolveRound(state);
assert.equal(round.results[0].outcome, "blackjack");
assert.equal(state.balance, 1300);

const insuranceWin = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("K"), card("8"), card("A"), card("10")],
});
engine.setBet(insuranceWin, 200);
engine.beginRound(insuranceWin);
assert.equal(engine.afterInitialDeal(insuranceWin).type, "insurance");
assert.equal(engine.takeInsurance(insuranceWin).type, "dealer-blackjack");
engine.resolveRound(insuranceWin);
assert.equal(insuranceWin.balance, 1000);

const insuranceLose = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("7"), card("7"), card("A"), card("10")],
});
engine.setBet(insuranceLose, 200);
engine.beginRound(insuranceLose);
engine.afterInitialDeal(insuranceLose);
assert.equal(engine.takeInsurance(insuranceLose).type, "player-turn");
engine.stand(insuranceLose);
engine.dealerPlay(insuranceLose);
engine.resolveRound(insuranceLose);
assert.equal(insuranceLose.balance, 700);

const splitState = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("K"), card("3"), card("7"), card("8"), card("10"), card("8")],
});
engine.setBet(splitState, 200);
engine.beginRound(splitState);
engine.afterInitialDeal(splitState);
const splitResult = engine.split(splitState);
assert.deepEqual(splitResult.cards.map((item) => item.rank), ["3", "K"]);
assert.equal(splitState.playerHands.length, 2);
assert.equal(splitState.playerHands.every((item) => item.bet === 200), true);
assert.equal(splitState.balance, 600);
engine.stand(splitState);
engine.stand(splitState);
engine.dealerPlay(splitState);
const splitRound = engine.resolveRound(splitState);
assert.deepEqual(splitRound.results.map((item) => item.outcome), ["lose", "win"]);
assert.equal(splitState.balance, 1000);

const splitAces = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("K"), card("5"), card("7"), card("A"), card("9"), card("A")],
});
engine.setBet(splitAces, 200);
engine.beginRound(splitAces);
engine.afterInitialDeal(splitAces);
assert.equal(engine.split(splitAces).splitAces, true);
assert.equal(splitAces.phase, engine.PHASES.DEALER_TURN);
assert.equal(splitAces.playerHands.every((item) => item.status === "standing"), true);
assert.equal(engine.resolveHand({ ...hand([card("A"), card("K")]), isSplit: true }, [card("10"), card("Q")]).payout, 400);

const insufficientDouble = engine.createState({
    balance: 300,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("7"), card("8"), card("6"), card("9")],
});
engine.setBet(insufficientDouble, 200);
engine.beginRound(insufficientDouble);
engine.afterInitialDeal(insufficientDouble);
assert.equal(engine.doubleDown(insufficientDouble), null);

const doubleState = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("4"), card("K"), card("10"), card("2"), card("6"), card("9")],
});
engine.setBet(doubleState, 200);
engine.beginRound(doubleState);
engine.afterInitialDeal(doubleState);
assert.equal(engine.doubleDown(doubleState).card.rank, "K");
assert.equal(doubleState.playerHands[0].bet, 400);
engine.dealerPlay(doubleState);
engine.resolveRound(doubleState);
assert.equal(doubleState.balance, 1400);

const lowShoe = engine.createState({ balance: 1000, shoe: [card("2"), card("3"), card("4")] });
engine.setBet(lowShoe, 20);
assert.equal(engine.beginRound(lowShoe).reshuffled, true);

const resumable = engine.createState({
    balance: 1000,
    deckCount: 1,
    reshuffleAt: 0.05,
    shoe: [card("4"), card("K"), card("6"), card("9"), card("7")],
});
engine.setBet(resumable, 200);
engine.beginRound(resumable);
engine.afterInitialDeal(resumable);
const snapshot = engine.serializeState(resumable);
const restored = engine.restoreState(snapshot);
assert.deepEqual(restored, resumable);
assert.notEqual(restored, resumable);
assert.equal(engine.hit(restored).card.rank, "4");
assert.equal(resumable.playerHands[0].cards.length, 2);
assert.equal(snapshot.shoe.length, 1);
assert.equal(engine.restoreState({ version: 1, phase: engine.PHASES.PLAYER_TURN }), null);

console.log("Blackjack motor testleri başarılı: shoe, As hesabı, doğal Blackjack, ödeme, split, insurance, double, bakiye sınırları, round çözümü ve tur geri yükleme.");
