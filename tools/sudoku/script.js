(function initSudokuApp() {
    "use strict";

    const engine = window.OmniSudokuEngine;
    const panel = document.getElementById("sudoku");
    const board = document.getElementById("sudoku-board");

    if (!engine || !panel || !board) return;

    const ACTIVE_GAME_KEY = "omni-sudoku-active-v1";
    const STATS_KEY = "omni-sudoku-stats-v1";
    const MAX_ERRORS = 3;
    const MAX_HINTS = 3;
    const HISTORY_LIMIT = 200;
    const DIFFICULTY_LABELS = Object.freeze({ easy: "Kolay", medium: "Orta", hard: "Zor" });
    const difficultyButtons = Array.from(panel.querySelectorAll("[data-sudoku-difficulty]"));
    const numberButtons = Array.from(panel.querySelectorAll("[data-sudoku-number]"));
    const controls = {
        newGame: document.getElementById("sudoku-new"),
        undo: document.getElementById("sudoku-undo"),
        erase: document.getElementById("sudoku-erase"),
        notes: document.getElementById("sudoku-notes"),
        hint: document.getElementById("sudoku-hint"),
        pause: document.getElementById("sudoku-pause"),
        resumeOverlay: document.getElementById("sudoku-resume-overlay"),
    };
    const display = {
        timer: document.getElementById("sudoku-timer"),
        errors: document.getElementById("sudoku-errors"),
        hints: document.getElementById("sudoku-hints-left"),
        status: document.getElementById("sudoku-status"),
        difficulty: document.getElementById("sudoku-difficulty-label"),
    };
    const modal = {
        root: document.getElementById("sudoku-modal"),
        title: document.getElementById("sudoku-modal-title"),
        message: document.getElementById("sudoku-modal-message"),
        summary: document.getElementById("sudoku-modal-summary"),
        primary: document.getElementById("sudoku-modal-primary"),
    };
    const state = {
        difficulty: "medium",
        puzzle: Array(engine.CELL_COUNT).fill(0),
        solution: Array(engine.CELL_COUNT).fill(0),
        values: Array(engine.CELL_COUNT).fill(0),
        notes: Array(engine.CELL_COUNT).fill(0),
        hints: Array(engine.CELL_COUNT).fill(false),
        selected: -1,
        errors: 0,
        hintsRemaining: MAX_HINTS,
        hintsUsed: 0,
        noteMode: false,
        paused: false,
        generating: false,
        status: "idle",
        history: [],
        elapsedMs: 0,
        timerStartedAt: null,
    };

    let stats = loadStats();
    let cells = [];
    let timerId = 0;
    let lastSavedSecond = -1;
    let generationToken = 0;
    let pendingFreshStart = false;

    createBoard();
    bindEvents();

    const savedGame = loadActiveGame();
    if (savedGame) {
        restoreGame(savedGame);
        pendingFreshStart = true;
    } else {
        render();
    }

    function createBoard() {
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < engine.CELL_COUNT; index += 1) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "sudoku-cell";
            cell.dataset.index = index.toString();
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-rowindex", (Math.floor(index / 9) + 1).toString());
            cell.setAttribute("aria-colindex", (index % 9 + 1).toString());
            cell.addEventListener("click", () => selectCell(index, true, true));
            fragment.appendChild(cell);
        }

        board.replaceChildren(fragment);
        cells = Array.from(board.children);
    }

    function bindEvents() {
        difficultyButtons.forEach((button) => {
            button.addEventListener("click", () => startNewGame(button.dataset.sudokuDifficulty || "medium"));
        });
        numberButtons.forEach((button) => {
            button.addEventListener("click", () => inputNumber(Number(button.dataset.sudokuNumber)));
        });

        controls.newGame.addEventListener("click", () => startNewGame(state.difficulty));
        controls.undo.addEventListener("click", undoMove);
        controls.erase.addEventListener("click", eraseSelectedCell);
        controls.notes.addEventListener("click", toggleNoteMode);
        controls.hint.addEventListener("click", useHint);
        controls.pause.addEventListener("click", togglePause);
        controls.resumeOverlay.addEventListener("click", togglePause);
        modal.primary.addEventListener("click", () => startNewGame(state.difficulty));

        document.addEventListener("keydown", handleKeyboard);
        document.addEventListener("tool-activated", handleToolActivated);
        window.addEventListener("beforeunload", saveActiveGame);
    }

    function handleToolActivated(event) {
        if (event.detail?.tool !== "sudoku") return;

        if (pendingFreshStart) {
            startNewGame(state.difficulty);
            return;
        }

        if (state.status === "idle") {
            startNewGame("medium");
            return;
        }

        focusSelectedCell();
    }

    function startNewGame(difficulty) {
        const nextDifficulty = DIFFICULTY_LABELS[difficulty] ? difficulty : "medium";
        const token = ++generationToken;
        closeModal();
        stopTimer();
        pendingFreshStart = false;
        state.difficulty = nextDifficulty;
        state.generating = true;
        state.status = "idle";
        state.paused = false;
        display.status.textContent = "Bulmaca hazırlanıyor...";
        render();

        window.setTimeout(() => {
            if (token !== generationToken) return;

            const generated = engine.generatePuzzle(nextDifficulty);
            state.puzzle = generated.puzzle.slice();
            state.solution = generated.solution.slice();
            state.values = generated.puzzle.slice();
            state.notes = Array(engine.CELL_COUNT).fill(0);
            state.hints = Array(engine.CELL_COUNT).fill(false);
            state.selected = -1;
            state.errors = 0;
            state.hintsRemaining = MAX_HINTS;
            state.hintsUsed = 0;
            state.noteMode = false;
            state.paused = false;
            state.generating = false;
            state.status = "playing";
            state.history = [];
            state.elapsedMs = 0;
            state.timerStartedAt = null;
            stats.games += 1;
            saveStats();
            startTimer();
            display.status.textContent = `${DIFFICULTY_LABELS[nextDifficulty]} oyun başladı.`;
            render();
            saveActiveGame();
            focusSelectedCell();
        }, 40);
    }

    function selectCell(index, shouldFocus = false, allowDeselect = false) {
        if (!canInteract() || index < 0 || index >= engine.CELL_COUNT) return;
        state.selected = allowDeselect && state.selected === index ? -1 : index;
        renderBoard();
        renderControls();
        if (shouldFocus) cells[index].focus({ preventScroll: true });
        saveActiveGame();
    }

    function inputNumber(number) {
        if (!canEditSelected() || number < 1 || number > 9) return;

        const index = state.selected;
        if (state.noteMode) {
            if (state.values[index] !== 0) return;
            pushHistory();
            state.notes[index] ^= 1 << number;
            display.status.textContent = state.notes[index] & (1 << number) ? `${number} adaylara eklendi.` : `${number} adaylardan kaldırıldı.`;
            render();
            saveActiveGame();
            return;
        }

        if (state.values[index] === number) return;

        const completedBefore = countCompletedUnits();
        pushHistory();
        state.values[index] = number;
        state.notes[index] = 0;
        state.hints[index] = false;

        if (number === state.solution[index]) {
            removePeerNotes(index, number);
            display.status.textContent = "Doğru rakam.";
        } else {
            state.errors += 1;
            stats.errors += 1;
            saveStats();
            display.status.textContent = `Hatalı giriş. ${MAX_ERRORS - state.errors} hakkın kaldı.`;
        }

        render();
        saveActiveGame();

        if (state.errors >= MAX_ERRORS) {
            finishGame(false);
            return;
        }

        if (isBoardComplete()) {
            finishGame(true);
            return;
        }

        if (number === state.solution[index] && countCompletedUnits() > completedBefore) {
            display.status.textContent = "Bir satır, sütun veya bölge tamamlandı.";
        }
    }

    function eraseSelectedCell() {
        if (!canEditSelected()) return;
        const index = state.selected;
        if (state.values[index] === 0 && state.notes[index] === 0) return;

        pushHistory();
        state.values[index] = 0;
        state.notes[index] = 0;
        state.hints[index] = false;
        display.status.textContent = "Hücre temizlendi.";
        render();
        saveActiveGame();
    }

    function undoMove() {
        if (!canInteract() || state.history.length === 0) return;
        const previous = state.history.pop();
        state.values = previous.values;
        state.notes = previous.notes;
        state.hints = previous.hints;
        state.selected = previous.selected;
        display.status.textContent = "Son işlem geri alındı.";
        render();
        saveActiveGame();
        focusSelectedCell();
    }

    function pushHistory() {
        state.history.push({
            values: state.values.slice(),
            notes: state.notes.slice(),
            hints: state.hints.slice(),
            selected: state.selected,
        });

        if (state.history.length > HISTORY_LIMIT) state.history.shift();
    }

    function toggleNoteMode() {
        if (!canInteract()) return;
        state.noteMode = !state.noteMode;
        display.status.textContent = `Not modu ${state.noteMode ? "açıldı" : "kapatıldı"}.`;
        renderControls();
        saveActiveGame();
    }

    function useHint() {
        if (!canInteract() || state.hintsRemaining <= 0) return;

        let index = state.selected;
        if (index < 0 || state.puzzle[index] !== 0 || state.values[index] === state.solution[index]) {
            index = state.values.findIndex((value, cellIndex) => state.puzzle[cellIndex] === 0 && value !== state.solution[cellIndex]);
        }
        if (index === -1) return;

        const completedBefore = countCompletedUnits();
        state.selected = index;
        state.values[index] = state.solution[index];
        state.notes[index] = 0;
        state.hints[index] = true;
        state.hintsRemaining -= 1;
        state.hintsUsed += 1;
        removePeerNotes(index, state.solution[index]);
        display.status.textContent = "İpucu doğru rakamı yerleştirdi.";
        render();
        saveActiveGame();

        if (isBoardComplete()) {
            finishGame(true);
        } else if (countCompletedUnits() > completedBefore) {
            display.status.textContent = "İpucuyla bir bölüm tamamlandı.";
        }
    }

    function removePeerNotes(index, number) {
        for (let peer = 0; peer < engine.CELL_COUNT; peer += 1) {
            if (peer !== index && isPeer(index, peer)) state.notes[peer] &= ~(1 << number);
        }
    }

    function togglePause() {
        if (state.status !== "playing" || state.generating || !modal.root.hidden) return;

        if (state.paused) {
            state.paused = false;
            startTimer();
            display.status.textContent = "Oyun devam ediyor.";
            render();
            saveActiveGame();
            focusSelectedCell();
        } else {
            stopTimer();
            state.paused = true;
            display.status.textContent = "Oyun duraklatıldı.";
            render();
            saveActiveGame();
        }
    }

    function startTimer() {
        if (state.timerStartedAt !== null || state.paused || state.status !== "playing") return;
        state.timerStartedAt = Date.now();
        window.clearInterval(timerId);
        timerId = window.setInterval(updateTimer, 250);
        updateTimer();
    }

    function stopTimer() {
        if (state.timerStartedAt !== null) {
            state.elapsedMs += Date.now() - state.timerStartedAt;
            state.timerStartedAt = null;
        }
        window.clearInterval(timerId);
        timerId = 0;
        updateTimer();
    }

    function updateTimer() {
        const seconds = Math.floor(getElapsedMs() / 1000);
        display.timer.textContent = formatTime(seconds * 1000);
        if (seconds !== lastSavedSecond && seconds % 5 === 0) {
            lastSavedSecond = seconds;
            saveActiveGame();
        }
    }

    function getElapsedMs() {
        return state.elapsedMs + (state.timerStartedAt === null ? 0 : Date.now() - state.timerStartedAt);
    }

    function finishGame(won) {
        stopTimer();
        state.status = won ? "won" : "lost";
        state.paused = false;
        localStorage.removeItem(ACTIVE_GAME_KEY);

        if (won) {
            stats.wins += 1;
            stats.byDifficulty[state.difficulty].wins += 1;
            const best = stats.byDifficulty[state.difficulty].bestMs;
            const elapsed = getElapsedMs();
            if (best === null || elapsed < best) stats.byDifficulty[state.difficulty].bestMs = elapsed;
            stats.currentStreak += 1;
            stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
            display.status.textContent = "Sudoku tamamlandı.";
        } else {
            stats.currentStreak = 0;
            display.status.textContent = "Üç hata hakkı kullanıldı.";
        }

        saveStats();
        render();
        openResultModal(won);
    }

    function handleKeyboard(event) {
        if (!panel.classList.contains("active") || !modal.root.hidden || state.generating) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.key.toLowerCase() === "n") {
            event.preventDefault();
            toggleNoteMode();
            return;
        }

        if (event.key >= "1" && event.key <= "9") {
            event.preventDefault();
            inputNumber(Number(event.key));
            return;
        }

        if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault();
            eraseSelectedCell();
            return;
        }

        const movements = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
        if (!(event.key in movements) || !canInteract()) return;

        event.preventDefault();
        const current = state.selected >= 0 ? state.selected : 0;
        const row = Math.floor(current / 9);
        const column = current % 9;
        let nextRow = row;
        let nextColumn = column;
        if (event.key === "ArrowUp") nextRow = Math.max(0, row - 1);
        if (event.key === "ArrowDown") nextRow = Math.min(8, row + 1);
        if (event.key === "ArrowLeft") nextColumn = Math.max(0, column - 1);
        if (event.key === "ArrowRight") nextColumn = Math.min(8, column + 1);
        selectCell(nextRow * 9 + nextColumn, true);
    }

    function render() {
        renderBoard();
        renderControls();
        display.errors.textContent = `Hatalar ${state.errors}/${MAX_ERRORS}`;
        display.hints.textContent = `${state.hintsRemaining}/${MAX_HINTS}`;
        display.difficulty.textContent = DIFFICULTY_LABELS[state.difficulty];
        updateTimer();
    }

    function renderBoard() {
        const selectedValue = state.selected >= 0 ? state.values[state.selected] : 0;
        const completed = getCompletedCells();

        cells.forEach((cell, index) => {
            const value = state.values[index];
            const isGiven = state.puzzle[index] !== 0;
            const isSelected = index === state.selected;
            const isError = !isGiven && value !== 0 && value !== state.solution[index];
            const notesMask = state.notes[index];
            cell.className = "sudoku-cell";
            cell.classList.toggle("is-given", isGiven);
            cell.classList.toggle("is-user", !isGiven && value !== 0 && !state.hints[index]);
            cell.classList.toggle("is-hint", state.hints[index]);
            cell.classList.toggle("is-selected", isSelected);
            cell.classList.toggle("is-peer", state.selected >= 0 && !isSelected && isPeer(state.selected, index));
            cell.classList.toggle("is-match", selectedValue !== 0 && value === selectedValue && !isSelected);
            cell.classList.toggle("is-error", isError);
            cell.classList.toggle("is-unit-complete", completed.has(index));
            cell.tabIndex = isSelected || (state.selected === -1 && index === 0) ? 0 : -1;
            cell.setAttribute("aria-selected", isSelected.toString());
            cell.setAttribute("aria-readonly", isGiven.toString());
            cell.setAttribute("aria-invalid", isError.toString());
            cell.setAttribute("aria-label", getCellLabel(index, value, isGiven, isError, notesMask));

            if (value !== 0) {
                cell.textContent = value.toString();
            } else if (notesMask !== 0) {
                const notes = document.createElement("span");
                notes.className = "sudoku-cell-notes";
                for (let number = 1; number <= 9; number += 1) {
                    const note = document.createElement("span");
                    note.textContent = notesMask & (1 << number) ? number.toString() : "";
                    notes.appendChild(note);
                }
                cell.replaceChildren(notes);
            } else {
                cell.textContent = "";
            }
        });

        board.setAttribute("aria-busy", state.generating.toString());
        board.classList.toggle("is-paused", state.paused);
    }

    function renderControls() {
        const blocked = state.status !== "playing" || state.generating || state.paused || !modal.root.hidden;
        difficultyButtons.forEach((button) => {
            const active = button.dataset.sudokuDifficulty === state.difficulty;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", active.toString());
            button.disabled = state.generating;
        });

        numberButtons.forEach((button) => {
            const number = Number(button.dataset.sudokuNumber);
            const completed = countCorrectNumber(number) === 9;
            button.disabled = blocked || completed;
            button.classList.toggle("is-complete", completed);
            button.setAttribute("aria-label", completed ? `${number} tamamlandı` : `${number} rakamını gir`);
        });

        controls.undo.disabled = blocked || state.history.length === 0;
        controls.erase.disabled = blocked || !canEditSelected() || (state.values[state.selected] === 0 && state.notes[state.selected] === 0);
        controls.notes.disabled = blocked;
        controls.notes.classList.toggle("active", state.noteMode);
        controls.notes.setAttribute("aria-pressed", state.noteMode.toString());
        controls.hint.disabled = blocked || state.hintsRemaining === 0;
        controls.hint.querySelector("span:last-child").textContent = `İpucu (${state.hintsRemaining})`;
        controls.pause.disabled = state.status !== "playing" || state.generating || !modal.root.hidden;
        controls.pause.querySelector("span:last-child").textContent = state.paused ? "Devam Et" : "Duraklat";
        controls.pause.setAttribute("aria-label", state.paused ? "Oyuna devam et" : "Oyunu duraklat");
        controls.newGame.disabled = state.generating;
        document.getElementById("sudoku-pause-cover").hidden = !state.paused;
    }

    function getCompletedCells() {
        const completed = new Set();

        for (let row = 0; row < 9; row += 1) {
            const indexes = Array.from({ length: 9 }, (_, column) => row * 9 + column);
            if (indexes.every((index) => state.values[index] === state.solution[index])) indexes.forEach((index) => completed.add(index));
        }
        for (let column = 0; column < 9; column += 1) {
            const indexes = Array.from({ length: 9 }, (_, row) => row * 9 + column);
            if (indexes.every((index) => state.values[index] === state.solution[index])) indexes.forEach((index) => completed.add(index));
        }
        for (let boxRow = 0; boxRow < 3; boxRow += 1) {
            for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
                const indexes = [];
                for (let row = 0; row < 3; row += 1) {
                    for (let column = 0; column < 3; column += 1) {
                        indexes.push((boxRow * 3 + row) * 9 + boxColumn * 3 + column);
                    }
                }
                if (indexes.every((index) => state.values[index] === state.solution[index])) indexes.forEach((index) => completed.add(index));
            }
        }

        return completed;
    }

    function countCompletedUnits() {
        let count = 0;
        for (let row = 0; row < 9; row += 1) {
            if (Array.from({ length: 9 }, (_, column) => row * 9 + column).every((index) => state.values[index] === state.solution[index])) count += 1;
        }
        for (let column = 0; column < 9; column += 1) {
            if (Array.from({ length: 9 }, (_, row) => row * 9 + column).every((index) => state.values[index] === state.solution[index])) count += 1;
        }
        for (let boxRow = 0; boxRow < 3; boxRow += 1) {
            for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
                let complete = true;
                for (let row = 0; row < 3; row += 1) {
                    for (let column = 0; column < 3; column += 1) {
                        const index = (boxRow * 3 + row) * 9 + boxColumn * 3 + column;
                        if (state.values[index] !== state.solution[index]) complete = false;
                    }
                }
                if (complete) count += 1;
            }
        }
        return count;
    }

    function countCorrectNumber(number) {
        return state.values.reduce((count, value, index) => count + (value === number && value === state.solution[index] ? 1 : 0), 0);
    }

    function isBoardComplete() {
        return state.values.every((value, index) => value === state.solution[index]);
    }

    function isPeer(first, second) {
        const firstRow = Math.floor(first / 9);
        const firstColumn = first % 9;
        const secondRow = Math.floor(second / 9);
        const secondColumn = second % 9;
        return firstRow === secondRow
            || firstColumn === secondColumn
            || (Math.floor(firstRow / 3) === Math.floor(secondRow / 3) && Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3));
    }

    function canInteract() {
        return state.status === "playing" && !state.paused && !state.generating && modal.root.hidden;
    }

    function canEditSelected() {
        return canInteract() && state.selected >= 0 && state.puzzle[state.selected] === 0;
    }

    function focusSelectedCell() {
        if (!panel.classList.contains("active") || !canInteract() || state.selected < 0) return;
        window.requestAnimationFrame(() => cells[state.selected]?.focus({ preventScroll: true }));
    }

    function getCellLabel(index, value, isGiven, isError, notesMask) {
        const row = Math.floor(index / 9) + 1;
        const column = index % 9 + 1;
        let detail = value ? `değer ${value}` : "boş";
        if (isGiven) detail += ", sabit";
        if (isError) detail += ", hatalı giriş";
        if (!value && notesMask) detail += `, notlar ${maskToText(notesMask)}`;
        return `${row}. satır, ${column}. sütun, ${detail}`;
    }

    function maskToText(mask) {
        return Array.from({ length: 9 }, (_, index) => index + 1).filter((number) => mask & (1 << number)).join(", ");
    }

    function openResultModal(won) {
        modal.title.textContent = won ? "Sudoku tamamlandı" : "Sudoku oyunu sona erdi";
        modal.message.textContent = won ? "Tahtadaki tüm rakamlar doğru yerinde." : "Üç hata hakkını kullandın.";
        modal.summary.hidden = false;
        modal.summary.innerHTML = `
            <div><span>Zorluk</span><strong>${DIFFICULTY_LABELS[state.difficulty]}</strong></div>
            <div><span>Süre</span><strong>${formatTime(getElapsedMs())}</strong></div>
            <div><span>Hata</span><strong>${state.errors}/${MAX_ERRORS}</strong></div>
            <div><span>İpucu</span><strong>${state.hintsUsed}/${MAX_HINTS}</strong></div>
        `;
        modal.primary.textContent = "Yeni Oyun";
        modal.root.hidden = false;
        renderControls();
        window.requestAnimationFrame(() => modal.primary.focus());
    }

    function closeModal() {
        modal.root.hidden = true;
    }

    function saveActiveGame() {
        if (state.status !== "playing" || state.generating || !engine.isGridShapeValid(state.puzzle)) return;

        const payload = {
            version: 1,
            difficulty: state.difficulty,
            puzzle: state.puzzle,
            solution: state.solution,
            values: state.values,
            notes: state.notes,
            hints: state.hints,
            selected: state.selected,
            errors: state.errors,
            hintsRemaining: state.hintsRemaining,
            hintsUsed: state.hintsUsed,
            noteMode: state.noteMode,
            paused: state.paused,
            history: state.history,
            elapsedMs: getElapsedMs(),
        };

        try {
            localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(payload));
        } catch (error) {
            // Storage may be unavailable in privacy-restricted browser contexts.
        }
    }

    function loadActiveGame() {
        const saved = readStorage(ACTIVE_GAME_KEY);
        if (!isSavedGameValid(saved)) {
            if (saved !== null) localStorage.removeItem(ACTIVE_GAME_KEY);
            return null;
        }
        return saved;
    }

    function restoreGame(saved) {
        state.difficulty = saved.difficulty;
        state.puzzle = saved.puzzle.slice();
        state.solution = saved.solution.slice();
        state.values = saved.values.slice();
        state.notes = saved.notes.slice();
        state.hints = saved.hints.slice();
        state.selected = saved.selected;
        state.errors = saved.errors;
        state.hintsRemaining = saved.hintsRemaining;
        state.hintsUsed = saved.hintsUsed;
        state.noteMode = saved.noteMode;
        state.paused = true;
        state.generating = false;
        state.status = "playing";
        state.history = saved.history.map((entry) => ({
            values: entry.values.slice(),
            notes: entry.notes.slice(),
            hints: entry.hints.slice(),
            selected: entry.selected,
        }));
        state.elapsedMs = saved.elapsedMs;
        state.timerStartedAt = null;
        display.status.textContent = "Kayıtlı oyun bulundu.";
        render();
    }

    function isSavedGameValid(saved) {
        if (!saved || saved.version !== 1 || !DIFFICULTY_LABELS[saved.difficulty]) return false;
        if (!engine.isGridShapeValid(saved.puzzle) || !engine.isSolvedGridValid(saved.solution) || !engine.isGridShapeValid(saved.values)) return false;
        if (!saved.puzzle.every((value, index) => value === 0 || value === saved.solution[index])) return false;
        if (!saved.puzzle.every((value, index) => value === 0 || saved.values[index] === value)) return false;
        if (!Array.isArray(saved.notes) || saved.notes.length !== engine.CELL_COUNT || !saved.notes.every((value) => Number.isInteger(value) && value >= 0 && value <= 1022)) return false;
        if (!Array.isArray(saved.hints) || saved.hints.length !== engine.CELL_COUNT || !saved.hints.every((value) => typeof value === "boolean")) return false;
        if (!Number.isInteger(saved.selected) || saved.selected < -1 || saved.selected >= engine.CELL_COUNT) return false;
        if (!Number.isInteger(saved.errors) || saved.errors < 0 || saved.errors >= MAX_ERRORS) return false;
        if (!Number.isInteger(saved.hintsRemaining) || saved.hintsRemaining < 0 || saved.hintsRemaining > MAX_HINTS) return false;
        if (!Number.isInteger(saved.hintsUsed) || saved.hintsUsed < 0 || saved.hintsUsed > MAX_HINTS) return false;
        if (saved.hintsRemaining + saved.hintsUsed !== MAX_HINTS) return false;
        if (typeof saved.noteMode !== "boolean" || typeof saved.paused !== "boolean") return false;
        if (!Number.isFinite(saved.elapsedMs) || saved.elapsedMs < 0) return false;
        if (!Array.isArray(saved.history) || saved.history.length > HISTORY_LIMIT) return false;
        return saved.history.every(isHistoryEntryValid);
    }

    function isHistoryEntryValid(entry) {
        return entry
            && engine.isGridShapeValid(entry.values)
            && Array.isArray(entry.notes)
            && entry.notes.length === engine.CELL_COUNT
            && entry.notes.every((value) => Number.isInteger(value) && value >= 0 && value <= 1022)
            && Array.isArray(entry.hints)
            && entry.hints.length === engine.CELL_COUNT
            && entry.hints.every((value) => typeof value === "boolean")
            && Number.isInteger(entry.selected)
            && entry.selected >= -1
            && entry.selected < engine.CELL_COUNT;
    }

    function loadStats() {
        const defaults = createDefaultStats();
        const saved = readStorage(STATS_KEY);
        if (!saved || typeof saved !== "object") return defaults;

        const safeInteger = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
        const safeBest = (value) => Number.isFinite(value) && value >= 0 ? value : null;
        return {
            games: safeInteger(saved.games),
            wins: safeInteger(saved.wins),
            currentStreak: safeInteger(saved.currentStreak),
            longestStreak: safeInteger(saved.longestStreak),
            errors: safeInteger(saved.errors),
            byDifficulty: {
                easy: { wins: safeInteger(saved.byDifficulty?.easy?.wins), bestMs: safeBest(saved.byDifficulty?.easy?.bestMs) },
                medium: { wins: safeInteger(saved.byDifficulty?.medium?.wins), bestMs: safeBest(saved.byDifficulty?.medium?.bestMs) },
                hard: { wins: safeInteger(saved.byDifficulty?.hard?.wins), bestMs: safeBest(saved.byDifficulty?.hard?.bestMs) },
            },
        };
    }

    function createDefaultStats() {
        return {
            games: 0,
            wins: 0,
            currentStreak: 0,
            longestStreak: 0,
            errors: 0,
            byDifficulty: {
                easy: { wins: 0, bestMs: null },
                medium: { wins: 0, bestMs: null },
                hard: { wins: 0, bestMs: null },
            },
        };
    }

    function saveStats() {
        try {
            localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        } catch (error) {
            // Statistics remain available for the current session.
        }
    }

    function readStorage(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            return null;
        }
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

})();
