(function initUrlCleaner(root) {
    "use strict";

    const panel = document.getElementById("url-cleaner");
    if (!panel) return;

    const elements = {};
    [
        "url-cleaner-form", "url-cleaner-input", "url-cleaner-clear", "url-cleaner-result-state",
        "url-cleaner-empty", "url-cleaner-error", "url-cleaner-error-message", "url-cleaner-result", "url-cleaner-summary", "url-cleaner-result-value",
        "url-cleaner-copy", "url-cleaner-params-section", "url-cleaner-params",
        "url-cleaner-params-description", "url-cleaner-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const TRACKING_PARAMETERS = new Set([
        "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "_ga", "_gl",
        "yclid", "rb_clickid", "s_cid", "vero_conv", "wickedid",
    ]);
    const state = { parameters: [], cleanedUrl: "" };

    bindEvents();

    function bindEvents() {
        elements["url-cleaner-input"].addEventListener("input", cleanCurrentUrl);
        elements["url-cleaner-form"].addEventListener("submit", (event) => {
            event.preventDefault();
            cleanCurrentUrl();
        });
        elements["url-cleaner-clear"].addEventListener("click", clearInput);
        elements["url-cleaner-copy"].addEventListener("click", copyCleanedUrl);
    }

    function cleanCurrentUrl() {
        const rawValue = elements["url-cleaner-input"].value.trim();
        elements["url-cleaner-clear"].disabled = !rawValue;

        if (!rawValue) {
            state.parameters = [];
            state.cleanedUrl = "";
            showIdle();
            return;
        }

        try {
            const url = parseHttpUrl(rawValue);
            const parameters = Array.from(url.searchParams.entries()).map(([name, value]) => ({
                name,
                value,
                removed: isTrackingParameter(name),
            }));
            parameters.filter((parameter) => parameter.removed).forEach((parameter) => {
                url.searchParams.delete(parameter.name);
            });

            state.parameters = parameters;
            state.cleanedUrl = url.href;
            showResult(parameters.filter((parameter) => parameter.removed).length);
            renderParameters();
        } catch {
            state.parameters = [];
            state.cleanedUrl = "";
            showError("Geçerli bir HTTP veya HTTPS URL’si girin. Örnek: https://ornek.com/?utm_source=mail");
            renderParameters();
        }
    }

    function parseHttpUrl(value) {
        const normalizedValue = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
        const url = new URL(normalizedValue);
        if (!url.hostname || !["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol");
        return url;
    }

    function isTrackingParameter(name) {
        const normalizedName = name.toLowerCase();
        return normalizedName.startsWith("utm_") || TRACKING_PARAMETERS.has(normalizedName);
    }

    function showIdle() {
        elements["url-cleaner-result"].hidden = true;
        elements["url-cleaner-error"].hidden = true;
        elements["url-cleaner-empty"].hidden = false;
        elements["url-cleaner-params-section"].hidden = true;
        setResultState("Hazır");
    }

    function showResult(removedCount) {
        const text = removedCount
            ? `${removedCount} takip parametresi kaldırıldı.`
            : "Kaldırılacak takip parametresi bulunamadı.";
        elements["url-cleaner-summary"].textContent = text;
        elements["url-cleaner-result-value"].textContent = state.cleanedUrl;
        elements["url-cleaner-result"].hidden = false;
        elements["url-cleaner-error"].hidden = true;
        elements["url-cleaner-empty"].hidden = true;
        setResultState(removedCount ? "Temizlendi" : "Hazır", removedCount ? "success" : "");
        announce(text);
    }

    function showError(message) {
        elements["url-cleaner-result"].hidden = true;
        elements["url-cleaner-empty"].hidden = true;
        elements["url-cleaner-error-message"].textContent = message;
        elements["url-cleaner-error"].hidden = false;
        setResultState("Geçersiz", "error");
        announce(message);
    }

    function setResultState(message, type = "") {
        const resultState = elements["url-cleaner-result-state"];
        resultState.textContent = message;
        resultState.classList.toggle("is-success", type === "success");
        resultState.classList.toggle("is-error", type === "error");
    }

    function renderParameters() {
        const canShowParameters = Boolean(state.cleanedUrl);
        elements["url-cleaner-params-section"].hidden = !canShowParameters;
        if (!canShowParameters) return;

        const list = elements["url-cleaner-params"];
        list.replaceChildren();
        if (!state.parameters.length) {
            elements["url-cleaner-params-description"].textContent = "Bu URL’de query parametresi bulunmuyor.";
            list.append(createElement("li", "url-cleaner-params-empty", "Query parametresi yok."));
            return;
        }

        const removedCount = state.parameters.filter((parameter) => parameter.removed).length;
        elements["url-cleaner-params-description"].textContent = removedCount
            ? `${removedCount} parametre kaldırıldı, ${state.parameters.length - removedCount} parametre korundu.`
            : "Tüm parametreler temiz URL’de korundu.";
        state.parameters.forEach((parameter) => list.append(createParameterItem(parameter)));
    }

    function createParameterItem(parameter) {
        const item = createElement("li", `url-cleaner-param is-${parameter.removed ? "removed" : "kept"}`);
        const copy = createElement("div", "url-cleaner-param-copy");
        copy.append(
            createElement("span", "url-cleaner-param-name", parameter.name),
            createElement("span", "url-cleaner-param-value", parameter.value || "Boş değer"),
        );
        item.append(copy, createElement("span", "url-cleaner-param-state", parameter.removed ? "Kaldırıldı" : "Korundu"));
        return item;
    }

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function clearInput() {
        elements["url-cleaner-input"].value = "";
        elements["url-cleaner-input"].focus();
        cleanCurrentUrl();
        announce("URL alanı temizlendi.");
    }

    async function copyCleanedUrl() {
        if (!state.cleanedUrl) return;
        try {
            await writeToClipboard(state.cleanedUrl);
            elements["url-cleaner-copy"].textContent = "Kopyalandı";
            announce("Temizlenmiş URL panoya kopyalandı.");
            root.setTimeout(() => {
                if (state.cleanedUrl) elements["url-cleaner-copy"].textContent = "URL’yi Kopyala";
            }, 1800);
        } catch {
            announce("URL panoya kopyalanamadı. Lütfen metni seçip manuel olarak kopyalayın.");
        }
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
        elements["url-cleaner-live"].textContent = message;
    }
}(window));
