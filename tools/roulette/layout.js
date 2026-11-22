(function exposeRouletteLayout(root, factory) {
    "use strict";
    const core = typeof module === "object" && module.exports ? require("./core.js") : root.OmniRouletteCore;
    const layout = factory(core);
    if (typeof module === "object" && module.exports) module.exports = layout;
    else root.OmniRouletteLayout = layout;
})(typeof globalThis === "undefined" ? window : globalThis, function rouletteLayoutFactory(core) {
    "use strict";

    const STREET_RAIL = 0.6;
    const JUNCTION_SIZE = 20;
    const OUTSIDE_ORDER = ["low", "even", "red", "black", "odd", "high"];
    const TYPE_LABELS = Object.freeze({
        straight: "Tek sayı", split: "İkili", street: "Üçlü sıra", corner: "Dörtlü köşe",
        sixline: "Altılı sıra", trio: "Sıfırlı üçlü", firstfour: "İlk dört",
        dozen: "Düzine", column: "Sütun",
    });

    function numberCenter(number, portrait) {
        const street = Math.floor((number - 1) / 3);
        const column = (number - 1) % 3;
        return portrait
            ? { x: STREET_RAIL + column + 0.5, y: street + 1.5 }
            : { x: street + 1.5, y: 2.5 - column };
    }

    function meanCenter(numbers, portrait) {
        const positions = numbers.map((number) => numberCenter(number, portrait));
        return {
            x: positions.reduce((sum, point) => sum + point.x, 0) / positions.length,
            y: positions.reduce((sum, point) => sum + point.y, 0) / positions.length,
        };
    }

    function cellPosition(bet, portrait) {
        if (bet.type === "straight") {
            if (bet.numbers[0] !== 0) return { ...numberCenter(bet.numbers[0], portrait), width: 1, height: 1 };
            return portrait
                ? { x: STREET_RAIL + 1.5, y: 0.5, width: 3, height: 1 }
                : { x: 0.5, y: 1.5, width: 1, height: 3 };
        }
        const group = Number(bet.id.split(":")[1]) - 1;
        if (bet.type === "column") {
            return portrait
                ? { x: STREET_RAIL + group + 0.5, y: 13.5, width: 1, height: 1 }
                : { x: 13.5, y: 2.5 - group, width: 1, height: 1 };
        }
        if (bet.type === "dozen") {
            return portrait
                ? { x: STREET_RAIL + group + 0.5, y: 14.5, width: 1, height: 1 }
                : { x: group * 4 + 3, y: 4.1, width: 4, height: 1 };
        }
        const outside = OUTSIDE_ORDER.indexOf(bet.id);
        return portrait
            ? { x: STREET_RAIL + outside % 3 + 0.5, y: 15.5 + Math.floor(outside / 3), width: 1, height: 1 }
            : { x: outside * 2 + 2, y: 5.1, width: 2, height: 1 };
    }

    function junctionPosition(bet, portrait) {
        if (bet.type === "firstfour") return portrait ? { x: STREET_RAIL, y: 1 } : { x: 1, y: 3 };
        if (bet.numbers.includes(0)) {
            const center = meanCenter(bet.numbers.filter((number) => number !== 0), portrait);
            return portrait ? { x: center.x, y: 1 } : { x: 1, y: center.y };
        }
        const center = meanCenter(bet.numbers, portrait);
        if (bet.type === "street" || bet.type === "sixline") {
            return portrait ? { x: STREET_RAIL / 2, y: center.y } : { x: center.x, y: 3 + STREET_RAIL / 2 };
        }
        return center;
    }

    function shortLabel(bet, kind) {
        if (kind === "junction") return String(bet.numbers.length);
        if (bet.type === "straight") return String(bet.numbers[0]);
        if (bet.type === "column") return "2:1";
        if (bet.type === "dozen") return `${bet.numbers[0]}–${bet.numbers.at(-1)}`;
        return bet.label;
    }

    function createLayout(orientation = "landscape") {
        if (!["landscape", "portrait"].includes(orientation)) throw new RangeError("Geçerli bir rulet masa yönü gerekli.");
        const portrait = orientation === "portrait";
        const width = portrait ? 3.6 : 14;
        const height = portrait ? 17 : 5.6;
        const unitWidth = portrait ? 70 : 44;
        const unitHeight = portrait ? 44 : 48;
        const spots = core.BET_DEFINITIONS.map((bet) => {
            const kind = ["straight", "column", "dozen"].includes(bet.type) || OUTSIDE_ORDER.includes(bet.id) ? "cell" : "junction";
            const position = kind === "cell" ? cellPosition(bet, portrait) : junctionPosition(bet, portrait);
            return Object.freeze({
                id: bet.id,
                type: bet.type,
                kind,
                ...position,
                width: kind === "junction" ? JUNCTION_SIZE / unitWidth : position.width,
                height: kind === "junction" ? JUNCTION_SIZE / unitHeight : position.height,
                label: TYPE_LABELS[bet.type] ? `${TYPE_LABELS[bet.type]} · ${bet.label}` : bet.label,
                shortLabel: shortLabel(bet, kind),
                color: bet.type === "straight" ? core.getColor(bet.numbers[0]) : ["red", "black"].includes(bet.id) ? bet.id : null,
                numbers: bet.numbers,
            });
        });
        return Object.freeze({
            orientation, width, height, unitWidth, unitHeight,
            aspectRatio: width * unitWidth / (height * unitHeight),
            spots: Object.freeze(spots),
        });
    }

    function hitTest(layout, x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > layout.width || y > layout.height) return null;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const spot of layout.spots) {
            if (spot.kind !== "junction") continue;
            const dx = (x - spot.x) / (spot.width / 2);
            const dy = (y - spot.y) / (spot.height / 2);
            const distance = dx * dx + dy * dy;
            if (distance <= 1 + 1e-10 && distance < nearestDistance) {
                nearest = spot;
                nearestDistance = distance;
            }
        }
        if (nearest) return nearest;
        return layout.spots.find((spot) => spot.kind === "cell"
            && Math.abs(x - spot.x) <= spot.width / 2 + 1e-10
            && Math.abs(y - spot.y) <= spot.height / 2 + 1e-10) || null;
    }

    return Object.freeze({ createLayout, hitTest, JUNCTION_SIZE });
});
