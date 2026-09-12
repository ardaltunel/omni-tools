import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  timeoutDiscard,
  botDraw,
  validate,
  isWild,
  face,
  handPoints,
  total,
  bestMelds,
  draw,
  discard,
  openMelds,
  append,
  reclaim,
  replacementIndex,
  appendPair,
  extension,
  finish,
  bot,
  type Tile,
} from "../src/engine";
const i: Tile = { id: 200, c: 3, n: 8 };
let serial = 300;
const t = (n: number, c = 0): Tile => ({ id: serial++, n, c });

test("Okeyin yerine geçen taş işleme için tanınır; yanlış renk ve okey kabul edilmez", () => {
  const g = newGame(); g.indicator = i;
  const wild = t(9, 3);
  const meld = validate([t(3, 1), wild, t(5, 1)], i)!;
  const replacement = t(4, 1);
  assert.equal(extension(g, meld, replacement), null);
  assert.ok(replacementIndex(g, meld, replacement) >= 0);
  assert.equal(replacementIndex(g, meld, t(4, 0)), -1);
  assert.equal(replacementIndex(g, meld, wild), -1);
});

test("Geri toplama cezası tur bitiminde ve yalnızca yeniden açılmayan taşlar için uygulanır", () => {
  for (const reopened of [false, true]) {
    const g = newGame(); g.indicator = i;
    const meldTiles = [t(4), t(5), t(6)];
    const thrown = t(12, 2);
    g.players[0].hand = [thrown, t(1, 1), ...(reopened ? [] : meldTiles)];
    g.pendingCollect = { player: 0, ids: meldTiles.map((v) => v.id) };
    if (reopened) g.melds = [validate(meldTiles, i)!];
    assert.equal(g.penalties[0], 0);
    // Pending state survives a saved-game round trip.
    const saved = JSON.parse(JSON.stringify(g));
    discard(saved, thrown.id);
    assert.equal(saved.penalties[0], reopened ? 0 : 101);
    assert.equal(saved.pendingCollect, undefined);
    assert.equal(saved.turn, 1);
  }
});

test("Açık serinin iki ucuna işleyen taş atmak +101 ceza getirir", () => {
  for (const value of [3, 7]) {
    const g = newGame(); g.indicator = i;
    const thrown = t(value);
    g.players[0].hand = [thrown, t(2, 2)];
    g.melds = [validate([t(4), t(5), t(6)], i, 1)!];
    discard(g, thrown.id);
    assert.equal(g.penalties[0], 101);
    finish(g, null);
    assert.equal(g.players[0].score, 303);
    assert.equal(g.results[0][0], 303);
  }
});

test("Açık sete işleyen taş ve gerçek okey atma cezaları birikir", () => {
  const g = newGame(); g.indicator = i;
  const thrown = t(8, 2), wild = t(9, 3);
  g.players[0].hand = [thrown, wild, t(1)];
  g.melds = [validate([t(8), t(8, 1), t(8, 3)], i, 1)!];
  discard(g, thrown.id);
  assert.equal(g.penalties[0], 101);
  g.turn = 0; g.drawn = true;
  discard(g, wild.id);
  assert.equal(g.penalties[0], 202);
});

test("İşlemeyen taş ceza getirmez; son taşla bitişte atma cezası uygulanmaz", () => {
  const g = newGame(); g.indicator = i;
  const loose = t(12, 2), ending = t(7);
  g.players[0].hand = [loose, ending];
  g.melds = [validate([t(4), t(5), t(6)], i, 1)!];
  discard(g, loose.id);
  assert.equal(g.penalties[0], 0);
  g.turn = 0; g.drawn = true;
  discard(g, ending.id);
  assert.equal(g.penalties[0], 0);
  assert.equal(g.over, true);
});

test("Kapalı bot soldaki taşla 101 açar; çekme ve oynama ayrı çalışır", () => {
  const g = newGame();
  g.indicator = i; g.turn = 1; g.drawn = false;
  const left = t(13, 2);
  g.players[1].hand = [t(10), t(11), t(12), t(10, 1), t(11, 1), t(12, 1), t(12, 2), t(11, 2), t(2, 3)];
  g.discards[0] = [left];
  const deckSize = g.deck.length;
  botDraw(g);
  assert.equal(g.taken, left.id);
  assert.equal(g.deck.length, deckSize);
  bot(g);
  assert.equal(g.players[1].opened, "series");
  assert.ok(g.melds.some((m) => m.tiles.some((v) => v.id === left.id)));
  assert.equal(g.over, true);
});

test("Kapalı bot soldan beşinci çiftini alıp çift açar", () => {
  const g = newGame(); g.indicator = i; g.turn = 1; g.drawn = false;
  const left = t(10, 2);
  g.players[1].hand = [t(2), t(2), t(4), t(4), t(6, 1), t(6, 1), t(8, 1), t(8, 1), t(10, 2), t(1, 3)];
  g.discards[0] = [left];
  botDraw(g);
  assert.equal(g.taken, left.id);
  bot(g);
  assert.equal(g.players[1].opened, "pairs");
  assert.ok(g.melds.some((m) => m.tiles.some((v) => v.id === left.id)));
});

test("101 altında kalan kapalı bot soldan alamaz", () => {
  const g = newGame(); g.indicator = i; g.turn = 1; g.drawn = false;
  const left = t(5);
  g.players[1].hand = [t(3), t(4), t(10, 2)]; g.discards[0] = [left];
  const deckSize = g.deck.length;
  botDraw(g);
  assert.equal(g.taken, null);
  assert.equal(g.discards[0][0].id, left.id);
  assert.equal(g.deck.length, deckSize - 1);
});

test("Süre sonunda seri ve aynı sayı perleri korunur, boş taş atılır", () => {
  const g = newGame();
  g.indicator = i;
  const loose = t(13, 2);
  g.players[0].hand = [t(3), t(4), t(5), t(8, 0), t(8, 1), t(8, 2), loose];
  const before = structuredClone(g);
  assert.equal(timeoutDiscard(g).id, loose.id);
  assert.deepEqual(g, before);
});

test("Süre sonunda çift dizilimindeki çiftler korunur", () => {
  const g = newGame();
  g.indicator = i;
  const loose = t(2, 1);
  g.players[0].hand = [t(12), t(12), t(7, 2), t(7, 2), loose];
  assert.equal(timeoutDiscard(g, true).id, loose.id);
  g.players[0].opened = "pairs";
  assert.equal(timeoutDiscard(g).id, loose.id);
});

test("Süre sonunda bağlantısız taş yarım seriden önce atılır", () => {
  const g = newGame();
  g.indicator = i;
  const loose = t(2, 2);
  g.players[0].hand = [t(10), t(11), loose];
  assert.equal(timeoutDiscard(g).id, loose.id);
});

test("Tüm taşlar perdeyse en fazla taşı perde bırakan atış seçilir", () => {
  const g = newGame();
  g.indicator = i;
  g.players[0].hand = [t(3), t(4), t(5), t(6)];
  const selected = timeoutDiscard(g);
  assert.ok(validate(g.players[0].hand.filter((v) => v.id !== selected.id), i));
});

test("Süre sonunda soldan alınan yasak taş ve okey korunur", () => {
  const g = newGame();
  g.indicator = i;
  const forbidden = t(13, 1), loose = t(2, 2);
  g.players[0].hand = [t(9, 3), forbidden, loose];
  g.taken = forbidden.id;
  assert.equal(timeoutDiscard(g).id, loose.id);
});

test("Elde kalan puan çift/per diziliminden bağımsızdır; gerçek okey 101 sayılır", () => {
  const hand = [t(5), t(5), t(12), t(9, 3), { ...t(0), fake: true }];
  assert.equal(handPoints(hand, i), 132);
  assert.equal(handPoints([...hand].reverse(), i), 132);
  assert.equal(handPoints(hand.slice(2), i), 122);
  assert.equal(handPoints([], i), 0);
});
test("106 taş tekil olarak dağıtılır; ilk oyuncuda 22, diğerlerinde 21 taş", () => {
  const g = newGame();
  const all = [g.indicator, ...g.deck, ...g.players.flatMap((p) => p.hand)];
  assert.equal(all.length, 106);
  assert.equal(new Set(all.map((t) => t.id)).size, 106);
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    [22, 21, 21, 21],
  );
  assert.equal(g.deck.length, 20);
});
test("Seri, farklı renk seti ve çift doğrulaması", () => {
  assert.equal(validate([t(11), t(12), t(13)], i)?.kind, "run");
  assert.equal(validate([t(12), t(13), t(1)], i), null);
  assert.equal(validate([t(8, 0), t(8, 1), t(8, 2)], i)?.kind, "set");
  assert.equal(validate([t(8), t(8), t(8, 2)], i), null);
  assert.equal(validate([t(7), t(7)], i, 0, true)?.kind, "pair");
  assert.equal(validate([t(7), t(7, 1)], i, 0, true), null);
});
test("Gerçek okey joker, sahte okey gösterge üstü sabit taş", () => {
  const w = t(9, 3);
  assert.ok(isWild(w, i));
  assert.equal(total(validate([t(10), w, t(12)], i)!), 33);
  const fake = { ...t(0), fake: true };
  assert.deepEqual(face(fake, i), { c: 3, n: 9 });
  assert.ok(!isWild(fake, i));
  assert.equal(validate([t(10), fake, t(12)], i), null);
  assert.equal(validate([t(8, 3), fake, t(10, 3)], i)?.kind, "run");
});
test("Çözücü taşı iki kez kullanmaz ve toplamı 101 olan eli bulur", () => {
  const hand = [
    t(10),
    t(11),
    t(12),
    t(13),
    t(10, 1),
    t(11, 1),
    t(12, 1),
    t(11, 2),
    t(11, 3),
    t(11),
    t(3, 2),
  ];
  const ms = bestMelds(hand, i);
  assert.ok(ms.reduce((s, m) => s + total(m), 0) >= 101);
  const ids = ms.flatMap((m) => m.tiles.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
});
test("101 altı açma ve taşı tekrar kullanma durum değiştirmez", () => {
  const g = newGame();
  g.indicator = i;
  g.players[0].hand = [t(1), t(2), t(3), t(13)];
  const before = JSON.stringify(g);
  assert.throws(() =>
    openMelds(g, [validate(g.players[0].hand.slice(0, 3), i)!]),
  );
  assert.equal(JSON.stringify(g), before);
});
test("Beş çift ile açma; seri ve çift türleri karıştırılamaz", () => {
  const g = newGame();
  g.indicator = i;
  g.players[0].hand = [
    ...Array.from({ length: 5 }, (_, k) => [t(k + 1), t(k + 1)]).flat(),
    t(13),
  ];
  const ms = bestMelds(g.players[0].hand, i, true);
  openMelds(g, ms, true);
  assert.equal(g.players[0].opened, "pairs");
  assert.equal(g.players[0].hand.length, 1);
  assert.throws(() => openMelds(g, [], false));
});
test("Tek turda bir çekme bir atma ve sıra geçişi", () => {
  const g = newGame();
  assert.throws(() => draw(g));
  discard(g, g.players[0].hand[0].id);
  assert.equal(g.turn, 1);
  assert.throws(() => discard(g, g.players[1].hand[0].id));
  draw(g);
  assert.equal(g.players[1].hand.length, 22);
  assert.throws(() => draw(g));
  discard(g, g.players[1].hand[0].id);
  assert.equal(g.turn, 2);
});
test("Kapalı oyuncu soldan aldığı taşı açılışta kullanmak zorunda", () => {
  const g = newGame();
  g.drawn = false;
  g.discards[3] = [t(5)];
  draw(g, true);
  assert.throws(() => discard(g, g.players[0].hand[0].id));
});
test("İşleme jokerin temsil ettiği değeri değiştirmez ve turda ikiyle sınırlıdır", () => {
  const g = newGame();
  g.indicator = i;
  const w = t(9, 3);
  g.melds = [validate([t(5), w, t(7)], i)!];
  g.players[0].opened = "series";
  g.players[0].hand = [t(4), t(3), t(2), t(12)];
  assert.equal(extension(g, g.melds[0], t(6)), null);
  append(g, g.players[0].hand[0].id, 0);
  append(g, g.players[0].hand[0].id, 0);
  assert.throws(() => append(g, g.players[0].hand[0].id, 0));
  assert.deepEqual(g.melds[0].values, [3, 4, 5, 6, 7]);
});
test("Skorlar el sonunda biriktirilir", () => {
  const g = newGame();
  g.indicator = i;
  g.players[0].opened = "series";
  g.players[0].hand = [];
  g.players[1].opened = "pairs";
  g.players[1].hand = [t(5)];
  finish(g, 0);
  assert.deepEqual(g.results[0], [-101, 10, 202, 202]);
  const next = newGame(g);
  assert.equal(next.round, 2);
  assert.equal(next.turn, 1);
  assert.deepEqual(
    next.players.map((p) => p.score),
    [-101, 10, 202, 202],
  );
});
test("Okey doğru taşla değiştirilebilir ve taşlar korunur", () => {
  const g = newGame();
  g.indicator = i;
  const w = t(9, 3);
  g.melds = [validate([t(5), w, t(7)], i)!];
  g.players[0].opened = "series";
  const replacement = t(6);
  g.players[0].hand = [replacement, t(12)];
  reclaim(g, replacement.id, 0);
  assert.ok(g.players[0].hand.some((t) => t.id === w.id));
  assert.equal(g.melds[0].tiles[1].id, replacement.id);
  assert.throws(() => reclaim(g, w.id, 0));
});
test("Seri açan da açık çift alanına çift işleyebilir", () => {
  const g = newGame();
  g.indicator = i;
  g.players[0].opened = "series";
  g.melds = [validate([t(5), t(5)], i, 1, true)!];
  g.players[0].hand = [t(8), t(8), t(12)];
  appendPair(
    g,
    g.players[0].hand.slice(0, 2).map((t) => t.id),
  );
  assert.equal(g.melds.length, 2);
  assert.equal(g.players[0].opened, "series");
  assert.equal(g.players[0].hand.length, 1);
});
test("30 rastgele elde botlar ve insan hamle döngüsü kilitlenmez; taşlar kaybolmaz", () => {
  for (let k = 0; k < 30; k++) {
    const g = newGame();
    let turns = 0;
    while (!g.over && turns++ < 150) {
      if (g.turn === 0) {
        if (!g.drawn) draw(g);
        discard(g, g.players[0].hand[0].id);
      } else bot(g);
      const all = [
        g.indicator,
        ...g.deck,
        ...g.players.flatMap((p) => p.hand),
        ...g.discards.flat(),
        ...g.melds.flatMap((m) => m.tiles),
      ];
      assert.equal(all.length, 106);
      assert.equal(new Set(all.map((t) => t.id)).size, 106);
    }
    assert.ok(g.over);
  }
});

test("Okey serinin bırakılan ucuna işlenir", () => {
  for (const end of [-1, 1] as const) {
    const g = newGame();
    g.indicator = {id: 99, c: 3, n: 12};
    const wild = {id: 100, c: 3, n: 13};
    const tiles = [4,5,6,7,8,9].map(n => ({id: n, c: 0, n}));
    g.melds = [validate(tiles, g.indicator)!];
    g.turn = 0; g.drawn = true; g.players[0].opened = "series";
    g.players[0].hand = [wild, {id: 101, c: 1, n: 1}];
    append(g, wild.id, 0, end);
    assert.equal(end === 1 ? g.melds[0].values.at(-1) : g.melds[0].values[0], end === 1 ? 10 : 3);
  }
});

test("Süre dolunca bağlantısız taşlardan düşük olan atılır", () => {
  const g = newGame();
  g.indicator = {id: 99, c: 3, n: 12};
  g.players[0].hand = [
    {id: 1, c: 0, n: 1}, {id: 2, c: 0, n: 2}, {id: 3, c: 0, n: 3},
    {id: 4, c: 1, n: 5}, {id: 5, c: 2, n: 12},
  ];
  assert.equal(timeoutDiscard(g).id, 4);
});

test("İkinci taş soldan alındığında okey değişimi taken kaydını temizler", () => {
  const g = newGame(); g.indicator = {id:99,c:3,n:12}; g.turn=0; g.drawn=true;
  const wild={id:100,c:3,n:13};
  g.melds=[validate([{id:1,c:0,n:7},{id:2,c:1,n:7},wild],g.indicator)!];
  const at=g.melds[0].tiles.findIndex(t=>t.id===100), color=g.melds[0].colors[at];
  const other=[0,1,2,3].find(c=>c!==0&&c!==1&&c!==color)!;
  g.players[0].opened='series';g.players[0].hand=[{id:3,c:color,n:7},{id:4,c:other,n:7},{id:5,c:0,n:1}];g.taken=4;
  reclaim(g,3,0,4);assert.equal(g.taken,null);assert.equal(g.melds[0].tiles.length,4);
});
