import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubApiError,
  GitHubClient,
  getRateLimitWaitSeconds,
  isRateLimitResponse,
} from "../assets/js/github-api.mjs";

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("detects rate limits and honors Retry-After", () => {
  const headers = new Headers({ "retry-after": "4" });
  assert.equal(isRateLimitResponse(403, headers, "secondary rate limit"), true);
  assert.equal(getRateLimitWaitSeconds(headers, 0), 5);
});

test("retries a rate-limited request before returning success", async () => {
  const responses = [
    jsonResponse(
      403,
      { message: "You have exceeded a secondary rate limit" },
      { "retry-after": "2", "x-ratelimit-remaining": "10" },
    ),
    jsonResponse(
      200,
      { login: "octocat" },
      { "x-ratelimit-remaining": "9", "x-ratelimit-limit": "5000" },
    ),
  ];
  const delays = [];
  const waits = [];

  const client = new GitHubClient({
    getToken: () => "test-token",
    fetchImpl: async () => responses.shift(),
    delayImpl: async (milliseconds) => delays.push(milliseconds),
    onWait: (wait) => waits.push(wait),
  });

  const result = await client.request("/user");

  assert.equal(result.data.login, "octocat");
  assert.deepEqual(delays, [3000]);
  assert.equal(waits[0].type, "rate-limit");
});

test("does not retry a permanent permission error", async () => {
  let requests = 0;
  const client = new GitHubClient({
    getToken: () => "test-token",
    fetchImpl: async () => {
      requests += 1;
      return jsonResponse(403, {
        message: "Resource not accessible by personal access token",
      });
    },
    delayImpl: async () => {
      throw new Error("Permission errors must not wait.");
    },
  });

  await assert.rejects(
    client.request("/user/following/octocat", { method: "DELETE", mutation: true }),
    (error) => {
      assert.ok(error instanceof GitHubApiError);
      assert.match(error.message, /Followers: Read and write/);
      return true;
    },
  );
  assert.equal(requests, 1);
});

test("keeps one second between mutating requests", async () => {
  const delays = [];
  const nowValues = [100, 250, 1100];
  const client = new GitHubClient({
    getToken: () => "test-token",
    fetchImpl: async () => new Response(null, { status: 204 }),
    delayImpl: async (milliseconds) => delays.push(milliseconds),
    now: () => nowValues.shift(),
  });

  await client.request("/user/following/one", { method: "DELETE", mutation: true });
  await client.request("/user/following/two", { method: "DELETE", mutation: true });

  assert.deepEqual(delays, [850]);
});

test("sends credentials only in the GitHub authorization header", async () => {
  let capturedUrl;
  let capturedOptions;
  const client = new GitHubClient({
    getToken: () => "test-token",
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return jsonResponse(200, { login: "octocat" });
    },
  });

  await client.request("/user");

  assert.equal(capturedUrl, "https://api.github.com/user");
  assert.equal(capturedOptions.headers.Authorization, "Bearer test-token");
  assert.equal(capturedOptions.headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.equal(capturedOptions.credentials, "omit");
  assert.equal(capturedOptions.referrerPolicy, "no-referrer");
});
