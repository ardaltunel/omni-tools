(function initializeDiscordEmojiDownloaderCore(root, factory) {
    "use strict";

    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.DiscordEmojiDownloaderCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function discordEmojiDownloaderFactory() {
    "use strict";

    const MAX_JSON_LENGTH = 5_000_000;
    const MAX_GUILDS = 250;
    const MAX_EXPRESSIONS = 5_000;
    const MAX_ASSET_BYTES = 10 * 1024 * 1024;
    const DISCORD_API_BASE = "https://discord.com/api/v10";
    const DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
    const API_PATH_PATTERN = /^\/(?:users\/@me(?:\/guilds(?:\?(?:limit|after)=\d+(?:&(?:limit|after)=\d+)*)?)?|guilds\/\d{6,22}\/(?:emojis|stickers))$/;
    const SNOWFLAKE_PATTERN = /^\d{6,22}$/;
    const ICON_HASH_PATTERN = /^(?:a_)?[a-f\d]{16,64}$/i;
    const RESERVED_FILE_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
    const STICKER_FORMATS = Object.freeze({
        1: Object.freeze({ label: "PNG", extension: "png", animated: false }),
        2: Object.freeze({ label: "APNG", extension: "apng", animated: true }),
        3: Object.freeze({ label: "Lottie JSON", extension: "json", animated: true, lottie: true }),
        4: Object.freeze({ label: "GIF", extension: "gif", animated: true }),
    });

    class DiscordEmojiError extends Error {
        constructor(code, message, details = {}) {
            super(message);
            this.name = "DiscordEmojiError";
            this.code = code;
            Object.assign(this, details);
        }
    }

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function normalizeSnowflake(value) {
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) value = String(value);
        const snowflake = typeof value === "string" ? value.trim() : "";
        return SNOWFLAKE_PATTERN.test(snowflake) ? snowflake : "";
    }

    function normalizeName(value, fallback) {
        const normalized = typeof value === "string" ? value.trim().normalize("NFC") : "";
        return Array.from(normalized || fallback).slice(0, 100).join("");
    }

    function normalizeBotToken(value) {
        let token = typeof value === "string" ? value.trim() : "";
        token = token.replace(/^Bot\s+/i, "");
        if (token.length < 20 || token.length > 300 || /[\s\0-\x1f\x7f]/.test(token)) {
            throw new DiscordEmojiError("invalid_token", "Geçerli bir Discord bot token'ı girin.");
        }
        return token;
    }

    async function discordApiRequest(path, tokenValue, options = {}) {
        const token = normalizeBotToken(tokenValue);
        const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15_000;
        const parentSignal = options.signal;
        if (!fetchImpl) throw new DiscordEmojiError("network", "Discord API'ye bağlanılamadı.");
        if (typeof path !== "string" || !API_PATH_PATTERN.test(path)) {
            throw new DiscordEmojiError("invalid_api_path", "Discord API isteği güvenli değil.");
        }

        const controller = new AbortController();
        let timedOut = false;
        const abortFromParent = () => controller.abort(parentSignal?.reason);
        if (parentSignal?.aborted) abortFromParent();
        else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort("timeout");
        }, timeoutMs);

        try {
            const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                cache: "no-store",
                referrerPolicy: "no-referrer",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bot ${token}`,
                },
                signal: controller.signal,
            });

            if (response.status === 401) {
                throw new DiscordEmojiError("invalid_token", "Bot token geçersiz veya Discord tarafından iptal edilmiş.", { status: 401 });
            }
            if (response.status === 403) {
                throw new DiscordEmojiError("access_denied", "Botun bu sunucu verisine erişim izni yok.", { status: 403 });
            }
            if (response.status === 429) {
                const retryAfter = Number(response.headers?.get?.("retry-after") || 0);
                throw new DiscordEmojiError("rate_limit", "Discord istek sınırına ulaşıldı. Lütfen kısa bir süre sonra tekrar deneyin.", {
                    status: 429,
                    retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0,
                });
            }
            if (!response.ok) {
                const code = response.status === 404 ? "not_found" : response.status >= 500 ? "service_unavailable" : "api_error";
                throw new DiscordEmojiError(code, response.status >= 500
                    ? "Discord servisi şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin."
                    : "Discord API isteği tamamlanamadı.", { status: response.status });
            }

            try {
                return await response.json();
            } catch (_error) {
                throw new DiscordEmojiError("invalid_response", "Discord API geçersiz bir yanıt döndürdü.");
            }
        } catch (error) {
            if (error instanceof DiscordEmojiError) throw error;
            if (parentSignal?.aborted) throw new DiscordEmojiError("aborted", "Discord isteği iptal edildi.");
            if (timedOut || controller.signal.aborted) {
                throw new DiscordEmojiError("timeout", "Discord API isteği zaman aşımına uğradı.");
            }
            throw new DiscordEmojiError("network", "Discord API'ye ağ veya CORS kısıtlaması nedeniyle bağlanılamadı.");
        } finally {
            clearTimeout(timer);
            parentSignal?.removeEventListener("abort", abortFromParent);
        }
    }

    async function loadBotGuilds(token, options = {}) {
        const bot = await discordApiRequest("/users/@me", token, options);
        if (!isObject(bot) || normalizeSnowflake(bot.id) === "" || bot.bot !== true) {
            throw new DiscordEmojiError("user_token_not_allowed", "Bu araç normal Discord kullanıcı token'larını kabul etmez. Lütfen bot token'ı kullanın.");
        }

        const guildCandidates = [];
        let after = "";
        while (guildCandidates.length < MAX_GUILDS) {
            const limit = Math.min(200, MAX_GUILDS - guildCandidates.length);
            const query = `/users/@me/guilds?limit=${limit}${after ? `&after=${after}` : ""}`;
            const page = await discordApiRequest(query, token, options);
            if (!Array.isArray(page)) throw new DiscordEmojiError("invalid_response", "Discord sunucu listesi geçersiz.");
            guildCandidates.push(...page);
            if (page.length < limit) break;
            const nextAfter = normalizeSnowflake(page[page.length - 1]?.id);
            if (!nextAfter || nextAfter === after) break;
            after = nextAfter;
        }

        const guilds = guildCandidates
            .slice(0, MAX_GUILDS)
            .map((guild) => normalizeGuild({ ...guild, emojis: [], stickers: [] }))
            .filter(Boolean)
            .map((guild) => ({ ...guild, expressionsLoaded: false }));
        if (!guilds.length) {
            throw new DiscordEmojiError("no_guilds", "Bu botun eklendiği bir Discord sunucusu bulunamadı.");
        }

        return {
            bot: {
                id: normalizeSnowflake(bot.id),
                username: normalizeName(bot.global_name || bot.username, "Discord Bot"),
            },
            guilds: sortGuilds(mergeGuildCollections(guilds)),
        };
    }

    async function loadGuildExpressions(guild, token, options = {}) {
        const guildId = normalizeSnowflake(guild?.id);
        if (!guildId) throw new DiscordEmojiError("invalid_guild", "Discord sunucusu geçersiz.");
        const [emojis, stickers] = await Promise.all([
            discordApiRequest(`/guilds/${guildId}/emojis`, token, options),
            discordApiRequest(`/guilds/${guildId}/stickers`, token, options),
        ]);
        if (!Array.isArray(emojis) || !Array.isArray(stickers)) {
            throw new DiscordEmojiError("invalid_response", "Discord emoji veya çıkartma listesi geçersiz.");
        }
        const [normalized] = parseGuildJson({
            id: guildId,
            name: guild.name,
            icon: guild.icon,
            emojis,
            stickers,
        });
        return { ...normalized, expressionsLoaded: true };
    }

    function loadBotGatewayGuilds(tokenValue, expectedGuilds, options = {}) {
        const token = normalizeBotToken(tokenValue);
        const WebSocketImpl = options.WebSocketImpl || (typeof WebSocket === "function" ? WebSocket : null);
        const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(3_000, options.timeoutMs) : 20_000;
        const parentSignal = options.signal;
        const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
        const random = typeof options.random === "function" ? options.random : Math.random;
        const expectedIds = new Set((expectedGuilds || []).map((guild) => normalizeSnowflake(guild?.id)).filter(Boolean));
        if (!WebSocketImpl) throw new DiscordEmojiError("gateway_unsupported", "Tarayıcınız Discord Gateway bağlantısını desteklemiyor.");
        if (!expectedIds.size) throw new DiscordEmojiError("no_guilds", "Gateway üzerinden yüklenecek sunucu bulunamadı.");

        return new Promise((resolve, reject) => {
            const guilds = new Map();
            const unavailableIds = new Set();
            let socket = null;
            let heartbeatTimer = 0;
            let timeoutTimer = 0;
            let sequence = null;
            let awaitingHeartbeatAck = false;
            let ready = false;
            let settled = false;

            const removeSocketListeners = () => {
                if (!socket?.removeEventListener) return;
                socket.removeEventListener("message", handleMessage);
                socket.removeEventListener("close", handleClose);
                socket.removeEventListener("error", handleError);
            };

            const cleanup = () => {
                clearTimeout(heartbeatTimer);
                clearTimeout(timeoutTimer);
                parentSignal?.removeEventListener("abort", handleAbort);
                removeSocketListeners();
            };

            const closeSocket = () => {
                if (!socket || socket.readyState > 1) return;
                try {
                    socket.close(1000, "snapshot_complete");
                } catch (_error) {
                    // Bağlantı zaten kapanıyorsa ek işlem gerekmez.
                }
            };

            const succeed = () => {
                if (settled) return;
                settled = true;
                cleanup();
                closeSocket();
                resolve({
                    guilds: sortGuilds(Array.from(guilds.values())),
                    unavailableIds: Array.from(expectedIds).filter((id) => !guilds.has(id)),
                    complete: guilds.size === expectedIds.size,
                });
            };

            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                closeSocket();
                reject(error instanceof DiscordEmojiError
                    ? error
                    : new DiscordEmojiError("gateway_error", "Discord Gateway bağlantısı kurulamadı."));
            };

            const reportProgress = (guild) => {
                if (!onProgress) return;
                try {
                    onProgress({
                        loaded: guilds.size,
                        unavailable: unavailableIds.size,
                        total: expectedIds.size,
                        guild,
                    });
                } catch (_error) {
                    // Kullanıcı arayüzü callback hatası Gateway akışını bozmamalı.
                }
            };

            const maybeFinish = () => {
                if (guilds.size + unavailableIds.size >= expectedIds.size) succeed();
            };

            const send = (payload) => {
                if (!socket || socket.readyState !== 1) return false;
                try {
                    socket.send(JSON.stringify(payload));
                    return true;
                } catch (_error) {
                    fail(new DiscordEmojiError("gateway_network", "Discord Gateway bağlantısına veri gönderilemedi."));
                    return false;
                }
            };

            const scheduleHeartbeat = (delay, interval) => {
                clearTimeout(heartbeatTimer);
                heartbeatTimer = setTimeout(() => {
                    if (settled) return;
                    if (awaitingHeartbeatAck) {
                        fail(new DiscordEmojiError("gateway_zombie", "Discord Gateway kalp atışı yanıt vermedi."));
                        return;
                    }
                    awaitingHeartbeatAck = true;
                    if (send({ op: 1, d: sequence })) scheduleHeartbeat(interval, interval);
                }, Math.max(0, delay));
            };

            function handleMessage(event) {
                if (settled || typeof event?.data !== "string" || event.data.length > MAX_JSON_LENGTH) return;
                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch (_error) {
                    return;
                }
                if (Number.isInteger(payload?.s)) sequence = payload.s;

                if (payload?.op === 10) {
                    const interval = Math.max(1_000, Number(payload.d?.heartbeat_interval) || 45_000);
                    scheduleHeartbeat(Math.floor(interval * Math.min(1, Math.max(0, Number(random()) || 0))), interval);
                    send({
                        op: 2,
                        d: {
                            token,
                            intents: 1,
                            properties: {
                                os: "browser",
                                browser: "omni-tools",
                                device: "omni-tools",
                            },
                        },
                    });
                    return;
                }
                if (payload?.op === 11) {
                    awaitingHeartbeatAck = false;
                    return;
                }
                if (payload?.op === 1) {
                    awaitingHeartbeatAck = true;
                    send({ op: 1, d: sequence });
                    return;
                }
                if (payload?.op === 7) {
                    fail(new DiscordEmojiError("gateway_reconnect", "Discord Gateway yeniden bağlantı istedi. Lütfen tekrar deneyin."));
                    return;
                }
                if (payload?.op === 9) {
                    fail(new DiscordEmojiError("gateway_invalid_session", "Discord Gateway oturumu başlatılamadı. Lütfen kısa bir süre sonra tekrar deneyin."));
                    return;
                }
                if (payload?.op !== 0) return;

                if (payload.t === "READY") {
                    ready = true;
                    const readyGuilds = Array.isArray(payload.d?.guilds) ? payload.d.guilds : [];
                    readyGuilds.forEach((guild) => {
                        const id = normalizeSnowflake(guild?.id);
                        if (id && expectedIds.has(id) && guild.unavailable === false) unavailableIds.delete(id);
                    });
                    maybeFinish();
                    return;
                }

                if (payload.t !== "GUILD_CREATE") return;
                const id = normalizeSnowflake(payload.d?.id);
                if (!id || !expectedIds.has(id)) return;
                if (payload.d?.unavailable === true) {
                    unavailableIds.add(id);
                    reportProgress(null);
                    maybeFinish();
                    return;
                }
                const fallback = (expectedGuilds || []).find((guild) => guild.id === id);
                const normalized = normalizeGuild({
                    ...payload.d,
                    id,
                    name: payload.d?.name || fallback?.name,
                    icon: payload.d?.icon || fallback?.icon,
                    emojis: Array.isArray(payload.d?.emojis) ? payload.d.emojis : [],
                    stickers: Array.isArray(payload.d?.stickers) ? payload.d.stickers : [],
                });
                if (!normalized) return;
                guilds.set(id, { ...normalized, expressionsLoaded: true });
                unavailableIds.delete(id);
                reportProgress(guilds.get(id));
                maybeFinish();
            }

            function handleClose(event) {
                if (settled) return;
                const code = Number(event?.code) || 0;
                if (code === 4004) {
                    fail(new DiscordEmojiError("invalid_token", "Bot token Discord Gateway tarafından reddedildi."));
                    return;
                }
                if (code === 4013 || code === 4014) {
                    fail(new DiscordEmojiError("gateway_intents", "Discord Gateway intent ayarları bağlantıyı reddetti."));
                    return;
                }
                if (ready && guilds.size) {
                    succeed();
                    return;
                }
                fail(new DiscordEmojiError("gateway_closed", "Discord Gateway bağlantısı veri alınmadan kapandı."));
            }

            function handleError() {
                if (!settled && (!socket || socket.readyState > 1)) {
                    fail(new DiscordEmojiError("gateway_network", "Discord Gateway bağlantısı kurulamadı."));
                }
            }

            function handleAbort() {
                fail(new DiscordEmojiError("aborted", "Discord Gateway isteği iptal edildi."));
            }

            if (parentSignal?.aborted) {
                handleAbort();
                return;
            }
            parentSignal?.addEventListener("abort", handleAbort, { once: true });
            timeoutTimer = setTimeout(() => {
                if (guilds.size || unavailableIds.size) succeed();
                else fail(new DiscordEmojiError("gateway_timeout", "Discord Gateway sunucu verilerini zamanında göndermedi."));
            }, timeoutMs);

            try {
                socket = new WebSocketImpl(options.gatewayUrl || DISCORD_GATEWAY_URL);
                socket.addEventListener("message", handleMessage);
                socket.addEventListener("close", handleClose);
                socket.addEventListener("error", handleError);
            } catch (_error) {
                fail(new DiscordEmojiError("gateway_network", "Discord Gateway bağlantısı başlatılamadı."));
            }
        });
    }

    function parseGuildJson(input) {
        let parsed = input;
        if (typeof input === "string") {
            const source = input.trim();
            if (!source) {
                throw new DiscordEmojiError("empty_json", "Guild JSON verisi boş bırakılamaz.");
            }
            if (source.length > MAX_JSON_LENGTH) {
                throw new DiscordEmojiError("json_too_large", "Guild JSON verisi işlenebilecek boyutu aşıyor.");
            }
            try {
                parsed = JSON.parse(source);
            } catch (_error) {
                throw new DiscordEmojiError("invalid_json", "Geçerli bir Discord Guild JSON verisi bulunamadı.");
            }
        }

        const candidates = extractGuildCandidates(parsed);
        if (candidates.length > MAX_GUILDS) {
            throw new DiscordEmojiError("too_many_guilds", `En fazla ${MAX_GUILDS} sunucu aynı anda yüklenebilir.`);
        }

        const guilds = candidates.map(normalizeGuild).filter(Boolean);
        if (!guilds.length) {
            throw new DiscordEmojiError("invalid_guild", "Geçerli bir Discord Guild JSON verisi bulunamadı.");
        }

        const expressionCount = guilds.reduce((count, guild) => count + guild.emojis.length + guild.stickers.length, 0);
        if (expressionCount > MAX_EXPRESSIONS) {
            throw new DiscordEmojiError("too_many_expressions", `En fazla ${MAX_EXPRESSIONS} emoji ve çıkartma aynı anda yüklenebilir.`);
        }

        return sortGuilds(mergeGuildCollections(guilds));
    }

    function extractGuildCandidates(value) {
        if (Array.isArray(value)) return value;
        if (!isObject(value)) return [];
        if (Array.isArray(value.guilds)) return value.guilds;
        if (isObject(value.guild)) return [value.guild];
        if (isObject(value.d)) {
            if (Array.isArray(value.d.guilds)) return value.d.guilds;
            return [value.d];
        }
        return [value];
    }

    function normalizeGuild(candidate) {
        if (!isObject(candidate)) return null;
        const id = normalizeSnowflake(candidate.id || candidate.guild_id || candidate.guildId);
        const hasExpressions = Array.isArray(candidate.emojis) || Array.isArray(candidate.stickers);
        if (!id || !hasExpressions) return null;

        const name = normalizeName(candidate.name, `Sunucu ${id}`);
        const iconValue = typeof candidate.icon === "string" ? candidate.icon.trim() : "";
        const icon = ICON_HASH_PATTERN.test(iconValue) ? iconValue : "";

        return {
            id,
            name,
            icon,
            emojis: normalizeEmojis(candidate.emojis),
            stickers: normalizeStickers(candidate.stickers),
        };
    }

    function normalizeEmojis(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const emojis = [];
        value.forEach((candidate) => {
            if (!isObject(candidate)) return;
            const id = normalizeSnowflake(candidate.id);
            if (!id || seen.has(id)) return;
            seen.add(id);
            emojis.push({
                id,
                name: normalizeName(candidate.name, `emoji_${id}`),
                animated: candidate.animated === true,
                available: candidate.available !== false,
            });
        });
        return emojis;
    }

    function normalizeStickers(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const stickers = [];
        value.forEach((candidate) => {
            if (!isObject(candidate)) return;
            const id = normalizeSnowflake(candidate.id);
            if (!id || seen.has(id)) return;
            const formatType = Number(candidate.format_type ?? candidate.formatType);
            seen.add(id);
            stickers.push({
                id,
                name: normalizeName(candidate.name, `sticker_${id}`),
                formatType: Number.isInteger(formatType) ? formatType : 0,
                available: candidate.available !== false,
                description: normalizeName(candidate.description, ""),
            });
        });
        return stickers;
    }

    function mergeGuildCollections(guilds) {
        const byId = new Map();
        guilds.forEach((guild) => {
            const existing = byId.get(guild.id);
            if (!existing) {
                byId.set(guild.id, {
                    ...guild,
                    emojis: [...guild.emojis],
                    stickers: [...guild.stickers],
                });
                return;
            }

            existing.name = guild.name || existing.name;
            existing.icon = guild.icon || existing.icon;
            existing.emojis = mergeExpressions(existing.emojis, guild.emojis);
            existing.stickers = mergeExpressions(existing.stickers, guild.stickers);
        });
        return Array.from(byId.values());
    }

    function mergeExpressions(first, second) {
        const map = new Map(first.map((item) => [item.id, item]));
        second.forEach((item) => map.set(item.id, item));
        return Array.from(map.values());
    }

    function sortGuilds(guilds) {
        return [...guilds].sort((first, second) => {
            const firstCount = (first?.emojis?.length || 0) + (first?.stickers?.length || 0);
            const secondCount = (second?.emojis?.length || 0) + (second?.stickers?.length || 0);
            if (secondCount !== firstCount) return secondCount - firstCount;
            return first.name.localeCompare(second.name, "tr", { sensitivity: "base" });
        });
    }

    function getGuildIconUrl(guild) {
        if (!guild?.id || !guild?.icon) return "";
        const extension = guild.icon.startsWith("a_") ? "gif" : "webp";
        return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${extension}?size=64`;
    }

    function createGuildItems(guild) {
        if (!guild) return [];
        const emojis = guild.emojis.map((emoji) => createEmojiItem(guild.id, emoji));
        const stickers = guild.stickers.map((sticker) => createStickerItem(guild.id, sticker));
        return [...emojis, ...stickers].sort((first, second) => first.name.localeCompare(second.name, "tr", { sensitivity: "base" }));
    }

    function createEmojiItem(guildId, emoji) {
        const baseUrl = `https://cdn.discordapp.com/emojis/${emoji.id}`;
        const animated = emoji.animated === true;
        return {
            key: `emoji:${guildId}:${emoji.id}`,
            guildId,
            id: emoji.id,
            type: "emoji",
            name: emoji.name,
            animated,
            available: emoji.available,
            formatLabel: animated ? "Animasyonlu GIF" : "Statik",
            previewUrl: `${baseUrl}.${animated ? "gif" : "webp"}?size=96`,
            previewFallbackUrl: animated ? "" : `${baseUrl}.png?size=96`,
            downloadCandidates: animated
                ? [{ url: `${baseUrl}.gif`, extension: "gif", mimeTypes: ["image/gif"], preserveExtension: true }]
                : [
                    { url: `${baseUrl}.png`, extension: "png", mimeTypes: ["image/png", "image/jpeg"] },
                    { url: `${baseUrl}.webp`, extension: "webp", mimeTypes: ["image/webp"], preserveExtension: true },
                ],
        };
    }

    function createStickerItem(guildId, sticker) {
        const format = STICKER_FORMATS[sticker.formatType] || {
            label: "Bilinmeyen format",
            extension: "bin",
            animated: false,
            unsupported: true,
        };
        let url = "";
        let mimeTypes = [];

        if (sticker.formatType === 1 || sticker.formatType === 2) {
            url = `https://media.discordapp.net/stickers/${sticker.id}.png`;
            mimeTypes = ["image/png"];
        } else if (sticker.formatType === 3) {
            url = `https://cdn.discordapp.com/stickers/${sticker.id}.json`;
            mimeTypes = ["application/json", "text/json"];
        } else if (sticker.formatType === 4) {
            url = `https://media.discordapp.net/stickers/${sticker.id}.gif`;
            mimeTypes = ["image/gif"];
        }

        return {
            key: `sticker:${guildId}:${sticker.id}`,
            guildId,
            id: sticker.id,
            type: "sticker",
            name: sticker.name,
            animated: format.animated,
            lottie: format.lottie === true,
            available: sticker.available,
            description: sticker.description,
            formatLabel: format.label,
            previewUrl: format.lottie || format.unsupported ? "" : url,
            previewFallbackUrl: "",
            downloadCandidates: url ? [{
                url,
                extension: format.extension,
                mimeTypes,
                preserveExtension: true,
            }] : [],
        };
    }

    function sanitizeFilename(value, fallback = "dosya") {
        let name = String(value ?? "").normalize("NFC");
        name = name
            .replace(/[\0-\x1f\x7f]/g, " ")
            .replace(/[<>:"/\\|?*]/g, " ")
            .replace(/\.{2,}/g, " ")
            .replace(/\s+/g, " ")
            .replace(/[. ]+$/g, "")
            .trim();
        if (!name) name = fallback;
        if (RESERVED_FILE_NAMES.test(name)) name = `_${name}`;
        name = Array.from(name).slice(0, 100).join("").replace(/[. ]+$/g, "");
        return name || fallback;
    }

    function createUniqueFilename(name, extension, usedNames) {
        const used = usedNames instanceof Set ? usedNames : new Set();
        const safeBase = sanitizeFilename(name);
        const safeExtension = /^[a-z\d]{1,8}$/i.test(String(extension)) ? String(extension).toLowerCase() : "bin";
        let counter = 0;
        let filename = `${safeBase}.${safeExtension}`;
        while (used.has(filename.toLocaleLowerCase("tr-TR"))) {
            counter += 1;
            filename = `${safeBase}~${counter}.${safeExtension}`;
        }
        used.add(filename.toLocaleLowerCase("tr-TR"));
        return filename;
    }

    function createZipFilename(guildName) {
        const safeName = sanitizeFilename(guildName, "Sunucu").replace(/\s+/g, "_");
        return `Discord_Emojis_${safeName}.zip`;
    }

    function filterItems(items, type = "all", query = "") {
        const normalizedQuery = normalizeSearchText(query);
        return items.filter((item) => {
            const typeMatches = type === "all" || item.type === type;
            const nameMatches = !normalizedQuery || normalizeSearchText(item.name).includes(normalizedQuery);
            return typeMatches && nameMatches;
        });
    }

    function normalizeSearchText(value) {
        return String(value ?? "")
            .toLocaleLowerCase("tr-TR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i");
    }

    async function fetchDiscordAsset(item, options = {}) {
        const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15_000;
        const parentSignal = options.signal;
        const candidates = Array.isArray(item?.downloadCandidates) ? item.downloadCandidates : [];
        if (!fetchImpl || !candidates.length) {
            throw new DiscordEmojiError("unsupported_format", "Bu öğenin dosya formatı desteklenmiyor.");
        }

        let lastError = null;
        for (const candidate of candidates) {
            try {
                return await fetchCandidate(candidate, fetchImpl, timeoutMs, parentSignal);
            } catch (error) {
                lastError = error;
                if (["rate_limit", "aborted", "asset_too_large", "access_denied"].includes(error?.code)) throw error;
            }
        }
        throw lastError || new DiscordEmojiError("download_failed", "Dosya Discord CDN'inden alınamadı.");
    }

    async function fetchCandidate(candidate, fetchImpl, timeoutMs, parentSignal) {
        const controller = new AbortController();
        const abortFromParent = () => controller.abort(parentSignal?.reason);
        if (parentSignal?.aborted) abortFromParent();
        else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
        const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

        try {
            const response = await fetchImpl(candidate.url, {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                cache: "force-cache",
                referrerPolicy: "no-referrer",
                signal: controller.signal,
            });
            if (response.status === 429) {
                throw new DiscordEmojiError("rate_limit", "Discord istek sınırına ulaşıldı. Lütfen kısa bir süre sonra tekrar deneyin.", { status: 429 });
            }
            if (response.status === 401 || response.status === 403) {
                throw new DiscordEmojiError("access_denied", "Discord CDN bu dosyaya erişimi reddetti.", { status: response.status });
            }
            if (!response.ok) {
                throw new DiscordEmojiError(response.status === 404 ? "not_found" : "http_error", "Dosya Discord CDN'inde bulunamadı.", { status: response.status });
            }

            const declaredLength = Number(response.headers?.get?.("content-length") || 0);
            if (declaredLength > MAX_ASSET_BYTES) {
                throw new DiscordEmojiError("asset_too_large", "Dosya güvenli indirme boyutu sınırını aşıyor.");
            }
            const contentType = String(response.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
            const allowedTypes = candidate.mimeTypes || [];
            if (allowedTypes.length && contentType && !allowedTypes.includes(contentType)) {
                throw new DiscordEmojiError("invalid_content", "Discord CDN beklenmeyen bir dosya türü döndürdü.");
            }

            const data = new Uint8Array(await response.arrayBuffer());
            if (!data.byteLength) throw new DiscordEmojiError("empty_asset", "Discord CDN boş bir dosya döndürdü.");
            if (data.byteLength > MAX_ASSET_BYTES) {
                throw new DiscordEmojiError("asset_too_large", "Dosya güvenli indirme boyutu sınırını aşıyor.");
            }

            return {
                data,
                extension: candidate.preserveExtension ? candidate.extension : extensionFromContentType(contentType, candidate.extension),
                contentType: contentType || "application/octet-stream",
                sourceUrl: candidate.url,
            };
        } catch (error) {
            if (error instanceof DiscordEmojiError) throw error;
            if (parentSignal?.aborted) throw new DiscordEmojiError("aborted", "İndirme iptal edildi.");
            if (controller.signal.aborted) throw new DiscordEmojiError("timeout", "Discord CDN isteği zaman aşımına uğradı.");
            throw new DiscordEmojiError("network", "Dosya ağ veya CORS kısıtlaması nedeniyle alınamadı.");
        } finally {
            clearTimeout(timer);
            parentSignal?.removeEventListener("abort", abortFromParent);
        }
    }

    function extensionFromContentType(contentType, fallback) {
        const extensions = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/gif": "gif",
            "image/webp": "webp",
            "application/json": "json",
            "text/json": "json",
        };
        return extensions[contentType] || fallback || "bin";
    }

    async function mapWithConcurrency(items, limit, worker, onProgress) {
        const values = Array.from(items || []);
        const results = new Array(values.length);
        let cursor = 0;
        let completed = 0;
        const workerCount = Math.max(1, Math.min(Number(limit) || 1, values.length || 1));

        async function consume() {
            while (cursor < values.length) {
                const index = cursor;
                cursor += 1;
                try {
                    results[index] = { status: "fulfilled", value: await worker(values[index], index) };
                } catch (reason) {
                    results[index] = { status: "rejected", reason };
                }
                completed += 1;
                if (typeof onProgress === "function") onProgress(completed, values.length, results[index]);
            }
        }

        await Promise.all(Array.from({ length: workerCount }, consume));
        return results;
    }

    function normalizeZipPath(path, directory) {
        const parts = String(path ?? "")
            .replace(/\\/g, "/")
            .split("/")
            .filter((part) => part && part !== "." && part !== "..")
            .map((part) => sanitizeFilename(part));
        if (!parts.length) throw new DiscordEmojiError("invalid_zip_path", "ZIP dosya yolu geçersiz.");
        return `${parts.join("/")}${directory ? "/" : ""}`;
    }

    function createStoredZip(files, options = {}) {
        const now = options.date instanceof Date ? options.date : new Date();
        const prepared = (files || []).map((file) => {
            const directory = file.directory === true || String(file.path || "").endsWith("/");
            const path = normalizeZipPath(file.path, directory);
            const nameBytes = new TextEncoder().encode(path);
            const data = directory ? new Uint8Array(0) : toUint8Array(file.data);
            return { path, nameBytes, data, directory, crc: crc32(data) };
        });
        if (prepared.length > 65_535) throw new DiscordEmojiError("zip_too_many_files", "ZIP dosyası çok fazla öğe içeriyor.");

        const localParts = [];
        const centralParts = [];
        const { dosDate, dosTime } = toDosDateTime(now);
        let localOffset = 0;

        prepared.forEach((file) => {
            if (file.data.byteLength > 0xffffffff || localOffset > 0xffffffff) {
                throw new DiscordEmojiError("zip_too_large", "ZIP dosyası tarayıcı ZIP32 sınırını aşıyor.");
            }

            const localHeader = new Uint8Array(30);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, dosTime, true);
            localView.setUint16(12, dosDate, true);
            localView.setUint32(14, file.crc, true);
            localView.setUint32(18, file.data.byteLength, true);
            localView.setUint32(22, file.data.byteLength, true);
            localView.setUint16(26, file.nameBytes.byteLength, true);
            localView.setUint16(28, 0, true);
            localParts.push(localHeader, file.nameBytes, file.data);

            const centralHeader = new Uint8Array(46);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, dosTime, true);
            centralView.setUint16(14, dosDate, true);
            centralView.setUint32(16, file.crc, true);
            centralView.setUint32(20, file.data.byteLength, true);
            centralView.setUint32(24, file.data.byteLength, true);
            centralView.setUint16(28, file.nameBytes.byteLength, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, file.directory ? 0x10 : 0, true);
            centralView.setUint32(42, localOffset, true);
            centralParts.push(centralHeader, file.nameBytes);
            localOffset += localHeader.byteLength + file.nameBytes.byteLength + file.data.byteLength;
        });

        const centralSize = centralParts.reduce((size, part) => size + part.byteLength, 0);
        if (localOffset + centralSize > 0xffffffff) throw new DiscordEmojiError("zip_too_large", "ZIP dosyası tarayıcı ZIP32 sınırını aşıyor.");
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, prepared.length, true);
        endView.setUint16(10, prepared.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);

        return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
    }

    function toUint8Array(value) {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        throw new DiscordEmojiError("invalid_zip_data", "ZIP dosya verisi geçersiz.");
    }

    function toDosDateTime(date) {
        const year = Math.max(1980, date.getFullYear());
        return {
            dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
            dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        };
    }

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
            let value = index;
            for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
            table[index] = value >>> 0;
        }
        return table;
    })();

    function crc32(data) {
        let crc = 0xffffffff;
        for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    return Object.freeze({
        DiscordEmojiError,
        STICKER_FORMATS,
        parseGuildJson,
        mergeGuildCollections,
        sortGuilds,
        getGuildIconUrl,
        createGuildItems,
        createEmojiItem,
        createStickerItem,
        sanitizeFilename,
        createUniqueFilename,
        createZipFilename,
        filterItems,
        normalizeSearchText,
        normalizeBotToken,
        discordApiRequest,
        loadBotGuilds,
        loadGuildExpressions,
        loadBotGatewayGuilds,
        fetchDiscordAsset,
        mapWithConcurrency,
        createStoredZip,
        crc32,
    });
});
