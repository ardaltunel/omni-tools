(function initAtsCvParser(root) {
    "use strict";

    const MAX_FILE_SIZE = 12 * 1024 * 1024;
    const MAX_PDF_PAGES = 80;
    const MAX_TEXT_LENGTH = 600000;
    const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const supportedExtensions = Object.freeze(["pdf", "docx", "txt"]);

    function getExtension(fileName) {
        return String(fileName || "").split(".").pop()?.toLocaleLowerCase("tr-TR") || "";
    }

    function validateFile(file) {
        if (!file) throw new Error("Önce analiz edilecek CV dosyasını seçin.");
        const extension = getExtension(file.name);
        if (!supportedExtensions.includes(extension)) throw new Error("Desteklenmeyen dosya türü. PDF, DOCX veya TXT dosyası seçin.");
        if (!file.size) throw new Error("Seçilen dosya boş görünüyor.");
        if (file.size > MAX_FILE_SIZE) throw new Error("Dosya 12 MB sınırını aşıyor. Daha küçük bir CV dosyası seçin.");
        return extension;
    }

    async function parseFile(file, onProgress = () => {}) {
        const type = validateFile(file);
        onProgress(8, "Dosya tarayıcıda okunuyor…");
        let parsed;
        if (type === "txt") parsed = await parseTxt(file);
        else if (type === "docx") parsed = await parseDocx(file, onProgress);
        else parsed = await parsePdf(file, onProgress);

        const text = String(parsed.text || "").replace(/\u0000/g, " ").trim();
        if (text.length < 40) throw new Error("CV'den yeterli metin çıkarılamadı. Dosyanın taranmış görsel olmadığını ve metin içerdiğini kontrol edin.");
        const truncated = text.length > MAX_TEXT_LENGTH;
        onProgress(82, "CV içeriği analize hazırlanıyor…");
        return {
            text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
            meta: {
                type,
                extractionSuccessful: true,
                truncated,
                fileName: file.name,
                fileSize: file.size,
                ...parsed.meta,
            },
        };
    }

    async function parseTxt(file) {
        const buffer = await file.arrayBuffer();
        let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        if ((text.match(/�/g) || []).length > 5) text = new TextDecoder("windows-1254", { fatal: false }).decode(buffer);
        return { text, meta: { pageCount: null, columnSignals: 0, tableSignals: detectPlainTableSignals(text), parserWarnings: [] } };
    }

    async function parseDocx(file, onProgress) {
        if (!root.mammoth?.convertToHtml) throw new Error("DOCX okuma bileşeni yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
        onProgress(20, "DOCX metni çıkarılıyor…");
        const arrayBuffer = await file.arrayBuffer();
        const converted = await root.mammoth.convertToHtml({ arrayBuffer });
        const html = String(converted.value || "");
        const preparedHtml = html
            .replace(/<li\b[^>]*>/gi, "\n• ")
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<\/(?:p|h[1-6]|li|tr|table|ul|ol|div)>/gi, "\n");
        const documentNode = new DOMParser().parseFromString(preparedHtml, "text/html");
        const text = documentNode.body.textContent || "";
        const tableSignals = (html.match(/<table\b/gi) || []).length;
        const columnSignals = (html.match(/(?:column-count|w:cols)/gi) || []).length;
        return {
            text: normalizeExtractedText(text),
            meta: {
                pageCount: null,
                tableSignals,
                columnSignals,
                parserWarnings: (converted.messages || []).map((message) => message.message).slice(0, 5),
            },
        };
    }

    async function parsePdf(file, onProgress) {
        if (!root.pdfjsLib?.getDocument) throw new Error("PDF okuma bileşeni yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        const data = new Uint8Array(await file.arrayBuffer());
        let documentTask;
        try {
            documentTask = root.pdfjsLib.getDocument({ data, isEvalSupported: false });
            const pdf = await documentTask.promise;
            if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF ${MAX_PDF_PAGES} sayfadan uzun. Daha kısa bir CV dosyası seçin.`);
            const pageTexts = [];
            let columnSignals = 0;
            let tableSignals = 0;
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                onProgress(15 + Math.round((pageNumber / pdf.numPages) * 60), `PDF sayfası okunuyor: ${pageNumber} / ${pdf.numPages}`);
                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1 });
                const content = await page.getTextContent({ normalizeWhitespace: true });
                const items = content.items
                    .filter((item) => typeof item.str === "string" && item.str.trim())
                    .map((item) => ({ str: item.str.trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: item.width || 0 }));
                pageTexts.push(reconstructPdfText(items));
                columnSignals += detectColumnSignals(items, viewport.width);
                tableSignals += detectPdfTableSignals(items);
                page.cleanup();
                await yieldToBrowser();
            }
            return { text: normalizeExtractedText(pageTexts.join("\n\n")), meta: { pageCount: pdf.numPages, columnSignals, tableSignals, parserWarnings: [] } };
        } catch (error) {
            if (error?.name === "PasswordException") throw new Error("Parola korumalı PDF dosyaları analiz edilemiyor.");
            if (error?.message?.includes("sayfadan uzun")) throw error;
            throw new Error("PDF metni çıkarılamadı. Dosyanın bozuk veya yalnızca taranmış görüntülerden oluşmadığını kontrol edin.");
        } finally {
            try { await documentTask?.destroy?.(); } catch { /* PDF işçisi zaten kapanmış olabilir. */ }
        }
    }

    function reconstructPdfText(items) {
        const lines = new Map();
        items.forEach((item) => {
            const key = Math.round(item.y / 3) * 3;
            if (!lines.has(key)) lines.set(key, []);
            lines.get(key).push(item);
        });
        return Array.from(lines.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([, lineItems]) => lineItems.sort((a, b) => a.x - b.x).map((item) => item.str).join(" "))
            .join("\n");
    }

    function detectColumnSignals(items, pageWidth) {
        if (items.length < 20 || !pageWidth) return 0;
        const left = items.filter((item) => item.x < pageWidth * 0.42).length;
        const right = items.filter((item) => item.x > pageWidth * 0.56).length;
        const center = items.filter((item) => item.x >= pageWidth * 0.42 && item.x <= pageWidth * 0.56).length;
        return left >= 10 && right >= 10 && center < items.length * 0.12 ? 1 : 0;
    }

    function detectPdfTableSignals(items) {
        if (items.length < 16) return 0;
        const xBuckets = new Map();
        items.forEach((item) => {
            const bucket = Math.round(item.x / 24) * 24;
            xBuckets.set(bucket, (xBuckets.get(bucket) || 0) + 1);
        });
        const repeatedColumns = Array.from(xBuckets.values()).filter((count) => count >= 4).length;
        return repeatedColumns >= 4 ? 1 : 0;
    }

    function detectPlainTableSignals(text) {
        const pipeRows = (String(text).match(/^.*\|.*\|.*$/gm) || []).length;
        const tabRows = getNonEmptyLines(text).filter((line) => (line.match(/\t/g) || []).length >= 2).length;
        return Math.min(6, pipeRows + tabRows);
    }

    function getNonEmptyLines(text) {
        return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    function normalizeExtractedText(text) {
        return String(text || "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
    }

    function yieldToBrowser() {
        return new Promise((resolve) => root.setTimeout(resolve, 0));
    }

    root.AtsCvParser = Object.freeze({ parseFile, validateFile, getExtension, MAX_FILE_SIZE, MAX_PDF_PAGES });
}(typeof window !== "undefined" ? window : globalThis));
