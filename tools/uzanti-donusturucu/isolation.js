(function initConverterIsolation(root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) {
        root.OmniConverter = root.OmniConverter || {};
        root.OmniConverter.Isolation = api;
    }
}(typeof window !== "undefined" ? window : null, function createIsolationAPI() {
    "use strict";

    const CATEGORY_PARAM = "converter-category";
    const ATTEMPT_PARAM = "converter-isolation";
    const requiresIsolation = category => category === "document" || category === "presentation";

    function create(host, { timeoutMs = 10000 } = {}) {
        let pending = null;
        let revision = 0;
        let attempted = false;
        let restored = null;
        try {
            const url = new URL(host.location.href);
            const category = url.searchParams.get(CATEGORY_PARAM);
            if (requiresIsolation(category)) {
                restored = category;
                attempted = url.searchParams.get(ATTEMPT_PARAM) === "1";
            }
        } catch { /* The remaining converter categories still work without URL access. */ }

        function isReady() {
            return host.crossOriginIsolated === true && typeof host.SharedArrayBuffer === "function";
        }

        function restoredCategory() {
            const category = restored;
            restored = null;
            if (category && isReady()) {
                try {
                    const url = new URL(host.location.href);
                    url.searchParams.delete(CATEGORY_PARAM);
                    url.searchParams.delete(ATTEMPT_PARAM);
                    host.history.replaceState(host.history.state, "", url.href);
                } catch { /* Restoration does not depend on cosmetic URL cleanup. */ }
            }
            return category;
        }

        function cancel() {
            revision += 1;
            pending?.abort();
            pending = null;
        }

        function waitForController(signal) {
            return new Promise((resolve, reject) => {
                const workers = host.navigator.serviceWorker;
                let ready = false;
                let settled = false;
                let timer = 0;
                function finish(error) {
                    if (settled) return;
                    settled = true;
                    host.clearTimeout(timer);
                    workers.removeEventListener("controllerchange", check);
                    signal.removeEventListener("abort", abort);
                    if (error) reject(error);
                    else resolve();
                }
                function check() { if (ready && workers.controller) finish(); }
                function abort() { finish({ code: "cancelled" }); }
                workers.addEventListener("controllerchange", check);
                signal.addEventListener("abort", abort, { once: true });
                timer = host.setTimeout(() => finish({ code: "timeout" }), timeoutMs);
                if (signal.aborted) { abort(); return; }
                try {
                    const registration = workers.controller ? Promise.resolve() : Promise.resolve().then(() => {
                        if (settled) return;
                        // Retry registration here as well: the global deferred script may
                        // still be loading, or a previous background registration failed.
                        const url = new URL("coi-serviceworker.min.js", host.document?.baseURI || host.location.href);
                        return workers.register(url.href);
                    });
                    registration.then(() => {
                        if (settled) return;
                        return workers.ready;
                    }).then(() => {
                        if (!settled) { ready = true; check(); }
                    }, () => finish({ code: "unavailable" }));
                } catch { finish({ code: "unavailable" }); }
            });
        }

        async function prepare(category, { isCurrent = () => true, onWaiting = () => {} } = {}) {
            cancel();
            if (!requiresIsolation(category) || isReady()) return { status: "ready" };
            if (!isCurrent()) return { status: "cancelled" };
            if (!host.isSecureContext || !host.navigator?.serviceWorker) return { status: "error", code: "unsupported" };
            if (attempted) return { status: "error", code: "not-isolated" };
            const operation = revision;
            const controller = new AbortController();
            pending = controller;
            onWaiting();
            try {
                await waitForController(controller.signal);
                if (operation !== revision || controller.signal.aborted || !isCurrent()) return { status: "cancelled" };
                if (isReady()) return { status: "ready" };
                const url = new URL(host.location.href);
                url.searchParams.set(CATEGORY_PARAM, category);
                url.searchParams.set(ATTEMPT_PARAM, "1");
                attempted = true;
                try { host.location.replace(url.href); } catch {
                    attempted = false;
                    return { status: "error", code: "unavailable" };
                }
                return { status: "reloading" };
            } catch (error) {
                if (operation !== revision || controller.signal.aborted || !isCurrent()) return { status: "cancelled" };
                return { status: "error", code: error?.code || "unavailable" };
            } finally {
                if (pending === controller) pending = null;
            }
        }

        return { isReady, restoredCategory, prepare, cancel };
    }

    return Object.freeze({ create, requiresIsolation });
}));
