export type Tile = { id: number; c: number; n: number; fake?: boolean };
export type Meld = {
  tiles: Tile[];
  owner: number;
  kind: "run" | "set" | "pair";
  values: number[];
  colors: number[];
};
export type Player = {
  name: string;
  hand: Tile[];
  opened: false | "series" | "pairs";
  score: number;
  openingMargin?: number;
};
export type Game = {
  version: 1;
  players: Player[];
  deck: Tile[];
  indicator: Tile;
  discards: Tile[][];
  melds: Meld[];
  turn: number;
  drawn: boolean;
  round: number;
  rounds: number;
  over: boolean;
  log: string[];
  results: number[][];
  taken: number | null;
  added: Record<number, number>;
  openedTurn: boolean;
  penalties: number[];
  pendingCollect?: { player: number; ids: number[] };
  escalating?: boolean;
  lastOpeningTotal?: number;
  lastOpeningPairs?: number;
  lastSeriesPlayer?: number;
  lastPairsPlayer?: number;
};
export const colors = ["Kırmızı", "Mavi", "Siyah", "Sarı"];
export function isWild(t: Tile, i: Tile) {
  return !t.fake && t.c === i.c && t.n === (i.n % 13) + 1;
}
export function face(t: Tile, i: Tile) {
  return t.fake ? { c: i.c, n: (i.n % 13) + 1 } : { c: t.c, n: t.n };
}

export function handPoints(hand: Tile[], indicator: Tile): number {
  return hand.reduce(
    (sum, t) => sum + (isWild(t, indicator) ? 101 : face(t, indicator).n),
    0,
  );
}
export function validate(
  tiles: Tile[],
  i: Tile,
  owner = 0,
  pair = false,
): Meld | null {
  const wild = tiles.filter((t) => isWild(t, i));
  const fixed = tiles.filter((t) => !isWild(t, i));
  const fs = fixed.map((t) => face(t, i));
  if (pair) {
    if (
      tiles.length !== 2 ||
      fs.some((f) => f.n !== fs[0].n || f.c !== fs[0].c)
    )
      return null;
    return {
      tiles,
      owner,
      kind: "pair",
      values: tiles.map(() => fs[0]?.n ?? 1),
      colors: tiles.map(() => fs[0]?.c ?? 0),
    };
  }
  if (tiles.length < 3 || tiles.length > 13) return null;
  if (
    tiles.length <= 4 &&
    fs.every((f) => f.n === fs[0].n) &&
    new Set(fs.map((f) => f.c)).size === fs.length
  ) {
    const used = fs.map((f) => f.c);
    return {
      tiles,
      owner,
      kind: "set",
      values: tiles.map(() => fs[0]?.n ?? 13),
      colors: tiles.map((t) =>
        isWild(t, i)
          ? [0, 1, 2, 3].find((c) => !used.includes(c) && !!used.push(c))!
          : face(t, i).c,
      ),
    };
  }
  if (
    fs.some((f) => f.c !== fs[0].c) ||
    new Set(fs.map((f) => f.n)).size !== fs.length
  )
    return null;
  for (let start = 14 - tiles.length; start >= 1; start--) {
    if (fs.every((f) => f.n >= start && f.n < start + tiles.length)) {
      const sorted: Tile[] = [];
      let w = 0;
      for (let n = start; n < start + tiles.length; n++)
        sorted.push(fixed.find((t) => face(t, i).n === n) ?? wild[w++]);
      return {
        tiles: sorted,
        owner,
        kind: "run",
        values: sorted.map((_, k) => start + k),
        colors: sorted.map(() => fs[0]?.c ?? 0),
      };
    }
  }
  return null;
}
export const total = (m: Meld) => m.values.reduce((a, b) => a + b, 0);
export function candidates(hand: Tile[], i: Tile, pairs = false): Meld[] {
  const out: Meld[] = [];
  const seen = new Set<string>();
  const add = (ts: Tile[]) => {
    const key = ts
      .map((t) => t.id)
      .sort((a, b) => a - b)
      .join(",");
    if (seen.has(key)) return;
    seen.add(key);
    const m = validate(ts, i, 0, pairs);
    if (m) out.push(m);
  };
  if (pairs) {
    for (let a = 0; a < hand.length; a++)
      for (let b = a + 1; b < hand.length; b++) add([hand[a], hand[b]]);
    return out;
  }
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++) {
        add([hand[a], hand[b], hand[c]]);
        for (let d = c + 1; d < hand.length; d++)
          if (
            face(hand[a], i).n === face(hand[b], i).n ||
            isWild(hand[a], i) ||
            isWild(hand[b], i)
          )
            add([hand[a], hand[b], hand[c], hand[d]]);
      }
  const wild = hand.filter((t) => isWild(t, i));
  for (let c = 0; c < 4; c++)
    for (let start = 1; start <= 11; start++)
      for (let len = 3; len <= 13 - start + 1; len++) {
        const ts: Tile[] = [];
        let wi = 0;
        for (let n = start; n < start + len; n++) {
          const t =
            hand.find(
              (t) => !isWild(t, i) && face(t, i).c === c && face(t, i).n === n,
            ) ?? wild[wi++];
          if (!t) break;
          ts.push(t);
        }
        if (ts.length === len) add(ts);
      }
  return out;
}
export function bestMelds(hand: Tile[], i: Tile, pairs = false): Meld[] {
  const cs = candidates(hand, i, pairs).sort((a, b) =>
    pairs ? b.tiles.length - a.tiles.length : total(b) - total(a),
  );
  const idx = new Map(hand.map((t, k) => [t.id, k]));
  const masks = cs.map((m) =>
    m.tiles.reduce((v, t) => v | (1 << idx.get(t.id)!), 0),
  );
  let best: Meld[] = [];
  let score = 0;
  let visits = 0;
  const memo = new Map<number, number>();
  function walk(mask: number, chosen: Meld[], value: number) {
    if (++visits > 24000) return;
    if (value > score) {
      score = value;
      best = [...chosen];
    }
    if ((memo.get(mask) ?? -1) >= value) return;
    memo.set(mask, value);
    for (let k = 0; k < cs.length; k++)
      if (!(mask & masks[k]))
        walk(
          mask | masks[k],
          [...chosen, cs[k]],
          value + (pairs ? 1 : total(cs[k])),
        );
  }
  walk(0, [], 0);
  return best;
}
export function newGame(old?: Game, previousNames: string[] = []): Game {
  const names = ["Defne", "Melisa", "Selin", "Elif", "Zeynep", "Ece", "Duru", "İrem", "İpek", "Aslı", "Buse", "Ceren", "Deniz", "Yağmur", "Sude", "Naz", "Ada", "Aylin"]
    .filter(name => !previousNames.includes(name));
  for (let k = names.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [names[k], names[j]] = [names[j], names[k]];
  }
  const playerNames = old ? old.players.map(p => p.name) : ["Siz", ...names.slice(0, 3)];
  let deck: Tile[] = [];
  for (let copy = 0; copy < 2; copy++)
    for (let c = 0; c < 4; c++)
      for (let n = 1; n <= 13; n++) deck.push({ id: deck.length, c, n });
  deck.push(
    { id: 104, c: 0, n: 0, fake: true },
    { id: 105, c: 0, n: 0, fake: true },
  );
  for (let k = deck.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  const at = deck.findIndex((t) => !t.fake);
  const indicator = deck.splice(at, 1)[0];
  const round = old ? old.round + 1 : 1;
  const starter = (round - 1) % 4;
  return {
    version: 1,
    players: playerNames.map((name, k) => ({
      name,
      hand: deck.splice(0, k === starter ? 22 : 21),
      opened: false,
      score: old?.players[k].score ?? 0,
      openingMargin: k === 0 ? 0 : old?.players[k].openingMargin ?? [0, 8, 16][Math.floor(Math.random() * 3)],
    })),
    deck,
    indicator,
    discards: [[], [], [], []],
    melds: [],
    turn: starter,
    drawn: true,
    round,
    rounds: old?.rounds ?? 1,
    over: false,
    log: ["Yeni el dağıtıldı. Güzel oyunlar!"],
    results: old?.results ?? [],
    taken: null,
    added: {},
    openedTurn: false,
    penalties: [0, 0, 0, 0],
  };
}
export function note(g: Game, s: string) {
  g.log = [s, ...g.log].slice(0, 30);
}
export function draw(g: Game, discard = false) {
  if (g.over || g.drawn)
    throw Error("Bu tur taş çektiniz. Şimdi bir taş atın.");
  const prev = (g.turn + 3) % 4;
  const t = discard ? g.discards[prev].pop() : g.deck.pop();
  if (!t) throw Error("Buradan çekilecek taş yok.");
  g.players[g.turn].hand.push(t);
  g.drawn = true;
  g.taken = discard ? t.id : null;
  note(
    g,
    `${g.players[g.turn].name} ${discard ? "soldan" : "ortadan"} taş çekti.`,
  );
}
export function openMelds(g: Game, ms: Meld[], pairs = false) {
  const p = g.players[g.turn];
  if (!g.drawn || g.over) throw Error("Önce taş çekmelisiniz.");
  if (p.opened && p.opened !== (pairs ? "pairs" : "series"))
    throw Error("Seri ve çift açma türleri aynı elde değiştirilemez.");
  const ids = ms.flatMap((m) => m.tiles.map((t) => t.id));
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !p.hand.some((t) => t.id === id))
  )
    throw Error("Bir taş birden fazla perde kullanılamaz.");
  const checked = ms.map((m) => validate(m.tiles, g.indicator, g.turn, pairs));
  if (!ms.length || checked.some((m) => !m))
    throw Error("Seçim geçerli bir per oluşturmuyor.");
  if (
    !p.opened &&
    (pairs ? ms.length < (g.escalating ? Math.max(5, (g.lastOpeningPairs ?? 0) + 1) : 5) : checked.reduce((s, m) => s + total(m!), 0) < (g.escalating ? Math.max(101, (g.lastOpeningTotal ?? 0) + 1) : 101))
  )
    throw Error(
      pairs
        ? `Açmak için en az ${g.escalating ? Math.max(5, (g.lastOpeningPairs ?? 0) + 1) : 5} çift gerekir.`
        : `Açmak için perlerin toplamı en az ${g.escalating ? Math.max(101, (g.lastOpeningTotal ?? 0) + 1) : 101} olmalı.`,
    );
  if (ids.length >= p.hand.length)
    throw Error("Eli bitirmek için atacağınız bir taş kalmalı.");
  if (g.taken !== null && !p.opened && !ids.includes(g.taken))
    throw Error("Soldan alınan taşı açtığınız perlerde kullanmalısınız.");
  g.openedTurn = !p.opened || g.openedTurn;
  if (!p.opened && g.escalating) {
    if (pairs) {
      g.lastOpeningPairs = ms.length;
      g.lastPairsPlayer = g.turn;
    } else {
      g.lastOpeningTotal = checked.reduce((sum, meld) => sum + total(meld!), 0);
      g.lastSeriesPlayer = g.turn;
    }
  }
  p.opened = pairs ? "pairs" : "series";
  g.melds.push(...(checked as Meld[]));
  p.hand = p.hand.filter((t) => !ids.includes(t.id));
  g.taken = null;
  note(g, `${p.name} ${pairs ? "çiftlerini" : "perlerini"} açtı.`);
}
export function extension(g: Game, m: Meld, t: Tile, preferredEnd?: -1 | 1): Meld | null {
  if (m.kind === "pair") return null;
  const f = face(t, g.indicator);
  if (m.kind === "run") {
    for (const end of preferredEnd && isWild(t, g.indicator) ? [preferredEnd] : [-1, 1]) {
      const n = end === -1 ? m.values[0] - 1 : m.values.at(-1)! + 1;
      if (n < 1 || n > 13) continue;
      if (isWild(t, g.indicator) || (f.c === m.colors[0] && f.n === n))
        return {
          ...m,
          tiles: end < 0 ? [t, ...m.tiles] : [...m.tiles, t],
          values: end < 0 ? [n, ...m.values] : [...m.values, n],
          colors: [...m.colors, m.colors[0]],
        };
    }
  } else if (
    m.tiles.length < 4 &&
    (isWild(t, g.indicator) || (f.n === m.values[0] && !m.colors.includes(f.c)))
  )
    return {
      ...m,
      tiles: [...m.tiles, t],
      values: [...m.values, m.values[0]],
      colors: [
        ...m.colors,
        isWild(t, g.indicator)
          ? [0, 1, 2, 3].find((c) => !m.colors.includes(c))!
          : f.c,
      ],
    };
  return null;
}
export function append(g: Game, id: number, k: number, preferredEnd?: -1 | 1) {
  const p = g.players[g.turn];
  if (!g.drawn || !p.opened || g.over)
    throw Error("Taş işlemek için önce elinizi açın ve taş çekin.");
  if (p.hand.length <= 1) throw Error("Bitirmek için son taşı atmalısınız.");
  if ((g.added[k] ?? 0) >= 2)
    throw Error("Bir turda aynı pere en fazla iki taş işlenebilir.");
  const t = p.hand.find((t) => t.id === id);
  if (!t || !g.melds[k]) throw Error("Taş veya per bulunamadı.");
  const m = extension(g, g.melds[k], t, preferredEnd);
  if (!m) throw Error("Bu taş bu pere işlenemez.");
  g.melds[k] = m;
  p.hand = p.hand.filter((t) => t.id !== id);
  g.added[k] = (g.added[k] ?? 0) + 1;
  if (g.taken === id) g.taken = null;
  note(g, `${p.name} yere taş işledi.`);
}
export function replacementIndex(g: Game, m: Meld, t: Tile): number {
  if (isWild(t, g.indicator)) return -1;
  const f = face(t, g.indicator);
  return m.tiles.findIndex((w, j) =>
    isWild(w, g.indicator) && m.values[j] === f.n && m.colors[j] === f.c);
}

export function reclaim(g: Game, id: number, k: number, secondId?: number) {
  const p = g.players[g.turn],
    m = g.melds[k],
    t = p.hand.find((t) => t.id === id);
  if (!p.opened || !g.drawn || g.over || !m || !t || isWild(t, g.indicator))
    throw Error(
      "Okeyi almak için eliniz açık olmalı ve yerine gerçek taşını koymalısınız.",
    );
  const at = replacementIndex(g, m, t);
  if (at < 0) throw Error("Seçili taş masadaki okeyin yerine geçmiyor.");
  let second: Tile | undefined;
  if (m.kind === "set" && m.tiles.length === 3) {
    second = p.hand.find(v => v.id === secondId && v.id !== id);
    const realColors = m.tiles.filter(v => !isWild(v, g.indicator)).map(v => face(v, g.indicator).c);
    const firstFace = face(t, g.indicator);
    const secondFace = second && face(second, g.indicator);
    if (!second || isWild(second, g.indicator) || !secondFace || secondFace.n !== firstFace.n || secondFace.c === firstFace.c || realColors.includes(secondFace.c) || realColors.includes(firstFace.c))
      throw Error("Üçlü setteki okeyi almak için eksik iki rengin taşını birlikte vermelisiniz.");
  }
  const wild = m.tiles[at];
  m.tiles[at] = t;
  if (second) {
    m.tiles.push(second);
    m.values.push(face(second, g.indicator).n);
    m.colors.push(face(second, g.indicator).c);
  }
  p.hand = p.hand.filter((v) => v.id !== id && v.id !== second?.id);
  p.hand.push(wild);
  if (g.taken === id || (second && g.taken === second.id)) g.taken = null;
  note(g, `${p.name} gerçek taşını koyarak okeyi aldı.`);
}
export function appendPair(g: Game, ids: number[]) {
  const p = g.players[g.turn];
  if (
    !p.opened ||
    !g.drawn ||
    g.over ||
    !g.melds.some((m) => m.kind === "pair")
  )
    throw Error("Çift işlemek için eliniz ve masada çiftler açık olmalı.");
  const ts = p.hand.filter((t) => ids.includes(t.id));
  const m = validate(ts, g.indicator, g.turn, true);
  if (!m || p.hand.length <= 2)
    throw Error(
      "Aynı renk ve sayıda iki taş seçin; atmak için bir taş saklayın.",
    );
  g.melds.push(m);
  p.hand = p.hand.filter((t) => !ids.includes(t.id));
  if (ids.includes(g.taken!)) g.taken = null;
  note(g, `${p.name} çift işledi.`);
}
export function finish(g: Game, winner: number | null, okey = false) {
  g.over = true;
  const factor = (okey ? 2 : 1) * (winner !== null && g.openedTurn ? 2 : 1);
  const scores = g.players.map(
    (p, k) =>
      g.penalties[k] +
      (k === winner
        ? -101 * factor
        : (!p.opened
            ? 202
            : p.hand.reduce(
                (s, t) =>
                  s + (isWild(t, g.indicator) ? 101 : face(t, g.indicator).n),
                0,
              ) * (p.opened === "pairs" ? 2 : 1)) * factor),
  );
  scores.forEach((s, k) => (g.players[k].score += s));
  g.results.push(scores);
  note(
    g,
    winner === null
      ? "Ortadaki taşlar bitti. El puanlandı."
      : `${g.players[winner].name} eli bitirdi!`,
  );
}
export function discard(g: Game, id: number) {
  const p = g.players[g.turn];
  if (!g.drawn || g.over) throw Error("Önce taş çekmelisiniz.");
  const t = p.hand.find((t) => t.id === id);
  if (!t) throw Error("Atmak için bir taş seçin.");
  if (g.taken !== null && (!p.opened || id === g.taken))
    throw Error(
      "Soldan aldığınız taşı kullanmalısınız; aynı taşı geri atamazsınız.",
    );
  const ending = p.hand.length === 1;
  if (g.pendingCollect?.player === g.turn) {
    const onTable = new Set(g.melds.flatMap((m) => m.tiles.map((v) => v.id)));
    if (g.pendingCollect.ids.some((id) => !onTable.has(id))) {
      g.penalties[g.turn] += 101;
      note(g, `${p.name}: geri toplanan taşlar yeniden açılmadan tur bitirildi, +101 ceza.`);
    }
    delete g.pendingCollect;
  }
  if (
    !ending &&
    (isWild(t, g.indicator) || g.melds.some((m) => extension(g, m, t)))
  ) {
    g.penalties[g.turn] += 101;
    note(g, `${p.name}: ${isWild(t, g.indicator) ? "okey" : "işlek taş"} atma cezası +101.`);
  }
  p.hand = p.hand.filter((t) => t.id !== id);
  g.discards[g.turn].push(t);
  if (ending) {
    finish(g, g.turn, isWild(t, g.indicator));
    return;
  }
  if (!g.deck.length) {
    finish(g, null);
    return;
  }
  g.turn = (g.turn + 1) % 4;
  g.drawn = false;
  g.taken = null;
  g.added = {};
  g.openedTurn = false;
  note(
    g,
    `Sıra ${g.players[g.turn].name.toLocaleLowerCase("tr-TR")} oyuncusunda.`,
  );
}
// Keep completed combinations before considering partial combinations or points.
export function timeoutDiscard(g: Game, preferPairs = false): Tile {
  const p = g.players[g.turn];
  const pairs = p.opened === "pairs" || (!p.opened && preferPairs);
  const legal = p.hand.filter((t) => t.id !== g.taken);
  if (!legal.length) throw Error("Atılabilecek taş bulunamadı.");
  const protectedIds = new Set(
    candidates(p.hand, g.indicator, pairs).flatMap((m) => m.tiles.map((t) => t.id)),
  );
  const loose = legal.filter((t) => !protectedIds.has(t.id));
  const pool = loose.length ? loose : legal;
  const ranked = pool.map((t) => {
    const remaining = p.hand.filter((v) => v.id !== t.id);
    const preserved = loose.length ? [] : bestMelds(remaining, g.indicator, pairs);
    const f = face(t, g.indicator);
    const connections = remaining.filter((v) => {
      const other = face(v, g.indicator);
      return pairs
        ? other.c === f.c && other.n === f.n
        : (other.n === f.n && other.c !== f.c) ||
          (other.c === f.c && Math.abs(other.n - f.n) <= 2);
    }).length;
    return {
      tile: t,
      kept: preserved.reduce((sum, m) => sum + m.tiles.length, 0),
      points: preserved.reduce((sum, m) => sum + total(m), 0),
      penalty: Number(isWild(t, g.indicator) || g.melds.some((m) => extension(g, m, t))),
      wild: Number(isWild(t, g.indicator)),
      connections,
      value: f.n,
    };
  });
  ranked.sort((a, b) => b.kept - a.kept || b.points - a.points ||
    a.penalty - b.penalty || a.wild - b.wild || a.connections - b.connections ||
    a.value - b.value || a.tile.id - b.tile.id);
  return ranked[0].tile;
}

function wantsToOpen(g: Game, hand: Tile[], melds: Meld[], pairs: boolean): boolean {
  const player = g.players[g.turn];
  if (player.opened || pairs || g.deck.length <= 16) return true;
  const used = melds.reduce((sum, m) => sum + m.tiles.length, 0);
  if (hand.length - used <= 4) return true;
  const minimum = g.escalating ? Math.max(101, (g.lastOpeningTotal ?? 0) + 1) : 101;
  return melds.reduce((sum, m) => sum + total(m), 0) >= minimum + (player.openingMargin ?? 0);
}
function leftOpening(g: Game, left: Tile, hand: Tile[]) {
  for (const pairs of [false, true]) {
    // Force the claimed tile into the opening, including alternative melds
    // that an unconstrained best-score search might leave out.
    for (const first of candidates(hand, g.indicator, pairs).filter((m) =>
      m.tiles.some((t) => t.id === left.id))) {
      const used = new Set(first.tiles.map((t) => t.id));
      const melds = [first, ...bestMelds(hand.filter((t) => !used.has(t.id)), g.indicator, pairs)];
      const trial = structuredClone(g);
      trial.players[trial.turn].hand = [...hand];
      trial.drawn = true;
      trial.taken = left.id;
      try {
        if (!wantsToOpen(g, hand, melds, pairs)) continue;
        openMelds(trial, melds, pairs);
        return { melds, pairs };
      } catch { /* Try another legal opening that includes the claimed tile. */ }
    }
  }
  return null;
}

export function botDraw(g: Game) {
  if (g.turn === 0 || g.over || g.drawn) return;
  const p = g.players[g.turn];
  const left = g.discards[(g.turn + 3) % 4].at(-1);
  let take = false;
  if (left) {
    const hand = [...p.hand, left];
    take = p.opened
      ? bestMelds(hand, g.indicator, p.opened === "pairs").some((m) => m.tiles.some((t) => t.id === left.id)) ||
        g.melds.some((m) => !!extension(g, m, left))
      : leftOpening(g, left, hand) !== null;
  }
  draw(g, take);
}

export function bot(g: Game) {
  if (g.turn === 0 || g.over) return;
  const p = g.players[g.turn];
  if (!g.drawn) botDraw(g);
  const claimed = !p.opened && g.taken !== null ? p.hand.find((t) => t.id === g.taken) : undefined;
  const opening = claimed ? leftOpening(g, claimed, p.hand) : null;
  const series = bestMelds(p.hand, g.indicator, p.opened === "pairs");
  const pairs = p.opened ? [] : bestMelds(p.hand, g.indicator, true);
  const choose = pairs.length >= 5 ? pairs : series;
  try {
    const melds = opening?.melds ?? choose;
    const asPairs = opening?.pairs ?? (pairs.length >= 5 || p.opened === "pairs");
    if (wantsToOpen(g, p.hand, melds, asPairs)) openMelds(g, melds, asPairs);
  } catch {
    /* Keep incomplete combinations on the rack. */
  }
  if (p.opened)
    for (const t of [...p.hand])
      for (let k = 0; k < g.melds.length; k++) {
        try {
          append(g, t.id, k);
          break;
        } catch {}
      }
  const kept = new Set(
    bestMelds(p.hand, g.indicator, p.opened === "pairs").flatMap((m) =>
      m.tiles.map((t) => t.id),
    ),
  );
  const utility = (t: Tile) => {
    const f = face(t, g.indicator);
    return (
      (isWild(t, g.indicator) ? 1000 : 0) +
      (kept.has(t.id) ? 100 : 0) +
      (g.melds.some((m) => extension(g, m, t)) ? 150 : 0) +
      p.hand.filter(
        (v) =>
          v.id !== t.id &&
          (face(v, g.indicator).n === f.n ||
            (face(v, g.indicator).c === f.c &&
              Math.abs(face(v, g.indicator).n - f.n) <= 2)),
      ).length *
        8 -
      f.n / 3
    );
  };
  const ts = [...p.hand].sort((a, b) => utility(a) - utility(b));
  discard(g, ts.find((t) => t.id !== g.taken)!.id);
}
