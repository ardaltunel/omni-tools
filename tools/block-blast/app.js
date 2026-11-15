(function registerBlockBlast(initialize) {
    "use strict";

    const core = window.OmniBlockBlastCore;
    const panel = document.getElementById("block-blast");
    if (!core || !panel) return;

    if (panel.classList.contains("active")) {
        initialize(core, panel);
    } else {
        function onActivation(event) {
            if (event.detail?.tool !== "block-blast") return;
            document.removeEventListener("tool-activated", onActivation);
            initialize(core, panel);
        }
        document.addEventListener("tool-activated", onActivation);
    }
})(function initBlockBlastApp(core, panel) {
    "use strict";

    const byId = (id) => document.getElementById(`block-blast-${id}`);
    const app = byId("app");
    const board = byId("board");
    const tray = byId("tray");
    const score = byId("score");
    const best = byId("best");
    const combo = byId("combo");
    const status = byId("status");
    const sound = byId("sound");
    const dialog = byId("dialog");
    const size = core.BOARD_SIZE;
    const storageKey = "omni-block-blast-v1";
    const idleMessage = "Bir parçayı sürükle veya seçip tahtaya dokun.";
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const format = new Intl.NumberFormat("tr-TR");
    const saved = readSave();

    let state = core.restoreState(saved.game) || core.createGame();
    let bestScore = Math.max(state.score, Number.isSafeInteger(saved.best) ? saved.best : 0);
    let muted = saved.muted === true;
    let selected = null;
    let boardCursor = { row: 0, col: 0 };
    let previewCells = [];
    let drag = null;
    let suppressClick = false;
    let resultTimer = 0;
    let audioContext;
    const cells = buildBoard();

    function readSave() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            return value && typeof value === "object" ? value : {};
        } catch {
            return {};
        }
    }

    function save() {
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                game: core.serializeState(state),
                best: bestScore,
                muted,
            }));
        } catch {
            // Oyun, depolama kapalı olsa da çalışır.
        }
    }

    function buildBoard() {
        return Array.from({ length: size }, (_, row) => {
            const line = document.createElement("div");
            line.className = "bb-row";
            line.setAttribute("role", "row");
            board.append(line);
            return Array.from({ length: size }, (_, col) => {
                const cell = document.createElement("button");
                cell.className = "bb-cell";
                cell.type = "button";
                cell.setAttribute("role", "gridcell");
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);
                line.append(cell);
                return cell;
            });
        });
    }

    function createShape(piece) {
        const shape = document.createElement("span");
        shape.className = "bb-piece-shape";
        shape.setAttribute("aria-hidden", "true");
        shape.style.setProperty("--piece-rows", piece.height);
        shape.style.setProperty("--piece-cols", piece.width);
        piece.cells.forEach(([row, col]) => {
            const tile = document.createElement("span");
            tile.className = "bb-piece-cell";
            tile.dataset.color = piece.color;
            tile.style.gridRow = row + 1;
            tile.style.gridColumn = col + 1;
            shape.append(tile);
        });
        return shape;
    }

    function renderBoard() {
        cells.forEach((line, row) => line.forEach((cell, col) => {
            const color = state.board[row][col];
            cell.replaceChildren();
            cell.classList.remove("is-placed");
            if (color) cell.dataset.color = color;
            else delete cell.dataset.color;
            cell.tabIndex = row === boardCursor.row && col === boardCursor.col ? 0 : -1;
            cell.setAttribute("aria-label", `${row + 1}. satır, ${col + 1}. sütun, ${color ? "dolu" : "boş"}`);
        }));
    }

    function renderTray() {
        const slots = state.tray.map((piece, index) => {
            const slot = document.createElement("div");
            slot.className = "bb-slot";
            if (!piece) {
                slot.classList.add("is-used");
                slot.setAttribute("aria-hidden", "true");
                return slot;
            }

            const button = document.createElement("button");
            button.className = "bb-piece";
            button.type = "button";
            button.dataset.slot = index;
            button.disabled = state.gameOver;
            button.setAttribute("aria-label", `Parça ${index + 1}, ${piece.cells.length} kare, ${piece.width} × ${piece.height}`);
            button.setAttribute("aria-pressed", "false");
            button.append(createShape(piece));
            slot.append(button);
            return slot;
        });
        tray.replaceChildren(...slots);
    }

    function render() {
        renderBoard();
        renderTray();
        score.textContent = format.format(state.score);
        best.textContent = format.format(bestScore);
        combo.hidden = state.combo < 2;
        combo.textContent = state.combo > 1 ? `Kombo ×${state.combo}` : "";
        showSoundPreference();
    }

    function showSoundPreference() {
        sound.dataset.muted = String(muted);
        sound.setAttribute("aria-pressed", String(!muted));
        sound.title = muted ? "Sesi aç" : "Sesi kapat";
    }

    function clearPreview() {
        previewCells.forEach((cell) => {
            cell.classList.remove("is-preview", "is-invalid");
            delete cell.dataset.previewColor;
        });
        previewCells = [];
    }

    function preview(slot, row, col) {
        clearPreview();
        const piece = state.tray[slot];
        if (!piece || state.gameOver) return;
        const valid = core.canPlace(state, slot, row, col);
        piece.cells.forEach(([deltaRow, deltaCol]) => {
            const cell = cells[row + deltaRow]?.[col + deltaCol];
            if (!cell) return;
            cell.classList.add("is-preview");
            cell.classList.toggle("is-invalid", !valid);
            cell.dataset.previewColor = piece.color;
            previewCells.push(cell);
        });
    }

    function choosePiece(slot) {
        if (state.gameOver) return;
        selected = selected === slot ? null : slot;
        clearPreview();
        tray.querySelectorAll(".bb-piece").forEach((button) => {
            const active = Number(button.dataset.slot) === selected;
            button.classList.toggle("is-selected", active);
            button.setAttribute("aria-pressed", String(active));
        });
        status.textContent = selected === null ? idleMessage : "Parça seçildi. Sol üst köşesini yerleştireceğin kareye dokun.";
    }

    function playSound(notes) {
        if (muted) return;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            audioContext ??= new Audio();
            if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
            const start = audioContext.currentTime;
            notes.forEach((frequency, index) => {
                const at = start + index * 0.065;
                const oscillator = audioContext.createOscillator();
                const envelope = audioContext.createGain();
                oscillator.type = "triangle";
                oscillator.frequency.value = frequency;
                envelope.gain.setValueAtTime(0, at);
                envelope.gain.linearRampToValueAtTime(0.06, at + 0.012);
                envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
                oscillator.connect(envelope).connect(audioContext.destination);
                oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
                oscillator.start(at);
                oscillator.stop(at + 0.12);
            });
        } catch {
            // Tarayıcı ses çıkışını engellerse oyun sessiz devam eder.
        }
    }

    function animateMove(result, previousBoard, piece) {
        if (motion.matches) return;
        result.clearedCells.forEach(([row, col]) => {
            const effect = document.createElement("span");
            effect.className = "bb-clear-effect";
            effect.dataset.color = previousBoard[row][col] || piece.color;
            effect.setAttribute("aria-hidden", "true");
            effect.addEventListener("animationend", () => effect.remove(), { once: true });
            cells[row][col].append(effect);
        });
        result.placedCells.forEach(([row, col]) => {
            if (state.board[row][col]) cells[row][col].classList.add("is-placed");
        });
    }

    function showResult() {
        if (resultTimer || !state.gameOver || !panel.classList.contains("active") || dialog.open) return;
        byId("final-score").textContent = format.format(state.score);
        byId("final-best").textContent = format.format(bestScore);
        dialog.showModal();
    }

    function commitMove(slot, row, col) {
        const result = core.placePiece(state, slot, row, col);
        if (!result) {
            status.textContent = "Bu parça buraya sığmıyor.";
            playSound([180]);
            return;
        }
        const previous = state;
        state = result.state;
        selected = null;
        clearPreview();
        bestScore = Math.max(bestScore, state.score);
        save();
        render();
        animateMove(result, previous.board, previous.tray[slot]);

        const lines = result.clearedRows.length + result.clearedCols.length;
        if (state.gameOver) {
            status.textContent = "Kalan parçalar için yer kalmadı.";
            playSound([392, 262, 196]);
            if (lines && !motion.matches) {
                resultTimer = window.setTimeout(() => {
                    resultTimer = 0;
                    showResult();
                }, 360);
            } else showResult();
        } else if (lines) {
            const streak = state.combo > 1 ? ` Kombo ×${state.combo}.` : "";
            status.textContent = `${lines} çizgi temizlendi. +${format.format(result.points)} puan.${streak}`;
            playSound([440, 587, state.combo > 1 ? 880 : 740]);
        } else {
            status.textContent = result.trayRefilled ? "Üç yeni parça geldi." : `+${format.format(result.points)} puan.`;
            playSound([420]);
        }
    }

    function focusCell(row, col) {
        cells[boardCursor.row][boardCursor.col].tabIndex = -1;
        boardCursor = { row, col };
        const cell = cells[row][col];
        cell.tabIndex = 0;
        cell.focus({ preventScroll: true });
        if (selected !== null) preview(selected, row, col);
    }

    function prepareDrag(event) {
        const button = event.target.closest(".bb-piece");
        if (!button || button.disabled || !event.isPrimary || event.button !== 0 || drag) return;
        const slot = Number(button.dataset.slot);
        const shape = button.querySelector(".bb-piece-shape").getBoundingClientRect();
        suppressClick = false;
        drag = {
            slot,
            button,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: Math.min(1, Math.max(0, (event.clientX - shape.left) / shape.width)),
            offsetY: Math.min(1, Math.max(0, (event.clientY - shape.top) / shape.height)),
            lift: event.pointerType === "touch" ? 30 : 0,
            frame: 0,
            ghost: null,
        };
        button.setPointerCapture(event.pointerId);
    }

    function dragPoint(event) {
        const first = cells[0][0].getBoundingClientRect();
        const stepX = cells[0][1].getBoundingClientRect().left - first.left;
        const stepY = cells[1][0].getBoundingClientRect().top - first.top;
        const piece = state.tray[drag.slot];
        const width = first.width + (piece.width - 1) * stepX;
        const height = first.height + (piece.height - 1) * stepY;
        const x = event.clientX - width * drag.offsetX;
        const y = event.clientY - height * drag.offsetY - drag.lift;
        return {
            x, y,
            row: Math.round((y - first.top) / stepY),
            col: Math.round((x - first.left) / stepX),
            cellWidth: first.width,
            cellHeight: first.height,
            gapX: stepX - first.width,
            gapY: stepY - first.height,
        };
    }

    function paintDrag(event) {
        const point = dragPoint(event);
        const shape = drag.ghost.firstElementChild;
        shape.style.gridTemplateColumns = `repeat(var(--piece-cols), ${point.cellWidth}px)`;
        shape.style.gridTemplateRows = `repeat(var(--piece-rows), ${point.cellHeight}px)`;
        shape.style.gap = `${point.gapY}px ${point.gapX}px`;
        drag.ghost.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
        preview(drag.slot, point.row, point.col);
    }

    function moveDrag(event) {
        if (drag?.pointerId !== event.pointerId) return;
        if (!drag.ghost) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
            const ghost = document.createElement("div");
            ghost.className = "bb-drag-ghost";
            ghost.setAttribute("aria-hidden", "true");
            ghost.append(createShape(state.tray[drag.slot]));
            app.append(ghost);
            drag.ghost = ghost;
            drag.button.classList.add("is-dragging");
            status.textContent = "Parçayı boş karelerin üzerine bırak.";
        }
        window.cancelAnimationFrame(drag.frame);
        drag.frame = window.requestAnimationFrame(() => {
            if (drag) paintDrag(event);
        });
    }

    function cancelDrag() {
        if (!drag) return;
        const { button, ghost, frame, pointerId } = drag;
        drag = null;
        window.cancelAnimationFrame(frame);
        ghost?.remove();
        button.classList.remove("is-dragging");
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        clearPreview();
    }

    function finishDrag(event) {
        if (drag?.pointerId !== event.pointerId) return;
        const { slot, ghost } = drag;
        const point = ghost && dragPoint(event);
        suppressClick = Boolean(ghost);
        cancelDrag();
        if (!point) return;
        const { row, col } = point;
        commitMove(slot, row, col);
    }

    function restart() {
        cancelDrag();
        clearPreview();
        window.clearTimeout(resultTimer);
        resultTimer = 0;
        if (dialog.open) dialog.close();
        selected = null;
        state = core.createGame();
        boardCursor = { row: 0, col: 0 };
        status.textContent = idleMessage;
        render();
        save();
        tray.querySelector(".bb-piece")?.focus({ preventScroll: true });
    }

    tray.addEventListener("pointerdown", prepareDrag);
    tray.addEventListener("pointermove", moveDrag);
    tray.addEventListener("pointerup", finishDrag);
    for (const eventName of ["pointercancel", "lostpointercapture"]) {
        tray.addEventListener(eventName, (event) => {
            if (drag?.pointerId !== event.pointerId) return;
            cancelDrag();
            status.textContent = idleMessage;
        });
    }
    tray.addEventListener("click", (event) => {
        const button = event.target.closest(".bb-piece");
        if (!button || (suppressClick && event.detail > 0)) return;
        choosePiece(Number(button.dataset.slot));
        if (event.detail === 0 && selected !== null) focusCell(boardCursor.row, boardCursor.col);
    });

    board.addEventListener("pointermove", (event) => {
        if (drag || selected === null || event.pointerType !== "mouse") return;
        const cell = event.target.closest(".bb-cell");
        if (cell) preview(selected, Number(cell.dataset.row), Number(cell.dataset.col));
        else clearPreview();
    });
    board.addEventListener("pointerleave", () => {
        if (!drag) clearPreview();
    });
    board.addEventListener("focusout", (event) => {
        if (!board.contains(event.relatedTarget)) clearPreview();
    });
    board.addEventListener("click", (event) => {
        const cell = event.target.closest(".bb-cell");
        if (!cell || state.gameOver) return;
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        focusCell(row, col);
        if (selected !== null) commitMove(selected, row, col);
        else status.textContent = idleMessage;
    });
    board.addEventListener("keydown", (event) => {
        const deltas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        const delta = deltas[event.key];
        if (!delta || state.gameOver) return;
        event.preventDefault();
        const bounded = (index) => Math.max(0, Math.min(size - 1, index));
        focusCell(bounded(boardCursor.row + delta[0]), bounded(boardCursor.col + delta[1]));
    });

    app.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || dialog.open) return;
        cancelDrag();
        if (selected !== null) choosePiece(selected);
    });
    sound.addEventListener("click", () => {
        muted = !muted;
        showSoundPreference();
        save();
        playSound([520]);
    });
    byId("restart").addEventListener("click", restart);
    byId("play-again").addEventListener("click", restart);
    byId("close-result").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        if (state.gameOver && panel.classList.contains("active")) byId("restart").focus({ preventScroll: true });
    });
    new MutationObserver(() => {
        if (panel.classList.contains("active")) {
            showResult();
        } else {
            cancelDrag();
            if (dialog.open) dialog.close();
        }
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("pagehide", cancelDrag);
    window.addEventListener("blur", cancelDrag);

    status.textContent = state.gameOver ? "Kalan parçalar için yer kalmadı." : idleMessage;
    render();
    save();
    showResult();
});
