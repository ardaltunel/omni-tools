(function initForeheadGame() {
    "use strict";

    const Core = window.OmniForeheadCore;
    const Words = window.OmniForeheadWords;
    const panel = document.getElementById("nebuu");
    const app = document.getElementById("forehead-game-app");
    if (!Core || !Words || !panel || !app) return;

    const SETTINGS_KEY = "omni-forehead-settings-v1";
    const STATS_KEY = "omni-forehead-stats-v1";
    const params = new URL(window.location.href).searchParams;
    const debugEnabled = params.get("debug") === "1";
    const mobileDebug = params.get("mobileDebug") === "1";
    const element = (name) => document.getElementById(`forehead-game-${name}`);
    const elements = Object.fromEntries([
        "desktop", "mobile", "qr", "url", "copy-link", "menu", "best", "played", "total-correct",
        "word-total", "categories", "durations", "sound", "start", "menu-message", "preparing",
        "sensor-status", "ready", "preparing-back", "countdown", "countdown-value", "countdown-category",
        "play", "exit", "live-correct", "live-category", "timer-wrap", "timer", "word-kicker", "word",
        "feedback", "pass", "correct", "result", "result-title", "result-message", "result-correct",
        "result-pass", "result-total", "history", "replay", "categories-back", "orientation", "debug", "live",
        "debug-alpha", "debug-beta", "debug-gamma", "debug-orientation", "debug-reference", "debug-delta",
        "debug-locked", "debug-action", "debug-permission", "debug-device",
    ].map((name) => [name, element(name)]));
    if (Object.values(elements).some((value) => !value)) return;

    const screens = [elements.menu, elements.preparing, elements.countdown, elements.play, elements.result];
    const motion = Core.createMotionDetector();
    const settings = loadJson(SETTINGS_KEY, { category: "mixed", duration: 60, sound: true });
    const stats = loadJson(STATS_KEY, { best: 0, played: 0, totalCorrect: 0 });
    let gameState = Core.STATES.MENU;
    let resumeState = null;
    let selectedCategory = Words.byId[settings.category] ? settings.category : "mixed";
    let selectedDuration = [30, 60, 90, 120].includes(Number(settings.duration)) ? Number(settings.duration) : 60;
    let soundEnabled = settings.sound !== false;
    let deck = [];
    let deckPosition = 0;
    let currentWord = "";
    let history = [];
    let correctCount = 0;
    let passCount = 0;
    let remainingMs = selectedDuration * 1000;
    let deadline = 0;
    let timerId = 0;
    let calibrationTimer = 0;
    let feedbackTimer = 0;
    let countdownTimers = [];
    let actionLocked = false;
    let lastRenderedSecond = null;
    let lastTickSecond = null;
    let waitingForReady = false;
    let activeTool = false;
    let sensorAttached = false;
    let sensorSeen = false;
    let sensorPermission = "bekleniyor";
    let startPending = false;
    let wakeLock = null;
    let wakeLockPending = false;
    let audioContext = null;
    let deviceInfo = detectCurrentDevice();
    let latestOrientation = { alpha: null, beta: null, gamma: null, angle: getScreenAngle() };
    let lastDebugRender = 0;
    let orientationRefreshTimers = [];

    initialize();

    function initialize() {
        activeTool = panel.classList.contains("active");
        renderCategories();
        renderDuration();
        renderSettings();
        renderStats();
        bindEvents();
        updateViewportMetrics();
        refreshDeviceMode();
        setState(Core.STATES.MENU, true);
        showScreen(elements.menu);
        elements.debug.hidden = !debugEnabled;
    }

    function bindEvents() {
        elements.start.addEventListener("click", requestGameStart);
        elements.ready.addEventListener("click", armCountdown);
        elements["preparing-back"].addEventListener("click", showMenu);
        elements.sound.addEventListener("click", toggleSound);
        elements.pass.addEventListener("click", () => handleAction("pass", "touch"));
        elements.correct.addEventListener("click", () => handleAction("correct", "touch"));
        elements.exit.addEventListener("click", () => finishRound("Oyun Tamamlandı"));
        elements.replay.addEventListener("click", requestGameStart);
        elements["categories-back"].addEventListener("click", showMenu);
        elements["copy-link"].addEventListener("click", copyGameLink);
        elements.durations.addEventListener("click", handleDurationClick);
        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("tool-activated", handleToolActivated);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("resize", scheduleOrientationRefresh, { passive: true });
        window.addEventListener("orientationchange", scheduleOrientationRefresh, { passive: true });
        window.screen?.orientation?.addEventListener?.("change", scheduleOrientationRefresh);
        window.visualViewport?.addEventListener?.("resize", scheduleOrientationRefresh, { passive: true });
        window.addEventListener("beforeunload", cleanupRuntime);
    }

    function handleToolActivated(event) {
        activeTool = event.detail?.tool === "nebuu";
        if (!activeTool) {
            cleanupRuntime();
            hideOrientationOverlay();
            waitingForReady = false;
            setState(Core.STATES.MENU, true);
            showScreen(elements.menu);
            document.body.classList.remove("forehead-game-immersive");
            document.body.classList.remove("forehead-game-is-landscape");
            return;
        }
        deviceInfo = detectCurrentDevice();
        updateViewportMetrics();
        refreshDeviceMode();
        renderStats();
    }

    function detectCurrentDevice() {
        return Core.detectDevice({
            userAgent: navigator.userAgent,
            viewportWidth: window.innerWidth,
            maxTouchPoints: navigator.maxTouchPoints,
            touchCapable: "ontouchstart" in window || navigator.maxTouchPoints > 0,
            coarsePointer: window.matchMedia?.("(pointer: coarse)").matches,
            orientationSupported: "DeviceOrientationEvent" in window,
            mobileDebug,
        });
    }

    function refreshDeviceMode() {
        elements.desktop.hidden = deviceInfo.mobileLike;
        elements.mobile.hidden = !deviceInfo.mobileLike;
        elements.debug.hidden = !debugEnabled;
        elements["debug-device"].textContent = `${deviceInfo.deviceType}${mobileDebug ? " · debug" : ""}`;
        if (!deviceInfo.mobileLike) renderDesktopQr();
        else if (gameState === Core.STATES.MENU || gameState === Core.STATES.FINISHED) document.body.classList.remove("forehead-game-immersive");
    }

    function renderDesktopQr() {
        const gameUrl = getShareUrl();
        elements.url.textContent = gameUrl;
        elements.qr.replaceChildren();
        if (typeof window.QRCode !== "function") {
            elements.qr.textContent = "QR kodu yüklenemedi.";
            return;
        }
        new window.QRCode(elements.qr, {
            text: gameUrl,
            width: 208,
            height: 208,
            colorDark: "#101114",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel?.M,
        });
    }

    function getShareUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set("tool", "nebuu");
        url.searchParams.delete("mobileDebug");
        url.searchParams.delete("debug");
        return url.href;
    }

    async function copyGameLink() {
        const value = getShareUrl();
        try {
            await navigator.clipboard.writeText(value);
        } catch (_) {
            const input = document.createElement("textarea");
            input.value = value;
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.append(input);
            input.select();
            document.execCommand("copy");
            input.remove();
        }
        temporarilyLabel(elements["copy-link"], "Kopyalandı");
    }

    function renderCategories() {
        const fragment = document.createDocumentFragment();
        Words.categories.forEach((category) => {
            const button = document.createElement("button");
            const mark = document.createElement("span");
            const copy = document.createElement("span");
            const label = document.createElement("strong");
            const count = document.createElement("small");
            button.type = "button";
            button.className = "forehead-game-category";
            button.dataset.category = category.id;
            button.setAttribute("role", "radio");
            mark.className = "forehead-game-category-mark";
            mark.textContent = category.mark;
            label.textContent = category.label;
            count.textContent = `${category.words.length.toLocaleString("tr-TR")} kelime`;
            copy.append(label, count);
            button.append(mark, copy);
            button.addEventListener("click", () => selectCategory(category.id));
            fragment.append(button);
        });
        elements.categories.replaceChildren(fragment);
        updateCategorySelection();
        elements["word-total"].textContent = `${Words.total.toLocaleString("tr-TR")} özgün girdi`;
    }

    function selectCategory(categoryId) {
        if (!Words.byId[categoryId]) return;
        selectedCategory = categoryId;
        persistSettings();
        updateCategorySelection();
        playEffect("select");
    }

    function updateCategorySelection() {
        elements.categories.querySelectorAll("[data-category]").forEach((button) => {
            const active = button.dataset.category === selectedCategory;
            button.classList.toggle("active", active);
            button.setAttribute("aria-checked", String(active));
        });
    }

    function handleDurationClick(event) {
        const button = event.target.closest("[data-duration]");
        if (!button) return;
        selectedDuration = Number(button.dataset.duration);
        persistSettings();
        renderDuration();
        playEffect("select");
    }

    function renderDuration() {
        elements.durations.querySelectorAll("[data-duration]").forEach((button) => {
            const active = Number(button.dataset.duration) === selectedDuration;
            button.classList.toggle("active", active);
            button.setAttribute("aria-checked", String(active));
        });
    }

    function renderSettings() {
        elements.sound.classList.toggle("active", soundEnabled);
        elements.sound.setAttribute("aria-pressed", String(soundEnabled));
        elements.sound.setAttribute("aria-label", soundEnabled ? "Oyun seslerini kapat" : "Oyun seslerini aç");
        elements.sound.querySelector("span:last-child").textContent = soundEnabled ? "Ses Açık" : "Ses Kapalı";
    }

    function toggleSound() {
        soundEnabled = !soundEnabled;
        persistSettings();
        renderSettings();
        if (soundEnabled) playEffect("select");
    }

    function renderStats() {
        elements.best.textContent = Number(stats.best || 0);
        elements.played.textContent = Number(stats.played || 0);
        elements["total-correct"].textContent = Number(stats.totalCorrect || 0);
    }

    async function requestGameStart() {
        if (!activeTool || !deviceInfo.mobileLike || startPending
            || ![Core.STATES.MENU, Core.STATES.FINISHED].includes(gameState)) return;

        startPending = true;
        elements.start.disabled = true;
        elements.replay.disabled = true;
        clearMessage();
        ensureAudioContext();

        try {
            sensorPermission = await requestSensorPermission();
            if (!activeTool) return;
            updateDebugPermission();
            if (sensorPermission === "granted") attachSensor();
            prepareRound();
            waitingForReady = true;
            setState(Core.STATES.PREPARING, gameState === Core.STATES.FINISHED);
            showScreen(elements.preparing);
            updateSensorStatus();
            tryLockLandscape();
            document.body.classList.add("forehead-game-immersive");
            elements.ready.focus({ preventScroll: true });
        } finally {
            startPending = false;
            elements.start.disabled = false;
            elements.replay.disabled = false;
        }
    }

    async function requestSensorPermission() {
        if (!("DeviceOrientationEvent" in window)) return "unsupported";
        const requestPermission = window.DeviceOrientationEvent?.requestPermission;
        if (typeof requestPermission !== "function") return "granted";
        try {
            return (await requestPermission.call(window.DeviceOrientationEvent)) === "granted" ? "granted" : "denied";
        } catch (_) {
            return "denied";
        }
    }

    function prepareRound() {
        clearRuntimeTimers();
        deck = Core.createDeck(selectedCategory, Words);
        deckPosition = 0;
        currentWord = "";
        history = [];
        correctCount = 0;
        passCount = 0;
        remainingMs = selectedDuration * 1000;
        actionLocked = false;
        lastRenderedSecond = null;
        lastTickSecond = null;
        motion.reset();
        renderLiveScore();
    }

    function armCountdown() {
        if (gameState !== Core.STATES.PREPARING) return;
        waitingForReady = false;
        motion.reset();
        sensorSeen = false;
        if (!isLandscape()) {
            pauseForOrientation(Core.STATES.COUNTDOWN);
            return;
        }
        calibrateThenCountdown();
    }

    function calibrateThenCountdown() {
        hideOrientationOverlay();
        if (gameState === Core.STATES.PAUSED_ORIENTATION) setState(Core.STATES.PREPARING);
        showScreen(elements.preparing);
        updateSensorStatus("calibrating");
        window.clearTimeout(calibrationTimer);
        calibrationTimer = window.setTimeout(() => {
            calibrationTimer = 0;
            const calibrated = motion.snapshot().calibrated;
            updateSensorStatus(calibrated ? "ready" : "fallback");
            startCountdown();
        }, 850);
    }

    function startCountdown() {
        if (gameState !== Core.STATES.PREPARING) return;
        setState(Core.STATES.COUNTDOWN);
        showScreen(elements.countdown);
        elements["countdown-category"].textContent = Words.byId[selectedCategory].label;
        const sequence = ["3", "2", "1", "BAŞLA!"];
        sequence.forEach((value, index) => {
            const id = window.setTimeout(() => {
                if (gameState !== Core.STATES.COUNTDOWN) return;
                elements["countdown-value"].textContent = value;
                elements["countdown-value"].classList.toggle("is-start", index === sequence.length - 1);
                playEffect(index === sequence.length - 1 ? "start" : "countdown");
            }, index * 720);
            countdownTimers.push(id);
        });
        countdownTimers.push(window.setTimeout(startPlaying, 3 * 720 + 440));
    }

    function startPlaying() {
        if (gameState !== Core.STATES.COUNTDOWN) return;
        clearCountdownTimers();
        setState(Core.STATES.PLAYING);
        showScreen(elements.play);
        nextWord();
        deadline = Date.now() + remainingMs;
        renderTimer(true);
        startTimerLoop();
        requestWakeLock();
        document.body.classList.add("forehead-game-immersive");
        updateViewportMetrics();
    }

    function nextWord() {
        if (deckPosition >= deck.length) {
            finishRound("Kelime Havuzu Tamamlandı");
            return;
        }
        currentWord = deck[deckPosition];
        deckPosition += 1;
        elements.word.textContent = currentWord;
        elements["word-kicker"].textContent = "ANLAT";
        elements.word.classList.remove("is-entering");
        void elements.word.offsetWidth;
        elements.word.classList.add("is-entering");
    }

    function handleAction(action, source) {
        if (gameState !== Core.STATES.PLAYING || actionLocked || !currentWord) return;
        actionLocked = true;
        // A sensor action has already locked the detector at its own event
        // timestamp. Only fallback controls need to create that lock here.
        if (source !== "sensor") motion.forceLock(performance.now());
        const correct = action === "correct";
        history.push({ word: currentWord, status: action });
        if (correct) correctCount += 1;
        else passCount += 1;
        renderLiveScore();
        showFeedback(action);
        playEffect(action);
        vibrate(correct ? [30, 25, 35] : [65, 25, 35]);
        announce(correct ? `${currentWord}, doğru` : `${currentWord}, pas`);
        if (debugEnabled) elements["debug-action"].textContent = `${action} · ${source}`;
        window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => {
            feedbackTimer = 0;
            elements.feedback.hidden = true;
            if (gameState === Core.STATES.PLAYING || (gameState === Core.STATES.PAUSED_ORIENTATION && resumeState === Core.STATES.PLAYING)) {
                nextWord();
            }
            actionLocked = false;
        }, 390);
    }

    function showFeedback(action) {
        const correct = action === "correct";
        elements.feedback.textContent = correct ? "DOĞRU! ✓" : "PAS";
        elements.feedback.className = `forehead-game-feedback is-${action}`;
        elements.feedback.hidden = false;
    }

    function renderLiveScore() {
        elements["live-correct"].textContent = correctCount;
        elements["live-category"].textContent = Words.byId[selectedCategory].label;
    }

    function startTimerLoop() {
        window.clearInterval(timerId);
        timerId = window.setInterval(updateTimer, 100);
        updateTimer();
    }

    function updateTimer() {
        if (gameState !== Core.STATES.PLAYING) return;
        remainingMs = Math.max(0, deadline - Date.now());
        renderTimer();
        if (remainingMs <= 0) finishRound("Süre Bitti!");
    }

    function renderTimer(force = false) {
        const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
        if (!force && seconds === lastRenderedSecond) return;
        lastRenderedSecond = seconds;
        elements.timer.textContent = Core.formatTime(remainingMs);
        elements["timer-wrap"].classList.toggle("is-urgent", seconds <= 10);
        if (seconds <= 10 && seconds > 0 && seconds !== lastTickSecond) {
            lastTickSecond = seconds;
            playEffect("tick");
        }
    }

    function finishRound(title) {
        if (gameState === Core.STATES.FINISHED || gameState === Core.STATES.MENU) return;
        clearRuntimeTimers();
        detachSensor();
        releaseWakeLock();
        unlockOrientation();
        hideOrientationOverlay();
        setState(Core.STATES.FINISHED, true);
        document.body.classList.remove("forehead-game-immersive");
        elements["result-title"].textContent = title;
        elements["result-correct"].textContent = correctCount;
        elements["result-pass"].textContent = passCount;
        elements["result-total"].textContent = history.length;
        elements["result-message"].textContent = resultMessage(correctCount);
        renderHistory();
        updatePersistentStats();
        showScreen(elements.result);
        playEffect("finish");
        vibrate([80, 45, 110]);
        announce(`${title} ${correctCount} doğru, ${passCount} pas.`);
    }

    function resultMessage(score) {
        if (score >= 15) return "Muhteşem tur! Hareketler ve ipuçları tam uyum içindeydi.";
        if (score >= 8) return "Harika iş! Bir tur daha oynayıp rekorunu geliştirebilirsin.";
        if (score > 0) return "Güzel başlangıç! Yeni turda daha hızlı ipuçları deneyin.";
        return "Isınma turu tamamlandı. Dokunmatik kontrollerle de devam edebilirsin.";
    }

    function renderHistory() {
        const fragment = document.createDocumentFragment();
        history.forEach((item) => {
            const row = document.createElement("li");
            const mark = document.createElement("span");
            const word = document.createElement("strong");
            row.dataset.status = item.status;
            mark.textContent = item.status === "correct" ? "✓" : "↷";
            word.textContent = item.word;
            row.append(mark, word);
            fragment.append(row);
        });
        if (!history.length) {
            const empty = document.createElement("li");
            empty.className = "is-empty";
            empty.textContent = "Bu turda henüz kelime tamamlanmadı.";
            fragment.append(empty);
        }
        elements.history.replaceChildren(fragment);
    }

    function updatePersistentStats() {
        stats.best = Math.max(Number(stats.best || 0), correctCount);
        stats.played = Number(stats.played || 0) + 1;
        stats.totalCorrect = Number(stats.totalCorrect || 0) + correctCount;
        safeStorageSet(STATS_KEY, stats);
        renderStats();
    }

    function handleKeyboard(event) {
        if (!activeTool || gameState !== Core.STATES.PLAYING) return;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            handleAction("pass", "keyboard");
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            handleAction("correct", "keyboard");
        }
    }

    function attachSensor() {
        if (sensorAttached) return;
        window.addEventListener("deviceorientation", handleDeviceOrientation, true);
        sensorAttached = true;
    }

    function detachSensor() {
        if (!sensorAttached) return;
        window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
        sensorAttached = false;
    }

    function handleDeviceOrientation(event) {
        if (document.hidden) return;
        const sample = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, angle: getScreenAngle() };
        latestOrientation = sample;
        sensorSeen = [event.beta, event.gamma].some(Number.isFinite);
        const result = motion.ingest(sample, event.timeStamp || performance.now());
        if (gameState === Core.STATES.PREPARING && sensorSeen) updateSensorStatus(result.calibrated ? "ready" : "calibrating");
        if (gameState === Core.STATES.PLAYING && result.action) handleAction(result.action, "sensor");
        renderDebug(sample, result);
    }

    function updateSensorStatus(override) {
        let status = override;
        if (!status) {
            if (sensorPermission === "denied") status = "denied";
            else if (sensorPermission === "unsupported") status = "fallback";
            else status = sensorSeen ? "ready" : "waiting";
        }
        const messages = {
            waiting: ["Sensör bekleniyor", "Telefon hareket ettiğinde otomatik algılanacak."],
            calibrating: ["Nötr konum kalibre ediliyor", "Telefonu alnında kısa süre sabit tut."],
            ready: ["Hareket sensörü hazır", "Belirgin eğme hareketleri tek kez algılanacak."],
            denied: ["Sensör izni verilmedi", "PAS ve DOĞRU düğmeleriyle oynamaya devam edebilirsin."],
            fallback: ["Dokunmatik kontrol hazır", "Bu cihazda sensör verisi alınamadı; oyun yine çalışır."],
        };
        const [title, detail] = messages[status] || messages.waiting;
        elements["sensor-status"].dataset.status = status;
        elements["sensor-status"].querySelector("strong").textContent = title;
        elements["sensor-status"].querySelector("small").textContent = detail;
    }

    function renderDebug(sample, result) {
        if (!debugEnabled) return;
        const now = performance.now();
        if (now - lastDebugRender < 90) return;
        lastDebugRender = now;
        elements["debug-alpha"].textContent = formatSensor(sample.alpha);
        elements["debug-beta"].textContent = formatSensor(sample.beta);
        elements["debug-gamma"].textContent = formatSensor(sample.gamma);
        elements["debug-orientation"].textContent = `${sample.angle}° · ${isLandscape() ? "yatay" : "dikey"}`;
        elements["debug-reference"].textContent = formatSensor(result.reference);
        elements["debug-delta"].textContent = formatSensor(result.delta);
        elements["debug-locked"].textContent = String(result.locked);
        elements["debug-action"].textContent = result.action || result.detectedAction || "-";
    }

    function updateDebugPermission() {
        elements["debug-permission"].textContent = sensorPermission;
    }

    function formatSensor(value) {
        return Number.isFinite(value) ? Number(value).toFixed(1) : "-";
    }

    function scheduleOrientationRefresh() {
        orientationRefreshTimers.forEach((id) => window.clearTimeout(id));
        orientationRefreshTimers = [];
        updateViewportMetrics();
        handleOrientationChange();
        [120, 360].forEach((delay) => {
            orientationRefreshTimers.push(window.setTimeout(() => {
                updateViewportMetrics();
                handleOrientationChange();
            }, delay));
        });
    }

    function handleOrientationChange() {
        updateViewportMetrics();
        latestOrientation.angle = getScreenAngle();
        if (!activeTool || !deviceInfo.mobileLike || waitingForReady) return;
        if (!isLandscape() && [Core.STATES.PREPARING, Core.STATES.COUNTDOWN, Core.STATES.PLAYING].includes(gameState)) {
            pauseForOrientation(gameState === Core.STATES.PREPARING ? Core.STATES.COUNTDOWN : gameState);
            return;
        }
        if (isLandscape() && gameState === Core.STATES.PAUSED_ORIENTATION) resumeAfterOrientation();
    }

    function pauseForOrientation(targetState) {
        if (gameState === Core.STATES.PAUSED_ORIENTATION) return;
        if (gameState === Core.STATES.PLAYING) remainingMs = Math.max(0, deadline - Date.now());
        clearTimerLoop();
        clearCountdownTimers();
        window.clearTimeout(calibrationTimer);
        calibrationTimer = 0;
        resumeState = targetState;
        setState(Core.STATES.PAUSED_ORIENTATION);
        elements.orientation.hidden = false;
        document.body.classList.add("forehead-game-immersive");
        updateViewportMetrics();
        releaseWakeLock();
    }

    function resumeAfterOrientation() {
        const target = resumeState || Core.STATES.PREPARING;
        resumeState = null;
        hideOrientationOverlay();
        if (target === Core.STATES.PLAYING) {
            setState(Core.STATES.PLAYING);
            showScreen(elements.play);
            motion.reset();
            actionLocked = false;
            deadline = Date.now() + remainingMs;
            startTimerLoop();
            requestWakeLock();
            return;
        }
        setState(Core.STATES.PREPARING);
        calibrateThenCountdown();
    }

    function hideOrientationOverlay() {
        elements.orientation.hidden = true;
    }

    function isLandscape() {
        const viewport = window.visualViewport;
        const width = Number(viewport?.width || window.innerWidth);
        const height = Number(viewport?.height || window.innerHeight);
        return width > height || Boolean(window.matchMedia?.("(orientation: landscape)").matches);
    }

    function getScreenAngle() {
        return Core.resolveOrientationAngle({
            screenAngle: window.screen?.orientation?.angle,
            windowAngle: window.orientation,
            orientationType: window.screen?.orientation?.type,
            landscape: isLandscape(),
        });
    }

    function updateViewportMetrics() {
        const viewport = window.visualViewport;
        const height = Math.max(1, Math.round(Number(viewport?.height || window.innerHeight)));
        document.documentElement.style.setProperty("--forehead-game-viewport-height", `${height}px`);
        document.body.classList.toggle("forehead-game-is-landscape", isLandscape());
    }

    function tryLockLandscape() {
        try {
            const promise = window.screen?.orientation?.lock?.("landscape");
            promise?.catch?.(() => {});
        } catch (_) {
            // Most browsers only allow locking from fullscreen installed apps.
        }
    }

    function unlockOrientation() {
        try { window.screen?.orientation?.unlock?.(); } catch (_) { /* Lock may not be owned by this page. */ }
    }

    async function requestWakeLock() {
        if (!navigator.wakeLock?.request || document.hidden || gameState !== Core.STATES.PLAYING
            || wakeLock || wakeLockPending) return;
        wakeLockPending = true;
        try {
            const lock = await navigator.wakeLock.request("screen");
            if (document.hidden || gameState !== Core.STATES.PLAYING || wakeLock) {
                lock.release().catch(() => {});
                return;
            }
            wakeLock = lock;
            lock.addEventListener("release", () => {
                if (wakeLock === lock) wakeLock = null;
            }, { once: true });
        } catch (_) {
            wakeLock = null;
        } finally {
            wakeLockPending = false;
        }
    }

    function releaseWakeLock() {
        const lock = wakeLock;
        wakeLock = null;
        lock?.release?.().catch?.(() => {});
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            if (gameState === Core.STATES.PLAYING) {
                remainingMs = Math.max(0, deadline - Date.now());
                clearTimerLoop();
            }
            releaseWakeLock();
            return;
        }
        if (gameState === Core.STATES.PLAYING) {
            deadline = Date.now() + remainingMs;
            startTimerLoop();
            requestWakeLock();
        }
    }

    function showMenu() {
        cleanupRuntime();
        hideOrientationOverlay();
        document.body.classList.remove("forehead-game-immersive");
        document.body.classList.remove("forehead-game-is-landscape");
        setState(Core.STATES.MENU, true);
        showScreen(elements.menu);
        waitingForReady = false;
        renderStats();
        elements.start.focus({ preventScroll: true });
    }

    function cleanupRuntime() {
        clearRuntimeTimers();
        orientationRefreshTimers.forEach((id) => window.clearTimeout(id));
        orientationRefreshTimers = [];
        detachSensor();
        releaseWakeLock();
        unlockOrientation();
    }

    function clearRuntimeTimers() {
        clearTimerLoop();
        clearCountdownTimers();
        window.clearTimeout(calibrationTimer);
        window.clearTimeout(feedbackTimer);
        calibrationTimer = 0;
        feedbackTimer = 0;
    }

    function clearTimerLoop() {
        window.clearInterval(timerId);
        timerId = 0;
    }

    function clearCountdownTimers() {
        countdownTimers.forEach((id) => window.clearTimeout(id));
        countdownTimers = [];
    }

    function setState(nextState, force = false) {
        if (!force && gameState !== nextState && !Core.canTransition(gameState, nextState)) return false;
        gameState = nextState;
        app.dataset.state = nextState;
        return true;
    }

    function showScreen(target) {
        screens.forEach((screen) => { screen.hidden = screen !== target; });
    }

    function ensureAudioContext() {
        if (!soundEnabled) return null;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        try {
            if (!audioContext) audioContext = new AudioContext();
            if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
            return audioContext;
        } catch (_) {
            return null;
        }
    }

    function playEffect(name) {
        if (!soundEnabled) return;
        const context = ensureAudioContext();
        if (!context) return;
        const patterns = {
            select: [[420, 0.07, 0]],
            countdown: [[520, 0.08, 0]],
            start: [[520, 0.09, 0], [720, 0.16, 0.1]],
            correct: [[520, 0.09, 0], [760, 0.16, 0.08]],
            pass: [[260, 0.13, 0], [190, 0.15, 0.09]],
            tick: [[640, 0.045, 0]],
            finish: [[392, 0.12, 0], [523, 0.14, 0.11], [659, 0.28, 0.23]],
        };
        (patterns[name] || []).forEach(([frequency, duration, delay]) => playTone(context, frequency, duration, delay, name === "pass" ? "triangle" : "sine"));
    }

    function playTone(context, frequency, duration, delay, type) {
        try {
            const start = context.currentTime + delay;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.028, start + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.02);
        } catch (_) {
            // Audio is an optional enhancement.
        }
    }

    function vibrate(pattern) {
        try { navigator.vibrate?.(pattern); } catch (_) { /* Vibration is optional. */ }
    }

    function persistSettings() {
        safeStorageSet(SETTINGS_KEY, { category: selectedCategory, duration: selectedDuration, sound: soundEnabled });
    }

    function loadJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value && typeof value === "object" ? value : { ...fallback };
        } catch (_) {
            return { ...fallback };
        }
    }

    function safeStorageSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Privacy mode can disable storage. */ }
    }

    function announce(message) {
        elements.live.textContent = "";
        window.requestAnimationFrame(() => { elements.live.textContent = message; });
    }

    function clearMessage() {
        elements["menu-message"].textContent = "";
    }

    function temporarilyLabel(button, text) {
        const previous = button.textContent;
        button.textContent = text;
        window.setTimeout(() => { button.textContent = previous; }, 1200);
    }
})();
