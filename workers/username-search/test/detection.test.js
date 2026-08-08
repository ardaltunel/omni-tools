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
