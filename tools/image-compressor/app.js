(function initImageCompressor(root) {
    "use strict";

    const panel = document.getElementById("image-compressor");
    if (!panel) return;

    const elements = {};
    [
        "image-compressor-file-input", "image-compressor-drop-zone", "image-compressor-browse",
        "image-compressor-status", "image-compressor-options", "image-compressor-quality",
        "image-compressor-quality-value", "image-compressor-format-note", "image-compressor-original-preview",
        "image-compressor-original-image", "image-compressor-clear", "image-compressor-result-state",
        "image-compressor-result-empty", "image-compressor-result", "image-compressor-summary",
        "image-compressor-original-size", "image-compressor-compressed-size", "image-compressor-savings",
        "image-compressor-output-image", "image-compressor-download", "image-compressor-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
    const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
    const state = {
        file: null,
        image: null,
        sourceUrl: "",
        outputUrl: "",
        outputBlob: null,
        outputName: "",
        processToken: 0,
        qualityTimer: null,
    };

    bindEvents();

    function bindEvents() {
        elements["image-compressor-browse"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["image-compressor-file-input"].click();
        });
        elements["image-compressor-file-input"].addEventListener("change", () => handleFiles(elements["image-compressor-file-input"].files));
        elements["image-compressor-clear"].addEventListener("click", clearImage);
        elements["image-compressor-download"].addEventListener("click", downloadCompressedImage);
        elements["image-compressor-quality"].addEventListener("input", handleQualityInput);

        elements["image-compressor-drop-zone"].addEventListener("click", () => elements["image-compressor-file-input"].click());
        elements["image-compressor-drop-zone"].addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            elements["image-compressor-file-input"].click();
        });
        ["dragenter", "dragover"].forEach((eventName) => {
            elements["image-compressor-drop-zone"].addEventListener(eventName, (event) => {
                event.preventDefault();
                elements["image-compressor-drop-zone"].classList.add("is-dragging");
            });
        });
        ["dragleave", "drop"].forEach((eventName) => {
            elements["image-compressor-drop-zone"].addEventListener(eventName, (event) => {
                event.preventDefault();
                elements["image-compressor-drop-zone"].classList.remove("is-dragging");
            });
        });
        elements["image-compressor-drop-zone"].addEventListener("drop", (event) => handleFiles(event.dataTransfer?.files));
    }

    async function handleFiles(fileList) {
        const file = fileList?.[0];
        if (!file) return;
        if (!isSupportedImage(file)) {
            showError("JPG, JPEG, PNG veya WEBP formatında geçerli bir görsel seçin.");
            return;
        }
        if (!file.size) {
            showError("Seçilen görsel boş görünüyor. Lütfen farklı bir dosya deneyin.");
            return;
        }

        disposeCurrentImage();
        const token = ++state.processToken;
        state.file = file;
        state.sourceUrl = URL.createObjectURL(file);
        setStatus("Görsel hazırlanıyor…", "processing");
        setResultState("Hazırlanıyor", "processing");

        try {
            state.image = await loadImage(state.sourceUrl);
            if (token !== state.processToken) return;
            renderOriginalImage();
            elements["image-compressor-options"].hidden = false;
            setFormatNote();
            await compressImage();
        } catch {
            if (token !== state.processToken) return;
            showError("Görsel okunamadı. Lütfen desteklenen başka bir dosya deneyin.");
        }
    }

    function isSupportedImage(file) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        return ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(extension);
    }

    function loadImage(sourceUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Image load failed"));
            image.src = sourceUrl;
        });
    }

    function handleQualityInput() {
        const quality = Number(elements["image-compressor-quality"].value);
        elements["image-compressor-quality-value"].value = `${quality}%`;
        elements["image-compressor-quality-value"].textContent = `${quality}%`;
        if (!state.image) return;

        if (state.qualityTimer) root.clearTimeout(state.qualityTimer);
        state.qualityTimer = root.setTimeout(() => {
            state.qualityTimer = null;
            compressImage();
        }, 150);
    }

    async function compressImage() {
        if (!state.file || !state.image) return;
        const token = ++state.processToken;
        const quality = Number(elements["image-compressor-quality"].value) / 100;
        const target = getTargetFormat(state.file);
        setStatus("Görsel sıkıştırılıyor…", "processing");
        setResultState("Sıkıştırılıyor", "processing");

        try {
            const canvas = document.createElement("canvas");
            canvas.width = state.image.naturalWidth || state.image.width;
            canvas.height = state.image.naturalHeight || state.image.height;
            const context = canvas.getContext("2d", { alpha: target.type === "image/webp" });
            if (!context || !canvas.width || !canvas.height) throw new Error("Canvas unavailable");
            context.drawImage(state.image, 0, 0, canvas.width, canvas.height);
            const encodedBlob = await canvasToBlob(canvas, target.type, quality);
            if (token !== state.processToken) return;

            const useOriginal = encodedBlob.size >= state.file.size;
            const outputBlob = useOriginal ? state.file : encodedBlob;
            const outputType = useOriginal ? state.file.type : encodedBlob.type;
            setOutput(outputBlob, createOutputName(state.file, outputType, useOriginal), useOriginal);
            renderResult(useOriginal);
        } catch {
            if (token !== state.processToken) return;
            showError("Görsel sıkıştırılamadı. Lütfen daha küçük veya farklı bir görsel deneyin.");
        }
    }

    function getTargetFormat(file) {
        if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
            return { type: "image/webp", label: "WEBP" };
        }
        if (file.type === "image/webp" || file.name.toLowerCase().endsWith(".webp")) {
            return { type: "image/webp", label: "WEBP" };
        }
        return { type: "image/jpeg", label: "JPG" };
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Encoding failed"));
            }, type, quality);
        });
    }

    function createOutputName(file, type, useOriginal) {
        if (useOriginal) return file.name;
        const baseName = file.name.replace(/\.[^/.]+$/, "") || "compressed-image";
        const extension = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
        return `${baseName}-compressed.${extension}`;
    }

    function setFormatNote() {
        const target = getTargetFormat(state.file);
        const isPng = target.type === "image/webp" && state.file.type === "image/png";
        elements["image-compressor-format-note"].textContent = isPng
            ? "PNG görseller şeffaflık korunarak WEBP olarak sıkıştırılır."
            : `Çıkış formatı: ${target.label}.`;
    }

    function setOutput(blob, fileName, useOriginal) {
        if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
        state.outputBlob = blob;
        state.outputName = fileName;
        state.outputUrl = URL.createObjectURL(blob);
        state.usedOriginal = useOriginal;
    }

    function renderOriginalImage() {
        elements["image-compressor-original-image"].src = state.sourceUrl;
        elements["image-compressor-original-preview"].hidden = false;
    }

    function renderResult(useOriginal) {
        const originalSize = state.file.size;
        const outputSize = state.outputBlob.size;
        const savedBytes = Math.max(0, originalSize - outputSize);
        const savedPercent = originalSize ? (savedBytes / originalSize) * 100 : 0;
        elements["image-compressor-original-size"].textContent = formatBytes(originalSize);
        elements["image-compressor-compressed-size"].textContent = formatBytes(outputSize);
        elements["image-compressor-savings"].textContent = savedBytes ? `%${formatPercent(savedPercent)}` : "%0";
        elements["image-compressor-output-image"].src = state.outputUrl;
        elements["image-compressor-output-image"].alt = `${state.outputName} sıkıştırılmış görsel önizlemesi`;
        elements["image-compressor-summary"].textContent = useOriginal
            ? "Bu kalite ayarında daha küçük bir çıktı oluşmadı; orijinal görsel korunuyor."
            : `${formatBytes(savedBytes)} alan kazanıldı.`;
        elements["image-compressor-result"].hidden = false;
        elements["image-compressor-result-empty"].hidden = true;
        setStatus(useOriginal ? "Orijinal kalite ve boyut korundu." : "Görsel başarıyla sıkıştırıldı.", "success");
        setResultState(useOriginal ? "Korundu" : "Sıkıştırıldı", "success");
        announce(useOriginal
            ? "Daha küçük bir çıktı üretilemedi; orijinal görsel korunuyor."
            : `Görsel sıkıştırıldı. Yüzde ${formatPercent(savedPercent)} alan kazanıldı.`);
    }

    function showError(message) {
        elements["image-compressor-result"].hidden = true;
        elements["image-compressor-result-empty"].hidden = false;
        setStatus(message, "error");
        setResultState("Hata", "error");
        announce(message);
    }

    function clearImage() {
        disposeCurrentImage();
        elements["image-compressor-file-input"].value = "";
        elements["image-compressor-options"].hidden = true;
        elements["image-compressor-original-preview"].hidden = true;
        elements["image-compressor-result"].hidden = true;
        elements["image-compressor-result-empty"].hidden = false;
        elements["image-compressor-original-image"].removeAttribute("src");
        elements["image-compressor-output-image"].removeAttribute("src");
        setStatus("Görseliniz yalnızca bu cihazda işlenir.");
        setResultState("Hazır");
        announce("Görsel seçimi temizlendi.");
    }

    function disposeCurrentImage() {
        state.processToken += 1;
        if (state.qualityTimer) root.clearTimeout(state.qualityTimer);
        state.qualityTimer = null;
        if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
        if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
        state.file = null;
        state.image = null;
        state.sourceUrl = "";
        state.outputUrl = "";
        state.outputBlob = null;
        state.outputName = "";
    }

    function downloadCompressedImage() {
        if (!state.outputBlob || !state.outputUrl) return;
        const anchor = document.createElement("a");
        anchor.href = state.outputUrl;
        anchor.download = state.outputName;
        anchor.click();
        announce("Sıkıştırılmış görsel indiriliyor.");
    }

    function setStatus(message, type = "") {
        const status = elements["image-compressor-status"];
        status.textContent = message;
        status.classList.toggle("is-processing", type === "processing");
        status.classList.toggle("is-success", type === "success");
        status.classList.toggle("is-error", type === "error");
    }

    function setResultState(message, type = "") {
        const resultState = elements["image-compressor-result-state"];
        resultState.textContent = message;
        resultState.classList.toggle("is-processing", type === "processing");
        resultState.classList.toggle("is-success", type === "success");
        resultState.classList.toggle("is-error", type === "error");
    }

    function formatBytes(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / (1024 ** index);
        return `${value.toLocaleString("tr-TR", { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${units[index]}`;
    }

    function formatPercent(value) {
        return value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
    }

    function announce(message) {
        elements["image-compressor-live"].textContent = message;
    }
}(window));
