(function exposeOmniAiCore(global) {
    "use strict";

    const MAX_MESSAGE_CHARACTERS = 10000;
    const MAX_CONTEXT_CHARACTERS = 30000;
    const MAX_CONTEXT_MESSAGES = 16;

    const modes = Object.freeze([
        { value: "general", label: "Genel" },
        { value: "coding", label: "Kodlama" },
        { value: "writing", label: "Yazma" },
        { value: "learning", label: "Öğrenme" },
        { value: "brainstorming", label: "Fikir Üretme" },
    ]);

    const responseLengths = Object.freeze([
        { value: "short", label: "Kısa" },
        { value: "balanced", label: "Dengeli" },
        { value: "detailed", label: "Detaylı" },
    ]);

    const suggestions = Object.freeze([
        { icon: "</>", title: "Kod yaz", prompt: "React ile basit ve anlaşılır bir yapılacaklar uygulaması oluştur." },
        { icon: "Aa", title: "Metin yaz", prompt: "Profesyonel ve kısa bir müşteri e-postası hazırlamama yardım et." },
        { icon: "?", title: "Bir konuyu açıkla", prompt: "JavaScript closure konusunu başlangıç seviyesinde örneklerle açıkla." },
        { icon: "+", title: "Fikir üret", prompt: "Geliştiriciler için uygulanabilir beş web projesi fikri öner." },
        { icon: "↗", title: "Prompt geliştir", prompt: "Bu fikri etkili bir yapay zekâ promptuna dönüştür: Bir çalışma planı hazırla." },
        { icon: "≡", title: "Metni özetle", prompt: "Aşağıya ekleyeceğim metni temel noktaları koruyarak özetle:\n\n" },
    ]);

    function countCharacters(value) {
        return Array.from(String(value || "")).length;
    }

    function validateMessage(value, maximum = MAX_MESSAGE_CHARACTERS) {
        const text = String(value || "").replace(/\u0000/g, "");
        const characters = countCharacters(text);
        if (!text.trim()) return { valid: false, message: "Mesaj alanı boş." };
        if (characters > maximum) return { valid: false, message: `Mesaj ${maximum.toLocaleString("tr-TR")} karakter sınırını aşıyor.` };
        return { valid: true, message: "", text: text.trim(), characters };
    }

    function createId(prefix = "chat") {
        if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`;
        const bytes = new Uint8Array(12);
        global.crypto?.getRandomValues?.(bytes);
        return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }

    function createTitle(value) {
        const title = String(value || "").replace(/\s+/gu, " ").trim();
        if (!title) return "Yeni Sohbet";
        return Array.from(title).slice(0, 48).join("") + (countCharacters(title) > 48 ? "…" : "");
    }

    function createChat(now = Date.now()) {
        return { id: createId("chat"), title: "Yeni Sohbet", createdAt: now, updatedAt: now, messages: [] };
    }

    function hasChatContent(chat) {
        return Array.isArray(chat?.messages) && chat.messages.some((message) =>
            message?.role === "user" && String(message?.content || "").trim()
        );
    }

    function trimContext(messages, options = {}) {
        const maximumMessages = Number(options.maximumMessages) || MAX_CONTEXT_MESSAGES;
        const maximumCharacters = Number(options.maximumCharacters) || MAX_CONTEXT_CHARACTERS;
        const clean = (Array.isArray(messages) ? messages : []).filter((message) =>
            ["user", "assistant"].includes(message?.role) && String(message?.content || "").trim()
        ).map((message) => ({ role: message.role, content: String(message.content).trim() }));
        const selected = [];
        let characters = 0;
        for (let index = clean.length - 1; index >= 0 && selected.length < maximumMessages; index -= 1) {
            const message = clean[index];
            const length = countCharacters(message.content);
            if (selected.length && characters + length > maximumCharacters) break;
            if (!selected.length && length > maximumCharacters) {
                message.content = Array.from(message.content).slice(-maximumCharacters).join("");
            }
            selected.unshift(message);
            characters += Math.min(length, maximumCharacters);
        }
        while (selected[0]?.role === "assistant") selected.shift();
        return selected;
    }

    function formatChatDate(timestamp, now = Date.now()) {
        const date = new Date(Number(timestamp) || now);
        const today = new Date(now);
        if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
        return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    }

    function getApiErrorMessage(status, code) {
        const messages = {
            EMPTY_MESSAGE: "Mesaj alanı boş.",
            MESSAGE_TOO_LONG: "Mesaj 10.000 karakter sınırını aşıyor.",
            CONTEXT_TOO_LARGE: "Sohbet bağlamı çok uzun. Yeni bir sohbet başlatmayı deneyin.",
            RATE_LIMIT: "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.",
            RATE_LIMIT_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            DAILY_LIMIT: "Bugünkü ücretsiz kullanım limitinize ulaştınız.",
            AI_QUOTA_EXCEEDED: "Yapay zekânın günlük ücretsiz kullanım sınırı doldu. Kota Türkiye saatiyle 03.00'te yenilenir.",
            AI_RATE_LIMIT: "Yapay zekâ hizmeti şu anda yoğun. Biraz sonra tekrar deneyin.",
            AI_TIMEOUT: "İstek zaman aşımına uğradı. Tekrar deneyin.",
            AI_NOT_CONFIGURED: "Yapay zekâ hizmetinin sunucu yapılandırması kontrol edilmeli.",
            AI_UPSTREAM: "Yapay zekâ hizmetine ulaşılamadı. Tekrar deneyin.",
            AI_INCOMPLETE: "Yanıt tamamlanmadan kesildi. Tekrar deneyin.",
            INVALID_AI_OUTPUT: "Yapay zekâ geçerli bir yanıt döndürmedi. Tekrar deneyin.",
            REQUEST_ABORTED: "Yanıt durduruldu.",
            OPENAI_RATE_LIMIT: "Yapay zekâ hizmeti şu anda yoğun. Biraz sonra tekrar deneyin.",
            OPENAI_QUOTA: "API kotası veya kullanım limiti aşıldı.",
            OPENAI_TIMEOUT: "İstek zaman aşımına uğradı.",
            OPENAI_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            OPENAI_AUTH: "Sunucu yapılandırması geçersiz.",
            ORIGIN_DENIED: "Bu adresin yapay zekâ hizmetini kullanmasına izin verilmiyor.",
        };
        if (messages[code]) return messages[code];
        if (status === 429) return messages.RATE_LIMIT;
        if (status === 504) return messages.OPENAI_TIMEOUT;
        if (status >= 500) return "Yapay zekâ hizmetine ulaşılamadı.";
        return "Mesaj gönderilemedi.";
    }

    function createStreamError(code) {
        const aliases = {
            insufficient_quota: "OPENAI_QUOTA",
            rate_limit_exceeded: "AI_RATE_LIMIT",
            provider_unavailable: "AI_UPSTREAM",
        };
        const normalized = aliases[code] || code || "AI_UPSTREAM";
        const error = new Error(getApiErrorMessage(503, normalized));
        error.code = normalized;
        error.isPublic = true;
        return error;
    }

    async function consumeStream(response, onDelta, { signal } = {}) {
        if (!response.body) throw createStreamError("AI_INCOMPLETE");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completed = false;
        let rejectStopped;
        const stopped = new Promise((_, reject) => { rejectStopped = reject; });
        const abort = () => rejectStopped(signal.reason || createStreamError("REQUEST_ABORTED"));
        signal?.addEventListener("abort", abort, { once: true });

        function consumeBlock(block) {
            const data = block.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).replace(/^ /u, "")).join("\n");
            if (!data.trim() || data.trim() === "[DONE]") return;
            let event;
            try { event = JSON.parse(data); } catch { throw createStreamError("INVALID_AI_OUTPUT"); }
            if (event?.type === "error") throw createStreamError(event.error?.code || event.code);
            if (event?.type === "response.failed") throw createStreamError(event.response?.error?.code || event.error?.code || event.code);
            if (event?.type === "response.incomplete") throw createStreamError("AI_INCOMPLETE");
            if (event?.type === "response.completed") completed = true;
            if (event?.type === "response.output_text.delta") {
                if (typeof event.delta !== "string") throw createStreamError("INVALID_AI_OUTPUT");
                onDelta(event.delta);
            }
        }

        try {
            if (signal?.aborted) abort();
            while (!completed) {
                const { done, value } = await Promise.race([reader.read(), stopped]);
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const blocks = buffer.split(/\r?\n\r?\n/u);
                buffer = blocks.pop() || "";
                for (const block of blocks) {
                    consumeBlock(block);
                    if (completed) break;
                }
                if (done) {
                    if (!completed && buffer.trim()) consumeBlock(buffer);
                    if (!completed) throw createStreamError("AI_INCOMPLETE");
                    break;
                }
            }
        } finally {
            signal?.removeEventListener("abort", abort);
            // Cancellation must not wait for a disconnected provider to acknowledge it.
            try { void reader.cancel().catch(() => {}); } catch { /* Already closed. */ }
            reader.releaseLock();
        }
    }

    global.OmniAiCore = Object.freeze({
        MAX_MESSAGE_CHARACTERS,
        MAX_CONTEXT_CHARACTERS,
        MAX_CONTEXT_MESSAGES,
        modes,
        responseLengths,
        suggestions,
        countCharacters,
        validateMessage,
        createId,
        createTitle,
        createChat,
        hasChatContent,
        trimContext,
        formatChatDate,
        getApiErrorMessage,
        createStreamError,
        consumeStream,
    });
})(typeof window === "undefined" ? globalThis : window);
