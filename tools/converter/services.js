(function initConverterServices(root) {
    "use strict";

    const namespace = root.OmniConverter = root.OmniConverter || {};
    const MAX_ZIP_SIZE = 0xffffffff;
    const UTF8_FLAG = 0x0800;
    const textEncoder = new TextEncoder();
    const crcTable = buildCrcTable();

    class DownloadManager {
        download(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = sanitizeFileName(fileName);
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1200);
        }

        downloadMany(entries) {
            entries.forEach((entry, index) => {
                window.setTimeout(() => this.download(entry.blob, entry.name), index * 180);
            });
        }
    }

    class ProgressManager {
        constructor(onChange) {
            this.onChange = onChange;
            this.reset();
        }

        reset(message = "Dosya bekleniyor") {
            this.total = 0;
            this.completed = 0;
            this.percent = 0;
            this.message = message;
            this.emit();
        }

        start(total, message = "Dönüştürme hazırlanıyor...") {
            this.total = total;
            this.completed = 0;
            this.percent = 0;
            this.message = message;
            this.emit();
        }

        update(completed, message) {
            this.completed = completed;
            this.percent = this.total ? Math.round((completed / this.total) * 100) : 0;
            this.message = message;
            this.emit();
        }

        finish(message) {
            this.completed = this.total;
            this.percent = this.total ? 100 : 0;
            this.message = message;
            this.emit();
        }

        emit() {
            this.onChange?.({
                total: this.total,
                completed: this.completed,
                percent: this.percent,
                message: this.message,
            });
        }
    }

    class NotificationManager {
        constructor(element) {
            this.element = element;
        }

        announce(message) {
            if (!this.element) return;
            this.element.textContent = "";
            window.requestAnimationFrame(() => { this.element.textContent = message; });
        }
    }

    class ZipManager {
        async create(entries, options = {}) {
            if (!Array.isArray(entries) || !entries.length) {
                throw new Error("ZIP oluşturmak için en az bir dosya gerekli.");
            }

            const localParts = [];
            const centralParts = [];
            let offset = 0;

            for (const entry of entries) {
                const safeName = options.preservePaths ? sanitizeArchivePath(entry.name) : sanitizeFileName(entry.name);
                const nameBytes = textEncoder.encode(safeName);
                const data = new Uint8Array(await entry.blob.arrayBuffer());
                if (data.byteLength > MAX_ZIP_SIZE || offset + data.byteLength > MAX_ZIP_SIZE) {
                    throw new Error("ZIP boyutu tarayıcı sınırını aşıyor.");
                }

                const checksum = crc32(data);
                const { time, date } = toDosDate(entry.lastModified || Date.now());
                const localHeader = createLocalHeader(nameBytes.length, data.byteLength, checksum, time, date);
                const centralHeader = createCentralHeader(nameBytes.length, data.byteLength, checksum, time, date, offset);
                localParts.push(localHeader, nameBytes, data);
                centralParts.push(centralHeader, nameBytes);
                offset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
                await yieldToMain();
            }

            const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
            if (offset + centralSize > MAX_ZIP_SIZE || entries.length > 0xffff) {
                throw new Error("ZIP içeriği tarayıcı sınırını aşıyor.");
            }

            return new Blob([...localParts, ...centralParts, createEndRecord(entries.length, centralSize, offset)], {
                type: "application/zip",
            });
        }
    }

    function createLocalHeader(nameLength, size, checksum, time, date) {
        const buffer = new ArrayBuffer(30);
        const view = new DataView(buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, UTF8_FLAG, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, time, true);
        view.setUint16(12, date, true);
        view.setUint32(14, checksum, true);
        view.setUint32(18, size, true);
        view.setUint32(22, size, true);
        view.setUint16(26, nameLength, true);
        view.setUint16(28, 0, true);
        return new Uint8Array(buffer);
    }

    function createCentralHeader(nameLength, size, checksum, time, date, offset) {
        const buffer = new ArrayBuffer(46);
        const view = new DataView(buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, UTF8_FLAG, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, time, true);
        view.setUint16(14, date, true);
        view.setUint32(16, checksum, true);
        view.setUint32(20, size, true);
        view.setUint32(24, size, true);
        view.setUint16(28, nameLength, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, offset, true);
        return new Uint8Array(buffer);
    }

    function createEndRecord(count, centralSize, centralOffset) {
        const buffer = new ArrayBuffer(22);
        const view = new DataView(buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(4, 0, true);
        view.setUint16(6, 0, true);
        view.setUint16(8, count, true);
        view.setUint16(10, count, true);
        view.setUint32(12, centralSize, true);
        view.setUint32(16, centralOffset, true);
        view.setUint16(20, 0, true);
        return new Uint8Array(buffer);
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff];
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function buildCrcTable() {
        return Uint32Array.from({ length: 256 }, (_, value) => {
            let crc = value;
            for (let bit = 0; bit < 8; bit += 1) {
                crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
            }
            return crc >>> 0;
        });
    }

    function toDosDate(timestamp) {
        const value = new Date(timestamp);
        const year = Math.max(1980, Math.min(2107, value.getFullYear()));
        return {
            time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
            date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
        };
    }

    function sanitizeBaseName(name) {
        const safe = String(name || "dosya").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "");
        return safe || "dosya";
    }

    function sanitizeFileName(name) {
        const value = String(name || "dosya");
        const extension = value.match(/\.[^.]+$/)?.[0] || "";
        const base = extension ? value.slice(0, -extension.length) : value;
        return `${sanitizeBaseName(base)}${extension.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")}`;
    }

    function sanitizeArchivePath(name) {
        const parts = String(name || "dosya")
            .replace(/\\/g, "/")
            .split("/")
            .filter((part) => part && part !== "." && part !== "..")
            .map((part) => sanitizeBaseName(part));
        return parts.join("/") || "dosya";
    }

    function safeDisplayName(name) {
        return String(name || "Adsız dosya").replace(/[\u0000-\u001f]/g, "").slice(0, 180) || "Adsız dosya";
    }

    function getExtension(name) {
        const normalized = String(name || "").toLowerCase();
        if (normalized.endsWith(".tar.gz")) return "tar.gz";
        const match = normalized.match(/\.([a-z0-9]+)$/);
        return match ? match[1] : "";
    }

    function replaceExtension(name, extension) {
        const normalizedExtension = String(extension || "").replace(/^\./, "");
        const base = String(name || "dosya").replace(/\.(tar\.gz|[^.]+)$/i, "") || "dosya";
        return `${sanitizeBaseName(base)}.${normalizedExtension}`;
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 bayt";
        const units = ["bayt", "KB", "MB", "GB"];
        const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        const value = bytes / (1024 ** index);
        return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: index ? 2 : 0 }).format(value)} ${units[index]}`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return "Bilinmiyor";
        return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
    }

    function formatDuration(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "Bilinmiyor";
        const total = Math.round(seconds);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const remaining = total % 60;
        return hours
            ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
            : `${minutes}:${String(remaining).padStart(2, "0")}`;
    }

    function yieldToMain() {
        return new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    namespace.Services = Object.freeze({
        DownloadManager,
        ProgressManager,
        NotificationManager,
        ZipManager,
        sanitizeBaseName,
        sanitizeFileName,
        sanitizeArchivePath,
        safeDisplayName,
        getExtension,
        replaceExtension,
        formatBytes,
        formatDate,
        formatDuration,
        yieldToMain,
    });
})(window);
