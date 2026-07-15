const wordleFinderRoot = document.getElementById("wordle-finder");
const wordleFinderGrid = document.getElementById("wordle-finder-grid");
const wordleFinderList = document.getElementById("wordle-finder-list");
const wordleFinderCount = document.getElementById("wordle-finder-count");
const wordleFinderClear = document.getElementById("wordle-finder-clear");
const wordleFinderAdd = document.getElementById("wordle-finder-add");
const wordleFinderSource = document.getElementById("wordle-finder-source");

const wordleFinderStatuses = ["wrong", "present", "correct"];
const wordleFinderLabels = {
    correct: "Yeşil",
    present: "Sarı",
    wrong: "Gri",
};

const wordleFinderState = {
    attempts: [],
    draft: {
        letters: Array(5).fill(""),
        statuses: Array(5).fill("wrong"),
    },
};

const wordleFinderWords = prepareWordleFinderWords(window.Words || []);
let wordleFinderRenderFrame = null;
let wordleFinderLastSignature = "";
let wordleFinderLastResults = wordleFinderWords;

function prepareWordleFinderWords(words) {
    const seen = new Set();
    return words
        .map((word) => normalizeWordleFinderWord(String(word || "")))
        .filter((word) => Array.from(word).length === 5)
        .filter((word) => {
            if (seen.has(word)) return false;
            seen.add(word);
            return true;
        })
        .map((word) => ({ word, letters: Array.from(word) }));
}

function normalizeWordleFinderWord(value) {
    return Array.from(value.trim().toLocaleLowerCase("tr-TR"))
        .filter((letter) => isWordleFinderLetter(letter))
        .join("");
}

function isWordleFinderLetter(value) {
    return /^[abcçdefgğhıijklmnoöprsştuüvyzqwx]$/i.test(value);
}

function displayWordleFinderWord(value) {
    return value.toLocaleUpperCase("tr-TR");
}

function renderWordleFinderControls() {
    if (!wordleFinderGrid) return;

    wordleFinderGrid.innerHTML = [
        ...wordleFinderState.attempts.map((attempt, index) => renderWordleFinderAttemptRow(attempt, index, false)),
        renderWordleFinderAttemptRow(wordleFinderState.draft, "draft", true),
    ].join("");

    wordleFinderGrid.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", handleWordleFinderLetterInput);
        input.addEventListener("keydown", handleWordleFinderCellKeydown);
    });

    wordleFinderGrid.querySelectorAll("[data-status-toggle]").forEach((button) => {
        button.addEventListener("click", handleWordleFinderStatusToggle);
    });

}

function renderWordleFinderAttemptRow(attempt, rowIndex, isDraft) {
    return `
        <div class="wordle-finder-row ${isDraft ? "is-draft" : ""}" data-row="${rowIndex}">
            ${attempt.letters.map((letter, index) => `
                <div class="wordle-finder-cell ${attempt.statuses[index]}" data-index="${index}">
                    ${isDraft ? `
                        <input
                            type="text"
                            inputmode="text"
                            maxlength="1"
                            aria-label="${index + 1}. harf"
                            value="${displayWordleFinderWord(letter)}"
                        >
                    ` : `<span class="wordle-finder-letter">${displayWordleFinderWord(letter)}</span>`}
                    <button type="button" data-status-toggle aria-label="${index + 1}. harf durumunu değiştir">
                        ${wordleFinderLabels[attempt.statuses[index]]}
                    </button>
                </div>
            `).join("")}
        </div>
    `;
}

function getWordleFinderAttempt(rowIndex) {
    return rowIndex === "draft" ? wordleFinderState.draft : wordleFinderState.attempts[Number(rowIndex)];
}

function handleWordleFinderLetterInput(event) {
    const row = event.target.closest(".wordle-finder-row");
    const cell = event.target.closest(".wordle-finder-cell");
    const attempt = getWordleFinderAttempt(row.dataset.row);
    const index = Number(cell.dataset.index);
    const value = normalizeWordleFinderWord(event.target.value).slice(-1);

    attempt.letters[index] = value;
    event.target.value = value ? displayWordleFinderWord(value) : "";

    if (value && index < 4) {
        row.querySelector(`[data-index="${index + 1}"] input`)?.focus();
    }
}

function handleWordleFinderCellKeydown(event) {
    const row = event.target.closest(".wordle-finder-row");
    const cell = event.target.closest(".wordle-finder-cell");
    const index = Number(cell.dataset.index);

    if (event.key === "Backspace" && !event.target.value && index > 0) {
        row.querySelector(`[data-index="${index - 1}"] input`)?.focus();
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        addWordleFinderDraft();
    }
}

function handleWordleFinderStatusToggle(event) {
    const row = event.target.closest(".wordle-finder-row");
    const cell = event.target.closest(".wordle-finder-cell");
    const attempt = getWordleFinderAttempt(row.dataset.row);
    const index = Number(cell.dataset.index);
    const currentIndex = wordleFinderStatuses.indexOf(attempt.statuses[index]);

    attempt.statuses[index] = wordleFinderStatuses[(currentIndex + 1) % wordleFinderStatuses.length];
    renderWordleFinderControls();
    scheduleWordleFinderFilter();
}

function addWordleFinderDraft() {
    const word = wordleFinderState.draft.letters.join("");

    if (Array.from(word).length < 5) {
        return;
    }

    wordleFinderState.attempts.push({
        letters: [...wordleFinderState.draft.letters],
        statuses: [...wordleFinderState.draft.statuses],
    });
    wordleFinderState.draft = {
        letters: Array(5).fill(""),
        statuses: Array(5).fill("wrong"),
    };
    renderWordleFinderControls();
    scheduleWordleFinderFilter();
    wordleFinderGrid.querySelector('.wordle-finder-row.is-draft input')?.focus();
}

function scheduleWordleFinderFilter() {
    if (wordleFinderRenderFrame) cancelAnimationFrame(wordleFinderRenderFrame);
    wordleFinderRenderFrame = requestAnimationFrame(updateWordleFinderResults);
}

function updateWordleFinderResults() {
    wordleFinderRenderFrame = null;
    const signature = JSON.stringify(wordleFinderState.attempts);

    if (signature !== wordleFinderLastSignature) {
        wordleFinderLastResults = filterWordleFinderWords();
        wordleFinderLastSignature = signature;
    }

    renderWordleFinderResults(wordleFinderLastResults);
}

function filterWordleFinderWords() {
    return wordleFinderWords.filter((candidate) => (
        wordleFinderState.attempts.every((attempt) => {
            const expectedMarks = scoreWordleFinderGuess(attempt.letters, candidate.letters);
            return expectedMarks.every((mark, index) => mark === attempt.statuses[index]);
        })
    ));
}

function scoreWordleFinderGuess(guessLetters, targetLetters) {
    const marks = Array(5).fill("wrong");
    const remaining = {};

    for (let index = 0; index < 5; index += 1) {
        if (guessLetters[index] === targetLetters[index]) {
            marks[index] = "correct";
        } else {
            remaining[targetLetters[index]] = (remaining[targetLetters[index]] || 0) + 1;
        }
    }

    for (let index = 0; index < 5; index += 1) {
        if (marks[index] === "correct") continue;
        const letter = guessLetters[index];
        if (remaining[letter] > 0) {
            marks[index] = "present";
            remaining[letter] -= 1;
        }
    }

    return marks;
}

function renderWordleFinderResults(results) {
    wordleFinderCount.textContent = results.length;
    wordleFinderSource.textContent = `${wordleFinderWords.length} kelimelik Words listesi`;
    wordleFinderList.innerHTML = "";

    if (!results.length) {
        wordleFinderList.innerHTML = '<div class="empty-state wordle-finder-empty"><strong>Uygun kelime bulunamadı</strong><span>Deneme renklerini kontrol et.</span></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    results.forEach(({ word }) => {
        const item = document.createElement("span");
        item.className = "wordle-finder-word";
        item.textContent = displayWordleFinderWord(word);
        fragment.appendChild(item);
    });
    wordleFinderList.appendChild(fragment);
}

function clearWordleFinderFilters() {
    wordleFinderState.attempts = [];
    wordleFinderState.draft = {
        letters: Array(5).fill(""),
        statuses: Array(5).fill("wrong"),
    };
    renderWordleFinderControls();
    scheduleWordleFinderFilter();
}

if (wordleFinderRoot) {
    renderWordleFinderControls();
    wordleFinderClear.addEventListener("click", clearWordleFinderFilters);
    wordleFinderAdd.addEventListener("click", addWordleFinderDraft);
    updateWordleFinderResults();
}
