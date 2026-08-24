(function initializePromptDeveloper() {
    "use strict";

    const panel = document.getElementById("prompt-developer");
    const core = window.PromptDeveloperCore;
    const config = window.PromptDeveloperConfig;
    if (!panel || !core || !config) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        input: byId("prompt-developer-input"),
        result: byId("prompt-developer-result"),
        resultEmpty: byId("prompt-developer-result-empty"),
        type: byId("prompt-developer-type"),
        detail: byId("prompt-developer-detail"),
        format: byId("prompt-developer-format"),
        inputCount: byId("prompt-developer-input-count"),
        resultCount: byId("prompt-developer-result-count"),
        generate: byId("prompt-developer-generate"),
        sample: byId("prompt-developer-sample"),
        clear: byId("prompt-developer-clear"),
        copy: byId("prompt-developer-copy"),
        repeat: byId("prompt-developer-repeat"),
        shorter: byId("prompt-developer-shorter"),
        detailed: byId("prompt-developer-detailed"),
        useResult: byId("prompt-developer-use-result"),
        loading: byId("prompt-developer-loading"),
        status: byId("prompt-developer-status"),
        resultActions: byId("prompt-developer-result-actions"),
        summary: byId("prompt-developer-summary"),
        improvements: byId("prompt-developer-improvements"),
    };

    let activeController = null;
    let requestSerial = 0;
    let statusTimer = null;
    let lastExampleIndex = -1;

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
        elements.status.className = `prompt-developer-status${type ? ` is-${type}` : ""}`;
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
        elements.type.disabled = loading;
        elements.detail.disabled = loading;
        elements.format.disabled = loading;
        panel.querySelectorAll("[data-prompt-developer-action]").forEach((button) => { button.disabled = loading; });
    }

    function setResultVisibility(hasResult) {
        elements.result.hidden = !hasResult;
        elements.resultEmpty.hidden = hasResult;
        elements.resultActions.hidden = !hasResult;
        elements.summary.hidden = !hasResult;
    }

    function renderImprovements(items) {
        const improvements = Array.isArray(items) && items.length ? items : ["Prompt daha açık ve uygulanabilir hale getirildi."];
        const fragment = document.createDocumentFragment();
        improvements.forEach((value) => {
            const item = document.createElement("li");
            const icon = document.createElement("span");
            const text = document.createElement("span");
            icon.textContent = "✓";
            icon.setAttribute("aria-hidden", "true");
            text.textContent = value;
            item.append(icon, text);
            fragment.append(item);
        });
        elements.improvements.replaceChildren(fragment);
    }

    async function parseResponse(response) {
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok) {
            const error = new Error(core.getApiErrorMessage(response.status, payload?.code));
            error.isPublic = true;
            throw error;
        }
        if (!payload || typeof payload.improvedPrompt !== "string" || !payload.improvedPrompt.trim()) {
            const error = new Error("Geçersiz yanıt alındı.");
            error.isPublic = true;
            throw error;
        }
        return payload;
    }

    async function improvePrompt(options = {}) {
        if (activeController) return;
        const source = String(options.prompt ?? elements.input.value);
        const validation = core.validateInput(source, config.maxCharacters);
        if (!validation.valid) {
            setStatus(validation.message, "error");
            elements.input.focus();
            return;
        }
        if (!config.endpoint || !/^https:\/\//u.test(config.endpoint)) {
            setStatus("Yapay zekâ hizmet adresi yapılandırılmamış.", "error");
            return;
        }
        const requestId = ++requestSerial;
        const controller = new AbortController();
        activeController = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), config.requestTimeoutMs);
        setLoading(true);
        elements.status.hidden = true;
        try {
            const response = await fetch(config.endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    prompt: validation.prompt,
                    promptType: options.promptType || elements.type.value,
                    detailLevel: options.detailLevel || elements.detail.value,
                    outputFormat: options.outputFormat || elements.format.value,
                    refinement: options.refinement || "none",
                }),
                signal: controller.signal,
                cache: "no-store",
                credentials: "omit",
                referrerPolicy: "no-referrer",
            });
            const payload = await parseResponse(response);
            if (requestId !== requestSerial) return;
            elements.result.value = payload.improvedPrompt.trim();
            updateCount(elements.result, elements.resultCount);
            renderImprovements(payload.improvements);
            setResultVisibility(true);
            setStatus("Prompt başarıyla geliştirildi.", "success");
        } catch (error) {
            if (requestId !== requestSerial) return;
            setStatus(error?.name === "AbortError" ? "İstek zaman aşımına uğradı." : (error?.isPublic ? error.message : "Yapay zekâ hizmetine ulaşılamadı."), "error");
        } finally {
            window.clearTimeout(timeoutId);
            if (requestId === requestSerial) {
                activeController = null;
                setLoading(false);
            }
        }
    }

    async function copyResult() {
        if (!elements.result.value) return;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(elements.result.value);
            else {
                elements.result.focus();
                elements.result.select();
                document.execCommand("copy");
                window.getSelection()?.removeAllRanges();
            }
            setStatus("Geliştirilmiş prompt kopyalandı.", "success");
        } catch { setStatus("Prompt kopyalanamadı.", "error"); }
    }

    function clearAll() {
        const controller = activeController;
        requestSerial += 1;
        activeController = null;
        controller?.abort();
        elements.input.value = "";
        elements.result.value = "";
        elements.improvements.replaceChildren();
        updateCount(elements.input, elements.inputCount);
        updateCount(elements.result, elements.resultCount);
        setResultVisibility(false);
        setLoading(false);
        setStatus("");
        elements.input.focus();
    }

    function loadRandomExample() {
        const examples = Object.values(core.examples);
        if (!examples.length) return;
        const randomValue = new Uint32Array(1);
        window.crypto.getRandomValues(randomValue);
        let index = randomValue[0] % examples.length;
        if (examples.length > 1 && index === lastExampleIndex) index = (index + 1) % examples.length;
        lastExampleIndex = index;
        const example = examples[index];
        elements.input.value = example.text;
        elements.type.value = example.type;
        updateCount(elements.input, elements.inputCount);
        elements.input.focus();
    }

    populateSelect(elements.type, core.promptTypes, "general");
    populateSelect(elements.detail, core.detailLevels, "balanced");
    populateSelect(elements.format, core.outputFormats, "auto");
    updateCount(elements.input, elements.inputCount);
    updateCount(elements.result, elements.resultCount);
    setResultVisibility(false);

    elements.input.addEventListener("input", () => updateCount(elements.input, elements.inputCount));
    elements.result.addEventListener("input", () => updateCount(elements.result, elements.resultCount));
    elements.generate.addEventListener("click", () => improvePrompt());
    elements.sample.addEventListener("click", loadRandomExample);
    elements.clear.addEventListener("click", clearAll);
    elements.copy.addEventListener("click", copyResult);
    elements.repeat.addEventListener("click", () => improvePrompt({ prompt: elements.result.value }));
    elements.shorter.addEventListener("click", () => improvePrompt({ prompt: elements.result.value, refinement: "shorter" }));
    elements.detailed.addEventListener("click", () => improvePrompt({ prompt: elements.result.value, refinement: "more-detailed" }));
    elements.useResult.addEventListener("click", () => {
        elements.input.value = elements.result.value;
        updateCount(elements.input, elements.inputCount);
        elements.input.focus();
        setStatus("Sonuç yeni girdi olarak kullanılıyor.", "success");
    });
    elements.input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
        event.preventDefault();
        improvePrompt();
    });
    window.addEventListener("pagehide", () => {
        requestSerial += 1;
        activeController?.abort();
        activeController = null;
    }, { once: true });
})();
