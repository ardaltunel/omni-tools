(function registerRoulette(initialize) {
    "use strict";

    const panel = document.getElementById("roulette");
    if (!panel || !window.OmniRouletteCore || !window.OmniRouletteWheel
        || !window.OmniRouletteLayout || !window.OmniRouletteAudio) return;
    if (panel.classList.contains("active")) {
        initialize(panel, window.OmniRouletteCore);
        return;
    }
    function onActivation(event) {
        if (event.detail?.tool !== "roulette") return;
        document.removeEventListener("tool-activated", onActivation);
        initialize(panel, window.OmniRouletteCore);
    }
    document.addEventListener("tool-activated", onActivation);
})(function initializeRoulette(panel, core) {
    "use strict";

    const get = (name) => document.getElementById(`roulette-${name}`);
    const app = get("app");
    const table = get("table");
    const chips = get("chips");
    const wagers = get("wagers");
    const status = get("status");
    const storageKey = "omni-roulette-v1";
    const denominations = [1, 5, 25, 50, 100, 500, 1000, 5000, 10000];
    const layout = window.OmniRouletteLayout;
    const colors = { red: "Kırmızı", black: "Siyah", green: "Yeşil" };
    const format = new Intl.NumberFormat("tr-TR");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saved = readSaved();
    const wheel = window.OmniRouletteWheel.create(get("wheel"), { onRelease: spin });
    let state = core.restoreState(saved.game) || core.createState();
    let selectedChip = denominations.includes(saved.chip) ? saved.chip : 25;
    let muted = saved.muted === true;
    let soundVolume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.45;
    const audio = window.OmniRouletteAudio.create({ volume: soundVolume, muted });
    let storageWritable = true;
    let spinToken = 0;
    let drag = null;
    let dragScrollFrame = 0;
    let ignoreChipClick = false;
    let tickTime = 0;
    let currentLayout = null;
    let focusedBet = "straight:0";
    const tableButtons = buildTable();
    buildChips();
    applyTableLayout();
    const tableObserver = new ResizeObserver(applyTableLayout);
    tableObserver.observe(table);

    function readSaved() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            return value && typeof value === "object" ? value : {};
        } catch {
            return {};
        }
    }

    function save() {
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                game: core.serializeState(state), chip: selectedChip, muted, volume: soundVolume,
            }));
        } catch {
            storageWritable = false;
            // Virtual credits remain usable within this session if storage is blocked.
        }
    }

    function adoptSavedGame(restored, snapshot) {
        spinToken += 1;
        audio.stopSpin();
        wheel.cancel();
        cancelDrag();
        state = restored;
        muted = snapshot.muted === true;
        soundVolume = Number.isFinite(snapshot.volume) ? Math.max(0, Math.min(1, snapshot.volume)) : soundVolume;
        audio.setMuted(muted);
        audio.setVolume(soundVolume);
        render();
        if (state.pending) animatePending();
        else {
            if (state.history[0]) wheel.showResult(state.history[0].number);
            status.textContent = "Oyun diğer sekmedeki kayıttan güncellendi.";
        }
    }

    function syncSavedGame() {
        if (!storageWritable) return false;
        const snapshot = readSaved();
        const restored = core.restoreState(snapshot.game);
        if (!restored || JSON.stringify(core.serializeState(restored)) === JSON.stringify(core.serializeState(state))) return false;
        adoptSavedGame(restored, snapshot);
        return true;
    }

    function buildTable() {
        return layout.createLayout("landscape").spots.map((spot) => {
            const button = document.createElement("button");
            const label = document.createElement("span");
            const marker = document.createElement("span");
            button.type = "button";
            button.className = `roulette-table-bet${spot.kind === "junction" ? " roulette-junction" : ""}`;
            button.dataset.betId = spot.id;
            button.dataset.label = spot.label;
            button.dataset.betType = spot.type;
            button.tabIndex = spot.id === focusedBet ? 0 : -1;
            if (spot.color) button.dataset.color = spot.color;
            label.textContent = spot.shortLabel;
            marker.className = "roulette-stake-marker";
            marker.hidden = true;
            marker.setAttribute("aria-hidden", "true");
            button.append(label, marker);
            table.append(button);
            return button;
        });
    }

    function applyTableLayout() {
        const width = table.getBoundingClientRect().width;
        if (!width) return;
        const orientation = width < 600 ? "portrait" : "landscape";
        if (currentLayout?.orientation === orientation) return;
        cancelDrag();
        currentLayout = layout.createLayout(orientation);
        table.dataset.orientation = orientation;
        table.style.aspectRatio = String(currentLayout.aspectRatio);
        const positions = new Map(currentLayout.spots.map((spot) => [spot.id, spot]));
        tableButtons.forEach((button) => {
            const spot = positions.get(button.dataset.betId);
            button.style.left = `${(spot.x - spot.width / 2) / currentLayout.width * 100}%`;
            button.style.top = `${(spot.y - spot.height / 2) / currentLayout.height * 100}%`;
            button.style.width = `${spot.width / currentLayout.width * 100}%`;
            button.style.height = `${spot.height / currentLayout.height * 100}%`;
        });
    }

    function betAtPoint(event) {
        if (!currentLayout) return null;
        const bounds = table.getBoundingClientRect();
        return layout.hitTest(currentLayout,
            (event.clientX - bounds.left) / bounds.width * currentLayout.width,
            (event.clientY - bounds.top) / bounds.height * currentLayout.height)?.id || null;
    }

    function chipLabel(amount) {
        return amount >= 1000 && amount % 1000 === 0 ? `${amount / 1000}K` : format.format(amount);
    }

    function buildChips() {
        denominations.forEach((amount) => {
            const button = document.createElement("button");
            button.className = "roulette-chip";
            button.type = "button";
            button.dataset.rouletteChip = amount;
            button.setAttribute("aria-label", `${amount} kredilik çip`);
            button.title = `${format.format(amount)} sanal kredi`;
            button.textContent = chipLabel(amount);
            chips.append(button);
        });
    }

    function render() {
        const spinning = state.phase === "spinning";
        wheel.setInteractive(!spinning && panel.classList.contains("active") && !document.hidden);
        app.dataset.phase = state.phase;
        get("balance").textContent = format.format(state.balance);
        const latest = state.history[0];
        const repeatedLayout = Object.keys(state.lastBets).length === Object.keys(state.bets).length
            && Object.entries(state.lastBets).every(([id, amount]) => state.bets[id] === amount);
        get("spin").disabled = spinning || !core.totalBet(state);
        get("undo").disabled = spinning || !state.undoStack.length;
        get("clear").disabled = spinning || !core.totalBet(state);
        get("repeat").disabled = spinning || !Object.keys(state.lastBets).length
            || repeatedLayout || Object.values(state.lastBets).reduce((sum, amount) => sum + amount, 0) > state.balance;
        get("double").disabled = spinning || !core.totalBet(state) || core.totalBet(state) * 2 > state.balance;
        get("refill").hidden = spinning || state.balance >= 1;
        updateSoundControls();
        chips.querySelectorAll(".roulette-chip").forEach((button) => {
            const amount = Number(button.dataset.rouletteChip);
            const selected = amount === selectedChip;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(selected));
            button.disabled = spinning;
        });
        const activeBets = state.pending?.bets || state.bets;
        tableButtons.forEach((button) => {
            const id = button.dataset.betId;
            const bet = core.getBet(id);
            const amount = activeBets[id] || 0;
            const marker = button.querySelector(".roulette-stake-marker");
            button.disabled = spinning;
            marker.hidden = !amount;
            marker.textContent = chipLabel(amount);
            button.classList.toggle("has-bet", amount > 0);
            button.classList.toggle("is-winner", Boolean(!spinning && latest && id === `straight:${latest.number}`));
            const description = `${button.dataset.label}, ${bet.payoutMultiplier - 1}:1${amount ? `, bahis ${format.format(amount)} kredi` : ""}`;
            button.setAttribute("aria-label", description);
            button.title = description;
        });
        renderWagers(activeBets, spinning);
        renderHistory();
        highlightBet(null);
    }

    function updateSoundControls() {
        get("sound").setAttribute("aria-pressed", String(!muted));
        get("sound").setAttribute("aria-label", muted ? "Oyun seslerini aç" : "Oyun seslerini kapat");
        get("sound").title = muted ? "Sesi aç" : "Sesi kapat";
        get("sound").querySelector("span").textContent = muted || soundVolume === 0 ? "🔇" : "🔊";
        get("volume").value = String(Math.round(soundVolume * 100));
        get("volume-value").textContent = `%${get("volume").value}`;
    }

    function renderWagers(bets, spinning) {
        const rows = Object.entries(bets).map(([id, amount]) => {
            const bet = core.getBet(id);
            const row = document.createElement("li");
            const name = document.createElement("span");
            const value = document.createElement("strong");
            const odds = document.createElement("small");
            row.className = "roulette-wager";
            row.dataset.betId = id;
            name.className = "roulette-wager-label";
            name.textContent = bet.label;
            value.className = "roulette-wager-amount";
            value.textContent = format.format(amount);
            odds.textContent = `${bet.payoutMultiplier - 1}:1`;
            row.append(name, odds, value);
            for (const [action, symbol] of [["minus", "−"], ["plus", "+"]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.action = action;
                button.dataset.betId = id;
                button.textContent = symbol;
                button.disabled = spinning || (action === "plus" && core.totalBet(state) + selectedChip > state.balance);
                button.setAttribute("aria-label", `${bet.label} bahsini ${selectedChip} kredi ${action === "plus" ? "artır" : "azalt"}`);
                row.append(button);
            }
            return row;
        });
        wagers.replaceChildren(...rows);
        get("empty-bets").hidden = rows.length > 0;
    }

    function renderHistory() {
        const latest = state.history[0];
        const newest = get("history-newest");
        newest.replaceChildren();
        if (latest) {
            const label = document.createElement("span");
            const number = document.createElement("span");
            label.className = "roulette-history-latest";
            label.textContent = "SON";
            label.setAttribute("aria-hidden", "true");
            number.className = "roulette-history-number";
            number.textContent = latest.number;
            number.setAttribute("aria-hidden", "true");
            newest.dataset.color = latest.color;
            newest.title = `${latest.number} · ${colors[latest.color]} · Ödeme ${format.format(latest.payout)} kredi`;
            newest.setAttribute("aria-label", `Son sonuç. ${newest.title}`);
            newest.append(label, number);
        }
        const entries = state.history.slice(1).map((entry) => {
            const item = document.createElement("li");
            const number = document.createElement("span");
            item.dataset.color = entry.color;
            number.className = "roulette-history-number";
            number.textContent = entry.number;
            number.setAttribute("aria-hidden", "true");
            item.append(number);
            item.title = `${entry.number} · ${colors[entry.color]} · Ödeme ${format.format(entry.payout)} kredi`;
            item.setAttribute("aria-label", item.title);
            return item;
        });
        const history = get("history");
        const newestId = String(latest?.id || "");
        history.replaceChildren(...entries);
        history.hidden = entries.length === 0;
        if (history.dataset.newest !== newestId) history.scrollLeft = 0;
        history.dataset.newest = newestId;
        get("history-row").hidden = !latest;
        get("history-row").dataset.hasPrevious = String(entries.length > 0);
        get("empty-history").hidden = Boolean(latest);
    }

    function highlightBet(id) {
        const bet = core.getBet(id);
        const numbers = bet?.numbers || [];
        const spot = currentLayout?.spots.find((candidate) => candidate.id === id);
        get("bet-preview").textContent = bet
            ? `${spot?.label || bet.label} · ${bet.payoutMultiplier - 1}:1 · ${format.format(selectedChip)} kredi`
            : "Çizgiler ikili, kesişimler dörtlü bahis içindir.";
        tableButtons.forEach((button) => {
            const straight = core.getBet(button.dataset.betId);
            button.classList.toggle("is-covered", straight.type === "straight" && numbers.includes(straight.numbers[0]));
            button.classList.toggle("is-target", id === button.dataset.betId);
        });
    }

    function changeBet(update, message) {
        if (syncSavedGame()) return false;
        const next = update(state);
        if (!next) {
            status.textContent = "Bu bahis için yeterli sanal kredi yok.";
            return false;
        }
        state = next;
        save();
        render();
        status.textContent = message;
        return true;
    }

    function addBet(id, amount = selectedChip) {
        if (state.phase !== "betting" || !core.getBet(id)) return false;
        const bet = core.getBet(id);
        if (!changeBet((game) => core.addBet(game, id, amount), `${bet.label} bahsine ${format.format(amount)} kredi eklendi.`)) return false;
        playSound("chip");
        return true;
    }

    function playSound(kind) {
        if (muted || soundVolume === 0 || !panel.classList.contains("active") || document.hidden) return;
        audio.play(kind);
    }

    async function animatePending() {
        if (!state.pending) return;
        const pendingId = state.pending.id;
        const number = state.pending.number;
        const token = ++spinToken;
        status.textContent = "Bahisler kapandı. Çark ve top dönüyor…";
        render();
        if (panel.classList.contains("active") && !document.hidden && !motion.matches) audio.startSpin();
        let finished;
        let ballPhase = "orbiting";
        try {
            finished = await wheel.spin(number, {
                reducedMotion: motion.matches,
                onTick({ phase }) {
                    const now = performance.now();
                    if (phase !== ballPhase && (phase === "dropping" || phase === "pocket") && now - tickTime > 150) {
                        tickTime = now;
                        playSound("bounce");
                    }
                    ballPhase = phase;
                },
            });
        } catch {
            // The generated result still stands if a graphics device stops rendering.
            wheel.showResult(number);
        }
        if (token !== spinToken || finished?.cancelled || state.pending?.id !== pendingId) return;
        audio.stopSpin();
        if (syncSavedGame()) return;
        const settlement = core.settleSpin(state);
        if (!settlement) return;
        state = settlement.state;
        save();
        render();
        get("wheel").setAttribute("aria-label", `Rulet çarkı. Sonuç ${number}, ${colors[core.getColor(number)]}.`);
        const result = settlement.result;
        status.textContent = `Ödeme ${format.format(result.payout)} kredi. Net ${result.net >= 0 ? "+" : "−"}${format.format(Math.abs(result.net))}.`;
        playSound(result.net > 0 ? "win" : "lose");
    }

    function spin() {
        if (!panel.classList.contains("active") || document.hidden) return false;
        audio.unlock();
        if (syncSavedGame()) return false;
        if (state.phase !== "betting") return false;
        if (!core.totalBet(state)) {
            status.textContent = "Tur başlatmak için masaya çip yerleştir.";
            return false;
        }
        cancelDrag();
        try {
            const next = core.beginSpin(state);
            if (!next) return false;
            state = next;
            save();
            animatePending();
            const bounds = get("wheel").getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
                get("wheel").scrollIntoView({ behavior: motion.matches ? "auto" : "smooth", block: "center" });
            }
            return true;
        } catch {
            status.textContent = "Güvenli rastgele sayı üretimi kullanılamıyor. Güncel bir tarayıcıda tekrar dene.";
            return false;
        }
    }

    function startDrag(event) {
        const button = event.target.closest(".roulette-chip");
        if (!button || button.disabled || !event.isPrimary || event.button !== 0 || drag) return;
        audio.unlock();
        ignoreChipClick = false;
        const bounds = button.getBoundingClientRect();
        drag = {
            button, amount: Number(button.dataset.rouletteChip), pointerId: event.pointerId,
            x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY, ghost: null,
            width: bounds.width, height: bounds.height,
            offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
        };
        button.setPointerCapture(event.pointerId);
    }

    function moveDrag(event) {
        if (event.pointerId !== drag?.pointerId) return;
        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        if (!drag.ghost) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            const ghost = drag.button.cloneNode(true);
            ghost.removeAttribute("id");
            ghost.classList.add("roulette-chip-ghost");
            ghost.setAttribute("aria-hidden", "true");
            ghost.tabIndex = -1;
            ghost.style.width = `${drag.width}px`;
            ghost.style.height = `${drag.height}px`;
            // A query container establishes a containing block for fixed descendants.
            // Keep the live chip in the viewport, outside the app's query containers.
            document.body.append(ghost);
            drag.ghost = ghost;
            drag.button.classList.add("is-dragging");
        }
        drag.ghost.style.transform = `translate3d(${event.clientX - drag.offsetX}px, ${event.clientY - drag.offsetY}px, 0)`;
        previewDragBet();
        if (!dragScrollFrame) dragScrollFrame = requestAnimationFrame(scrollDrag);
    }

    function previewDragBet() {
        const target = betAtPoint(drag);
        if (drag.target === target) return;
        drag.target = target;
        highlightBet(target);
    }

    function scrollDrag() {
        dragScrollFrame = 0;
        if (!drag?.ghost) return;
        const edge = 64;
        const bottom = window.innerHeight - edge;
        const speed = drag.clientY < edge ? -Math.min(16, (edge - drag.clientY) / 3)
            : drag.clientY > bottom ? Math.min(16, (drag.clientY - bottom) / 3) : 0;
        if (!speed) return;
        const previous = window.scrollY;
        window.scrollBy({ top: speed, behavior: "instant" });
        if (window.scrollY === previous) return;
        previewDragBet();
        dragScrollFrame = requestAnimationFrame(scrollDrag);
    }

    function cancelDrag() {
        if (dragScrollFrame) cancelAnimationFrame(dragScrollFrame);
        dragScrollFrame = 0;
        if (!drag) return;
        const { button, ghost, pointerId } = drag;
        drag = null;
        ghost?.remove();
        button.classList.remove("is-dragging");
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        highlightBet(null);
    }

    function finishDrag(event) {
        if (event.pointerId !== drag?.pointerId) return;
        const { ghost, amount } = drag;
        const target = betAtPoint(event);
        ignoreChipClick = Boolean(ghost);
        cancelDrag();
        if (ghost && target) {
            const previousChip = selectedChip;
            selectedChip = amount;
            if (!addBet(target, amount)) {
                selectedChip = previousChip;
                render();
            }
        }
    }

    chips.addEventListener("pointerdown", startDrag);
    chips.addEventListener("pointermove", moveDrag);
    chips.addEventListener("pointerup", finishDrag);
    for (const name of ["lostpointercapture", "pointercancel"]) {
        chips.addEventListener(name, (event) => {
            if (event.pointerId === drag?.pointerId) cancelDrag();
        });
    }
    chips.addEventListener("click", (event) => {
        const chip = event.target.closest(".roulette-chip");
        if (!chip || (event.detail > 0 && ignoreChipClick)) return;
        if (syncSavedGame()) return;
        selectedChip = Number(chip.dataset.rouletteChip);
        render();
        save();
        status.textContent = `${format.format(selectedChip)} kredilik çip seçildi. Bir bahis alanına dokun veya çipi sürükle.`;
    });
    table.addEventListener("click", (event) => {
        const button = event.target.closest(".roulette-table-bet");
        const id = event.detail === 0 ? button?.dataset.betId : betAtPoint(event);
        if (!id) return;
        audio.unlock();
        focusedBet = id;
        tableButtons.forEach((target) => { target.tabIndex = target.dataset.betId === id ? 0 : -1; });
        addBet(id);
    });
    table.addEventListener("pointermove", (event) => {
        if (!drag && state.phase === "betting" && event.pointerType !== "touch") highlightBet(betAtPoint(event));
    });
    table.addEventListener("pointerleave", () => { if (!drag) highlightBet(null); });
    table.addEventListener("focusin", (event) => {
        const button = event.target.closest(".roulette-table-bet");
        if (button) highlightBet(button.dataset.betId);
    });
    table.addEventListener("focusout", (event) => {
        if (!table.contains(event.relatedTarget)) highlightBet(null);
    });
    table.addEventListener("keydown", (event) => {
        const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
        const direction = directions[event.key];
        const button = event.target.closest(".roulette-table-bet");
        if (!direction || !button || state.phase !== "betting") return;
        event.preventDefault();
        const start = currentLayout.spots.find((spot) => spot.id === button.dataset.betId);
        const candidates = currentLayout.spots.map((spot) => {
            const dx = (spot.x - start.x) * currentLayout.unitWidth;
            const dy = (spot.y - start.y) * currentLayout.unitHeight;
            const forward = dx * direction[0] + dy * direction[1];
            const sideways = Math.abs(dx * direction[1] - dy * direction[0]);
            return { spot, forward, distance: Math.hypot(dx, dy) + sideways * 3 };
        }).filter((candidate) => candidate.forward > 0.1).sort((a, b) => a.distance - b.distance);
        if (!candidates.length) return;
        focusedBet = candidates[0].spot.id;
        tableButtons.forEach((target) => {
            target.tabIndex = target.dataset.betId === focusedBet ? 0 : -1;
            if (target.tabIndex === 0) target.focus({ preventScroll: true });
        });
    });
    wagers.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button || state.phase !== "betting") return;
        const id = button.dataset.betId;
        const previous = state.bets[id] || 0;
        const amount = button.dataset.action === "plus" ? previous + selectedChip : Math.max(0, previous - selectedChip);
        changeBet((game) => core.setBet(game, id, amount), `${core.getBet(id).label} bahsi güncellendi.`);
    });
    wagers.addEventListener("pointerover", (event) => highlightBet(event.target.closest(".roulette-wager")?.dataset.betId));
    wagers.addEventListener("pointerleave", () => highlightBet(null));
    get("spin").addEventListener("click", spin);
    get("undo").addEventListener("click", () => changeBet(core.undoBet, "Son bahis değişikliği geri alındı."));
    get("clear").addEventListener("click", () => changeBet(core.clearBets, "Bahisler temizlendi."));
    get("repeat").addEventListener("click", () => changeBet(core.repeatBets, "Önceki turun bahisleri yerleştirildi."));
    get("double").addEventListener("click", () => changeBet(core.doubleBets, "Bahisler ikiye katlandı."));
    get("refill").addEventListener("click", () => changeBet(core.replenishBalance, "10.000 sanal kredi yüklendi."));
    get("sound").addEventListener("click", () => {
        if (syncSavedGame()) return;
        audio.unlock();
        muted = !muted;
        audio.setMuted(muted);
        save();
        updateSoundControls();
        if (!muted) playSound("chip");
    });
    get("volume").addEventListener("input", (event) => {
        const nextVolume = Math.max(0, Math.min(1, Number(event.currentTarget.value) / 100));
        syncSavedGame();
        audio.unlock();
        soundVolume = nextVolume;
        audio.setVolume(soundVolume);
        updateSoundControls();
        save();
    });
    get("volume").addEventListener("change", () => playSound("chip"));
    get("volume").closest(".roulette-volume-control").addEventListener("pointerleave", (event) => {
        if (event.pointerType === "mouse" && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
    });
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("pagehide", cancelDrag);
    window.addEventListener("storage", (event) => {
        if (event.key !== storageKey) return;
        syncSavedGame();
    });
    document.addEventListener("visibilitychange", () => {
        wheel.setInteractive(!document.hidden && panel.classList.contains("active") && state.phase === "betting");
        if (document.hidden) {
            cancelDrag();
            audio.stopSpin();
        }
        else if (panel.classList.contains("active") && state.phase === "spinning" && !motion.matches) audio.startSpin();
    });
    new MutationObserver(() => {
        wheel.setInteractive(panel.classList.contains("active") && !document.hidden && state.phase === "betting");
        if (!panel.classList.contains("active")) {
            cancelDrag();
            audio.stopSpin();
        } else if (state.phase === "spinning" && !motion.matches) audio.startSpin();
    })
        .observe(panel, { attributes: true, attributeFilter: ["class"] });

    render();
    if (state.pending) animatePending();
    else {
        if (state.history[0]) wheel.showResult(state.history[0].number);
        status.textContent = "Çip seç, bahsini yerleştir ve çarkı çevir.";
    }
});
