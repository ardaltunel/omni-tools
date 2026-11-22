"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { performance } = require("node:perf_hooks");
const core = require("./core.js");
const cards = core.createDeck();
const byId = new Map(cards.map((card) => [card.id, card]));

function cryptoSeed(seed = 12345) {
    let current = seed >>> 0;
    return { getRandomValues(values) { current = (Math.imul(current, 1664525) + 1013904223) >>> 0; values[0] = current; return values; } };
}

function knowledge(state) {
    const hidden = new Set(state.initialHiddenIds);
    state.publicCardIds = [...state.table, ...state.captures.flat()].filter((card) => !hidden.has(card.id)).map((card) => card.id);
    state.seenCardIds = [0, 1].map((team) => [...state.publicCardIds, ...state.captures.flatMap((pile, seat) => {
        const owner = state.mode === "teams" ? seat % 2 : seat;
        return owner === team ? pile.filter((card) => hidden.has(card.id)).map((card) => card.id) : [];
    })]);
    return state;
}

function initial({ mode = "duel", table = ["clubs-2", "diamonds-10", "spades-K", "hearts-A"], hands = {} } = {}) {
    const state = core.createGame({ mode }, cryptoSeed());
    const used = new Set(table);
    Object.values(hands).flat().forEach((id) => {
        assert.equal(used.has(id), false, id);
        used.add(id);
    });
    const available = cards.filter((card) => !used.has(card.id));
    state.table = table.map((id) => byId.get(id));
    state.initialHiddenIds = table.slice(0, 3);
    state.hands = state.hands.map((_, seat) => {
        const hand = (hands[seat] || []).map((id) => byId.get(id));
        while (hand.length < 4) hand.push(available.pop());
        return hand;
    });
    state.deck = available;
    knowledge(state);
    assert.ok(core.restoreState(core.serializeState(state)));
    return state;
}

function roundTrip(state) {
    const snapshot = JSON.parse(JSON.stringify(core.serializeState(state)));
    const restored = core.restoreState(snapshot);
    assert.deepEqual(restored, state);
    return restored;
}

function finalTurn({ matching = true, noCaptures = false } = {}) {
    const state = core.createGame({}, cryptoSeed());
    const final = byId.get(matching ? "hearts-Q" : "hearts-9");
    const top = byId.get("clubs-Q");
    state.initialHiddenIds = noCaptures ? ["clubs-J", "diamonds-J", "hearts-J"] : ["clubs-A", "clubs-2", "clubs-3"];
    state.moveNumber = 47;
    state.currentSeat = 1;
    state.deck = [];
    state.hands = [[], [final]];
    state.lastCapturer = noCaptures ? null : 0;
    if (noCaptures) {
        state.table = [...state.initialHiddenIds.map((id) => byId.get(id)), ...cards.filter((card) => !state.initialHiddenIds.includes(card.id) && card.id !== final.id && card.id !== top.id), top];
        state.captures = [[], []];
        state.hiddenTableCount = 3;
    } else {
        state.table = [top];
        state.captures = [cards.filter((card) => card.id !== final.id && card.id !== top.id), []];
        state.hiddenTableCount = 0;
    }
    state.lastMove = { seat: 0, card: top, capturedCards: [], capturedCount: 0, pisti: null, dealt: false, finalPlay: false, collectedLeftovers: [], leftoversCount: 0, leftoversSeat: null };
    knowledge(state);
    return roundTrip(state);
}

test("52 unique canonical cards are shuffled securely and the rejection tail is discarded", () => {
    assert.equal(cards.length, 52);
    assert.equal(new Set(cards.map((card) => card.id)).size, 52);
    const samples = [0xffffffff, 51];
    assert.equal(core.secureRandomInt(52, { getRandomValues(value) { value[0] = samples.shift(); } }), 51);
    assert.equal(samples.length, 0);
    assert.throws(() => core.secureRandomInt(0, cryptoSeed()), RangeError);
    assert.throws(() => core.createGame({}, {}), /Güvenli/);
    const shuffled = core.shuffleDeck(cards, cryptoSeed());
    assert.notDeepEqual(shuffled, cards);
    assert.deepEqual(shuffled.map((card) => card.id).sort(), cards.map((card) => card.id).sort());
});

test("duel and team games deal four per seat and expose only the initial top card", () => {
    for (const mode of ["duel", "teams"]) {
        const state = core.createGame({ mode }, cryptoSeed());
        const count = mode === "teams" ? 4 : 2;
        assert.equal(state.dealer, count - 1);
        assert.equal(state.currentSeat, 0);
        assert.equal(state.deck.length, 48 - count * 4);
        assert.deepEqual(state.hands.map((hand) => hand.length), Array(count).fill(4));
        const view = core.getPlayerView(state, 0);
        assert.deepEqual(view.table.slice(0, 3), [null, null, null]);
        assert.equal(view.table[3].id, state.table[3].id);
        assert.equal(view.deck, undefined);
        assert.equal(view.hands[1], null);
        if (mode === "teams") assert.equal(view.hands[2], null);
        assert.deepEqual(view.knownCardIds, [state.table[3].id]);
        roundTrip(state);
    }
});

test("moves are immutable, legal-turn checked and batches are dealt only after every hand is empty", () => {
    let state = core.createGame({}, cryptoSeed());
    const before = core.serializeState(state);
    assert.equal(core.playCard(state, 1, state.hands[1][0].id), null);
    assert.equal(core.playCard(state, 0, state.hands[1][0].id), null);
    assert.equal(core.playCard(state, 0, "invalid"), null);
    const next = core.playCard(state, 0, state.hands[0][0].id);
    assert.deepEqual(core.serializeState(state), before);
    assert.equal(next.hands[0].length, 3);
    state = next;
    for (let index = 1; index < 8; index += 1) {
        const oldDeck = state.deck.length;
        state = core.playCard(state, state.currentSeat, state.hands[state.currentSeat][0].id);
        assert.equal(state.lastMove.dealt, index === 7);
        assert.equal(state.deck.length, index === 7 ? oldDeck - 8 : oldDeck);
    }
    assert.deepEqual(state.hands.map((hand) => hand.length), [4, 4]);
    assert.equal(state.currentSeat, 0);
});

test("matching a pile captures everything while a single matching card earns exactly one normal pişti", () => {
    let state = initial({ hands: { 0: ["clubs-A", "hearts-9"], 1: ["spades-9"] } });
    state = core.playCard(state, 0, "clubs-A");
    assert.equal(state.lastMove.capturedCount, 5);
    assert.equal(state.lastMove.pisti, null);
    state = core.playCard(state, 1, "spades-9");
    state = core.playCard(state, 0, "hearts-9");
    assert.equal(state.lastMove.pisti, "normal");
    assert.deepEqual(state.pisti, [{ normal: 1, jack: 0 }, { normal: 0, jack: 0 }]);
    roundTrip(state);
});

test("Jack on a non-Jack singleton captures without pişti and Jack on Jack earns 20", () => {
    for (const jackTop of [false, true]) {
        let state = initial({ hands: { 0: ["clubs-A", "hearts-J"], 1: [jackTop ? "spades-J" : "spades-9"] } });
        state = core.playCard(state, 0, "clubs-A");
        state = core.playCard(state, 1, jackTop ? "spades-J" : "spades-9");
        assert.equal(state.table.length, 1, "a Jack played to an empty table remains there");
        state = core.playCard(state, 0, "hearts-J");
        assert.equal(state.lastMove.pisti, jackTop ? "jack" : null);
        assert.equal(state.pisti[0].jack, jackTop ? 1 : 0);
        roundTrip(state);
    }
});

test("the collector team alone learns the original three hidden cards", () => {
    let state = initial({ mode: "teams", hands: { 0: ["clubs-A"] } });
    const hidden = state.initialHiddenIds.slice();
    state = core.playCard(state, 0, "clubs-A");
    for (const seat of [0, 2]) {
        const view = core.getPlayerView(state, seat);
        assert.ok(hidden.every((id) => view.knownCardIds.includes(id)));
        assert.equal(view.lastMove.capturedCards.length, 5);
    }
    for (const seat of [1, 3]) {
        const view = core.getPlayerView(state, seat);
        assert.ok(hidden.every((id) => !view.knownCardIds.includes(id)));
        assert.equal(view.lastMove.capturedCount, 5);
        assert.equal(view.lastMove.capturedCards.length, 2);
        assert.equal(view.capturedCounts[0], 5);
        assert.equal(view.captures[0].length, 2);
        const visible = JSON.stringify(view);
        assert.ok(hidden.every((id) => !visible.includes(`\"${id}\"`)));
    }
    roundTrip(state);
});

test("the last card captures without a pişti bonus and pays a completed round once", () => {
    const before = finalTurn();
    const state = core.playCard(before, 1, "hearts-Q");
    assert.equal(state.lastMove.finalPlay, true);
    assert.equal(state.lastMove.capturedCount, 2);
    assert.equal(state.lastMove.pisti, null);
    assert.equal(state.phase, "round-over");
    assert.deepEqual(state.pisti, [{ normal: 0, jack: 0 }, { normal: 0, jack: 0 }]);
    assert.equal(state.scores[0] + state.scores[1], 16);
    assert.equal(core.playCard(state, 1, "hearts-Q"), null);
    assert.equal(core.nextRound(state, cryptoSeed()).scores[0] + core.nextRound(state, cryptoSeed()).scores[1], 16);
    roundTrip(state);
});

test("remaining table cards go to the last collector, and a no-capture round awards them to the dealer", () => {
    for (const noCaptures of [false, true]) {
        const before = finalTurn({ matching: false, noCaptures });
        const state = core.playCard(before, 1, "hearts-9");
        const recipient = noCaptures ? state.dealer : before.lastCapturer;
        assert.equal(state.lastMove.leftoversSeat, recipient);
        assert.equal(state.lastMove.leftoversCount, noCaptures ? 52 : 2);
        assert.equal(state.captures[recipient].length, 52);
        assert.equal(state.table.length, 0);
        assert.equal(state.lastMove.pisti, null);
        roundTrip(state);
    }
});

test("the 13 card points are exact and majority requires strictly more than 26", () => {
    assert.equal(cards.reduce((sum, card) => sum + core.cardPoints(card), 0), 13);
    assert.equal(core.cardPoints(byId.get("clubs-2")), 2);
    assert.equal(core.cardPoints(byId.get("diamonds-10")), 3);
    let before = finalTurn();
    const currentCaptured = before.captures[0];
    before.captures = [currentCaptured.slice(0, 26), currentCaptured.slice(26)];
    knowledge(before);
    before = roundTrip(before);
    const state = core.playCard(before, 1, "hearts-Q");
    assert.deepEqual(state.captures.map((pile) => pile.length), [26, 26]);
    assert.deepEqual(state.roundSummary.teams.map((team) => team.majorityPoints), [0, 0]);
    assert.equal(state.scores[0] + state.scores[1], 13);
    roundTrip(state);
});

test("dealer and first player rotate and a match ends only after the complete round with a strict lead", () => {
    let before = finalTurn();
    before.target = 1;
    let completed = core.playCard(before, 1, "hearts-Q");
    assert.equal(completed.phase, "match-over");
    assert.equal(completed.winner, 0);
    assert.equal(core.nextRound(completed, cryptoSeed()), null);
    roundTrip(completed);

    before = finalTurn();
    before.target = 1;
    const resultPoints = core.playCard(before, 1, "hearts-Q").roundSummary.points;
    before.scores = [resultPoints[1], resultPoints[0]];
    before.roundStartingScores = before.scores.slice();
    completed = core.playCard(before, 1, "hearts-Q");
    assert.equal(completed.scores[0], completed.scores[1]);
    assert.equal(completed.phase, "round-over");
    assert.equal(completed.winner, null);
    const next = core.nextRound(roundTrip(completed), cryptoSeed());
    assert.equal(next.dealer, 0);
    assert.equal(next.currentSeat, 1);
    assert.equal(next.roundNumber, 2);
    assert.deepEqual(next.scores, completed.scores);
});

test("easy AI captures an obvious pişti and preserves a Jack on an empty table", () => {
    let state = initial({ hands: { 0: ["clubs-A", "spades-J", "hearts-7", "clubs-4"], 1: ["spades-7", "diamonds-J"] } });
    state = core.playCard(state, 0, "clubs-A");
    const empty = core.chooseMove(state, 1, "easy");
    assert.notEqual(byId.get(empty).rank, "J");
    state = core.playCard(state, 1, "spades-7");
    assert.equal(core.chooseMove(state, 0, "easy"), "hearts-7");
    assert.equal(core.chooseMove(state, 0, "medium"), "hearts-7");
    assert.equal(core.chooseMove(state, 0, "hard"), "hearts-7");
});

test("difficulty and public team ownership change strategy without exposing a partner hand", () => {
    let state = initial({
        mode: "teams", table: ["clubs-2", "spades-2", "spades-A", "spades-10"],
        hands: {
            0: ["clubs-10"], 1: ["hearts-A"], 2: ["hearts-K"],
            3: ["clubs-J", "hearts-4", "hearts-5", "hearts-6"],
        },
    });
    state = core.playCard(state, 0, "clubs-10");
    state = core.playCard(state, 1, "hearts-A");
    state = core.playCard(state, 2, "hearts-K");
    assert.equal(core.chooseMove(state, 3, "medium"), "clubs-J");
    assert.equal(core.chooseMove(state, 3, "hard"), "clubs-J");
    assert.notEqual(core.chooseMove(state, 3, "easy"), "clubs-J");

    const partnerCollected = core.restoreState(core.serializeState(state));
    partnerCollected.captures[1] = partnerCollected.captures[0];
    partnerCollected.captures[0] = [];
    partnerCollected.lastCapturer = 1;
    knowledge(partnerCollected);
    assert.equal(core.getPlayerView(partnerCollected, 3).hands[1], null);
    assert.notEqual(core.chooseMove(partnerCollected, 3, "hard"), "clubs-J", "reserve a Jack for a larger pile after the partner collected");
});

test("hard AI uses public information only when hidden opponents and stock are permuted", () => {
    for (const mode of ["duel", "teams"]) {
        let state = core.createGame({ mode, difficulty: "hard" }, cryptoSeed(991));
        for (let move = 0; move < 20; move += 1) {
            const seat = state.currentSeat;
            const other = core.restoreState(core.serializeState(state));
            const hidden = [...other.deck, ...other.hands.flatMap((hand, index) => index === seat ? [] : hand)].reverse();
            other.hands.forEach((hand, index) => {
                if (index !== seat) other.hands[index] = Array.from({ length: hand.length }, () => hidden.pop());
            });
            other.deck = hidden;
            assert.deepEqual(core.getPlayerView(other, seat), core.getPlayerView(state, seat));
            assert.equal(core.chooseMove(other, seat, "hard"), core.chooseMove(state, seat, "hard"));
            state = core.playCard(state, seat, core.chooseMove(state, seat, "hard"));
        }
    }
});

test("damaged saves reject duplicate cards, leaked knowledge, wrong turns, fake results and missing metadata", () => {
    const state = core.createGame({}, cryptoSeed());
    const corruptions = [
        (saved) => { saved.version = 2; },
        (saved) => { saved.deck[0] = saved.hands[0][0]; },
        (saved) => { saved.deck[0] = "not-a-card"; },
        (saved) => { saved.currentSeat = 1; },
        (saved) => { saved.hiddenTableCount = 0; },
        (saved) => { saved.publicCardIds.push(saved.initialHiddenIds[0]); },
        (saved) => { saved.seenCardIds[1].push(saved.initialHiddenIds[0]); },
        (saved) => { saved.scores[0] = 500; },
        (saved) => { delete saved.pisti[0]; },
        (saved) => { saved.hands[0].pop(); },
        (saved) => { saved.phase = "match-over"; },
    ];
    for (const corrupt of corruptions) {
        const saved = core.serializeState(state);
        corrupt(saved);
        assert.equal(core.restoreState(saved), null);
    }
    const completed = core.playCard(finalTurn(), 1, "hearts-Q");
    const paid = core.serializeState(completed);
    paid.scores[0] += 10;
    assert.equal(core.restoreState(paid), null);
    const saved = core.serializeState(state);
    const restored = core.restoreState(saved);
    saved.initialHiddenIds[0] = "not-a-card";
    assert.notEqual(restored.initialHiddenIds[0], "not-a-card");
});

test("240 complete seeded rounds conserve 52 cards, restore every move and score exact team totals", () => {
    let maximumChoiceMs = 0;
    for (const mode of ["duel", "teams"]) {
        for (let seed = 1; seed <= 120; seed += 1) {
            let state = core.createGame({ mode, target: 100000 }, cryptoSeed(seed));
            for (let move = 0; move < 48; move += 1) {
                const start = performance.now();
                const selected = core.chooseMove(state, state.currentSeat, ["easy", "medium", "hard"][move % 3]);
                maximumChoiceMs = Math.max(maximumChoiceMs, performance.now() - start);
                state = core.playCard(state, state.currentSeat, selected);
                assert.ok(state);
                state = roundTrip(state);
                const all = [...state.deck, ...state.hands.flat(), ...state.table, ...state.captures.flat()];
                assert.equal(all.length, 52);
                assert.equal(new Set(all.map((card) => card.id)).size, 52);
            }
            assert.equal(state.phase, "round-over");
            const { teams } = state.roundSummary;
            assert.equal(teams[0].cardPoints + teams[1].cardPoints, 13);
            const majority = teams[0].capturedCount === 26 ? 0 : 3;
            assert.equal(teams[0].majorityPoints + teams[1].majorityPoints, majority);
            assert.equal(state.scores[0] + state.scores[1], 13 + majority + teams[0].pistiPoints + teams[1].pistiPoints);
        }
    }
    console.log(`240 rounds, 11,520 saved moves; max AI call ${maximumChoiceMs.toFixed(2)} ms`);
});
