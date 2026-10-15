"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const isolation = require("./isolation.js");

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function harness({ ready = false, controlled = false, isolated = false, secure = true, supported = true, href = "https://example.test/omni-tools/uzanti-donusturucu?keep=1#preview" } = {}) {
    const registration = deferred();
    const listeners = new Set();
    const timers = new Map();
    const navigations = [];
    const replacements = [];
    const registerCalls = [];
    let nextId = 0;
    let readyReads = 0;
    const workers = {
        controller: controlled ? {} : null,
        register(url) { registerCalls.push(url); return Promise.resolve({ active: {} }); },
        get ready() { readyReads += 1; return registration.promise; },
        addEventListener(name, callback) { assert.equal(name, "controllerchange"); listeners.add(callback); },
        removeEventListener(name, callback) { listeners.delete(callback); },
    };
    const host = {
        crossOriginIsolated: isolated,
        SharedArrayBuffer: isolated ? function SharedBuffer() {} : undefined,
        isSecureContext: secure,
        navigator: { serviceWorker: supported ? workers : undefined },
        document: { baseURI: "https://example.test/omni-tools/" },
        location: { href, replace: url => navigations.push(url) },
        history: { state: { existing: "state" }, replaceState: (state, title, url) => replacements.push({ state, url }) },
        setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id),
    };
    if (ready) registration.resolve({ active: {} });
    function control() {
        workers.controller = {};
        [...listeners].forEach(callback => callback());
    }
    function timeout() {
        const callbacks = [...timers.values()];
        timers.clear();
        callbacks.forEach(callback => callback());
    }
    return { host, workers, registration, timers, listeners, navigations, replacements, registerCalls, control, timeout, readyReads: () => readyReads, coordinator: isolation.create(host, { timeoutMs: 50 }) };
}

test("only document and presentation categories require isolation", async () => {
    for (const category of ["document", "presentation"]) assert.equal(isolation.requiresIsolation(category), true);
    for (const category of ["image", "audio", "video", "archive", "font", "ebook", "", undefined]) {
        const h = harness();
        assert.equal(isolation.requiresIsolation(category), false);
        assert.deepEqual(await h.coordinator.prepare(category), { status: "ready" });
        assert.equal(h.readyReads(), 0);
        assert.equal(h.navigations.length, 0);
    }
});

test("already isolated browsers use the document motor without waiting or reloading", async () => {
    const h = harness({ isolated: true, supported: false });
    assert.equal(h.coordinator.isReady(), true);
    assert.deepEqual(await h.coordinator.prepare("document"), { status: "ready" });
    assert.equal(h.navigations.length, 0);
    assert.equal(h.timers.size, 0);
});

test("preparation waits for both ready registration and controller before one scoped navigation", async () => {
    const h = harness();
    const task = h.coordinator.prepare("document");
    h.registration.resolve({ active: {} });
    await Promise.resolve();
    assert.equal(h.navigations.length, 0);
    h.control();
    assert.deepEqual(await task, { status: "reloading" });
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
    assert.deepEqual(h.registerCalls, ["https://example.test/omni-tools/coi-serviceworker.min.js"]);
    const url = new URL(h.navigations[0]);
    assert.equal(url.pathname, "/omni-tools/uzanti-donusturucu");
    assert.equal(url.searchParams.get("keep"), "1");
    assert.equal(url.hash, "#preview");
    assert.equal(url.searchParams.get("converter-category"), "document");
    assert.equal(url.searchParams.get("converter-isolation"), "1");
    assert.deepEqual(await h.coordinator.prepare("presentation"), { status: "error", code: "not-isolated" });
    assert.equal(h.navigations.length, 1);
});

test("a controller arriving before readiness is also handled without an extra navigation", async () => {
    const h = harness();
    const task = h.coordinator.prepare("presentation");
    h.control();
    assert.equal(h.navigations.length, 0);
    h.registration.resolve({ active: {} });
    assert.deepEqual(await task, { status: "reloading" });
    assert.equal(new URL(h.navigations[0]).searchParams.get("converter-category"), "presentation");
});

test("leaving or cancelling preparation removes waits and prevents delayed reload", async () => {
    const h = harness();
    const task = h.coordinator.prepare("document");
    h.coordinator.cancel();
    h.registration.resolve({ active: {} });
    h.control();
    assert.deepEqual(await task, { status: "cancelled" });
    assert.equal(h.navigations.length, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
});

test("rapid category selection navigates only to the last requested category", async () => {
    const h = harness();
    const first = h.coordinator.prepare("document");
    const second = h.coordinator.prepare("presentation");
    h.registration.resolve({ active: {} });
    h.control();
    assert.deepEqual(await first, { status: "cancelled" });
    assert.deepEqual(await second, { status: "reloading" });
    assert.equal(h.navigations.length, 1);
    assert.equal(new URL(h.navigations[0]).searchParams.get("converter-category"), "presentation");
});

test("new queued work or a changed app during the wait prevents any reload", async () => {
    const h = harness();
    let currentAndEmpty = true;
    const task = h.coordinator.prepare("document", { isCurrent: () => currentAndEmpty });
    currentAndEmpty = false;
    h.registration.resolve({ active: {} });
    h.control();
    assert.deepEqual(await task, { status: "cancelled" });
    assert.equal(h.navigations.length, 0);
});

test("timeout and failed service worker readiness are retryable and clean up listeners", async () => {
    const h = harness();
    const first = h.coordinator.prepare("document");
    h.timeout();
    assert.deepEqual(await first, { status: "error", code: "timeout" });
    assert.equal(h.listeners.size, 0);
    const retry = h.coordinator.prepare("document");
    h.registration.resolve({ active: {} });
    h.control();
    assert.deepEqual(await retry, { status: "reloading" });
    const failure = harness();
    const failed = failure.coordinator.prepare("document");
    failure.registration.reject(new Error("registration unavailable"));
    assert.deepEqual(await failed, { status: "error", code: "unavailable" });
    assert.equal(failure.timers.size + failure.listeners.size, 0);
});

test("insecure and unsupported browsers remain usable without waiting or a reload loop", async () => {
    for (const options of [{ secure: false }, { supported: false }]) {
        const h = harness(options);
        assert.deepEqual(await h.coordinator.prepare("document"), { status: "error", code: "unsupported" });
        assert.equal(h.readyReads(), 0);
        assert.equal(h.timers.size, 0);
        assert.equal(h.navigations.length, 0);
    }
});

test("existing controllers avoid another registration while a failed registration can be retried", async () => {
    const controlled = harness({ ready: true, controlled: true });
    assert.deepEqual(await controlled.coordinator.prepare("document"), { status: "reloading" });
    assert.equal(controlled.registerCalls.length, 0);
    const h = harness({ ready: true });
    h.workers.register = () => Promise.reject(new Error("network unavailable"));
    assert.deepEqual(await h.coordinator.prepare("document"), { status: "error", code: "unavailable" });
    assert.equal(h.listeners.size + h.timers.size, 0);
    h.workers.register = () => { h.control(); return Promise.resolve({ active: {} }); };
    assert.deepEqual(await h.coordinator.prepare("document"), { status: "reloading" });
    assert.equal(h.navigations.length, 1);
});

test("cancellation and timeout during registration never cause a later reload", async () => {
    for (const mode of ["cancel", "timeout"]) {
        const h = harness({ ready: true });
        const registrationRequest = deferred();
        h.workers.register = () => registrationRequest.promise;
        const task = h.coordinator.prepare("document");
        await Promise.resolve();
        if (mode === "cancel") h.coordinator.cancel();
        else h.timeout();
        const result = await task;
        assert.deepEqual(result, mode === "cancel" ? { status: "cancelled" } : { status: "error", code: "timeout" });
        registrationRequest.resolve({ active: {} });
        h.control();
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(h.navigations.length, 0);
        assert.equal(h.readyReads(), 0);
        assert.equal(h.listeners.size + h.timers.size, 0);
    }
});

test("post-reload restoration keeps the requested category and blocks repeated automatic attempts", async () => {
    const href = "https://example.test/omni-tools/uzanti-donusturucu?keep=1&converter-category=document&converter-isolation=1#preview";
    const blocked = harness({ href, ready: true, controlled: true });
    assert.equal(blocked.coordinator.restoredCategory(), "document");
    assert.equal(blocked.coordinator.restoredCategory(), null);
    assert.deepEqual(await blocked.coordinator.prepare("document"), { status: "error", code: "not-isolated" });
    assert.equal(blocked.navigations.length, 0);
    assert.equal(blocked.readyReads(), 0);
    const successful = harness({ href, isolated: true });
    assert.equal(successful.coordinator.restoredCategory(), "document");
    assert.equal(successful.replacements.length, 1);
    assert.deepEqual(successful.replacements[0].state, { existing: "state" });
    assert.equal(successful.replacements[0].url, "https://example.test/omni-tools/uzanti-donusturucu?keep=1#preview");
});
