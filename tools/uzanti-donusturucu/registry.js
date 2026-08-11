(function initConverterRegistry(root) {
    "use strict";

    const namespace = root.OmniConverter = root.OmniConverter || {};
    const categories = new Map();

    function register(category) {
        if (!category || !category.id || categories.has(category.id)) {
            throw new Error("Dönüştürücü kategorisi kaydedilemedi.");
        }
        categories.set(category.id, Object.freeze(category));
        return category;
    }

    function get(categoryId) {
        return categories.get(categoryId) || null;
    }

    function list() {
        return Array.from(categories.values());
    }

    function defaultSettings(categoryId) {
        const category = get(categoryId);
        if (!category) return {};
        return Object.fromEntries(category.settings.map((field) => [field.key, field.defaultValue]));
    }

    const select = (key, label, defaultValue, options) => ({ key, label, type: "select", defaultValue, options });
    const range = (key, label, defaultValue, min, max, step, suffix = "") => ({ key, label, type: "range", defaultValue, min, max, step, suffix });
    const toggle = (key, label, description, defaultValue) => ({ key, label, description, type: "toggle", defaultValue });
    const option = (value, label = value) => ({ value, label });
    const recommended = (value, label = value) => option(value, label);

    register({
        id: "image",
        adapterId: "image",
        label: "Görsel",
        icon: "🖼",
        description: "Görselleri kalite ve şeffaflık seçenekleriyle tarayıcıda dönüştür.",
        accept: ".jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.avif,.ico,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/svg+xml,image/avif,image/x-icon,image/tiff,image/heic,image/heif",
        inputFormats: ["JPG", "JPEG", "PNG", "WEBP", "GIF", "BMP", "SVG", "AVIF", "ICO", "TIFF", "HEIC"],
        outputFormats: ["PNG", "JPG", "WEBP", "BMP", "ICO", "SVG"],
        ready: true,
        capabilityTitle: "Tarayıcıda hazır",
        capabilityText: "Görseller cihazınızdan ayrılmadan Canvas ve tarayıcının yerel görsel çözücüsüyle işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "image/jpeg", [
                option("image/png", "PNG"), recommended("image/jpeg", "JPG"), option("image/webp", "WEBP"),
                option("image/bmp", "BMP"), option("image/x-icon", "ICO"), option("image/svg+xml", "SVG"),
            ]),
            range("quality", "Kalite", 100, 0, 100, 1, "%"),
            toggle("preserveTransparency", "Şeffaflığı koru", "Destekleyen çıkışlarda saydam alanları korur.", true),
        ],
    });

    register({
        id: "audio",
        adapterId: "ffmpeg",
        label: "Ses",
        icon: "🎵",
        description: "Ses biçimi, bit hızı, kanal ve örnekleme hızını düzenle.",
        accept: ".mp3,.wav,.flac,.aac,.m4a,.ogg,.opus,.aiff,.aif,.amr,.wma,audio/*",
        inputFormats: ["MP3", "WAV", "FLAC", "AAC", "M4A", "OGG", "OPUS", "AIFF", "AMR", "WMA"],
        outputFormats: ["MP3", "WAV", "FLAC", "AAC", "M4A", "OGG", "AIFF", "WMA"],
        ready: true,
        capabilityTitle: "FFmpeg ile tarayıcıda hazır",
        capabilityText: "Ses dönüşümleri cihazınızdan ayrılmadan yerel FFmpeg çekirdeğinde işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "mp3", [recommended("mp3", "MP3"), ...["WAV", "FLAC", "AAC", "M4A", "OGG", "AIFF", "WMA"].map((value) => option(value.toLowerCase(), value))]),
            select("bitrate", "Bit Hızı", "auto", [recommended("auto", "Otomatik"), ...["96", "128", "192", "256", "320"].map((value) => option(value, `${value} kbps`))]),
            select("channels", "Kanal", "original", [recommended("original", "Özgün"), option("mono", "Mono"), option("stereo", "Stereo")]),
            select("sampleRate", "Örnekleme Hızı", "original", [recommended("original", "Özgün"), option("44100", "44,1 kHz"), option("48000", "48 kHz"), option("96000", "96 kHz")]),
        ],
    });

    register({
        id: "video",
        adapterId: "ffmpeg",
        label: "Video",
        icon: "🎬",
        description: "Video kodlayıcı, çözünürlük, kare hızı ve bit hızı ayarlarını tek yerde yönet.",
        accept: ".mp4,.avi,.mkv,.mov,.webm,.flv,.wmv,.mpeg,.mpg,.m4v,.3gp,video/*",
        inputFormats: ["MP4", "AVI", "MKV", "MOV", "WEBM", "FLV", "WMV", "MPEG", "M4V", "3GP"],
        outputFormats: ["MP4", "AVI", "MKV", "MOV", "MPEG", "M4V", "3GP"],
        codecCompatibility: Object.freeze({
            mp4: ["h264"],
            m4v: ["h264"],
            mov: ["h264"],
            mkv: ["h264"],
            avi: ["h264"],
            mpeg: ["h264"],
            "3gp": ["h264"],
        }),
        ready: true,
        capabilityTitle: "FFmpeg ile tarayıcıda hazır",
        capabilityText: "Video dönüşümleri cihazınızdan ayrılmadan yerel FFmpeg çekirdeğinde işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "mp4", [recommended("mp4", "MP4"), ...["AVI", "MKV", "MOV", "MPEG", "M4V", "3GP"].map((value) => option(value.toLowerCase(), value))]),
            select("codec", "Kodlayıcı", "h264", [recommended("h264", "H.264")]),
            select("videoQuality", "Video Kalitesi", "auto", [recommended("auto", "Otomatik"), option("high", "Yüksek"), option("balanced", "Dengeli"), option("compact", "Küçük Dosya")]),
            select("fps", "Kare Hızı", "original", [recommended("original", "Özgün"), option("24", "24"), option("30", "30"), option("60", "60")]),
            select("videoBitrate", "Video Bit Hızı", "auto", [recommended("auto", "Otomatik"), option("2", "2 Mbps"), option("5", "5 Mbps"), option("10", "10 Mbps")]),
            select("resolution", "Çözünürlük", "original", [recommended("original", "Özgün"), option("2160", "2160p"), option("1080", "1080p"), option("720", "720p"), option("480", "480p")]),
            select("audioBitrate", "Ses Bit Hızı", "auto", [recommended("auto", "Otomatik"), ...["128", "192", "256", "320"].map((value) => option(value, `${value} kbps`))]),
        ],
    });

    register({
        id: "document",
        adapterId: "libreoffice-wasm",
        label: "Belge",
        icon: "📄",
        description: "Ofis belgeleri, metin ve tablo biçimleri için dönüşüm ayarları.",
        accept: ".pdf,.doc,.docx,.odt,.rtf,.txt,.html,.htm,.md,.markdown,.csv,.xlsx,.ods",
        inputFormats: ["PDF", "DOC", "DOCX", "ODT", "RTF", "TXT", "HTML", "MARKDOWN", "CSV", "XLSX", "ODS"],
        outputFormats: ["PDF", "DOCX", "ODT", "RTF", "TXT", "HTML", "CSV", "XLSX", "ODS"],
        ready: true,
        capabilityTitle: "LibreOffice ile tarayıcıda hazır",
        capabilityText: "Belgeler cihazınızdan ayrılmadan yerel LibreOffice WebAssembly çekirdeğinde işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "pdf", [recommended("pdf", "PDF"), ...["DOCX", "ODT", "RTF", "TXT", "HTML", "CSV", "XLSX", "ODS"].map((value) => option(value.toLowerCase(), value))]),
            select("pageSize", "Sayfa Boyutu", "original", [recommended("original", "Özgün"), option("a4", "A4"), option("letter", "ABD Mektup")]),
            toggle("preserveLayout", "Düzeni koru", "Yazı tipleri, tablolar ve sayfa yapısını mümkün olduğunca korur.", true),
        ],
    });

    register({
        id: "archive",
        adapterId: "archive-wasm",
        label: "Arşiv",
        icon: "📦",
        description: "Arşivleri çıkart, yeniden paketle veya farklı biçimde sıkıştır.",
        accept: ".zip,.rar,.7z,.tar,.gz,.bz2,.xz,.tgz,application/zip,application/x-7z-compressed,application/x-rar-compressed",
        inputFormats: ["ZIP", "RAR", "7Z", "TAR", "GZ", "BZ2", "XZ", "TAR.GZ"],
        outputFormats: ["ZIP", "7Z", "TAR", "TAR.GZ"],
        ready: true,
        capabilityTitle: "Arşiv motoru tarayıcıda hazır",
        capabilityText: "Arşivler cihazınızdan ayrılmadan libarchive ve 7-Zip WebAssembly çekirdekleriyle işlenir.",
        settings: [
            select("operation", "İşlem", "repack", [option("compress", "Sıkıştır"), option("extract", "Çıkart"), recommended("repack", "Yeniden paketle")]),
            select("outputFormat", "Çıkış Formatı", "zip", [recommended("zip", "ZIP"), option("7z", "7Z"), option("tar", "TAR"), option("tar.gz", "TAR.GZ")]),
            select("compression", "Sıkıştırma Düzeyi", "balanced", [option("fast", "Hızlı"), recommended("balanced", "Dengeli"), option("maximum", "En yüksek")]),
        ],
    });

    register({
        id: "presentation",
        adapterId: "libreoffice-wasm",
        label: "Sunum",
        icon: "📊",
        description: "Sunum dosyalarını PDF ve açık belge biçimleri arasında dönüştür.",
        accept: ".ppt,.pptx,.odp,.pps,.ppsx,.pdf",
        inputFormats: ["PPT", "PPTX", "ODP", "PPS", "PDF"],
        outputFormats: ["PPTX", "ODP", "PDF"],
        ready: true,
        capabilityTitle: "LibreOffice ile tarayıcıda hazır",
        capabilityText: "Sunumlar cihazınızdan ayrılmadan yerel LibreOffice WebAssembly çekirdeğinde işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "pdf", [option("pptx", "PPTX"), option("odp", "ODP"), recommended("pdf", "PDF")]),
            select("slideSize", "Slayt Oranı", "original", [recommended("original", "Özgün"), option("16:9", "16:9"), option("4:3", "4:3")]),
            toggle("includeNotes", "Konuşmacı notları", "Destekleniyorsa konuşmacı notlarını çıktıya ekler.", false),
        ],
    });

    register({
        id: "font",
        adapterId: "font-wasm",
        label: "Yazı Tipi",
        icon: "🔤",
        description: "Web ve masaüstü yazı tipi biçimleri arasında dönüşüm yap.",
        accept: ".ttf,.otf,.woff,.woff2,.eot,font/*",
        inputFormats: ["TTF", "OTF", "WOFF", "WOFF2", "EOT"],
        outputFormats: ["TTF", "WOFF", "WOFF2", "EOT"],
        ready: true,
        capabilityTitle: "Yazı tipi motoru tarayıcıda hazır",
        capabilityText: "Yazı tipleri cihazınızdan ayrılmadan fonteditor-core ve yerel WOFF2 WebAssembly çekirdeğiyle işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "woff2", [option("ttf", "TTF"), option("woff", "WOFF"), recommended("woff2", "WOFF2"), option("eot", "EOT")]),
            toggle("keepMetadata", "Meta verileri koru", "Yazı tipi adı ve lisans alanlarını mümkün olduğunca korur.", true),
        ],
    });

    register({
        id: "ebook",
        adapterId: "ebook-wasm",
        label: "E-Kitap",
        icon: "📚",
        description: "E-kitap ve çizgi roman arşivlerini farklı okuyucu biçimlerine hazırla.",
        accept: ".epub,.mobi,.azw,.azw3,.fb2,.cbz,.cbr",
        inputFormats: ["EPUB", "MOBI", "AZW", "AZW3", "FB2", "CBZ", "CBR"],
        outputFormats: ["EPUB", "PDF", "HTML", "TXT", "FB2"],
        ready: true,
        capabilityTitle: "E-kitap motoru tarayıcıda hazır",
        capabilityText: "EPUB, MOBI, AZW, FB2 ve çizgi roman paketleri cihazınızdan ayrılmadan yerel olarak işlenir.",
        settings: [
            select("outputFormat", "Çıkış Formatı", "epub", [recommended("epub", "EPUB"), option("pdf", "PDF"), option("html", "HTML"), option("txt", "TXT"), option("fb2", "FB2")]),
            toggle("keepCover", "Kapağı koru", "Varsa özgün kapak görselini çıktıda tutar.", true),
            toggle("keepContents", "İçindekileri koru", "Bölüm ve içindekiler yapısını korur.", true),
        ],
    });

    namespace.Registry = Object.freeze({ register, get, list, defaultSettings });
})(window);
