(function initExifViewerApp(root) {
    "use strict";

    const core = root.ExifViewerCore;
    const panel = document.getElementById("exif-veri-goruntuleme");
    if (!core || !panel) return;

    const MAX_FILE_BYTES = 300 * 1024 * 1024;
    const elements = {};
    [
        "exif-viewer-drop-zone", "exif-viewer-file-input", "exif-viewer-browse", "exif-viewer-upload",
        "exif-viewer-status", "exif-viewer-status-text", "exif-viewer-progress", "exif-viewer-error",
        "exif-viewer-result", "exif-viewer-summary", "exif-viewer-gps-alert", "exif-viewer-warnings",
        "exif-viewer-categories", "exif-viewer-raw-search", "exif-viewer-raw-count", "exif-viewer-raw-body",
        "exif-viewer-json", "exif-viewer-json-output", "exif-viewer-new", "exif-viewer-copy-all",
        "exif-viewer-show-json", "exif-viewer-copy-json", "exif-viewer-download-json", "exif-viewer-download-txt",
        "exif-viewer-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const state = {
        file: null,
        analysis: null,
        thumbnailUrl: "",
        dragDepth: 0,
        requestId: 1,
        generation: 0,
        worker: null,
        pending: new Map(),
    };

    const categoryOrder = [
        ["file", "Dosya Bilgileri"],
        ["privacy", "Gizlilik Kontrolü"],
        ["gps", "GPS ve Konum"],
        ["camera", "Kamera ve Cihaz"],
        ["capture", "Çekim Ayarları"],
        ["date", "Tarih ve Zaman"],
        ["software", "Yazılım ve İşleme"],
        ["credentials", "Content Credentials"],
        ["rights", "Telif ve Yazar"],
        ["description", "İçerik Açıklamaları"],
        ["color", "Renk ve Görüntü Profili"],
        ["technical", "Teknik EXIF"],
        ["thumbnail", "EXIF Önizleme Görseli"],
        ["xmp", "XMP"],
        ["iptc", "IPTC"],
        ["container", "PNG / WebP Teknik Bilgileri"],
    ];

    bindEvents();
    resetView(false);

    function bindEvents() {
        const dropZone = elements["exif-viewer-drop-zone"];
        elements["exif-viewer-browse"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["exif-viewer-file-input"].click();
        });
        elements["exif-viewer-file-input"].addEventListener("change", (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) analyzeFile(file);
        });
        dropZone.addEventListener("click", (event) => {
            if (!event.target.closest("button")) elements["exif-viewer-file-input"].click();
        });
        dropZone.addEventListener("keydown", (event) => {
            if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
                event.preventDefault();
                elements["exif-viewer-file-input"].click();
            }
        });
        dropZone.addEventListener("dragenter", handleDragEnter);
        dropZone.addEventListener("dragover", handleDragOver);
        dropZone.addEventListener("dragleave", handleDragLeave);
        dropZone.addEventListener("drop", handleDrop);
        document.addEventListener("paste", handlePaste);
        elements["exif-viewer-new"].addEventListener("click", () => resetView(true));
        elements["exif-viewer-copy-all"].addEventListener("click", () => copyWithFeedback(createTextReport(), elements["exif-viewer-copy-all"]));
        elements["exif-viewer-show-json"].addEventListener("click", toggleJson);
        elements["exif-viewer-copy-json"].addEventListener("click", () => copyWithFeedback(jsonReport(), elements["exif-viewer-copy-json"]));
        elements["exif-viewer-download-json"].addEventListener("click", downloadJson);
        elements["exif-viewer-download-txt"].addEventListener("click", downloadText);
        elements["exif-viewer-raw-search"].addEventListener("input", renderRawTable);
        window.addEventListener("beforeunload", releaseResources);
    }

    function handleDragEnter(event) {
        event.preventDefault();
        state.dragDepth += 1;
        elements["exif-viewer-drop-zone"].classList.add("is-dragging");
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event) {
        event.preventDefault();
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (!state.dragDepth) elements["exif-viewer-drop-zone"].classList.remove("is-dragging");
    }

    function handleDrop(event) {
        event.preventDefault();
        state.dragDepth = 0;
        elements["exif-viewer-drop-zone"].classList.remove("is-dragging");
        const file = Array.from(event.dataTransfer?.files || []).find((entry) => entry instanceof File);
        if (file) analyzeFile(file);
    }

    function handlePaste(event) {
        if (!panel.classList.contains("active")) return;
        const file = Array.from(event.clipboardData?.items || [])
            .filter((item) => item.kind === "file" && (item.type.startsWith("image/") || !item.type))
            .map((item) => item.getAsFile())
            .find(Boolean);
        if (!file) return;
        event.preventDefault();
        analyzeFile(file);
    }

    async function analyzeFile(file) {
        const generation = ++state.generation;
        resetAnalysisState();
        state.file = file;
        elements["exif-viewer-upload"].hidden = true;
        elements["exif-viewer-status"].hidden = false;
        elements["exif-viewer-error"].hidden = true;
        elements["exif-viewer-new"].hidden = false;
        if (!file.size) return showError("Dosya boş veya okunamıyor.");
        if (file.size > MAX_FILE_BYTES) return showError("Dosya 300 MB güvenlik sınırını aşıyor.");

        try {
            setStatus("Dosya okunuyor...", 12);
            const buffer = await file.arrayBuffer();
            if (generation !== state.generation) return;
            setStatus("Dosya yapısı analiz ediliyor...", 34);
            await yieldToBrowser();
            const response = await runAnalysis(buffer, {
                name: safeName(file.name),
                type: file.type,
                size: file.size,
                lastModified: file.lastModified,
            });
            if (generation !== state.generation) return;
            state.analysis = response.analysis;
            if (state.analysis.thumbnail?.bytes?.length) {
                state.thumbnailUrl = URL.createObjectURL(new Blob([state.analysis.thumbnail.bytes], { type: state.analysis.thumbnail.mime }));
            }
            setStatus("Analiz tamamlandı.", 100);
            renderResult();
            window.setTimeout(() => { elements["exif-viewer-status"].hidden = true; }, 350);
            announce(`${state.analysis.metadataCount} metadata alanı analiz edildi.`);
        } catch (error) {
            if (generation !== state.generation) return;
            showError(error.message || "Dosya analiz edilemedi.");
        }
    }

    function runAnalysis(buffer, fileInfo) {
        const worker = ensureWorker();
        if (!worker) {
            return yieldToBrowser().then(() => ({ analysis: core.analyze(buffer, fileInfo) }));
        }
        const id = state.requestId++;
        return new Promise((resolve, reject) => {
            state.pending.set(id, { resolve, reject });
            worker.postMessage({ id, action: "analyze", buffer, fileInfo }, [buffer]);
        });
    }

    function ensureWorker() {
        if (state.worker || typeof Worker === "undefined") return state.worker;
        try {
            state.worker = new Worker(new URL("tools/exif-veri-goruntuleme/worker.js?v=1", document.baseURI));
            state.worker.addEventListener("message", (event) => {
                const request = state.pending.get(event.data?.id);
                if (!request) return;
                if (event.data.type === "progress") {
                    const percent = /EXIF/.test(event.data.message) ? 58 : 78;
                    setStatus(event.data.message, percent);
                    return;
                }
                state.pending.delete(event.data.id);
                if (event.data.ok) request.resolve(event.data);
                else request.reject(new Error(event.data.error || "Dosya analiz edilemedi."));
            });
            state.worker.addEventListener("error", () => {
                state.pending.forEach(({ reject }) => reject(new Error("Arka plan analiz motoru başlatılamadı.")));
                state.pending.clear();
                state.worker?.terminate();
                state.worker = null;
            });
        } catch {
            state.worker = null;
        }
        return state.worker;
    }

    function setStatus(message, percent) {
        elements["exif-viewer-status-text"].textContent = message;
        elements["exif-viewer-progress"].style.width = `${percent}%`;
    }

    function showError(message) {
        elements["exif-viewer-status"].hidden = true;
        elements["exif-viewer-error"].hidden = false;
        elements["exif-viewer-error"].textContent = message;
        elements["exif-viewer-upload"].hidden = false;
        announce(message);
    }

    function renderResult() {
        const analysis = state.analysis;
        if (!analysis) return;
        elements["exif-viewer-result"].hidden = false;
        elements["exif-viewer-error"].hidden = true;
        renderSummary();
        renderGpsAlert();
        renderWarnings();
        renderCategories();
        elements["exif-viewer-raw-search"].value = "";
        renderRawTable();
        elements["exif-viewer-json-output"].textContent = jsonReport();
    }

    function renderSummary() {
        const { analysis, file } = state;
        const values = [
            ["Dosya", safeName(file.name)],
            ["Format", analysis.label],
            ["Boyut", analysis.file.sizeDisplay],
            ["Çözünürlük", analysis.file.resolution],
            ["Metadata", `${analysis.metadataCount} alan`],
            ["GPS", analysis.gpsCoordinates ? "Var" : "Yok"],
            ["Kamera", analysis.camera],
            ["Tarih", analysis.hasDate ? "Var" : "Bulunamadı"],
            ["Gizlilik Riski", analysis.privacy.label],
        ];
        const grid = elements["exif-viewer-summary"];
        grid.replaceChildren();
        values.forEach(([label, value]) => {
            const card = createElement("article", `exif-summary-card${label === "Gizlilik Riski" ? ` risk-${analysis.privacy.level}` : ""}`);
            card.append(createElement("span", "", label), createElement("strong", "", value || "—"));
            grid.append(card);
        });
    }

    function renderGpsAlert() {
        const alert = elements["exif-viewer-gps-alert"];
        alert.replaceChildren();
        const coordinates = state.analysis?.gpsCoordinates;
        alert.hidden = !coordinates;
        if (!coordinates) return;
        const copy = createElement("div", "exif-gps-copy");
        copy.append(
            createElement("strong", "", "Bu fotoğraf konum bilgisi içeriyor."),
            createElement("p", "", "Fotoğraf paylaşılmadan önce konum bilgisinin görünür olabileceğini unutmayın."),
        );
        const actions = createElement("div", "exif-gps-actions");
        const coordinateText = `${coordinates.latitude.toFixed(7)}, ${coordinates.longitude.toFixed(7)}`;
        const map = createElement("a", "primary-button", "Haritada Gör");
        map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(coordinates.latitude)}&mlon=${encodeURIComponent(coordinates.longitude)}#map=16/${encodeURIComponent(coordinates.latitude)}/${encodeURIComponent(coordinates.longitude)}`;
        map.target = "_blank";
        map.rel = "noopener noreferrer";
        map.setAttribute("aria-label", "Koordinatları OpenStreetMap üzerinde yeni sekmede aç");
        const copyButton = createElement("button", "secondary-button", "Koordinatları Kopyala");
        copyButton.type = "button";
        copyButton.addEventListener("click", () => copyWithFeedback(coordinateText, copyButton));
        actions.append(map, copyButton);
        alert.append(copy, actions);
    }

    function renderWarnings() {
        const container = elements["exif-viewer-warnings"];
        container.replaceChildren();
        const warnings = state.analysis?.warnings || [];
        container.hidden = !warnings.length;
        warnings.forEach((warning) => container.append(createElement("p", "", warning)));
    }

    function renderCategories() {
        const container = elements["exif-viewer-categories"];
        container.replaceChildren();
        categoryOrder.forEach(([id, title], index) => {
            const content = categoryContent(id);
            if (!content) return;
            const details = createElement("details", `exif-category exif-category-${id}`);
            if (index < 2 || id === "gps") details.open = true;
            const summary = createElement("summary");
            const heading = createElement("span", "", title);
            const count = createElement("small", "", content.countLabel);
            summary.append(heading, count);
            details.append(summary, content.node);
            container.append(details);
        });
    }

    function categoryContent(id) {
        const analysis = state.analysis;
        if (id === "file") {
            const fields = fileFields(analysis.file);
            return { node: renderFieldList(fields), countLabel: `${fields.length} bilgi` };
        }
        if (id === "privacy") return renderPrivacyCategory(analysis.privacy);
        if (id === "credentials") return renderCredentialsCategory(analysis.contentCredentials);
        if (id === "thumbnail") return renderThumbnailCategory(analysis.thumbnail);
        let fields;
        if (id === "xmp") fields = analysis.fields.filter((field) => field.source === "XMP");
        else if (id === "iptc") fields = analysis.fields.filter((field) => field.source === "IPTC");
        else if (id === "container") fields = analysis.fields.filter((field) => ["png", "webp", "container"].includes(field.category));
        else fields = analysis.fields.filter((field) => field.category === id);
        if (!fields.length && !(id === "xmp" && analysis.rawXmp.length)) return null;
        const wrapper = createElement("div", "exif-category-body");
        if (fields.length) wrapper.append(renderFieldList(fields));
        if (id === "xmp" && analysis.rawXmp.length) {
            analysis.rawXmp.forEach((xml, index) => {
                const raw = createElement("details", "exif-raw-xmp");
                raw.append(createElement("summary", "", `Ham XMP XML${analysis.rawXmp.length > 1 ? ` ${index + 1}` : ""}`));
                const pre = createElement("pre");
                pre.textContent = xml;
                raw.append(pre);
                wrapper.append(raw);
            });
        }
        return { node: wrapper, countLabel: `${fields.length} alan` };
    }

    function renderPrivacyCategory(privacy) {
        const wrapper = createElement("div", "exif-category-body exif-privacy-body");
        const overview = createElement("div", `exif-risk-overview risk-${privacy.level}`);
        overview.append(createElement("span", "", "Gizlilik Riski"), createElement("strong", "", privacy.label));
        wrapper.append(overview);
        if (!privacy.reasons.length) {
            wrapper.append(createElement("p", "exif-empty-category", "Hassasiyet değerlendirmesi yapmaya yetecek metadata bulunamadı."));
        } else {
            const list = createElement("div", "exif-risk-list");
            privacy.reasons.forEach((reason) => {
                const item = createElement("article", `risk-${reason.level}`);
                item.append(createElement("span", "", riskLabel(reason.level)), createElement("strong", "", reason.title), createElement("p", "", reason.detail));
                list.append(item);
            });
            wrapper.append(list);
        }
        return { node: wrapper, countLabel: `${privacy.reasons.length} bulgu` };
    }

    function renderCredentialsCategory(credentials) {
        const wrapper = createElement("div", "exif-category-body exif-credentials-body");
        wrapper.append(createElement("strong", credentials.detected ? "is-detected" : "", credentials.detected ? "Content Credentials bilgisi tespit edildi." : "Content Credentials kaydı tespit edilmedi."));
        if (credentials.types.length) wrapper.append(createElement("p", "", `Tür: ${credentials.types.join(", ")}`));
        credentials.details.forEach((detail) => wrapper.append(createElement("p", "", detail)));
        wrapper.append(createElement("small", "", "Bu bölüm yalnızca container/metadata marker'larını tespit eder; kriptografik C2PA doğrulaması yapmaz. Metadata veya Content Credentials bulunmaması, görselin nasıl üretildiği konusunda kesin sonuç vermez."));
        return { node: wrapper, countLabel: credentials.detected ? `${credentials.types.length} işaret` : "Kayıt yok" };
    }

    function renderThumbnailCategory(thumbnail) {
        if (!thumbnail || !state.thumbnailUrl) return null;
        const wrapper = createElement("div", "exif-category-body exif-thumbnail-body");
        const image = document.createElement("img");
        image.src = state.thumbnailUrl;
        image.alt = "EXIF içine gömülü küçük önizleme görseli";
        const details = createElement("div");
        details.append(
            createElement("strong", "", thumbnail.width && thumbnail.height ? `${thumbnail.width} × ${thumbnail.height}` : "Boyut bilinmiyor"),
            createElement("span", "", core.formatBytes(thumbnail.size)),
            createElement("span", "", thumbnail.mime),
        );
        wrapper.append(image, details);
        return { node: wrapper, countLabel: core.formatBytes(thumbnail.size) };
    }

    function renderFieldList(fields) {
        const list = createElement("dl", "exif-field-list");
        fields.forEach((field) => {
            const row = createElement("div", "exif-field-row");
            const term = createElement("dt");
            term.append(createElement("strong", "", field.label));
            const technical = [field.key, field.tag, field.ifd].filter(Boolean).join(" · ");
            if (technical && technical !== field.label) term.append(createElement("small", "", technical));
            const definition = createElement("dd");
            definition.append(createElement("span", "", field.value || "—"));
            const copy = createElement("button", "exif-copy-value", "Kopyala");
            copy.type = "button";
            copy.setAttribute("aria-label", `${field.label} değerini kopyala`);
            copy.addEventListener("click", () => copyWithFeedback(field.value, copy));
            definition.append(copy);
            row.append(term, definition);
            list.append(row);
        });
        return list;
    }

    function fileFields(file) {
        return [
            ["Dosya Adı", file.name, "FileName"], ["Dosya Uzantısı", file.extension, "FileExtension"],
            ["Bildirilen MIME", file.declaredMime, "DeclaredMIME"], ["Gerçek MIME", file.actualMime, "DetectedMIME"],
            ["Dosya Boyutu", file.sizeDisplay, "FileSize"], ["Format", file.format, "Format"],
            ["Çözünürlük", file.resolution, "ImageSize"], ["Genişlik", file.width ? `${file.width} px` : "—", "ImageWidth"],
            ["Yükseklik", file.height ? `${file.height} px` : "—", "ImageHeight"], ["Megapiksel", file.megapixels, "Megapixels"],
            ["En/Boy Oranı", file.aspectRatio, "AspectRatio"], ["Orientation", file.orientation, "Orientation"],
            ["Renk Derinliği", file.bitDepth, "ColorDepth"], ["Alpha Kanalı", file.alphaChannel, "AlphaChannel"],
            ["Kodlama", file.encoding, "Encoding"], ["Alt Tür", file.subtype, "Subtype"],
            ["PNG Renk Türü", file.colorType, "PNGColorType"], ["File.lastModified", file.lastModified, "LastModified"],
        ].filter(([, value]) => value !== "—").map(([label, value, key]) => ({ label, value: String(value), key, tag: "", ifd: "" }));
    }

    function renderRawTable() {
        const fields = state.analysis?.fields || [];
        const query = normalizeSearch(elements["exif-viewer-raw-search"].value);
        const filtered = fields.filter((field) => !query || normalizeSearch(`${field.key} ${field.label} ${field.value} ${field.source} ${field.ifd} ${field.tag}`).includes(query));
        elements["exif-viewer-raw-count"].textContent = query ? `${filtered.length}/${fields.length} alan gösteriliyor` : `${fields.length} alan`;
        const body = elements["exif-viewer-raw-body"];
        body.replaceChildren();
        if (!filtered.length) {
            const row = document.createElement("tr");
            const cell = createElement("td", "exif-raw-empty", query ? "Aramayla eşleşen metadata bulunamadı." : "Metadata bulunamadı.");
            cell.colSpan = 3;
            row.append(cell);
            body.append(row);
            return;
        }
        filtered.forEach((field) => {
            const row = document.createElement("tr");
            const name = document.createElement("td");
            name.append(createElement("strong", "", field.key), createElement("small", "", [field.tag, field.ifd].filter(Boolean).join(" · ")));
            row.append(name, createElement("td", "", field.value), createElement("td", "", field.source));
            body.append(row);
        });
    }

    function toggleJson() {
        const section = elements["exif-viewer-json"];
        section.hidden = !section.hidden;
        elements["exif-viewer-show-json"].textContent = section.hidden ? "JSON Olarak Gör" : "JSON'u Gizle";
        if (!section.hidden) section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }

    function jsonReport() {
        return state.analysis ? JSON.stringify(state.analysis.structured, null, 2) : "{}";
    }

    function createTextReport() {
        if (!state.analysis) return "";
        const analysis = state.analysis;
        const lines = [
            "EXIF VERİ RAPORU", "", `Dosya: ${analysis.file.name}`, `Format: ${analysis.label}`,
            `Boyut: ${analysis.file.sizeDisplay}`, `Çözünürlük: ${analysis.file.resolution}`,
            `Metadata: ${analysis.metadataCount} alan`, `Gizlilik Riski: ${analysis.privacy.label}`, "",
        ];
        const reportSections = [
            ["KAMERA", (field) => field.category === "camera"], ["GPS", (field) => field.category === "gps"],
            ["ÇEKİM", (field) => field.category === "capture"], ["TARİH", (field) => field.category === "date"],
            ["YAZILIM", (field) => field.category === "software"], ["TELİF VE YAZAR", (field) => field.category === "rights"],
            ["AÇIKLAMALAR", (field) => field.category === "description"], ["RENK / ICC", (field) => field.category === "color"],
            ["XMP", (field) => field.source === "XMP"], ["IPTC", (field) => field.source === "IPTC"],
            ["TEKNİK", (field) => ["technical", "png", "webp", "container"].includes(field.category)],
        ];
        reportSections.forEach(([title, predicate]) => {
            const fields = analysis.fields.filter(predicate);
            if (!fields.length) return;
            lines.push(title);
            fields.forEach((field) => lines.push(`${field.label} (${field.key}): ${field.value}`));
            lines.push("");
        });
        lines.push("CONTENT CREDENTIALS", analysis.contentCredentials.detected ? `Tespit edildi: ${analysis.contentCredentials.types.join(", ")}` : "Kayıt tespit edilmedi.", "", "Not: Bu rapor yalnızca dosyanın içinde gerçekten bulunan metadata bilgilerini gösterir; görselin üretim yöntemi hakkında pixel tabanlı tahmin yapmaz.");
        return lines.join("\n");
    }

    function downloadJson() {
        if (!state.analysis) return;
        downloadBlob(new Blob([jsonReport()], { type: "application/json;charset=utf-8" }), reportName("json"));
    }

    function downloadText() {
        if (!state.analysis) return;
        downloadBlob(new Blob([createTextReport()], { type: "text/plain;charset=utf-8" }), reportName("txt"));
    }

    function reportName(extension) {
        const name = safeName(state.file?.name || "fotoğraf");
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        return `${base || "fotoğraf"}-metadata.${extension}`;
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.rel = "noopener";
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    async function copyWithFeedback(text, button) {
        try {
            await copyText(text);
            const previous = button.textContent;
            button.textContent = "Kopyalandı";
            window.setTimeout(() => { button.textContent = previous; }, 1200);
        } catch {
            announce("Panoya kopyalanamadı.");
        }
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(String(text));
        const textarea = document.createElement("textarea");
        textarea.value = String(text);
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Kopyalama desteklenmiyor.");
    }

    function resetView(announceReset) {
        state.generation += 1;
        resetAnalysisState();
        state.file = null;
        elements["exif-viewer-upload"].hidden = false;
        elements["exif-viewer-status"].hidden = true;
        elements["exif-viewer-result"].hidden = true;
        elements["exif-viewer-error"].hidden = true;
        elements["exif-viewer-new"].hidden = true;
        elements["exif-viewer-json"].hidden = true;
        elements["exif-viewer-show-json"].textContent = "JSON Olarak Gör";
        elements["exif-viewer-progress"].style.width = "0%";
        if (announceReset) announce("Yeni fotoğraf analizi için hazır.");
    }

    function resetAnalysisState() {
        if (state.thumbnailUrl) URL.revokeObjectURL(state.thumbnailUrl);
        state.thumbnailUrl = "";
        state.analysis = null;
        elements["exif-viewer-summary"].replaceChildren();
        elements["exif-viewer-categories"].replaceChildren();
        elements["exif-viewer-raw-body"].replaceChildren();
        elements["exif-viewer-gps-alert"].replaceChildren();
        elements["exif-viewer-warnings"].replaceChildren();
    }

    function releaseResources() {
        if (state.thumbnailUrl) URL.revokeObjectURL(state.thumbnailUrl);
        state.worker?.terminate();
        state.pending.clear();
    }

    function riskLabel(level) {
        return ({ high: "Yüksek Risk", medium: "Orta Risk", low: "Düşük Risk", info: "Bilgi" })[level] || "Bilgi";
    }

    function normalizeSearch(value) {
        return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
    }

    function safeName(value) {
        return String(value || "").replace(/\\/g, "/").split("/").pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 220);
    }

    function createElement(tag, className = "", text = "") {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== "") element.textContent = text;
        return element;
    }

    function announce(message) {
        elements["exif-viewer-live"].textContent = "";
        window.setTimeout(() => { elements["exif-viewer-live"].textContent = message; }, 20);
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
})(window);
