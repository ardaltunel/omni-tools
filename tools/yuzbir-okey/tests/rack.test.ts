import { test } from "node:test";
import assert from "node:assert/strict";
import { moveRackTiles, sortRemainingTiles } from "../src/rack";

test("Perde kullanılan taşın eşi kalan taşların başına gelir", () => {
  const indicator = { id: 99, c: 3, n: 12 };
  const red4 = { id: 1, c: 0, n: 4 }, blue4 = { id: 2, c: 1, n: 4 };
  const blue10 = { id: 3, c: 1, n: 10 };
  const remaining = [red4, blue10, blue4];
  const meld = [3, 4, 5, 6].map((n) => ({ id: 10 + n, c: 1, n }));
  assert.deepEqual(sortRemainingTiles(remaining, meld, indicator), [blue4, red4, blue10]);
  assert.deepEqual(remaining, [red4, blue10, blue4]);
  assert.deepEqual(sortRemainingTiles(remaining, [], indicator), [red4, blue4, blue10]);
});

test("Taşın sağ yarısına bırakmak hedef taşın arkasına ekler", () => {
  const r = moveRackTiles({ 1: 3, 2: 4, 3: 5, 4: 20 }, [4], 5, "after");
  assert.deepEqual(r, { 1: 3, 2: 4, 3: 5, 4: 6 });
});

test("Soldaki yakın boşluk kullanılır; sağdaki per gereksiz itilmez", () => {
  const r = moveRackTiles({ 1: 5, 2: 6, 3: 7, 4: 20 }, [4], 5);
  assert.deepEqual(r, { 1: 5, 2: 6, 3: 7, 4: 4 });
});

test("Sağ sınırın arkasına bırakılan grup sırasını korur", () => {
  const r = moveRackTiles({ 1: 14, 2: 15, 3: 20, 4: 21 }, [3, 4], 15, "after");
  assert.deepEqual([r[1], r[2], r[3], r[4]], [12, 13, 14, 15]);
});

test("Per kendi taşının üzerine bırakıldığında yer değiştirmez", () => {
  const layout = { 1: 3, 2: 4, 3: 5, 4: 7 };
  assert.deepEqual(moveRackTiles(layout, [1, 2, 3], 4), layout);
});

test("Geçersiz yuva numarası düzeni değiştirmeden reddedilir", () => {
  for (const slot of [NaN, 1.5, -1, 32])
    assert.throws(() => moveRackTiles({ 1: 0 }, [1], slot));
});
test("Boş yuvaya taş taşıma boşlukları korur", () =>
  assert.deepEqual(moveRackTiles({ 1: 0, 2: 1, 3: 4 }, [2], 20), {
    1: 0,
    2: 20,
    3: 4,
  }));
test("Dolu yuvaya bırakmak komşuları sağa kaydırır", () =>
  assert.deepEqual(moveRackTiles({ 1: 0, 2: 1, 3: 2, 4: 8 }, [4], 1), {
    1: 0,
    2: 2,
    3: 3,
    4: 1,
  }));
test("Per toplu taşınır; taşlar kaybolmaz", () => {
  const r = moveRackTiles({ 1: 0, 2: 1, 3: 2, 4: 18, 5: 19 }, [1, 2, 3], 18);
  assert.deepEqual([r[1], r[2], r[3]], [16, 17, 18]);
  assert.equal(new Set(Object.values(r)).size, 5);
});
test("Sağ kenarda boşluk soldan açılır", () => {
  const r = moveRackTiles({ 1: 15, 2: 20 }, [2], 15);
  assert.equal(r[2], 14);
  assert.equal(r[1], 15);
});
test("Dolu sıraya sığmayan grup atomik olarak reddedilir", () => {
  const r = Object.fromEntries(Array.from({ length: 18 }, (_, k) => [k, k]));
  assert.throws(() => moveRackTiles(r, [16, 17], 3));
  assert.equal(r[16], 16);
});

test("Farklı boşluk düzenlerinde grup bölünmez, taşlar kaybolmaz", () => {
  for (let mask = 0; mask < 256; mask++) {
    const layout: Record<number, number> = { 100: 16, 101: 17, 102: 18 };
    for (let k = 0; k < 8; k++) if (mask & (1 << k)) layout[k] = k * 2;
    for (const side of ["before", "after"] as const) {
      for (const destination of [0, 7, 14, 15]) {
        const r = moveRackTiles(layout, [100, 101, 102], destination, side);
        assert.deepEqual(Object.keys(r).sort(), Object.keys(layout).sort());
        assert.equal(new Set(Object.values(r)).size, Object.keys(r).length);
        assert.deepEqual([r[101], r[102]], [r[100] + 1, r[100] + 2]);
        assert.ok(Object.values(r).every((slot) => slot >= 0 && slot < 16));
        const remaining = Object.keys(layout).map(Number).filter((id) => id < 100);
        assert.deepEqual([...remaining].sort((a, b) => r[a] - r[b]), remaining);
      }
    }
  }
});

test("Grup son taşından tutulunca hedefe tutulan taş yerleşir", () => {
  const result = moveRackTiles({1: 0, 2: 1, 3: 2}, [1, 2, 3], 24, "before", 3);
  assert.deepEqual(result, {1: 22, 2: 23, 3: 24});
});
