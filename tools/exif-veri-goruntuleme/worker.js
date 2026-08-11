"use strict";

importScripts("core.js?v=1");

self.addEventListener("message", (event) => {
    const { id, action, buffer, fileInfo } = event.data || {};
    try {
        if (!id || action !== "analyze" || !(buffer instanceof ArrayBuffer)) throw new Error("Analiz isteği geçersiz.");
        self.postMessage({ id, type: "progress", message: "EXIF verileri aranıyor..." });
        self.postMessage({ id, type: "progress", message: "Metadata analiz ediliyor..." });
        const analysis = self.ExifViewerCore.analyze(buffer, fileInfo || {});
        self.postMessage({ id, type: "result", ok: true, analysis });
    } catch (error) {
        self.postMessage({
            id,
            type: "result",
            ok: false,
            error: error instanceof Error ? error.message : "Dosya analiz edilemedi.",
        });
    }
});
