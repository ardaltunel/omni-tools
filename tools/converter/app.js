(function initConverterApp(root) {
    "use strict";

    const namespace = root.OmniConverter;
    const panel = document.getElementById("converter");
    if (!namespace?.ConversionEngine || !panel) return;

    const elements = {};
    const ids = [
        "converter-category-tabs", "converter-category-title", "converter-category-description", "converter-capability",
        "converter-capability-title", "converter-capability-text", "converter-drop-zone", "converter-file-input",
        "converter-folder-input", "converter-browse-button", "converter-folder-button", "converter-supported-formats",
        "converter-upload-status", "converter-settings", "converter-output-note", "converter-convert-all",
        "converter-download-all", "converter-download-zip", "converter-cancel-all", "converter-clear-list",
        "converter-progress-bar", "converter-progress-text", "converter-file-count", "converter-file-list",
        "converter-preview-section", "converter-preview-name", "converter-preview-grid", "converter-fit-mode",
        "converter-preview-zoom", "converter-preview-zoom-value", "converter-preview-fullscreen",
        "converter-preview-before", "converter-preview-after", "converter-image-preview-controls", "converter-live",
    ];
    ids.forEach((id) => { elements[id] = document.getElementById(id); });

    let state = null;
    let dragDepth = 0;
    let previewView = "side";
    let renderedSettingsKey = "";
    const engine = new namespace.ConversionEngine({
        liveElement: elements["converter-live"],
        onProgress: renderProgress,
    });

    bindEvents();
    renderCategoryTabs();
    engine.subscribe((nextState) => {
        state = nextState;
        render();
    });

    function bindEvents() {
        const dropZone = elements["converter-drop-zone"];
        elements["converter-browse-button"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["converter-file-input"].click();
        });
        elements["converter-folder-button"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["converter-folder-input"].click();
        });
        elements["converter-file-input"].addEventListener("change", (event) => consumeInput(event.target));
        elements["converter-folder-input"].addEventListener("change", (event) => consumeInput(event.target));
        dropZone.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            elements["converter-file-input"].click();
        });
        dropZone.addEventListener("dragenter", handleDragEnter);
        dropZone.addEventListener("dragover", handleDragOver);
        dropZone.addEventListener("dragleave", handleDragLeave);
        dropZone.addEventListener("drop", handleDrop);
        document.addEventListener("paste", handlePaste);
        document.addEventListener("tool-activated", handleToolActivated);

        elements["converter-convert-all"].addEventListener("click", () => engine.convertAll());
        elements["converter-download-all"].addEventListener("click", () => engine.downloadAll());
        elements["converter-download-zip"].addEventListener("click", () => engine.downloadZip());
        elements["converter-cancel-all"].addEventListener("click", () => engine.cancelAll());
        elements["converter-clear-list"].addEventListener("click", () => engine.clear());
        elements["converter-fit-mode"].addEventListener("change", renderPreviewPresentation);
        elements["converter-preview-zoom"].addEventListener("input", renderPreviewPresentation);
        elements["converter-preview-fullscreen"].addEventListener("click", toggleFullscreen);
        panel.querySelectorAll("[data-converter-view]").forEach((button) => {
            button.addEventListener("click", () => setPreviewView(button.dataset.converterView));
        });
        window.addEventListener("beforeunload", () => engine.releaseAll());

        if (!("webkitdirectory" in elements["converter-folder-input"])) {
            elements["converter-folder-button"].hidden = true;
        }
    }

    function renderCategoryTabs() {
        const fragment = document.createDocumentFragment();
        namespace.Registry.list().forEach((category) => {
            const button = createElement("button", "converter-category-tab");
            button.type = "button";
            button.dataset.categoryId = category.id;
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", `${category.label} dönüştürücü`);
            const icon = createElement("span", "converter-category-icon", category.icon);
            icon.setAttribute("aria-hidden", "true");
            button.append(icon, createElement("span", "converter-category-label", category.label));
            button.addEventListener("click", () => engine.switchCategory(category.id));
            fragment.append(button);
        });
        elements["converter-category-tabs"].replaceChildren(fragment);
    }

    function render() {
        if (!state) return;
        renderCategory();
        renderSettings();
        renderFileList();
        renderPreview();
        renderButtons();
    }

    function renderCategory() {
        panel.querySelectorAll("[data-category-id]").forEach((button) => {
            const active = button.dataset.categoryId === state.category.id;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        elements["converter-category-title"].textContent = `${state.category.label} Dönüştürücü`;
        elements["converter-category-description"].textContent = state.category.description;
        elements["converter-capability-title"].textContent = state.category.capabilityTitle;
        elements["converter-capability-text"].textContent = state.category.capabilityText;
        elements["converter-capability"].classList.toggle("is-ready", state.adapter.ready);
        elements["converter-capability"].classList.toggle("needs-engine", !state.adapter.ready);
        elements["converter-file-input"].accept = state.category.accept;
        elements["converter-folder-input"].accept = state.category.accept;
        elements["converter-supported-formats"].textContent = `Giriş: ${state.category.inputFormats.join(", ")}`;
        elements["converter-upload-status"].textContent = state.loadingFiles
            ? "Dosyalar inceleniyor..."
            : state.adapter.ready
                ? "Dosyalar yalnızca bu tarayıcıda işlenir."
                : "Dosyalar incelenebilir; dönüşüm için belirtilen WASM motoru gerekir.";
    }

    function renderSettings() {
        const key = `${state.category.id}:${state.settings.outputFormat || ""}`;
        const showOutputNote = state.adapter.ready;
        elements["converter-output-note"].hidden = !showOutputNote;
        elements["converter-output-note"].textContent = showOutputNote ? engine.outputNote() : "";
        if (key === renderedSettingsKey) return;
        renderedSettingsKey = key;
        const fragment = document.createDocumentFragment();

        state.category.settings.forEach((field) => {
            if (!shouldShowField(field)) return;
            if (field.type === "select") fragment.append(renderSelectField(field));
            else if (field.type === "range") fragment.append(renderRangeField(field));
            else if (field.type === "toggle") fragment.append(renderToggleField(field));
        });

        elements["converter-settings"].replaceChildren(fragment);
    }

    function shouldShowField(field) {
        if (state.category.id !== "image") return true;
        if (field.key === "quality") return ["image/jpeg", "image/webp"].includes(state.settings.outputFormat);
        if (field.key === "preserveTransparency") return state.settings.outputFormat !== "image/jpeg";
        return true;
    }

    function renderSelectField(field) {
        const label = createElement("label", "converter-field");
        label.dataset.settingKey = field.key;
        label.append(createElement("span", "", field.label));
        const select = createElement("select");
        select.dataset.settingKey = field.key;
        select.setAttribute("aria-label", field.label);
        getFieldOptions(field).forEach((entry) => {
            const option = createElement("option", "", entry.label);
            option.value = entry.value;
            option.selected = String(state.settings[field.key]) === String(entry.value);
            select.append(option);
        });
        select.addEventListener("change", () => engine.setSetting(field.key, select.value));
        label.append(select);
        return label;
    }

    function getFieldOptions(field) {
        if (state.category.id !== "video" || field.key !== "codec") return field.options;
        const compatibleCodecs = state.category.codecCompatibility?.[state.settings.outputFormat] || [];
        return field.options.filter((entry) => compatibleCodecs.includes(entry.value));
    }

    function renderRangeField(field) {
        const group = createElement("div", "converter-field converter-range-field");
        const heading = createElement("div", "converter-range-heading");
        const label = createElement("label", "", field.label);
        const inputId = `converter-setting-${field.key}`;
        label.htmlFor = inputId;
        const output = createElement("output", "", `${state.settings[field.key]}${field.suffix}`);
        output.htmlFor = inputId;
        const input = createElement("input");
        input.id = inputId;
        input.type = "range";
        input.min = field.min;
        input.max = field.max;
        input.step = field.step;
        input.value = state.settings[field.key];
        input.setAttribute("aria-label", field.label);
        input.addEventListener("input", () => {
            output.textContent = `${input.value}${field.suffix}`;
            engine.setSetting(field.key, input.value);
        });
        heading.append(label, output);
        group.append(heading, input);
        return group;
    }

    function renderToggleField(field) {
        const label = createElement("label", "converter-toggle-field");
        const input = createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(state.settings[field.key]);
        input.setAttribute("aria-label", `${field.label}. ${field.description}`);
        input.addEventListener("change", () => engine.setSetting(field.key, input.checked));
        const copy = createElement("span");
        copy.append(createElement("strong", "", field.label), createElement("small", "", field.description));
        label.append(input, copy);
        return label;
    }

    function renderFileList() {
        const list = elements["converter-file-list"];
        elements["converter-file-count"].textContent = state.items.length
            ? `${state.items.length} dosya listede.`
            : "Henüz dosya eklenmedi.";
        list.replaceChildren();

        if (!state.items.length) {
            const empty = createElement("div", "converter-empty-list");
            empty.append(
                createElement("strong", "", `${state.category.label} dosyası bekleniyor`),
                createElement("span", "", "Başlamak için dosya seçin, sürükleyin veya panodan yapıştırın."),
            );
            list.append(empty);
            return;
        }

        state.items.forEach((item) => list.append(renderFileCard(item)));
    }

    function renderFileCard(item) {
        const card = createElement("article", `converter-file-card${item.id === state.selectedId ? " is-selected" : ""}`);
        card.tabIndex = 0;
        card.setAttribute("aria-label", `${namespace.Services.safeDisplayName(item.file.name)}, ${item.status}`);
        card.addEventListener("click", () => engine.selectItem(item.id));
        card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            engine.selectItem(item.id);
        });

        const thumbnail = createElement("div", "converter-file-thumbnail");
        if (state.adapter.previewKind === "image") {
            const image = document.createElement("img");
            image.src = item.sourceUrl;
            image.alt = `${namespace.Services.safeDisplayName(item.file.name)} küçük önizlemesi`;
            image.loading = "lazy";
            thumbnail.append(image);
        } else {
            thumbnail.append(createElement("span", "", state.category.icon));
        }

        const content = createElement("div", "converter-file-content");
        const titleRow = createElement("div", "converter-file-title-row");
        const title = createElement("h4", "", namespace.Services.safeDisplayName(item.file.name));
        title.title = namespace.Services.safeDisplayName(item.file.name);
        titleRow.append(title, createElement("span", `converter-file-status ${statusClass(item.status)}`, item.status));

        const meta = createElement("dl", "converter-file-meta");
        const values = [
            ["Format", item.extension.toUpperCase()],
            ["Dosya Boyutu", namespace.Services.formatBytes(item.file.size)],
            [
                item.outputBlob ? "Çıkış Boyutu" : "Tahmini Çıkış",
                item.outputBlob
                    ? namespace.Services.formatBytes(item.outputBlob.size)
                    : state.adapter.ready
                        ? `~${namespace.Services.formatBytes(engine.estimate(item))}`
                        : "Motor bağlanınca",
            ],
            ...item.metadata.details,
            ["Son Değişiklik", namespace.Services.formatDate(item.file.lastModified)],
        ];
        if (item.metadata.colorProfile) values.push(["Renk Profili", item.metadata.colorProfile]);
        values.slice(0, 8).forEach(([label, value]) => {
            const group = createElement("div");
            group.append(createElement("dt", "", label), createElement("dd", "", value));
            meta.append(group);
        });
        content.append(titleRow, meta);
        if (item.error) content.append(createElement("p", "converter-file-error", item.error));

        const actions = createElement("div", "converter-file-actions");
        actions.append(
            actionButton("Önizle", () => engine.selectItem(item.id), false, `Önizle: ${namespace.Services.safeDisplayName(item.file.name)}`),
            actionButton(item.processing ? "Dönüştürülüyor..." : "Dönüştür", () => engine.convertItem(item.id), !state.adapter.ready || item.processing || state.batchRunning, `Dönüştür: ${namespace.Services.safeDisplayName(item.file.name)}`, true),
            actionButton("İndir", () => engine.downloadItem(item.id), !item.outputBlob, `İndir: ${namespace.Services.safeDisplayName(item.file.name)}`),
            actionButton("İptal", () => engine.cancelItem(item.id), !item.processing, `İptal: ${namespace.Services.safeDisplayName(item.file.name)}`),
            actionButton("Kaldır", () => engine.removeItem(item.id), item.processing || state.batchRunning, `Kaldır: ${namespace.Services.safeDisplayName(item.file.name)}`, false, "is-remove"),
        );
        card.append(thumbnail, content, actions);
        return card;
    }

    function actionButton(text, handler, disabled, label, primary = false, extraClass = "") {
        const button = createElement("button", `${primary ? "primary-button" : "secondary-button"} ${extraClass}`.trim(), text);
        button.type = "button";
        button.disabled = disabled;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            handler();
        });
        return button;
    }

    function renderPreview() {
        const item = engine.getSelectedItem();
        elements["converter-preview-name"].textContent = item ? namespace.Services.safeDisplayName(item.file.name) : "Bir dosya seçin.";
        elements["converter-preview-before"].replaceChildren(renderPreviewContent(item, false));
        elements["converter-preview-after"].replaceChildren(renderPreviewContent(item, true));
        elements["converter-image-preview-controls"].hidden = state.adapter.previewKind !== "image";
        renderPreviewPresentation();
    }

    function renderPreviewContent(item, output) {
        if (!item) return createElement("span", "converter-preview-placeholder", "Önizlenecek dosya seçilmedi.");
        const url = output ? item.outputUrl : item.sourceUrl;
        if (!url) return createElement("span", "converter-preview-placeholder", "Dönüştürme sonrası burada gösterilir.");

        if (state.adapter.previewKind === "image") {
            const image = document.createElement("img");
            image.src = url;
            image.alt = output ? "Dönüştürme sonrası görsel" : "Dönüştürme öncesi görsel";
            image.addEventListener("load", renderPreviewPresentation, { once: true });
            return image;
        }
        if (!output && state.category.id === "audio") {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "metadata";
            audio.src = url;
            audio.setAttribute("aria-label", `${namespace.Services.safeDisplayName(item.file.name)} ses önizlemesi`);
            return audio;
        }
        if (!output && state.category.id === "video") {
            const video = document.createElement("video");
            video.controls = true;
            video.preload = "metadata";
            video.src = url;
            video.setAttribute("aria-label", `${namespace.Services.safeDisplayName(item.file.name)} video önizlemesi`);
            return video;
        }

        const summary = createElement("div", "converter-generic-preview");
        summary.append(
            createElement("span", "converter-generic-preview-icon", state.category.icon),
            createElement("strong", "", output ? item.outputName : namespace.Services.safeDisplayName(item.file.name)),
            createElement("span", "", `${(output ? namespace.Services.getExtension(item.outputName) : item.extension).toUpperCase()} · ${namespace.Services.formatBytes(output ? item.outputBlob.size : item.file.size)}`),
        );
        if (!output && item.metadata.previewText) {
            summary.append(createElement("pre", "", item.metadata.previewText.slice(0, 1200)));
        }
        return summary;
    }

    function renderButtons() {
        const completed = engine.completedItems();
        const processing = state.batchRunning || state.items.some((item) => item.processing);
        elements["converter-convert-all"].disabled = !state.adapter.ready || !state.items.length || processing || state.loadingFiles;
        elements["converter-download-all"].disabled = !completed.length || processing;
        elements["converter-download-zip"].disabled = completed.length < 2 || processing;
        elements["converter-cancel-all"].disabled = !processing;
        elements["converter-clear-list"].disabled = !state.items.length || processing || state.loadingFiles;
        elements["converter-category-tabs"].querySelectorAll("button").forEach((button) => { button.disabled = processing || state.loadingFiles; });
        elements["converter-settings"].querySelectorAll("input, select").forEach((control) => { control.disabled = processing; });
    }

    function renderProgress(progress) {
        elements["converter-progress-bar"].style.width = `${progress.percent}%`;
        elements["converter-progress-text"].textContent = progress.message;
    }

    function setPreviewView(view) {
        previewView = view;
        panel.querySelectorAll("[data-converter-view]").forEach((button) => {
            const active = button.dataset.converterView === view;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        renderPreviewPresentation();
    }

    function renderPreviewPresentation() {
        const fit = elements["converter-fit-mode"].value;
        const zoom = Number(elements["converter-preview-zoom"].value);
        elements["converter-preview-grid"].dataset.view = previewView;
        elements["converter-preview-grid"].dataset.fit = fit;
        elements["converter-preview-zoom-value"].textContent = `%${zoom}`;
        elements["converter-preview-grid"].querySelectorAll("img").forEach((image) => {
            image.style.setProperty("--converter-preview-zoom", String(zoom / 100));
            image.style.width = fit === "original" && image.naturalWidth ? `${Math.round(image.naturalWidth * zoom / 100)}px` : `${zoom}%`;
            image.style.height = fit === "original" ? "auto" : `${zoom}%`;
        });
    }

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (elements["converter-preview-section"].requestFullscreen) await elements["converter-preview-section"].requestFullscreen();
            else throw new Error("Tam ekran önizleme bu tarayıcıda desteklenmiyor.");
        } catch (error) {
            elements["converter-live"].textContent = error.message;
        }
    }

    function handleDragEnter(event) {
        event.preventDefault();
        dragDepth += 1;
        elements["converter-drop-zone"].classList.add("is-dragging");
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event) {
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) elements["converter-drop-zone"].classList.remove("is-dragging");
    }

    function handleDrop(event) {
        event.preventDefault();
        dragDepth = 0;
        elements["converter-drop-zone"].classList.remove("is-dragging");
        engine.addFiles(event.dataTransfer?.files || []);
    }

    function handlePaste(event) {
        if (!panel.classList.contains("active")) return;
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return;
        event.preventDefault();
        engine.addFiles(files);
    }

    function consumeInput(input) {
        engine.addFiles(input.files || []);
        input.value = "";
    }

    function handleToolActivated(event) {
        if (event.detail?.tool !== "converter" || !window.matchMedia("(max-width: 900px)").matches) return;
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        window.requestAnimationFrame(() => panel.scrollIntoView({ behavior, block: "start" }));
    }

    function statusClass(status) {
        if (status === "Tamamlandı") return "is-complete";
        if (status === "Hata") return "is-error";
        if (status === "Dönüştürülüyor...") return "is-processing";
        if (status === "İptal edildi") return "is-cancelled";
        return "is-waiting";
    }

    function createElement(tag, className = "", text = "") {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== "") element.textContent = text;
        return element;
    }
})(window);
