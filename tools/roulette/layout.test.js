"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");
const { createLayout, hitTest, JUNCTION_SIZE } = require("./layout.js");

const orientations = ["landscape", "portrait"];
const almostEqual = (actual, expected, label = "") => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);
const mapSpots = (layout) => new Map(layout.spots.map((spot) => [spot.id, spot]));

test("both tables expose every canonical wager exactly once with unique target centers", () => {
    const ids = core.BET_DEFINITIONS.map(({ id }) => id).sort();
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        assert.equal(layout.spots.length, 157);
        assert.deepEqual(layout.spots.map(({ id }) => id).sort(), ids);
        assert.equal(new Set(layout.spots.map(({ id }) => id)).size, 157);
        assert.equal(new Set(layout.spots.map(({ x, y }) => `${x.toFixed(9)},${y.toFixed(9)}`)).size, 157);
        assert.equal(layout.spots.filter(({ kind }) => kind === "cell").length, 49);
        assert.equal(layout.spots.filter(({ kind }) => kind === "junction").length, 108);
        for (const spot of layout.spots) {
            assert.equal(hitTest(layout, spot.x, spot.y)?.id, spot.id);
            assert.deepEqual(spot.numbers, core.getBet(spot.id).numbers);
            assert.ok(spot.label.length && spot.shortLabel.length, spot.id);
        }
    }
});

test("table bounds contain all cell and junction targets at their recommended aspect ratios", () => {
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        almostEqual(layout.aspectRatio, layout.width * layout.unitWidth / (layout.height * layout.unitHeight));
        assert.equal(Object.isFrozen(layout), true);
        assert.equal(Object.isFrozen(layout.spots), true);
        for (const spot of layout.spots) {
            assert.equal(Object.isFrozen(spot), true);
            assert.ok(spot.width > 0 && spot.height > 0, spot.id);
            assert.ok(spot.x - spot.width / 2 >= -1e-9, `${spot.id} left`);
            assert.ok(spot.y - spot.height / 2 >= -1e-9, `${spot.id} top`);
            assert.ok(spot.x + spot.width / 2 <= layout.width + 1e-9, `${spot.id} right`);
            assert.ok(spot.y + spot.height / 2 <= layout.height + 1e-9, `${spot.id} bottom`);
            if (spot.kind === "junction") {
                almostEqual(spot.width * layout.unitWidth, JUNCTION_SIZE);
                almostEqual(spot.height * layout.unitHeight, JUNCTION_SIZE);
            }
        }
    }
    assert.deepEqual([createLayout("portrait").width, createLayout("portrait").height], [3.6, 17]);
    assert.deepEqual([createLayout().width, createLayout().height], [14, 5.6]);
});

test("individual cells and the 108 junction hit rectangles have no peer overlap", () => {
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        for (const kind of ["cell", "junction"]) {
            const spots = layout.spots.filter((spot) => spot.kind === kind);
            for (let first = 0; first < spots.length; first += 1) {
                for (let second = first + 1; second < spots.length; second += 1) {
                    const a = spots[first];
                    const b = spots[second];
                    const overlapsX = Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-9;
                    const overlapsY = Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-9;
                    assert.equal(overlapsX && overlapsY, false, `${orientation}: ${a.id} overlaps ${b.id}`);
                    if (kind === "junction") {
                        const separation = Math.hypot((a.x - b.x) * layout.unitWidth, (a.y - b.y) * layout.unitHeight);
                        assert.ok(separation >= 22 - 1e-9, `${orientation}: targets too close ${a.id} / ${b.id}`);
                    }
                }
            }
        }
    }
});

test("the 57 nonzero split wagers sit between actual neighboring number cells in either orientation", () => {
    const splits = core.BET_DEFINITIONS.filter(({ type, numbers }) => type === "split" && !numbers.includes(0));
    assert.equal(splits.length, 57);
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        const spots = mapSpots(layout);
        for (const bet of splits) {
            const [first, second] = bet.numbers;
            assert.ok(second - first === 3 || (second - first === 1 && Math.floor((first - 1) / 3) === Math.floor((second - 1) / 3)));
            const a = spots.get(`straight:${first}`);
            const b = spots.get(`straight:${second}`);
            const split = spots.get(bet.id);
            almostEqual(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, bet.id);
            almostEqual(split.x, (a.x + b.x) / 2, bet.id);
            almostEqual(split.y, (a.y + b.y) / 2, bet.id);
        }
    }
});

test("all 22 corner wagers occupy the shared corner of their four cells", () => {
    const corners = core.BET_DEFINITIONS.filter(({ type }) => type === "corner");
    assert.equal(corners.length, 22);
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        const spots = mapSpots(layout);
        for (const bet of corners) {
            const cells = bet.numbers.map((number) => spots.get(`straight:${number}`));
            const xs = [...new Set(cells.map(({ x }) => x))].sort((a, b) => a - b);
            const ys = [...new Set(cells.map(({ y }) => y))].sort((a, b) => a - b);
            assert.equal(xs.length, 2);
            assert.equal(ys.length, 2);
            almostEqual(xs[1] - xs[0], 1);
            almostEqual(ys[1] - ys[0], 1);
            almostEqual(spots.get(bet.id).x, (xs[0] + xs[1]) / 2);
            almostEqual(spots.get(bet.id).y, (ys[0] + ys[1]) / 2);
        }
    }
});

test("all zero splits, trios and the first four retain distinct boundary targets", () => {
    const zeroTargets = [
        ["split:0-1", 1.1, 1, 1, 2.5],
        ["split:0-2", 2.1, 1, 1, 1.5],
        ["split:0-3", 3.1, 1, 1, 0.5],
        ["trio:0-1-2", 1.6, 1, 1, 2],
        ["trio:0-2-3", 2.6, 1, 1, 1],
        ["firstfour:0-1-2-3", 0.6, 1, 1, 3],
    ];
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        const spots = mapSpots(layout);
        for (const [id, portraitX, portraitY, landscapeX, landscapeY] of zeroTargets) {
            const spot = spots.get(id);
            almostEqual(spot.x, orientation === "portrait" ? portraitX : landscapeX);
            almostEqual(spot.y, orientation === "portrait" ? portraitY : landscapeY);
            assert.equal(hitTest(layout, spot.x, spot.y).id, id);
        }
    }
});

test("street and six-line targets use the side rail while outside cells preserve number coverage", () => {
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        const spots = mapSpots(layout);
        const rail = core.BET_DEFINITIONS.filter(({ type }) => type === "street" || type === "sixline");
        assert.equal(rail.length, 23);
        for (const bet of rail) {
            const children = bet.numbers.map((number) => spots.get(`straight:${number}`));
            const spot = spots.get(bet.id);
            if (orientation === "portrait") {
                almostEqual(spot.x, 0.3);
                almostEqual(spot.y, children.reduce((sum, child) => sum + child.y, 0) / children.length);
            } else {
                almostEqual(spot.y, 3.3);
                almostEqual(spot.x, children.reduce((sum, child) => sum + child.x, 0) / children.length);
            }
        }
        for (let column = 1; column <= 3; column += 1) {
            const bet = core.getBet(`column:${column}`);
            const spot = spots.get(bet.id);
            for (const number of bet.numbers) {
                const cell = spots.get(`straight:${number}`);
                almostEqual(orientation === "portrait" ? spot.x : spot.y, orientation === "portrait" ? cell.x : cell.y);
            }
        }
        assert.equal(spots.get("red").color, "red");
        assert.equal(spots.get("black").color, "black");
        assert.equal(spots.get("straight:0").color, "green");
    }
});

test("hit testing favors the actual circular junction and falls through its rectangle corners", () => {
    for (const orientation of orientations) {
        const layout = createLayout(orientation);
        const corner = mapSpots(layout).get("corner:1-2-4-5");
        assert.equal(hitTest(layout, corner.x, corner.y).id, corner.id);
        assert.equal(hitTest(layout, corner.x + corner.width * 0.3, corner.y).id, corner.id);
        const outsideCircle = hitTest(layout, corner.x + corner.width * 0.49, corner.y + corner.height * 0.49);
        assert.equal(outsideCircle.kind, "cell");
        assert.notEqual(outsideCircle.id, corner.id);
        for (const [x, y] of [[-0.01, 1], [1, -0.01], [layout.width + 0.01, 1], [1, layout.height + 0.01], [NaN, 1], [1, Infinity]]) {
            assert.equal(hitTest(layout, x, y), null);
        }
        assert.equal(hitTest(layout, 0.05, layout.height - 0.05), null);
    }
});

test("responsive pixel-to-logical mapping selects all target centers at actual table sizes", () => {
    for (const [orientation, widths] of [["portrait", [239, 262, 332, 560]], ["landscape", [600, 650, 960, 1400]]]) {
        const layout = createLayout(orientation);
        for (const width of widths) {
            const height = width / layout.aspectRatio;
            const bounds = { left: 18, top: 94, width, height };
            for (const spot of layout.spots) {
                const clientX = bounds.left + spot.x / layout.width * width;
                const clientY = bounds.top + spot.y / layout.height * height;
                const mapped = hitTest(layout, (clientX - bounds.left) / bounds.width * layout.width, (clientY - bounds.top) / bounds.height * layout.height);
                assert.equal(mapped?.id, spot.id, `${orientation}/${width}: ${spot.id}`);
            }
        }
    }
    assert.throws(() => createLayout("diagonal"), RangeError);
});
