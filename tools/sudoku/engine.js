(function initSudokuEngine(root, factory) {
    "use strict";

    const engine = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = engine;
    } else {
        root.OmniSudokuEngine = engine;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createSudokuEngine() {
    "use strict";

    const GRID_SIZE = 9;
    const BOX_SIZE = 3;
    const CELL_COUNT = GRID_SIZE * GRID_SIZE;
    const FULL_MASK = 0b1111111110;
    const DIFFICULTY_CLUES = Object.freeze({
        easy: 42,
        medium: 34,
        hard: 28,
    });

    function shuffle(values, random = Math.random) {
        const result = values.slice();

        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }

        return result;
    }

    function createSolvedGrid(random = Math.random) {
        const bands = shuffle([0, 1, 2], random);
        const stacks = shuffle([0, 1, 2], random);
        const rows = bands.flatMap((band) => shuffle([0, 1, 2], random).map((row) => band * BOX_SIZE + row));
        const columns = stacks.flatMap((stack) => shuffle([0, 1, 2], random).map((column) => stack * BOX_SIZE + column));
        const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);

        return rows.flatMap((row) => columns.map((column) => digits[(row * BOX_SIZE + Math.floor(row / BOX_SIZE) + column) % GRID_SIZE]));
    }

    function getCandidateMask(grid, index) {
        const row = Math.floor(index / GRID_SIZE);
        const column = index % GRID_SIZE;
        const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
        const boxColumn = Math.floor(column / BOX_SIZE) * BOX_SIZE;
        let usedMask = 0;

        for (let offset = 0; offset < GRID_SIZE; offset += 1) {
            usedMask |= 1 << grid[row * GRID_SIZE + offset];
            usedMask |= 1 << grid[offset * GRID_SIZE + column];
        }

        for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
            for (let columnOffset = 0; columnOffset < BOX_SIZE; columnOffset += 1) {
                usedMask |= 1 << grid[(boxRow + rowOffset) * GRID_SIZE + boxColumn + columnOffset];
            }
        }

        return FULL_MASK & ~usedMask;
    }

    function findBestEmptyCell(grid) {
        let bestIndex = -1;
        let bestMask = 0;
        let bestCount = GRID_SIZE + 1;

        for (let index = 0; index < CELL_COUNT; index += 1) {
            if (grid[index] !== 0) continue;

            const mask = getCandidateMask(grid, index);
            const count = countBits(mask);

            if (count === 0) return { index, mask, count };
            if (count < bestCount) {
                bestIndex = index;
                bestMask = mask;
                bestCount = count;
                if (count === 1) break;
            }
        }

        return { index: bestIndex, mask: bestMask, count: bestCount };
    }

    function countBits(value) {
        let count = 0;
        let remaining = value;

        while (remaining) {
            remaining &= remaining - 1;
            count += 1;
        }

        return count;
    }

    function maskToDigits(mask) {
        const digits = [];

        for (let digit = 1; digit <= GRID_SIZE; digit += 1) {
            if (mask & (1 << digit)) digits.push(digit);
        }

        return digits;
    }

    function countSolutions(inputGrid, limit = 2) {
        if (!isGridShapeValid(inputGrid)) return 0;

        const grid = inputGrid.slice();
        let solutions = 0;

        function search() {
            if (solutions >= limit) return;

            const next = findBestEmptyCell(grid);
            if (next.index === -1) {
                solutions += 1;
                return;
            }
            if (next.count === 0) return;

            for (const digit of maskToDigits(next.mask)) {
                grid[next.index] = digit;
                search();
                grid[next.index] = 0;
                if (solutions >= limit) return;
            }
        }

        search();
        return solutions;
    }

    function solve(inputGrid) {
        if (!isGridShapeValid(inputGrid)) return null;

        const grid = inputGrid.slice();

        function search() {
            const next = findBestEmptyCell(grid);
            if (next.index === -1) return true;
            if (next.count === 0) return false;

            for (const digit of maskToDigits(next.mask)) {
                grid[next.index] = digit;
                if (search()) return true;
                grid[next.index] = 0;
            }

            return false;
        }

        return search() ? grid : null;
    }

    function generatePuzzle(difficulty = "medium", random = Math.random) {
        const targetClues = DIFFICULTY_CLUES[difficulty] || DIFFICULTY_CLUES.medium;
        let closestResult = null;

        for (let attempt = 0; attempt < 16; attempt += 1) {
            const solution = createSolvedGrid(random);
            const puzzle = solution.slice();
            const removalOrder = shuffle(Array.from({ length: CELL_COUNT }, (_, index) => index), random);
            let clueCount = CELL_COUNT;

            for (const index of removalOrder) {
                if (clueCount <= targetClues) break;

                const value = puzzle[index];
                puzzle[index] = 0;

                if (countSolutions(puzzle, 2) === 1) {
                    clueCount -= 1;
                } else {
                    puzzle[index] = value;
                }
            }

            if (!closestResult || clueCount < closestResult.clueCount) {
                closestResult = { puzzle, solution, clueCount, difficulty };
            }

            if (clueCount === targetClues) return closestResult;
        }

        return closestResult;
    }

    function isGridShapeValid(grid) {
        return Array.isArray(grid)
            && grid.length === CELL_COUNT
            && grid.every((value) => Number.isInteger(value) && value >= 0 && value <= GRID_SIZE);
    }

    function isSolvedGridValid(grid) {
        if (!isGridShapeValid(grid) || grid.some((value) => value === 0)) return false;
        const expected = "123456789";

        for (let index = 0; index < GRID_SIZE; index += 1) {
            const row = grid.slice(index * GRID_SIZE, index * GRID_SIZE + GRID_SIZE).sort().join("");
            const column = Array.from({ length: GRID_SIZE }, (_, rowIndex) => grid[rowIndex * GRID_SIZE + index]).sort().join("");
            if (row !== expected || column !== expected) return false;
        }

        for (let boxRow = 0; boxRow < BOX_SIZE; boxRow += 1) {
            for (let boxColumn = 0; boxColumn < BOX_SIZE; boxColumn += 1) {
                const values = [];
                for (let row = 0; row < BOX_SIZE; row += 1) {
                    for (let column = 0; column < BOX_SIZE; column += 1) {
                        values.push(grid[(boxRow * BOX_SIZE + row) * GRID_SIZE + boxColumn * BOX_SIZE + column]);
                    }
                }
                if (values.sort().join("") !== expected) return false;
            }
        }

        return true;
    }

    return Object.freeze({
        CELL_COUNT,
        DIFFICULTY_CLUES,
        countSolutions,
        createSolvedGrid,
        generatePuzzle,
        isGridShapeValid,
        isSolvedGridValid,
        solve,
    });
});
