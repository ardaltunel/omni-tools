(function exposeTextCorrectorCore(global) {
    "use strict";

    const MAX_DIFF_CELLS = 60000;
    const TOKEN_PATTERN = /(\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_])/gu;

    const correctionTypes = Object.freeze([
        { value: "grammar", label: "Yazım ve Dilbilgisi" },
        { value: "fluent", label: "Daha Akıcı Yap" },
        { value: "professional", label: "Profesyonelleştir" },
        { value: "friendly", label: "Samimileştir" },
        { value: "shorten", label: "Kısalt" },
        { value: "clarify", label: "Daha Açık Hale Getir" },
        { value: "strengthen", label: "Güçlendir" },
    ]);

    const tones = Object.freeze([
        { value: "preserve", label: "Mevcut Tonu Koru" },
        { value: "professional", label: "Profesyonel" },
        { value: "friendly", label: "Samimi" },
        { value: "formal", label: "Resmî" },
        { value: "casual", label: "Günlük" },
        { value: "polite", label: "Kibar" },
        { value: "direct", label: "Net ve Doğrudan" },
        { value: "persuasive", label: "İkna Edici" },
        { value: "energetic", label: "Enerjik" },
    ]);

    const languages = Object.freeze([
        { value: "auto", label: "Otomatik Algıla" },
        { value: "tr", label: "Türkçe" },
        { value: "en", label: "English" },
        { value: "de", label: "Deutsch" },
        { value: "fr", label: "Français" },
        { value: "es", label: "Español" },
    ]);

    function countText(text) {
        const value = String(text || "");
        const words = value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
        return { characters: Array.from(value).length, words: words.length };
    }

    function validateInput(text, maximum = 10000) {
        const value = String(text || "");
        const stats = countText(value);
        if (!value.trim()) return { valid: false, message: "Metin alanı boş." };
        if (stats.characters > maximum) return { valid: false, message: `Metin ${maximum.toLocaleString("tr-TR")} karakter sınırını aşıyor.` };
        return { valid: true, message: "", text: value.trim(), stats };
    }

    function tokenize(text) {
        return String(text || "").match(TOKEN_PATTERN) || [];
    }

    function appendSegment(segments, type, value) {
        if (!value) return;
        const last = segments[segments.length - 1];
        if (last?.type === type) last.value += value;
        else segments.push({ type, value });
    }

    function buildCompactDiff(before, after) {
        const left = Array.from(before);
        const right = Array.from(after);
        let prefix = 0;
        while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
        let suffix = 0;
        while (suffix < left.length - prefix && suffix < right.length - prefix
            && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
        const segments = [];
        appendSegment(segments, "equal", left.slice(0, prefix).join(""));
        appendSegment(segments, "delete", left.slice(prefix, left.length - suffix).join(""));
        appendSegment(segments, "insert", right.slice(prefix, right.length - suffix).join(""));
        if (suffix) appendSegment(segments, "equal", left.slice(left.length - suffix).join(""));
        return segments;
    }

    function buildDiff(before, after) {
        const original = String(before || "");
        const corrected = String(after || "");
        if (original === corrected) return original ? [{ type: "equal", value: original }] : [];
        const left = tokenize(original);
        const right = tokenize(corrected);
        if (!left.length || !right.length || left.length * right.length > MAX_DIFF_CELLS) {
            return buildCompactDiff(original, corrected);
        }
        const columns = right.length + 1;
        const table = new Uint32Array((left.length + 1) * columns);
        for (let row = left.length - 1; row >= 0; row -= 1) {
            for (let column = right.length - 1; column >= 0; column -= 1) {
                const index = row * columns + column;
                table[index] = left[row] === right[column]
                    ? table[(row + 1) * columns + column + 1] + 1
                    : Math.max(table[(row + 1) * columns + column], table[row * columns + column + 1]);
            }
        }
        const segments = [];
        let row = 0;
        let column = 0;
        while (row < left.length && column < right.length) {
            if (left[row] === right[column]) {
                appendSegment(segments, "equal", left[row]);
                row += 1;
                column += 1;
            } else if (table[(row + 1) * columns + column] >= table[row * columns + column + 1]) {
                appendSegment(segments, "delete", left[row]);
                row += 1;
            } else {
                appendSegment(segments, "insert", right[column]);
                column += 1;
            }
        }
        while (row < left.length) appendSegment(segments, "delete", left[row++]);
        while (column < right.length) appendSegment(segments, "insert", right[column++]);
        return segments;
    }

    function getApiErrorMessage(status, code) {
        const messages = {
            EMPTY_TEXT: "Metin alanı boş.",
            TEXT_TOO_LONG: "Metin 10.000 karakter sınırını aşıyor.",
            RATE_LIMIT: "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.",
            OPENAI_RATE_LIMIT: "Yapay zekâ hizmeti şu anda yoğun. Biraz sonra tekrar deneyin.",
            OPENAI_TIMEOUT: "İstek zaman aşımına uğradı.",
            OPENAI_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            OPENAI_AUTH: "Sunucu yapılandırması geçersiz.",
            RATE_LIMIT_NOT_CONFIGURED: "Sunucu yapılandırması eksik.",
            ORIGIN_DENIED: "Bu adresin AI hizmetini kullanmasına izin verilmiyor.",
        };
        if (messages[code]) return messages[code];
        if (status === 429) return "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.";
        if (status === 504) return "İstek zaman aşımına uğradı.";
        if (status >= 500) return "AI hizmetine ulaşılamadı.";
        return "Beklenmeyen bir hata oluştu.";
    }

    global.TextCorrectorCore = Object.freeze({ correctionTypes, tones, languages, countText, validateInput, buildDiff, getApiErrorMessage });
})(window);
