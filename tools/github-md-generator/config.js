(function initializeGithubMdConfig(global) {
    "use strict";

    // OpenAI anahtarını buraya yazmayın. Yalnızca yayımladığınız güvenli ara
    // katmanın /api/github-md/generate adresini ekleyin.
    global.GithubMdConfig = Object.freeze({
        aiEndpoint: "https://omni-tools-github-md-ai.omni-tools-username-search-worker.workers.dev/api/github-md/generate",
        requestTimeoutMs: 45000,
    });
}(typeof window !== "undefined" ? window : globalThis));
