"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const engine = require("./engine.js");

function riggedTable(drawOrder, balance = 1000) {
    const cards = engine.createDeck();
    const shoe = drawOrder.map((rank, index) => ({
        ...cards.find((card) => card.rank === rank),
        id: `rigged-${index}-${rank}`,
    })).reverse();
    return engine.createState({ balance, deckCount: 1, reshuffleAt: 0.05, shoe });
}

function placeBets(state, bets) {
    bets.forEach((bet, spot) => assert.equal(engine.setBet(state, bet, spot), true));
}

test("Five separately wagered spots share one dealer and skip a natural during player turns", () => {
    const state = riggedTable([
        "A", "10", "K", "7", "10", "10",
        "K", "7", "10", "9", "8", "6",
        "2",
    ]);
    const stakes = [20, 40, 70, 100, 50];
    assert.equal(engine.MAX_SPOTS, stakes.length);
    placeBets(state, stakes);

    const deal = engine.beginRound(state);
    assert.equal(deal.reshuffled, false);
    assert.equal(deal.sequence.length, 12);
    assert.deepEqual(deal.sequence.filter(({ owner }) => owner === "player").map(({ spotIndex }) => spotIndex), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
    const dealerDeals = deal.sequence.filter(({ owner }) => owner === "dealer");
    assert.deepEqual(dealerDeals.map(({ card }) => card.rank), ["10", "6"]);
    assert.equal(dealerDeals[1].hidden, true);
    assert.equal(state.balance, 720);
    assert.equal(engine.totalBet(state), 280);
    assert.deepEqual(state.playerHands.map(({ bet }) => bet), stakes);
    assert.deepEqual(state.playerHands.map(({ cards }) => cards.map(({ rank }) => rank)), [
        ["A", "K"], ["10", "7"], ["K", "10"], ["7", "9"], ["10", "8"],
    ]);

    assert.equal(engine.afterInitialDeal(state).type, "player-turn");
    assert.equal(state.dealerRevealed, false);
    for (const spot of [1, 2, 3, 4]) {
        assert.equal(state.playerHands[state.activeHandIndex].spotIndex, spot);
        assert.ok(engine.stand(state));
    }
    assert.equal(state.phase, engine.PHASES.DEALER_TURN);
    assert.deepEqual(engine.dealerPlay(state).map(({ rank }) => rank), ["2"]);
    const result = engine.resolveRound(state);
    assert.deepEqual(result.results.map(({ spotIndex, outcome, payout }) => [spotIndex, outcome, payout]), [
        [0, "blackjack", 50], [1, "lose", 0], [2, "win", 140], [3, "lose", 0], [4, "push", 50],
    ]);
    assert.equal(state.balance, 960);
});

test("A rejected wager or deal leaves the entire table untouched", () => {
    const state = riggedTable(["10", "8", "9", "6", "7"], 100);
    placeBets(state, [40, 0, 0, 0, 60]);
    const fullyWagered = engine.serializeState(state);
    assert.equal(engine.addBet(state, 20, 2), false);
    assert.equal(engine.setBet(state, 80, 4), false);
    assert.deepEqual(engine.serializeState(state), fullyWagered);

    // Revalidate all pending wagers against the current bankroll when dealing.
    state.balance = 99;
    const insufficient = engine.serializeState(state);
    assert.equal(engine.beginRound(state), null);
    assert.deepEqual(engine.serializeState(state), insufficient);

    state.balance = 100;
    const deal = engine.beginRound(state, () => 0.5);
    assert.equal(deal.reshuffled, true);
    assert.equal(deal.sequence.length, 6);
    assert.equal(state.balance, 0);
    assert.deepEqual(state.playerHands.map(({ spotIndex, bet }) => [spotIndex, bet]), [[0, 40], [4, 60]]);
});

test("Split and double stay with their spot through restore, settlement and repeat", () => {
    let state = riggedTable(["8", "5", "10", "8", "6", "6", "K", "3", "10", "2"]);
    const stakes = [0, 40, 0, 80, 0];
    placeBets(state, stakes);
    engine.beginRound(state);
    engine.afterInitialDeal(state);

    assert.deepEqual(engine.split(state).cards.map(({ rank }) => rank), ["K", "3"]);
    assert.deepEqual(state.playerHands.map(({ spotIndex, bet }) => [spotIndex, bet]), [[1, 40], [1, 40], [3, 80]]);
    assert.equal(new Set(state.playerHands.map(({ id }) => id)).size, 3);
    assert.equal(state.balance, 840);
    engine.stand(state);

    const restored = engine.restoreState(JSON.parse(JSON.stringify(engine.serializeState(state))));
    assert.deepEqual(restored, state);
    state = restored;
    assert.equal(state.playerHands[state.activeHandIndex].spotIndex, 1);
    assert.equal(engine.doubleDown(state).card.rank, "10");
    assert.equal(state.playerHands[state.activeHandIndex].spotIndex, 3);
    assert.deepEqual(state.playerHands.map(({ bet }) => bet), [40, 80, 80]);
    assert.equal(engine.totalBet(state), 200);
    assert.equal(state.balance, 800);

    engine.stand(state);
    engine.dealerPlay(state);
    const result = engine.resolveRound(state);
    assert.deepEqual(result.results.map(({ spotIndex, outcome, payout }) => [spotIndex, outcome, payout]), [
        [1, "push", 40], [1, "win", 160], [3, "lose", 0],
    ]);
    assert.equal(state.balance, 1000);
    assert.equal(engine.resolveRound(state), null);
    assert.equal(state.balance, 1000);

    assert.equal(engine.prepareNextRound(state), true);
    assert.equal(engine.totalBet(state), 0);
    assert.equal(engine.repeatBet(state), true);
    assert.deepEqual(state.spotBets, stakes);
    assert.equal(engine.totalBet(state), 120);
});

test("The single insurance decision covers all funded spots against a dealer natural", () => {
    const state = riggedTable(["A", "9", "A", "Q", "7", "K"]);
    placeBets(state, [0, 50, 0, 0, 100]);
    engine.beginRound(state);
    assert.equal(engine.afterInitialDeal(state).type, "insurance");
    assert.equal(engine.takeInsurance(state).type, "dealer-blackjack");
    assert.equal(state.insuranceBet, 75);
    assert.equal(engine.takeInsurance(state), false);
    const result = engine.resolveRound(state);
    assert.equal(result.insuranceWon, true);
    assert.deepEqual(result.results.map(({ spotIndex, payout }) => [spotIndex, payout]), [[1, 50], [4, 0]]);
    assert.equal(state.balance, 1050);
});

test("Declining insurance skips a player natural while the other spot keeps playing", () => {
    const state = riggedTable(["A", "Q", "A", "K", "K", "7"]);
    placeBets(state, [0, 50, 0, 0, 100]);
    engine.beginRound(state);
    assert.equal(engine.afterInitialDeal(state).type, "insurance");
    assert.equal(engine.declineInsurance(state).type, "player-turn");
    assert.equal(state.playerHands[state.activeHandIndex].spotIndex, 4);
    assert.equal(state.dealerRevealed, false);
    engine.stand(state);
    assert.deepEqual(engine.dealerPlay(state), []);
    const result = engine.resolveRound(state);
    assert.deepEqual(result.results.map(({ outcome }) => outcome), ["blackjack", "win"]);
    assert.equal(state.balance, 1175);
});

test("A split keeps both new cards when the shoe runs out between them", () => {
    const state = riggedTable(["8", "5", "10", "8", "6", "6", "K"]);
    state.shoe[0].id = "1:0-spades-K";
    placeBets(state, [0, 40, 0, 80, 0]);
    engine.beginRound(state);
    engine.afterInitialDeal(state);
    assert.equal(state.shoe.length, 1);
    const split = engine.split(state);
    assert.equal(split.cards[0].rank, "K");
    assert.deepEqual(state.playerHands.map(({ spotIndex, cards }) => [spotIndex, cards.length]), [[1, 2], [1, 2], [3, 2]]);
    assert.equal(state.playerHands[1].cards[1], split.cards[1]);
    const cards = [...state.dealerHand, ...state.playerHands.flatMap((hand) => hand.cards), ...state.shoe];
    assert.equal(new Set(cards.map(({ id }) => id)).size, cards.length);
    assert.equal(state.balance, 840);
});

test("A saved single-hand round resumes at the first spot", () => {
    const state = riggedTable(["9", "6", "8", "10", "4"]);
    assert.equal(engine.setBet(state, 40), true);
    engine.beginRound(state);
    engine.afterInitialDeal(state);

    const oldSave = engine.serializeState(state);
    oldSave.version = 1;
    delete oldSave.spotBets;
    delete oldSave.lastSpotBets;
    delete oldSave.playerHands[0].spotIndex;
    const restored = engine.restoreState(oldSave);
    assert.ok(restored);
    assert.deepEqual(restored.spotBets, [40, 0, 0, 0, 0]);
    assert.deepEqual(restored.lastSpotBets, [40, 0, 0, 0, 0]);
    assert.equal(restored.playerHands[restored.activeHandIndex].spotIndex, 0);
    assert.equal(restored.balance, 960);
    assert.equal(engine.hit(restored).card.rank, "4");
    assert.equal(restored.phase, engine.PHASES.DEALER_TURN);
});
