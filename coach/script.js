"use strict";

const coachBoardElement = document.getElementById("coach-board");
const coachStatus = document.getElementById("coach-status");
const coachEval = document.getElementById("coach-eval");
const coachBestLabel = document.getElementById("coach-best-label");
const coachBestMove = document.getElementById("coach-best-move");
const coachBestReason = document.getElementById("coach-best-reason");
const coachLines = document.getElementById("coach-lines");
const coachTurn = document.getElementById("coach-turn");
const coachMoveCount = document.getElementById("coach-move-count");
const coachState = document.getElementById("coach-state");
const coachHistory = document.getElementById("coach-history");
const coachReset = document.getElementById("coach-reset");
const coachUndo = document.getElementById("coach-undo");
const coachSuggest = document.getElementById("coach-suggest");
const coachPlay = document.getElementById("coach-play");

let coachBoard = null;
let coachGame = null;
let coachEngine = null;
let coachSearchFen = "";
let coachBestUci = "";
let coachEngineLines = new Map();

function initCoach() {
    if (!coachBoardElement || typeof Chessboard !== "function" || typeof Chess !== "function") {
        return;
    }

    coachGame = new Chess();
    coachBoard = Chessboard("coach-board", {
        draggable: true,
        showNotation: false,
        position: "start",
        pieceTheme: "coach/img/chesspieces/wikipedia/{piece}.png",
        onDragStart: handleCoachDragStart,
        onDrop: handleCoachDrop,
        onSnapEnd: () => coachBoard.position(coachGame.fen()),
    });

    coachReset.addEventListener("click", resetCoach);
    coachUndo.addEventListener("click", undoCoachMove);
    coachSuggest.addEventListener("click", analyzeCoachPosition);
    coachPlay.addEventListener("click", playCoachSuggestion);
    window.addEventListener("resize", () => coachBoard?.resize());
    document.addEventListener("tool-activated", handleCoachPanelActivation);

    initCoachEngine();
    renderCoachShell();
    analyzeCoachPosition();
}

function handleCoachPanelActivation(event) {
    if (event.detail?.tool !== "chess-coach" || !coachBoard) return;

    requestAnimationFrame(() => {
        coachBoard.resize();
        coachBoard.position(coachGame.fen(), false);
        if (!coachBestUci && !coachGame.game_over()) {
            analyzeCoachPosition();
        }
    });
}

function initCoachEngine() {
    try {
        coachEngine = typeof STOCKFISH === "function" ? STOCKFISH() : new Worker("coach/stockfish.js");
        coachEngine.onmessage = handleCoachEngineLine;
        postCoachEngine("uci");
        postCoachEngine("setoption name MultiPV value 4");
        postCoachEngine("setoption name Hash value 128");
        postCoachEngine("isready");
    } catch (error) {
        coachEngine = null;
        coachBestLabel.textContent = "Yerel analiz";
        coachBestReason.textContent = "Stockfish başlatılamadı; temel hamle önerisi kullanılacak.";
    }
}

function postCoachEngine(message) {
    if (coachEngine) {
        coachEngine.postMessage(message);
    }
}

function resetCoach() {
    coachGame.reset();
    coachBoard.start(false);
    removeCoachHighlights();
    renderCoachShell();
    analyzeCoachPosition();
}

function undoCoachMove() {
    coachGame.undo();
    coachBoard.position(coachGame.fen(), false);
    removeCoachHighlights();
    renderCoachShell();
    analyzeCoachPosition();
}

function playCoachSuggestion() {
    if (!coachBestUci) return;
    const move = moveFromUci(coachBestUci);
    if (!move) return;
    coachGame.move(move);
    coachBoard.position(coachGame.fen(), false);
    removeCoachHighlights();
    renderCoachShell();
    analyzeCoachPosition();
}

function handleCoachDragStart(source, piece) {
    if (coachGame.game_over()) return false;
    if (coachGame.turn() === "w" && piece.search(/^b/) !== -1) return false;
    if (coachGame.turn() === "b" && piece.search(/^w/) !== -1) return false;
}

function handleCoachDrop(source, target) {
    removeCoachHighlights();
    const move = coachGame.move({ from: source, to: target, promotion: "q" });
    if (move === null) return "snapback";
    renderCoachShell();
    analyzeCoachPosition();
}

function analyzeCoachPosition() {
    renderCoachShell();
    coachEngineLines = new Map();
    coachBestUci = "";
    coachSearchFen = coachGame.fen();
    coachBestLabel.textContent = "Stockfish düşünüyor";
    coachBestMove.textContent = "...";
    coachBestReason.textContent = "Pozisyon motor tarafından analiz ediliyor.";
    coachLines.innerHTML = "";

    if (coachGame.game_over()) {
        renderCoachGameOver();
        return;
    }

    if (!coachEngine) {
        renderFallbackCoachSuggestion();
        return;
    }

    postCoachEngine("stop");
    postCoachEngine(`position fen ${coachSearchFen}`);
    postCoachEngine("go movetime 900");
}

function handleCoachEngineLine(event) {
    const line = typeof event === "string" ? event : event?.data || "";
    if (!line) return;

    if (line.startsWith("info") && line.includes(" pv ")) {
        const parsed = parseCoachInfo(line);
        if (parsed) {
            coachEngineLines.set(parsed.multipv, parsed);
            renderCoachEngineLines();
        }
        return;
    }

    if (line.startsWith("bestmove")) {
        const best = line.split(" ")[1];
        if (!best || best === "(none)") return;
        coachBestUci = best;
        const bestMove = describeCoachUci(best, coachSearchFen);
        coachBestLabel.textContent = "Stockfish önerisi";
        coachBestMove.textContent = bestMove.san;
        coachBestReason.textContent = bestMove.reason;
        highlightCoachMove(best);
        renderCoachEngineLines();
    }
}

function parseCoachInfo(line) {
    const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] || 1);
    const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] || 0);
    const cp = line.match(/\bscore\s+cp\s+(-?\d+)/)?.[1];
    const mate = line.match(/\bscore\s+mate\s+(-?\d+)/)?.[1];
    const pv = line.match(/\bpv\s+(.+)$/)?.[1]?.split(" ") || [];
    if (!pv.length) return null;
    return { multipv, depth, cp: cp === undefined ? null : Number(cp), mate: mate === undefined ? null : Number(mate), pv };
}

function renderCoachEngineLines() {
    const lines = Array.from(coachEngineLines.values())
        .sort((a, b) => a.multipv - b.multipv)
        .slice(0, 4);
    coachLines.innerHTML = lines.map((item) => {
        const move = describeCoachUci(item.pv[0], coachSearchFen);
        return `
            <article class="coach-line">
                <span>${item.multipv}</span>
                <strong>${escapeCoachHtml(move.san)}</strong>
                <p>${escapeCoachHtml(formatCoachScore(item))} · ${escapeCoachHtml(move.reason)}</p>
            </article>
        `;
    }).join("");

    const first = lines[0];
    if (first) {
        coachEval.textContent = formatCoachScore(first);
    }
}

function renderFallbackCoachSuggestion() {
    const moves = coachGame.moves({ verbose: true });
    if (!moves.length) return;
    const best = moves[0];
    coachBestUci = `${best.from}${best.to}${best.promotion || ""}`;
    coachBestLabel.textContent = "Temel öneri";
    coachBestMove.textContent = best.san;
    coachBestReason.textContent = explainCoachMove(best);
}

function renderCoachGameOver() {
    coachBestLabel.textContent = "Oyun bitti";
    coachBestMove.textContent = "-";
    coachBestReason.textContent = getCoachStateText();
    coachLines.innerHTML = "";
}

function renderCoachShell() {
    const side = coachGame.turn() === "w" ? "Beyaz" : "Siyah";
    coachStatus.textContent = coachGame.in_checkmate()
        ? "Mat."
        : coachGame.in_check()
            ? `${side} şah altında.`
            : `${side} oynar.`;
    coachTurn.textContent = side;
    coachMoveCount.textContent = coachGame.history().length.toString();
    coachState.textContent = getCoachStateText();
    coachHistory.textContent = coachGame.history().length ? coachGame.history().join(" ") : "Henüz hamle yok.";
}

function describeCoachUci(uci, fen) {
    const clone = new Chess(fen);
    const move = clone.move(moveFromUci(uci));
    if (!move) return { san: uci, reason: "Motorun önerdiği aday hamle." };
    return { san: move.san, reason: explainCoachMove(move) };
}

function moveFromUci(uci) {
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" };
}

function explainCoachMove(move) {
    if (move.san.includes("#")) return "Mat fikrini tamamlıyor.";
    if (move.captured) return `${pieceName(move.captured)} alarak materyal kazanıyor.`;
    if (move.san.includes("+")) return "Şah çekerek rakibi savunmaya zorluyor.";
    if (move.flags.includes("k") || move.flags.includes("q")) return "Rok ile şah güvenliğini artırıyor.";
    if (["d4", "e4", "d5", "e5"].includes(move.to)) return "Merkezi kontrol ettiği için konumu geliştiriyor.";
    return "Motorun pozisyon için seçtiği en sağlam adaylardan biri.";
}

function formatCoachScore(info) {
    if (info.mate !== null) return `${info.mate > 0 ? "+" : "-"}M${Math.abs(info.mate)}`;
    if (info.cp === null) return "0.00";
    const score = info.cp / 100;
    return `${score > 0 ? "+" : ""}${score.toFixed(2)}`;
}

function highlightCoachMove(uci) {
    removeCoachHighlights();
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    coachBoardElement.querySelector(`.square-${from}`)?.classList.add("highlight-from");
    coachBoardElement.querySelector(`.square-${to}`)?.classList.add("highlight-to");
}

function removeCoachHighlights() {
    coachBoardElement.querySelectorAll(".highlight-from, .highlight-to").forEach((square) => {
        square.classList.remove("highlight-from", "highlight-to");
    });
}

function getCoachStateText() {
    if (coachGame.in_checkmate()) return "Mat";
    if (coachGame.in_stalemate()) return "Pat";
    if (coachGame.in_draw()) return "Berabere";
    if (coachGame.in_check()) return "Şah";
    return "Oyun sürüyor";
}

function pieceName(piece) {
    return ({ p: "piyon", n: "at", b: "fil", r: "kale", q: "vezir", k: "şah" })[piece] || "taş";
}

function escapeCoachHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    })[char]);
}

window.addEventListener("DOMContentLoaded", initCoach);
