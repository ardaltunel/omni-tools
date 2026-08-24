(function initializeOmniAi() {
    "use strict";

    const panel = document.getElementById("omni-ai");
    const core = window.OmniAiCore;
    const markdown = window.OmniAiMarkdown;
    const config = window.OmniAiConfig;
    if (!panel || !core || !markdown || !config) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        sidebar: byId("omni-ai-sidebar"), overlay: byId("omni-ai-overlay"), menu: byId("omni-ai-menu"), closeSidebar: byId("omni-ai-close-sidebar"),
        newChat: byId("omni-ai-new-chat"), history: byId("omni-ai-history"), clearHistory: byId("omni-ai-clear-history"),
        title: byId("omni-ai-chat-title"), mode: byId("omni-ai-mode"), length: byId("omni-ai-length"), settings: byId("omni-ai-settings"),
        messages: byId("omni-ai-messages"), welcome: byId("omni-ai-welcome"), suggestions: byId("omni-ai-suggestions"), jump: byId("omni-ai-jump"),
        composer: byId("omni-ai-composer"), input: byId("omni-ai-input"), count: byId("omni-ai-count"), send: byId("omni-ai-send"), sendLabel: byId("omni-ai-send-label"),
        status: byId("omni-ai-status"), dialog: byId("omni-ai-settings-dialog"), closeSettings: byId("omni-ai-close-settings"),
        dialogLength: byId("omni-ai-dialog-length"), enterSend: byId("omni-ai-enter-send"), dialogClear: byId("omni-ai-dialog-clear"),
    };

    const defaultSettings = Object.freeze({ mode: "general", responseLength: "balanced", enterToSend: true });
    const state = { chats: [], activeId: "", settings: { ...defaultSettings }, controller: null, streaming: false, editingIndex: null, statusTimer: null, renderFrame: 0 };

    function safeParse(value, fallback) {
        if (typeof value !== "string" || !value.trim()) return fallback;
        try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
    }

    function loadState() {
        const stored = safeParse(localStorage.getItem(config.storageKey), []);
        state.chats = (Array.isArray(stored) ? stored : []).slice(0, config.maximumStoredChats).filter((chat) => chat && typeof chat.id === "string").map((chat) => ({
            id: chat.id,
            title: core.createTitle(chat.title),
            createdAt: Number(chat.createdAt) || Date.now(),
            updatedAt: Number(chat.updatedAt) || Date.now(),
            messages: (Array.isArray(chat.messages) ? chat.messages : []).filter((message) => ["user", "assistant"].includes(message?.role) && typeof message?.content === "string").slice(-80).map((message) => ({
                id: typeof message.id === "string" ? message.id : core.createId("message"), role: message.role, content: message.content.slice(0, 40000), rating: ["up", "down"].includes(message.rating) ? message.rating : "",
            })),
        })).filter((chat) => core.hasChatContent(chat)).map((chat) => {
            if (chat.title !== "Yeni Sohbet") return chat;
            const firstMessage = chat.messages.find((message) => message.role === "user");
            return { ...chat, title: core.createTitle(firstMessage?.content) };
        });
        const storedSettings = safeParse(localStorage.getItem(config.settingsKey), {});
        state.settings = {
            mode: core.modes.some((item) => item.value === storedSettings.mode) ? storedSettings.mode : defaultSettings.mode,
            responseLength: core.responseLengths.some((item) => item.value === storedSettings.responseLength) ? storedSettings.responseLength : defaultSettings.responseLength,
            enterToSend: storedSettings.enterToSend !== false,
        };
        if (!state.chats.length) state.chats.push(core.createChat());
        state.activeId = state.chats.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }

    function saveChats() {
        const storable = state.chats.filter((chat) => core.hasChatContent(chat)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, config.maximumStoredChats).map((chat) => ({
            ...chat,
            messages: chat.messages.filter((message) => message.content && !message.pending).map(({ pending, error, ...message }) => message),
        }));
        try {
            if (storable.length) localStorage.setItem(config.storageKey, JSON.stringify(storable));
            else localStorage.removeItem(config.storageKey);
        } catch { showStatus("Sohbet geçmişi cihazınıza kaydedilemedi.", "error"); }
    }

    function saveSettings() {
        try { localStorage.setItem(config.settingsKey, JSON.stringify(state.settings)); } catch { /* Ayarlar yalnızca bu oturumda kalır. */ }
    }

    function activeChat() {
        let chat = state.chats.find((item) => item.id === state.activeId);
        if (!chat) { chat = core.createChat(); state.chats.unshift(chat); state.activeId = chat.id; }
        return chat;
    }

    function showStatus(message, type = "") {
        if (state.statusTimer) window.clearTimeout(state.statusTimer);
        elements.status.textContent = message;
        elements.status.className = `omni-ai-status${type ? ` is-${type}` : ""}`;
        elements.status.hidden = !message;
        state.statusTimer = message ? window.setTimeout(() => { elements.status.hidden = true; elements.status.textContent = ""; }, type === "error" ? 5000 : 2200) : null;
    }

    function populateSelect(select, values, selected) {
        const fragment = document.createDocumentFragment();
        values.forEach(({ value, label }) => {
            const option = document.createElement("option");
            option.value = value; option.textContent = label; option.selected = value === selected; fragment.append(option);
        });
        select.replaceChildren(fragment);
    }

    function setDrawer(open) {
        panel.classList.toggle("is-sidebar-open", open);
        elements.menu.setAttribute("aria-expanded", String(open));
    }

    function createHistoryItem(chat) {
        const item = document.createElement("div");
        const open = document.createElement("button");
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        const date = document.createElement("small");
        const menu = document.createElement("button");
        item.className = `omni-ai-history-item${chat.id === state.activeId ? " is-active" : ""}`;
        open.type = "button"; open.className = "omni-ai-history-open"; open.setAttribute("aria-label", `${chat.title} sohbetini aç`);
        title.textContent = chat.title; date.textContent = core.formatChatDate(chat.updatedAt); copy.append(title, date); open.append(copy);
        open.addEventListener("click", () => { if (state.streaming) stopResponse(); state.activeId = chat.id; state.editingIndex = null; renderAll(); setDrawer(false); });
        menu.type = "button"; menu.className = "omni-ai-history-menu"; menu.textContent = "•••"; menu.setAttribute("aria-label", `${chat.title} seçenekleri`);
        menu.addEventListener("click", () => manageChat(chat));
        item.append(open, menu);
        return item;
    }

    function manageChat(chat) {
        const action = window.prompt("Sohbet için 'yeniden adlandır' veya 'sil' yazın:", "yeniden adlandır");
        if (!action) return;
        if (action.toLocaleLowerCase("tr-TR").includes("sil")) {
            if (!window.confirm(`“${chat.title}” sohbeti silinsin mi?`)) return;
            state.chats = state.chats.filter((item) => item.id !== chat.id);
            if (!state.chats.length) state.chats.push(core.createChat());
            if (state.activeId === chat.id) state.activeId = state.chats[0].id;
            saveChats(); renderAll();
            return;
        }
        const name = window.prompt("Yeni sohbet adı:", chat.title);
        if (!name?.trim()) return;
        chat.title = core.createTitle(name); chat.updatedAt = Date.now(); saveChats(); renderAll();
    }

    function renderHistory() {
        const fragment = document.createDocumentFragment();
        const chats = state.chats.filter((chat) => core.hasChatContent(chat)).sort((a, b) => b.updatedAt - a.updatedAt);
        chats.forEach((chat) => fragment.append(createHistoryItem(chat)));
        elements.history.replaceChildren(fragment);
        elements.clearHistory.hidden = chats.length === 0;
    }

    function actionButton(label, handler, pressed) {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = label; button.addEventListener("click", handler);
        if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
        return button;
    }

    async function copyText(value) {
        try { await navigator.clipboard.writeText(value); showStatus("Kopyalandı.", "success"); }
        catch { showStatus("Kopyalanamadı.", "error"); }
    }

    function createMessage(message, index) {
        const article = document.createElement("article");
        const avatar = document.createElement("div");
        const body = document.createElement("div");
        const top = document.createElement("div");
        const author = document.createElement("strong");
        const content = document.createElement("div");
        const actions = document.createElement("div");
        article.className = `omni-ai-message is-${message.role}${message.pending ? " is-streaming" : ""}${message.error ? " is-error" : ""}`;
        article.dataset.messageId = message.id;
        avatar.className = "omni-ai-message-avatar"; avatar.textContent = message.role === "user" ? "S" : "✦"; avatar.setAttribute("aria-hidden", "true");
        body.className = "omni-ai-message-body"; top.className = "omni-ai-message-top"; author.textContent = message.role === "user" ? "Siz" : "Omni AI";
        content.className = "omni-ai-message-content";
        if (message.role === "assistant") markdown.renderMarkdown(content, message.content || (message.pending ? "Yanıt oluşturuluyor…" : ""));
        else content.textContent = message.content;
        actions.className = "omni-ai-message-actions";
        if (!message.pending && message.content) {
            actions.append(actionButton("Kopyala", () => copyText(message.content)));
            if (message.role === "user") actions.append(actionButton("Düzenle", () => editMessage(index)));
            else {
                actions.append(actionButton("Yeniden Oluştur", () => regenerate(index)));
                actions.append(actionButton("Beğendim", () => rateMessage(index, "up"), message.rating === "up"));
                actions.append(actionButton("Beğenmedim", () => rateMessage(index, "down"), message.rating === "down"));
            }
        }
        if (message.error) {
            const error = document.createElement("p");
            error.className = "omni-ai-message-error"; error.textContent = message.error;
            actions.append(actionButton("Tekrar Dene", () => regenerate(index)));
            body.append(top, content, error, actions);
        } else body.append(top, content, actions);
        top.append(author);
        article.append(avatar, body);
        return article;
    }

    function renderMessages(forceBottom = false) {
        const chat = activeChat();
        const nearBottom = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 120;
        elements.welcome.hidden = chat.messages.length > 0;
        const fragment = document.createDocumentFragment();
        chat.messages.forEach((message, index) => fragment.append(createMessage(message, index)));
        elements.messages.replaceChildren(fragment);
        elements.messages.prepend(elements.welcome);
        if (!chat.messages.length) {
            elements.messages.scrollTop = 0;
            elements.jump.hidden = true;
        } else if (forceBottom || nearBottom) window.requestAnimationFrame(() => { elements.messages.scrollTop = elements.messages.scrollHeight; elements.jump.hidden = true; });
        else elements.jump.hidden = false;
    }

    function renderAll() {
        const chat = activeChat();
        elements.title.textContent = chat.title;
        renderHistory();
        renderMessages(true);
        updateComposer();
    }

    function updateComposer() {
        const count = core.countCharacters(elements.input.value);
        elements.count.textContent = `${count.toLocaleString("tr-TR")} / ${config.maxCharacters.toLocaleString("tr-TR")}`;
        elements.count.classList.toggle("is-limit", count > config.maxCharacters);
        elements.send.disabled = !state.streaming && (!elements.input.value.trim() || count > config.maxCharacters);
        elements.send.classList.toggle("is-stop", state.streaming);
        elements.sendLabel.textContent = state.streaming ? "Durdur" : (state.editingIndex === null ? "Gönder" : "Düzenlemeyi Gönder");
        elements.input.style.height = "auto";
        elements.input.style.height = `${Math.min(elements.input.scrollHeight, 180)}px`;
    }

    function setStreaming(value) {
        state.streaming = value;
        elements.mode.disabled = value; elements.length.disabled = value;
        updateComposer();
    }

    function editMessage(index) {
        const message = activeChat().messages[index];
        if (!message || message.role !== "user" || state.streaming) return;
        state.editingIndex = index; elements.input.value = message.content; updateComposer(); elements.input.focus();
        showStatus("Mesajı düzenleyip yeniden gönderebilirsiniz.", "success");
    }

    function rateMessage(index, rating) {
        const message = activeChat().messages[index];
        if (!message || message.role !== "assistant") return;
        message.rating = message.rating === rating ? "" : rating; saveChats(); renderMessages();
    }

    function stopResponse() { state.controller?.abort(); }

    async function parseError(response) {
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        const error = new Error(core.getApiErrorMessage(response.status, payload?.code));
        error.isPublic = true;
        return error;
    }

    function createStreamError(code) {
        const messages = {
            insufficient_quota: "API kotası veya kullanım limiti aşıldı.",
            rate_limit_exceeded: "Yapay zekâ hizmeti şu anda yoğun. Biraz sonra tekrar deneyin.",
        };
        const error = new Error(messages[code] || "Yapay zekâ yanıt oluşturamadı.");
        error.isPublic = true;
        return error;
    }

    async function consumeStream(response, onDelta) {
        if (!response.body) throw new Error("Akış yanıtı alınamadı.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const blocks = buffer.split(/\n\n/u);
            buffer = blocks.pop() || "";
            for (const block of blocks) {
                const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
                if (!data || data === "[DONE]") continue;
                let event;
                try { event = JSON.parse(data); } catch { continue; }
                if (event.type === "response.output_text.delta" && typeof event.delta === "string") onDelta(event.delta);
                if (event.type === "error") throw createStreamError(event.error?.code);
                if (event.type === "response.failed") throw createStreamError(event.response?.error?.code);
            }
            if (done) break;
        }
    }

    function scheduleStreamingRender(message) {
        if (state.renderFrame) return;
        state.renderFrame = window.requestAnimationFrame(() => {
            state.renderFrame = 0;
            const target = elements.messages.querySelector(`[data-message-id="${CSS.escape(message.id)}"] .omni-ai-message-content`);
            if (target) markdown.renderMarkdown(target, message.content || "Yanıt oluşturuluyor…");
            elements.messages.scrollTop = elements.messages.scrollHeight;
        });
    }

    async function generateAssistant(chat) {
        if (state.streaming) return;
        const assistant = { id: core.createId("message"), role: "assistant", content: "", pending: true, rating: "" };
        chat.messages.push(assistant); chat.updatedAt = Date.now();
        setStreaming(true); renderMessages(true); renderHistory();
        const controller = new AbortController(); state.controller = controller;
        const timeout = window.setTimeout(() => controller.abort(), config.requestTimeoutMs);
        try {
            const response = await fetch(config.endpoint, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: core.trimContext(chat.messages), mode: state.settings.mode, responseLength: state.settings.responseLength }),
                signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
            });
            if (!response.ok) throw await parseError(response);
            await consumeStream(response, (delta) => { assistant.content += delta; scheduleStreamingRender(assistant); });
            if (!assistant.content.trim()) throw new Error("Boş yanıt alındı.");
            assistant.pending = false;
        } catch (error) {
            assistant.pending = false;
            if (error?.name === "AbortError") {
                if (!assistant.content) chat.messages.pop();
                else assistant.content += "\n\n_Yanıt durduruldu._";
            } else {
                assistant.error = error?.isPublic ? error.message : "Yapay zekâ hizmetine ulaşılamadı.";
            }
        } finally {
            window.clearTimeout(timeout); state.controller = null; setStreaming(false); chat.updatedAt = Date.now();
            saveChats(); renderAll(); elements.input.focus();
        }
    }

    async function sendMessage() {
        if (state.streaming) { stopResponse(); return; }
        const validation = core.validateMessage(elements.input.value, config.maxCharacters);
        if (!validation.valid) { showStatus(validation.message, "error"); elements.input.focus(); return; }
        const chat = activeChat();
        if (state.editingIndex !== null) {
            chat.messages.splice(state.editingIndex);
            chat.messages.push({ id: core.createId("message"), role: "user", content: validation.text, rating: "" });
        } else chat.messages.push({ id: core.createId("message"), role: "user", content: validation.text, rating: "" });
        if (chat.title === "Yeni Sohbet") chat.title = core.createTitle(validation.text);
        state.editingIndex = null; elements.input.value = ""; chat.updatedAt = Date.now(); saveChats(); updateComposer();
        await generateAssistant(chat);
    }

    async function regenerate(index) {
        if (state.streaming) return;
        const chat = activeChat();
        if (chat.messages[index]?.role !== "assistant") return;
        chat.messages.splice(index); saveChats(); renderAll(); await generateAssistant(chat);
    }

    function newChat() {
        if (state.streaming) stopResponse();
        state.chats = state.chats.filter((chat) => core.hasChatContent(chat));
        const chat = core.createChat(); state.chats.unshift(chat); state.activeId = chat.id; state.editingIndex = null; elements.input.value = "";
        saveChats(); renderAll(); setDrawer(false); elements.input.focus();
    }

    function clearHistory() {
        if (!window.confirm("Tüm yerel sohbet geçmişi silinsin mi?")) return;
        if (state.streaming) stopResponse();
        state.chats = [core.createChat()]; state.activeId = state.chats[0].id; localStorage.removeItem(config.storageKey); renderAll();
    }

    function buildSuggestions() {
        const fragment = document.createDocumentFragment();
        core.suggestions.forEach((suggestion) => {
            const button = document.createElement("button");
            const icon = document.createElement("span");
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            const text = document.createElement("small");
            button.type = "button"; button.className = "omni-ai-suggestion";
            icon.className = "omni-ai-suggestion-icon"; icon.textContent = suggestion.icon;
            title.textContent = suggestion.title; text.textContent = suggestion.prompt; copy.append(title, text); button.append(icon, copy);
            button.addEventListener("click", () => { elements.input.value = suggestion.prompt; updateComposer(); elements.input.focus(); });
            fragment.append(button);
        });
        elements.suggestions.replaceChildren(fragment);
    }

    loadState();
    saveChats();
    populateSelect(elements.mode, core.modes, state.settings.mode);
    populateSelect(elements.length, core.responseLengths, state.settings.responseLength);
    populateSelect(elements.dialogLength, core.responseLengths, state.settings.responseLength);
    elements.enterSend.checked = state.settings.enterToSend;
    buildSuggestions(); renderAll();

    elements.newChat.addEventListener("click", newChat);
    elements.clearHistory.addEventListener("click", clearHistory);
    elements.dialogClear.addEventListener("click", clearHistory);
    elements.menu.addEventListener("click", () => setDrawer(true));
    elements.closeSidebar.addEventListener("click", () => setDrawer(false));
    elements.overlay.addEventListener("click", () => setDrawer(false));
    elements.send.addEventListener("click", sendMessage);
    elements.input.addEventListener("input", updateComposer);
    elements.input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || (!state.settings.enterToSend && !event.ctrlKey && !event.metaKey)) return;
        event.preventDefault(); sendMessage();
    });
    elements.mode.addEventListener("change", () => { state.settings.mode = elements.mode.value; saveSettings(); });
    elements.length.addEventListener("change", () => { state.settings.responseLength = elements.length.value; elements.dialogLength.value = elements.length.value; saveSettings(); });
    elements.settings.addEventListener("click", () => elements.dialog.showModal());
    elements.closeSettings.addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", (event) => { if (event.target === elements.dialog) elements.dialog.close(); });
    elements.dialogLength.addEventListener("change", () => { state.settings.responseLength = elements.dialogLength.value; elements.length.value = elements.dialogLength.value; saveSettings(); });
    elements.enterSend.addEventListener("change", () => { state.settings.enterToSend = elements.enterSend.checked; saveSettings(); });
    elements.jump.addEventListener("click", () => { elements.messages.scrollTop = elements.messages.scrollHeight; elements.jump.hidden = true; });
    window.addEventListener("pagehide", () => state.controller?.abort(), { once: true });
})();
