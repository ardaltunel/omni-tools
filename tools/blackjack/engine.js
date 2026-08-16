(function initBlackjackEngine(root, factory) {
    "use strict";

    const engine = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = engine;
    } else {
        root.OmniBlackjackEngine = engine;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createBlackjackEngine() {
    "use strict";

    /*
     * Monetary values deliberately use half-credit units. This retains integer
     * arithmetic while allowing a 3:2 Blackjack payout on every chip value.
     * The UI converts the values back to credits before displaying them.
     */
    const MONEY_SCALE = 2;
    const STARTING_BALANCE = 10000 * MONEY_SCALE;
    const DEFAULT_DECK_COUNT = 6;
    const DEFAULT_RESHUFFLE_AT = 0.25;
    const SUITS = Object.freeze([
        Object.freeze({ id: "spades", symbol: "♠", name: "Maça", color: "black" }),
        Object.freeze({ id: "hearts", symbol: "♥", name: "Kupa", color: "red" }),
        Object.freeze({ id: "diamonds", symbol: "♦", name: "Karo", color: "red" }),
        Object.freeze({ id: "clubs", symbol: "♣", name: "Sinek", color: "black" }),
    ]);
    const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
    const PHASES = Object.freeze({
        BETTING: "BETTING",
        DEALING: "DEALING",
        INSURANCE: "INSURANCE",
        PLAYER_TURN: "PLAYER_TURN",
        DEALER_TURN: "DEALER_TURN",
        RESOLVING: "RESOLVING",
        ROUND_OVER: "ROUND_OVER",
    });

    function cardValue(card) {
        if (!card) return 0;
        if (card.rank === "A") return 1;
        if (["J", "Q", "K"].includes(card.rank)) return 10;
        return Number(card.rank) || 0;
    }

    function createDeck(deckId = 0) {
        return SUITS.flatMap((suit) => RANKS.map((rank) => ({
            id: `${deckId}-${suit.id}-${rank}`,
            rank,
            suit: suit.id,
            suitSymbol: suit.symbol,
            suitName: suit.name,
            color: suit.color,
        })));
    }

    function shuffle(values, random = Math.random) {
        const shuffled = values.slice();
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        return shuffled;
    }

    function createShoe(deckCount = DEFAULT_DECK_COUNT, random = Math.random) {
        const normalizedDeckCount = Math.max(1, Math.floor(Number(deckCount) || DEFAULT_DECK_COUNT));
        const cards = Array.from({ length: normalizedDeckCount }, (_, deckId) => createDeck(deckId)).flat();
        return shuffle(cards, random);
    }

    function drawCard(shoe) {
        if (!Array.isArray(shoe) || !shoe.length) throw new Error("Shoe'da kart kalmadı.");
        return shoe.pop();
    }

    function calculateHand(cards = []) {
        let total = 0;
        let aces = 0;
        cards.forEach((card) => {
            total += cardValue(card);
            if (card.rank === "A") aces += 1;
        });

        let softAces = 0;
        while (softAces < aces && total + 10 <= 21) {
            total += 10;
            softAces += 1;
        }

        return {
            total,
            hardTotal: total - (softAces * 10),
            isSoft: softAces > 0,
            softAces,
            aceCount: aces,
        };
    }

    function isBlackjack(cards = []) {
        return cards.length === 2 && calculateHand(cards).total === 21;
    }

    function isBust(cards = []) {
        return calculateHand(cards).total > 21;
    }

    function handIsPlayable(hand) {
        return Boolean(hand && hand.status === "playing");
    }

    function canSplit(hand) {
        return Boolean(
            handIsPlayable(hand)
            && hand.cards.length === 2
            && cardValue(hand.cards[0]) === cardValue(hand.cards[1])
            && !hand.doubled
            && !hand.isSplit
        );
    }

    function canDouble(hand) {
        return Boolean(handIsPlayable(hand) && hand.cards.length === 2 && !hand.doubled);
    }

    function createStats(stats = {}, balance = STARTING_BALANCE) {
        return {
            hands: Math.max(0, Number(stats.hands) || 0),
            wins: Math.max(0, Number(stats.wins) || 0),
            losses: Math.max(0, Number(stats.losses) || 0),
            pushes: Math.max(0, Number(stats.pushes) || 0),
            blackjacks: Math.max(0, Number(stats.blackjacks) || 0),
            highestBalance: Math.max(balance, Number(stats.highestBalance) || 0),
        };
    }

    function createState(options = {}) {
        const balance = Number.isInteger(options.balance) && options.balance >= 0
            ? options.balance
            : STARTING_BALANCE;
        const deckCount = Math.max(1, Math.floor(Number(options.deckCount) || DEFAULT_DECK_COUNT));
        const random = typeof options.random === "function" ? options.random : Math.random;
        return {
            deckCount,
            reshuffleAt: Math.min(0.9, Math.max(0.05, Number(options.reshuffleAt) || DEFAULT_RESHUFFLE_AT)),
            dealerHitsSoft17: Boolean(options.dealerHitsSoft17),
            shoe: Array.isArray(options.shoe) && options.shoe.length ? options.shoe.slice() : createShoe(deckCount, random),
            balance,
            currentBet: 0,
            lastBet: Math.max(0, Number(options.lastBet) || 0),
            dealerHand: [],
            dealerRevealed: false,
            playerHands: [],
            activeHandIndex: 0,
            insuranceBet: 0,
            phase: PHASES.BETTING,
            message: "Bahsini yerleştir ve dağıt.",
            round: null,
            stats: createStats(options.stats, balance),
        };
    }

    function serializeState(state) {
        if (!state || typeof state !== "object") return null;
        const cloneCards = (cards) => Array.isArray(cards) ? cards.map((card) => ({ ...card })) : [];
        return {
            version: 1,
            deckCount: state.deckCount,
            reshuffleAt: state.reshuffleAt,
            dealerHitsSoft17: state.dealerHitsSoft17,
            shoe: cloneCards(state.shoe),
            balance: state.balance,
            currentBet: state.currentBet,
            lastBet: state.lastBet,
            dealerHand: cloneCards(state.dealerHand),
            dealerRevealed: state.dealerRevealed,
            playerHands: Array.isArray(state.playerHands) ? state.playerHands.map((hand) => ({
                ...hand,
                cards: cloneCards(hand.cards),
            })) : [],
            activeHandIndex: state.activeHandIndex,
            insuranceBet: state.insuranceBet,
            phase: state.phase,
            message: state.message,
            round: state.round && typeof state.round === "object" ? { ...state.round } : null,
            stats: state.stats && typeof state.stats === "object" ? { ...state.stats } : {},
        };
    }

    function restoreState(snapshot) {
        if (!snapshot || typeof snapshot !== "object" || snapshot.version !== 1) return null;

        const restoreCard = (value) => {
            if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) return null;
            const suit = SUITS.find((candidate) => candidate.id === value.suit);
            if (!suit || !RANKS.includes(value.rank)) return null;
            return {
                id: value.id,
                rank: value.rank,
                suit: suit.id,
                suitSymbol: suit.symbol,
                suitName: suit.name,
                color: suit.color,
            };
        };
        const restoreCards = (values) => {
            if (!Array.isArray(values)) return null;
            const cards = values.map(restoreCard);
            return cards.every(Boolean) ? cards : null;
        };
        const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
        const validStatuses = new Set(["playing", "standing", "bust"]);
        const validOutcomes = new Set([null, "blackjack", "win", "lose", "push", "bust", "dealer-bust"]);
        const restoreHand = (value) => {
            if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) return null;
            const cards = restoreCards(value.cards);
            const outcome = value.outcome ?? null;
            if (!cards || !cards.length || !nonNegativeInteger(value.bet) || !value.bet
                || !validStatuses.has(value.status) || !validOutcomes.has(outcome)
                || !nonNegativeInteger(value.payout || 0)) return null;
            return {
                id: value.id,
                cards,
                bet: value.bet,
                status: value.status,
                isSplit: Boolean(value.isSplit),
                doubled: Boolean(value.doubled),
                naturalBlackjack: Boolean(value.naturalBlackjack),
                outcome,
                payout: value.payout || 0,
            };
        };

        const shoe = restoreCards(snapshot.shoe);
        const dealerHand = restoreCards(snapshot.dealerHand);
        const playerHands = Array.isArray(snapshot.playerHands) ? snapshot.playerHands.map(restoreHand) : null;
        const phase = Object.values(PHASES).includes(snapshot.phase) ? snapshot.phase : null;
        const deckCount = Math.max(1, Math.floor(Number(snapshot.deckCount) || DEFAULT_DECK_COUNT));
        const balance = snapshot.balance;
        const currentBet = snapshot.currentBet;
        const lastBet = snapshot.lastBet;
        const insuranceBet = snapshot.insuranceBet;
        const activeHandIndex = snapshot.activeHandIndex;
        if (!shoe || !dealerHand || !playerHands || playerHands.some((hand) => !hand) || !phase
            || !nonNegativeInteger(balance) || !nonNegativeInteger(currentBet)
            || !nonNegativeInteger(lastBet) || !nonNegativeInteger(insuranceBet)
            || !nonNegativeInteger(activeHandIndex)) return null;

        const isBetting = phase === PHASES.BETTING;
        const round = snapshot.round && typeof snapshot.round === "object"
            ? { ...snapshot.round }
            : null;
        if (isBetting) {
            if (dealerHand.length || playerHands.length || round || currentBet > balance || activeHandIndex !== 0) return null;
        } else if (dealerHand.length < 2 || !playerHands.length || !currentBet || !round
            || activeHandIndex >= playerHands.length) {
            return null;
        }

        return {
            deckCount,
            reshuffleAt: Math.min(0.9, Math.max(0.05, Number(snapshot.reshuffleAt) || DEFAULT_RESHUFFLE_AT)),
            dealerHitsSoft17: Boolean(snapshot.dealerHitsSoft17),
            shoe,
            balance,
            currentBet,
            lastBet,
            dealerHand,
            dealerRevealed: Boolean(snapshot.dealerRevealed),
            playerHands,
            activeHandIndex,
            insuranceBet,
            phase,
            message: typeof snapshot.message === "string" ? snapshot.message : "Oyun devam ediyor.",
            round,
            stats: createStats(snapshot.stats, balance),
        };
    }

    function clearBet(state) {
        if (!state || state.phase !== PHASES.BETTING) return false;
        state.currentBet = 0;
        return true;
    }

    function setBet(state, amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));
        if (!state || state.phase !== PHASES.BETTING || value > state.balance) return false;
        state.currentBet = value;
        return true;
    }

    function addBet(state, amount) {
        return setBet(state, (state?.currentBet || 0) + Math.max(0, Math.floor(Number(amount) || 0)));
    }

    function repeatBet(state) {
        if (!state || state.phase !== PHASES.BETTING || !state.lastBet || state.lastBet > state.balance) return false;
        state.currentBet = state.lastBet;
        return true;
    }

    function refreshBalance(state) {
        if (!state || state.phase !== PHASES.BETTING) return false;
        state.balance = STARTING_BALANCE;
        state.currentBet = 0;
        state.stats.highestBalance = Math.max(state.stats.highestBalance, state.balance);
        state.message = "Sanal oyun kredin yenilendi.";
        return true;
    }

    function shouldReshuffle(state) {
        return state.shoe.length <= state.deckCount * 52 * state.reshuffleAt;
    }

    function beginRound(state, random = Math.random) {
        if (!state || state.phase !== PHASES.BETTING || !state.currentBet || state.currentBet > state.balance) return null;

        const reshuffled = shouldReshuffle(state);
        if (reshuffled) state.shoe = createShoe(state.deckCount, random);

        state.balance -= state.currentBet;
        state.lastBet = state.currentBet;
        const playerFirst = drawCard(state.shoe);
        const dealerFirst = drawCard(state.shoe);
        const playerSecond = drawCard(state.shoe);
        const dealerSecond = drawCard(state.shoe);
        state.dealerHand = [dealerFirst, dealerSecond];
        state.dealerRevealed = false;
        state.playerHands = [{
            id: "hand-1",
            cards: [playerFirst, playerSecond],
            bet: state.currentBet,
            status: "playing",
            isSplit: false,
            doubled: false,
            naturalBlackjack: false,
            outcome: null,
            payout: 0,
        }];
        state.activeHandIndex = 0;
        state.insuranceBet = 0;
        state.round = { reshuffled, insuranceResolved: false };
        state.phase = PHASES.DEALING;
        state.message = "Kartlar dağıtılıyor.";

        return {
            reshuffled,
            sequence: [
                { owner: "player", handIndex: 0, card: playerFirst },
                { owner: "dealer", card: dealerFirst },
                { owner: "player", handIndex: 0, card: playerSecond },
                { owner: "dealer", card: dealerSecond, hidden: true },
            ],
        };
    }

    function currentHand(state) {
        return state?.playerHands?.[state.activeHandIndex] || null;
    }

    function dealerUpcard(state) {
        return state?.dealerHand?.[0] || null;
    }

    function hasDealerBlackjack(state) {
        return isBlackjack(state?.dealerHand || []);
    }

    function hasPlayerBlackjack(state) {
        const hand = state?.playerHands?.[0];
        return Boolean(hand && !hand.isSplit && isBlackjack(hand.cards));
    }

    function setAllNaturals(state) {
        state.playerHands.forEach((hand) => {
            hand.naturalBlackjack = !hand.isSplit && isBlackjack(hand.cards);
        });
    }

    function afterInitialDeal(state) {
        if (!state || state.phase !== PHASES.DEALING) return { type: "invalid" };
        setAllNaturals(state);
        if (dealerUpcard(state)?.rank === "A") {
            state.phase = PHASES.INSURANCE;
            state.message = "Krupiye As gösteriyor. Sigorta alabilirsin.";
            return { type: "insurance" };
        }

        if (hasDealerBlackjack(state) || hasPlayerBlackjack(state)) {
            state.dealerRevealed = true;
            state.phase = PHASES.RESOLVING;
            return { type: hasDealerBlackjack(state) ? "dealer-blackjack" : "player-blackjack", revealDealer: true };
        }

        state.phase = PHASES.PLAYER_TURN;
        state.message = "Sıra sende.";
        return { type: "player-turn" };
    }

    function takeInsurance(state) {
        if (!state || state.phase !== PHASES.INSURANCE) return false;
        const amount = Math.floor(state.currentBet / 2);
        if (!amount || state.balance < amount) return false;
        state.balance -= amount;
        state.insuranceBet = amount;
        return settleInsuranceDecision(state, true);
    }

    function declineInsurance(state) {
        if (!state || state.phase !== PHASES.INSURANCE) return false;
        return settleInsuranceDecision(state, false);
    }

    function settleInsuranceDecision(state, insured) {
        const dealerBlackjack = hasDealerBlackjack(state);
        state.round.insuranceResolved = true;
        state.round.insured = Boolean(insured);
        state.round.insuranceWon = Boolean(insured && dealerBlackjack);

        if (dealerBlackjack) {
            if (state.round.insuranceWon) state.balance += state.insuranceBet * 3;
            state.dealerRevealed = true;
            state.phase = PHASES.RESOLVING;
            return { type: "dealer-blackjack", revealDealer: true, insuranceWon: state.round.insuranceWon };
        }

        if (hasPlayerBlackjack(state)) {
            state.dealerRevealed = true;
            state.phase = PHASES.RESOLVING;
            return { type: "player-blackjack", revealDealer: true, insuranceWon: false };
        }

        state.phase = PHASES.PLAYER_TURN;
        state.message = "Sigorta turu bitti. Sıra sende.";
        return { type: "player-turn", insuranceWon: false };
    }

    function advanceActiveHand(state) {
        const next = state.playerHands.findIndex((hand, index) => index > state.activeHandIndex && hand.status === "playing");
        if (next >= 0) {
            state.activeHandIndex = next;
            state.phase = PHASES.PLAYER_TURN;
            state.message = `${next + 1}. elin sırası.`;
            return { type: "next-hand", handIndex: next };
        }
        state.activeHandIndex = Math.max(0, state.playerHands.length - 1);
        state.phase = PHASES.DEALER_TURN;
        state.message = "Krupiye oynuyor.";
        return { type: "dealer-turn" };
    }

    function hit(state) {
        const hand = currentHand(state);
        if (!state || state.phase !== PHASES.PLAYER_TURN || !handIsPlayable(hand)) return null;
        const card = drawCard(state.shoe);
        hand.cards.push(card);
        if (isBust(hand.cards)) {
            hand.status = "bust";
            hand.outcome = "bust";
            state.message = "BUST — 21'i geçtin.";
            return { card, ...advanceActiveHand(state), bust: true };
        }
        if (calculateHand(hand.cards).total === 21) {
            hand.status = "standing";
            state.message = "21! Elin otomatik durdu.";
            return { card, ...advanceActiveHand(state), reachedTwentyOne: true };
        }
        state.message = "Kart çekebilir veya durabilirsin.";
        return { card, type: "player-turn" };
    }

    function stand(state) {
        const hand = currentHand(state);
        if (!state || state.phase !== PHASES.PLAYER_TURN || !handIsPlayable(hand)) return null;
        hand.status = "standing";
        return advanceActiveHand(state);
    }

    function doubleDown(state) {
        const hand = currentHand(state);
        if (!state || state.phase !== PHASES.PLAYER_TURN || !canDouble(hand) || state.balance < hand.bet) return null;
        state.balance -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        const card = drawCard(state.shoe);
        hand.cards.push(card);
        if (isBust(hand.cards)) {
            hand.status = "bust";
            hand.outcome = "bust";
            state.message = "İkiye katla sonrası BUST.";
            return { card, ...advanceActiveHand(state), bust: true };
        }
        hand.status = "standing";
        state.message = "İkiye katla tamamlandı; el otomatik durdu.";
        return { card, ...advanceActiveHand(state), bust: false };
    }

    function split(state) {
        const hand = currentHand(state);
        if (!state || state.phase !== PHASES.PLAYER_TURN || !canSplit(hand) || state.balance < hand.bet) return null;
        const originalBet = hand.bet;
        const [firstCard, secondCard] = hand.cards;
        state.balance -= originalBet;

        const firstHand = {
            ...hand,
            id: `${hand.id}-a`,
            cards: [firstCard, drawCard(state.shoe)],
            isSplit: true,
            naturalBlackjack: false,
            doubled: false,
            status: "playing",
            outcome: null,
            payout: 0,
        };
        const secondHand = {
            ...hand,
            id: `${hand.id}-b`,
            cards: [secondCard, drawCard(state.shoe)],
            isSplit: true,
            naturalBlackjack: false,
            doubled: false,
            status: "playing",
            outcome: null,
            payout: 0,
        };
        const splitAces = firstCard.rank === "A" && secondCard.rank === "A";
        if (splitAces) {
            firstHand.status = "standing";
            secondHand.status = "standing";
        } else {
            [firstHand, secondHand].forEach((splitHand) => {
                if (calculateHand(splitHand.cards).total === 21) splitHand.status = "standing";
            });
        }

        state.playerHands.splice(state.activeHandIndex, 1, firstHand, secondHand);
        state.activeHandIndex = state.playerHands.findIndex((candidate) => candidate.status === "playing");
        if (state.activeHandIndex === -1) {
            state.activeHandIndex = 1;
            state.phase = PHASES.DEALER_TURN;
            state.message = splitAces ? "Aslar bölündü; her el otomatik tamamlandı." : "Eller tamamlandı; krupiye oynuyor.";
        } else {
            state.phase = PHASES.PLAYER_TURN;
            state.message = "Eller bölündü. İlk elin sırası.";
        }
        return {
            type: state.phase === PHASES.DEALER_TURN ? "dealer-turn" : "player-turn",
            cards: [firstHand.cards[1], secondHand.cards[1]],
            splitAces,
        };
    }

    function dealerShouldHit(cards, dealerHitsSoft17 = false) {
        const hand = calculateHand(cards);
        return hand.total < 17 || (dealerHitsSoft17 && hand.total === 17 && hand.isSoft);
    }

    function dealerPlay(state) {
        if (!state || state.phase !== PHASES.DEALER_TURN) return [];
        state.dealerRevealed = true;
        const cards = [];
        const hasLiveHand = state.playerHands.some((hand) => hand.status === "standing");
        if (hasLiveHand) {
            while (dealerShouldHit(state.dealerHand, state.dealerHitsSoft17)) {
                const card = drawCard(state.shoe);
                state.dealerHand.push(card);
                cards.push(card);
            }
        }
        state.phase = PHASES.RESOLVING;
        return cards;
    }

    function calculatePayout(outcome, bet) {
        const safeBet = Math.max(0, Math.floor(Number(bet) || 0));
        if (outcome === "blackjack") return safeBet * 5 / 2;
        if (["win", "dealer-bust"].includes(outcome)) return safeBet * 2;
        if (outcome === "push") return safeBet;
        return 0;
    }

    function resolveHand(hand, dealerHand) {
        const player = calculateHand(hand?.cards || []);
        const dealer = calculateHand(dealerHand || []);
        let outcome = "lose";
        if (player.total > 21) outcome = "bust";
        else if (hand?.naturalBlackjack && dealer.total === 21 && isBlackjack(dealerHand)) outcome = "push";
        else if (hand?.naturalBlackjack) outcome = "blackjack";
        else if (dealer.total > 21) outcome = "dealer-bust";
        else if (dealer.total > player.total) outcome = "lose";
        else if (dealer.total === player.total) outcome = "push";
        else outcome = "win";
        return { outcome, payout: calculatePayout(outcome, hand?.bet || 0), player, dealer };
    }

    function updateStatsForOutcome(stats, outcome) {
        stats.hands += 1;
        if (["win", "dealer-bust", "blackjack"].includes(outcome)) stats.wins += 1;
        else if (outcome === "push") stats.pushes += 1;
        else stats.losses += 1;
        if (outcome === "blackjack") stats.blackjacks += 1;
    }

    function resolveRound(state) {
        if (!state || state.phase !== PHASES.RESOLVING) return null;
        const results = state.playerHands.map((hand) => {
            const result = resolveHand(hand, state.dealerHand);
            hand.outcome = result.outcome;
            hand.payout = result.payout;
            state.balance += result.payout;
            updateStatsForOutcome(state.stats, result.outcome);
            return { handId: hand.id, ...result };
        });
        state.stats.highestBalance = Math.max(state.stats.highestBalance, state.balance);
        state.phase = PHASES.ROUND_OVER;
        state.message = summarizeRound(results, state.round?.insuranceWon);
        return { results, insuranceWon: Boolean(state.round?.insuranceWon), dealer: calculateHand(state.dealerHand) };
    }

    function summarizeRound(results = [], insuranceWon = false) {
        const outcomes = results.map((result) => result.outcome);
        if (outcomes.includes("blackjack")) return "BLACKJACK! 3:2 ödeme hesabına eklendi.";
        if (outcomes.every((outcome) => outcome === "push")) return "PUSH — bahislerin iade edildi.";
        if (outcomes.includes("dealer-bust")) return "KRUPİYE BUST — kazandın!";
        if (outcomes.every((outcome) => ["bust", "lose"].includes(outcome))) {
            return insuranceWon ? "Krupiye Blackjack. Sigorta bahsi kazandı." : "Kaybettin. Yeni bir el açabilirsin.";
        }
        if (outcomes.includes("win")) return "Kazandın!";
        if (outcomes.includes("push")) return "Bir el berabere, diğerleri sonuçlandı.";
        return "El tamamlandı.";
    }

    function prepareNextRound(state) {
        if (!state || state.phase !== PHASES.ROUND_OVER) return false;
        state.currentBet = 0;
        state.dealerHand = [];
        state.dealerRevealed = false;
        state.playerHands = [];
        state.activeHandIndex = 0;
        state.insuranceBet = 0;
        state.round = null;
        state.phase = PHASES.BETTING;
        state.message = "Yeni el için bahis koy.";
        return true;
    }

    return Object.freeze({
        MONEY_SCALE,
        STARTING_BALANCE,
        DEFAULT_DECK_COUNT,
        DEFAULT_RESHUFFLE_AT,
        SUITS,
        RANKS,
        PHASES,
        addBet,
        afterInitialDeal,
        beginRound,
        calculateHand,
        calculatePayout,
        canDouble,
        canSplit,
        cardValue,
        clearBet,
        createDeck,
        createShoe,
        createState,
        doubleDown,
        dealerPlay,
        dealerShouldHit,
        declineInsurance,
        drawCard,
        hasDealerBlackjack,
        hit,
        isBlackjack,
        isBust,
        prepareNextRound,
        refreshBalance,
        repeatBet,
        restoreState,
        resolveHand,
        resolveRound,
        serializeState,
        setBet,
        shuffle,
        split,
        stand,
        takeInsurance,
    });
});
