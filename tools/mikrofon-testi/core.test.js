const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const toolRoot = __dirname;
const projectRoot = path.resolve(toolRoot, "..", "..");

function loadCore() {
    const context = { globalThis: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(toolRoot, "core.js"), "utf8"), context);
    return context.globalThis.MicrophoneTestCore;
}

test("kayıt için desteklenen ilk ses biçimini seçer", () => {
    const core = loadCore();
    const MediaRecorderApi = { isTypeSupported: (type) => type === "audio/ogg;codecs=opus" };
    assert.equal(core.chooseMimeType(MediaRecorderApi), "audio/ogg;codecs=opus");
    assert.equal(core.chooseMimeType(null), "");
});

test("canlı seviye gerçek örneklerin RMS değerinden hesaplanır", () => {
    const core = loadCore();
    assert.equal(core.calculateLevel(new Uint8Array([128, 128, 128, 128])), 0);
    assert.ok(core.calculateLevel(new Uint8Array([0, 255, 0, 255])) >= 99);
});

test("süre ve kayıt dosyası adı Türkçe karakterlerle güvenli oluşturulur", () => {
    const core = loadCore();
    assert.equal(core.formatDuration(65.8), "01:05");
    assert.equal(core.createFileName("Dizüstü Mikrofonu", "audio/webm"), "mikrofon-testi-dizustu-mikrofonu.webm");
    assert.equal(core.createFileName("USB Mikrofon", "audio/ogg"), "mikrofon-testi-usb-mikrofon.ogg");
    assert.equal(core.createFileName("Safari Mikrofon", "audio/mp4"), "mikrofon-testi-safari-mikrofon.m4a");
});

test("seviye geri bildirimi düşük, normal ve yüksek eşiklerini ayırır", () => {
    const core = loadCore();
    assert.equal(core.getLevelFeedback(0).tone, "low");
    assert.equal(core.getLevelFeedback(5).tone, "low");
    assert.equal(core.getLevelFeedback(40).tone, "normal");
    assert.equal(core.getLevelFeedback(91).tone, "high");
});

test("mikrofon uygulaması gerekli tarayıcı API'lerini ve güvenli temizliği kullanır", () => {
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    for (const required of ["getUserMedia", "enumerateDevices", "devicechange", "MediaRecorder", "AudioContext", "createMediaStreamSource", "createAnalyser", "getSettings", "URL.createObjectURL", "URL.revokeObjectURL", "track.stop()"] ) {
        assert.ok(source.includes(required), required);
    }
    for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
});

test("Mikrofon Testi ana sayfa, arama, stil ve script sistemine bağlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const indexScript = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="microphone-test"/u);
    assert.match(html, /id="microphone-test"/u);
    assert.match(html, /tools\/mikrofon-testi\/style\.css/u);
    assert.match(html, /tools\/mikrofon-testi\/core\.js/u);
    assert.match(html, /tools\/mikrofon-testi\/app\.js/u);
    assert.match(indexScript, /"microphone-test"\s*:/u);
});

test("mikrofon kaydı kullanıcıya sunulan ses işleme ayarları olmadan ham giriş ister", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.doesNotMatch(html, /Yankı Engelleme|Gürültü Azaltma|Otomatik Ses Kazancı/u);
    assert.match(source, /echoCancellation: false/u);
    assert.match(source, /noiseSuppression: false/u);
    assert.match(source, /autoGainControl: false/u);
});

test("bağlı mikrofonlar taranabilir ve seçim değiştiğinde seçilen aygıt başlatılır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.match(html, /id="microphone-test-scan"[^>]*>Aygıtları Tara</u);
    assert.match(html, /id="microphone-test-device-count"/u);
    assert.match(source, /async function scanDevices/u);
    assert.match(source, /elements\.device\.addEventListener\("change", \(\) => startMicrophone\(elements\.device\.value\)\)/u);
    assert.match(source, /deviceId = \{ exact: deviceId \}/u);
    assert.match(source, /attempts: 4, reset: true/u);
    assert.match(source, /state\.knownMicrophones\.set/u);
    assert.match(source, /Mikrofon izni gerekli/u);
});

test("file protokolü cihaz kısıtlamasını açıklar ve güvenli sürüme yönlendirir", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.match(html, /id="microphone-test-file-warning"/u);
    assert.match(html, /https:\/\/ardaltunel\.github\.io\/omni-tools\/mikrofon-testi/u);
    assert.match(html, /mikrofon-testini-baslat\.cmd/u);
    assert.match(source, /root\.location\.protocol === "file:"/u);
    assert.match(source, /Dosya modu: Varsayılan Mikrofon/u);
});

test("mikrofon gizlilik bilgi kutusu arayüzde gösterilmez", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    assert.doesNotMatch(html, /Mikrofon kayıtlarınız yalnızca cihazınızda işlenir/u);
    assert.doesNotMatch(html, /class="microphone-test-privacy"/u);
});

test("test metni alanı ve ona bağlı uygulama kodu kaldırılmıştır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.doesNotMatch(html, /microphone-test-script|microphone-test-sample|>Test Metni</u);
    assert.doesNotMatch(source, /SAMPLE_TEXTS|sampleText|sampleSelect/u);
});

test("en yeni mikrofon kaydı listede önce gösterilir", () => {
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.match(source, /const newestFirst = \[\.\.\.state\.recordings\]\.reverse\(\)/u);
    assert.match(source, /newestFirst\.forEach\(\(recording\) =>/u);
    assert.match(source, /Kayıt \$\{recording\.id\} — \$\{recording\.name\}/u);
});

test("A/B karşılaştırma arayüzü ve uygulama kodu kaldırılmıştır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(toolRoot, "app.js"), "utf8");
    assert.doesNotMatch(html, /A\/B Karşılaştırma|microphone-test-comparison|microphone-test-compare-/u);
    assert.doesNotMatch(source, /renderComparison|playComparison|compareAudio|compareA|compareB/u);
});
