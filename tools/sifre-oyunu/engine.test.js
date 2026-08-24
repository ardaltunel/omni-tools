const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");

function loadGame() {
    const sandbox = { Date, Intl, Math };
    sandbox.globalThis = sandbox;
    for (const file of ["data.js", "utils.js", "rules.js", "engine.js"]) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8"), sandbox, { filename: file });
    }
    return sandbox;
}

test("kural motoru sıralı ve modüler 30 kural içerir", () => {
    const game = loadGame();
    assert.equal(game.PasswordGameRules.length, 30);
    assert.deepEqual(Array.from(game.PasswordGameRules, (rule) => rule.id), Array.from({ length: 30 }, (_, index) => index + 1));
    for (const rule of game.PasswordGameRules) {
        assert.equal(typeof rule.title, "string");
        assert.equal(typeof rule.description, "function");
        assert.equal(typeof rule.validate, "function");
    }
});

test("aynı seed aynı oyun bağlamını üretir", () => {
    const game = loadGame();
    const options = { seed: "2026-08-24", date: new Date("2026-08-24T12:00:00+03:00") };
    const first = game.PasswordGameEngine.createGameContext(options);
    const second = game.PasswordGameEngine.createGameContext(options);

    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.emojiChoices.length, 3);
    assert.equal(new Set(first.emojiChoices).size, 3);
    assert.equal(first.colorOptions.length, 3);
    assert.ok(first.colorOptions.some((color) => color.hex === first.color.hex));
});

test("100 farklı rastgele bağlamın tüm 30 kural için bir çözümü vardır", () => {
    const game = loadGame();
    for (let seed = 0; seed < 100; seed += 1) {
        const context = game.PasswordGameEngine.createGameContext({ seed: `oyun-${seed}`, date: new Date("2026-08-24T12:00:00+03:00") });
        const verification = game.PasswordGameEngine.verifySolvable(context);
        assert.equal(verification.solvable, true, `seed=${seed}, uzunluk=${verification.solutionLength}`);
        assert.equal(game.PasswordGameUtils.isPrime(verification.solutionLength), true);
    }
});

test("garantili çözüm rakam, sembol, Unicode ve son karakter etkileşimlerini birlikte sağlar", () => {
    const game = loadGame();
    const context = game.PasswordGameEngine.createGameContext({ seed: "etkilesim", date: new Date("2026-08-24T12:00:00+03:00") });
    const solution = game.PasswordGameEngine.createGuaranteedSolution(context);
    const results = game.PasswordGameEngine.evaluateRules(solution, context, 30);

    assert.equal(game.PasswordGameUtils.digitSum(solution), 18);
    assert.ok((solution.match(/[0-9]/g) || []).length >= 5);
    assert.equal(new Set(solution.match(/[#@!%&]/g) || []).size, 2);
    assert.equal(solution.endsWith("?"), true);
    assert.equal(results.every((result) => result.passed), true);
});

test("kümülatif değerlendirme eski bir kural bozulduğunda son sınavı başarısız yapar", () => {
    const game = loadGame();
    const context = game.PasswordGameEngine.createGameContext({ seed: "kumulatif", date: new Date("2026-08-24T12:00:00+03:00") });
    const solution = game.PasswordGameEngine.createGuaranteedSolution(context);
    const broken = solution.replace("OMNI", "omni");
    const results = game.PasswordGameEngine.evaluateRules(broken, context, 30);

    assert.equal(results.find((result) => result.id === 17).passed, false);
    assert.equal(results.find((result) => result.id === 30).passed, false);
});

test("oyun dosyaları sunucu veya parola depolama akışı içermez", () => {
    const files = ["data.js", "utils.js", "rules.js", "engine.js"];
    const source = files.map((file) => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
    for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
});

test("Şifre Oyunu ana sayfa entegrasyonu için ayrılmış dosya yapısını kullanır", () => {
    for (const file of ["data.js", "utils.js", "rules.js", "engine.js", "style.css", "app.js"]) {
        assert.equal(fs.existsSync(path.join(projectRoot, "tools", "sifre-oyunu", file)), true, file);
    }
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="password-game"/u);
    assert.match(html, /id="password-game"/u);
    assert.match(html, /tools\/sifre-oyunu\/rules\.js/u);
    assert.match(html, /tools\/sifre-oyunu\/engine\.js/u);
    assert.match(html, /tools\/sifre-oyunu\/app\.js/u);
    assert.match(script, /"password-game"\s*:/u);
});

test("uygulama gerçek şifreyi depolamaz veya ağ isteğine göndermez", () => {
    const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    for (const forbidden of ["sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console.log"]) {
        assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(safeStats\)\)/u);
    assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(?:input\.value|password)/u);
    assert.match(source, /elements\.input\.value = ""/u);
});

test("başarısız aktif kurallar başarılı kuralların üzerinde sıralanır", () => {
    const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    assert.match(source, /visibleRules\.sort/u);
    assert.match(source, /return firstPassed \? 1 : -1/u);
});

test("şifre alanı oyuna görünür başlar ve istenirse gizlenebilir", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    assert.match(html, /id="password-game-input" type="text"/u);
    assert.match(html, /id="password-game-toggle"[^>]*aria-pressed="true">Gizle</u);
    assert.match(source, /elements\.input\.type = "text";\s*elements\.toggle\.textContent = "Gizle"/u);
    assert.match(source, /elements\.input\.type = show \? "text" : "password"/u);
});

test("başlangıç ekranında geçmiş oyun istatistik şeridi gösterilmez", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    assert.doesNotMatch(html, /password-game-stats/u);
    assert.doesNotMatch(html, /password-game-stat-(?:best|fastest|played|completed)/u);
    assert.doesNotMatch(source, /function renderStats/u);
});
