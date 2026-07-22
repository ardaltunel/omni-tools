(function initEbookAdapter(root) {
    "use strict";

    const namespace = root.OmniConverter;
    if (!namespace?.Adapters || !namespace.ArchiveRuntime) return;

    const { CategoryAdapter } = namespace.Adapters;
    const services = namespace.Services;
    const MOBI_MODULE_URL = new URL("tools/converter/vendor/ebook/mobi-parser.js", document.baseURI).href;
    const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"]);
    const MIME_TYPES = Object.freeze({
        epub: "application/epub+zip",
        pdf: "application/pdf",
        html: "text/html;charset=utf-8",
        txt: "text/plain;charset=utf-8",
        fb2: "application/x-fictionbook+xml;charset=utf-8",
    });
    let mobiModulePromise = null;

    class EbookAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.ready = true;
            this.previewKind = "file";
        }

        async convert(item, settings, signal) {
            throwIfAborted(signal);
            const format = this.outputExtension(settings);
            try {
                const book = await parseBook(item, settings, signal);
                throwIfAborted(signal);
                if (format === "epub") return { blob: await createEpub(book, signal) };
                if (format === "html") return { blob: new Blob([await createHtml(book)], { type: MIME_TYPES.html }) };
                if (format === "txt") return { blob: new Blob([createText(book)], { type: MIME_TYPES.txt }) };
                if (format === "fb2") return { blob: new Blob([createFb2(book)], { type: MIME_TYPES.fb2 }) };
                if (format === "pdf") {
                    const html = await createHtml(book);
                    return await namespace.LibreOfficeRuntime.convertBlob(
                        new Blob([html], { type: MIME_TYPES.html }),
                        "pdf",
                        `${services.sanitizeBaseName(book.title)}.html`,
                        signal,
                    );
                }
                throw new Error("Seçilen e-kitap çıkış biçimi desteklenmiyor.");
            } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                if (/güvenli tarayıcı yalıtımı|yüklenemedi|desteklenmiyor/.test(error?.message || "")) throw error;
                throw new Error("E-kitap açılamadı veya seçilen biçime dönüştürülemedi.");
            }
        }

        outputExtension(settings) {
            const value = String(settings.outputFormat || "epub").toLowerCase();
            return ["epub", "pdf", "html", "txt", "fb2"].includes(value) ? value : "epub";
        }

        outputNote(settings) {
            return settings.outputFormat === "pdf"
                ? "PDF çıktısı e-kitap bölümleri hazırlandıktan sonra yerel LibreOffice çekirdeğiyle oluşturulur."
                : "Bölümler, içindekiler ve erişilebilen görseller cihazınızdan ayrılmadan yeni çıktıya aktarılır.";
        }
    }

    async function parseBook(item, settings, signal) {
        if (item.extension === "epub") return parseEpub(item.sourceBlob, item.file.name, signal);
        if (["cbz", "cbr"].includes(item.extension)) return parseComic(item.sourceBlob, item.file.name, signal);
        if (item.extension === "fb2") return parseFb2(await item.sourceBlob.text(), item.file.name);
        if (["mobi", "azw", "azw3"].includes(item.extension)) {
            return parseMobi(item.sourceBlob, item.file.name, item.extension, settings.keepCover, signal);
        }
        throw new Error("Bu e-kitap biçimi desteklenmiyor.");
    }

    async function parseEpub(file, fileName, signal) {
        const extracted = await namespace.ArchiveRuntime.extract(file, signal);
        const files = new Map(extracted.map((entry) => [normalizePath(entry.pathname), entry.file]));
        const container = files.get("META-INF/container.xml") || findBySuffix(files, "meta-inf/container.xml");
        if (!container) throw new Error("EPUB paketinde içerik tanımı bulunamadı.");
        const containerXml = parseXml(await container.text(), "EPUB paket tanımı");
        const rootFile = elements(containerXml, "rootfile")[0]?.getAttribute("full-path");
        if (!rootFile) throw new Error("EPUB içerik yolu bulunamadı.");
        const packagePath = normalizePath(rootFile);
        const packageFile = files.get(packagePath) || findBySuffix(files, packagePath.toLowerCase());
        if (!packageFile) throw new Error("EPUB içerik dosyası bulunamadı.");

        const packageXml = parseXml(await packageFile.text(), "EPUB içerik tanımı");
        const basePath = directoryName(packagePath);
        const title = elementText(packageXml, "title") || stripExtension(fileName);
        const author = elements(packageXml, "creator").map((node) => node.textContent.trim()).filter(Boolean).join(", ");
        const language = elementText(packageXml, "language") || "tr";
        const manifest = new Map(elements(packageXml, "item").map((node) => [node.getAttribute("id"), {
            path: resolvePath(basePath, node.getAttribute("href") || ""),
            type: node.getAttribute("media-type") || "application/octet-stream",
        }]));
        const spine = elements(packageXml, "itemref").map((node) => node.getAttribute("idref")).filter(Boolean);
        const book = createBook(title, author, language);

        for (let index = 0; index < spine.length; index += 1) {
            throwIfAborted(signal);
            const manifestItem = manifest.get(spine[index]);
            const chapterFile = manifestItem && files.get(manifestItem.path);
            if (!chapterFile) continue;
            const raw = await chapterFile.text();
            const chapter = await normalizeChapter(raw, manifestItem.path, files, book, `Bölüm ${index + 1}`);
            book.chapters.push(chapter);
        }
        if (!book.chapters.length) throw new Error("EPUB içinde okunabilir bölüm bulunamadı.");
        return book;
    }

    async function parseComic(file, fileName, signal) {
        const extracted = await namespace.ArchiveRuntime.extract(file, signal);
        const images = extracted
            .filter((entry) => IMAGE_EXTENSIONS.has(services.getExtension(entry.pathname)))
            .sort((left, right) => left.pathname.localeCompare(right.pathname, "tr", { numeric: true }));
        if (!images.length) throw new Error("Çizgi roman arşivinde görsel bulunamadı.");
        const book = createBook(stripExtension(fileName), "", "tr");
        for (let index = 0; index < images.length; index += 1) {
            throwIfAborted(signal);
            const token = addResource(book, images[index].pathname, images[index].file);
            book.chapters.push({ title: `Sayfa ${index + 1}`, html: `<figure><img src="${token}" alt="Sayfa ${index + 1}"></figure>` });
        }
        return book;
    }

    function parseFb2(source, fileName) {
        const xml = parseXml(source, "FB2 belgesi");
        const title = elementText(xml, "book-title") || stripExtension(fileName);
        const first = elementText(xml, "first-name");
        const last = elementText(xml, "last-name");
        const language = elementText(xml, "lang") || "tr";
        const book = createBook(title, [first, last].filter(Boolean).join(" "), language);
        const binaryMap = new Map();
        elements(xml, "binary").forEach((node) => {
            const id = node.getAttribute("id");
            const type = node.getAttribute("content-type") || "application/octet-stream";
            if (!id) return;
            try {
                const bytes = Uint8Array.from(atob(node.textContent.replace(/\s/g, "")), (value) => value.charCodeAt(0));
                binaryMap.set(id, addResource(book, id, new Blob([bytes], { type })));
            } catch (_) {
                // Bozuk gömülü görsel metin içeriğini engellemez.
            }
        });
        const sections = elements(xml, "section");
        sections.forEach((section, index) => {
            const heading = elements(section, "title")[0]?.textContent.trim() || `Bölüm ${index + 1}`;
            const parts = [];
            Array.from(section.children).forEach((node) => {
                if (node.localName === "title") return;
                if (node.localName === "image") {
                    const href = node.getAttribute("l:href") || node.getAttribute("xlink:href") || node.getAttribute("href") || "";
                    const token = binaryMap.get(href.replace(/^#/, ""));
                    if (token) parts.push(`<figure><img src="${token}" alt="${escapeHtml(heading)}"></figure>`);
                    return;
                }
                if (["p", "subtitle", "cite", "poem"].includes(node.localName)) parts.push(`<p>${escapeHtml(node.textContent.trim())}</p>`);
            });
            if (parts.length) book.chapters.push({ title: heading, html: parts.join("\n") });
        });
        if (!book.chapters.length) {
            const text = elements(xml, "body").map((node) => node.textContent.trim()).filter(Boolean).join("\n\n");
            if (text) book.chapters.push({ title: "Metin", html: text.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part)}</p>`).join("\n") });
        }
        if (!book.chapters.length) throw new Error("FB2 içinde okunabilir bölüm bulunamadı.");
        return book;
    }

    async function parseMobi(file, fileName, extension, keepCover, signal) {
        mobiModulePromise ||= import(MOBI_MODULE_URL);
        const module = await mobiModulePromise;
        let parser;
        try {
            const primary = extension === "azw3" ? module.initKf8File : module.initMobiFile;
            const fallback = extension === "azw3" ? module.initMobiFile : module.initKf8File;
            try {
                parser = await primary(file);
            } catch (_) {
                parser = await fallback(file);
            }
            const metadata = parser.getMetadata?.() || {};
            const authors = Array.isArray(metadata.author) ? metadata.author.join(", ") : String(metadata.author || "");
            const book = createBook(metadata.title || stripExtension(fileName), authors, metadata.language || "tr");
            const spine = parser.getSpine?.() || [];
            for (let index = 0; index < spine.length; index += 1) {
                throwIfAborted(signal);
                const loaded = await parser.loadChapter(spine[index].id);
                if (!loaded?.html) continue;
                book.chapters.push(await normalizeBlobChapter(loaded.html, book, `Bölüm ${index + 1}`));
            }
            if (keepCover) {
                const coverUrl = parser.getCoverImage?.();
                if (coverUrl) await addBlobUrlResource(book, coverUrl, "kapak");
            }
            if (!book.chapters.length) throw new Error("E-kitap içinde okunabilir bölüm bulunamadı.");
            return book;
        } finally {
            parser?.destroy?.();
        }
    }

    function createBook(title, author, language) {
        return {
            title: String(title || "E-Kitap").trim() || "E-Kitap",
            author: String(author || "").trim(),
            language: String(language || "tr").trim() || "tr",
            chapters: [],
            resources: [],
            resourceKeys: new Map(),
        };
    }

    async function normalizeChapter(raw, chapterPath, files, book, fallbackTitle) {
        const documentValue = new DOMParser().parseFromString(raw, "text/html");
        sanitizeDocument(documentValue);
        const title = documentValue.querySelector("title")?.textContent.trim()
            || documentValue.querySelector("h1, h2, h3")?.textContent.trim()
            || fallbackTitle;
        const basePath = directoryName(chapterPath);
        for (const element of documentValue.querySelectorAll("img[src], source[src], audio[src], video[src]")) {
            const source = element.getAttribute("src") || "";
            if (!source || /^(?:data:|blob:|https?:)/i.test(source)) continue;
            const target = resolvePath(basePath, source.split("#")[0].split("?")[0]);
            const resource = files.get(target);
            if (resource) element.setAttribute("src", addResource(book, target, resource));
            else element.removeAttribute("src");
        }
        return { title, html: documentValue.body.innerHTML };
    }

    async function normalizeBlobChapter(raw, book, fallbackTitle) {
        const documentValue = new DOMParser().parseFromString(raw, "text/html");
        sanitizeDocument(documentValue);
        const title = documentValue.querySelector("h1, h2, h3")?.textContent.trim() || fallbackTitle;
        for (const element of documentValue.querySelectorAll("img[src], source[src], audio[src], video[src]")) {
            const source = element.getAttribute("src") || "";
            if (source.startsWith("blob:")) element.setAttribute("src", await addBlobUrlResource(book, source, `kaynak-${book.resources.length + 1}`));
            else if (!source.startsWith("data:")) element.removeAttribute("src");
        }
        return { title, html: documentValue.body.innerHTML };
    }

    function sanitizeDocument(documentValue) {
        documentValue.querySelectorAll("script, iframe, object, embed, form, input, button, base, meta, link").forEach((node) => node.remove());
        documentValue.querySelectorAll("*").forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim();
                if (name.startsWith("on") || (name === "style" && /(?:url\s*\(|@import|expression\s*\()/i.test(value))) {
                    element.removeAttribute(attribute.name);
                }
                if (["href", "src", "poster"].includes(name) && /^(?:javascript|file|filesystem):/i.test(value)) {
                    element.removeAttribute(attribute.name);
                }
            });
        });
    }

    function addResource(book, key, blob) {
        const normalizedKey = String(key || `kaynak-${book.resources.length + 1}`);
        if (book.resourceKeys.has(normalizedKey)) return `omni-resource://${book.resourceKeys.get(normalizedKey)}`;
        const id = book.resources.length;
        const extension = services.getExtension(normalizedKey) || extensionForMime(blob.type);
        book.resources.push({ id, blob, extension, type: blob.type || mimeForExtension(extension) });
        book.resourceKeys.set(normalizedKey, id);
        return `omni-resource://${id}`;
    }

    async function addBlobUrlResource(book, url, name) {
        if (book.resourceKeys.has(url)) return `omni-resource://${book.resourceKeys.get(url)}`;
        const response = await fetch(url);
        if (!response.ok) return "";
        const token = addResource(book, `${name}.${extensionForMime(response.headers.get("content-type"))}`, await response.blob());
        book.resourceKeys.set(url, Number(token.slice(token.lastIndexOf("/") + 1)));
        return token;
    }

    async function createEpub(book, signal) {
        const entries = [];
        entries.push({ name: "mimetype", blob: new Blob(["application/epub+zip"], { type: "text/plain" }) });
        entries.push({ name: "META-INF/container.xml", blob: textBlob('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', "application/xml") });

        const manifest = [];
        const spine = [];
        const navItems = [];
        book.chapters.forEach((chapter, index) => {
            const id = `bolum-${index + 1}`;
            const fileName = `OEBPS/text/${id}.xhtml`;
            const body = replaceResourceTokens(chapter.html, (resourceId) => `../assets/kaynak-${resourceId}.${book.resources[resourceId]?.extension || "bin"}`);
            const xhtml = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(book.language)}"><head><title>${escapeXml(chapter.title)}</title><meta charset="utf-8"/></head><body><h1>${escapeXml(chapter.title)}</h1>${toXhtml(body)}</body></html>`;
            entries.push({ name: fileName, blob: textBlob(xhtml, "application/xhtml+xml") });
            manifest.push(`<item id="${id}" href="text/${id}.xhtml" media-type="application/xhtml+xml"/>`);
            spine.push(`<itemref idref="${id}"/>`);
            navItems.push(`<li><a href="text/${id}.xhtml">${escapeXml(chapter.title)}</a></li>`);
        });
        book.resources.forEach((resource) => {
            const fileName = `kaynak-${resource.id}.${resource.extension}`;
            entries.push({ name: `OEBPS/assets/${fileName}`, blob: resource.blob });
            manifest.push(`<item id="kaynak-${resource.id}" href="assets/${fileName}" media-type="${escapeXml(resource.type)}"/>`);
        });
        const nav = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(book.language)}"><head><title>İçindekiler</title></head><body><nav epub:type="toc"><h1>İçindekiler</h1><ol>${navItems.join("")}</ol></nav></body></html>`;
        entries.push({ name: "OEBPS/nav.xhtml", blob: textBlob(nav, "application/xhtml+xml") });
        manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
        const identifier = `urn:uuid:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="kitap-kimligi"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="kitap-kimligi">${escapeXml(identifier)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:language>${escapeXml(book.language)}</dc:language>${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>` : ""}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest>${manifest.join("")}</manifest><spine>${spine.join("")}</spine></package>`;
        entries.push({ name: "OEBPS/content.opf", blob: textBlob(opf, "application/oebps-package+xml") });
        throwIfAborted(signal);
        return new services.ZipManager().create(entries, { preservePaths: true });
    }

    async function createHtml(book) {
        const resourceUrls = await Promise.all(book.resources.map((resource) => blobToDataUrl(resource.blob)));
        const chapters = book.chapters.map((chapter) => `<section><h2>${escapeHtml(chapter.title)}</h2>${replaceResourceTokens(chapter.html, (id) => resourceUrls[id] || "")}</section>`).join("\n");
        return `<!doctype html><html lang="${escapeHtml(book.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(book.title)}</title><style>body{font-family:serif;line-height:1.6;max-width:48rem;margin:auto;padding:2rem}img{max-width:100%;height:auto}section{break-after:page}h1,h2{line-height:1.2}</style></head><body><header><h1>${escapeHtml(book.title)}</h1>${book.author ? `<p>${escapeHtml(book.author)}</p>` : ""}</header>${chapters}</body></html>`;
    }

    function createText(book) {
        const lines = [book.title, book.author, ""].filter((value, index) => value || index === 2);
        book.chapters.forEach((chapter) => {
            lines.push(chapter.title, htmlToText(chapter.html), "");
        });
        return lines.join("\n").trim();
    }

    function createFb2(book) {
        const bodies = book.chapters.map((chapter) => `<section><title><p>${escapeXml(chapter.title)}</p></title>${htmlToText(chapter.html).split(/\n+/).filter(Boolean).map((part) => `<p>${escapeXml(part)}</p>`).join("")}</section>`).join("");
        return `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><genre>nonfiction</genre><author><nickname>${escapeXml(book.author || "Bilinmiyor")}</nickname></author><book-title>${escapeXml(book.title)}</book-title><lang>${escapeXml(book.language)}</lang></title-info></description><body>${bodies}</body></FictionBook>`;
    }

    function replaceResourceTokens(html, resolver) {
        return String(html).replace(/omni-resource:\/\/(\d+)/g, (_, id) => escapeHtml(resolver(Number(id))));
    }

    function toXhtml(html) {
        return String(html).replace(/<(img|br|hr|source)(\b[^>]*?)(?<!\/)\s*>/gi, "<$1$2 />");
    }

    function htmlToText(html) {
        const documentValue = new DOMParser().parseFromString(String(html), "text/html");
        return (documentValue.body.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    function parseXml(source, label) {
        const xml = new DOMParser().parseFromString(String(source), "application/xml");
        if (xml.querySelector("parsererror")) throw new Error(`${label} bozuk veya geçersiz.`);
        return xml;
    }

    function elements(documentValue, localName) {
        return Array.from(documentValue.getElementsByTagNameNS("*", localName));
    }

    function elementText(documentValue, localName) {
        return elements(documentValue, localName)[0]?.textContent.trim() || "";
    }

    function findBySuffix(files, suffix) {
        const wanted = String(suffix).toLowerCase();
        for (const [path, file] of files) if (path.toLowerCase().endsWith(wanted)) return file;
        return null;
    }

    function normalizePath(path) {
        const parts = [];
        String(path || "").replace(/\\/g, "/").split("/").forEach((part) => {
            if (!part || part === ".") return;
            if (part === "..") parts.pop();
            else parts.push(decodeURIComponentSafe(part));
        });
        return parts.join("/");
    }

    function resolvePath(basePath, relativePath) {
        return normalizePath(`${basePath}/${relativePath}`);
    }

    function directoryName(path) {
        return normalizePath(path).split("/").slice(0, -1).join("/");
    }

    function decodeURIComponentSafe(value) {
        try { return decodeURIComponent(value); } catch (_) { return value; }
    }

    function stripExtension(name) {
        return String(name || "E-Kitap").replace(/\.[^.]+$/, "") || "E-Kitap";
    }

    function extensionForMime(mime) {
        const value = String(mime || "").toLowerCase();
        if (value.includes("jpeg")) return "jpg";
        if (value.includes("png")) return "png";
        if (value.includes("gif")) return "gif";
        if (value.includes("webp")) return "webp";
        if (value.includes("svg")) return "svg";
        if (value.includes("css")) return "css";
        return "bin";
    }

    function mimeForExtension(extension) {
        return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", css: "text/css" })[extension] || "application/octet-stream";
    }

    function textBlob(value, type) {
        return new Blob([value], { type: `${type};charset=utf-8` });
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("E-kitap görseli okunamadı."));
            reader.readAsDataURL(blob);
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
        })[character]);
    }

    function escapeXml(value) {
        return escapeHtml(value);
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    namespace.Adapters.register("ebook-wasm", (config) => new EbookAdapter(config));
})(window);
