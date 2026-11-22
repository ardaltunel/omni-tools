(function initializeSlotGame() {
    "use strict";

    const engine = window.OmniSlotGameEngine;
    const wallet = window.OmniGameWallet;
    const app = document.getElementById("slot-game-app");
    if (!engine || !wallet || !app) return;

    const WALLET_GAME_ID = "slot-game";
    const initialWallet = wallet.read(WALLET_GAME_ID);
    let walletRevision = initialWallet.revision;
    let walletPending = false;
    let pendingSettingsSave = false;
    let roundSerial = 0;
    const elements = {
        autoButton: document.getElementById("slot-game-auto"),
        autoCount: document.getElementById("slot-game-auto-count"),
        autoCountMenu: document.getElementById("slot-game-auto-menu"),
        autoCountOptions: Array.from(document.querySelectorAll("[data-slot-auto-count]")),
        autoCountValue: document.getElementById("slot-game-auto-count-value"),
        balance: document.getElementById("slot-game-balance"),
        bet: document.getElementById("slot-game-bet"),
        betDown: document.getElementById("slot-game-bet-down"),
        betHud: document.getElementById("slot-game-bet-hud"),
        betUp: document.getElementById("slot-game-bet-up"),
        buyBonus: document.getElementById("slot-game-buy-bonus"),
        buyClose: Array.from(document.querySelectorAll("[data-slot-buy-close]")),
        buyConfirm: document.getElementById("slot-game-buy-confirm"),
        buyConfirmCost: document.getElementById("slot-game-buy-confirm-cost"),
        buyCost: document.getElementById("slot-game-buy-cost"),
        buyDialog: document.querySelector(".slot-game-buy-dialog"),
        buyModal: document.getElementById("slot-game-buy-modal"),
        cascadeCount: document.getElementById("slot-game-cascade-count"),
        celebration: document.getElementById("slot-game-celebration"),
        celebrationLabel: document.getElementById("slot-game-celebration-label"),
        celebrationValue: document.getElementById("slot-game-celebration-value"),
        collected: document.getElementById("slot-game-collected"),
        effects: document.getElementById("slot-game-effects"),
        freeMultiplier: document.getElementById("slot-game-free-multiplier"),
        freeSpins: document.getElementById("slot-game-free-spins"),
        freeStat: document.getElementById("slot-game-free-stat"),
        grid: document.getElementById("slot-game-grid"),
        machine: app.querySelector(".slot-game-machine"),
        message: document.getElementById("slot-game-message"),
        multiplierLegend: document.getElementById("slot-game-multiplier-legend"),
        paytable: document.getElementById("slot-game-paytable"),
        phase: document.getElementById("slot-game-phase"),
        phaseDot: document.getElementById("slot-game-phase-dot"),
        sound: document.getElementById("slot-game-sound"),
        volume: document.getElementById("slot-game-volume"),
        volumeValue: document.getElementById("slot-game-volume-value"),
        spin: document.getElementById("slot-game-spin"),
        spinSubtitle: document.getElementById("slot-game-spin-subtitle"),
        statusTitle: document.getElementById("slot-game-status-title"),
        turbo: document.getElementById("slot-game-turbo"),
        win: document.getElementById("slot-game-win"),
        winDetail: document.getElementById("slot-game-win-detail"),
    };

    const SYMBOL_ART = Object.freeze(Object.fromEntries(
        ['spark','orbit','moon','prism','bloom','sigil','rune','nova','gateway'].map(id =>
            [id, `<img src="tools/slot-game/art/${id}.svg" alt="" draggable="false" width="120" height="130">`])
    ));

    const saved = loadSavedState(initialWallet.snapshot);
    const state = engine.createState({
        balance: initialWallet.balance,
        bet: saved.bet,
        freeSpins: saved.freeSpins,
        freeMultiplier: saved.freeMultiplier,
    });
    state.lastWin = saved.lastWin;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let currentGrid = engine.createGrid();
    let turboEnabled = saved.turboEnabled;
    let autoRemaining = 0;
    let autoCount = parseAutoCount(elements.autoCount.dataset.value);
    let nextSpinTimer = 0;
    let soundEnabled = saved.soundEnabled;
    let soundVolume = saved.soundVolume;
    let audioContext = null;
    const activeSounds = new Set();
    function silenceAudio() {
        activeSounds.forEach(source => { try { source.stop(); } catch {} });
        activeSounds.clear();
    }
    let presentationBusy = false;
    let durableRoundState = null;
    const volumeControl = elements.sound.closest('.slot-game-audio-controls');
    volumeControl.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse' && volumeControl.contains(document.activeElement)) document.activeElement.blur();
    });
    const audioFiles = new Map(['spin','cascade','multiplier','win','big','mega','free','miss','toggle'].map(cue => [cue,
        fetch(`tools/slot-game/audio/${cue}.wav`).then(response => response.ok ? response.arrayBuffer() : null).catch(() => null)
    ]));
    const audioBuffers = new Map();
    let audioBus = null;
    app.addEventListener('pointerdown', () => getAudioContext(), { once: true });
    let buyModalOpen = false;
    let lastCompletedFreeMultiplier = 1;

    function loadSavedState(snapshot) {
        const fallback = {
            balance: engine.STARTING_BALANCE,
            bet: 100,
            freeSpins: 0,
            freeMultiplier: 0,
            lastWin: 0,
            soundEnabled: true,
            soundVolume: 70,
            turboEnabled: false,
        };
        try {
            const value = snapshot && typeof snapshot === "object" ? snapshot : {};
            const freeSpins = Number.isInteger(value.freeSpins) && value.freeSpins >= 0 ? value.freeSpins : 0;
            const storedMultiplier = Number.isInteger(value.freeMultiplier) && value.freeMultiplier >= 0
                ? value.freeMultiplier
                : fallback.freeMultiplier;
            // v1 kayıtlarında başlangıçtaki x1 de küre toplamına katılıyordu.
            // Devam eden eski bonuslarda değeri bir kez yeni kurala taşırız.
            const usesLegacyMultiplier = (!Number.isInteger(value.version) || value.version < 2) && freeSpins > 0;
            return {
                balance: Number.isFinite(value.balance) && value.balance >= 0 ? value.balance : fallback.balance,
                bet: engine.BET_OPTIONS.includes(value.bet) ? value.bet : fallback.bet,
                freeSpins,
                freeMultiplier: usesLegacyMultiplier ? Math.max(0, storedMultiplier - 1) : storedMultiplier,
                lastWin: Number.isFinite(value.lastWin) && value.lastWin >= 0 ? value.lastWin : 0,
                soundEnabled: typeof value.soundEnabled === "boolean" ? value.soundEnabled : true,
                soundVolume: Number.isFinite(value.soundVolume) ? Math.min(100, Math.max(0, Math.round(value.soundVolume / 5) * 5)) : fallback.soundVolume,
                turboEnabled: typeof value.turboEnabled === "boolean" ? value.turboEnabled : false,
            };
        } catch {
            return fallback;
        }
    }

    function savedEnvelope(persisted) {
        return {
            version: 2,
            balance: persisted.balance,
            bet: persisted.bet,
            freeSpins: persisted.freeSpins,
            freeMultiplier: persisted.freeMultiplier,
            lastWin: persisted.lastWin,
            soundEnabled,
            soundVolume,
            turboEnabled,
        };
    }

    function adoptWallet(record) {
        const restored = loadSavedState(record.snapshot);
        roundSerial += 1;
        window.clearTimeout(nextSpinTimer);
        nextSpinTimer = 0;
        autoRemaining = 0;
        durableRoundState = null;
        presentationBusy = false;
        pendingSettingsSave = false;
        Object.assign(state, engine.createState({
            balance: record.balance, bet: restored.bet,
            freeSpins: restored.freeSpins, freeMultiplier: restored.freeMultiplier,
        }), { lastWin: restored.lastWin });
        walletRevision = record.revision;
        soundEnabled = restored.soundEnabled;
        soundVolume = restored.soundVolume;
        turboEnabled = restored.turboEnabled;
        elements.machine.classList.remove("is-spinning", "is-hit");
        elements.celebration.hidden = true;
        elements.turbo.setAttribute("aria-pressed", String(turboEnabled));
        elements.turbo.classList.toggle("is-active", turboEnabled);
        elements.turbo.querySelector("small").textContent = turboEnabled ? "Açık" : "Kapalı";
        updateSoundButton();
        updateHud();
    }

    function syncWallet() {
        if (walletPending) return false;
        const record = wallet.read(WALLET_GAME_ID);
        if (record.revision !== walletRevision) {
            adoptWallet(record);
            return true;
        }
        state.balance = record.balance;
        if (durableRoundState) durableRoundState.balance = record.balance;
        return false;
    }

    function handleWalletChange() {
        if (walletPending) return;
        const changedGame = syncWallet();
        updateHud();
        if (changedGame) syncVisibility();
    }

    async function commitCheckpoint(checkpoint, delta, required = 0) {
        if (walletPending) return { ok: false, reason: "busy" };
        walletPending = true;
        updateControls();
        try {
            const result = await wallet.commit(WALLET_GAME_ID, {
                revision: walletRevision, delta: engine.roundMoney(delta), required,
                snapshot: savedEnvelope(checkpoint),
            });
            if (result.ok) {
                walletRevision = result.revision;
                checkpoint.balance = result.balance;
            } else adoptWallet(wallet.read(WALLET_GAME_ID));
            return result;
        } catch {
            adoptWallet(wallet.read(WALLET_GAME_ID));
            return { ok: false, reason: "storage" };
        } finally {
            walletPending = false;
            syncWallet();
            updateControls();
        }
    }

    async function saveState() {
        if (walletPending || presentationBusy || state.isSpinning) {
            pendingSettingsSave = true;
            return;
        }
        pendingSettingsSave = false;
        await commitCheckpoint(state, 0);
        if (pendingSettingsSave) saveState();
    }

    function flushSettingsSave() {
        if (pendingSettingsSave) saveState();
    }

    function getAudioContext() {
        if (!soundEnabled || soundVolume <= 0) return null;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!audioContext) {
            try { audioContext = new AudioContextClass(); } catch { return null; }
            audioBus = audioContext.createGain();
            audioBus.connect(audioContext.destination);
            audioFiles.forEach((promise, cue) => promise.then(bytes => bytes && audioContext.decodeAudioData(bytes)).then(buffer => { if (buffer) audioBuffers.set(cue,buffer); }).catch(() => {}));
        }
        audioBus.gain.setTargetAtTime(soundVolume / 100, audioContext.currentTime, .025);
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
    }

    function scheduleTone(context, options) {
        const startAt = context.currentTime + (options.delay || 0);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = options.type || "sine";
        oscillator.frequency.setValueAtTime(options.frequency, startAt);
        if (options.endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, startAt + options.duration);
        }
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.035, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + options.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + options.duration + 0.02);
        activeSounds.add(oscillator);
        oscillator.onended = () => { activeSounds.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    }

    function playSound(cue, detail = 0) {
        const context = getAudioContext();
        if (!context) return;
        if (audioBuffers.has(cue)) {
            const source = context.createBufferSource();
            source.buffer = audioBuffers.get(cue);
            if (cue === 'cascade') source.playbackRate.value = 1 + Math.min(6, detail) * .035;
            source.connect(audioBus);
            activeSounds.add(source);
            source.onended = () => { activeSounds.delete(source); source.disconnect(); };
            source.start();
            return;
        }
        const tone = (frequency, delay, duration, volume = 0.035, type = "sine", endFrequency = null) => {
            scheduleTone(context, { frequency, delay, duration, volume: volume * (soundVolume / 100), type, endFrequency });
        };

        if (cue === "spin") {
            tone(150, 0, 0.22, 0.018, "sine", 220);
            tone(240, 0.07, 0.24, 0.012, "sine", 330);
        } else if (cue === "cascade") {
            const root = Math.min(760, 410 + (detail * 55));
            tone(root, 0, 0.12, 0.035, "triangle");
            tone(root * 1.5, 0.07, 0.16, 0.028, "sine");
        } else if (cue === "multiplier") {
            tone(620, 0, 0.18, 0.03, "sine");
            tone(930, 0.08, 0.22, 0.032, "sine");
            tone(1240, 0.16, 0.25, 0.022, "sine");
        } else if (cue === "win") {
            [523, 659, 784].forEach((frequency, index) => tone(frequency, index * 0.07, 0.28, 0.032, "triangle"));
        } else if (cue === "big" || cue === "mega") {
            const notes = cue === "mega" ? [392, 523, 659, 784, 1047] : [392, 494, 587, 784];
            notes.forEach((frequency, index) => tone(frequency, index * 0.075, 0.34, 0.038, "triangle"));
        } else if (cue === "free") {
            [440, 554, 659, 880].forEach((frequency, index) => tone(frequency, index * 0.09, 0.38, 0.036, "sine"));
        } else if (cue === "miss") {
            tone(210, 0, 0.16, 0.014, "triangle", 150);
        } else if (cue === "toggle") {
            tone(660, 0, 0.09, 0.025, "sine");
            tone(880, 0.06, 0.12, 0.022, "sine");
        }
    }

    function updateSoundButton() {
        const audible = soundEnabled && soundVolume > 0;
        elements.sound.setAttribute("aria-pressed", String(audible));
        elements.sound.setAttribute("aria-label", audible ? "Oyun sesini kapat" : "Oyun sesini aç");
        elements.sound.querySelector('.slot-game-sound-icon').textContent = audible ? '🔊' : '🔇';
        elements.volume.value = String(soundVolume);
        elements.volumeValue.textContent = `${soundVolume}%`;
        elements.volume.setAttribute("aria-valuetext", `${soundVolume}%`);
    }

    function formatCredit(value) {
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
            maximumFractionDigits: 2,
        }).format(value);
    }

    function symbolLabel(cell) {
        if (cell.kind === "scatter") return "Geçit scatter sembolü";
        if (cell.kind === "multiplier") return `${cell.value} kat çarpan küresi`;
        return engine.SYMBOLS.find((symbol) => symbol.id === cell.id)?.label || "Sembol";
    }

    function symbolMarkup(cell) {
        if (cell.kind === "multiplier") {
            return `<span class="slot-game-multiplier-value"><strong>${cell.value}</strong><small>x</small></span>`;
        }
        return `<span class="slot-game-symbol-art">${SYMBOL_ART[cell.id] || SYMBOL_ART.spark}</span>${cell.kind === "scatter" ? '<small class="slot-game-scatter-label">GEÇİT</small>' : ""}`;
    }

    function renderGrid(grid, options = {}) {
        const previousPositions = new Map(Array.from(elements.grid.children, cell => [cell.dataset.uid, cell.getBoundingClientRect()]));
        const incoming = new Set(options.incomingUids || []);
        elements.grid.innerHTML = grid.map((row, rowIndex) => row.map((cell, columnIndex) => {
            const incomingClass = incoming.has(cell.uid) ? " is-incoming" : "";
            const delay = columnIndex * (turboEnabled ? 15 : 55) + rowIndex * (turboEnabled ? 2 : 8);
            return `
                <div class="slot-game-cell is-${cell.kind} symbol-${cell.id}${incomingClass}"
                    role="gridcell" data-row="${rowIndex}" data-column="${columnIndex}" data-uid="${cell.uid}"
                    aria-label="${symbolLabel(cell)}" style="--slot-delay:${delay}ms;--slot-drop-duration:${turboEnabled ? 110 : 440}ms">
                    ${symbolMarkup(cell)}
                </div>
            `;
        }).join("")).join("");
        if (!reducedMotion.matches) Array.from(elements.grid.children).forEach(cell => {
            const old = previousPositions.get(cell.dataset.uid);
            if (!old || incoming.has(cell.dataset.uid)) return;
            const next = cell.getBoundingClientRect();
            const y = old.top - next.top;
            if (Math.abs(y) < 1) return;
            cell.animate([
                {transform:`translateY(${y}px)`},
                {transform:'translateY(4px)',offset:.82},
                {transform:'translateY(0)'}
            ], {duration:turboEnabled ? 110 : 420,easing:'cubic-bezier(.25,.7,.3,1)'});
        });
    }

    function renderReferencePanels() {
        elements.multiplierLegend.innerHTML = engine.MULTIPLIER_VALUES
            .map((value) => `<span class="is-${value}">${value}x</span>`)
            .join("");

        elements.paytable.innerHTML = engine.SYMBOLS.slice().reverse().map((symbol) => `
            <div class="slot-game-pay-row">
                <span class="slot-game-pay-icon symbol-${symbol.id}">${SYMBOL_ART[symbol.id]}</span>
                <span>${symbol.label}</span>
                <strong>${formatCredit(symbol.pays[0])}–${formatCredit(symbol.pays[symbol.pays.length - 1])}x</strong>
            </div>
        `).join("");
    }

    function updateHud(summary = null) {
        state.balance = wallet.read(WALLET_GAME_ID).balance;
        const bonusCost = engine.bonusBuyCost(state.bet);
        elements.balance.textContent = formatCredit(state.balance);
        elements.bet.textContent = formatCredit(state.bet);
        elements.betHud.textContent = formatCredit(state.bet);
        elements.win.textContent = formatCredit(state.lastWin);
        elements.freeSpins.textContent = String(state.freeSpins);
        if (summary?.freeSessionEnded) lastCompletedFreeMultiplier = summary.accumulatedMultiplier;
        const shownMultiplier = state.freeSpins > 0
            ? Math.max(1, state.freeMultiplier)
            : lastCompletedFreeMultiplier;
        elements.freeMultiplier.textContent = `Toplam çarpan x${shownMultiplier}`;
        elements.buyCost.textContent = formatCredit(bonusCost);
        elements.buyConfirmCost.textContent = formatCredit(bonusCost);
        elements.freeStat.classList.toggle("is-active", state.freeSpins > 0 || summary?.mode === "free");

        if (summary?.totalWin > 0) {
            elements.winDetail.textContent = summary.appliedMultiplier > 1
                ? `${formatCredit(summary.baseWin)} × ${summary.appliedMultiplier}`
                : `${summary.mode === "free" ? "Ücretsiz dönüş" : "Dönüş"} kazancı`;
        } else {
            elements.winDetail.textContent = state.isSpinning
                ? "Semboller düşüyor"
                : state.lastWin > 0
                    ? "Son dönüş kazancı"
                    : "Dönüş için hazır";
        }
        updateControls();
    }

    function updateControls() {
        const sequencePending = Boolean(nextSpinTimer) || presentationBusy || walletPending;
        const betLocked = state.isSpinning || state.freeSpins > 0 || autoRemaining > 0 || sequencePending || buyModalOpen;
        const autoCountLocked = state.isSpinning || autoRemaining > 0 || state.freeSpins > 0 || sequencePending || buyModalOpen;
        const bonusUnavailable = state.balance < engine.bonusBuyCost(state.bet);
        const betIndex = engine.BET_OPTIONS.indexOf(state.bet);
        elements.betDown.disabled = betLocked || betIndex <= 0;
        elements.betUp.disabled = betLocked || betIndex >= engine.BET_OPTIONS.length - 1;
        elements.spin.disabled = state.isSpinning || autoRemaining > 0 || sequencePending || buyModalOpen;
        elements.autoCount.disabled = autoCountLocked;
        elements.autoCountOptions.forEach((option) => { option.disabled = autoCountLocked; });
        if (autoCountLocked) closeAutoCountMenu();
        elements.autoButton.disabled = autoRemaining === 0 && (state.isSpinning || state.freeSpins > 0 || sequencePending || buyModalOpen);
        elements.buyBonus.disabled = betLocked || bonusUnavailable;
        elements.buyBonus.classList.toggle("is-unavailable", bonusUnavailable);
        elements.buyBonus.title = bonusUnavailable ? "Bu bahis için sanal bakiye yetersiz" : "10 ücretsiz dönüş ödülünü satın al";
        elements.buyConfirm.disabled = presentationBusy || !engine.canBuyBonus(state);
        elements.autoButton.textContent = autoRemaining > 0 ? `Durdur · ${formatAutoCount(autoRemaining)}` : "Başlat";
        elements.autoButton.classList.toggle("is-active", autoRemaining > 0);
        elements.spinSubtitle.textContent = state.freeSpins > 0
            ? `${state.freeSpins} ücretsiz`
            : autoRemaining > 0
                ? `${formatAutoCount(autoRemaining)} otomatik`
                : "Başlat";
    }

    function setPhase(label, active = false) {
        elements.phase.textContent = label;
        elements.phaseDot.classList.toggle("is-active", active);
        app.dataset.phase = active ? "spinning" : "idle";
    }

    function setStatus(title, message) {
        elements.statusTitle.textContent = title;
        elements.message.textContent = message;
    }

    function closeAutoCountMenu(returnFocus = false) {
        if (elements.autoCountMenu.hidden) return;
        elements.autoCountMenu.hidden = true;
        elements.autoCount.setAttribute("aria-expanded", "false");
        if (returnFocus) elements.autoCount.focus();
    }

    function openAutoCountMenu() {
        if (elements.autoCount.disabled) return;
        elements.autoCountMenu.hidden = false;
        elements.autoCount.setAttribute("aria-expanded", "true");
        elements.autoCountOptions.find((option) => parseAutoCount(option.dataset.slotAutoCount) === autoCount)?.focus();
    }

    function setAutoCount(value) {
        const nextValue = parseAutoCount(value);
        if (![10, 25, 50, 100, Infinity].includes(nextValue)) return;
        autoCount = nextValue;
        elements.autoCount.dataset.value = Number.isFinite(autoCount) ? String(autoCount) : "infinite";
        elements.autoCountValue.textContent = formatAutoCount(autoCount);
        elements.autoCountOptions.forEach((option) => {
            option.setAttribute("aria-checked", String(parseAutoCount(option.dataset.slotAutoCount) === autoCount));
        });
        closeAutoCountMenu(true);
    }

    function parseAutoCount(value) {
        return value === "infinite" ? Infinity : Number(value) || 100;
    }

    function formatAutoCount(value) {
        return Number.isFinite(value) ? String(value) : "Sonsuz";
    }

    function timing(normal, turbo) {
        if (reducedMotion.matches) return 20;
        return turboEnabled ? turbo : normal;
    }

    function wait(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    function openBonusModal() {
        if (syncWallet() || walletPending) return;
        if (!engine.canBuyBonus(state)) {
            setStatus("Ödül alınamıyor", `${formatCredit(engine.bonusBuyCost(state.bet))} sanal kredi gerekli.`);
            return;
        }
        buyModalOpen = true;
        elements.buyModal.hidden = false;
        updateControls();
        window.requestAnimationFrame(() => elements.buyDialog.focus());
    }

    function closeBonusModal(returnFocus = true) {
        if (!buyModalOpen) return;
        buyModalOpen = false;
        elements.buyModal.hidden = true;
        updateControls();
        if (returnFocus) elements.buyBonus.focus();
    }

    function createBonusTriggerGrid() {
        const grid = engine.createGrid();
        grid.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                if (cell.kind !== "scatter") return;
                const symbol = engine.SYMBOLS[(rowIndex * engine.COLUMNS + columnIndex) % engine.SYMBOLS.length];
                grid[rowIndex][columnIndex] = engine.createCell("regular", symbol.id);
            });
        });
        [
            [0, 1],
            [1, 4],
            [3, 0],
            [4, 5],
        ].forEach(([row, column]) => {
            grid[row][column] = engine.createCell("scatter", "gateway");
        });
        return grid;
    }

    async function purchaseBonus() {
        if (!buyModalOpen || presentationBusy || walletPending || syncWallet()) return;
        const checkpoint = structuredClone(state);
        const purchase = engine.buyBonus(checkpoint);
        if (!purchase) {
            closeBonusModal(false);
            setStatus("Ödül alınamadı", "Sanal bakiyeni ve etkin oyun durumunu kontrol et.");
            updateHud();
            return;
        }

        presentationBusy = true;
        const serial = ++roundSerial;
        const receipt = await commitCheckpoint(checkpoint, -purchase.cost, purchase.cost);
        if (!receipt.ok || serial !== roundSerial) {
            closeBonusModal(false);
            presentationBusy = false;
            setStatus("Ödül alınamadı", "Ortak bakiyeyi ve güncel oyun kaydını kontrol ederek tekrar dene.");
            updateHud();
            return;
        }
        Object.assign(state, checkpoint);
        closeBonusModal(false);
        stopAuto();
        try {
            currentGrid = createBonusTriggerGrid();
            const incomingUids = currentGrid.flat().map((cell) => cell.uid);
            elements.collected.querySelector("strong").textContent = "x1";
            elements.collected.classList.remove("is-powered");
            elements.cascadeCount.textContent = "4 Geçit";
            setPhase("Ödül satın alındı", true);
            setStatus("Geçit çağrılıyor", `${formatCredit(purchase.cost)} sanal kredi karşılığında ${purchase.freeSpins} ücretsiz dönüş hazırlanıyor…`);
            elements.machine.classList.add("is-spinning");
            renderGrid(currentGrid, { incomingUids });
            playSound("spin");
            updateHud();
            await wait(timing(800, 220));
            if (serial !== roundSerial) return;
            elements.machine.classList.remove("is-spinning");
            elements.grid.querySelectorAll(".is-scatter").forEach((cell) => cell.classList.add("is-feature-trigger"));
            createBurst(30);
            await wait(timing(460, 100));
            if (serial !== roundSerial) return;
            await showCelebration("ÖDÜL AÇILDI", `${purchase.freeSpins} ÜCRETSİZ DÖNÜŞ`, "free");
            if (serial !== roundSerial) return;
            setPhase("Ücretsiz dönüşler açıldı");
            setStatus("Astral Geçit etkin", `Satın alınan ${purchase.freeSpins} ücretsiz dönüş otomatik olarak başlıyor.`);
        } catch (error) {
            console.error("Slot Game bonus presentation error:", error);
        } finally {
            if (serial !== roundSerial) return;
            presentationBusy = false;
            elements.machine.classList.remove("is-spinning");
            elements.celebration.hidden = true;
            updateHud();
            flushSettingsSave();
            scheduleNextSpin(timing(700, 160));
        }
    }

    function createBurst(amount = 18) {
        elements.effects.replaceChildren();
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < amount; index += 1) {
            const particle = document.createElement("i");
            particle.style.setProperty("--particle-x", `${10 + (Math.random() * 80)}%`);
            particle.style.setProperty("--particle-y", `${12 + (Math.random() * 76)}%`);
            particle.style.setProperty("--particle-shift", `${-70 + (Math.random() * 140)}px`);
            particle.style.setProperty("--particle-delay", `${Math.random() * 140}ms`);
            fragment.appendChild(particle);
        }
        elements.effects.appendChild(fragment);
        elements.effects.classList.remove("is-bursting");
        void elements.effects.offsetWidth;
        elements.effects.classList.add("is-bursting");
    }

    function markWinningCells(positions) {
        positions.forEach(({ row, column }) => {
            elements.grid.querySelector(`[data-row="${row}"][data-column="${column}"]`)?.classList.add("is-winning");
        });
    }

    function markExplodingCells(positions) {
        positions.forEach(({ row, column }) => {
            elements.grid.querySelector(`[data-row="${row}"][data-column="${column}"]`)?.classList.add("is-exploding");
        });
    }

    function showCollectedMultiplier(result, context) {
        const preview = context.mode === "free"
            ? Math.max(1, state.freeMultiplier + result.multiplierTotal)
            : Math.max(1, result.multiplierTotal);
        elements.collected.querySelector("strong").textContent = `x${preview}`;
        elements.collected.classList.toggle("is-powered", result.multiplierTotal > 0);

        if (result.multiplierTotal > 0) {
            playSound("multiplier");
            result.collectedMultipliers.forEach(({ uid }) => {
                elements.grid.querySelector(`[data-uid="${uid}"]`)?.classList.add("is-collected");
            });
        }
    }

    async function animateRound(result, context, serial = roundSerial) {
        const allInitialUids = result.initialGrid.flat().map((cell) => cell.uid);
        elements.machine.classList.add("is-spinning");
        renderGrid(result.initialGrid, { incomingUids: allInitialUids });
        setPhase(context.mode === "free" ? "FREE SPIN" : "Dönüyor", true);
        setStatus(context.mode === "free" ? "Kasa yeniden açılıyor" : "Yörünge hızlanıyor", "Semboller kozmik kasaya düşüyor…");
        await wait(timing(800, 220));
        if (serial !== roundSerial) return;
        elements.machine.classList.remove("is-spinning");

        let runningBaseWin = 0;
        for (const step of result.steps) {
            elements.cascadeCount.textContent = `Zincirleme düşüş ${step.index}`;
            setPhase(`Zincirleme düşüş ${step.index}`, true);
            runningBaseWin = engine.roundMoney(runningBaseWin + step.cascadeWin);
            elements.win.textContent = formatCredit(runningBaseWin);
            elements.winDetail.textContent = `${step.wins.map((win) => `${win.count} ${win.label}`).join(" · ")}`;
            markWinningCells(step.removedPositions);
            playSound("cascade", step.index);
            elements.machine.classList.add("is-hit");
            createBurst(Math.min(26, 10 + step.removedPositions.length));
            await wait(timing(460, 100));
            if (serial !== roundSerial) return;
            markExplodingCells(step.removedPositions);
            await wait(timing(300, 90));
            if (serial !== roundSerial) return;
            elements.machine.classList.remove("is-hit");
            renderGrid(step.nextGrid, { incomingUids: step.incomingUids });
            await wait(timing(780, 220));
            if (serial !== roundSerial) return;
        }

        if (!result.steps.length) {
            elements.cascadeCount.textContent = "Zincirleme düşüş 0";
            await wait(timing(260, 60));
            if (serial !== roundSerial) return;
        }
        currentGrid = result.finalGrid;
        renderGrid(currentGrid);
        showCollectedMultiplier(result, context);
        if (result.multiplierTotal > 0) await wait(timing(360, 80));
    }

    async function showCelebration(label, value, tier = "big", serial = roundSerial) {
        elements.celebration.dataset.tier = tier;
        elements.celebrationLabel.textContent = label;
        elements.celebrationValue.textContent = value;
        elements.celebration.hidden = false;
        elements.celebration.classList.remove("is-visible");
        void elements.celebration.offsetWidth;
        elements.celebration.classList.add("is-visible");
        playSound(tier === "free" ? "free" : tier);
        createBurst(tier === "mega" ? 34 : 24);
        await wait(timing(1050, 360));
        if (serial !== roundSerial) return;
        elements.celebration.classList.remove("is-visible");
        await wait(timing(180, 30));
        if (serial !== roundSerial) return;
        elements.celebration.hidden = true;
    }

    function scheduleNextSpin(delay) {
        if (nextSpinTimer) window.clearTimeout(nextSpinTimer);
        nextSpinTimer = 0;
        if (!document.getElementById('slot-game').classList.contains('active') || document.hidden) return;
        nextSpinTimer = window.setTimeout(() => {
            nextSpinTimer = 0;
            updateControls();
            if (!document.getElementById('slot-game').classList.contains('active') || document.hidden) return;
            if (walletPending) scheduleNextSpin(delay);
            else runSpin();
        }, delay);
        updateControls();
    }

    function stopAuto() {
        autoRemaining = 0;
        if (nextSpinTimer && state.freeSpins === 0) {
            window.clearTimeout(nextSpinTimer);
            nextSpinTimer = 0;
        }
        updateControls();
    }

    function syncVisibility() {
        syncWallet();
        if (!document.getElementById('slot-game').classList.contains('active') || document.hidden) {
            autoRemaining = 0;
            window.clearTimeout(nextSpinTimer);
            nextSpinTimer = 0;
            updateControls();
        } else if (state.freeSpins > 0 && !state.isSpinning && !presentationBusy && !nextSpinTimer) {
            scheduleNextSpin(timing(850, 180));
        }
    }
    document.addEventListener('tool-activated', syncVisibility);
    document.addEventListener('visibilitychange', syncVisibility);

    async function runSpin() {
        if (state.isSpinning || nextSpinTimer || presentationBusy || walletPending || buyModalOpen || syncWallet()) return;
        const willUsePaidSpin = state.freeSpins === 0;
        let adjustedBet = null;
        if (willUsePaidSpin && state.balance < state.bet) {
            adjustedBet = engine.reduceBetToBalance(state);
        }
        if (adjustedBet) {
            setPhase("Bahis otomatik ayarlandı");
            setStatus("Bahis bakiyene uyarlandı", `${formatCredit(adjustedBet.previousBet)} yerine ${formatCredit(adjustedBet.bet)} sanal krediyle dönüş başlatılıyor.`);
        }
        const checkpoint = structuredClone(state);
        const context = engine.startRound(state);
        if (!context) {
            stopAuto();
            setPhase("Bakiye yetersiz");
            setStatus("Bahis bakiyeyi aşıyor", "Oynamaya devam etmek için daha düşük bir bahis seç.");
            updateHud();
            return;
        }

        presentationBusy = true;
        const serial = ++roundSerial;
        let roundCommitted = false;
        if (willUsePaidSpin && autoRemaining > 0) autoRemaining -= 1;
        if (context.mode === "paid") lastCompletedFreeMultiplier = 1;

        try {
            const cellFactory = context.mode === "free" ? engine.createFreeSpinCell : engine.createRandomCell;
            const initialGrid = engine.createGrid(Math.random, cellFactory);
            const result = engine.resolveCascades(initialGrid, context.bet, Math.random, { cellFactory });
            durableRoundState = structuredClone(state);
            const summary = engine.settleRound(durableRoundState, result, context);
            const cost = context.mode === "paid" ? context.bet : 0;
            const receipt = await commitCheckpoint(durableRoundState, summary.totalWin - cost, cost);
            if (!receipt.ok || serial !== roundSerial) {
                presentationBusy = false;
                durableRoundState = null;
                stopAuto();
                setPhase("Dönüş başlamadı");
                setStatus("Oyun kaydı güncellendi", "Ortak bakiye veya bu oyunun kaydı değişti. Güncel durumdan tekrar döndürebilirsin.");
                updateHud();
                return;
            }
            roundCommitted = true;
            playSound("spin");
            elements.celebration.hidden = true;
            elements.collected.querySelector("strong").textContent = context.mode === "free"
                ? `x${Math.max(1, state.freeMultiplier)}` : "x1";
            elements.collected.classList.remove("is-powered");
            elements.cascadeCount.textContent = "Zincirleme düşüş 0";
            updateHud();
            await animateRound(result, context, serial);
            if (serial !== roundSerial) return;
            Object.assign(state, durableRoundState);
            durableRoundState = null;
            updateHud(summary);

            if (summary.awardedFreeSpins > 0) {
                await showCelebration("ÜCRETSİZ DÖNÜŞLER", `${summary.awardedFreeSpins} DÖNÜŞ`, "free");
                if (serial !== roundSerial) return;
            }

            const winRatio = summary.totalWin / context.bet;
            if (winRatio >= 50) {
                await showCelebration("MEGA KAZANÇ", formatCredit(summary.totalWin), "mega");
            } else if (winRatio >= 20) {
                await showCelebration("BÜYÜK KAZANÇ", formatCredit(summary.totalWin), "big");
            } else if (summary.totalWin > 0) {
                playSound("win");
            } else {
                playSound("miss");
            }

            if (serial !== roundSerial) return;
            if (summary.awardedFreeSpins > 0) {
                setPhase("Ücretsiz dönüşler açıldı");
                setStatus("Kozmik geçit etkin", `${summary.scatterCount} geçit sembolü ${summary.awardedFreeSpins} ücretsiz dönüş kazandırdı.`);
            } else if (summary.totalWin > 0) {
                setPhase(summary.mode === "free" ? "Ücretsiz dönüş kazancı" : "Kazandın");
                setStatus("Kasa ışıldıyor", `${result.steps.length} zincirleme düşüş sonunda ${formatCredit(summary.totalWin)} sanal kredi kazandın.`);
            } else if (summary.freeSessionEnded) {
                setPhase("Ücretsiz dönüşler tamamlandı");
                setStatus("Geçit kapandı", `Ücretsiz dönüş serisi x${summary.accumulatedMultiplier} toplam çarpanla tamamlandı.`);
            } else {
                setPhase("Tekrar dene");
                setStatus("Yörünge değişti", "Bu dönüşte eşleşme yok. Yeni bir dizilim için tekrar döndür.");
            }

            if (result.capped) {
                setStatus("Zincirleme düşüş sınırı", "Uzun zincir güvenli şekilde tamamlandı ve kazancın hesabına eklendi.");
            }

        } catch (error) {
            if (serial !== roundSerial) return;
            Object.assign(state, durableRoundState || (roundCommitted ? state : checkpoint));
            durableRoundState = null;
            state.isSpinning = false;
            stopAuto();
            elements.machine.classList.remove('is-spinning', 'is-hit');
            elements.celebration.hidden = true;
            setPhase("Oyun durdu");
            setStatus(roundCommitted ? "Dönüş sonucu kaydedildi" : "Dönüş tamamlanamadı", roundCommitted
                ? "Kazanç ve ücretsiz dönüşler ortak hesaba işlendi. Oyuna devam edebilirsin."
                : "Beklenmeyen bir sorun oluştu. Lütfen tekrar dene.");
            console.error("Slot Game spin error:", error);
            presentationBusy = false;
            updateHud();
            flushSettingsSave();
            return;
        }

        presentationBusy = false;
        updateHud();
        flushSettingsSave();
        if (state.freeSpins > 0) {
            scheduleNextSpin(timing(850, 180));
        } else if (autoRemaining > 0) {
            scheduleNextSpin(timing(720, 150));
        }
    }

    function changeBet(direction) {
        if (presentationBusy || walletPending || nextSpinTimer || autoRemaining > 0 || buyModalOpen || syncWallet()) return;
        const currentIndex = engine.BET_OPTIONS.indexOf(state.bet);
        const nextIndex = Math.min(engine.BET_OPTIONS.length - 1, Math.max(0, currentIndex + direction));
        if (engine.setBet(state, engine.BET_OPTIONS[nextIndex])) {
            setStatus("Bahis güncellendi", `${formatCredit(state.bet)} sanal krediyle oynamaya hazırsın.`);
            updateHud();
            saveState();
        }
    }

    elements.spin.addEventListener("click", runSpin);
    elements.buyBonus.addEventListener("click", openBonusModal);
    elements.buyConfirm.addEventListener("click", purchaseBonus);
    elements.buyClose.forEach((button) => button.addEventListener("click", () => closeBonusModal()));
    elements.sound.addEventListener("click", () => {
        soundEnabled = !(soundEnabled && soundVolume > 0);
        if (soundEnabled) {
            if (soundVolume === 0) soundVolume = 70;
            updateSoundButton();
            playSound("toggle");
        } else {
            silenceAudio();
            updateSoundButton();
        }
        saveState();
    });
    elements.volume.addEventListener("input", () => {
        soundVolume = Math.min(100, Math.max(0, Number(elements.volume.value) || 0));
        if (audioBus) audioBus.gain.setTargetAtTime(soundVolume / 100, audioContext.currentTime, .025);
        soundEnabled = soundVolume > 0;
        if (!soundEnabled) silenceAudio();
        updateSoundButton();
        saveState();
    });
    elements.volume.addEventListener("change", () => {
        if (soundEnabled && soundVolume > 0) playSound("toggle");
    });
    elements.betDown.addEventListener("click", () => changeBet(-1));
    elements.betUp.addEventListener("click", () => changeBet(1));
    elements.turbo.addEventListener("click", () => {
        turboEnabled = !turboEnabled;
        elements.turbo.setAttribute("aria-pressed", String(turboEnabled));
        elements.turbo.classList.toggle("is-active", turboEnabled);
        elements.turbo.querySelector("small").textContent = turboEnabled ? "Açık" : "Kapalı";
        saveState();
    });
    elements.autoCount.addEventListener("click", () => {
        if (elements.autoCountMenu.hidden) openAutoCountMenu();
        else closeAutoCountMenu();
    });
    elements.autoCountOptions.forEach((option) => {
        option.addEventListener("click", () => setAutoCount(option.dataset.slotAutoCount));
    });
    elements.autoButton.addEventListener("click", () => {
        if (autoRemaining > 0) {
            stopAuto();
            setStatus("Otomatik dönüş durduruldu", "Devam eden dönüş tamamlandıktan sonra seri sona erecek.");
            return;
        }
        autoRemaining = autoCount;
        closeAutoCountMenu();
        const autoSpinMessage = Number.isFinite(autoRemaining)
            ? `${autoRemaining} dönüşlük seri başladı. İstediğin anda durdurabilirsin.`
            : "Sonsuz dönüş serisi başladı. İstediğin anda durdurabilirsin.";
        setStatus("Otomatik dönüş etkin", autoSpinMessage);
        updateControls();
        runSpin();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && buyModalOpen) {
            event.preventDefault();
            closeBonusModal();
            return;
        }
        if (event.key === "Escape" && !elements.autoCountMenu.hidden) {
            event.preventDefault();
            closeAutoCountMenu(true);
            return;
        }
        if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!document.getElementById("slot-game")?.classList.contains("active")) return;
        if (buyModalOpen) return;
        if (["BUTTON", "SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
        event.preventDefault();
        runSpin();
    });
    document.addEventListener("pointerdown", (event) => {
        if (!elements.autoCountMenu.hidden && !event.target.closest(".slot-game-auto-picker")) closeAutoCountMenu();
    });

    renderReferencePanels();
    renderGrid(currentGrid);
    elements.turbo.setAttribute("aria-pressed", String(turboEnabled));
    elements.turbo.classList.toggle("is-active", turboEnabled);
    elements.turbo.querySelector("small").textContent = turboEnabled ? "Açık" : "Kapalı";
    updateSoundButton();
    updateHud();
    wallet.subscribe(handleWalletChange);
    window.addEventListener("pagehide", saveState);
    syncVisibility();
})();
