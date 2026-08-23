"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error("Beklenmeyen istek"); },
};
require("./style-profile.js");
require("./templates.js");
require("./providers.js");

const repository = {
    owner: "octocat",
    name: "sample-project",
    fullName: "octocat/sample-project",
    htmlUrl: "https://github.com/octocat/sample-project",
    cloneUrl: "https://github.com/octocat/sample-project.git",
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

function context(overrides = {}) {
    const fallbackMarkdown = window.GithubMdTemplates.generate({ repository, fileName: "README.md", language: "tr" });
    return {
        repository,
        fileName: "README.md",
        language: "tr",
        additionalInformation: "",
        fallbackMarkdown,
        ...overrides,
    };
}

function validMarkdown() {
    return [
        "# sample-project",
        "Doğrulanmış örnek proje için yapay zekâ tarafından iyileştirilmiş belge.",
        "## Özellikler",
        "Yalnızca doğrulanmış özellikler belgelenir.",
        "## Teknolojiler",
        "JavaScript kullanılır.",
        "## Kurulum",
        "Gerçek depo komutlarını izleyin.",
        "## Kullanım",
        "Projeye özel kullanım adımlarını izleyin.",
        "## Lisans",
        "MIT lisansı geçerlidir.",
    ].join("\n");
}

test("ara katman yapılandırılmadığında akıllı şablon kullanılır", async () => {
    window.GithubMdConfig = { aiEndpoint: "" };
    const result = await window.GithubMdProviders.generate(context());
    assert.equal(result.provider, "smart-template");
    assert.equal(result.providerFailures.length, 0);
    assert.match(result.markdown, /# 🌍 Özellikler/);
});

test("güvenli ara katmandan gelen OpenAI çıktısını kullanır", async () => {
    window.GithubMdConfig = { aiEndpoint: "https://worker.example/api/github-md/generate", requestTimeoutMs: 5000 };
    window.fetch = async (url, options) => {
        assert.equal(url, window.GithubMdConfig.aiEndpoint);
        assert.equal(options.credentials, "omit");
        assert.equal(options.headers.authorization, undefined);
        const body = JSON.parse(options.body);
        assert.equal(body.fileName, "README.md");
        return new Response(JSON.stringify({ markdown: validMarkdown(), model: "gpt-5.4-mini" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };

    const result = await window.GithubMdProviders.generate(context());
    assert.equal(result.provider, "openai-proxy");
    assert.equal(result.providerLabel, "OpenAI · gpt-5.4-mini");
    assert.equal(result.providerFailures.length, 0);
});

test("OpenAI kimlik doğrulaması bozulduğunda mevcut şablona döner", async () => {
    window.GithubMdConfig = { aiEndpoint: "https://worker.example/api/github-md/generate", requestTimeoutMs: 5000 };
    window.fetch = async () => new Response(JSON.stringify({ code: "OPENAI_AUTH" }), {
        status: 503,
        headers: { "content-type": "application/json" },
    });

    const result = await window.GithubMdProviders.generate(context());
    assert.equal(result.provider, "smart-template");
    assert.equal(result.providerFailures.length, 1);
    assert.equal(result.providerFailures[0].provider, "openai-proxy");
    assert.match(result.markdown, /# 🌍 Özellikler/);
});

test("güvensiz HTTP ara katman adresini kullanmaz", async () => {
    window.GithubMdConfig = { aiEndpoint: "http://example.com/api/github-md/generate" };
    window.fetch = async () => { throw new Error("Bu istek yapılmamalı"); };
    const result = await window.GithubMdProviders.generate(context());
    assert.equal(result.provider, "smart-template");
    assert.equal(result.providerFailures.length, 0);
});
