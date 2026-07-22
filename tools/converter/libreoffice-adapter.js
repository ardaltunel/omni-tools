(function initLibreOfficeAdapter(root) {
    "use strict";

    const namespace = root.OmniConverter;
    if (!namespace?.Adapters) return;

    const { CategoryAdapter } = namespace.Adapters;
    const BASE_URL = new URL("tools/converter/vendor/libreoffice/", document.baseURI).href;
    const MODULE_URL = `${BASE_URL}browser.js`;
    const WASM_PARTS = [`${BASE_URL}soffice.wasm.part1`, `${BASE_URL}soffice.wasm.part2`];
    const MIME_TYPES = Object.freeze({
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        odt: "application/vnd.oasis.opendocument.text",
        rtf: "application/rtf",
        txt: "text/plain;charset=utf-8",
        html: "text/html;charset=utf-8",
        csv: "text/csv;charset=utf-8",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ods: "application/vnd.oasis.opendocument.spreadsheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        odp: "application/vnd.oasis.opendocument.presentation",
    });
    const WRITER_OUTPUTS = new Set(["docx", "odt", "rtf", "txt", "html"]);

    class LibreOfficeRuntime {
        constructor() {
            this.instance = null;
            this.loadPromise = null;
            this.modulePromise = null;
            this.wasmUrl = "";
            this.queue = Promise.resolve();
        }

        run(signal, task) {
            const operation = this.queue.then(async () => {
                throwIfAborted(signal);
                const converter = await this.load();
                throwIfAborted(signal);
                const abort = () => this.terminate(converter);
                signal?.addEventListener("abort", abort, { once: true });
                try {
                    return await task(converter);
                } catch (error) {
                    if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                    throw error;
                } finally {
                    signal?.removeEventListener("abort", abort);
                }
            });
            this.queue = operation.catch(() => {});
            return operation;
        }

        async load() {
            if (this.instance?.isReady()) return this.instance;
            if (this.loadPromise) return this.loadPromise;
            if (!root.crossOriginIsolated || typeof SharedArrayBuffer !== "function") {
                throw new Error("Belge motoru için güvenli tarayıcı yalıtımı hazırlanamadı. Sayfayı bir kez yenileyip tekrar deneyin.");
            }

            this.loadPromise = (async () => {
                const [{ WorkerBrowserConverter }, wasmUrl] = await Promise.all([
                    this.loadModule(),
                    this.loadWasmUrl(),
                ]);
                const converter = new WorkerBrowserConverter({
                    browserWorkerJs: `${BASE_URL}browser.worker.global.js`,
                    sofficeJs: `${BASE_URL}soffice.js`,
                    sofficeWasm: wasmUrl,
                    sofficeData: `${BASE_URL}soffice.data`,
                    sofficeWorkerJs: `${BASE_URL}soffice.worker.js`,
                    verbose: false,
                });
                this.instance = converter;
                await converter.initialize();
                return converter;
            })().catch((error) => {
                this.terminate(this.instance);
                if (/yalıtımı/.test(error?.message || "")) throw error;
                throw new Error("LibreOffice belge motoru yüklenemedi. Bağlantınızı denetleyip tekrar deneyin.");
            });
            return this.loadPromise;
        }

        loadModule() {
            this.modulePromise ||= import(MODULE_URL);
            return this.modulePromise;
        }

        async loadWasmUrl() {
            if (this.wasmUrl) return this.wasmUrl;
            const responses = await Promise.all(WASM_PARTS.map((url) => fetch(url)));
            if (responses.some((response) => !response.ok)) {
                throw new Error("LibreOffice çekirdek dosyaları alınamadı.");
            }
            const parts = await Promise.all(responses.map((response) => response.blob()));
            this.wasmUrl = URL.createObjectURL(new Blob(parts, { type: "application/wasm" }));
            return this.wasmUrl;
        }

        convertBlob(blob, outputFormat, fileName, signal) {
            return this.run(signal, async (converter) => {
                const input = new Uint8Array(await blob.arrayBuffer());
                let result;
                if (fileName.toLowerCase().endsWith(".pdf") && WRITER_OUTPUTS.has(outputFormat)) {
                    const intermediate = await converter.convert(input, { outputFormat: "html" }, fileName);
                    throwIfAborted(signal);
                    result = await converter.convert(intermediate.data, { outputFormat }, replaceExtension(fileName, "html"));
                } else {
                    result = await converter.convert(input, { outputFormat }, fileName);
                }
                if (!result?.data?.length) throw new Error("Belge motoru boş bir çıktı oluşturdu.");
                return {
                    blob: new Blob([result.data], { type: result.mimeType || MIME_TYPES[outputFormat] || "application/octet-stream" }),
                    filename: result.filename,
                };
            });
        }

        terminate(converter = this.instance) {
            if (!converter) return;
            try {
                converter.pendingRequests?.forEach(({ reject }) => reject(createAbortError()));
                converter.pendingRequests?.clear();
                converter.worker?.terminate();
            } catch (_) {
                // Worker daha önce kapanmış olabilir.
            }
            if (this.instance === converter) {
                this.instance = null;
                this.loadPromise = null;
            }
        }
    }

    class LibreOfficeAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.ready = true;
            this.previewKind = "file";
        }

        async convert(item, settings, signal) {
            const outputFormat = this.outputExtension(settings);
            const prepared = await prepareInput(item, signal);
            try {
                return await runtime.convertBlob(prepared.blob, outputFormat, prepared.name, signal);
            } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                if (/güvenli tarayıcı yalıtımı|yüklenemedi/.test(error?.message || "")) throw error;
                throw new Error("Bu belge, seçilen çıkış biçimine dönüştürülemedi. Dosyanın bozuk olmadığını ve biçimlerin uyumlu olduğunu denetleyin.");
            }
        }

        outputExtension(settings) {
            return String(settings.outputFormat || (this.config.id === "presentation" ? "pdf" : "pdf"))
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
        }

        outputNote() {
            return "LibreOffice çekirdeği ilk dönüşümde bir kez yüklenir; sonraki belge ve sunumlar aynı oturumda işlenir.";
        }
    }

    async function prepareInput(item, signal) {
        throwIfAborted(signal);
        if (!["md", "markdown"].includes(item.extension)) {
            return { blob: item.sourceBlob, name: item.file.name };
        }
        const markdown = await item.sourceBlob.text();
        const html = markdownToHtml(markdown, item.file.name);
        return {
            blob: new Blob([html], { type: "text/html;charset=utf-8" }),
            name: replaceExtension(item.file.name, "html"),
        };
    }

    function markdownToHtml(markdown, fileName) {
        const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
        const body = [];
        let inList = false;
        for (const sourceLine of lines) {
            const line = sourceLine.trimEnd();
            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            const listItem = line.match(/^[-*+]\s+(.+)$/);
            if (listItem) {
                if (!inList) body.push("<ul>");
                inList = true;
                body.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
                continue;
            }
            if (inList) {
                body.push("</ul>");
                inList = false;
            }
            if (heading) body.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
            else if (line.trim()) body.push(`<p>${inlineMarkdown(line)}</p>`);
        }
        if (inList) body.push("</ul>");
        const title = escapeHtml(fileName.replace(/\.[^.]+$/, ""));
        return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title></head><body>${body.join("\n")}</body></html>`;
    }

    function inlineMarkdown(value) {
        return escapeHtml(value)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/_(.+?)_/g, "<em>$1</em>")
            .replace(/`(.+?)`/g, "<code>$1</code>");
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character]);
    }

    function replaceExtension(name, extension) {
        return `${String(name || "belge").replace(/\.[^.]+$/, "")}.${extension}`;
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    const runtime = new LibreOfficeRuntime();
    namespace.Adapters.register("libreoffice-wasm", (config) => new LibreOfficeAdapter(config));
    namespace.LibreOfficeRuntime = runtime;
})(window);
