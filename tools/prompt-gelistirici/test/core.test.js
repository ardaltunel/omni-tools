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
const core = context.window.PromptDeveloperCore;
const projectRoot = path.resolve(directory, "..", "..", "..");

test("Türkçe ve Unicode prompt istatistiklerini hesaplar", () => {
    assert.deepEqual({ ...core.countText("Bir görsel oluştur 🚀") }, { characters: 20, words: 3 });
});

test("boş ve sınırı aşan promptu reddeder", () => {
    assert.equal(core.validateInput("   ").valid, false);
    assert.equal(core.validateInput("a".repeat(11), 10).valid, false);
    assert.equal(core.validateInput("Geçerli prompt", 20).valid, true);
});

test("tüm prompt türleri, detay ve çıktı seçenekleri benzersizdir", () => {
    assert.equal(core.promptTypes.length, 14);
    assert.equal(new Set(core.promptTypes.map((item) => item.value)).size, 14);
    assert.equal(core.detailLevels.length, 4);
    assert.equal(core.outputFormats.length, 6);
    assert.equal(core.promptTypes.some((item) => item.value === "codex"), true);
});

test("hazır örnekler ilgili prompt türüyle eşleşir", () => {
    assert.equal(core.examples.codex.type, "codex");
    assert.match(core.examples.research.text, /araştır/u);
});

test("API hata kodlarını güvenli Türkçe mesajlara dönüştürür", () => {
    assert.match(core.getApiErrorMessage(429, "RATE_LIMIT"), /Çok fazla/u);
    assert.equal(core.getApiErrorMessage(502, "INVALID_AI_OUTPUT"), "Geçersiz yanıt alındı.");
});

test("araç navigation, route metadata, stil ve script sistemine bağlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="prompt-developer"[\s\S]*?<span>Prompt Geliştirici<\/span>/u);
    assert.match(html, /id="prompt-developer" class="tool-panel prompt-developer-panel"/u);
    assert.match(html, /tools\/prompt-gelistirici\/style\.css/u);
    assert.match(html, /tools\/prompt-gelistirici\/config\.js/u);
    assert.match(html, /tools\/prompt-gelistirici\/core\.js/u);
    assert.match(html, /tools\/prompt-gelistirici\/app\.js/u);
    assert.match(html, /id="prompt-developer-sample"[^>]*>Örnek Prompt<\/button>/u);
    assert.doesNotMatch(html, /data-prompt-example=/u);
    assert.doesNotMatch(html, />Örnek Promptlar</u);
    assert.doesNotMatch(html, /prompt-developer-quick-wrap|Hızlı Geliştirme/u);
    assert.doesNotMatch(html, /prompt-developer-(?:original|improved)-stat|Prompt kelime karşılaştırması/u);
    assert.match(app, /"prompt-developer": \{/u);
});

test("frontend API anahtarı ve kalıcı prompt depolama akışı içermez", () => {
    const frontend = ["config.js", "core.js", "app.js"].map((file) => fs.readFileSync(path.resolve(directory, "..", file), "utf8")).join("\n");
    assert.doesNotMatch(frontend, /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u);
    assert.doesNotMatch(frontend, /localStorage|sessionStorage|console\.log/u);
    assert.doesNotMatch(frontend, /api\.openai\.com/u);
    assert.match(frontend, /omni-tools-prompt-developer/u);
});

test("mobil prompt eylemleri dengeli bir düzene geçer", () => {
    const styles = fs.readFileSync(path.resolve(directory, "..", "style.css"), "utf8");
    assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.prompt-developer-button-group[\s\S]*?grid-template-columns: repeat\(2,/u);
    assert.match(styles, /#prompt-developer-generate \{ grid-column: 1 \/ -1; \}/u);
    assert.match(styles, /\.prompt-developer-hint \{ display: none; \}/u);
});
