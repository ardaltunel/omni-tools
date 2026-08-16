(function initBlackjackApp() {
    "use strict";

    const engine = window.OmniBlackjackEngine;
    const app = document.getElementById("blackjack-app");
    if (!engine || !app) return;

    const STORAGE_KEY = "omni-blackjack-v1";
    const MINIMUM_BET = 10 * engine.MONEY_SCALE;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = {
        balance: document.getElementById("blackjack-balance"),
        balanceDelta: document.getElementById("blackjack-balance-delta"),
        currentBet: document.getElementById("blackjack-current-bet"),
        dealerCards: document.getElementById("blackjack-dealer-cards"),
        dealerTotal: document.getElementById("blackjack-dealer-total"),
        playerHands: document.getElementById("blackjack-player-hands"),
        playerTotal: document.getElementById("blackjack-player-total"),
        actionKicker: document.getElementById("blackjack-action-kicker"),
        status: document.getElementById("blackjack-status"),
        insurance: document.getElementById("blackjack-insurance"),
        insuranceTake: document.getElementById("blackjack-insurance-take"),
        insuranceDecline: document.getElementById("blackjack-insurance-decline"),
        shoe: document.getElementById("blackjack-shoe"),
        chips: Array.from(document.querySelectorAll("[data-blackjack-chip]")),
        bettingPanel: document.querySelector(".blackjack-betting-panel"),
        clearBet: document.getElementById("blackjack-clear-bet"),
        repeatBet: document.getElementById("blackjack-repeat-bet"),
        deal: document.getElementById("blackjack-deal"),
        refreshCredit: document.getElementById("blackjack-refresh-credit"),
        hit: document.getElementById("blackjack-hit"),
        stand: document.getElementById("blackjack-stand"),
        double: document.getElementById("blackjack-double"),
        split: document.getElementById("blackjack-split"),
        sound: document.getElementById("blackjack-sound"),
        betNote: document.getElementById("blackjack-bet-note"),
    };

    const saved = loadSavedState();
    const game = engine.restoreState(saved.game) || engine.createState({
        balance: saved.balance,
        lastBet: saved.lastBet,
        stats: saved.stats,
    });
    let soundEnabled = saved.soundEnabled;
    let busy = false;
    let view = createViewState();
    let autoNextRoundTimer = 0;
    let shoeDealTimer = 0;
    let balanceDeltaTimer = 0;
    let roundStartingBalance = getRoundStartingBalance();

    function getRoundStartingBalance() {
        if ([engine.PHASES.BETTING, engine.PHASES.ROUND_OVER].includes(game.phase)) return game.balance;
        const handBets = game.playerHands.reduce((total, hand) => total + hand.bet, 0);
        const insurancePayout = game.round?.insuranceWon ? game.insuranceBet * 3 : 0;
        return game.balance + handBets + game.insuranceBet - insurancePayout;
    }

    function createViewState() {
        return {
            dealerVisible: 0,
            playerVisible: [],
            initialDeals: new Map(),
            lastDealtCardId: "",
        };
    }

    function loadSavedState() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return {
                balance: Number.isInteger(value.balance) && value.balance >= 0 ? value.balance : engine.STARTING_BALANCE,
                lastBet: Number.isInteger(value.lastBet) && value.lastBet >= 0 ? value.lastBet : 0,
                stats: value.stats && typeof value.stats === "object" ? value.stats : {},
                soundEnabled: typeof value.soundEnabled === "boolean" ? value.soundEnabled : true,
                game: value.game && typeof value.game === "object" ? value.game : null,
            };
        } catch {
            return { balance: engine.STARTING_BALANCE, lastBet: 0, stats: {}, soundEnabled: true, game: null };
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 2,
                balance: game.balance,
                lastBet: game.lastBet,
                stats: game.stats,
                soundEnabled,
                game: engine.serializeState(game),
            }));
        } catch {
            // Private mode may block storage. The game remains fully playable.
        }
    }

    function formatCredits(units) {
        const value = Math.max(0, Number(units) || 0) / engine.MONEY_SCALE;
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
            maximumFractionDigits: 1,
        }).format(value);
    }

    function delay(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion.matches ? 0 : milliseconds));
    }

    function rankName(rank) {
        return ({ A: "As", J: "Vale", Q: "Kız", K: "Papaz" })[rank] || rank;
    }

    function cardLabel(card) {
        return `${card.suitName} ${rankName(card.rank)}`;
    }

    function handText(cards) {
        const value = engine.calculateHand(cards);
        if (value.total > 21) return "BUST";
        return `${value.isSoft ? "Soft " : ""}${value.total}`;
    }

    function createCard(card, options = {}) {
        const hidden = Boolean(options.hidden);
        const element = document.createElement("article");
        element.className = `blackjack-card blackjack-${card.color} ${hidden ? "is-hidden" : "is-face-up"}`;
        if (options.isDealing) element.dataset.dealingFromShoe = "true";
        if (options.delay) element.style.setProperty("--blackjack-deal-delay", `${options.delay}ms`);
        element.dataset.cardId = card.id;
        element.setAttribute("aria-label", hidden ? "Kapalı krupiye kartı" : cardLabel(card));

        const inner = document.createElement("div");
        inner.className = "blackjack-card-inner";
        const back = document.createElement("div");
        back.className = "blackjack-card-back";
        back.setAttribute("aria-hidden", "true");

        const face = document.createElement("div");
        face.className = "blackjack-card-face";
        face.setAttribute("aria-hidden", "true");
        face.append(
            createCardCorner(card, "top"),
            createCardCenter(card),
            createCardCorner(card, "bottom"),
        );
        inner.append(back, face);
        element.appendChild(inner);
        return element;
    }

    function createCardCorner(card, position) {
        const corner = document.createElement("span");
        corner.className = `blackjack-card-corner ${position}`;
        const rank = document.createElement("b");
        const suit = document.createElement("small");
        rank.textContent = card.rank;
        suit.textContent = card.suitSymbol;
        corner.append(rank, suit);
        return corner;
    }

    function createCardCenter(card) {
        if (["J", "Q", "K"].includes(card.rank)) {
            const face = document.createElement("span");
            const label = document.createElement("strong");
            face.className = "blackjack-card-face-card";
            label.textContent = card.rank;
            face.appendChild(label);
            return face;
        }
        const pip = document.createElement("span");
        pip.className = "blackjack-card-pip";
        pip.textContent = card.suitSymbol;
        return pip;
    }

    function renderCards(container, cards, options = {}) {
        const fragment = document.createDocumentFragment();
        cards.forEach((card, index) => {
            const initialDelay = view.initialDeals.get(card.id);
            fragment.appendChild(createCard(card, {
                hidden: Boolean(options.hiddenAt?.(index)),
                isDealing: view.lastDealtCardId === card.id || initialDelay !== undefined,
                delay: initialDelay,
            }));
        });
        container.replaceChildren(fragment);
    }

    function animateCardsFromShoe() {
        const queuedCards = Array.from(app.querySelectorAll(".blackjack-card[data-dealing-from-shoe='true']"));
        if (!queuedCards.length) return;

        const shoeRect = elements.shoe.getBoundingClientRect();
        const sourceX = shoeRect.left + shoeRect.width * 0.36;
        const sourceY = shoeRect.top + shoeRect.height * 0.4;
        let longestDelay = 0;

        queuedCards.forEach((card, index) => {
            const cardRect = card.getBoundingClientRect();
            const delay = Number.parseFloat(card.style.getPropertyValue("--blackjack-deal-delay")) || 0;
            const fromX = sourceX - (cardRect.left + cardRect.width / 2);
            const fromY = sourceY - (cardRect.top + cardRect.height / 2);
            const rotation = Math.max(-12, Math.min(12, -fromX * 0.025 + (index % 2 ? 3 : -3)));

            card.style.setProperty("--blackjack-deal-from-x", `${fromX.toFixed(1)}px`);
            card.style.setProperty("--blackjack-deal-from-y", `${fromY.toFixed(1)}px`);
            card.style.setProperty("--blackjack-deal-rotation", `${rotation.toFixed(1)}deg`);
            card.classList.add("is-dealing");
            delete card.dataset.dealingFromShoe;
            longestDelay = Math.max(longestDelay, delay);
        });

        window.clearTimeout(shoeDealTimer);
        elements.shoe.classList.add("is-dealing");
        shoeDealTimer = window.setTimeout(() => {
            elements.shoe.classList.remove("is-dealing");
            shoeDealTimer = 0;
        }, longestDelay + 520);
    }

    function renderDealer() {
        const visibleCards = game.dealerHand.slice(0, view.dealerVisible || game.dealerHand.length);
        renderCards(elements.dealerCards, visibleCards, {
            hiddenAt: (index) => !game.dealerRevealed && index === 1,
        });

        if (!visibleCards.length) {
            elements.dealerTotal.textContent = "Toplam: —";
            return;
        }
        const totalCards = game.dealerRevealed ? visibleCards : visibleCards.slice(0, 1);
        elements.dealerTotal.textContent = `Toplam: ${handText(totalCards)}`;
    }

    function outcomeLabel(hand) {
        const labels = {
            blackjack: "BLACKJACK!",
            win: "Kazandın",
            lose: "Kaybettin",
            push: "PUSH",
            bust: "BUST",
            "dealer-bust": "Krupiye BUST",
        };
        if (hand.outcome) return labels[hand.outcome] || hand.outcome;
        if (hand.status === "standing") return "Durdu";
        return "Oynanıyor";
    }

    function renderPlayerHands() {
        const fragment = document.createDocumentFragment();
        game.playerHands.forEach((hand, index) => {
            const panel = document.createElement("section");
            const meta = document.createElement("div");
            const cards = document.createElement("div");
            const name = document.createElement("strong");
            const total = document.createElement("span");
            const outcome = document.createElement("em");
            const visibleCount = view.playerVisible[index] ?? hand.cards.length;

            panel.className = "blackjack-player-hand";
            if (game.phase === engine.PHASES.PLAYER_TURN && index === game.activeHandIndex) panel.classList.add("is-active");
            meta.className = "blackjack-player-hand-meta";
            cards.className = "blackjack-card-row";
            name.textContent = game.playerHands.length > 1 ? `El ${index + 1}` : "Elin";
            total.textContent = handText(hand.cards.slice(0, visibleCount));
            outcome.textContent = outcomeLabel(hand);
            meta.append(name, total, outcome);
            renderCards(cards, hand.cards.slice(0, visibleCount));
            panel.append(meta, cards);
            fragment.appendChild(panel);
        });
        elements.playerHands.replaceChildren(fragment);

        if (!game.playerHands.length) {
            elements.playerTotal.textContent = "Toplam: —";
        } else if (game.playerHands.length === 1) {
            const hand = game.playerHands[0];
            const count = view.playerVisible[0] ?? hand.cards.length;
            elements.playerTotal.textContent = `Toplam: ${handText(hand.cards.slice(0, count))}`;
        } else {
            elements.playerTotal.textContent = `${game.playerHands.length} el`;
        }
    }

    function getStatusPresentation() {
        if (game.phase === engine.PHASES.ROUND_OVER) {
            const outcomes = game.playerHands.map((hand) => hand.outcome);
            if (outcomes.includes("blackjack")) return { title: "BLACKJACK!", tone: "win" };
            if (outcomes.includes("dealer-bust")) return { title: "KRUPİYE BUST", tone: "win" };
            if (outcomes.every((outcome) => outcome === "push")) return { title: "BERABERE · PUSH", tone: "push" };
            if (outcomes.every((outcome) => ["lose", "bust"].includes(outcome))) return { title: outcomes.includes("bust") ? "BUST" : "KAYBETTİN", tone: "loss" };
            if (outcomes.includes("win")) return { title: "KAZANDIN", tone: "win" };
        }
        if (game.phase === engine.PHASES.INSURANCE) return { title: "SİGORTA KARARI", tone: "" };
        if (game.phase === engine.PHASES.DEALER_TURN) return { title: "KRUPİYE OYNUYOR", tone: "" };
        if (game.phase === engine.PHASES.PLAYER_TURN) return { title: "SIRA SENDE", tone: "" };
        if (game.phase === engine.PHASES.DEALING) return { title: "KARTLAR DAĞITILIYOR", tone: "" };
        return { title: "BAHİSLER AÇIK", tone: "" };
    }

    function renderStatus() {
        const presentation = getStatusPresentation();
        elements.status.className = `blackjack-status${presentation.tone ? ` is-${presentation.tone}` : ""}`;
        const title = elements.status.querySelector("strong");
        const detail = elements.status.querySelector("span");
        title.textContent = presentation.title;
        detail.textContent = game.message;
    }

    function getActionKicker() {
        const labels = {
            [engine.PHASES.BETTING]: "BAHİSLER AÇIK",
            [engine.PHASES.DEALING]: "KARTLAR DAĞITILIYOR",
            [engine.PHASES.INSURANCE]: "SİGORTA KARARI",
            [engine.PHASES.PLAYER_TURN]: "SIRA SENDE",
            [engine.PHASES.DEALER_TURN]: "KRUPİYE OYNUYOR",
            [engine.PHASES.RESOLVING]: "EL HESAPLANIYOR",
            [engine.PHASES.ROUND_OVER]: "BAHİSLER AÇIK",
        };
        return labels[game.phase] || "MASA HAZIR";
    }

    function renderControls() {
        const isBetting = game.phase === engine.PHASES.BETTING && !busy;
        const isPlayerTurn = game.phase === engine.PHASES.PLAYER_TURN && !busy;
        const hand = game.playerHands[game.activeHandIndex];
        const insuranceAmount = Math.floor(game.currentBet / 2);

        elements.chips.forEach((chip) => {
            const amount = Number(chip.dataset.blackjackChip) * engine.MONEY_SCALE;
            chip.disabled = !isBetting || game.currentBet + amount > game.balance;
        });
        elements.clearBet.disabled = !isBetting || !game.currentBet;
        elements.repeatBet.disabled = !isBetting || !game.lastBet || game.lastBet > game.balance;
        elements.deal.disabled = !isBetting || game.currentBet < MINIMUM_BET;
        elements.refreshCredit.hidden = !(isBetting && game.balance < MINIMUM_BET);
        elements.refreshCredit.disabled = !isBetting;
        elements.hit.disabled = !isPlayerTurn;
        elements.stand.disabled = !isPlayerTurn;
        elements.double.disabled = !isPlayerTurn || !engine.canDouble(hand) || game.balance < (hand?.bet || 0);
        elements.split.disabled = !isPlayerTurn || !engine.canSplit(hand) || game.balance < (hand?.bet || 0);
        elements.insurance.hidden = game.phase !== engine.PHASES.INSURANCE;
        elements.insuranceTake.disabled = busy || insuranceAmount <= 0 || game.balance < insuranceAmount;
        elements.insuranceDecline.disabled = busy || game.phase !== engine.PHASES.INSURANCE;
        elements.betNote.textContent = game.currentBet ? `Masada ${formatCredits(game.currentBet)} kredi` : "Minimum 10 kredi";
        elements.actionKicker.textContent = getActionKicker();
    }

    function render() {
        app.dataset.phase = game.phase;
        elements.balance.textContent = formatCredits(game.balance);
        elements.currentBet.textContent = formatCredits(game.currentBet);
        renderDealer();
        renderPlayerHands();
        renderStatus();
        renderControls();
        elements.shoe.classList.toggle("is-shuffling", Boolean(busy && game.phase === engine.PHASES.DEALING && game.round?.reshuffled));
        animateCardsFromShoe();
        elements.sound.setAttribute("aria-pressed", String(soundEnabled));
        elements.sound.setAttribute("aria-label", soundEnabled ? "Oyun seslerini kapat" : "Oyun seslerini aç");
        elements.sound.querySelector("span").textContent = soundEnabled ? "🔊" : "🔇";
        positionDealButton();
    }

    function positionDealButton() {
        const useDesktopTableLayout = window.matchMedia("(min-width: 1181px)").matches;
        const lastChip = elements.chips.at(-1);
        if (!useDesktopTableLayout || !lastChip || !elements.bettingPanel) {
            elements.bettingPanel?.classList.remove("is-deal-positioned");
            return;
        }

        const panelRect = elements.bettingPanel.getBoundingClientRect();
        const chipRect = lastChip.getBoundingClientRect();
        const offset = Math.max(0, Math.round(chipRect.right - panelRect.left + 12));
        elements.bettingPanel.style.setProperty("--blackjack-deal-left", `${offset}px`);
        elements.bettingPanel.classList.add("is-deal-positioned");
    }

    function showBalanceDelta(delta) {
        window.clearTimeout(balanceDeltaTimer);
        elements.balanceDelta.hidden = true;
        elements.balance.classList.remove("is-increasing", "is-decreasing");
        if (!delta) return;

        const isIncrease = delta > 0;
        const label = `${isIncrease ? "+" : "−"}${formatCredits(Math.abs(delta))}`;
        elements.balanceDelta.className = `blackjack-balance-delta is-${isIncrease ? "increase" : "decrease"}`;
        elements.balanceDelta.textContent = label;
        elements.balanceDelta.setAttribute("aria-label", `Bakiye ${isIncrease ? "arttı" : "azaldı"}: ${label} kredi`);
        elements.balanceDelta.hidden = false;
        elements.balance.classList.add(isIncrease ? "is-increasing" : "is-decreasing");
        balanceDeltaTimer = window.setTimeout(() => {
            elements.balanceDelta.hidden = true;
            elements.balance.classList.remove("is-increasing", "is-decreasing");
            balanceDeltaTimer = 0;
        }, prefersReducedMotion.matches ? 900 : 1800);
    }

    function playSound(kind) {
        if (!soundEnabled) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            if (!playSound.context) playSound.context = new AudioContextClass();
            const context = playSound.context;
            if (context.state === "suspended") context.resume();
            const tones = {
                chip: [300, 0.04, "sine"],
                deal: [170, 0.045, "triangle"],
                flip: [260, 0.08, "triangle"],
                win: [523, 0.14, "sine"],
                loss: [130, 0.15, "sawtooth"],
                blackjack: [659, 0.2, "sine"],
                shuffle: [110, 0.1, "triangle"],
                click: [210, 0.035, "sine"],
            };
            const [frequency, duration, type] = tones[kind] || tones.click;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, context.currentTime);
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + duration + 0.02);
        } catch {
            // Audio is an enhancement; unsupported or blocked contexts are silent.
        }
    }

    async function revealDealerCard() {
        const hiddenCard = elements.dealerCards.querySelector(".blackjack-card.is-hidden");
        if (!hiddenCard) return;
        hiddenCard.classList.add("is-revealed", "is-flipping");
        const hiddenCardData = game.dealerHand[1];
        if (hiddenCardData) hiddenCard.setAttribute("aria-label", cardLabel(hiddenCardData));
        playSound("flip");
        await delay(450);
    }

    async function completeRound() {
        const result = engine.resolveRound(game);
        view.dealerVisible = game.dealerHand.length;
        view.lastDealtCardId = "";
        saveState();
        render();
        showBalanceDelta(game.balance - roundStartingBalance);
        if (result?.results?.some((item) => item.outcome === "blackjack")) playSound("blackjack");
        else if (result?.results?.some((item) => ["win", "dealer-bust"].includes(item.outcome))) playSound("win");
        else if (result?.results?.every((item) => ["lose", "bust"].includes(item.outcome))) playSound("loss");
    }

    async function runDealerTurn() {
        busy = true;
        render();
        await revealDealerCard();
        const dealerCards = engine.dealerPlay(game);
        saveState();
        view.dealerVisible = Math.min(2, game.dealerHand.length);
        render();
        for (const dealtCard of dealerCards) {
            view.dealerVisible += 1;
            view.lastDealtCardId = dealtCard.id;
            render();
            playSound("deal");
            await delay(440);
            view.lastDealtCardId = "";
        }
        await completeRound();
        busy = false;
        render();
        scheduleAutoNextRound();
    }

    async function resolveNaturalRound() {
        busy = true;
        await revealDealerCard();
        await completeRound();
        busy = false;
        render();
        scheduleAutoNextRound();
    }

    async function beginDeal() {
        if (busy || game.phase !== engine.PHASES.BETTING || game.currentBet < MINIMUM_BET) return;
        busy = true;
        roundStartingBalance = game.balance;
        const deal = engine.beginRound(game);
        if (!deal) {
            busy = false;
            return;
        }
        saveState();
        view = createViewState();
        view.dealerVisible = 2;
        view.playerVisible = [2];
        deal.sequence.forEach((item, index) => view.initialDeals.set(item.card.id, index * 125));
        if (deal.reshuffled) {
            game.message = "Kartlar karıştırılıyor…";
            playSound("shuffle");
            render();
            await delay(360);
        }
        game.message = "Kartlar dağıtılıyor.";
        render();
        playSound("deal");
        await delay(850);
        view.initialDeals.clear();
        const decision = engine.afterInitialDeal(game);
        saveState();
        if (decision.type === "player-turn") {
            busy = false;
            render();
        } else if (decision.type === "insurance") {
            busy = false;
            render();
        } else {
            await resolveNaturalRound();
        }
    }

    async function decideInsurance(accept) {
        if (busy || game.phase !== engine.PHASES.INSURANCE) return;
        busy = true;
        const decision = accept ? engine.takeInsurance(game) : engine.declineInsurance(game);
        if (!decision) {
            busy = false;
            render();
            return;
        }
        saveState();
        if (accept) playSound("chip");
        if (decision.type === "player-turn") {
            busy = false;
            render();
            return;
        }
        elements.insurance.hidden = true;
        await resolveNaturalRound();
    }

    async function takeHit() {
        if (busy) return;
        busy = true;
        const activeIndex = game.activeHandIndex;
        const result = engine.hit(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
        view.playerVisible[activeIndex] = game.playerHands[activeIndex].cards.length;
        view.lastDealtCardId = result.card.id;
        render();
        playSound("deal");
        await delay(430);
        view.lastDealtCardId = "";
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else {
            busy = false;
            render();
        }
    }

    async function takeStand() {
        if (busy) return;
        busy = true;
        const result = engine.stand(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
        render();
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else {
            busy = false;
            render();
        }
    }

    async function takeDouble() {
        if (busy) return;
        busy = true;
        const activeIndex = game.activeHandIndex;
        const result = engine.doubleDown(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
        view.playerVisible[activeIndex] = game.playerHands[activeIndex].cards.length;
        view.lastDealtCardId = result.card.id;
        render();
        playSound("deal");
        await delay(430);
        view.lastDealtCardId = "";
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else {
            busy = false;
            render();
        }
    }

    async function takeSplit() {
        if (busy) return;
        busy = true;
        const result = engine.split(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
        view.playerVisible = [2, 1];
        view.lastDealtCardId = result.cards[0].id;
        render();
        playSound("deal");
        await delay(360);
        view.playerVisible = [2, 2];
        view.lastDealtCardId = result.cards[1].id;
        render();
        playSound("deal");
        await delay(360);
        view.lastDealtCardId = "";
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else {
            busy = false;
            render();
        }
    }

    function clearAutoNextRound() {
        if (!autoNextRoundTimer) return;
        window.clearTimeout(autoNextRoundTimer);
        autoNextRoundTimer = 0;
    }

    function scheduleAutoNextRound() {
        clearAutoNextRound();
        autoNextRoundTimer = window.setTimeout(() => {
            autoNextRoundTimer = 0;
            resetToBetting();
        }, 2000);
    }

    function resetToBetting() {
        clearAutoNextRound();
        if (busy || !engine.prepareNextRound(game)) return;
        view = createViewState();
        saveState();
        render();
    }

    async function resumeSavedGame() {
        if (game.phase === engine.PHASES.DEALING) {
            busy = true;
            view.dealerVisible = game.dealerHand.length;
            view.playerVisible = game.playerHands.map((hand) => hand.cards.length);
            const decision = engine.afterInitialDeal(game);
            saveState();
            if (["player-turn", "insurance"].includes(decision.type)) {
                busy = false;
                render();
                return;
            }
            await resolveNaturalRound();
            return;
        }

        if (game.phase === engine.PHASES.DEALER_TURN) {
            await runDealerTurn();
            return;
        }

        if (game.phase === engine.PHASES.RESOLVING) {
            busy = true;
            await completeRound();
            busy = false;
            render();
            scheduleAutoNextRound();
            return;
        }

        if (game.phase === engine.PHASES.ROUND_OVER) scheduleAutoNextRound();
    }

    function handleChipClick(event) {
        if (busy) return;
        const credits = Number(event.currentTarget.dataset.blackjackChip);
        if (!engine.addBet(game, credits * engine.MONEY_SCALE)) return;
        game.message = `${formatCredits(game.currentBet)} kredi bahis masasında.`;
        saveState();
        render();
        playSound("chip");
    }

    function clearBet() {
        if (busy || !engine.clearBet(game)) return;
        game.message = "Bahis alanı temizlendi.";
        saveState();
        render();
        playSound("click");
    }

    function repeatBet() {
        if (busy || !engine.repeatBet(game)) return;
        game.message = "Son bahis masaya yerleştirildi.";
        saveState();
        render();
        playSound("chip");
    }

    function refreshCredits() {
        if (busy || !engine.refreshBalance(game)) return;
        view = createViewState();
        saveState();
        render();
        playSound("click");
    }

    function bindEvents() {
        elements.chips.forEach((chip) => chip.addEventListener("click", handleChipClick));
        elements.clearBet.addEventListener("click", clearBet);
        elements.repeatBet.addEventListener("click", repeatBet);
        elements.deal.addEventListener("click", beginDeal);
        elements.refreshCredit.addEventListener("click", refreshCredits);
        elements.hit.addEventListener("click", takeHit);
        elements.stand.addEventListener("click", takeStand);
        elements.double.addEventListener("click", takeDouble);
        elements.split.addEventListener("click", takeSplit);
        elements.insuranceTake.addEventListener("click", () => decideInsurance(true));
        elements.insuranceDecline.addEventListener("click", () => decideInsurance(false));
        window.addEventListener("resize", positionDealButton, { passive: true });
        window.addEventListener("pagehide", saveState);
        elements.sound.addEventListener("click", () => {
            soundEnabled = !soundEnabled;
            saveState();
            render();
            if (soundEnabled) playSound("click");
        });
        document.addEventListener("keydown", handleKeyboard);
    }

    function handleKeyboard(event) {
        const activePanel = document.querySelector(".tool-panel.active");
        if (activePanel?.id !== "blackjack" || busy || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        const isInteractive = target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName));
        if (isInteractive) return;

        const key = event.key.toLowerCase();
        const actions = { h: takeHit, s: takeStand, d: takeDouble, p: takeSplit };
        if (actions[key] && game.phase === engine.PHASES.PLAYER_TURN) {
            event.preventDefault();
            actions[key]();
            return;
        }
        if ([" ", "enter"].includes(key)) {
            if (game.phase === engine.PHASES.BETTING && game.currentBet >= MINIMUM_BET) {
                event.preventDefault();
                beginDeal();
            }
        }
    }

    bindEvents();
    render();
    resumeSavedGame();
})();
