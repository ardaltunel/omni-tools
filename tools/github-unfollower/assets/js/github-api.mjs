const API_BASE_URL = "https://api.github.com";
const API_VERSION = "2026-03-10";
const DEFAULT_TIMEOUT_MS = 30_000;
const MUTATION_DELAY_MS = 1_000;
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_SERVER_RETRIES = 3;

export class GitHubApiError extends Error {
  constructor(message, { status = 0, details = "", response = null } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.details = details;
    this.response = response;
  }
}

export function isRateLimitResponse(status, headers, message = "") {
  if (status !== 403 && status !== 429) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  return (
    status === 429
    || headers.get("x-ratelimit-remaining") === "0"
    || normalizedMessage.includes("rate limit")
    || normalizedMessage.includes("abuse detection")
  );
}

export function getRateLimitWaitSeconds(headers, attempt, now = Date.now()) {
  const retryAfter = Number.parseFloat(headers.get("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.max(1, Math.ceil(retryAfter) + 1);
  }

  if (headers.get("x-ratelimit-remaining") === "0") {
    const resetAt = Number.parseInt(headers.get("x-ratelimit-reset") || "", 10);
    if (Number.isFinite(resetAt)) {
      return Math.max(1, resetAt - Math.floor(now / 1_000) + 1);
    }
  }

  return 60 * (2 ** attempt);
}

export function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("İşlem iptal edildi.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, milliseconds);

    if (!signal) {
      return;
    }

    const handleAbort = () => {
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      reject(new DOMException("İşlem iptal edildi.", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function responseMessage(payload, fallback) {
  if (payload && typeof payload === "object" && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback || "Bilinmeyen GitHub API hatası";
}

async function readResponsePayload(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text ? { message: text } : null;
  } catch {
    return null;
  }
}

function permissionError(status) {
  if (status === 401) {
    return "GitHub tokeni reddetti. Tokenin etkin ve kullanmak istediğiniz hesaba ait olduğunu doğrulayın.";
  }

  return (
    "GitHub bu işleme izin vermedi. Fine-grained tokenler için Followers: Read and write; "
    + "classic tokenler için user:follow izni gerekir."
  );
}

export class GitHubClient {
  constructor({
    getToken,
    fetchImpl = globalThis.fetch.bind(globalThis),
    delayImpl = abortableDelay,
    now = () => Date.now(),
    onRateUpdate = () => {},
    onWait = () => {},
  }) {
    if (typeof getToken !== "function") {
      throw new TypeError("getToken must be a function.");
    }

    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.delayImpl = delayImpl;
    this.now = now;
    this.onRateUpdate = onRateUpdate;
    this.onWait = onWait;
    this.lastMutationFinishedAt = null;
  }

  async request(path, {
    method = "GET",
    signal,
    mutation = false,
    allowStatuses = [],
  } = {}) {
    let rateAttempts = 0;
    let serverAttempts = 0;

    while (true) {
      if (mutation) {
        await this.paceMutation(signal);
      }

      const token = this.getToken().trim();
      if (!token) {
        throw new GitHubApiError("GitHub tokeni gereklidir.");
      }

      const requestController = new AbortController();
      const relayAbort = () => {
        requestController.abort(
          signal.reason || new DOMException("İşlem iptal edildi.", "AbortError"),
        );
      };
      if (signal?.aborted) {
        relayAbort();
      } else {
        signal?.addEventListener("abort", relayAbort, { once: true });
      }
      const timeoutId = globalThis.setTimeout(
        () => requestController.abort(new DOMException("GitHub isteği zaman aşımına uğradı.", "TimeoutError")),
        DEFAULT_TIMEOUT_MS,
      );

      let response;
      try {
        response = await this.fetchImpl(API_BASE_URL + path, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + token,
            "X-GitHub-Api-Version": API_VERSION,
          },
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: requestController.signal,
        });
      } catch (error) {
        globalThis.clearTimeout(timeoutId);
        if (signal?.aborted || error?.name === "AbortError") {
          throw error;
        }
        if (error?.name === "TimeoutError" && serverAttempts >= MAX_SERVER_RETRIES) {
          throw new GitHubApiError("GitHub zamanında yanıt vermedi. Daha sonra yeniden deneyin.");
        }
        if (serverAttempts >= MAX_SERVER_RETRIES) {
          throw new GitHubApiError("GitHub'a bağlanılamadı. Bağlantınızı kontrol edip yeniden deneyin.");
        }

        const waitSeconds = 2 ** serverAttempts;
        serverAttempts += 1;
        this.onWait({ type: "network", seconds: waitSeconds, attempt: serverAttempts });
        await this.delayImpl(waitSeconds * 1_000, signal);
        continue;
      } finally {
        globalThis.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", relayAbort);
      }

      if (mutation) {
        this.lastMutationFinishedAt = this.now();
      }

      this.updateRateState(response.headers);
      const payload = await readResponsePayload(response);
      const message = responseMessage(payload, response.statusText);

      if (allowStatuses.includes(response.status)) {
        return { response, data: payload };
      }

      if (isRateLimitResponse(response.status, response.headers, message)) {
        if (rateAttempts >= MAX_RATE_LIMIT_RETRIES) {
          throw new GitHubApiError(
            "GitHub hız limiti "
              + MAX_RATE_LIMIT_RETRIES
              + " yeniden denemeden sonra da devam ediyor.",
            { status: response.status, details: message, response },
          );
        }

        const waitSeconds = getRateLimitWaitSeconds(response.headers, rateAttempts, this.now());
        rateAttempts += 1;
        this.onWait({ type: "rate-limit", seconds: waitSeconds, attempt: rateAttempts });
        await this.delayImpl(waitSeconds * 1_000, signal);
        continue;
      }

      if (response.status >= 500) {
        if (serverAttempts >= MAX_SERVER_RETRIES) {
          throw new GitHubApiError(
            "GitHub sunucu hatası döndürdü (" + response.status + ").",
            { status: response.status, details: message, response },
          );
        }

        const waitSeconds = 2 ** serverAttempts;
        serverAttempts += 1;
        this.onWait({ type: "server", seconds: waitSeconds, attempt: serverAttempts });
        await this.delayImpl(waitSeconds * 1_000, signal);
        continue;
      }

      if (!response.ok) {
        const friendlyMessage = response.status === 401 || response.status === 403
          ? permissionError(response.status)
          : "GitHub isteği başarısız oldu (" + response.status + ").";

        throw new GitHubApiError(friendlyMessage, {
          status: response.status,
          details: message,
          response,
        });
      }

      return { response, data: payload };
    }
  }

  async paceMutation(signal) {
    if (this.lastMutationFinishedAt === null) {
      return;
    }

    const elapsed = this.now() - this.lastMutationFinishedAt;
    const remaining = MUTATION_DELAY_MS - elapsed;
    if (remaining > 0) {
      await this.delayImpl(remaining, signal);
    }
  }

  updateRateState(headers) {
    const remaining = headers.get("x-ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining !== null || limit !== null) {
      this.onRateUpdate({
        remaining: remaining === null ? null : Number.parseInt(remaining, 10),
        limit: limit === null ? null : Number.parseInt(limit, 10),
        reset: reset === null ? null : Number.parseInt(reset, 10),
      });
    }
  }
}
