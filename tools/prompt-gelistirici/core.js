(function exposePromptDeveloperCore(global) {
    "use strict";

    const promptTypes = Object.freeze([
        { value: "general", label: "Genel" },
        { value: "coding", label: "Kodlama" },
        { value: "codex", label: "Codex" },
        { value: "writing", label: "Metin Yazma" },
        { value: "research", label: "Araştırma" },
        { value: "data-analysis", label: "Veri Analizi" },
        { value: "image-generation", label: "Görsel Oluşturma" },
        { value: "social-media", label: "Sosyal Medya" },
        { value: "seo", label: "SEO" },
        { value: "education", label: "Eğitim" },
        { value: "business", label: "İş / Profesyonel" },
        { value: "career", label: "CV / Kariyer" },
        { value: "marketing", label: "Pazarlama" },
        { value: "brainstorming", label: "Beyin Fırtınası" },
    ]);

    const detailLevels = Object.freeze([
        { value: "short", label: "Kısa" },
        { value: "balanced", label: "Dengeli" },
        { value: "detailed", label: "Detaylı" },
        { value: "very-detailed", label: "Çok Detaylı" },
    ]);

    const outputFormats = Object.freeze([
        { value: "auto", label: "Otomatik" },
        { value: "plain", label: "Düz Metin" },
        { value: "bullets", label: "Madde Madde" },
        { value: "sections", label: "Bölümlere Ayrılmış" },
        { value: "json", label: "JSON Prompt" },
        { value: "codex-task", label: "Codex Görev Tanımı" },
    ]);

    const examples = Object.freeze({
        coding: { label: "Kodlama", type: "coding", text: "React ile yapılacak bir görev takip uygulaması için prompt oluştur." },
        image: { label: "Görsel", type: "image-generation", text: "Lüks bir villa için sosyal medya görseli oluştur." },
        research: { label: "Araştırma", type: "research", text: "Türkiye'de elektrikli araç pazarını araştır." },
        writing: { label: "Metin", type: "writing", text: "Profesyonel bir müşteri maili yaz." },
        codex: { label: "Codex", type: "codex", text: "Omni Tools uygulamama yeni bir ekran kaydedici ekle." },
    });

    function countText(text) {
        const value = String(text || "");
        const words = value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
        return { characters: Array.from(value).length, words: words.length };
    }

    function validateInput(text, maximum = 5000) {
        const value = String(text || "");
        const stats = countText(value);
        if (!value.trim()) return { valid: false, message: "Prompt alanı boş." };
        if (stats.characters > maximum) return { valid: false, message: `Prompt ${maximum.toLocaleString("tr-TR")} karakter sınırını aşıyor.` };
        return { valid: true, message: "", prompt: value.trim(), stats };
    }

    function getApiErrorMessage(status, code) {
        const messages = {
            EMPTY_PROMPT: "Prompt alanı boş.",
            PROMPT_TOO_LONG: "Prompt 5.000 karakter sınırını aşıyor.",
            RATE_LIMIT: "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.",
            OPENAI_RATE_LIMIT: "Yapay zekâ hizmeti şu anda yoğun. Biraz sonra tekrar deneyin.",
            OPENAI_TIMEOUT: "İstek zaman aşımına uğradı.",
            OPENAI_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            OPENAI_AUTH: "Sunucu yapılandırması geçersiz.",
            RATE_LIMIT_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            INVALID_AI_OUTPUT: "Geçersiz yanıt alındı.",
            ORIGIN_DENIED: "Bu adresin yapay zekâ hizmetini kullanmasına izin verilmiyor.",
        };
        if (messages[code]) return messages[code];
        if (status === 429) return "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.";
        if (status === 504) return "İstek zaman aşımına uğradı.";
        if (status >= 500) return "Yapay zekâ hizmetine ulaşılamadı.";
        return "Beklenmeyen bir hata oluştu.";
    }

    global.PromptDeveloperCore = Object.freeze({ promptTypes, detailLevels, outputFormats, examples, countText, validateInput, getApiErrorMessage });
})(window);
