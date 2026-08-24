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
    packageSummary: { name: "sample-project", description: "Belge üreten örnek uygulama." },
    dependencies: { runtime: ["express"], development: ["typescript"] },
    filePaths: ["src/app.js", "src/routes.js"],
    sourceExcerpts: [{ path: "src/app.js", excerpt: "export function createProjectDocumentation() { return 'README'; }" }],
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

function githubJson(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function githubContent(value) {
    return { encoding: "base64", content: Buffer.from(value, "utf8").toString("base64") };
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
    assert.match(upstreamRequest.body.instructions, /Ek bilgi boşsa projenin amacını/);
    assert.match(upstreamRequest.body.input, /createProjectDocumentation/);
    assert.match(upstreamRequest.body.input, /Belge üreten örnek uygulama/);
    assert.doesNotMatch(upstreamRequest.body.input, /test-key/);
});

test("ek bilgi ve tarayıcı kanıtı yokken depoyu Worker üzerinden analiz eder", async () => {
    let openAiBody;
    const minimalRepository = {
        owner: "octocat",
        name: "sample-project",
        fullName: "octocat/sample-project",
        htmlUrl: "https://github.com/octocat/sample-project",
        description: "",
        topics: [],
        mainLanguage: "",
        languages: [],
        license: "",
        defaultBranch: "",
        scripts: {},
        projectStructure: [],
        detectedTech: [],
        readme: "",
        packageSummary: null,
        dependencies: { runtime: [], development: [] },
        filePaths: [],
        sourceExcerpts: [],
    };
    const githubFetcher = async (url) => {
        if (url === "https://api.github.com/repos/octocat/sample-project") {
            return githubJson({
                private: false,
                full_name: "octocat/sample-project",
                html_url: "https://github.com/octocat/sample-project",
                description: "E-posta bildirimleri oluşturan örnek uygulama.",
                topics: ["email"],
                language: "JavaScript",
                default_branch: "main",
                license: { spdx_id: "MIT" },
            });
        }
        if (url.endsWith("/readme")) return githubJson(githubContent("# Sample Project\n\nKullanıcılara e-posta bildirimleri gönderir."));
        if (url.includes("/contents/package.json")) {
            return githubJson(githubContent(JSON.stringify({
                name: "sample-project",
                description: "E-posta bildirim uygulaması",
                scripts: { test: "node --test" },
                dependencies: { express: "1.0.0" },
            })));
        }
        if (url.endsWith("/languages")) return githubJson({ JavaScript: 900, HTML: 100 });
        if (url.includes("/git/trees/main")) {
            return githubJson({ tree: [
                { type: "blob", path: "src/app.js", size: 2400 },
                { type: "blob", path: "index.html", size: 1200 },
                { type: "tree", path: "src" },
            ] });
        }
        if (url.endsWith("/src/app.js")) return new Response("export function sendEmailNotification() { return 'sent'; }");
        if (url.endsWith("/index.html")) return new Response("<h1>E-posta Bildirim Paneli</h1>");
        return new Response("not found", { status: 404 });
    };

    const response = await handleRequest(request({ repository: minimalRepository, additionalInformation: "" }), {
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-5.4-mini",
        GITHUB_FETCH: githubFetcher,
        OPENAI_FETCH: async (_url, options) => {
            openAiBody = JSON.parse(options.body);
            return openAiResponse();
        },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.repositoryEnriched, true);
    assert.match(openAiBody.input, /E-posta bildirimleri oluşturan örnek uygulama/);
    assert.match(openAiBody.input, /sendEmailNotification/);
    assert.match(openAiBody.input, /"express"/);
    assert.match(openAiBody.input, /"additionalInformation": null/);
});

test("GitHub API kullanılamadığında herkese açık ham dosyalara döner", async () => {
    const emptyEvidence = internals.sanitizeRequest({
        fileName: "README.md",
        language: "tr",
        fallbackMarkdown,
        repository: {
            owner: "octocat",
            name: "sample-project",
            fullName: "octocat/sample-project",
            htmlUrl: "https://github.com/octocat/sample-project",
        },
    }).repository;
    const result = await internals.enrichRepositoryEvidence(emptyEvidence, {
        GITHUB_FETCH: async (url) => {
            if (url.startsWith("https://api.github.com/")) return githubJson({ message: "rate limited" }, 403);
            if (url.endsWith("/main/README.md")) return new Response("# Sample Project\n\nHam README dosyasından alınan proje açıklaması.");
            if (url.endsWith("/main/package.json")) return new Response(JSON.stringify({ name: "sample-project", dependencies: { express: "1.0.0" } }));
            if (url.endsWith("/main/src/app.js")) return new Response("export const purpose = 'documentation';");
            return new Response("not found", { status: 404 });
        },
    }, new AbortController().signal);
    assert.equal(result.enriched, true);
    assert.equal(result.repository.source, "worker-github-raw");
    assert.match(result.repository.existingReadmeExcerpt, /Ham README/);
    assert.deepEqual(result.repository.dependencies.runtime, ["express"]);
    assert.match(result.repository.sourceExcerpts[0].excerpt, /documentation/);
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
