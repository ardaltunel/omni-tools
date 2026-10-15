(function initAmbientDisplay() {
    "use strict";

    const core = window.AmbientCore;
    const panel = document.getElementById("ambient-display");
    const root = document.getElementById("ambient-display-root");
    if (!core || !panel || !root) return;

    const icons = {
        back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h13"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="2.5" fill="currentColor" stroke="none"/></svg>',
        expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg>',
        collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h4V4m12 4h-4V4M8 20v-4H4m12 4v-4h4"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
        orb: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width=".8"/><ellipse cx="9" cy="9" rx="8" ry="3" stroke="currentColor" stroke-width=".8" transform="rotate(-35 9 9)"/></svg>',
    };

    const copy = {
        tr: {
            title: "Ambiyans Ekranı", description: "Kendi atmosferini oluştur. Hazır olduğunda tam ekrana geç.", fullscreenLabel: "Tam ekran",
            experience: "Ambiyans Ekranı — dijital duvar kâğıdı", productName: "AMBİYANS", productType: "EKRANI", back: "Omni Tools'a dön", fullscreen: "Tam ekranı aç", exitFullscreen: "Tam ekrandan çık",
            settings: "Görünümü kişiselleştir", close: "Ayarları kapat", eyebrow: "SANA AİT BİR ALAN", settingsTitle: "Kendi ritmini bul.",
            scenes: "Atmosfer", clock: "Saat & yerleşim", motion: "Işık & hareket", display: "Ekran", language: "Dil", format: "Saat biçimi",
            format24: "24 saat", format12: "12 saat", size: "Saat boyutu", position: "Konum", center: "Orta", left: "Sol", right: "Sağ",
            seconds: "Saniyeler", date: "Tarih", animations: "Yavaş animasyonlar", animationsDescription: "Akıcı ışıklar ve imlece duyarlı hareket.", intensity: "Işık yoğunluğu",
            palette: "Stüdyo rengi", black: "Gerçek siyah · OLED", ivory: "Kırık beyaz", charcoal: "Antrasit",
            quality: "Performans", qualityLow: "Düşük güç", qualityBalanced: "Dengeli (önerilen)", qualityHigh: "Yüksek kalite",
            qualityLowDescription: "Sabit arka plan ve kapalı fare efektleriyle en az kaynak kullanımı.",
            qualityBalancedDescription: "Akıcı ışıklar ve fareye tepki; günlük kullanım için daha hafif çizim.",
            qualityHighDescription: "En ayrıntılı ışıklar, derinlik ve fare efektleri; daha fazla enerji kullanır.",
            drift: "Yavaş konum kaydırma", driftDescription: "Uzun oturumlarda saati hafifçe hareket ettir.",
            wake: "Ekranı açık tut", wakeDescription: "Bu görünüm açıkken ekranın uyumasını önle.",
            wakeUnsupported: "Bu tarayıcıda ekranı açık tutma desteği yok.", reduced: "Sisteminin azaltılmış hareket tercihi açık. Animasyonlar ve konum kaydırma duraklatıldı.",
            footer: "Bu cihazda kaydedilir · Hesap gerekmez", hint: "Kontroller için fareyi hareket ettir", heading: "Nefes al. Sadece burada ol.",
            studioHeading: "ŞİMDİ. BURADA.", cyberHeading: "KENDİ FREKANSINDA.", message: "Biraz yavaşlamak için bir alan.",
            studioMessage: "Daha azı. Tam ihtiyacın olan.", cyberMessage: "Dünya bekleyebilir.",
            storageError: "Tercihler kaydedilemedi. Bu oturumda çalışmaya devam edecekler.",
            fullscreenUnsupported: "Tarayıcın tam ekranı desteklemiyor. Ambiyans Ekranı sayfa içinde kullanılabilir.",
            fullscreenError: "Tam ekran açılamadı. Tarayıcının tam ekran iznini kontrol edip yeniden dene.",
            wakeError: "Ekran açık tutulamadı. Tarayıcı veya güç tasarrufu ayarı izin vermiyor olabilir.",
            wakeActive: "Ekran açık tutuluyor.", wakeReleased: "Ekran kilidi sistem tarafından serbest bırakıldı. Yeniden denemek için bu ayarı kapatıp aç.",
        },
        en: {
            title: "Ambient Display", description: "Create your atmosphere. Go fullscreen when you're ready.", fullscreenLabel: "Fullscreen",
            experience: "Ambient Display — digital wallpaper", productName: "AMBIENT", productType: "DISPLAY", back: "Back to Omni Tools", fullscreen: "Enter fullscreen", exitFullscreen: "Exit fullscreen",
            settings: "Personalize your display", close: "Close settings", eyebrow: "MAKE IT YOURS", settingsTitle: "Find your own rhythm.",
            scenes: "Atmosphere", clock: "Clock & composition", motion: "Light & motion", display: "Display", language: "Language", format: "Time format",
            format24: "24 hour", format12: "12 hour", size: "Clock size", position: "Position", center: "Center", left: "Left", right: "Right",
            seconds: "Seconds", date: "Date", animations: "Slow animations", animationsDescription: "Flowing light with gentle cursor interaction.", intensity: "Light intensity",
            palette: "Studio color", black: "True black · OLED", ivory: "Off-white", charcoal: "Charcoal",
            quality: "Performance", qualityLow: "Low power", qualityBalanced: "Balanced", qualityHigh: "High quality",
            qualityLowDescription: "A static background and no mouse effects for the lowest resource use.",
            qualityBalancedDescription: "Recommended for everyday use: flowing light and mouse interaction with lighter rendering.",
            qualityHighDescription: "Full lighting detail, depth and mouse effects; uses more energy.",
            drift: "Gentle clock drift", driftDescription: "Subtly shift the clock during long sessions.",
            wake: "Keep screen awake", wakeDescription: "Prevent sleep while this display is open.",
            wakeUnsupported: "Screen Wake Lock is unavailable in this browser.", reduced: "Your system prefers reduced motion. Animations and clock drift are paused.",
            footer: "Saved on this device · No account needed", hint: "Move your mouse to reveal controls", heading: "Breathe. Just be.",
            studioHeading: "HERE. NOW.", cyberHeading: "ON YOUR FREQUENCY.", message: "A little space to slow down.",
            studioMessage: "Less. Just enough.", cyberMessage: "The world can wait.",
            storageError: "Preferences could not be saved. They will still work during this session.",
            fullscreenUnsupported: "This browser does not support fullscreen. You can still use the display inside the page.",
            fullscreenError: "Fullscreen could not start. Check your browser's fullscreen permission and try again.",
            wakeError: "The screen could not be kept awake. Browser or power saving settings may prevent it.",
            wakeActive: "Keeping your screen awake.", wakeReleased: "The system released the screen lock. Toggle this setting off and on to try again.",
        },
    };
    const sceneNames = { aurora: "Aurora Flow", studio: "Minimal Studio", cyber: "Cyber Desk" };

    function switchRow(id, key, description = "") {
        return `<label class="ambient-switch-row" for="${id}"><span><strong data-ambient-copy="${key}"></strong>${description ? `<small data-ambient-copy="${description}"></small>` : ""}</span><input id="${id}" type="checkbox" role="switch"></label>`;
    }

    root.innerHTML = `
        <div class="ambient-stage" id="ambient-stage" data-design="aurora" data-palette="black" data-position="center" data-animations="true" data-drift="false" data-paused="true" data-quality="balanced">
            <div class="ambient-backdrop" aria-hidden="true">
                <canvas id="ambient-canvas"></canvas>
                <div class="ambient-fallback"></div><div class="ambient-pointer-light"></div><div class="ambient-studio-light"></div>
                <div class="ambient-cyber-grid"></div><div class="ambient-cyber-orbit"></div>
                <div class="ambient-vignette"></div>
            </div>
            <div class="ambient-composition">
                <div class="ambient-clock-wrap">
                    <p class="ambient-clock-heading" id="ambient-clock-heading"></p>
                    <div class="ambient-time-line">
                        <time id="ambient-time" class="ambient-time"><span id="ambient-hours">00</span><span class="ambient-colon">:</span><span id="ambient-minutes">00</span></time>
                        <span class="ambient-clock-detail"><span id="ambient-seconds" class="ambient-seconds" hidden>00</span><span id="ambient-period" class="ambient-period" hidden></span></span>
                    </div>
                    <p id="ambient-date" class="ambient-date"></p>
                    <p id="ambient-message" class="ambient-message"></p>
                </div>
            </div>
            <div class="ambient-chrome">
                <div class="ambient-topbar">
                    <button id="ambient-back" class="ambient-back" type="button">${icons.back}<span>OMNI TOOLS</span></button>
                    <div class="ambient-product" aria-hidden="true">${icons.orb}<span><span data-ambient-copy="productName"></span> <span class="ambient-product-light" data-ambient-copy="productType"></span></span></div>
                </div>
                <div class="ambient-bottom-bar">
                    <div class="ambient-scene-caption"><span class="ambient-scene-number">01 / 03</span><span class="ambient-scene-name">Aurora Flow</span></div>
                    <div class="ambient-toolbar">
                        <button id="ambient-fullscreen" class="ambient-icon-button" type="button" aria-pressed="false">${icons.expand}</button>
                        <button id="ambient-settings-toggle" class="ambient-icon-button" type="button" aria-expanded="false" aria-controls="ambient-settings">${icons.settings}</button>
                    </div>
                </div>
                <span class="ambient-idle-hint" data-ambient-copy="hint"></span>
            </div>
            <section id="ambient-settings" class="ambient-settings" role="dialog" aria-modal="false" aria-labelledby="ambient-settings-title" hidden>
                <header class="ambient-settings-header">
                    <div><span class="ambient-settings-eyebrow" data-ambient-copy="eyebrow"></span><h2 id="ambient-settings-title" data-ambient-copy="settingsTitle"></h2></div>
                    <button id="ambient-settings-close" class="ambient-icon-button" type="button">${icons.close}</button>
                </header>
                <div class="ambient-settings-content">
                    <section class="ambient-setting-group">
                        <h3 class="ambient-group-title" data-ambient-copy="scenes"></h3>
                        <div class="ambient-scene-options">
                            ${Object.entries(sceneNames).map(([scene, name], index) => `<button class="ambient-scene-option" type="button" data-scene="${scene}" aria-pressed="${index === 0}"><span class="ambient-scene-preview ambient-preview-${scene}" aria-hidden="true"><span>10:24</span></span><span class="ambient-scene-option-name">${name}</span><span class="ambient-scene-option-index">0${index + 1}</span></button>`).join("")}
                        </div>
                        <label class="ambient-control-row ambient-palette-row" for="ambient-palette" hidden><span class="ambient-control-label" data-ambient-copy="palette"></span><select id="ambient-palette"><option value="black" data-ambient-copy="black"></option><option value="ivory" data-ambient-copy="ivory"></option><option value="charcoal" data-ambient-copy="charcoal"></option></select></label>
                    </section>
                    <section class="ambient-setting-group">
                        <h3 class="ambient-group-title" data-ambient-copy="clock"></h3>
                        <label class="ambient-control-row" for="ambient-hour-format"><span class="ambient-control-label" data-ambient-copy="format"></span><select id="ambient-hour-format"><option value="24" data-ambient-copy="format24"></option><option value="12" data-ambient-copy="format12"></option></select></label>
                        <div class="ambient-range-control"><label class="ambient-control-row" for="ambient-size"><span class="ambient-control-label" data-ambient-copy="size"></span><output id="ambient-size-value" for="ambient-size">100%</output></label><input id="ambient-size" type="range" min="65" max="130" step="1" value="100"></div>
                        <label class="ambient-control-row" for="ambient-position"><span class="ambient-control-label" data-ambient-copy="position"></span><select id="ambient-position"><option value="center" data-ambient-copy="center"></option><option value="left" data-ambient-copy="left"></option><option value="right" data-ambient-copy="right"></option></select></label>
                        ${switchRow("ambient-seconds-toggle", "seconds")}
                        ${switchRow("ambient-date-toggle", "date")}
                    </section>
                    <section class="ambient-setting-group">
                        <h3 class="ambient-group-title" data-ambient-copy="motion"></h3>
                        <label class="ambient-control-row" for="ambient-quality"><span class="ambient-control-label" data-ambient-copy="quality"></span><select id="ambient-quality" aria-describedby="ambient-quality-note"><option value="low" data-ambient-copy="qualityLow"></option><option value="balanced" data-ambient-copy="qualityBalanced"></option><option value="high" data-ambient-copy="qualityHigh"></option></select></label>
                        <p class="ambient-system-note" id="ambient-quality-note"></p>
                        ${switchRow("ambient-animations-toggle", "animations", "animationsDescription")}
                        <div class="ambient-range-control"><label class="ambient-control-row" for="ambient-intensity"><span class="ambient-control-label" data-ambient-copy="intensity"></span><output id="ambient-intensity-value" for="ambient-intensity">65%</output></label><input id="ambient-intensity" type="range" min="0" max="100" step="1" value="65"></div>
                        ${switchRow("ambient-drift-toggle", "drift", "driftDescription")}
                        <p class="ambient-system-note" id="ambient-reduced-motion" data-ambient-copy="reduced" hidden></p>
                    </section>
                    <section class="ambient-setting-group">
                        <h3 class="ambient-group-title" data-ambient-copy="display"></h3>
                        ${switchRow("ambient-wake-toggle", "wake", "wakeDescription")}
                        <p class="ambient-system-note" id="ambient-wake-unsupported" data-ambient-copy="wakeUnsupported" hidden></p>
                        <label class="ambient-control-row" for="ambient-language"><span class="ambient-control-label" data-ambient-copy="language"></span><select id="ambient-language"><option value="tr" lang="tr">Türkçe</option><option value="en" lang="en">English</option></select></label>
                    </section>
                    <p class="ambient-status" id="ambient-status" role="status" hidden></p>
                </div>
                <footer class="ambient-settings-footer" data-ambient-copy="footer"></footer>
            </section>
        </div>`;

    const get = (id) => root.querySelector(`#${id}`);
    const stage = get("ambient-stage");
    const settingsPanel = get("ambient-settings");
    const settingsButton = get("ambient-settings-toggle");
    const fullscreenButton = get("ambient-fullscreen");
    const fullscreenOpenButton = document.getElementById("ambient-fullscreen-open");
    const fullscreenButtons = [fullscreenButton, fullscreenOpenButton].filter(Boolean);
    const time = get("ambient-time");
    const fields = {
        language: get("ambient-language"), hourFormat: get("ambient-hour-format"), size: get("ambient-size"),
        position: get("ambient-position"), seconds: get("ambient-seconds-toggle"), date: get("ambient-date-toggle"),
        animations: get("ambient-animations-toggle"), intensity: get("ambient-intensity"), palette: get("ambient-palette"),
        drift: get("ambient-drift-toggle"), wake: get("ambient-wake-toggle"), quality: get("ambient-quality"),
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const supportsWakeLock = Boolean(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
    let explicitLanguage = false;
    let settings = loadSettings();
    let active = false;
    let pageLeaving = false;
    let stageVisible = true;
    let settingsOpen = false;
    let fullscreenRevision = 0;
    let clockTimer = 0;
    let idleTimer = 0;
    let keyboardFocus = false;
    let renderer = null;
    let pointerFrame = 0;
    let pointerClientX = 0;
    let pointerClientY = 0;
    let wakeLock = null;
    let wakeRequest = null;
    let wakeRevision = 0;
    let wakeBlocked = false;
    const status = { storage: "", fullscreen: "", wake: "" };

    function loadSettings() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(core.STORAGE_KEY) || "null");
            explicitLanguage = Boolean(stored && (stored.language === "tr" || stored.language === "en"));
        } catch {
            // A blocked store or invalid record should never prevent the display opening.
        }
        return core.normalizeSettings(stored, document.documentElement.lang);
    }

    function saveSettings() {
        try {
            localStorage.setItem(core.STORAGE_KEY, JSON.stringify(settings));
            status.storage = "";
        } catch {
            status.storage = "storageError";
        }
        renderStatus();
    }

    function t(key) {
        return copy[settings.language][key] || "";
    }

    function renderStatus() {
        const element = get("ambient-status");
        const message = Object.values(status).filter(Boolean).map(t).join(" ");
        if (element.textContent !== message) element.textContent = message;
        element.hidden = !message;
    }

    function translate() {
        panel.lang = settings.language;
        root.lang = settings.language;
        stage.setAttribute("aria-label", t("experience"));
        panel.querySelectorAll("[data-ambient-copy]").forEach((element) => {
            element.textContent = t(element.dataset.ambientCopy);
        });
        [
            [get("ambient-back"), "back"], [settingsButton, "settings"], [get("ambient-settings-close"), "close"],
        ].forEach(([button, key]) => {
            button.title = t(key);
            button.setAttribute("aria-label", t(key));
        });
        get("ambient-clock-heading").textContent = t(settings.design === "studio" ? "studioHeading" : settings.design === "cyber" ? "cyberHeading" : "heading");
        get("ambient-message").textContent = t(settings.design === "studio" ? "studioMessage" : settings.design === "cyber" ? "cyberMessage" : "message");
        get("ambient-quality-note").textContent = t(settings.quality === "low" ? "qualityLowDescription" : settings.quality === "high" ? "qualityHighDescription" : "qualityBalancedDescription");
        updateFullscreenButton();
        renderStatus();
    }

    function isActive() {
        return active && !document.hidden && !pageLeaving;
    }

    function isRunning() {
        return isActive() && stageVisible;
    }

    function updateClock() {
        window.clearTimeout(clockTimer);
        clockTimer = 0;
        const now = new Date();
        const parts = core.formatClock(now, settings.hourFormat, settings.language);
        [["ambient-hours", parts.hours], ["ambient-minutes", parts.minutes], ["ambient-seconds", parts.seconds], ["ambient-period", parts.period]].forEach(([id, text]) => {
            const element = get(id);
            if (element.textContent !== text) element.textContent = text;
        });
        get("ambient-seconds").hidden = !settings.seconds;
        get("ambient-period").hidden = !parts.period;
        stage.querySelector(".ambient-clock-detail").hidden = !settings.seconds && !parts.period;
        const date = get("ambient-date");
        date.hidden = !settings.date;
        const dateText = core.formatDate(now, settings.language);
        if (date.textContent !== dateText) date.textContent = dateText;
        time.dateTime = core.localDateTime(now);
        // The time element is deliberately not a live region.
        if (isRunning()) clockTimer = window.setTimeout(updateClock, core.nextClockDelay(now, settings.seconds));
    }

    function updateRenderer() {
        if (!renderer && isRunning() && window.AmbientRenderer) {
            try {
                renderer = window.AmbientRenderer.create(get("ambient-canvas"));
            } catch {
                // The CSS atmosphere remains usable if a canvas context is unavailable.
            }
        }
        if (renderer) {
            renderer.update({
                design: settings.design,
                animated: settings.animations && !reducedMotion.matches,
                intensity: settings.intensity / 100,
                active: isRunning(),
                quality: settings.quality,
            });
        }
        if (!canReactToPointer()) resetPointerInteraction();
    }

    function canReactToPointer() {
        return isRunning() && settings.animations && !reducedMotion.matches && settings.quality !== "low" && settings.design !== "studio" && !settingsOpen;
    }

    function resetPointerInteraction() {
        window.cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        stage.style.setProperty("--ambient-pointer-x", "0");
        stage.style.setProperty("--ambient-pointer-y", "0");
        stage.style.setProperty("--ambient-pointer-active", "0");
        renderer?.setPointer?.(0, 0);
    }

    function renderPointerPosition() {
        pointerFrame = 0;
        if (!canReactToPointer()) return;
        // Coalesce high-frequency mouse events into one layout read and update per frame.
        const bounds = stage.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = Math.max(-1, Math.min(1, ((pointerClientX - bounds.left) / bounds.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((pointerClientY - bounds.top) / bounds.height) * 2 - 1));
        // Balanced uses the shader's own light response, avoiding another full-screen
        // compositor animation and inherited CSS updates on every mouse frame.
        if (settings.quality === "high") {
            stage.style.setProperty("--ambient-pointer-x", String(x));
            stage.style.setProperty("--ambient-pointer-y", String(y));
            stage.style.setProperty("--ambient-pointer-active", "1");
        }
        renderer?.setPointer?.(x, y);
    }

    function onPointerMove(event) {
        keyboardFocus = false;
        revealControls();
        if (!canReactToPointer()) return;
        if (event.pointerType && event.pointerType !== "mouse") {
            resetPointerInteraction();
            return;
        }
        if (event.target.closest?.("button, input, select, .ambient-settings")) {
            resetPointerInteraction();
            return;
        }
        pointerClientX = event.clientX;
        pointerClientY = event.clientY;
        if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointerPosition);
    }

    function applySettings() {
        stage.dataset.design = settings.design;
        stage.dataset.quality = settings.quality;
        stage.dataset.palette = settings.palette;
        stage.dataset.position = settings.position;
        stage.dataset.animations = String(settings.animations && !reducedMotion.matches);
        stage.dataset.drift = String(settings.drift && !reducedMotion.matches && settings.animations);
        stage.dataset.paused = String(!isRunning());
        stage.style.setProperty("--ambient-size", String(settings.size / 100));
        stage.style.setProperty("--ambient-intensity", String(settings.intensity / 100));
        Object.entries(fields).forEach(([key, input]) => {
            if (input.type === "checkbox") input.checked = settings[key];
            else input.value = String(settings[key]);
        });
        get("ambient-size-value").value = `${settings.size}%`;
        get("ambient-intensity-value").value = `${settings.intensity}%`;
        [fields.size, fields.intensity].forEach((input) => {
            const filled = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
            input.style.setProperty("--ambient-range-fill", `${filled}%`);
        });
        stage.querySelectorAll("[data-scene]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.scene === settings.design)));
        stage.querySelector(".ambient-palette-row").hidden = settings.design !== "studio";
        stage.querySelector(".ambient-scene-name").textContent = sceneNames[settings.design];
        stage.querySelector(".ambient-scene-number").textContent = `0${Object.keys(sceneNames).indexOf(settings.design) + 1} / 03`;
        get("ambient-reduced-motion").hidden = !reducedMotion.matches;
        get("ambient-wake-unsupported").hidden = supportsWakeLock;
        fields.wake.disabled = !supportsWakeLock;
        translate();
        updateClock();
        updateRenderer();
        syncWakeLock();
    }

    function changeSetting(key, value) {
        const previousWake = settings.wake;
        settings = core.normalizeSettings({ ...settings, [key]: value }, settings.language);
        if (key === "language") explicitLanguage = true;
        if (key === "quality") resetPointerInteraction();
        if (previousWake !== settings.wake) {
            wakeRevision += 1;
            wakeBlocked = false;
            status.wake = "";
        }
        applySettings();
        saveSettings();
        revealControls();
    }

    function canHideControls() {
        return isRunning() && !settingsOpen && !(keyboardFocus && stage.contains(document.activeElement));
    }

    function revealControls() {
        stage.classList.remove("is-idle");
        window.clearTimeout(idleTimer);
        idleTimer = 0;
        if (canHideControls()) idleTimer = window.setTimeout(() => {
            if (canHideControls()) {
                stage.classList.add("is-idle");
                resetPointerInteraction();
            }
        }, 4000);
    }

    function toggleSettings(open, returnFocus = true) {
        settingsOpen = open;
        settingsPanel.hidden = !open;
        settingsButton.setAttribute("aria-expanded", String(open));
        stage.classList.toggle("has-settings", open);
        if (open) resetPointerInteraction();
        revealControls();
        if (open) get("ambient-settings-close").focus({ preventScroll: true });
        else if (returnFocus) settingsButton.focus({ preventScroll: true });
    }

    function isFullscreen() {
        return document.fullscreenElement === stage;
    }

    function updateFullscreenButton() {
        const expanded = isFullscreen();
        fullscreenButtons.forEach((button) => {
            button.title = t(expanded ? "exitFullscreen" : "fullscreen");
            button.setAttribute("aria-label", button.title);
            button.setAttribute("aria-pressed", String(expanded));
        });
        if (fullscreenOpenButton) fullscreenOpenButton.textContent = t(expanded ? "exitFullscreen" : "fullscreenLabel");
        fullscreenButton.innerHTML = expanded ? icons.collapse : icons.expand;
        stage.classList.toggle("is-fullscreen", expanded);
    }

    async function toggleFullscreen() {
        if (!isActive()) return;
        const requestRevision = ++fullscreenRevision;
        const isCurrentRequest = () => requestRevision === fullscreenRevision && isActive();
        status.fullscreen = "";
        if (typeof stage.requestFullscreen !== "function") {
            status.fullscreen = "fullscreenUnsupported";
            toggleSettings(true);
            renderStatus();
            return;
        }
        fullscreenButtons.forEach((button) => { button.disabled = true; });
        try {
            if (isFullscreen()) await document.exitFullscreen();
            else await stage.requestFullscreen({ navigationUI: "hide" });
            // Leaving and returning can happen before the browser resolves this request.
            if (!isCurrentRequest() && isFullscreen()) await document.exitFullscreen();
        } catch {
            if (isCurrentRequest()) {
                status.fullscreen = "fullscreenError";
                toggleSettings(true);
            }
        } finally {
            fullscreenButtons.forEach((button) => { button.disabled = false; });
            updateFullscreenButton();
            renderStatus();
            if (isCurrentRequest()) revealControls();
        }
    }

    function wantsWakeLock() {
        return supportsWakeLock && settings.wake && isRunning();
    }

    async function releaseWakeLock() {
        const current = wakeLock;
        wakeLock = null;
        if (current) {
            try { await current.release(); } catch { /* Already released by the system. */ }
        }
    }

    function syncWakeLock() {
        if (!wantsWakeLock()) {
            releaseWakeLock();
            if (status.wake === "wakeActive") status.wake = "";
            renderStatus();
            return;
        }
        if (wakeLock || wakeRequest || wakeBlocked) return;
        const requestRevision = wakeRevision;
        wakeRequest = Promise.resolve().then(() => navigator.wakeLock.request("screen")).then(async (lock) => {
            if (!wantsWakeLock() || requestRevision !== wakeRevision) {
                await lock.release();
                return;
            }
            wakeLock = lock;
            status.wake = "wakeActive";
            lock.addEventListener("release", () => {
                if (wakeLock !== lock) return;
                wakeLock = null;
                if (wantsWakeLock()) {
                    wakeBlocked = true;
                    status.wake = "wakeReleased";
                } else status.wake = "";
                renderStatus();
            }, { once: true });
            renderStatus();
        }).catch(() => {
            if (requestRevision === wakeRevision && wantsWakeLock()) {
                wakeBlocked = true;
                status.wake = "wakeError";
                renderStatus();
            }
        }).finally(() => {
            wakeRequest = null;
            // Visibility or opt-in can change while the browser is resolving a request.
            // Reconcile a stale request, but do not repeatedly retry a denied current one.
            if (requestRevision !== wakeRevision && wantsWakeLock()) syncWakeLock();
        });
    }

    function updateActivity() {
        const nextActive = panel.classList.contains("active");
        const changed = active !== nextActive;
        active = nextActive;
        stage.dataset.paused = String(!isRunning());
        if (changed) {
            fullscreenRevision += 1;
            wakeRevision += 1;
            wakeBlocked = false;
            if (!active) {
                toggleSettings(false, false);
                window.clearTimeout(idleTimer);
                if (isFullscreen()) document.exitFullscreen().catch(() => {});
            } else revealControls();
        }
        updateClock();
        updateRenderer();
        syncWakeLock();
    }

    Object.entries(fields).forEach(([key, input]) => {
        input.addEventListener(input.type === "range" ? "input" : "change", () => {
            changeSetting(key, input.type === "checkbox" ? input.checked : input.value);
        });
    });
    stage.querySelectorAll("[data-scene]").forEach((button) => {
        button.addEventListener("click", () => changeSetting("design", button.dataset.scene));
    });
    settingsButton.addEventListener("click", () => toggleSettings(!settingsOpen));
    get("ambient-settings-close").addEventListener("click", () => toggleSettings(false));
    fullscreenButtons.forEach((button) => button.addEventListener("click", toggleFullscreen));
    get("ambient-back").addEventListener("click", () => document.querySelector(".brand")?.click());

    stage.addEventListener("pointermove", onPointerMove, { passive: true });
    stage.addEventListener("pointerleave", resetPointerInteraction, { passive: true });
    stage.addEventListener("pointerdown", (event) => {
        keyboardFocus = false;
        if (settingsOpen && !settingsPanel.contains(event.target) && !settingsButton.contains(event.target)) toggleSettings(false, false);
        revealControls();
    }, { passive: true });
    stage.addEventListener("touchstart", () => { resetPointerInteraction(); revealControls(); }, { passive: true });
    stage.addEventListener("focusin", revealControls);
    stage.addEventListener("focusout", () => window.setTimeout(revealControls, 0));
    document.addEventListener("keydown", (event) => {
        if (!active) return;
        keyboardFocus = true;
        revealControls();
        if (event.key === "Escape") {
            if (settingsOpen) toggleSettings(false);
            // Keep the browser's native Escape behavior and cover embedded contexts too.
            if (isFullscreen()) document.exitFullscreen().catch(() => {});
        }
    });
    document.addEventListener("fullscreenchange", () => { updateFullscreenButton(); revealControls(); });
    document.addEventListener("visibilitychange", () => {
        wakeRevision += 1;
        wakeBlocked = false;
        if (document.hidden) {
            fullscreenRevision += 1;
            window.clearTimeout(idleTimer);
        }
        else revealControls();
        stage.dataset.paused = String(!isRunning());
        updateClock();
        updateRenderer();
        syncWakeLock();
    });
    document.addEventListener("tool-activated", updateActivity);
    new MutationObserver(updateActivity).observe(panel, { attributes: true, attributeFilter: ["class"] });
    if (typeof IntersectionObserver === "function") {
        // The embedded view can scroll out of sight while its tool is still selected.
        new IntersectionObserver(([entry]) => {
            if (stageVisible === entry.isIntersecting) return;
            stageVisible = entry.isIntersecting;
            wakeRevision += 1;
            wakeBlocked = false;
            window.clearTimeout(idleTimer);
            updateActivity();
            if (stageVisible) revealControls();
        }).observe(stage);
    }
    new MutationObserver(() => {
        if (explicitLanguage) return;
        settings.language = core.languageCode(document.documentElement.lang);
        applySettings();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

    const onReducedMotion = () => applySettings();
    if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", onReducedMotion);
    else reducedMotion.addListener(onReducedMotion);

    window.addEventListener("pagehide", () => {
        pageLeaving = true;
        fullscreenRevision += 1;
        wakeRevision += 1;
        window.clearTimeout(clockTimer);
        window.clearTimeout(idleTimer);
        stage.dataset.paused = "true";
        updateRenderer();
        releaseWakeLock();
    });
    window.addEventListener("pageshow", () => {
        pageLeaving = false;
        wakeBlocked = false;
        updateActivity();
        revealControls();
    });

    applySettings();
    updateActivity();
}());
