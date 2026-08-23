"use strict";

importScripts("core.js?v=3");

self.addEventListener("message", (event) => {
    const { id, action, buffer, files } = event.data || {};
    try {
        if (!id) throw new Error("İşlem kimliği eksik.");
        if (action === "zip") {
            const output = self.MetadataCleanerCore.createZip(files);
            self.postMessage({ id, ok: true, output }, [output]);
            return;
        }
        if (!(buffer instanceof ArrayBuffer)) throw new Error("İşlenecek dosya verisi eksik.");
        if (action === "inspect") {
            const analysis = self.MetadataCleanerCore.inspect(buffer);
            self.postMessage({ id, ok: true, analysis });
            return;
        }
        if (action === "clean") {
            const result = self.MetadataCleanerCore.clean(buffer);
            self.postMessage({ id, ok: true, ...result }, [result.output]);
            return;
        }
        throw new Error("Bilinmeyen worker işlemi.");
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: error instanceof Error ? error.message : "Dosya işlenemedi.",
        });
    }
});
