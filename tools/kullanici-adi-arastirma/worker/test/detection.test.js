import test from "node:test";
import assert from "node:assert/strict";
import { checkPlatform, internals } from "../src/detection.js";

const makeResponse = (body, status = 200, contentType = "application/json") => new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "content-type": contentType } },
);

test("jsonExact API kimliğini doğrular", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "jsonExact", identityPath: "login", notFoundStatuses: [404] };
    const result = await checkPlatform(platform, "torvalds", { fetchImpl: async () => makeResponse({ login: "Torvalds" }) });
    assert.equal(result.status, "found");
});

test("açık 404 yanıtını bulunamadı sayar", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "status", notFoundStatuses: [404] };
    const result = await checkPlatform(platform, "missing", { fetchImpl: async () => makeResponse("not found", 404, "text/html") });
    assert.equal(result.status, "notFound");
});

test("403 ve bot koruması false negative oluşturmaz", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "status", notFoundStatuses: [404] };
    const denied = await checkPlatform(platform, "name", { fetchImpl: async () => makeResponse("forbidden", 403, "text/html") });
    const challenged = await checkPlatform(platform, "name", { fetchImpl: async () => makeResponse("<title>Just a moment...</title>", 404, "text/html") });
    assert.equal(denied.status, "error");
    assert.equal(challenged.status, "error");
});

test("bilinen yok mesajı ve profil işareti ayrılır", async () => {
    const platform = {
        requestUrl: "https://example.test/{username}",
        evaluator: "message",
        missingMarkers: ["profile missing"],
        foundTemplates: ["profile:{username}"],
    };
    const found = await checkPlatform(platform, "alice", { fetchImpl: async () => makeResponse("profile:alice", 200, "text/html") });
    const missing = await checkPlatform(platform, "alice", { fetchImpl: async () => makeResponse("profile missing", 200, "text/html") });
    const changed = await checkPlatform(platform, "alice", { fetchImpl: async () => makeResponse("generic page", 200, "text/html") });
    assert.equal(found.status, "found");
    assert.equal(missing.status, "notFound");
    assert.equal(changed.status, "unknown");
});

test("oEmbed URL karşılaştırması slash ve büyük-küçük harfi normalize eder", () => {
    assert.equal(internals.normalizeUrl("https://Example.com/Alice/"), "https://example.com/alice");
});

test("Docker Hub organizasyon yanıtını kullanıcı adı olarak doğrular", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "dockerHub", notFoundStatuses: [404] };
    const result = await checkPlatform(platform, "docker", { fetchImpl: async () => makeResponse({ orgname: "Docker" }) });
    assert.equal(result.status, "found");
});

test("npm araması exact maintainer kaydını doğrular, boş sonucu false negative saymaz", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "npmMaintainer" };
    const found = await checkPlatform(platform, "alice", {
        fetchImpl: async () => makeResponse({ objects: [{ package: { maintainers: [{ username: "Alice" }] } }] }),
    });
    const noPublicPackage = await checkPlatform(platform, "alice", {
        fetchImpl: async () => makeResponse({ objects: [] }),
    });
    assert.equal(found.status, "found");
    assert.equal(noPublicPackage.status, "unknown");
});

test("Last.fm API anahtarı yoksa istek atmaz; API yanıtı varsa kesin karar verir", async () => {
    let fetchCalled = false;
    const platform = {
        requestUrl: "https://example.test/?user={username}&api_key={apiKey}",
        evaluator: "lastFm",
        requiredVariables: ["apiKey"],
        missingVariableReason: "API anahtarı gerekli.",
    };
    const missingKey = await checkPlatform(platform, "alice", {
        fetchImpl: async () => { fetchCalled = true; return makeResponse({}); },
    });
    const found = await checkPlatform(platform, "alice", {
        variables: { apiKey: "secret" },
        fetchImpl: async (url) => {
            assert.match(url, /api_key=secret/);
            return makeResponse({ user: { name: "Alice" } });
        },
    });
    const notFound = await checkPlatform(platform, "alice", {
        variables: { apiKey: "secret" },
        fetchImpl: async () => makeResponse({ error: 6, message: "User not found" }, 400),
    });
    assert.equal(fetchCalled, false);
    assert.equal(missingKey.status, "unknown");
    assert.equal(found.status, "found");
    assert.equal(notFound.status, "notFound");
});

test("Reddit OAuth token alıp kullanıcı API'sini doğrular", async () => {
    const platform = {
        requestUrl: "https://oauth.reddit.com/user/{username}/about",
        evaluator: "jsonExact",
        identityPath: "data.name",
        notFoundStatuses: [404],
        requestAdapter: "redditOAuth",
        requiredVariables: ["redditClientId", "redditClientSecret"],
    };
    let requestCount = 0;
    const result = await checkPlatform(platform, "alice", {
        variables: { redditClientId: "reddit-test-client", redditClientSecret: "secret" },
        fetchImpl: async (url, options) => {
            requestCount += 1;
            if (requestCount === 1) {
                assert.equal(url, "https://www.reddit.com/api/v1/access_token");
                assert.match(options.headers.authorization, /^Basic /);
                return makeResponse({ access_token: "reddit-token", expires_in: 3600 });
            }
            assert.match(url, /oauth\.reddit\.com\/user\/alice\/about/);
            assert.equal(options.headers.authorization, "Bearer reddit-token");
            return makeResponse({ data: { name: "Alice" } });
        },
    });
    assert.equal(requestCount, 2);
    assert.equal(result.status, "found");
});

test("DeviantArt OAuth aramasında exact kullanıcıyı doğrular", async () => {
    const platform = {
        requestUrl: "https://www.deviantart.com/api/v1/oauth2/user/friends/search?query={username}&access_token={accessToken}",
        evaluator: "deviantArtSearch",
        requestAdapter: "deviantArtOAuth",
        requiredVariables: ["deviantArtClientId", "deviantArtClientSecret"],
    };
    let requestCount = 0;
    const result = await checkPlatform(platform, "alice", {
        variables: { deviantArtClientId: "deviantart-test-client", deviantArtClientSecret: "secret" },
        fetchImpl: async (url, options) => {
            requestCount += 1;
            if (requestCount === 1) {
                assert.equal(url, "https://www.deviantart.com/oauth2/token");
                assert.match(options.body, /grant_type=client_credentials/);
                return makeResponse({ access_token: "deviantart-token", expires_in: 3600 });
            }
            assert.match(url, /query=alice/);
            assert.match(url, /access_token=deviantart-token/);
            return makeResponse({ results: [{ username: "Alice" }] });
        },
    });
    assert.equal(requestCount, 2);
    assert.equal(result.status, "found");
});

test("LinkedIn canonical URL ve profil kartını birlikte doğrular", async () => {
    const platform = {
        requestUrl: "https://www.linkedin.com/in/{username}",
        evaluator: "linkedin",
        notFoundStatuses: [404, 410],
    };
    const html = '<html><head><link rel="canonical" href="https://www.linkedin.com/in/alice"></head><body><section class="top-card-layout"></section></body></html>';
    const found = await checkPlatform(platform, "alice", { fetchImpl: async () => makeResponse(html, 200, "text/html") });
    const blocked = internals.evaluate(platform, { status: 999 }, "request denied", null, "alice");
    assert.equal(found.status, "found");
    assert.equal(blocked.status, "error");
});

test("ağ hatası bulunamadı olarak yorumlanmaz", async () => {
    const platform = { requestUrl: "https://example.test/{username}", evaluator: "status", notFoundStatuses: [404] };
    const result = await checkPlatform(platform, "alice", { fetchImpl: async () => { throw new TypeError("network"); } });
    assert.equal(result.status, "unknown");
});
