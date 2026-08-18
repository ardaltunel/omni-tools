(function initQrCodeScanner(root) {
    "use strict";

    const panel = document.getElementById("qr-code-scanner");
    if (!panel) return;

    const elements = {};
    [
        "qr-scanner-file-input", "qr-scanner-drop-zone", "qr-scanner-browse", "qr-scanner-camera-toggle",
        "qr-scanner-status", "qr-scanner-preview", "qr-scanner-preview-image", "qr-scanner-clear",
        "qr-scanner-result", "qr-scanner-result-empty", "qr-scanner-result-state", "qr-scanner-result-value",
        "qr-scanner-copy", "qr-scanner-open-link", "qr-scanner-camera", "qr-scanner-camera-close",
        "qr-scanner-camera-status", "qr-scanner-video", "qr-scanner-camera-canvas", "qr-scanner-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
    const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
    const MAX_SCAN_DIMENSION = 2200;
    const CAMERA_SCAN_INTERVAL = 180;
    const state = {
        dragDepth: 0,
        previewUrl: "",
        result: "",
        cameraStream: null,
        cameraFrame: 0,
        cameraSession: 0,
        cameraProcessing: false,
        lastCameraScanAt: 0,
        detector: null,
    };

    initialize();

    function initialize() {
        bindEvents();
        if (canUseCamera()) elements["qr-scanner-camera-toggle"].hidden = false;
    }

    function bindEvents() {
        const dropZone = elements["qr-scanner-drop-zone"];
        elements["qr-scanner-browse"].addEventListener("click", (event) => {
            event.stopPropagation();
            elements["qr-scanner-file-input"].click();
        });
        elements["qr-scanner-file-input"].addEventListener("change", (event) => {
            const [file] = Array.from(event.target.files || []);
            event.target.value = "";
            if (file) scanFile(file);
        });
        dropZone.addEventListener("click", (event) => {
            if (!event.target.closest("button")) elements["qr-scanner-file-input"].click();
        });
        dropZone.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (event.target.closest("button")) return;
            event.preventDefault();
            elements["qr-scanner-file-input"].click();
        });
        dropZone.addEventListener("dragenter", handleDragEnter);
        dropZone.addEventListener("dragover", handleDragOver);
        dropZone.addEventListener("dragleave", handleDragLeave);
        dropZone.addEventListener("drop", handleDrop);

        elements["qr-scanner-camera-toggle"].addEventListener("click", startCamera);
        elements["qr-scanner-camera-close"].addEventListener("click", stopCamera);
        elements["qr-scanner-clear"].addEventListener("click", clearScan);
        elements["qr-scanner-copy"].addEventListener("click", copyResult);
        elements["qr-scanner-open-link"].addEventListener("click", openResultLink);
        document.addEventListener("paste", handlePaste);
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopCamera();
        });
        window.addEventListener("beforeunload", releaseResources);

        new MutationObserver(() => {
            if (!panel.classList.contains("active")) stopCamera();
        }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    }

    function handleDragEnter(event) {
        event.preventDefault();
        state.dragDepth += 1;
        elements["qr-scanner-drop-zone"].classList.add("is-dragging");
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event) {
        event.preventDefault();
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (!state.dragDepth) elements["qr-scanner-drop-zone"].classList.remove("is-dragging");
    }

    function handleDrop(event) {
        event.preventDefault();
        state.dragDepth = 0;
        elements["qr-scanner-drop-zone"].classList.remove("is-dragging");
        const [file] = Array.from(event.dataTransfer?.files || []);
        if (file) scanFile(file);
    }

    function handlePaste(event) {
        if (!panel.classList.contains("active")) return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
        const item = Array.from(event.clipboardData?.items || []).find((candidate) => candidate.kind === "file");
        const file = item?.getAsFile();
        if (!file) return;
        event.preventDefault();
        scanFile(file);
    }

    async function scanFile(file) {
        stopCamera();
        if (!isAcceptedImage(file)) {
            showError("Yalnızca PNG, JPG, JPEG veya WEBP formatındaki görselleri tarayabilirsiniz.");
            return;
        }

        clearResult();
        setStatus("Görsel taranıyor…", "loading");
        showPreview(file);

        try {
            const source = await loadImageSource(file);
            try {
                const decoded = await decodeSource(source);
                if (!decoded) throw new NoQrCodeError();
                showResult(decoded, "Görsel başarıyla tarandı.");
            } finally {
                source.close?.();
            }
        } catch (error) {
            if (error instanceof NoQrCodeError) {
                showError("Bu görselde okunabilir bir QR kod bulunamadı. Kodun net ve tamamının görünür olduğundan emin olun.");
            } else {
                showError("Görsel okunamadı. Lütfen geçerli bir PNG, JPG, JPEG veya WEBP dosyası seçin.");
            }
        }
    }

    async function loadImageSource(file) {
        if (typeof root.createImageBitmap === "function") return root.createImageBitmap(file);

        const image = new Image();
        const sourceUrl = URL.createObjectURL(file);
        try {
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = sourceUrl;
            });
            return image;
        } finally {
            URL.revokeObjectURL(sourceUrl);
        }
    }

    async function decodeSource(source) {
        const nativeResult = await decodeWithBarcodeDetector(source);
        if (nativeResult) return nativeResult;

        if (typeof root.jsQR !== "function") {
            throw new Error("QR decoder unavailable");
        }

        const { canvas, context } = createScanCanvas(source);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = root.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
        return result?.data || "";
    }

    async function decodeWithBarcodeDetector(source) {
        if (!("BarcodeDetector" in root)) return "";
        try {
            if (!state.detector) state.detector = new root.BarcodeDetector({ formats: ["qr_code"] });
            const results = await state.detector.detect(source);
            return results.find((item) => item.rawValue)?.rawValue || "";
        } catch {
            return "";
        }
    }

    function createScanCanvas(source) {
        const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
        const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
        if (!sourceWidth || !sourceHeight) throw new Error("Image dimensions unavailable");

        const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas unavailable");
        canvas.width = width;
        canvas.height = height;
        context.drawImage(source, 0, 0, width, height);
        return { canvas, context };
    }

    function showPreview(file) {
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = URL.createObjectURL(file);
        elements["qr-scanner-preview-image"].src = state.previewUrl;
        elements["qr-scanner-preview"].hidden = false;
        panel.classList.add("has-preview");
    }

    function clearScan() {
        stopCamera();
        clearResult();
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = "";
        elements["qr-scanner-preview-image"].removeAttribute("src");
        elements["qr-scanner-preview"].hidden = true;
        panel.classList.remove("has-preview");
        setStatus("Dosyanız yalnızca bu cihazda işlenir.");
        announce("Tarama temizlendi.");
    }

    function clearResult() {
        state.result = "";
        panel.classList.remove("has-result");
        elements["qr-scanner-result-value"].textContent = "";
        elements["qr-scanner-result"].hidden = true;
        elements["qr-scanner-result-empty"].hidden = false;
        setResultState("Hazır");
        elements["qr-scanner-open-link"].hidden = true;
        elements["qr-scanner-copy"].textContent = "İçeriği Kopyala";
    }

    function showResult(value, statusMessage) {
        state.result = value;
        elements["qr-scanner-result-value"].textContent = value;
        elements["qr-scanner-result"].hidden = false;
        elements["qr-scanner-result-empty"].hidden = true;
        elements["qr-scanner-open-link"].hidden = !getSafeHttpUrl(value);
        panel.classList.add("has-result");
        setResultState("Bulundu", "success");
        setStatus(statusMessage, "success");
        announce(`QR kod bulundu: ${value}`);
    }

    function showError(message) {
        clearResult();
        setResultState("Bulunamadı", "error");
        setStatus(message, "error");
        announce(message);
    }

    function setStatus(message, type = "") {
        const status = elements["qr-scanner-status"];
        status.textContent = message;
        status.classList.toggle("is-loading", type === "loading");
        status.classList.toggle("is-success", type === "success");
        status.classList.toggle("is-error", type === "error");
    }

    function setResultState(message, type = "") {
        const resultState = elements["qr-scanner-result-state"];
        resultState.textContent = message;
        resultState.classList.toggle("is-success", type === "success");
        resultState.classList.toggle("is-error", type === "error");
    }

    async function copyResult() {
        if (!state.result) return;
        try {
            await writeToClipboard(state.result);
            elements["qr-scanner-copy"].textContent = "Kopyalandı";
            announce("QR içeriği panoya kopyalandı.");
            root.setTimeout(() => {
                if (state.result) elements["qr-scanner-copy"].textContent = "İçeriği Kopyala";
            }, 1800);
        } catch {
            setStatus("İçerik panoya kopyalanamadı. Lütfen metni seçip manuel olarak kopyalayın.", "error");
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

    function openResultLink() {
        const url = getSafeHttpUrl(state.result);
        if (!url) return;
        const newWindow = root.open(url.href, "_blank", "noopener,noreferrer");
        if (newWindow) newWindow.opener = null;
    }

    function getSafeHttpUrl(value) {
        try {
            const url = new URL(String(value).trim());
            return ["http:", "https:"].includes(url.protocol) ? url : null;
        } catch {
            return null;
        }
    }

    async function startCamera() {
        if (!canUseCamera()) {
            setStatus("Bu tarayıcı kamera erişimini desteklemiyor. Görsel yükleyerek devam edebilirsiniz.", "error");
            return;
        }
        if (state.cameraStream) return;

        stopCamera();
        clearResult();
        elements["qr-scanner-camera"].hidden = false;
        elements["qr-scanner-camera-status"].textContent = "Kamera başlatılıyor…";
        elements["qr-scanner-camera-toggle"].disabled = true;
        const session = ++state.cameraSession;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: "environment" } },
            });
            if (session !== state.cameraSession) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            state.cameraStream = stream;
            const video = elements["qr-scanner-video"];
            video.srcObject = stream;
            await video.play();
            elements["qr-scanner-camera-status"].textContent = "QR kodu çerçevenin içinde tutun.";
            setStatus("Kamera ile QR kod aranıyor…", "loading");
            queueCameraScan(session);
        } catch (error) {
            elements["qr-scanner-camera"].hidden = true;
            const message = error?.name === "NotAllowedError"
                ? "Kamera izni verilmedi. İzin vererek tekrar deneyin veya görsel yükleyin."
                : "Kamera başlatılamadı. Görsel yükleyerek devam edebilirsiniz.";
            setStatus(message, "error");
            announce(message);
        } finally {
            elements["qr-scanner-camera-toggle"].disabled = false;
        }
    }

    function queueCameraScan(session) {
        state.cameraFrame = root.requestAnimationFrame(async () => {
            if (session !== state.cameraSession || !state.cameraStream) return;
            const now = root.performance.now();
            if (!state.cameraProcessing && now - state.lastCameraScanAt >= CAMERA_SCAN_INTERVAL) {
                state.cameraProcessing = true;
                state.lastCameraScanAt = now;
                try {
                    const decoded = await decodeCameraFrame();
                    if (decoded) {
                        showResult(decoded, "QR kod kamerayla tarandı.");
                        stopCamera();
                        return;
                    }
                } catch {
                    // A transient video frame failure should not end camera scanning.
                } finally {
                    state.cameraProcessing = false;
                }
            }
            queueCameraScan(session);
        });
    }

    async function decodeCameraFrame() {
        const video = elements["qr-scanner-video"];
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return "";

        const nativeResult = await decodeWithBarcodeDetector(video);
        if (nativeResult) return nativeResult;
        if (typeof root.jsQR !== "function") return "";

        const canvas = elements["qr-scanner-camera-canvas"];
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) return "";
        const scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return "";
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        return root.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" })?.data || "";
    }

    function stopCamera() {
        state.cameraSession += 1;
        if (state.cameraFrame) root.cancelAnimationFrame(state.cameraFrame);
        state.cameraFrame = 0;
        state.cameraProcessing = false;
        if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
        const video = elements["qr-scanner-video"];
        if (video.srcObject) video.srcObject = null;
        elements["qr-scanner-camera"].hidden = true;
        elements["qr-scanner-camera-toggle"].disabled = false;
    }

    function canUseCamera() {
        return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    function isAcceptedImage(file) {
        if (!(file instanceof File)) return false;
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(extension);
    }

    function announce(message) {
        elements["qr-scanner-live"].textContent = message;
    }

    function releaseResources() {
        stopCamera();
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    }

    class NoQrCodeError extends Error {}
}(window));
