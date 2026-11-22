(function exposeBlackjackWallet(root, factory) {
    "use strict";
    const createBridge = factory();
    if (typeof module === "object" && module.exports) module.exports = { createWalletBridge: createBridge };
    else root.OmniBlackjackWalletBridge = createBridge;
})(typeof globalThis === "undefined" ? window : globalThis, function blackjackWalletFactory() {
    "use strict";
    return function createWalletBridge(engine, wallet, legacy = {}, envelope = (game) => ({ game: engine.serializeState(game) })) {
        let record = wallet.read("blackjack");
        const initial = record.snapshot || legacy;
        const game = engine.restoreState(initial.game) || engine.createState({ balance: initial.balance, lastBet: initial.lastBet, stats: initial.stats });
        let pending = false;

        function mirrorBalance() {
            // The engine accepts quarter credits; any remaining cents stay in the shared wallet.
            game.balance = Math.floor((record.balance * engine.MONEY_SCALE + 1e-8) * 2) / 2;
            if (game.phase === engine.PHASES.BETTING && game.currentBet > game.balance) {
                engine.clearBet(game);
                game.message = "Ortak bakiyen değişti. Yeni bahislerini yerleştirebilirsin.";
            }
        }

        function adopt(next) {
            const changed = next.revision !== record.revision;
            const balanceChanged = next.balance !== record.balance;
            if (changed) {
                const restored = engine.restoreState(next.snapshot?.game);
                if (restored) {
                    Object.keys(game).forEach((key) => { delete game[key]; });
                    Object.assign(game, restored);
                }
            }
            record = next;
            mirrorBalance();
            return { changed, balanceChanged };
        }

        mirrorBalance();
        return Object.freeze({
            game,
            balance: () => record.balance,
            isPending: () => pending,
            sync() { return pending ? { changed: false, balanceChanged: false } : adopt(wallet.read("blackjack")); },
            async act(update, required = 0) {
                if (pending) return { ok: false, reason: "busy" };
                const latest = wallet.read("blackjack");
                if (latest.revision !== record.revision) {
                    adopt(latest);
                    return { ok: false, reason: "conflict" };
                }
                adopt(latest);
                const candidate = engine.restoreState(engine.serializeState(game));
                const before = candidate.balance;
                const value = update(candidate);
                if (!value) return { ok: false, reason: "invalid" };
                const opening = typeof required === "function" ? required(game) : required;
                pending = true;
                let result;
                try {
                    result = await wallet.commit("blackjack", {
                        revision: record.revision,
                        delta: (candidate.balance - before) / engine.MONEY_SCALE,
                        required: opening / engine.MONEY_SCALE,
                        snapshot: envelope(candidate),
                    });
                } catch { result = { ok: false, reason: "unavailable" }; }
                finally { pending = false; }
                const current = wallet.read("blackjack");
                adopt(current);
                if (!result.ok || current.revision !== result.revision) return { ok: false, reason: result.reason || "conflict" };
                return { ok: true, value };
            },
        });
    };
});

(function initBlackjackApp() {
    "use strict";

    if (typeof window === "undefined" || typeof document === "undefined") return;

    const engine = window.OmniBlackjackEngine;
    const wallet = window.OmniGameWallet;
    const app = document.getElementById("blackjack-app");
    if (!engine || !app || !wallet || !window.OmniBlackjackCards || !window.OmniBlackjackEffects || !window.OmniBlackjackAudio) return;

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
    const walletBridge = window.OmniBlackjackWalletBridge(engine, wallet, saved, createSavedEnvelope);
    const game = walletBridge.game;
    let soundEnabled = saved.soundEnabled;
    let soundVolume = saved.soundVolume ?? 1;
    const panel = document.getElementById("blackjack");
    const isTableActive = () => panel.classList.contains("active") && !document.hidden;
    const effects = window.OmniBlackjackEffects.create({ document, host: window, reduceMotion: () => prefersReducedMotion.matches, isActive: isTableActive });
    const audio = window.OmniBlackjackAudio.create({ volume: soundVolume, muted: !soundEnabled, isActive: isTableActive });
    const localAnimations = new Set();
    const volumeInput = document.getElementById("blackjack-volume");
    const volumeOutput = document.getElementById("blackjack-volume-value");
    volumeInput.value = String(Math.round(soundVolume * 100));
    volumeOutput.textContent = `%${volumeInput.value}`;
    volumeInput.addEventListener("input", () => { soundVolume = Number(volumeInput.value) / 100; volumeOutput.textContent = `%${volumeInput.value}`; audio.setVolume(soundVolume); audio.unlock(); saveState(); });
    const volumeControl = volumeInput.closest(".blackjack-volume-control");
    volumeControl.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse" && volumeControl.contains(document.activeElement)) document.activeElement.blur(); });
    let busy = false;
    let actionGeneration = 0;
    let selectedSpot = Math.max(0, game.spotBets.findIndex(Boolean));
    let view = createViewState();
    let balanceDeltaTimer = 0;
    let resumeTimer = 0;
    let drag = null;
    let suppressChipClick = false;
    const seats = createSeats();

    function createViewState() {
        return {
            dealerVisible: null,
            playerVisible: new Map(),
            lastDealtCardId: "",
            settledSpotChips: new Set(game.phase === engine.PHASES.ROUND_OVER ? game.playerHands.map((hand) => hand.spotIndex) : []),
            pendingCardIds: new Set(game.phase === engine.PHASES.DEALING
                ? [...game.dealerHand, ...game.playerHands.flatMap((hand) => hand.cards)].map((card) => card.id)
                : game.phase === engine.PHASES.RESOLVING ? game.dealerHand.slice(2).map((card) => card.id) : []),
            holeRevealed: game.phase === engine.PHASES.ROUND_OVER && game.dealerRevealed,
            focusHandId: null,
            inFlightCardId: null,
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

    function createSavedEnvelope(state = game) {
        return {
            version: 2,
            balance: state.balance,
            lastBet: state.lastBet,
            stats: state.stats,
            soundEnabled,
            soundVolume,
            game: engine.serializeState(state),
        };
    }

    function saveState() {
        try {
            // Preferences and a legacy backup never write the authoritative shared balance.
            localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedEnvelope()));
        } catch {
            // Private mode may block storage. The game remains fully playable.
        }
    }

    async function commitAction(update, required = 0) {
        const token = actionGeneration;
        const result = await walletBridge.act(update, required);
        if (token !== actionGeneration) { scheduleResume(); return null; }
        if (result.ok) {
            saveState();
            return result.value;
        }
        actionGeneration += 1;
        cancelPresentation();
        busy = false;
        view = createViewState();
        if (result.reason === "funds") game.message = "Ortak bakiyen bu işlem için yeterli değil.";
        else if (result.reason === "conflict") game.message = "Blackjack diğer sekmedeki kayıttan güncellendi.";
        render();
        if (result.reason === "conflict") {
            const token = actionGeneration;
            window.setTimeout(() => { if (token === actionGeneration && !busy) resumeSavedGame(); }, 0);
        }
        return null;
    }

    function syncWallet() {
        if (walletBridge.isPending()) return;
        const change = walletBridge.sync();
        if (change.changed) {
            actionGeneration += 1;
            cancelPresentation();
            busy = false;
            view = createViewState();
        }
        if (change.changed) { render(); scheduleResume(); }
        else if (change.balanceChanged) {
            // A lower wallet balance can invalidate reserved, un-dealt bets.
            if (game.phase === engine.PHASES.BETTING) { render(); return; }
            elements.balance.textContent = formatCredits(walletBridge.balance() * engine.MONEY_SCALE);
            renderControls();
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
        return new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion.matches || !isTableActive() ? 0 : milliseconds));
    }

    function cancelPresentation() {
        effects.cancel();
        localAnimations.forEach((animation) => animation.cancel());
        localAnimations.clear();
        cancelChipDrag();
        elements.shoe.classList.remove("is-dealing", "is-shuffling");
    }

    function scheduleResume() {
        if (resumeTimer || !isTableActive()) return;
        resumeTimer = window.setTimeout(() => {
            resumeTimer = 0;
            if (!busy && !walletBridge.isPending() && isTableActive()) resumeSavedGame();
        }, 0);
    }

    async function animateNode(node, frames, duration = 240) {
        if (!node?.animate || prefersReducedMotion.matches || !isTableActive()) return;
        let animation;
        try {
            animation = node.animate(frames, { duration, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
            localAnimations.add(animation);
            await animation.finished;
        } catch { /* Interrupted presentation never changes the recorded hand. */ }
        finally {
            localAnimations.delete(animation);
            try { animation?.cancel(); } catch { /* Already detached. */ }
        }
    }

    function shoeOrigin() {
        const box = elements.shoe.getBoundingClientRect();
        return { left: box.left + box.width * 0.13, top: box.top + box.height * 0.62, width: box.width * 0.36, height: box.width * 0.5 };
    }

    function cardNode(cardId) {
        return [...app.querySelectorAll(".blackjack-card[data-card-id]")].find((node) => node.dataset.cardId === cardId);
    }

    function snapshotCardRects() {
        return new Map([...app.querySelectorAll(".blackjack-card[data-card-id]")].map((node) => [node.dataset.cardId, { node, rect: node.getBoundingClientRect() }]));
    }

    async function deliverCard(card, { hidden = false, token = actionGeneration } = {}) {
        if (token !== actionGeneration || !isTableActive()) return false;
        view.pendingCardIds.delete(card.id);
        view.inFlightCardId = card.id;
        render();
        const node = hidden ? elements.dealerCards.querySelector(".blackjack-card.is-hidden") : cardNode(card.id);
        // A presentation failure must never strand a committed round. The
        // engine checkpoint remains authoritative if a browser drops a target.
        if (!node) { view.inFlightCardId = null; render(); return true; }
        const target = node.getBoundingClientRect();
        playSound("deal");
        elements.shoe.classList.add("is-dealing");
        try {
            await effects.flyCard(node, shoeOrigin(), target, { flip: !hidden, duration: 300 });
        } catch {
            // Card outcomes are already saved. Fall back to the settled card
            // when animation support fails, without replaying a game action.
        } finally {
            if (token === actionGeneration) {
                elements.shoe.classList.remove("is-dealing");
                view.inFlightCardId = null;
                render();
            }
        }
        return token === actionGeneration && isTableActive();
    }

    function initialDealSequence() {
        const sequence = [];
        for (let pass = 0; pass < 2; pass += 1) {
            game.playerHands.forEach((hand) => sequence.push({ card: hand.cards[pass], owner: "player", handId: hand.id }));
            sequence.push({ card: game.dealerHand[pass], owner: "dealer", hidden: pass === 1 });
        }
        return sequence;
    }

    async function presentInitialDeal(sequence, token) {
        view.pendingCardIds = new Set(sequence.map(({ card }) => card.id));
        view.holeRevealed = false;
        render();
        for (const item of sequence) {
            if (!await deliverCard(item.card, { hidden: item.hidden, token })) return false;
            await delay(55);
            if (token !== actionGeneration) return false;
        }
        return true;
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
        element.className = `blackjack-card ${hidden ? "is-hidden" : `blackjack-${card.color} is-face-up`}`;
        element.dataset.cardId = hidden ? (options.pending ? `pending-${options.index}` : "dealer-hole") : card.id;
        element.style.setProperty("--card-rotation", `${((options.index || 0) % 3 - 1) * 1.1}deg`);
        element.setAttribute("aria-label", hidden ? "Kapalı kart" : cardLabel(card));
        if (options.pending) {
            element.style.visibility = "hidden";
            element.setAttribute("aria-hidden", "true");
        }

        const inner = document.createElement("div");
        inner.className = "blackjack-card-inner";
        const back = document.createElement("div");
        back.className = "blackjack-card-back";
        back.setAttribute("aria-hidden", "true");
        back.innerHTML = window.OmniBlackjackCards.svg(null, { faceDown: true });

        const face = document.createElement("div");
        face.className = "blackjack-card-face blackjack-card-front";
        face.setAttribute("aria-hidden", "true");
        if (!hidden) face.innerHTML = window.OmniBlackjackCards.svg(card);
        inner.append(back, face);
        element.appendChild(inner);
        return element;
    }

    function renderCards(container, cards, options = {}) {
        const fragment = document.createDocumentFragment();
        cards.forEach((card, index) => {
            const pending = view.pendingCardIds.has(card.id);
            fragment.appendChild(createCard(card, {
                hidden: Boolean(options.hiddenAt?.(index)) || pending,
                pending, index,
            }));
        });
        container.replaceChildren(fragment);
    }

    function renderDealer() {
        const visibleCards = game.dealerHand.slice(0, view.dealerVisible ?? game.dealerHand.length);
        renderCards(elements.dealerCards, visibleCards, {
            hiddenAt: (index) => !view.holeRevealed && index === 1,
        });

        if (!visibleCards.length) {
            elements.dealerTotal.textContent = "Toplam: —";
            return;
        }
        const totalCards = visibleCards.filter((card, index) => !view.pendingCardIds.has(card.id) && card.id !== view.inFlightCardId && (index !== 1 || view.holeRevealed));
        elements.dealerTotal.textContent = totalCards.length ? `Toplam: ${handText(totalCards)}` : "Toplam: —";
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
        const activeHand = game.playerHands.find((hand) => hand.id === view.focusHandId)
            || (game.phase === engine.PHASES.PLAYER_TURN ? game.playerHands[game.activeHandIndex] : null);
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
            if (isSettled && hands.length) button.dataset.outcome = hands.every((hand) => hand.payout === 0) ? "loss"
                : hands.every((hand) => hand.outcome === "push") ? "push" : "win";
            else delete button.dataset.outcome;
            renderSpotChips(button, stake);
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
        const activeHand = game.playerHands.find((hand) => hand.id === view.focusHandId)
            || (game.phase === engine.PHASES.PLAYER_TURN ? game.playerHands[game.activeHandIndex] : null);
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
            const newCard = Boolean(view.lastDealtCardId && [...row.querySelectorAll(".blackjack-card")].some((card) => card.dataset.cardId === view.lastDealtCardId));
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
        const arrivedCards = visibleCards.filter((card) => !view.pendingCardIds.has(card.id) && card.id !== view.inFlightCardId);
        const pending = arrivedCards.length !== visibleCards.length;

        panel.className = "blackjack-player-hand";
        panel.dataset.handId = hand.id;
        if (hand.outcome && !pending) panel.dataset.outcome = hand.outcome;
        panel.classList.toggle("is-active", active);
        meta.className = "blackjack-player-hand-meta";
        cards.className = "blackjack-card-row";
        cards.tabIndex = 0;
        cards.setAttribute("role", "group");
        name.textContent = `Yer ${hand.spotIndex + 1}${spotHandCount > 1 ? ` · El ${index + 1}` : ""}`;
        cards.setAttribute("aria-label", `${name.textContent} kartları`);
        total.textContent = arrivedCards.length ? handText(arrivedCards) : "—";
        outcome.textContent = pending ? "Dağıtılıyor" : outcomeLabel(hand, active);
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
        if (busy && (view.inFlightCardId || view.pendingCardIds.size)) return { title: "KART DAĞITILIYOR", tone: "" };
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
        detail.textContent = busy && (view.inFlightCardId || view.pendingCardIds.size) ? "Kartlar masaya geliyor…" : game.message;
    }

    function getActionKicker() {
        if (busy && view.pendingCardIds.size) return "KARTLAR DAĞITILIYOR";
        if (game.phase === engine.PHASES.PLAYER_TURN) {
            const hand = game.playerHands[game.activeHandIndex];
            const visibleCount = view.playerVisible.get(hand.id) ?? hand.cards.length;
            const shown = hand.cards.slice(0, visibleCount).filter((card) => !view.pendingCardIds.has(card.id) && card.id !== view.inFlightCardId);
            return shown.length ? `${hand.spotIndex + 1}. YER · ${handText(shown)}` : "KARTLAR DAĞITILIYOR";
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

    function visualChip(credits) {
        const values = [10000, 1000, 500, 100, 50, 25, 10];
        const value = values.find((amount) => amount <= credits) || 10;
        const source = elements.chips.find((chip) => Number(chip.dataset.blackjackChip) === value);
        const chip = document.createElement("span");
        chip.className = source.className;
        chip.dataset.blackjackChip = String(value);
        chip.innerHTML = source.innerHTML;
        if (credits > 0 && credits < 10) {
            chip.dataset.blackjackChip = String(credits);
            chip.querySelector("strong").textContent = formatCredits(credits * engine.MONEY_SCALE);
        }
        chip.setAttribute("aria-hidden", "true");
        return chip;
    }

    function renderSpotChips(button, stake) {
        if (view.settledSpotChips.has(Number(button.dataset.seat) - 1)) stake = 0;
        const target = button.querySelector(".blackjack-seat-bet");
        const amount = document.createElement("span");
        amount.className = "blackjack-spot-amount";
        amount.textContent = stake ? formatCredits(stake) : "";
        const stack = document.createElement("span");
        stack.className = "blackjack-spot-chips";
        stack.setAttribute("aria-hidden", "true");
        if (stake) {
            const credits = stake / engine.MONEY_SCALE;
            let remaining = credits;
            for (let index = 0; index < 4 && remaining > 0; index += 1) {
                const chip = visualChip(remaining);
                remaining -= Number(chip.dataset.blackjackChip);
                chip.classList.add("blackjack-mini-chip");
                chip.style.setProperty("--chip-level", index);
                stack.append(chip);
            }
        }
        target.replaceChildren(stack, amount);
    }

    function chipRect(box, size = 30) {
        return { left: box.left + box.width / 2 - size / 2, top: box.top + box.height / 2 - size / 2, width: size, height: size };
    }

    async function flyChip(source, spot = selectedSpot, fromOverride = null) {
        const token = actionGeneration;
        const to = chipRect(seats[spot].bet.getBoundingClientRect());
        const from = fromOverride || source.getBoundingClientRect();
        await effects.flyChip(source, from, to, { hide: false, duration: 280 });
        if (token === actionGeneration && isTableActive()) {
            playSound("chip");
            animateNode(seats[spot].bet, [{ transform: "scale(.96)" }, { transform: "scale(1)" }], 120);
        }
    }

    async function animateStake(units, spot, token = actionGeneration) {
        const node = visualChip(units / engine.MONEY_SCALE);
        const source = elements.chips.find((chip) => chip.dataset.blackjackChip === node.dataset.blackjackChip) || elements.chips[0];
        await effects.flyChip(node, source.getBoundingClientRect(), chipRect(seats[spot].bet.getBoundingClientRect()), { hide: false, duration: 240 });
        if (token === actionGeneration) playSound("chip");
        return token === actionGeneration;
    }

    async function presentPayouts(results, token) {
        for (const result of results) {
            if (token !== actionGeneration || !isTableActive()) return;
            const node = visualChip((result.payout || result.handBet || 10 * engine.MONEY_SCALE) / engine.MONEY_SCALE);
            const spot = chipRect(seats[result.spotIndex].bet.getBoundingClientRect());
            const tray = elements.chips.find((chip) => chip.dataset.blackjackChip === node.dataset.blackjackChip) || elements.chips[0];
            if (!result.payout) {
                playSound("collect");
                await effects.flyChip(node, spot, chipRect(elements.shoe.getBoundingClientRect()), { hide: false, fade: true, duration: 290 });
            } else {
                if (result.outcome !== "push") {
                    playSound("pay");
                    await effects.flyChip(node, chipRect(elements.shoe.getBoundingClientRect()), spot, { hide: false, duration: 220 });
                } else playSound("push");
                if (token !== actionGeneration) return;
                await effects.flyChip(node, spot, chipRect(tray.getBoundingClientRect(), 40), { hide: false, duration: 280 });
            }
            if (token !== actionGeneration) return;
            if (!results.slice(results.indexOf(result) + 1).some((next) => next.spotIndex === result.spotIndex)) {
                view.settledSpotChips.add(result.spotIndex);
                renderSpotChips(seats[result.spotIndex].button, 0);
            }
        }
    }

    function render() {
        app.dataset.phase = game.phase;
        elements.balance.textContent = formatCredits(walletBridge.balance() * engine.MONEY_SCALE);
        const handsBySpot = Array.from({ length: engine.MAX_SPOTS }, () => []);
        game.playerHands.forEach((hand) => handsBySpot[hand.spotIndex].push(hand));
        renderSeats(handsBySpot);
        renderDealer();
        renderPlayerHands(handsBySpot);
        renderStatus();
        renderControls();
        elements.shoe.classList.toggle("is-shuffling", Boolean(busy && game.phase === engine.PHASES.DEALING && game.round?.reshuffled));
        renderAudioControls();
    }

    function renderAudioControls() {
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
        if (!soundEnabled || !isTableActive()) return;
        audio.play(({ click: 'tap', loss: 'bust' })[kind] || kind);
    }

    async function revealDealerCard() {
        if (view.holeRevealed || !game.dealerHand[1]) return;
        const token = actionGeneration;
        const node = elements.dealerCards.querySelector('.blackjack-card.is-hidden');
        if (!node) return;
        const card = game.dealerHand[1];
        node.querySelector('.blackjack-card-front').innerHTML = window.OmniBlackjackCards.svg(card);
        node.setAttribute('aria-label', cardLabel(card));
        node.dataset.cardId = card.id;
        node.classList.add('is-revealed');
        playSound('flip');
        await animateNode(node.querySelector('.blackjack-card-inner'), [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], 340);
        if (token !== actionGeneration) return;
        view.holeRevealed = true;
        render();
    }

    async function completeRound() {
        const token = actionGeneration;
        const result = await commitAction((state) => engine.resolveRound(state));
        if (!result || token !== actionGeneration) return;
        view.holeRevealed = true;
        view.focusHandId = null;
        render();
        const net = result.results.reduce((sum, hand) => sum + hand.payout, 0)
            + (game.round?.insuranceWon ? game.insuranceBet * 3 : 0) - engine.totalBet(game);
        showBalanceDelta(net);
        if (result.results.some((item) => item.outcome === 'blackjack')) playSound('blackjack');
        else if (result.results.some((item) => ['win', 'dealer-bust'].includes(item.outcome))) playSound('win');
        else if (result.results.every((item) => item.outcome === 'push')) playSound('push');
        else playSound('bust');
        const pulses = [...elements.playerHands.querySelectorAll('.blackjack-player-hand')].map((node) => animateNode(node,
            [{ filter: 'brightness(1)' }, { filter: 'brightness(1.12)', offset: .4 }, { filter: 'brightness(1)' }], 320));
        await Promise.all([presentPayouts(result.results.map((entry) => ({ ...entry, handBet: game.playerHands.find((hand) => hand.id === entry.handId)?.bet })), token), ...pulses]);
    }

    async function runDealerTurn() {
        const token = actionGeneration;
        if (!isTableActive()) return;
        busy = true;
        render();
        await delay(240);
        if (token !== actionGeneration) return;
        await revealDealerCard();
        if (token !== actionGeneration) return;
        const dealerCards = await commitAction((state) => state.phase === engine.PHASES.DEALER_TURN ? engine.dealerPlay(state) : null);
        if (!dealerCards) return;
        dealerCards.forEach((card) => view.pendingCardIds.add(card.id));
        render();
        for (const card of dealerCards) {
            await delay(180);
            if (!await deliverCard(card, { token })) return;
        }
        await delay(120);
        if (token !== actionGeneration) return;
        await completeRound();
        if (token !== actionGeneration) return;
        busy = false;
        render();
    }

    async function resolveNaturalRound() {
        const token = actionGeneration;
        busy = true;
        await delay(180);
        if (token !== actionGeneration) return;
        await revealDealerCard();
        if (token !== actionGeneration) return;
        await completeRound();
        if (token !== actionGeneration) return;
        busy = false;
        render();
    }

    async function beginDeal() {
        syncWallet();
        if (!canDeal() || !isTableActive()) return;
        const token = actionGeneration;
        busy = true;
        audio.unlock();
        effects.cancel();
        const deal = await commitAction((state) => engine.beginRound(state), (state) => state.currentBet);
        if (!deal || token !== actionGeneration) return;
        view = createViewState();
        if (deal.reshuffled) { playSound('shuffle'); await delay(240); }
        if (token !== actionGeneration || !await presentInitialDeal(deal.sequence, token)) return;
        const decision = await commitAction((state) => engine.afterInitialDeal(state));
        if (!decision) return;
        if (['player-turn', 'insurance'].includes(decision.type)) { busy = false; render(); }
        else await resolveNaturalRound();
    }

    async function decideInsurance(accept) {
        if (busy || game.phase !== engine.PHASES.INSURANCE || !isTableActive()) return;
        const token = actionGeneration;
        const amount = Math.floor(game.currentBet / 2);
        busy = true;
        const decision = await commitAction((state) => accept ? engine.takeInsurance(state) : engine.declineInsurance(state),
            (state) => accept ? Math.floor(state.currentBet / 2) : 0);
        if (!decision) return;
        render();
        if (accept) {
            const chip = visualChip(amount / engine.MONEY_SCALE);
            playSound('chip');
            await effects.flyChip(chip, elements.chips[0].getBoundingClientRect(), chipRect(elements.shoe.getBoundingClientRect()), { hide: false, duration: 220 });
            if (token !== actionGeneration) return;
            if (decision.insuranceWon) {
                playSound('pay');
                await effects.flyChip(chip, chipRect(elements.shoe.getBoundingClientRect()), chipRect(elements.chips[0].getBoundingClientRect()), { hide: false, duration: 240 });
            }
        }
        if (token !== actionGeneration) return;
        if (decision.type === 'player-turn') { busy = false; render(); }
        else await resolveNaturalRound();
    }

    async function takeHit() {
        if (busy || !isTableActive()) return;
        const token = actionGeneration;
        const handId = game.playerHands[game.activeHandIndex]?.id;
        const before = snapshotCardRects();
        busy = true;
        const result = await commitAction((state) => engine.hit(state));
        if (!result) return;
        view.focusHandId = handId;
        view.pendingCardIds.add(result.card.id);
        view.lastDealtCardId = result.card.id;
        render();
        await effects.layoutFLIP(before, snapshotCardRects(), { duration: 150 });
        if (token !== actionGeneration || !await deliverCard(result.card, { token })) return;
        if (result.bust) {
            playSound('bust');
            const hand = [...elements.playerHands.querySelectorAll('.blackjack-player-hand')].find((node) => node.dataset.handId === handId);
            await animateNode(hand, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)', offset: .3 }, { transform: 'translateX(3px)', offset: .6 }, { transform: 'translateX(0)' }], 210);
        }
        if (token !== actionGeneration) return;
        view.focusHandId = null;
        view.lastDealtCardId = '';
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else { busy = false; render(); }
    }

    async function takeStand() {
        if (busy || !isTableActive()) return;
        const token = actionGeneration;
        const handId = game.playerHands[game.activeHandIndex]?.id;
        busy = true;
        const result = await commitAction((state) => engine.stand(state));
        if (!result) return;
        render();
        playSound('tap');
        const node = [...elements.playerHands.querySelectorAll('.blackjack-player-hand')].find((item) => item.dataset.handId === handId);
        await animateNode(node, [{ opacity: 1 }, { opacity: .8 }, { opacity: 1 }], 140);
        if (token !== actionGeneration) return;
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else { busy = false; render(); }
    }

    async function takeDouble() {
        if (busy || !isTableActive()) return;
        const token = actionGeneration;
        const hand = game.playerHands[game.activeHandIndex];
        const before = snapshotCardRects();
        const stake = hand?.bet;
        const spot = hand?.spotIndex;
        const handId = hand?.id;
        busy = true;
        const result = await commitAction((state) => engine.doubleDown(state), (state) => state.playerHands[state.activeHandIndex]?.bet || 0);
        if (!result) return;
        view.focusHandId = handId;
        view.pendingCardIds.add(result.card.id);
        view.lastDealtCardId = result.card.id;
        render();
        await animateStake(stake, spot, token);
        if (token !== actionGeneration) return;
        await effects.layoutFLIP(before, snapshotCardRects(), { duration: 150 });
        if (!await deliverCard(result.card, { token })) return;
        if (result.bust) playSound('bust');
        view.focusHandId = null;
        view.lastDealtCardId = '';
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else { busy = false; render(); }
    }

    async function takeSplit() {
        if (busy || !isTableActive()) return;
        const token = actionGeneration;
        const before = snapshotCardRects();
        const stake = game.playerHands[game.activeHandIndex]?.bet;
        const spot = game.playerHands[game.activeHandIndex]?.spotIndex;
        busy = true;
        const result = await commitAction((state) => engine.split(state), (state) => state.playerHands[state.activeHandIndex]?.bet || 0);
        if (!result) return;
        result.cards.forEach((card) => view.pendingCardIds.add(card.id));
        render();
        await animateStake(stake, spot, token);
        if (token !== actionGeneration) return;
        await effects.layoutFLIP(before, snapshotCardRects(), { duration: 260 });
        for (const card of result.cards) {
            if (!await deliverCard(card, { token })) return;
            await delay(60);
            if (token !== actionGeneration) return;
        }
        if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else { busy = false; render(); }
    }

    async function resetToBetting() {
        if (busy || !isTableActive()) return;
        const token = actionGeneration;
        busy = true;
        renderControls();
        playSound('collect');
        const destination = chipRect(elements.dealerCards.getBoundingClientRect(), 38);
        await Promise.all([...app.querySelectorAll('.blackjack-card')].map((node, index) => effects.flyCard(node, node.getBoundingClientRect(), destination,
            { duration: 180, delay: Math.min(index, 10) * 12, fade: true })));
        if (token !== actionGeneration) return;
        if (!await commitAction((state) => engine.prepareNextRound(state))) return;
        busy = false;
        view = createViewState();
        render();
        seats[selectedSpot].button.focus({ preventScroll: true });
    }

    async function resumeSavedGame() {
        if (busy || walletBridge.isPending() || !isTableActive()) return;
        const token = actionGeneration;
        if (game.phase === engine.PHASES.DEALING) {
            busy = true;
            if (!await presentInitialDeal(initialDealSequence(), token)) return;
            const decision = await commitAction((state) => engine.afterInitialDeal(state));
            if (!decision) return;
            if (['player-turn', 'insurance'].includes(decision.type)) { busy = false; render(); }
            else await resolveNaturalRound();
        } else if (game.phase === engine.PHASES.DEALER_TURN) await runDealerTurn();
        else if (game.phase === engine.PHASES.RESOLVING) {
            busy = true;
            game.dealerHand.slice(2).forEach((card) => view.pendingCardIds.add(card.id));
            render();
            await revealDealerCard();
            if (token !== actionGeneration) return;
            for (const card of game.dealerHand.slice(2)) if (!await deliverCard(card, { token })) return;
            await completeRound();
            if (token !== actionGeneration) return;
            busy = false;
            render();
        }
    }

    async function handleChipClick(event) {
        if (event.detail > 0 && suppressChipClick) { suppressChipClick = false; return; }
        await placeBet(Number(event.currentTarget.dataset.blackjackChip), selectedSpot, event.currentTarget);
    }

    async function clearBet() {
        if (busy) return;
        busy = true;
        if (!await commitAction((state) => engine.clearBet(state, selectedSpot))) return;
        busy = false;
        game.message = `${selectedSpot + 1}. yerin bahsi temizlendi.`;
        saveState();
        render();
        playSound("click");
    }

    async function repeatBet() {
        if (busy) return;
        busy = true;
        if (!await commitAction((state) => engine.repeatBet(state))) return;
        busy = false;
        if (!game.spotBets[selectedSpot]) selectedSpot = game.spotBets.findIndex(Boolean);
        game.message = "Önceki turun başlangıç bahisleri geri kondu.";
        saveState();
        render();
        playSound("chip");
    }

    async function placeBet(credits, spot, source, from = null) {
        if (busy || !isTableActive() || game.phase !== engine.PHASES.BETTING || !Number.isInteger(spot) || spot < 0 || spot >= engine.MAX_SPOTS) return false;
        audio.unlock();
        busy = true;
        selectedSpot = spot;
        if (!await commitAction((state) => engine.addBet(state, credits * engine.MONEY_SCALE, spot))) return false;
        busy = false;
        game.message = `${spot + 1}. yere ${formatCredits(game.spotBets[spot])} kredi koydun.`;
        saveState();
        render();
        playSound("tap");
        flyChip(source, spot, from);
        return true;
    }

    function dropSpot(x, y) {
        const button = document.elementFromPoint(x, y)?.closest(".blackjack-seat");
        return button && elements.seats.contains(button) && !button.disabled ? Number(button.dataset.seat) - 1 : null;
    }

    function cancelChipDrag() {
        if (!drag) return;
        const current = drag;
        drag = null;
        if (current.frame) window.cancelAnimationFrame(current.frame);
        current.ghost?.remove();
        current.source.classList.remove("is-dragging");
        seats.forEach(({ button }) => button.classList.remove("is-drag-over"));
        if (current.source.hasPointerCapture?.(current.pointerId)) current.source.releasePointerCapture(current.pointerId);
    }

    function previewChipDrag() {
        if (!drag?.ghost) return;
        const spot = dropSpot(drag.x, drag.y);
        seats.forEach(({ button }, index) => button.classList.toggle("is-drag-over", index === spot));
    }

    function scrollChipDrag() {
        if (!drag?.ghost) return;
        drag.frame = 0;
        const edge = 65;
        const movement = drag.y < edge ? -Math.min(15, (edge - drag.y) / 4)
            : drag.y > window.innerHeight - edge ? Math.min(15, (drag.y - window.innerHeight + edge) / 4) : 0;
        if (!movement) return;
        const before = window.scrollY;
        window.scrollBy({ top: movement, behavior: "instant" });
        previewChipDrag();
        if (window.scrollY !== before) drag.frame = window.requestAnimationFrame(scrollChipDrag);
    }

    function startChipDrag(event) {
        const source = event.currentTarget;
        if (busy || source.disabled || drag || event.isPrimary === false || event.button !== 0 || game.phase !== engine.PHASES.BETTING || !isTableActive()) return;
        const box = source.getBoundingClientRect();
        suppressChipClick = false;
        drag = { source, pointerId: event.pointerId, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY,
            x: event.clientX, y: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top, box, frame: 0, ghost: null };
        source.setPointerCapture(event.pointerId);
        audio.unlock();
    }

    function moveChipDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (!drag.ghost) {
            const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
            if (Math.hypot(dx, dy) < 7) return;
            // Horizontal swipes on touch devices keep scrolling the chip tray naturally.
            if (drag.pointerType === "touch" && Math.abs(dx) > Math.abs(dy) * 1.3) { cancelChipDrag(); return; }
            drag.ghost = drag.source.cloneNode(true);
            drag.ghost.removeAttribute("id");
            drag.ghost.classList.add("blackjack-chip-ghost");
            drag.ghost.setAttribute("aria-hidden", "true");
            drag.ghost.tabIndex = -1;
            Object.assign(drag.ghost.style, { position: "fixed", left: "0", top: "0", width: `${drag.box.width}px`, height: `${drag.box.height}px`, pointerEvents: "none", zIndex: "10001", margin: "0" });
            document.body.append(drag.ghost);
            drag.source.classList.add("is-dragging");
        }
        event.preventDefault();
        drag.ghost.style.transform = `translate3d(${event.clientX - drag.offsetX}px,${event.clientY - drag.offsetY}px,0)`;
        previewChipDrag();
        if (!drag.frame) drag.frame = window.requestAnimationFrame(scrollChipDrag);
    }

    function finishChipDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const current = drag;
        const spot = dropSpot(event.clientX, event.clientY);
        const from = current.ghost?.getBoundingClientRect();
        suppressChipClick = Boolean(current.ghost);
        cancelChipDrag();
        if (from && spot !== null) placeBet(Number(current.source.dataset.blackjackChip), spot, current.source, from);
    }

    let lastActive = isTableActive();
    function syncPresentationActivity(force = false) {
        const active = isTableActive();
        audio.setActive(active);
        if (!force && active === lastActive) return;
        lastActive = active;
        actionGeneration += 1;
        cancelPresentation();
        busy = false;
        view = createViewState();
        render();
        if (active) scheduleResume();
    }

    function bindEvents() {
        elements.chips.forEach((chip) => {
            chip.addEventListener("click", handleChipClick);
            chip.style.touchAction = "pan-x";
            chip.addEventListener("pointerdown", startChipDrag);
            for (const name of ["pointercancel", "lostpointercapture"]) chip.addEventListener(name, (event) => {
                if (drag?.pointerId === event.pointerId) cancelChipDrag();
            });
        });
        document.addEventListener("pointermove", moveChipDrag, { passive: false });
        document.addEventListener("pointerup", finishChipDrag);
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
            audio.unlock();
            audio.setMuted(!soundEnabled);
            saveState();
            renderAudioControls();
            if (soundEnabled) playSound("click");
        });
        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("visibilitychange", () => syncPresentationActivity());
        new MutationObserver(() => syncPresentationActivity()).observe(panel, { attributes: true, attributeFilter: ["class"] });
        window.addEventListener("resize", () => syncPresentationActivity(true));
        window.addEventListener("pagehide", () => {
            lastActive = false;
            actionGeneration += 1;
            cancelPresentation();
            busy = false;
            audio.setActive(false);
        });
        window.addEventListener("pageshow", () => syncPresentationActivity());
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

    bindEvents();
    wallet.subscribe(syncWallet);
    render();
    audio.setActive(isTableActive());
    scheduleResume();
})();
