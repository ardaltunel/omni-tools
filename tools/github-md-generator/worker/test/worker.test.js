import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, internals } from "../src/index.js";

const origin = "https://ardaltunel.github.io";
const repository = {
    owner: "octocat",
    name: "sample-project",
    fullName: "octocat/sample-project",
    htmlUrl: "https://github.com/octocat/sample-project",
    description: "Doğrulanmış örnek proje.",
    topics: ["documentation"],
    mainLanguage: "JavaScript",
    languages: ["JavaScript"],
    license: "MIT",
    defaultBranch: "main",
    scripts: { test: "node --test" },
    projectStructure: [{ path: "src", type: "directory" }],
    detectedTech: ["JavaScript"],
    readme: "# Sample",
};
const fallbackMarkdown = [
    "# sample-project",
    "",
    "Doğrulanmış depo verilerine dayanarak hazırlanan örnek proje belgesi.",
    "",
    "## Özellikler",
    "",
    "Yalnızca depoda doğrulanabilen özellikler ve kullanıcı tarafından verilen bilgiler belgelenir.",
    "",
    "## Teknolojiler",
    "",
    "Projenin ana dili JavaScript'tir ve testler Node.js yerleşik test çalıştırıcısını kullanır.",
    "",
    "## Kurulum",
    "",
    "Kurulum sırasında depoda bulunan gerçek komutlar ve yapılandırma dosyaları izlenmelidir.",
    "",
    "## Kullanım",
    "",
    "Kullanım ayrıntıları doğrulanmış proje yapısı ve mevcut dokümantasyon esas alınarak açıklanır.",
    "",
    "## Lisans",
    "",
    "Bu örnek depo MIT lisansını kullanır.",
].join("\n");

function request(body, headers = {}) {
    return new Request("https://worker.test/api/github-md/generate", {
        method: "POST",
        headers: { origin, "content-type": "application/json", "cf-connecting-ip": crypto.randomUUID(), ...headers },
        body: JSON.stringify({ fileName: "README.md", language: "tr", repository, fallbackMarkdown, ...body }),
    });
}

function openAiResponse(markdown = fallbackMarkdown) {
    return new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: markdown }] }],
    }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
    });
}

test.beforeEach(() => internals.resetRateLimits());

test("izinli kaynak için CORS ön kontrolünü yanıtlar", async () => {
    const response = await handleRequest(new Request("https://worker.test/api/github-md/generate", {
        method: "OPTIONS",
        headers: { origin },
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
});

test("izin verilmeyen kaynağı OpenAI isteğinden önce reddeder", async () => {
    let called = false;
    const response = await handleRequest(request({}, { origin: "https://evil.example" }), {
        OPENAI_API_KEY: "test-key",
        OPENAI_FETCH: async () => { called = true; return openAiResponse(); },
    });
    assert.equal(response.status, 403);
    assert.equal(called, false);
});

test("anahtar yapılandırılmadığında güvenli hata döndürür", async () => {
    const response = await handleRequest(request({}), {});
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, "OPENAI_NOT_CONFIGURED");
});

test("OpenAI Responses API çıktısını Markdown olarak döndürür", async () => {
    let upstreamRequest;
    const response = await handleRequest(request({ additionalInformation: "Yalnızca doğrulanmış bilgi." }), {
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-5.4-mini",
        OPENAI_FETCH: async (url, options) => {
            upstreamRequest = { url, options, body: JSON.parse(options.body) };
            return openAiResponse();
        },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.model, "gpt-5.4-mini");
    assert.match(payload.markdown, /^# sample-project/);
    assert.equal(upstreamRequest.url, "https://api.openai.com/v1/responses");
    assert.equal(upstreamRequest.options.headers.authorization, "Bearer test-key");
    assert.equal(upstreamRequest.body.store, false);
    assert.doesNotMatch(upstreamRequest.body.input, /test-key/);
});

test("OpenAI sınır ve kimlik doğrulama hatalarını anahtarı sızdırmadan eşler", async () => {
    for (const [status, code] of [[401, "OPENAI_AUTH"], [429, "OPENAI_RATE_LIMIT"]]) {
        const response = await handleRequest(request({}), {
            OPENAI_API_KEY: "test-key",
            OPENAI_FETCH: async () => new Response(JSON.stringify({ error: { message: "upstream secret detail" } }), {
                status,
                headers: { "content-type": "application/json" },
            }),
        });
        const payload = await response.json();
        assert.equal(response.status, 503);
        assert.equal(payload.code, code);
        assert.doesNotMatch(JSON.stringify(payload), /secret detail|test-key/);
    }
});

test("desteklenmeyen dosya ve dilleri reddeder", async () => {
    const invalidFile = await handleRequest(request({ fileName: "OTHER.md" }), { OPENAI_API_KEY: "test-key" });
    const invalidLanguage = await handleRequest(request({ language: "xx" }), { OPENAI_API_KEY: "test-key" });
    assert.equal(invalidFile.status, 400);
    assert.equal(invalidLanguage.status, 400);
});
