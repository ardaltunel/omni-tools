(function initBlockBlastCore(root, factory) {
    "use strict";

    const core = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = core;
    } else {
        root.OmniBlockBlastCore = core;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createBlockBlastCore() {
    "use strict";

    const BOARD_SIZE = 8;
    const TRAY_SIZE = 3;
    const COLOR_COUNT = 6;
    const SCORE_PER_LINE = 10;
    const COMBO_BONUS_PER_LINE = 5;
    const SNAPSHOT_VERSION = 1;

    const PATTERNS = {
        single: ["#"],
        domino: ["##"],
        line3: ["###"],
        line4: ["####"],
        line5: ["#####"],
        square2: ["##", "##"],
        square3: ["###", "###", "###"],
        rectangle: ["###", "###"],
        corner: ["##", "#."],
        wideCorner: ["###", "#..", "#.."],
        leftHook: ["#.", "#.", "##"],
        rightHook: [".#", ".#", "##"],
        tee: ["###", ".#."],
        zig: [".##", "##."],
        zag: ["##.", ".##"],
        plus: [".#.", "###", ".#."],
    };

    function rotate(rows) {
        return Array.from({ length: rows[0].length }, (_, col) => (
            rows.map((row) => row[col]).reverse().join("")
        ));
    }

    function buildShapes() {
        const shapes = [];
        for (const [name, pattern] of Object.entries(PATTERNS)) {
            const seen = new Set();
            let rows = pattern;
            for (let turns = 0; turns < 4; turns += 1) {
                const key = rows.join("/");
                if (!seen.has(key)) {
                    seen.add(key);
                    const cells = rows.flatMap((row, rowIndex) => Array.from(row).flatMap((cell, colIndex) => (
                        cell === "#" ? [Object.freeze([rowIndex, colIndex])] : []
                    )));
                    shapes.push({
                        shapeId: `${name}-${turns}`,
                        width: rows[0].length,
                        height: rows.length,
                        cells: Object.freeze(cells),
                    });
                }
                rows = rotate(rows);
            }
        }
        return shapes;
    }

    const SHAPES = buildShapes();
    const SHAPES_BY_ID = new Map(SHAPES.map((shape) => [shape.shapeId, shape]));

    function randomIndex(length, random) {
        const sample = random();
        if (!Number.isFinite(sample)) return 0;
        return Math.max(0, Math.min(length - 1, Math.floor(sample * length)));
    }

    function drawTray(random) {
        return Array.from({ length: TRAY_SIZE }, () => ({
            ...SHAPES[randomIndex(SHAPES.length, random)],
            color: randomIndex(COLOR_COUNT, random) + 1,
        }));
    }

    function createGame(random = Math.random) {
        return {
            board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
            tray: drawTray(random),
            score: 0,
            combo: 0,
            gameOver: false,
        };
    }

    function fits(board, piece, row, col) {
        return row >= 0 && col >= 0 && row + piece.height <= BOARD_SIZE && col + piece.width <= BOARD_SIZE
            && piece.cells.every(([rowOffset, colOffset]) => board[row + rowOffset][col + colOffset] === 0);
    }

    function canPlace(state, slot, row, col) {
        if (!state || state.gameOver || !Number.isInteger(slot) || !Number.isInteger(row) || !Number.isInteger(col)) return false;
        const piece = state.tray[slot];
        return Boolean(piece && fits(state.board, piece, row, col));
    }

    function hasMove(board, tray) {
        return tray.some((piece) => {
            if (!piece) return false;
            for (let row = 0; row <= BOARD_SIZE - piece.height; row += 1) {
                for (let col = 0; col <= BOARD_SIZE - piece.width; col += 1) {
                    if (fits(board, piece, row, col)) return true;
                }
            }
            return false;
        });
    }

    function completedLines(board) {
        const clearedRows = [];
        const clearedCols = [];
        for (let index = 0; index < BOARD_SIZE; index += 1) {
            if (board[index].every(Boolean)) clearedRows.push(index);
            if (board.every((row) => row[index] !== 0)) clearedCols.push(index);
        }
        return { clearedRows, clearedCols };
    }

    function placePiece(state, slot, row, col, random = Math.random) {
        if (!canPlace(state, slot, row, col)) return null;

        const piece = state.tray[slot];
        const board = state.board.map((boardRow) => boardRow.slice());
        const placedCells = piece.cells.map(([rowOffset, colOffset]) => [row + rowOffset, col + colOffset]);
        for (const [placedRow, placedCol] of placedCells) board[placedRow][placedCol] = piece.color;

        const { clearedRows, clearedCols } = completedLines(board);
        const lineCount = clearedRows.length + clearedCols.length;
        const clearedCells = [];
        if (lineCount) {
            for (let boardRow = 0; boardRow < BOARD_SIZE; boardRow += 1) {
                for (let boardCol = 0; boardCol < BOARD_SIZE; boardCol += 1) {
                    if (clearedRows.includes(boardRow) || clearedCols.includes(boardCol)) {
                        board[boardRow][boardCol] = 0;
                        clearedCells.push([boardRow, boardCol]);
                    }
                }
            }
        }

        const combo = lineCount ? state.combo + 1 : 0;
        const points = placedCells.length + lineCount * (SCORE_PER_LINE + Math.max(0, combo - 1) * COMBO_BONUS_PER_LINE);
        const remaining = state.tray.slice();
        remaining[slot] = null;
        const trayRefilled = remaining.every((entry) => entry === null);
        const tray = trayRefilled ? drawTray(random) : remaining;
        return {
            state: { board, tray, score: state.score + points, combo, gameOver: !hasMove(board, tray) },
            clearedRows,
            clearedCols,
            clearedCells,
            placedCells,
            points,
            trayRefilled,
        };
    }

    function serializeState(state) {
        return {
            version: SNAPSHOT_VERSION,
            board: state.board.map((row) => row.slice()),
            tray: state.tray.map((piece) => piece ? { shapeId: piece.shapeId, color: piece.color } : null),
            score: state.score,
            combo: state.combo,
        };
    }

    function isColor(value, minimum) {
        return Number.isInteger(value) && value >= minimum && value <= COLOR_COUNT;
    }

    function restoreState(snapshot) {
        if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return null;
        const { board: savedBoard, tray: savedTray, score, combo } = snapshot;
        if (!Array.isArray(savedBoard) || savedBoard.length !== BOARD_SIZE
            || !Array.isArray(savedTray) || savedTray.length !== TRAY_SIZE
            || !Number.isSafeInteger(score) || score < 0
            || !Number.isSafeInteger(combo) || combo < 0 || combo > Math.floor(score / (SCORE_PER_LINE + 1))) return null;

        const board = Array.from(savedBoard, (row) => Array.isArray(row) ? Array.from(row) : []);
        if (board.some((row) => row.length !== BOARD_SIZE || row.some((cell) => !isColor(cell, 0)))) return null;
        const { clearedRows, clearedCols } = completedLines(board);
        if (clearedRows.length || clearedCols.length) return null;

        const tray = Array.from(savedTray, (piece) => {
            if (piece === null) return null;
            const shape = SHAPES_BY_ID.get(piece?.shapeId);
            return shape && isColor(piece.color, 1) ? { ...shape, color: piece.color } : undefined;
        });
        if (tray.includes(undefined) || tray.every((piece) => piece === null)) return null;

        return { board, tray, score, combo, gameOver: !hasMove(board, tray) };
    }

    return Object.freeze({
        BOARD_SIZE,
        TRAY_SIZE,
        COLOR_COUNT,
        createGame,
        canPlace,
        placePiece,
        serializeState,
        restoreState,
    });
});
