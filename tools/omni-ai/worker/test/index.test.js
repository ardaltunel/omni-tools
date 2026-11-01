import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleRequest, internals } from "../src/index.js";

const origin = "https://ardaltunel.github.io";
const validBody = { messages: [{ role: "user", content: "React nedir?" }], mode: "general", responseLength: "balanced" };
const delta = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const finish = (reason = "stop") => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`;
const stream = (text = `${delta("Merhaba")}${finish()}data: [DONE]\n\n`) => new Response(text).body;
const environment = (overrides = {}) => ({
    CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: async () => stream() },
    ...overrides,
});
function request(body = validBody, headers = {}, signal) {
    return new Request("https://worker.example/api/chat", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...headers }, body: JSON.stringify(body), signal });
}
const events = (text) => text.split(/\r?\n\r?\n/u).filter(Boolean).map((block) => JSON.parse(block.replace(/^data: /u, "")));
const deferred = () => { let resolve; const promise = new Promise((res) => { resolve = res; }); return { promise, resolve }; };
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function errorCode(error, extra = {}) {
    let calls = 0;
    const response = await handleRequest(request(), environment({ AI: { run: async () => { calls += 1; throw error; } }, ...extra }));
    return { response, payload: await response.json(), calls };
}

test("isteği doğrudan anahtarsız Workers AI'a iletir ve tamamlanmış SSE üretir", async () => {
    let model;
    let body;
    let providerSignal;
    const response = await handleRequest(request(), environment({ AI: { run: async (selectedModel, input, options) => {
        model = selectedModel; body = input; providerSignal = options.signal; return stream();
    } } }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/u);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(model, "@cf/zai-org/glm-4.7-flash");
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.messages[0].role, "system");
    assert.equal(providerSignal.aborted, false);
    assert.deepEqual(events(await response.text()), [
        { type: "response.output_text.delta", delta: "Merhaba" }, { type: "response.completed" },
    ]);
});

test("çok turlu bağlamı, modları ve yanıt uzunluğuna göre token bütçesini korur", () => {
    const input = internals.sanitizeRequest({ messages: [{ role: "user", content: "React öğreniyorum." }, { role: "assistant", content: "Harika." }, { role: "user", content: "Proje öner." }], mode: "coding", responseLength: "detailed" });
    const body = internals.createWorkersAiBody(input, {});
    assert.equal(body.messages.length, 4);
    assert.match(body.messages[0].content, /Omni AI/u);
    assert.match(body.messages[0].content, /Kod sorularında/u);
    assert.ok(!body.messages[0].content.includes("React öğreniyorum"));
    assert.equal(body.max_completion_tokens, 3500);
    assert.equal(internals.createWorkersAiBody({ ...input, responseLength: "short" }, {}).max_completion_tokens, 600);
    assert.equal(internals.createWorkersAiBody({ ...input, responseLength: "balanced" }, {}).max_completion_tokens, 1800);
    assert.equal(internals.createWorkersAiBody(input, { AI_MAX_OUTPUT_TOKENS: "1200" }).max_completion_tokens, 1200);
    assert.equal(internals.resolveModel({ AI_CHAT_MODEL: "https://example.org" }), internals.DEFAULT_AI_MODEL);
});

test("boş, uzun ve geçersiz bağlamları reddeder", () => {
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [] }), /Mesaj alanı boş/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [{ role: "user", content: "a".repeat(10001) }] }), /10\.000/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, mode: "admin" }), /Geçersiz sohbet modu/u);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, messages: [{ role: "assistant", content: "Yanıt" }] }), /Son sohbet mesajı/u);
});

test("CORS ve yerel rate limit model çağrısından önce uygulanır", async () => {
    const preflight = await handleRequest(new Request("https://worker.example/api/chat", { method: "OPTIONS", headers: { origin: "null" } }), environment());
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "null");
    let calls = 0;
    const ai = { run: async () => { calls += 1; return stream(); } };
    const denied = await handleRequest(request(validBody, { origin: "https://example.org" }), environment({ AI: ai }));
    assert.equal(denied.status, 403);
    const limited = await handleRequest(request(), environment({ AI: ai, CHAT_RATE_LIMITER: { limit: async () => ({ success: false }) } }));
    assert.equal(limited.status, 429);
    assert.equal(calls, 0);
});

test("eksik AI ve rate-limit binding güvenli hata döndürür", async () => {
    const missing = await handleRequest(request(), environment({ AI: {} }));
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, "AI_NOT_CONFIGURED");
    const noLimit = await handleRequest(request(), environment({ CHAT_RATE_LIMITER: null }));
    assert.equal((await noLimit.json()).code, "RATE_LIMIT_NOT_CONFIGURED");
});

test("günlük kota, ağ ve erişim hataları tekrar denenmez ve özel bilgi sızdırmaz", async () => {
    for (const [error, expectedCode, status] of [
        [new Error("3036: private provider details"), "AI_QUOTA_EXCEEDED", 429],
        [Object.assign(new Error("private provider details"), { code: 3036 }), "AI_QUOTA_EXCEEDED", 429],
        [new Error("5035: private provider details"), "AI_NOT_CONFIGURED", 503],
        [new TypeError("private provider details"), "AI_UPSTREAM", 503],
    ]) {
        const result = await errorCode(error);
        assert.equal(result.payload.code, expectedCode);
        assert.equal(result.response.status, status);
        assert.equal(result.calls, 1);
        assert.doesNotMatch(JSON.stringify(result.payload), /private provider details/u);
    }
});

test("kapasite hatasında yalnızca bir kez bekleyip doğrudan modeli yeniden çağırır", async () => {
    let calls = 0;
    const response = await handleRequest(request(), environment({ AI: { run: async () => {
        calls += 1; if (calls === 1) throw new Error("3040: capacity"); return stream();
    } } }));
    assert.equal(events(await response.text()).at(-1).type, "response.completed");
    assert.equal(calls, 2);
    const repeated = await errorCode(new Error("3040: capacity"));
    assert.equal(repeated.payload.code, "AI_RATE_LIMIT");
    assert.equal(repeated.calls, 2);
});

test("CRLF, bölünmüş Unicode ve son ayırıcısız bitiş olayını işler", async () => {
    const bytes = new TextEncoder().encode(`${delta("İyi günler 🚀")}${finish()}`.trimEnd().replace(/\n/g, "\r\n"));
    const upstream = new ReadableStream({ start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.slice(offset, offset + 3));
        controller.close();
    } });
    const response = await handleRequest(request(), environment({ AI: { run: async () => upstream } }));
    assert.deepEqual(events(await response.text()), [{ type: "response.output_text.delta", delta: "İyi günler 🚀" }, { type: "response.completed" }]);
});

test("sadece DONE ile biten yerel akışı başarıyla tamamlar", async () => {
    const response = await handleRequest(request(), environment({ AI: { run: async () => stream(`${delta("Yanıt")}data: [DONE]\n\n`) } }));
    assert.equal(events(await response.text()).at(-1).type, "response.completed");
});

test("uzunluk sınırı ve erken EOF sonrasında kısmi yanıtı tamamlanmış göstermez", async () => {
    for (const ending of [finish("length"), ""]) {
        const response = await handleRequest(request(), environment({ AI: { run: async () => stream(`${delta("Yarım yanıt")}${ending}`) } }));
        const result = events(await response.text());
        assert.equal(result[0].delta, "Yarım yanıt");
        assert.equal(result.at(-1).type, "response.incomplete");
        assert.equal(result.at(-1).error.code, "AI_INCOMPLETE");
        assert.equal(result.some((event) => event.type === "response.completed"), false);
    }
});

test("boş, bozuk ve aşırı büyük SSE yanıtını hata olarak bildirir", async () => {
    for (const text of ["", "data: [DONE]\n\n", "data: {invalid}\n\n", `data: ${"x".repeat(128001)}`]) {
        const response = await handleRequest(request(), environment({ AI: { run: async () => stream(text) } }));
        const result = events(await response.text());
        assert.equal(result.at(-1).type, "error");
        assert.equal(result.at(-1).error.code, "AI_UPSTREAM");
    }
});

test("metin başladıktan sonraki sağlayıcı hatasında model çağrısını tekrar etmez", async () => {
    let calls = 0;
    const response = await handleRequest(request(), environment({ AI: { run: async () => {
        calls += 1; return stream(`${delta("Kısmi yanıt")}data: {"error":{"code":3040}}\n\n`);
    } } }));
    const result = events(await response.text());
    assert.equal(result[0].delta, "Kısmi yanıt");
    assert.equal(result.at(-1).error.code, "AI_RATE_LIMIT");
    assert.equal(calls, 1);
});

test("istemci iptali açık model okuyucusunu ve inference sinyalini iptal eder", async () => {
    let canceled = 0;
    let providerSignal;
    const response = await handleRequest(request(), environment({ AI: { run: async (_model, _input, options) => {
        providerSignal = options.signal;
        return new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(delta("Başlangıç"))); }, cancel() { canceled += 1; } });
    } } }));
    const reader = response.body.getReader();
    await reader.read();
    await reader.cancel();
    await settle();
    assert.equal(providerSignal.aborted, true);
    assert.equal(canceled, 1);
});

test("önceden iptal edilen istek model çağrısı başlatmaz", async () => {
    const client = new AbortController(); client.abort();
    let calls = 0;
    const response = await handleRequest(request(validBody, {}, client.signal), environment({ AI: { run: async () => { calls += 1; return stream(); } } }));
    assert.equal(response.status, 499);
    assert.equal((await response.json()).code, "REQUEST_ABORTED");
    assert.equal(calls, 0);
});

test("yeniden deneme beklerken istemci iptali ikinci çağrıyı engeller", async () => {
    const client = new AbortController();
    const started = deferred();
    let calls = 0;
    const pending = handleRequest(request(validBody, {}, client.signal), environment({ AI: { run: async () => { calls += 1; started.resolve(); throw new Error("3040: capacity"); } } }));
    await started.promise; await settle(); client.abort();
    const response = await pending;
    assert.equal(response.status, 499);
    assert.equal(calls, 1);
});

test("başlatma zaman aşımı iptali yok sayan modeli serbest bırakır ve geç akışı iptal eder", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred(); const result = deferred();
    let signal;
    let canceled = 0;
    const pending = handleRequest(request(), environment({ AI_TIMEOUT_MS: "5000", AI: { run: async (_model, _input, options) => { signal = options.signal; started.resolve(); return result.promise; } } }));
    await started.promise;
    t.mock.timers.tick(5000);
    const response = await pending;
    assert.equal(response.status, 504);
    assert.equal((await response.json()).code, "AI_TIMEOUT");
    assert.equal(signal.aborted, true);
    result.resolve(new ReadableStream({ cancel() { canceled += 1; } }));
    await settle();
    assert.equal(canceled, 1);
});

test("akış ortasındaki toplam zaman aşımı kısmi metni korur ve okuyucuyu iptal eder", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let canceled = 0;
    const response = await handleRequest(request(), environment({ AI_TIMEOUT_MS: "5000", AI: { run: async () => new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(delta("Yarım"))); }, cancel() { canceled += 1; },
    }) } }));
    const text = response.text();
    await settle();
    t.mock.timers.tick(5000);
    const result = events(await text);
    assert.equal(result[0].delta, "Yarım");
    assert.equal(result.at(-1).error.code, "AI_TIMEOUT");
    assert.equal(canceled, 1);
});

test("yeniden deneme toplam süreyi sıfırlamaz", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const first = deferred(); const second = deferred();
    let calls = 0;
    const pending = handleRequest(request(), environment({ AI_TIMEOUT_MS: "5000", AI: { run: async () => {
        calls += 1; if (calls === 1) { first.resolve(); throw new Error("3040: capacity"); }
        second.resolve(); return new Promise(() => {});
    } } }));
    await first.promise; await settle(); t.mock.timers.tick(300); await second.promise;
    t.mock.timers.tick(4700);
    const response = await pending;
    assert.equal(response.status, 504);
    assert.equal((await response.json()).code, "AI_TIMEOUT");
    assert.equal(calls, 2);
});

test("başarılı akış zamanlayıcıyı ve istemci iptal dinleyicisini temizler", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const client = new AbortController();
    let signal;
    const response = await handleRequest(request(validBody, {}, client.signal), environment({ AI: { run: async (_model, _input, options) => { signal = options.signal; return stream(); } } }));
    assert.equal(events(await response.text()).at(-1).type, "response.completed");
    client.abort(); t.mock.timers.tick(60000);
    assert.equal(signal.aborted, false);
});

test("health yalnızca işlevli binding'leri hazır sayar ve hızlı modeli bildirir", async () => {
    const response = await handleRequest(new Request("https://worker.example/api/health"), environment());
    assert.deepEqual(await response.json(), { ok: true, service: "omni-tools-omni-ai", provider: "cloudflare-workers-ai", model: internals.DEFAULT_AI_MODEL, thinking: false, configured: true });
    const unavailable = await handleRequest(new Request("https://worker.example/api/health"), environment({ AI: {} }));
    assert.equal((await unavailable.json()).configured, false);
});

test("Worker kaynakları ve yapılandırması yalnızca anahtarsız native AI kullanır", () => {
    const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    assert.doesNotMatch(source, /sk-proj-|OPENAI_|api\.openai\.com|Math\.random|console\.log/u);
    assert.equal(config.secrets, undefined);
    assert.equal(config.ai.binding, "AI");
    assert.equal(config.vars.AI_CHAT_MODEL, internals.DEFAULT_AI_MODEL);
    assert.equal(config.ratelimits[0].name, "CHAT_RATE_LIMITER");
    assert.equal(config.ratelimits[0].namespace_id, "1301");
});
