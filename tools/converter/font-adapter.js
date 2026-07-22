(function initFontAdapter(root) {
    "use strict";

    const namespace = root.OmniConverter;
    if (!namespace?.Adapters) return;

    const { CategoryAdapter } = namespace.Adapters;
    const BASE_URL = new URL("tools/converter/vendor/fonteditor/", document.baseURI).href;
    const FONT_MODULE_URL = `${BASE_URL}fonteditor.js`;
    const PAKO_MODULE_URL = `${BASE_URL}pako.js`;
    const WOFF2_MODULE_URL = `${BASE_URL}woff2-encoder.js`;
    const MIME_TYPES = Object.freeze({
        ttf: "font/ttf",
        woff: "font/woff",
        woff2: "font/woff2",
        eot: "application/vnd.ms-fontobject",
    });
    let modulesPromise = null;

    class FontAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.ready = true;
        }

        async convert(item, settings, signal) {
            throwIfAborted(signal);
            const outputFormat = this.outputExtension(settings);
            try {
                const { fontEditor, pako, woff2Codec } = await loadModules();
                throwIfAborted(signal);
                let source = await item.sourceBlob.arrayBuffer();
                let inputFormat = item.extension;
                if (outputFormat === "woff2" && inputFormat === "woff2") {
                    return { blob: new Blob([source], { type: MIME_TYPES.woff2 }) };
                }
                if (outputFormat === "woff2" && ["ttf", "otf"].includes(inputFormat)) {
                    const compressed = toUint8Array(await woff2Codec.compress(source));
                    if (!compressed.byteLength) throw new Error("Yazı tipi motoru boş bir çıktı oluşturdu.");
                    return { blob: new Blob([compressed], { type: MIME_TYPES.woff2 }) };
                }
                if (inputFormat === "woff2") {
                    source = toArrayBuffer(await woff2Codec.decompress(source));
                    inputFormat = detectSfntType(source);
                }
                const font = fontEditor.createFont(source, {
                    type: inputFormat,
                    hinting: true,
                    kerning: true,
                    compound2simple: false,
                    inflate: (data) => pako.inflate(toUint8Array(data)),
                });
                const writeOptions = {
                    hinting: true,
                    kerning: true,
                    deflate: (data) => pako.deflate(toUint8Array(data)),
                };
                const output = outputFormat === "woff2"
                    ? await woff2Codec.compress(toUint8Array(font.write({ ...writeOptions, type: "ttf" })))
                    : font.write({ ...writeOptions, type: outputFormat });
                font.data = null;
                throwIfAborted(signal);
                const bytes = toUint8Array(output);
                if (!bytes.byteLength) throw new Error("Yazı tipi motoru boş bir çıktı oluşturdu.");
                return { blob: new Blob([bytes], { type: MIME_TYPES[outputFormat] || "application/octet-stream" }) };
            } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                throw new Error("Yazı tipi okunamadı veya seçilen biçime dönüştürülemedi.");
            }
        }

        outputExtension(settings) {
            const value = String(settings.outputFormat || "woff2").toLowerCase();
            return ["ttf", "woff", "woff2", "eot"].includes(value) ? value : "woff2";
        }

        outputNote() {
            return "Glifler, karakter eşlemeleri ve desteklenen yazı tipi meta verileri tarayıcı içinde korunarak yeniden yazılır.";
        }
    }

    function loadModules() {
        modulesPromise ||= Promise.all([import(FONT_MODULE_URL), import(PAKO_MODULE_URL), import(WOFF2_MODULE_URL)])
            .then(([fontEditor, pako, woff2Codec]) => ({ fontEditor, pako, woff2Codec }));
        return modulesPromise;
    }

    function toUint8Array(value) {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        if (Array.isArray(value) || Number.isSafeInteger(value?.length)) return Uint8Array.from(value);
        throw new Error("Yazı tipi motoru geçersiz bir çıktı oluşturdu.");
    }

    function toArrayBuffer(value) {
        const bytes = toUint8Array(value);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    function detectSfntType(buffer) {
        const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        return String.fromCharCode(...bytes) === "OTTO" ? "otf" : "ttf";
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    namespace.Adapters.register("font-wasm", (config) => new FontAdapter(config));
})(window);
