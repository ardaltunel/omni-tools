(function registerRoulette(initialize) {
    "use strict";

    const panel = document.getElementById("roulette");
    if (!panel || !window.OmniRouletteCore || !window.OmniRouletteWheel) return;
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
    const betType = get("bet-type");
    const betOption = get("bet-option");
    const status = get("status");
    const storageKey = "omni-roulette-v1";
    const denominations = [1, 5, 25, 100, 500];
    const labels = {
        straight: "Tek sayı", split: "İkili", street: "Üçlü sıra", corner: "Dörtlü köşe",
        sixline: "Altılı sıra", trio: "Sıfırlı üçlü", firstfour: "İlk dört",
        dozen: "Düzine", column: "Sütun", outside: "Dış bahis",
    };
    const colors = { red: "Kırmızı", black: "Siyah", green: "Yeşil" };
    const format = new Intl.NumberFormat("tr-TR");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saved = readSaved();
    const wheel = window.OmniRouletteWheel.create(get("wheel"));
    let state = core.restoreState(saved.game) || core.createState();
    let selectedChip = denominations.includes(saved.chip) ? saved.chip : 25;
    let muted = saved.muted === true;
    let storageWritable = true;
    let spinToken = 0;
    let drag = null;
    let ignoreChipClick = false;
    let audio;
    let tickTime = 0;
    const tableButtons = buildTable();
    buildChips();
    buildBetSelector();

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
                game: core.serializeState(state), chip: selectedChip, muted,
            }));
        } catch {
            storageWritable = false;
            // Virtual credits remain usable within this session if storage is blocked.
        }
    }

    function adoptSavedGame(restored, snapshot) {
        spinToken += 1;
        wheel.cancel();
        cancelDrag();
        state = restored;
        muted = snapshot.muted === true;
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

    function betButton(id, text, column, row, span = 1, className = "") {
        const button = document.createElement("button");
        const label = document.createElement("span");
        const marker = document.createElement("span");
        button.type = "button";
        button.className = `roulette-table-bet ${className}`.trim();
        button.dataset.betId = id;
        button.style.gridColumn = `${column} / span ${span}`;
        button.style.gridRow = row;
        label.textContent = text;
        marker.className = "roulette-stake-marker";
        marker.hidden = true;
        marker.setAttribute("aria-hidden", "true");
        button.append(label, marker);
        table.append(button);
        return button;
    }

    function buildTable() {
        const buttons = [];
        const zero = betButton("straight:0", "0", 1, "1 / span 3", 1, "roulette-table-zero");
        zero.dataset.color = "green";
        buttons.push(zero);
        for (let street = 0; street < 12; street += 1) {
            for (let row = 0; row < 3; row += 1) {
                const number = street * 3 + 3 - row;
                const button = betButton(`straight:${number}`, number, street + 2, row + 1);
                button.dataset.color = core.getColor(number);
                buttons.push(button);
            }
        }
        for (let row = 0; row < 3; row += 1) {
            buttons.push(betButton(`column:${3 - row}`, "2:1", 14, row + 1, 1, "roulette-table-column"));
        }
        for (let dozen = 1; dozen <= 3; dozen += 1) {
            buttons.push(betButton(`dozen:${dozen}`, `${(dozen - 1) * 12 + 1}–${dozen * 12}`, 2 + (dozen - 1) * 4, 4, 4, "roulette-table-dozen"));
        }
        const outside = [["low", "1–18"], ["even", "ÇİFT"], ["red", "KIRMIZI"], ["black", "SİYAH"], ["odd", "TEK"], ["high", "19–36"]];
        outside.forEach(([id, label], index) => {
            const button = betButton(id, label, 2 + index * 2, 5, 2, "roulette-table-outside");
            if (id === "red" || id === "black") button.dataset.color = id;
            buttons.push(button);
        });
        return buttons;
    }

    function buildChips() {
        denominations.forEach((amount) => {
            const button = document.createElement("button");
            button.className = "roulette-chip";
            button.type = "button";
            button.dataset.rouletteChip = amount;
            button.setAttribute("aria-label", `${amount} kredilik çip`);
            button.textContent = format.format(amount);
            chips.append(button);
        });
    }

    function definitionType(bet) {
        return labels[bet.type] ? bet.type : "outside";
    }

    function buildBetSelector() {
        Object.entries(labels).forEach(([value, text]) => {
            if (core.BET_DEFINITIONS.some((bet) => definitionType(bet) === value)) {
                betType.add(new Option(text, value));
            }
        });
        updateBetOptions();
    }

    function updateBetOptions() {
        const options = core.BET_DEFINITIONS
            .filter((bet) => definitionType(bet) === betType.value)
            .map((bet) => new Option(`${bet.label} · ${bet.payoutMultiplier - 1}:1`, bet.id));
        betOption.replaceChildren(...options);
    }

    function totalStake() {
        return state.pending?.stake ?? core.totalBet(state);
    }

    function render() {
        const spinning = state.phase === "spinning";
        app.dataset.phase = state.phase;
        get("balance").textContent = format.format(state.balance);
        get("total-bet").textContent = format.format(totalStake());
        const latest = state.history[0];
        const repeatedLayout = Object.keys(state.lastBets).length === Object.keys(state.bets).length
            && Object.entries(state.lastBets).every(([id, amount]) => state.bets[id] === amount);
        get("win").textContent = latest ? format.format(latest.payout) : "—";
        get("result-number").textContent = latest ? String(latest.number) : "—";
        get("result-number").dataset.color = latest?.color || "none";
        get("result-label").textContent = latest
            ? `${spinning ? "Önceki sonuç" : colors[latest.color]} · ${latest.net >= 0 ? "+" : "−"}${format.format(Math.abs(latest.net))} net`
            : "İlk tur için bahis koy";
        get("spin").disabled = spinning || !core.totalBet(state);
        get("undo").disabled = spinning || !state.undoStack.length;
        get("clear").disabled = spinning || !core.totalBet(state);
        get("repeat").disabled = spinning || !Object.keys(state.lastBets).length
            || repeatedLayout || Object.values(state.lastBets).reduce((sum, amount) => sum + amount, 0) > state.balance;
        get("double").disabled = spinning || !core.totalBet(state) || core.totalBet(state) * 2 > state.balance;
        get("refill").hidden = spinning || state.balance >= 1;
        betType.disabled = spinning;
        betOption.disabled = spinning;
        get("add-bet").disabled = spinning || !betOption.value || core.totalBet(state) + selectedChip > state.balance;
        get("sound").setAttribute("aria-pressed", String(!muted));
        get("sound").dataset.muted = String(muted);
        get("sound").title = muted ? "Sesi aç" : "Sesi kapat";
        get("sound").textContent = muted ? "Ses kapalı" : "Ses açık";
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
            marker.textContent = format.format(amount);
            button.classList.toggle("has-bet", amount > 0);
            button.classList.toggle("is-winner", Boolean(!spinning && latest && id === `straight:${latest.number}`));
            button.setAttribute("aria-label", `${bet.label}, ${bet.payoutMultiplier - 1}:1${amount ? `, bahis ${format.format(amount)} kredi` : ""}`);
        });
        renderWagers(activeBets, spinning);
        renderHistory();
        highlightBet(null);
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
        const entries = state.history.map((entry) => {
            const item = document.createElement("li");
            item.dataset.color = entry.color;
            item.textContent = entry.number;
            item.title = `${entry.number} · ${colors[entry.color]} · Ödeme ${format.format(entry.payout)} kredi`;
            return item;
        });
        get("history").replaceChildren(...entries);
        get("empty-history").hidden = entries.length > 0;
    }

    function highlightBet(id) {
        const numbers = core.getBet(id)?.numbers || [];
        tableButtons.forEach((button) => {
            const straight = core.getBet(button.dataset.betId);
            button.classList.toggle("is-covered", straight.type === "straight" && numbers.includes(straight.numbers[0]));
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
        if (muted || !panel.classList.contains("active") || document.hidden) return;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            audio ??= new Audio();
            if (audio.state === "suspended") audio.resume().catch(() => {});
            const frequencies = {
                chip: [1100, 1450], tick: [850], bounce: [420], win: [440, 554, 659], lose: [240, 180],
            }[kind] || [500];
            const start = audio.currentTime;
            frequencies.forEach((frequency, index) => {
                const at = start + index * 0.065;
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                oscillator.type = kind === "tick" ? "sine" : "triangle";
                oscillator.frequency.setValueAtTime(frequency, at);
                oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, at + 0.065);
                gain.gain.setValueAtTime(0.0001, at);
                gain.gain.exponentialRampToValueAtTime(kind === "tick" ? 0.018 : 0.045, at + 0.003);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
                oscillator.connect(gain).connect(audio.destination);
                oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
                oscillator.start(at);
                oscillator.stop(at + 0.1);
            });
        } catch {
            // Audio is optional when the browser cannot create an output device.
        }
    }

    async function animatePending() {
        if (!state.pending) return;
        const pendingId = state.pending.id;
        const number = state.pending.number;
        const token = ++spinToken;
        status.textContent = "Bahisler kapandı. Çark ve top dönüyor…";
        render();
        let finished;
        try {
            finished = await wheel.spin(number, {
                reducedMotion: motion.matches,
                onTick() {
                    const now = performance.now();
                    if (now - tickTime > 55) {
                        tickTime = now;
                        playSound("tick");
                    }
                },
            });
        } catch {
            // The generated result still stands if a graphics device stops rendering.
            wheel.showResult(number);
        }
        if (token !== spinToken || finished?.cancelled || state.pending?.id !== pendingId) return;
        if (syncSavedGame()) return;
        const settlement = core.settleSpin(state);
        if (!settlement) return;
        state = settlement.state;
        save();
        render();
        get("wheel").setAttribute("aria-label", `Rulet çarkı. Sonuç ${number}, ${colors[core.getColor(number)]}.`);
        const result = settlement.result;
        status.textContent = `${number} · ${colors[result.color]}. Ödeme ${format.format(result.payout)} kredi. Net ${result.net >= 0 ? "+" : "−"}${format.format(Math.abs(result.net))}.`;
        playSound(result.net > 0 ? "win" : "lose");
    }

    function spin() {
        if (syncSavedGame()) return;
        if (state.phase !== "betting" || !core.totalBet(state)) return;
        cancelDrag();
        try {
            const next = core.beginSpin(state);
            if (!next) return;
            state = next;
            save();
            animatePending();
            const bounds = get("wheel").getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
                get("wheel").scrollIntoView({ behavior: motion.matches ? "auto" : "smooth", block: "center" });
            }
        } catch {
            status.textContent = "Güvenli rastgele sayı üretimi kullanılamıyor. Güncel bir tarayıcıda tekrar dene.";
        }
    }

    function startDrag(event) {
        const button = event.target.closest(".roulette-chip");
        if (!button || button.disabled || !event.isPrimary || event.button !== 0 || drag) return;
        ignoreChipClick = false;
        drag = {
            button, amount: Number(button.dataset.rouletteChip), pointerId: event.pointerId,
            x: event.clientX, y: event.clientY, ghost: null,
        };
        button.setPointerCapture(event.pointerId);
    }

    function moveDrag(event) {
        if (event.pointerId !== drag?.pointerId) return;
        if (!drag.ghost) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            const ghost = drag.button.cloneNode(true);
            ghost.removeAttribute("id");
            ghost.removeAttribute("data-roulette-chip");
            ghost.classList.add("roulette-chip-ghost");
            ghost.setAttribute("aria-hidden", "true");
            ghost.tabIndex = -1;
            app.append(ghost);
            drag.ghost = ghost;
            drag.button.classList.add("is-dragging");
        }
        drag.ghost.style.transform = `translate3d(${event.clientX - 23}px, ${event.clientY - 23}px, 0)`;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".roulette-table-bet");
        highlightBet(table.contains(target) ? target.dataset.betId : null);
    }

    function cancelDrag() {
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
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".roulette-table-bet");
        ignoreChipClick = Boolean(ghost);
        cancelDrag();
        if (ghost && table.contains(target)) addBet(target.dataset.betId, amount);
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
        if (button) addBet(button.dataset.betId);
    });
    table.addEventListener("pointerover", (event) => {
        if (!drag) highlightBet(event.target.closest(".roulette-table-bet")?.dataset.betId);
    });
    table.addEventListener("pointerleave", () => { if (!drag) highlightBet(null); });
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
    betType.addEventListener("change", () => { updateBetOptions(); highlightBet(betOption.value); });
    betOption.addEventListener("change", () => highlightBet(betOption.value));
    betOption.addEventListener("blur", () => highlightBet(null));
    get("add-bet").addEventListener("click", () => addBet(betOption.value));
    get("spin").addEventListener("click", spin);
    get("undo").addEventListener("click", () => changeBet(core.undoBet, "Son bahis değişikliği geri alındı."));
    get("clear").addEventListener("click", () => changeBet(core.clearBets, "Bahisler temizlendi."));
    get("repeat").addEventListener("click", () => changeBet(core.repeatBets, "Önceki turun bahisleri yerleştirildi."));
    get("double").addEventListener("click", () => changeBet(core.doubleBets, "Bahisler ikiye katlandı."));
    get("refill").addEventListener("click", () => changeBet(core.replenishBalance, "10.000 sanal kredi yüklendi."));
    get("sound").addEventListener("click", () => {
        if (syncSavedGame()) return;
        muted = !muted;
        save();
        render();
        if (!muted) playSound("chip");
    });
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("pagehide", cancelDrag);
    window.addEventListener("storage", (event) => {
        if (event.key !== storageKey) return;
        syncSavedGame();
    });
    new MutationObserver(() => { if (!panel.classList.contains("active")) cancelDrag(); })
        .observe(panel, { attributes: true, attributeFilter: ["class"] });

    render();
    if (state.pending) animatePending();
    else {
        if (state.history[0]) wheel.showResult(state.history[0].number);
        status.textContent = "Çip seç, bahsini yerleştir ve çarkı çevir.";
    }
});
