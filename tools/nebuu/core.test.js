"use strict";

const assert = require("node:assert/strict");
const Core = require("./core.js");
const Words = require("./words.js");

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
}

test("kelime havuzu 1500-2000 aralığında ve kategoriler yeterince dolu", () => {
    assert.ok(Words.total >= 1500 && Words.total <= 2000, `Toplam: ${Words.total}`);
    assert.equal(Words.categories.length, 17);
    Words.categories.filter((category) => category.id !== "mixed").forEach((category) => {
        assert.ok(category.words.length >= 90, `${category.label}: ${category.words.length}`);
    });
});

test("kelimeler global olarak benzersiz ve Türkçe karakterler korunuyor", () => {
    const normalized = Words.byId.mixed.words.map((word) => word.toLocaleLowerCase("tr-TR"));
    assert.equal(new Set(normalized).size, normalized.length);
    assert.ok(Words.byId.cities.words.includes("İstanbul"));
    assert.ok(Words.byId.animals.words.includes("Zürafa"));
    assert.ok(Words.byId.hard.words.includes("Sürdürülebilirlik"));
});

test("kategori destesi giriş dizisini değiştirmeden ve tekrarsız karıştırılıyor", () => {
    const original = Words.byId.animals.words.slice();
    const deck = Core.createDeck("animals", Words, () => 0.25);
    assert.equal(deck.length, original.length);
    assert.equal(new Set(deck).size, deck.length);
    assert.deepEqual(Words.byId.animals.words, original);
    assert.notDeepEqual(deck, original);
});

test("geçersiz kategori reddediliyor", () => {
    assert.throws(() => Core.createDeck("unknown", Words), /kategori/i);
});

test("sayaç kullanıcı dostu dakika:saniye biçimi üretiyor", () => {
    assert.equal(Core.formatTime(60000), "01:00");
    assert.equal(Core.formatTime(43210), "00:44");
    assert.equal(Core.formatTime(-10), "00:00");
});

test("durum makinesi yalnızca geçerli oyun geçişlerine izin veriyor", () => {
    assert.equal(Core.canTransition(Core.STATES.MENU, Core.STATES.PREPARING), true);
    assert.equal(Core.canTransition(Core.STATES.MENU, Core.STATES.PLAYING), false);
    assert.equal(Core.canTransition(Core.STATES.PLAYING, Core.STATES.PAUSED_ORIENTATION), true);
    assert.equal(Core.canTransition(Core.STATES.FINISHED, Core.STATES.PREPARING), true);
});

test("hareket algılayıcı kalibrasyon, tek aksiyon ve nötre dönüş kilidini uygular", () => {
    const detector = Core.createMotionDetector({ calibrationSamples: 4, threshold: 20, neutralThreshold: 7, neutralSamples: 2, debounceMs: 300 });
    [10, 11, 9, 10].forEach((gamma, index) => detector.ingest({ gamma: -gamma, beta: 0, angle: 90 }, index * 20));
    assert.equal(detector.snapshot().calibrated, true);

    const action = detector.ingest({ gamma: -35, beta: 0, angle: 90 }, 500);
    assert.equal(action.action, "correct");
    assert.equal(action.locked, true);
    assert.equal(detector.ingest({ gamma: -38, beta: 0, angle: 90 }, 900).action, undefined);
    detector.ingest({ gamma: -12, beta: 0, angle: 90 }, 950);
    assert.equal(detector.ingest({ gamma: -10, beta: 0, angle: 90 }, 980).locked, false);
    assert.equal(detector.ingest({ gamma: 16, beta: 0, angle: 90 }, 1300).action, "pass");
});

test("ekran yönüne göre doğru sensör ekseni kullanılıyor", () => {
    assert.equal(Core.getTiltAxis({ beta: 12, gamma: 30, angle: 0 }), 12);
    assert.equal(Core.getTiltAxis({ beta: 12, gamma: 30, angle: 90 }), -30);
    assert.equal(Core.getTiltAxis({ beta: 12, gamma: 30, angle: 270 }), 30);
});

test("yatay viewport angle 0 raporlasa bile fiziksel gamma ekseni seçilir", () => {
    assert.equal(Core.resolveOrientationAngle({ screenAngle: 0, orientationType: "landscape-primary", landscape: true }), 90);
    assert.equal(Core.resolveOrientationAngle({ screenAngle: 0, orientationType: "landscape-secondary", landscape: true }), 270);
    assert.equal(Core.getTiltAxis({ beta: 68, gamma: -31, angle: 90 }), 31);
});

test("hareketli örneklerle kalibrasyon yapmaz, sabitlenince yeni kelimede yeniden kurulur", () => {
    const detector = Core.createMotionDetector({ calibrationSamples: 4, calibrationStability: 3, threshold: 20 });
    [0, 15, -12, 18].forEach((gamma, index) => detector.ingest({ gamma, beta: 70, angle: 90 }, index * 20));
    assert.equal(detector.snapshot().calibrated, false);
    detector.reset();
    [10, 11, 9, 10].forEach((gamma, index) => detector.ingest({ gamma, beta: 70, angle: 90 }, 200 + index * 20));
    assert.equal(detector.snapshot().calibrated, true);
    assert.equal(detector.ingest({ gamma: -20, beta: 70, angle: 90 }, 700).action, "correct");
    detector.reset();
    [10, 10, 9, 11].forEach((gamma, index) => detector.ingest({ gamma, beta: 70, angle: 90 }, 900 + index * 20));
    assert.equal(detector.ingest({ gamma: 40, beta: 70, angle: 90 }, 1400).action, "pass");
});

test("ilk cevaptan sonra yaklaşık nötr konuma dönüş ikinci hareketin kilidini açar", () => {
    const detector = Core.createMotionDetector({ calibrationSamples: 4, threshold: 24, neutralThreshold: 14, neutralSamples: 3, debounceMs: 300 });
    [10, 10, 11, 9].forEach((gamma, index) => detector.ingest({ gamma: -gamma, beta: 70, angle: 90 }, index * 20));
    assert.equal(detector.ingest({ gamma: -36, beta: 70, angle: 90 }, 500).action, "correct");
    [22, 21, 22].forEach((axis, index) => detector.ingest({ gamma: -axis, beta: 70, angle: 90 }, 650 + index * 30));
    assert.equal(detector.snapshot().locked, false);
    assert.equal(detector.ingest({ gamma: 18, beta: 70, angle: 90 }, 950).action, "pass");
});

test("cihaz algılama UA, dokunma, pointer ve viewport sinyallerini birlikte kullanıyor", () => {
    const phone = Core.detectDevice({ userAgent: "Android Mobile", viewportWidth: 412, maxTouchPoints: 5, touchCapable: true, coarsePointer: true, orientationSupported: true });
    const desktop = Core.detectDevice({ userAgent: "Windows NT", viewportWidth: 1440, maxTouchPoints: 0, coarsePointer: false, orientationSupported: true });
    const debug = Core.detectDevice({ userAgent: "Windows NT", viewportWidth: 1440, mobileDebug: true });
    assert.equal(phone.mobileLike, true);
    assert.equal(phone.deviceType, "Telefon");
    assert.equal(desktop.mobileLike, false);
    assert.equal(debug.mobileLike, true);
});

console.log(`Nebuu testleri tamamlandı: ${Words.total} özgün girdi.`);
