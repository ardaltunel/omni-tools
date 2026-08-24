import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(directory, "..", "core.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const core = context.window.TextCorrectorCore;
const projectRoot = path.resolve(directory, "..", "..", "..");

test("Türkçe ve Unicode metin istatistiklerini hesaplar", () => {
    assert.deepEqual({ ...core.countText("Bugün güzel bir gün 🚀") }, { characters: 21, words: 4 });
});

test("boş ve sınırı aşan metni reddeder", () => {
    assert.equal(core.validateInput("   ").valid, false);
    assert.equal(core.validateInput("a".repeat(11), 10).valid, false);
    assert.equal(core.validateInput("Geçerli metin", 20).valid, true);
});

test("eklenen ve silinen metni erişilebilir segmentlere ayırır", () => {
    const diff = core.buildDiff("Bugun toplantı var", "Bugün kısa toplantı var.");
    assert.equal(diff.some((part) => part.type === "delete"), true);
    assert.equal(diff.some((part) => part.type === "insert"), true);
    assert.equal(diff.map((part) => part.type === "delete" ? "" : part.value).join(""), "Bugün kısa toplantı var.");
});

test("uzun metinlerde sınırlı bellek kullanan fark yöntemine geçer", () => {
    const before = `${"kelime ".repeat(400)}eski`;
    const after = `${"kelime ".repeat(400)}yeni`;
    const diff = core.buildDiff(before, after);
    assert.equal(diff.some((part) => part.type === "delete"), true);
    assert.equal(diff.some((part) => part.type === "insert"), true);
});

test("API hata kodlarını Türkçe güvenli mesajlara dönüştürür", () => {
    assert.match(core.getApiErrorMessage(429, "RATE_LIMIT"), /Çok fazla/u);
    assert.equal(core.getApiErrorMessage(503, "UNKNOWN"), "AI hizmetine ulaşılamadı.");
});

test("araç navigation, route metadata, stil ve script sistemine bağlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="text-corrector"[\s\S]*?<span>Metin Düzeltici<\/span>/u);
    assert.match(html, /id="text-corrector" class="tool-panel text-corrector-panel"/u);
    assert.match(html, /tools\/metin-duzeltici\/style\.css/u);
    assert.match(html, /tools\/metin-duzeltici\/config\.js/u);
    assert.match(html, /tools\/metin-duzeltici\/core\.js/u);
    assert.match(html, /tools\/metin-duzeltici\/app\.js/u);
    assert.match(app, /"text-corrector": \{/u);
});

test("frontend API anahtarı veya kullanıcı metnini kalıcı depolama akışı içermez", () => {
    const frontend = ["config.js", "core.js", "app.js"]
        .map((file) => fs.readFileSync(path.resolve(directory, "..", file), "utf8"))
        .join("\n");
    assert.doesNotMatch(frontend, /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u);
    assert.doesNotMatch(frontend, /localStorage|sessionStorage|console\.log/u);
    assert.doesNotMatch(frontend, /api\.openai\.com/u);
    assert.match(frontend, /omni-tools-text-corrector/u);
});
