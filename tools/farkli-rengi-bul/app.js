(function initOddColorApp() {
    "use strict";

    const core = window.OddColorCore;
    const config = window.OddColorConfig;
    const panel = document.getElementById("farkli-rengi-bul");
    if (!core || !config || !panel) return;

    const get = (id) => document.getElementById(id);
    const elements = {
        app: get("odd-color-app"),
        gameScreen: get("odd-color-game-screen"),
        resultScreen: get("odd-color-result-screen"),
        replay: get("odd-color-replay"),
        home: get("odd-color-home"),
        level: get("odd-color-level"),
        lives: get("odd-color-lives"),
        hearts: Array.from(panel.querySelectorAll(".odd-color-hearts > span")),
        highest: get("odd-color-highest"),
        hud: panel.querySelector(".odd-color-hud"),
        shuffle: get("odd-color-shuffle"),
        grid: get("odd-color-grid"),
        resultLevel: get("odd-color-result-level"),
        resultHighest: get("odd-color-result-highest"),
        resultCorrect: get("odd-color-result-correct"),
        resultWrong: get("odd-color-result-wrong"),
        resultMessage: get("odd-color-result-message"),
        live: get("odd-color-live"),
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stats = loadStats();
    let state = core.createInitialState();
    let transitionTimer = 0;
    let inputLocked = false;
    let shuffleLocked = false;
    let shuffleToken = 0;
    let shuffleAnimations = [];
    let resultRecorded = false;

    function loadStats() {
        try {
            return core.normalizeStats(JSON.parse(localStorage.getItem(config.STORAGE_KEY) || "null"));
        } catch {
            return core.normalizeStats(null);
        }
    }

    function saveStats() {
        try {
            localStorage.setItem(config.STORAGE_KEY, JSON.stringify(stats));
        } catch {
            // Depolama kapalıysa oyun oturum içinde çalışmaya devam eder.
        }
    }

    function showScreen(screen) {
        [elements.gameScreen, elements.resultScreen].forEach((item) => {
            item.hidden = item !== screen;
        });
    }

    function updateHud() {
        elements.level.textContent = String(state.level);
        elements.lives.textContent = String(state.lives);
        elements.highest.textContent = String(Math.max(stats.highestLevel, state.level));
        elements.hearts.forEach((heart, index) => heart.classList.toggle("is-empty", index >= state.lives));
        elements.hud.dataset.lowLives = String(state.lives === 1);
    }

    function cancelPendingWork() {
        if (transitionTimer) window.clearTimeout(transitionTimer);
        shuffleToken += 1;
        shuffleAnimations.forEach((animation) => animation.cancel());
        shuffleAnimations = [];
        transitionTimer = 0;
        shuffleLocked = false;
        elements.shuffle.disabled = false;
        elements.shuffle.classList.remove("is-active");
        elements.grid.classList.remove("is-shuffling");
        elements.grid.querySelectorAll(".is-moving").forEach((cell) => {
            cell.classList.remove("is-moving");
        });
    }

    function startGame() {
        cancelPendingWork();
        state = core.startGame();
        inputLocked = false;
        resultRecorded = false;
        elements.app.dataset.phase = "playing";
        showScreen(elements.gameScreen);
        renderRound();
    }

    function renderRound() {
        const round = state.round;
        if (!round) return;

        inputLocked = false;
        updateHud();
        elements.grid.replaceChildren();
        elements.grid.style.setProperty("--odd-color-grid-size", String(round.gridSize));
        elements.grid.setAttribute("aria-label", `${round.gridSize} çarpı ${round.gridSize} renk ızgarası`);

        const fragment = document.createDocumentFragment();
        round.cells.forEach((color, index) => {
            const button = document.createElement("button");
            button.className = "odd-color-cell";
            button.type = "button";
            button.style.backgroundColor = color;
            button.dataset.index = String(index);
            button.setAttribute("role", "gridcell");
            button.setAttribute("aria-label", `Renk karesi ${index + 1}`);
            button.addEventListener("click", handleCellClick);
            fragment.appendChild(button);
        });
        elements.grid.appendChild(fragment);
        elements.live.textContent = `Level ${state.level}. ${round.gridSize} çarpı ${round.gridSize} ızgara. ${state.lives} hakkın var.`;
    }

    function reorderCells(cells, oldOddIndex, newOddIndex) {
        // Referans oyundaki gibi kare kimlikleri ve renkleri korunur, yalnızca konumları karıştırılır.
        return core.createShuffleOrder(cells.length, oldOddIndex, newOddIndex)
            .map((sourceIndex) => cells[sourceIndex]);
    }

    function handleShuffle() {
        if (inputLocked || shuffleLocked || state.status !== "playing" || !state.round) return;

        const token = ++shuffleToken;
        const previousRound = state.round;
        const nextRound = core.shuffleRound(previousRound);
        const cells = Array.from(elements.grid.children);
        const firstRects = new Map(cells.map((cell) => [cell, cell.getBoundingClientRect()]));
        const orderedCells = reorderCells(cells, previousRound.oddIndex, nextRound.oddIndex);

        shuffleLocked = true;
        elements.shuffle.disabled = true;
        elements.shuffle.classList.add("is-active");
        elements.grid.classList.add("is-shuffling");
        elements.live.textContent = "Karelerin yeri değiştiriliyor.";

        elements.grid.replaceChildren(...orderedCells);
        state = { ...state, round: nextRound };
        orderedCells.forEach((cell, index) => {
            cell.dataset.index = String(index);
            cell.setAttribute("aria-label", `Renk karesi ${index + 1}`);
            cell.style.backgroundColor = nextRound.cells[index];
            cell.classList.add("is-moving");
        });

        const canAnimate = !reducedMotion.matches && orderedCells.every((cell) => typeof cell.animate === "function");
        if (canAnimate) {
            shuffleAnimations = orderedCells.map((cell) => {
                const first = firstRects.get(cell);
                const last = cell.getBoundingClientRect();
                const deltaX = first.left - last.left;
                const deltaY = first.top - last.top;
                return cell.animate([
                    { transform: `translate(${deltaX}px, ${deltaY}px)` },
                    { transform: "translate(0, 0)" },
                ], {
                    duration: config.SHUFFLE_ANIMATION_MS,
                    easing: "ease-in-out",
                    fill: "both",
                });
            });
        }

        const finished = shuffleAnimations.length
            ? Promise.allSettled(shuffleAnimations.map((animation) => animation.finished))
            : Promise.resolve();
        finished.then(() => {
            if (token !== shuffleToken) return;
            shuffleAnimations = [];
            orderedCells.forEach((cell) => {
                cell.classList.remove("is-moving");
            });
            elements.grid.classList.remove("is-shuffling");
            elements.shuffle.classList.remove("is-active");
            elements.shuffle.disabled = false;
            shuffleLocked = false;
            elements.live.textContent = "Karelerin yeri değişti.";
        });
    }

    function animateWrong(button) {
        button.classList.remove("is-wrong");
        elements.grid.classList.remove("is-shaking");
        // Aynı kareye arka arkaya dokunulduğunda animasyonu yeniden başlatır.
        void button.offsetWidth;
        button.classList.add("is-wrong");
        elements.grid.classList.add("is-shaking");
        window.setTimeout(() => {
            button.classList.remove("is-wrong");
            elements.grid.classList.remove("is-shaking");
        }, reducedMotion.matches ? 0 : config.ERROR_ANIMATION_MS);
    }

    function handleCellClick(event) {
        if (inputLocked || shuffleLocked || state.status !== "playing") return;
        const button = event.currentTarget;
        const selection = core.selectCell(state, Number(button.dataset.index));
        if (selection.outcome === "ignored") return;
        state = selection.state;
        updateHud();

        if (selection.outcome === "wrong") {
            animateWrong(button);
            elements.live.textContent = `Yanlış seçim. ${state.lives} hakkın kaldı.`;
            return;
        }

        inputLocked = true;

        if (selection.outcome === "gameover") {
            animateWrong(button);
            transitionTimer = window.setTimeout(finishGame, reducedMotion.matches ? 0 : config.ERROR_ANIMATION_MS);
            return;
        }

        button.classList.add("is-correct");
        elements.grid.classList.add("is-success");
        elements.live.textContent = `Doğru! Level ${state.level} hazırlanıyor.`;
        transitionTimer = window.setTimeout(() => {
            elements.grid.classList.remove("is-success");
            renderRound();
        }, reducedMotion.matches ? 0 : config.CORRECT_TRANSITION_MS);
    }

    function finishGame() {
        cancelPendingWork();
        inputLocked = true;
        if (state.status !== "finished") state = core.endGame(state, "lives");

        if (!resultRecorded) {
            stats = core.updateStats(stats, state);
            saveStats();
            resultRecorded = true;
        }

        elements.app.dataset.phase = "finished";
        elements.resultLevel.textContent = String(state.level);
        elements.resultHighest.textContent = String(stats.highestLevel);
        elements.resultCorrect.textContent = String(state.correctAnswers);
        elements.resultWrong.textContent = String(state.wrongSelections);
        elements.resultMessage.textContent = "Üç hakkını da kullandın. Bir sonraki denemede daha ileri gidebilirsin.";
        elements.live.textContent = `Oyun bitti. Ulaşılan level ${state.level}.`;
        showScreen(elements.resultScreen);
    }

    function goToMainMenu() {
        cancelPendingWork();
        state = core.createInitialState();
        inputLocked = false;
        elements.app.dataset.phase = "idle";
        if (typeof window.clearActiveTool === "function") {
            window.clearActiveTool({ historyMode: "push" });
            return;
        }
        document.querySelector(".brand")?.click();
    }

    elements.replay.addEventListener("click", startGame);
    elements.home.addEventListener("click", goToMainMenu);
    elements.shuffle.addEventListener("click", handleShuffle);
    document.addEventListener("tool-activated", (event) => {
        if (event.detail?.tool === "farkli-rengi-bul") startGame();
    });
    if (panel.classList.contains("active")) startGame();
}());
