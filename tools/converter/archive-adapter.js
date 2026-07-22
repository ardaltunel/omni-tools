(function initArchiveAdapter(root) {
    "use strict";

    const namespace = root.OmniConverter;
    if (!namespace?.Adapters) return;

    const { CategoryAdapter } = namespace.Adapters;
    const services = namespace.Services;
    const BASE_URL = new URL("tools/converter/vendor/libarchive/", document.baseURI).href;
    const MODULE_URL = `${BASE_URL}libarchive.js`;
    const WORKER_URL = `${BASE_URL}worker-bundle.js?v=2`;
    const WRITER_WORKER_URL = new URL("tools/converter/vendor/sevenzip/sevenzip-worker.js?v=3", document.baseURI).href;
    const MAX_ENTRY_COUNT = 10_000;
    const MAX_EXTRACTED_SIZE = 2 * 1024 * 1024 * 1024;
    const OUTPUT_MIME_TYPES = Object.freeze({
        zip: "application/zip",
        "7z": "application/x-7z-compressed",
        tar: "application/x-tar",
        "tar.gz": "application/gzip",
    });

    class ArchiveRuntime {
        constructor() {
            this.modulePromise = null;
            this.queue = Promise.resolve();
        }

        load() {
            this.modulePromise ||= import(MODULE_URL).then((module) => {
                module.Archive.init({ workerUrl: WORKER_URL });
                return module;
            });
            return this.modulePromise;
        }

        run(signal, task) {
            return this.enqueue(signal, async () => task(await this.load()));
        }

        enqueue(signal, task) {
            const operation = this.queue.then(async () => {
                throwIfAborted(signal);
                return task();
            });
            this.queue = operation.catch(() => {});
            return operation;
        }

        async extract(file, signal) {
            return this.run(signal, async ({ Archive }) => {
                const archive = await Archive.open(file);
                try {
                    if (await archive.hasEncryptedData()) {
                        throw new Error("Parolalı arşivler güvenlik nedeniyle desteklenmiyor.");
                    }
                    const listed = await archive.getFilesArray();
                    if (listed.length > MAX_ENTRY_COUNT) throw new Error("Arşiv çok fazla dosya içeriyor.");
                    const total = listed.reduce((sum, entry) => sum + Number(entry.file?.size || 0), 0);
                    if (total > MAX_EXTRACTED_SIZE) throw new Error("Arşivin açılmış boyutu 2 GB sınırını aşıyor.");

                    const extracted = await archive.extractFiles();
                    throwIfAborted(signal);
                    return flattenExtractedFiles(extracted);
                } finally {
                    await archive.close();
                }
            });
        }

        async write(files, outputFormat, outputName, compression, signal) {
            return this.enqueue(signal, async () => {
                const payload = await Promise.all(files.map(async (entry) => ({
                    pathname: entry.pathname,
                    data: await entry.file.arrayBuffer(),
                })));
                throwIfAborted(signal);
                const result = await runWriterWorker({ files: payload, outputFormat, outputName, compression }, signal);
                const output = new Blob([result], {
                    type: OUTPUT_MIME_TYPES[outputFormat] || "application/octet-stream",
                });
                if (!output.size) throw new Error("Arşiv motoru boş bir çıktı oluşturdu.");
                return output;
            });
        }
    }

    class ArchiveAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.ready = true;
        }

        async convert(item, settings, signal) {
            const outputFormat = this.outputExtension(settings);
            const outputName = services.replaceExtension(item.file.name, outputFormat);
            try {
                const files = settings.operation === "compress"
                    ? [{ file: item.sourceBlob, pathname: safeArchivePath(item.file.name) }]
                    : await runtime.extract(item.sourceBlob, signal);
                if (!files.length) throw new Error("Arşivde dönüştürülecek dosya bulunamadı.");
                return { blob: await runtime.write(files, outputFormat, outputName, settings.compression, signal) };
            } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                if (/Parolalı|fazla dosya|2 GB|bulunamadı/.test(error?.message || "")) throw error;
                throw new Error("Arşiv açılamadı veya seçilen biçimde yeniden paketlenemedi.");
            }
        }

        outputExtension(settings) {
            const format = String(settings.outputFormat || "zip").toLowerCase();
            return ["zip", "7z", "tar", "tar.gz"].includes(format) ? format : "zip";
        }

        outputNote(settings) {
            return settings.operation === "compress"
                ? "Seçilen dosya yeni bir arşiv içine alınır; mevcut bir arşivi dönüştürmek için Yeniden paketle seçeneğini kullanın."
                : "Arşiv güvenli biçimde açılır ve seçtiğiniz arşiv biçiminde yeniden paketlenir.";
        }
    }

    function safeArchivePath(path) {
        const parts = String(path || "dosya")
            .replace(/\\/g, "/")
            .split("/")
            .filter((part) => part && part !== "." && part !== "..")
            .map((part) => services.sanitizeBaseName(part));
        return parts.join("/") || "dosya";
    }

    function flattenExtractedFiles(value, parentPath = "") {
        const entries = [];
        Object.entries(value || {}).forEach(([name, child]) => {
            const path = parentPath ? `${parentPath}/${name}` : name;
            if (child instanceof File || child instanceof Blob) entries.push({ file: child, pathname: safeArchivePath(path) });
            else if (child && typeof child === "object") entries.push(...flattenExtractedFiles(child, path));
        });
        return entries;
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function runWriterWorker(payload, signal) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(WRITER_WORKER_URL, { type: "module" });
            let settled = false;

            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener("abort", handleAbort);
                worker.terminate();
                callback(value);
            };
            const handleAbort = () => finish(reject, createAbortError());

            worker.addEventListener("message", (event) => {
                if (event.data?.ok) finish(resolve, event.data.output);
                else finish(reject, new Error(event.data?.message || "Arşiv oluşturulamadı."));
            }, { once: true });
            worker.addEventListener("error", () => {
                finish(reject, new Error("Arşiv motoru başlatılamadı."));
            }, { once: true });
            signal?.addEventListener("abort", handleAbort, { once: true });

            const transfers = payload.files.map((entry) => entry.data);
            worker.postMessage(payload, transfers);
        });
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    const runtime = new ArchiveRuntime();
    namespace.Adapters.register("archive-wasm", (config) => new ArchiveAdapter(config));
    namespace.ArchiveRuntime = runtime;
})(window);
