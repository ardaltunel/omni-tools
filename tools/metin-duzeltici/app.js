(function initializeTextCorrector() {
    "use strict";

    const panel = document.getElementById("text-corrector");
    const core = window.TextCorrectorCore;
    const config = window.TextCorrectorConfig;
    if (!panel || !core || !config) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        input: byId("text-corrector-input"),
        result: byId("text-corrector-result"),
        resultEmpty: byId("text-corrector-result-empty"),
        correctionType: byId("text-corrector-type"),
        tone: byId("text-corrector-tone"),
        language: byId("text-corrector-language"),
        inputCount: byId("text-corrector-input-count"),
        resultCount: byId("text-corrector-result-count"),
        generate: byId("text-corrector-generate"),
        sample: byId("text-corrector-sample"),
        clear: byId("text-corrector-clear"),
        copy: byId("text-corrector-copy"),
        repeat: byId("text-corrector-repeat"),
        useResult: byId("text-corrector-use-result"),
        loading: byId("text-corrector-loading"),
        status: byId("text-corrector-status"),
        resultActions: byId("text-corrector-result-actions"),
        quickWrap: byId("text-corrector-quick-wrap"),
        quickActions: byId("text-corrector-quick-actions"),
        changesCard: byId("text-corrector-changes-card"),
        changes: byId("text-corrector-changes"),
        diffLabel: byId("text-corrector-diff-label"),
        diffToggle: byId("text-corrector-diff-toggle"),
        diff: byId("text-corrector-diff"),
    };

    let activeController = null;
    let lastOriginal = "";
    let requestSerial = 0;
    let statusTimer = null;

    function populateSelect(select, options, selected) {
        const fragment = document.createDocumentFragment();
        options.forEach(({ value, label }) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            option.selected = value === selected;
            fragment.append(option);
        });
        select.replaceChildren(fragment);
    }

    function updateCount(textarea, target) {
        const stats = core.countText(textarea.value);
        target.textContent = `${stats.characters.toLocaleString("tr-TR")} karakter · ${stats.words.toLocaleString("tr-TR")} kelime`;
        return stats;
    }

    function setStatus(message, type = "") {
        if (statusTimer) window.clearTimeout(statusTimer);
        elements.status.textContent = message;
        elements.status.className = `text-corrector-status${type ? ` is-${type}` : ""}`;
        elements.status.hidden = !message;
        statusTimer = message ? window.setTimeout(() => {
            elements.status.hidden = true;
            elements.status.textContent = "";
            statusTimer = null;
        }, type === "error" ? 5000 : 3000) : null;
    }

    function setLoading(loading) {
        elements.loading.hidden = !loading;
        elements.generate.disabled = loading;
        elements.generate.setAttribute("aria-busy", String(loading));
        elements.correctionType.disabled = loading;
        elements.tone.disabled = loading;
        elements.language.disabled = loading;
    }

    function setResultVisibility(hasResult) {
        elements.result.hidden = !hasResult;
        elements.resultEmpty.hidden = hasResult;
        elements.resultActions.hidden = !hasResult;
        elements.quickWrap.hidden = !hasResult;
        elements.quickActions.hidden = !hasResult;
        elements.changesCard.hidden = !hasResult;
        if (!hasResult) {
            elements.diff.hidden = true;
            elements.diffLabel.hidden = true;
            elements.diffToggle.setAttribute("aria-expanded", "false");
            elements.diffToggle.textContent = "Değişiklikleri Göster";
        }
    }

    function renderChanges(changes) {
        const items = Array.isArray(changes) && changes.length ? changes : ["Metin seçilen ayarlara göre düzenlendi."];
        const fragment = document.createDocumentFragment();
        items.forEach((change) => {
            const item = document.createElement("li");
            const icon = document.createElement("span");
            const text = document.createElement("span");
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "✓";
            text.textContent = change;
            item.append(icon, text);
            fragment.append(item);
        });
        elements.changes.replaceChildren(fragment);
    }

    function renderDiff() {
        const originalBlock = document.createElement("section");
        const correctedBlock = document.createElement("section");
        const originalLabel = document.createElement("strong");
        const correctedLabel = document.createElement("strong");
        const originalText = document.createElement("p");
        const correctedText = document.createElement("p");

        originalBlock.className = "text-corrector-diff-block is-original";
        correctedBlock.className = "text-corrector-diff-block is-corrected";
        originalLabel.textContent = "Orijinal";
        correctedLabel.textContent = "Düzeltilmiş";

        core.buildDiff(lastOriginal, elements.result.value).forEach((segment) => {
            if (segment.type !== "insert") {
                const node = segment.type === "delete" ? document.createElement("del") : document.createTextNode(segment.value);
                if (segment.type === "delete") {
                    node.setAttribute("aria-label", "Değiştirilen veya silinen metin");
                    node.textContent = segment.value;
                }
                originalText.append(node);
            }
            if (segment.type !== "delete") {
                const node = segment.type === "insert" ? document.createElement("ins") : document.createTextNode(segment.value);
                if (segment.type === "insert") {
                    node.setAttribute("aria-label", "Eklenen veya düzeltilen metin");
                    node.textContent = segment.value;
                }
                correctedText.append(node);
            }
        });

        originalBlock.append(originalLabel, originalText);
        correctedBlock.append(correctedLabel, correctedText);
        elements.diff.replaceChildren(originalBlock, correctedBlock);
    }

    async function parseResponse(response) {
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok) {
            const error = new Error(core.getApiErrorMessage(response.status, payload?.code));
            error.isPublic = true;
            throw error;
        }
        if (!payload || typeof payload.correctedText !== "string" || !payload.correctedText.trim()) {
            const error = new Error("Yapay zekâ geçerli bir sonuç döndürmedi.");
            error.isPublic = true;
            throw error;
        }
        return payload;
    }

    async function correctText(options = {}) {
        if (activeController) return;
        const source = String(options.text ?? elements.input.value);
        const validation = core.validateInput(source, config.maxCharacters);
        if (!validation.valid) {
            setStatus(validation.message, "error");
            elements.input.focus();
            return;
        }
        if (!config.endpoint || !/^https:\/\//u.test(config.endpoint)) {
            setStatus("AI hizmet adresi yapılandırılmamış.", "error");
            return;
        }
        const requestId = ++requestSerial;
        const controller = new AbortController();
        activeController = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), config.requestTimeoutMs);
        setLoading(true);
        elements.status.hidden = true;
        try {
            const correctionType = options.correctionType || elements.correctionType.value;
            const tone = options.tone || elements.tone.value;
            const response = await fetch(config.endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text: validation.text, correctionType, tone, language: elements.language.value }),
                signal: controller.signal,
                cache: "no-store",
                credentials: "omit",
                referrerPolicy: "no-referrer",
            });
            const payload = await parseResponse(response);
            if (requestId !== requestSerial) return;
            lastOriginal = validation.text;
            elements.result.value = payload.correctedText.trim();
            updateCount(elements.result, elements.resultCount);
            renderChanges(payload.changes);
            setResultVisibility(true);
            renderDiff();
            setStatus("Metin başarıyla düzeltildi.", "success");
        } catch (error) {
            if (requestId !== requestSerial) return;
            const message = error?.name === "AbortError"
                ? "İstek zaman aşımına uğradı."
                : (error?.isPublic ? error.message : "AI hizmetine ulaşılamadı.");
            setStatus(message, "error");
        } finally {
            window.clearTimeout(timeoutId);
            if (requestId === requestSerial) {
                activeController = null;
                setLoading(false);
            }
        }
    }

    async function copyResult() {
        const value = elements.result.value;
        if (!value) return;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
            else {
                elements.result.focus();
                elements.result.select();
                document.execCommand("copy");
                window.getSelection()?.removeAllRanges();
            }
            setStatus("Düzeltilmiş metin kopyalandı.", "success");
        } catch {
            setStatus("Metin kopyalanamadı.", "error");
        }
    }

    function clearAll() {
        const controller = activeController;
        requestSerial += 1;
        activeController = null;
        controller?.abort();
        elements.input.value = "";
        elements.result.value = "";
        lastOriginal = "";
        elements.changes.replaceChildren();
        elements.diff.replaceChildren();
        updateCount(elements.input, elements.inputCount);
        updateCount(elements.result, elements.resultCount);
        setResultVisibility(false);
        setLoading(false);
        setStatus("");
        elements.input.focus();
    }

    populateSelect(elements.correctionType, core.correctionTypes, "grammar");
    populateSelect(elements.tone, core.tones, "preserve");
    populateSelect(elements.language, core.languages, "tr");
    updateCount(elements.input, elements.inputCount);
    updateCount(elements.result, elements.resultCount);
    setResultVisibility(false);

    elements.input.addEventListener("input", () => updateCount(elements.input, elements.inputCount));
    elements.result.addEventListener("input", () => {
        updateCount(elements.result, elements.resultCount);
        if (!elements.diff.hidden) renderDiff();
    });
    elements.generate.addEventListener("click", () => correctText());
    elements.sample.addEventListener("click", () => {
        elements.input.value = "bugun toplantıya gittim ama müşteri ile bazı şeylerde anlaşamadık yarın tekrardan konuşucaz";
        updateCount(elements.input, elements.inputCount);
        elements.input.focus();
    });
    elements.clear.addEventListener("click", clearAll);
    elements.copy.addEventListener("click", copyResult);
    elements.repeat.addEventListener("click", () => correctText({ text: elements.result.value }));
    elements.useResult.addEventListener("click", () => {
        elements.input.value = elements.result.value;
        updateCount(elements.input, elements.inputCount);
        elements.input.focus();
        setStatus("Sonuç yeni girdi olarak kullanılıyor.", "success");
    });
    elements.diffToggle.addEventListener("click", () => {
        const willOpen = elements.diff.hidden;
        elements.diff.hidden = !willOpen;
        elements.diffLabel.hidden = !willOpen;
        elements.diffToggle.setAttribute("aria-expanded", String(willOpen));
        elements.diffToggle.textContent = willOpen ? "Değişiklikleri Gizle" : "Değişiklikleri Göster";
        if (willOpen) renderDiff();
    });
    panel.querySelectorAll("[data-text-corrector-quick]").forEach((button) => {
        button.addEventListener("click", () => correctText({
            text: elements.result.value,
            correctionType: button.dataset.correctionType || elements.correctionType.value,
            tone: button.dataset.tone || elements.tone.value,
        }));
    });
    elements.input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
        event.preventDefault();
        correctText();
    });
    window.addEventListener("pagehide", () => {
        requestSerial += 1;
        activeController?.abort();
        activeController = null;
    }, { once: true });
})();
