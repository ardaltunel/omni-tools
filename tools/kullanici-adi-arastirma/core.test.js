"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("./core.js");

function platform(overrides = {}) {
    return {
        id: "test",
        name: "Test",
        priority: 1,
        profileUrl: "https://example.com/{username}",
        usernamePattern: "^[A-Za-z0-9_-]{1,64}$",
        detection: {
            method: "fetch",
            evaluator: "jsonExact",
            identityPath: "username",
            notFoundStatuses: [404],
        },
        ...overrides,
    };
}

test("kullanıcı adını kırpar ve baştaki @ işaretini temizler", () => {
    assert.equal(core.normalizeUsername("  @ardaltunel  "), "ardaltunel");
    assert.equal(core.validateUsername("@torvalds").valid, true);
});

test("boş, aşırı uzun ve güvensiz kullanıcı adlarını reddeder", () => {
    assert.equal(core.validateUsername("   ").valid, false);
    assert.equal(core.validateUsername("a".repeat(65)).valid, false);
    assert.equal(core.validateUsername("user/name").valid, false);
    assert.equal(core.validateUsername("name?admin=true").valid, false);
});

test("URL şablonunda kullanıcı adını encode eder", () => {
    assert.equal(
        core.interpolateTemplate("https://example.com/u/{username}?name={username}", "arda altunel"),
        "https://example.com/u/arda%20altunel?name=arda%20altunel",
    );
});

test("platform biçimine uymayan kullanıcı adını ayırır", () => {
    assert.equal(core.isUsernameValidForPlatform(platform(), "valid_name"), true);
    assert.equal(core.isUsernameValidForPlatform(platform(), "invalid.name"), false);
});

test("JSON kimlik eşleşmesini bulundu olarak değerlendirir", () => {
    assert.deepEqual(
        core.evaluateProbe(platform(), { status: 200, data: { username: "Torvalds" } }, "torvalds"),
        { status: "found", detail: "API kullanıcı adını doğruladı." },
    );
});

test("404 yanıtını bulunamadı, 403 yanıtını hata olarak değerlendirir", () => {
    assert.equal(core.evaluateProbe(platform(), { status: 404, data: {} }, "missing").status, "notFound");
    assert.equal(core.evaluateProbe(platform(), { status: 403, data: {} }, "blocked").status, "error");
});

test("200 yanıtındaki farklı kimliği yanlış pozitif saymaz", () => {
    assert.equal(
        core.evaluateProbe(platform(), { status: 200, data: { username: "someone-else" } }, "wanted").status,
        "unknown",
    );
});

test("GitLab tipi boş exact-query dizisini bulunamadı sayar", () => {
    const gitlab = platform({
        detection: { method: "fetch", evaluator: "jsonArrayExact", identityPath: "username" },
    });
    assert.equal(core.evaluateProbe(gitlab, { status: 200, data: [] }, "unlikely-user").status, "notFound");
});

test("Hacker News tipi null yanıtı bulunamadı sayar", () => {
    const hackerNews = platform({
        detection: { method: "fetch", evaluator: "nullableJsonExact", identityPath: "id" },
    });
    assert.equal(core.evaluateProbe(hackerNews, { status: 200, data: null }, "unlikely-user").status, "notFound");
});

test("npm maintainer kaydı yalnızca kesin eşleşmede bulundu sayılır", () => {
    const npm = platform({
        detection: { method: "fetch", evaluator: "npmMaintainer" },
    });
    const found = core.evaluateProbe(npm, {
        status: 200,
        data: { objects: [{ package: { maintainers: [{ username: "SindreSorhus" }] } }] },
    }, "sindresorhus");
    const noPublicPackage = core.evaluateProbe(npm, { status: 200, data: { objects: [] } }, "empty-account");
    assert.equal(found.status, "found");
    assert.equal(noPublicPackage.status, "unknown");
});

test("CORS/ağ hatasını bulunamadı yerine kontrol edilemedi sayar", () => {
    assert.deepEqual(
        core.classifyFetchError(new TypeError("Failed to fetch")),
        { status: "unknown", detail: "CORS, bağlantı veya ağ hatası nedeniyle kontrol edilemedi." },
    );
});

test("timeout hata durumuna dönüşür", () => {
    assert.equal(core.classifyFetchError(new Error("timeout"), { timedOut: true }).status, "error");
});

test("checkPlatform timeout'u bulunamadı yerine hata olarak kaydeder", async () => {
    const originalFetch = global.fetch;
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        }, { once: true });
    });
    try {
        const result = await core.checkPlatform(platform({
            detection: {
                method: "fetch",
                requestUrl: "https://example.com/{username}",
                evaluator: "status",
                notFoundStatuses: [404],
            },
        }), "timeout-user", { timeoutMs: 10 });
        assert.equal(result.status, "error");
        assert.match(result.detail, /zaman aşımı/i);
    } finally {
        global.fetch = originalFetch;
    }
});

test("checkPlatform fetch/CORS reddini kontrol edilemedi olarak kaydeder", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new TypeError("Failed to fetch");
    };
    try {
        const result = await core.checkPlatform(platform({
            detection: {
                method: "fetch",
                requestUrl: "https://example.com/{username}",
                evaluator: "status",
                notFoundStatuses: [404],
            },
        }), "cors-user");
        assert.equal(result.status, "unknown");
        assert.match(result.detail, /CORS/i);
    } finally {
        global.fetch = originalFetch;
    }
});

test("backend sonucunu yerel platform verileriyle güvenli biçimde birleştirir", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
        platform: "test",
        username: "alice",
        status: "found",
        detail: "Sunucu doğruladı.",
        checkedAt: "2026-08-08T12:00:00.000Z",
        durationMs: 10,
    }), { status: 200, headers: { "content-type": "application/json" } });
    try {
        const result = await core.checkPlatformViaBackend(platform(), "alice", {
            apiBaseUrl: "https://worker.example/",
        });
        assert.equal(result.status, "found");
        assert.equal(result.url, "https://example.com/alice");
        assert.equal(result.source, "backend");
    } finally {
        global.fetch = originalFetch;
    }
});

test("backend ağ hatasında tarayıcı kontrolüne geri döner", async () => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
        callCount += 1;
        if (callCount === 1) throw new TypeError("backend unavailable");
        return new Response(JSON.stringify({ username: "alice" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
    try {
        const result = await core.checkPlatformWithBackend(platform({
            detection: {
                method: "fetch",
                requestUrl: "https://example.com/{username}",
                evaluator: "jsonExact",
                identityPath: "username",
                notFoundStatuses: [404],
            },
        }), "alice", { apiBaseUrl: "https://worker.example" });
        assert.equal(result.status, "found");
        assert.equal(result.source, "browser-fallback");
    } finally {
        global.fetch = originalFetch;
    }
});

test("sonuçları durum ve bilinirlik önceliğine göre sıralar", () => {
    const sorted = core.sortResults([
        { platform: "Missing", status: "notFound", priority: 100 },
        { platform: "Found low", status: "found", priority: 1 },
        { platform: "Found high", status: "found", priority: 10 },
        { platform: "Unknown", status: "unknown", priority: 100 },
    ]);
    assert.deepEqual(sorted.map((result) => result.platform), ["Found high", "Found low", "Unknown", "Missing"]);
});

test("özet hata sonuçlarını kontrol edilemeyen toplamına dahil eder", () => {
    assert.deepEqual(core.buildSummary([
        { status: "found" },
        { status: "notFound" },
        { status: "unknown" },
        { status: "error" },
    ]), { checked: 4, found: 1, notFound: 1, unknown: 2, errors: 1 });
});

test("JSON ve CSV export gerçek sonuçları içerir ve CSV formül enjeksiyonunu önler", () => {
    const payload = core.buildExportPayload("-formula", "2026-08-08T12:00:00.000Z", [{
        platform: "GitHub",
        username: "-formula",
        url: "https://github.com/-formula",
        status: "found",
        detail: "API doğruladı.",
        checkedAt: "2026-08-08T12:00:01.000Z",
        priority: 100,
    }]);
    assert.equal(JSON.parse(core.exportAsJson(payload)).summary.found, 1);
    assert.match(core.exportAsCsv(payload), /"'-formula"/);
    assert.match(core.exportAsCsv(payload), /GitHub/);
});
