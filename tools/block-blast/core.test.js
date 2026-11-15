"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("./core.js");

function fixture(tray, updateBoard = () => {}) {
    const saved = core.serializeState(core.createGame(() => 0));
    saved.tray = tray.map((shapeId) => shapeId ? { shapeId, color: 3 } : null);
    updateBoard(saved.board);
    const state = core.restoreState(saved);
    assert.ok(state);
    return state;
}

function checkerboard(board) {
    board.forEach((row, rowIndex) => {
        row.forEach((_, colIndex) => {
            row[colIndex] = (rowIndex + colIndex) % 2 ? 2 : 0;
        });
    });
}

test("starts on an empty 8×8 board with three random pieces", () => {
    const samples = [0, 0, 0.35, 0.4, 0.99, 0.99];
    const state = core.createGame(() => samples.shift());
    assert.equal(state.board.length, 8);
    assert.ok(state.board.every((row) => row.length === 8 && row.every((cell) => cell === 0)));
    assert.equal(new Set(state.board).size, 8);
    assert.equal(state.tray.length, 3);
    assert.equal(new Set(state.tray.map((piece) => piece.shapeId)).size, 3);
    assert.deepEqual(state.tray.map((piece) => piece.color), [1, 3, 6]);
    assert.deepEqual({ score: state.score, combo: state.combo, gameOver: state.gameOver }, { score: 0, combo: 0, gameOver: false });
    assert.equal(samples.length, 0);
});

test("the draw catalog includes shape orientations and canonical cell coordinates", () => {
    const shapes = new Map();
    for (let step = 0; step < 200; step += 1) {
        const [piece] = core.createGame(() => step / 200).tray;
        shapes.set(piece.shapeId, piece);
    }
    assert.ok(shapes.size > 20);
    assert.deepEqual(shapes.get("line5-0").cells, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    assert.deepEqual(shapes.get("line5-1").cells, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    assert.notDeepEqual(shapes.get("leftHook-0").cells, shapes.get("rightHook-0").cells);

    for (const piece of shapes.values()) {
        assert.equal(piece.width, 1 + Math.max(...piece.cells.map(([, col]) => col)));
        assert.equal(piece.height, 1 + Math.max(...piece.cells.map(([row]) => row)));
        assert.equal(new Set(piece.cells.map(String)).size, piece.cells.length);
    }
});

test("placement respects occupied cells and bounds without mutating the game", () => {
    const game = fixture(["corner-0", null, "single-0"], (board) => { board[1][1] = 4; });
    const before = core.serializeState(game);
    assert.equal(core.canPlace(game, 0, 0, 0), true, "a filled square in the unoccupied corner may be crossed");
    for (const input of [[0, 0, 1], [0, 1, 1], [0, 7, 7], [0, -1, 0], [0, 0.5, 0], [1, 0, 0], [3, 0, 0]]) {
        assert.equal(core.canPlace(game, ...input), false);
        assert.equal(core.placePiece(game, ...input), null);
    }
    assert.deepEqual(core.serializeState(game), before);

    const result = core.placePiece(game, 0, 0, 0);
    assert.deepEqual(result.placedCells, [[0, 0], [0, 1], [1, 0]]);
    assert.deepEqual(result.state.board.slice(0, 2).map((row) => row.slice(0, 2)), [[3, 3], [3, 4]]);
    assert.equal(result.points, 3);
    assert.equal(result.state.score, 3);
    assert.deepEqual(core.serializeState(game), before);
});

test("crossing row and column both clear from the same post-placement board", () => {
    const game = fixture(["single-0", "domino-0", "single-0"], (board) => {
        board[4].fill(2);
        board.forEach((row) => { row[3] = 2; });
        board[4][3] = 0;
        board[1][1] = 5;
    });
    const result = core.placePiece(game, 0, 4, 3);
    assert.deepEqual(result.clearedRows, [4]);
    assert.deepEqual(result.clearedCols, [3]);
    assert.equal(result.clearedCells.length, 15);
    assert.equal(new Set(result.clearedCells.map(String)).size, 15);
    assert.equal(result.points, 21);
    assert.equal(result.state.combo, 1);
    assert.equal(result.state.board[1][1], 5);
    assert.equal(result.state.board.flat().filter(Boolean).length, 1);
});

test("combo bonuses reward consecutive clears and reset after a placement without a clear", () => {
    let state = fixture(["single-0", "single-0", "single-0"], (board) => {
        for (let row = 0; row < 3; row += 1) {
            board[row].fill(2);
            board[row][row] = 0;
        }
    });
    for (const [slot, row, col, points, combo] of [[0, 0, 0, 11, 1], [1, 1, 1, 16, 2], [2, 5, 5, 1, 0], [0, 2, 2, 11, 1]]) {
        const result = core.placePiece(state, slot, row, col, () => 0);
        assert.equal(result.points, points);
        assert.equal(result.state.combo, combo);
        state = result.state;
    }
    assert.equal(state.score, 39);
});

test("each tray preserves used slots and only draws after the last slot is played", () => {
    let calls = 0;
    const random = () => { calls += 1; return 0.99; };
    const start = core.createGame(() => 0);
    const first = core.placePiece(start, 2, 0, 0, random);
    assert.deepEqual(first.state.tray, [...start.tray.slice(0, 2), null]);
    assert.equal(first.trayRefilled, false);

    const second = core.placePiece(first.state, 0, 1, 0, random);
    assert.deepEqual(second.state.tray, [null, start.tray[1], null]);
    assert.equal(second.trayRefilled, false);
    assert.equal(calls, 0);

    const last = core.placePiece(second.state, 1, 2, 0, random);
    assert.equal(last.trayRefilled, true);
    assert.equal(calls, 6);
    assert.deepEqual(last.state.tray, core.createGame(() => 0.99).tray);
});

test("game over requires that every remaining piece has no fit anywhere", () => {
    const state = fixture(["domino-0", "single-0", "domino-1"], checkerboard);
    assert.equal(state.gameOver, false);
    assert.equal(core.canPlace(state, 0, 0, 0), false);
    assert.equal(core.canPlace(state, 1, 0, 0), true);
    const result = core.placePiece(state, 1, 0, 0);
    assert.equal(result.trayRefilled, false);
    assert.equal(result.state.gameOver, true);
    assert.ok(result.state.board.flat().includes(0));
    assert.equal(core.placePiece(result.state, 2, 3, 3), null);
    assert.deepEqual(core.restoreState(core.serializeState(result.state)), result.state);
});

test("a finished tray checks for legal moves after drawing the replacement batch", () => {
    const state = fixture([null, "single-0", null], checkerboard);
    const playable = core.placePiece(state, 1, 0, 0, () => 0);
    assert.equal(playable.trayRefilled, true);
    assert.equal(playable.state.gameOver, false);
    assert.equal(core.canPlace(playable.state, 0, 0, 2), true);

    const blocked = core.placePiece(state, 1, 0, 0, () => 0.99);
    assert.equal(blocked.trayRefilled, true);
    assert.equal(blocked.state.gameOver, true);
});

test("an in-progress JSON snapshot restores colors, slots, score, and combo", () => {
    const start = fixture(["single-0", "rightHook-1", "line5-1"], (board) => {
        board[0].fill(4);
        board[0][0] = 0;
        board[3][3] = 5;
    });
    const { state } = core.placePiece(start, 0, 0, 0);
    const snapshot = JSON.parse(JSON.stringify(core.serializeState(state)));
    const restored = core.restoreState(snapshot);
    assert.deepEqual(restored, state);
    assert.notEqual(restored.board[3], snapshot.board[3]);
    assert.deepEqual(core.placePiece(restored, 1, 1, 5), core.placePiece(state, 1, 1, 5));
});

test("invalid saved dimensions, cells, pieces and unfinished clear states are rejected", () => {
    const invalidSnapshots = [
        (saved) => { saved.version = 999; },
        (saved) => { saved.board.pop(); },
        (saved) => { delete saved.board[4][4]; },
        (saved) => { saved.board[0][0] = 7; },
        (saved) => { saved.board[0].fill(1); },
        (saved) => { saved.tray.pop(); },
        (saved) => { saved.tray.fill(null); },
        (saved) => { saved.tray[0].shapeId = "missing"; },
        (saved) => { saved.tray[0].color = 0; },
        (saved) => { saved.score = -1; },
        (saved) => { saved.combo = 1; },
    ];
    for (const invalidate of invalidSnapshots) {
        const saved = core.serializeState(core.createGame(() => 0));
        invalidate(saved);
        assert.equal(core.restoreState(saved), null);
    }
});
