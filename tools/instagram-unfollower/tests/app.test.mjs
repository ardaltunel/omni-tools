import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  CACHE_KEY,
  INSTAGRAM_UNFOLLOWER_API_URL,
  INSTAGRAM_UNFOLLOWER_SOURCE_URL,
  UPDATE_INTERVAL_MS,
  formatCheckedAt,
  getCacheAge,
  isCacheFresh,
  isUsableInstagramUnfollowerSource,
} = require("../app.js");

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(testsDirectory, "..");
const projectRoot = resolve(toolRoot, "..", "..");
const html = readFileSync(join(projectRoot, "index.html"), "utf8");
const css = readFileSync(join(toolRoot, "style.css"), "utf8");
const app = readFileSync(join(toolRoot, "app.js"), "utf8");

test("the Instagram tool is integrated into navigation, panel, stylesheet and script loading", () => {
  assert.match(html, /data-tool="instagram-unfollower"/);
  assert.match(html, /<section id="instagram-unfollower" class="tool-panel instagram-unfollower-panel"/);
  assert.match(html, /tools\/instagram-unfollower\/style\.css\?v=\d+/);
  assert.match(html, /tools\/instagram-unfollower\/app\.js\?v=\d+/);
  assert.match(css, /^\.instagram-unfollower-panel\s*\{/);
});

test("the only remote sources are the supplied public GitHub script and its GitHub API fallback", () => {
  assert.equal(
    INSTAGRAM_UNFOLLOWER_SOURCE_URL,
    "https://raw.githubusercontent.com/cobanov/instagram/main/dist/instagram-unfollower.one-line.js",
  );
  assert.equal(
    INSTAGRAM_UNFOLLOWER_API_URL,
    "https://api.github.com/repos/cobanov/instagram/contents/dist/instagram-unfollower.one-line.js?ref=main",
  );
  assert.match(app, /credentials: "omit"/);
  assert.match(app, /referrerPolicy: "no-referrer"/);
  assert.match(app, /headers: \{ Accept: "application\/vnd\.github\+json" \}/);
  assert.match(app, /legacyCopyText/);
  assert.match(app, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(app, /window\.open\(/);
  assert.doesNotMatch(app, /eval\s*\(/);
  assert.doesNotMatch(app, /document\.cookie/);
  assert.ok(CACHE_KEY.includes("instagram-unfollower"));
});

test("the copy action stays available while the source is being prepared", () => {
  assert.match(html, /id="instagram-unfollower-copy-button" class="primary-button" type="button">/);
  assert.match(html, /Güncel kodu kopyala/);
  assert.match(html, /id="instagram-unfollower-open-instagram-button"/);
  assert.doesNotMatch(html, /Kaynak kodu incele ↗/);
  assert.doesNotMatch(html, /Orijinal araç ↗/);
  assert.doesNotMatch(html, /instagram-unfollower-copy-button" class="primary-button" type="button" disabled/);
});

test("only an expected, substantial source script is accepted and cached for 24 hours", () => {
  const source = `https://www.instagram.com ${"x".repeat(5_100)} Taramayı başlat`;
  const now = 1_800_000_000_000;
  const cache = { source, fetchedAt: now - UPDATE_INTERVAL_MS + 1 };

  assert.equal(isUsableInstagramUnfollowerSource(source), true);
  assert.equal(isUsableInstagramUnfollowerSource("console.log('short')"), false);
  assert.equal(getCacheAge(cache, now), UPDATE_INTERVAL_MS - 1);
  assert.equal(isCacheFresh(cache, now), true);
  assert.equal(isCacheFresh({ ...cache, fetchedAt: now - UPDATE_INTERVAL_MS }, now), false);
  assert.match(formatCheckedAt(now), /\d/);
});
