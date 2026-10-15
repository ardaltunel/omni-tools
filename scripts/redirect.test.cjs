"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.resolve(__dirname, "..", "404.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "The deployed 404 redirect script must exist");

function redirect(href) {
    const url = new URL(href);
    let destination = null;
    const location = {
        hostname: url.hostname, pathname: url.pathname, search: url.search,
        hash: url.hash, origin: url.origin, replace(next) { destination = next; },
    };
    vm.runInNewContext(script, { window: { location }, URL }, { timeout: 100 });
    return destination && new URL(destination);
}

test("GitHub Pages preserves converter restoration parameters and hash under the project prefix", () => {
    const result = redirect("https://owner.github.io/omni-tools/uzanti-donusturucu?converter-category=document&converter-isolation=1&campaign=desk#upload");
    assert.equal(result.origin, "https://owner.github.io");
    assert.equal(result.pathname, "/omni-tools/");
    assert.equal(result.searchParams.get("tool"), "uzanti-donusturucu");
    assert.equal(result.searchParams.get("converter-category"), "document");
    assert.equal(result.searchParams.get("converter-isolation"), "1");
    assert.equal(result.searchParams.get("campaign"), "desk");
    assert.equal(result.hash, "#upload");
});

test("custom domains preserve all query values and fragments while replacing the tool parameter", () => {
    const result = redirect("https://tools.example/uzanti-donusturucu?tool=old&converter-category=presentation&converter-isolation=1&tag=a&tag=b&q=A%26B#selected-slide");
    assert.equal(result.pathname, "/");
    assert.deepEqual(result.searchParams.getAll("tool"), ["uzanti-donusturucu"]);
    assert.equal(result.searchParams.get("converter-category"), "presentation");
    assert.equal(result.searchParams.get("converter-isolation"), "1");
    assert.deepEqual(result.searchParams.getAll("tag"), ["a", "b"]);
    assert.equal(result.searchParams.get("q"), "A&B");
    assert.equal(result.hash, "#selected-slide");
});

test("ordinary single-segment routes retain their existing redirect destination", () => {
    assert.equal(redirect("https://owner.github.io/omni-tools/ambient-display").href,
        "https://owner.github.io/omni-tools/?tool=ambient-display");
    assert.equal(redirect("https://tools.example/qr-kod-olusturucu/").href,
        "https://tools.example/?tool=qr-kod-olusturucu");
});

test("asset requests, deeper paths and empty routes remain on the existing 404 page", () => {
    for (const href of [
        "https://owner.github.io/omni-tools/",
        "https://owner.github.io/omni-tools/missing.css?tool=ambient-display#unused",
        "https://owner.github.io/omni-tools/tools/missing.js",
        "https://owner.github.io/omni-tools/one/two?converter-isolation=1",
        "https://tools.example/",
        "https://tools.example/missing.png",
        "https://tools.example/one/two/",
    ]) assert.equal(redirect(href), null, href);
});

test("encoded and malformed single segments keep the existing raw-path behavior", () => {
    for (const segment of ["%E0%A4%A", "%ZZ", "%2F", "%C3%A7eviri"]) {
        const result = redirect(`https://owner.github.io/omni-tools/${segment}?converter-isolation=1#restore`);
        assert.equal(result.pathname, "/omni-tools/");
        assert.equal(result.searchParams.get("tool"), segment);
        assert.equal(result.searchParams.get("converter-isolation"), "1");
        assert.equal(result.hash, "#restore");
    }
});
