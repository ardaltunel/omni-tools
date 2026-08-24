import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleRequest, internals } from "../src/index.js";

const origin = "https://ardaltunel.github.io";
const validBody = { prompt: "Bana spor programı hazırla", promptType: "general", detailLevel: "balanced", outputFormat: "auto", refinement: "none" };

function env(overrides = {}) {
    return {
        OPENAI_API_KEY: "test-key",
        OPENAI_PROMPT_MODEL: "gpt-test",
        PROMPT_RATE_LIMITER: { limit: async () => ({ success: true }) },
        OPENAI_FETCH: async (_url, init) => {
            const body = JSON.parse(init.body);
            assert.equal(body.store, false);
            return new Response(JSON.stringify({ output_text: JSON.stringify({ improvedPrompt: "Geliştirilmiş prompt", improvements: ["Amaç netleştirildi."] }) }), { status: 200, headers: { "content-type": "application/json" } });
        },
        ...overrides,
    };
}

function request(body = validBody, options = {}) {
    return new Request("https://worker.example/api/prompt/improve", {
        method: "POST",
        headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...(options.headers || {}) },
        body: JSON.stringify(body),
    });
}

test("geçerli isteği yapılandırılmış JSON çıktısıyla işler", async () => {
    let openAiBody;
    const response = await handleRequest(request(), env({
        OPENAI_FETCH: async (_url, init) => {
            openAiBody = JSON.parse(init.body);
            return new Response(JSON.stringify({ output_text: JSON.stringify({ improvedPrompt: "Geliştirilmiş prompt", improvements: ["Amaç netleştirildi."] }) }), { status: 200 });
        },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { improvedPrompt: "Geliştirilmiş prompt", improvements: ["Amaç netleştirildi."] });
    assert.equal(openAiBody.text.format.type, "json_schema");
    assert.equal(openAiBody.text.format.strict, true);
    assert.equal(openAiBody.store, false);
    assert.equal(openAiBody.model, "gpt-test");
    assert.equal(openAiBody.input[0].role, "user");
    assert.ok(!openAiBody.instructions.includes(validBody.prompt));
    assert.ok(openAiBody.input[0].content[0].text.includes(validBody.prompt));
});

test("file origin için CORS isteğini destekler", async () => {
    const preflight = await handleRequest(new Request("https://worker.example/api/prompt/improve", { method: "OPTIONS", headers: { origin: "null" } }), env());
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "null");
});

test("izin verilmeyen origin'i reddeder", async () => {
    const response = await handleRequest(request(validBody, { headers: { origin: "https://example.org" } }), env());
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ORIGIN_DENIED");
});

test("boş ve aşırı uzun promptları reddeder", () => {
    assert.throws(() => internals.sanitizeRequest({ ...validBody, prompt: " " }), /Prompt alanı boş/);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, prompt: "a".repeat(5001) }), /5.000 karakter/);
});

test("geçersiz seçimleri reddeder", () => {
    assert.throws(() => internals.sanitizeRequest({ ...validBody, promptType: "unknown" }), /Geçersiz prompt türü/);
    assert.throws(() => internals.sanitizeRequest({ ...validBody, refinement: "hack" }), /Geçersiz geliştirme/);
});

test("rate limit OpenAI isteğinden önce uygulanır", async () => {
    let called = false;
    const response = await handleRequest(request(), env({ PROMPT_RATE_LIMITER: { limit: async () => ({ success: false }) }, OPENAI_FETCH: async () => { called = true; return new Response(); } }));
    assert.equal(response.status, 429);
    assert.equal(called, false);
});

test("eksik secret ve binding güvenli hata döndürür", async () => {
    const noSecret = await handleRequest(request(), env({ OPENAI_API_KEY: "" }));
    assert.equal(noSecret.status, 503);
    assert.equal((await noSecret.json()).code, "OPENAI_NOT_CONFIGURED");
    const noBinding = await handleRequest(request(), env({ PROMPT_RATE_LIMITER: undefined }));
    assert.equal(noBinding.status, 503);
    assert.equal((await noBinding.json()).code, "RATE_LIMIT_NOT_CONFIGURED");
});

test("OpenAI kimlik ve yoğunluk hatalarını geneller", async () => {
    const auth = await handleRequest(request(), env({ OPENAI_FETCH: async () => new Response("{}", { status: 401 }) }));
    assert.equal(auth.status, 503);
    assert.equal((await auth.json()).code, "OPENAI_AUTH");
    const busy = await handleRequest(request(), env({ OPENAI_FETCH: async () => new Response("{}", { status: 429 }) }));
    assert.equal(busy.status, 429);
    assert.equal((await busy.json()).code, "OPENAI_RATE_LIMIT");
});

test("health endpoint yapılandırma durumunu bildirir", async () => {
    const response = await handleRequest(new Request("https://worker.example/api/health"), env());
    assert.deepEqual(await response.json(), { ok: true, service: "omni-tools-prompt-developer", configured: true });
});

test("kaynak ve yapılandırma secret sızdırmaz", () => {
    const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    assert.equal(/sk-proj-/u.test(source + config), false);
    assert.equal(/Math\.random/u.test(source), false);
    assert.match(config, /"required": \["OPENAI_API_KEY"\]/u);
    assert.match(config, /"PROMPT_RATE_LIMITER"/u);
    assert.match(config, /"OPENAI_PROMPT_MODEL"/u);
});
