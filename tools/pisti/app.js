(function exposePistiApp(root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else {
        root.OmniPistiApp = api;
        api.register(root, root.document);
    }
})(typeof globalThis === "undefined" ? window : globalThis, function pistiAppFactory() {
    "use strict";

    const STORAGE_KEY = "omni-pisti-v1";
    const AI_DIFFICULTY = "medium";

    function createController(options) {
        const { core } = options;
        const clock = options.clock || { setTimeout, clearTimeout };
        let saved = {};
        try { saved = JSON.parse(options.storage?.getItem(STORAGE_KEY) || "{}"); }
        catch { /* Storage can be unavailable in private browsing. */ }
        if (!saved || typeof saved !== "object") saved = {};
        let state = core.restoreState(saved.game);
        const restored = Boolean(state);
        const normalizeDifficulty = restored && state.difficulty !== AI_DIFFICULTY;
        if (normalizeDifficulty) state = { ...state, difficulty: AI_DIFFICULTY };
        if (!state) state = core.createGame({ mode: "duel", difficulty: AI_DIFFICULTY, target: 151 });
        let preferences = {
            muted: saved.muted === true,
            volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.25,
        };
        let active = options.active !== false;
        let busy = false;
        let started = false;
        let disposed = false;
        let generation = 0;
        let timer = null;
        let terminalKey = null;
        const isLive = () => active && !disposed && (options.isVisible ? options.isVisible() : true);
        const safeView = () => core.getPlayerView(state, 0);

        function save() {
            try {
                options.storage?.setItem(STORAGE_KEY, JSON.stringify({
                    version: 1, game: core.serializeState(state), ...preferences,
                }));
            } catch { /* The current match remains playable without storage. */ }
        }

        function render() {
            options.render?.(safeView(), { busy, active: isLive(), preferences: { ...preferences } });
        }

        function clearTimer() {
            if (timer !== null) clock.clearTimeout(timer);
            timer = null;
        }

        function stopWork() {
            generation += 1;
            clearTimer();
            options.cancelAnimations?.();
            busy = false;
        }

        function notifyTerminal() {
            if (!isLive() || busy || state.phase === "playing") return;
            const key = `${state.roundNumber}:${state.phase}`;
            if (terminalKey === key) return;
            terminalKey = key;
            options.onRoundEnd?.(safeView());
        }

        function scheduleAI() {
            if (!started || !isLive() || busy || timer !== null || state.phase !== "playing" || state.currentSeat === 0) return;
            const expected = state;
            const token = generation;
            const handle = clock.setTimeout(() => {
                if (timer !== handle) return;
                timer = null;
                if (!isLive() || busy || generation !== token || state !== expected || state.phase !== "playing" || state.currentSeat === 0) return;
                const cardId = core.chooseMove(state, state.currentSeat, AI_DIFFICULTY);
                if (cardId) commit(core.playCard(state, state.currentSeat, cardId));
            }, options.aiDelay ?? 540);
            timer = handle;
        }

        function present(before, prepared, initial = false) {
            const token = ++generation;
            clearTimer();
            busy = isLive();
            render();
            if (!busy) return;
            let work;
            try {
                work = options.animate?.(before, safeView(), {
                    initial, prepared, isCurrent: () => generation === token && isLive(),
                });
            } catch { /* A visual failure cannot invalidate an already saved move. */ }
            Promise.resolve(work).catch(() => {}).then(() => {
                if (disposed || generation !== token) return;
                busy = false;
                render();
                notifyTerminal();
                scheduleAI();
            });
        }

        function commit(next) {
            if (!next) return false;
            const before = safeView();
            const prepared = options.prepare?.(before);
            state = next;
            // Persist the complete engine transition before any asynchronous visual work.
            save();
            present(before, prepared);
            return true;
        }

        return Object.freeze({
            start() {
                if (started || disposed) return;
                started = true;
                if (!restored) {
                    save();
                    present(null, null, true);
                } else {
                    if (normalizeDifficulty) save();
                    render();
                    notifyTerminal();
                    scheduleAI();
                }
            },
            play(cardId) {
                if (!started || !isLive() || busy || state.phase !== "playing" || state.currentSeat !== 0) return false;
                return commit(core.playCard(state, 0, cardId));
            },
            newGame(settings) {
                if (disposed) return false;
                const next = core.createGame({ ...settings, difficulty: AI_DIFFICULTY });
                stopWork();
                terminalKey = null;
                state = next;
                save();
                present(null, null, true);
                return true;
            },
            nextRound() {
                if (!isLive() || busy || state.phase !== "round-over") return false;
                const next = core.nextRound(state);
                if (!next) return false;
                stopWork();
                terminalKey = null;
                state = next;
                save();
                present(null, null, true);
                return true;
            },
            setActive(value) {
                if (disposed) return;
                const next = Boolean(value);
                if (active === next && isLive()) {
                    notifyTerminal();
                    scheduleAI();
                    return;
                }
                active = next;
                if (!isLive()) stopWork();
                render();
                if (isLive()) { notifyTerminal(); scheduleAI(); }
            },
            setPreferences(next) {
                if (disposed) return;
                preferences = {
                    muted: typeof next.muted === "boolean" ? next.muted : preferences.muted,
                    volume: Number.isFinite(next.volume) ? Math.max(0, Math.min(1, next.volume)) : preferences.volume,
                };
                save();
                options.onPreferences?.({ ...preferences });
                if (!busy) render();
            },
            getState: () => state,
            getView: safeView,
            getPreferences: () => ({ ...preferences }),
            isBusy: () => busy,
            destroy() { stopWork(); disposed = true; },
        });
    }

    function mount(view, document, panel) {
        const core = view.OmniPistiCore;
        const cards = view.OmniPistiCards;
        const app = document.getElementById("pisti-app");
        if (!app || app.dataset.ready === "true") return;
        app.dataset.ready = "true";
        const personIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20"/></svg>';
        const teamIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6V20"/></svg>';
        app.innerHTML = `
            <div class="pisti-shell">
                <header class="pisti-topbar">
                    <div class="pisti-heading"><span class="pisti-eyebrow">KLASİK KART OYUNU</span><h2 id="pisti-title">Pişti</h2></div>
                    <div class="pisti-toolbar">
                        <div class="pisti-volume-control">
                            <button id="pisti-sound" type="button" class="pisti-icon-button" aria-pressed="true" aria-label="Oyun seslerini kapat" title="Ses"><span aria-hidden="true">🔊</span></button>
                            <div class="pisti-volume-popover">
                                <label for="pisti-volume">Ses seviyesi <output id="pisti-volume-value" for="pisti-volume">%25</output></label>
                                <input id="pisti-volume" type="range" min="0" max="100" step="1" value="25" aria-label="Oyun sesi seviyesi">
                            </div>
                        </div>
                    </div>
                </header>
                <div class="pisti-settings">
                    <fieldset class="pisti-setting-group"><legend>Oyun türü</legend><div class="pisti-setting-options">
                        <label class="pisti-option" for="pisti-mode-duel"><input id="pisti-mode-duel" name="pisti-mode" type="radio" value="duel" checked><span class="pisti-option-icon" aria-hidden="true">${personIcon}</span><span class="pisti-option-copy"><span>İki Kişi</span><small>Bire bir</small></span></label>
                        <label class="pisti-option" for="pisti-mode-teams"><input id="pisti-mode-teams" name="pisti-mode" type="radio" value="teams"><span class="pisti-option-icon" aria-hidden="true">${teamIcon}</span><span class="pisti-option-copy"><span>Eşli Oyun</span><small>2’ye 2</small></span></label>
                    </div></fieldset>
                    <fieldset class="pisti-setting-group is-target"><legend>Hedef puan</legend><div class="pisti-setting-options">
                        <label class="pisti-option" for="pisti-target-51"><input id="pisti-target-51" name="pisti-target" type="radio" value="51"><span class="pisti-option-copy"><span>51</span><small>puan</small></span></label>
                        <label class="pisti-option" for="pisti-target-101"><input id="pisti-target-101" name="pisti-target" type="radio" value="101"><span class="pisti-option-copy"><span>101</span><small>puan</small></span></label>
                        <label class="pisti-option" for="pisti-target-151"><input id="pisti-target-151" name="pisti-target" type="radio" value="151" checked><span class="pisti-option-copy"><span>151</span><small>puan</small></span></label>
                    </div></fieldset>
                    <button id="pisti-new-game" type="button" class="pisti-primary-button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4.4 9a8 8 0 0 1 13.2-3L20 9M4 17v-5h5m10.6 3A8 8 0 0 1 6.4 18L4 15"/></svg><span>Yeni Oyun</span></button>
                </div>
                <div class="pisti-scoreboard" aria-label="Maç puanları"><div class="pisti-team-score" data-team="0"></div><div class="pisti-match-progress"><small class="pisti-match-label">Maç</small><span id="pisti-round"></span><small id="pisti-target-label"></small></div><div class="pisti-team-score" data-team="1"></div></div>
                <div class="pisti-table" id="pisti-table" data-players="2">
                    <div class="pisti-seat" data-seat="0"><div class="pisti-seat-meta"></div><div id="pisti-human-hand" class="pisti-human-hand" aria-label="Elindeki kartlar"></div></div>
                    <div class="pisti-seat" data-seat="1"><div class="pisti-seat-meta"></div><div class="pisti-opponent-hand" aria-hidden="true"></div></div>
                    <div class="pisti-seat" data-seat="2" hidden><div class="pisti-seat-meta"></div><div class="pisti-opponent-hand" aria-hidden="true"></div></div>
                    <div class="pisti-seat" data-seat="3" hidden><div class="pisti-seat-meta"></div><div class="pisti-opponent-hand" aria-hidden="true"></div></div>
                    <div class="pisti-center"><div class="pisti-deck" id="pisti-deck"></div><div class="pisti-pile" id="pisti-pile" aria-label="Ortadaki kartlar"></div><span class="pisti-deck-count" id="pisti-deck-count"></span><span class="pisti-pile-count" id="pisti-pile-count"></span></div>
                    <div class="pisti-celebration" id="pisti-celebration" aria-hidden="true"></div>
                </div>
                <div class="pisti-action-row"><p id="pisti-status" role="status" aria-live="polite"></p><span class="pisti-key-hint">1–4 ile kart oyna</span><button id="pisti-next-round" type="button" class="pisti-primary-button" hidden>Sonraki El</button></div>
            </div>
            <dialog id="pisti-dialog" class="pisti-dialog" aria-labelledby="pisti-result-title"><h3 id="pisti-result-title"></h3><p id="pisti-result-description"></p><div id="pisti-round-scores" class="pisti-round-scores"></div><div class="pisti-dialog-actions"><button id="pisti-close-result" type="button">Masaya Dön</button><button id="pisti-continue" type="button" class="pisti-primary-button">Sonraki El</button></div></dialog>
            <dialog id="pisti-captures-dialog" class="pisti-dialog" aria-labelledby="pisti-captures-title"><h3 id="pisti-captures-title">Kazandığınız Kartlar</h3><p>Takımınızın bildiği toplanmış kartlar.</p><div id="pisti-captured-grid" class="pisti-captured-grid"></div><button id="pisti-close-captures" type="button" class="pisti-primary-button">Masaya Dön</button></dialog>`;
        const get = (name) => document.getElementById(`pisti-${name}`);
        const seats = [...app.querySelectorAll(".pisti-seat")];
        const teamPanels = [...app.querySelectorAll(".pisti-team-score")];
        const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
        const animations = new Set();
        const flights = new Set();
        const hiddenTargets = new Set();
        const dialogFocus = new Map();
        const format = new Intl.NumberFormat("tr-TR");
        let audio;
        let controller;
        let renderedScores = null;
        let renderedCounts = null;
        const names = (game) => game.mode === "teams" ? ["Sen", "Rakip 1", "Eşin", "Rakip 2"] : ["Sen", "Rakip"];
        const teams = (game) => game.mode === "teams" ? ["Sen & Eşin", "Rakip Takım"] : ["Sen", "Rakip"];
        const teamOf = (seat, game) => game.mode === "teams" ? seat % 2 : seat;
        const live = () => panel.classList.contains("active") && !document.hidden && !get("captures-dialog").open;

        function element(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        }

        function avatar(className, teams = false) {
            const node = element("span", className);
            node.setAttribute("aria-hidden", "true");
            node.innerHTML = teams ? teamIcon : personIcon;
            return node;
        }

        function stat(value, label, className = "pisti-stat") {
            const node = element("span", className);
            node.append(element("b", "", format.format(value)), element("span", "", label));
            return node;
        }

        function readNewGameSettings() {
            return {
                mode: app.querySelector('input[name="pisti-mode"]:checked')?.value || "duel",
                target: Number(app.querySelector('input[name="pisti-target"]:checked')?.value || 151),
            };
        }

        function sound(kind) { if (live()) audio?.play(kind); }

        function renderPreferences(preferences) {
            get("sound").firstElementChild.textContent = preferences.muted ? "🔇" : "🔊";
            get("sound").setAttribute("aria-pressed", String(!preferences.muted));
            get("sound").setAttribute("aria-label", preferences.muted ? "Oyun seslerini aç" : "Oyun seslerini kapat");
            get("sound").title = preferences.muted ? "Sesi aç" : "Sesi kapat";
            get("volume").value = String(Math.round(preferences.volume * 100));
            get("volume-value").textContent = `%${get("volume").value}`;
        }

        function render(game, ui) {
            const playing = game.phase === "playing";
            const canPlay = playing && game.currentSeat === 0 && !ui.busy && ui.active;
            app.classList.toggle("is-busy", ui.busy);
            app.dataset.phase = game.phase;
            get("table").dataset.players = String(game.handCounts.length);
            get("table").setAttribute("aria-busy", String(ui.busy));
            get("round").textContent = `${game.roundNumber}. El`;
            get("target-label").textContent = `Hedef ${game.target}`;
            get("deck-count").textContent = `Destede ${game.deckCount}`;
            get("pile-count").textContent = game.table.length ? `Ortada ${game.table.length} kart` : "Orta boş";
            const teamNames = teams(game);
            teamPanels.forEach((node, team) => {
                const count = game.capturedCounts.reduce((sum, value, seat) => sum + (teamOf(seat, game) === team ? value : 0), 0);
                const pisti = game.pisti[team].normal + game.pisti[team].jack;
                node.classList.toggle("is-leading", game.scores[team] > game.scores[1 - team]);
                const total = element("strong", "pisti-team-total", format.format(game.scores[team]));
                total.setAttribute("aria-label", `${teamNames[team]}: ${format.format(game.scores[team])} puan`);
                const detail = element("div", "pisti-team-detail");
                detail.title = "Bu elde toplanan kartlar ve yapılan piştiler";
                detail.append(stat(count, "kart"), stat(pisti, "pişti"));
                node.replaceChildren(avatar("pisti-team-avatar", game.mode === "teams"), element("span", "pisti-team-name", teamNames[team]), total, detail);
                if (renderedScores && game.scores[team] > renderedScores[team]) counterPop(total);
                if (renderedCounts && count > renderedCounts.reduce((sum, value, seat) => sum + (teamOf(seat, game) === team ? value : 0), 0)) counterPop(detail);
            });
            seats.forEach((seat, index) => {
                seat.hidden = index >= game.handCounts.length;
                if (seat.hidden) return;
                seat.classList.toggle("is-human", index === 0);
                seat.classList.toggle("is-partner", game.mode === "teams" && index === 2);
                seat.classList.toggle("is-active", playing && game.currentSeat === index);
                seat.dataset.team = String(teamOf(index, game));
                const meta = seat.querySelector(".pisti-seat-meta");
                const name = element("span", "pisti-seat-name", names(game)[index]);
                if (game.dealer === index) {
                    const marker = element("small", "pisti-dealer-marker", "D");
                    marker.title = "Kartları dağıtan oyuncu";
                    marker.setAttribute("aria-label", "Dağıtan");
                    name.append(marker);
                }
                const count = element(teamOf(index, game) === 0 ? "button" : "span", "pisti-captured");
                count.append(element("b", "", format.format(game.capturedCounts[index])), element("span", "", "kart"));
                if (count.tagName === "BUTTON") {
                    count.type = "button";
                    count.classList.add("pisti-captured-button");
                    count.dataset.captures = "true";
                    count.setAttribute("aria-label", `${names(game)[index]}: ${game.capturedCounts[index]} kart topladı. Takımınızın kazandığı kartları gör`);
                }
                meta.replaceChildren(avatar("pisti-seat-avatar"), name, count);
                if (renderedCounts && game.capturedCounts[index] > (renderedCounts[index] || 0)) counterPop(count);
                if (index > 0) {
                    seat.querySelector(".pisti-opponent-hand").replaceChildren(...Array.from({ length: game.handCounts[index] }, () => cards.create(null, { faceDown: true, small: true })));
                    seat.setAttribute("aria-label", `${names(game)[index]}, ${game.handCounts[index]} kapalı kart, ${game.capturedCounts[index]} kart topladı`);
                }
            });
            get("human-hand").replaceChildren(...game.hand.map((card, index) => {
                const button = element("button", "pisti-hand-card");
                button.type = "button";
                button.dataset.cardId = card.id;
                button.disabled = !canPlay;
                button.setAttribute("aria-label", `${cards.label(card)}, ${index + 1} tuşuyla oyna`);
                button.append(cards.create(card), element("span", "pisti-card-key", String(index + 1)));
                return button;
            }));
            get("pile").replaceChildren(...game.table.slice(-4).map((card, index) => {
                const wrapper = element("div", "pisti-pile-card");
                wrapper.style.setProperty("--pisti-stack-index", index);
                wrapper.append(cards.create(card, { faceDown: !card }));
                return wrapper;
            }));
            if (!game.table.length) get("pile").append(element("span", "pisti-empty-pile", "Ortaya oyna"));
            get("deck").replaceChildren(...(game.deckCount ? [cards.create(null, { faceDown: true, small: true })] : []));
            get("deck").classList.toggle("is-empty", !game.deckCount);
            get("next-round").hidden = playing;
            get("next-round").textContent = game.phase === "match-over" ? "Yeni Maç" : "Sonraki El";
            renderPreferences(ui.preferences);
            if (!playing) get("status").textContent = game.phase === "match-over" ? "Maç tamamlandı. Puanları inceleyip yeni bir maç başlatabilirsin." : "El tamamlandı. Sonraki ele geçebilirsin.";
            else if (ui.busy) get("status").textContent = game.lastMove ? `${names(game)[game.lastMove.seat]} kartını oynuyor…` : "Kartlar dağıtılıyor…";
            else get("status").textContent = game.currentSeat === 0 ? "Sıra sende. Bir kart seç." : `${names(game)[game.currentSeat]} düşünüyor…`;
            renderedScores = game.scores.slice();
            renderedCounts = game.capturedCounts.slice();
        }

        function rect(node) { return node?.getBoundingClientRect(); }
        function prepare() {
            return {
                hand: new Map([...get("human-hand").children].map((button) => [button.dataset.cardId, rect(button.querySelector(".pisti-card"))])),
                opponents: seats.map((seat) => rect(seat.querySelector(".pisti-opponent-hand .pisti-card")) || rect(seat)),
                pile: [...get("pile").querySelectorAll(".pisti-pile-card")].map((node) => ({ rect: rect(node.querySelector(".pisti-card")), node: node.querySelector(".pisti-card").cloneNode(true) })),
                deck: rect(get("deck")),
            };
        }

        function run(node, frames, timing) {
            if (!node.animate || motion.matches) return Promise.resolve();
            const animation = node.animate(frames, timing);
            animations.add(animation);
            return animation.finished.catch(() => {}).finally(() => animations.delete(animation));
        }

        function counterPop(node) {
            run(node, [{ opacity: 0.55, transform: "translateY(3px) scale(.94)" }, { opacity: 1, transform: "translateY(-1px) scale(1.09)", offset: 0.45 }, { opacity: 1, transform: "translateY(0) scale(1)" }], { duration: 420, easing: "ease-out" });
        }

        function hide(node) { if (node) { node.style.visibility = "hidden"; hiddenTargets.add(node); } }
        function reveal(node) { if (node) { node.style.visibility = ""; hiddenTargets.delete(node); } }
        function cancelAnimations() {
            animations.forEach((animation) => animation.cancel());
            animations.clear();
            flights.forEach((flight) => flight.remove());
            flights.clear();
            hiddenTargets.forEach((node) => { node.style.visibility = ""; });
            hiddenTargets.clear();
            get("celebration").replaceChildren();
        }

        function fly(card, from, to, { flip = false, delay = 0, duration = 330, fade = false, clone = null } = {}) {
            if (!from?.width || !to?.width || motion.matches) return Promise.resolve();
            const flight = element("div", "pisti-flight");
            flight.setAttribute("aria-hidden", "true");
            Object.assign(flight.style, { position: "fixed", left: "0", top: "0", width: `${to.width}px`, height: `${to.height}px`, pointerEvents: "none", zIndex: "10000" });
            let turning;
            if (flip && card) {
                const flipper = element("div", "pisti-flight-flipper");
                Object.assign(flipper.style, { width: "100%", height: "100%", transformStyle: "preserve-3d" });
                const back = cards.create(null, { faceDown: true });
                const front = cards.create(card);
                for (const face of [back, front]) Object.assign(face.style, { position: "absolute", inset: "0", width: "100%", height: "100%", backfaceVisibility: "hidden" });
                front.style.transform = "rotateY(180deg)";
                flipper.append(back, front);
                flight.append(flipper);
                turning = run(flipper, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration, delay, fill: "both", easing: "ease-in-out" });
            } else flight.append(clone || cards.create(card, { faceDown: !card }));
            document.body.append(flight);
            flights.add(flight);
            const moving = run(flight, [
                { transform: `translate3d(${from.left}px,${from.top}px,0) scale(${from.width / to.width}) rotate(-7deg)`, opacity: 1 },
                { transform: `translate3d(${to.left}px,${to.top}px,0) scale(1) rotate(0deg)`, opacity: fade ? 0 : 1 },
            ], { duration, delay, fill: "both", easing: "cubic-bezier(.2,.75,.25,1)" });
            return Promise.all([moving, turning]).finally(() => { flight.remove(); flights.delete(flight); });
        }

        async function animate(before, game, context) {
            if (!context.isCurrent() || motion.matches) return;
            const dealt = context.initial || game.lastMove?.dealt;
            const dealTargets = dealt ? seats.flatMap((seat, index) => seat.hidden ? [] : [...seat.querySelectorAll(index === 0 ? ".pisti-hand-card .pisti-card" : ".pisti-opponent-hand .pisti-card")].map((node, cardIndex) => ({ node, seat: index, card: index === 0 ? game.hand[cardIndex] : null }))) : [];
            dealTargets.forEach(({ node }) => hide(node));
            const move = context.initial ? null : game.lastMove;
            if (move) {
                const from = move.seat === 0 ? context.prepared?.hand.get(move.card.id) : context.prepared?.opponents[move.seat];
                const target = get("pile").lastElementChild?.querySelector?.(".pisti-card");
                const to = rect(target) || rect(get("pile"));
                if (!move.capturedCount) hide(target);
                sound("play");
                await fly(move.card, from, to, { flip: move.seat !== 0 });
                reveal(target);
                if (!context.isCurrent()) return;
                if (move.capturedCount || move.leftoversCount) {
                    const captureSeat = move.capturedCount ? move.seat : move.leftoversSeat;
                    const destination = rect(seats[captureSeat]?.querySelector(".pisti-captured")) || rect(seats[captureSeat]);
                    const captured = [...(context.prepared?.pile || []), { rect: to, node: cards.create(move.card) }];
                    sound(move.pisti ? "pisti" : "capture");
                    await Promise.all(captured.map((item, index) => fly(null, item.rect, destination, { clone: item.node, fade: true, duration: 300, delay: index * 24 })));
                    if (!context.isCurrent()) return;
                    if (move.pisti) await celebrate(move.pisti);
                }
            }
            if (!context.isCurrent()) return;
            if (dealt) {
                sound("deal");
                const source = rect(get("deck"));
                await Promise.all(dealTargets.map(({ node, card }, index) => fly(card, source, rect(node), { flip: Boolean(card), duration: 300, delay: index * 27 }).finally(() => reveal(node))));
            }
        }

        async function celebrate(kind) {
            const layer = get("celebration");
            const word = element("strong", "pisti-celebration-word", kind === "jack" ? "VALE PİŞTİSİ!" : "PİŞTİ!");
            word.append(element("span", "pisti-celebration-points", kind === "jack" ? "+20" : "+10"));
            layer.replaceChildren(word);
            const effects = [run(word, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1.05)", offset: 0.25 }, { opacity: 1, transform: "scale(1)", offset: 0.72 }, { opacity: 0, transform: "scale(1.08)" }], { duration: 780, fill: "both" })];
            for (let index = 0; index < 10; index += 1) {
                const particle = element("i", "pisti-particle");
                layer.append(particle);
                const angle = index * Math.PI * 2 / 10;
                effects.push(run(particle, [{ opacity: 0.8, transform: "translate(0,0) scale(1)" }, { opacity: 0, transform: `translate(${Math.cos(angle) * 100}px,${Math.sin(angle) * 65}px) scale(.2)` }], { duration: 650, fill: "both" }));
            }
            await Promise.all(effects);
            layer.replaceChildren();
        }

        function showDialog(dialog) {
            if (dialog.open || !live()) return;
            dialogFocus.set(dialog, document.activeElement);
            dialog.showModal();
        }

        function showRoundEnd(game) {
            const title = game.phase === "match-over" ? game.winner === 0 ? "Maçı kazandınız!" : "Maç tamamlandı" : `${game.roundNumber}. el tamamlandı`;
            get("result-title").textContent = title;
            get("result-description").textContent = game.phase === "match-over" ? `${teams(game)[game.winner ?? 0]} · ${game.scores.join(" – ")} puan` : "El puanları maç toplamına eklendi.";
            const summary = game.roundSummary;
            const rows = [["", ...teams(game)], ["Toplanan kart", ...(summary?.teams.map((team) => team.capturedCount) || [0, 0])], ["Kart puanı", ...(summary?.teams.map((team) => team.cardPoints) || [0, 0])], ["Pişti", ...(summary?.teams.map((team) => team.pistiPoints) || [0, 0])], ["Kart çoğunluğu", ...(summary?.teams.map((team) => team.majorityPoints) || [0, 0])], ["El toplamı", ...(summary?.points || [0, 0])], ["Maç toplamı", ...game.scores]];
            get("round-scores").replaceChildren(...rows.map((row) => {
                const line = element("div", "pisti-score-row");
                line.append(...row.map((value, index) => element(index ? "strong" : "span", "", String(value))));
                return line;
            }));
            get("continue").textContent = game.phase === "match-over" ? "Yeni Maç" : "Sonraki El";
            showDialog(get("dialog"));
            if (game.phase === "match-over" && game.winner === 0) sound("win");
        }

        try { controller = createController({
            core, active: live(), isVisible: live,
            storage: { getItem: (key) => view.localStorage.getItem(key), setItem: (key, value) => view.localStorage.setItem(key, value) },
            clock: { setTimeout: (callback, delay) => view.setTimeout(callback, delay), clearTimeout: (handle) => view.clearTimeout(handle) },
            render, prepare, animate, cancelAnimations, onRoundEnd: showRoundEnd,
            onPreferences(preferences) { audio?.setMuted(preferences.muted); audio?.setVolume(preferences.volume); renderPreferences(preferences); },
        }); } catch {
            get("status").textContent = "Güvenli kart karıştırma başlatılamadı. Güncel bir tarayıcıda tekrar dene.";
            get("new-game").disabled = true;
            return;
        }
        audio = view.OmniPistiAudio?.create(controller.getPreferences());
        const initial = controller.getView();
        (get(`mode-${initial.mode}`) || get("mode-duel")).checked = true;
        (get(`target-${initial.target}`) || get("target-151")).checked = true;

        function syncActivity() {
            if (!panel.classList.contains("active")) for (const id of ["dialog", "captures-dialog"]) if (get(id).open) get(id).close();
            controller.setActive(live());
        }

        function continueGame() {
            get("dialog").close();
            if (controller.getState().phase === "match-over") controller.newGame(readNewGameSettings());
            else controller.nextRound();
        }

        get("human-hand").addEventListener("click", (event) => {
            const button = event.target.closest(".pisti-hand-card");
            if (!button || button.disabled) return;
            audio?.unlock();
            controller.play(button.dataset.cardId);
        });
        document.addEventListener("keydown", (event) => {
            if (!live() || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !/^[1-4]$/u.test(event.key) || /^(INPUT|SELECT|TEXTAREA)$/u.test(event.target.tagName) || get("dialog").open) return;
            const card = controller.getView().hand[Number(event.key) - 1];
            if (card) {
                audio?.unlock();
                if (controller.play(card.id)) event.preventDefault();
            }
        });
        get("new-game").addEventListener("click", () => {
            audio?.unlock();
            for (const id of ["dialog", "captures-dialog"]) if (get(id).open) get(id).close();
            controller.newGame(readNewGameSettings());
        });
        get("sound").addEventListener("click", () => { audio?.unlock(); controller.setPreferences({ muted: !controller.getPreferences().muted }); });
        get("volume").addEventListener("input", (event) => { audio?.unlock(); controller.setPreferences({ volume: Number(event.currentTarget.value) / 100 }); });
        const volumeControl = get("sound").closest(".pisti-volume-control");
        volumeControl.addEventListener("pointerleave", (event) => {
            if (event.pointerType === "mouse" && volumeControl.contains(document.activeElement)) document.activeElement.blur();
        });
        get("close-captures").addEventListener("click", () => get("captures-dialog").close());
        get("close-result").addEventListener("click", () => get("dialog").close());
        get("continue").addEventListener("click", continueGame);
        get("next-round").addEventListener("click", continueGame);
        get("table").addEventListener("click", (event) => {
            if (!event.target.closest("[data-captures]")) return;
            const game = controller.getView();
            const known = game.captures.flatMap((captured, seat) => teamOf(seat, game) === 0 ? captured : []);
            get("captured-grid").replaceChildren(...known.map((card) => cards.create(card, { small: true })));
            if (!known.length) get("captured-grid").append(element("p", "", "Henüz kart toplamadınız."));
            showDialog(get("captures-dialog"));
            syncActivity();
        });
        for (const id of ["dialog", "captures-dialog"]) get(id).addEventListener("close", () => {
            syncActivity();
            const previous = dialogFocus.get(get(id));
            if (panel.classList.contains("active")) {
                const fallback = previous?.classList?.contains("pisti-captured-button")
                    ? app.querySelector(".pisti-captured-button")
                    : [...get("human-hand").children].find((button) => !button.disabled) || (!get("next-round").hidden ? get("next-round") : get("new-game"));
                const target = previous?.isConnected && !previous.disabled ? previous : fallback;
                target?.focus({ preventScroll: true });
            }
            dialogFocus.delete(get(id));
        });
        document.addEventListener("visibilitychange", syncActivity);
        view.addEventListener("pagehide", () => controller.setActive(false));
        view.addEventListener("pageshow", syncActivity);
        new view.MutationObserver(syncActivity).observe(panel, { attributes: true, attributeFilter: ["class"] });
        controller.start();
    }

    function register(view, document) {
        const panel = document.getElementById("pisti");
        if (!panel || !view.OmniPistiCore || !view.OmniPistiCards) return;
        if (panel.classList.contains("active")) mount(view, document, panel);
        else {
            function onActivation(event) {
                if (event.detail?.tool !== "pisti") return;
                document.removeEventListener("tool-activated", onActivation);
                mount(view, document, panel);
            }
            document.addEventListener("tool-activated", onActivation);
        }
    }

    return Object.freeze({ createController, register });
});
