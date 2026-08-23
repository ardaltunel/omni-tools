(function initMetadataCleanerCore(root, factory) {
    "use strict";

    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.MetadataCleanerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function metadataCleanerFactory() {
    "use strict";

    const UTF8 = new TextDecoder("utf-8", { fatal: false });
    const LATIN1 = new TextDecoder("latin1", { fatal: false });
    const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd8, 0xd9, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
    const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const PNG_PRESERVED_ANCILLARY = new Set([
        "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "bKGD", "hIST", "tRNS", "pHYs", "sPLT",
        "acTL", "fcTL", "fdAT", "cICP", "mDCv", "cLLi",
    ]);
    const WEBP_PRIVATE_CHUNKS = new Set(["EXIF", "XMP ", "ICMT", "IART", "ICOP", "INAM", "ISFT", "IDIT"]);
    const MAX_METADATA_FIELDS = 240;

    const EXIF_TAGS = {
        0x010e: ["description", "Açıklama"],
        0x010f: ["camera-make", "Kamera Üreticisi"],
        0x0110: ["camera-model", "Kamera Modeli"],
        0x0112: ["orientation", "Yön (Orientation)", true],
        0x011a: ["x-resolution", "Yatay Çözünürlük", true],
        0x011b: ["y-resolution", "Dikey Çözünürlük", true],
        0x0128: ["resolution-unit", "Çözünürlük Birimi", true],
        0x0131: ["software", "Yazılım / Editör"],
        0x0132: ["modified-date", "Değiştirilme Tarihi"],
        0x013b: ["artist", "Sanatçı / Yazar"],
        0x0201: ["thumbnail-offset", "Gömülü Küçük Görsel"],
        0x0202: ["thumbnail-length", "Küçük Görsel Boyutu"],
        0x8298: ["copyright", "Telif Bilgisi"],
        0x829a: ["exposure-time", "Pozlama Süresi"],
        0x829d: ["f-number", "Diyafram"],
        0x8822: ["exposure-program", "Pozlama Programı"],
        0x8827: ["iso", "ISO"],
        0x8830: ["sensitivity-type", "Hassasiyet Türü"],
        0x9000: ["exif-version", "EXIF Sürümü"],
        0x9003: ["captured-date", "Çekim Tarihi"],
        0x9004: ["created-date", "Oluşturma Tarihi"],
        0x9101: ["component-configuration", "Bileşen Yapılandırması"],
        0x9201: ["shutter-speed", "Enstantane"],
        0x9202: ["aperture", "Diyafram Değeri"],
        0x9204: ["exposure-bias", "Pozlama Telafisi"],
        0x9205: ["max-aperture", "Maksimum Diyafram"],
        0x9207: ["metering-mode", "Ölçüm Modu"],
        0x9208: ["light-source", "Işık Kaynağı"],
        0x9209: ["flash", "Flaş"],
        0x920a: ["focal-length", "Odak Uzaklığı"],
        0x927c: ["maker-note", "Cihaz Üretici Notu"],
        0x9286: ["user-comment", "Kullanıcı Yorumu"],
        0x9290: ["subsec-time", "Alt Saniye Bilgisi"],
        0x9291: ["subsec-original", "Çekim Alt Saniyesi"],
        0x9292: ["subsec-digitized", "Oluşturma Alt Saniyesi"],
        0xa000: ["flashpix-version", "FlashPix Sürümü"],
        0xa001: ["color-space", "Renk Uzayı", true],
        0xa002: ["pixel-width", "EXIF Görsel Genişliği", true],
        0xa003: ["pixel-height", "EXIF Görsel Yüksekliği", true],
        0xa20e: ["focal-plane-x", "Odak Düzlemi X Çözünürlüğü"],
        0xa20f: ["focal-plane-y", "Odak Düzlemi Y Çözünürlüğü"],
        0xa210: ["focal-plane-unit", "Odak Düzlemi Birimi"],
        0xa217: ["sensing-method", "Algılama Yöntemi"],
        0xa300: ["file-source", "Dosya Kaynağı"],
        0xa301: ["scene-type", "Sahne Türü"],
        0xa401: ["custom-rendered", "Özel İşleme"],
        0xa402: ["exposure-mode", "Pozlama Modu"],
        0xa403: ["white-balance", "Beyaz Dengesi"],
        0xa405: ["focal-length-35mm", "35mm Odak Uzaklığı"],
        0xa406: ["scene-capture-type", "Çekim Sahnesi"],
        0xa420: ["unique-image-id", "Benzersiz Görsel Kimliği"],
        0xa430: ["owner-name", "Kamera Sahibi"],
        0xa431: ["body-serial", "Kamera Seri Numarası"],
        0xa432: ["lens-specification", "Lens Özellikleri"],
        0xa433: ["lens-make", "Lens Üreticisi"],
        0xa434: ["lens-model", "Lens Modeli"],
        0xa435: ["lens-serial", "Lens Seri Numarası"],
    };

    const GPS_TAGS = {
        0x0000: ["gps-version", "GPS Sürümü"],
        0x0001: ["gps-latitude-ref", "GPS Enlem Yönü"],
        0x0002: ["gps-latitude", "GPS Enlem"],
        0x0003: ["gps-longitude-ref", "GPS Boylam Yönü"],
        0x0004: ["gps-longitude", "GPS Boylam"],
        0x0005: ["gps-altitude-ref", "GPS Rakım Referansı"],
        0x0006: ["gps-altitude", "GPS Rakım"],
        0x0007: ["gps-time", "GPS Saati"],
        0x0008: ["gps-satellites", "GPS Uyduları"],
        0x0009: ["gps-status", "GPS Durumu"],
        0x000a: ["gps-measure-mode", "GPS Ölçüm Modu"],
        0x000b: ["gps-dop", "GPS Hassasiyeti"],
        0x000c: ["gps-speed-ref", "GPS Hız Birimi"],
        0x000d: ["gps-speed", "GPS Hızı"],
        0x000e: ["gps-track-ref", "GPS Rota Referansı"],
        0x000f: ["gps-track", "GPS Rotası"],
        0x0010: ["gps-image-direction-ref", "Görsel Yön Referansı"],
        0x0011: ["gps-image-direction", "Görsel Yönü"],
        0x0012: ["gps-map-datum", "GPS Harita Datumu"],
        0x001d: ["gps-date", "GPS Tarihi"],
        0x001f: ["gps-horizontal-error", "GPS Yatay Hata"],
    };

    const IPTC_TAGS = {
        "1:90": "Kodlanmış Karakter Seti",
        "2:5": "Nesne Adı",
        "2:25": "Anahtar Kelimeler",
        "2:55": "Oluşturma Tarihi",
        "2:60": "Oluşturma Saati",
        "2:80": "Yazar / Fotoğrafçı",
        "2:85": "Yazar Unvanı",
        "2:90": "Şehir",
        "2:92": "Alt Konum",
        "2:95": "Bölge / Eyalet",
        "2:101": "Ülke",
        "2:103": "Orijinal İletim Referansı",
        "2:105": "Başlık",
        "2:110": "Kredi",
        "2:115": "Kaynak",
        "2:116": "Telif Bildirimi",
        "2:118": "İletişim",
        "2:120": "Açıklama / Altyazı",
        "2:122": "Açıklama Yazarı",
    };

    function toBytes(input) {
        if (input instanceof Uint8Array) return input;
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        throw new TypeError("Dosya verisi okunamadı.");
    }

    function standaloneBuffer(bytes) {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    function readAscii(bytes, start, length) {
        let output = "";
        const end = Math.min(bytes.length, start + length);
        for (let index = start; index < end; index += 1) output += String.fromCharCode(bytes[index]);
        return output;
    }

    function bytesEqual(bytes, offset, expected) {
        if (offset < 0 || offset + expected.length > bytes.length) return false;
        for (let index = 0; index < expected.length; index += 1) {
            if (bytes[offset + index] !== expected[index]) return false;
        }
        return true;
    }

    function asciiEquals(bytes, offset, text) {
        return readAscii(bytes, offset, text.length) === text;
    }

    function cleanText(value, limit = 220) {
        const normalized = String(value ?? "")
            .replace(/\0+/g, "")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!normalized) return "";
        return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
    }

    function decodeXmlEntities(value) {
        return value
            .replace(/&quot;/gi, "\"")
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&amp;/gi, "&");
    }

    function createCollector(format) {
        const metadata = [];
        const keys = new Set();
        const warnings = [];
        let orientation = 1;
        let gps = false;

        return {
            format,
            metadata,
            warnings,
            get orientation() { return orientation; },
            get gps() { return gps; },
            setOrientation(value) {
                const number = Number(Array.isArray(value) ? value[0] : value);
                if (Number.isInteger(number) && number >= 1 && number <= 8) orientation = number;
            },
            markGps() { gps = true; },
            add(group, key, label, value, options = {}) {
                if (metadata.length >= MAX_METADATA_FIELDS) return;
                const displayValue = cleanText(value);
                if (!displayValue) return;
                const identity = `${group}:${key}:${displayValue}`;
                if (keys.has(identity)) return;
                keys.add(identity);
                const technical = Boolean(options.technical);
                const removable = options.removable == null ? !technical : Boolean(options.removable);
                const sensitive = options.sensitive == null ? removable : Boolean(options.sensitive);
                metadata.push({ group, key, label, value: displayValue, technical, removable, sensitive });
                if (group === "GPS" || /gps|latitude|longitude|location|konum/i.test(`${key} ${label}`)) gps = true;
            },
        };
    }

    function valueToDisplay(value) {
        if (Array.isArray(value)) return value.map((entry) => valueToDisplay(entry)).join(", ");
        if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(7)));
        return cleanText(value);
    }

    function parseTiff(input, collector) {
        let bytes = toBytes(input);
        if (bytes.length >= 6 && asciiEquals(bytes, 0, "Exif\0\0")) bytes = bytes.subarray(6);
        if (bytes.length < 8) throw new Error("EXIF/TIFF başlığı eksik.");

        const little = asciiEquals(bytes, 0, "II");
        if (!little && !asciiEquals(bytes, 0, "MM")) throw new Error("EXIF byte sırası geçersiz.");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const u16 = (offset) => {
            if (offset < 0 || offset + 2 > bytes.length) throw new Error("EXIF alanı dosya sınırını aşıyor.");
            return view.getUint16(offset, little);
        };
        const i32 = (offset) => {
            if (offset < 0 || offset + 4 > bytes.length) throw new Error("EXIF alanı dosya sınırını aşıyor.");
            return view.getInt32(offset, little);
        };
        const u32 = (offset) => {
            if (offset < 0 || offset + 4 > bytes.length) throw new Error("EXIF alanı dosya sınırını aşıyor.");
            return view.getUint32(offset, little);
        };
        if (u16(2) !== 42) throw new Error("EXIF/TIFF imzası geçersiz.");

        const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
        const visited = new Set();
        const gpsValues = {};

        function readValue(type, count, entryOffset) {
            const unit = typeSizes[type];
            if (!unit || count < 0 || count > 1000000) return "";
            const byteLength = unit * count;
            if (!Number.isSafeInteger(byteLength) || byteLength > bytes.length) return "";
            const dataOffset = byteLength <= 4 ? entryOffset + 8 : u32(entryOffset + 8);
            if (dataOffset < 0 || dataOffset + byteLength > bytes.length) return "";
            if (type === 2) return cleanText(LATIN1.decode(bytes.subarray(dataOffset, dataOffset + byteLength)));
            if (type === 7) {
                const raw = bytes.subarray(dataOffset, dataOffset + Math.min(byteLength, 80));
                const printable = cleanText(LATIN1.decode(raw));
                return printable || `${byteLength} bayt`;
            }

            const values = [];
            const safeCount = Math.min(count, 32);
            for (let index = 0; index < safeCount; index += 1) {
                const offset = dataOffset + index * unit;
                if (type === 1) values.push(bytes[offset]);
                else if (type === 3) values.push(u16(offset));
                else if (type === 4) values.push(u32(offset));
                else if (type === 5) {
                    const denominator = u32(offset + 4);
                    values.push(denominator ? u32(offset) / denominator : 0);
                } else if (type === 9) values.push(i32(offset));
                else if (type === 10) {
                    const denominator = i32(offset + 4);
                    values.push(denominator ? i32(offset) / denominator : 0);
                } else if (type === 11) values.push(view.getFloat32(offset, little));
                else if (type === 12) values.push(view.getFloat64(offset, little));
            }
            return values.length === 1 ? values[0] : values;
        }

        function parseIfd(offset, kind) {
            if (!offset || visited.has(`${kind}:${offset}`)) return;
            if (offset < 8 || offset + 2 > bytes.length) throw new Error("EXIF dizin konumu geçersiz.");
            visited.add(`${kind}:${offset}`);
            const count = u16(offset);
            if (count > 1024 || offset + 2 + count * 12 + 4 > bytes.length) throw new Error("EXIF dizini bozuk veya aşırı büyük.");

            let exifPointer = 0;
            let gpsPointer = 0;
            for (let index = 0; index < count; index += 1) {
                const entryOffset = offset + 2 + index * 12;
                const tag = u16(entryOffset);
                const type = u16(entryOffset + 2);
                const itemCount = u32(entryOffset + 4);
                const value = readValue(type, itemCount, entryOffset);
                if (tag === 0x8769) { exifPointer = Number(value) || 0; continue; }
                if (tag === 0x8825) { gpsPointer = Number(value) || 0; continue; }

                if (kind === "gps") {
                    const definition = GPS_TAGS[tag] || [`gps-${tag.toString(16).padStart(4, "0")}`, `GPS 0x${tag.toString(16).padStart(4, "0").toUpperCase()}`];
                    gpsValues[tag] = value;
                    collector.add("GPS", definition[0], definition[1], valueToDisplay(value));
                    collector.markGps();
                    continue;
                }

                const definition = EXIF_TAGS[tag];
                if (!definition) {
                    if (value !== "") collector.add("EXIF", `tag-${tag.toString(16).padStart(4, "0")}`, `EXIF 0x${tag.toString(16).padStart(4, "0").toUpperCase()}`, valueToDisplay(value));
                    continue;
                }
                const [key, label, technical] = definition;
                if (key === "orientation") collector.setOrientation(value);
                collector.add("EXIF", key, label, valueToDisplay(value), {
                    technical: Boolean(technical),
                    removable: key === "orientation" ? false : true,
                    sensitive: key === "orientation" ? false : undefined,
                });
            }

            if (exifPointer) parseIfd(exifPointer, "exif");
            if (gpsPointer) parseIfd(gpsPointer, "gps");
            const nextOffsetLocation = offset + 2 + count * 12;
            const nextOffset = u32(nextOffsetLocation);
            if (nextOffset && kind === "ifd0") parseIfd(nextOffset, "ifd1");
        }

        parseIfd(u32(4), "ifd0");
        addGpsCoordinate(gpsValues, collector);
    }

    function addGpsCoordinate(values, collector) {
        const latitude = coordinateToDecimal(values[0x0002], values[0x0001]);
        const longitude = coordinateToDecimal(values[0x0004], values[0x0003]);
        if (latitude == null || longitude == null) return;
        collector.add("GPS", "gps-coordinates", "GPS Koordinatları", `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`);
        collector.markGps();
    }

    function coordinateToDecimal(value, reference) {
        if (!Array.isArray(value) || value.length < 3) return null;
        const degrees = Number(value[0]);
        const minutes = Number(value[1]);
        const seconds = Number(value[2]);
        if (![degrees, minutes, seconds].every(Number.isFinite)) return null;
        let result = degrees + minutes / 60 + seconds / 3600;
        if (/^[SW]$/i.test(String(reference))) result *= -1;
        return result;
    }

    function parseXmp(input, collector) {
        const text = UTF8.decode(toBytes(input));
        const ignored = new Set(["rdf", "xmlns", "x", "xmpmeta", "description", "li", "seq", "bag", "alt"]);
        let found = 0;
        const add = (qualified, rawValue) => {
            const name = qualified.includes(":") ? qualified.split(":").pop() : qualified;
            if (!name || ignored.has(name.toLowerCase())) return;
            const value = cleanText(decodeXmlEntities(rawValue));
            if (!value || /^https?:\/\//i.test(value) || value.length > 220) return;
            collector.add("XMP", `xmp-${qualified.toLowerCase()}`, humanizeName(name), value);
            if (/gps|latitude|longitude|location/i.test(qualified)) collector.markGps();
            found += 1;
        };

        for (const match of text.matchAll(/([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\s*=\s*["']([^"']*)["']/g)) {
            add(match[1], match[2]);
            if (found >= 100) break;
        }
        if (found < 100) {
            for (const match of text.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*>([^<]{1,500})<\/\1>/g)) {
                add(match[1], match[2]);
                if (found >= 100) break;
            }
        }
        if (found < 100) {
            for (const match of text.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*>([\s\S]{1,8000}?)<\/\1>/g)) {
                const listValues = Array.from(match[2].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g), (entry) => cleanText(entry[1].replace(/<[^>]+>/g, " "))).filter(Boolean);
                if (listValues.length) add(match[1], listValues.join(", "));
                if (found >= 100) break;
            }
        }
        if (!found) collector.add("XMP", "xmp-packet", "XMP Paketi", `${toBytes(input).length} bayt`);
    }

    function humanizeName(value) {
        return cleanText(String(value)
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[-_]+/g, " ")
            .replace(/^./, (character) => character.toLocaleUpperCase("tr-TR")));
    }

    function parseIptc(input, collector) {
        const bytes = toBytes(input);
        let found = 0;
        for (let index = 0; index + 5 <= bytes.length; index += 1) {
            if (bytes[index] !== 0x1c) continue;
            const record = bytes[index + 1];
            const dataset = bytes[index + 2];
            let length = (bytes[index + 3] << 8) | bytes[index + 4];
            let dataStart = index + 5;
            if (length & 0x8000) {
                const lengthBytes = length & 0x7fff;
                if (!lengthBytes || lengthBytes > 4 || dataStart + lengthBytes > bytes.length) continue;
                length = 0;
                for (let offset = 0; offset < lengthBytes; offset += 1) length = (length << 8) | bytes[dataStart + offset];
                dataStart += lengthBytes;
            }
            if (length < 0 || dataStart + length > bytes.length) continue;
            const key = `${record}:${dataset}`;
            const value = cleanText(UTF8.decode(bytes.subarray(dataStart, dataStart + Math.min(length, 500))));
            collector.add("IPTC", `iptc-${record}-${dataset}`, IPTC_TAGS[key] || `IPTC ${key}`, value || `${length} bayt`);
            found += 1;
            index = dataStart + length - 1;
        }
        if (!found) collector.add("IPTC", "iptc-packet", "IPTC / Photoshop Paketi", `${bytes.length} bayt`);
    }

    function walkJpeg(bytes) {
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("JPEG imzası geçersiz.");
        const entries = [{ kind: "marker", marker: 0xd8, start: 0, end: 2, dataStart: 2, dataEnd: 2 }];
        let position = 2;
        let inScan = false;
        let foundEnd = false;

        while (position < bytes.length) {
            if (inScan) {
                const scanStart = position;
                let markerStart = -1;
                while (position < bytes.length) {
                    if (bytes[position] !== 0xff) { position += 1; continue; }
                    let codeIndex = position + 1;
                    while (codeIndex < bytes.length && bytes[codeIndex] === 0xff) codeIndex += 1;
                    if (codeIndex >= bytes.length) break;
                    const code = bytes[codeIndex];
                    if (code === 0x00 || (code >= 0xd0 && code <= 0xd7)) {
                        position = codeIndex + 1;
                        continue;
                    }
                    markerStart = position;
                    break;
                }
                if (markerStart < 0) throw new Error("JPEG tarama verisi tamamlanmamış.");
                if (markerStart > scanStart) entries.push({ kind: "raw", start: scanStart, end: markerStart });
                position = markerStart;
                inScan = false;
                continue;
            }

            if (bytes[position] !== 0xff) throw new Error("JPEG segment sınırı geçersiz.");
            const start = position;
            let codeIndex = position + 1;
            while (codeIndex < bytes.length && bytes[codeIndex] === 0xff) codeIndex += 1;
            if (codeIndex >= bytes.length) throw new Error("JPEG marker'ı tamamlanmamış.");
            const marker = bytes[codeIndex];
            if (marker === 0x00) throw new Error("JPEG marker'ı geçersiz.");

            if (JPEG_STANDALONE_MARKERS.has(marker)) {
                const end = codeIndex + 1;
                entries.push({ kind: "marker", marker, start, end, dataStart: end, dataEnd: end });
                position = end;
                if (marker === 0xd9) { foundEnd = true; break; }
                continue;
            }

            if (codeIndex + 2 >= bytes.length) throw new Error("JPEG segment uzunluğu eksik.");
            const length = (bytes[codeIndex + 1] << 8) | bytes[codeIndex + 2];
            if (length < 2) throw new Error("JPEG segment uzunluğu geçersiz.");
            const dataStart = codeIndex + 3;
            const end = codeIndex + 1 + length;
            if (end > bytes.length) throw new Error("JPEG segmenti dosya sınırını aşıyor.");
            entries.push({ kind: "marker", marker, start, end, dataStart, dataEnd: end });
            position = end;
            if (marker === 0xda) inScan = true;
        }

        if (!foundEnd) throw new Error("JPEG bitiş marker'ı bulunamadı.");
        return entries;
    }

    function inspectJpeg(bytes, collector) {
        const entries = walkJpeg(bytes);
        let width = 0;
        let height = 0;

        entries.forEach((entry) => {
            if (entry.kind !== "marker") return;
            const data = bytes.subarray(entry.dataStart, entry.dataEnd);
            const marker = entry.marker;
            if (isSofMarker(marker) && data.length >= 5) {
                height = (data[1] << 8) | data[2];
                width = (data[3] << 8) | data[4];
            } else if (marker === 0xe1 && asciiEquals(data, 0, "Exif\0\0")) {
                try { parseTiff(data, collector); }
                catch (error) { collector.add("EXIF", "exif-corrupt", "EXIF Paketi", `Okunamadı: ${error.message}`); }
            } else if (marker === 0xe1 && (asciiEquals(data, 0, "http://ns.adobe.com/xap/1.0/") || asciiEquals(data, 0, "http://ns.adobe.com/xmp/extension/"))) {
                const zero = data.indexOf(0);
                parseXmp(zero >= 0 ? data.subarray(zero + 1) : data, collector);
            } else if (marker === 0xed) {
                parseIptc(data, collector);
            } else if (marker === 0xfe) {
                collector.add("Yorum", "jpeg-comment", "JPEG Yorumu", LATIN1.decode(data) || `${data.length} bayt`);
            } else if (marker === 0xe2 && asciiEquals(data, 0, "ICC_PROFILE\0")) {
                collector.add("Renk Profili", "icc-profile", "ICC Renk Profili", `${data.length} bayt`, { technical: true, removable: false, sensitive: false });
            } else if (marker === 0xe2) {
                collector.add("JPEG", "app2-metadata", "APP2 / MPF / FlashPix Verisi", `${data.length} bayt`);
            } else if ((marker >= 0xe3 && marker <= 0xec) || marker === 0xef) {
                collector.add("JPEG", `app-${marker - 0xe0}`, `APP${marker - 0xe0} Uygulama Verisi`, `${data.length} bayt`);
            }
        });
        return { width, height };
    }

    function isSofMarker(marker) {
        return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    }

    function stripJpeg(bytes, analysis) {
        const entries = walkJpeg(bytes);
        const parts = [];
        let retainedOrientation = false;
        entries.forEach((entry) => {
            if (entry.kind === "raw") { parts.push(bytes.subarray(entry.start, entry.end)); return; }
            const marker = entry.marker;
            const data = bytes.subarray(entry.dataStart, entry.dataEnd);
            let remove = false;
            let replacement = null;

            if (marker === 0xe1) {
                remove = true;
                if (!retainedOrientation && asciiEquals(data, 0, "Exif\0\0") && analysis.orientation > 1) {
                    replacement = makeJpegSegment(0xe1, concatBytes(asciiBytes("Exif\0\0"), makeMinimalTiff(analysis.orientation)));
                    retainedOrientation = true;
                }
            } else if (marker === 0xed || marker === 0xfe) {
                remove = true;
            } else if (marker === 0xe2) {
                remove = !asciiEquals(data, 0, "ICC_PROFILE\0");
            } else if ((marker >= 0xe3 && marker <= 0xec) || marker === 0xef) {
                remove = true;
            }

            if (replacement) parts.push(replacement);
            else if (!remove) parts.push(bytes.subarray(entry.start, entry.end));
        });
        return concatBytes(...parts);
    }

    function makeJpegSegment(marker, payload) {
        if (payload.length + 2 > 0xffff) throw new Error("JPEG üst veri bölümü çok büyük.");
        const output = new Uint8Array(payload.length + 4);
        output[0] = 0xff;
        output[1] = marker;
        output[2] = ((payload.length + 2) >>> 8) & 0xff;
        output[3] = (payload.length + 2) & 0xff;
        output.set(payload, 4);
        return output;
    }

    function parsePngChunks(bytes) {
        if (!bytesEqual(bytes, 0, PNG_SIGNATURE)) throw new Error("PNG imzası geçersiz.");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const chunks = [];
        let position = 8;
        let foundEnd = false;
        while (position + 12 <= bytes.length) {
            const length = view.getUint32(position, false);
            const type = readAscii(bytes, position + 4, 4);
            const dataStart = position + 8;
            const dataEnd = dataStart + length;
            const end = dataEnd + 4;
            if (!/^[A-Za-z]{4}$/.test(type) || dataEnd < dataStart || end > bytes.length) throw new Error("PNG chunk yapısı bozuk.");
            const expectedCrc = view.getUint32(dataEnd, false);
            const actualCrc = crc32(bytes.subarray(position + 4, dataEnd));
            if (expectedCrc !== actualCrc) throw new Error(`PNG ${type} bütünlük denetimi başarısız.`);
            chunks.push({ type, start: position, end, dataStart, dataEnd });
            position = end;
            if (type === "IEND") { foundEnd = true; break; }
        }
        if (!foundEnd) throw new Error("PNG bitiş chunk'ı bulunamadı.");
        return chunks;
    }

    function inspectPng(bytes, collector) {
        const chunks = parsePngChunks(bytes);
        let width = 0;
        let height = 0;
        chunks.forEach((chunk) => {
            const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
            if (chunk.type === "IHDR" && data.length === 13) {
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                width = view.getUint32(0, false);
                height = view.getUint32(4, false);
            } else if (chunk.type === "eXIf") {
                try { parseTiff(data, collector); }
                catch (error) { collector.add("EXIF", "exif-corrupt", "EXIF Paketi", `Okunamadı: ${error.message}`); }
            } else if (chunk.type === "tEXt") {
                const zero = data.indexOf(0);
                const keyword = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data));
                const value = zero >= 0 ? LATIN1.decode(data.subarray(zero + 1)) : `${data.length} bayt`;
                collector.add("PNG Metni", `png-text-${keyword.toLowerCase()}`, keyword || "PNG Metin Alanı", value);
            } else if (chunk.type === "zTXt") {
                const zero = data.indexOf(0);
                const keyword = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data));
                collector.add("PNG Metni", `png-ztext-${keyword.toLowerCase()}`, keyword || "Sıkıştırılmış PNG Metni", "Sıkıştırılmış metin");
            } else if (chunk.type === "iTXt") {
                parseInternationalText(data, collector);
            } else if (chunk.type === "tIME" && data.length === 7) {
                const year = (data[0] << 8) | data[1];
                collector.add("PNG", "png-modified-date", "Değiştirilme Tarihi", `${year}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}:${pad(data[6])} UTC`);
            } else if (chunk.type === "iCCP") {
                const zero = data.indexOf(0);
                const name = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data));
                collector.add("Renk Profili", "icc-profile", "ICC Renk Profili", name || `${data.length} bayt`, { technical: true, removable: false, sensitive: false });
            } else if (chunk.type === "sRGB") {
                collector.add("Renk Profili", "srgb-profile", "sRGB Renk Profili", "Standart sRGB", { technical: true, removable: false, sensitive: false });
            } else if (isPngAncillary(chunk.type) && !PNG_PRESERVED_ANCILLARY.has(chunk.type)) {
                collector.add("PNG", `png-${chunk.type}`, `${chunk.type} Ek Verisi`, `${data.length} bayt`);
            }
        });
        return { width, height };
    }

    function parseInternationalText(data, collector) {
        const first = data.indexOf(0);
        if (first < 0 || first + 2 >= data.length) {
            collector.add("PNG Metni", "png-itxt", "Uluslararası PNG Metni", `${data.length} bayt`);
            return;
        }
        const keyword = cleanText(LATIN1.decode(data.subarray(0, first))) || "Uluslararası PNG Metni";
        const compressed = data[first + 1] === 1;
        let position = first + 3;
        for (let count = 0; count < 2; count += 1) {
            const zero = data.indexOf(0, position);
            if (zero < 0) { position = data.length; break; }
            position = zero + 1;
        }
        const textBytes = data.subarray(position);
        const value = compressed ? "Sıkıştırılmış metin" : UTF8.decode(textBytes);
        if (!compressed && /xmp|adobe/i.test(keyword)) parseXmp(textBytes, collector);
        else collector.add("PNG Metni", `png-itext-${keyword.toLowerCase()}`, keyword, value || `${data.length} bayt`);
        if (/gps|location|latitude|longitude/i.test(`${keyword} ${value}`)) collector.markGps();
    }

    function stripPng(bytes, analysis) {
        const chunks = parsePngChunks(bytes);
        const parts = [PNG_SIGNATURE];
        let retainedOrientation = false;
        chunks.forEach((chunk) => {
            const ancillary = isPngAncillary(chunk.type);
            const preserve = !ancillary || PNG_PRESERVED_ANCILLARY.has(chunk.type);
            if (chunk.type === "eXIf" && !retainedOrientation && analysis.orientation > 1) {
                parts.push(makePngChunk("eXIf", makeMinimalTiff(analysis.orientation)));
                retainedOrientation = true;
            } else if (preserve) {
                parts.push(bytes.subarray(chunk.start, chunk.end));
            }
        });
        return concatBytes(...parts);
    }

    function isPngAncillary(type) {
        return (type.charCodeAt(0) & 0x20) !== 0;
    }

    function makePngChunk(type, data) {
        const typeBytes = asciiBytes(type);
        const output = new Uint8Array(data.length + 12);
        const view = new DataView(output.buffer);
        view.setUint32(0, data.length, false);
        output.set(typeBytes, 4);
        output.set(data, 8);
        view.setUint32(8 + data.length, crc32(concatBytes(typeBytes, data)), false);
        return output;
    }

    function parseWebpChunks(bytes) {
        if (bytes.length < 12 || !asciiEquals(bytes, 0, "RIFF") || !asciiEquals(bytes, 8, "WEBP")) throw new Error("WebP imzası geçersiz.");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const riffEnd = view.getUint32(4, true) + 8;
        if (riffEnd < 12 || riffEnd > bytes.length) throw new Error("WebP RIFF uzunluğu geçersiz.");
        const chunks = [];
        let position = 12;
        while (position + 8 <= riffEnd) {
            const type = readAscii(bytes, position, 4);
            const length = view.getUint32(position + 4, true);
            const dataStart = position + 8;
            const dataEnd = dataStart + length;
            const end = dataEnd + (length & 1);
            if (!/^[\x20-\x7e]{4}$/.test(type) || dataEnd < dataStart || end > riffEnd) throw new Error("WebP chunk yapısı bozuk.");
            chunks.push({ type, start: position, end, dataStart, dataEnd });
            position = end;
        }
        if (position !== riffEnd) throw new Error("WebP RIFF hizalaması geçersiz.");
        return chunks;
    }

    function inspectWebp(bytes, collector) {
        const chunks = parseWebpChunks(bytes);
        let width = 0;
        let height = 0;
        chunks.forEach((chunk) => {
            const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
            if (chunk.type === "VP8X" && data.length >= 10) {
                width = 1 + readUint24LE(data, 4);
                height = 1 + readUint24LE(data, 7);
            } else if (chunk.type === "VP8 " && data.length >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) {
                width = (data[6] | (data[7] << 8)) & 0x3fff;
                height = (data[8] | (data[9] << 8)) & 0x3fff;
            } else if (chunk.type === "VP8L" && data.length >= 5 && data[0] === 0x2f) {
                const bits = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
                width = (bits & 0x3fff) + 1;
                height = ((bits >>> 14) & 0x3fff) + 1;
            } else if (chunk.type === "EXIF") {
                try { parseTiff(data, collector); }
                catch (error) { collector.add("EXIF", "exif-corrupt", "EXIF Paketi", `Okunamadı: ${error.message}`); }
            } else if (chunk.type === "XMP ") {
                parseXmp(data, collector);
            } else if (chunk.type === "ICCP") {
                collector.add("Renk Profili", "icc-profile", "ICC Renk Profili", `${data.length} bayt`, { technical: true, removable: false, sensitive: false });
            } else if (chunk.type === "LIST" && asciiEquals(data, 0, "INFO")) {
                collector.add("WebP", "riff-info", "RIFF INFO Verisi", `${data.length} bayt`);
            } else if (WEBP_PRIVATE_CHUNKS.has(chunk.type)) {
                collector.add("WebP", `webp-${chunk.type.trim().toLowerCase()}`, `${chunk.type.trim()} Verisi`, cleanText(LATIN1.decode(data)) || `${data.length} bayt`);
            }
        });
        return { width, height };
    }

    function stripWebp(bytes, analysis) {
        const chunks = parseWebpChunks(bytes);
        const parts = [];
        let retainedOrientation = false;
        chunks.forEach((chunk) => {
            const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
            let remove = WEBP_PRIVATE_CHUNKS.has(chunk.type);
            if (chunk.type === "LIST" && asciiEquals(data, 0, "INFO")) remove = true;
            if (chunk.type === "EXIF" && analysis.orientation > 1 && !retainedOrientation) {
                parts.push(makeWebpChunk("EXIF", makeMinimalTiff(analysis.orientation)));
                retainedOrientation = true;
                return;
            }
            if (chunk.type === "VP8X") {
                const updated = data.slice();
                updated[0] &= ~(0x08 | 0x04);
                if (retainedOrientation || (analysis.orientation > 1 && chunks.some((entry) => entry.type === "EXIF"))) updated[0] |= 0x08;
                parts.push(makeWebpChunk("VP8X", updated));
                return;
            }
            if (!remove) parts.push(bytes.subarray(chunk.start, chunk.end));
        });

        const payload = concatBytes(asciiBytes("WEBP"), ...parts);
        const output = new Uint8Array(payload.length + 8);
        output.set(asciiBytes("RIFF"), 0);
        new DataView(output.buffer).setUint32(4, payload.length, true);
        output.set(payload, 8);
        return output;
    }

    function makeWebpChunk(type, data) {
        const output = new Uint8Array(8 + data.length + (data.length & 1));
        output.set(asciiBytes(type), 0);
        new DataView(output.buffer).setUint32(4, data.length, true);
        output.set(data, 8);
        return output;
    }

    function makeMinimalTiff(orientation) {
        const value = Math.max(1, Math.min(8, Number(orientation) || 1));
        const output = new Uint8Array(26);
        const view = new DataView(output.buffer);
        output[0] = 0x49;
        output[1] = 0x49;
        view.setUint16(2, 42, true);
        view.setUint32(4, 8, true);
        view.setUint16(8, 1, true);
        view.setUint16(10, 0x0112, true);
        view.setUint16(12, 3, true);
        view.setUint32(14, 1, true);
        view.setUint16(18, value, true);
        view.setUint32(22, 0, true);
        return output;
    }

    function readUint24LE(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    }

    function pad(value) {
        return String(value).padStart(2, "0");
    }

    function asciiBytes(value) {
        const output = new Uint8Array(value.length);
        for (let index = 0; index < value.length; index += 1) output[index] = value.charCodeAt(index) & 0xff;
        return output;
    }

    function concatBytes(...parts) {
        const valid = parts.filter(Boolean);
        const length = valid.reduce((sum, part) => sum + part.length, 0);
        const output = new Uint8Array(length);
        let offset = 0;
        valid.forEach((part) => { output.set(part, offset); offset += part.length; });
        return output;
    }

    let crcTable = null;
    function crc32(input) {
        const bytes = toBytes(input);
        if (!crcTable) {
            crcTable = new Uint32Array(256);
            for (let index = 0; index < 256; index += 1) {
                let value = index;
                for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
                crcTable[index] = value >>> 0;
            }
        }
        let crc = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function createZip(files) {
        if (!Array.isArray(files) || !files.length) throw new Error("ZIP için temizlenmiş dosya bulunamadı.");
        if (files.length > 65535) throw new Error("ZIP dosya sayısı sınırı aşıldı.");
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;

        files.forEach((file) => {
            const data = toBytes(file.buffer);
            const name = encoder.encode(String(file.name || "temizlenmis-dosya").replace(/\\/g, "/"));
            if (!name.length || name.length > 65535) throw new Error("ZIP dosya adı geçersiz.");
            if (data.length > 0xffffffff || localOffset > 0xffffffff) throw new Error("ZIP64 gerektiren dosyalar desteklenmiyor.");
            const checksum = crc32(data);
            const { dosDate, dosTime } = toDosDateTime(file.lastModified);

            const localHeader = new Uint8Array(30 + name.length);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, dosTime, true);
            localView.setUint16(12, dosDate, true);
            localView.setUint32(14, checksum, true);
            localView.setUint32(18, data.length, true);
            localView.setUint32(22, data.length, true);
            localView.setUint16(26, name.length, true);
            localView.setUint16(28, 0, true);
            localHeader.set(name, 30);
            localParts.push(localHeader, data);

            const centralHeader = new Uint8Array(46 + name.length);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, dosTime, true);
            centralView.setUint16(14, dosDate, true);
            centralView.setUint32(16, checksum, true);
            centralView.setUint32(20, data.length, true);
            centralView.setUint32(24, data.length, true);
            centralView.setUint16(28, name.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, localOffset, true);
            centralHeader.set(name, 46);
            centralParts.push(centralHeader);
            localOffset += localHeader.length + data.length;
        });

        const centralDirectory = concatBytes(...centralParts);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralDirectory.length, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);
        return standaloneBuffer(concatBytes(...localParts, centralDirectory, end));
    }

    function toDosDateTime(timestamp) {
        const input = new Date(Number(timestamp) || Date.now());
        const year = Math.max(1980, Math.min(2107, input.getFullYear()));
        const month = Math.max(1, input.getMonth() + 1);
        const day = Math.max(1, input.getDate());
        return {
            dosDate: ((year - 1980) << 9) | (month << 5) | day,
            dosTime: (input.getHours() << 11) | (input.getMinutes() << 5) | Math.floor(input.getSeconds() / 2),
        };
    }

    function sniffFormat(input) {
        const bytes = toBytes(input);
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
        if (bytesEqual(bytes, 0, PNG_SIGNATURE)) return "png";
        if (bytes.length >= 12 && asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WEBP")) return "webp";
        if (bytes.length >= 12 && asciiEquals(bytes, 4, "ftyp")) {
            const brand = readAscii(bytes, 8, 4).toLowerCase();
            if (["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand)) return "heic";
            if (["isom", "mp41", "mp42", "qt  ", "avc1", "iso2"].includes(brand)) return "video";
        }
        return "unknown";
    }

    function formatInfo(format) {
        if (format === "jpeg") return { format: "jpeg", label: "JPEG", mime: "image/jpeg", extension: "jpg", lossless: true };
        if (format === "png") return { format: "png", label: "PNG", mime: "image/png", extension: "png", lossless: true };
        if (format === "webp") return { format: "webp", label: "WebP", mime: "image/webp", extension: "webp", lossless: true };
        return null;
    }

    function inspect(input) {
        const bytes = toBytes(input);
        const format = sniffFormat(bytes);
        if (format === "heic") throw new Error("HEIC/HEIF için güvenli, kayıpsız tarayıcı temizliği bu sürümde desteklenmiyor.");
        if (format === "video") throw new Error("Video desteği yakında. Bu sürüm JPEG, PNG ve WebP fotoğraflara odaklanır.");
        const info = formatInfo(format);
        if (!info) throw new Error("Desteklenmeyen veya tanınmayan dosya. JPEG, PNG ya da WebP seçin.");

        const collector = createCollector(format);
        let dimensions;
        if (format === "jpeg") dimensions = inspectJpeg(bytes, collector);
        else if (format === "png") dimensions = inspectPng(bytes, collector);
        else dimensions = inspectWebp(bytes, collector);
        if (!dimensions.width || !dimensions.height) collector.warnings.push("Görsel çözünürlüğü container verisinden okunamadı.");
        if (collector.metadata.length >= MAX_METADATA_FIELDS) collector.warnings.push("Üst veri listesi güvenlik amacıyla sınırlandırıldı.");

        return {
            ...info,
            width: dimensions.width,
            height: dimensions.height,
            metadata: collector.metadata,
            metadataCount: collector.metadata.length,
            removableCount: collector.metadata.filter((field) => field.removable).length,
            technicalCount: collector.metadata.filter((field) => field.technical).length,
            gps: collector.gps,
            orientation: collector.orientation,
            warnings: collector.warnings,
        };
    }

    function clean(input) {
        const bytes = toBytes(input);
        const before = inspect(bytes);
        let output;
        if (before.format === "jpeg") output = stripJpeg(bytes, before);
        else if (before.format === "png") output = stripPng(bytes, before);
        else output = stripWebp(bytes, before);
        const after = inspect(output);
        const remainingPrivate = after.metadata.filter((field) => field.removable);
        if (remainingPrivate.length) throw new Error(`Doğrulama başarısız: ${remainingPrivate.length} mahremiyet alanı çıktıda kaldı.`);
        if (before.width && after.width && (before.width !== after.width || before.height !== after.height)) {
            throw new Error("Doğrulama başarısız: görsel çözünürlüğü değişti.");
        }
        return {
            output: standaloneBuffer(output),
            before,
            after,
            removedCount: before.removableCount,
            gpsRemoved: before.gps && !after.gps,
            lossless: true,
            orientationRetained: before.orientation > 1,
            colorProfileRetained: after.metadata.some((field) => field.key === "icc-profile" || field.key === "srgb-profile"),
        };
    }

    return {
        inspect,
        clean,
        createZip,
        sniffFormat,
        crc32,
        _test: {
            concatBytes,
            asciiBytes,
            makeMinimalTiff,
            makePngChunk,
            makeWebpChunk,
            walkJpeg,
            parsePngChunks,
            parseWebpChunks,
        },
    };
});
