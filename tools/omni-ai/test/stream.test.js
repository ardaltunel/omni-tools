import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../worker/src/index.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const context = { window: {}, TextDecoder };
vm.runInNewContext(fs.readFileSync(path.resolve(directory, "..", "core.js"), "utf8"), context);
const core = context.window.OmniAiCore;
const encode = (value) => new TextEncoder().encode(value);
const event = (value, ending = "\n\n") => `data: ${JSON.stringify(value)}${ending}`;
const delta = (text) => ({ type: "response.output_text.delta", delta: text });
const completed = { type: "response.completed" };

function responseFromText(text, splitBytes = false) {
    const bytes = encode(text);
    return new Response(new ReadableStream({
        start(controller) {
            if (splitBytes) for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.slice(offset, offset + 3));
            else controller.enqueue(bytes);
            controller.close();
        },
    }));
}

test("CRLF, çok satırlı veri, bölünmüş Unicode ve son ayraçsız tamamlanmayı okur", async () => {
    let text = "";
    const stream = ': heartbeat\r\n\r\ndata: {"type":"response.output_text.delta",\r\ndata: "delta":"Bugün 🚀"}\r\n\r\n'
        + event(completed, "");
    await core.consumeStream(responseFromText(stream, true), (part) => { text += part; });
    assert.equal(text, "Bugün 🚀");
});

test("tamamlanma olayından sonra açık bağlantıyı beklemez ve okuyucuyu iptal eder", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({
        start(controller) { controller.enqueue(encode(event(delta("Merhaba")) + event(completed))); },
        cancel() { cancelled = true; },
    }));
    let text = "";
    await core.consumeStream(response, (part) => { text += part; });
    assert.equal(text, "Merhaba");
    assert.equal(cancelled, true);
    assert.equal(response.body.locked, false);
});

test("üst düzey ve iç içe akış hata kodlarını gerçek nedenleriyle gösterir", async () => {
    for (const payload of [
        { type: "error", code: "rate_limit_exceeded" },
        { type: "error", error: { code: "AI_RATE_LIMIT" } },
        { type: "response.failed", response: { error: { code: "AI_RATE_LIMIT" } } },
    ]) {
        await assert.rejects(core.consumeStream(responseFromText(event(payload)), () => {}), (error) => {
            assert.equal(error.isPublic, true);
            assert.match(error.message, /şu anda yoğun/u);
            return true;
        });
    }
    await assert.rejects(core.consumeStream(responseFromText(event({ type: "error", code: "AI_QUOTA_EXCEEDED" })), () => {}),
        (error) => error.code === "AI_QUOTA_EXCEEDED" && /günlük ücretsiz/u.test(error.message));
});

test("eksik olay, erken EOF ve yalnızca DONE kısmi yanıtı başarı saymaz", async () => {
    for (const terminal of [event({ type: "response.incomplete" }), "", "data: [DONE]\n\n"]) {
        let text = "";
        await assert.rejects(core.consumeStream(responseFromText(event(delta("Kısmi yanıt")) + terminal), (part) => { text += part; }),
            (error) => error.code === "AI_INCOMPLETE" && error.isPublic);
        assert.equal(text, "Kısmi yanıt");
    }
});

test("bozuk veri sonrası kısmi yanıtı korur ve geçersiz çıktı hatası döndürür", async () => {
    for (const invalid of ['data: {bozuk}\n\n', event({ type: "response.output_text.delta", delta: 42 })]) {
        let text = "";
        await assert.rejects(core.consumeStream(responseFromText(event(delta("Kısmi")) + invalid), (part) => { text += part; }),
            (error) => error.code === "INVALID_AI_OUTPUT");
        assert.equal(text, "Kısmi");
    }
});

test("akış hiç veri üretmese de iptal sinyali beklemeyi sonlandırır", async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ start() {}, cancel() { return new Promise(() => {}); } }));
    const pending = core.consumeStream(response, () => {}, { signal: controller.signal });
    controller.abort(core.createStreamError("AI_TIMEOUT"));
    await assert.rejects(pending, (error) => error.code === "AI_TIMEOUT");
    assert.equal(response.body.locked, false);
});

test("gerçek Worker akışını okur ve sağlayıcının yarım yanıtını hata olarak korur", async () => {
    for (const [finishReason, expectedError] of [["stop", null], ["length", "AI_INCOMPLETE"], [null, "AI_INCOMPLETE"]]) {
        const upstream = 'data: {"choices":[{"delta":{"content":"Merhaba"}}]}\n\n'
            + (finishReason ? `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n` : "");
        const response = await handleRequest(new Request("https://worker.example/api/chat", {
            method: "POST",
            headers: { origin: "https://ardaltunel.github.io", "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
            body: JSON.stringify({ messages: [{ role: "user", content: "Selam" }], mode: "general", responseLength: "short" }),
        }), { AI: { run: async () => responseFromText(upstream).body }, CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) } });
        assert.equal(response.status, 200);
        let text = "";
        const pending = core.consumeStream(response, (part) => { text += part; });
        if (expectedError) await assert.rejects(pending, (error) => error.code === expectedError);
        else await pending;
        assert.equal(text, "Merhaba");
    }
});
