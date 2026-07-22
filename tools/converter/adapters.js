(function initConverterAdapters(root) {
    "use strict";

    const namespace = root.OmniConverter = root.OmniConverter || {};
    const services = namespace.Services;
    const factories = new Map();
    const formatHandlers = new Map();
    const MAX_PIXEL_COUNT = 80_000_000;
    const MAX_DIMENSION = 32_767;
    const PROFILE_SCAN_BYTES = 524_288;
    const SAMPLE_SIZE = 192;
    const MIME_ALIASES = Object.freeze({
        "image/jpg": "image/jpeg",
        "image/pjpeg": "image/jpeg",
        "image/x-bmp": "image/bmp",
        "image/x-ms-bmp": "image/bmp",
        "image/vnd.microsoft.icon": "image/x-icon",
        "image/ico": "image/x-icon",
        "image/tif": "image/tiff",
        "text/xml": "image/svg+xml",
        "application/xml": "image/svg+xml",
        "image/heif": "image/heic",
    });
    const IMAGE_EXTENSIONS = Object.freeze({
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "image/webp": ["webp"],
        "image/gif": ["gif"],
        "image/bmp": ["bmp"],
        "image/svg+xml": ["svg"],
        "image/avif": ["avif"],
        "image/x-icon": ["ico"],
        "image/tiff": ["tif", "tiff"],
        "image/heic": ["heic", "heif"],
    });
    const OUTPUT_EXTENSIONS = Object.freeze({
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/bmp": "bmp",
        "image/x-icon": "ico",
        "image/svg+xml": "svg",
    });

    class CategoryAdapter {
        constructor(config) {
            this.config = config;
            this.ready = config.ready;
            this.previewKind = "file";
            this.acceptedExtensions = config.accept
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter((value) => value.startsWith("."))
                .map((value) => value.slice(1));
        }

        async validate(file) {
            if (!(file instanceof File) && !(file instanceof Blob)) throw new Error("Geçersiz dosya.");
            if (!file.size) throw new Error("Dosya boş.");
            const extension = services.getExtension(file.name);
            if (!extension || !this.acceptedExtensions.includes(extension)) {
                throw new Error(`${extension ? extension.toUpperCase() : "Bu"} dosya biçimi ${this.config.label.toLocaleLowerCase("tr-TR")} kategorisinde desteklenmiyor.`);
            }
            return { extension, type: file.type || "application/octet-stream", sourceBlob: file };
        }

        async inspect(file, validation, signal) {
            throwIfAborted(signal);
            const details = [];
            let previewText = "";
            if (this.config.id === "audio" || this.config.id === "video") {
                const media = await inspectMedia(file, this.config.id, signal);
                if (media.duration) details.push(["Süre", services.formatDuration(media.duration)]);
                if (media.width && media.height) details.push(["Çözünürlük", `${media.width} × ${media.height}`]);
            }
            if (["txt", "md", "markdown", "csv", "html", "htm", "rtf", "fb2"].includes(validation.extension)) {
                previewText = await file.slice(0, 4096).text();
            }
            return { details, previewText };
        }

        estimate(file) {
            return file.size;
        }

        outputExtension(settings) {
            return String(settings.outputFormat || "dosya").toLowerCase();
        }

        outputNote() {
            return this.config.capabilityText;
        }

        async convert() {
            throw new Error(this.config.capabilityText);
        }
    }

    class ImageAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.previewKind = "image";
        }

        async validate(file) {
            if (!(file instanceof File) && !(file instanceof Blob)) throw new Error("Geçersiz dosya.");
            if (!file.size) throw new Error("Dosya boş.");
            const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
            const detectedType = detectImageType(bytes);
            if (!detectedType || !IMAGE_EXTENSIONS[detectedType]) throw new Error("Desteklenmeyen görsel dosyası.");

            const extension = services.getExtension(file.name);
            if (extension && !IMAGE_EXTENSIONS[detectedType].includes(extension)) {
                throw new Error("Dosya uzantısı ile içeriği eşleşmiyor.");
            }

            if (file.type && file.type !== "application/octet-stream") {
                const declaredType = MIME_ALIASES[file.type.toLowerCase()] || file.type.toLowerCase();
                if (declaredType !== detectedType) throw new Error("Dosya türü ile içeriği eşleşmiyor.");
            }

            const sourceBlob = detectedType === "image/svg+xml" ? await sanitizeSvg(file) : file;
            return {
                extension: extension || IMAGE_EXTENSIONS[detectedType][0],
                type: detectedType,
                sourceBlob,
            };
        }

        async inspect(file, validation, signal) {
            const decoded = await decodeImage(validation.sourceBlob, validation.type, signal);
            try {
                validateDimensions(decoded.width, decoded.height);
                const hasTransparency = ["image/jpeg", "image/bmp", "image/tiff", "image/heic"].includes(validation.type)
                    ? false
                    : detectTransparency(decoded.source, decoded.width, decoded.height);
                return {
                    width: decoded.width,
                    height: decoded.height,
                    hasTransparency,
                    colorProfile: await detectColorProfile(file, validation.type),
                    details: [
                        ["Çözünürlük", `${decoded.width} × ${decoded.height}`],
                        ["En/Boy", simplifyRatio(decoded.width, decoded.height)],
                        ["Şeffaflık", hasTransparency ? "Var" : "Yok"],
                    ],
                };
            } finally {
                decoded.close();
            }
        }

        estimate(file, metadata, settings) {
            const pixels = metadata.width * metadata.height;
            const quality = Number(settings.quality) / 100;
            switch (settings.outputFormat) {
                case "image/png": return Math.max(1024, pixels * (metadata.hasTransparency ? 1.55 : 1.15));
                case "image/webp": return Math.max(1024, pixels * (0.16 + quality * 0.46));
                case "image/jpeg": return Math.max(1024, pixels * (0.22 + quality * 0.72));
                case "image/bmp": return 54 + pixels * 4;
                case "image/x-icon": return Math.min(262144, Math.max(4096, pixels * 0.45));
                case "image/svg+xml": return Math.max(2048, pixels * 1.55);
                default: return file.size;
            }
        }

        outputExtension(settings) {
            return OUTPUT_EXTENSIONS[settings.outputFormat] || "png";
        }

        outputNote(settings) {
            if (settings.outputFormat === "image/jpeg") return "JPG şeffaflığı desteklemez; saydam alanlar beyaz doldurulur.";
            if (settings.outputFormat === "image/x-icon") return "ICO çıktısı en fazla 256 × 256 boyutunda, şeffaflığı destekleyen bir simge üretir.";
            if (settings.outputFormat === "image/svg+xml") return "SVG çıktısı görseli güvenli bir SVG kabında saklar; otomatik vektörleştirme yapmaz.";
            if (settings.outputFormat === "image/bmp") return "BMP çıktısı kayıpsızdır; dosya boyutu diğer biçimlerden daha büyük olabilir.";
            return settings.preserveTransparency
                ? "Destekleyen çıkışlarda şeffaflık ve özgün çözünürlük korunur."
                : "Şeffaf alanlar beyaz arka planla birleştirilir.";
        }

        async convert(item, settings, signal) {
            throwIfAborted(signal);
            const decoded = await decodeImage(item.sourceBlob, item.type, signal);
            let canvas;
            try {
                validateDimensions(decoded.width, decoded.height);
                canvas = createCanvas(decoded.width, decoded.height);
                const context = canvas.getContext("2d", { alpha: true, willReadFrequently: settings.outputFormat === "image/bmp" });
                if (!context) throw new Error("Dönüştürme alanı oluşturulamadı.");
                const preserve = Boolean(settings.preserveTransparency) && settings.outputFormat !== "image/jpeg";
                if (!preserve) {
                    context.fillStyle = "#ffffff";
                    context.fillRect(0, 0, decoded.width, decoded.height);
                }
                context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);
                throwIfAborted(signal);

                const quality = Number(settings.quality) / 100;
                const result = await convertWithFormatHandler(settings.outputFormat, {
                    canvas,
                    context,
                    width: decoded.width,
                    height: decoded.height,
                    preserveTransparency: preserve,
                    quality,
                });

                throwIfAborted(signal);
                return {
                    blob: result.blob,
                    width: result.width || decoded.width,
                    height: result.height || decoded.height,
                };
            } catch (error) {
                if (error instanceof RangeError) throw new Error("Görsel belleğe sığmayacak kadar büyük.");
                throw error;
            } finally {
                decoded.close();
                releaseCanvas(canvas);
            }
        }
    }

    function register(adapterId, factory) {
        factories.set(adapterId, factory);
    }

    function create(config) {
        const factory = factories.get(config.adapterId);
        return factory ? factory(config) : new CategoryAdapter(config);
    }

    function registerFormatHandler(format, handler) {
        if (!format || typeof handler !== "function") throw new Error("Biçim işleyicisi kaydedilemedi.");
        formatHandlers.set(format, handler);
    }

    async function convertWithFormatHandler(format, payload) {
        const handler = formatHandlers.get(format);
        if (!handler) throw new Error("Seçilen çıkış biçimi desteklenmiyor.");
        return handler(payload);
    }

    register("image", (config) => new ImageAdapter(config));
    ["ffmpeg", "libreoffice-wasm", "archive-wasm", "font-wasm", "ebook-wasm"].forEach((adapterId) => {
        register(adapterId, (config) => new CategoryAdapter(config));
    });

    function detectImageType(bytes) {
        if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
        if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
        if (ascii(bytes, 0, 3) === "GIF" && ["87a", "89a"].includes(ascii(bytes, 3, 3))) return "image/gif";
        if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
        if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
        if (matches(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
        if (matches(bytes, [0x49, 0x49, 0x2a, 0x00]) || matches(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
        if (ascii(bytes, 4, 4) === "ftyp") {
            const brands = ascii(bytes, 8, Math.min(56, bytes.length - 8));
            if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
            if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some((brand) => brands.includes(brand))) return "image/heic";
        }
        const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trimStart();
        if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return "image/svg+xml";
        return "";
    }

    async function sanitizeSvg(file) {
        const raw = await file.text();
        const documentValue = new DOMParser().parseFromString(raw, "image/svg+xml");
        if (documentValue.querySelector("parsererror") || documentValue.documentElement.localName.toLowerCase() !== "svg") {
            throw new Error("SVG dosyası bozuk veya geçersiz.");
        }

        documentValue.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((element) => element.remove());
        documentValue.querySelectorAll("*").forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim();
                const externalReference = ["href", "xlink:href"].includes(name)
                    && value
                    && !value.startsWith("#")
                    && !value.startsWith("data:image/");
                const unsafeStyle = name === "style" && /(?:@import|url\s*\(\s*['"]?(?:https?:|\/\/|javascript:))/i.test(value);
                if (name.startsWith("on") || externalReference || unsafeStyle) element.removeAttribute(attribute.name);
            });
        });

        return new Blob([new XMLSerializer().serializeToString(documentValue.documentElement)], { type: "image/svg+xml" });
    }

    async function decodeImage(blob, type, signal) {
        throwIfAborted(signal);
        if ("createImageBitmap" in window) {
            try {
                let bitmap;
                try {
                    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image", premultiplyAlpha: "default" });
                } catch (_) {
                    bitmap = await createImageBitmap(blob);
                }
                throwIfAborted(signal);
                return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
            } catch (error) {
                if (error?.name === "AbortError") throw error;
            }
        }

        const url = URL.createObjectURL(blob);
        try {
            const image = await new Promise((resolve, reject) => {
                const value = new Image();
                const abort = () => reject(createAbortError());
                signal?.addEventListener("abort", abort, { once: true });
                value.decoding = "async";
                value.onload = () => {
                    signal?.removeEventListener("abort", abort);
                    resolve(value);
                };
                value.onerror = () => {
                    signal?.removeEventListener("abort", abort);
                    reject(new Error("Görsel dosyası bu tarayıcı tarafından açılamıyor."));
                };
                value.src = url;
            });
            return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
        } catch (error) {
            URL.revokeObjectURL(url);
            if (["image/heic", "image/tiff"].includes(type)) {
                throw new Error(`${formatLabel(type)} dosyası için bu tarayıcıda ek bir WASM çözücüsü gerekiyor.`);
            }
            throw error;
        }
    }

    async function inspectMedia(file, categoryId, signal) {
        const url = URL.createObjectURL(file);
        const media = document.createElement(categoryId === "video" ? "video" : "audio");
        media.preload = "metadata";
        try {
            return await new Promise((resolve) => {
                const finish = (value) => {
                    media.removeAttribute("src");
                    media.load();
                    resolve(value);
                };
                const abort = () => finish({});
                signal?.addEventListener("abort", abort, { once: true });
                media.onloadedmetadata = () => {
                    signal?.removeEventListener("abort", abort);
                    finish({ duration: media.duration, width: media.videoWidth, height: media.videoHeight });
                };
                media.onerror = () => {
                    signal?.removeEventListener("abort", abort);
                    finish({});
                };
                media.src = url;
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function detectTransparency(source, width, height) {
        const scale = Math.min(1, SAMPLE_SIZE / Math.max(width, height));
        const sampleWidth = Math.max(1, Math.round(width * scale));
        const sampleHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Görsel analiz alanı oluşturulamadı.");
        context.clearRect(0, 0, sampleWidth, sampleHeight);
        context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
        const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] < 255) {
                transparent = true;
                break;
            }
        }
        releaseCanvas(canvas);
        return transparent;
    }

    async function detectColorProfile(file, type) {
        try {
            const data = new Uint8Array(await file.slice(0, PROFILE_SCAN_BYTES).arrayBuffer());
            const content = new TextDecoder("latin1").decode(data);
            const hasProfile = (type === "image/jpeg" && content.includes("ICC_PROFILE"))
                || (type === "image/png" && content.includes("iCCP"))
                || (type === "image/webp" && content.includes("ICCP"));
            return hasProfile ? "Gömülü ICC profili" : "Gömülü profil yok";
        } catch (_) {
            return "Tarayıcı tarafından yönetiliyor";
        }
    }

    function createCanvas(width, height) {
        if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    function canvasToBlob(canvas, type, quality) {
        if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type, quality });
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Görsel çıktısı oluşturulamadı.")), type, quality);
        });
    }

    function createBmpBlob(context, width, height, preserveTransparency) {
        const pixels = context.getImageData(0, 0, width, height).data;
        const pixelSize = width * height * 4;
        const buffer = new ArrayBuffer(54 + pixelSize);
        const view = new DataView(buffer);
        view.setUint8(0, 0x42);
        view.setUint8(1, 0x4d);
        view.setUint32(2, buffer.byteLength, true);
        view.setUint32(10, 54, true);
        view.setUint32(14, 40, true);
        view.setInt32(18, width, true);
        view.setInt32(22, height, true);
        view.setUint16(26, 1, true);
        view.setUint16(28, 32, true);
        view.setUint32(34, pixelSize, true);

        let target = 54;
        for (let y = height - 1; y >= 0; y -= 1) {
            for (let x = 0; x < width; x += 1) {
                const source = (y * width + x) * 4;
                view.setUint8(target++, pixels[source + 2]);
                view.setUint8(target++, pixels[source + 1]);
                view.setUint8(target++, pixels[source]);
                view.setUint8(target++, preserveTransparency ? pixels[source + 3] : 255);
            }
        }
        return new Blob([buffer], { type: "image/bmp" });
    }

    async function createIcoBlob(sourceCanvas, preserveTransparency) {
        const sourceWidth = sourceCanvas.width;
        const sourceHeight = sourceCanvas.height;
        const size = Math.min(256, Math.max(sourceWidth, sourceHeight));
        const canvas = createCanvas(size, size);
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("ICO alanı oluşturulamadı.");
        if (!preserveTransparency) {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, size, size);
        }
        const scale = Math.min(size / sourceWidth, size / sourceHeight);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        context.drawImage(sourceCanvas, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
        const png = await canvasToBlob(canvas, "image/png", 1);
        const pngBytes = new Uint8Array(await png.arrayBuffer());
        const header = new ArrayBuffer(22);
        const view = new DataView(header);
        view.setUint16(0, 0, true);
        view.setUint16(2, 1, true);
        view.setUint16(4, 1, true);
        view.setUint8(6, size === 256 ? 0 : size);
        view.setUint8(7, size === 256 ? 0 : size);
        view.setUint8(8, 0);
        view.setUint8(9, 0);
        view.setUint16(10, 1, true);
        view.setUint16(12, 32, true);
        view.setUint32(14, pngBytes.byteLength, true);
        view.setUint32(18, 22, true);
        releaseCanvas(canvas);
        return { blob: new Blob([header, pngBytes], { type: "image/x-icon" }), width: size, height: size };
    }

    async function createSvgBlob(canvas, width, height) {
        if (width * height > 20_000_000) {
            throw new Error("SVG kabı için görsel çok büyük. PNG veya WEBP çıkışı seçin.");
        }
        const png = await canvasToBlob(canvas, "image/png", 1);
        const bytes = new Uint8Array(await png.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
        }
        const encoded = btoa(binary);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${encoded}"/></svg>`;
        return new Blob([svg], { type: "image/svg+xml" });
    }

    ["image/png", "image/jpeg", "image/webp"].forEach((type) => {
        registerFormatHandler(type, async ({ canvas, quality }) => {
            const blob = await canvasToBlob(canvas, type, quality);
            if (blob.type !== type) throw new Error(`${formatLabel(type)} çıkışı bu tarayıcıda desteklenmiyor.`);
            return { blob };
        });
    });
    registerFormatHandler("image/bmp", ({ context, width, height, preserveTransparency }) => ({
        blob: createBmpBlob(context, width, height, preserveTransparency),
    }));
    registerFormatHandler("image/x-icon", ({ canvas, preserveTransparency }) => createIcoBlob(canvas, preserveTransparency));
    registerFormatHandler("image/svg+xml", async ({ canvas, width, height }) => ({
        blob: await createSvgBlob(canvas, width, height),
    }));

    function releaseCanvas(canvas) {
        if (!canvas) return;
        if (typeof OffscreenCanvas !== "function" || !(canvas instanceof OffscreenCanvas)) {
            canvas.width = 1;
            canvas.height = 1;
        }
    }

    function validateDimensions(width, height) {
        if (!width || !height) throw new Error("Dosya çözünürlüğü okunamadı.");
        if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXEL_COUNT) {
            throw new Error("Görsel güvenli dönüştürme sınırını aşıyor.");
        }
    }

    function simplifyRatio(width, height) {
        const divisor = gcd(width, height);
        return `${width / divisor}:${height / divisor}`;
    }

    function gcd(first, second) {
        let a = first;
        let b = second;
        while (b) [a, b] = [b, a % b];
        return a || 1;
    }

    function formatLabel(type) {
        const labels = {
            "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "image/bmp": "BMP",
            "image/x-icon": "ICO", "image/svg+xml": "SVG", "image/avif": "AVIF", "image/tiff": "TIFF", "image/heic": "HEIC",
        };
        return labels[type] || "Görsel";
    }

    function matches(bytes, signature) {
        return signature.every((value, index) => bytes[index] === value);
    }

    function ascii(bytes, start, length) {
        return String.fromCharCode(...bytes.slice(start, start + Math.max(0, length)));
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    namespace.FormatHandlers = Object.freeze({ register: registerFormatHandler, convert: convertWithFormatHandler });
    namespace.Adapters = Object.freeze({ register, create, CategoryAdapter, ImageAdapter });
})(window);
