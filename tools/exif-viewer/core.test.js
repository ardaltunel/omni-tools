"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

const { asciiBytes, concatBytes, crc32 } = core._test;

function jpegSegment(marker, payload) {
    const output = new Uint8Array(payload.length + 4);
    output.set([0xff, marker, ((payload.length + 2) >>> 8) & 0xff, (payload.length + 2) & 0xff]);
    output.set(payload, 4);
    return output;
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

function makeWebpChunk(type, data) {
    const output = new Uint8Array(8 + data.length + (data.length & 1));
    output.set(asciiBytes(type), 0);
    new DataView(output.buffer).setUint32(4, data.length, true);
    output.set(data, 8);
    return output;
}

function createTinyJpeg(width = 160, height = 120) {
    return concatBytes(
        Uint8Array.from([0xff, 0xd8]),
        jpegSegment(0xc0, Uint8Array.from([8, (height >>> 8) & 0xff, height & 0xff, (width >>> 8) & 0xff, width & 0xff, 1, 1, 0])),
        jpegSegment(0xda, Uint8Array.from([1, 1, 0, 0, 63, 0])),
        Uint8Array.from([0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9]),
    );
}

function createTiff(options = {}) {
    const settings = {
        make: "Apple",
        model: "iPhone 15 Pro",
        software: "iOS 18.0",
        artist: "Test User",
        copyright: "© Test User",
        lens: "iPhone back triple camera",
        serial: "SERIAL-12345",
        date: "2026:08:07 15:45:48",
        orientation: 6,
        gps: true,
        latitude: [41, 0, 29.6532],
        longitude: [28, 58, 42.0924],
        latitudeRef: "N",
        longitudeRef: "E",
        thumbnail: false,
        maliciousComment: "<script>alert('xss')</script>",
        ...options,
    };
    const ifd0Entries = [
        [0x010f, 2, settings.make], [0x0110, 2, settings.model], [0x0112, 3, settings.orientation],
        [0x0131, 2, settings.software], [0x0132, 2, settings.date], [0x013b, 2, settings.artist],
        [0x8298, 2, settings.copyright], [0x8769, 4, 0],
    ];
    if (settings.gps) ifd0Entries.push([0x8825, 4, 0]);
    const exifEntries = [
        [0x829a, 5, [[1, 250]]], [0x829d, 5, [[18, 10]]], [0x8827, 3, 100],
        [0x9000, 7, asciiBytes("0232")], [0x9003, 2, settings.date], [0x9004, 2, settings.date],
        [0x9204, 10, [[1, 3]]], [0x920a, 5, [[68, 10]]], [0x9286, 7, concatBytes(asciiBytes("ASCII\0\0\0"), asciiBytes(settings.maliciousComment))],
        [0xa002, 4, 4032], [0xa003, 4, 3024], [0xa005, 4, 0], [0xa405, 3, 24],
        [0xa431, 2, settings.serial], [0xa434, 2, settings.lens],
    ];
    const gpsEntries = settings.gps ? [
        [0x0001, 2, settings.latitudeRef], [0x0002, 5, settings.latitude.map((value) => rational(value))],
        [0x0003, 2, settings.longitudeRef], [0x0004, 5, settings.longitude.map((value) => rational(value))],
        [0x0005, 1, 0], [0x0006, 5, [[342, 10]]], [0x0007, 5, [[12, 1], [34, 1], [56, 1]]],
        [0x0011, 5, [[124, 1]]], [0x001d, 2, "2026:08:07"], [0x001f, 5, [[5, 1]]],
    ] : [];
    const interopEntries = [[0x0001, 2, "R98"], [0x0002, 7, asciiBytes("0100")]];
    const ifd1Entries = settings.thumbnail ? [[0x0100, 4, 160], [0x0101, 4, 120], [0x0201, 4, 0], [0x0202, 4, 0]] : [];
    const sizeOfIfd = (entries) => 2 + entries.length * 12 + 4;
    const ifd0Offset = 8;
    const exifOffset = ifd0Offset + sizeOfIfd(ifd0Entries);
    const gpsOffset = exifOffset + sizeOfIfd(exifEntries);
    const interopOffset = gpsOffset + sizeOfIfd(gpsEntries);
    const ifd1Offset = interopOffset + sizeOfIfd(interopEntries);
    const dataStart = ifd1Offset + sizeOfIfd(ifd1Entries);
    const thumbnail = settings.thumbnail ? createTinyJpeg() : new Uint8Array();
    const bytes = new Uint8Array(dataStart + 4096 + thumbnail.length);
    const view = new DataView(bytes.buffer);
    bytes.set(asciiBytes("II"), 0);
    view.setUint16(2, 42, true);
    view.setUint32(4, ifd0Offset, true);
    ifd0Entries.find((entry) => entry[0] === 0x8769)[2] = exifOffset;
    const gpsPointer = ifd0Entries.find((entry) => entry[0] === 0x8825);
    if (gpsPointer) gpsPointer[2] = gpsOffset;
    exifEntries.find((entry) => entry[0] === 0xa005)[2] = interopOffset;
    const state = { cursor: dataStart };
    writeIfd(bytes, view, ifd0Offset, ifd0Entries, settings.thumbnail ? ifd1Offset : 0, state);
    writeIfd(bytes, view, exifOffset, exifEntries, 0, state);
    if (settings.gps) writeIfd(bytes, view, gpsOffset, gpsEntries, 0, state);
    writeIfd(bytes, view, interopOffset, interopEntries, 0, state);
    if (settings.thumbnail) {
        writeIfd(bytes, view, ifd1Offset, ifd1Entries, 0, state);
        const thumbOffset = state.cursor;
        bytes.set(thumbnail, thumbOffset);
        state.cursor += thumbnail.length;
        patchIfdLong(view, ifd1Offset, ifd1Entries, 0x0201, thumbOffset);
        patchIfdLong(view, ifd1Offset, ifd1Entries, 0x0202, thumbnail.length);
    }
    return bytes.slice(0, state.cursor);
}

function createBigEndianTiff() {
    const bytes = new Uint8Array(63);
    const view = new DataView(bytes.buffer);
    bytes.set(asciiBytes("MM"), 0);
    view.setUint16(2, 42, false);
    view.setUint32(4, 8, false);
    view.setUint16(8, 3, false);

    view.setUint16(10, 0x010f, false);
    view.setUint16(12, 2, false);
    view.setUint32(14, 6, false);
    view.setUint32(18, 50, false);

    view.setUint16(22, 0x0110, false);
    view.setUint16(24, 2, false);
    view.setUint32(26, 7, false);
    view.setUint32(30, 56, false);

    view.setUint16(34, 0xc7ff, false);
    view.setUint16(36, 3, false);
    view.setUint32(38, 1, false);
    view.setUint16(42, 123, false);
    view.setUint32(46, 0, false);
    bytes.set(asciiBytes("Canon\0"), 50);
    bytes.set(asciiBytes("EOS R5\0"), 56);
    return bytes;
}

function rational(value) {
    const number = Number(value);
    if (Number.isInteger(number)) return [number, 1];
    return [Math.round(number * 10000), 10000];
}

function writeIfd(bytes, view, offset, entries, nextOffset, state) {
    view.setUint16(offset, entries.length, true);
    entries.forEach(([tag, type, value], index) => {
        const entry = offset + 2 + index * 12;
        const encoded = encodeTiffValue(type, value);
        view.setUint16(entry, tag, true);
        view.setUint16(entry + 2, type, true);
        view.setUint32(entry + 4, encoded.count, true);
        if (encoded.bytes.length <= 4) bytes.set(encoded.bytes, entry + 8);
        else {
            view.setUint32(entry + 8, state.cursor, true);
            bytes.set(encoded.bytes, state.cursor);
            state.cursor += encoded.bytes.length + (encoded.bytes.length & 1);
        }
    });
    view.setUint32(offset + 2 + entries.length * 12, nextOffset, true);
}

function encodeTiffValue(type, value) {
    if (type === 2) {
        const body = new TextEncoder().encode(`${value}\0`);
        return { bytes: body, count: body.length };
    }
    if (type === 7) return { bytes: value, count: value.length };
    if (type === 1) return { bytes: Uint8Array.from([value]), count: 1 };
    if (type === 3) {
        const output = new Uint8Array(2);
        new DataView(output.buffer).setUint16(0, value, true);
        return { bytes: output, count: 1 };
    }
    if (type === 4) {
        const output = new Uint8Array(4);
        new DataView(output.buffer).setUint32(0, value, true);
        return { bytes: output, count: 1 };
    }
    if (type === 5 || type === 10) {
        const pairs = Array.isArray(value[0]) ? value : [value];
        const output = new Uint8Array(pairs.length * 8);
        const view = new DataView(output.buffer);
        pairs.forEach(([numerator, denominator], index) => {
            if (type === 5) {
                view.setUint32(index * 8, numerator, true);
                view.setUint32(index * 8 + 4, denominator, true);
            } else {
                view.setInt32(index * 8, numerator, true);
                view.setInt32(index * 8 + 4, denominator, true);
            }
        });
        return { bytes: output, count: pairs.length };
    }
    throw new Error(`Unsupported test TIFF type ${type}`);
}

function patchIfdLong(view, offset, entries, tag, value) {
    const index = entries.findIndex((entry) => entry[0] === tag);
    view.setUint32(offset + 2 + index * 12 + 8, value, true);
}

function createIcc() {
    const description = asciiBytes("Test Display P3 Profile\0");
    const desc = new Uint8Array(12 + description.length);
    desc.set(asciiBytes("desc"), 0);
    new DataView(desc.buffer).setUint32(8, description.length, false);
    desc.set(description, 12);
    const output = new Uint8Array(144 + desc.length);
    const view = new DataView(output.buffer);
    view.setUint32(0, output.length, false);
    output[8] = 0x43;
    output.set(asciiBytes("mntr"), 12);
    output.set(asciiBytes("RGB "), 16);
    output.set(asciiBytes("XYZ "), 20);
    output.set(asciiBytes("acsp"), 36);
    view.setUint32(128, 1, false);
    output.set(asciiBytes("desc"), 132);
    view.setUint32(136, 144, false);
    view.setUint32(140, desc.length, false);
    output.set(desc, 144);
    return output;
}

function createJpeg(options = {}) {
    const settings = { exif: true, xmp: true, iptc: true, icc: true, c2pa: false, tiff: {}, ...options };
    const parts = [Uint8Array.from([0xff, 0xd8])];
    if (settings.exif) parts.push(jpegSegment(0xe1, concatBytes(asciiBytes("Exif\0\0"), createTiff(settings.tiff))));
    if (settings.xmp) parts.push(jpegSegment(0xe1, concatBytes(
        asciiBytes("http://ns.adobe.com/xap/1.0/\0"),
        new TextEncoder().encode(settings.xmpXml || '<x:xmpmeta><rdf:Description xmp:CreatorTool="Adobe Photoshop" photoshop:Credit="Agency" dc:rights="© Example" /></x:xmpmeta>'),
    )));
    if (settings.iptc) parts.push(jpegSegment(0xed, concatBytes(
        asciiBytes("Photoshop 3.0\0"), Uint8Array.from([0x1c, 0x02, 0x50, 0, 8]), asciiBytes("John Doe"),
        Uint8Array.from([0x1c, 0x02, 0x78, 0, 7]), asciiBytes("Caption"),
    )));
    if (settings.icc) parts.push(jpegSegment(0xe2, concatBytes(asciiBytes("ICC_PROFILE\0"), Uint8Array.from([1, 1]), createIcc())));
    if (settings.c2pa) parts.push(jpegSegment(0xeb, asciiBytes("JUMBF c2pa manifest Content Credentials")));
    parts.push(createTinyJpeg(4032, 3024).slice(2));
    return concatBytes(...parts);
}

function createPng(options = {}) {
    const settings = { width: 1200, height: 800, text: true, exif: true, xmp: true, c2pa: false, ...options };
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, settings.width, false);
    view.setUint32(4, settings.height, false);
    ihdr.set([8, 6, 0, 0, 0], 8);
    const chunks = [makePngChunk("IHDR", ihdr)];
    if (settings.text) chunks.push(makePngChunk("tEXt", concatBytes(asciiBytes("Comment\0"), new TextEncoder().encode(settings.comment || "Unicode: İstanbul ☀"))));
    if (settings.xmp) chunks.push(makePngChunk("iTXt", concatBytes(asciiBytes("XML:com.adobe.xmp\0\0\0\0\0"), new TextEncoder().encode('<x:xmpmeta xmp:CreatorTool="Lightroom" dc:title="PNG title" />'))));
    if (settings.exif) chunks.push(makePngChunk("eXIf", createTiff({ gps: false, artist: "" })));
    chunks.push(makePngChunk("gAMA", Uint8Array.from([0, 0, 177, 143])));
    if (settings.c2pa) chunks.push(makePngChunk("caBX", asciiBytes("c2pa manifest")));
    chunks.push(makePngChunk("IDAT", Uint8Array.from([0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1])));
    chunks.push(makePngChunk("IEND", new Uint8Array()));
    return concatBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks);
}

function createWebp(options = {}) {
    const settings = { exif: true, xmp: true, icc: true, vp8Payload: Uint8Array.from([0x2f, 0xff, 0xbf, 0, 0]), ...options };
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x3c;
    vp8x[4] = 0xff;
    vp8x[5] = 0x03;
    vp8x[7] = 0xff;
    vp8x[8] = 0x02;
    const chunks = [makeWebpChunk("VP8X", vp8x)];
    if (settings.icc) chunks.push(makeWebpChunk("ICCP", createIcc()));
    if (settings.exif) chunks.push(makeWebpChunk("EXIF", createTiff({ gps: false, make: "Google", model: "Pixel 9" })));
    if (settings.xmp) chunks.push(makeWebpChunk("XMP ", new TextEncoder().encode('<x:xmpmeta xmp:CreatorTool="WebP Exporter" dc:description="WebP metadata" />')));
    chunks.push(makeWebpChunk("VP8L", settings.vp8Payload));
    const payload = concatBytes(asciiBytes("WEBP"), ...chunks);
    const output = new Uint8Array(payload.length + 8);
    output.set(asciiBytes("RIFF"), 0);
    new DataView(output.buffer).setUint32(4, payload.length, true);
    output.set(payload, 8);
    return output;
}

function analyze(bytes, name = "image.jpg", type = "image/jpeg") {
    return core.analyze(bytes, { name, type, size: bytes.length, lastModified: Date.UTC(2026, 7, 7) });
}

test("iPhone, Android ve DSLR JPEG kamera profilleri yalnızca gömülü alanlardan okunur", () => {
    const profiles = [
        [{ make: "Apple", model: "iPhone 15 Pro" }, "Apple iPhone 15 Pro"],
        [{ make: "Samsung", model: "SM-S928B" }, "Samsung SM-S928B"],
        [{ make: "Canon", model: "EOS R5", lens: "RF24-70mm F2.8 L IS USM" }, "Canon EOS R5"],
    ];
    profiles.forEach(([tiff, expected]) => assert.equal(analyze(createJpeg({ tiff })).camera, expected));
});

test("big-endian EXIF ve bilinmeyen tag güvenli biçimde okunur", () => {
    const jpeg = concatBytes(
        Uint8Array.from([0xff, 0xd8]),
        jpegSegment(0xe1, concatBytes(asciiBytes("Exif\0\0"), createBigEndianTiff())),
        createTinyJpeg(1200, 800).slice(2),
    );
    const result = analyze(jpeg, "big-endian.jpg", "image/jpeg");
    assert.equal(result.camera, "Canon EOS R5");
    assert.ok(result.fields.some((field) => field.key === "Tag0xc7ff" && field.value === "123"));
});

test("GPS bulunan JPEG DMS koordinatlarını decimal değere dönüştürür", () => {
    const result = analyze(createJpeg());
    assert.ok(Math.abs(result.gpsCoordinates.latitude - 41.008237) < 0.000001);
    assert.ok(Math.abs(result.gpsCoordinates.longitude - 28.978359) < 0.000001);
    assert.equal(result.privacy.level, "high");
    assert.ok(result.fields.some((field) => field.key === "GPSHPositioningError" && field.value === "±5 m"));
});

test("GPS bulunmayan JPEG konum tahmini yapmaz", () => {
    const result = analyze(createJpeg({ tiff: { gps: false, artist: "", serial: "" } }));
    assert.equal(result.gpsCoordinates, null);
    assert.equal(result.fields.some((field) => field.source === "GPS"), false);
});

test("çekim ayarları kullanıcı dostu biçimlendirilir", () => {
    const result = analyze(createJpeg());
    assert.equal(result.fields.find((field) => field.key === "ExposureTime").value, "1/250 sn");
    assert.equal(result.fields.find((field) => field.key === "FNumber").value, "f/1.8");
    assert.equal(result.fields.find((field) => field.key === "FocalLength").value, "6.8 mm");
    assert.equal(result.fields.find((field) => field.key === "ExposureBiasValue").value, "+0.33 EV");
});

test("Photoshop ve Lightroom bilgisi yalnızca EXIF/XMP alanından raporlanır", () => {
    const photoshop = analyze(createJpeg({ tiff: { software: "Adobe Photoshop 25" } }));
    assert.ok(photoshop.fields.some((field) => field.category === "software" && /Photoshop/.test(field.value)));
    const lightroom = analyze(createPng(), "lightroom.png", "image/png");
    assert.ok(lightroom.fields.some((field) => field.source === "XMP" && /Lightroom/.test(field.value)));
});

test("XMP namespace alanları, liste değerleri ve raw XML okunur", () => {
    const xml = '<x:xmpmeta><rdf:Description xmp:CreatorTool="Editor"><dc:creator><rdf:Seq><rdf:li>Ayşe</rdf:li><rdf:li>John</rdf:li></rdf:Seq></dc:creator></rdf:Description></x:xmpmeta>';
    const result = analyze(createJpeg({ xmpXml: xml }));
    assert.ok(result.fields.some((field) => field.key === "xmp:CreatorTool" && field.value === "Editor"));
    assert.ok(result.fields.some((field) => field.key === "dc:creator" && /Ayşe/.test(field.value)));
    assert.ok(result.rawXmp[0].includes("rdf:Seq"));
});

test("IPTC/IIM yazar ve caption alanları okunur", () => {
    const result = analyze(createJpeg());
    assert.ok(result.fields.some((field) => field.source === "IPTC" && field.key === "Byline" && field.value === "John Doe"));
    assert.ok(result.fields.some((field) => field.source === "IPTC" && field.key === "Caption"));
});

test("ICC profile adı, boyutu ve renk uzayı okunur", () => {
    const result = analyze(createJpeg());
    assert.ok(result.fields.some((field) => field.key === "ICC_desc" && /Display P3/.test(field.value)));
    assert.ok(result.fields.some((field) => field.key === "ICCColorSpace" && /RGB/.test(field.value)));
});

test("EXIF IFD1 thumbnail algılanır ve boyutları raporlanır", () => {
    const result = analyze(createJpeg({ tiff: { thumbnail: true } }));
    assert.ok(result.thumbnail);
    assert.equal(result.thumbnail.mime, "image/jpeg");
    assert.deepEqual([result.thumbnail.width, result.thumbnail.height], [160, 120]);
});

test("metadata olmayan JPEG için alan uydurulmaz", () => {
    const result = analyze(createJpeg({ exif: false, xmp: false, iptc: false, icc: false }));
    assert.equal(result.metadataCount, 0);
    assert.equal(result.camera, "—");
    assert.equal(result.gpsCoordinates, null);
});

test("PNG tEXt, iTXt/XMP, eXIf ve gAMA chunk'ları ayrıştırılır; IDAT gösterilmez", () => {
    const result = analyze(createPng(), "sample.png", "image/png");
    assert.equal(result.label, "PNG");
    assert.ok(result.fields.some((field) => field.tag === "tEXt"));
    assert.ok(result.fields.some((field) => field.source === "XMP"));
    assert.ok(result.fields.some((field) => field.source === "EXIF"));
    assert.ok(result.fields.some((field) => field.tag === "gAMA"));
    assert.equal(result.fields.some((field) => field.tag === "IDAT"), false);
});

test("WebP VP8X, EXIF, XMP ve ICCP alanları ayrıştırılır", () => {
    const result = analyze(createWebp(), "sample.webp", "image/webp");
    assert.equal(result.label, "WebP");
    assert.equal(result.file.subtype, "Extended");
    assert.ok(result.fields.some((field) => field.tag === "VP8X"));
    assert.ok(result.fields.some((field) => field.source === "EXIF" && field.key === "Model"));
    assert.ok(result.fields.some((field) => field.source === "XMP"));
    assert.ok(result.fields.some((field) => field.source === "ICC"));
});

test("büyük çözünürlük pixel decode edilmeden container'dan okunur", () => {
    const result = analyze(createPng({ width: 8000, height: 6000, exif: false, xmp: false, text: false }), "large.png", "image/png");
    assert.equal(result.file.resolution, "8000 × 6000");
    assert.equal(result.file.megapixels, "48 MP");
    assert.equal(result.file.aspectRatio, "4:3");
});

test("corrupt JPEG reddedilir, truncated EXIF ise güvenli uyarıyla raporlanır", () => {
    assert.throws(() => analyze(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 40])), /sınır|bitiş|geçersiz/i);
    const truncatedExif = concatBytes(
        Uint8Array.from([0xff, 0xd8]),
        jpegSegment(0xe1, concatBytes(asciiBytes("Exif\0\0"), Uint8Array.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 3, 0]))),
        createTinyJpeg().slice(2),
    );
    const result = analyze(truncatedExif);
    assert.ok(result.warnings.some((warning) => /EXIF okunamadı/i.test(warning)));
    assert.ok(result.fields.some((field) => field.key === "CorruptExif"));
});

test("yanlış extension ve MIME mismatch imzadan doğru algılanır", () => {
    const result = analyze(createPng(), "wrong.jpg", "image/jpeg");
    assert.equal(result.label, "PNG");
    assert.equal(result.file.mimeMismatch, true);
    assert.ok(result.warnings.some((warning) => /MIME/.test(warning)));
});

test("Unicode ve malicious HTML metadata düz metin olarak korunur", () => {
    const result = analyze(createPng({ comment: "İstanbul <script>alert(1)</script> ☀" }), "unicode.png", "image/png");
    const field = result.fields.find((entry) => entry.tag === "tEXt");
    assert.ok(field.value.includes("<script>alert(1)</script>"));
    assert.ok(field.value.includes("İstanbul"));
});

test("C2PA/JUMBF marker yalnızca container içinde bulunduğunda tespit edilir", () => {
    const found = analyze(createJpeg({ c2pa: true }));
    assert.equal(found.contentCredentials.detected, true);
    assert.ok(found.contentCredentials.types.some((type) => /C2PA/.test(type)));
    const missing = analyze(createJpeg({ c2pa: false }));
    assert.equal(missing.contentCredentials.detected, false);
});

test("sıkıştırılmış WebP görüntü payload'ındaki metin C2PA kaydı sayılmaz", () => {
    const payload = concatBytes(Uint8Array.from([0x2f, 0xff, 0xbf, 0, 0]), asciiBytes("c2pa content credentials"));
    const result = analyze(createWebp({ exif: false, xmp: false, icc: false, vp8Payload: payload }), "payload.webp", "image/webp");
    assert.equal(result.contentCredentials.detected, false);
});

test("structured JSON gerekli kaynak gruplarını içerir", () => {
    const result = analyze(createJpeg());
    assert.equal(result.structured.file.format, "JPEG");
    assert.equal(result.structured.camera.Model, "iPhone 15 Pro");
    assert.ok(result.structured.gps.GPSLatitudeDecimal);
    assert.ok(result.structured.xmp["xmp:CreatorTool"]);
    assert.ok(result.structured.iptc.Byline);
});

test("analiz tamamen read-only çalışır ve giriş byte'larını değiştirmez", () => {
    const source = createJpeg();
    const before = source.slice();
    analyze(source);
    assert.deepEqual(source, before);
});

test("AI aracından indirilmiş fakat metadata içermeyen örnekte üretim tahmini yapılmaz", () => {
    const result = analyze(createPng({ text: false, exif: false, xmp: false }), "ai-export.png", "image/png");
    assert.equal(result.metadataCount, 1); // Yalnızca dosyada gerçekten bulunan gAMA.
    assert.equal(result.fields.some((field) => /AI|ChatGPT|Canva/i.test(`${field.key} ${field.value}`)), false);
    assert.equal(result.contentCredentials.detected, false);
});
