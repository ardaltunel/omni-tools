"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createStaticServer } = require("./serve.cjs");

test("local preview serves SPA routes and fonts while rejecting traversal, private paths and writes", async (t) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "omni-static-test-"));
    const root = path.join(temporary, "site");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Local preview</title>");
    fs.writeFileSync(path.join(root, "font.woff2"), "font-data");
    fs.writeFileSync(path.join(root, ".env"), "must-stay-private");
    fs.writeFileSync(path.join(temporary, "outside.txt"), "outside-secret");
    const server = createStaticServer({ root });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith("omni-static-test-"));
        fs.rmSync(temporary, { recursive: true, force: true });
    });
    const port = server.address().port;
    const request = (requestPath, options = {}) => new Promise((resolve, reject) => {
        const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, ...options }, (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
        });
        req.on("error", reject);
        req.end();
    });
    const page = await request("/emlak-portfoy-analizi");
    assert.equal(page.status, 200);
    assert.match(page.body, /Local preview/);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.match(page.headers["content-type"], /^text\/html/);
    const head = await request("/font.woff2", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-type"], "font/woff2");
    assert.equal(head.body, "");
    for (const attempt of ["/../outside.txt", "/%2e%2e/outside.txt", "/.env", "/.git/config"]) {
        const result = await request(attempt);
        assert.equal(result.status, 403, attempt);
        assert.doesNotMatch(result.body, /outside-secret|must-stay-private/);
    }
    assert.equal((await request("/broken%FF")).status, 400);
    assert.equal((await request("/missing.js")).status, 404);
    assert.equal((await request("/index.html", { method: "POST" })).status, 405);
    assert.equal((await request("/index.html", { headers: { host: "evil.example" } })).status, 403);
});
