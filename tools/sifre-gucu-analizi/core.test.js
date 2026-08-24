const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");

function loadCore() {
    const sandbox = {};
    sandbox.globalThis = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "core.js"), "utf8"), sandbox, { filename: "core.js" });
    return sandbox.PasswordStrengthCore;
}

test("puan deterministik olarak 0 ile 100 arasında hesaplanır ve parolayı sonuçta tutmaz", () => {
    const core = loadCore();
    const password = "Kutup!Limon7Deniz#2026";
    const first = core.analyzePassword(password);
    const second = core.analyzePassword(password);

    assert.equal(first.score, second.score);
    assert.ok(first.score >= 0 && first.score <= 100);
    assert.equal(JSON.stringify(first).includes(password), false);
});

test("seviye adları belirtilen puan eşiklerine uyar", () => {
    const core = loadCore();
    assert.equal(core.getLevel(0).label, "Çok Zayıf");
    assert.equal(core.getLevel(24).label, "Çok Zayıf");
    assert.equal(core.getLevel(25).label, "Zayıf");
    assert.equal(core.getLevel(45).label, "Orta");
    assert.equal(core.getLevel(65).label, "Güçlü");
    assert.equal(core.getLevel(85).label, "Çok Güçlü");
    assert.equal(core.getLevel(100).label, "Çok Güçlü");
});

test("yaygın parolaları ciddi biçimde cezalandırır", () => {
    const core = loadCore();
    for (const password of ["123456", "password", "qwerty", "şifre123", "admin"]) {
        const result = core.analyzePassword(password);
        assert.equal(result.patterns.common, true, password);
        assert.ok(result.score <= 10, `${password}: ${result.score}`);
        assert.ok(result.warnings.some((warning) => warning.includes("yaygın")));
    }
});

test("tekrarları, ardışık dizileri ve klavye kalıplarını algılar", () => {
    const core = loadCore();
    const repeated = core.analyzePassword("abcabcabc");
    const run = core.analyzePassword("aaaaaa");
    const sequence = core.analyzePassword("987654");
    const keyboard = core.analyzePassword("asdfgh");

    assert.equal(repeated.patterns.repeats.found, true);
    assert.equal(run.patterns.repeats.found, true);
    assert.equal(sequence.patterns.sequences.found, true);
    assert.equal(keyboard.patterns.sequences.found, true);
    assert.ok(repeated.score <= 24);
    assert.ok(sequence.score <= 20);
});

test("uzun parola cümlesini yalnızca sembol içermediği için zayıf saymaz", () => {
    const core = loadCore();
    const result = core.analyzePassword("KahveDenizBulutSabah2026");

    assert.equal(result.patterns.passphrase.isPassphrase, true);
    assert.ok(result.score >= 85, String(result.score));
    assert.equal(result.level.label, "Çok Güçlü");
    assert.equal(result.checks.find((check) => check.id === "symbol").passed, true);
});

test("Türkçe ve Unicode karakterlerde bozulmadan sınıf ve entropi hesabı yapar", () => {
    const core = loadCore();
    const result = core.analyzePassword("ÇığÖyküŞafakÜzüm2026!");

    assert.equal(result.length, Array.from("ÇığÖyküŞafakÜzüm2026!").length);
    assert.equal(result.classes.hasLowercase, true);
    assert.equal(result.classes.hasUppercase, true);
    assert.equal(result.classes.hasNonAscii, true);
    assert.ok(result.entropy.effective > 0);
});

test("tahmini kırılma süresi etkili entropiyle artar", () => {
    const core = loadCore();
    const short = core.formatCrackTime(20);
    const long = core.formatCrackTime(80);

    assert.ok(long.seconds > short.seconds);
    assert.notEqual(long.label, "Anında");
});

test("araç navigation, route metadata, stiller ve istemci dosyalarıyla kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");

    assert.match(html, /data-tool="password-strength-analysis"/);
    assert.match(html, /id="password-strength-analysis"/);
    assert.match(html, /tools\/sifre-gucu-analizi\/style\.css/);
    assert.match(html, /tools\/sifre-gucu-analizi\/core\.js/);
    assert.match(html, /tools\/sifre-gucu-analizi\/app\.js/);
    assert.doesNotMatch(html, /Girdiğiniz şifre yalnızca tarayıcınızda analiz edilir/);
    assert.match(script, /"password-strength-analysis"\s*:/);
});

test("uygulama parola verisini depolamaz, ağ isteğine eklemez veya konsola yazmaz", () => {
    const source = `${fs.readFileSync(path.join(__dirname, "core.js"), "utf8")}\n${fs.readFileSync(path.join(__dirname, "app.js"), "utf8")}`;

    for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /data-tool="password"/);
    assert.match(source, /pagehide/);
});
