(function initPistiCore(root, factory) {
    "use strict";
    const core = factory();
    if (typeof module === "object" && module.exports) module.exports = core;
    else root.OmniPistiCore = core;
})(typeof globalThis !== "undefined" ? globalThis : window, function createPistiCore() {
    "use strict";

    const SUITS = Object.freeze(["clubs", "diamonds", "hearts", "spades"]);
    const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
    const MODES = Object.freeze(["duel", "teams"]);
    const DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);
    const RECENT_MEMORY_LIMIT = 10;
    const CARDS = Object.freeze(SUITS.flatMap((suit) => RANKS.map((rank) => Object.freeze({ id: `${suit}-${rank}`, suit, rank }))));
    const CARDS_BY_ID = new Map(CARDS.map((card) => [card.id, card]));

    function secureRandomInt(max, cryptoSource = globalThis.crypto) {
        if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new RangeError("Geçersiz rastgele sayı aralığı.");
        if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") throw new Error("Güvenli kart karıştırma kullanılamıyor.");
        const value = new Uint32Array(1);
        const limit = 0x100000000 - (0x100000000 % max);
        do { cryptoSource.getRandomValues(value); } while (value[0] >= limit);
        return value[0] % max;
    }

    function createDeck() { return CARDS.slice(); }

    function shuffleDeck(cards = CARDS, cryptoSource = globalThis.crypto) {
        const shuffled = cards.slice();
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const other = secureRandomInt(index + 1, cryptoSource);
            [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
        }
        return shuffled;
    }

    function seatCount(state) { return state.mode === "teams" ? 4 : 2; }
    function teamOf(state, seat) { return state.mode === "teams" ? seat % 2 : seat; }
    function nonnegative(value) { return Number.isSafeInteger(value) && value >= 0; }

    function cardPoints(card) {
        if (card.rank === "A" || card.rank === "J") return 1;
        if (card.id === "clubs-2") return 2;
        if (card.id === "diamonds-10") return 3;
        return 0;
    }

    function dealBatch(state) {
        const count = seatCount(state);
        for (let offset = 1; offset <= count; offset += 1) {
            const seat = (state.dealer + offset) % count;
            for (let card = 0; card < 4; card += 1) state.hands[seat].push(state.deck.pop());
        }
    }

    function refreshKnowledge(state) {
        const hidden = new Set(state.initialHiddenIds);
        state.publicCardIds = [...state.table, ...state.captures.flat()].filter((card) => !hidden.has(card.id)).map((card) => card.id);
        state.seenCardIds = [0, 1].map((team) => {
            const privateCards = state.captures.flatMap((cards, seat) => teamOf(state, seat) === team ? cards : []);
            return [...state.publicCardIds, ...privateCards.filter((card) => hidden.has(card.id)).map((card) => card.id)];
        });
    }

    function startRound(options, cryptoSource) {
        const count = options.mode === "teams" ? 4 : 2;
        const deck = shuffleDeck(CARDS, cryptoSource);
        const table = Array.from({ length: 4 }, () => deck.pop());
        const state = {
            mode: options.mode, difficulty: options.difficulty, target: options.target,
            roundNumber: options.roundNumber, dealer: options.dealer,
            currentSeat: (options.dealer + 1) % count,
            phase: "playing", moveNumber: 0, winner: null,
            deck, hands: Array.from({ length: count }, () => []), table,
            hiddenTableCount: 3, initialHiddenIds: table.slice(0, 3).map((card) => card.id),
            captures: Array.from({ length: count }, () => []),
            pisti: [{ normal: 0, jack: 0 }, { normal: 0, jack: 0 }],
            scores: options.scores.slice(), roundStartingScores: options.scores.slice(),
            lastCapturer: null, publicCardIds: [], seenCardIds: [[], []], recentCardIds: [],
            lastMove: null, roundSummary: null,
        };
        dealBatch(state);
        refreshKnowledge(state);
        return state;
    }

    function createGame(options = {}, cryptoSource = globalThis.crypto) {
        const mode = MODES.includes(options.mode) ? options.mode : "duel";
        const count = mode === "teams" ? 4 : 2;
        return startRound({
            mode, difficulty: DIFFICULTIES.includes(options.difficulty) ? options.difficulty : "medium",
            target: Number.isSafeInteger(options.target) && options.target > 0 ? options.target : 151,
            dealer: Number.isInteger(options.dealer) && options.dealer >= 0 && options.dealer < count ? options.dealer : count - 1,
            roundNumber: 1, scores: [0, 0],
        }, cryptoSource);
    }

    function cloneState(state) {
        return {
            ...state, deck: state.deck.slice(), hands: state.hands.map((hand) => hand.slice()),
            table: state.table.slice(), captures: state.captures.map((cards) => cards.slice()),
            pisti: state.pisti.map((count) => ({ ...count })), scores: state.scores.slice(),
            roundStartingScores: state.roundStartingScores.slice(),
        };
    }

    function captureKind(table, card, finalPlay) {
        if (!table.length) return { captures: false, pisti: null };
        const top = table[table.length - 1];
        const captures = card.rank === "J" || card.rank === top.rank;
        let pisti = null;
        if (captures && table.length === 1 && !finalPlay && card.rank === top.rank) pisti = card.rank === "J" ? "jack" : "normal";
        return { captures, pisti };
    }

    function scoreRound(state) {
        const teams = [0, 1].map((team) => {
            const cards = state.captures.flatMap((captured, seat) => teamOf(state, seat) === team ? captured : []);
            const cardScore = cards.reduce((sum, card) => sum + cardPoints(card), 0);
            const counts = state.pisti[team];
            const pistiPoints = counts.normal * 10 + counts.jack * 20;
            const majorityPoints = cards.length > 26 ? 3 : 0;
            return {
                capturedCount: cards.length, cardPoints: cardScore, pistiPoints, majorityPoints,
                normalPisti: counts.normal, jackPisti: counts.jack, total: cardScore + pistiPoints + majorityPoints,
            };
        });
        return { points: teams.map((team) => team.total), teams };
    }

    function finishRound(state) {
        const leftovers = state.table.slice();
        const recipient = state.lastCapturer ?? state.dealer;
        state.captures[recipient].push(...leftovers);
        state.table = [];
        state.hiddenTableCount = 0;
        state.lastMove.collectedLeftovers = leftovers;
        state.lastMove.leftoversCount = leftovers.length;
        state.lastMove.leftoversSeat = leftovers.length ? recipient : null;
        refreshKnowledge(state);
        const summary = scoreRound(state);
        state.scores = state.roundStartingScores.map((score, team) => score + summary.points[team]);
        state.winner = null;
        if (Math.max(...state.scores) >= state.target && state.scores[0] !== state.scores[1]) state.winner = state.scores[0] > state.scores[1] ? 0 : 1;
        state.phase = state.winner === null ? "round-over" : "match-over";
        state.currentSeat = null;
        state.roundSummary = { ...summary, lastCapturer: state.lastCapturer, leftoversCount: leftovers.length, winner: state.winner };
    }

    function playCard(state, seat, cardId) {
        if (!state || state.phase !== "playing" || seat !== state.currentSeat) return null;
        const index = state.hands[seat].findIndex((card) => card.id === cardId);
        if (index < 0) return null;
        const next = cloneState(state);
        const [card] = next.hands[seat].splice(index, 1);
        const finalPlay = next.moveNumber === 47;
        const result = captureKind(next.table, card, finalPlay);
        const capturedCards = result.captures ? [...next.table, card] : [];
        if (result.captures) {
            next.captures[seat].push(...capturedCards);
            next.table = [];
            next.hiddenTableCount = 0;
            next.lastCapturer = seat;
            if (result.pisti) next.pisti[teamOf(next, seat)][result.pisti] += 1;
        } else next.table.push(card);
        next.moveNumber += 1;
        next.lastMove = {
            seat, card, capturedCards, capturedCount: capturedCards.length, pisti: result.pisti,
            dealt: false, finalPlay, collectedLeftovers: [], leftoversCount: 0, leftoversSeat: null,
        };
        next.recentCardIds = [...(state.recentCardIds || []), card.id].slice(-RECENT_MEMORY_LIMIT);
        refreshKnowledge(next);
        if (next.moveNumber === 48) finishRound(next);
        else {
            if (next.hands.every((hand) => hand.length === 0)) {
                dealBatch(next);
                next.lastMove.dealt = true;
            }
            next.currentSeat = (seat + 1) % seatCount(next);
        }
        return next;
    }

    function nextRound(state, cryptoSource = globalThis.crypto) {
        if (!state || state.phase !== "round-over") return null;
        return startRound({
            mode: state.mode, difficulty: state.difficulty, target: state.target,
            roundNumber: state.roundNumber + 1, dealer: (state.dealer + 1) % seatCount(state), scores: state.scores,
        }, cryptoSource);
    }

    function getRoundSummary(state) { return state?.roundSummary ? JSON.parse(JSON.stringify(state.roundSummary)) : null; }

    function getPlayerView(state, seat) {
        if (!state || !Number.isInteger(seat) || seat < 0 || seat >= seatCount(state)) return null;
        const knownCardIds = state.seenCardIds[teamOf(state, seat)].slice();
        const known = new Set(knownCardIds);
        const visible = (cards) => cards.filter((card) => known.has(card.id));
        const lastMove = state.lastMove ? {
            ...state.lastMove, capturedCards: visible(state.lastMove.capturedCards),
            collectedLeftovers: visible(state.lastMove.collectedLeftovers),
        } : null;
        return {
            mode: state.mode, difficulty: state.difficulty, target: state.target, seat,
            roundNumber: state.roundNumber, dealer: state.dealer, currentSeat: state.currentSeat,
            phase: state.phase, moveNumber: state.moveNumber, winner: state.winner,
            scores: state.scores.slice(), hands: state.hands.map((hand, index) => index === seat ? hand.slice() : null),
            hand: state.hands[seat].slice(), handCounts: state.hands.map((hand) => hand.length), deckCount: state.deck.length,
            table: state.table.map((card) => known.has(card.id) ? card : null), hiddenTableCount: state.hiddenTableCount,
            captures: state.captures.map(visible), capturedCounts: state.captures.map((cards) => cards.length),
            pisti: state.pisti.map((count) => ({ ...count })), publicCardIds: state.publicCardIds.slice(), knownCardIds,
            recentCardIds: (state.recentCardIds || []).slice(),
            lastCapturer: state.lastCapturer, lastMove, roundSummary: getRoundSummary(state),
        };
    }

    function matchingProbability(view, rank) {
        const known = new Set([...view.knownCardIds, ...view.hand.map((card) => card.id)]);
        const unseen = 52 - known.size;
        const remaining = CARDS.filter((card) => card.rank === rank && !known.has(card.id)).length;
        const count = view.handCounts[(view.seat + 1) % view.handCounts.length];
        if (!unseen) return 0;
        let miss = 1;
        for (let index = 0; index < count && index < unseen; index += 1) miss *= Math.max(0, unseen - remaining - index) / (unseen - index);
        return 1 - miss;
    }

    function moveValue(view, card, hard) {
        const top = view.table[view.table.length - 1];
        const result = captureKind(top ? [top] : [], card, view.moveNumber === 47);
        const captures = view.table.length > 0 && result.captures;
        const pisti = view.table.length === 1 ? result.pisti : null;
        if (pisti) return (pisti === "jack" ? 20 : 10) * 100;
        const pilePoints = view.table.reduce((sum, entry) => sum + (entry ? cardPoints(entry) : 0.25), 0);
        const sameTeamLastCapture = view.mode === "teams" && view.lastCapturer !== null && view.lastCapturer % 2 === view.seat % 2;
        if (!hard) {
            if (captures) {
                const smallPile = view.table.length < 3 && pilePoints < 2;
                const jackCost = card.rank === "J" ? 8 + (smallPile ? 20 : 0) + (smallPile && sameTeamLastCapture ? 4 : 0) : 0;
                return 18 + pilePoints * 5 + view.table.length * 0.8 - jackCost;
            }
            const remembered = new Set([...view.recentCardIds, ...view.hand.map((entry) => entry.id)]);
            const knownRankCount = [...remembered].filter((id) => CARDS_BY_ID.get(id).rank === card.rank).length;
            const unrememberedCopies = Math.max(0, 4 - knownRankCount);
            const risk = unrememberedCopies * (view.table.length === 0 ? 0.8 : 0.12);
            return -risk - cardPoints(card) * 3 - (card.rank === "J" ? 12 : 0);
        }
        if (captures) {
            const jackCost = card.rank === "J" ? 15 + (sameTeamLastCapture && view.table.length < 3 ? 12 : 0) : 0;
            return 8 + pilePoints * 7 + view.table.length * 0.9 - jackCost;
        }
        const risk = matchingProbability(view, card.rank);
        const singletonRisk = view.table.length === 0 ? risk * (card.rank === "J" ? 70 : 38) : risk * (pilePoints * 4 + 2);
        const duplicates = view.hand.filter((entry) => entry.rank === card.rank).length - 1;
        return -singletonRisk - cardPoints(card) * 2 - (card.rank === "J" ? 18 : 0) + duplicates * 1.5;
    }

    function chooseMove(state, seat, difficulty) {
        const view = getPlayerView(state, seat);
        if (!view || view.phase !== "playing" || view.currentSeat !== seat || !view.hand.length) return null;
        const level = DIFFICULTIES.includes(difficulty) ? difficulty : view.difficulty;
        const easyValue = (card) => {
            const top = view.table[view.table.length - 1];
            if (top && top.rank === card.rank) return view.table.length === 1 && view.moveNumber !== 47 ? 1000 : 100;
            return -cardPoints(card) - (card.rank === "J" ? 8 : 0);
        };
        const value = (card) => level === "easy" ? easyValue(card) : moveValue(view, card, level === "hard");
        return view.hand.slice().sort((first, second) => (
            value(second) - value(first) || first.id.localeCompare(second.id)
        ))[0].id;
    }

    function serializeState(state) {
        if (!state) return null;
        const ids = (cards) => cards.map((card) => card.id);
        return {
            version: 1, mode: state.mode, difficulty: state.difficulty, target: state.target,
            roundNumber: state.roundNumber, dealer: state.dealer, currentSeat: state.currentSeat,
            phase: state.phase, moveNumber: state.moveNumber, winner: state.winner,
            deck: ids(state.deck), hands: state.hands.map(ids), table: ids(state.table), captures: state.captures.map(ids),
            hiddenTableCount: state.hiddenTableCount, initialHiddenIds: state.initialHiddenIds.slice(),
            pisti: state.pisti.map((count) => ({ ...count })), scores: state.scores.slice(), roundStartingScores: state.roundStartingScores.slice(),
            lastCapturer: state.lastCapturer, publicCardIds: state.publicCardIds.slice(), seenCardIds: state.seenCardIds.map((cards) => cards.slice()),
            recentCardIds: (state.recentCardIds || []).slice(),
            lastMove: state.lastMove ? { ...state.lastMove, card: state.lastMove.card.id, capturedCards: ids(state.lastMove.capturedCards), collectedLeftovers: ids(state.lastMove.collectedLeftovers) } : null,
            roundSummary: state.roundSummary ? JSON.parse(JSON.stringify(state.roundSummary)) : null,
        };
    }

    function sameIds(first, second) {
        return first.length === second.length && new Set(first).size === first.length && Array.from(first).every((id) => second.includes(id));
    }

    function restoreState(value) {
        if (!value || value.version !== 1 || !MODES.includes(value.mode) || !DIFFICULTIES.includes(value.difficulty)
            || !Number.isSafeInteger(value.target) || value.target < 1 || !Number.isSafeInteger(value.roundNumber) || value.roundNumber < 1
            || !["playing", "round-over", "match-over"].includes(value.phase) || !Number.isInteger(value.moveNumber) || value.moveNumber < 0 || value.moveNumber > 48) return null;
        const count = value.mode === "teams" ? 4 : 2;
        const validSeat = (seat) => Number.isInteger(seat) && seat >= 0 && seat < count;
        const readCards = (cards) => {
            if (!Array.isArray(cards) || cards.length > 52) return null;
            const result = Array.from(cards, (id) => CARDS_BY_ID.get(id));
            return result.every(Boolean) ? result : null;
        };
        const deck = readCards(value.deck);
        const table = readCards(value.table);
        const hands = Array.isArray(value.hands) && value.hands.length === count ? Array.from(value.hands, readCards) : null;
        const captures = Array.isArray(value.captures) && value.captures.length === count ? Array.from(value.captures, readCards) : null;
        if (!deck || !table || !hands || hands.includes(null) || !captures || captures.includes(null) || !validSeat(value.dealer)
            || (value.lastCapturer !== null && !validSeat(value.lastCapturer))) return null;
        const allCards = [...deck, ...hands.flat(), ...table, ...captures.flat()];
        if (allCards.length !== 52 || new Set(allCards.map((card) => card.id)).size !== 52) return null;
        const ended = value.moveNumber === 48;
        if (value.lastCapturer !== null && !captures[value.lastCapturer].length) return null;
        if (!ended && value.lastCapturer === null && captures.some((pile) => pile.length)) return null;
        const first = (value.dealer + 1) % count;
        if (ended ? value.phase === "playing" || value.currentSeat !== null || deck.length || hands.some((hand) => hand.length) || table.length
            : value.phase !== "playing" || value.currentSeat !== (first + value.moveNumber) % count) return null;
        const dealtBatches = Math.floor(value.moveNumber / (count * 4)) + 1;
        if (!ended && deck.length !== 48 - dealtBatches * count * 4) return null;
        const batchMoves = value.moveNumber % (count * 4);
        if (!ended && hands.some((hand, seat) => {
            const relative = (seat - first + count) % count;
            return hand.length !== 4 - Math.floor((batchMoves + count - 1 - relative) / count);
        })) return null;
        if (!Array.isArray(value.initialHiddenIds) || value.initialHiddenIds.length !== 3 || !readCards(value.initialHiddenIds)
            || new Set(value.initialHiddenIds).size !== 3) return null;
        const hiddenLocations = value.initialHiddenIds.map((id) => table.findIndex((card) => card.id === id));
        const concealed = hiddenLocations.every((index, offset) => index === offset);
        const hiddenCaptureSeats = captures.map((cards) => value.initialHiddenIds.filter((id) => cards.some((card) => card.id === id)).length);
        if (concealed ? value.hiddenTableCount !== 3 : value.hiddenTableCount !== 0 || !hiddenCaptureSeats.includes(3)) return null;
        if (!Array.isArray(value.pisti) || value.pisti.length !== 2 || Array.from(value.pisti).some((entry) => !entry || !nonnegative(entry.normal) || !nonnegative(entry.jack))
            || value.pisti.reduce((sum, entry) => sum + entry.normal + entry.jack, 0) > Math.floor(value.moveNumber / 2)) return null;
        if (value.pisti.some((entry, team) => {
            const capturedCount = captures.reduce((sum, pile, seat) => sum + ((value.mode === "teams" ? seat % 2 : seat) === team ? pile.length : 0), 0);
            return (entry.normal + entry.jack) * 2 > capturedCount;
        })) return null;
        if (![value.scores, value.roundStartingScores].every((scores) => Array.isArray(scores) && scores.length === 2 && Array.from(scores).every(nonnegative))) return null;
        const state = { ...value, deck, hands, table, captures, initialHiddenIds: value.initialHiddenIds.slice(), pisti: value.pisti.map((entry) => ({ normal: entry.normal, jack: entry.jack })), scores: value.scores.slice(), roundStartingScores: value.roundStartingScores.slice() };
        delete state.version;
        refreshKnowledge(state);
        const recent = value.recentCardIds === undefined ? [] : value.recentCardIds;
        if (!Array.isArray(recent) || recent.length > RECENT_MEMORY_LIMIT || recent.length > value.moveNumber
            || new Set(recent).size !== recent.length
            || !Array.from(recent).every((id) => state.publicCardIds.includes(id))) return null;
        state.recentCardIds = recent.slice();
        if (!Array.isArray(value.publicCardIds) || !sameIds(value.publicCardIds, state.publicCardIds)
            || !Array.isArray(value.seenCardIds) || value.seenCardIds.length !== 2
            || Array.from(value.seenCardIds).some((cards, team) => !Array.isArray(cards) || !sameIds(cards, state.seenCardIds[team]))) return null;
        if (value.moveNumber === 0) {
            if (value.lastMove !== null || value.lastCapturer !== null || captures.some((cards) => cards.length)) return null;
            state.lastMove = null;
        } else {
            const move = value.lastMove;
            const card = CARDS_BY_ID.get(move?.card);
            const capturedCards = readCards(move?.capturedCards);
            const leftovers = readCards(move?.collectedLeftovers);
            if (!move || !card || !capturedCards || !leftovers || move.seat !== (first + value.moveNumber - 1) % count
                || move.capturedCount !== capturedCards.length || move.leftoversCount !== leftovers.length
                || ![null, "normal", "jack"].includes(move.pisti) || move.finalPlay !== ended
                || move.dealt !== (!ended && batchMoves === 0) || (move.leftoversSeat !== null && !validSeat(move.leftoversSeat))
                || (!ended && (leftovers.length || move.leftoversSeat !== null))) return null;
            if (recent.length && recent[recent.length - 1] !== card.id) return null;
            if (capturedCards.length) {
                const before = capturedCards.slice(0, -1);
                const expected = captureKind(before, card, ended);
                if (new Set(capturedCards.map((entry) => entry.id)).size !== capturedCards.length
                    || capturedCards[capturedCards.length - 1].id !== card.id || !expected.captures || expected.pisti !== move.pisti
                    || value.lastCapturer !== move.seat
                    || !capturedCards.every((entry) => captures[move.seat].some((owned) => owned.id === entry.id))) return null;
            } else if (move.pisti || (!ended && table[table.length - 1]?.id !== card.id)) return null;
            if (move.pisti && (ended || capturedCards.length !== 2 || capturedCards[0].rank !== card.rank || (move.pisti === "jack") !== (card.rank === "J"))) return null;
            if (move.pisti && !state.pisti[teamOf(state, move.seat)][move.pisti]) return null;
            if (leftovers.length && (new Set(leftovers.map((entry) => entry.id)).size !== leftovers.length
                || move.leftoversSeat !== (value.lastCapturer ?? value.dealer)
                || !leftovers.every((entry) => captures[move.leftoversSeat].some((owned) => owned.id === entry.id)))) return null;
            if ((!leftovers.length && move.leftoversSeat !== null) || (ended && !capturedCards.length && !leftovers.some((entry) => entry.id === card.id))) return null;
            state.lastMove = {
                seat: move.seat, card, capturedCards, capturedCount: capturedCards.length, pisti: move.pisti,
                dealt: move.dealt, finalPlay: move.finalPlay, collectedLeftovers: leftovers,
                leftoversCount: leftovers.length, leftoversSeat: move.leftoversSeat,
            };
        }
        if (ended) {
            const summary = scoreRound(state);
            const expectedScores = state.roundStartingScores.map((score, team) => score + summary.points[team]);
            const winner = Math.max(...expectedScores) >= state.target && expectedScores[0] !== expectedScores[1] ? (expectedScores[0] > expectedScores[1] ? 0 : 1) : null;
            const expectedSummary = { ...summary, lastCapturer: state.lastCapturer, leftoversCount: state.lastMove.leftoversCount, winner };
            if (JSON.stringify(value.roundSummary) !== JSON.stringify(expectedSummary) || !sameValues(state.scores, expectedScores)
                || value.winner !== winner || value.phase !== (winner === null ? "round-over" : "match-over")) return null;
            state.roundSummary = expectedSummary;
        } else if (value.roundSummary !== null || value.winner !== null || !sameValues(state.scores, state.roundStartingScores)) return null;
        return state;
    }

    function sameValues(first, second) { return first.every((value, index) => value === second[index]); }

    return Object.freeze({
        SUITS, RANKS, MODES, DIFFICULTIES, RECENT_MEMORY_LIMIT, createDeck, shuffleDeck, secureRandomInt, cardPoints,
        createGame, playCard, nextRound, getRoundSummary, getPlayerView, chooseMove, serializeState, restoreState,
    });
});
