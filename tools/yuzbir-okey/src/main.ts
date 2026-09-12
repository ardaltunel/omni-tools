import "./style.css";
import "./table.css";
import "./omni.css";
import { moveRackTiles, sortRemainingTiles } from "./rack";
import { playEffect, unlockSound, type Effect } from "./sound";
import {
  newGame,
  timeoutDiscard,
  botDraw,
  draw,
  discard,
  openMelds,
  append,
  reclaim,
  replacementIndex,
  appendPair,
  extension,
  bot,
  bestMelds,
  validate,
  total,
  isWild,
  face,
  handPoints,
  colors,
  type Game,
  type Tile,
  type Meld,
} from "./engine";
const app = document.querySelector<HTMLDivElement>("#app")!;
let embeddedActive = true;
let g: Game;
let showHandPoints = false;
let savedUnassisted: boolean | undefined;
let savedCheckpoint: Game | null = null;
let savedRemaining = 30000;
try {
  const saved = JSON.parse(localStorage.getItem("sedir-game") ?? "null");
  if (saved?.version === 1) { const {turnCheckpoint: _checkpoint, turnRemaining: _remaining, showHandPoints: _points, unassisted: _mode, ...game} = saved; g = game; } else g = newGame();
  if (saved?.version === 1 && typeof saved.unassisted === "boolean") savedUnassisted = saved.unassisted;
  if (saved?.version === 1) { savedCheckpoint = saved.turnCheckpoint ?? null; savedRemaining = Number.isFinite(saved.turnRemaining) ? Math.max(0, Math.min(30000, saved.turnRemaining)) : 30000; }
  showHandPoints = saved?.version === 1 && saved.showHandPoints === true;
} catch {
  g = newGame();
}
// Update existing saves without restarting the current hand.
g.players.forEach((p) => { if (p.name === "Mert") p.name = "Melisa"; });
g.log = g.log.map((entry) => entry.replace(/Mert/g, "Melisa").replace(/mert/g, "melisa"));

const penaltyLayer = document.createElement("div");
penaltyLayer.className = "penalty-layer";
document.body.append(penaltyLayer);
let penaltyNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let selected = new Set<number>(),
  staged: Meld[] = [],
  modal = "",
  toast = "",
  timer: ReturnType<typeof setTimeout> | undefined;
let nextEscalating = preference("okey-escalating") === "on";
const roundOptions = [1, 3, 5, 7, 11];
let nextRounds = Number(preference("okey-rounds") ?? 1);
if (!roundOptions.includes(nextRounds)) nextRounds = 1;
let nextUnassisted = preference("okey-unassisted") === "on";
let unassisted = savedUnassisted ?? nextUnassisted;
let sound = preference("sedir-sound") !== "off";
let speed = Number(preference("sedir-speed") ?? 1400);
if (speed === 2400) {
  speed = 3700;
  preference("sedir-speed", String(speed));
}
let storageWarning = false;
let rackMode = preference("okey-rack-mode") === "pairs" ? "pairs" : "series";
let turnCheckpoint: Game | null = savedCheckpoint;
let turnRemaining = savedRemaining;
let lastTimerTick = Date.now();
let dragActive = false;
let volume = Number(preference("okey-volume") ?? 0.65);
const motionOrigins = new Map<string, DOMRect>();
const faceUpOkeys = new Set<number>();
let suppressClickUntil = 0;
let rackSlots: Record<number, number> = {};
try {
  rackSlots = JSON.parse(preference("sedir-rack") ?? "{}");
} catch {}
const icons: Record<string, string> = {
  back: "←",
  settings: "⚙",
  help: "?",
  sound: "♪",
  cup: "♜",
  sort: "⇄",
  chevron: "⌄",
  close: "×",
};
function tile(t: Tile, mini = false) {
  const f = face(t, g.indicator);
  return `<${mini ? "span" : "button"} data-visual-id="${t.id}" class="tile c${f.c} ${mini ? "mini" : ""} ${isWild(t, g.indicator) && (mini ? g.melds.some((m) => m.tiles.some((v) => v.id === t.id)) : !faceUpOkeys.has(t.id)) ? "flipped" : ""} ${isWild(t, g.indicator) ? "wild" : ""} ${t.fake ? "fake" : ""} ${!unassisted && !mini && g.melds.some((m) => extension(g, m, t) || replacementIndex(g, m, t) >= 0) ? "playable" : ""} ${selected.has(t.id) ? "selected" : ""}" ${mini ? 'tabindex="-1"' : `data-tile="${t.id}"`} aria-label="${t.fake ? "Sahte okey" : colors[f.c] + " " + f.n}${isWild(t, g.indicator) ? ", okey" : ""}" aria-pressed="${selected.has(t.id)}"><span>${t.fake ? "♣" : f.n}</span><i>${isWild(t, g.indicator) ? "★" : t.fake ? "◆" : "●"}</i></${mini ? "span" : "button"}>`;
}
function save() {
  try {
    localStorage.setItem(
      "sedir-game",
      JSON.stringify({ ...g, showHandPoints, unassisted, turnCheckpoint, turnRemaining }),
    );
  } catch {
    if (!storageWarning) {
      storageWarning = true;
      toast =
        "Tarayıcı kayıt alanı kullanılamıyor. Bu oyun yalnızca açık sekmede korunacak.";
    }
  }
}
function beep(effect: Effect = "drop") {
  playEffect(effect, sound, volume);
}
function notify(s: string) {
  toast = s;
  render();
  setTimeout(() => {
    if (toast === s) {
      toast = "";
      render();
    }
  }, 4500);
}
function act(fn: () => void) {
  try {
    const visibleIds = new Set(
      [...app.querySelectorAll<HTMLElement>("[data-visual-id]")].map(
        (el) => el.dataset.visualId,
      ),
    );
    const actorOrigin = app
      .querySelector([".south", ".east", ".north", ".west"][g.turn])
      ?.getBoundingClientRect();
    const previousTurn = g.turn,
      previousPenalty = g.penalties[g.turn],
      previousDeck = g.deck.length,
      previousMelds = g.melds.length,
      wasOver = g.over;
    const beforeAction = structuredClone(g);
    fn();
    if (previousTurn === 0 && g.turn === 0 && g.drawn && g.deck.length === beforeAction.deck.length && g.melds.flatMap(m => m.tiles).some(t => !beforeAction.melds.some(m => m.tiles.some(v => v.id === t.id)))) turnCheckpoint ??= beforeAction;
    if (previousTurn !== 0 && actorOrigin) {
      for (const t of [
        ...g.melds.flatMap((m) => m.tiles),
        ...g.discards.flat(),
      ])
        if (!visibleIds.has(String(t.id)))
          motionOrigins.set(String(t.id), actorOrigin);
    }
    if (g.turn !== previousTurn) {
      turnRemaining = 30000;
      turnCheckpoint = null;
    }
    if (g.over && !wasOver) beep("finish");
    else if (g.turn === 0 && previousTurn !== 0) beep("turn");
    else if (g.melds.length > previousMelds) beep("open");
    else if (g.deck.length < previousDeck) beep("draw");
    else beep("drop");
    if (previousTurn === 0 || g.over) selected.clear();
    else selected = new Set([...selected].filter(id => g.players[0].hand.some(tile => tile.id === id)));
    save();
    render();
    schedule();
    const penaltyAdded = g.penalties[previousTurn] - previousPenalty;
    if (penaltyAdded > 0) {
      const reason = g.log.find((entry) => entry.includes("ceza") && entry.includes("101"));
      if (previousTurn === 0) {
        const penaltyNotice = {
          amount: penaltyAdded,
          reason: reason?.includes("okey atma") ? "Okey attın" : reason?.includes("işlek taş") ? "Masaya işlenebilen bir taş attın" : "Geri topladığın taşları yeniden açmadan turu bitirdin",
          total: g.penalties[0],
        };
        penaltyLayer.innerHTML = `<div class="penalty-notice" role="alert" aria-atomic="true"><span class="penalty-notice-icon" aria-hidden="true">!</span><div><strong>+${penaltyNotice.amount} CEZA</strong><p>${escapeText(penaltyNotice.reason)}</p><small>Bu elde toplam cezan: ${penaltyNotice.total}</small></div></div>`;
        clearTimeout(penaltyNoticeTimer);
        penaltyNoticeTimer = setTimeout(() => {
          penaltyLayer.replaceChildren();
        }, 2750);
      }
      if (previousTurn !== 0) notify(`${reason ?? `${g.players[previousTurn].name}: +${penaltyAdded} ceza.`} Bu elde toplam ceza: ${g.penalties[previousTurn]}.`);
      beep("error");
    }
  } catch (e) {
    beep("error");
    notify((e as Error).message);
  }
}
function schedule() {
  clearTimeout(timer);
  if (embeddedActive && !document.hidden && !g.over && g.turn !== 0 && !modal && !dragActive)
    timer = setTimeout(
      () => {
        if (!g.drawn) {
          const player = g.turn;
          const leftOrigin = app.querySelector([".take-left", ".discard-zone", ".opposite", ".upper"][player])?.getBoundingClientRect();
          act(() => botDraw(g));
          animateBotDraw(player, g.taken !== null ? leftOrigin : undefined);
        } else act(() => bot(g));
      },
      g.drawn ? speed : Math.max(450, speed * 0.65),
    );
}

function player(k: number, pos: string) {
  const p = g.players[k];
  return `<div class="player ${pos} ${g.turn === k && !g.over ? "active" : ""}"><div class="avatar avatar${k}">${p.name[0]}<span class="level">${k === 0 ? "1" : k === 1 ? "12" : k === 2 ? "18" : "9"}</span></div><div class="player-info"><strong>${p.name}${k === 0 ? ' <span class="you">SİZ</span>' : ""}</strong><span>${g.turn === k && !g.over ? (k === 0 ? "Sıra sizde" : g.drawn ? "Taşları düşünüyor…" : "Taş çekiyor…") : p.opened ? (p.opened === "pairs" ? "Çift açtı" : "Seri açtı") : k === 0 ? "İyi oyunlar" : "Bot oyuncu"}</span></div></div>`;
}
function render() {
  const motionBefore = captureTiles();
  const drawOrigin = app.querySelector(".deck")?.getBoundingClientRect();
  const me = g.players[0];
  for (const id of faceUpOkeys) {
    if (!me.hand.some((t) => t.id === id && isWild(t, g.indicator)))
      faceUpOkeys.delete(id);
  }
  const plan = staged.length ? staged : unassisted ? bestMelds(me.hand, g.indicator) : arrangedMelds();
  const showRemaining = (!unassisted && rackMode === "pairs") || !!me.opened;
  const sum = !showHandPoints && !unassisted
    ? 0
    : showRemaining
      ? handPoints(me.hand, g.indicator)
      : plan.reduce((s, m) => s + total(m), 0);
  const can = g.turn === 0 && !g.over;
  const used = new Set(staged.flatMap((m) => m.tiles.map((t) => t.id)));
  const hand = me.hand.filter((t) => !used.has(t.id));
  const occupied = new Set<number>();
  for (const t of me.hand) {
    const slot = rackSlots[t.id];
    if (Number.isInteger(slot) && slot >= 0 && slot < 32 && !occupied.has(slot))
      occupied.add(slot);
    else delete rackSlots[t.id];
  }
  for (const t of me.hand)
    if (rackSlots[t.id] === undefined) {
      const slot = Array.from({ length: 32 }, (_, i) => i).find(
        (i) => !occupied.has(i),
      )!;
      rackSlots[t.id] = slot;
      occupied.add(slot);
    }
  rackSlots = Object.fromEntries(me.hand.map((t) => [t.id, rackSlots[t.id]]));
  preference("sedir-rack", JSON.stringify(rackSlots));
  const meldMarkup = (pairs: boolean) =>
    g.melds
      .map((m, k) => ({ m, k }))
      .filter(({ m }) => (m.kind === "pair") === pairs)
      .map(
        ({ m, k }) =>
          `<div class="meld" style="${m.kind !== "pair" ? meldPosition(k) : ""}" data-meld="${k}" role="button" tabindex="0" aria-label="${g.players[m.owner].name} oyuncusunun perine taş işle"><span class="meld-owner">${g.players[m.owner].name}</span><div>${m.tiles.map((t) => tile(t, true)).join("")}</div></div>`,
      )
      .join("");
  const pile = (k: number, cls: string) =>
    `<div class="discard-pile ${cls}">${g.discards[k].length ? tile(g.discards[k].at(-1)!, true) : '<span class="empty-slot"></span>'}</div>`;
  app.innerHTML = `<main class="game-stage ${unassisted ? "unassisted" : ""} ${can ? "your-turn" : ""}" aria-label="Okey 101 oyun masası">
    <div class="turn-clock" aria-label="Hamle süresi"><span>◷</span><div><i style="width:${turnRemaining / 300}%"></i></div></div><header class="game-hud"><a class="mini-brand" href="./">OKEY <b>101</b></a></header>
    <nav class="game-tools" aria-label="Masa kontrolleri"><button class="help-button" data-action="help">KURALLAR</button><button class="sound-toggle ${sound ? "is-on" : "is-off"}" data-action="sound" aria-label="${sound ? "Sesi kapat" : "Sesi aç"}" aria-pressed="${sound}" title="${sound ? "Ses açık" : "Ses kapalı"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/>${sound ? '<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg></button><button class="settings-toggle" data-action="settings" aria-label="Ayarlar" title="Ayarlar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.5 2.2-1.6.9-2.2-.6-3 5.2 1.7 1.5v1.8l-1.7 1.5 3 5.2 2.2-.6 1.6.9L9 23h6l.5-2.2 1.6-.9 2.2.6 3-5.2-1.7-1.5V12l1.7-1.5-3-5.2-2.2.6-1.6-.9L15 3Z" transform="translate(1.2 0) scale(.9)"/><circle cx="12" cy="11.7" r="3"/></svg></button></nav>
    ${player(2, "north")}${player(3, "west")}${player(1, "east")}
    <section class="series-board grid-board" aria-label="Açık seri ve perler"><div class="board-center-line"></div><div class="meld-area">${meldMarkup(false)}</div></section>
    <section class="pairs-board grid-board" aria-label="Açık çiftler"><div class="pair-lines"></div><div class="meld-area">${meldMarkup(true)}</div></section>
    ${g.escalating ? `<aside class="opening-limits" aria-label="Katlamalı açılış sınırları" aria-live="polite"><div><span>Seri: en az <strong>${Math.max(101, (g.lastOpeningTotal ?? 0) + 1)}</strong></span><small>${g.lastOpeningTotal ? `${g.lastSeriesPlayer !== undefined ? g.players[g.lastSeriesPlayer].name : "Son açılış"}: ${g.lastOpeningTotal} puan` : "Henüz seri açılmadı"}</small></div><div><span>Çift: en az <strong>${Math.max(5, (g.lastOpeningPairs ?? 0) + 1)} çift</strong></span><small>${g.lastOpeningPairs ? `${g.lastPairsPlayer !== undefined ? g.players[g.lastPairsPlayer].name : "Son açılış"}: ${g.lastOpeningPairs} çift` : "Henüz çift açılmadı"}</small></div></aside>` : ""}
    <div class="table-mode"><span>Tek</span><span class="${unassisted ? "" : "assisted"}">${unassisted ? "Yardımsız" : "Yardımlı"}</span><span class="${g.escalating ? "escalating" : ""}">${g.escalating ? "Katlamalı" : "Katlamasız"}</span><span>${g.rounds === 1 ? "1 El" : `${g.round}/${g.rounds} El`}</span></div>
    <div class="indicator" title="Gösterge · Okey: ${colors[g.indicator.c]} ${(g.indicator.n % 13) + 1}">${tile(g.indicator, true)}</div>
    <button class="deck" data-action="draw" ${!can || g.drawn ? "disabled" : ""} aria-label="Ortadan taş çek"><span class="deck-face"></span><b>${g.deck.length}</b></button>
    ${pile(2, "upper")}${pile(1, "opposite")}
    <button class="take-left" data-action="left" ${!can || g.drawn || !g.discards[3].length ? "disabled" : ""} aria-label="Soldan taş al">${g.discards[3].length ? tile(g.discards[3].at(-1)!, true) : '<span class="empty-slot"></span>'}<i>❯</i></button>
    <button class="discard-zone" data-action="discard" ${!can || !g.drawn ? "disabled" : ""} aria-label="Seçili taşı at">${g.discards[0].length ? tile(g.discards[0].at(-1)!, true) : '<span class="empty-slot"></span>'}<i>❮</i></button>
    <div class="turn-controls"><button data-action="open" ${!can || !g.drawn ? "disabled" : ""}><span>▤</span> SERİ AÇ</button><button data-action="pair" ${!can || !g.drawn ? "disabled" : ""}><span>▥</span> ÇİFT AÇ</button><button data-action="collect" ${!can || (!staged.length && !turnCheckpoint) ? "disabled" : ""}>GERİ TOPLA</button><button data-action="process-all" ${!can || !g.drawn || !me.opened ? "disabled" : ""}>TAŞLARI İŞLE</button><button data-action="process-pair" ${!can || !g.drawn || !me.opened ? "disabled" : ""}>ÇİFT İŞLE</button></div>
    ${g.taken !== null && !me.opened ? '<button class="return-taken" data-action="undo-left">GERİ<br>BIRAK</button>' : ""}
    <div class="hand-total" aria-label="${showRemaining ? "Elde kalan taşların puanı" : "Açılabilecek per toplamı"}: ${sum}" title="${showRemaining ? "Elde kalan taşların sayı toplamı (okey: 101)" : "Bulunan perlerin toplamı"}">${sum}</div>
    <section class="rack-section" aria-label="Taşlığınız"><div class="rack">${[
      0, 1,
    ]
      .map(
        (row) =>
          `<div class="rack-row">${Array.from({ length: 16 }, (_, col) => {
            const index = row * 16 + col;
            return `<div class="rack-slot" data-slot="${index}">${hand.find((t) => rackSlots[t.id] === index) ? tile(hand.find((t) => rackSlots[t.id] === index)!) : ""}</div>`;
          }).join("")}</div>`,
      )
      .join("")}</div></section>
    <button class="sort-wing sort-pairs" data-action="pairsort"><span class="sort-tiles"><i>5</i><i>5</i></span><b>ÇİFT<br>DİZ</b></button><button class="sort-wing sort-series" data-action="sort"><span class="sort-tiles"><i>1</i><i>2</i><i>3</i></span><b>SERİ<br>DİZ</b></button>
    ${staged.length ? `<div class="staging">${staged.map((m, k) => `<button class="staged-group" data-unstage="${k}">${m.tiles.map((t) => tile(t, true)).join("")}<span>${total(m)} ×</span></button>`).join("")}</div>` : ""}
  ${toast ? `<div class="toast" role="status">${escapeText(toast)}</div>` : ""}</main><dialog aria-labelledby="dialog-title">${modalContent()}</dialog>`;
  bind();
  animateTiles(motionBefore, drawOrigin);
  if (modal || g.over) {
    const dialog = app.querySelector("dialog")!;
    dialog.showModal();
    dialog.oncancel = (e) => {
      e.preventDefault();
      if (!g.over) action("close");
    };
  }
}
function escapeText(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function modalContent() {
  if (g.over) {
    const standings = g.players.map((p, k) => ({ ...p, k })).sort((a, b) => a.score - b.score);
    const leaders = standings.filter((p) => p.score === standings[0].score);
    return `<div class="game-results"><header><span class="eyebrow">EL SONUCU</span><h2 id="dialog-title">${leaders.length > 1 ? "Puanlar eşit" : `${escapeText(leaders[0].name)} ${g.round < g.rounds ? "önde" : "kazandı"}`}</h2><p>En düşük ceza puanı kazanır.</p></header><div class="results-labels"><span>Oyuncu</span><span>Ceza puanı</span></div><ol class="results-list">${standings.map((p, index) => {
      const place = standings.findIndex((other) => other.score === p.score) + 1;
      return `<li class="${p.k === 0 ? "is-you" : ""} ${place === 1 ? "is-winner" : ""}"><span class="results-place">${place}</span><span class="results-avatar" aria-hidden="true">${escapeText(p.name[0])}</span><span class="results-name">${escapeText(p.name)}${p.k === 0 ? '<small>Sen</small>' : ""}</span>${place === 1 ? '<span class="results-badge">' + (leaders.length > 1 ? "Ortak lider" : "Kazanan") + '</span>' : ""}<strong class="results-points">${p.score}</strong></li>`;
    }).join("")}</ol><footer><span>${g.round} / ${g.rounds} el tamamlandı</span><button class="primary" data-action="next">${g.round < g.rounds ? "Sonraki el" : "Yeni oyun başlat"}</button></footer></div>`;
  }
  const title =
    modal === "help"
      ? "Masaya hoş geldiniz"
      : modal === "settings"
        ? "Oyun ayarları"
        : modal === "chat"
          ? "Masa sohbeti"
          : modal === "new"
            ? "Yeni bir masa kuralım mı?"
            : g.over
              ? "El tamamlandı"
              : "";
  return `<div class="modal-head"><span class="eyebrow">OKEY 101</span>${!g.over ? '<button data-action="close" class="icon-btn" aria-label="Kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>' : ""}</div><h2 id="dialog-title">${title}</h2>${
    modal === "help"
      ? `<div class="rules"><p><b>1. Taş çek, taş at.</b> Başlayan oyuncu 22, diğerleri 21 taş alır. İlk oyuncu çekmeden atar. Sonraki turlarda ortadan ya da soldan bir taş çekilir, bir taş atılır.</p><p><b>2. En az 101 ile aç.</b> Aynı renkte en az üç ardışık sayı veya aynı sayının farklı renklerinden üç/dört taş bir perdir. 12–13–1 geçersizdir. Beş aynı renk ve sayılı çiftle de açabilirsiniz. Seri ve çift açma aynı elde karıştırılmaz.</p><p><b>3. Perlerini hazırla.</b> “Seri diz” ile taşlarınızı düzenleyin ve seçim yapmadan “Seri aç”a basın. Açılabilir perler birlikte değerlendirilir. Tek bir per açmak için taşlarını seçip “Seri aç”ı kullanın. “Çift aç” otomatik çiftleri değerlendirir.</p><p><b>4. Okey ve işleme.</b> Göstergenin bir üstü okeydir; her taş yerine geçer. Sahte okey o sayının kendi taşıdır. Açtıktan sonra bir taş seçip masadaki pere dokunun; aynı pere tur başına en fazla iki taş eklenir. Okeyin temsil ettiği gerçek taşı seçip pere dokunarak okeyi geri alabilirsiniz. İki farklı renk ve okeyden oluşan üçlü sette eksik iki rengi birlikte vermelisiniz. Açık çiftlere iki aynı taşı seçerek yeni çift işleyebilirsiniz. Son taşı atmak için saklayın. Perin altındaki noktadan veya sağ tuşla sürükleyerek grubu birlikte taşıyın. Dolu yuvaya bırakılan taş komşularını kaydırır. Geri toplanan taşlar aynı turda yeniden açılırsa ceza verilmez. Bu taşlar yeniden açılmadan sıra bitirilirse +101 ceza uygulanır.</p><p><b>5. Soldan alma.</b> Kapalıysanız aldığınız taşı aynı tur açılışınızda kullanmalısınız. Açıkken aldığınız taşı geri atamazsınız. Kapalıyken açamıyorsanız “Soldan almayı geri al” ile taşı iade edebilirsiniz.</p><p><b>6. Puanlama.</b> Açmayan 202; açan elinde kalan sayıların toplamı kadar ceza alır. Elde okey 101, çift açanın kalan toplamı iki kattır. Biten −101 alır; okeyle veya elden bitiş puanları ikiye katlar. İşler taş/okey atmanın cezası +101’dir. Oyun ayarlarda seçilen el sayısı kadar sürer; puanlar birikir. El sonunda en düşük puan kazanır. Yeni oyun sıfır puanla başlar.</p><p>Katlamalı modda seri puanı veya çift sayısı önceki açılıştan yüksek olmalıdır. Yardımsız modda otomatik dizme ve işleme yardımları kapalıdır. Mod ve el sayısı yeni oyunda uygulanır. Geçersiz açma engellenir; hatalı denemeden ceza verilmez. İnternet oyuncuları yerine üç yerel botla oynarsınız.</p></div>`
      : modal === "settings"
        ? `<div class="settings-layout"><section class="settings-card"><h3>Oyun yardımı</h3><label class="settings-row" for="unassisted"><span>Yardımsız oyun<small>Otomatik yardımlar kapalı.</small></span><input id="unassisted" class="sound-switch" role="switch" type="checkbox" ${nextUnassisted ? "checked" : ""}/></label></section>
          <section class="settings-card" aria-labelledby="audio-title"><h3 id="audio-title">Ses</h3>
            <label class="settings-row" for="sound"><span>Oyun sesleri<small>Taş ve sıra bildirimleri</small></span><input id="sound" class="sound-switch" role="switch" type="checkbox" ${sound ? "checked" : ""}/></label>
            <div class="volume-heading"><label for="volume">Ses düzeyi</label><output id="volume-value" for="volume">%${Math.round(volume * 100)}</output></div>
            <input id="volume" type="range" aria-label="Ses düzeyi" min="0" max="1" step="0.05" value="${volume}" ${sound ? "" : "disabled"}/>
          </section>
          <section class="settings-card"><h3>Açma kuralı</h3><label class="settings-row" for="escalating"><span>Katlamalı oyun<small>Önceki açılışı geçmek gerekir.</small></span><input id="escalating" class="sound-switch" role="switch" type="checkbox" ${nextEscalating ? "checked" : ""}/></label></section><section class="settings-card" aria-labelledby="tempo-title"><h3 id="tempo-title">Oyun hızı</h3><label for="speed">Bot hızı</label><select id="speed"><option value="700" ${speed === 700 ? "selected" : ""}>Hızlı · 0,7 saniye</option><option value="1400" ${speed === 1400 ? "selected" : ""}>Normal · 1,4 saniye</option><option value="3700" ${speed === 3700 ? "selected" : ""}>Yavaş · 3,7 saniye</option></select></section>
          <section class="settings-card"><h3>El sayısı</h3><label for="rounds">El sayısı</label><select id="rounds">${roundOptions.map(count => `<option value="${count}" ${nextRounds === count ? "selected" : ""}>${count} el</option>`).join("")}</select></section><section class="settings-actions" aria-label="Oyun işlemleri"><div><small>Mod ve el sayısı yeni oyunda uygulanır.</small></div><button data-action="new" class="settings-new">Yeni oyun başlat</button></section>
        </div>`
        : modal === "new"
          ? '<p>Mevcut oyun ve skorlar sıfırlanacak. Ayarlarınız korunur.</p><button class="primary" data-action="confirm-new">Yeni masayı kur</button>'
          : modal === "chat"
            ? `<p class="muted">Bot masası · Hazır masa mesajları</p><div class="chat-options">${["İyi oyunlar!", "Güzel eldi!", "Bir çay molası ☕"].map((s) => `<button data-chat="${s}">${s}</button>`).join("")}</div><div class="activity">${g.log.map((s) => `<p>${escapeText(s)}</p>`).join("")}</div>`
            : ""
  }`;
}
function bind() {
  (app.querySelectorAll<HTMLElement>("[data-action]").forEach(
    (a) =>
      (a.onclick = () => {
        Date.now() < suppressClickUntil || action(a.dataset.action!);
      }),
  ),
    app.querySelectorAll<HTMLElement>("[data-tile]").forEach((a) => {
      ((a.onclick = () => {
        if (Date.now() < suppressClickUntil) return;
        const i = Number(a.dataset.tile);
        (selected.has(i) ? selected.delete(i) : selected.add(i), render());
      }),
        (a.onpointerdown = (i) => startTilePointer(a, i)),
        (a.oncontextmenu = (i) => i.preventDefault()),
        (a.onkeydown = (i) => {
          i.key.toLowerCase() === "g" &&
            ((selected = new Set(rackGroup(Number(a.dataset.tile)))), render());
        }));
    }));
  for (const [a, i] of [
    [".deck", "deck"],
    [".take-left", "left"],
  ]) {
    const s = app.querySelector<HTMLElement>(a);
    s && (s.onpointerdown = (l) => startTilePointer(s, l, i as "deck" | "left"));
  }
  (app.querySelectorAll<HTMLElement>("[data-meld]").forEach((a) => {
    const i = (event?: MouseEvent) => {
      const targetIndex = Number(a.dataset.meld);
      if (selected.size === 1 && g.melds[targetIndex].kind === "pair") {
        const stone = g.players[0].hand.find(t => selected.has(t.id));
        if (stone && replacementIndex(g, g.melds[targetIndex], stone) >= 0) { act(() => { if (g.turn !== 0) throw Error("Sıranızı bekleyin."); reclaim(g, stone.id, targetIndex); }); return; }
      }
      if (
        selected.size > 0 &&
        selected.size <= 2 &&
        g.melds[Number(a.dataset.meld)].kind === "pair"
      ) {
        act(() => {
          if (g.turn !== 0) throw Error("Sıranızı bekleyin.");
          appendPair(g, pairIds([...selected]));
        });
        return;
      }
      if (selected.size === 2) { act(() => processTile([...selected][0], Number(a.dataset.meld), [...selected][1])); return; }
      if (selected.size !== 1) {
        notify("İşlemek için taşlığınızdan bir taş seçin.");
        return;
      }
      act(() => processTile([...selected][0], Number(a.dataset.meld), undefined, event ? meldDropEnd(a, event.clientX, event.clientY) : undefined));
    };
    ((a.onclick = i),
      (a.onkeydown = (s) => {
        s.key === "Enter" && i();
      }));
  }),
    app.querySelectorAll<HTMLElement>("[data-unstage]").forEach(
      (a) =>
        (a.onclick = () => {
          (staged.splice(Number(a.dataset.unstage), 1), render());
        }),
    ),
    app.querySelectorAll<HTMLElement>("[data-chat]").forEach(
      (a) =>
        (a.onclick = () => {
          (g.log.unshift(`Siz: ${a.dataset.chat}`), save(), render());
        }),
    ));
  const rounds = app.querySelector<HTMLSelectElement>("#rounds");
  if (rounds) rounds.onchange = () => { const count = Number(rounds.value); if (roundOptions.includes(count)) { nextRounds = count; preference("okey-rounds", String(count)); } };
  const escalating = app.querySelector<HTMLInputElement>("#escalating");
  if (escalating) escalating.onchange = () => { nextEscalating = escalating.checked; preference("okey-escalating", nextEscalating ? "on" : "off"); render(); };
  const assistance = app.querySelector<HTMLInputElement>("#unassisted");
  if (assistance) assistance.onchange = () => { save(); nextUnassisted = assistance.checked; preference("okey-unassisted", nextUnassisted ? "on" : "off"); render(); };
  const e = app.querySelector<HTMLInputElement>("#sound");
  e &&
    (e.onchange = () => {
      ((sound = e.checked), preference("sedir-sound", sound ? "on" : "off"));
      const a = app.querySelector<HTMLInputElement>("#volume");
      a && (a.disabled = !sound);
    });
  const t = app.querySelector<HTMLInputElement>("#volume");
  t &&
    (t.oninput = () => {
      volume = Number(t.value);
      const a = app.querySelector<HTMLElement>("#volume-value");
      (a && (a.textContent = `%${Math.round(volume * 100)}`),
        preference("okey-volume", String(volume)),
        beep("drop"));
    });
  const r = app.querySelector<HTMLSelectElement>("#speed");
  r &&
    (r.onchange = () => {
      ((speed = Number(r.value)), preference("sedir-speed", String(speed)));
    });
}
function action(e: string) {
  if (unassisted && ["sort", "pairsort", "process-all"].includes(e)) return;
  if (["help", "settings", "chat"].includes(e)) {
    ((modal = e), clearTimeout(timer), render());
    return;
  }
  if (e === "close") {
    ((modal = ""), render(), schedule());
    return;
  }
  if (e === "sound") {
    ((sound = !sound), preference("sedir-sound", sound ? "on" : "off"));
    const t = app.querySelector<HTMLInputElement>("#volume");
    (t && (t.disabled = !sound), render());
    return;
  }
  if (e === "new" || e === "confirm-new" || e === "next") {
    (clearTimeout(penaltyNoticeTimer),
      penaltyLayer.replaceChildren(),
      act(() => {
        const continuing = e === "next" && g.over && g.round < g.rounds;
        selected.clear();
        const escalating = g.escalating;
        g = continuing ? newGame(g) : newGame(undefined, g.players.slice(1).map(p => p.name));
        g.escalating = continuing ? escalating : nextEscalating;
        if (!continuing) { g.rounds = nextRounds; unassisted = nextUnassisted; }
        (
          (showHandPoints = !1),
          faceUpOkeys.clear(),
          (staged = []),
          (rackSlots = {}),
          (turnCheckpoint = null),
          (turnRemaining = 3e4),
          (modal = ""));
      }));
    return;
  }
  if (e === "clear") {
    (selected.clear(), (staged = []), render());
    return;
  }
  if (e === "sort" || e === "pairsort") {
    ((showHandPoints = !0),
      (rackMode = e === "pairsort" ? "pairs" : "series"),
      preference("okey-rack-mode", rackMode),
      beep("sort"),
      (rackSlots = {}));
    const t = bestMelds(g.players[0].hand, g.indicator, e === "pairsort"),
      r = new Set(t.flatMap((o) => o.tiles.map((c) => c.id))),
      a =
        e === "sort"
          ? bestMelds(
              g.players[0].hand.filter((o) => !r.has(o.id)),
              g.indicator,
              !0,
            )
          : [],
      i = [...t, ...a],
      s = new Set(i.flatMap((o) => o.tiles.map((c) => c.id)));
    g.players[0].hand = [
      ...i.flatMap((o) => o.tiles),
      ...sortRemainingTiles(
        g.players[0].hand.filter((o) => !s.has(o.id)),
        e === "sort" ? t.flatMap((meld) => meld.tiles) : [],
        g.indicator,
      ),
    ];
    const l = new Set();
    for (const o of i) {
      let c = -1;
      for (let d = 0; d < 2 && c < 0; d++)
        for (let u = 0; u <= 16 - o.tiles.length; u++) {
          const f = d * 16 + u;
          if (o.tiles.every((p, m) => !l.has(f + m))) {
            c = f;
            break;
          }
        }
      c < 0 ||
        (o.tiles.forEach((d, u) => {
          ((rackSlots[d.id] = c + u), l.add(c + u));
        }),
        !a.includes(o) &&
          (c + o.tiles.length) % 16 !== 0 &&
          l.add(c + o.tiles.length));
    }
    const loose = g.players[0].hand.filter(stone => rackSlots[stone.id] === undefined);
    const lastMeldSlot = Math.max(-1, ...Object.values(rackSlots));
    let tail = lastMeldSlot + 1;
    if (l.has(tail) && tail + 1 + loose.length <= 32) tail++;
    if (tail + loose.length <= 32) {
      loose.forEach(stone => { rackSlots[stone.id] = tail++; });
    } else {
      // When spacing fills the rack, keep the hand order rather than backfill gaps.
      g.players[0].hand.forEach((stone, slot) => { rackSlots[stone.id] = slot; });
    }
    (save(), render());
    return;
  }
  if (g.turn !== 0 || g.over) {
    notify("Hamle yapmak için sıranızı bekleyin.");
    return;
  }
  act(() => {
    if ((e === "draw" && draw(g), e === "left" && draw(g, !0), e === "discard")) {
      if (staged.length)
        throw Error("Önce hazırladığınız perleri açın veya seçimi temizleyin.");
      if (selected.size !== 1) throw Error("Atmak için tek bir taş seçin.");
      discard(g, [...selected][0]);
    }
    if (e === "collect") {
      if (turnCheckpoint) {
        const t = new Set(turnCheckpoint.melds.flatMap((i) => i.tiles.map((s) => s.id))),
          r = g.melds
            .flatMap((i) => i.tiles.map((s) => s.id))
            .filter((i) => !t.has(i)),
          a = g.pendingCollect?.ids ?? [];
        ((g = turnCheckpoint),
          (turnCheckpoint = null),
          (g.pendingCollect = { player: 0, ids: [...new Set([...a, ...r])] }),
          g.log.unshift(
            "Taşlar geri toplandı. Tur bitmeden yeniden açılmazsa +101 ceza uygulanır.",
          ));
      }
      staged = [];
    }
    if (e === "process-all") {
      let t = 0;
      const reclaimed = new Set<number>();
      for (const stone of [...g.players[0].hand]) {
        const index = g.melds.findIndex(m => replacementIndex(g, m, stone) >= 0);
        if (index < 0) continue;
        const wild = g.melds[index].tiles[replacementIndex(g, g.melds[index], stone)];
        const second = g.players[0].hand.find(v => v.id !== stone.id && !isWild(v, g.indicator) && face(v, g.indicator).n === face(stone, g.indicator).n && face(v, g.indicator).c !== face(stone, g.indicator).c && !g.melds[index].tiles.some(w => !isWild(w, g.indicator) && face(w, g.indicator).c === face(v, g.indicator).c));
        try { reclaim(g, stone.id, index, second?.id); } catch { continue; }
        reclaimed.add(wild.id);
        t++;
      }
      const remaining = () => g.players[0].hand.filter(stone => !reclaimed.has(stone.id));
      for (const r of bestMelds(remaining(), g.indicator, !0))
        try {
          (appendPair(
            g,
            r.tiles.map((a) => a.id),
          ),
            (t += 2));
        } catch {}
      for (const r of remaining())
        for (let a = 0; a < g.melds.length; a++)
          try {
            (append(g, r.id, a), t++);
            break;
          } catch {}
      if (!t) throw Error("Masaya işlenebilecek taş bulunamadı.");
    }
    if (e === "process-pair" && unassisted && !selected.size) throw Error("İşlemek istediğiniz iki taşı seçin.");
    if (e === "process-pair")
      if (selected.size) appendPair(g, pairIds([...selected]));
      else {
        let t = 0;
        for (const r of bestMelds(g.players[0].hand, g.indicator, !0))
          try {
            (appendPair(
              g,
              r.tiles.map((a) => a.id),
            ),
              t++);
          } catch {}
        if (!t)
          throw Error(
            "Çift işlemek için eliniz ve masada çiftler açık olmalı; elinizde aynı renk ve sayıdan iki taş bulunmalı.",
          );
      }
    if (e === "stage") {
      const t = g.players[0].hand.filter((a) => selected.has(a.id)),
        r = validate(t, g.indicator);
      if (!r)
        throw Error(
          "En az üç taş seçin: aynı renk ardışık ya da farklı renk aynı sayı.",
        );
      staged.push(r);
    }
    if (e === "open" || e === "pair") {
      const t = e === "pair",
        r = t
          ? unassisted ? manualMelds(true) : bestMelds(g.players[0].hand, g.indicator, !0)
          : staged.length
            ? staged
            : selected.size
              ? [
                  validate(
                    g.players[0].hand.filter((i) => selected.has(i.id)),
                    g.indicator,
                  ),
                ].filter((m): m is Meld => m !== null)
              : arrangedMelds(),
        a = structuredClone(g);
      (openMelds(g, r, t), (turnCheckpoint ??= a), (staged = []));
    }
    if (e === "undo-left") {
      if (g.taken === null || g.players[0].opened)
        throw Error("Geri alınabilecek kapalı bir soldan alma yok.");
      const t = g.players[0].hand.findIndex((a) => a.id === g.taken);
      if (t < 0) throw Error("Geri bırakılacak taş elinizde bulunamadı.");
      const r = g.taken;
      (g.discards[3].push(g.players[0].hand.splice(t, 1)[0]),
        (g.taken = null),
        (g.drawn = !1),
        (staged = staged.filter((a) => !a.tiles.some((i) => i.id === r))),
        delete rackSlots[r],
        (modal = ""));
    }
  });
}
document.addEventListener("keydown", (e) => {
  (e.key === "Escape" && !g.over && ((modal = ""), selected.clear(), render(), schedule()),
    e.key === "Enter" &&
      e.target === document.body &&
      selected.size === 1 &&
      !modal &&
      action("discard"));
});
save();
render();
schedule();
document.addEventListener("pointerdown", unlockSound, { passive: !0 });
setInterval(() => {
  const e = Date.now(),
    t = Math.min(e - lastTimerTick, 1e3);
  if (((lastTimerTick = e), !embeddedActive || g.turn !== 0 || g.over || modal || document.hidden || dragActive))
    return;
  turnRemaining = Math.max(0, turnRemaining - t);
  save();
  const r = app.querySelector<HTMLElement>(".turn-clock i");
  (r && (r.style.width = turnRemaining / 300 + "%"),
    !(turnRemaining > 0) &&
      act(() => {
        if (g.taken !== null && !g.players[0].opened) {
          const i = g.players[0],
            s = i.hand.findIndex((l) => l.id === g.taken);
          (s >= 0 && g.discards[3].push(i.hand.splice(s, 1)[0]),
            (g.taken = null),
            (g.drawn = !1));
        }
        (g.drawn || draw(g), (staged = []));
        const a = timeoutDiscard(g, rackMode === "pairs");
        (discard(g, a.id), g.log.unshift("Süre dolduğu için otomatik taş atıldı."));
      }));
}, 250);
function meldDropEnd(element: HTMLElement, x: number, y: number): -1 | 1 {
  const bounds = element.getBoundingClientRect();
  return matchMedia("(orientation: portrait)").matches
    ? (y < bounds.top + bounds.height / 2 ? -1 : 1)
    : (x < bounds.left + bounds.width / 2 ? -1 : 1);
}
function processTile(e: number, t: number, second?: number, end?: -1 | 1) {
  if (second !== undefined) { const first = g.players[0].hand.find(v => v.id === e); if (first && replacementIndex(g, g.melds[t], first) < 0) reclaim(g, second, t, e); else reclaim(g, e, t, second); return; }
  if (g.turn !== 0) throw Error("Sıranızı bekleyin.");
  try {
    append(g, e, t, end);
  } catch (r) {
    try {
      reclaim(g, e, t);
    } catch {
      throw r;
    }
  }
}
function rackGroup(e: number) {
  const t = rackSlots[e],
    r = Math.floor(t / 16),
    a = (o: number) => g.players[0].hand.find((c) => rackSlots[c.id] === o);
  let i = t,
    s = t;
  for (; i > r * 16 && a(i - 1);) i--;
  for (; s < r * 16 + 15 && a(s + 1);) s++;
  const l = Array.from({ length: s - i + 1 }, (o, c) => a(i + c)).filter((tile): tile is Tile => tile !== undefined);
  return validate(l, g.indicator) || validate(l, g.indicator, 0, !0)
    ? l.map((o) => o.id)
    : [e];
}
function manualMelds(pairs: boolean): Meld[] {
  const melds: Meld[] = [];
  let group: Tile[] = [];
  const flush = () => {
    const meld = validate(group, g.indicator, 0, pairs);
    if (meld) melds.push(meld);
    group = [];
  };
  for (let slot = 0; slot < 32; slot++) {
    if (slot === 16) flush();
    const stone = g.players[0].hand.find(t => rackSlots[t.id] === slot);
    if (!stone) flush();
    else {
      group.push(stone);
      if (pairs && group.length === 2) flush();
    }
  }
  flush();
  return melds;
}
function arrangedMelds() {
  if (unassisted) return manualMelds(false);
  if (!Object.keys(rackSlots).length) return bestMelds(g.players[0].hand, g.indicator);
  const e: Meld[] = [];
  let t: Tile[] = [];
  const r = () => {
    (t.length >= 3 && e.push(...bestMelds(t, g.indicator)), (t = []));
  };
  for (let a = 0; a < 32; a++) {
    a === 16 && r();
    const i = g.players[0].hand.find((s) => rackSlots[s.id] === a);
    i ? t.push(i) : r();
  }
  return (r(), e);
}
function meldPosition(k: number) {
  const occupied = new Set<number>();
  let index = 0;
  for (let j = 0; j <= k; j++) {
    const m = g.melds[j];
    if (m.kind === "pair") continue;
    const width = m.tiles.length;
    const preferred =
      (index % 12) * 27 + (index % 3) * 3 + Math.floor(index / 12) * 9;
    const valid = (cell: number) =>
      Math.floor(cell / 27) < 12 &&
      (cell % 27) + width <= 27 &&
      m.tiles.every((_, p) => !occupied.has(cell + p));
    const cell = valid(preferred)
      ? preferred
      : (Array.from({ length: 324 }, (_, p) => p).find(valid) ?? 0);
    if (j === k)
      return `left:${((cell % 27) / 27) * 100}%;top:${(Math.floor(cell / 27) / 12) * 100}%;`;
    for (let p = 0; p <= width && (cell % 27) + p < 27; p++)
      occupied.add(cell + p);
    index++;
  }
  return "";
}

function animateBotDraw(player: number, source?: DOMRect) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = source ?? app.querySelector(".deck")?.getBoundingClientRect(),
    to = app
      .querySelector([".south", ".east", ".north", ".west"][player])
      ?.getBoundingClientRect();
  if (!from || !to) return;
  const back = document.createElement("div");
  back.className = "bot-flight";
  Object.assign(back.style, {
    left: from.x + "px",
    top: from.y + "px",
    width: from.width + "px",
    height: from.height + "px",
  });
  document.body.append(back);
  const animation = back.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      {
        transform: `translate(${to.x - from.x}px,${to.y - from.y}px) scale(.5)`,
        opacity: 0.5,
      },
    ],
    { duration: 300, easing: "ease-out", fill: "forwards" },
  );
  animation.onfinish = () => back.remove();
}

function startTilePointer(
  el: HTMLElement,
  e: PointerEvent,
  from?: "deck" | "left",
) {
  if (e.button !== 0 && e.button !== 2) return;
  if (from && (g.turn !== 0 || g.drawn || g.over)) return;
  unlockSound();
  let id = Number(el.dataset.tile),
    ids = from
      ? []
      : selected.has(id) && selected.size > 1
        ? [...selected].sort((a, b) => rackSlots[a] - rackSlots[b])
        : e.button === 2 || (e.target as HTMLElement).tagName === "I"
          ? rackGroup(id)
          : [id];
  const x = e.clientX,
    y = e.clientY;
  let layer: HTMLElement | null = null,
    held = false,
    moved = false,
    anchorX = 0,
    anchorY = 0;
  const ghosts: HTMLElement[] = [];
  const value = g.players[0].hand.find((t) => t.id === id);
  const hold =
    !from && ids.length === 1 && value && isWild(value, g.indicator)
      ? setTimeout(() => {
          if (moved) return;
          held = true;
          suppressClickUntil = Date.now() + 700;
          faceUpOkeys.has(id) ? faceUpOkeys.delete(id) : faceUpOkeys.add(id);
          selected.delete(id);
          beep("flip");
          render();
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
            app
              .querySelector(`[data-tile="${id}"]`)
              ?.animate(
                [
                  { transform: "rotateY(-180deg)" },
                  { transform: "rotateY(0)" },
                ],
                { duration: 280, easing: "ease-in-out" },
              );
        }, 500)
      : undefined;
  const coords = (cx: number, cy: number) => {
    const stage = app.querySelector<HTMLElement>(".game-stage")!,
      r = stage.getBoundingClientRect();
    return matchMedia("(orientation: portrait)").matches
      ? { x: cy - r.top, y: r.right - cx }
      : { x: cx - r.left, y: cy - r.top };
  };
  const move = (ev: PointerEvent) => {
    if (held || (!moved && Math.hypot(ev.clientX - x, ev.clientY - y) < 7))
      return;
    clearTimeout(hold);
    ev.preventDefault();
    if (!moved) {
      moved = true;
      dragActive = true;
      clearTimeout(timer);
      if (from) {
        try {
          draw(g, from === "left");
          id = g.players[0].hand.at(-1)!.id;
          ids = [id];
          save();
          render();
          beep("draw");
        } catch (err) {
          notify((err as Error).message);
          cleanup();
          return;
        }
      }
      const stage = app.querySelector<HTMLElement>(".game-stage")!;
      layer = document.createElement("div");
      layer.className = "rack-drag";
      stage.append(layer);
      const first = app.querySelector<HTMLElement>(`[data-tile="${ids[0]}"]`)!;
      const w = first.offsetWidth,
        h = first.offsetHeight;
      anchorX = ids.indexOf(id) * w + w / 2;
      anchorY = h * 0.45;
      ids.forEach((key, k) => {
        const source = app.querySelector<HTMLElement>(`[data-tile="${key}"]`)!;
        const clone = source.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-tile");
        clone.removeAttribute("data-visual-id");
        clone.classList.remove("selected");
        clone.style.width = w + "px";
        clone.style.height = h + "px";
        clone.style.left = k * w + "px";
        layer!.append(clone);
        ghosts.push(clone);
        source.style.visibility = "hidden";
      });
      beep("pick");
    }
    const p = coords(ev.clientX, ev.clientY);
    layer!.style.left = p.x - anchorX + "px";
    layer!.style.top = p.y - anchorY + "px";
    app
      .querySelectorAll(".drop-target")
      .forEach((n) => n.classList.remove("drop-target"));
    resolveDropTarget(ev.clientX, ev.clientY, ids)?.classList.add(
      "drop-target",
    );
  };
  const cleanup = () => {
    clearTimeout(hold);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    layer?.remove();
    dragActive = false;
    app
      .querySelectorAll<HTMLElement>("[data-tile]")
      .forEach((n) => n.style.removeProperty("visibility"));
    app
      .querySelectorAll(".drop-target")
      .forEach((n) => n.classList.remove("drop-target"));
    schedule();
  };
  const up = (ev: PointerEvent) => {
    if (!moved) {
      cleanup();
      return;
    }
    suppressClickUntil = Date.now() + 400;
    ghosts.forEach((ghost, k) =>
      motionOrigins.set(String(ids[k]), ghost.getBoundingClientRect()),
    );
    const target = resolveDropTarget(ev.clientX, ev.clientY, ids);
    cleanup();
    if (target?.matches(".discard-zone")) {
      if (ids.length !== 1) {
        notify("Atmak için tek taş taşıyın.");
        return;
      }
      act(() => discard(g, id));
    } else if (target?.hasAttribute("data-meld"))
      act(() => {
        if (g.turn !== 0) throw Error("Taş işlemek için sıranızı bekleyin.");
        if (
          ids.length <= 2 &&
          g.melds[Number(target.dataset.meld)].kind === "pair"
        )
          { const stone = g.players[0].hand.find(t => t.id === ids[0]); if (ids.length === 1 && stone && replacementIndex(g, g.melds[Number(target.dataset.meld)], stone) >= 0) reclaim(g, stone.id, Number(target.dataset.meld)); else appendPair(g, pairIds(ids)); }
        else if (ids.length <= 2) processTile(id, Number(target.dataset.meld), ids.find(key => key !== id), meldDropEnd(target, ev.clientX, ev.clientY));
        else throw Error("Pere bir taş veya çift alanına iki taş işleyin.");
      });
    else if (target?.matches(".series-board,.pairs-board")) {
      selected = new Set(ids);
      action(
        target.matches(".pairs-board")
          ? g.players[0].opened
            ? "process-pair"
            : "pair"
          : "stage",
      );
    } else if (target?.hasAttribute("data-slot")) {
      try {
        const bounds = target.getBoundingClientRect();
        const rotated = matchMedia("(orientation: portrait)").matches;
        const after = rotated
          ? ev.clientY > bounds.top + bounds.height / 2
          : ev.clientX > bounds.left + bounds.width / 2;
        const occupied = Object.values(rackSlots).includes(Number(target.dataset.slot));
        rackSlots = moveRackTiles(rackSlots, ids, Number(target.dataset.slot), occupied && after ? "after" : "before", id);
        selected.clear();
        beep("drop");
        save();
        render();
      } catch (err) {
        notify((err as Error).message);
      }
    } else render();
  };
  const cancel = () => {
    if (moved)
      ghosts.forEach((ghost, k) =>
        motionOrigins.set(String(ids[k]), ghost.getBoundingClientRect()),
      );
    cleanup();
    if (moved) render();
  };
  document.addEventListener("pointermove", move, { passive: false });
  document.addEventListener("pointerup", up, { once: true });
  document.addEventListener("pointercancel", cancel, { once: true });
}

function pairIds(ids: number[]): number[] {
  if (ids.length === 2) return ids;
  if (unassisted) throw Error("Çifti işlemek için iki taşı da seçin.");
  if (ids.length !== 1) throw Error("İşlemek için bir çift seçin.");
  const first = g.players[0].hand.find((t) => t.id === ids[0]);
  if (!first) throw Error("Taş elinizde bulunamadı.");
  const partner = [...g.players[0].hand]
    .sort(
      (a, b) => Number(isWild(a, g.indicator)) - Number(isWild(b, g.indicator)),
    )
    .find(
      (t) => t.id !== first.id && validate([first, t], g.indicator, 0, true),
    );
  if (!partner) throw Error("Bu taşın eşi elinizde yok.");
  return [first.id, partner.id];
}

function resolveDropTarget(
  x: number,
  y: number,
  ids: number[],
): HTMLElement | null {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  const direct =
    hit?.closest<HTMLElement>(
      "[data-slot],[data-meld],.discard-zone,.series-board,.pairs-board",
    ) ?? null;
  if (direct?.matches("[data-slot],.discard-zone")) return direct;
  if (!direct) return null;
  // Accept the end of a run as well as its tiny tile faces. Use exactly the
  // same rule checks as a committed move to highlight only a legal target.
  let closest: HTMLElement | null = null,
    best = Infinity;
  const reach = Math.max(
    20,
    Math.min(
      45,
      app.querySelector(".rack-slot")?.getBoundingClientRect().width ?? 30,
    ),
  );
  app.querySelectorAll<HTMLElement>("[data-meld]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const distance = Math.hypot(
      Math.max(r.left - x, 0, x - r.right),
      Math.max(r.top - y, 0, y - r.bottom),
    );
    if (distance > reach || distance >= best) return;
    const draft = structuredClone(g),
      k = Number(el.dataset.meld);
    try {
      if (draft.turn !== 0) return;
      if (ids.length <= 2 && draft.melds[k].kind === "pair")
        { const stone = draft.players[0].hand.find(t => t.id === ids[0]); if (ids.length === 1 && stone && replacementIndex(draft, draft.melds[k], stone) >= 0) reclaim(draft, stone.id, k); else appendPair(draft, pairIds(ids)); }
      else if (ids.length === 2) {
        const first = draft.players[0].hand.find(v => v.id === ids[0]);
        if (first && replacementIndex(draft, draft.melds[k], first) >= 0) reclaim(draft, ids[0], k, ids[1]);
        else reclaim(draft, ids[1], k, ids[0]);
      } else if (ids.length === 1) {
        try {
          append(draft, ids[0], k, meldDropEnd(el, x, y));
        } catch {
          reclaim(draft, ids[0], k);
        }
      } else return;
      closest = el;
      best = distance;
    } catch {
      /* Invalid targets never change the live game. */
    }
  });
  return closest ?? direct;
}

function preference(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function captureTiles() {
  const positions = new Map<string, DOMRect>(motionOrigins);
  app.querySelectorAll<HTMLElement>("[data-visual-id]").forEach((el) => {
    positions.set(
      el.dataset.visualId!,
      motionOrigins.get(el.dataset.visualId!) ?? el.getBoundingClientRect(),
    );
  });
  motionOrigins.clear();
  return positions;
}

function animateTiles(before: Map<string, DOMRect>, origin?: DOMRect) {
  if (!before.size || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  const portrait = matchMedia("(orientation: portrait)").matches;
  app.querySelectorAll<HTMLElement>("[data-visual-id]").forEach((el) => {
    const previous =
      before.get(el.dataset.visualId!) ??
      (el.hasAttribute("data-tile") ? origin : undefined);
    if (!previous) return;
    const next = el.getBoundingClientRect();
    if (!next.width || !next.height) return;
    const dx = previous.x - next.x,
      dy = previous.y - next.y;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    const sx = previous.width / next.width,
      sy = previous.height / next.height;
    const base = getComputedStyle(el).transform;
    el.style.zIndex = "40";
    const motion = el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${portrait ? dy : dx}px, ${portrait ? -dx : dy}px) scale(${portrait ? sy : sx}, ${portrait ? sx : sy})`,
          filter: "drop-shadow(0 8px 8px #0006)",
        },
        {
          transformOrigin: "top left",
          transform: base === "none" ? "translate(0,0)" : base,
          filter: "drop-shadow(0 1px 1px #0002)",
        },
      ],
      { duration: 240, easing: "cubic-bezier(.18,.75,.28,1)" },
    );
    motion.onfinish = () => el.style.removeProperty("z-index");
  });
}

// Optional page-scoped WebMCP integration; never exposes opponents' hands.
const context = (
  document as Document & {
    modelContext?: {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
  }
).modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  try {
    void Promise.resolve(
      context.registerTool(
        {
          name: "read_sedir_table",
          title: "Okey masasını oku",
          description:
            "Kendi taşlığınızı, açık perleri, sırayı ve skorları okur. Rakiplerin kapalı taşlarını göstermez.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => ({
            round: g.round,
            turn: g.players[g.turn].name,
            drawn: g.drawn,
            over: g.over,
            hand: g.players[0].hand,
            indicator: g.indicator,
            melds: g.melds,
            players: g.players.map((p) => ({
              name: p.name,
              score: p.score,
              tileCount: p.hand.length,
              opened: p.opened,
            })),
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "omni-okey-active") return;
  embeddedActive = event.data.active === true;
  lastTimerTick = Date.now();
  schedule();
});
document.addEventListener("visibilitychange", () => {
  lastTimerTick = Date.now();
  schedule();
});








