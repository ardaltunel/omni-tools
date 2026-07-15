const game2048Board = document.getElementById("game-2048-board");
const game2048Score = document.getElementById("game-2048-score");
const game2048Best = document.getElementById("game-2048-best");
const game2048Moves = document.getElementById("game-2048-moves");
const game2048Status = document.getElementById("game-2048-status");
const game2048Message = document.getElementById("game-2048-message");
const game2048New = document.getElementById("game-2048-new");

const game2048State = {
    size: 4,
    grid: [],
    score: 0,
    best: Number(localStorage.getItem("omni-2048-best") || 0),
    moves: 0,
    won: false,
    over: false,
    swipeStartX: 0,
    swipeStartY: 0,
};

function initGame2048() {
    if (!game2048Board) return;
    game2048New.addEventListener("click", startGame2048);
    document.addEventListener("keydown", handleGame2048Keyboard);
    game2048Board.addEventListener("pointerdown", handleGame2048PointerStart);
    game2048Board.addEventListener("pointerup", handleGame2048PointerEnd);
    startGame2048();
}

function startGame2048() {
    game2048State.grid = createGame2048Grid();
    game2048State.score = 0;
    game2048State.moves = 0;
    game2048State.won = false;
    game2048State.over = false;
    addGame2048Tile();
    addGame2048Tile();
    updateGame2048Status("Hazır", "Ok tuşlarıyla veya mobilde kaydırarak oynayabilirsin.");
    renderGame2048();
    game2048Board.focus({ preventScroll: true });
}

function createGame2048Grid() {
    return Array.from({ length: game2048State.size }, () => Array(game2048State.size).fill(0));
}

function addGame2048Tile() {
    const emptyCells = [];
    game2048State.grid.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (!value) emptyCells.push({ rowIndex, columnIndex });
        });
    });

    if (!emptyCells.length) return;
    const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    game2048State.grid[cell.rowIndex][cell.columnIndex] = Math.random() < 0.9 ? 2 : 4;
}

function renderGame2048() {
    game2048Score.textContent = game2048State.score;
    game2048Best.textContent = game2048State.best;
    game2048Moves.textContent = game2048State.moves;
    game2048Board.innerHTML = game2048State.grid.map((row) => (
        row.map((value) => {
            const label = value ? value : "";
            return `<div class="game-2048-cell tile-${value || "empty"}">${label}</div>`;
        }).join("")
    )).join("");
}

function handleGame2048Keyboard(event) {
    const activePanel = document.querySelector(".tool-panel.active");
    if (activePanel?.id !== "game-2048") return;

    const directions = {
        ArrowUp: "up",
        ArrowRight: "right",
        ArrowDown: "down",
        ArrowLeft: "left",
    };

    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    moveGame2048(direction);
}

function handleGame2048PointerStart(event) {
    game2048State.swipeStartX = event.clientX;
    game2048State.swipeStartY = event.clientY;
}

function handleGame2048PointerEnd(event) {
    const deltaX = event.clientX - game2048State.swipeStartX;
    const deltaY = event.clientY - game2048State.swipeStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (Math.max(absX, absY) < 28) return;
    moveGame2048(absX > absY ? (deltaX > 0 ? "right" : "left") : (deltaY > 0 ? "down" : "up"));
}

function moveGame2048(direction) {
    if (game2048State.over) return;

    const before = serializeGame2048Grid(game2048State.grid);
    const result = slideGame2048Grid(game2048State.grid, direction);
    if (serializeGame2048Grid(result.grid) === before) return;

    game2048State.grid = result.grid;
    game2048State.score += result.scoreGain;
    game2048State.moves += 1;
    game2048State.best = Math.max(game2048State.best, game2048State.score);
    localStorage.setItem("omni-2048-best", String(game2048State.best));
    addGame2048Tile();
    evaluateGame2048State();
    renderGame2048();
}

function slideGame2048Grid(grid, direction) {
    const nextGrid = createGame2048Grid();
    let scoreGain = 0;

    for (let index = 0; index < game2048State.size; index += 1) {
        const line = getGame2048Line(grid, direction, index);
        const merged = mergeGame2048Line(line);
        scoreGain += merged.scoreGain;
        setGame2048Line(nextGrid, direction, index, merged.values);
    }

    return { grid: nextGrid, scoreGain };
}

function getGame2048Line(grid, direction, index) {
    if (direction === "left") return grid[index];
    if (direction === "right") return [...grid[index]].reverse();
    if (direction === "up") return grid.map((row) => row[index]);
    return grid.map((row) => row[index]).reverse();
}

function setGame2048Line(grid, direction, index, values) {
    const line = direction === "right" || direction === "down" ? [...values].reverse() : values;
    for (let position = 0; position < game2048State.size; position += 1) {
        if (direction === "left" || direction === "right") {
            grid[index][position] = line[position];
        } else {
            grid[position][index] = line[position];
        }
    }
}

function mergeGame2048Line(line) {
    const compact = line.filter(Boolean);
    const values = [];
    let scoreGain = 0;

    for (let index = 0; index < compact.length; index += 1) {
        if (compact[index] === compact[index + 1]) {
            const mergedValue = compact[index] * 2;
            values.push(mergedValue);
            scoreGain += mergedValue;
            index += 1;
        } else {
            values.push(compact[index]);
        }
    }

    while (values.length < game2048State.size) values.push(0);
    return { values, scoreGain };
}

function evaluateGame2048State() {
    const has2048 = game2048State.grid.some((row) => row.includes(2048));
    if (has2048 && !game2048State.won) {
        game2048State.won = true;
        updateGame2048Status("Kazandın", "2048 taşına ulaştın. İstersen daha yüksek skor için devam edebilirsin.");
        return;
    }

    if (!canMoveGame2048()) {
        game2048State.over = true;
        updateGame2048Status("Oyun Bitti", "Hamle kalmadı. Yeni bir tur başlatabilirsin.");
        return;
    }

    if (!game2048State.won) {
        updateGame2048Status("Oyun sürüyor", "Birleşebilecek taşları aynı yöne kaydır.");
    }
}

function canMoveGame2048() {
    for (let row = 0; row < game2048State.size; row += 1) {
        for (let column = 0; column < game2048State.size; column += 1) {
            const value = game2048State.grid[row][column];
            if (!value) return true;
            if (game2048State.grid[row][column + 1] === value) return true;
            if (game2048State.grid[row + 1]?.[column] === value) return true;
        }
    }
    return false;
}

function serializeGame2048Grid(grid) {
    return grid.map((row) => row.join(",")).join("|");
}

function updateGame2048Status(status, message) {
    game2048Status.textContent = status;
    game2048Message.textContent = message;
}

initGame2048();
