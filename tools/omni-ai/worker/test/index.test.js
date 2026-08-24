import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleRequest, internals } from "../src/index.js";

const origin = "https://ardaltunel.github.io";
const validBody = { messages: [{ role: "user", content: "React nedir?" }], mode: "general", responseLength: "balanced" };

function environment(overrides = {}) {
    return {
        OPENAI_API_KEY: "test-key",
        OPENAI_CHAT_MODEL: "gpt-test",
        CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
        OPENAI_FETCH: async () => new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Merhaba"}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } }),
        ...overrides,
    };
}

function request(body = validBody, headers = {}) {
    return new Request("https://worker.example/api/chat", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...headers }, body: JSON.stringify(body) });
}

test("geçerli isteği Responses API akışı olarak iletir", async () => {
    let upstreamUrl;
    let upstreamBody;
    const response = await handleRequest(request(), environment({ OPENAI_FETCH: async (url, init) => {
        upstreamUrl = url; upstreamBody = JSON.parse(init.body);
        return new Response('data: {"type":"response.output_text.delta","delta":"React"}\n\n', { status: 200 });
    } }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/u);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(upstreamUrl, "https://api.openai.com/v1/responses");
    assert.equal(upstreamBody.model, "gpt-test");
    assert.equal(upstreamBody.stream, true);
    assert.equal(upstreamBody.store, false);
    assert.equal(upstreamBody.input[0].role, "user");
    assert.match(await response.text(), /response\.output_text\.delta/u);
});

test("çok turlu bağlamı ve sunucu talimatlarını oluşturur", () => {
    const input = internals.sanitizeRequest({ messages: [{ role: "user", content: "React öğreniyorum." }, { role: "assistant", content: "Harika." }, { role: "user", content: "Proje öner." }], mode: "coding", responseLength: "detailed" });
    const body = internals.createOpenAiBody(input, { OPENAI_CHAT_MODEL: "test-model", OPENAI_MAX_OUTPUT_TOKENS: "1200" });
    assert.equal(body.input.length, 3);
    assert.match(body.instructions, /Omni AI/u);
    assert.match(body.instructions, /Kod sorularında/u);
    assert.ok(!body.instructions.includes("React öğreniyorum"));
    assert.equal(body.max_output_tokens, 1200);
});

test("boş, uzun ve geçersiz bağlamları reddeder", () => {
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [] }), /Mesaj alanı boş/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [{ role: "user", content: "a".repeat(10001) }] }), /10\.000/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, mode: "admin" }), /Geçersiz sohbet modu/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [{ role: "assistant", content: "Yanıt" }] }), /Son sohbet mesajı/u);
});

test("CORS ve rate limit kontrollerini uygular", async () => {
    const preflight = await handleRequest(new Request("https://worker.example/api/chat", { method: "OPTIONS", headers: { origin: "null" } }), environment());
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "null");
    const denied = await handleRequest(request(validBody, { origin: "https://example.org" }), environment());
    assert.equal(denied.status, 403);
    const limited = await handleRequest(request(), environment({ CHAT_RATE_LIMITER: { limit: async () => ({ success: false }) } }));
    assert.equal(limited.status, 429);
});

test("eksik secret ve OpenAI hatalarını güvenli biçimde geneller", async () => {
    const missing = await handleRequest(request(), environment({ OPENAI_API_KEY: "" }));
    assert.equal((await missing.json()).code, "OPENAI_NOT_CONFIGURED");
    const auth = await handleRequest(request(), environment({ OPENAI_FETCH: async () => new Response("{}", { status: 401 }) }));
    assert.equal((await auth.json()).code, "OPENAI_AUTH");
    const quota = await handleRequest(request(), environment({ OPENAI_FETCH: async () => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }) }));
    assert.equal((await quota.json()).code, "OPENAI_QUOTA");
});

test("health endpoint yapılandırmayı bildirir", async () => {
    const response = await handleRequest(new Request("https://worker.example/api/health"), environment());
    assert.deepEqual(await response.json(), { ok: true, service: "omni-tools-omni-ai", configured: true });
});

test("Worker kaynakları secret sızdırmaz ve güvenli config kullanır", () => {
    const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    assert.doesNotMatch(source + config, /sk-proj-/u);
    assert.doesNotMatch(source, /Math\.random|console\.log/u);
    assert.match(config, /"required": \["OPENAI_API_KEY"\]/u);
    assert.match(config, /"CHAT_RATE_LIMITER"/u);
    assert.match(config, /"OPENAI_CHAT_MODEL"/u);
    assert.match(config, /"compatibility_date": "2026-08-24"/u);
});
