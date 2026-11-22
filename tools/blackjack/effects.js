(function exposeBlackjackEffects(root, factory) {
    "use strict";
    const effects = factory();
    if (typeof module === "object" && module.exports) module.exports = effects;
    else root.OmniBlackjackEffects = effects;
})(typeof globalThis !== "undefined" ? globalThis : window, function blackjackEffectsFactory() {
    "use strict";

    let nextId = 0;

    function create(options = {}) {
        const host = options.host || (typeof window !== "undefined" ? window : null);
        const document = options.document || host?.document;
        const active = typeof options.isActive === "function" ? options.isActive : () => true;
        let speed = normalizeSpeed(options.speed);
        let destroyed = false;
        const tasks = new Set();
        const nodeFlights = new Map();

        function normalizeSpeed(value) { return Number.isFinite(value) ? Math.max(0.25, Math.min(4, value)) : 1; }
        function reduced() {
            const value = options.reduceMotion;
            return typeof value === "function" ? Boolean(value()) : Boolean(value?.matches ?? value);
        }
        function usable(rect) { return rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0; }

        function safeClone(node) {
            const clone = node.cloneNode(true);
            const descendants = [clone, ...clone.querySelectorAll("*")];
            const ids = new Map();
            const prefix = `blackjack-flight-${++nextId}`;
            descendants.forEach((element, index) => {
                const id = element.getAttribute("id");
                if (id) ids.set(id, `${prefix}-${index}`);
            });
            for (const element of descendants) {
                for (const attribute of Array.from(element.attributes || [])) {
                    const { name } = attribute;
                    if (["data-card-id", "data-card-key", "data-rank", "data-suit", "aria-label", "aria-labelledby", "aria-describedby"].includes(name)) {
                        element.removeAttribute(name);
                        continue;
                    }
                    let value = attribute.value;
                    if (name === "id") value = ids.get(value);
                    else {
                        for (const [oldId, newId] of ids) {
                            if (value === `#${oldId}`) value = `#${newId}`;
                            value = value.split(`url(#${oldId})`).join(`url(#${newId})`)
                                .split(`url("#${oldId}")`).join(`url("#${newId}")`)
                                .split(`url('#${oldId}')`).join(`url('#${newId}')`);
                        }
                    }
                    element.setAttribute(name, value);
                }
            }
            clone.setAttribute("aria-hidden", "true");
            clone.removeAttribute("tabindex");
            if (clone.classList.contains("is-hidden") && !clone.classList.contains("is-revealed")) {
                clone.querySelector(".blackjack-card-front, .blackjack-card-face")?.replaceChildren();
            }
            Object.assign(clone.style, {
                width: "100%", height: "100%", margin: "0", visibility: "visible",
                animation: "none", transition: "none", transform: "none", transformOrigin: "center",
            });
            return clone;
        }

        function track(animations, cleanup, node) {
            let finish;
            let ended = false;
            const promise = new Promise((resolve) => { finish = resolve; });
            const task = {
                stop(cancelled) {
                    if (ended) return;
                    ended = true;
                    tasks.delete(task);
                    if (node && nodeFlights.get(node) === task) nodeFlights.delete(node);
                    animations.forEach((animation) => { try { animation.cancel(); } catch { /* A detached animation is already finished. */ } });
                    cleanup();
                    finish({ cancelled });
                },
            };
            tasks.add(task);
            if (node) nodeFlights.set(node, task);
            Promise.all(animations.map((animation) => animation.finished)).then(() => task.stop(false), () => task.stop(true));
            return promise;
        }

        function fly(node, from, to, settings = {}) {
            if (destroyed || document?.hidden || !active()) return Promise.resolve({ cancelled: true });
            nodeFlights.get(node)?.stop(true);
            if (reduced() || !document?.body || !node?.cloneNode || !usable(from) || !usable(to)) return Promise.resolve({ cancelled: false });
            const kind = settings.kind === "chip" ? "chip" : "card";
            const duration = (Number.isFinite(settings.duration) ? Math.max(1, settings.duration) : kind === "chip" ? 360 : 420) / speed;
            const delay = Math.max(0, Number(settings.delay) || 0) / speed;
            const clone = safeClone(node);
            const portal = document.createElement("div");
            portal.className = `blackjack-${kind}-flight`;
            portal.setAttribute("aria-hidden", "true");
            portal.setAttribute("inert", "");
            Object.assign(portal.style, {
                position: "fixed", left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
                pointerEvents: "none", zIndex: "10000", margin: "0", perspective: "900px", transformOrigin: "center",
                animation: "none", transition: "none", willChange: "transform, opacity",
            });
            portal.append(clone);
            document.body.append(portal);
            if (typeof portal.animate !== "function") { portal.remove(); return Promise.resolve({ cancelled: false }); }
            const visibility = node.style.visibility;
            if (settings.hide !== false) node.style.visibility = "hidden";
            const dx = from.left - to.left;
            const dy = from.top - to.top;
            const startScale = `${from.width / to.width},${from.height / to.height}`;
            const lift = kind === "chip" ? 18 : 26;
            const frames = [
                { transform: `translate3d(${dx}px,${dy}px,0) scale(${startScale}) rotate(${kind === "chip" ? -22 : -9}deg)`, opacity: 1, filter: "drop-shadow(0 2px 2px #0003)" },
                { offset: 0.58, transform: `translate3d(${dx * 0.3}px,${dy * 0.3 - lift}px,0) scale(1.04,1.04) rotate(3deg)`, opacity: 1, filter: "drop-shadow(0 13px 9px #0004)" },
                { offset: 0.9, transform: "translate3d(0,2px,0) scale(1.015,.97) rotate(-1deg)", opacity: settings.fade ? 0.2 : 1, filter: "drop-shadow(0 3px 2px #0003)" },
                { transform: "translate3d(0,0,0) scale(1,1) rotate(0deg)", opacity: settings.fade ? 0 : 1, filter: "drop-shadow(0 2px 2px #0003)" },
            ];
            const animations = [];
            try {
                animations.push(portal.animate(frames, { duration, delay, easing: "cubic-bezier(.2,.72,.26,1)", fill: "both" }));
                const hidden = clone.classList.contains("is-hidden") && !clone.classList.contains("is-revealed");
                const inner = clone.querySelector(".blackjack-card-inner");
                if (kind === "card" && settings.flip && !hidden && inner?.animate) {
                    animations.push(inner.animate([
                        { transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" },
                    ], { duration: duration * 0.72, delay: delay + duration * 0.12, easing: "ease-in-out", fill: "both" }));
                }
            } catch {
                animations.forEach((animation) => animation.cancel());
                portal.remove();
                node.style.visibility = visibility;
                return Promise.resolve({ cancelled: true });
            }
            return track(animations, () => {
                portal.remove();
                if (settings.hide !== false && node.style.visibility === "hidden") node.style.visibility = visibility;
            }, node);
        }

        function layoutFLIP(beforeMap, afterMap, settings = {}) {
            if (destroyed || document?.hidden || !active()) return Promise.resolve({ cancelled: true });
            if (reduced()) return Promise.resolve({ cancelled: false });
            const moving = [];
            let failed = false;
            for (const [key, after] of afterMap || []) {
                const before = beforeMap?.get(key);
                const node = after.node || key;
                const from = before?.rect || before;
                const to = after.rect || after;
                if (!usable(from) || !usable(to) || !node?.animate) continue;
                const dx = from.left - to.left;
                const dy = from.top - to.top;
                if (Math.abs(dx) + Math.abs(dy) < 0.5 && Math.abs(from.width - to.width) < 0.5 && Math.abs(from.height - to.height) < 0.5) continue;
                try {
                    const animation = node.animate([
                        { transform: `translate(${dx}px,${dy}px) scale(${from.width / to.width},${from.height / to.height})` },
                        { transform: "translate(0,0) scale(1,1)" },
                    ], { duration: Math.max(1, settings.duration || 260) / speed, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
                    moving.push(track([animation], () => {}));
                } catch { failed = true; }
            }
            return Promise.all(moving).then((results) => ({ cancelled: failed || results.some((result) => result.cancelled) }));
        }

        function cancel() { [...tasks].forEach((task) => task.stop(true)); }
        function visibilityChanged() { if (document.hidden || !active()) cancel(); }
        document?.addEventListener?.("visibilitychange", visibilityChanged);
        host?.addEventListener?.("pagehide", cancel);
        return Object.freeze({
            fly,
            flyCard: (node, from, to, settings = {}) => fly(node, from, to, { ...settings, kind: "card" }),
            flyChip: (node, from, to, settings = {}) => fly(node, from, to, { ...settings, kind: "chip" }),
            layoutFLIP, cancel,
            setSpeed(value) { speed = normalizeSpeed(value); },
            destroy() { cancel(); destroyed = true; document?.removeEventListener?.("visibilitychange", visibilityChanged); host?.removeEventListener?.("pagehide", cancel); },
        });
    }

    return Object.freeze({ create });
});
