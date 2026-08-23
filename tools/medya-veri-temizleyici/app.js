(function initMetadataCleanerApp(root) {
    "use strict";

    const core = root.MetadataCleanerCore;
    const panel = document.getElementById("medya-veri-temizleyici");
    if (!core || !panel) return;

    const MAX_FILES = 20;
    const MAX_FILE_BYTES = 250 * 1024 * 1024;
    const WARN_FILE_BYTES = 50 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 600 * 1024 * 1024;
    const elements = {};
    [
        "metadata-drop-zone", "metadata-file-input", "metadata-browse", "metadata-upload-status",
        "metadata-file-count", "metadata-file-list", "metadata-clean-all", "metadata-download-zip",
        "metadata-clear-all", "metadata-progress-bar", "metadata-progress-text", "metadata-selection",
        "metadata-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const state = {
        items: [],
        selectedId: null,
        nextId: 1,
        nextImageSequence: createInitialImageSequence(),
        dragDepth: 0,
        batchRunning: false,
    };
    const workerRequests = new Map();
    let workerRequestId = 1;
    let worker = null;

    bindEvents();
    render();

    function bindEvents() {
        const dropZone = elements["metadata-drop-zone"];
        elements["metadata-browse"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["metadata-file-input"].click();
        });
        elements["metadata-file-input"].addEventListener("change", (event) => consumeInput(event.target));
        dropZone.addEventListener("click", (event) => {
            if (!event.target.closest("button")) elements["metadata-file-input"].click();
        });
        dropZone.addEventListener("keydown", (event) => {
            if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
                event.preventDefault();
                elements["metadata-file-input"].click();
            }
        });
        dropZone.addEventListener("dragenter", handleDragEnter);
        dropZone.addEventListener("dragover", handleDragOver);
        dropZone.addEventListener("dragleave", handleDragLeave);
        dropZone.addEventListener("drop", handleDrop);
        document.addEventListener("paste", handlePaste);
        elements["metadata-clean-all"].addEventListener("click", cleanAll);
        elements["metadata-download-zip"].addEventListener("click", downloadZip);
        elements["metadata-clear-all"].addEventListener("click", clearAll);
        window.addEventListener("beforeunload", releaseAll);
    }

    function consumeInput(input) {
        const files = Array.from(input.files || []);
        input.value = "";
        addFiles(files);
    }

    function handleDragEnter(event) {
        event.preventDefault();
        state.dragDepth += 1;
        elements["metadata-drop-zone"].classList.add("is-dragging");
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event) {
        event.preventDefault();
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (!state.dragDepth) elements["metadata-drop-zone"].classList.remove("is-dragging");
    }

    function handleDrop(event) {
        event.preventDefault();
        state.dragDepth = 0;
        elements["metadata-drop-zone"].classList.remove("is-dragging");
        addFiles(Array.from(event.dataTransfer?.files || []));
    }

    function handlePaste(event) {
        if (!panel.classList.contains("active")) return;
        const files = Array.from(event.clipboardData?.items || [])
            .filter((item) => item.kind === "file" && (item.type.startsWith("image/") || !item.type))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (!files.length) return;
        event.preventDefault();
        addFiles(files);
    }

    async function addFiles(files) {
        if (!files.length || state.batchRunning) return;
        const slots = Math.max(0, MAX_FILES - state.items.length);
        const candidates = files.slice(0, slots);
        if (!slots) {
            announce(`En fazla ${MAX_FILES} dosya ekleyebilirsiniz.`);
            return;
        }
        if (files.length > slots) announce(`İlk ${slots} dosya eklendi; sınır ${MAX_FILES} dosyadır.`);

        const existingKeys = new Set(state.items.map((item) => fileKey(item.file)));
        let totalBytes = state.items.reduce((sum, item) => sum + item.file.size, 0);
        const added = [];
        candidates.forEach((file) => {
            if (!(file instanceof File) || existingKeys.has(fileKey(file))) return;
            if (file.size > MAX_FILE_BYTES) {
                announce(`${safeName(file.name)} 250 MB sınırını aşıyor.`);
                return;
            }
            if (totalBytes + file.size > MAX_TOTAL_BYTES) {
                announce("Toplam dosya boyutu 600 MB güvenlik sınırını aşıyor.");
                return;
            }
            const item = {
                id: state.nextId++,
                file,
                sourceUrl: URL.createObjectURL(file),
                outputUrl: "",
                outputBlob: null,
                outputName: "",
                analysis: null,
                result: null,
                status: "Dosya analiz ediliyor...",
                state: "analyzing",
                error: "",
                warning: file.size > WARN_FILE_BYTES ? "Büyük dosya: işlem cihazınıza göre biraz sürebilir." : "",
            };
            state.items.push(item);
            added.push(item);
            existingKeys.add(fileKey(file));
            totalBytes += file.size;
        });

        if (!added.length) { render(); return; }
        if (!state.selectedId) state.selectedId = added[0].id;
        render();
        for (const item of added) {
            await analyzeItem(item);
            await yieldToBrowser();
        }
    }

    async function analyzeItem(item) {
        item.status = "Üst veri tespit ediliyor...";
        item.state = "analyzing";
        render();
        try {
            const buffer = await item.file.arrayBuffer();
            const response = await runWorker("inspect", { buffer }, [buffer]);
            item.analysis = response.analysis;
            item.state = "ready";
            item.status = response.analysis.metadataCount
                ? `${response.analysis.metadataCount} meta veri alanı bulundu`
                : "Üst veri bulunmadı";
            const extension = getExtension(item.file.name);
            if (!extensionMatches(extension, response.analysis.format)) {
                item.warning = joinWarning(item.warning, `Dosya uzantısı içerikle eşleşmiyor; içerik ${response.analysis.label} olarak algılandı.`);
            }
            if (response.analysis.gps) item.warning = joinWarning(item.warning, "Konum bilgisi bulundu.");
        } catch (error) {
            item.state = "error";
            item.status = "İncelenemedi";
            item.error = error.message || "Dosya analiz edilemedi.";
        }
        render();
    }

    async function cleanItem(item, options = {}) {
        if (!item?.analysis || item.state === "cleaning" || item.outputBlob) return false;
        item.state = "cleaning";
        item.status = "Üst veri temizleniyor...";
        item.error = "";
        render();
        try {
            const buffer = await item.file.arrayBuffer();
            const response = await runWorker("clean", { buffer }, [buffer]);
            item.status = "Dosya hazırlanıyor...";
            render();
            await yieldToBrowser();
            item.result = {
                before: response.before,
                after: response.after,
                removedCount: response.removedCount,
                gpsRemoved: response.gpsRemoved,
                lossless: response.lossless,
                orientationRetained: response.orientationRetained,
                colorProfileRetained: response.colorProfileRetained,
            };
            item.outputBlob = new Blob([response.output], { type: response.after.mime });
            item.outputName = createOutputName(item.file.name, response.after);
            if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
            item.outputUrl = URL.createObjectURL(item.outputBlob);
            item.state = "complete";
            item.status = "Hazır!";
            if (!options.quiet) announce(`${safeName(item.file.name)} temizlendi ve yeniden doğrulandı.`);
            return true;
        } catch (error) {
            item.state = "error";
            item.status = "Temizlenemedi";
            item.error = error.message || "Dosya temizlenemedi.";
            return false;
        } finally {
            render();
        }
    }

    async function cleanAll() {
        const pending = state.items.filter((item) => item.analysis && !item.outputBlob && item.state !== "cleaning");
        if (!pending.length || state.batchRunning) return;
        state.batchRunning = true;
        let completed = 0;
        renderProgress(0, pending.length, "Toplu temizlik başlıyor...");
        render();
        for (const item of pending) {
            const success = await cleanItem(item, { quiet: true });
            if (success) completed += 1;
            renderProgress(completed, pending.length, `${completed}/${pending.length} dosya hazır`);
            await yieldToBrowser();
        }
        state.batchRunning = false;
        renderProgress(completed, pending.length, completed === pending.length ? "Hazır!" : `${completed}/${pending.length} dosya temizlendi`);
        announce(`${completed} dosya temizlendi ve çıktıları doğrulandı.`);
        render();
    }

    function render() {
        renderButtons();
        renderFileList();
        renderSelection();
    }

    function renderButtons() {
        const readyCount = state.items.filter((item) => item.analysis && !item.outputBlob && item.state !== "cleaning").length;
        const completedCount = state.items.filter((item) => item.outputBlob).length;
        elements["metadata-clean-all"].disabled = !readyCount || state.batchRunning;
        elements["metadata-download-zip"].disabled = !completedCount || state.batchRunning;
        elements["metadata-clear-all"].disabled = !state.items.length || state.batchRunning;
        elements["metadata-clean-all"].textContent = readyCount > 1 ? `HEPSİNİ TEMİZLE (${readyCount})` : "META VERİLERİ TEMİZLE";
        elements["metadata-download-zip"].textContent = completedCount > 1 ? `ZIP OLARAK İNDİR (${completedCount})` : "ZIP OLARAK İNDİR";
        elements["metadata-file-count"].textContent = state.items.length
            ? `${state.items.length} dosya · ${completedCount} temizlendi`
            : "Henüz dosya eklenmedi.";
        elements["metadata-upload-status"].textContent = state.items.some((item) => item.state === "analyzing")
            ? "Dosya analiz ediliyor..."
            : "JPEG, PNG ve WebP · En fazla 20 dosya / dosya başına 250 MB";
    }

    function renderFileList() {
        const list = elements["metadata-file-list"];
        list.replaceChildren();
        if (!state.items.length) {
            const empty = createElement("div", "metadata-empty-list");
            empty.append(
                createElement("strong", "", "Fotoğraf bekleniyor"),
                createElement("span", "", "Başlamak için dosya seçin, sürükleyin veya panodan yapıştırın."),
            );
            list.append(empty);
            return;
        }
        state.items.forEach((item) => list.append(renderFileCard(item)));
    }

    function renderFileCard(item) {
        const selected = item.id === state.selectedId;
        const card = createElement("article", `metadata-file-card${selected ? " is-selected" : ""}`);
        card.tabIndex = 0;
        card.setAttribute("aria-label", `${safeName(item.file.name)}, ${item.status}`);
        card.addEventListener("click", () => selectItem(item.id));
        card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            selectItem(item.id);
        });

        const thumbnail = createElement("div", "metadata-file-thumbnail");
        const image = document.createElement("img");
        image.src = item.sourceUrl;
        image.alt = "";
        image.loading = "lazy";
        thumbnail.append(image);

        const content = createElement("div", "metadata-file-content");
        const heading = createElement("div", "metadata-file-title-row");
        const title = createElement("h4", "", safeName(item.file.name));
        title.title = safeName(item.file.name);
        heading.append(title, createElement("span", `metadata-file-status is-${item.state}`, item.status));

        const meta = createElement("dl", "metadata-file-meta");
        const values = [
            ["Boyut", formatBytes(item.file.size)],
            ["Format", item.analysis?.label || (getExtension(item.file.name).toUpperCase() || "—")],
            ["Üst veri", item.analysis ? `${item.analysis.metadataCount} alan` : "İnceleniyor"],
            ["GPS", item.analysis ? (item.analysis.gps ? "Var" : "Yok") : "—"],
            ["Durum", item.status],
        ];
        values.forEach(([label, value]) => {
            const group = createElement("div");
            group.append(createElement("dt", "", label), createElement("dd", "", value));
            meta.append(group);
        });
        content.append(heading, meta);
        if (item.warning) content.append(createElement("p", "metadata-file-warning", item.warning));
        if (item.error) content.append(createElement("p", "metadata-file-error", item.error));

        const actions = createElement("div", "metadata-file-actions");
        actions.append(
            actionButton("İncele", () => selectItem(item.id), false, `İncele: ${safeName(item.file.name)}`),
            actionButton(item.state === "cleaning" ? "Temizleniyor..." : "Temizle", () => cleanItem(item), !item.analysis || Boolean(item.outputBlob) || item.state === "cleaning" || state.batchRunning, `Temizle: ${safeName(item.file.name)}`, true),
            item.outputBlob
                ? downloadLink("İndir", item, false, `İndir: ${safeName(item.file.name)}`)
                : actionButton("İndir", () => {}, true, `İndir: ${safeName(item.file.name)}`),
            actionButton("Kaldır", () => removeItem(item.id), item.state === "cleaning" || state.batchRunning, `Kaldır: ${safeName(item.file.name)}`, false, "is-remove"),
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

    function downloadLink(text, item, primary, label, extraClass = "") {
        const link = createElement("a", `${primary ? "primary-button" : "secondary-button"} ${extraClass}`.trim(), text);
        link.href = item.outputUrl;
        link.download = item.outputName;
        link.rel = "noopener";
        link.setAttribute("aria-label", label);
        link.addEventListener("click", (event) => {
            event.stopPropagation();
            announce(`${safeName(item.outputName)} indirmeye hazırlandı.`);
        });
        return link;
    }

    function renderSelection() {
        const container = elements["metadata-selection"];
        container.replaceChildren();
        const item = state.items.find((entry) => entry.id === state.selectedId);
        if (!item) {
            const empty = createElement("div", "metadata-selection-empty");
            empty.append(createElement("strong", "", "Karşılaştırma"), createElement("span", "", "Analiz ayrıntıları burada gösterilecek."));
            container.append(empty);
            return;
        }

        const heading = createElement("div", "metadata-selection-heading");
        const titleGroup = createElement("div");
        titleGroup.append(createElement("h3", "", safeName(item.file.name)), createElement("p", "", item.status));
        heading.append(titleGroup);
        if (item.outputBlob) {
            const download = downloadLink("TEMİZLENMİŞ DOSYAYI İNDİR", item, true, `Temizlenmiş dosyayı indir: ${safeName(item.outputName)}`, "metadata-primary-download");
            heading.append(download);
        }
        container.append(heading);

        if (item.analysis?.gps) {
            const gpsNotice = createElement("div", "metadata-gps-notice");
            gpsNotice.append(createElement("strong", "", "Konum bilgisi bulundu"), createElement("span", "", "GPS koordinatları temizlik sırasında kaldırılacak."));
            container.append(gpsNotice);
        }
        if (item.error) container.append(createElement("p", "metadata-selection-error", item.error));
        if (!item.analysis) return;

        const comparison = createElement("div", "metadata-comparison-grid");
        comparison.append(
            renderComparisonCard("Orijinal", item.file.size, item.analysis, false, item),
            renderComparisonCard("Temizlenmiş", item.outputBlob?.size || 0, item.result?.after || null, true, item),
        );
        container.append(comparison);

        const preview = createElement("div", "metadata-preview-grid");
        preview.append(renderPreview("Orijinal", item.sourceUrl));
        preview.append(renderPreview("Temizlenmiş", item.outputUrl));
        container.append(preview);

        if (item.result) {
            const verification = createElement("div", "metadata-verification");
            verification.append(
                createElement("strong", "", "Çıktı yeniden analiz edilerek doğrulandı"),
                createElement("span", "", `${item.result.removedCount} üst veri alanı kaldırıldı.${item.result.gpsRemoved ? " GPS bilgisi kaldırıldı." : ""}`),
                createElement("span", "", "Görüntü verisi yeniden sıkıştırılmadı."),
            );
            if (item.result.orientationRetained) verification.append(createElement("small", "", "Görselin yanlış dönmemesi için yalnızca teknik yön bilgisi korundu."));
            if (item.result.colorProfileRetained) verification.append(createElement("small", "", "Renk görünümünü korumak için teknik ICC/sRGB profili korundu."));
            container.append(verification);
        }

        container.append(renderMetadataDetails(item.analysis));
    }

    function renderComparisonCard(title, size, analysis, cleaned, item) {
        const card = createElement("section", `metadata-comparison-card${cleaned ? " is-cleaned" : ""}`);
        card.append(createElement("span", "metadata-comparison-label", title));
        if (!analysis) {
            card.append(createElement("strong", "metadata-comparison-pending", item.state === "cleaning" ? item.status : "Temizlikten sonra hazır"));
            return card;
        }
        const list = createElement("dl");
        const rows = [
            ["Dosya boyutu", formatBytes(size)],
            ["Çözünürlük", analysis.width && analysis.height ? `${analysis.width} × ${analysis.height}` : "Okunamadı"],
            ["Üst veri", cleaned ? (analysis.removableCount ? `${analysis.removableCount} alan kaldı` : "Mahremiyet verileri temizlendi") : `${analysis.metadataCount} alan`],
            ["GPS", analysis.gps ? "Var" : "Yok"],
            ["Kalite", cleaned ? "Orijinal" : "—"],
        ];
        rows.forEach(([label, value]) => {
            const row = createElement("div");
            row.append(createElement("dt", "", label), createElement("dd", "", value));
            list.append(row);
        });
        card.append(list);
        return card;
    }

    function renderPreview(label, url) {
        const figure = createElement("figure", "metadata-preview-pane");
        figure.append(createElement("figcaption", "", label));
        const stage = createElement("div", "metadata-preview-stage");
        if (url) {
            const image = document.createElement("img");
            image.src = url;
            image.alt = `${label} görsel önizlemesi`;
            stage.append(image);
        } else {
            stage.append(createElement("span", "", "Temizlikten sonra burada gösterilir."));
        }
        figure.append(stage);
        return figure;
    }

    function renderMetadataDetails(analysis) {
        const details = createElement("details", "metadata-details");
        const summary = createElement("summary", "", `Bulunan Bilgiler (${analysis.metadataCount})`);
        details.append(summary);
        if (!analysis.metadata.length) {
            details.append(createElement("p", "metadata-details-empty", "Dosyada gösterilebilir üst veri alanı bulunmadı."));
            return details;
        }
        const groups = new Map();
        analysis.metadata.forEach((field) => {
            if (!groups.has(field.group)) groups.set(field.group, []);
            groups.get(field.group).push(field);
        });
        groups.forEach((fields, groupName) => {
            const group = createElement("section", "metadata-detail-group");
            group.append(createElement("h4", "", groupName));
            const list = createElement("dl");
            fields.forEach((field) => {
                const row = createElement("div");
                const label = createElement("dt", "", field.label);
                if (field.technical && !field.removable) label.append(createElement("small", "", "Teknik · korunur"));
                row.append(label, createElement("dd", "", field.value));
                list.append(row);
            });
            group.append(list);
            details.append(group);
        });
        return details;
    }

    function selectItem(id) {
        if (!state.items.some((item) => item.id === id)) return;
        state.selectedId = id;
        render();
    }

    function removeItem(id) {
        const index = state.items.findIndex((item) => item.id === id);
        if (index < 0) return;
        releaseItem(state.items[index]);
        state.items.splice(index, 1);
        if (state.selectedId === id) state.selectedId = state.items[index]?.id || state.items[index - 1]?.id || null;
        renderProgress(0, 0, state.items.length ? "Temizlik bekleniyor" : "Dosya bekleniyor");
        render();
    }

    function clearAll() {
        if (state.batchRunning) return;
        releaseAll();
        state.items = [];
        state.selectedId = null;
        renderProgress(0, 0, "Dosya bekleniyor");
        announce("Dosya listesi temizlendi.");
        render();
    }

    function releaseItem(item) {
        if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        item.sourceUrl = "";
        item.outputUrl = "";
        item.outputBlob = null;
    }

    function releaseAll() {
        state.items.forEach(releaseItem);
    }

    async function downloadZip() {
        const completed = state.items.filter((item) => item.outputBlob);
        if (!completed.length || state.batchRunning) return;
        state.batchRunning = true;
        renderProgress(0, completed.length, "ZIP hazırlanıyor...");
        render();
        try {
            const usedNames = new Set();
            const files = [];
            const transfer = [];
            for (let index = 0; index < completed.length; index += 1) {
                const item = completed[index];
                const buffer = await item.outputBlob.arrayBuffer();
                files.push({ name: uniqueName(item.outputName, usedNames), buffer, lastModified: item.file.lastModified });
                transfer.push(buffer);
                renderProgress(index, completed.length, `${index + 1}/${completed.length} dosya ZIP için okunuyor`);
            }
            const response = await runWorker("zip", { files }, transfer);
            const zipBlob = new Blob([response.output], { type: "application/zip" });
            triggerDownload(zipBlob, "temizlenmis-fotograflar.zip");
            renderProgress(completed.length, completed.length, "ZIP hazır!");
            announce(`${completed.length} temizlenmiş dosya ZIP olarak hazırlandı.`);
        } catch (error) {
            renderProgress(0, completed.length, "ZIP hazırlanamadı");
            announce(error.message || "ZIP dosyası hazırlanamadı.");
        } finally {
            state.batchRunning = false;
            render();
        }
    }

    function triggerDownload(blob, name) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = safeName(name) || "temizlenmis-dosya";
        anchor.rel = "noopener";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function renderProgress(completed, total, text) {
        const percent = total ? Math.round((completed / total) * 100) : 0;
        elements["metadata-progress-bar"].style.width = `${percent}%`;
        elements["metadata-progress-text"].textContent = text;
    }

    function ensureWorker() {
        if (worker || typeof Worker === "undefined") return worker;
        try {
            const url = new URL("tools/medya-veri-temizleyici/worker.js?v=3", document.baseURI);
            worker = new Worker(url);
            worker.addEventListener("message", (event) => {
                const request = workerRequests.get(event.data?.id);
                if (!request) return;
                workerRequests.delete(event.data.id);
                if (event.data.ok) request.resolve(event.data);
                else request.reject(new Error(event.data.error || "Dosya işlenemedi."));
            });
            worker.addEventListener("error", () => {
                workerRequests.forEach(({ reject }) => reject(new Error("Arka plan işleyicisi başlatılamadı.")));
                workerRequests.clear();
                worker?.terminate();
                worker = null;
            });
        } catch {
            worker = null;
        }
        return worker;
    }

    async function runWorker(action, payload, transfer = []) {
        const activeWorker = ensureWorker();
        if (!activeWorker) {
            await yieldToBrowser();
            if (action === "inspect") return { analysis: core.inspect(payload.buffer) };
            if (action === "clean") return core.clean(payload.buffer);
            if (action === "zip") return { output: core.createZip(payload.files) };
            throw new Error("İşlem desteklenmiyor.");
        }
        const id = workerRequestId++;
        return new Promise((resolve, reject) => {
            workerRequests.set(id, { resolve, reject });
            activeWorker.postMessage({ id, action, ...payload }, transfer);
        });
    }

    function createOutputName(fileName, analysis) {
        const displayName = safeName(fileName) || `fotograf.${analysis.extension}`;
        const extension = getExtension(displayName);
        const matchingExtension = extensionMatches(extension, analysis.format)
            ? extension
            : analysis.extension;
        const sequence = state.nextImageSequence;
        state.nextImageSequence = sequence >= 9999 ? 1 : sequence + 1;
        return `IMG_${String(sequence).padStart(4, "0")}.${matchingExtension.toUpperCase()}`;
    }

    function createInitialImageSequence() {
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);
        return (random[0] % 9999) + 1;
    }

    function extensionMatches(extension, format) {
        const normalized = extension.toLowerCase();
        if (format === "jpeg") return normalized === "jpg" || normalized === "jpeg";
        return normalized === format;
    }

    function uniqueName(name, used) {
        const extension = getExtension(name);
        const base = extension ? name.slice(0, -(extension.length + 1)) : name;
        let candidate = name;
        let suffix = 2;
        while (used.has(candidate.toLocaleLowerCase("tr-TR"))) {
            candidate = `${base}-${suffix}${extension ? `.${extension}` : ""}`;
            suffix += 1;
        }
        used.add(candidate.toLocaleLowerCase("tr-TR"));
        return candidate;
    }

    function getExtension(name) {
        const match = String(name || "").match(/\.([^.]+)$/);
        return match ? match[1].toLowerCase() : "";
    }

    function fileKey(file) {
        return `${file.name}:${file.size}:${file.lastModified}`;
    }

    function safeName(value) {
        return String(value || "")
            .replace(/\\/g, "/")
            .split("/")
            .pop()
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 180);
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        const units = ["KB", "MB", "GB"];
        let current = value / 1024;
        let index = 0;
        while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
        return `${current.toLocaleString("tr-TR", { maximumFractionDigits: current >= 100 ? 0 : 2 })} ${units[index]}`;
    }

    function joinWarning(current, next) {
        return current ? `${current} ${next}` : next;
    }

    function createElement(tag, className = "", text = "") {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== "") element.textContent = text;
        return element;
    }

    function announce(message) {
        elements["metadata-live"].textContent = "";
        window.setTimeout(() => { elements["metadata-live"].textContent = message; }, 20);
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }
})(window);
