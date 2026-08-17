"use strict";

const xoxDocument = typeof document === "undefined" ? null : document;
const xoxCells = xoxDocument ? Array.from(xoxDocument.querySelectorAll("[data-xox-cell]")) : [];
const xoxRestart = xoxDocument?.getElementById("xox-restart");
const xoxStatus = xoxDocument?.getElementById("xox-status");
const xoxTurn = xoxDocument?.getElementById("xox-turn");
const xoxMoves = xoxDocument?.getElementById("xox-moves");
const xoxPlayerWins = xoxDocument?.getElementById("xox-player-wins");
const xoxBotWins = xoxDocument?.getElementById("xox-bot-wins");
const xoxResult = xoxDocument?.getElementById("xox-result");
const xoxLevelText = xoxDocument?.getElementById("xox-level-text");
const xoxLevelButtons = xoxDocument ? Array.from(xoxDocument.querySelectorAll(".xox-level")) : [];

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
const XOX_WIN_SCORE = 100_000;

const xoxState = {
    board: Array(9).fill(""),
    queues: { X: [], O: [] },
    turn: "X",
    locked: false,
    over: false,
    moves: 0,
    wins: { X: 0, O: 0 },
    level: "normal",
    round: -1,
    gameSeed: 0,
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
    xoxState.round += 1;
    xoxState.gameSeed = Math.floor(Math.random() * 0x7fffffff);
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
    const position = {
        board: [...xoxState.board],
        queues: { X: [...xoxState.queues.X], O: [...xoxState.queues.O] },
    };
    const variation = getXoxPositionVariation(position, xoxState.gameSeed + xoxState.moves);
    return chooseXoxBotMove(position, xoxState.level, variation, Math.random);
}

function chooseXoxBotMove(position, level = "normal", variation = 0, random = Math.random) {
    if (!getXoxEmptyCells(position.board).length) {
        return -1;
    }

    if (level === "easy") {
        return chooseXoxEasyMove(position, variation, random);
    }
    if (level === "hard") {
        return chooseXoxHardMove(position, variation);
    }
    return chooseXoxNormalMove(position, variation, random);
}

function chooseXoxEasyMove(position, variation, random) {
    const winningMoves = findXoxTacticalMoves(position.board, "O");
    if (winningMoves.length && random() < 0.35) {
        return pickXoxMoveCandidate(winningMoves, variation);
    }

    const blockingMoves = findXoxTacticalMoves(position.board, "X");
    if (blockingMoves.length && random() < 0.2) {
        return pickXoxMoveCandidate(blockingMoves, variation);
    }

    return pickXoxRandomMove(getXoxEmptyCells(position.board), random);
}

function chooseXoxNormalMove(position, variation, random) {
    const winningMoves = findXoxTacticalMoves(position.board, "O");
    if (winningMoves.length) {
        return pickXoxMoveCandidate(winningMoves, variation);
    }

    const blockingMoves = findXoxTacticalMoves(position.board, "X");
    if (blockingMoves.length && random() < 0.8) {
        return pickXoxMoveCandidate(blockingMoves, variation);
    }

    // Normal mod çoğu anlık tehdidi kapatır; kalan durumda kısa vadeli, insansı bir hamle seçer.
    // Böylece zor modun derin arama kararını bire bir tekrar etmez.
    const candidateMoves = blockingMoves.length
        ? getXoxEmptyCells(position.board).filter((index) => !blockingMoves.includes(index))
        : getXoxEmptyCells(position.board);
    return chooseXoxNormalStrategicMove(position, candidateMoves, variation);
}

function chooseXoxNormalStrategicMove(position, moves, variation) {
    const scoredMoves = moves.map((index) => {
        const next = simulateXoxMove(position, index, "O");
        let score = evaluateXoxPosition(next);
        score += index === 4 ? 35 : [0, 2, 6, 8].includes(index) ? 18 : 8;
        score += findXoxTacticalMoves(next.board, "O").length * 55;
        score -= findXoxTacticalMoves(next.board, "X").length * 45;
        if (next.winner === "O") {
            score += XOX_WIN_SCORE;
        }
        return { index, score };
    });
    const bestScore = Math.max(...scoredMoves.map(({ score }) => score));
    const nearBestMoves = scoredMoves
        .filter(({ score }) => score >= bestScore - 18)
        .map(({ index }) => index);
    return pickXoxMoveCandidate(nearBestMoves, variation);
}

function pickXoxRandomMove(moves, random) {
    if (!moves.length) {
        return -1;
    }
    return moves[Math.floor(random() * moves.length)];
}

function chooseXoxHardMove(position, variation = 0) {
    const empty = getXoxEmptyCells(position.board);
    const cache = new Map();
    const searchDepth = getXoxHardSearchDepth(position.board);
    const scoredMoves = empty.map((index) => {
        const next = simulateXoxMove(position, index, "O");
        const score = next.winner === "O"
            ? XOX_WIN_SCORE + searchDepth
            : minimaxXox(next, "X", searchDepth - 1, -Infinity, Infinity, cache);
        return { index, score };
    });
    const bestScore = Math.max(...scoredMoves.map(({ score }) => score));
    return pickXoxMoveCandidate(
        scoredMoves.filter(({ score }) => score === bestScore).map(({ index }) => index),
        variation
    );
}

function getXoxHardSearchDepth(board) {
    const occupied = board.filter(Boolean).length;
    if (occupied < 3) return 9;
    if (occupied < 5) return 10;
    return 12;
}

function getXoxPositionVariation(position, variation = 0) {
    const fingerprint = `${position.board.join("-")}|${position.queues.X.join(",")}|${position.queues.O.join(",")}`;
    let hash = 2166136261;
    for (const character of fingerprint) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    return (hash >>> 0) + (Number.isFinite(variation) ? Math.abs(Math.trunc(variation)) : 0);
}

function pickXoxMoveCandidate(moves, variation = 0) {
    if (!moves.length) {
        return -1;
    }
    const orderedMoves = [...moves].sort((a, b) => a - b);
    const normalizedVariation = Number.isFinite(variation) ? Math.abs(Math.trunc(variation)) : 0;
    return orderedMoves[normalizedVariation % orderedMoves.length];
}

function minimaxXox(position, mark, depth, alpha, beta, cache) {
    if (depth <= 0) {
        return evaluateXoxPosition(position);
    }

    const cacheKey = `${position.board.join("")}|${position.queues.X.join(",")}|${position.queues.O.join(",")}|${mark}|${depth}`;
    const cachedScore = cache.get(cacheKey);
    if (cachedScore !== undefined) {
        return cachedScore;
    }

    const legalMoves = orderXoxMoves(position, mark);
    if (!legalMoves.length) {
        return evaluateXoxPosition(position);
    }

    const isBotTurn = mark === "O";
    let bestScore = isBotTurn ? -Infinity : Infinity;
    let completedSearch = true;

    for (const index of legalMoves) {
        const next = simulateXoxMove(position, index, mark);
        const score = next.winner
            ? (next.winner === "O" ? XOX_WIN_SCORE + depth : -XOX_WIN_SCORE - depth)
            : minimaxXox(next, mark === "O" ? "X" : "O", depth - 1, alpha, beta, cache);

        if (isBotTurn) {
            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, bestScore);
        } else {
            bestScore = Math.min(bestScore, score);
            beta = Math.min(beta, bestScore);
        }

        if (beta <= alpha) {
            completedSearch = false;
            break;
        }
    }

    if (completedSearch) {
        cache.set(cacheKey, bestScore);
    }
    return bestScore;
}

function orderXoxMoves(position, mark) {
    const opponent = mark === "O" ? "X" : "O";
    return getXoxEmptyCells(position.board)
        .map((index) => {
            const next = simulateXoxMove(position, index, mark);
            let score = index === 4 ? 40 : [0, 2, 6, 8].includes(index) ? 24 : 12;
            if (next.winner === mark) {
                score += 10_000;
            }
            if (findXoxTacticalMoves(position.board, opponent).includes(index)) {
                score += 5_000;
            }
            score += evaluateXoxPosition(next) * (mark === "O" ? 0.02 : -0.02);
            return { index, score };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ index }) => index);
}

function simulateXoxMove(position, index, mark) {
    const board = [...position.board];
    const queues = { X: [...position.queues.X], O: [...position.queues.O] };
    board[index] = mark;
    queues[mark].push(index);

    const winner = getXoxWinnerForBoard(board);
    if (winner) {
        return { board, queues, winner };
    }

    if (queues[mark].length > 3) {
        board[queues[mark].shift()] = "";
    }
    return { board, queues, winner: "" };
}

function evaluateXoxPosition(position) {
    let score = 0;

    for (const line of XOX_WIN_LINES) {
        const values = line.map((index) => position.board[index]);
        const botMarks = values.filter((value) => value === "O").length;
        const playerMarks = values.filter((value) => value === "X").length;

        if (!playerMarks) {
            score += [0, 12, 150, XOX_WIN_SCORE][botMarks];
        }
        if (!botMarks) {
            score -= [0, 14, 180, XOX_WIN_SCORE][playerMarks];
        }
    }

    if (position.board[4] === "O") score += 9;
    if (position.board[4] === "X") score -= 10;
    for (const corner of [0, 2, 6, 8]) {
        if (position.board[corner] === "O") score += 3;
        if (position.board[corner] === "X") score -= 3;
    }
    return score;
}

function findXoxTacticalMoves(board, mark) {
    return XOX_WIN_LINES.flatMap((line) => {
        const marks = line.filter((index) => board[index] === mark).length;
        const blanks = line.filter((index) => board[index] === "");
        return marks === 2 && blanks.length === 1 ? blanks : [];
    });
}

function getXoxEmptyCells(board = xoxState.board) {
    return board
        .map((value, index) => (value === "" ? index : -1))
        .filter((index) => index !== -1);
}

function getXoxWinner() {
    return getXoxWinnerForBoard(xoxState.board);
}

function getXoxWinnerForBoard(board) {
    return XOX_WIN_LINES.find((line) => {
        const [a, b, c] = line;
        return board[a] && board[a] === board[b] && board[a] === board[c];
    })?.map((index) => board[index])[0] || "";
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

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        chooseXoxHardMove,
        chooseXoxBotMove,
        getXoxPositionVariation,
        pickXoxMoveCandidate,
        simulateXoxMove,
    };
}

if (typeof window !== "undefined") {
    window.addEventListener("DOMContentLoaded", initAdvancedXox);
}
