(function initPasswordGameApp() {
    "use strict";

    const engine = window.PasswordGameEngine;
    const rules = window.PasswordGameRules;
    const utils = window.PasswordGameUtils;
    const panel = document.getElementById("password-game");
    if (!engine || !rules || !utils || !panel) return;

    const STORAGE_KEY = "omni-password-game-stats-v1";
    const get = (id) => document.getElementById(id);
    const elements = {
        start: get("password-game-start"),
        play: get("password-game-play"),
        result: get("password-game-result"),
        modeButtons: Array.from(panel.querySelectorAll("[data-password-game-mode]")),
        modeLabel: get("password-game-mode-label"),
        time: get("password-game-time"),
        progress: get("password-game-progress"),
        errors: get("password-game-errors"),
        sound: get("password-game-sound"),
        input: get("password-game-input"),
        toggle: get("password-game-toggle"),
        length: get("password-game-length"),
        progressTrack: panel.querySelector(".password-game-progress-track"),
        progressBar: get("password-game-progress-bar"),
        finish: get("password-game-finish"),
        rules: get("password-game-rules"),
        resultMark: panel.querySelector(".password-game-result-mark"),
        resultKicker: get("password-game-result-kicker"),
        resultTitle: get("password-game-result-title"),
        resultCopy: get("password-game-result-copy"),
        resultRules: get("password-game-result-rules"),
        resultTime: get("password-game-result-time"),
        resultLength: get("password-game-result-length"),
        resultErrors: get("password-game-result-errors"),
        replay: get("password-game-replay"),
        share: get("password-game-share"),
        home: get("password-game-home"),
        shareStatus: get("password-game-share-status"),
        live: get("password-game-live"),
    };

    const defaultStats = Object.freeze({ totalGames: 0, completedGames: 0, bestRule: 0, fastestSeconds: 0, dailyStreak: 0, lastPlayedDate: "" });
    let stats = loadStats();
    let audioContext = null;
    let game = createEmptyGame();

    function createEmptyGame() {
        return {
            active: false,
            mode: "normal",
            context: null,
            unlocked: 1,
            errors: 0,
            startedAt: 0,
            elapsedSeconds: 0,
            remainingSeconds: 300,
            timer: null,
            soundEnabled: true,
            previousStatuses: new Map(),
            revealToken: 0,
            newRuleId: 1,
            brokenRuleIds: new Set(),
            resultData: null,
        };
    }

    function loadStats() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            if (!parsed || typeof parsed !== "object") return { ...defaultStats };
            return {
                totalGames: Math.max(0, Number(parsed.totalGames) || 0),
                completedGames: Math.max(0, Number(parsed.completedGames) || 0),
                bestRule: Math.max(0, Math.min(30, Number(parsed.bestRule) || 0)),
                fastestSeconds: Math.max(0, Number(parsed.fastestSeconds) || 0),
                dailyStreak: Math.max(0, Number(parsed.dailyStreak) || 0),
                lastPlayedDate: typeof parsed.lastPlayedDate === "string" ? parsed.lastPlayedDate : "",
            };
        } catch {
            return { ...defaultStats };
        }
    }

    function saveStats() {
        const safeStats = {
            totalGames: stats.totalGames,
            completedGames: stats.completedGames,
            bestRule: stats.bestRule,
            fastestSeconds: stats.fastestSeconds,
            dailyStreak: stats.dailyStreak,
            lastPlayedDate: stats.lastPlayedDate,
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safeStats)); } catch { /* İstatistikler olmadan devam edilir. */ }
    }

    function updateDailyStreak() {
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (stats.lastPlayedDate === todayKey) return;
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        stats.dailyStreak = stats.lastPlayedDate === yesterdayKey ? stats.dailyStreak + 1 : 1;
        stats.lastPlayedDate = todayKey;
    }

    function createSeed() {
        if (window.crypto?.getRandomValues) {
            const values = new Uint32Array(2);
            window.crypto.getRandomValues(values);
            return `${values[0]}-${values[1]}`;
        }
        return `${Date.now()}-${Math.random()}`;
    }

    function createSolvableContext() {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const context = engine.createGameContext({ seed: createSeed() });
            if (engine.verifySolvable(context).solvable) return context;
        }
        return engine.createGameContext({ seed: "omni-guvenli-yedek" });
    }

    function startGame(mode) {
        stopTimer();
        game = createEmptyGame();
        game.active = true;
        game.mode = mode === "timed" ? "timed" : "normal";
        game.context = createSolvableContext();
        game.startedAt = Date.now();
        stats.totalGames += 1;
        updateDailyStreak();
        stats.bestRule = Math.max(stats.bestRule, 1);
        saveStats();

        elements.input.value = "";
        elements.input.type = "text";
        elements.toggle.textContent = "Gizle";
        elements.toggle.setAttribute("aria-pressed", "true");
        elements.start.hidden = true;
        elements.result.hidden = true;
        elements.play.hidden = false;
        elements.modeLabel.textContent = game.mode === "timed" ? "Süreli" : "Normal";
        elements.shareStatus.textContent = "";
        elements.sound.textContent = "🔊 Ses Açık";
        elements.sound.setAttribute("aria-pressed", "true");
        renderGame();
        game.timer = window.setInterval(updateTimer, 250);
        elements.input.focus();
        playTone("new");
    }

    function stopTimer() {
        if (game.timer) window.clearInterval(game.timer);
        game.timer = null;
    }

    function updateTimer() {
        if (!game.active) return;
        game.elapsedSeconds = Math.floor((Date.now() - game.startedAt) / 1000);
        if (game.mode === "timed") {
            game.remainingSeconds = Math.max(0, 300 - game.elapsedSeconds);
            elements.time.textContent = utils.formatTime(game.remainingSeconds);
            if (game.remainingSeconds <= 0) showResult(false);
        } else {
            elements.time.textContent = utils.formatTime(game.elapsedSeconds);
        }
    }

    function evaluateCurrent(countErrors) {
        const results = engine.evaluateRules(elements.input.value, game.context, game.unlocked);
        const broken = new Set();
        if (countErrors) {
            results.forEach((result) => {
                if (game.previousStatuses.get(result.id) === true && !result.passed) {
                    game.errors += 1;
                    broken.add(result.id);
                    playTone("error");
                }
            });
        }
        results.forEach((result) => game.previousStatuses.set(result.id, result.passed));
        game.brokenRuleIds = broken;
        return results;
    }

    function renderGame(results = evaluateCurrent(false)) {
        const length = utils.characters(elements.input.value).length;
        elements.length.textContent = `${length} karakter`;
        elements.progress.textContent = `${game.unlocked} / 30`;
        elements.errors.textContent = String(game.errors);
        elements.progressTrack.setAttribute("aria-valuenow", String(game.unlocked));
        elements.progressBar.style.width = `${(game.unlocked / 30) * 100}%`;
        if (game.mode === "timed") elements.time.textContent = utils.formatTime(game.remainingSeconds);
        else elements.time.textContent = utils.formatTime(game.elapsedSeconds);
        renderRules(results);
        const allActivePass = results.length === game.unlocked && results.every((result) => result.passed);
        elements.finish.disabled = game.unlocked < 30 || !allActivePass;
    }

    function renderRules(results) {
        const resultMap = new Map(results.map((result) => [result.id, result.passed]));
        const fragment = document.createDocumentFragment();
        const visibleRules = rules.slice(0, game.unlocked).reverse();
        visibleRules.sort((first, second) => {
            const firstPassed = resultMap.get(first.id) === true;
            const secondPassed = resultMap.get(second.id) === true;
            if (firstPassed === secondPassed) return 0;
            return firstPassed ? 1 : -1;
        });
        visibleRules.forEach((rule) => {
            const passed = resultMap.get(rule.id) === true;
            const card = document.createElement("article");
            const icon = document.createElement("span");
            const copy = document.createElement("div");
            const number = document.createElement("span");
            const title = document.createElement("h4");
            const description = document.createElement("p");

            card.className = `password-game-rule${passed ? " is-passed" : ""}${rule.id === game.unlocked ? " is-latest" : ""}${rule.id === game.newRuleId ? " is-new" : ""}${game.brokenRuleIds.has(rule.id) ? " is-broken" : ""}`;
            card.dataset.ruleId = String(rule.id);
            icon.className = "password-game-rule-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = passed ? "✓" : "×";
            copy.className = "password-game-rule-copy";
            number.textContent = `Kural ${rule.id}`;
            title.textContent = rule.title;
            description.textContent = rule.description(game.context);
            copy.append(number, title, description);

            if (rule.id === 15) copy.append(createColorPuzzle());
            card.append(icon, copy);
            fragment.append(card);
        });
        elements.rules.replaceChildren(fragment);
        const newCard = elements.rules.querySelector(`[data-rule-id="${game.newRuleId}"]`);
        if (newCard) window.requestAnimationFrame(() => newCard.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
        game.newRuleId = 0;
        game.brokenRuleIds = new Set();
    }

    function createColorPuzzle() {
        const wrap = document.createElement("div");
        const swatch = document.createElement("span");
        wrap.className = "password-game-color-puzzle";
        swatch.className = "password-game-color-swatch";
        swatch.style.background = game.context.color.hex;
        swatch.setAttribute("aria-label", `${game.context.color.name} renk örneği`);
        wrap.append(swatch);
        game.context.colorOptions.forEach((color) => {
            const option = document.createElement("span");
            option.className = "password-game-color-option";
            option.textContent = color.hex;
            wrap.append(option);
        });
        return wrap;
    }

    function handlePasswordInput() {
        if (!game.active) return;
        game.revealToken += 1;
        const token = game.revealToken;
        const results = evaluateCurrent(true);
        renderGame(results);
        unlockNextRule(token);
    }

    function unlockNextRule(token) {
        if (!game.active || token !== game.revealToken || game.unlocked >= 30) return;
        const currentResults = engine.evaluateRules(elements.input.value, game.context, game.unlocked);
        if (!currentResults.every((result) => result.passed)) return;
        window.setTimeout(() => {
            if (!game.active || token !== game.revealToken) return;
            game.unlocked += 1;
            game.newRuleId = game.unlocked;
            stats.bestRule = Math.max(stats.bestRule, game.unlocked);
            saveStats();
            playTone("new");
            elements.live.textContent = `Kural ${game.unlocked} açıldı: ${rules[game.unlocked - 1].title}.`;
            const results = evaluateCurrent(false);
            renderGame(results);
            unlockNextRule(token);
        }, 220);
    }

    function showResult(completed) {
        if (!game.context) return;
        stopTimer();
        game.active = false;
        game.elapsedSeconds = Math.floor((Date.now() - game.startedAt) / 1000);
        const passwordLength = utils.characters(elements.input.value).length;
        game.resultData = { completed, rules: completed ? 30 : game.unlocked, elapsedSeconds: game.elapsedSeconds, errors: game.errors, length: passwordLength, mode: game.mode };
        elements.input.value = "";
        elements.input.type = "password";

        if (completed) {
            stats.completedGames += 1;
            stats.bestRule = 30;
            if (!stats.fastestSeconds || game.elapsedSeconds < stats.fastestSeconds) stats.fastestSeconds = game.elapsedSeconds;
        }
        saveStats();

        elements.play.hidden = true;
        elements.start.hidden = true;
        elements.result.hidden = false;
        elements.resultMark.textContent = completed ? "🏆" : "⏳";
        elements.resultKicker.textContent = completed ? "Oyun Tamamlandı" : "Süre Doldu";
        elements.resultTitle.textContent = completed ? "ŞİFRE USTASI!" : "ZAMAN DOLDU";
        elements.resultCopy.textContent = completed ? "Tüm kuralları aynı anda yerine getirmeyi başardın." : `${game.unlocked}. kurala kadar ulaştın. Yeni bir denemeyle daha ileri gidebilirsin.`;
        elements.resultRules.textContent = `${game.resultData.rules} / 30`;
        elements.resultTime.textContent = utils.formatTime(game.elapsedSeconds);
        elements.resultLength.textContent = String(passwordLength);
        elements.resultErrors.textContent = String(game.errors);
        elements.shareStatus.textContent = "";
        playTone(completed ? "complete" : "error");
    }

    function finishGame() {
        if (!game.active || game.unlocked !== 30 || !engine.allRulesPass(elements.input.value, game.context)) return;
        showResult(true);
    }

    function createShareText() {
        const result = game.resultData;
        if (!result) return "";
        return `🔐 Şifre Oyunu\n\n${result.rules}/30 kuralı tamamladım!\n⏱ ${utils.formatTime(result.elapsedSeconds)}\n❌ ${result.errors} hata\n\nSen kaç kurala dayanabilirsin?`;
    }

    async function copyShareText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.append(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
    }

    async function shareResult() {
        const text = createShareText();
        if (!text) return;
        try {
            if (navigator.share) {
                await navigator.share({ title: "Şifre Oyunu", text });
                elements.shareStatus.textContent = "Sonuç paylaşıldı.";
                return;
            }
            await copyShareText(text);
            elements.shareStatus.textContent = "Sonuç panoya kopyalandı.";
        } catch (error) {
            if (error?.name !== "AbortError") elements.shareStatus.textContent = "Paylaşım tamamlanamadı.";
        }
    }

    function playTone(type) {
        if (!game.soundEnabled) return;
        try {
            audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const frequencies = { new: 620, error: 180, complete: 840 };
            oscillator.frequency.value = frequencies[type] || 440;
            oscillator.type = type === "error" ? "sawtooth" : "sine";
            gain.gain.setValueAtTime(.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(.06, audioContext.currentTime + .01);
            gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + (type === "complete" ? .34 : .14));
            oscillator.connect(gain).connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + (type === "complete" ? .35 : .15));
        } catch { /* Ses desteği yoksa oyun sessiz devam eder. */ }
    }

    function leaveGame() {
        game.revealToken += 1;
        stopTimer();
        elements.input.value = "";
        elements.input.type = "password";
        elements.start.hidden = false;
        elements.play.hidden = true;
        elements.result.hidden = true;
        game.active = false;
        game.context = null;
    }

    elements.modeButtons.forEach((button) => button.addEventListener("click", () => startGame(button.dataset.passwordGameMode)));
    elements.input.addEventListener("input", handlePasswordInput);
    elements.toggle.addEventListener("click", () => {
        const show = elements.input.type === "password";
        elements.input.type = show ? "text" : "password";
        elements.toggle.textContent = show ? "Gizle" : "Göster";
        elements.toggle.setAttribute("aria-pressed", String(show));
        elements.input.focus({ preventScroll: true });
    });
    elements.sound.addEventListener("click", () => {
        game.soundEnabled = !game.soundEnabled;
        elements.sound.textContent = game.soundEnabled ? "🔊 Ses Açık" : "🔇 Sessiz";
        elements.sound.setAttribute("aria-pressed", String(game.soundEnabled));
        if (game.soundEnabled) playTone("new");
    });
    elements.finish.addEventListener("click", finishGame);
    elements.replay.addEventListener("click", () => startGame(game.resultData?.mode || "normal"));
    elements.share.addEventListener("click", shareResult);
    elements.home.addEventListener("click", () => document.querySelector(".brand")?.click());
    document.addEventListener("tool-activated", (event) => { if (event.detail?.tool !== "password-game") leaveGame(); });
    document.querySelector(".brand")?.addEventListener("click", leaveGame);
    new MutationObserver(() => { if (!panel.classList.contains("active") && (game.active || elements.input.value)) leaveGame(); }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("pagehide", leaveGame);

}());
