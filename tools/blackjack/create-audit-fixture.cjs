"use strict";

// QA-only page: legal engine transitions and an isolated in-memory shared wallet.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("./engine.js");
const root = path.resolve(__dirname, "../..");
const output = path.join(root, "bj-premium-qa.html");

function seededRandom(seed = 137) {
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function prepared(ranks = [], bets = [100], credits = 10000) {
    const pool = Array.from({ length: 6 }, (_, index) => engine.createDeck(index)).flat();
    const sequence = ranks.map((rank) => {
        const index = pool.findIndex((card) => card.rank === rank);
        assert.notEqual(index, -1, `Not enough ${rank} cards for QA scenario`);
        return pool.splice(index, 1)[0];
    });
    const game = engine.createState({ balance: credits * engine.MONEY_SCALE, shoe: [...engine.shuffle(pool, seededRandom()), ...sequence.reverse()] });
    bets.forEach((bet, seat) => assert.equal(engine.setBet(game, bet * engine.MONEY_SCALE, seat), true));
    return game;
}

function ready(ranks, bets) {
    const game = prepared(ranks, bets);
    assert.ok(engine.beginRound(game));
    engine.afterInitialDeal(game);
    return game;
}

function scenarios() {
    const result = {
        betting: { label: "Boş Masa", game: prepared([], [0]) },
        deal: { label: "Normal Dağıtım", game: prepared(["10", "6", "7", "9", "5"]) },
        split: { label: "Böl ve Katla", game: ready(["8", "10", "8", "7", "3", "2", "9", "8"]) },
        insurance: { label: "Sigorta Kazanır", game: ready(["10", "A", "8", "K"]) },
        insuranceLose: { label: "Sigorta Kaybeder", game: ready(["10", "A", "8", "9"]) },
        natural: { label: "Doğal Blackjack", game: prepared(["A", "9", "K", "8"]) },
        push: { label: "Beraberlik", game: prepared(["10", "10", "8", "8"]) },
        bust: { label: "Oyuncu Bust", game: prepared(["10", "10", "6", "7", "K"]) },
        dealerBust: { label: "Krupiye Bust", game: prepared(["10", "10", "8", "6", "10"]) },
        five: { label: "Beş Yer", game: prepared(["8", "A", "10", "5", "9", "10", "8", "K", "7", "6", "9", "7", "3", "2", "9", "8"], [100, 100, 100, 100, 100]) },
        empty: { label: "Boş Cüzdan", game: prepared([], [0], 0) },
    };
    const many = ready(["2", "10", "2", "7", "2", "2", "2", "2", "2"]);
    for (let index = 0; index < 5; index += 1) assert.ok(engine.hit(many));
    assert.equal(many.playerHands[0].cards.length, 7);
    result.many = { label: "Yedi Kartlı El", game: many };
    const splitMany = ready(["2", "10", "2", "7", "2", "3", "2", "2", "2", "2", "3", "3", "3", "3"]);
    assert.ok(engine.split(splitMany));
    for (let index = 0; index < 4; index += 1) assert.ok(engine.hit(splitMany));
    assert.ok(engine.stand(splitMany));
    for (let index = 0; index < 4; index += 1) assert.ok(engine.hit(splitMany));
    assert.deepEqual(splitMany.playerHands.map((hand) => hand.cards.length), [6, 6]);
    result.splitMany = { label: "Çok Kartlı İki El", game: splitMany };
    return Object.fromEntries(Object.entries(result).map(([key, { label, game }]) => {
        const snapshot = engine.serializeState(game);
        assert.deepEqual(engine.restoreState(snapshot), game, `QA case ${key} must be restorable`);
        const cards = [...game.shoe, ...game.dealerHand, ...game.playerHands.flatMap((hand) => hand.cards)];
        assert.equal(cards.length, 312);
        assert.equal(new Set(cards.map((card) => card.id)).size, 312);
        return [key, { label, envelope: { version: 2, balance: game.balance, lastBet: game.lastBet, stats: game.stats, soundEnabled: false, soundVolume: 0.25, game: snapshot } }];
    }));
}

function extractPanel(source) {
    const start = source.indexOf('<section id="blackjack"');
    assert.notEqual(start, -1, "Blackjack panel is missing");
    const tags = /<\/?section\b[^>]*>/gu;
    tags.lastIndex = start;
    let depth = 0;
    let match;
    while ((match = tags.exec(source))) {
        depth += match[0].startsWith("</") ? -1 : 1;
        if (!depth) return source.slice(start, tags.lastIndex).replace('tool-panel blackjack-panel"', 'tool-panel blackjack-panel active"');
    }
    throw new Error("Blackjack section is not closed");
}

function generate() {
    const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const cases = scenarios();
    const links = [...source.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/gu)]
        .filter(([, href]) => /^style\.css(?:\?|$)|^tools\/(?:blackjack\/|shared\/game-wallet)|^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//u.test(href)).map(([tag]) => tag).join("\n");
    const scripts = [...source.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/gu)]
        .filter(([, src]) => /^tools\/(?:blackjack\/|shared\/game-wallet)/u.test(src)).map(([tag]) => tag).join("\n");
    assert.ok(scripts.includes("game-wallet.js") && scripts.includes("blackjack/app.js"));
    const setup = `
        const fixtures=${JSON.stringify(cases).replace(/</gu, "\\u003c")};
        const params=new URLSearchParams(location.search);
        const key=Object.hasOwn(fixtures,params.get('case'))?params.get('case'):'betting';
        const scenario=fixtures[key];scenario.envelope.soundEnabled=params.get('sound')==='1';
        const games=Object.fromEntries(['blackjack','roulette','slot-game'].map(id=>[id,{revision:0,snapshot:id==='blackjack'?scenario.envelope:null}]));
        const record={version:1,revision:0,balanceCents:Math.round(scenario.envelope.balance/2*100),games};
        const data=new Map([['omni-games-wallet-v1',JSON.stringify(record)],['omni-blackjack-v1',JSON.stringify(scenario.envelope)]]);
        const storage={getItem:key=>data.get(String(key))??null,setItem:(key,value)=>data.set(String(key),String(value)),removeItem:key=>data.delete(String(key)),clear:()=>data.clear(),key:index=>[...data.keys()][index]??null,get length(){return data.size;}};
        Object.defineProperty(window,'localStorage',{value:storage,configurable:true});
        window.__BJ_PREMIUM_QA__={scenario:key,read:()=>JSON.parse(data.get('omni-games-wallet-v1'))};
        document.getElementById('qa-case-name').textContent=scenario.label;
        document.querySelectorAll('[data-qa-case]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.qaCase===key));button.addEventListener('click',()=>{const next=new URL(location.href);next.searchParams.set('case',button.dataset.qaCase);location.assign(next);});});
        document.getElementById('qa-sound').checked=params.get('sound')==='1';
        document.getElementById('qa-sound').addEventListener('change',event=>{const next=new URL(location.href);next.searchParams.set('sound',event.target.checked?'1':'0');location.assign(next);});
        window.__BJ_QA_ERRORS__=[];window.addEventListener('error',event=>window.__BJ_QA_ERRORS__.push(event.message));window.addEventListener('unhandledrejection',event=>window.__BJ_QA_ERRORS__.push(String(event.reason)));
    `;
    const buttons = Object.entries(cases).map(([key, item]) => `<button type="button" data-qa-case="${key}">${item.label}</button>`).join("");
    fs.writeFileSync(output, `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Blackjack premium QA</title>${links}<style>body{display:block;padding:12px}.qa-tools{max-width:1500px;margin:0 auto 16px;padding:14px;border:1px solid #415047;border-radius:12px;background:#111b17;color:#edf3ee}.qa-tools p{margin:0 0 10px}.qa-buttons{display:flex;flex-wrap:wrap;gap:6px}.qa-buttons button{padding:8px 10px;border:1px solid #52625a;border-radius:7px;background:#22342b;color:#f0f5f2;font-size:12px}.qa-buttons button[aria-pressed=true]{border-color:#d9bf73;background:#473e25}.qa-sound{display:inline-flex;align-items:center;gap:6px;margin-top:10px}#blackjack{max-width:1500px;margin:auto}</style></head><body><aside class="qa-tools"><p><strong>Yalnızca QA · <span id="qa-case-name"></span></strong> — Kayıtlar bellektedir; gerçek oyuncu kaydı kullanılmaz. Yenileyince seçili örnek baştan başlar.</p><div class="qa-buttons">${buttons}</div><label class="qa-sound"><input id="qa-sound" type="checkbox">Sesli başlat</label></aside>${extractPanel(source)}<script>${setup}</script>${scripts}</body></html>`);
    return { output, cases: Object.keys(cases) };
}

if (require.main === module) {
    const result = generate();
    console.log(`Created ${result.output} (${result.cases.length} legal scenarios). Serve on isolated localhost:8769 and remove the generated HTML before publishing.`);
}
module.exports = { generate, scenarios };
