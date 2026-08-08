import { checkPlatform } from "./detection.js";
import { PLATFORM_MAP, PLATFORMS } from "./platforms.js";

const DEFAULT_ORIGINS = Object.freeze([
    "https://ardaltunel.github.io",
    "http://localhost:8765",
    "http://127.0.0.1:8765",
]);

function normalizeUsername(value) {
    return String(value || "").trim().replace(/^@+/, "").trim().normalize("NFC");
}

function validateUsername(username) {
    if (!username) return "Bir kullanıcı adı girin.";
    if (username.length > 64) return "Kullanıcı adı en fazla 64 karakter olabilir.";
    if (!/^[\p{L}\p{N}._-]+$/u.test(username) || !/[\p{L}\p{N}]/u.test(username)) {
        return "Kullanıcı adı geçersiz karakterler içeriyor.";
    }
    return "";
}

function allowedOrigins(env) {
    return new Set([
        ...DEFAULT_ORIGINS,
        ...String(env?.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
    ]);
}

function isAllowedOrigin(origin, env) {
    if (!origin) return true;
    if (allowedOrigins(env).has(origin)) return true;
    try {
        const parsed = new URL(origin);
        return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    } catch (_error) {
        return false;
    }
}

function responseHeaders(origin, env) {
    const headers = {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        vary: "Origin",
    };
    if (origin && isAllowedOrigin(origin, env)) headers["access-control-allow-origin"] = origin;
    return headers;
}

function detectionVariables(env) {
    return {
        apiKey: env?.LASTFM_API_KEY,
    };
}

function isServerCheckable(platform, env) {
    if (platform.evaluator === "unsupported") return false;
    const variables = detectionVariables(env);
    return (platform.requiredVariables || []).every((key) => String(variables[key] || "").trim());
}

function json(payload, status, origin, env, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...responseHeaders(origin, env), ...extraHeaders },
    });
}

async function handleCheck(request, env, origin, url) {
    const username = normalizeUsername(url.searchParams.get("username"));
    const platformId = String(url.searchParams.get("platform") || "").trim();
    const validationError = validateUsername(username);
    if (validationError) return json({ error: validationError }, 400, origin, env);

    const platform = PLATFORM_MAP.get(platformId);
    if (!platform) return json({ error: "Bilinmeyen platform." }, 400, origin, env);

    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    if (!new RegExp(platform.usernamePattern, "u").test(username)) {
        return json({
            platform: platform.id,
            username,
            status: "unknown",
            detail: "Kullanıcı adı bu platformun kullanıcı adı biçimiyle uyumlu değil.",
            checkedAt,
            durationMs: Date.now() - startedAt,
            source: "cloudflare-worker",
        }, 200, origin, env);
    }

    let result;
    try {
        result = await checkPlatform(platform, username, {
            signal: request.signal,
            timeoutMs: Math.min(12000, Math.max(3000, Number(env?.REQUEST_TIMEOUT_MS) || 10000)),
            variables: detectionVariables(env),
        });
    } catch (_error) {
        result = { status: "unknown", detail: "İstemci bağlantısı kesildiği için kontrol tamamlanamadı." };
    }

    return json({
        platform: platform.id,
        username,
        status: result.status,
        detail: result.detail,
        checkedAt,
        durationMs: Date.now() - startedAt,
        source: "cloudflare-worker",
    }, 200, origin, env);
}

export async function handleRequest(request, env = {}) {
    const origin = request.headers.get("origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "Origin izinli değil." }, 403, "", env);

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                ...responseHeaders(origin, env),
                "access-control-allow-headers": "content-type",
                "access-control-allow-methods": "GET, OPTIONS",
                "access-control-max-age": "86400",
            },
        });
    }
    if (request.method !== "GET") return json({ error: "Yalnızca GET desteklenir." }, 405, origin, env, { allow: "GET, OPTIONS" });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/api/health") {
        return json({
            ok: true,
            service: "omni-tools-username-search",
            platforms: PLATFORMS.length,
            serverCheckable: PLATFORMS.filter((item) => isServerCheckable(item, env)).length,
        }, 200, origin, env);
    }
    if (path === "/api/check") return handleCheck(request, env, origin, url);
    return json({ error: "Uç nokta bulunamadı." }, 404, origin, env);
}

export default { fetch: handleRequest };

export const internals = Object.freeze({ allowedOrigins, detectionVariables, isAllowedOrigin, isServerCheckable, normalizeUsername, validateUsername });
