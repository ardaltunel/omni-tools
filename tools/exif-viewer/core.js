(function initExifViewerCore(root, factory) {
    "use strict";

    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.ExifViewerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function exifViewerFactory() {
    "use strict";

    const UTF8 = new TextDecoder("utf-8", { fatal: false });
    const LATIN1 = new TextDecoder("latin1", { fatal: false });
    const UTF16LE = new TextDecoder("utf-16le", { fatal: false });
    const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const MAX_FIELDS = 1200;
    const MAX_RAW_XMP = 512 * 1024;
    const MAX_THUMBNAIL = 2 * 1024 * 1024;

    const TAGS = {
        0x000b: ["ProcessingSoftware", "İşleme Yazılımı", "software"],
        0x00fe: ["NewSubfileType", "Alt Dosya Türü", "technical"],
        0x0100: ["ImageWidth", "Görsel Genişliği", "technical"],
        0x0101: ["ImageLength", "Görsel Yüksekliği", "technical"],
        0x0102: ["BitsPerSample", "Kanal Başına Bit", "color"],
        0x0103: ["Compression", "Sıkıştırma", "technical"],
        0x0106: ["PhotometricInterpretation", "Fotometrik Yorum", "color"],
        0x010e: ["ImageDescription", "Görsel Açıklaması", "description"],
        0x010f: ["Make", "Üretici", "camera"],
        0x0110: ["Model", "Kamera Modeli", "camera"],
        0x0111: ["StripOffsets", "Şerit Konumları", "technical"],
        0x0112: ["Orientation", "Yön", "file"],
        0x0115: ["SamplesPerPixel", "Piksel Başına Örnek", "color"],
        0x0116: ["RowsPerStrip", "Şerit Başına Satır", "technical"],
        0x0117: ["StripByteCounts", "Şerit Bayt Boyutları", "technical"],
        0x011a: ["XResolution", "Yatay Çözünürlük", "technical"],
        0x011b: ["YResolution", "Dikey Çözünürlük", "technical"],
        0x011c: ["PlanarConfiguration", "Düzlemsel Yapılandırma", "color"],
        0x0128: ["ResolutionUnit", "Çözünürlük Birimi", "technical"],
        0x0131: ["Software", "Yazılım", "software"],
        0x0132: ["ModifyDate", "Metadata Değiştirme Tarihi", "date"],
        0x013b: ["Artist", "Sanatçı / Yazar", "rights"],
        0x013c: ["HostComputer", "Ana Bilgisayar", "software"],
        0x013e: ["WhitePoint", "Beyaz Nokta", "color"],
        0x013f: ["PrimaryChromaticities", "Birincil Renk Koordinatları", "color"],
        0x0201: ["ThumbnailOffset", "EXIF Önizleme Konumu", "technical"],
        0x0202: ["ThumbnailLength", "EXIF Önizleme Boyutu", "technical"],
        0x0211: ["YCbCrCoefficients", "YCbCr Katsayıları", "color"],
        0x0212: ["YCbCrSubSampling", "YCbCr Alt Örnekleme", "color"],
        0x0213: ["YCbCrPositioning", "YCbCr Konumlandırma", "color"],
        0x8298: ["Copyright", "Telif Hakkı", "rights"],
        0x829a: ["ExposureTime", "Enstantane", "capture"],
        0x829d: ["FNumber", "Diyafram", "capture"],
        0x8822: ["ExposureProgram", "Pozlama Programı", "capture"],
        0x8824: ["SpectralSensitivity", "Spektral Hassasiyet", "capture"],
        0x8827: ["ISOSpeedRatings", "ISO", "capture"],
        0x8830: ["SensitivityType", "Hassasiyet Türü", "capture"],
        0x8831: ["StandardOutputSensitivity", "Standart Çıkış Hassasiyeti", "capture"],
        0x8832: ["RecommendedExposureIndex", "Önerilen Pozlama İndeksi", "capture"],
        0x9000: ["ExifVersion", "EXIF Sürümü", "technical"],
        0x9003: ["DateTimeOriginal", "Fotoğrafın Çekildiği Tarih", "date"],
        0x9004: ["DateTimeDigitized", "Dijitalleştirme Tarihi", "date"],
        0x9010: ["OffsetTime", "Metadata Saat Dilimi", "date"],
        0x9011: ["OffsetTimeOriginal", "Çekim Saat Dilimi", "date"],
        0x9012: ["OffsetTimeDigitized", "Dijitalleştirme Saat Dilimi", "date"],
        0x9101: ["ComponentsConfiguration", "Bileşen Yapılandırması", "technical"],
        0x9102: ["CompressedBitsPerPixel", "Piksel Başına Sıkıştırılmış Bit", "technical"],
        0x9201: ["ShutterSpeedValue", "Deklanşör Hızı", "capture"],
        0x9202: ["ApertureValue", "Diyafram Değeri", "capture"],
        0x9203: ["BrightnessValue", "Parlaklık Değeri", "capture"],
        0x9204: ["ExposureBiasValue", "Pozlama Telafisi", "capture"],
        0x9205: ["MaxApertureValue", "Maksimum Diyafram", "capture"],
        0x9206: ["SubjectDistance", "Nesne Mesafesi", "capture"],
        0x9207: ["MeteringMode", "Ölçüm Modu", "capture"],
        0x9208: ["LightSource", "Işık Kaynağı", "capture"],
        0x9209: ["Flash", "Flaş", "capture"],
        0x920a: ["FocalLength", "Odak Uzaklığı", "capture"],
        0x9214: ["SubjectArea", "Nesne Alanı", "capture"],
        0x927c: ["MakerNote", "Üretici Notu", "technical"],
        0x9286: ["UserComment", "Kullanıcı Yorumu", "description"],
        0x9290: ["SubSecTime", "Metadata Alt Saniyesi", "date"],
        0x9291: ["SubSecTimeOriginal", "Çekim Alt Saniyesi", "date"],
        0x9292: ["SubSecTimeDigitized", "Dijitalleştirme Alt Saniyesi", "date"],
        0x9c9b: ["XPTitle", "Windows Başlığı", "description"],
        0x9c9c: ["XPComment", "Windows Yorumu", "description"],
        0x9c9d: ["XPAuthor", "Windows Yazarı", "rights"],
        0x9c9e: ["XPKeywords", "Windows Anahtar Kelimeleri", "description"],
        0x9c9f: ["XPSubject", "Windows Konusu", "description"],
        0xa000: ["FlashpixVersion", "FlashPix Sürümü", "technical"],
        0xa001: ["ColorSpace", "Renk Uzayı", "color"],
        0xa002: ["PixelXDimension", "EXIF Piksel Genişliği", "technical"],
        0xa003: ["PixelYDimension", "EXIF Piksel Yüksekliği", "technical"],
        0xa004: ["RelatedSoundFile", "İlişkili Ses Dosyası", "technical"],
        0xa005: ["InteropIFDPointer", "Interop IFD Konumu", "technical"],
        0xa20b: ["FlashEnergy", "Flaş Enerjisi", "capture"],
        0xa20e: ["FocalPlaneXResolution", "Odak Düzlemi X Çözünürlüğü", "technical"],
        0xa20f: ["FocalPlaneYResolution", "Odak Düzlemi Y Çözünürlüğü", "technical"],
        0xa210: ["FocalPlaneResolutionUnit", "Odak Düzlemi Çözünürlük Birimi", "technical"],
        0xa214: ["SubjectLocation", "Nesne Konumu", "capture"],
        0xa215: ["ExposureIndex", "Pozlama İndeksi", "capture"],
        0xa217: ["SensingMethod", "Algılama Yöntemi", "capture"],
        0xa300: ["FileSource", "Dosya Kaynağı", "technical"],
        0xa301: ["SceneType", "Sahne Türü", "technical"],
        0xa302: ["CFAPattern", "CFA Deseni", "technical"],
        0xa401: ["CustomRendered", "Özel İşleme", "capture"],
        0xa402: ["ExposureMode", "Pozlama Modu", "capture"],
        0xa403: ["WhiteBalance", "Beyaz Dengesi", "capture"],
        0xa404: ["DigitalZoomRatio", "Dijital Yakınlaştırma", "capture"],
        0xa405: ["FocalLengthIn35mmFilm", "35mm Eşdeğer Odak", "capture"],
        0xa406: ["SceneCaptureType", "Çekim Sahnesi", "capture"],
        0xa407: ["GainControl", "Kazanç Kontrolü", "capture"],
        0xa408: ["Contrast", "Kontrast", "capture"],
        0xa409: ["Saturation", "Doygunluk", "capture"],
        0xa40a: ["Sharpness", "Keskinlik", "capture"],
        0xa40b: ["DeviceSettingDescription", "Cihaz Ayarı Açıklaması", "technical"],
        0xa40c: ["SubjectDistanceRange", "Nesne Mesafe Aralığı", "capture"],
        0xa420: ["ImageUniqueID", "Benzersiz Görsel Kimliği", "technical"],
        0xa430: ["OwnerName", "Kamera Sahibi", "camera"],
        0xa431: ["BodySerialNumber", "Gövde Seri Numarası", "camera"],
        0xa432: ["LensSpecification", "Lens Özellikleri", "camera"],
        0xa433: ["LensMake", "Lens Üreticisi", "camera"],
        0xa434: ["LensModel", "Lens Modeli", "camera"],
        0xa435: ["LensSerialNumber", "Lens Seri Numarası", "camera"],
        0xa460: ["CompositeImage", "Birleşik Görsel", "technical"],
        0xa500: ["Gamma", "EXIF Gamma", "color"],
        0xc614: ["UniqueCameraModel", "Benzersiz Kamera Modeli", "camera"],
        0xc62f: ["CameraSerialNumber", "Kamera Seri Numarası", "camera"],
        0x9400: ["CameraTemperature", "Kamera Sıcaklığı", "capture"],
        0x9401: ["Humidity", "Nem", "capture"],
        0x9402: ["Pressure", "Basınç", "capture"],
        0x9403: ["WaterDepth", "Su Derinliği", "capture"],
        0x9404: ["Acceleration", "İvme", "capture"],
        0x9405: ["CameraElevationAngle", "Kamera Yükselme Açısı", "capture"],
    };

    const GPS_TAGS = {
        0x0000: ["GPSVersionID", "GPS Sürümü"],
        0x0001: ["GPSLatitudeRef", "Enlem Yönü"],
        0x0002: ["GPSLatitude", "Enlem (DMS)"],
        0x0003: ["GPSLongitudeRef", "Boylam Yönü"],
        0x0004: ["GPSLongitude", "Boylam (DMS)"],
        0x0005: ["GPSAltitudeRef", "Rakım Referansı"],
        0x0006: ["GPSAltitude", "Rakım"],
        0x0007: ["GPSTimeStamp", "GPS Saati"],
        0x0008: ["GPSSatellites", "GPS Uyduları"],
        0x0009: ["GPSStatus", "GPS Durumu"],
        0x000a: ["GPSMeasureMode", "GPS Ölçüm Modu"],
        0x000b: ["GPSDOP", "GPS Hassasiyet Seyrelmesi"],
        0x000c: ["GPSSpeedRef", "GPS Hız Birimi"],
        0x000d: ["GPSSpeed", "GPS Hızı"],
        0x000e: ["GPSTrackRef", "GPS Rota Referansı"],
        0x000f: ["GPSTrack", "GPS Rotası"],
        0x0010: ["GPSImgDirectionRef", "Görsel Yön Referansı"],
        0x0011: ["GPSImgDirection", "Görsel Yönü"],
        0x0012: ["GPSMapDatum", "Harita Datumu"],
        0x0013: ["GPSDestLatitudeRef", "Hedef Enlem Yönü"],
        0x0014: ["GPSDestLatitude", "Hedef Enlem"],
        0x0015: ["GPSDestLongitudeRef", "Hedef Boylam Yönü"],
        0x0016: ["GPSDestLongitude", "Hedef Boylam"],
        0x0017: ["GPSDestBearingRef", "Hedef Yön Referansı"],
        0x0018: ["GPSDestBearing", "Hedef Yön"],
        0x0019: ["GPSDestDistanceRef", "Hedef Mesafe Birimi"],
        0x001a: ["GPSDestDistance", "Hedef Mesafe"],
        0x001b: ["GPSProcessingMethod", "GPS İşleme Yöntemi"],
        0x001c: ["GPSAreaInformation", "GPS Alan Bilgisi"],
        0x001d: ["GPSDateStamp", "GPS Tarihi"],
        0x001e: ["GPSDifferential", "GPS Diferansiyel Düzeltme"],
        0x001f: ["GPSHPositioningError", "Konum Hassasiyeti"],
    };

    const INTEROP_TAGS = {
        0x0001: ["InteropIndex", "Birlikte Çalışabilirlik İndeksi"],
        0x0002: ["InteropVersion", "Birlikte Çalışabilirlik Sürümü"],
        0x1000: ["RelatedImageFileFormat", "İlişkili Görsel Formatı"],
        0x1001: ["RelatedImageWidth", "İlişkili Görsel Genişliği"],
        0x1002: ["RelatedImageLength", "İlişkili Görsel Yüksekliği"],
    };

    const IPTC_TAGS = {
        "1:90": ["CodedCharacterSet", "Kodlanmış Karakter Seti", "technical"],
        "2:5": ["ObjectName", "Nesne Adı", "description"],
        "2:7": ["EditStatus", "Düzenleme Durumu", "description"],
        "2:10": ["Urgency", "Aciliyet", "description"],
        "2:20": ["SupplementalCategories", "Ek Kategoriler", "description"],
        "2:25": ["Keywords", "Anahtar Kelimeler", "description"],
        "2:40": ["SpecialInstructions", "Özel Talimatlar", "description"],
        "2:55": ["DateCreated", "Oluşturma Tarihi", "date"],
        "2:60": ["TimeCreated", "Oluşturma Saati", "date"],
        "2:62": ["DigitalCreationDate", "Dijital Oluşturma Tarihi", "date"],
        "2:63": ["DigitalCreationTime", "Dijital Oluşturma Saati", "date"],
        "2:80": ["Byline", "Yazar / Fotoğrafçı", "rights"],
        "2:85": ["BylineTitle", "Yazar Unvanı", "rights"],
        "2:90": ["City", "Şehir", "gps"],
        "2:92": ["Sublocation", "Alt Konum", "gps"],
        "2:95": ["ProvinceState", "Bölge / Eyalet", "gps"],
        "2:100": ["CountryCode", "Ülke Kodu", "gps"],
        "2:101": ["Country", "Ülke", "gps"],
        "2:103": ["OriginalTransmissionReference", "Orijinal İletim Referansı", "technical"],
        "2:105": ["Headline", "Başlık", "description"],
        "2:110": ["Credit", "Kredi", "rights"],
        "2:115": ["Source", "Kaynak", "rights"],
        "2:116": ["CopyrightNotice", "Telif Bildirimi", "rights"],
        "2:118": ["Contact", "İletişim", "rights"],
        "2:120": ["Caption", "Açıklama / Altyazı", "description"],
        "2:122": ["CaptionWriter", "Açıklama Yazarı", "rights"],
    };

    const ENUMS = {
        Orientation: { 1: "Normal", 2: "Yatay aynalanmış", 3: "180° döndürülmüş", 4: "Dikey aynalanmış", 5: "90° saat yönü tersi + aynalanmış", 6: "90° saat yönünde", 7: "90° saat yönünde + aynalanmış", 8: "90° saat yönü tersi" },
        ExposureProgram: { 0: "Tanımsız", 1: "Manuel", 2: "Normal program", 3: "Diyafram öncelikli", 4: "Enstantane öncelikli", 5: "Yaratıcı program", 6: "Aksiyon programı", 7: "Portre", 8: "Manzara", 9: "Bulb" },
        ExposureMode: { 0: "Otomatik", 1: "Manuel", 2: "Otomatik basamaklama" },
        MeteringMode: { 0: "Bilinmiyor", 1: "Ortalama", 2: "Merkez ağırlıklı", 3: "Nokta", 4: "Çoklu nokta", 5: "Desen", 6: "Kısmi", 255: "Diğer" },
        LightSource: { 0: "Bilinmiyor", 1: "Gün ışığı", 2: "Floresan", 3: "Tungsten", 4: "Flaş", 9: "Açık hava", 10: "Bulutlu", 11: "Gölge", 12: "Gün ışığı floresan", 13: "Gün beyazı floresan", 14: "Soğuk beyaz floresan", 15: "Beyaz floresan", 17: "Standart A", 18: "Standart B", 19: "Standart C", 20: "D55", 21: "D65", 22: "D75", 23: "D50", 24: "ISO stüdyo tungsten", 255: "Diğer" },
        WhiteBalance: { 0: "Otomatik", 1: "Manuel" },
        SceneCaptureType: { 0: "Standart", 1: "Manzara", 2: "Portre", 3: "Gece" },
        Contrast: { 0: "Normal", 1: "Yumuşak", 2: "Sert" },
        Saturation: { 0: "Normal", 1: "Düşük", 2: "Yüksek" },
        Sharpness: { 0: "Normal", 1: "Yumuşak", 2: "Sert" },
        GainControl: { 0: "Yok", 1: "Düşük kazanç artışı", 2: "Yüksek kazanç artışı", 3: "Düşük kazanç azaltımı", 4: "Yüksek kazanç azaltımı" },
        SubjectDistanceRange: { 0: "Bilinmiyor", 1: "Makro", 2: "Yakın", 3: "Uzak" },
        SensingMethod: { 1: "Tanımsız", 2: "Tek çip renk alanı", 3: "İki çip renk alanı", 4: "Üç çip renk alanı", 5: "Renk sıralı alan", 7: "Trilinear", 8: "Renk sıralı doğrusal" },
        CustomRendered: { 0: "Normal işlem", 1: "Özel işlem" },
        ColorSpace: { 1: "sRGB", 65535: "Kalibre edilmemiş" },
        ResolutionUnit: { 1: "Birim yok", 2: "inç", 3: "cm" },
        PhotometricInterpretation: { 0: "WhiteIsZero", 1: "BlackIsZero", 2: "RGB", 3: "Palet", 4: "Şeffaflık maskesi", 5: "CMYK", 6: "YCbCr", 8: "CIELab" },
    };

    function toBytes(input) {
        if (input instanceof Uint8Array) return input;
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        throw new TypeError("Dosya verisi okunamadı.");
    }

    function readAscii(bytes, start, length) {
        let output = "";
        const end = Math.min(bytes.length, start + length);
        for (let index = start; index < end; index += 1) output += String.fromCharCode(bytes[index]);
        return output;
    }

    function asciiEquals(bytes, offset, text) {
        return offset >= 0 && offset + text.length <= bytes.length && readAscii(bytes, offset, text.length) === text;
    }

    function bytesEqual(bytes, offset, expected) {
        if (offset < 0 || offset + expected.length > bytes.length) return false;
        for (let index = 0; index < expected.length; index += 1) if (bytes[offset + index] !== expected[index]) return false;
        return true;
    }

    function cleanText(value, limit = 4000) {
        const text = String(value ?? "")
            .replace(/\0+/g, "")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
            .replace(/[ \t]+/g, " ")
            .trim();
        if (!text) return "";
        return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
    }

    function decodeText(bytes) {
        const utf8 = UTF8.decode(bytes);
        return utf8.includes("\ufffd") ? LATIN1.decode(bytes) : utf8;
    }

    function decodeXmlEntities(value) {
        return value
            .replace(/&quot;/gi, "\"")
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
            .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
            .replace(/&amp;/gi, "&");
    }

    function trimNumber(value, digits = 6) {
        const number = Number(value);
        if (!Number.isFinite(number)) return String(value);
        return String(Number(number.toFixed(digits)));
    }

    function createCollector() {
        const fields = [];
        const warnings = [];
        const rawXmp = [];
        const identities = new Set();
        const contentCredentials = { detected: false, types: [], details: [] };
        let thumbnail = null;

        return {
            fields,
            warnings,
            rawXmp,
            contentCredentials,
            get thumbnail() { return thumbnail; },
            setThumbnail(value) { if (!thumbnail) thumbnail = value; },
            add({ key, label, value, raw = "", source, ifd = "", tag = "", category = "technical", metadata = true, sensitive = "" }) {
                if (fields.length >= MAX_FIELDS) return;
                const display = cleanText(value);
                if (!display) return;
                const identity = `${source}:${ifd}:${tag}:${key}:${display}`;
                if (identities.has(identity)) return;
                identities.add(identity);
                fields.push({ key, label, value: display, raw: cleanText(raw || display), source, ifd, tag, category, metadata, sensitive });
            },
            addCredential(type, detail) {
                contentCredentials.detected = true;
                if (!contentCredentials.types.includes(type)) contentCredentials.types.push(type);
                const safeDetail = cleanText(detail);
                if (safeDetail && !contentCredentials.details.includes(safeDetail)) contentCredentials.details.push(safeDetail);
            },
        };
    }

    function readTiffValue(bytes, view, little, entryOffset, type, count) {
        const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
        const unit = sizes[type];
        if (!unit || !Number.isSafeInteger(count) || count < 0 || count > 2000000) throw new Error("Desteklenmeyen EXIF veri türü veya uzunluğu.");
        const length = unit * count;
        if (!Number.isSafeInteger(length) || length > bytes.length) throw new Error("EXIF alan uzunluğu geçersiz.");
        const valueOffset = length <= 4 ? entryOffset + 8 : view.getUint32(entryOffset + 8, little);
        if (valueOffset < 0 || valueOffset + length > bytes.length) throw new Error("EXIF değeri dosya sınırını aşıyor.");
        const data = bytes.subarray(valueOffset, valueOffset + length);

        if (type === 2) return { native: cleanText(decodeText(data)), raw: cleanText(decodeText(data)) };
        if (type === 7) return { native: data.slice(), raw: bytesToHex(data, 48) };
        const values = [];
        const rawValues = [];
        const safeCount = Math.min(count, 256);
        for (let index = 0; index < safeCount; index += 1) {
            const offset = valueOffset + index * unit;
            let value;
            let raw;
            if (type === 1) value = view.getUint8(offset);
            else if (type === 3) value = view.getUint16(offset, little);
            else if (type === 4 || type === 13) value = view.getUint32(offset, little);
            else if (type === 5) {
                const numerator = view.getUint32(offset, little);
                const denominator = view.getUint32(offset + 4, little);
                value = denominator ? numerator / denominator : 0;
                raw = `${numerator}/${denominator}`;
            } else if (type === 6) value = view.getInt8(offset);
            else if (type === 8) value = view.getInt16(offset, little);
            else if (type === 9) value = view.getInt32(offset, little);
            else if (type === 10) {
                const numerator = view.getInt32(offset, little);
                const denominator = view.getInt32(offset + 4, little);
                value = denominator ? numerator / denominator : 0;
                raw = `${numerator}/${denominator}`;
            } else if (type === 11) value = view.getFloat32(offset, little);
            else if (type === 12) value = view.getFloat64(offset, little);
            values.push(value);
            rawValues.push(raw || String(value));
        }
        return { native: values.length === 1 ? values[0] : values, raw: rawValues.join(", ") };
    }

    function parseTiff(input, collector, source = "EXIF") {
        let bytes = toBytes(input);
        if (bytes.length >= 6 && asciiEquals(bytes, 0, "Exif\0\0")) bytes = bytes.subarray(6);
        if (bytes.length < 8) throw new Error("EXIF/TIFF başlığı eksik.");
        const little = asciiEquals(bytes, 0, "II");
        if (!little && !asciiEquals(bytes, 0, "MM")) throw new Error("EXIF byte sırası geçersiz.");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint16(2, little) !== 42) throw new Error("EXIF/TIFF imzası geçersiz.");
        const visited = new Set();
        const gpsValues = {};
        const thumbnailTags = {};
        let orientation = 1;

        function parseIfd(offset, kind) {
            const visitKey = `${kind}:${offset}`;
            if (!offset || visited.has(visitKey)) return;
            if (offset < 8 || offset + 2 > bytes.length) throw new Error(`${kind} konumu geçersiz.`);
            visited.add(visitKey);
            const count = view.getUint16(offset, little);
            if (count > 2048 || offset + 2 + count * 12 + 4 > bytes.length) throw new Error(`${kind} dizini bozuk veya aşırı büyük.`);
            let exifPointer = 0;
            let gpsPointer = 0;
            let interopPointer = 0;

            for (let index = 0; index < count; index += 1) {
                const entryOffset = offset + 2 + index * 12;
                const tag = view.getUint16(entryOffset, little);
                const type = view.getUint16(entryOffset + 2, little);
                const itemCount = view.getUint32(entryOffset + 4, little);
                let parsed;
                try {
                    parsed = readTiffValue(bytes, view, little, entryOffset, type, itemCount);
                } catch (error) {
                    collector.warnings.push(`${kind} 0x${tag.toString(16).padStart(4, "0")}: ${error.message}`);
                    continue;
                }
                const numeric = Array.isArray(parsed.native) ? parsed.native[0] : parsed.native;
                if (tag === 0x8769) { exifPointer = Number(numeric) || 0; continue; }
                if (tag === 0x8825) { gpsPointer = Number(numeric) || 0; continue; }
                if (tag === 0xa005) { interopPointer = Number(numeric) || 0; }
                if (kind === "GPS IFD") {
                    const definition = GPS_TAGS[tag] || [`GPSTag0x${tag.toString(16).padStart(4, "0")}`, `Bilinmeyen GPS Tag 0x${tag.toString(16).padStart(4, "0").toUpperCase()}`];
                    gpsValues[definition[0]] = parsed.native;
                    collector.add({
                        key: definition[0], label: definition[1], value: formatGpsValue(definition[0], parsed.native), raw: parsed.raw,
                        source: "GPS", ifd: kind, tag: hexTag(tag), category: "gps", sensitive: "high",
                    });
                    continue;
                }
                const definition = kind === "Interop IFD"
                    ? (INTEROP_TAGS[tag] ? [...INTEROP_TAGS[tag], "technical"] : null)
                    : TAGS[tag];
                const name = definition?.[0] || `Tag0x${tag.toString(16).padStart(4, "0")}`;
                const label = definition?.[1] || `Bilinmeyen EXIF Tag ${hexTag(tag)}`;
                const category = definition?.[2] || "technical";
                if (name === "Orientation") orientation = Number(numeric) || 1;
                if (kind === "IFD1" && (tag === 0x0201 || tag === 0x0202 || tag === 0x0100 || tag === 0x0101)) thumbnailTags[tag] = numeric;
                collector.add({
                    key: name,
                    label,
                    value: formatExifValue(name, parsed.native, parsed.raw),
                    raw: parsed.raw,
                    source,
                    ifd: kind,
                    tag: hexTag(tag),
                    category,
                    sensitive: sensitiveFor(name, category),
                });
            }

            if (exifPointer) parseIfd(exifPointer, "ExifIFD");
            if (gpsPointer) parseIfd(gpsPointer, "GPS IFD");
            if (interopPointer) parseIfd(interopPointer, "Interop IFD");
            const nextOffset = view.getUint32(offset + 2 + count * 12, little);
            if (nextOffset && kind === "IFD0") parseIfd(nextOffset, "IFD1");
        }

        parseIfd(view.getUint32(4, little), "IFD0");
        const gpsCoordinates = addDerivedGps(gpsValues, collector);
        const thumbnailOffset = Number(thumbnailTags[0x0201]);
        const thumbnailLength = Number(thumbnailTags[0x0202]);
        if (thumbnailOffset > 0 && thumbnailLength > 0 && thumbnailLength <= MAX_THUMBNAIL && thumbnailOffset + thumbnailLength <= bytes.length) {
            const thumbnailBytes = bytes.slice(thumbnailOffset, thumbnailOffset + thumbnailLength);
            const mime = thumbnailBytes[0] === 0xff && thumbnailBytes[1] === 0xd8 ? "image/jpeg" : bytesEqual(thumbnailBytes, 0, PNG_SIGNATURE) ? "image/png" : "application/octet-stream";
            const dimensions = mime === "image/jpeg" ? readJpegDimensions(thumbnailBytes) : mime === "image/png" ? readPngDimensions(thumbnailBytes) : { width: 0, height: 0 };
            collector.setThumbnail({
                mime,
                size: thumbnailBytes.length,
                width: Number(thumbnailTags[0x0100]) || dimensions.width,
                height: Number(thumbnailTags[0x0101]) || dimensions.height,
                bytes: thumbnailBytes,
            });
        }
        return { orientation, gpsCoordinates };
    }

    function formatExifValue(name, native, raw) {
        if (native instanceof Uint8Array) {
            if (["XPTitle", "XPComment", "XPAuthor", "XPKeywords", "XPSubject"].includes(name)) return cleanText(UTF16LE.decode(native));
            if (name === "UserComment") return decodeUserComment(native);
            if (["ExifVersion", "FlashpixVersion", "InteropVersion"].includes(name)) return cleanText(readAscii(native, 0, native.length));
            if (name === "ComponentsConfiguration") return Array.from(native).map((value) => ({ 0: "-", 1: "Y", 2: "Cb", 3: "Cr", 4: "R", 5: "G", 6: "B" }[value] || value)).join(", ");
            if (["MakerNote", "CFAPattern", "DeviceSettingDescription"].includes(name)) return `${native.length} bayt ham veri`;
            return bytesToHex(native, 64);
        }
        const first = Array.isArray(native) ? native[0] : native;
        if (ENUMS[name]?.[first] != null) return `${ENUMS[name][first]} (${first})`;
        if (name === "ExposureTime") return formatExposure(first);
        if (name === "FNumber") return `f/${trimNumber(first, 2)}`;
        if (name === "ShutterSpeedValue") return formatExposure(1 / (2 ** Number(first)));
        if (name === "ApertureValue" || name === "MaxApertureValue") return `f/${trimNumber(2 ** (Number(first) / 2), 2)}`;
        if (name === "BrightnessValue") return `${signed(first)} EV`;
        if (name === "ExposureBiasValue") return `${signed(first)} EV`;
        if (name === "FocalLength") return `${trimNumber(first, 2)} mm`;
        if (name === "FocalLengthIn35mmFilm") return `${trimNumber(first, 0)} mm`;
        if (name === "DigitalZoomRatio") return Number(first) === 0 ? "Kullanılmadı" : `${trimNumber(first, 2)}×`;
        if (name === "SubjectDistance") return Number(first) === 0 ? "Bilinmiyor" : `${trimNumber(first, 2)} m`;
        if (name === "Flash") return formatFlash(Number(first));
        if (name === "LensSpecification" && Array.isArray(native)) return `${native.slice(0, 2).map((value) => trimNumber(value, 1)).join("–")} mm · f/${native.slice(2).map((value) => trimNumber(value, 1)).join("–")}`;
        if (["XResolution", "YResolution", "FocalPlaneXResolution", "FocalPlaneYResolution"].includes(name)) return trimNumber(first, 3);
        if (["CameraTemperature"].includes(name)) return `${trimNumber(first, 1)} °C`;
        if (["Humidity"].includes(name)) return `${trimNumber(first, 1)}%`;
        if (["Pressure"].includes(name)) return `${trimNumber(first, 1)} hPa`;
        if (["WaterDepth", "GPSHPositioningError"].includes(name)) return `${trimNumber(first, 2)} m`;
        if (["CameraElevationAngle"].includes(name)) return `${trimNumber(first, 1)}°`;
        if (Array.isArray(native)) return native.map((value) => trimNumber(value)).join(", ");
        if (typeof native === "number") return trimNumber(native);
        return cleanText(native || raw);
    }

    function decodeUserComment(bytes) {
        if (bytes.length >= 8) {
            const prefix = readAscii(bytes, 0, 8);
            if (prefix.startsWith("ASCII")) return cleanText(decodeText(bytes.subarray(8)));
            if (prefix.startsWith("UNICODE")) {
                const body = bytes.subarray(8);
                try { return cleanText(UTF16LE.decode(body)); } catch { return cleanText(decodeText(body)); }
            }
        }
        return cleanText(decodeText(bytes));
    }

    function formatExposure(seconds) {
        const value = Number(seconds);
        if (!Number.isFinite(value) || value <= 0) return trimNumber(seconds);
        if (value < 1) return `1/${Math.max(1, Math.round(1 / value))} sn`;
        return `${trimNumber(value, 2)} sn`;
    }

    function signed(value) {
        const number = Number(value);
        return `${number > 0 ? "+" : ""}${trimNumber(number, 2)}`;
    }

    function formatFlash(value) {
        if (!Number.isFinite(value)) return String(value);
        const fired = Boolean(value & 1);
        const mode = (value >> 3) & 3;
        const redEye = Boolean(value & 64);
        const parts = [fired ? "Flaş patladı" : "Flaş patlamadı"];
        if (mode === 1) parts.push("zorunlu");
        if (mode === 2) parts.push("bastırılmış");
        if (mode === 3) parts.push("otomatik");
        if (redEye) parts.push("kırmızı göz azaltma");
        return `${parts.join(" · ")} (${value})`;
    }

    function formatGpsValue(name, native) {
        const first = Array.isArray(native) ? native[0] : native;
        if (["GPSLatitude", "GPSLongitude", "GPSDestLatitude", "GPSDestLongitude"].includes(name) && Array.isArray(native)) {
            return `${trimNumber(native[0], 0)}° ${trimNumber(native[1], 0)}′ ${trimNumber(native[2], 4)}″`;
        }
        if (name === "GPSAltitude") return `${trimNumber(first, 2)} m`;
        if (["GPSImgDirection", "GPSTrack", "GPSDestBearing"].includes(name)) return `${trimNumber(first, 2)}°`;
        if (name === "GPSHPositioningError") return `±${trimNumber(first, 2)} m`;
        if (name === "GPSTimeStamp" && Array.isArray(native)) return `${String(Math.floor(native[0])).padStart(2, "0")}:${String(Math.floor(native[1])).padStart(2, "0")}:${String(Math.floor(native[2])).padStart(2, "0")} UTC`;
        if (native instanceof Uint8Array) return cleanText(decodeText(native.subarray(native.length >= 8 ? 8 : 0))) || bytesToHex(native, 64);
        if (Array.isArray(native)) return native.map((value) => trimNumber(value)).join(", ");
        return cleanText(native);
    }

    function addDerivedGps(values, collector) {
        const latitude = coordinateToDecimal(values.GPSLatitude, values.GPSLatitudeRef);
        const longitude = coordinateToDecimal(values.GPSLongitude, values.GPSLongitudeRef);
        const destinationLatitude = coordinateToDecimal(values.GPSDestLatitude, values.GPSDestLatitudeRef);
        const destinationLongitude = coordinateToDecimal(values.GPSDestLongitude, values.GPSDestLongitudeRef);
        if (latitude != null) collector.add({ key: "GPSLatitudeDecimal", label: "Enlem", value: latitude.toFixed(7), raw: String(latitude), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        if (longitude != null) collector.add({ key: "GPSLongitudeDecimal", label: "Boylam", value: longitude.toFixed(7), raw: String(longitude), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        if (destinationLatitude != null) collector.add({ key: "GPSDestLatitudeDecimal", label: "Hedef Enlem", value: destinationLatitude.toFixed(7), raw: String(destinationLatitude), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        if (destinationLongitude != null) collector.add({ key: "GPSDestLongitudeDecimal", label: "Hedef Boylam", value: destinationLongitude.toFixed(7), raw: String(destinationLongitude), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        if (values.GPSAltitude != null) {
            const altitudeValue = Number(Array.isArray(values.GPSAltitude) ? values.GPSAltitude[0] : values.GPSAltitude);
            const altitudeRef = Number(Array.isArray(values.GPSAltitudeRef) ? values.GPSAltitudeRef[0] : values.GPSAltitudeRef);
            const altitude = altitudeRef === 1 ? -altitudeValue : altitudeValue;
            collector.add({ key: "GPSAltitudeMeters", label: "Rakım (hesaplanan)", value: `${trimNumber(altitude, 2)} m`, raw: String(altitude), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        }
        if (values.GPSSpeed != null) {
            const speed = Number(Array.isArray(values.GPSSpeed) ? values.GPSSpeed[0] : values.GPSSpeed);
            const ref = String(values.GPSSpeedRef || "K").toUpperCase();
            const kmh = ref === "M" ? speed * 1.609344 : ref === "N" ? speed * 1.852 : speed;
            collector.add({ key: "GPSSpeedKmh", label: "Hız", value: `${trimNumber(kmh, 2)} km/sa`, raw: String(speed), source: "GPS", ifd: "Hesaplanan", category: "gps", sensitive: "high" });
        }
        return latitude != null && longitude != null ? { latitude, longitude } : null;
    }

    function coordinateToDecimal(value, reference) {
        if (!Array.isArray(value) || value.length < 3) return null;
        const numbers = value.slice(0, 3).map(Number);
        if (!numbers.every(Number.isFinite)) return null;
        let result = numbers[0] + numbers[1] / 60 + numbers[2] / 3600;
        if (/^[SW]$/i.test(String(reference))) result *= -1;
        return result;
    }

    function sensitiveFor(name, category) {
        if (/serial|ownername|uniqueid/i.test(name)) return "high";
        if (category === "date" || /make|model|lens/i.test(name)) return "medium";
        if (category === "software") return "low";
        return "";
    }

    function semanticCategory(name, fallback) {
        const value = String(name).toLowerCase();
        if (/gps|latitude|longitude|location|sublocation|city|country|province/.test(value)) return "gps";
        if (/camera|make|model|lens|serial|firmware|owner/.test(value)) return "camera";
        if (/date|time|created|modified/.test(value)) return "date";
        if (/software|creatortool|processing|hostcomputer|historysoftwareagent|generator/.test(value)) return "software";
        if (/copyright|rights|creator|artist|author|byline|credit|source|contact|usage|licensor/.test(value)) return "rights";
        if (/description|title|headline|caption|comment|keyword|subject|rating|label|instructions/.test(value)) return "description";
        if (/color|profile|gamma|chromatic|whitepoint/.test(value)) return "color";
        return fallback;
    }

    function parseXmp(input, collector, source = "XMP") {
        const bytes = toBytes(input);
        const xml = UTF8.decode(bytes).replace(/^.*?(?=<[?A-Za-z])/s, "");
        const stored = xml.length > MAX_RAW_XMP ? `${xml.slice(0, MAX_RAW_XMP)}\n… [XMP görünümü sınırlandırıldı]` : xml;
        if (stored && !collector.rawXmp.includes(stored)) collector.rawXmp.push(stored);
        const ignored = new Set(["rdf", "xmlns", "x", "xmpmeta", "description", "li", "seq", "bag", "alt", "about"]);
        let found = 0;

        function addProperty(qualified, rawValue) {
            const local = qualified.includes(":") ? qualified.split(":").pop() : qualified;
            if (!local || ignored.has(local.toLowerCase())) return;
            const value = cleanText(decodeXmlEntities(String(rawValue).replace(/<[^>]+>/g, " ")));
            if (!value || (/^https?:\/\//i.test(value) && /schema|namespace|xmlns/i.test(qualified))) return;
            collector.add({
                key: qualified,
                label: humanizeName(local),
                value,
                raw: value,
                source,
                ifd: "XMP XML",
                tag: qualified,
                category: semanticCategory(qualified, "xmp"),
                sensitive: sensitiveFor(qualified, semanticCategory(qualified, "xmp")),
            });
            if (/c2pa|contentcredentials|provenance|digitalSourceType|documentAncestors/i.test(qualified)) collector.addCredential("XMP Provenance", `${qualified}: ${value}`);
            found += 1;
        }

        for (const match of xml.matchAll(/([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\s*=\s*["']([^"']*)["']/g)) {
            addProperty(match[1], match[2]);
            if (found >= 400) break;
        }
        if (found < 400) {
            for (const match of xml.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*>([^<]{1,8000})<\/\1>/g)) {
                addProperty(match[1], match[2]);
                if (found >= 400) break;
            }
        }
        if (found < 400) {
            for (const match of xml.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*>\s*<rdf:(Seq|Bag|Alt)\b[^>]*>([\s\S]*?)<\/rdf:\2>\s*<\/\1>/g)) {
                const values = Array.from(match[3].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g), (entry) => cleanText(decodeXmlEntities(entry[1].replace(/<[^>]+>/g, " ")))).filter(Boolean);
                if (values.length) addProperty(match[1], values.join(", "));
                if (found >= 400) break;
            }
        }
        if (found < 400) {
            for (const match of xml.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b[^>]*>([\s\S]{1,16000}?)<\/\1>/g)) {
                const values = Array.from(match[2].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g), (entry) => cleanText(decodeXmlEntities(entry[1].replace(/<[^>]+>/g, " ")))).filter(Boolean);
                if (values.length) addProperty(match[1], values.join(", "));
                if (found >= 400) break;
            }
        }
        detectCredentialText(xml, collector, "XMP");
        if (!found) collector.add({ key: "XMPPacket", label: "XMP Paketi", value: `${bytes.length} bayt`, raw: `${bytes.length}`, source, ifd: "XMP XML", category: "xmp" });
    }

    function parseIptc(input, collector) {
        const bytes = toBytes(input);
        let found = 0;
        for (let index = 0; index + 5 <= bytes.length; index += 1) {
            if (bytes[index] !== 0x1c) continue;
            const record = bytes[index + 1];
            const dataset = bytes[index + 2];
            let length = (bytes[index + 3] << 8) | bytes[index + 4];
            let start = index + 5;
            if (length & 0x8000) {
                const lengthBytes = length & 0x7fff;
                if (!lengthBytes || lengthBytes > 4 || start + lengthBytes > bytes.length) continue;
                length = 0;
                for (let offset = 0; offset < lengthBytes; offset += 1) length = (length << 8) | bytes[start + offset];
                start += lengthBytes;
            }
            if (length < 0 || start + length > bytes.length) continue;
            const id = `${record}:${dataset}`;
            const definition = IPTC_TAGS[id] || [`IPTC_${record}_${dataset}`, `IPTC ${id}`, "iptc"];
            const rawBytes = bytes.subarray(start, start + length);
            const value = cleanText(decodeText(rawBytes)) || `${length} bayt`;
            collector.add({ key: definition[0], label: definition[1], value, raw: value, source: "IPTC", ifd: `Record ${record}`, tag: id, category: definition[2] || "iptc", sensitive: sensitiveFor(definition[0], definition[2]) });
            found += 1;
            index = start + length - 1;
        }
        if (!found) collector.add({ key: "IPTCPacket", label: "IPTC / Photoshop Paketi", value: `${bytes.length} bayt`, source: "IPTC", category: "iptc" });
    }

    function parseIcc(input, collector, source = "ICC") {
        const bytes = toBytes(input);
        collector.add({ key: "ICCProfileSize", label: "ICC Profil Boyutu", value: formatBytes(bytes.length), raw: String(bytes.length), source, category: "color" });
        if (bytes.length < 132) return;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const declaredSize = view.getUint32(0, false);
        const signature = readAscii(bytes, 36, 4);
        collector.add({ key: "ICCProfileSignature", label: "ICC İmzası", value: signature || "—", source, category: "color" });
        collector.add({ key: "ICCProfileClass", label: "Profil Sınıfı", value: readAscii(bytes, 12, 4), source, category: "color" });
        collector.add({ key: "ICCColorSpace", label: "ICC Renk Uzayı", value: readAscii(bytes, 16, 4), source, category: "color" });
        collector.add({ key: "ICCPCS", label: "Profil Bağlantı Uzayı", value: readAscii(bytes, 20, 4), source, category: "color" });
        collector.add({ key: "ICCProfileVersion", label: "ICC Sürümü", value: `${bytes[8] >> 4}.${bytes[8] & 0x0f}.${bytes[9] >> 4}`, source, category: "color" });
        if (signature !== "acsp" || declaredSize > bytes.length) return;
        const tagCount = view.getUint32(128, false);
        if (tagCount > 1024 || 132 + tagCount * 12 > bytes.length) return;
        for (let index = 0; index < tagCount; index += 1) {
            const offset = 132 + index * 12;
            const tag = readAscii(bytes, offset, 4);
            const dataOffset = view.getUint32(offset + 4, false);
            const size = view.getUint32(offset + 8, false);
            if (!size || dataOffset + size > bytes.length) continue;
            if (["desc", "cprt", "dmnd", "dmdd", "vued"].includes(tag)) {
                const value = parseIccText(bytes.subarray(dataOffset, dataOffset + size));
                if (value) collector.add({ key: `ICC_${tag}`, label: ({ desc: "ICC Profil Açıklaması", cprt: "ICC Telif Bilgisi", dmnd: "Cihaz Üreticisi Açıklaması", dmdd: "Cihaz Modeli Açıklaması", vued: "Görüntüleme Koşulu Açıklaması" })[tag], value, source, tag, category: tag === "cprt" ? "rights" : "color" });
            }
        }
    }

    function parseIccText(bytes) {
        if (bytes.length < 12) return "";
        const type = readAscii(bytes, 0, 4);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (type === "desc") {
            const length = view.getUint32(8, false);
            if (length && 12 + length <= bytes.length) return cleanText(decodeText(bytes.subarray(12, 12 + length)));
        }
        if (type === "text") return cleanText(decodeText(bytes.subarray(8)));
        if (type === "mluc" && bytes.length >= 28) {
            const count = view.getUint32(8, false);
            const recordSize = view.getUint32(12, false);
            if (count && recordSize >= 12 && 16 + recordSize <= bytes.length) {
                const length = view.getUint32(20, false);
                const offset = view.getUint32(24, false);
                if (offset + length <= bytes.length) return cleanText(decodeUtf16Be(bytes.subarray(offset, offset + length)));
            }
        }
        return "";
    }

    function decodeUtf16Be(bytes) {
        const swapped = new Uint8Array(bytes.length);
        for (let index = 0; index + 1 < bytes.length; index += 2) {
            swapped[index] = bytes[index + 1];
            swapped[index + 1] = bytes[index];
        }
        return UTF16LE.decode(swapped);
    }

    function walkJpeg(bytes) {
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("JPEG imzası geçersiz.");
        const segments = [];
        let position = 2;
        let inScan = false;
        let foundEnd = false;
        while (position < bytes.length) {
            if (inScan) {
                let markerStart = -1;
                while (position < bytes.length) {
                    if (bytes[position] !== 0xff) { position += 1; continue; }
                    let codeIndex = position + 1;
                    while (codeIndex < bytes.length && bytes[codeIndex] === 0xff) codeIndex += 1;
                    if (codeIndex >= bytes.length) break;
                    const code = bytes[codeIndex];
                    if (code === 0x00 || (code >= 0xd0 && code <= 0xd7)) { position = codeIndex + 1; continue; }
                    markerStart = position;
                    break;
                }
                if (markerStart < 0) throw new Error("JPEG tarama verisi tamamlanmamış.");
                position = markerStart;
                inScan = false;
                continue;
            }
            if (bytes[position] !== 0xff) throw new Error("JPEG segment sınırı geçersiz.");
            let codeIndex = position + 1;
            while (codeIndex < bytes.length && bytes[codeIndex] === 0xff) codeIndex += 1;
            if (codeIndex >= bytes.length) throw new Error("JPEG marker'ı tamamlanmamış.");
            const marker = bytes[codeIndex];
            if (marker === 0xd9) { foundEnd = true; position = codeIndex + 1; break; }
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { position = codeIndex + 1; continue; }
            if (marker === 0x00 || codeIndex + 2 >= bytes.length) throw new Error("JPEG marker veya segment uzunluğu geçersiz.");
            const length = (bytes[codeIndex + 1] << 8) | bytes[codeIndex + 2];
            if (length < 2) throw new Error("JPEG segment uzunluğu geçersiz.");
            const dataStart = codeIndex + 3;
            const end = codeIndex + 1 + length;
            if (end > bytes.length) throw new Error("JPEG segmenti dosya sınırını aşıyor.");
            segments.push({ marker, dataStart, dataEnd: end, length: end - dataStart });
            position = end;
            if (marker === 0xda) inScan = true;
        }
        if (!foundEnd) throw new Error("JPEG bitiş marker'ı bulunamadı.");
        return segments;
    }

    function parseJpeg(bytes, collector) {
        const segments = walkJpeg(bytes);
        const info = { width: 0, height: 0, bitDepth: 0, alpha: false, encoding: "—", subtype: "—", components: 0, orientation: 1, gpsCoordinates: null };
        const iccParts = [];
        segments.forEach((segment) => {
            const data = bytes.subarray(segment.dataStart, segment.dataEnd);
            if (isSofMarker(segment.marker) && data.length >= 6) {
                info.bitDepth = data[0];
                info.height = (data[1] << 8) | data[2];
                info.width = (data[3] << 8) | data[4];
                info.components = data[5];
                info.encoding = segment.marker === 0xc2 ? "Progressive" : segment.marker === 0xc0 ? "Baseline" : `SOF 0x${segment.marker.toString(16).toUpperCase()}`;
                info.subtype = info.encoding;
            } else if (segment.marker === 0xe0 && asciiEquals(data, 0, "JFIF\0") && data.length >= 12) {
                const unit = data[7];
                const xDensity = (data[8] << 8) | data[9];
                const yDensity = (data[10] << 8) | data[11];
                collector.add({ key: "JFIFDensity", label: "JFIF Piksel Yoğunluğu", value: `${xDensity} × ${yDensity} ${unit === 1 ? "dpi" : unit === 2 ? "dpcm" : "oran"}`, source: "JPEG", tag: "APP0", category: "container" });
            } else if (segment.marker === 0xe1 && asciiEquals(data, 0, "Exif\0\0")) {
                try {
                    const parsed = parseTiff(data, collector, "EXIF");
                    info.orientation = parsed.orientation || info.orientation;
                    info.gpsCoordinates = parsed.gpsCoordinates || info.gpsCoordinates;
                } catch (error) {
                    collector.warnings.push(`EXIF okunamadı: ${error.message}`);
                    collector.add({ key: "CorruptExif", label: "Okunamayan EXIF Paketi", value: error.message, source: "EXIF", ifd: "APP1", tag: "APP1", category: "technical" });
                }
            } else if (segment.marker === 0xe1 && (asciiEquals(data, 0, "http://ns.adobe.com/xap/1.0/") || asciiEquals(data, 0, "http://ns.adobe.com/xmp/extension/"))) {
                const zero = data.indexOf(0);
                parseXmp(zero >= 0 ? data.subarray(zero + 1) : data, collector);
            } else if (segment.marker === 0xe2 && asciiEquals(data, 0, "ICC_PROFILE\0") && data.length >= 14) {
                iccParts.push({ order: data[12], total: data[13], bytes: data.slice(14) });
            } else if (segment.marker === 0xed) {
                parseIptc(data, collector);
            } else if (segment.marker === 0xfe) {
                collector.add({ key: "JPEGComment", label: "JPEG Yorumu", value: decodeText(data), source: "JPEG", tag: "COM", category: "description" });
            } else if (segment.marker === 0xeb) {
                const text = LATIN1.decode(data);
                if (/jumb|c2pa|content credentials/i.test(text)) collector.addCredential("C2PA / JUMBF", `JPEG APP11 segmenti (${data.length} bayt)`);
            }
        });
        if (iccParts.length) {
            iccParts.sort((a, b) => a.order - b.order);
            parseIcc(concatBytes(...iccParts.map((part) => part.bytes)), collector, "ICC");
        }
        return info;
    }

    function isSofMarker(marker) {
        return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
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
            const expected = view.getUint32(dataEnd, false);
            const actual = crc32(bytes.subarray(position + 4, dataEnd));
            if (expected !== actual) throw new Error(`PNG ${type} bütünlük denetimi başarısız.`);
            chunks.push({ type, dataStart, dataEnd, length });
            position = end;
            if (type === "IEND") { foundEnd = true; break; }
        }
        if (!foundEnd) throw new Error("PNG bitiş chunk'ı bulunamadı.");
        return chunks;
    }

    function parsePng(bytes, collector) {
        const chunks = parsePngChunks(bytes);
        const info = { width: 0, height: 0, bitDepth: 0, alpha: false, encoding: "PNG", subtype: "—", colorType: "—", orientation: 1, gpsCoordinates: null };
        chunks.forEach((chunk) => {
            const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
            if (chunk.type === "IHDR" && data.length === 13) {
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                info.width = view.getUint32(0, false);
                info.height = view.getUint32(4, false);
                info.bitDepth = data[8];
                const colorTypes = { 0: "Gri tonlama", 2: "Truecolor RGB", 3: "Paletli", 4: "Gri tonlama + alfa", 6: "Truecolor RGBA" };
                info.colorType = colorTypes[data[9]] || `Tür ${data[9]}`;
                info.subtype = info.colorType;
                info.alpha = data[9] === 4 || data[9] === 6;
            } else if (chunk.type === "eXIf") {
                try {
                    const parsed = parseTiff(data, collector, "EXIF");
                    info.orientation = parsed.orientation || info.orientation;
                    info.gpsCoordinates = parsed.gpsCoordinates || info.gpsCoordinates;
                } catch (error) {
                    collector.warnings.push(`PNG EXIF okunamadı: ${error.message}`);
                    collector.add({ key: "CorruptExif", label: "Okunamayan PNG EXIF", value: error.message, source: "PNG", tag: "eXIf", category: "technical" });
                }
            } else if (chunk.type === "tEXt") {
                const zero = data.indexOf(0);
                const keyword = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data)) || "PNG Text";
                const value = zero >= 0 ? cleanText(decodeText(data.subarray(zero + 1))) : `${data.length} bayt`;
                collector.add({ key: keyword, label: keyword, value, source: "PNG", tag: "tEXt", category: semanticCategory(keyword, "png"), sensitive: sensitiveFor(keyword, semanticCategory(keyword, "png")) });
                detectCredentialText(`${keyword} ${value}`, collector, "PNG tEXt");
            } else if (chunk.type === "zTXt") {
                const zero = data.indexOf(0);
                const keyword = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data)) || "PNG Compressed Text";
                collector.add({ key: keyword, label: keyword, value: `Sıkıştırılmış metin (${Math.max(0, data.length - zero - 2)} bayt)`, source: "PNG", tag: "zTXt", category: semanticCategory(keyword, "png") });
            } else if (chunk.type === "iTXt") {
                parsePngInternationalText(data, collector);
            } else if (chunk.type === "iCCP") {
                const zero = data.indexOf(0);
                const name = cleanText(LATIN1.decode(zero >= 0 ? data.subarray(0, zero) : data)) || "Adsız profil";
                collector.add({ key: "ICCProfile", label: "ICC Profil Adı", value: `${name} · sıkıştırılmış ${data.length} bayt`, source: "PNG", tag: "iCCP", category: "color" });
            } else if (chunk.type === "pHYs" && data.length === 9) {
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                const x = view.getUint32(0, false);
                const y = view.getUint32(4, false);
                const unit = data[8];
                const detail = unit === 1 ? `${x} × ${y} piksel/m (${trimNumber(x * 0.0254, 1)} × ${trimNumber(y * 0.0254, 1)} dpi)` : `${x}:${y} en/boy oranı`;
                collector.add({ key: "PNGPhysicalPixelDimensions", label: "Fiziksel Piksel Yoğunluğu", value: detail, source: "PNG", tag: "pHYs", category: "png" });
            } else if (chunk.type === "gAMA" && data.length === 4) {
                collector.add({ key: "PNGGamma", label: "PNG Gamma", value: trimNumber(new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, false) / 100000, 5), source: "PNG", tag: "gAMA", category: "color" });
            } else if (chunk.type === "cHRM" && data.length === 32) {
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                const labels = ["White X", "White Y", "Red X", "Red Y", "Green X", "Green Y", "Blue X", "Blue Y"];
                const value = labels.map((label, index) => `${label}: ${trimNumber(view.getUint32(index * 4, false) / 100000, 5)}`).join(" · ");
                collector.add({ key: "PNGChromaticities", label: "PNG Renk Koordinatları", value, source: "PNG", tag: "cHRM", category: "color" });
            } else if (chunk.type === "tIME" && data.length === 7) {
                const year = (data[0] << 8) | data[1];
                collector.add({ key: "PNGModifyDate", label: "PNG Değiştirme Tarihi", value: `${year}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}:${pad(data[6])} UTC`, source: "PNG", tag: "tIME", category: "date", sensitive: "medium" });
            } else if (chunk.type === "sRGB") {
                collector.add({ key: "PNGsRGB", label: "sRGB Render Niyeti", value: ["Algısal", "Göreli kolorimetrik", "Doygunluk", "Mutlak kolorimetrik"][data[0]] || String(data[0]), source: "PNG", tag: "sRGB", category: "color" });
            } else if (chunk.type === "tRNS") {
                info.alpha = true;
                collector.add({ key: "PNGTransparency", label: "PNG Şeffaflık Verisi", value: `${data.length} bayt`, source: "PNG", tag: "tRNS", category: "png" });
            } else if (chunk.type === "caBX") {
                collector.addCredential("C2PA / JUMBF", `PNG caBX chunk'ı (${data.length} bayt)`);
            } else if (chunk.type !== "IDAT" && chunk.type !== "IEND" && chunk.type !== "IHDR" && chunk.type !== "PLTE") {
                collector.add({ key: `PNGChunk_${chunk.type}`, label: `${chunk.type} Chunk`, value: `${data.length} bayt`, source: "PNG", tag: chunk.type, category: "png", metadata: false });
            }
        });
        return info;
    }

    function parsePngInternationalText(data, collector) {
        const first = data.indexOf(0);
        if (first < 0 || first + 2 >= data.length) return;
        const keyword = cleanText(LATIN1.decode(data.subarray(0, first))) || "PNG International Text";
        const compressed = data[first + 1] === 1;
        let position = first + 3;
        for (let count = 0; count < 2; count += 1) {
            const zero = data.indexOf(0, position);
            if (zero < 0) { position = data.length; break; }
            position = zero + 1;
        }
        const textBytes = data.subarray(position);
        if (!compressed && /xmp|adobe/i.test(keyword)) parseXmp(textBytes, collector);
        else {
            const value = compressed ? `Sıkıştırılmış uluslararası metin (${textBytes.length} bayt)` : cleanText(UTF8.decode(textBytes));
            collector.add({ key: keyword, label: keyword, value, source: "PNG", tag: "iTXt", category: semanticCategory(keyword, "png"), sensitive: sensitiveFor(keyword, semanticCategory(keyword, "png")) });
            detectCredentialText(`${keyword} ${value}`, collector, "PNG iTXt");
        }
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
            chunks.push({ type, dataStart, dataEnd, length });
            position = end;
        }
        if (position !== riffEnd) throw new Error("WebP RIFF hizalaması geçersiz.");
        return chunks;
    }

    function parseWebp(bytes, collector) {
        const chunks = parseWebpChunks(bytes);
        const info = { width: 0, height: 0, bitDepth: 8, alpha: false, encoding: "WebP", subtype: "—", orientation: 1, gpsCoordinates: null, animated: false };
        chunks.forEach((chunk) => {
            const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
            if (chunk.type === "VP8X" && data.length >= 10) {
                info.width = 1 + readUint24LE(data, 4);
                info.height = 1 + readUint24LE(data, 7);
                info.alpha = Boolean(data[0] & 0x10);
                info.animated = Boolean(data[0] & 0x02);
                info.subtype = info.animated ? "Extended Animated" : "Extended";
                const flags = [data[0] & 0x20 && "ICC", data[0] & 0x10 && "Alpha", data[0] & 0x08 && "EXIF", data[0] & 0x04 && "XMP", data[0] & 0x02 && "Animation"].filter(Boolean).join(", ") || "Yok";
                collector.add({ key: "VP8XFlags", label: "VP8X Özellik Bayrakları", value: flags, raw: `0x${data[0].toString(16).padStart(2, "0")}`, source: "WebP", tag: "VP8X", category: "webp", metadata: false });
            } else if (chunk.type === "VP8 " && data.length >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) {
                info.width = (data[6] | (data[7] << 8)) & 0x3fff;
                info.height = (data[8] | (data[9] << 8)) & 0x3fff;
                if (info.subtype === "—") info.subtype = "Lossy VP8";
            } else if (chunk.type === "VP8L" && data.length >= 5 && data[0] === 0x2f) {
                const bits = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
                info.width = (bits & 0x3fff) + 1;
                info.height = ((bits >>> 14) & 0x3fff) + 1;
                info.alpha = Boolean((bits >>> 28) & 1);
                if (info.subtype === "—") info.subtype = "Lossless VP8L";
            } else if (chunk.type === "EXIF") {
                try {
                    const parsed = parseTiff(data, collector, "EXIF");
                    info.orientation = parsed.orientation || info.orientation;
                    info.gpsCoordinates = parsed.gpsCoordinates || info.gpsCoordinates;
                } catch (error) {
                    collector.warnings.push(`WebP EXIF okunamadı: ${error.message}`);
                    collector.add({ key: "CorruptExif", label: "Okunamayan WebP EXIF", value: error.message, source: "WebP", tag: "EXIF", category: "technical" });
                }
            } else if (chunk.type === "XMP ") {
                parseXmp(data, collector);
            } else if (chunk.type === "ICCP") {
                parseIcc(data, collector, "ICC");
            } else if (/JUMB|C2PA/i.test(chunk.type)) {
                collector.addCredential("C2PA / JUMBF", `WebP ${chunk.type} chunk'ı (${data.length} bayt)`);
            } else if (!["ANIM", "ANMF", "ALPH"].includes(chunk.type)) {
                collector.add({ key: `WebPChunk_${chunk.type.trim()}`, label: `${chunk.type.trim()} Chunk`, value: `${data.length} bayt`, source: "WebP", tag: chunk.type, category: "webp", metadata: false });
            }
        });
        return info;
    }

    function detectCredentialText(text, collector, location) {
        const value = String(text || "");
        if (/c2pa/i.test(value)) collector.addCredential("C2PA", `${location} içinde C2PA işareti`);
        if (/jumbf|jumd|cbor|content credentials/i.test(value) && /jumb|credential|c2pa/i.test(value)) collector.addCredential("JUMBF / Content Credentials", `${location} içinde provenance/manifest işareti`);
        if (/dcterms:provenance|digitalSourceType|documentAncestors/i.test(value)) collector.addCredential("XMP Provenance", `${location} içinde provenance alanı`);
    }

    function analyzePrivacy(fields, gpsCoordinates) {
        const reasons = [];
        const has = (pattern) => fields.some((field) => pattern.test(`${field.key} ${field.label}`));
        if (gpsCoordinates) reasons.push({ level: "high", title: "Kesin konum bilgisi", detail: "Fotoğraf GPS enlem ve boylam koordinatları içeriyor." });
        else if (fields.some((field) => field.source === "GPS" || field.category === "gps")) reasons.push({ level: "medium", title: "Konumla ilişkili metadata", detail: "Dosyada GPS veya konumla ilişkili alanlar bulunuyor." });
        if (has(/serialnumber|serial number|seri numarası/i)) reasons.push({ level: "high", title: "Cihaz seri numarası", detail: "Kamera veya lensi benzersiz olarak tanımlayabilecek seri numarası mevcut." });
        if (has(/ownername|artist|author|creator|byline|camera sahibi|yazar/i)) reasons.push({ level: "high", title: "Kişi veya sahip bilgisi", detail: "Yazar, fotoğrafçı ya da cihaz sahibi bilgisi bulunuyor." });
        if (has(/datetimeoriginal|datecreated|çekildiği tarih|oluşturma tarihi/i)) reasons.push({ level: "medium", title: "Çekim tarihi ve saati", detail: "Fotoğrafın ne zaman çekildiğini gösterebilen metadata mevcut." });
        if (has(/\bmake\b|\bmodel\b|camera model|kamera modeli|lensmodel|lens model/i)) reasons.push({ level: "medium", title: "Kamera veya lens modeli", detail: "Kullanılan cihaz ya da lens modeli kayıtlı." });
        if (has(/software|creatortool|processingsoftware|yazılım/i)) reasons.push({ level: "low", title: "Yazılım bilgisi", detail: "Dosyayı oluşturan veya düzenleyen yazılım bilgisi bulunuyor." });
        if (has(/icc|color profile|renk profili/i)) reasons.push({ level: "info", title: "Renk profili", detail: "Teknik renk profili bilgisi mevcut." });
        const rank = { none: 0, info: 1, low: 2, medium: 3, high: 4 };
        const level = reasons.reduce((current, reason) => rank[reason.level] > rank[current] ? reason.level : current, "none");
        const labels = { high: "Yüksek", medium: "Orta", low: "Düşük", info: "Bilgi", none: "Belirlenemedi" };
        return { level, label: labels[level], reasons };
    }

    function buildFileDetails(fileInfo, format, info, actualMime) {
        const name = cleanText(fileInfo.name || "Adsız dosya", 260);
        const extension = getExtension(name);
        const width = Number(info.width) || 0;
        const height = Number(info.height) || 0;
        const ratio = width && height ? aspectRatio(width, height) : "—";
        const megapixels = width && height ? `${trimNumber((width * height) / 1000000, 2)} MP` : "—";
        const lastModified = Number(fileInfo.lastModified) > 0 ? new Date(Number(fileInfo.lastModified)).toISOString() : "—";
        const declaredMime = cleanText(fileInfo.type || "") || "—";
        return {
            name,
            extension: extension ? `.${extension}` : "—",
            declaredMime,
            actualMime,
            mimeMismatch: declaredMime !== "—" && declaredMime.toLowerCase() !== actualMime.toLowerCase(),
            size: Number(fileInfo.size) || 0,
            sizeDisplay: formatBytes(Number(fileInfo.size) || 0),
            width,
            height,
            resolution: width && height ? `${width} × ${height}` : "—",
            megapixels,
            aspectRatio: ratio,
            orientation: ENUMS.Orientation[info.orientation] || (info.orientation ? String(info.orientation) : "—"),
            orientationCode: info.orientation || 1,
            format,
            bitDepth: info.bitDepth ? `${info.bitDepth} bit${info.components ? ` × ${info.components} kanal` : ""}` : "—",
            alphaChannel: info.alpha ? "Var" : "Yok",
            encoding: info.encoding || "—",
            subtype: info.subtype || "—",
            colorType: info.colorType || "—",
            lastModified,
        };
    }

    function buildStructured(file, fields, credentials) {
        const output = { file: { ...file }, exif: {}, gps: {}, camera: {}, xmp: {}, iptc: {}, icc: {}, png: {}, webp: {}, contentCredentials: { ...credentials } };
        fields.forEach((field) => {
            let target;
            if (field.source === "GPS") target = output.gps;
            else if (field.source === "XMP") target = output.xmp;
            else if (field.source === "IPTC") target = output.iptc;
            else if (field.source === "ICC") target = output.icc;
            else if (field.source === "PNG") target = output.png;
            else if (field.source === "WebP") target = output.webp;
            else if (field.source === "EXIF") target = output.exif;
            else target = output.exif;
            appendStructured(target, field.key, field.value);
            if (field.category === "camera") appendStructured(output.camera, field.key, field.value);
        });
        return output;
    }

    function appendStructured(target, key, value) {
        if (!(key in target)) target[key] = value;
        else if (Array.isArray(target[key])) target[key].push(value);
        else target[key] = [target[key], value];
    }

    function analyze(input, fileInfo = {}) {
        const bytes = toBytes(input);
        const detected = sniffFormat(bytes);
        if (detected === "heic") throw new Error("HEIC/HEIF metadata analizi bu sürümde güvenilir biçimde desteklenmiyor.");
        if (!detected) throw new Error("Desteklenmeyen veya tanınmayan dosya. JPEG, PNG ya da WebP seçin.");
        const collector = createCollector();
        let info;
        let actualMime;
        let label;
        if (detected === "jpeg") { info = parseJpeg(bytes, collector); actualMime = "image/jpeg"; label = "JPEG"; }
        else if (detected === "png") { info = parsePng(bytes, collector); actualMime = "image/png"; label = "PNG"; }
        else { info = parseWebp(bytes, collector); actualMime = "image/webp"; label = "WebP"; }
        if (!info.width || !info.height) collector.warnings.push("Görsel çözünürlüğü dosya container'ından okunamadı.");
        if (collector.fields.length >= MAX_FIELDS) collector.warnings.push("Metadata alanları güvenlik amacıyla sınırlandırıldı.");
        const file = buildFileDetails({ ...fileInfo, size: fileInfo.size ?? bytes.length }, label, info, actualMime);
        if (file.mimeMismatch) collector.warnings.push(`Bildirilen MIME (${file.declaredMime}) ile gerçek format (${actualMime}) eşleşmiyor.`);
        const gpsCoordinates = info.gpsCoordinates || findCoordinatesInFields(collector.fields);
        const metadataFields = collector.fields.filter((field) => field.metadata);
        const privacy = analyzePrivacy(metadataFields, gpsCoordinates);
        const camera = summarizeCamera(metadataFields);
        const hasDate = metadataFields.some((field) => field.category === "date");
        const structured = buildStructured(file, collector.fields, collector.contentCredentials);
        if (collector.rawXmp.length) structured.xmp._rawXml = collector.rawXmp.length === 1 ? collector.rawXmp[0] : collector.rawXmp;

        return {
            format: detected,
            label,
            file,
            fields: collector.fields,
            metadataCount: metadataFields.length,
            gpsCoordinates,
            privacy,
            camera,
            hasDate,
            contentCredentials: collector.contentCredentials,
            rawXmp: collector.rawXmp,
            thumbnail: collector.thumbnail,
            warnings: collector.warnings,
            structured,
        };
    }

    function findCoordinatesInFields(fields) {
        const latitude = fields.find((field) => field.key === "GPSLatitudeDecimal");
        const longitude = fields.find((field) => field.key === "GPSLongitudeDecimal");
        if (!latitude || !longitude) return null;
        const lat = Number(latitude.raw);
        const lon = Number(longitude.raw);
        return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
    }

    function summarizeCamera(fields) {
        const make = fields.find((field) => field.key === "Make")?.value || "";
        const model = fields.find((field) => ["Model", "UniqueCameraModel"].includes(field.key))?.value || "";
        if (!make && !model) return "—";
        if (model && make && model.toLowerCase().includes(make.toLowerCase())) return model;
        return cleanText(`${make} ${model}`) || "—";
    }

    function sniffFormat(input) {
        const bytes = toBytes(input);
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
        if (bytesEqual(bytes, 0, PNG_SIGNATURE)) return "png";
        if (bytes.length >= 12 && asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WEBP")) return "webp";
        if (bytes.length >= 12 && asciiEquals(bytes, 4, "ftyp")) {
            const brand = readAscii(bytes, 8, 4).toLowerCase();
            if (["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand)) return "heic";
        }
        return "";
    }

    function readJpegDimensions(bytes) {
        try {
            const segments = walkJpeg(bytes);
            for (const segment of segments) {
                if (!isSofMarker(segment.marker)) continue;
                const data = bytes.subarray(segment.dataStart, segment.dataEnd);
                if (data.length >= 5) return { width: (data[3] << 8) | data[4], height: (data[1] << 8) | data[2] };
            }
        } catch { return { width: 0, height: 0 }; }
        return { width: 0, height: 0 };
    }

    function readPngDimensions(bytes) {
        if (!bytesEqual(bytes, 0, PNG_SIGNATURE) || bytes.length < 24) return { width: 0, height: 0 };
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }

    function readUint24LE(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    }

    function humanizeName(value) {
        return cleanText(String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/^./, (character) => character.toLocaleUpperCase("tr-TR")));
    }

    function bytesToHex(bytes, limit = 64) {
        const view = bytes.subarray(0, Math.min(bytes.length, limit));
        const text = Array.from(view, (value) => value.toString(16).padStart(2, "0")).join(" ").toUpperCase();
        return bytes.length > limit ? `${text} … (${bytes.length} bayt)` : text;
    }

    function hexTag(tag) {
        return `0x${Number(tag).toString(16).padStart(4, "0").toUpperCase()}`;
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

    function aspectRatio(width, height) {
        const divisor = gcd(width, height);
        return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
    }

    function gcd(a, b) {
        let left = Math.abs(Number(a));
        let right = Math.abs(Number(b));
        while (right) [left, right] = [right, left % right];
        return left || 1;
    }

    function getExtension(name) {
        const match = String(name || "").match(/\.([^.]+)$/);
        return match ? match[1].toLowerCase() : "";
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        const units = ["KB", "MB", "GB"];
        let current = value / 1024;
        let index = 0;
        while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
        return `${current.toLocaleString("tr-TR", { maximumFractionDigits: current >= 100 ? 0 : 2 })} ${units[index]}`;
    }

    function pad(value) {
        return String(value).padStart(2, "0");
    }

    return {
        analyze,
        sniffFormat,
        formatBytes,
        _test: {
            parseTiff,
            parseXmp,
            parseIptc,
            parseIcc,
            parsePngChunks,
            parseWebpChunks,
            coordinateToDecimal,
            crc32,
            asciiBytes,
            concatBytes,
        },
    };
});
