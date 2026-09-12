"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const e = require("./engine.js");
const card = rank => e.createDeck().find(c => c.rank === rank);

test("Damaged statistics do not prevent restoring a saved game", () => {
    const snapshot = e.serializeState(e.createState());
    snapshot.stats = null;
    assert.ok(e.restoreState(snapshot));
});

test("A three-card shoe is shuffled before a four-card initial deal", () => {
    const state = e.createState({deckCount:1,reshuffleAt:.05,shoe:[card('2'),card('3'),card('4')]});
    e.setBet(state, 20);
    assert.equal(e.beginRound(state).reshuffled, true);
    assert.equal(state.shoe.length, 48);
});

test("Dealer natural beats a non-natural 21, including a split 21", () => {
    for (const cards of [[card("7"), card("4"), card("10")], [card("A"), card("K")]]) {
        const result = e.resolveHand({cards, bet: 200, naturalBlackjack: false}, [card("A"), card("Q")]);
        assert.equal(result.outcome, "lose");
        assert.equal(result.payout, 0);
    }
});

test("Displayed stake includes both split hands, doubles and insurance", () => {
    const state = e.createState();
    e.setBet(state, 200);
    assert.equal(e.totalBet(state), 200);
    state.phase = e.PHASES.PLAYER_TURN;
    state.playerHands = [{bet:400}, {bet:200}];
    state.insuranceBet = 100;
    assert.equal(e.totalBet(state), 700);
});

test("5000 seeded rounds: money conservation, save/restore and single settlement", () => {
    let seed = 9122026;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    let state = e.createState({balance: 10000000, random});
    let splits = 0, doubles = 0, insurances = 0;
    const roundTrip = () => {
        const restored = e.restoreState(JSON.parse(JSON.stringify(e.serializeState(state))));
        assert.deepEqual(restored, state);
        state = restored;
    };
    for (let i = 0; i < 5000; i++) {
        const before = state.balance;
        e.setBet(state, 20 + 10 * (i % 10));
        assert.ok(e.beginRound(state, random));
        roundTrip();
        e.afterInitialDeal(state);
        roundTrip();
        if (state.phase === e.PHASES.INSURANCE) {
            insurances++;
            if (i % 2) e.takeInsurance(state); else e.declineInsurance(state);
            roundTrip();
        }
        let steps = 0;
        while (state.phase === e.PHASES.PLAYER_TURN) {
            assert.ok(++steps < 40);
            const hand = state.playerHands[state.activeHandIndex];
            if (e.canSplit(hand) && random() < .75) { e.split(state); splits++; }
            else if (e.canDouble(hand) && random() < .25) { e.doubleDown(state); doubles++; }
            else if (e.calculateHand(hand.cards).total < 17) e.hit(state);
            else e.stand(state);
            roundTrip();
        }
        if (state.phase === e.PHASES.DEALER_TURN) { e.dealerPlay(state); roundTrip(); }
        assert.equal(state.phase, e.PHASES.RESOLVING);
        const stake = e.totalBet(state);
        const result = e.resolveRound(state);
        const payout = result.results.reduce((n, r) => n + r.payout, 0);
        assert.equal(state.balance, before - stake + payout + (state.round.insuranceWon ? state.insuranceBet * 3 : 0));
        assert.ok(Number.isInteger(state.balance) && state.balance >= 0);
        roundTrip();
        const paid = state.balance;
        assert.equal(e.resolveRound(state), null);
        assert.equal(state.balance, paid);
        e.prepareNextRound(state);
        roundTrip();
    }
    assert.ok(splits > 100 && doubles > 100 && insurances > 100);
    console.log({rounds:5000,splits,doubles,insurances});
});
