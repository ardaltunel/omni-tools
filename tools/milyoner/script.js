(function initMillionaireApp() {
    "use strict";

    const engine = window.OmniMillionaireEngine;
    const questionBank = window.OmniMillionaireQuestions;
    const audio = window.OmniMillionaireAudio;
    const panel = document.getElementById("milyoner");
    const app = document.getElementById("millionaire-app");

    if (!engine || !Array.isArray(questionBank) || !audio || !panel || !app) return;

    const ACTIVE_GAME_KEY = "omni-millionaire-active-v1";
    const STATS_KEY = "omni-millionaire-stats-v1";
    const SETTINGS_KEY = "omni-millionaire-settings-v1";
    const RECENT_QUESTIONS_KEY = "omni-millionaire-recent-v1";
    const RECENT_QUESTION_LIMIT = 60;
    const OPTION_LETTERS = ["A", "B", "C", "D"];
    const DEFAULT_SETTINGS = Object.freeze({
        sound: true,
        music: false,
        animations: true,
        vibration: true,
        fastTransitions: false,
        highContrast: false,
        fontSize: "normal",
    });
    const LIFELINE_LABELS = Object.freeze({ fifty: "Yarı Yarıya", audience: "Seyirciye Sor", phone: "Telefon" });

    const ids = [
        "home", "game", "result", "start", "resume-card", "resume-summary", "resume", "new-from-save",
        "rules", "stats", "settings", "sound", "timer-card", "timer", "fifty", "audience", "phone",
        "ladder-toggle", "withdraw", "question-card", "question", "answers", "decision", "selection-text",
        "confirm", "change", "feedback",
        "feedback-title", "explanation", "next", "ladder", "ladder-close", "ladder-list", "ladder-backdrop",
        "result-emblem", "result-kicker", "result-title", "result-message", "result-prize", "result-question",
        "result-correct", "result-lifelines", "result-average", "result-duration", "replay", "result-home",
        "review", "confetti", "modal", "modal-title", "modal-close", "modal-body", "modal-actions", "live",
    ];
    const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(`millionaire-${id}`)]));
    let state = null;
    let settings = loadSettings();
    let stats = loadStats();
    let locked = false;
    let timerId = 0;
    let transitionId = 0;
    let modalReturnFocus = null;

    buildLadder();
    bindEvents();
    applySettings();
    showHome();

    function bindEvents() {
        elements.start.addEventListener("click", startNewGame);
        elements.resume.addEventListener("click", resumeSavedGame);
        elements["new-from-save"].addEventListener("click", startNewGame);
        elements.rules.addEventListener("click", showRules);
        elements.stats.addEventListener("click", showStats);
        elements.settings.addEventListener("click", showSettings);
        elements.sound.addEventListener("click", toggleSound);
        elements.fifty.addEventListener("click", useFifty);
        elements.audience.addEventListener("click", useAudience);
        elements.phone.addEventListener("click", choosePhoneAdviser);
        elements.withdraw.addEventListener("click", confirmWithdraw);
        elements.confirm.addEventListener("click", confirmSelectedAnswer);
        elements.change.addEventListener("click", clearSelectedAnswer);
        elements.next.addEventListener("click", advanceGame);
        elements.replay.addEventListener("click", startNewGame);
        elements["result-home"].addEventListener("click", showHome);
        elements.review.addEventListener("click", showReview);
        elements["ladder-toggle"].addEventListener("click", openLadder);
        elements["ladder-close"].addEventListener("click", closeLadder);
        elements["ladder-backdrop"].addEventListener("click", closeLadder);
        elements["modal-close"].addEventListener("click", closeModal);
        elements.modal.querySelector("[data-millionaire-modal-close]").addEventListener("click", closeModal);

        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("tool-activated", handleToolActivated);
        window.addEventListener("beforeunload", saveActiveGame);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) updateTimer();
        });
    }

    function handleToolActivated(event) {
        if (event.detail?.tool === "milyoner") {
            applySettings();
            if (state?.status === "playing") startTimerLoop();
            if (state && ["playing", "review"].includes(state.status)) audio.startMusic();
            return;
        }
        stopTimerLoop();
        audio.stopMusic();
        closeLadder();
        closeModal();
    }

    function startNewGame() {
        cancelTransition();
        closeModal();
        closeLadder();
        removeStorage(ACTIVE_GAME_KEY);
        const recentIds = loadJson(RECENT_QUESTIONS_KEY, []);
        state = engine.createGame({ questions: questionBank, recentIds });
        locked = false;
        showScreen("game");
        audio.effects.select();
        audio.startMusic();
        renderGame();
        saveActiveGame();
        window.setTimeout(() => elements.answers.querySelector("button:not(:disabled)")?.focus(), 0);
    }

    function resumeSavedGame() {
        const saved = loadActiveGame();
        if (!saved) {
            showHome();
            announce("Kayıtlı yarışma bulunamadı.");
            return;
        }
        cancelTransition();
        state = saved;
        locked = false;
        showScreen("game");
        audio.startMusic();
        renderGame();
        updateTimer();
    }

    function showHome() {
        cancelTransition();
        stopTimerLoop();
        audio.stopMusic();
        closeModal();
        closeLadder();
        showScreen("home");
        app.classList.remove("is-final-question", "is-jackpot");
        elements.confetti.replaceChildren();
        const saved = loadActiveGame();
        elements["resume-card"].hidden = !saved;
        if (saved) {
            elements["resume-summary"].textContent = `${saved.questionIndex + 1}. soru • ${formatMoney(saved.currentPrize)}`;
        }
    }

    function showScreen(name) {
        elements.home.hidden = name !== "home";
        elements.game.hidden = name !== "game";
        elements.result.hidden = name !== "result";
    }

    function renderGame() {
        if (!state) return;
        const question = engine.getCurrentQuestion(state);
        if (!question) return;
        const outcome = state.answers[state.answers.length - 1];
        const isReview = state.status === "review";
        const isFinal = state.questionIndex === state.questions.length - 1;

        app.classList.toggle("is-final-question", isFinal);
        elements.question.textContent = question.text;
        elements["question-card"].classList.toggle("is-final", isFinal);
        renderTimerState();

        renderAnswers(question, isReview ? outcome : null);
        renderLifelines();
        renderLadder();

        const hasSelection = state.selectedOption !== null;
        elements.decision.hidden = isReview || !hasSelection;
        if (hasSelection) {
            elements["selection-text"].textContent = `${engine.optionLetter(state.selectedOption)} seçeneğini işaretledin.`;
        }

        elements.feedback.hidden = !isReview;
        if (isReview && outcome) renderFeedback(question, outcome);

        if (state.status === "playing") startTimerLoop();
        else stopTimerLoop();
        saveActiveGame();
    }

    function renderAnswers(question, outcome) {
        const fragment = document.createDocumentFragment();

        question.options.forEach((option, index) => {
            const button = document.createElement("button");
            const letter = document.createElement("span");
            const text = document.createElement("span");
            const isHidden = state.hiddenOptions.includes(index);

            button.type = "button";
            button.className = "millionaire-answer";
            button.dataset.optionIndex = String(index);
            button.setAttribute("aria-label", `${OPTION_LETTERS[index]} seçeneği: ${option}`);
            letter.className = "millionaire-answer-letter";
            letter.textContent = OPTION_LETTERS[index];
            text.className = "millionaire-answer-text";
            text.textContent = isHidden ? "Seçenek kaldırıldı" : option;
            button.append(letter, text);

            if (isHidden) {
                button.classList.add("is-eliminated");
                button.disabled = true;
            } else if (outcome) {
                button.disabled = true;
                if (index === outcome.correctIndex) button.classList.add("is-correct");
                if (index === outcome.selectedIndex && !outcome.isCorrect) button.classList.add("is-wrong");
            } else {
                button.classList.toggle("is-selected", state.selectedOption === index);
                button.setAttribute("aria-pressed", String(state.selectedOption === index));
                button.addEventListener("click", () => selectAnswer(index));
            }

            fragment.appendChild(button);
        });
        elements.answers.replaceChildren(fragment);
    }

    function selectAnswer(index) {
        if (locked || !engine.selectAnswer(state, index)) return;
        audio.effects.select();
        vibrate(20);
        renderGame();
        elements.confirm.focus();
    }

    function clearSelectedAnswer() {
        if (locked || !engine.clearSelection(state)) return;
        renderGame();
        elements.answers.querySelector("button:not(:disabled)")?.focus();
    }

    function confirmSelectedAnswer() {
        if (locked || !state || state.status !== "playing" || state.selectedOption === null) return;
        const outcome = engine.confirmAnswer(state);
        if (!outcome) return;
        beginAnswerReveal(outcome);
    }

    function beginAnswerReveal(outcome) {
        locked = true;
        stopTimerLoop();
        audio.effects.lock();
        elements.decision.hidden = true;
        Array.from(elements.answers.children).forEach((button) => { button.disabled = true; });
        app.classList.add("is-answer-locking");
        saveActiveGame();

        transitionId = window.setTimeout(() => {
            transitionId = 0;
            locked = false;
            app.classList.remove("is-answer-locking");
            if (!state || state.status !== "review") return;
            if (outcome.isCorrect) {
                audio.effects.correct();
                vibrate([35, 30, 45]);
            } else {
                audio.effects.wrong();
                vibrate([80, 40, 80]);
            }
            renderGame();
            elements.next.focus();
        }, transitionDelay(1050));
    }

    function renderFeedback(question, outcome) {
        if (outcome.timedOut) {
            elements["feedback-title"].textContent = "Süre doldu";
            elements.feedback.className = "millionaire-feedback is-wrong";
        } else if (outcome.isCorrect) {
            elements["feedback-title"].textContent = "Doğru cevap";
            elements.feedback.className = "millionaire-feedback is-correct";
        } else {
            elements["feedback-title"].textContent = "Yanlış cevap";
            elements.feedback.className = "millionaire-feedback is-wrong";
        }
        elements.explanation.textContent = question.explanation;
        const isLastCorrect = outcome.isCorrect && state.questionIndex === state.questions.length - 1;
        elements.next.textContent = outcome.isCorrect
            ? (isLastCorrect ? "Büyük Ödülü Gör" : "Sonraki Soru")
            : "Sonucu Gör";
    }

    function advanceGame() {
        if (locked || !state || state.status !== "review") return;
        const response = engine.advance(state);
        if (!response) return;
        if (response.finished) {
            finishGame();
            return;
        }
        audio.effects.select();
        renderGame();
        window.setTimeout(() => elements.answers.querySelector("button:not(:disabled)")?.focus(), 0);
    }

    function useFifty() {
        if (locked || !state) return;
        const hidden = engine.useFifty(state);
        if (!hidden) return;
        audio.effects.lifeline();
        vibrate(25);
        announce("İki yanlış seçenek kaldırıldı.");
        renderGame();
    }

    function useAudience() {
        if (locked || !state) return;
        const result = engine.useAudience(state);
        if (!result) return;
        audio.effects.lifeline();
        renderGame();
        const question = engine.getCurrentQuestion(state);
        const chart = createElement("div", "millionaire-audience-chart");
        result.forEach((percentage, index) => {
            const item = createElement("div", "millionaire-audience-item");
            const label = createElement("span", "", OPTION_LETTERS[index]);
            const track = createElement("div", "millionaire-audience-track");
            const bar = createElement("span", "millionaire-audience-bar");
            const value = createElement("strong", "", `%${percentage}`);
            bar.style.setProperty("--millionaire-poll", `${percentage}%`);
            if (state.hiddenOptions.includes(index)) item.classList.add("is-eliminated");
            track.appendChild(bar);
            item.append(label, track, value);
            chart.appendChild(item);
        });
        openModal("Seyirci Oylaması", [
            createElement("p", "millionaire-modal-intro", "Seyircilerin bu soru için verdiği yanıtlar:"),
            chart,
        ], [{ label: "Yarışmaya Dön", className: "primary-button", action: closeModal }], elements.audience);
    }

    function choosePhoneAdviser() {
        if (locked || !state || state.lifelines.phone || state.status !== "playing") return;
        const intro = createElement("p", "millionaire-modal-intro", "Bu soru için danışmak istediğin kişiyi seç.");
        const list = createElement("div", "millionaire-adviser-list");
        engine.ADVISERS.forEach((adviser) => {
            const button = createElement("button", "millionaire-adviser");
            button.type = "button";
            button.append(
                createElement("strong", "", adviser.name),
                createElement("span", "", adviser.categories.join(" • ")),
            );
            button.addEventListener("click", () => callAdviser(adviser.id));
            list.appendChild(button);
        });
        openModal("Telefon Jokeri", [intro, list], [], elements.phone);
    }

    function callAdviser(adviserId) {
        const result = engine.usePhone(state, adviserId);
        if (!result) return;
        audio.effects.lifeline();
        renderGame();
        const message = createElement("blockquote", "millionaire-phone-message", result.message);
        const adviser = createElement("strong", "millionaire-phone-name", result.adviserName);
        replaceModalContent("Telefon Görüşmesi", [adviser, message], [
            { label: "Yarışmaya Dön", className: "primary-button", action: closeModal },
        ]);
    }

    function renderLifelines() {
        const map = { fifty: elements.fifty, audience: elements.audience, phone: elements.phone };
        Object.entries(map).forEach(([name, button]) => {
            const used = Boolean(state.lifelines[name]);
            button.disabled = used || state.status !== "playing" || locked;
            button.classList.toggle("is-used", used);
            button.setAttribute("aria-label", used ? `${LIFELINE_LABELS[name]} jokeri kullanıldı` : `${LIFELINE_LABELS[name]} jokerini kullan`);
        });
        elements.withdraw.disabled = locked || state.status !== "playing";
    }

    function buildLadder() {
        const fragment = document.createDocumentFragment();
        engine.PRIZES.slice().reverse().forEach((prize, reverseIndex) => {
            const index = engine.PRIZES.length - reverseIndex - 1;
            const item = document.createElement("li");
            const number = createElement("span", "", String(index + 1));
            const amount = createElement("strong", "", formatMoney(prize));
            item.dataset.prizeIndex = String(index);
            if ([4, 9, 14].includes(index)) {
                item.classList.add("is-guarantee");
            }
            if ([4, 9].includes(index)) {
                item.setAttribute("aria-label", `${index + 1}. soru, garanti ödül ${formatMoney(prize)}`);
            }
            item.append(number, amount);
            fragment.appendChild(item);
        });
        elements["ladder-list"].replaceChildren(fragment);
    }

    function renderLadder() {
        Array.from(elements["ladder-list"].children).forEach((item) => {
            const index = Number(item.dataset.prizeIndex);
            item.classList.toggle("is-current", index === state.questionIndex);
            item.classList.toggle("is-reached", index < state.questionIndex || (state.status === "review" && state.answers.at(-1)?.isCorrect && index === state.questionIndex));
            item.classList.toggle("is-outside-mode", index >= state.questions.length);
        });
    }

    function openLadder() {
        elements.ladder.classList.add("is-open");
        elements["ladder-backdrop"].hidden = false;
        elements["ladder-toggle"].setAttribute("aria-expanded", "true");
        elements["ladder-close"].focus();
    }

    function closeLadder() {
        elements.ladder.classList.remove("is-open");
        elements["ladder-backdrop"].hidden = true;
        elements["ladder-toggle"].setAttribute("aria-expanded", "false");
    }

    function confirmWithdraw() {
        if (!state || state.status !== "playing") return;
        const currentPrize = formatMoney(state.currentPrize);
        openModal("Yarışmadan Çekil", [
            createElement("p", "millionaire-modal-intro", `${currentPrize} ile yarışmayı tamamlamak istediğine emin misin?`),
        ], [
            { label: "Yarışmaya Dön", className: "secondary-button", action: closeModal },
            { label: "Çekil ve Tamamla", className: "primary-button", action: withdrawFromGame },
        ], elements.withdraw);
    }

    function withdrawFromGame() {
        if (!state) return;
        engine.withdraw(state);
        closeModal();
        finishGame();
    }

    function finishGame() {
        if (!state?.result) return;
        cancelTransition();
        stopTimerLoop();
        closeModal();
        closeLadder();
        audio.stopMusic();
        removeStorage(ACTIVE_GAME_KEY);
        updateRecentQuestions();
        recordStats();
        showScreen("result");
        renderResult();
    }

    function renderResult() {
        const result = state.result;
        const jackpot = result.reason === "completed" && result.winnings === 1000000;
        app.classList.toggle("is-jackpot", jackpot);
        app.classList.remove("is-final-question");
        elements["result-prize"].textContent = formatMoney(result.winnings);
        elements["result-question"].textContent = `${result.reachedQuestion} / ${state.questions.length}`;
        elements["result-correct"].textContent = String(result.correctCount);
        elements["result-lifelines"].textContent = String(result.usedLifelines.length);
        elements["result-average"].textContent = formatDuration(result.averageAnswerMs);
        elements["result-duration"].textContent = formatDuration(result.totalDurationMs);

        if (jackpot) {
            elements["result-kicker"].textContent = "1.000.000 TL";
            elements["result-title"].textContent = "Büyük ödül senin!";
            elements["result-message"].textContent = "15 sorunun tamamını doğru cevapladın ve 1.000.000 TL'ye ulaştın.";
            elements["result-emblem"].textContent = "★";
            audio.effects.final();
            createConfetti();
        } else if (result.reason === "withdrawn") {
            elements["result-kicker"].textContent = "Doğru zamanda karar verdin";
            elements["result-title"].textContent = "Yarışmayı tamamladın";
            elements["result-message"].textContent = `${formatMoney(result.winnings)} ödülünü güvenceye aldın.`;
            elements["result-emblem"].textContent = "✓";
        } else if (result.reason === "completed") {
            elements["result-kicker"].textContent = "Yarışma tamamlandı";
            elements["result-title"].textContent = "Harika bir yarışma";
            elements["result-message"].textContent = `${state.questions.length} sorunun tamamını doğru cevapladın.`;
            elements["result-emblem"].textContent = "★";
            audio.effects.final();
        } else {
            elements["result-kicker"].textContent = "Yarışma tamamlandı";
            elements["result-title"].textContent = "Güzel bir denemeydi";
            elements["result-message"].textContent = `${result.reachedQuestion}. soruda yarışmaya veda ettin ve ${formatMoney(result.winnings)} kazandın.`;
            elements["result-emblem"].textContent = "•";
        }
        elements.replay.focus();
    }

    function showRules() {
        const list = createElement("ol", "millionaire-rules-list");
        [
            "Her soruda A, B, C veya D seçeneklerinden birini seç; ardından Son Kararım ile cevabını kilitle.",
            "Yarı Yarıya, Seyirciye Sor ve Telefon jokerlerinin her biri yarışma boyunca bir kez kullanılabilir.",
            "5. soru 10.000 TL, 10. soru 100.000 TL garanti basamağıdır.",
            "Cevabı kilitlemeden önce yarışmadan çekilerek ulaştığın mevcut ödülü alabilirsin.",
            "İlk 6 soruda 30 saniye süren vardır; 7. sorudan itibaren süre sınırı kalkar.",
        ].forEach((rule) => {
            const item = document.createElement("li");
            item.textContent = rule;
            list.appendChild(item);
        });
        openModal("Nasıl Oynanır?", [list], [{ label: "Anladım", className: "primary-button", action: closeModal }], elements.rules);
    }

    function showStats() {
        const accuracy = stats.totalCorrect + stats.totalWrong
            ? Math.round((stats.totalCorrect / (stats.totalCorrect + stats.totalWrong)) * 100)
            : 0;
        const grid = createElement("div", "millionaire-stats-grid");
        [
            ["Toplam oyun", stats.totalGames],
            ["En yüksek ödül", formatMoney(stats.highestPrize)],
            ["En yüksek soru", stats.highestQuestion],
            ["Doğruluk oranı", `%${accuracy}`],
            ["Doğru / Yanlış", `${stats.totalCorrect} / ${stats.totalWrong}`],
            ["Yarışmadan çekilme", stats.withdrawals],
            ["Büyük ödül", stats.jackpots],
            ["Toplam joker", stats.lifelines.fifty + stats.lifelines.audience + stats.lifelines.phone],
        ].forEach(([label, value]) => {
            const item = createElement("div");
            item.append(createElement("span", "", String(label)), createElement("strong", "", String(value)));
            grid.appendChild(item);
        });
        openModal("İstatistikler", [grid], [{ label: "Kapat", className: "primary-button", action: closeModal }], elements.stats);
    }

    function showSettings() {
        const form = createElement("div", "millionaire-settings-list");
        const toggles = [
            ["sound", "Ses", "Doğru, yanlış ve seçim efektleri"],
            ["music", "Müzik", "Özgün ve hafif arka plan atmosferi"],
            ["animations", "Animasyon", "Geçiş ve vurgu hareketleri"],
            ["vibration", "Titreşim", "Desteklenen cihazlarda dokunsal geri bildirim"],
            ["fastTransitions", "Hızlı geçişler", "Cevap bekleme süresini kısaltır"],
            ["highContrast", "Yüksek kontrast", "Metin ve kenar ayrımını güçlendirir"],
        ];
        toggles.forEach(([key, label, description]) => {
            const row = createElement("label", "millionaire-setting-row");
            const copy = createElement("span");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = Boolean(settings[key]);
            input.addEventListener("change", () => updateSetting(key, input.checked));
            copy.append(createElement("strong", "", label), createElement("small", "", description));
            row.append(copy, input);
            form.appendChild(row);
        });

        const fontRow = createElement("label", "millionaire-setting-row");
        const fontCopy = createElement("span");
        const select = document.createElement("select");
        fontCopy.append(createElement("strong", "", "Yazı boyutu"), createElement("small", "", "Soru ve cevap metinlerinin boyutu"));
        [["small", "Küçük"], ["normal", "Normal"], ["large", "Büyük"]].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            option.selected = settings.fontSize === value;
            select.appendChild(option);
        });
        select.addEventListener("change", () => updateSetting("fontSize", select.value));
        fontRow.append(fontCopy, select);
        form.appendChild(fontRow);

        openModal("Ayarlar", [form], [{ label: "Tamam", className: "primary-button", action: closeModal }], elements.settings);
    }

    function showReview() {
        if (!state) return;
        const list = createElement("div", "millionaire-review-list");
        state.questions.forEach((question, index) => {
            const answer = state.answers.find((item) => item.questionId === question.id);
            const card = createElement("article", "millionaire-review-item");
            if (answer) card.classList.add(answer.isCorrect ? "is-correct" : "is-wrong");
            card.append(
                createElement("span", "", `${index + 1}. soru`),
                createElement("strong", "", question.text),
                createElement("p", "", answer
                    ? `Cevabın: ${answer.selectedIndex >= 0 ? `${OPTION_LETTERS[answer.selectedIndex]} - ${question.options[answer.selectedIndex]}` : "Süre doldu"}`
                    : "Bu soru yanıtlanmadı."),
                createElement("p", "millionaire-review-correct", `Doğru: ${OPTION_LETTERS[question.correctIndex]} - ${question.options[question.correctIndex]}`),
            );
            list.appendChild(card);
        });
        openModal("Cevapları İncele", [list], [{ label: "Kapat", className: "primary-button", action: closeModal }], elements.review);
    }

    function openModal(title, bodyNodes, actions, trigger) {
        modalReturnFocus = trigger || document.activeElement;
        elements["modal-title"].textContent = title;
        elements["modal-body"].replaceChildren(...bodyNodes);
        renderModalActions(actions);
        elements.modal.hidden = false;
        document.body.classList.add("millionaire-modal-open");
        window.setTimeout(() => elements["modal-close"].focus(), 0);
    }

    function replaceModalContent(title, bodyNodes, actions) {
        elements["modal-title"].textContent = title;
        elements["modal-body"].replaceChildren(...bodyNodes);
        renderModalActions(actions);
        elements["modal-close"].focus();
    }

    function renderModalActions(actions) {
        const fragment = document.createDocumentFragment();
        actions.forEach((action) => {
            const button = createElement("button", action.className || "secondary-button", action.label);
            button.type = "button";
            button.addEventListener("click", action.action);
            fragment.appendChild(button);
        });
        elements["modal-actions"].replaceChildren(fragment);
    }

    function closeModal() {
        if (elements.modal.hidden) return;
        elements.modal.hidden = true;
        document.body.classList.remove("millionaire-modal-open");
        const target = modalReturnFocus;
        modalReturnFocus = null;
        if (target instanceof HTMLElement && document.contains(target)) target.focus();
    }

    function handleKeyboard(event) {
        if (document.querySelector(".tool-panel.active")?.id !== "milyoner") return;
        const target = event.target;
        const editable = target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

        if (!elements.modal.hidden) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeModal();
            } else if (event.key === "Tab") {
                trapModalFocus(event);
            }
            return;
        }
        if (editable || elements.game.hidden || !state) return;

        const answerIndex = OPTION_LETTERS.indexOf(event.key.toLocaleUpperCase("tr-TR"));
        if (answerIndex >= 0 && state.status === "playing") {
            event.preventDefault();
            selectAnswer(answerIndex);
            return;
        }
        if (event.key === "Enter" && state.status === "playing" && state.selectedOption !== null) {
            event.preventDefault();
            confirmSelectedAnswer();
            return;
        }
        if (event.key === "Escape" && state.status === "playing" && state.selectedOption !== null) {
            event.preventDefault();
            clearSelectedAnswer();
        }
    }

    function trapModalFocus(event) {
        const focusable = Array.from(elements.modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'));
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

    function startTimerLoop() {
        stopTimerLoop();
        if (!state || state.status !== "playing" || !state.timerEndsAt) return;
        updateTimer();
        if (state.status !== "playing" || locked) return;
        timerId = window.setInterval(updateTimer, 250);
    }

    function renderTimerState() {
        const timerCard = elements["timer-card"];
        const duration = engine.getTimerLimitMs(state?.questionIndex);
        const isTimedQuestion = Boolean(duration);

        timerCard.hidden = false;
        timerCard.parentElement.hidden = false;
        timerCard.classList.toggle("is-untimed", !isTimedQuestion);

        if (state?.timerEndsAt) {
            updateTimer();
            return;
        }

        if (isTimedQuestion) {
            const outcome = state.answers.at(-1);
            const isCurrentOutcome = outcome?.questionNumber === state.questionIndex + 1;
            const remaining = isCurrentOutcome ? Math.max(0, duration - Number(outcome.elapsedMs || 0)) : 0;
            renderTimerValue(remaining, duration);
            return;
        }

        elements.timer.textContent = "∞";
        timerCard.style.setProperty("--millionaire-timer-progress", "360deg");
        timerCard.setAttribute("aria-label", "Süre sınırı yok");
        timerCard.classList.remove("is-warning", "is-urgent");
    }

    function stopTimerLoop() {
        if (timerId) window.clearInterval(timerId);
        timerId = 0;
    }

    function updateTimer() {
        if (!state || state.status !== "playing" || !state.timerEndsAt) return;
        const remaining = Math.max(0, state.timerEndsAt - Date.now());
        const duration = engine.getTimerLimitMs(state.questionIndex) || 30000;
        renderTimerValue(remaining, duration);
        if (remaining <= 0 && !locked) {
            const outcome = engine.expireQuestion(state);
            if (outcome) beginAnswerReveal(outcome);
        }
    }

    function renderTimerValue(remaining, duration) {
        const seconds = Math.ceil(remaining / 1000);
        const progress = Math.max(0, Math.min(1, remaining / duration));
        elements.timer.textContent = String(seconds);
        elements["timer-card"].style.setProperty("--millionaire-timer-progress", `${progress * 360}deg`);
        elements["timer-card"].setAttribute("aria-label", `Kalan süre: ${seconds} saniye`);
        elements["timer-card"].classList.toggle("is-warning", seconds <= 20 && seconds > 10);
        elements["timer-card"].classList.toggle("is-urgent", seconds <= 10);
    }

    function toggleSound() {
        updateSetting("sound", !settings.sound);
        if (settings.sound) audio.effects.select();
    }

    function updateSetting(key, value) {
        settings = { ...settings, [key]: value };
        saveJson(SETTINGS_KEY, settings);
        applySettings();
        if (state && ["playing", "review"].includes(state.status) && settings.music) audio.startMusic();
    }

    function applySettings() {
        app.classList.toggle("millionaire-no-motion", !settings.animations);
        app.classList.toggle("millionaire-high-contrast", settings.highContrast);
        app.classList.remove("millionaire-font-small", "millionaire-font-large");
        if (settings.fontSize === "small") app.classList.add("millionaire-font-small");
        if (settings.fontSize === "large") app.classList.add("millionaire-font-large");
        elements.sound.setAttribute("aria-pressed", String(settings.sound));
        elements.sound.setAttribute("aria-label", settings.sound ? "Sesi kapat" : "Sesi aç");
        elements.sound.lastElementChild.textContent = settings.sound ? "Ses Açık" : "Ses Kapalı";
        audio.setSettings(settings);
    }

    function recordStats() {
        if (!state?.result || state.result.statsRecorded) return;
        const result = state.result;
        result.statsRecorded = true;
        stats.totalGames += 1;
        stats.highestPrize = Math.max(stats.highestPrize, result.winnings);
        stats.highestQuestion = Math.max(stats.highestQuestion, result.reachedQuestion);
        stats.totalCorrect += result.correctCount;
        stats.totalWrong += result.wrongCount;
        stats.withdrawals += result.reason === "withdrawn" ? 1 : 0;
        stats.jackpots += result.winnings === 1000000 ? 1 : 0;
        result.usedLifelines.forEach((name) => { stats.lifelines[name] += 1; });
        stats.recentGames.unshift({
            id: state.id,
            date: new Date().toISOString(),
            winnings: result.winnings,
            reachedQuestion: result.reachedQuestion,
            correctCount: result.correctCount,
            reason: result.reason,
        });
        stats.recentGames = stats.recentGames.slice(0, 20);
        saveJson(STATS_KEY, stats);
    }

    function updateRecentQuestions() {
        if (!state?.questions) return;
        const previous = loadJson(RECENT_QUESTIONS_KEY, []);
        const combined = [...state.questions.map((question) => question.id), ...previous];
        saveJson(RECENT_QUESTIONS_KEY, [...new Set(combined)].slice(0, RECENT_QUESTION_LIMIT));
    }

    function createConfetti() {
        const fragment = document.createDocumentFragment();
        const colors = ["var(--accent)", "var(--accent-2)", "#7ea7ff", "#f6f7fb", "#d5b85a"];
        for (let index = 0; index < 42; index += 1) {
            const piece = document.createElement("span");
            piece.style.setProperty("--millionaire-x", `${(Math.random() - 0.5) * 680}px`);
            piece.style.setProperty("--millionaire-delay", `${Math.random() * 0.5}s`);
            piece.style.setProperty("--millionaire-rotate", `${Math.random() * 720 - 360}deg`);
            piece.style.background = colors[index % colors.length];
            fragment.appendChild(piece);
        }
        elements.confetti.replaceChildren(fragment);
    }

    function loadSettings() {
        const saved = loadJson(SETTINGS_KEY, null);
        if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
        return {
            ...DEFAULT_SETTINGS,
            ...saved,
            fontSize: ["small", "normal", "large"].includes(saved.fontSize) ? saved.fontSize : "normal",
        };
    }

    function loadStats() {
        const fallback = {
            version: 1,
            totalGames: 0,
            highestPrize: 0,
            highestQuestion: 0,
            totalCorrect: 0,
            totalWrong: 0,
            lifelines: { fifty: 0, audience: 0, phone: 0 },
            withdrawals: 0,
            jackpots: 0,
            recentGames: [],
        };
        const saved = loadJson(STATS_KEY, null);
        if (!saved || saved.version !== 1 || typeof saved.lifelines !== "object") return fallback;
        return {
            ...fallback,
            ...saved,
            lifelines: { ...fallback.lifelines, ...saved.lifelines },
            recentGames: Array.isArray(saved.recentGames) ? saved.recentGames.slice(0, 20) : [],
        };
    }

    function loadActiveGame() {
        const saved = loadJson(ACTIVE_GAME_KEY, null);
        if (!engine.isValidSavedGame(saved) || saved.status === "finished") {
            if (saved !== null) removeStorage(ACTIVE_GAME_KEY);
            return null;
        }
        return saved;
    }

    function saveActiveGame() {
        if (!state || !["playing", "review"].includes(state.status)) return;
        saveJson(ACTIVE_GAME_KEY, state);
    }

    function saveJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Oyun localStorage kullanılamadığında bellekte çalışmaya devam eder.
        }
    }

    function loadJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            removeStorage(key);
            return fallback;
        }
    }

    function removeStorage(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            // Depolama kapalıysa temizleme işlemi atlanır.
        }
    }

    function createElement(tagName, className = "", text = "") {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== "") node.textContent = text;
        return node;
    }

    function formatMoney(value) {
        return `${Math.round(Number(value) || 0).toLocaleString("tr-TR")} TL`;
    }

    function formatDuration(milliseconds) {
        const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
        if (totalSeconds < 60) return `${totalSeconds} sn`;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes} dk ${seconds} sn`;
    }

    function transitionDelay(normalDelay) {
        if (!settings.animations || settings.fastTransitions || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return Math.min(280, normalDelay);
        }
        return normalDelay;
    }

    function vibrate(pattern) {
        if (settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
    }

    function announce(message) {
        elements.live.textContent = "";
        window.setTimeout(() => { elements.live.textContent = message; }, 10);
    }

    function cancelTransition() {
        if (transitionId) window.clearTimeout(transitionId);
        transitionId = 0;
        locked = false;
        app.classList.remove("is-answer-locking");
    }
})();
