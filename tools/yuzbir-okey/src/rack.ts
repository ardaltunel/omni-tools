import { face, isWild, type Tile } from "./engine";

/** Keep spare copies of meld tiles beside the completed pairs. */
export function sortRemainingTiles(remaining: Tile[], meldTiles: Tile[], indicator: Tile): Tile[] {
  const faces = new Set(meldTiles.filter((t) => !isWild(t, indicator)).map((t) => {
    const f = face(t, indicator);
    return `${f.c}:${f.n}`;
  }));
  const hasUsedPartner = (t: Tile) => {
    const f = face(t, indicator);
    return !isWild(t, indicator) && faces.has(`${f.c}:${f.n}`);
  };
  return [...remaining].sort((a, b) =>
    Number(hasUsedPartner(b)) - Number(hasUsedPartner(a)) ||
    face(a, indicator).c - face(b, indicator).c ||
    face(a, indicator).n - face(b, indicator).n || a.id - b.id);
}

/** Move one tile or a whole group, opening space without swapping tiles. */
export function moveRackTiles(
  layout: Record<number, number>,
  ids: number[],
  destination: number,
  side: "before" | "after" = "before",
  heldId: number = ids[0],
): Record<number, number> {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => layout[id] === undefined)
  )
    throw Error("Taş grubu bulunamadı.");
  const row = Math.floor(destination / 16),
    start = Math.max(0, destination % 16 + (side === "after" ? 1 : 0) - Math.max(0, ids.indexOf(heldId)));
  if (!Number.isInteger(destination) || row < 0 || row > 1 || ids.length > 16)
    throw Error("Bu gruba taşlıkta yer yok.");
  if (ids.some((id) => layout[id] === destination)) return { ...layout };
  const result = { ...layout };
  ids.forEach((id) => delete result[id]);
  const slots: Array<number | null> = Array.from({ length: 16 }, (_, i) =>
    Number(
      Object.keys(result).find((id) => result[Number(id)] === row * 16 + i) ??
        NaN,
    ),
  );
  for (let k = 0; k < 16; k++) if (Number.isNaN(slots[k])) slots[k] = null;
  if (slots.filter((x) => x === null).length < ids.length)
    throw Error("Bu sırada gruba yeterli boşluk yok.");
  let insert = start;
  for (const id of ids) {
    let free = slots.findIndex((x, k) => k >= insert && x === null);
    const leftFree = slots.slice(0, insert).lastIndexOf(null);
    if (free >= 0 && (leftFree < 0 || free - insert <= insert - 1 - leftFree)) {
      slots.splice(free, 1);
      slots.splice(insert, 0, id);
    } else {
      free = leftFree;
      slots.splice(free, 1);
      insert--;
      slots.splice(insert, 0, id);
    }
    insert++;
  }
  slots.forEach((id, k) => {
    if (id !== null) result[id] = row * 16 + k;
  });
  return result;
}
