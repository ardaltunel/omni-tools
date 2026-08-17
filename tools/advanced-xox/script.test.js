"use strict";

const assert = require("node:assert/strict");
const {
    chooseXoxBotMove,
    chooseXoxHardMove,
    getXoxPositionVariation,
    pickXoxMoveCandidate,
    simulateXoxMove,
} = require("./script.js");

const state = (board, queues) => ({ board, queues });

assert.equal(
    chooseXoxHardMove(state(["O", "O", "", "X", "X", "", "", "", ""], { X: [3, 4], O: [0, 1] })),
    2,
    "Zor mod, mümkün olan anlık galibiyeti almalıdır."
);

const playerCanWinNextMove = state(
    ["X", "X", "", "", "O", "", "", "", ""],
    { X: [0, 1], O: [4] }
);
assert.equal(
    chooseXoxBotMove(playerCanWinNextMove, "easy", 0, () => 0.99),
    8,
    "Kolay mod, yüksek rastgelelikte anlık tehdidi kaçırabilmelidir."
);
assert.notEqual(
    chooseXoxBotMove(playerCanWinNextMove, "normal", 0, () => 0.99),
    2,
    "Normal mod, bazen anlık tehdidi kaçırarak zor moddan ayrışmalıdır."
);
assert.equal(
    chooseXoxBotMove(playerCanWinNextMove, "hard", 0, () => 0.99),
    2,
    "Zor mod, anlık galibiyet tehdidini her zaman kapatmalıdır."
);

assert.equal(
    chooseXoxHardMove(state(["X", "X", "", "O", "", "", "", "", ""], { X: [0, 1], O: [3] })),
    2,
    "Zor mod, oyuncunun anlık galibiyetini engellemelidir."
);

assert.equal(pickXoxMoveCandidate([0, 2, 6, 8], 0), 0);
assert.equal(pickXoxMoveCandidate([0, 2, 6, 8], 1), 2);
assert.equal(pickXoxMoveCandidate([0, 2, 6, 8], 2), 6);
assert.notEqual(
    getXoxPositionVariation(
        state(["", "", "", "", "X", "", "", "", ""], { X: [4], O: [] }),
        12
    ),
    getXoxPositionVariation(
        state(["", "", "X", "", "", "", "", "", ""], { X: [2], O: [] }),
        12
    ),
    "Hamle çeşitliliği yalnızca tur numarasına değil, oyun konumuna da bağlı olmalıdır."
);

const expiredState = simulateXoxMove(
    state(["O", "", "X", "O", "O", "", "", "", "X"], { X: [2, 8], O: [0, 3, 4] }),
    5,
    "O"
);
assert.equal(expiredState.winner, "O", "Dördüncü taşın en eskisi silinmeden önce galibiyet kontrol edilmelidir.");
