import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const encode = (value) => new TextEncoder().encode(value);
const event = (value) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (value) => event({ type: "response.output_text.delta", delta: value });
const completed = event({ type: "response.completed" });
const streamResponse = (text) => new Response(new ReadableStream({ start(controller) { controller.enqueue(encode(text)); controller.close(); } }));

function createApp({ ignoreAbort = false, initialStorage = new Map() } = {}) {
    class Element {
        constructor(tag = "div") {
            this.tag = tag;
            this.value = "";
            this.textContent = "";
            this.hidden = false;
            this.disabled = false;
            this.children = [];
            this.attributes = {};
            this.listeners = new Map();
            this.dataset = {};
            this.style = {};
            this.className = "";
            this.scrollHeight = 500;
            this.clientHeight = 500;
            this.scrollTop = 0;
            this.classList = {
                contains: (name) => this.className.split(/\s+/u).includes(name),
                toggle: (name, enabled) => {
                    const names = new Set(this.className.split(/\s+/u).filter(Boolean));
                    if (enabled ?? !names.has(name)) names.add(name);
                    else names.delete(name);
                    this.className = [...names].join(" ");
                },
            };
        }
        append(...items) { this.children.push(...items.flatMap((item) => item.tag === "fragment" ? item.children : [item])); }
        prepend(item) { this.children.unshift(item); }
        replaceChildren(...items) {
            this.children = [];
            this.append(...items);
            if (this.tag === "select") this.value = this.children.find((item) => item.selected)?.value || "";
        }
        addEventListener(type, listener) { this.listeners.set(type, listener); }
        setAttribute(name, value) { this.attributes[name] = value; }
        focus() {}
        querySelector(selector) {
            const id = selector.match(/\[data-message-id="([^"]+)"\]/u)?.[1];
            const parent = id ? find(this, (node) => node.dataset.messageId === id) : this;
            return find(parent, (node) => node.classList.contains("omni-ai-message-content"));
        }
    }
    function find(parent, predicate) {
        if (!parent) return null;
        if (predicate(parent)) return parent;
        for (const child of parent.children) {
            const match = find(child, predicate);
            if (match) return match;
        }
        return null;
    }
    const elements = new Map();
    const selectIds = new Set(["mode", "length", "dialog-length"]);
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, new Element(selectIds.has(id) ? "select" : "div"));
        return elements.get(id);
    };
    const document = {
        getElementById: (id) => element(id === "omni-ai" ? "panel" : id.replace(/^omni-ai-/u, "")),
        createElement: (tag) => new Element(tag),
        createDocumentFragment: () => new Element("fragment"),
    };
    const timers = new Map();
    const frames = new Map();
    const listeners = new Map();
    const storage = new Map(initialStorage);
    let serial = 0;
    let now = 0;
    const window = {
        crypto: webcrypto,
        setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, time: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        confirm: () => true,
        addEventListener(type, listener, options = {}) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push({ listener, once: options.once });
        },
        OmniAiMarkdown: { renderMarkdown(target, text) { target.textContent = text; } },
    };
    const requests = [];
    const fetch = (url, options) => new Promise((resolve, reject) => {
        requests.push({ url, signal: options.signal, body: JSON.parse(options.body), respond: resolve });
        if (!ignoreAbort) options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const localStorage = {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
    };
    const context = vm.createContext({ window, document, localStorage, fetch, AbortController, TextDecoder, CSS: { escape: (value) => value }, navigator: {} });
    for (const file of ["config.js", "core.js", "app.js"]) {
        vm.runInContext(fs.readFileSync(path.resolve(directory, "..", file), "utf8"), context);
    }
    const click = (id) => {
        const target = element(id);
        if (!target.disabled) target.listeners.get("click")?.({});
    };
    return {
        element, requests, storage, config: window.OmniAiConfig,
        click,
        send(text) { element("input").value = text; element("input").listeners.get("input")(); click("send"); },
        dispatch(type, value = {}) {
            for (const entry of [...(listeners.get(type) || [])]) {
                entry.listener(value);
                if (entry.once) listeners.set(type, listeners.get(type).filter((item) => item !== entry));
            }
        },
        advanceTime(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of [...timers]) if (timer.time <= now) { timers.delete(id); timer.callback(); }
        },
        flushFrames() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
        messages() {
            return element("messages").children.filter((node) => node.classList.contains("omni-ai-message")).map((node) => ({
                role: node.classList.contains("is-assistant") ? "assistant" : "user",
                pending: node.classList.contains("is-streaming"),
                content: find(node, (item) => item.classList.contains("omni-ai-message-content"))?.textContent,
                error: find(node, (item) => item.classList.contains("omni-ai-message-error"))?.textContent,
            }));
        },
        savedChats() { return JSON.parse(storage.get(window.OmniAiConfig.storageKey) || "[]"); },
    };
}

function assertReady(app) {
    assert.equal(app.element("mode").disabled, false);
    assert.equal(app.element("length").disabled, false);
    assert.equal(app.element("send-label").textContent, "Gönder");
    assert.equal(app.messages().some((message) => message.pending), false);
}

test("tekrarlanan BFCache dönüşleri isteği hemen durdurur ve sonraki yanıtı engellemez", async () => {
    const app = createApp();
    for (let visit = 0; visit < 2; visit += 1) {
        app.send(`İlk istek ${visit}`);
        const interrupted = app.requests.at(-1);
        assert.equal(app.element("mode").disabled, true);
        app.dispatch("pagehide", { persisted: true });
        assertReady(app);
        app.dispatch("pageshow", { persisted: true });
        await settle();
        assert.equal(interrupted.signal.aborted, true);
        assertReady(app);
        app.send(`Yeni istek ${visit}`);
        app.requests.at(-1).respond(streamResponse(delta(`Yanıt ${visit}`) + completed));
        await settle();
        assert.equal(app.messages().at(-1).content, `Yanıt ${visit}`);
        assertReady(app);
    }
    assert.equal(app.requests.length, 4);
});

test("durdurulan eski istek yeni yanıtı veya yeni isteğin kontrollerini değiştiremez", async () => {
    const app = createApp({ ignoreAbort: true });
    app.send("Eski istek");
    app.click("send");
    assertReady(app);
    app.send("Yeni istek");
    app.requests[0].respond(streamResponse(delta("Eski yanıt") + completed));
    await settle();
    assert.equal(app.element("mode").disabled, true);
    assert.equal(app.messages().some((message) => message.content === "Eski yanıt"), false);
    app.requests[1].respond(streamResponse(delta("Yeni yanıt") + completed));
    await settle();
    assert.equal(app.messages().at(-1).content, "Yeni yanıt");
    assert.equal(app.savedChats()[0].messages.at(-1).content, "Yeni yanıt");
    assertReady(app);
});

test("zaman aşımı boş yanıtı sessizce silmez ve iptali yok sayan istekten sonra yeniden gönderir", async () => {
    const app = createApp({ ignoreAbort: true });
    app.send("Yanıt bekliyorum");
    app.advanceTime(app.config.requestTimeoutMs);
    assert.equal(app.requests[0].signal.aborted, true);
    assert.match(app.messages().at(-1).error, /zaman aşımına/u);
    assertReady(app);
    app.send("Tekrar dene");
    app.requests[1].respond(streamResponse(delta("Başarılı yanıt") + completed));
    await settle();
    app.requests[0].respond(streamResponse(delta("Gecikmiş yanıt") + completed));
    await settle();
    assert.equal(app.messages().at(-1).content, "Başarılı yanıt");
    assertReady(app);
});

test("kesilmiş yanıtın metni ve hata durumu yerel geçmişte korunur", async () => {
    const app = createApp();
    app.send("Bir açıklama yaz");
    app.requests[0].respond(streamResponse(delta("Kısmi açıklama")));
    await settle();
    assert.equal(app.messages().at(-1).content, "Kısmi açıklama");
    assert.match(app.messages().at(-1).error, /tamamlanmadan kesildi/u);
    assert.equal(app.savedChats()[0].messages.at(-1).errorCode, "AI_INCOMPLETE");
    const restored = createApp({ initialStorage: app.storage });
    assert.equal(restored.messages().at(-1).content, "Kısmi açıklama");
    assert.match(restored.messages().at(-1).error, /tamamlanmadan kesildi/u);
    assertReady(restored);
});

test("kısmi yanıtı kullanıcı durdurduğunda zaman aşımı demez ve modları korur", async () => {
    const app = createApp();
    app.element("mode").value = "coding";
    app.element("mode").listeners.get("change")();
    app.element("length").value = "detailed";
    app.element("length").listeners.get("change")();
    app.send("Kod yaz");
    assert.equal(app.requests[0].body.mode, "coding");
    assert.equal(app.requests[0].body.responseLength, "detailed");
    app.requests[0].respond(new Response(new ReadableStream({ start(controller) { controller.enqueue(encode(delta("Kısmi kod"))); } })));
    await settle();
    app.flushFrames();
    app.click("send");
    await settle();
    assert.equal(app.messages().at(-1).content, "Kısmi kod");
    assert.equal(app.messages().at(-1).error, "Yanıt durduruldu.");
    assert.equal(app.element("mode").value, "coding");
    assert.equal(app.element("length").value, "detailed");
    assertReady(app);
});

test("günlük kota hatasını gösterir ve eski sohbetleri silmeden sonraki isteği tamamlar", async () => {
    const app = createApp();
    app.send("Merhaba");
    app.requests[0].respond(Response.json({ code: "AI_QUOTA_EXCEEDED" }, { status: 429 }));
    await settle();
    assert.match(app.messages().at(-1).error, /günlük ücretsiz.*03\.00/u);
    assertReady(app);
    app.send("Tekrar merhaba");
    app.requests[1].respond(streamResponse(delta("Merhaba!") + completed));
    await settle();
    assert.equal(app.messages().at(-1).content, "Merhaba!");
    assert.equal(app.savedChats()[0].messages.filter((message) => message.role === "user").length, 2);
    assertReady(app);
});
