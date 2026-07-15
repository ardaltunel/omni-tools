"use strict";

const xoxCells = Array.from(document.querySelectorAll("[data-xox-cell]"));
const xoxRestart = document.getElementById("xox-restart");
const xoxStatus = document.getElementById("xox-status");
const xoxTurn = document.getElementById("xox-turn");
const xoxMoves = document.getElementById("xox-moves");
const xoxPlayerWins = document.getElementById("xox-player-wins");
const xoxBotWins = document.getElementById("xox-bot-wins");
const xoxResult = document.getElementById("xox-result");
const xoxLevelText = document.getElementById("xox-level-text");
const xoxLevelButtons = Array.from(document.querySelectorAll(".xox-level"));

const XOX_WIN_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

const xoxState = {
    board: Array(9).fill(""),
    queues: { X: [], O: [] },
    turn: "X",
    locked: false,
    over: false,
    moves: 0,
    wins: { X: 0, O: 0 },
    level: "normal",
};

function initAdvancedXox() {
    if (!xoxCells.length) {
        return;
    }
    xoxCells.forEach((cell, index) => {
        cell.addEventListener("click", () => handleXoxPlayerMove(index));
    });
    xoxRestart.addEventListener("click", resetAdvancedXox);
    xoxLevelButtons.forEach((button) => {
        button.addEventListener("click", () => setXoxLevel(button.dataset.level || "normal"));
    });
    setXoxLevel(xoxState.level);
    resetAdvancedXox();
}

function setXoxLevel(level) {
    xoxState.level = level;
    const labels = { easy: "Kolay", normal: "Normal", hard: "Zor" };
    xoxLevelButtons.forEach((button) => button.classList.toggle("active", button.dataset.level === level));
    xoxLevelText.textContent = labels[level] || "Normal";
}

function resetAdvancedXox() {
    xoxState.board.fill("");
    xoxState.queues = { X: [], O: [] };
    xoxState.turn = "X";
    xoxState.locked = false;
    xoxState.over = false;
    xoxState.moves = 0;
    xoxResult.textContent = "Oyuncu ve bot üçer taşa kadar kalır; kazanan çıkana kadar tahta akmaya devam eder.";
    renderAdvancedXox();
}

function handleXoxPlayerMove(index) {
    if (xoxState.locked || xoxState.over || xoxState.turn !== "X" || xoxState.board[index]) {
        return;
    }
    playXoxMove(index, "X");
    if (!xoxState.over) {
        xoxState.turn = "O";
        xoxState.locked = true;
        renderAdvancedXox("Bot düşünüyor.");
        window.setTimeout(playXoxBotMove, xoxState.level === "hard" ? 520 : xoxState.level === "easy" ? 300 : 420);
    }
}

function playXoxBotMove() {
    if (xoxState.over) {
        return;
    }
    const move = pickXoxBotMove();
    if (move !== -1) {
        playXoxMove(move, "O");
    }
    if (!xoxState.over) {
        xoxState.turn = "X";
        xoxState.locked = false;
        renderAdvancedXox();
    }
}

function playXoxMove(index, mark) {
    xoxState.board[index] = mark;
    xoxState.queues[mark].push(index);
    xoxState.moves += 1;

    const winner = getXoxWinner();
    if (winner) {
        xoxState.over = true;
        xoxState.locked = false;
        xoxState.wins[winner] += 1;
        xoxResult.textContent = winner === "X" ? "Oyuncu kazandı." : "Bot kazandı.";
        renderAdvancedXox();
        return;
    }

    if (xoxState.queues[mark].length > 3) {
        const expiredIndex = xoxState.queues[mark].shift();
        xoxState.board[expiredIndex] = "";
    }
    renderAdvancedXox();
}

function pickXoxBotMove() {
    const empty = getXoxEmptyCells();
    if (!empty.length) {
        return -1;
    }

    if (xoxState.level === "easy") {
        return empty[Math.floor(Math.random() * empty.length)];
    }

    const winningMove = findXoxTacticalMove("O");
    if (winningMove !== -1) {
        return winningMove;
    }

    const blockingMove = findXoxTacticalMove("X");
    if (blockingMove !== -1 && xoxState.level !== "easy") {
        return blockingMove;
    }

    if (xoxState.level === "hard") {
        const forkMove = findXoxBestScoredMove(empty);
        if (forkMove !== -1) {
            return forkMove;
        }
    }

    if (xoxState.board[4] === "") {
        return 4;
    }

    const corners = [0, 2, 6, 8].filter((index) => xoxState.board[index] === "");
    if (corners.length) {
        return corners[Math.floor(Math.random() * corners.length)];
    }

    return empty[Math.floor(Math.random() * empty.length)];
}

function findXoxBestScoredMove(empty) {
    return empty
        .map((index) => ({ index, score: scoreXoxMove(index) }))
        .sort((a, b) => b.score - a.score)[0]?.index ?? -1;
}

function scoreXoxMove(index) {
    let score = index === 4 ? 10 : [0, 2, 6, 8].includes(index) ? 6 : 3;
    for (const line of XOX_WIN_LINES.filter((combo) => combo.includes(index))) {
        const values = line.map((cellIndex) => (cellIndex === index ? "O" : xoxState.board[cellIndex]));
        const botMarks = values.filter((value) => value === "O").length;
        const playerMarks = values.filter((value) => value === "X").length;
        if (botMarks && !playerMarks) score += botMarks * 8;
        if (playerMarks && !botMarks) score += playerMarks * 5;
    }
    const expiringBot = xoxState.queues.O.length === 3 ? xoxState.queues.O[0] : -1;
    if (expiringBot !== -1 && XOX_WIN_LINES.some((line) => line.includes(index) && line.includes(expiringBot))) {
        score -= 5;
    }
    return score;
}

function findXoxTacticalMove(mark) {
    for (const line of XOX_WIN_LINES) {
        const values = line.map((index) => xoxState.board[index]);
        const marks = values.filter((value) => value === mark).length;
        const blanks = line.filter((index) => xoxState.board[index] === "");
        if (marks === 2 && blanks.length === 1) {
            return blanks[0];
        }
    }
    return -1;
}

function getXoxEmptyCells() {
    return xoxState.board
        .map((value, index) => (value === "" ? index : -1))
        .filter((index) => index !== -1);
}

function getXoxWinner() {
    return XOX_WIN_LINES.find((line) => {
        const [a, b, c] = line;
        return xoxState.board[a] && xoxState.board[a] === xoxState.board[b] && xoxState.board[a] === xoxState.board[c];
    })?.map((index) => xoxState.board[index])[0] || "";
}

function renderAdvancedXox(statusOverride) {
    const nextExpired = new Set(
        Object.values(xoxState.queues)
            .filter((queue) => queue.length === 3)
            .map((queue) => queue[0])
    );
    xoxCells.forEach((cell, index) => {
        const value = xoxState.board[index];
        cell.innerHTML = value ? `<span>${value}</span>` : "";
        cell.className = `xox-cell ${value ? `mark-${value.toLowerCase()}` : ""}`;
        cell.disabled = xoxState.locked || xoxState.over || xoxState.turn !== "X" || Boolean(value);
        if (!xoxState.over && nextExpired.has(index)) {
            cell.classList.add("is-expiring");
        }
    });

    xoxTurn.textContent = xoxState.over ? "-" : xoxState.turn === "X" ? "Oyuncu" : "Bot";
    xoxMoves.textContent = xoxState.moves.toString();
    xoxPlayerWins.textContent = xoxState.wins.X.toString();
    xoxBotWins.textContent = xoxState.wins.O.toString();

    if (xoxState.over) {
        xoxStatus.textContent = "Oyun bitti.";
    } else {
        xoxStatus.textContent = statusOverride || (xoxState.turn === "X" ? "Sıra sende." : "Bot düşünüyor.");
    }
}

window.addEventListener("DOMContentLoaded", initAdvancedXox);
