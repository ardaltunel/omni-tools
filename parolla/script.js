const parollaRoot = document.getElementById("parolla");
const parollaStartButton = document.getElementById("parolla-start");
const parollaEndButton = document.getElementById("parolla-end");
const parollaRestartButton = document.getElementById("parolla-restart");
const parollaPassButton = document.getElementById("parolla-pass");
const parollaForm = document.getElementById("parolla-form");
const parollaAnswer = document.getElementById("parolla-answer");
const parollaIntro = document.getElementById("parolla-intro");
const parollaPlay = document.getElementById("parolla-play");
const parollaFinal = document.getElementById("parolla-final");
const parollaTime = document.getElementById("parolla-time");
const parollaScore = document.getElementById("parolla-score");
const parollaProgress = document.getElementById("parolla-progress");
const parollaLetter = document.getElementById("parolla-letter");
const parollaQuestion = document.getElementById("parolla-question");
const parollaFeedback = document.getElementById("parolla-feedback");
const parollaCorrect = document.getElementById("parolla-correct");
const parollaWrong = document.getElementById("parolla-wrong");
const parollaPassed = document.getElementById("parolla-passed");
const parollaLetterList = document.getElementById("parolla-letter-list");
const parollaFinalCorrect = document.getElementById("parolla-final-correct");
const parollaFinalWrong = document.getElementById("parolla-final-wrong");
const parollaFinalPassed = document.getElementById("parolla-final-passed");
const parollaFinalScore = document.getElementById("parolla-final-score");
const parollaFinalAnswered = document.getElementById("parolla-final-answered");
const parollaFinalWrongAnswers = document.getElementById("parolla-final-wrong-answers");
const parollaFinalPassedLetters = document.getElementById("parolla-final-passed-letters");

const parollaAlphabet = ["A", "B", "C", "Ç", "D", "E", "F", "G", "H", "I", "İ", "J", "K", "L", "M", "N", "O", "Ö", "P", "R", "S", "Ş", "T", "U", "Ü", "V", "Y", "Z"];
const parollaDurationSeconds = 5 * 60;
let parollaAutoStarted = false;
let parollaAudioContext = null;

const parollaState = {
    questions: [],
    currentIndex: 0,
    secondsLeft: parollaDurationSeconds,
    score: 0,
    correct: 0,
    wrong: 0,
    passed: 0,
    answers: [],
    statusByLetter: {},
    playing: false,
    timerStarted: false,
    timerId: null,
};

function initParolla() {
    if (!parollaRoot) return;
    parollaStartButton.addEventListener("click", startParollaGame);
    parollaRestartButton?.addEventListener("click", startParollaGame);
    parollaEndButton.addEventListener("click", () => finishParollaGame("early"));
    parollaPassButton.addEventListener("click", passParollaQuestion);
    parollaForm.addEventListener("submit", submitParollaAnswer);
    parollaAnswer.addEventListener("input", startParollaTimer);
    document.addEventListener("tool-activated", handleParollaActivation);
    window.addEventListener("beforeunload", clearParollaTimer);
    renderParollaLetterList();
}

function handleParollaActivation(event) {
    if (event.detail?.tool !== "parolla" || parollaAutoStarted) return;
    parollaAutoStarted = true;
    startParollaGame();
}

function startParollaGame() {
    clearParollaTimer();
    parollaState.questions = buildParollaRound();
    parollaState.currentIndex = 0;
    parollaState.secondsLeft = parollaDurationSeconds;
    parollaState.score = 0;
    parollaState.correct = 0;
    parollaState.wrong = 0;
    parollaState.passed = 0;
    parollaState.answers = [];
    parollaState.statusByLetter = {};
    parollaState.playing = true;
    parollaState.timerStarted = false;

    parollaIntro.hidden = true;
    parollaFinal.hidden = true;
    parollaPlay.hidden = false;
    parollaStartButton.disabled = true;
    parollaEndButton.disabled = false;
    parollaFeedback.textContent = "";

    renderParollaHud();
    renderParollaQuestion();
    parollaAnswer.focus();
}

function buildParollaRound() {
    const questionsByLetter = groupParollaQuestionsByLetter();
    return parollaAlphabet.map((letter) => {
        const options = questionsByLetter[letter] || [];
        return options[Math.floor(Math.random() * options.length)];
    }).filter(Boolean);
}

function groupParollaQuestionsByLetter() {
    return (window.ParollaQuestions || []).reduce((groups, question) => {
        groups[question.letter] = groups[question.letter] || [];
        groups[question.letter].push(question);
        return groups;
    }, {});
}

function tickParollaTimer() {
    parollaState.secondsLeft -= 1;
    renderParollaHud();
    if (parollaState.secondsLeft <= 0) {
        finishParollaGame("time");
    }
}

function submitParollaAnswer(event) {
    event.preventDefault();
    if (!parollaState.playing) return;

    const value = parollaAnswer.value.trim();
    if (!value) {
        showParollaFeedback("Boş cevap kabul edilmez.", "error");
        return;
    }

    startParollaTimer();

    if (normalizeParollaAnswer(value) === "pas") {
        passParollaQuestion();
        return;
    }

    const question = getCurrentParollaQuestion();
    const isCorrect = question.answers.some((answer) => normalizeParollaAnswer(answer) === normalizeParollaAnswer(value));

    const previousAnswer = findParollaAnswer(question.letter);
    if (previousAnswer?.status === "passed") {
        parollaState.passed -= 1;
    }

    recordParollaAnswer({
        letter: question.letter,
        question: question.question,
        given: value,
        correctAnswer: question.answers[0],
        status: isCorrect ? "correct" : "wrong",
        points: isCorrect ? question.points : 0,
    });

    parollaState.statusByLetter[question.letter] = isCorrect ? "correct" : "wrong";
    if (isCorrect) {
        parollaState.correct += 1;
        parollaState.score += question.points;
        playParollaSound("correct");
        showParollaFeedback(`Doğru: +${question.points}`, "success");
    } else {
        parollaState.wrong += 1;
        playParollaSound("wrong");
        showParollaFeedback("Yanlış", "error");
    }

    goToNextParollaQuestion();
}

function passParollaQuestion() {
    if (!parollaState.playing) return;
    startParollaTimer();
    const question = getCurrentParollaQuestion();
    const previousAnswer = findParollaAnswer(question.letter);
    if (!previousAnswer || previousAnswer.status !== "passed") {
        parollaState.passed += 1;
    }
    parollaState.statusByLetter[question.letter] = "passed";
    recordParollaAnswer({
        letter: question.letter,
        question: question.question,
        given: "",
        correctAnswer: question.answers[0],
        status: "passed",
        points: 0,
    });
    showParollaFeedback("Pas geçildi.", "muted");
    moveCurrentParollaQuestionToEnd();
    renderParollaHud();
    renderParollaLetterList();
    renderParollaQuestion();
    parollaAnswer.focus();
}

function goToNextParollaQuestion() {
    parollaState.currentIndex += 1;
    renderParollaHud();
    renderParollaLetterList();

    if (parollaState.currentIndex >= parollaState.questions.length) {
        finishParollaGame("complete");
        return;
    }

    parollaAnswer.value = "";
    renderParollaQuestion();
    parollaAnswer.focus();
}

function moveCurrentParollaQuestionToEnd() {
    const [question] = parollaState.questions.splice(parollaState.currentIndex, 1);
    if (question) {
        parollaState.questions.push(question);
    }
    if (parollaState.currentIndex >= parollaState.questions.length) {
        parollaState.currentIndex = Math.max(parollaState.questions.length - 1, 0);
    }
}

function renderParollaQuestion() {
    const question = getCurrentParollaQuestion();
    if (!question) return;
    parollaLetter.textContent = question.letter;
    parollaQuestion.textContent = question.question;
    parollaAnswer.value = "";
}

function renderParollaHud() {
    parollaTime.textContent = formatParollaTime(parollaState.secondsLeft);
    parollaScore.textContent = parollaState.score;
    parollaProgress.textContent = `${Math.min(parollaState.currentIndex + 1, parollaState.questions.length)}/${parollaState.questions.length || parollaAlphabet.length}`;
    parollaCorrect.textContent = parollaState.correct;
    parollaWrong.textContent = parollaState.wrong;
    parollaPassed.textContent = parollaState.passed;
}

function renderParollaLetterList() {
    const activeLetter = getCurrentParollaQuestion()?.letter;
    parollaLetterList.innerHTML = parollaAlphabet.map((letter) => {
        const status = parollaState.statusByLetter[letter] || "";
        const active = parollaState.playing && letter === activeLetter ? "active" : "";
        return `<span class="${status} ${active}">${letter}</span>`;
    }).join("");
}

function finishParollaGame(reason) {
    if (!parollaState.playing && reason !== "early") return;
    clearParollaTimer();
    parollaState.playing = false;
    parollaPlay.hidden = true;
    parollaIntro.hidden = true;
    parollaFinal.hidden = false;
    parollaStartButton.disabled = false;
    parollaEndButton.disabled = true;
    parollaFeedback.textContent = "";

    const answeredLetters = parollaState.answers
        .filter((answer) => answer.status === "correct" || answer.status === "wrong");
    const wrongAnswers = parollaState.answers
        .filter((answer) => answer.status === "wrong");
    const passedLetters = parollaState.answers
        .filter((answer) => answer.status === "passed");

    parollaFinalCorrect.textContent = parollaState.correct;
    parollaFinalWrong.textContent = parollaState.wrong;
    parollaFinalPassed.textContent = parollaState.passed;
    parollaFinalScore.textContent = parollaState.score;
    renderParollaFinalAnswered(answeredLetters);
    renderParollaFinalWrongAnswers(wrongAnswers);
    renderParollaFinalPassedLetters(passedLetters);
    renderParollaHud();
    renderParollaLetterList();
}

function renderParollaFinalAnswered(answers) {
    parollaFinalAnswered.replaceChildren();
    parollaFinalAnswered.className = "parolla-final-list-content parolla-final-chip-list";

    if (!answers.length) {
        parollaFinalAnswered.append(createParollaEmptyState("Henüz cevaplanan harf yok."));
        return;
    }

    answers.forEach((answer) => {
        const chip = document.createElement("span");
        chip.className = `parolla-result-chip ${answer.status}`;
        chip.textContent = answer.letter;
        chip.title = answer.status === "correct" ? "Doğru cevaplandı" : "Yanlış cevaplandı";
        parollaFinalAnswered.append(chip);
    });
}

function renderParollaFinalWrongAnswers(answers) {
    parollaFinalWrongAnswers.replaceChildren();
    parollaFinalWrongAnswers.className = "parolla-final-list-content parolla-wrong-answer-list";

    if (!answers.length) {
        parollaFinalWrongAnswers.append(createParollaEmptyState("Yanlış cevap yok."));
        return;
    }

    answers.forEach((answer) => {
        const row = document.createElement("div");
        row.className = "parolla-wrong-answer-row";

        const letter = document.createElement("span");
        letter.className = "parolla-wrong-letter";
        letter.textContent = answer.letter;

        const details = document.createElement("div");
        details.className = "parolla-wrong-details";

        const given = document.createElement("p");
        given.innerHTML = "<span>Senin cevabın</span>";
        const givenValue = document.createElement("strong");
        givenValue.textContent = answer.given || "-";
        given.append(givenValue);

        const correct = document.createElement("p");
        correct.innerHTML = "<span>Doğru cevap</span>";
        const correctValue = document.createElement("strong");
        correctValue.textContent = answer.correctAnswer;
        correct.append(correctValue);

        details.append(given, correct);
        row.append(letter, details);
        parollaFinalWrongAnswers.append(row);
    });
}

function renderParollaFinalPassedLetters(answers) {
    parollaFinalPassedLetters.replaceChildren();
    parollaFinalPassedLetters.className = "parolla-final-list-content parolla-final-chip-list";

    if (!answers.length) {
        parollaFinalPassedLetters.append(createParollaEmptyState("Pas geçilen harf yok."));
        return;
    }

    answers.forEach((answer) => {
        const chip = document.createElement("span");
        chip.className = "parolla-result-chip passed";
        chip.textContent = answer.letter;
        parollaFinalPassedLetters.append(chip);
    });
}

function createParollaEmptyState(message) {
    const empty = document.createElement("span");
    empty.className = "parolla-final-empty";
    empty.textContent = message;
    return empty;
}

function getCurrentParollaQuestion() {
    return parollaState.questions[parollaState.currentIndex];
}

function showParollaFeedback(message, type) {
    parollaFeedback.textContent = message;
    parollaFeedback.className = `parolla-feedback ${type}`;
}

function findParollaAnswer(letter) {
    return parollaState.answers.find((answer) => answer.letter === letter);
}

function recordParollaAnswer(answer) {
    const existingIndex = parollaState.answers.findIndex((item) => item.letter === answer.letter);
    if (existingIndex >= 0) {
        parollaState.answers[existingIndex] = answer;
        return;
    }
    parollaState.answers.push(answer);
}

function startParollaTimer() {
    if (!parollaState.playing || parollaState.timerStarted) return;
    parollaState.timerStarted = true;
    parollaState.timerId = setInterval(tickParollaTimer, 1000);
}

function playParollaSound(type) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    parollaAudioContext = parollaAudioContext || new AudioContextConstructor();
    const context = parollaAudioContext;
    if (context.state === "suspended") {
        context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const isCorrect = type === "correct";

    oscillator.type = isCorrect ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(isCorrect ? 640 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(isCorrect ? 880 : 120, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
}

function clearParollaTimer() {
    if (parollaState.timerId) {
        clearInterval(parollaState.timerId);
        parollaState.timerId = null;
    }
    parollaState.timerStarted = false;
}

function formatParollaTime(seconds) {
    const safeSeconds = Math.max(seconds, 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function normalizeParollaAnswer(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/ç/g, "c")
        .replace(/ğ/g, "g")
        .replace(/[ıi]/g, "i")
        .replace(/ö/g, "o")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u")
        .replace(/[^a-z0-9]/g, "");
}

initParolla();
