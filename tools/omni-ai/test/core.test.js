import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(directory, "..", "core.js"), "utf8");
const context = { window: { crypto: webcrypto } };
vm.runInNewContext(source, context);
const core = context.window.OmniAiCore;
const projectRoot = path.resolve(directory, "..", "..", "..");

test("mesajı gerçek karakter sayısıyla doğrular", () => {
    assert.equal(core.validateMessage("Merhaba 🚀", 20).valid, true);
    assert.equal(core.validateMessage("   ").valid, false);
    assert.equal(core.validateMessage("a".repeat(11), 10).valid, false);
});

test("sohbet başlığını kısaltır ve boş başlığı adlandırır", () => {
    assert.equal(core.createTitle("  React   öğrenme planı  "), "React öğrenme planı");
    assert.equal(core.createTitle(""), "Yeni Sohbet");
    assert.ok(Array.from(core.createTitle("a".repeat(60))).length <= 49);
});

test("yalnızca kullanıcı mesajı bulunan sohbetleri geçmişe alır", () => {
    assert.equal(core.hasChatContent(core.createChat()), false);
    assert.equal(core.hasChatContent({ messages: [{ role: "assistant", content: "Merhaba" }] }), false);
    assert.equal(core.hasChatContent({ messages: [{ role: "user", content: "  " }] }), false);
    assert.equal(core.hasChatContent({ messages: [{ role: "user", content: "React öğrenme planı" }] }), true);
});

test("bağlamı son mesajlar ve karakter sınırıyla daraltır", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `mesaj-${index}` }));
    const result = core.trimContext(messages, { maximumMessages: 6, maximumCharacters: 100 });
    assert.ok(result.length <= 6);
    assert.equal(result[0].role, "user");
    assert.equal(result.at(-1).content, "mesaj-19");
});

test("Omni AI navigation, metadata, stil ve script sistemine bağlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    assert.match(html, /data-tool="omni-ai"[\s\S]*?<span>Omni AI<\/span>/u);
    assert.match(html, /id="omni-ai" class="tool-panel omni-ai-panel"/u);
    assert.match(html, /tools\/omni-ai\/style\.css/u);
    assert.match(html, /tools\/omni-ai\/config\.js/u);
    assert.match(html, /tools\/omni-ai\/core\.js/u);
    assert.match(html, /tools\/omni-ai\/markdown\.js/u);
    assert.match(html, /tools\/omni-ai\/app\.js/u);
    assert.match(app, /"omni-ai": \{/u);
});

test("frontend secret, OpenAI URL veya model adı içermez", () => {
    const frontend = ["config.js", "core.js", "markdown.js", "app.js"].map((file) => fs.readFileSync(path.resolve(directory, "..", file), "utf8")).join("\n");
    assert.doesNotMatch(frontend, /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u);
    assert.doesNotMatch(frontend, /api\.openai\.com|gpt-[0-9]/u);
    assert.doesNotMatch(frontend, /console\.log/u);
    assert.match(frontend, /JSON\.parse\(value\) \?\? fallback/u);
});

test("streaming kota ve hız sınırı hatalarını Türkçe gösterir", () => {
    const app = fs.readFileSync(path.resolve(directory, "..", "app.js"), "utf8");
    assert.match(app, /insufficient_quota:[^\n]+API kotası veya kullanım limiti aşıldı\./u);
    assert.match(app, /rate_limit_exceeded:[^\n]+Yapay zekâ hizmeti şu anda yoğun\./u);
    assert.match(app, /event\.type === "error"/u);
});

test("boş sohbetleri kaydetmez ve ilk mesajı başlık olarak kullanır", () => {
    const app = fs.readFileSync(path.resolve(directory, "..", "app.js"), "utf8");
    assert.match(app, /state\.chats\.filter\(\(chat\) => core\.hasChatContent\(chat\)\)/u);
    assert.match(app, /if \(chat\.title === "Yeni Sohbet"\) chat\.title = core\.createTitle\(validation\.text\)/u);
    assert.match(app, /elements\.clearHistory\.hidden = chats\.length === 0/u);
});

test("Markdown renderer kullanıcı içeriğini innerHTML ile işlemez", () => {
    const renderer = fs.readFileSync(path.resolve(directory, "..", "markdown.js"), "utf8");
    assert.doesNotMatch(renderer, /innerHTML|insertAdjacentHTML|document\.write/u);
    assert.match(renderer, /textContent/u);
});

test("yanıt imleci oluşturuluyor metninin hemen yanında gösterilir", () => {
    const style = fs.readFileSync(path.resolve(directory, "..", "style.css"), "utf8");
    assert.match(style, /\.omni-ai-message\.is-streaming \.omni-ai-message-content > :last-child::after/u);
    assert.doesNotMatch(style, /\.omni-ai-message\.is-streaming \.omni-ai-message-content::after/u);
});
