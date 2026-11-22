(function exposeGameWallet(root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.OmniGameWallet = api.createWallet({ host: root });
})(typeof globalThis === "undefined" ? window : globalThis, function gameWalletFactory() {
    "use strict";

    const STORAGE_KEY = "omni-games-wallet-v1";
    const GAME_IDS = Object.freeze(["blackjack", "roulette", "slot-game"]);
    const STARTING_BALANCE = 10000;
    const clone = (value) => value == null ? null : JSON.parse(JSON.stringify(value));
    const integer = (value) => Number.isSafeInteger(value) && value >= 0;
    function cents(value) {
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        const result = Math.round(value * 100);
        return Number.isSafeInteger(result) && Math.abs(result / 100 - value) < 0.000001 ? result : null;
    }

    function validRecord(value) {
        return value?.version === 1 && integer(value.balanceCents) && integer(value.revision)
            && GAME_IDS.every((id) => integer(value.games?.[id]?.revision)
                && (value.games[id].snapshot === null || (typeof value.games[id].snapshot === "object" && !Array.isArray(value.games[id].snapshot))));
    }

    function migrate(storage) {
        let total = 0;
        let found = false;
        const games = {};
        for (const id of GAME_IDS) {
            let saved = null;
            try { saved = JSON.parse(storage?.getItem(`omni-${id}-v1`) || "null"); } catch { /* An invalid old save does not create money. */ }
            if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = null;
            const units = id === "blackjack" ? saved?.game?.balance ?? saved?.balance
                : id === "roulette" ? saved?.game?.balance : saved?.balance;
            const amount = cents(id === "blackjack" ? units / 2 : units);
            if (amount !== null && amount >= 0 && Number.isSafeInteger(total + amount)) {
                total += amount;
                found = true;
            }
            games[id] = { revision: 0, snapshot: saved };
        }
        return { version: 1, revision: 0, balanceCents: found ? total : STARTING_BALANCE * 100, games };
    }

    function createWallet(options = {}) {
        const host = options.host;
        let storage = options.storage;
        if (!storage) { try { storage = host?.localStorage; } catch { /* Session-only wallet. */ } }
        const locks = options.locks || host?.navigator?.locks;
        const listeners = new Set();
        let memory;
        let writable = true;
        let queue = Promise.resolve();

        function readRecord() {
            if (!writable && memory) return memory;
            let raw;
            try { raw = storage?.getItem(STORAGE_KEY); } catch { writable = false; }
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (validRecord(parsed)) { memory = parsed; return parsed; }
                } catch { /* Keep the last valid state if storage was damaged. */ }
                // Never import the legacy bankrolls a second time after migration.
                if (!memory) memory = { version: 1, revision: 0, balanceCents: 0, games: Object.fromEntries(GAME_IDS.map((id) => [id, { revision: 0, snapshot: null }])) };
            } else if (!memory) memory = migrate(storage);
            persist(memory);
            return memory;
        }

        function persist(record) {
            memory = record;
            try { storage?.setItem(STORAGE_KEY, JSON.stringify(record)); }
            catch { writable = false; }
        }

        function result(record, id, extra = {}) {
            const game = record.games[id] || { revision: 0, snapshot: null };
            return { ...extra, balance: record.balanceCents / 100, revision: game.revision, snapshot: clone(game.snapshot) };
        }

        function notify() {
            // Subscribers read the committed record, never a partly applied game transition.
            Promise.resolve().then(() => listeners.forEach((listener) => { try { listener(); } catch { /* A view cannot roll back a committed wallet. */ } }));
        }

        function exclusive(operation) {
            const execute = () => locks?.request ? locks.request(STORAGE_KEY, { mode: "exclusive" }, operation) : operation();
            const pending = queue.then(execute, execute);
            queue = pending.catch(() => {});
            return pending;
        }

        function read(id) {
            if (!GAME_IDS.includes(id)) throw new TypeError("Bilinmeyen oyun cüzdanı.");
            return result(readRecord(), id);
        }

        function commit(id, change = {}) {
            if (!GAME_IDS.includes(id)) return Promise.resolve({ ok: false, reason: "invalid-game" });
            let snapshot;
            try { snapshot = clone(change.snapshot); } catch { return Promise.resolve({ ...read(id), ok: false, reason: "invalid-snapshot" }); }
            const delta = cents(change.delta ?? 0);
            const required = cents(change.required ?? Math.max(0, -(change.delta || 0)));
            return exclusive(() => {
                const current = readRecord();
                const reject = (reason) => result(current, id, { ok: false, reason });
                if (!integer(change.revision) || delta === null || required === null || required < 0
                    || snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return reject("invalid-change");
                if (current.games[id].revision !== change.revision) return reject("conflict");
                const balance = current.balanceCents + delta;
                if (current.balanceCents < required || balance < 0) return reject("funds");
                if (!integer(balance) || !integer(current.revision + 1) || !integer(change.revision + 1)) return reject("limit");
                const next = { ...current, revision: current.revision + 1, balanceCents: balance, games: {
                    ...current.games, [id]: { revision: change.revision + 1, snapshot },
                } };
                persist(next);
                notify();
                return result(next, id, { ok: true });
            }).catch(() => ({ ...read(id), ok: false, reason: "unavailable" }));
        }

        function canRefillRecord(record) {
            const bj = record.games.blackjack.snapshot?.game;
            const roulette = record.games.roulette.snapshot?.game;
            const slot = record.games["slot-game"].snapshot;
            return record.balanceCents < 100
                && (!bj || ["BETTING", "ROUND_OVER"].includes(bj.phase))
                && !roulette?.pending && !(slot?.freeSpins > 0);
        }

        function refill() {
            return exclusive(() => {
                const current = readRecord();
                if (!canRefillRecord(current)) return { ok: false, balance: current.balanceCents / 100, reason: "not-empty" };
                const next = { ...current, revision: current.revision + 1, balanceCents: STARTING_BALANCE * 100 };
                persist(next);
                notify();
                return { ok: true, balance: STARTING_BALANCE };
            }).catch(() => ({ ok: false, reason: "unavailable" }));
        }

        const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) { readRecord(); notify(); } };
        host?.addEventListener?.("storage", onStorage);
        return Object.freeze({
            read, commit, refill,
            canRefill: () => canRefillRecord(readRecord()),
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
            destroy() { listeners.clear(); host?.removeEventListener?.("storage", onStorage); },
        });
    }

    return Object.freeze({ createWallet, STORAGE_KEY, GAME_IDS, STARTING_BALANCE });
});
