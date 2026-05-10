const wordleFinderRoot = document.getElementById("wordle-finder");
const wordleFinderGrid = document.getElementById("wordle-finder-grid");
const wordleFinderList = document.getElementById("wordle-finder-list");
const wordleFinderCount = document.getElementById("wordle-finder-count");
const wordleFinderClear = document.getElementById("wordle-finder-clear");
const wordleFinderSource = document.getElementById("wordle-finder-source");

const wordleFinderStatuses = ["correct", "present", "wrong"];
const wordleFinderLabels = {
    correct: "Yeşil",
    present: "Sarı",
    wrong: "Gri",
};

const wordleFinderState = {
    letters: Array(5).fill(""),
    statuses: Array(5).fill("correct"),
    absentLetters: "",
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
    document.getElementById("wordle-finder-absent")?.closest(".wordle-finder-absent")?.remove();

    wordleFinderGrid.innerHTML = Array.from({ length: 5 }, (_, index) => `
        <div class="wordle-finder-cell ${wordleFinderState.statuses[index]}" data-index="${index}">
            <input
                type="text"
                inputmode="text"
                maxlength="1"
                aria-label="${index + 1}. harf"
                value="${wordleFinderState.letters[index]}"
            >
            <button type="button" data-status-toggle aria-label="${index + 1}. harf durumunu değiştir">
                ${wordleFinderLabels[wordleFinderState.statuses[index]]}
            </button>
        </div>
    `).join("");

    wordleFinderGrid.insertAdjacentHTML("afterend", `
        <label class="wordle-finder-absent" for="wordle-finder-absent">
            <span>Gri harfler</span>
            <input id="wordle-finder-absent" class="text-input" type="text" autocomplete="off" spellcheck="false" placeholder="Örn. rtk" value="${wordleFinderState.absentLetters}">
        </label>
    `);

    wordleFinderGrid.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", handleWordleFinderLetterInput);
        input.addEventListener("keydown", handleWordleFinderCellKeydown);
    });

    wordleFinderGrid.querySelectorAll("[data-status-toggle]").forEach((button) => {
        button.addEventListener("click", handleWordleFinderStatusToggle);
    });

    document.getElementById("wordle-finder-absent")?.addEventListener("input", handleWordleFinderAbsentInput);
}

function refreshWordleFinderControls() {
    const cells = wordleFinderGrid.querySelectorAll(".wordle-finder-cell");
    cells.forEach((cell, index) => {
        const status = wordleFinderState.statuses[index];
        cell.className = `wordle-finder-cell ${status}`;
        cell.querySelector("input").value = wordleFinderState.letters[index];
        cell.querySelector("button").textContent = wordleFinderLabels[status];
    });
}

function handleWordleFinderLetterInput(event) {
    const cell = event.target.closest(".wordle-finder-cell");
    const index = Number(cell.dataset.index);
    const value = normalizeWordleFinderWord(event.target.value).slice(-1);

    wordleFinderState.letters[index] = value;
    event.target.value = value ? displayWordleFinderWord(value) : "";
    scheduleWordleFinderFilter();

    if (value && index < 4) {
        wordleFinderGrid.querySelector(`[data-index="${index + 1}"] input`)?.focus();
    }
}

function handleWordleFinderCellKeydown(event) {
    const cell = event.target.closest(".wordle-finder-cell");
    const index = Number(cell.dataset.index);

    if (event.key === "Backspace" && !event.target.value && index > 0) {
        wordleFinderGrid.querySelector(`[data-index="${index - 1}"] input`)?.focus();
    }
}

function handleWordleFinderStatusToggle(event) {
    const cell = event.target.closest(".wordle-finder-cell");
    const index = Number(cell.dataset.index);
    const currentIndex = wordleFinderStatuses.indexOf(wordleFinderState.statuses[index]);
    wordleFinderState.statuses[index] = wordleFinderStatuses[(currentIndex + 1) % wordleFinderStatuses.length];
    refreshWordleFinderControls();
    scheduleWordleFinderFilter();
}

function handleWordleFinderAbsentInput(event) {
    wordleFinderState.absentLetters = normalizeWordleFinderWord(event.target.value);
    event.target.value = wordleFinderState.absentLetters;
    scheduleWordleFinderFilter();
}

function scheduleWordleFinderFilter() {
    if (wordleFinderRenderFrame) cancelAnimationFrame(wordleFinderRenderFrame);
    wordleFinderRenderFrame = requestAnimationFrame(updateWordleFinderResults);
}

function updateWordleFinderResults() {
    wordleFinderRenderFrame = null;
    const signature = JSON.stringify(wordleFinderState);

    if (signature !== wordleFinderLastSignature) {
        wordleFinderLastResults = filterWordleFinderWords();
        wordleFinderLastSignature = signature;
    }

    renderWordleFinderResults(wordleFinderLastResults);
}

function filterWordleFinderWords() {
    const fixedLetters = new Map();
    const presentRules = [];
    const absentLetters = new Set(Array.from(wordleFinderState.absentLetters));
    const knownLetters = new Set();

    wordleFinderState.letters.forEach((letter, index) => {
        if (!letter) return;
        const status = wordleFinderState.statuses[index];

        if (status === "correct") {
            fixedLetters.set(index, letter);
            knownLetters.add(letter);
            return;
        }

        if (status === "present") {
            presentRules.push({ letter, index });
            knownLetters.add(letter);
            return;
        }

        absentLetters.add(letter);
    });

    knownLetters.forEach((letter) => absentLetters.delete(letter));

    return wordleFinderWords.filter(({ letters }) => {
        for (const [index, letter] of fixedLetters) {
            if (letters[index] !== letter) return false;
        }

        for (const { letter, index } of presentRules) {
            if (letters[index] === letter || !letters.includes(letter)) return false;
        }

        for (const letter of absentLetters) {
            if (letters.includes(letter)) return false;
        }

        return true;
    });
}

function renderWordleFinderResults(results) {
    wordleFinderCount.textContent = results.length;
    wordleFinderSource.textContent = `${wordleFinderWords.length} kelimelik Words listesi`;
    wordleFinderList.innerHTML = "";

    if (!results.length) {
        wordleFinderList.innerHTML = '<div class="empty-state wordle-finder-empty"><strong>Uygun kelime bulunamadı</strong><span>Harfleri veya renk durumlarını gevşetmeyi dene.</span></div>';
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
    wordleFinderState.letters = Array(5).fill("");
    wordleFinderState.statuses = Array(5).fill("correct");
    wordleFinderState.absentLetters = "";
    wordleFinderGrid.nextElementSibling?.classList.contains("wordle-finder-absent")
        && wordleFinderGrid.nextElementSibling.remove();
    renderWordleFinderControls();
    scheduleWordleFinderFilter();
}

if (wordleFinderRoot) {
    renderWordleFinderControls();
    wordleFinderClear.addEventListener("click", clearWordleFinderFilters);
    updateWordleFinderResults();
}
