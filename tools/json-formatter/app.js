(function initJsonFormatter(root) {
    "use strict";

    const panel = document.getElementById("json-formatter");
    if (!panel) return;

    const elements = {};
    [
        "json-formatter-form", "json-formatter-input", "json-formatter-input-state",
        "json-formatter-beautify", "json-formatter-minify", "json-formatter-clear",
        "json-formatter-result-state", "json-formatter-empty", "json-formatter-error",
        "json-formatter-error-message", "json-formatter-error-location", "json-formatter-result",
        "json-formatter-output-summary", "json-formatter-output-code", "json-formatter-copy",
        "json-formatter-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const JSON_TOKEN_PATTERN = /"(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\])*"(?=\s*:)|"(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\])*"|\b(?:true|false|null)\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g;
    const state = { output: "", copyTimer: null };

    bindEvents();

    function bindEvents() {
        elements["json-formatter-form"].addEventListener("submit", (event) => {
            event.preventDefault();
            processJson("beautify");
        });
        elements["json-formatter-minify"].addEventListener("click", () => processJson("minify"));
        elements["json-formatter-clear"].addEventListener("click", clearInput);
        elements["json-formatter-copy"].addEventListener("click", copyOutput);
        elements["json-formatter-input"].addEventListener("input", resetResultAfterInput);
    }

    function processJson(mode) {
        const source = elements["json-formatter-input"].value;
        if (!source.trim()) {
            showError("İşlem yapabilmek için bir JSON metni yapıştırın.");
            return;
        }
        elements["json-formatter-clear"].disabled = false;

        try {
            const parsed = JSON.parse(source);
            state.output = mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
            renderHighlightedJson(state.output);
            showResult(mode);
        } catch (error) {
            state.output = "";
            showError("JSON sözdizimi geçersiz. Virgülleri, tırnak işaretlerini ve parantezleri kontrol edin.", getErrorLocation(source, error));
        }
    }

    function resetResultAfterInput() {
        const hasValue = Boolean(elements["json-formatter-input"].value.trim());
        elements["json-formatter-clear"].disabled = !hasValue;
        if (!hasValue) {
            state.output = "";
            showIdle();
            return;
        }

        state.output = "";
        resetCopyButton();
        elements["json-formatter-result"].hidden = true;
        elements["json-formatter-error"].hidden = true;
        elements["json-formatter-empty"].hidden = false;
        setInputState("İşleme hazır");
        setResultState("Hazır");
    }

    function showIdle() {
        elements["json-formatter-result"].hidden = true;
        elements["json-formatter-error"].hidden = true;
        elements["json-formatter-empty"].hidden = false;
        elements["json-formatter-output-code"].replaceChildren();
        resetCopyButton();
        setInputState("Düzenlemeye hazır");
        setResultState("Hazır");
    }

    function showResult(mode) {
        const summary = mode === "minify" ? "JSON tek satıra sıkıştırıldı." : "JSON okunabilir biçimde formatlandı.";
        elements["json-formatter-output-summary"].textContent = summary;
        resetCopyButton();
        elements["json-formatter-result"].hidden = false;
        elements["json-formatter-error"].hidden = true;
        elements["json-formatter-empty"].hidden = true;
        setInputState("Geçerli JSON", "success");
        setResultState(mode === "minify" ? "Sıkıştırıldı" : "Formatlandı", "success");
        announce(summary);
    }

    function showError(message, location = null) {
        resetCopyButton();
        elements["json-formatter-result"].hidden = true;
        elements["json-formatter-empty"].hidden = true;
        elements["json-formatter-error-message"].textContent = message;
        elements["json-formatter-error-location"].hidden = !location;
        elements["json-formatter-error-location"].textContent = location || "";
        elements["json-formatter-error"].hidden = false;
        setInputState("Geçersiz JSON", "error");
        setResultState("Geçersiz", "error");
        announce(location ? `${message} ${location}` : message);
    }

    function setInputState(message, type = "") {
        setState(elements["json-formatter-input-state"], message, type);
    }

    function setResultState(message, type = "") {
        setState(elements["json-formatter-result-state"], message, type);
    }

    function setState(element, message, type) {
        element.textContent = message;
        element.classList.toggle("is-success", type === "success");
        element.classList.toggle("is-error", type === "error");
    }

    function getErrorLocation(source, error) {
        const message = String(error?.message || "");
        const positionMatch = message.match(/position\s+(\d+)/i);
        if (positionMatch) {
            const position = Math.min(Number(positionMatch[1]), source.length);
            const prefix = source.slice(0, position);
            const line = prefix.split(/\r\n|\r|\n/).length;
            const lastLineBreak = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
            return `Hata konumu: satır ${line}, sütun ${position - lastLineBreak}`;
        }

        const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
        if (lineColumnMatch) return `Hata konumu: satır ${lineColumnMatch[1]}, sütun ${lineColumnMatch[2]}`;
        return null;
    }

    function renderHighlightedJson(json) {
        const code = elements["json-formatter-output-code"];
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        JSON_TOKEN_PATTERN.lastIndex = 0;

        let match;
        while ((match = JSON_TOKEN_PATTERN.exec(json))) {
            if (match.index > lastIndex) fragment.append(document.createTextNode(json.slice(lastIndex, match.index)));
            const token = document.createElement("span");
            const isProperty = match[0].startsWith('"') && /^\s*:/.test(json.slice(JSON_TOKEN_PATTERN.lastIndex));
            token.className = getTokenClass(match[0], isProperty);
            token.textContent = match[0];
            fragment.append(token);
            lastIndex = JSON_TOKEN_PATTERN.lastIndex;
        }
        if (lastIndex < json.length) fragment.append(document.createTextNode(json.slice(lastIndex)));
        code.replaceChildren(fragment);
    }

    function getTokenClass(token, isProperty) {
        if (/^[{}\[\],:]$/.test(token)) return "json-token-punctuation";
        if (token.startsWith('"')) return isProperty ? "json-token-property" : "json-token-string";
        if (/^(true|false|null)$/.test(token)) return "json-token-literal";
        return "json-token-number";
    }

    function clearInput() {
        elements["json-formatter-input"].value = "";
        elements["json-formatter-input"].focus();
        elements["json-formatter-clear"].disabled = true;
        state.output = "";
        showIdle();
        announce("JSON alanı temizlendi.");
    }

    async function copyOutput() {
        if (!state.output) return;
        try {
            await writeToClipboard(state.output);
            elements["json-formatter-copy"].textContent = "Kopyalandı";
            announce("JSON çıktısı panoya kopyalandı.");
            if (state.copyTimer) root.clearTimeout(state.copyTimer);
            state.copyTimer = root.setTimeout(() => {
                elements["json-formatter-copy"].textContent = "Çıktıyı Kopyala";
                state.copyTimer = null;
            }, 1800);
        } catch {
            announce("JSON çıktısı panoya kopyalanamadı. Lütfen metni seçip manuel olarak kopyalayın.");
        }
    }

    function resetCopyButton() {
        if (state.copyTimer) root.clearTimeout(state.copyTimer);
        state.copyTimer = null;
        elements["json-formatter-copy"].textContent = "Çıktıyı Kopyala";
    }

    async function writeToClipboard(value) {
        if (navigator.clipboard?.writeText && root.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy failed");
    }

    function announce(message) {
        elements["json-formatter-live"].textContent = message;
    }
}(window));
