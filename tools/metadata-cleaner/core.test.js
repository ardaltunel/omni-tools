"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./core.js");

const { asciiBytes, concatBytes, makePngChunk, makeWebpChunk, parsePngChunks, parseWebpChunks } = core._test;

function jpegSegment(marker, payload) {
    const output = new Uint8Array(payload.length + 4);
    output[0] = 0xff;
    output[1] = marker;
    output[2] = ((payload.length + 2) >>> 8) & 0xff;
    output[3] = (payload.length + 2) & 0xff;
    output.set(payload, 4);
    return output;
}

function createExifTiff(orientation = 6) {
    const output = new Uint8Array(240);
    const view = new DataView(output.buffer);
    const writeEntry = (offset, tag, type, count, value, inlineShort = false) => {
        view.setUint16(offset, tag, true);
        view.setUint16(offset + 2, type, true);
        view.setUint32(offset + 4, count, true);
        if (inlineShort) view.setUint16(offset + 8, value, true);
        else view.setUint32(offset + 8, value, true);
    };

    output.set(asciiBytes("II"), 0);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 5, true);
    writeEntry(10, 0x010f, 2, 6, 74);
    writeEntry(22, 0x0112, 3, 1, orientation, true);
    writeEntry(34, 0x0131, 2, 3, 0x00005350);
    writeEntry(46, 0x8769, 4, 1, 80);
    writeEntry(58, 0x8825, 4, 1, 138);
    view.setUint32(70, 0, true);
    output.set(asciiBytes("Canon\0"), 74);

    view.setUint16(80, 2, true);
    writeEntry(82, 0x9003, 2, 20, 110);
    writeEntry(94, 0xa434, 2, 8, 130);
    view.setUint32(106, 0, true);
    output.set(asciiBytes("2026:08:07 12:34:56\0"), 110);
    output.set(asciiBytes("Lens 50\0"), 130);

    view.setUint16(138, 4, true);
    writeEntry(140, 0x0001, 2, 2, 0x0000004e);
    writeEntry(152, 0x0002, 5, 3, 192);
    writeEntry(164, 0x0003, 2, 2, 0x00000045);
    writeEntry(176, 0x0004, 5, 3, 216);
    view.setUint32(188, 0, true);
    [[192, 41], [200, 1], [208, 30], [216, 29], [224, 2], [232, 15]].forEach(([offset, value]) => {
        view.setUint32(offset, value, true);
        view.setUint32(offset + 4, 1, true);
    });
    return output;
}

function createJpeg({ metadata = true, photoshop = true } = {}) {
    const parts = [Uint8Array.from([0xff, 0xd8])];
    if (metadata) {
        parts.push(jpegSegment(0xe1, concatBytes(asciiBytes("Exif\0\0"), createExifTiff())));
        parts.push(jpegSegment(0xe1, concatBytes(
            asciiBytes("http://ns.adobe.com/xap/1.0/\0"),
            asciiBytes('<x:xmpmeta><rdf:Description xmp:CreatorTool="Photoshop" exif:GPSLatitude="41.025" dc:creator="Arda" /></x:xmpmeta>'),
        )));
        parts.push(jpegSegment(0xe2, concatBytes(asciiBytes("ICC_PROFILE\0"), Uint8Array.from([1, 1, 7, 8, 9]))));
        parts.push(jpegSegment(0xfe, asciiBytes("private comment")));
    }
    if (photoshop) {
        parts.push(jpegSegment(0xed, concatBytes(
            asciiBytes("Photoshop 3.0\0"),
            Uint8Array.from([0x1c, 0x02, 0x50, 0x00, 0x04]),
            asciiBytes("Arda"),
            Uint8Array.from([0x1c, 0x02, 0x74, 0x00, 0x09]),
            asciiBytes("Copyright"),
        )));
    }
    parts.push(jpegSegment(0xc0, Uint8Array.from([8, 0, 2, 0, 3, 1, 1, 0])));
    parts.push(jpegSegment(0xda, Uint8Array.from([1, 1, 0, 0, 63, 0])));
    parts.push(Uint8Array.from([0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44, 0xff, 0xd9]));
    return concatBytes(...parts);
}

function createPng({ metadata = true, width = 3, height = 2 } = {}) {
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width, false);
    view.setUint32(4, height, false);
    ihdr.set([8, 6, 0, 0, 0], 8);
    const chunks = [makePngChunk("IHDR", ihdr)];
    if (metadata) {
        chunks.push(makePngChunk("tEXt", concatBytes(asciiBytes("Comment\0"), asciiBytes("private note"))));
        chunks.push(makePngChunk("iTXt", concatBytes(asciiBytes("XML:com.adobe.xmp\0\0\0\0\0"), asciiBytes('<x:xmpmeta xmp:CreatorTool="Editor" />'))));
        chunks.push(makePngChunk("eXIf", createExifTiff()));
        chunks.push(makePngChunk("iCCP", concatBytes(asciiBytes("Display P3\0"), Uint8Array.from([0, 1, 2, 3]))));
    }
    chunks.push(makePngChunk("IDAT", Uint8Array.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])));
    chunks.push(makePngChunk("IEND", new Uint8Array()));
    return concatBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks);
}

function createWebp() {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x2c;
    vp8x[4] = 2;
    vp8x[7] = 1;
    const chunks = [
        makeWebpChunk("VP8X", vp8x),
        makeWebpChunk("ICCP", Uint8Array.from([1, 2, 3, 4])),
        makeWebpChunk("EXIF", createExifTiff()),
        makeWebpChunk("XMP ", asciiBytes('<x:xmpmeta xmp:CreatorTool="Editor" exif:GPSLongitude="29.0" />')),
        makeWebpChunk("VP8L", Uint8Array.from([0x2f, 0x02, 0x40, 0x00, 0x00])),
    ];
    const payload = concatBytes(asciiBytes("WEBP"), ...chunks);
    const output = new Uint8Array(payload.length + 8);
    output.set(asciiBytes("RIFF"), 0);
    new DataView(output.buffer).setUint32(4, payload.length, true);
    output.set(payload, 8);
    return output;
}

function bytesForChunk(bytes, parser, type) {
    const chunk = parser(bytes).find((entry) => entry.type === type);
    return chunk ? bytes.slice(chunk.dataStart, chunk.dataEnd) : null;
}

function indexOfSequence(bytes, sequence) {
    outer: for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
        for (let offset = 0; offset < sequence.length; offset += 1) {
            if (bytes[index + offset] !== sequence[offset]) continue outer;
        }
        return index;
    }
    return -1;
}

test("EXIF ve GPS içeren JPEG analiz edilir ve scan verisi değişmeden temizlenir", () => {
    const source = createJpeg();
    const analysis = core.inspect(source);
    assert.equal(analysis.format, "jpeg");
    assert.deepEqual([analysis.width, analysis.height], [3, 2]);
    assert.equal(analysis.orientation, 6);
    assert.equal(analysis.gps, true);
    assert.ok(analysis.metadata.some((field) => field.key === "camera-make" && field.value === "Canon"));
    assert.ok(analysis.metadata.some((field) => field.key === "gps-coordinates"));
    assert.ok(analysis.metadata.some((field) => field.group === "XMP"));
    assert.ok(analysis.metadata.some((field) => field.group === "IPTC"));
    assert.ok(analysis.metadata.some((field) => field.key === "icc-profile"));

    const cleaned = core.clean(source);
    const output = new Uint8Array(cleaned.output);
    assert.equal(cleaned.lossless, true);
    assert.equal(cleaned.gpsRemoved, true);
    assert.ok(cleaned.removedCount >= 10);
    assert.equal(cleaned.after.removableCount, 0);
    assert.equal(cleaned.after.gps, false);
    assert.equal(cleaned.after.orientation, 6);
    assert.deepEqual([cleaned.after.width, cleaned.after.height], [3, 2]);
    assert.ok(cleaned.after.metadata.some((field) => field.key === "icc-profile"));

    const sos = Uint8Array.from([0xff, 0xda]);
    const sourceScan = source.slice(indexOfSequence(source, sos));
    const outputScan = output.slice(indexOfSequence(output, sos));
    assert.deepEqual(outputScan, sourceScan);
});

test("Photoshop/editor metadata içeren JPEG APP13 ve XMP alanlarını kaldırır", () => {
    const result = core.clean(createJpeg({ metadata: true, photoshop: true }));
    assert.equal(result.after.metadata.some((field) => field.group === "IPTC" || field.group === "XMP"), false);
    assert.equal(result.after.removableCount, 0);
});

test("metadata bulunmayan JPEG byte-for-byte aynı kalır", () => {
    const source = createJpeg({ metadata: false, photoshop: false });
    const analysis = core.inspect(source);
    assert.equal(analysis.metadataCount, 0);
    const result = core.clean(source);
    assert.deepEqual(new Uint8Array(result.output), source);
});

test("PNG metin ve EXIF chunk'larını kaldırırken IDAT ve ICC profilini korur", () => {
    const source = createPng();
    const analysis = core.inspect(source);
    assert.equal(analysis.format, "png");
    assert.equal(analysis.gps, true);
    assert.ok(analysis.metadata.some((field) => field.group === "XMP"));
    assert.deepEqual([analysis.width, analysis.height], [3, 2]);
    const sourceIdat = bytesForChunk(source, parsePngChunks, "IDAT");
    const result = core.clean(source);
    const output = new Uint8Array(result.output);
    assert.deepEqual(bytesForChunk(output, parsePngChunks, "IDAT"), sourceIdat);
    assert.equal(result.after.removableCount, 0);
    assert.equal(result.after.gps, false);
    assert.equal(result.after.orientation, 6);
    assert.ok(parsePngChunks(output).some((chunk) => chunk.type === "iCCP"));
    assert.equal(parsePngChunks(output).some((chunk) => ["tEXt", "iTXt"].includes(chunk.type)), false);
});

test("WebP EXIF/XMP temizlenirken VP8 görüntü chunk'ı değişmez", () => {
    const source = createWebp();
    const analysis = core.inspect(source);
    assert.equal(analysis.format, "webp");
    assert.deepEqual([analysis.width, analysis.height], [3, 2]);
    assert.equal(analysis.gps, true);
    const sourcePixels = bytesForChunk(source, parseWebpChunks, "VP8L");
    const result = core.clean(source);
    const output = new Uint8Array(result.output);
    assert.deepEqual(bytesForChunk(output, parseWebpChunks, "VP8L"), sourcePixels);
    assert.equal(result.after.removableCount, 0);
    assert.equal(result.after.gps, false);
    assert.ok(parseWebpChunks(output).some((chunk) => chunk.type === "ICCP"));
    assert.equal(parseWebpChunks(output).some((chunk) => chunk.type === "XMP "), false);
});

test("çok büyük çözünürlük değeri decode/re-encode olmadan korunur", () => {
    const source = createPng({ metadata: true, width: 100000, height: 80000 });
    const result = core.clean(source);
    assert.deepEqual([result.before.width, result.before.height], [100000, 80000]);
    assert.deepEqual([result.after.width, result.after.height], [100000, 80000]);
});

test("bozuk dosya ve tanınmayan içerik güvenli hata üretir", () => {
    const corruptPng = createPng();
    corruptPng[corruptPng.length - 1] ^= 0xff;
    assert.throws(() => core.inspect(corruptPng), /bütünlük|bozuk|geçersiz/i);
    assert.throws(() => core.inspect(Uint8Array.from([1, 2, 3, 4])), /Desteklenmeyen|tanınmayan/i);
    assert.throws(() => core.inspect(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 50])), /sınır|eksik|bitiş/i);
});

test("dosya uzantısından bağımsız olarak imza ile format algılanır", () => {
    assert.equal(core.sniffFormat(createJpeg()), "jpeg");
    assert.equal(core.sniffFormat(createPng()), "png");
    assert.equal(core.sniffFormat(createWebp()), "webp");
});

test("on fotoğraf arka arkaya temizlenebilir", () => {
    const results = Array.from({ length: 10 }, () => core.clean(createJpeg()));
    assert.equal(results.length, 10);
    assert.ok(results.every((result) => result.after.removableCount === 0 && result.lossless));
});

test("toplu çıktılar bağımlılıksız, geçerli ZIP kayıtlarına yazılır", () => {
    const first = core.clean(createJpeg()).output;
    const second = core.clean(createPng()).output;
    const zip = new Uint8Array(core.createZip([
        { name: "bir-clean.jpg", buffer: first, lastModified: Date.UTC(2026, 7, 7) },
        { name: "iki-clean.png", buffer: second, lastModified: Date.UTC(2026, 7, 7) },
    ]));
    const view = new DataView(zip.buffer);
    assert.equal(view.getUint32(0, true), 0x04034b50);
    assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
    assert.equal(view.getUint16(zip.length - 12, true), 2);
    assert.ok(indexOfSequence(zip, asciiBytes("bir-clean.jpg")) >= 0);
    assert.ok(indexOfSequence(zip, asciiBytes("iki-clean.png")) >= 0);
});
