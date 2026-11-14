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
        totalBet: document.getElementById("blackjack-total-bet"),
        seats: document.getElementById("blackjack-seats"),
        seatInstruction: document.getElementById("blackjack-seat-instruction"),
        dealerCards: document.getElementById("blackjack-dealer-cards"),
        dealerTotal: document.getElementById("blackjack-dealer-total"),
        playerHands: document.getElementById("blackjack-player-hands"),
        playerTotal: document.getElementById("blackjack-player-total"),
        actionKicker: document.getElementById("blackjack-action-kicker"),
        status: document.getElementById("blackjack-status"),
        insurance: document.getElementById("blackjack-insurance"),
        insuranceNote: document.getElementById("blackjack-insurance-note"),
        insuranceTake: document.getElementById("blackjack-insurance-take"),
        insuranceDecline: document.getElementById("blackjack-insurance-decline"),
        shoe: document.getElementById("blackjack-shoe"),
        chips: Array.from(document.querySelectorAll("[data-blackjack-chip]")),
        clearBet: document.getElementById("blackjack-clear-bet"),
        repeatBet: document.getElementById("blackjack-repeat-bet"),
        deal: document.getElementById("blackjack-deal"),
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
    let soundVolume = saved.soundVolume ?? 1;
    const volumeInput = document.getElementById("blackjack-volume");
    const volumeOutput = document.getElementById("blackjack-volume-value");
    volumeInput.value = String(Math.round(soundVolume * 100));
    volumeOutput.textContent = `%${volumeInput.value}`;
    volumeInput.addEventListener("input", () => { soundVolume = Number(volumeInput.value) / 100; volumeOutput.textContent = `%${volumeInput.value}`; if (playSound.master) playSound.master.gain.setTargetAtTime(soundVolume, playSound.context.currentTime, 0.02); saveState(); });
    const volumeControl = volumeInput.closest(".blackjack-volume-control");
    volumeControl.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse" && volumeControl.contains(document.activeElement)) document.activeElement.blur(); });
    let busy = false;
    let selectedSpot = Math.max(0, game.spotBets.findIndex(Boolean));
    let view = createViewState();
    let shoeDealTimer = 0;
    let balanceDeltaTimer = 0;
    let roundStartingBalance = getRoundStartingBalance();
    const seats = createSeats();

    function getRoundStartingBalance() {
        if ([engine.PHASES.BETTING, engine.PHASES.ROUND_OVER].includes(game.phase)) return game.balance;
        const handBets = game.playerHands.reduce((total, hand) => total + hand.bet, 0);
        const insurancePayout = game.round?.insuranceWon ? game.insuranceBet * 3 : 0;
        return game.balance + handBets + game.insuranceBet - insurancePayout;
    }

    function createViewState() {
        return {
            dealerVisible: null,
            playerVisible: new Map(),
            initialDeals: new Map(),
            lastDealtCardId: "",
        };
    }

    function loadSavedState() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return {
                balance: Number.isSafeInteger(value.balance * 2) && typeof value.balance === "number" && value.balance >= 0
                    ? value.balance
                    : engine.STARTING_BALANCE,
                lastBet: Number.isInteger(value.lastBet) && value.lastBet >= 0 ? value.lastBet : 0,
                stats: value.stats && typeof value.stats === "object" ? value.stats : {},
                soundEnabled: typeof value.soundEnabled === "boolean" ? value.soundEnabled : true,
                soundVolume: Number.isFinite(value.soundVolume) ? Math.max(0, Math.min(1, value.soundVolume)) : 1,
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
                soundVolume,
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
            maximumFractionDigits: 2,
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
        const sourceX = shoeRect.left + shoeRect.width * 0.23;
        const sourceY = shoeRect.top + shoeRect.height * 0.8;
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
        const visibleCards = game.dealerHand.slice(0, view.dealerVisible ?? game.dealerHand.length);
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

    function outcomeLabel(hand, active) {
        const labels = {
            blackjack: "BLACKJACK!",
            win: "Kazandın",
            lose: "Kaybettin",
            push: "PUSH",
            bust: "BUST",
            "dealer-bust": "Krupiye BUST",
        };
        if (hand.outcome) return labels[hand.outcome] || hand.outcome;
        if (hand.naturalBlackjack) return "Blackjack";
        if (hand.status === "standing") return "Durdu";
        return active ? "Oynanıyor" : "Sırada";
    }

    function createSeats() {
        return Array.from({ length: engine.MAX_SPOTS }, (_, spotIndex) => {
            const button = document.createElement("button");
            const title = document.createElement("strong");
            const bet = document.createElement("span");
            const status = document.createElement("small");
            button.type = "button";
            button.className = "blackjack-seat";
            button.dataset.seat = String(spotIndex + 1);
            title.className = "blackjack-seat-title";
            title.textContent = `Yer ${spotIndex + 1}`;
            bet.className = "blackjack-seat-bet";
            status.className = "blackjack-seat-state";
            button.append(title, bet, status);
            button.addEventListener("click", () => {
                if (busy || game.phase !== engine.PHASES.BETTING) return;
                selectedSpot = spotIndex;
                game.message = `${spotIndex + 1}. yeri seçtin. Çip ekleyebilirsin.`;
                render();
            });
            elements.seats.append(button);
            return { button, bet, status };
        });
    }

    function renderSeats(handsBySpot) {
        const isBetting = game.phase === engine.PHASES.BETTING;
        const isSettled = game.phase === engine.PHASES.ROUND_OVER;
        const activeHand = game.phase === engine.PHASES.PLAYER_TURN ? game.playerHands[game.activeHandIndex] : null;
        const stakes = isBetting ? game.spotBets : handsBySpot.map((hands) => hands.reduce((sum, hand) => sum + hand.bet, 0));
        const selectedOrFundedSpot = isBetting || stakes[selectedSpot] ? selectedSpot : stakes.findIndex(Boolean);
        const displayedSpot = activeHand?.spotIndex ?? selectedOrFundedSpot;
        elements.currentBet.textContent = formatCredits(stakes[displayedSpot]);
        elements.totalBet.textContent = formatCredits(engine.totalBet(game));
        elements.seatInstruction.textContent = isBetting
            ? "Bir yer seçip çip ekle. Aynı turda beş yere kadar oynayabilirsin."
            : "Her yerin eli aynı krupiyeye karşı ayrı sonuçlanır.";

        seats.forEach(({ button, bet, status }, spotIndex) => {
            const stake = stakes[spotIndex];
            const hands = handsBySpot[spotIndex];
            const isSelected = isBetting && spotIndex === selectedSpot;
            const isPlaying = spotIndex === activeHand?.spotIndex;
            button.disabled = !isBetting || busy;
            button.setAttribute("aria-pressed", String(isSelected));
            if (isPlaying) button.setAttribute("aria-current", "true");
            else button.removeAttribute("aria-current");
            button.classList.toggle("is-selected", isSelected);
            button.classList.toggle("is-playing", isPlaying);
            button.classList.toggle("is-settled", isSettled && stake > 0);
            button.classList.toggle("has-bet", stake > 0);
            bet.textContent = stake ? `${formatCredits(stake)} kredi` : "—";
            if (!stake) status.textContent = isSelected ? "Seçili" : "Boş";
            else if (isBetting) status.textContent = isSelected ? "Seçili" : "Bahis hazır";
            else if (isPlaying) status.textContent = "Sıra burada";
            else if (game.phase === engine.PHASES.DEALING) status.textContent = "Dağıtılıyor";
            else if (isSettled) status.textContent = hands.length === 1 ? outcomeLabel(hands[0]) : "İki el sonuçlandı";
            else status.textContent = hands.some((hand) => hand.status === "playing") ? "Sırada" : "El tamamlandı";
        });
    }

    function renderPlayerHands(handsBySpot) {
        const scrollPositions = new Map(Array.from(elements.playerHands.querySelectorAll(".blackjack-player-hand"), (panel) => [
            panel.dataset.handId,
            {
                left: panel.querySelector(".blackjack-card-row").scrollLeft,
                revealNewest: panel.dataset.revealNewest === "true",
            },
        ]));
        const fragment = document.createDocumentFragment();
        const activeHand = game.phase === engine.PHASES.PLAYER_TURN ? game.playerHands[game.activeHandIndex] : null;
        handsBySpot.forEach((hands, spotIndex) => {
            if (!hands.length) return;
            const group = document.createElement("div");
            group.className = "blackjack-seat-hands";
            group.dataset.seat = String(spotIndex + 1);
            group.classList.toggle("is-active", activeHand?.spotIndex === spotIndex);
            hands.forEach((hand, index) => group.append(createPlayerHand(hand, hands.length, index, hand === activeHand)));
            fragment.appendChild(group);
        });
        elements.playerHands.replaceChildren(fragment);
        elements.playerHands.querySelectorAll(".blackjack-player-hand").forEach((panel) => {
            const row = panel.querySelector(".blackjack-card-row");
            const newCard = Boolean(view.lastDealtCardId && row.querySelector(".blackjack-card[data-dealing-from-shoe]"));
            const previous = scrollPositions.get(panel.dataset.handId);
            panel.dataset.revealNewest = String(newCard);
            row.scrollLeft = newCard || previous?.revealNewest ? row.scrollWidth : (previous?.left || 0);
        });

        const handCount = game.playerHands.length;
        if (activeHand) elements.playerTotal.textContent = `Sıra: ${activeHand.spotIndex + 1}. yer`;
        else elements.playerTotal.textContent = handCount ? `${handCount} el` : "—";
    }

    function createPlayerHand(hand, spotHandCount, index, active) {
        const panel = document.createElement("section");
        const meta = document.createElement("div");
        const cards = document.createElement("div");
        const name = document.createElement("strong");
        const total = document.createElement("span");
        const outcome = document.createElement("em");
        const wager = document.createElement("small");
        const visibleCount = view.playerVisible.get(hand.id) ?? hand.cards.length;
        const visibleCards = hand.cards.slice(0, visibleCount);

        panel.className = "blackjack-player-hand";
        panel.dataset.handId = hand.id;
        if (hand.outcome) panel.dataset.outcome = hand.outcome;
        panel.classList.toggle("is-active", active);
        meta.className = "blackjack-player-hand-meta";
        cards.className = "blackjack-card-row";
        cards.tabIndex = 0;
        cards.setAttribute("role", "group");
        name.textContent = `Yer ${hand.spotIndex + 1}${spotHandCount > 1 ? ` · El ${index + 1}` : ""}`;
        cards.setAttribute("aria-label", `${name.textContent} kartları`);
        total.textContent = visibleCount ? handText(visibleCards) : "—";
        outcome.textContent = outcomeLabel(hand, active);
        wager.className = "blackjack-hand-wager";
        wager.textContent = game.phase === engine.PHASES.ROUND_OVER
            ? `Bahis ${formatCredits(hand.bet)} · Ödeme ${formatCredits(hand.payout)}`
            : `Bahis ${formatCredits(hand.bet)} kredi`;
        meta.append(name, total, outcome);
        renderCards(cards, visibleCards);
        panel.append(meta, cards, wager);
        return panel;
    }

    function getStatusPresentation() {
        if (game.phase === engine.PHASES.ROUND_OVER) {
            const outcomes = game.playerHands.map((hand) => hand.outcome);
            if (new Set(outcomes).size > 1) return { title: "TUR TAMAMLANDI", tone: "" };
            if (outcomes.includes("blackjack")) return { title: "BLACKJACK!", tone: "win" };
            if (outcomes.includes("dealer-bust")) return { title: "KRUPİYE BUST", tone: "win" };
            if (outcomes.every((outcome) => outcome === "push")) return { title: "BERABERE · PUSH", tone: "push" };
            if (outcomes.every((outcome) => ["lose", "bust"].includes(outcome))) return { title: outcomes.includes("bust") ? "BUST" : "KAYBETTİN", tone: "loss" };
            if (outcomes.includes("win")) return { title: "KAZANDIN", tone: "win" };
        }
        if (game.phase === engine.PHASES.INSURANCE) return { title: "SİGORTA KARARI", tone: "" };
        if (game.phase === engine.PHASES.DEALER_TURN) return { title: "KRUPİYE OYNUYOR", tone: "" };
        if (game.phase === engine.PHASES.RESOLVING) return { title: "TUR HESAPLANIYOR", tone: "" };
        if (game.phase === engine.PHASES.PLAYER_TURN) {
            const spot = game.playerHands[game.activeHandIndex].spotIndex + 1;
            return { title: `SIRA ${spot}. YERDE`, tone: "" };
        }
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
        if (game.phase === engine.PHASES.PLAYER_TURN) {
            const hand = game.playerHands[game.activeHandIndex];
            const visibleCount = view.playerVisible.get(hand.id) ?? hand.cards.length;
            return `${hand.spotIndex + 1}. YER · ${handText(hand.cards.slice(0, visibleCount))}`;
        }
        const labels = {
            [engine.PHASES.BETTING]: "BAHİSLER AÇIK",
            [engine.PHASES.DEALING]: "KARTLAR DAĞITILIYOR",
            [engine.PHASES.INSURANCE]: "SİGORTA KARARI",
            [engine.PHASES.DEALER_TURN]: "KRUPİYE OYNUYOR",
            [engine.PHASES.RESOLVING]: "TUR HESAPLANIYOR",
            [engine.PHASES.ROUND_OVER]: "TUR TAMAMLANDI",
        };
        return labels[game.phase] || "MASA HAZIR";
    }

    function canDeal() {
        return !busy && game.phase === engine.PHASES.BETTING
            && game.currentBet > 0 && game.currentBet <= game.balance
            && game.spotBets.every((stake) => stake === 0 || stake >= MINIMUM_BET);
    }

    function renderControls() {
        const isBetting = game.phase === engine.PHASES.BETTING && !busy;
        const isPlayerTurn = game.phase === engine.PHASES.PLAYER_TURN && !busy;
        const isRoundOver = game.phase === engine.PHASES.ROUND_OVER;
        const hand = game.playerHands[game.activeHandIndex];
        const insuranceAmount = Math.floor(game.currentBet / 2);

        elements.chips.forEach((chip) => {
            const amount = Number(chip.dataset.blackjackChip) * engine.MONEY_SCALE;
            chip.disabled = !isBetting || game.currentBet + amount > game.balance;
        });
        elements.clearBet.disabled = !isBetting || !game.spotBets[selectedSpot];
        elements.repeatBet.disabled = !isBetting || !game.lastBet || game.lastBet > game.balance;
        elements.deal.disabled = isRoundOver ? busy : !canDeal();
        elements.deal.textContent = isRoundOver ? "Yeni Tur" : "Dağıt";
        elements.hit.disabled = !isPlayerTurn;
        elements.stand.disabled = !isPlayerTurn;
        elements.double.disabled = !isPlayerTurn || !engine.canDouble(hand) || game.balance < (hand?.bet || 0);
        elements.split.disabled = !isPlayerTurn || !engine.canSplit(hand) || game.balance < (hand?.bet || 0);
        elements.insurance.hidden = game.phase !== engine.PHASES.INSURANCE;
        elements.insuranceTake.disabled = busy || insuranceAmount <= 0 || game.balance < insuranceAmount;
        elements.insuranceDecline.disabled = busy || game.phase !== engine.PHASES.INSURANCE;
        if (!elements.insurance.hidden) {
            elements.insuranceNote.textContent = `Krupiyenin açık kartı as. Toplam ${formatCredits(insuranceAmount)} krediye tüm yerleri sigortala. Sigorta 2:1 öder.`;
        }
        elements.betNote.textContent = isBetting ? `${selectedSpot + 1}. yer · En az 10 kredi` : "";
        elements.actionKicker.textContent = getActionKicker();
    }

    function flyChip(source) {
        const target = seats[selectedSpot].bet;
        if (prefersReducedMotion.matches) return;
        const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
        const chip = document.createElement("span");
        chip.className = `${source.className} blackjack-flying-chip`;
        chip.innerHTML = source.innerHTML;
        chip.setAttribute("aria-hidden", "true");
        Object.assign(chip.style, {left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`});
        document.body.append(chip);
        const x = to.left + to.width / 2 - from.left - from.width / 2;
        const y = to.top + to.height / 2 - from.top - from.height / 2;
        const motion = chip.animate([
            {transform: "translate(0,0) rotate(0) scale(1)", opacity: 1},
            {transform: `translate(${x*.6}px,${y-35}px) rotate(100deg) scale(.95)`, offset: .65},
            {transform: `translate(${x}px,${y}px) rotate(160deg) scale(.82)`, opacity: 1}
        ], {duration: 420, easing: "cubic-bezier(.2,.7,.3,1)"});
        motion.onfinish = () => { chip.remove(); target.animate([{transform:"scale(.94)"},{transform:"scale(1)"}],{duration:160}); };
        motion.oncancel = () => chip.remove();
    }

    function render() {
        app.dataset.phase = game.phase;
        elements.balance.textContent = formatCredits(game.balance);
        const handsBySpot = Array.from({ length: engine.MAX_SPOTS }, () => []);
        game.playerHands.forEach((hand) => handsBySpot[hand.spotIndex].push(hand));
        renderSeats(handsBySpot);
        renderDealer();
        renderPlayerHands(handsBySpot);
        renderStatus();
        renderControls();
        elements.shoe.classList.toggle("is-shuffling", Boolean(busy && game.phase === engine.PHASES.DEALING && game.round?.reshuffled));
        animateCardsFromShoe();
        elements.sound.setAttribute("aria-pressed", String(soundEnabled));
        elements.sound.setAttribute("aria-label", soundEnabled ? "Oyun seslerini kapat" : "Oyun seslerini aç");
        elements.sound.querySelector("span").textContent = soundEnabled ? "🔊" : "🔇";
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
            if (!playSound.master) { playSound.master = context.createGain(); playSound.master.connect(context.destination); }
            playSound.master.gain.setValueAtTime(soundVolume, context.currentTime);
            if (context.state === "suspended") context.resume();
            // Layer filtered paper friction with a soft contact transient.
            if (["deal", "flip", "shuffle", "chip"].includes(kind)) {
                const now = context.currentTime;
                const noise = (offset, duration, frequency, level, q = 0.7) => {
                    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                    const source = context.createBufferSource();
                    const filter = context.createBiquadFilter();
                    const gain = context.createGain();
                    source.buffer = buffer;
                    filter.type = "lowpass";
                    filter.frequency.setValueAtTime(frequency, now + offset);
                    filter.Q.value = q;
                    gain.gain.setValueAtTime(0.0001, now + offset);
                    gain.gain.exponentialRampToValueAtTime(level, now + offset + 0.018);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
                    source.connect(filter).connect(gain).connect(playSound.master);
                    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
                    source.start(now + offset);
                    source.stop(now + offset + duration);
                };
                const variation = 0.97 + Math.random() * 0.06;
                if (kind === "shuffle") {
                    for (let i = 0; i < 5; i++) noise(i * 0.065, 0.11, 750 * variation, 0.045);
                    noise(0.33, 0.12, 300, 0.04);
                } else if (kind === "chip") {
                    noise(0, 0.09, 620 * variation, 0.065);
                } else {
                    noise(0, kind === "flip" ? 0.18 : 0.14, 850 * variation, 0.055);
                    noise(kind === "flip" ? 0.1 : 0.07, 0.1, 280 * variation, 0.05);
                }
                return;
            }
            const tones = {
                chip: [300, 0.04, "sine"],
                deal: [170, 0.045, "triangle"],
                flip: [260, 0.08, "triangle"],
                win: [523, 0.14, "sine"],
                loss: [160, 0.15, "sine"],
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
            gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
            oscillator.connect(gain).connect(playSound.master);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
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
    }

    async function resolveNaturalRound() {
        busy = true;
        await revealDealerCard();
        await completeRound();
        busy = false;
        render();
    }

    async function beginDeal() {
        if (!canDeal()) return;
        busy = true;
        roundStartingBalance = game.balance;
        const deal = engine.beginRound(game);
        if (!deal) {
            busy = false;
            return;
        }
        saveState();
        view = createViewState();
        if (deal.reshuffled) {
            view.dealerVisible = 0;
            game.playerHands.forEach((hand) => view.playerVisible.set(hand.id, 0));
            game.message = "Kartlar karıştırılıyor…";
            playSound("shuffle");
            render();
            await delay(360);
        }
        view.dealerVisible = null;
        view.playerVisible.clear();
        const spacing = deal.sequence.length > 4 ? 85 : 125;
        deal.sequence.forEach(({ card }, index) => view.initialDeals.set(card.id, index * spacing));
        game.message = "Kartlar dağıtılıyor.";
        render();
        playSound("deal");
        await delay(520 + (deal.sequence.length - 1) * spacing);
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
        const result = engine.hit(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
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
        const result = engine.doubleDown(game);
        if (!result) {
            busy = false;
            return;
        }
        saveState();
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
        const secondHand = game.playerHands[result.handIndex + 1];
        view.playerVisible.set(secondHand.id, 1);
        view.lastDealtCardId = result.cards[0].id;
        render();
        playSound("deal");
        await delay(360);
        view.playerVisible.delete(secondHand.id);
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

    function resetToBetting() {
        if (busy || !engine.prepareNextRound(game)) return;
        view = createViewState();
        replenishCreditsIfEmpty();
        saveState();
        render();
        seats[selectedSpot].button.focus();
    }

    async function resumeSavedGame() {
        if (game.phase === engine.PHASES.DEALING) {
            busy = true;
            view.dealerVisible = game.dealerHand.length;
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
        }
    }

    function handleChipClick(event) {
        if (busy) return;
        const credits = Number(event.currentTarget.dataset.blackjackChip);
        if (!engine.addBet(game, credits * engine.MONEY_SCALE, selectedSpot)) return;
        game.message = `${selectedSpot + 1}. yere ${formatCredits(game.spotBets[selectedSpot])} kredi koydun.`;
        saveState();
        render();
        flyChip(event.currentTarget);
        playSound("chip");
    }

    function clearBet() {
        if (busy || !engine.clearBet(game, selectedSpot)) return;
        game.message = `${selectedSpot + 1}. yerin bahsi temizlendi.`;
        saveState();
        render();
        playSound("click");
    }

    function repeatBet() {
        if (busy || !engine.repeatBet(game)) return;
        if (!game.spotBets[selectedSpot]) selectedSpot = game.spotBets.findIndex(Boolean);
        game.message = "Önceki turun başlangıç bahisleri geri kondu.";
        saveState();
        render();
        playSound("chip");
    }

    function replenishCreditsIfEmpty() {
        if (!engine.replenishBalanceIfEmpty(game, MINIMUM_BET)) return false;
        game.message = "Bakiyen tükendiği için 10.000 sanal kredi otomatik olarak yüklendi.";
        return true;
    }

    function bindEvents() {
        elements.chips.forEach((chip) => chip.addEventListener("click", handleChipClick));
        elements.clearBet.addEventListener("click", clearBet);
        elements.repeatBet.addEventListener("click", repeatBet);
        elements.deal.addEventListener("click", () => {
            if (game.phase === engine.PHASES.ROUND_OVER) resetToBetting();
            else beginDeal();
        });
        elements.hit.addEventListener("click", takeHit);
        elements.stand.addEventListener("click", takeStand);
        elements.double.addEventListener("click", takeDouble);
        elements.split.addEventListener("click", takeSplit);
        elements.insuranceTake.addEventListener("click", () => decideInsurance(true));
        elements.insuranceDecline.addEventListener("click", () => decideInsurance(false));
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
        if (activePanel?.id !== "blackjack" || busy || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;

        const key = event.key.toLowerCase();
        const actions = { h: takeHit, s: takeStand, d: takeDouble, p: takeSplit };
        if (actions[key] && game.phase === engine.PHASES.PLAYER_TURN) {
            event.preventDefault();
            actions[key]();
            return;
        }
        if ([" ", "enter"].includes(key)) {
            if (target instanceof HTMLElement && target.closest("button, a")) return;
            if (canDeal()) {
                event.preventDefault();
                beginDeal();
            }
        }
    }

    if (replenishCreditsIfEmpty()) saveState();
    bindEvents();
    render();
    resumeSavedGame();
})();
