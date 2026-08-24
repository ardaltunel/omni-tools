"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("./services.js");
require("./style-profile.js");
require("./templates.js");

const repository = {
    owner: "octocat",
    name: "sample-project",
    fullName: "octocat/sample-project",
    htmlUrl: "https://github.com/octocat/sample-project",
    cloneUrl: "https://github.com/octocat/sample-project.git",
    description: "A verified sample project.",
    topics: ["documentation", "javascript"],
    mainLanguage: "JavaScript",
    languages: ["JavaScript", "CSS"],
    license: "MIT",
    defaultBranch: "main",
    hasDiscussions: true,
    packageJson: { scripts: { dev: "vite", test: "node --test" } },
    scripts: { dev: "vite", test: "node --test" },
    files: ["package.json", "pnpm-lock.yaml", "src/index.js"],
    projectStructure: [
        { path: "src", type: "directory" },
        { path: "package.json", type: "file" },
    ],
    detectedTech: ["Vite", "JavaScript"],
};

test("GitHub depo ana adreslerini doğrular", () => {
    assert.deepEqual(window.GithubMdServices.parseRepositoryUrl("https://github.com/octocat/Hello-World.git"), {
        owner: "octocat",
        repo: "Hello-World",
        fullName: "octocat/Hello-World",
        htmlUrl: "https://github.com/octocat/Hello-World",
    });
    assert.throws(() => window.GithubMdServices.parseRepositoryUrl("https://github.com/octocat/project/issues/1"));
    assert.throws(() => window.GithubMdServices.parseRepositoryUrl("https://gitlab.com/octocat/project"));
});

test("tüm dosya ve dil kombinasyonları bağımsız Markdown üretir", () => {
    for (const language of window.GithubMdTemplates.supportedLanguages) {
        for (const fileName of window.GithubMdTemplates.supportedFiles) {
            const markdown = window.GithubMdTemplates.generate({
                repository,
                fileName,
                language,
                additionalInformation: "Verified manual context.",
            });
            assert.match(markdown, /^#\s+/);
            assert.ok(markdown.length > 400, `${language}/${fileName} output is unexpectedly short`);
            assert.ok(markdown.endsWith("\n"));
            if (fileName === "README.md") assert.match(markdown, /sample-project/);
        }
    }
});

test("README yalnızca algılanan komut ve teknolojileri kullanır", () => {
    const markdown = window.GithubMdTemplates.generate({ repository, fileName: "README.md", language: "en" });
    assert.match(markdown, /pnpm install/);
    assert.match(markdown, /pnpm run dev/);
    assert.match(markdown, /Vite/);
    assert.match(markdown, /# 🌍 Features/);
    assert.match(markdown, /img\.shields\.io\/badge/);
    assert.match(markdown, /\n---\n/);
    assert.doesNotMatch(markdown, /React/);
});

test("Arda GitHub Belgeleri stil profilini kalıcı varsayılan olarak kullanır", () => {
    assert.equal(window.GithubMdStyleProfiles.defaultProfileId, "arda-github-docs-v1");
    const contributing = window.GithubMdTemplates.generate({ repository, fileName: "CONTRIBUTING.md", language: "tr" });
    const conduct = window.GithubMdTemplates.generate({ repository, fileName: "CODE_OF_CONDUCT.md", language: "tr" });
    const security = window.GithubMdTemplates.generate({ repository, fileName: "SECURITY.md", language: "tr" });
    assert.match(contributing, /# 📑 İçindekiler/);
    assert.match(contributing, /# 🧪 Değişiklikleri Test Etme/);
    assert.match(conduct, /# ✅ Beklenen davranışlar/);
    assert.match(security, /\| Sürüm \| Durum \|/);
    assert.doesNotMatch(security, /Never commit/);
});

test("Türkçe şablonlarda kullanıcıya görünen İngilizce terim bırakmaz", () => {
    const localizedRepository = {
        ...repository,
        description: "Doğrulanmış örnek proje.",
        topics: [],
    };
    const markdown = window.GithubMdTemplates.supportedFiles
        .map((fileName) => window.GithubMdTemplates.generate({ repository: localizedRepository, fileName, language: "tr" }))
        .join("\n")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/https?:\/\/\S+/g, "");

    assert.doesNotMatch(markdown, /\b(?:Repository|Public|Issue|Issues|Discussions|Pull Request|Branch|Commit|Fork|Clone|metadata|script|production|lockfile|frontend)\b/i);
});

test("lisans bulunmadığında kullanım hakkı uydurmaz", () => {
    const markdown = window.GithubMdTemplates.generate({
        repository: { ...repository, license: "" },
        fileName: "README.md",
        language: "en",
    });
    assert.match(markdown, /No recognized license was detected/);
    assert.doesNotMatch(markdown, /licensed under the MIT/i);
});

test("proje amacı analizi için temsilî kaynak dosyalarını güvenli biçimde seçer", () => {
    const selected = window.GithubMdServices.selectAnalysisFiles([
        { type: "blob", path: "src/app.js", sha: "app", size: 4200 },
        { type: "blob", path: "src/routes/posts.js", sha: "routes", size: 2600 },
        { type: "blob", path: "tests/app.test.js", sha: "test", size: 1800 },
        { type: "blob", path: ".env.production", sha: "env", size: 120 },
        { type: "blob", path: "public/vendor.min.js", sha: "min", size: 9000 },
        { type: "blob", path: "index.html", sha: "html", size: 3200 },
    ]);
    const paths = selected.map((item) => item.path);
    assert.ok(paths.includes("src/app.js"));
    assert.ok(paths.includes("src/routes/posts.js"));
    assert.ok(paths.includes("index.html"));
    assert.ok(!paths.includes("tests/app.test.js"));
    assert.ok(!paths.includes(".env.production"));
    assert.ok(!paths.includes("public/vendor.min.js"));
});

test("ek bilgi boşken GitHub analizi yedeği için temel depo kaydı oluşturur", () => {
    const fallback = window.GithubMdServices.createManualRepository("https://github.com/octocat/Hello-World", "");
    assert.equal(fallback.fullName, "octocat/Hello-World");
    assert.equal(fallback.description, "");
    assert.equal(fallback.source, "manual-fallback");
    assert.match(fallback.warnings.join(" "), /sunucu analizi|yedek şablon/i);
});
