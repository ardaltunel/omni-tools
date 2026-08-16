import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(testsDirectory, "..");
const projectRoot = resolve(toolRoot, "..", "..");
const html = readFileSync(join(projectRoot, "index.html"), "utf8");
const appSource = readFileSync(join(toolRoot, "assets", "js", "app.mjs"), "utf8");
const apiSource = readFileSync(join(toolRoot, "assets", "js", "github-api.mjs"), "utf8");
const css = readFileSync(join(toolRoot, "style.css"), "utf8");

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

test("the tool is registered in the Omni Tools navigation and workspace", () => {
  assert.match(html, /data-tool="github-unfollower"/);
  assert.match(
    html,
    /<section id="github-unfollower" class="tool-panel github-unfollower-panel"/,
  );
  assert.match(html, /tools\/github-unfollower\/style\.css\?v=\d+/);
  assert.match(html, /tools\/github-unfollower\/assets\/js\/app\.mjs\?v=\d+/);
});

test("every element requested by the module exists in the integrated panel", () => {
  const suffixes = Array.from(
    appSource.matchAll(/byId\("([^"]+)"\)/g),
    (match) => match[1],
  );

  assert.ok(suffixes.length > 30);
  for (const suffix of suffixes) {
    assert.match(html, new RegExp(`id="github-unfollower-${suffix}"`));
  }
});

test("all project HTML ids remain unique", () => {
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("the tool stylesheet is scoped and does not replace project globals", () => {
  assert.match(css, /^\.github-unfollower-panel\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*:root\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:html|body)\s*\{/);
});

test("the tool sends credentials only to GitHub's API", () => {
  assert.match(apiSource, /const API_BASE_URL = "https:\/\/api\.github\.com"/);
  assert.match(apiSource, /Authorization: "Bearer " \+ token/);
  assert.match(apiSource, /credentials: "omit"/);
  assert.match(apiSource, /referrerPolicy: "no-referrer"/);
});

test("no tool file contains a committed GitHub token", () => {
  const tokenPattern = /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}/;
  const textExtensions = new Set([".css", ".js", ".mjs"]);

  for (const file of walk(toolRoot)) {
    if (!textExtensions.has(extname(file))) {
      continue;
    }
    assert.doesNotMatch(readFileSync(file, "utf8"), tokenPattern, "Possible token: " + file);
  }
});

test("only integrated tool assets and tests remain", () => {
  const expectedRootEntries = ["assets", "style.css", "tests"];
  const expectedAssets = ["js"];
  const expectedScripts = ["app.mjs", "github-api.mjs"];
  const expectedTests = ["github-api.test.mjs", "integration.test.mjs"];

  assert.deepEqual(readdirSync(toolRoot).sort(), expectedRootEntries);
  assert.deepEqual(readdirSync(join(toolRoot, "assets")).sort(), expectedAssets);
  assert.deepEqual(readdirSync(join(toolRoot, "assets", "js")).sort(), expectedScripts);
  assert.deepEqual(readdirSync(testsDirectory).sort(), expectedTests);
  assert.equal(existsSync(join(toolRoot, "index.html")), false);
});
