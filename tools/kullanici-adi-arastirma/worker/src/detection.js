const MAX_RESPONSE_BYTES = 768 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const oauthTokenCache = new Map();

const valueAt = (object, path) => String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value?.[key], object);

const equalsUsername = (value, username) => typeof value === "string"
    && value.localeCompare(username, "en", { sensitivity: "base" }) === 0;

const interpolate = (template, username, variables = {}) => {
    let value = String(template).replaceAll("{username}", encodeURIComponent(username));
    Object.entries(variables).forEach(([key, replacement]) => {
        value = value.replaceAll(`{${key}}`, encodeURIComponent(String(replacement || "")));
    });
    return value;
};

function normalizeUrl(value) {
    try {
        const url = new URL(String(value));
        url.hash = "";
        return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
    } catch (_error) {
        return String(value || "").replace(/\/+$/, "").toLowerCase();
    }
}

const verdict = (status, detail) => ({ status, detail });

async function readLimitedText(response) {
    if (!response.body?.getReader) return (await response.text()).slice(0, MAX_RESPONSE_BYTES);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    try {
        while (received < MAX_RESPONSE_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            text += decoder.decode(value.subarray(0, Math.max(0, MAX_RESPONSE_BYTES - (received - value.byteLength))), { stream: true });
        }
        text += decoder.decode();
    } finally {
        if (received >= MAX_RESPONSE_BYTES) await reader.cancel().catch(() => {});
    }
    return text;
}

function encodeBasicAuth(clientId, clientSecret) {
    const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

async function requestOAuthToken(adapter, variables, fetchImpl, signal) {
    const clientIdKey = adapter === "redditOAuth" ? "redditClientId" : "deviantArtClientId";
    const clientSecretKey = adapter === "redditOAuth" ? "redditClientSecret" : "deviantArtClientSecret";
    const clientId = String(variables[clientIdKey] || "");
    const clientSecret = String(variables[clientSecretKey] || "");
    const cacheKey = `${adapter}:${clientId}`;
    const cached = oauthTokenCache.get(cacheKey);
    if (cached?.token && cached.expiresAt > Date.now() + 30000) return { token: cached.token };

    const isReddit = adapter === "redditOAuth";
    const response = await fetchImpl(isReddit
        ? "https://www.reddit.com/api/v1/access_token"
        : "https://www.deviantart.com/oauth2/token", {
        method: "POST",
        redirect: "follow",
        signal,
        headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": "OmniToolsUsernameSearch/1.0 (+https://github.com/ardaltunel/omni-tools)",
            ...(isReddit ? { authorization: `Basic ${encodeBasicAuth(clientId, clientSecret)}` } : {}),
        },
        body: isReddit
            ? "grant_type=client_credentials"
            : new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
    });
    const body = await readLimitedText(response);
    let data = null;
    try { data = JSON.parse(body); } catch (_error) { data = null; }
    if (response.status === 429) return { error: verdict("error", "Platform OAuth istek sınırına ulaşıldı (HTTP 429).") };
    if (response.status < 200 || response.status >= 300 || !data?.access_token) {
        const platformName = isReddit ? "Reddit" : "DeviantArt";
        return { error: verdict("error", `${platformName} OAuth kimlik bilgileri reddedildi veya erişim onayı eksik.`) };
    }
    const expiresIn = Math.max(60, Number(data.expires_in) || 3600);
    const token = String(data.access_token);
    oauthTokenCache.set(cacheKey, { token, expiresAt: Date.now() + (expiresIn * 1000) });
    return { token };
}

function looksLikeAccessChallenge(body) {
    const sample = String(body || "").slice(0, 200000).toLowerCase();
    return sample.includes("<title>just a moment...</title>")
        || sample.includes("cf-chl-")
        || sample.includes("cloudflare ray id")
        || sample.includes("temporarily unavailable</title>");
}

function evaluate(platform, response, body, data, username) {
    const status = response.status;
    if (status === 429) return verdict("error", "Platform istek sınırına ulaşıldı (HTTP 429).");
    if (looksLikeAccessChallenge(body)) return verdict("error", "Platform bot koruması veya geçici erişim engeli gösterdi.");
    if (status === 401 || status === 403) return verdict("error", `Platform anonim isteği reddetti (HTTP ${status}).`);
    if (platform.evaluator === "linkedin" && status === 999) {
        return verdict("error", "LinkedIn anonim profil isteğini bot koruması nedeniyle reddetti (HTTP 999).");
    }
    if (status >= 500) return verdict("error", `Platform geçici bir sunucu hatası döndürdü (HTTP ${status}).`);
    if ((platform.notFoundStatuses || []).includes(status)) return verdict("notFound", `Profil uç noktası hesabı bulamadı (HTTP ${status}).`);

    switch (platform.evaluator) {
        case "linkedin": {
            if (status === 200) {
                const canonicalUrl = body.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
                const hasProfileCard = /top-card-layout|property=["']profile:first_name["']/i.test(body);
                if (canonicalUrl
                    && normalizeUrl(canonicalUrl) === normalizeUrl(interpolate(platform.requestUrl, username))
                    && hasProfileCard) {
                    return verdict("found", "LinkedIn herkese açık profil sayfası kullanıcı adresini doğruladı.");
                }
                if (/authwall|uas\/login|linkedin login/i.test(body)) {
                    return verdict("error", "LinkedIn profil yerine giriş veya erişim duvarı gösterdi.");
                }
                return verdict("unknown", "LinkedIn yanıtı beklenen profil işaretlerini doğrulamadı.");
            }
            break;
        }
        case "jsonExact": {
            if (status < 200 || status >= 300) break;
            const identity = valueAt(data, platform.identityPath);
            return equalsUsername(identity, username)
                ? verdict("found", "Platform API'si kullanıcı adını doğruladı.")
                : verdict("unknown", "API yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
        }
        case "jsonArrayExact": {
            if (status < 200 || status >= 300 || !Array.isArray(data)) break;
            const match = data.some((item) => equalsUsername(valueAt(item, platform.identityPath), username));
            return match
                ? verdict("found", "Platform API'si kullanıcı adını doğruladı.")
                : verdict("notFound", "API sonuçlarında eşleşen kullanıcı bulunamadı.");
        }
        case "nullableJsonExact": {
            if (status < 200 || status >= 300) break;
            if (data === null) return verdict("notFound", "Platform API'si kullanıcı için boş sonuç döndürdü.");
            return equalsUsername(valueAt(data, platform.identityPath), username)
                ? verdict("found", "Platform API'si kullanıcı adını doğruladı.")
                : verdict("unknown", "API yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
        }
        case "instagram": {
            if (status === 200 && equalsUsername(data?.data?.user?.username, username)) {
                return verdict("found", "Instagram herkese açık profil uç noktası kullanıcı adını doğruladı.");
            }
            if (status === 200 && data?.data?.user === null) return verdict("notFound", "Instagram profili bulunamadı.");
            break;
        }
        case "dockerHub": {
            if (status === 200 && [data?.username, data?.orgname].some((identity) => equalsUsername(identity, username))) {
                return verdict("found", "Docker Hub API kullanıcı veya organizasyon adını doğruladı.");
            }
            break;
        }
        case "npmMaintainer": {
            if (status !== 200 || !Array.isArray(data?.objects)) break;
            const hasMaintainedPackage = data.objects.some((item) => (
                Array.isArray(item?.package?.maintainers)
                && item.package.maintainers.some((maintainer) => equalsUsername(maintainer?.username, username))
            ));
            return hasMaintainedPackage
                ? verdict("found", "npm Registry, kullanıcı adını yayımlanmış bir paketin maintainer kaydında doğruladı.")
                : verdict("unknown", "npm Registry'de bu kullanıcı adına ait herkese açık paket kaydı yok; paketsiz hesaplar anonim olarak doğrulanamıyor.");
        }
        case "lastFm": {
            if (status === 200 && equalsUsername(data?.user?.name, username)) {
                return verdict("found", "Last.fm API kullanıcı adını doğruladı.");
            }
            if (data?.error === 6 && /user not found/i.test(String(data?.message || ""))) {
                return verdict("notFound", "Last.fm API kullanıcıyı bulamadı.");
            }
            if (data?.error === 10) return verdict("error", "Last.fm API anahtarı geçersiz veya yetkisiz.");
            break;
        }
        case "deviantArtSearch": {
            if (status !== 200 || !Array.isArray(data?.results)) break;
            return data.results.some((item) => equalsUsername(item?.username, username))
                ? verdict("found", "DeviantArt OAuth API kullanıcı adını doğruladı.")
                : verdict("notFound", "DeviantArt OAuth API eşleşen kullanıcı bulamadı.");
        }
        case "keybase": {
            const code = valueAt(data, "status.code");
            if (status === 200 && code === 0 && equalsUsername(valueAt(data, "them.basics.username"), username)) {
                return verdict("found", "Keybase API kullanıcı adını doğruladı.");
            }
            if (status === 200 && code === 205) return verdict("notFound", "Keybase API kullanıcıyı bulamadı.");
            break;
        }
        case "codeforces": {
            const result = Array.isArray(data?.result) ? data.result : [];
            if (status === 200 && data?.status === "OK" && result.some((item) => equalsUsername(item?.handle, username))) {
                return verdict("found", "Codeforces API kullanıcı adını doğruladı.");
            }
            if (status === 400 && data?.status === "FAILED" && /not found/i.test(String(data?.comment || ""))) {
                return verdict("notFound", "Codeforces API kullanıcıyı bulamadı.");
            }
            break;
        }
        case "bluesky": {
            if (status === 200 && equalsUsername(data?.handle, `${username}.bsky.social`)) {
                return verdict("found", "Bluesky herkese açık API'si kullanıcı adını doğruladı.");
            }
            if (status === 400 && data?.error === "InvalidRequest" && /profile not found/i.test(String(data?.message || ""))) {
                return verdict("notFound", "Bluesky profili bulunamadı.");
            }
            break;
        }
        case "oembedExact": {
            if (status >= 200 && status < 300) {
                const actual = valueAt(data, platform.identityPath);
                return normalizeUrl(actual) === normalizeUrl(interpolate(platform.expectedUrl, username))
                    ? verdict("found", "oEmbed yanıtı profil adresini doğruladı.")
                    : verdict("unknown", "oEmbed yanıtı beklenen profil adresiyle eşleşmedi.");
            }
            if (platform.missingCode !== undefined && valueAt(data, platform.missingCodePath) === platform.missingCode) {
                return verdict("notFound", "oEmbed uç noktası profili bulamadı.");
            }
            break;
        }
        case "gravatar": {
            if (status >= 200 && status < 300) {
                const entries = Array.isArray(data?.entry) ? data.entry : [];
                return entries.some((item) => equalsUsername(item?.preferredUsername, username))
                    ? verdict("found", "Gravatar profili kullanıcı adını doğruladı.")
                    : verdict("unknown", "Gravatar yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
            }
            break;
        }
        case "pixelfed": {
            if (status === 200 && equalsUsername(data?.username, username)) return verdict("found", "Pixelfed API kullanıcı adını doğruladı.");
            if (status === 400 && data?.error === "Record not found") return verdict("notFound", "Pixelfed profili bulunamadı.");
            break;
        }
        case "lemmy": {
            if (status === 200 && equalsUsername(valueAt(data, "person_view.person.name"), username)) {
                return verdict("found", "Lemmy API kullanıcı adını doğruladı.");
            }
            break;
        }
        case "message": {
            if (status < 200 || status >= 300) break;
            if ((platform.missingMarkers || []).some((marker) => body.includes(marker))) {
                return verdict("notFound", "Platformun bilinen kullanıcı bulunamadı mesajı algılandı.");
            }
            const foundMarkers = [
                ...(platform.foundMarkers || []),
                ...(platform.foundTemplates || []).map((template) => interpolate(template, username)),
            ];
            if (foundMarkers.length && !foundMarkers.some((marker) => body.includes(marker))) {
                return verdict("unknown", "Sayfa yanıtı beklenen profil işaretini içermiyor.");
            }
            return verdict("found", "Profil sayfası kullanıcıya özgü içerik işaretini doğruladı.");
        }
        case "status":
            if (status >= 200 && status < 300) return verdict("found", `Profil uç noktası HTTP ${status} döndürdü.`);
            break;
        default:
            break;
    }

    if (status >= 400) return verdict("error", `Platform beklenmeyen bir HTTP ${status} yanıtı döndürdü.`);
    return verdict("unknown", "Platform yanıtından güvenilir bir sonuç çıkarılamadı.");
}

export async function checkPlatform(platform, username, options = {}) {
    if (platform.evaluator === "unsupported") return verdict("unknown", platform.reason);
    const variables = options.variables || {};
    if ((platform.requiredVariables || []).some((key) => !String(variables[key] || "").trim())) {
        return verdict("unknown", platform.missingVariableReason || "Bu platform için gerekli güvenli yapılandırma eksik.");
    }

    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

    try {
        const fetchImpl = options.fetchImpl || fetch;
        const requestVariables = { ...variables };
        const authHeaders = {};
        if (platform.requestAdapter === "redditOAuth" || platform.requestAdapter === "deviantArtOAuth") {
            const authentication = await requestOAuthToken(platform.requestAdapter, variables, fetchImpl, controller.signal);
            if (authentication.error) return authentication.error;
            requestVariables.accessToken = authentication.token;
            if (platform.requestAdapter === "redditOAuth") authHeaders.authorization = `Bearer ${authentication.token}`;
        }
        const response = await fetchImpl(interpolate(platform.requestUrl, username, requestVariables), {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                accept: "application/json,text/html,application/xml;q=0.9,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.8",
                "user-agent": "OmniToolsUsernameSearch/1.0 (+https://github.com/ardaltunel/omni-tools)",
                ...authHeaders,
                ...(platform.headers || {}),
            },
        });
        const body = await readLimitedText(response);
        let data = null;
        if (/json/i.test(response.headers.get("content-type") || "") || /^[\s\n]*[\[{]/.test(body)) {
            try { data = JSON.parse(body); } catch (_error) { data = null; }
        }
        return evaluate(platform, response, body, data, username);
    } catch (error) {
        if (options.signal?.aborted) throw error;
        if (controller.signal.aborted) return verdict("error", "Platform isteği zaman aşımına uğradı.");
        return verdict("unknown", `Ağ veya bağlantı hatası nedeniyle kontrol edilemedi (${error?.name || "NetworkError"}).`);
    } finally {
        clearTimeout(timeoutId);
        options.signal?.removeEventListener("abort", abortFromParent);
    }
}

export const internals = Object.freeze({ evaluate, interpolate, looksLikeAccessChallenge, normalizeUrl });
