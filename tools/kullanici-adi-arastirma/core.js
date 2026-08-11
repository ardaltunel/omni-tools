(function initializeUsernameSearchCore(global) {
    "use strict";

    const STATUS_ORDER = Object.freeze({ found: 0, error: 1, unknown: 2, notFound: 3 });
    const STATUS_LABELS = Object.freeze({
        found: "Bulundu",
        notFound: "Bulunamadı",
        unknown: "Kontrol Edilemedi",
        error: "Hata / Rate Limit",
    });

    function normalizeUsername(value) {
        return String(value ?? "")
            .trim()
            .replace(/^@+/, "")
            .trim()
            .normalize("NFC");
    }

    function validateUsername(value) {
        const username = normalizeUsername(value);
        if (!username) return { valid: false, username, message: "Bir kullanıcı adı girin." };
        if (username.length > 64) {
            return { valid: false, username, message: "Kullanıcı adı en fazla 64 karakter olabilir." };
        }
        if (!/^[\p{L}\p{N}._-]+$/u.test(username) || !/[\p{L}\p{N}]/u.test(username)) {
            return {
                valid: false,
                username,
                message: "Yalnızca harf, rakam, nokta, alt çizgi ve kısa çizgi kullanın.",
            };
        }
        return { valid: true, username, message: "" };
    }

    function interpolateTemplate(template, username) {
        return String(template).replaceAll("{username}", encodeURIComponent(username));
    }

    function isUsernameValidForPlatform(platform, username) {
        if (!platform?.usernamePattern) return true;
        try {
            return new RegExp(platform.usernamePattern, "u").test(username);
        } catch (_error) {
            return false;
        }
    }

    function getValue(object, path) {
        if (!path) return object;
        return String(path).split(".").reduce((value, key) => value?.[key], object);
    }

    function equalsUsername(value, username) {
        return typeof value === "string"
            && value.localeCompare(username, "en", { sensitivity: "base" }) === 0;
    }

    function normalizeComparableUrl(value) {
        try {
            const url = new URL(String(value));
            url.hash = "";
            return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
        } catch (_error) {
            return String(value || "").replace(/\/+$/, "").toLowerCase();
        }
    }

    function verdict(status, detail) {
        return { status, detail };
    }

    function evaluateProbe(platform, probe, username) {
        const detection = platform?.detection || {};
        const status = Number(probe?.status || 0);
        const data = probe?.data;
        const notFoundStatuses = detection.notFoundStatuses || [];

        if (status === 429) return verdict("error", "Platform istek sınırına ulaşıldı.");
        if (status === 401 || status === 403) {
            return verdict("error", "Platform isteği reddetti veya kimlik doğrulaması istedi.");
        }
        if (status >= 500) return verdict("error", `Platform geçici bir sunucu hatası döndürdü (HTTP ${status}).`);
        if (notFoundStatuses.includes(status)) return verdict("notFound", "Hesap bulunamadı.");

        switch (detection.evaluator) {
            case "jsonExact": {
                if (status < 200 || status >= 300) break;
                const identity = getValue(data, detection.identityPath);
                if (equalsUsername(identity, username)) return verdict("found", "API kullanıcı adını doğruladı.");
                return verdict("unknown", "API yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
            }
            case "jsonArrayExact": {
                if (status < 200 || status >= 300) break;
                if (!Array.isArray(data)) return verdict("unknown", "API beklenmeyen bir yanıt döndürdü.");
                const match = data.some((item) => equalsUsername(getValue(item, detection.identityPath), username));
                return match
                    ? verdict("found", "API kullanıcı adını doğruladı.")
                    : verdict("notFound", "API sonuçlarında eşleşen kullanıcı yok.");
            }
            case "nullableJsonExact": {
                if (status < 200 || status >= 300) break;
                if (data === null) return verdict("notFound", "API kullanıcı için boş yanıt döndürdü.");
                const identity = getValue(data, detection.identityPath);
                return equalsUsername(identity, username)
                    ? verdict("found", "API kullanıcı adını doğruladı.")
                    : verdict("unknown", "API yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
            }
            case "npmMaintainer": {
                if (status !== 200 || !Array.isArray(data?.objects)) break;
                const hasMaintainedPackage = data.objects.some((item) => (
                    Array.isArray(item?.package?.maintainers)
                    && item.package.maintainers.some((maintainer) => equalsUsername(maintainer?.username, username))
                ));
                return hasMaintainedPackage
                    ? verdict("found", "npm Registry kullanıcı adını bir maintainer kaydında doğruladı.")
                    : verdict("unknown", "npm Registry'de herkese açık paket kaydı yok; paketsiz hesap doğrulanamıyor.");
            }
            case "keybase": {
                const code = getValue(data, "status.code");
                const identity = getValue(data, "them.basics.username");
                if (status === 200 && code === 0 && equalsUsername(identity, username)) {
                    return verdict("found", "Keybase API kullanıcı adını doğruladı.");
                }
                if (status === 200 && code === 205) return verdict("notFound", "Keybase API kullanıcıyı bulamadı.");
                return verdict("unknown", "Keybase API kesin bir sonuç vermedi.");
            }
            case "codeforces": {
                const result = Array.isArray(data?.result) ? data.result : [];
                const match = result.some((item) => equalsUsername(item?.handle, username));
                if (status === 200 && data?.status === "OK" && match) {
                    return verdict("found", "Codeforces API kullanıcı adını doğruladı.");
                }
                if (status === 400 && data?.status === "FAILED" && /not found/i.test(String(data?.comment || ""))) {
                    return verdict("notFound", "Codeforces API kullanıcıyı bulamadı.");
                }
                return verdict("unknown", "Codeforces API kesin bir sonuç vermedi.");
            }
            case "bluesky": {
                const expectedHandle = `${username}.bsky.social`;
                if (status === 200 && equalsUsername(data?.handle, expectedHandle)) {
                    return verdict("found", "Bluesky public API kullanıcı adını doğruladı.");
                }
                if (status === 400 && data?.error === "InvalidRequest" && /profile not found/i.test(String(data?.message || ""))) {
                    return verdict("notFound", "Bluesky profili bulunamadı.");
                }
                return verdict("unknown", "Bluesky API kesin bir sonuç vermedi.");
            }
            case "oembedExact": {
                if (status >= 200 && status < 300) {
                    const actualUrl = getValue(data, detection.identityPath);
                    const expectedUrl = interpolateTemplate(platform.profileUrl, username);
                    if (normalizeComparableUrl(actualUrl) === normalizeComparableUrl(expectedUrl)) {
                        return verdict("found", "oEmbed yanıtı profil adresini doğruladı.");
                    }
                    return verdict("unknown", "oEmbed yanıtı beklenen profil adresiyle eşleşmedi.");
                }
                const missingCode = getValue(data, detection.missingCodePath);
                if (detection.missingCode !== undefined && missingCode === detection.missingCode) {
                    return verdict("notFound", "oEmbed uç noktası profili bulamadı.");
                }
                break;
            }
            case "gravatar": {
                if (status >= 200 && status < 300) {
                    const entries = Array.isArray(data?.entry) ? data.entry : [];
                    const match = entries.some((item) => equalsUsername(item?.preferredUsername, username));
                    return match
                        ? verdict("found", "Gravatar profili kullanıcı adını doğruladı.")
                        : verdict("unknown", "Gravatar yanıtı beklenen kullanıcı kimliğini doğrulamadı.");
                }
                break;
            }
            case "pixelfed": {
                if (status === 200 && equalsUsername(data?.username, username)) {
                    return verdict("found", "Pixelfed API kullanıcı adını doğruladı.");
                }
                if (status === 400 && data?.error === "Record not found") {
                    return verdict("notFound", "Pixelfed profili bulunamadı.");
                }
                return verdict("unknown", "Pixelfed API kesin bir sonuç vermedi.");
            }
            case "lemmy": {
                if (status === 200 && equalsUsername(getValue(data, "person_view.person.name"), username)) {
                    return verdict("found", "Lemmy API kullanıcı adını doğruladı.");
                }
                break;
            }
            case "status": {
                if (status >= 200 && status < 300) return verdict("found", `Profil uç noktası HTTP ${status} döndürdü.`);
                break;
            }
            default:
                return verdict("unknown", "Platform için geçerli bir detection yöntemi tanımlı değil.");
        }

        if (status >= 400) return verdict("error", `Platform beklenmeyen bir HTTP ${status} yanıtı döndürdü.`);
        return verdict("unknown", "Platform yanıtından güvenilir bir sonuç çıkarılamadı.");
    }

    function createAbortError() {
        if (typeof DOMException === "function") return new DOMException("İstek iptal edildi.", "AbortError");
        const error = new Error("İstek iptal edildi.");
        error.name = "AbortError";
        return error;
    }

    function classifyFetchError(error, options = {}) {
        if (options.userAborted) throw createAbortError();
        if (options.timedOut) return verdict("error", "İstek zaman aşımına uğradı.");
        if (error?.name === "AbortError") return verdict("error", "İstek iptal edildi.");
        return verdict("unknown", "CORS, bağlantı veya ağ hatası nedeniyle kontrol edilemedi.");
    }

    async function checkPlatform(platform, username, options = {}) {
        const startedAt = Date.now();
        const checkedAt = new Date().toISOString();
        const profileUrl = interpolateTemplate(platform.profileUrl, username);
        const baseResult = {
            id: platform.id,
            platform: platform.name,
            username,
            url: profileUrl,
            priority: platform.priority || 0,
            iconUrl: platform.iconUrl || "",
            checkedAt,
        };

        if (!isUsernameValidForPlatform(platform, username)) {
            return {
                ...baseResult,
                status: "unknown",
                detail: "Kullanıcı adı bu platformun kullanıcı adı biçimiyle uyumlu değil.",
                durationMs: Date.now() - startedAt,
            };
        }

        const detection = platform.detection || {};
        if (detection.method === "unavailable") {
            return {
                ...baseResult,
                status: "unknown",
                detail: detection.reason || "Tarayıcıdan güvenilir biçimde kontrol edilemiyor.",
                durationMs: Date.now() - startedAt,
            };
        }

        const controller = new AbortController();
        const parentSignal = options.signal;
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 10000;
        let timedOut = false;
        const abortFromParent = () => controller.abort();
        if (parentSignal?.aborted) throw createAbortError();
        parentSignal?.addEventListener("abort", abortFromParent, { once: true });
        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);

        try {
            const response = await fetch(interpolateTemplate(detection.requestUrl, username), {
                method: detection.requestMethod || "GET",
                signal: controller.signal,
                cache: "no-store",
                credentials: "omit",
                redirect: "follow",
                referrerPolicy: "no-referrer",
                headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
            });
            const text = await response.text();
            let data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (_error) {
                    data = null;
                }
            }
            const result = evaluateProbe(platform, {
                status: response.status,
                data,
                text,
                responseUrl: response.url,
            }, username);
            return { ...baseResult, ...result, durationMs: Date.now() - startedAt };
        } catch (error) {
            const result = classifyFetchError(error, {
                timedOut,
                userAborted: Boolean(parentSignal?.aborted),
            });
            return { ...baseResult, ...result, durationMs: Date.now() - startedAt };
        } finally {
            clearTimeout(timeoutId);
            parentSignal?.removeEventListener("abort", abortFromParent);
        }
    }

    function normalizeApiBaseUrl(value) {
        try {
            const url = new URL(String(value || "").trim());
            if (!["http:", "https:"].includes(url.protocol)) return "";
            url.hash = "";
            url.search = "";
            return url.toString().replace(/\/+$/, "");
        } catch (_error) {
            return "";
        }
    }

    async function checkPlatformViaBackend(platform, username, options = {}) {
        const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
        if (!apiBaseUrl) throw new Error("Backend adresi yapılandırılmamış.");

        const startedAt = Date.now();
        const parentSignal = options.signal;
        const controller = new AbortController();
        const abortFromParent = () => controller.abort();
        if (parentSignal?.aborted) throw createAbortError();
        parentSignal?.addEventListener("abort", abortFromParent, { once: true });
        const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 12000);

        try {
            const endpoint = new URL(`${apiBaseUrl}/api/check`);
            endpoint.searchParams.set("platform", platform.id);
            endpoint.searchParams.set("username", username);
            const response = await fetch(endpoint, {
                method: "GET",
                signal: controller.signal,
                cache: "no-store",
                credentials: "omit",
                redirect: "follow",
                referrerPolicy: "no-referrer",
                headers: { Accept: "application/json" },
            });
            if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
            const payload = await response.json();
            const validStatuses = ["found", "notFound", "unknown", "error"];
            if (payload?.platform !== platform.id
                || payload?.username !== username
                || !validStatuses.includes(payload?.status)
                || typeof payload?.detail !== "string") {
                throw new Error("Backend geçersiz yanıt döndürdü.");
            }
            return {
                id: platform.id,
                platform: platform.name,
                username,
                url: interpolateTemplate(platform.profileUrl, username),
                priority: platform.priority || 0,
                iconUrl: platform.iconUrl || "",
                checkedAt: payload.checkedAt || new Date().toISOString(),
                durationMs: Number(payload.durationMs) || Date.now() - startedAt,
                status: payload.status,
                detail: payload.detail,
                source: "backend",
            };
        } catch (error) {
            if (parentSignal?.aborted) throw createAbortError();
            throw error;
        } finally {
            clearTimeout(timeoutId);
            parentSignal?.removeEventListener("abort", abortFromParent);
        }
    }

    async function checkPlatformWithBackend(platform, username, options = {}) {
        const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
        if (!apiBaseUrl) return checkPlatform(platform, username, options);

        let backendResult = null;
        try {
            backendResult = await checkPlatformViaBackend(platform, username, options);
            if (["found", "notFound"].includes(backendResult.status)) return backendResult;
        } catch (_error) {
            if (options.signal?.aborted) throw createAbortError();
        }

        if (platform.detection?.method === "fetch") {
            const browserResult = await checkPlatform(platform, username, options);
            browserResult.source = "browser-fallback";
            if (["found", "notFound"].includes(browserResult.status)) return browserResult;
            if (!backendResult) {
                browserResult.detail = `Backend'e ulaşılamadı. ${browserResult.detail}`;
                return browserResult;
            }
        }

        if (backendResult) return backendResult;
        const fallbackResult = await checkPlatform(platform, username, options);
        fallbackResult.source = "browser-fallback";
        fallbackResult.detail = `Backend'e ulaşılamadı. ${fallbackResult.detail}`;
        return fallbackResult;
    }

    function sortResults(results) {
        return [...results].sort((left, right) => {
            const statusDifference = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
            if (statusDifference) return statusDifference;
            const priorityDifference = (right.priority || 0) - (left.priority || 0);
            if (priorityDifference) return priorityDifference;
            return left.platform.localeCompare(right.platform, "tr", { sensitivity: "base" });
        });
    }

    function buildSummary(results) {
        return results.reduce((summary, result) => {
            summary.checked += 1;
            if (result.status === "found") summary.found += 1;
            else if (result.status === "notFound") summary.notFound += 1;
            else {
                summary.unknown += 1;
                if (result.status === "error") summary.errors += 1;
            }
            return summary;
        }, { checked: 0, found: 0, notFound: 0, unknown: 0, errors: 0 });
    }

    function buildExportPayload(username, searchedAt, results, options = {}) {
        const sortedResults = sortResults(results);
        return {
            username,
            searchedAt,
            stopped: Boolean(options.stopped),
            summary: buildSummary(sortedResults),
            results: sortedResults.map((result) => ({
                platform: result.platform,
                username: result.username,
                url: result.url,
                status: result.status,
                detail: result.detail,
                checkedAt: result.checkedAt,
            })),
        };
    }

    function escapeCsvCell(value) {
        let text = String(value ?? "");
        if (/^[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
    }

    function exportAsJson(payload) {
        return JSON.stringify(payload, null, 2);
    }

    function exportAsCsv(payload) {
        const columns = ["platform", "username", "url", "status", "detail", "checkedAt"];
        const rows = payload.results.map((result) => columns.map((column) => escapeCsvCell(result[column])).join(","));
        return `\uFEFF${columns.join(",")}\r\n${rows.join("\r\n")}`;
    }

    function exportAsText(payload) {
        const summary = payload.summary;
        const heading = [
            `Kullanıcı adı: @${payload.username}`,
            `Arama zamanı: ${payload.searchedAt}`,
            `Kontrol edilen: ${summary.checked}`,
            `Bulunan: ${summary.found}`,
            `Bulunamayan: ${summary.notFound}`,
            `Kontrol edilemeyen: ${summary.unknown}`,
            "",
        ];
        const rows = payload.results.map((result) => (
            `[${STATUS_LABELS[result.status] || result.status}] ${result.platform} - ${result.url} - ${result.detail}`
        ));
        return heading.concat(rows).join("\n");
    }

    function safeFilenamePart(value) {
        const normalized = String(value || "username")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48);
        return normalized || "username";
    }

    const api = Object.freeze({
        STATUS_LABELS,
        normalizeUsername,
        validateUsername,
        interpolateTemplate,
        isUsernameValidForPlatform,
        evaluateProbe,
        classifyFetchError,
        checkPlatform,
        normalizeApiBaseUrl,
        checkPlatformViaBackend,
        checkPlatformWithBackend,
        sortResults,
        buildSummary,
        buildExportPayload,
        exportAsJson,
        exportAsCsv,
        exportAsText,
        safeFilenamePart,
    });

    global.UsernameSearchCore = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
