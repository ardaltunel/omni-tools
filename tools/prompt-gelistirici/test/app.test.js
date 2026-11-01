import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

function createApp({ ignoreAbort = false } = {}) {
    class Element {
        constructor(tag = "div") {
            this.tag = tag;
            this.value = "";
            this.hidden = false;
            this.disabled = false;
            this.children = [];
            this.attributes = {};
            this.listeners = new Map();
        }

        append(...items) {
            this.children.push(...items.flatMap((item) => item.tag === "fragment" ? item.children : [item]));
        }

        replaceChildren(...items) {
            this.children = [];
            this.append(...items);
            if (this.tag === "select") this.value = this.children.find((item) => item.selected)?.value || "";
        }

        addEventListener(type, listener) { this.listeners.set(type, listener); }
        setAttribute(name, value) { this.attributes[name] = value; }
        querySelectorAll(selector) {
            return selector === "[data-prompt-developer-action]" ? ["sample", "repeat", "shorter", "detailed"].map(element) : [];
        }
        focus() {}
    }

    const elements = new Map();
    const selectIds = new Set(["type", "detail", "format"]);
    const element = (id) => {
        const fullId = `prompt-developer-${id}`;
        if (!elements.has(fullId)) elements.set(fullId, new Element(selectIds.has(id) ? "select" : "div"));
        return elements.get(fullId);
    };
    const document = {
        getElementById(id) {
            if (id === "prompt-developer") return element("panel");
            return element(id.replace(/^prompt-developer-/u, ""));
        },
        createDocumentFragment: () => new Element("fragment"),
        createElement: (tag) => new Element(tag),
        createTextNode: (value) => ({ tag: "text", value }),
    };
    const timers = new Map();
    const listeners = new Map();
    let timerSerial = 0;
    let now = 0;
    const window = {
        setTimeout(callback, delay) {
            const id = ++timerSerial;
            timers.set(id, { callback, time: now + delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        addEventListener(type, listener, options = {}) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push({ listener, once: options.once });
        },
    };
    const requests = [];
    const fetch = (url, options) => new Promise((resolve, reject) => {
        requests.push({
            url,
            signal: options.signal,
            body: JSON.parse(options.body),
            succeed(improvedPrompt) {
                resolve({ ok: true, status: 200, json: async () => ({ improvedPrompt, improvements: ["Prompt daha açık hale getirildi."] }) });
            },
            fail(status, code) {
                resolve({ ok: false, status, json: async () => ({ code }) });
            },
        });
        if (!ignoreAbort) options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const context = vm.createContext({ window, document, fetch, AbortController, navigator: {} });
    for (const file of ["config.js", "core.js", "app.js"]) {
        vm.runInContext(fs.readFileSync(path.resolve(directory, "..", file), "utf8"), context);
    }

    return {
        element,
        requests,
        config: window.PromptDeveloperConfig,
        click(id) {
            const target = element(id);
            if (!target.disabled) target.listeners.get("click")?.({});
        },
        dispatch(type, event = {}) {
            for (const entry of [...(listeners.get(type) || [])]) {
                entry.listener(event);
                if (entry.once) listeners.set(type, listeners.get(type).filter((item) => item !== entry));
            }
        },
        advanceTime(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of [...timers]) {
                if (timer.time <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
    };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function assertReady(app) {
    for (const id of ["generate", "type", "detail", "format", "sample", "repeat", "shorter", "detailed"]) assert.equal(app.element(id).disabled, false, id);
    assert.equal(app.element("generate").attributes["aria-busy"], "false");
    assert.equal(app.element("loading").hidden, true);
}

test("sayfa önbelleğinden her dönüşte yarım kalan isteği temizler ve yeniden geliştirir", async () => {
    const app = createApp();
    for (let visit = 0; visit < 2; visit += 1) {
        app.element("input").value = "bugun toplantı var";
        app.click("generate");
        const interrupted = app.requests.at(-1);
        assert.equal(app.element("generate").disabled, true);

        app.dispatch("pagehide", { persisted: true });
        assertReady(app);
        app.dispatch("pageshow", { persisted: true });
        await settle();
        assert.equal(interrupted.signal.aborted, true);
        assertReady(app);

        app.click("generate");
        app.requests.at(-1).succeed(`Bugün toplantı var. ${visit + 1}`);
        await settle();
        assert.equal(app.element("result").value, `Bugün toplantı var. ${visit + 1}`);
        assertReady(app);
    }
    assert.equal(app.requests.length, 4);
});

test("eski sayfadan gecikmiş yanıt yeni promptun sonucunu değiştiremez", async () => {
    const app = createApp({ ignoreAbort: true });
    app.element("input").value = "eski metin";
    app.click("generate");
    const oldRequest = app.requests[0];
    app.dispatch("pagehide", { persisted: true });
    app.dispatch("pageshow", { persisted: true });

    app.element("input").value = "yeni metin";
    app.click("generate");
    app.requests[1].succeed("Yeni metin.");
    await settle();
    oldRequest.succeed("Eski metin.");
    await settle();

    assert.equal(app.element("result").value, "Yeni metin.");
    assertReady(app);
});

test("temizle etkin isteği iptal eder ve yeni istek göndermeye izin verir", async () => {
    const app = createApp();
    app.element("input").value = "bugun toplantı var";
    app.click("generate");
    app.click("clear");
    await settle();

    assert.equal(app.requests[0].signal.aborted, true);
    assert.equal(app.element("input").value, "");
    assert.equal(app.element("result").value, "");
    assertReady(app);

    app.element("input").value = "yeni metin";
    app.click("generate");
    app.requests[1].succeed("Yeni metin.");
    await settle();
    assert.equal(app.element("result").value, "Yeni metin.");
    assertReady(app);
});

test("zaman aşımından sonra kontroller açılır ve sonraki istek başarılı olur", async () => {
    const app = createApp();
    app.element("input").value = "bugun toplantı var";
    app.click("generate");
    app.advanceTime(app.config.requestTimeoutMs);
    await settle();

    assert.equal(app.requests[0].signal.aborted, true);
    assert.match(app.element("status").textContent, /zaman aşımına/u);
    assertReady(app);

    app.click("generate");
    app.requests[1].succeed("Bugün toplantı var.");
    await settle();
    assert.equal(app.element("result").value, "Bugün toplantı var.");
    assertReady(app);
});

test("günlük ücretsiz kullanım sınırı mesajı görünür kalır ve yeni istek başarıyla tamamlanabilir", async () => {
    const app = createApp();
    app.element("input").value = "bugun toplantı var";
    app.click("generate");
    app.requests[0].fail(429, "AI_QUOTA_EXCEEDED");
    await settle();

    const message = "Günlük ücretsiz yapay zekâ kotası doldu. Kota Türkiye saatiyle 03.00'te yenilenir.";
    assert.equal(app.element("status").textContent, message);
    assert.equal(app.element("status").hidden, false);
    assertReady(app);
    app.advanceTime(10000);
    assert.equal(app.element("status").textContent, message);
    assert.equal(app.element("status").hidden, false);

    app.click("generate");
    assert.equal(app.element("status").hidden, true);
    app.requests[1].succeed("Bugün toplantı var.");
    await settle();
    assert.equal(app.element("result").value, "Bugün toplantı var.");
    assert.equal(app.element("status").hidden, false);
    assertReady(app);
    app.advanceTime(3000);
    assert.equal(app.element("status").hidden, true);
});

test("prompt seçeneklerini ve sonuç üzerinden kısaltma, detaylandırma ve tekrar geliştirmeyi korur", async () => {
    const app = createApp();
    app.element("input").value = "Görev takip uygulaması oluştur";
    app.element("type").value = "coding";
    app.element("detail").value = "detailed";
    app.element("format").value = "codex-task";
    app.click("generate");
    assert.deepEqual(app.requests[0].body, {
        prompt: "Görev takip uygulaması oluştur", promptType: "coding", detailLevel: "detailed", outputFormat: "codex-task", refinement: "none",
    });
    app.requests[0].succeed("Geliştirilmiş görev tanımı");
    await settle();

    for (const [action, refinement, original, improved] of [
        ["shorter", "shorter", "Geliştirilmiş görev tanımı", "Kısa görev tanımı"],
        ["detailed", "more-detailed", "Kısa görev tanımı", "Detaylı görev tanımı"],
        ["repeat", "none", "Detaylı görev tanımı", "Son görev tanımı"],
    ]) {
        app.click(action);
        const current = app.requests.at(-1);
        assert.deepEqual(current.body, {
            prompt: original, promptType: "coding", detailLevel: "detailed", outputFormat: "codex-task", refinement,
        });
        for (const id of ["generate", "type", "detail", "format", "sample", "repeat", "shorter", "detailed"]) {
            assert.equal(app.element(id).disabled, true, id);
        }
        current.succeed(improved);
        await settle();
        assert.equal(app.element("result").value, improved);
        assertReady(app);
    }
});
