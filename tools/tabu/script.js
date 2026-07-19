(function () {
    "use strict";

    const cards = Array.isArray(window.OmniTabuCards) ? window.OmniTabuCards : [];
    const CARD_BY_ID = new Map(cards.map((card) => [card.id, card]));
    const SAVE_KEY = "omni-tabu-active-v1";
    const SOUND_KEY = "omni-tabu-sound-v1";
    const SAVE_VERSION = 1;
    const TIMER_INTERVAL_MS = 200;
    const RECENT_CARD_LIMIT = 12;
    const SCREEN_IDS = [
        "tabu-setup-screen",
        "tabu-ready-screen",
        "tabu-countdown-screen",
        "tabu-game-screen",
        "tabu-round-screen",
        "tabu-end-screen",
    ];

    const element = (id) => document.getElementById(id);
    const elements = Object.fromEntries([
        "app", "setup-screen", "setup-form", "setup-error", "setup-header-actions", "start-game",
        "duration", "duration-custom", "duration-custom-wrap", "target", "target-custom",
        "target-custom-wrap", "passes", "penalty-enabled", "penalty-amount", "allow-negative",
        "countdown-enabled", "sound",
        "ready-screen", "ready-round", "ready-team", "ready-player", "ready-score", "ready-target",
        "ready-duration", "ready-passes", "ready-start", "countdown-screen", "countdown-value",
        "game-screen", "timer", "game-team", "game-player", "game-target", "game-passes",
        "word-card", "card-category", "main-word", "forbidden-words", "pause-cover", "resume-overlay", "feedback",
        "round-correct", "round-taboo", "round-pass", "pause", "end-round", "correct", "taboo", "pass",
        "round-screen", "round-number", "round-team", "round-player", "summary-correct", "summary-taboo",
        "summary-pass", "summary-net", "next-round", "back-setup", "finish-game", "end-screen", "winner",
        "end-message", "final-rounds", "final-most-correct", "final-least-taboo", "player-stats-body",
        "replay-teams", "new-setup", "go-home", "modal", "modal-title",
        "modal-message", "modal-primary", "modal-secondary",
    ].map((name) => [name, element(`tabu-${name}`)]));

    if (!elements.app || cards.length < 300) return;

    let setupPlayers = [[""], [""]];
    let state = null;
    let timerId = null;
    let countdownId = null;
    let lastRenderedSecond = null;
    let lastWarningSecond = null;
    let feedbackTimer = null;
    let modalPrimaryAction = null;
    let modalSecondaryAction = null;
    let modalReturnFocus = null;
    let resumePromptHandled = false;
    let soundEnabled = readBoolean(SOUND_KEY, true);
    let audioContext = null;

    initialize();

    function initialize() {
        renderPlayerLists();
        updateSetupControls();
        updateSoundButton();
        bindEvents();
        showScreen("setup");
    }

    function bindEvents() {
        document.querySelectorAll(".tabu-add-player").forEach((button) => {
            button.addEventListener("click", () => addPlayer(Number(button.dataset.team)));
        });
        elements["setup-form"].addEventListener("submit", startFromSetup);
        elements.duration.addEventListener("change", updateSetupControls);
        elements.target.addEventListener("change", updateSetupControls);
        elements["penalty-enabled"].addEventListener("change", updateSetupControls);
        elements.sound.addEventListener("click", toggleSound);
        elements["ready-start"].addEventListener("click", beginReadyCountdown);
        elements.correct.addEventListener("click", () => handleCardAction("correct"));
        elements.taboo.addEventListener("click", () => handleCardAction("taboo"));
        elements.pass.addEventListener("click", () => handleCardAction("pass"));
        elements.pause.addEventListener("click", togglePause);
        elements["resume-overlay"].addEventListener("click", resumeRound);
        elements["end-round"].addEventListener("click", confirmEndRound);
        elements["next-round"].addEventListener("click", continueAfterRound);
        elements["back-setup"].addEventListener("click", confirmReturnToSetup);
        elements["finish-game"].addEventListener("click", confirmFinishGame);
        elements["replay-teams"].addEventListener("click", replayWithSameTeams);
        elements["new-setup"].addEventListener("click", returnToSetup);
        elements["go-home"].addEventListener("click", returnToSetup);
        elements["modal-primary"].addEventListener("click", handleModalPrimary);
        elements["modal-secondary"].addEventListener("click", handleModalSecondary);
        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("tool-activated", handleToolActivated);
        window.addEventListener("beforeunload", saveBeforeUnload);
    }

    function handleToolActivated(event) {
        if (event.detail?.tool !== "tabu") return;
        focusTabuPanelOnMobile();
        if (state) {
            renderCurrentState();
            return;
        }
        if (resumePromptHandled) return;
        resumePromptHandled = true;
        const saved = loadActiveGame();
        if (!saved) return;
        openModal({
            title: "Devam eden oyun bulundu",
            message: `${saved.teams[0].name} ile ${saved.teams[1].name} arasındaki kayıtlı oyuna devam edebilirsin.`,
            primaryLabel: "Oyuna Devam Et",
            secondaryLabel: "Yeni Oyun Başlat",
            onPrimary: () => resumeSavedGame(saved),
            onSecondary: () => {
                clearActiveGame();
                showScreen("setup");
                focusTabuPanelOnMobile();
            },
        });
    }

    function focusTabuPanelOnMobile() {
        if (!window.matchMedia("(max-width: 900px)").matches) return;
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        window.requestAnimationFrame(() => element("tabu").scrollIntoView({ behavior, block: "start" }));
    }

    function renderCurrentState() {
        if (!state) return;
        if (state.status === "ready") renderReadyScreen();
        else if (state.status === "round-summary") renderRoundSummary();
        else if (state.status === "finished") renderEndScreen();
        else {
            state.status = "paused";
            renderGameScreen();
        }
    }

    function renderPlayerLists() {
        [0, 1].forEach((teamIndex) => {
            const list = element(`tabu-player-list-${teamIndex}`);
            list.replaceChildren();
            setupPlayers[teamIndex].forEach((name, playerIndex) => {
                const row = document.createElement("div");
                row.className = "tabu-player-row";

                const label = document.createElement("label");
                label.className = "tabu-player-input";
                const labelText = document.createElement("span");
                labelText.className = "sr-only";
                labelText.textContent = `${teamIndex + 1}. takım ${playerIndex + 1}. oyuncu adı`;
                const input = document.createElement("input");
                input.type = "text";
                input.maxLength = 36;
                input.placeholder = `${playerIndex + 1}. oyuncu adı`;
                input.value = name;
                input.autocomplete = "off";
                input.required = true;
                input.addEventListener("input", () => {
                    setupPlayers[teamIndex][playerIndex] = input.value;
                    clearSetupError();
                });
                label.append(labelText, input);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "tabu-remove-player";
                remove.textContent = "×";
                remove.setAttribute("aria-label", `${playerIndex + 1}. oyuncuyu kaldır`);
                remove.disabled = setupPlayers[teamIndex].length === 1;
                remove.addEventListener("click", () => removePlayer(teamIndex, playerIndex));
                row.append(label, remove);
                list.append(row);
            });
            element(`tabu-player-count-${teamIndex}`).textContent = `${setupPlayers[teamIndex].length} oyuncu`;
        });
    }

    function addPlayer(teamIndex) {
        setupPlayers[teamIndex].push("");
        renderPlayerLists();
        const inputs = element(`tabu-player-list-${teamIndex}`).querySelectorAll("input");
        inputs[inputs.length - 1]?.focus();
    }

    function removePlayer(teamIndex, playerIndex) {
        if (setupPlayers[teamIndex].length <= 1) return;
        setupPlayers[teamIndex].splice(playerIndex, 1);
        renderPlayerLists();
    }

    function updateSetupControls() {
        const customDuration = elements.duration.value === "custom";
        const customTarget = elements.target.value === "custom";
        elements["duration-custom-wrap"].hidden = !customDuration;
        elements["duration-custom"].disabled = !customDuration;
        elements["target-custom-wrap"].hidden = !customTarget;
        elements["target-custom"].disabled = !customTarget;
        const penaltyEnabled = elements["penalty-enabled"].checked;
        elements["penalty-amount"].disabled = !penaltyEnabled;
        elements["allow-negative"].disabled = !penaltyEnabled;
    }

    function startFromSetup(event) {
        event.preventDefault();
        const result = readSetup();
        if (!result.ok) {
            showSetupError(result.message, result.focusTarget);
            return;
        }
        state = createGame(result.teams, result.settings);
        clearSetupError();
        saveActiveGame();
        renderReadyScreen();
    }

    function readSetup() {
        const teamNames = [0, 1].map((index) => element(`tabu-team-name-${index}`).value.trim());
        if (teamNames.some((name) => !name)) {
            const index = teamNames.findIndex((name) => !name);
            return invalid("İki takımın da adını yazmalısın.", element(`tabu-team-name-${index}`));
        }
        if (teamNames[0].toLocaleLowerCase("tr-TR") === teamNames[1].toLocaleLowerCase("tr-TR")) {
            return invalid("Takım adları birbirinden farklı olmalı.", element("tabu-team-name-1"));
        }
        const teams = setupPlayers.map((players, teamIndex) => {
            const cleaned = players.map((name) => name.trim());
            return { name: teamNames[teamIndex], players: cleaned };
        });
        for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
            const team = teams[teamIndex];
            const emptyIndex = team.players.findIndex((name) => !name);
            if (emptyIndex !== -1) {
                return invalid(`${team.name} takımındaki tüm oyuncu adlarını doldurmalısın.`, element(`tabu-player-list-${teamIndex}`).querySelectorAll("input")[emptyIndex]);
            }
            const normalized = team.players.map((name) => name.toLocaleLowerCase("tr-TR"));
            if (new Set(normalized).size !== normalized.length) {
                return invalid(`${team.name} takımında aynı oyuncu adı birden fazla kullanılamaz.`, element(`tabu-player-list-${teamIndex}`).querySelector("input"));
            }
        }

        const duration = readNumberOption(elements.duration, elements["duration-custom"], 10, 600);
        if (duration === null) return invalid("Tur süresi 10 ile 600 saniye arasında olmalı.", elements["duration-custom"]);
        const target = readNumberOption(elements.target, elements["target-custom"], 1, 500);
        if (target === null) return invalid("Hedef puan 1 ile 500 arasında olmalı.", elements["target-custom"]);
        const penaltyAmount = Number(elements["penalty-amount"].value);
        if (elements["penalty-enabled"].checked && (!Number.isInteger(penaltyAmount) || penaltyAmount < 1 || penaltyAmount > 10)) {
            return invalid("Ceza miktarı 1 ile 10 arasında olmalı.", elements["penalty-amount"]);
        }
        const unlimitedPasses = elements.passes.value === "unlimited";
        const settings = {
            duration,
            target,
            passes: unlimitedPasses ? null : Number(elements.passes.value),
            unlimitedPasses,
            penaltyEnabled: elements["penalty-enabled"].checked,
            penaltyAmount: elements["penalty-enabled"].checked ? penaltyAmount : 0,
            allowNegative: elements["allow-negative"].checked,
            countdown: elements["countdown-enabled"].checked,
        };
        return { ok: true, teams, settings };
    }

    function invalid(message, focusTarget) {
        return { ok: false, message, focusTarget };
    }

    function readNumberOption(select, customInput, min, max) {
        const value = select.value === "custom" ? Number(customInput.value) : Number(select.value);
        return Number.isInteger(value) && value >= min && value <= max ? value : null;
    }

    function showSetupError(message, focusTarget) {
        elements["setup-error"].textContent = message;
        focusTarget?.focus();
    }

    function clearSetupError() {
        elements["setup-error"].textContent = "";
    }

    function createGame(teamData, settings) {
        const firstTeam = Math.floor(Math.random() * 2);
        const teams = teamData.map((team) => ({
            name: team.name,
            players: team.players.slice(),
            score: 0,
            playerCursor: 0,
            stats: { correct: 0, taboo: 0, pass: 0, rounds: 0, bestRound: 0 },
            playerStats: team.players.map((name) => ({ name, rounds: 0, correct: 0, taboo: 0, pass: 0 })),
        }));
        const game = {
            version: SAVE_VERSION,
            status: "ready",
            settings: { ...settings },
            teams,
            activeTeam: firstTeam,
            completedRounds: 0,
            tieBreak: false,
            deck: shuffled(cards.map((card) => card.id)),
            deckPosition: 0,
            usedCardIds: [],
            recentCardIds: [],
            currentCardId: null,
            remainingMs: settings.duration * 1000,
            deadline: null,
            paused: false,
            round: null,
            startedAt: Date.now(),
        };
        game.round = createRound(game);
        return game;
    }

    function createRound(game) {
        const team = game.teams[game.activeTeam];
        return {
            teamIndex: game.activeTeam,
            playerIndex: team.playerCursor,
            correct: 0,
            taboo: 0,
            passesUsed: 0,
            remainingPasses: game.settings.unlimitedPasses ? null : game.settings.passes,
            startScore: team.score,
            net: 0,
        };
    }

    function renderReadyScreen() {
        clearTimers();
        state.status = "ready";
        state.paused = false;
        state.remainingMs = state.settings.duration * 1000;
        state.currentCardId = null;
        const team = state.teams[state.activeTeam];
        const player = team.players[state.round.playerIndex];
        elements["ready-round"].textContent = state.tieBreak ? `Beraberlik turu · ${state.completedRounds + 1}. tur` : `${state.completedRounds + 1}. Tur`;
        elements["ready-team"].textContent = team.name;
        elements["ready-player"].textContent = player;
        elements["ready-score"].textContent = team.score;
        elements["ready-target"].textContent = Math.max(0, state.settings.target - team.score);
        elements["ready-duration"].textContent = `${state.settings.duration} sn`;
        elements["ready-passes"].textContent = state.settings.unlimitedPasses ? "∞" : state.settings.passes;
        showScreen("ready");
        saveActiveGame();
        elements["ready-start"].focus();
    }

    function beginReadyCountdown() {
        if (!state || state.status !== "ready") return;
        if (!state.settings.countdown) {
            startRound();
            return;
        }
        state.status = "countdown";
        showScreen("countdown");
        let value = 3;
        elements["countdown-value"].textContent = value;
        clearInterval(countdownId);
        countdownId = window.setInterval(() => {
            value -= 1;
            if (value > 0) {
                elements["countdown-value"].textContent = value;
                playSound("tick");
                return;
            }
            clearInterval(countdownId);
            countdownId = null;
            elements["countdown-value"].textContent = "Başla";
            window.setTimeout(startRound, 250);
        }, 700);
    }

    function startRound() {
        if (!state || (state.status !== "ready" && state.status !== "countdown")) return;
        clearTimers();
        state.status = "playing";
        state.paused = false;
        state.remainingMs = state.settings.duration * 1000;
        state.deadline = Date.now() + state.remainingMs;
        lastRenderedSecond = null;
        lastWarningSecond = null;
        nextCard();
        renderGameScreen();
        startTimer();
        saveActiveGame();
    }

    function renderGameScreen() {
        const team = state.teams[state.round.teamIndex];
        const player = team.players[state.round.playerIndex];
        elements["game-team"].textContent = team.name;
        elements["game-player"].textContent = player;
        elements["game-target"].textContent = state.settings.target;
        elements["round-correct"].textContent = state.round.correct;
        elements["round-taboo"].textContent = state.round.taboo;
        elements["round-pass"].textContent = state.round.passesUsed;
        updateScores();
        updatePassDisplay();
        renderCurrentCard();
        const paused = state.status === "paused" || state.paused;
        elements["pause-cover"].hidden = !paused;
        elements["word-card"].setAttribute("aria-hidden", String(paused));
        elements.pause.querySelector("span:last-child").textContent = paused ? "Devam Et" : "Duraklat";
        elements.pause.setAttribute("aria-label", paused ? "Oyuna devam et" : "Oyunu duraklat");
        setGameControlsDisabled(paused);
        renderTimer(Math.ceil(state.remainingMs / 1000));
        showScreen("game");
    }

    function updateScores() {
        state.teams.forEach((team, index) => {
            element(`tabu-score-name-${index}`).textContent = team.name;
            element(`tabu-score-value-${index}`).textContent = team.score;
            const scoreBox = element(`tabu-score-team-${index}`);
            scoreBox.classList.toggle("is-active", index === state.round.teamIndex);
            element(`tabu-summary-name-${index}`).textContent = team.name;
            element(`tabu-summary-score-${index}`).textContent = team.score;
            element(`tabu-final-name-${index}`).textContent = team.name;
            element(`tabu-final-score-${index}`).textContent = team.score;
        });
    }

    function updatePassDisplay() {
        const display = state.settings.unlimitedPasses ? "∞" : state.round.remainingPasses;
        elements["game-passes"].textContent = display;
        elements.pass.disabled = !state.settings.unlimitedPasses && state.round.remainingPasses <= 0;
        elements.pass.setAttribute("aria-label", state.settings.unlimitedPasses ? "Bu kartı pas geç, sınırsız hak" : `Bu kartı pas geç, ${display} hak kaldı`);
    }

    function nextCard() {
        if (state.deckPosition >= state.deck.length) recycleDeck();
        const cardId = state.deck[state.deckPosition];
        state.deckPosition += 1;
        state.currentCardId = cardId;
        state.usedCardIds.push(cardId);
        state.recentCardIds.push(cardId);
        state.recentCardIds = state.recentCardIds.slice(-RECENT_CARD_LIMIT);
        renderCurrentCard();
    }

    function recycleDeck() {
        const recent = new Set(state.recentCardIds);
        const fresh = shuffled(cards.map((card) => card.id));
        state.deck = fresh.filter((id) => !recent.has(id)).concat(fresh.filter((id) => recent.has(id)));
        state.deckPosition = 0;
        state.usedCardIds = [];
    }

    function renderCurrentCard() {
        const card = CARD_BY_ID.get(state.currentCardId);
        if (!card) return;
        elements["card-category"].textContent = card.category;
        elements["main-word"].textContent = card.word;
        elements["forbidden-words"].replaceChildren(...card.forbidden.map((word) => {
            const item = document.createElement("li");
            item.textContent = word;
            return item;
        }));
        elements["word-card"].setAttribute("aria-label", `${card.word}. Yasak kelimeler: ${card.forbidden.join(", ")}`);
    }

    function handleCardAction(action) {
        if (!state || state.status !== "playing" || state.paused) return;
        const team = state.teams[state.round.teamIndex];
        const playerStats = team.playerStats[state.round.playerIndex];
        if (action === "correct") {
            team.score += 1;
            team.stats.correct += 1;
            playerStats.correct += 1;
            state.round.correct += 1;
            showFeedback("Doğru · +1 puan", "success");
            playSound("correct");
        } else if (action === "taboo") {
            const previousScore = team.score;
            if (state.settings.penaltyEnabled) {
                const penalized = team.score - state.settings.penaltyAmount;
                team.score = state.settings.allowNegative ? penalized : Math.max(0, penalized);
            }
            team.stats.taboo += 1;
            playerStats.taboo += 1;
            state.round.taboo += 1;
            const loss = previousScore - team.score;
            showFeedback(loss ? `Tabu · -${loss} puan` : "Tabu", "danger");
            playSound("taboo");
        } else if (action === "pass") {
            if (!state.settings.unlimitedPasses && state.round.remainingPasses <= 0) return;
            if (!state.settings.unlimitedPasses) state.round.remainingPasses -= 1;
            team.stats.pass += 1;
            playerStats.pass += 1;
            state.round.passesUsed += 1;
            showFeedback("Pas · yeni kart", "pass");
            playSound("pass");
        }
        state.round.net = team.score - state.round.startScore;
        elements["round-correct"].textContent = state.round.correct;
        elements["round-taboo"].textContent = state.round.taboo;
        elements["round-pass"].textContent = state.round.passesUsed;
        updateScores();
        updatePassDisplay();
        animateCard(action);
        nextCard();
        saveActiveGame();
    }

    function animateCard(action) {
        const className = `is-${action}`;
        elements["word-card"].classList.remove("is-correct", "is-taboo", "is-pass");
        void elements["word-card"].offsetWidth;
        elements["word-card"].classList.add(className);
        window.setTimeout(() => elements["word-card"].classList.remove(className), 220);
    }

    function showFeedback(message, type) {
        window.clearTimeout(feedbackTimer);
        elements.feedback.textContent = message;
        elements.feedback.dataset.type = type;
        feedbackTimer = window.setTimeout(() => {
            elements.feedback.textContent = "";
            delete elements.feedback.dataset.type;
        }, 850);
    }

    function startTimer() {
        clearInterval(timerId);
        timerId = window.setInterval(tickTimer, TIMER_INTERVAL_MS);
        tickTimer();
    }

    function tickTimer() {
        if (!state || state.status !== "playing" || state.paused) return;
        state.remainingMs = Math.max(0, state.deadline - Date.now());
        const seconds = Math.ceil(state.remainingMs / 1000);
        if (seconds !== lastRenderedSecond) {
            renderTimer(seconds);
            lastRenderedSecond = seconds;
            if (seconds <= 5 && seconds > 0 && lastWarningSecond !== seconds) {
                lastWarningSecond = seconds;
                playSound("warning");
            }
            saveActiveGame();
        }
        if (state.remainingMs <= 0) {
            playSound("time");
            endRound("Süre doldu");
        }
    }

    function renderTimer(seconds) {
        elements.timer.textContent = String(Math.max(0, seconds));
        elements.timer.closest(".tabu-turn-clock")?.classList.toggle("is-warning", seconds <= 10);
    }

    function togglePause() {
        if (!state) return;
        if (state.status === "paused" || state.paused) resumeRound();
        else pauseRound();
    }

    function pauseRound() {
        if (state.status !== "playing") return;
        state.remainingMs = Math.max(0, state.deadline - Date.now());
        state.status = "paused";
        state.paused = true;
        state.deadline = null;
        clearInterval(timerId);
        timerId = null;
        renderGameScreen();
        saveActiveGame();
        elements["resume-overlay"].focus();
    }

    function resumeRound() {
        if (!state || state.status !== "paused") return;
        state.status = "playing";
        state.paused = false;
        state.deadline = Date.now() + state.remainingMs;
        renderGameScreen();
        startTimer();
        saveActiveGame();
        elements.correct.focus();
    }

    function setGameControlsDisabled(disabled) {
        elements.correct.disabled = disabled;
        elements.taboo.disabled = disabled;
        elements.pass.disabled = disabled || (!state.settings.unlimitedPasses && state.round.remainingPasses <= 0);
        elements["end-round"].disabled = disabled;
    }

    function confirmEndRound() {
        if (state?.status !== "playing") return;
        pauseRound();
        openModal({
            title: "Turu bitir?",
            message: "Kalan süre kullanılmadan tur özeti açılacak.",
            primaryLabel: "Turu Bitir",
            secondaryLabel: "Oyuna Dön",
            onPrimary: () => endRound("Tur erken bitirildi"),
            onSecondary: resumeRound,
        });
    }

    function endRound(reason) {
        if (!state || state.status === "round-summary" || state.status === "finished") return;
        clearTimers();
        const team = state.teams[state.round.teamIndex];
        const playerStats = team.playerStats[state.round.playerIndex];
        state.round.net = team.score - state.round.startScore;
        state.round.endReason = reason;
        team.stats.rounds += 1;
        team.stats.bestRound = Math.max(team.stats.bestRound, state.round.net);
        playerStats.rounds += 1;
        team.playerCursor = (state.round.playerIndex + 1) % team.players.length;
        state.completedRounds += 1;
        state.status = "round-summary";
        state.paused = false;
        state.deadline = null;
        renderRoundSummary();
        saveActiveGame();
    }

    function renderRoundSummary() {
        const team = state.teams[state.round.teamIndex];
        const player = team.players[state.round.playerIndex];
        elements["round-number"].textContent = state.round.endReason || "Tur tamamlandı";
        elements["round-team"].textContent = team.name;
        elements["round-player"].textContent = player;
        elements["summary-correct"].textContent = state.round.correct;
        elements["summary-taboo"].textContent = state.round.taboo;
        elements["summary-pass"].textContent = state.round.passesUsed;
        elements["summary-net"].textContent = signed(state.round.net);
        elements["summary-net"].className = state.round.net < 0 ? "is-negative" : "is-positive";
        updateScores();
        const winner = eligibleWinner();
        elements["next-round"].textContent = winner === null
            ? "Beraberlik Turuna Geç"
            : winner === undefined ? "Sonraki Tura Geç" : "Oyun Sonucunu Gör";
        showScreen("round");
        elements["next-round"].focus();
    }

    function eligibleWinner() {
        const roundsEqual = state.teams[0].stats.rounds === state.teams[1].stats.rounds;
        if (!roundsEqual) return undefined;
        const [first, second] = state.teams;
        const targetReached = first.score >= state.settings.target || second.score >= state.settings.target;
        if (!targetReached && !state.tieBreak) return undefined;
        if (first.score === second.score) return null;
        return first.score > second.score ? 0 : 1;
    }

    function continueAfterRound() {
        const winner = eligibleWinner();
        if (winner === 0 || winner === 1) {
            finishGame(winner);
            return;
        }
        if (winner === null) state.tieBreak = true;
        state.activeTeam = state.activeTeam === 0 ? 1 : 0;
        state.round = createRound(state);
        renderReadyScreen();
    }

    function confirmReturnToSetup() {
        openModal({
            title: "Oyun kurulumuna dön?",
            message: "Devam eden oyun ve skorlar silinecek.",
            primaryLabel: "Kuruluma Dön",
            secondaryLabel: "Vazgeç",
            onPrimary: returnToSetup,
        });
    }

    function confirmFinishGame() {
        openModal({
            title: "Oyunu bitir?",
            message: "Mevcut skorlarla oyun sonucu oluşturulacak.",
            primaryLabel: "Oyunu Bitir",
            secondaryLabel: "Vazgeç",
            onPrimary: () => finishGame(highScoreWinner()),
        });
    }

    function highScoreWinner() {
        if (state.teams[0].score === state.teams[1].score) return null;
        return state.teams[0].score > state.teams[1].score ? 0 : 1;
    }

    function finishGame(winnerIndex) {
        clearTimers();
        state.status = "finished";
        state.paused = false;
        state.deadline = null;
        clearActiveGame();
        renderEndScreen(winnerIndex);
    }

    function renderEndScreen(winnerIndex = highScoreWinner()) {
        updateScores();
        elements.winner.textContent = winnerIndex === null ? "Beraberlik" : state.teams[winnerIndex].name;
        elements["end-message"].textContent = winnerIndex === null ? "Oyun eşit skorla tamamlandı." : "Hedefe ulaşan takım oyunu kazandı.";
        elements["final-rounds"].textContent = state.completedRounds;
        elements["final-most-correct"].textContent = teamMetricLeaders("correct", "max");
        elements["final-least-taboo"].textContent = teamMetricLeaders("taboo", "min");
        renderPlayerStats();
        showScreen("end");
        elements["replay-teams"].focus();
    }

    function teamMetricLeaders(metric, direction) {
        const values = state.teams.map((team) => team.stats[metric]);
        const target = direction === "max" ? Math.max(...values) : Math.min(...values);
        return state.teams.filter((team) => team.stats[metric] === target).map((team) => team.name).join(" / ");
    }

    function renderPlayerStats() {
        elements["player-stats-body"].replaceChildren();
        state.teams.forEach((team) => {
            team.playerStats.forEach((player) => {
                const row = document.createElement("tr");
                [
                    `${player.name} (${team.name})`,
                    player.rounds,
                    player.correct,
                    player.taboo,
                    player.pass,
                ].forEach((value) => {
                    const cell = document.createElement("td");
                    cell.textContent = value;
                    row.append(cell);
                });
                elements["player-stats-body"].append(row);
            });
        });
    }

    function replayWithSameTeams() {
        const teamData = state.teams.map((team) => ({ name: team.name, players: team.players.slice() }));
        state = createGame(teamData, { ...state.settings });
        saveActiveGame();
        renderReadyScreen();
    }

    function returnToSetup() {
        clearTimers();
        if (state) {
            setupPlayers = state.teams.map((team) => team.players.slice());
            state.teams.forEach((team, index) => {
                element(`tabu-team-name-${index}`).value = team.name;
            });
            applySettingsToSetup(state.settings);
        }
        state = null;
        clearActiveGame();
        renderPlayerLists();
        updateSetupControls();
        showScreen("setup");
    }

    function applySettingsToSetup(settings) {
        setSelectOrCustom(elements.duration, elements["duration-custom"], settings.duration, [30, 45, 60, 90]);
        setSelectOrCustom(elements.target, elements["target-custom"], settings.target, [20, 30, 40, 50]);
        elements.passes.value = settings.unlimitedPasses ? "unlimited" : String(settings.passes);
        elements["penalty-enabled"].checked = settings.penaltyEnabled;
        elements["penalty-amount"].value = settings.penaltyAmount || 1;
        elements["allow-negative"].checked = settings.allowNegative;
        elements["countdown-enabled"].checked = settings.countdown;
    }

    function setSelectOrCustom(select, customInput, value, presets) {
        if (presets.includes(value)) select.value = String(value);
        else {
            select.value = "custom";
            customInput.value = String(value);
        }
    }

    function showScreen(name) {
        SCREEN_IDS.forEach((id) => {
            element(id).hidden = id !== `tabu-${name}-screen`;
        });
        element("tabu").classList.toggle("is-setup-screen", name === "setup");
        elements["setup-header-actions"].hidden = name !== "setup";
    }

    function shuffled(values) {
        const result = values.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
        }
        return result;
    }

    function signed(number) {
        return number > 0 ? `+${number}` : String(number);
    }

    function clearTimers() {
        clearInterval(timerId);
        clearInterval(countdownId);
        timerId = null;
        countdownId = null;
    }

    function toggleSound() {
        soundEnabled = !soundEnabled;
        safeStorageSet(SOUND_KEY, JSON.stringify(soundEnabled));
        updateSoundButton();
        if (soundEnabled) playSound("correct");
    }

    function updateSoundButton() {
        elements.sound.setAttribute("aria-pressed", String(soundEnabled));
        elements.sound.setAttribute("aria-label", soundEnabled ? "Oyun seslerini kapat" : "Oyun seslerini aç");
        elements.sound.querySelector("span:last-child").textContent = soundEnabled ? "Ses Açık" : "Ses Kapalı";
    }

    function playSound(type) {
        if (!soundEnabled) return;
        try {
            audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === "suspended") audioContext.resume();
            if (type === "taboo") {
                playTone(230, 0.11, 0, "square", 0.075);
                playTone(150, 0.16, 0.1, "square", 0.065);
                return;
            }
            const settings = {
                correct: [640, 0.08],
                pass: [360, 0.07],
                warning: [520, 0.05],
                time: [140, 0.22],
                tick: [420, 0.04],
            }[type] || [400, 0.06];
            playTone(settings[0], settings[1]);
        } catch (_) {
            soundEnabled = false;
            updateSoundButton();
        }
    }

    function playTone(frequency, duration, delay = 0, wave = "sine", volume = 0.045) {
        const startTime = audioContext.currentTime + delay;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    }

    function handleKeyboard(event) {
        if (!element("tabu").classList.contains("active")) return;
        if (!elements.modal.hidden) {
            handleModalKeyboard(event);
            return;
        }
        if (isTypingTarget(event.target)) return;
        if (state?.status === "ready" && event.key === "Enter") {
            event.preventDefault();
            beginReadyCountdown();
            return;
        }
        if (!state || !["playing", "paused"].includes(state.status)) return;
        const key = event.key.toLocaleLowerCase("tr-TR");
        if (event.code === "Space") {
            event.preventDefault();
            togglePause();
        } else if (state.status === "playing" && (event.key === "ArrowRight" || key === "d")) {
            event.preventDefault();
            handleCardAction("correct");
        } else if (state.status === "playing" && (event.key === "ArrowLeft" || key === "t")) {
            event.preventDefault();
            handleCardAction("taboo");
        } else if (state.status === "playing" && (event.key === "ArrowDown" || key === "p")) {
            event.preventDefault();
            handleCardAction("pass");
        }
    }

    function isTypingTarget(target) {
        return target instanceof HTMLElement && (target.matches("input, select, textarea") || target.isContentEditable);
    }

    function openModal(options) {
        modalReturnFocus = document.activeElement;
        elements["modal-title"].textContent = options.title;
        elements["modal-message"].textContent = options.message;
        elements["modal-primary"].textContent = options.primaryLabel;
        elements["modal-secondary"].textContent = options.secondaryLabel || "Vazgeç";
        elements["modal-secondary"].hidden = !options.secondaryLabel;
        modalPrimaryAction = options.onPrimary || null;
        modalSecondaryAction = options.onSecondary || null;
        elements.modal.hidden = false;
        elements["modal-primary"].focus();
    }

    function closeModal() {
        elements.modal.hidden = true;
        modalPrimaryAction = null;
        modalSecondaryAction = null;
        modalReturnFocus?.focus?.();
        modalReturnFocus = null;
    }

    function handleModalPrimary() {
        const action = modalPrimaryAction;
        closeModal();
        action?.();
    }

    function handleModalSecondary() {
        const action = modalSecondaryAction;
        closeModal();
        action?.();
    }

    function handleModalKeyboard(event) {
        if (event.key === "Escape" && !elements["modal-secondary"].hidden) {
            event.preventDefault();
            handleModalSecondary();
            return;
        }
        if (event.key !== "Tab") return;
        const buttons = [elements["modal-primary"], elements["modal-secondary"]].filter((button) => !button.hidden);
        const currentIndex = buttons.indexOf(document.activeElement);
        if (event.shiftKey && currentIndex <= 0) {
            event.preventDefault();
            buttons[buttons.length - 1].focus();
        } else if (!event.shiftKey && currentIndex === buttons.length - 1) {
            event.preventDefault();
            buttons[0].focus();
        }
    }

    function saveActiveGame() {
        if (!state || state.status === "finished") return;
        const saved = snapshotState();
        safeStorageSet(SAVE_KEY, JSON.stringify(saved));
    }

    function snapshotState() {
        const saved = JSON.parse(JSON.stringify(state));
        if (state.status === "playing" && !state.paused && state.deadline) {
            saved.remainingMs = Math.max(0, state.deadline - Date.now());
        }
        saved.deadline = null;
        return saved;
    }

    function saveBeforeUnload() {
        saveActiveGame();
    }

    function loadActiveGame() {
        let parsed;
        try {
            parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
        } catch (_) {
            clearActiveGame();
            return null;
        }
        if (!isValidSavedGame(parsed)) {
            clearActiveGame();
            return null;
        }
        if (parsed.status === "playing" || parsed.status === "paused" || parsed.status === "countdown") {
            parsed.status = "paused";
            parsed.paused = true;
        }
        parsed.deadline = null;
        parsed.remainingMs = Math.max(0, Math.min(parsed.remainingMs, parsed.settings.duration * 1000));
        return parsed;
    }

    function isValidSavedGame(saved) {
        if (!saved || saved.version !== SAVE_VERSION) return false;
        if (!Array.isArray(saved.teams) || saved.teams.length !== 2) return false;
        if (!saved.teams.every(validSavedTeam)) return false;
        if (!saved.settings || !Number.isInteger(saved.settings.duration) || !Number.isInteger(saved.settings.target)) return false;
        if (!["ready", "countdown", "playing", "paused", "round-summary"].includes(saved.status)) return false;
        if (![0, 1].includes(saved.activeTeam) || !saved.round || ![0, 1].includes(saved.round.teamIndex)) return false;
        if (!Array.isArray(saved.deck) || saved.deck.length !== cards.length || saved.deck.some((id) => !CARD_BY_ID.has(id))) return false;
        if (!Number.isFinite(saved.remainingMs) || !Number.isInteger(saved.deckPosition)) return false;
        return true;
    }

    function validSavedTeam(team) {
        return team && typeof team.name === "string" && team.name.trim() && Array.isArray(team.players) && team.players.length > 0
            && team.players.every((name) => typeof name === "string" && name.trim())
            && Number.isFinite(team.score) && team.stats && Array.isArray(team.playerStats)
            && team.playerStats.length === team.players.length;
    }

    function resumeSavedGame(saved) {
        state = saved;
        setupPlayers = state.teams.map((team) => team.players.slice());
        renderCurrentState();
        focusTabuPanelOnMobile();
    }

    function clearActiveGame() {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch (_) {
            // Storage can be unavailable in strict privacy modes.
        }
    }

    function safeStorageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (_) {
            // The game remains playable when storage is unavailable.
        }
    }

    function readBoolean(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return typeof value === "boolean" ? value : fallback;
        } catch (_) {
            return fallback;
        }
    }
})();
