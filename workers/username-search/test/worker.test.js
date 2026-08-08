import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/index.js";
import { PLATFORMS } from "../src/platforms.js";

test("health endpoint platform kapsamını döndürür", async () => {
    const response = await handleRequest(new Request("https://worker.test/api/health", {
        headers: { origin: "https://ardaltunel.github.io" },
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.platforms, 46);
    assert.equal(payload.serverCheckable, 38);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://ardaltunel.github.io");

    const configuredResponse = await handleRequest(new Request("https://worker.test/api/health"), { LASTFM_API_KEY: "configured" });
    const configuredPayload = await configuredResponse.json();
    assert.equal(configuredPayload.serverCheckable, 39);

    const fullyConfiguredResponse = await handleRequest(new Request("https://worker.test/api/health"), {
        LASTFM_API_KEY: "configured",
        REDDIT_CLIENT_ID: "configured",
        REDDIT_CLIENT_SECRET: "configured",
        DEVIANTART_CLIENT_ID: "configured",
        DEVIANTART_CLIENT_SECRET: "configured",
    });
    const fullyConfiguredPayload = await fullyConfiguredResponse.json();
    assert.equal(fullyConfiguredPayload.serverCheckable, 41);
});

test("bilinmeyen origin ve platform reddedilir", async () => {
    const denied = await handleRequest(new Request("https://worker.test/api/health", { headers: { origin: "https://evil.example" } }));
    const unknown = await handleRequest(new Request("https://worker.test/api/check?platform=other&username=alice"));
    assert.equal(denied.status, 403);
    assert.equal(unknown.status, 400);
});

test("platforma uymayan kullanıcı adı dış isteğe çıkmadan unknown döner", async () => {
    const response = await handleRequest(new Request("https://worker.test/api/check?platform=github&username=-invalid"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "unknown");
});

test("frontend ve Worker platform kimlikleri eşleşir", async () => {
    await import("../../../tools/username-search/platforms.js");
    const frontendIds = globalThis.UsernameSearchPlatforms.map((item) => item.id).sort();
    const workerIds = PLATFORMS.map((item) => item.id).sort();
    assert.deepEqual(workerIds, frontendIds);
});
