(function exposeBlackjackCards(root, factory) {
    "use strict";
    const cards = factory(root);
    if (typeof module === "object" && module.exports) module.exports = cards;
    else root.OmniBlackjackCards = cards;
})(typeof globalThis === "undefined" ? window : globalThis, function blackjackCardsFactory(root) {
    "use strict";

    const RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
    const SUITS = Object.freeze({
        clubs: { name: "Sinek", color: "#25313c", path: '<path d="M10 15C5 20 0 15 3 11c1-2 4-2 6-1-4-7 2-12 6-8 2 2 1 6 0 8 6-3 10 3 6 7-2 2-5 1-7-2l2 7H8Z"/>' },
        diamonds: { name: "Karo", color: "#b02d3b", path: '<path d="m12 1 10 11-10 11L2 12Z"/>' },
        hearts: { name: "Kupa", color: "#b02d3b", path: '<path d="M12 22C9 18 1 13 1 7 1 1 9-1 12 5c3-6 11-4 11 2 0 6-8 11-11 15Z"/>' },
        spades: { name: "Maça", color: "#25313c", path: '<path d="M12 1C8 7 1 11 1 16c0 6 8 7 10 1l-3 6h8l-3-6c3 6 10 5 10-1 0-5-7-9-11-15Z"/>' },
    });
    const RANK_NAMES = { A: "As", J: "Vale", Q: "Kız", K: "Papaz" };
    const PIPS = {
        2: [[90, 75], [90, 177]],
        3: [[90, 68], [90, 126], [90, 184]],
        4: [[59, 76], [121, 76], [59, 176], [121, 176]],
        5: [[59, 76], [121, 76], [90, 126], [59, 176], [121, 176]],
        6: [[59, 67], [121, 67], [59, 126], [121, 126], [59, 185], [121, 185]],
        7: [[59, 67], [121, 67], [90, 96], [59, 126], [121, 126], [59, 185], [121, 185]],
        8: [[59, 67], [121, 67], [90, 96], [59, 126], [121, 126], [90, 156], [59, 185], [121, 185]],
        9: [[59, 61], [121, 61], [59, 104], [121, 104], [90, 126], [59, 148], [121, 148], [59, 191], [121, 191]],
        10: [[59, 61], [121, 61], [90, 82], [59, 104], [121, 104], [59, 148], [121, 148], [90, 170], [59, 191], [121, 191]],
    };
    let sequence = 0;

    function readCard(card) {
        if (!card || !RANKS.includes(card.rank) || !Object.hasOwn(SUITS, card.suit)) throw new TypeError("Geçerli bir Blackjack kartı gerekli.");
        return card;
    }

    function label(card) {
        if (!card || card.hidden) return "Kapalı kart";
        readCard(card);
        return `${SUITS[card.suit].name} ${RANK_NAMES[card.rank] || card.rank}`;
    }

    function pip(id, x, y, size, inverted = y > 126) {
        return `<use href="#${id}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" transform="translate(${x} ${y})${inverted ? " rotate(180)" : ""}"/>`;
    }

    function corner(rank, id) {
        return `<g transform="translate(9 9)"><text x="12" y="21" font-family="Georgia,serif" font-size="${rank === "10" ? 23 : 26}" font-weight="700" text-anchor="middle">${rank}</text><use href="#${id}" x="3" y="27" width="18" height="18"/></g>`;
    }

    function courtHalf(rank, id, color) {
        const gold = "#bb914b";
        const blue = "#294f70";
        const red = "#a83b45";
        const robe = color === SUITS.hearts.color ? blue : red;
        const crown = rank === "J"
            ? `<path d="M30 24q1-19 23-16l14 13-11 3Z" fill="${blue}" stroke="${gold}" stroke-width="1.4"/><path d="M51 10q3-13 15-8-3 7-13 11" fill="#f2e5ba" stroke="${gold}"/><path d="m56 8 6-5" stroke="${gold}"/>`
            : `<path d="m30 25-3-17 13 7L48 2l9 13 12-7-4 17Z" fill="#d5b16a" stroke="#725735" stroke-width="1.4"/><path d="M31 22h34M35 16l4 4m20-4-4 4" fill="none" stroke="#f5e0a2" stroke-width="2"/><circle cx="48" cy="15" r="3" fill="${robe}"/>`;
        const beard = rank === "K"
            ? '<path d="m36 40 5 5 7 2 7-2 5-5-2 14-10 10-10-10Z" fill="#a77d49" stroke="#6c5031" stroke-width=".8"/><path d="m40 46 8 3 8-3m-12 5 4 4 4-4" fill="none" stroke="#e6c38c" stroke-width="1"/>'
            : '<path d="m43 46 5 1 5-1" fill="none" stroke="#a94540" stroke-width="1"/>';
        const prop = rank === "Q"
            ? '<path d="M16 83V38m0 18-8-5m8-2 8-7" fill="none" stroke="#4e6b4a" stroke-width="2"/><g fill="#b64a55" stroke="#e2bb76" stroke-width=".7"><circle cx="16" cy="34" r="5"/><circle cx="11" cy="30" r="3"/><circle cx="20" cy="30" r="3"/><circle cx="16" cy="27" r="3"/></g>'
            : `<path d="m15 14 3 5-2 49h-3l-2-49Z" fill="#b6c4c7" stroke="${blue}" stroke-width=".8"/><path d="M7 65h16m-8 0v16m-4 0h8" stroke="${gold}" stroke-width="3"/>`;
        return `<rect width="96" height="86" fill="#f3e7cb"/>
            <path d="M3 0v86m90-86v86" stroke="${gold}" stroke-width="1"/>
            <path d="M23 86V69q4-15 17-17l8 8 10-8q14 3 19 17v17Z" fill="${robe}" stroke="${blue}" stroke-width="1.4"/>
            <path d="m39 54 9 9 10-10 7 6-17 18-16-18Z" fill="#f6e8c5" stroke="${gold}"/>
            <path d="M34 73v13m28-14v14M43 78v8m10-8v8" stroke="${gold}" stroke-width="3"/>
            <path d="M35 27q-3 18 4 22l9 7 9-7q7-5 4-23Z" fill="#edcfaa" stroke="#8b674a" stroke-width="1"/>
            <path d="M34 26q-8 12 2 25l2-17m23-8q8 14-2 27l-2-19" fill="#aa7d43" stroke="#715032" stroke-width="1"/>
            <path d="m39 34 6-1m7 0 6 1" fill="none" stroke="#584735" stroke-width="1.2"/>
            <path d="m47 35-2 7 5 1" fill="none" stroke="#b48c68" stroke-width=".9"/>
            <circle cx="42" cy="36" r="1.1" fill="#283b44"/><circle cx="54" cy="36" r="1.1" fill="#283b44"/>
            ${beard}${crown}${prop}
            <path d="M75 54q15 12 7 32M78 61l6-3m-3 9 7-3m-5 10 6-3" fill="none" stroke="${gold}" stroke-width="1.3"/>
            <g fill="${color}"><use href="#${id}" x="6" y="4" width="13" height="13"/><use href="#${id}" x="77" y="6" width="12" height="12"/></g>`;
    }

    function front(card, prefix) {
        const suit = SUITS[card.suit];
        const id = `${prefix}-suit`;
        const corners = corner(card.rank, id);
        let center;
        if (["J", "Q", "K"].includes(card.rank)) {
            const half = courtHalf(card.rank, id, suit.color);
            center = `<g transform="translate(42 40)"><rect x="-.8" y="-.8" width="97.6" height="173.6" rx="2" fill="#c4a364" stroke="#a8874e" stroke-width=".6"/>${half}<g transform="translate(96 172) rotate(180)">${half}</g><path d="M0 86h96" stroke="#c9a665" stroke-width="1.4"/></g>`;
        } else if (card.rank === "A") {
            center = `<g fill="none" stroke="#c1a46d" stroke-width=".7" opacity=".7"><path d="M90 77c-38 8-50 40-38 65m38-65c38 8 50 40 38 65M49 153l9 10m73-10-9 10"/><path d="M54 103l-5 9m3 9-4 9m78-27 5 9m-3 9 4 9"/></g>${pip(id, 90, 125, 65, false)}<text x="90" y="182" text-anchor="middle" font-family="Georgia,serif" font-size="7" letter-spacing="2" fill="#9b8153">BLACKJACK</text>`;
        } else {
            const size = Number(card.rank) >= 9 ? 26 : Number(card.rank) <= 3 ? 36 : 29;
            center = PIPS[card.rank].map(([x, y]) => pip(id, x, y, size)).join("");
        }
        return `<defs><linearGradient id="${prefix}-paper" x2=".8" y2="1"><stop stop-color="#f8f4e9"/><stop offset=".45" stop-color="#fffef9"/><stop offset="1" stop-color="#ede8dc"/></linearGradient><pattern id="${prefix}-grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".32" fill="#8b8061" opacity=".14"/></pattern><symbol id="${id}" viewBox="0 0 24 24">${suit.path}</symbol></defs>
            <rect x=".8" y=".8" width="178.4" height="250.4" rx="11" fill="url(#${prefix}-paper)" stroke="#c1baaa" stroke-width="1.2"/>
            <rect x="5" y="5" width="170" height="242" rx="7" fill="none" stroke="#fff" opacity=".8"/>
            <rect x="2" y="2" width="176" height="248" rx="10" fill="url(#${prefix}-grain)"/>
            <g fill="${suit.color}">${corners}<g transform="translate(180 252) rotate(180)">${corners}</g>${center}</g>`;
    }

    function back(prefix) {
        const petals = Array.from({ length: 12 }, (_, index) => `<ellipse cx="90" cy="104" rx="9" ry="29" transform="rotate(${index * 30} 90 126)"/>`).join("");
        return `<defs><linearGradient id="${prefix}-navy" x2="1" y2="1"><stop stop-color="#2b4058"/><stop offset="1" stop-color="#101e31"/></linearGradient><pattern id="${prefix}-weave" width="16" height="16" patternUnits="userSpaceOnUse"><path d="m8 0 8 8-8 8L0 8Z" fill="none" stroke="#b69e6a" stroke-width=".5" opacity=".33"/><circle cx="8" cy="8" r="1" fill="#b69e6a" opacity=".5"/></pattern></defs>
            <rect x=".8" y=".8" width="178.4" height="250.4" rx="11" fill="#f3ede0" stroke="#bdb6a6" stroke-width="1.2"/>
            <rect x="7" y="7" width="166" height="238" rx="6" fill="url(#${prefix}-navy)"/>
            <rect x="12" y="12" width="156" height="228" rx="3" fill="url(#${prefix}-weave)" stroke="#d2b77e" stroke-width="1"/>
            <rect x="17" y="17" width="146" height="218" rx="2" fill="none" stroke="#9e895d" stroke-width=".6"/>
            <g fill="none" stroke="#c6aa71" stroke-width=".7" opacity=".8">${petals}<circle cx="90" cy="126" r="47"/><circle cx="90" cy="126" r="42"/></g>
            <path d="M43 126q47-40 94 0-47 40-94 0" fill="#442a37" stroke="#d2b77e" stroke-width="1"/>
            <text x="90" y="132" text-anchor="middle" fill="#e4c98f" font-family="Georgia,serif" font-weight="700" font-size="27" letter-spacing="1">21</text><text x="90" y="155" text-anchor="middle" fill="#dec895" font-family="Georgia,serif" font-size="6.5" letter-spacing="1.3">BLACKJACK</text>
            <g fill="#d4b67b"><path d="m90 39 5 8-5 8-5-8Zm0 158 5 8-5 8-5-8Z"/><circle cx="90" cy="66" r="2"/><circle cx="90" cy="186" r="2"/><path d="m29 26 5 7-5 7-5-7Zm122 0 5 7-5 7-5-7ZM29 212l5 7-5 7-5-7Zm122 0 5 7-5 7-5-7Z"/></g>`;
    }

    function svg(card, options = {}) {
        const hidden = options.faceDown === true || card?.hidden === true || card === null;
        if (!hidden) readCard(card);
        const prefix = `blackjack-svg-card-${++sequence}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252" fill="none" aria-hidden="true" focusable="false">${hidden ? back(prefix) : front(card, prefix)}</svg>`;
    }

    return Object.freeze({ label, svg });
});
