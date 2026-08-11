"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

const GUILD_ID = "123456789012345678";
const BOT_TOKEN = "test.bot.token_abcdefghijklmnopqrstuvwxyz0123456789";

function jsonResponse(value, status = 200, headers = {}) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

class FakeWebSocket {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.listeners = new Map();
        this.sent = [];
        this.closed = null;
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
    }

    send(value) {
        this.sent.push(JSON.parse(value));
    }

    close(code, reason) {
        this.readyState = 3;
        this.closed = { code, reason };
    }

    emit(type, event) {
        Array.from(this.listeners.get(type) || []).forEach((listener) => listener(event));
    }

    message(payload) {
        this.emit("message", { data: JSON.stringify(payload) });
    }

    serverClose(code) {
        this.readyState = 3;
        this.emit("close", { code });
    }
}

function guild(overrides = {}) {
    return {
        id: GUILD_ID,
        name: "Örnek Sunucu",
        icon: "abcdefabcdefabcdefabcdefabcdefab",
        emojis: [
            { id: "223456789012345678", name: "merhaba", animated: false },
            { id: "323456789012345678", name: "dans", animated: true },
        ],
        stickers: [
            { id: "423456789012345678", name: "hoş geldin", format_type: 1 },
        ],
        ...overrides,
    };
}

function parseStoredZip(bytes) {
    const files = new Map();
    const decoder = new TextDecoder();
    let offset = 0;
    while (offset + 4 <= bytes.length) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
        if (view.getUint32(0, true) !== 0x04034b50) break;
        const size = view.getUint32(18, true);
        const nameLength = view.getUint16(26, true);
        const extraLength = view.getUint16(28, true);
        const nameStart = offset + 30;
        const dataStart = nameStart + nameLength + extraLength;
        const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
        files.set(name, bytes.slice(dataStart, dataStart + size));
        offset = dataStart + size;
    }
    return files;
}

test("Guild JSON içindeki emoji ve sticker verilerini normalize eder", () => {
    const [result] = core.parseGuildJson(JSON.stringify(guild()));
    assert.equal(result.id, GUILD_ID);
    assert.equal(result.name, "Örnek Sunucu");
    assert.equal(result.emojis.length, 2);
    assert.equal(result.emojis[1].animated, true);
    assert.equal(result.stickers[0].formatType, 1);
});

test("guilds sarmalayıcısını okur, sunucuları öğe sayısına göre sıralar ve tekrarları birleştirir", () => {
    const parsed = core.parseGuildJson({
        guilds: [
            guild({ name: "Zeta", emojis: [{ id: "523456789012345678", name: "ilk" }], stickers: [] }),
            guild({ name: "Zeta", emojis: [], stickers: [{ id: "623456789012345678", name: "ikinci", format_type: 4 }] }),
            guild({ id: "723456789012345678", name: "Alfa", emojis: [], stickers: [] }),
        ],
    });
    assert.deepEqual(parsed.map((item) => item.name), ["Zeta", "Alfa"]);
    assert.equal(parsed[0].emojis.length, 1);
    assert.equal(parsed[0].stickers.length, 1);
});

test("sunucuları toplam emoji ve sticker sayısına göre azalan, eşitlikte alfabetik sıralar", () => {
    const sorted = core.sortGuilds([
        { id: "1", name: "Zeta", emojis: [], stickers: [] },
        { id: "2", name: "Beta", emojis: [{}, {}], stickers: [{}] },
        { id: "3", name: "Alfa", emojis: [{}], stickers: [{}, {}] },
        { id: "4", name: "Gamma", emojis: [{}], stickers: [] },
    ]);
    assert.deepEqual(sorted.map((item) => item.name), ["Alfa", "Beta", "Gamma", "Zeta"]);
});

test("bozuk JSON ve Guild olmayan nesneler için anlaşılır hata verir", () => {
    assert.throws(() => core.parseGuildJson("{"), (error) => error.code === "invalid_json");
    assert.throws(() => core.parseGuildJson({ id: GUILD_ID, name: "Eksik" }), (error) => error.code === "invalid_guild");
});

test("statik ve animasyonlu emoji CDN URL'lerini doğru oluşturur", () => {
    const items = core.createGuildItems(core.parseGuildJson(guild())[0]);
    const animated = items.find((item) => item.name === "dans");
    const staticEmoji = items.find((item) => item.name === "merhaba");
    assert.equal(animated.downloadCandidates[0].url, "https://cdn.discordapp.com/emojis/323456789012345678.gif");
    assert.equal(animated.downloadCandidates[0].extension, "gif");
    assert.equal(staticEmoji.downloadCandidates[0].url, "https://cdn.discordapp.com/emojis/223456789012345678.png");
    assert.equal(staticEmoji.downloadCandidates[1].extension, "webp");
});

test("sunucu ikonunda statik ve animasyonlu CDN uzantısını ayırır", () => {
    assert.equal(
        core.getGuildIconUrl({ id: GUILD_ID, icon: "abcdefabcdefabcdefabcdefabcdefab" }),
        `https://cdn.discordapp.com/icons/${GUILD_ID}/abcdefabcdefabcdefabcdefabcdefab.webp?size=64`,
    );
    assert.match(core.getGuildIconUrl({ id: GUILD_ID, icon: "a_abcdefabcdefabcdefabcdefabcdefab" }), /\.gif\?size=64$/);
});

test("tüm resmi sticker formatlarını kayıpsız dosya türleriyle eşler", () => {
    const formats = [1, 2, 3, 4].map((formatType, index) => core.createStickerItem(GUILD_ID, {
        id: `${index + 8}23456789012345678`,
        name: `sticker-${formatType}`,
        formatType,
        available: true,
        description: "",
    }));
    assert.deepEqual(formats.map((item) => item.downloadCandidates[0].extension), ["png", "apng", "json", "gif"]);
    assert.match(formats[1].downloadCandidates[0].url, /^https:\/\/media\.discordapp\.net\//);
    assert.match(formats[1].downloadCandidates[0].url, /\.png$/);
    assert.match(formats[2].downloadCandidates[0].url, /\.json$/);
    assert.match(formats[3].downloadCandidates[0].url, /^https:\/\/media\.discordapp\.net\//);
});

test("dosya adlarında Unicode'u korur ve path traversal karakterlerini temizler", () => {
    assert.equal(core.sanitizeFilename("  çılgın/../dans\0:*?  "), "çılgın dans");
    assert.equal(core.sanitizeFilename("../../"), "dosya");
    assert.equal(core.sanitizeFilename("CON"), "_CON");
    assert.equal(core.createZipFilename("Benim Güzel/Sunucum"), "Discord_Emojis_Benim_Güzel_Sunucum.zip");
});

test("aynı isimli dosyaların üzerine yazılmasını engeller", () => {
    const used = new Set();
    assert.equal(core.createUniqueFilename("pepe", "png", used), "pepe.png");
    assert.equal(core.createUniqueFilename("pepe", "png", used), "pepe~1.png");
    assert.equal(core.createUniqueFilename("PEPE", "PNG", used), "PEPE~2.png");
});

test("Türkçe karakterlerden bağımsız filtreleme yapar", () => {
    const items = [
        { name: "Çılgın Dans", type: "emoji" },
        { name: "Hoş Geldin", type: "sticker" },
    ];
    assert.equal(core.filterItems(items, "emoji", "cilgin").length, 1);
    assert.equal(core.filterItems(items, "sticker", "hos").length, 1);
});

test("kontrollü eşzamanlılık sınırını aşmaz ve sıra bilgisini korur", async () => {
    let active = 0;
    let maximum = 0;
    const results = await core.mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 4));
        active -= 1;
        return value * 2;
    });
    assert.equal(maximum, 3);
    assert.deepEqual(results.map((result) => result.value), [2, 4, 6, 8, 10, 12]);
});

test("statik emojide PNG bulunamazsa WebP adayına geçer", async () => {
    const item = core.createEmojiItem(GUILD_ID, {
        id: "923456789012345678",
        name: "webp",
        animated: false,
        available: true,
    });
    const calls = [];
    const result = await core.fetchDiscordAsset(item, {
        fetchImpl: async (url) => {
            calls.push(url);
            if (url.endsWith(".png")) return new Response("missing", { status: 404 });
            return new Response(Uint8Array.from([82, 73, 70, 70]), {
                status: 200,
                headers: { "content-type": "image/webp" },
            });
        },
    });
    assert.equal(calls.length, 2);
    assert.equal(result.extension, "webp");
    assert.deepEqual(Array.from(result.data), [82, 73, 70, 70]);
});

test("Discord 429 yanıtını teknik olmayan rate limit hatasına dönüştürür", async () => {
    const item = core.createEmojiItem(GUILD_ID, {
        id: "923456789012345678",
        name: "limit",
        animated: true,
        available: true,
    });
    await assert.rejects(
        core.fetchDiscordAsset(item, { fetchImpl: async () => new Response("", { status: 429 }) }),
        (error) => error.code === "rate_limit" && /kısa bir süre/.test(error.message),
    );
});

test("bot token ile resmi Discord API'den bot kimliğini ve sunucuları yükler", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/users/@me")) {
            return jsonResponse({ id: "923456789012345678", username: "İndirme Botu", bot: true });
        }
        return jsonResponse([
            { id: "823456789012345678", name: "Zeta", icon: null },
            { id: GUILD_ID, name: "Alfa", icon: "abcdefabcdefabcdefabcdefabcdefab" },
        ]);
    };

    const result = await core.loadBotGuilds(BOT_TOKEN, { fetchImpl });
    assert.equal(result.bot.username, "İndirme Botu");
    assert.deepEqual(result.guilds.map((item) => item.name), ["Alfa", "Zeta"]);
    assert.equal(result.guilds[0].expressionsLoaded, false);
    assert.equal(calls.length, 2);
    calls.forEach(({ url, init }) => {
        assert.equal(init.headers.Authorization, `Bot ${BOT_TOKEN}`);
        assert.equal(init.credentials, "omit");
        assert.equal(url.includes(BOT_TOKEN), false);
    });
});

test("normal kullanıcı token'ını bot API akışında reddeder", async () => {
    await assert.rejects(
        core.loadBotGuilds(BOT_TOKEN, {
            fetchImpl: async () => jsonResponse({ id: "923456789012345678", username: "Kullanıcı", bot: false }),
        }),
        (error) => error.code === "user_token_not_allowed" && !error.message.includes(BOT_TOKEN),
    );
});

test("seçilen sunucunun emoji ve sticker uçlarını birlikte yükler", async () => {
    const paths = [];
    const result = await core.loadGuildExpressions({ id: GUILD_ID, name: "API Sunucusu", icon: "" }, BOT_TOKEN, {
        fetchImpl: async (url) => {
            paths.push(new URL(url).pathname);
            if (url.endsWith("/emojis")) {
                return jsonResponse([{ id: "223456789012345678", name: "hareket", animated: true }]);
            }
            return jsonResponse([{ id: "423456789012345678", name: "selam", format_type: 2 }]);
        },
    });
    assert.equal(result.expressionsLoaded, true);
    assert.equal(result.emojis[0].animated, true);
    assert.equal(result.stickers[0].formatType, 2);
    assert.deepEqual(paths.sort(), [
        `/api/v10/guilds/${GUILD_ID}/emojis`,
        `/api/v10/guilds/${GUILD_ID}/stickers`,
    ]);
});

test("Discord API kimlik doğrulama, rate limit ve ağ hatalarını güvenli kodlara dönüştürür", async () => {
    await assert.rejects(
        core.discordApiRequest("/users/@me", BOT_TOKEN, { fetchImpl: async () => jsonResponse({}, 401) }),
        (error) => error.code === "invalid_token" && !error.message.includes(BOT_TOKEN),
    );
    await assert.rejects(
        core.discordApiRequest("/users/@me", BOT_TOKEN, {
            fetchImpl: async () => jsonResponse({}, 429, { "retry-after": "2" }),
        }),
        (error) => error.code === "rate_limit" && error.retryAfter === 2,
    );
    await assert.rejects(
        core.discordApiRequest("/users/@me", BOT_TOKEN, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
        (error) => error.code === "network" && !error.message.includes(BOT_TOKEN),
    );
});

test("Discord API isteği dış AbortController ile iptal edilebilir", async () => {
    const controller = new AbortController();
    const promise = core.discordApiRequest("/users/@me", BOT_TOKEN, {
        signal: controller.signal,
        fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
    });
    controller.abort();
    await assert.rejects(promise, (error) => error.code === "aborted");
});

test("Discord Gateway Identify ve GUILD_CREATE olaylarından emoji/sticker verilerini toplar", async () => {
    FakeWebSocket.instances.length = 0;
    const secondGuildId = "823456789012345678";
    const expected = [
        { id: GUILD_ID, name: "Alfa", icon: "", emojis: [], stickers: [] },
        { id: secondGuildId, name: "Beta", icon: "", emojis: [], stickers: [] },
    ];
    const progress = [];
    const resultPromise = core.loadBotGatewayGuilds(BOT_TOKEN, expected, {
        WebSocketImpl: FakeWebSocket,
        random: () => 1,
        onProgress: (state) => progress.push(state.loaded),
    });
    const socket = FakeWebSocket.instances[0];
    assert.match(socket.url, /^wss:\/\/gateway\.discord\.gg\//);
    socket.message({ op: 10, d: { heartbeat_interval: 100_000 } });
    assert.equal(socket.sent[0].op, 2);
    assert.equal(socket.sent[0].d.token, BOT_TOKEN);
    assert.equal(socket.sent[0].d.intents, 1);
    socket.message({ op: 0, t: "READY", s: 1, d: { guilds: expected.map(({ id }) => ({ id, unavailable: true })) } });
    socket.message({
        op: 0,
        t: "GUILD_CREATE",
        s: 2,
        d: { ...guild(), id: GUILD_ID, name: "Alfa", stickers: [] },
    });
    socket.message({
        op: 0,
        t: "GUILD_CREATE",
        s: 3,
        d: {
            id: secondGuildId,
            name: "Beta",
            icon: null,
            emojis: [],
            stickers: [{ id: "723456789012345678", name: "beta-sticker", format_type: 4 }],
        },
    });
    const result = await resultPromise;
    assert.equal(result.complete, true);
    assert.equal(result.guilds.length, 2);
    assert.equal(result.guilds[0].expressionsLoaded, true);
    assert.equal(result.guilds[1].stickers[0].formatType, 4);
    assert.deepEqual(progress, [1, 2]);
    assert.deepEqual(socket.closed, { code: 1000, reason: "snapshot_complete" });
    assert.equal(JSON.stringify(result).includes(BOT_TOKEN), false);
});

test("Gateway geçici olarak kullanılamayan sunucuyu güvenli biçimde raporlar", async () => {
    FakeWebSocket.instances.length = 0;
    const resultPromise = core.loadBotGatewayGuilds(BOT_TOKEN, [guild()], { WebSocketImpl: FakeWebSocket, random: () => 1 });
    const socket = FakeWebSocket.instances[0];
    socket.message({ op: 10, d: { heartbeat_interval: 100_000 } });
    socket.message({ op: 0, t: "READY", d: { guilds: [{ id: GUILD_ID, unavailable: true }] } });
    socket.message({ op: 0, t: "GUILD_CREATE", d: { id: GUILD_ID, unavailable: true } });
    const result = await resultPromise;
    assert.equal(result.complete, false);
    assert.deepEqual(result.unavailableIds, [GUILD_ID]);
    assert.equal(result.guilds.length, 0);
});

test("Gateway kimlik doğrulama kapanışını ve dış iptali ayrı hatalara dönüştürür", async () => {
    FakeWebSocket.instances.length = 0;
    const rejected = core.loadBotGatewayGuilds(BOT_TOKEN, [guild()], { WebSocketImpl: FakeWebSocket });
    FakeWebSocket.instances[0].serverClose(4004);
    await assert.rejects(rejected, (error) => error.code === "invalid_token" && !error.message.includes(BOT_TOKEN));

    const controller = new AbortController();
    const aborted = core.loadBotGatewayGuilds(BOT_TOKEN, [guild()], {
        WebSocketImpl: FakeWebSocket,
        signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(aborted, (error) => error.code === "aborted");
});

test("ZIP içinde klasörleri, Unicode adları ve orijinal byte'ları korur", async () => {
    const original = Uint8Array.from([0, 1, 2, 250, 255]);
    const zip = core.createStoredZip([
        { path: "Emojis/", directory: true, data: new Uint8Array(0) },
        { path: "Stickers/", directory: true, data: new Uint8Array(0) },
        { path: "Emojis/çılgın.gif", data: original },
        { path: "../../Stickers/../kaçış.png", data: Uint8Array.from([9, 8, 7]) },
    ], { date: new Date("2026-01-02T03:04:06") });
    const files = parseStoredZip(new Uint8Array(await zip.arrayBuffer()));
    assert.equal(files.has("Emojis/"), true);
    assert.equal(files.has("Stickers/"), true);
    assert.deepEqual(Array.from(files.get("Emojis/çılgın.gif")), Array.from(original));
    assert.equal(Array.from(files.keys()).some((name) => name.includes("..")), false);
});

test("CRC32 standart doğrulama vektörünü üretir", () => {
    assert.equal(core.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});
