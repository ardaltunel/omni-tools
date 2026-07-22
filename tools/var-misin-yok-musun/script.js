(function () {
    "use strict";

    const engine = window.OmniDealEngine;
    const audio = window.OmniDealAudio;
    const app = document.getElementById("deal-app");
    if (!engine || !audio || !app) return;

    const SAVE_KEY = "omni-deal-active-v1";
    const STATS_KEY = "omni-deal-stats-v1";
    const SETTINGS_KEY = "omni-deal-settings-v1";
    const HIGH_VALUE = engine.HIGH_VALUE_THRESHOLD;
    const DEFAULT_STATS = {
        games: 0,
        highestWin: 0,
        biggestOffer: 0,
        totalOffers: 0,
        offerCount: 0,
        rejections: 0,
        acceptances: 0,
        highestCase: 0,
    };
    const DEFAULT_SETTINGS = {
        sound: true,
        animations: true,
        speed: "normal",
        theme: "stage",
    };

    const element = (id) => document.getElementById(id);
    const elements = Object.fromEntries([
        "home-screen", "game-screen", "result-screen", "start", "resume", "sound", "help",
        "round", "to-open", "remaining", "last-offer", "phase-label", "instruction", "owned-station", "owned-case",
        "case-grid", "values-low", "values-medium", "values-high", "reveal", "reveal-case", "reveal-value", "live",
        "offer-modal", "offer-amount", "offer-mean", "offer-median", "offer-risk", "offer-high", "accept", "reject",
        "final-modal", "final-cases", "swap", "keep", "info-modal", "info-title", "info-close", "help-content",
        "result-kicker", "result-title", "result-message",
        "result-win", "result-own", "result-best-offer", "replay", "result-home", "confetti",
    ].map((name) => [name, element(`deal-${name}`)]));

    const screens = [elements["home-screen"], elements["game-screen"], elements["result-screen"]];
    let state = null;
    let locked = false;
    let animationToken = 0;
    let modalReturnFocus = null;
    let settings = loadObject(SETTINGS_KEY, DEFAULT_SETTINGS);
    let stats = loadObject(STATS_KEY, DEFAULT_STATS);

    initialize();

    function initialize() {
        settings = normalizeSettings(settings);
        stats = normalizeStats(stats);
        renderMoneyBoards();
        applySettings();
        bindEvents();
        updateResumeButton();
        showScreen("home");
    }

    function bindEvents() {
        elements.start.addEventListener("click", startNewGame);
        elements.resume.addEventListener("click", resumeSavedGame);
        elements.sound.addEventListener("click", toggleSound);
        elements.help.addEventListener("click", openInfo);
        elements["info-close"].addEventListener("click", closeInfo);
        document.querySelectorAll("[data-deal-close]").forEach((node) => node.addEventListener("click", closeInfo));
        elements.accept.addEventListener("click", acceptBankOffer);
        elements.reject.addEventListener("click", rejectBankOffer);
        elements.swap.addEventListener("click", () => beginFinal(true));
        elements.keep.addEventListener("click", () => beginFinal(false));
        elements.replay.addEventListener("click", startNewGame);
        elements["result-home"].addEventListener("click", returnToGameHome);
        app.addEventListener("click", handleAppClickSound);
        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("tool-activated", handleToolActivated);
        window.addEventListener("beforeunload", saveActiveGame);
    }

    function handleToolActivated(event) {
        if (event.detail?.tool !== "deal-game") return;
        updateResumeButton();
        focusPanelOnMobile();
    }

    function focusPanelOnMobile() {
        if (!window.matchMedia("(max-width: 900px)").matches) return;
        const behavior = prefersReducedMotion() ? "auto" : "smooth";
        window.requestAnimationFrame(() => element("deal-game").scrollIntoView({ behavior, block: "start" }));
    }

    function startNewGame() {
        cancelPendingAnimations();
        closeAllGameModals();
        clearConfetti();
        state = engine.createGame();
        locked = false;
        audio.effects.start();
        showScreen("game");
        renderGame();
        saveActiveGame();
        window.requestAnimationFrame(() => elements["case-grid"].querySelector("button")?.focus());
    }

    function resumeSavedGame() {
        const saved = readActiveGame();
        if (!saved) {
            updateResumeButton();
            startNewGame();
            return;
        }

        cancelPendingAnimations();
        state = saved;
        locked = false;
        showScreen("game");
        renderGame();
        if (state.phase === "bank" && state.currentOffer) showOfferModal(state.currentOffer, false);
        if (state.phase === "final-choice") showFinalChoice();
    }

    function returnToGameHome() {
        cancelPendingAnimations();
        closeAllGameModals();
        clearConfetti();
        state = null;
        locked = false;
        clearActiveGame();
        updateResumeButton();
        showScreen("home");
        elements.start.focus();
    }

    function showScreen(name) {
        const selected = elements[`${name}-screen`];
        screens.forEach((screen) => {
            screen.hidden = screen !== selected;
        });
    }

    function renderGame() {
        if (!state) return;
        showScreen("game");
        renderCases();
        renderMoneyBoards();
        renderOwnedCase();

        const remainingCount = engine.getRemainingCases(state).length;
        elements.round.textContent = String(Math.min(state.roundIndex + 1, engine.ROUND_SCHEDULE.length));
        elements["to-open"].textContent = state.phase === "selecting" ? "Kasa seç" : `${state.boxesToOpen} kasa`;
        elements.remaining.textContent = `${remainingCount} kasa`;
        elements["last-offer"].textContent = state.offers.length ? formatMoney(state.offers[state.offers.length - 1].amount) : "-";

        if (state.phase === "selecting") {
            elements["phase-label"].textContent = "Başlangıç";
            elements.instruction.textContent = "Kendi kasanı seç";
        } else if (state.phase === "opening") {
            elements["phase-label"].textContent = `${state.roundIndex + 1}. Tur`;
            elements.instruction.textContent = `Bu tur ${state.boxesToOpen} kasa daha aç`;
        } else if (state.phase === "bank") {
            elements["phase-label"].textContent = "Banka";
            elements.instruction.textContent = "Banka teklifini değerlendir";
        } else {
            elements["phase-label"].textContent = "Final";
            elements.instruction.textContent = "Son iki kasadan birine güven";
        }
    }

    function renderCases() {
        const fragment = document.createDocumentFragment();
        state.cases.forEach((caseItem) => {
            if (state.ownCaseId && caseItem.id === state.ownCaseId) return;
            const button = document.createElement("button");
            const face = document.createElement("span");
            const meta = document.createElement("span");
            const number = document.createElement("strong");

            button.type = "button";
            button.className = "deal-case";
            button.dataset.caseId = String(caseItem.id);
            face.className = "deal-case-face";
            meta.className = "deal-case-meta";
            meta.textContent = `Kasa ${caseItem.id}`;
            number.className = "deal-case-number";
            number.textContent = String(caseItem.id);

            if (caseItem.status === "opened") {
                const prize = document.createElement("span");
                const value = document.createElement("strong");
                const unit = document.createElement("span");
                prize.className = "deal-case-prize";
                value.className = "deal-case-value";
                unit.className = "deal-case-unit";
                value.textContent = Math.round(caseItem.value).toLocaleString("tr-TR");
                unit.textContent = "TL";
                prize.append(value, unit);
                face.append(meta, prize);
                button.classList.add("is-opened");
                button.disabled = true;
                button.setAttribute("aria-label", `${caseItem.id} numaralı kasa açıldı, ${formatMoney(caseItem.value)}`);
            } else {
                face.append(meta, number);
                const canSelect = state.phase === "selecting";
                const canOpen = state.phase === "opening" && !locked;
                button.disabled = !(canSelect || canOpen);
                button.setAttribute("aria-label", canSelect
                    ? `${caseItem.id} numaralı kasayı kendi kasan olarak seç`
                    : `${caseItem.id} numaralı kasayı aç`);
                button.addEventListener("click", () => handleCaseClick(caseItem.id, button));
            }
            button.append(face);
            fragment.appendChild(button);
        });
        elements["case-grid"].replaceChildren(fragment);
    }

    function renderOwnedCase() {
        const hasOwnCase = Boolean(state.ownCaseId);
        elements["owned-station"].hidden = !hasOwnCase;
        if (!hasOwnCase) return;

        const face = document.createElement("span");
        const meta = document.createElement("span");
        const number = document.createElement("strong");

        face.className = "deal-case-face";
        meta.className = "deal-case-meta";
        meta.textContent = `Kasa ${state.ownCaseId}`;
        number.className = "deal-case-number";
        number.textContent = String(state.ownCaseId);
        face.append(meta, number);
        elements["owned-case"].replaceChildren(face);
        elements["owned-case"].setAttribute("aria-label", `Senin kasan ${state.ownCaseId} numaralı kasa`);
    }

    function renderMoneyBoards() {
        const openedValues = new Set(state?.openedValues || []);
        renderMoneyList(elements["values-low"], engine.VALUES.slice(0, 12), openedValues);
        renderMoneyList(elements["values-medium"], engine.VALUES.slice(12, 19), openedValues);
        renderMoneyList(elements["values-high"], engine.VALUES.slice(19), openedValues);
    }

    function renderMoneyList(container, values, openedValues) {
        if (!container) return;
        const fragment = document.createDocumentFragment();
        values.forEach((value) => {
            const row = document.createElement("div");
            row.className = "deal-money-value";
            row.textContent = formatMoney(value);
            if (openedValues.has(value)) {
                row.classList.add("is-removed");
                row.setAttribute("aria-label", `${formatMoney(value)} elendi`);
            }
            fragment.appendChild(row);
        });
        container.replaceChildren(fragment);
    }

    async function handleCaseClick(caseId, button) {
        if (!state || locked) return;
        if (state.phase === "selecting") {
            if (!engine.selectOwnCase(state, caseId)) return;
            audio.effects.start();
            announce(`${caseId} numaralı kasa senin kasan oldu.`);
            saveActiveGame();
            renderGame();
            elements["case-grid"].querySelector("button:not(:disabled)")?.focus();
            return;
        }
        if (state.phase !== "opening") return;
        await openSelectedCase(caseId, button);
    }

    async function openSelectedCase(caseId, button) {
        locked = true;
        const token = animationToken;
        button.classList.add("is-opening");
        audio.effects.caseOpen();
        await wait(duration(520, 150));
        if (token !== animationToken || !state) return;

        const value = engine.openCase(state, caseId);
        if (value === null) {
            locked = false;
            renderGame();
            return;
        }

        renderCases();
        renderMoneyBoards();
        showReveal(caseId, value);
        audio.effects.reveal(value >= HIGH_VALUE);
        await wait(duration(1100, 360));
        if (token !== animationToken || !state) return;
        hideReveal();
        locked = false;
        renderGame();
        saveActiveGame();

        if (state.boxesToOpen > 0) return;
        if (engine.getRemainingCases(state).length <= 2) {
            state.phase = "final-choice";
            saveActiveGame();
            renderGame();
            await wait(duration(520, 160));
            if (token === animationToken) showFinalChoice();
            return;
        }
        await startBankCall(token);
    }

    function showReveal(caseId, value) {
        elements["reveal-case"].textContent = `${caseId} Numaralı Kasa`;
        elements["reveal-value"].textContent = formatMoney(value);
        elements.reveal.classList.toggle("is-high", value >= HIGH_VALUE);
        elements.reveal.hidden = false;
        announce(`${caseId} numaralı kasadan ${formatMoney(value)} çıktı.`);
    }

    function hideReveal() {
        elements.reveal.hidden = true;
        elements.reveal.classList.remove("is-high", "is-final");
    }

    async function startBankCall(token) {
        locked = true;
        elements["game-screen"].classList.add("is-bank-call");
        elements["phase-label"].textContent = "Banka";
        elements.instruction.textContent = "Banka arıyor...";
        audio.effects.phone();
        await wait(duration(1450, 430));
        if (token !== animationToken || !state) return;

        const offer = engine.calculateOffer(state);
        recordOffer(offer.amount);
        saveActiveGame();
        elements["game-screen"].classList.remove("is-bank-call");
        locked = false;
        renderGame();
        showOfferModal(offer, true);
    }

    function showOfferModal(offer, focusButton) {
        elements["offer-amount"].textContent = formatMoney(offer.amount);
        elements["offer-mean"].textContent = formatMoney(offer.mean);
        elements["offer-median"].textContent = formatMoney(offer.median);
        elements["offer-risk"].textContent = offer.riskLevel;
        elements["offer-high"].textContent = `%${offer.highValueChance}`;
        openModal(elements["offer-modal"], focusButton ? elements.accept : null);
        announce(`Banka teklifi ${formatMoney(offer.amount)}.`);
    }

    async function acceptBankOffer() {
        if (!state || state.phase !== "bank" || locked) return;
        locked = true;
        closeModal(elements["offer-modal"]);
        audio.effects.accept();
        const result = engine.acceptOffer(state);
        if (!result) return;
        const token = animationToken;
        showReveal(state.ownCaseId, result.ownValue);
        elements.reveal.classList.add("is-final");
        await wait(duration(1350, 420));
        if (token !== animationToken) return;
        hideReveal();
        completeGame({
            accepted: true,
            winnings: result.winnings,
            ownValue: result.ownValue,
            otherValue: null,
        });
    }

    function rejectBankOffer() {
        if (!state || state.phase !== "bank" || locked) return;
        closeModal(elements["offer-modal"]);
        stats.rejections += 1;
        saveStats();
        audio.effects.reject();
        engine.rejectOffer(state);
        saveActiveGame();
        renderGame();
        announce("Banka teklifi reddedildi. Oyun devam ediyor.");
        elements["case-grid"].querySelector("button:not(:disabled)")?.focus();
    }

    function showFinalChoice() {
        if (!state) return;
        const remaining = engine.getRemainingCases(state);
        const fragment = document.createDocumentFragment();
        remaining.forEach((item) => {
            const box = document.createElement("div");
            box.className = "deal-final-case";
            if (item.id === state.ownCaseId) box.classList.add("is-owned");
            const label = document.createElement("span");
            const number = document.createElement("strong");
            label.textContent = item.id === state.ownCaseId ? "Senin kasan" : "Diğer kasa";
            number.textContent = String(item.id);
            box.append(label, number);
            fragment.appendChild(box);
        });
        elements["final-cases"].replaceChildren(fragment);
        audio.effects.dramatic();
        openModal(elements["final-modal"], elements.keep);
        announce("Son iki kasa kaldı. Kasanı değiştirebilir veya koruyabilirsin.");
    }

    async function beginFinal(shouldSwap) {
        if (!state || state.phase !== "final-choice" || locked) return;
        locked = true;
        if (shouldSwap) engine.swapOwnCase(state);
        closeModal(elements["final-modal"]);
        renderGame();
        audio.effects.dramatic();
        const token = animationToken;
        await wait(duration(1850, 480));
        if (token !== animationToken || !state) return;

        const result = engine.finishFinal(state);
        if (!result) return;
        showReveal(result.ownCaseId, result.ownValue);
        elements.reveal.classList.add("is-final");
        audio.effects.reveal(result.ownValue >= HIGH_VALUE);
        await wait(duration(1450, 430));
        if (token !== animationToken) return;
        hideReveal();
        completeGame({ ...result, accepted: false });
    }

    function completeGame(result) {
        locked = false;
        state.phase = "finished";
        clearActiveGame();
        stats.games += 1;
        stats.highestWin = Math.max(stats.highestWin, result.winnings);
        stats.highestCase = Math.max(stats.highestCase, result.ownValue);
        if (result.accepted) stats.acceptances += 1;
        saveStats();

        const bestOffer = Math.max(0, ...state.offers.map((offer) => offer.amount));
        elements["result-kicker"].textContent = result.accepted ? "Banka ile anlaştın" : "Final kasası açıldı";
        elements["result-title"].textContent = result.accepted ? "VARIM dedin" : "Kazancın belli oldu";
        elements["result-message"].textContent = result.accepted
            ? `Kasanda ${formatMoney(result.ownValue)} vardı. Bankadan ${formatMoney(result.winnings)} aldın.`
            : `Kasandan ${formatMoney(result.ownValue)} çıktı.${result.otherValue !== null ? ` Diğer kasada ${formatMoney(result.otherValue)} vardı.` : ""}`;
        elements["result-win"].textContent = formatMoney(result.winnings);
        elements["result-own"].textContent = formatMoney(result.ownValue);
        elements["result-best-offer"].textContent = formatMoney(bestOffer);
        showScreen("result");
        audio.effects.win();
        launchConfetti();
        announce(`Oyun tamamlandı. Kazancın ${formatMoney(result.winnings)}.`);
        elements.replay.focus();
    }

    function recordOffer(amount) {
        stats.offerCount += 1;
        stats.totalOffers += amount;
        stats.biggestOffer = Math.max(stats.biggestOffer, amount);
        saveStats();
    }

    function openInfo() {
        elements["info-title"].textContent = "Nasıl Oynanır?";
        elements["help-content"].hidden = false;
        openModal(elements["info-modal"], elements["info-close"]);
    }

    function closeInfo() {
        closeModal(elements["info-modal"]);
    }

    function openModal(modal, focusTarget) {
        modalReturnFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add("deal-modal-open");
        window.requestAnimationFrame(() => focusTarget?.focus());
    }

    function closeModal(modal) {
        modal.hidden = true;
        if (![elements["offer-modal"], elements["final-modal"], elements["info-modal"]].some((item) => !item.hidden)) {
            document.body.classList.remove("deal-modal-open");
        }
        const returnFocus = modalReturnFocus;
        modalReturnFocus = null;
        if (returnFocus instanceof HTMLElement && returnFocus.isConnected && !returnFocus.closest("[hidden]")) returnFocus.focus();
    }

    function closeAllGameModals() {
        [elements["offer-modal"], elements["final-modal"], elements["info-modal"]].forEach((modal) => {
            modal.hidden = true;
        });
        document.body.classList.remove("deal-modal-open");
        modalReturnFocus = null;
        hideReveal();
    }

    function toggleSound() {
        settings.sound = !settings.sound;
        saveSettings();
        applySettings();
        if (settings.sound) audio.effects.button();
    }

    function applySettings() {
        audio.setEnabled(settings.sound);
        app.dataset.theme = "stage";
        app.classList.remove("animations-off");
        elements.sound.setAttribute("aria-pressed", String(settings.sound));
        elements.sound.setAttribute("aria-label", settings.sound ? "Oyun seslerini kapat" : "Oyun seslerini aç");
        elements.sound.lastElementChild.textContent = settings.sound ? "Ses Açık" : "Ses Kapalı";
    }

    function launchConfetti() {
        clearConfetti();
        if (!settings.animations || prefersReducedMotion()) return;
        const fragment = document.createDocumentFragment();
        const colors = ["var(--accent)", "var(--accent-2)", "var(--success)", "var(--text)"];
        for (let index = 0; index < 44; index += 1) {
            const particle = document.createElement("span");
            particle.style.setProperty("--deal-x", `${(Math.random() * 180) - 90}px`);
            particle.style.setProperty("--deal-delay", `${Math.random() * 0.45}s`);
            particle.style.setProperty("--deal-rotate", `${Math.random() * 540}deg`);
            particle.style.background = colors[index % colors.length];
            fragment.appendChild(particle);
        }
        elements.confetti.appendChild(fragment);
    }

    function clearConfetti() {
        elements.confetti.replaceChildren();
    }

    function handleAppClickSound(event) {
        const button = event.target.closest("button");
        if (!button || button.disabled || button.classList.contains("deal-case")) return;
        if (button !== elements.sound) audio.effects.button();
    }

    function handleKeyboard(event) {
        const activePanel = document.querySelector(".tool-panel.active");
        if (activePanel?.id !== "deal-game") return;
        const target = event.target;
        const editable = target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

        if (event.key === "Escape" && !elements["info-modal"].hidden) {
            event.preventDefault();
            closeInfo();
            return;
        }
        if (editable) return;
        if (!elements["offer-modal"].hidden) {
            if (event.key.toLocaleLowerCase("tr-TR") === "v") {
                event.preventDefault();
                acceptBankOffer();
            } else if (event.key.toLocaleLowerCase("tr-TR") === "y") {
                event.preventDefault();
                rejectBankOffer();
            } else if (event.key === "Tab") {
                trapFocus(event, elements["offer-modal"]);
            }
            return;
        }
        if (!elements["final-modal"].hidden && event.key === "Tab") {
            trapFocus(event, elements["final-modal"]);
            return;
        }
        if (!elements["info-modal"].hidden && event.key === "Tab") {
            trapFocus(event, elements["info-modal"]);
            return;
        }
        if (event.key.toLocaleLowerCase("tr-TR") === "s") {
            event.preventDefault();
            toggleSound();
            return;
        }
        if (target instanceof HTMLElement && target.classList.contains("deal-case") && event.key.startsWith("Arrow")) {
            event.preventDefault();
            moveCaseFocus(target, event.key);
        }
    }

    function moveCaseFocus(current, key) {
        const buttons = Array.from(elements["case-grid"].querySelectorAll(".deal-case:not(:disabled)"));
        const currentIndex = buttons.indexOf(current);
        if (currentIndex < 0 || !buttons.length) return;
        const rowSize = window.matchMedia("(max-width: 520px)").matches ? 3 : window.matchMedia("(max-width: 900px)").matches ? 4 : 6;
        const deltaMap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -rowSize, ArrowDown: rowSize };
        const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + deltaMap[key]));
        buttons[nextIndex]?.focus();
    }

    function trapFocus(event, modal) {
        const focusable = Array.from(modal.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function updateResumeButton() {
        elements.resume.hidden = !readActiveGame();
    }

    function saveActiveGame() {
        if (!state || state.phase === "finished") return;
        safeStorageSet(SAVE_KEY, state);
        updateResumeButton();
    }

    function readActiveGame() {
        const saved = loadObject(SAVE_KEY, null);
        if (!engine.isValidSavedGame(saved)) {
            if (saved !== null) clearActiveGame();
            return null;
        }
        if (!["selecting", "opening", "bank", "final-choice"].includes(saved.phase)) {
            clearActiveGame();
            return null;
        }
        return saved;
    }

    function clearActiveGame() {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch (_) {
            // The game remains usable when storage is unavailable.
        }
    }

    function saveStats() {
        safeStorageSet(STATS_KEY, stats);
    }

    function saveSettings() {
        safeStorageSet(SETTINGS_KEY, settings);
    }

    function safeStorageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {
            // Storage can be unavailable in strict privacy modes.
        }
    }

    function loadObject(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            if (value) return JSON.parse(value);
            return fallback && typeof fallback === "object" ? { ...fallback } : fallback;
        } catch (_) {
            return fallback ? { ...fallback } : null;
        }
    }

    function normalizeStats(value) {
        return Object.fromEntries(Object.entries(DEFAULT_STATS).map(([key, fallback]) => [
            key,
            Number.isFinite(Number(value?.[key])) && Number(value[key]) >= 0 ? Number(value[key]) : fallback,
        ]));
    }

    function normalizeSettings(value) {
        return {
            sound: typeof value?.sound === "boolean" ? value.sound : DEFAULT_SETTINGS.sound,
            animations: true,
            speed: "normal",
            theme: "stage",
        };
    }

    function cancelPendingAnimations() {
        animationToken += 1;
        locked = false;
    }

    function duration(normal, fast) {
        if (prefersReducedMotion()) return Math.min(40, fast);
        return normal;
    }

    function wait(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function announce(message) {
        elements.live.textContent = "";
        window.requestAnimationFrame(() => {
            elements.live.textContent = message;
        });
    }

    function formatMoney(value) {
        return `${Math.round(Number(value) || 0).toLocaleString("tr-TR")} TL`;
    }
}());
