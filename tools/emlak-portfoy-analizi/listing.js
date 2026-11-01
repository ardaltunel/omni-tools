(function initRealEstateListing(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.RealEstateListing = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateListing() {
    "use strict";

    const HOSTS = new Set(["sahibinden.com", "www.sahibinden.com", "m.sahibinden.com", "shbd.io"]);
    const MAX_TEXT_LENGTH = 100000;
    const LABELS = {
        price: "(?:Fiyat|Satış fiyatı|İlan fiyatı|Aylık kira)",
        grossArea: "(?:m[²2]\\s*\\(Brüt\\)|Brüt\\s*(?:m[²2]|alan))",
        netArea: "(?:m[²2]\\s*\\(Net\\)|Net\\s*(?:m[²2]|alan))",
        totalArea: "(?:Toplam\\s*(?:alan|m[²2])|Arsa\\s*(?:alanı|m[²2])|Yüzölçümü)",
        roomCount: "Oda\\s*(?:sayısı|sayisi)",
        buildingAge: "Bina\\s*yaşı",
        floor: "(?:Bulunduğu\\s*kat|Bulundugu\\s*kat|Kat(?!\\s*say))",
        totalFloors: "(?:Kat\\s*sayısı|Toplam\\s*kat)",
        dues: "Aidat(?:\\s*\\(TL\\))?",
        monthlyRent: "(?:Tahmini\\s*(?:aylık\\s*)?kira|Kira\\s*getirisi)",
        blockNo: "Ada(?:\\s*(?:no|numarası))?",
        parcelNo: "Parsel(?:\\s*(?:no|numarası))?",
        floorAreaRatio: "(?:Kaks(?:\\s*\\(Emsal\\))?|Emsal(?:\\s*\\/\\s*KAKS)?)",
        zoningStatus: "İmar\\s*durumu",
        titleDeedType: "(?:Tapu\\s*(?:durumu|niteliği|türü))",
        location: "(?:Konum|Lokasyon|Adres|İl\\s*\\/\\s*İlçe\\s*\\/\\s*Mahalle)",
        propertyType: "(?:Emlak\\s*tipi|Gayrimenkul\\s*türü|Mülk\\s*türü)",
    };

    function normalizeUrl(value) {
        const raw = String(value || "").trim();
        if (!raw || raw.length > 2048) throw new Error("Geçerli bir Sahibinden ilan bağlantısı girin.");
        if (/[\u0000-\u0020\\]/.test(raw) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$|\?)/i.test(raw)) throw new Error("İlan bağlantısı geçerli değil.");
        let url;
        try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`); }
        catch { throw new Error("İlan bağlantısı geçerli değil."); }
        if (url.protocol !== "https:" || url.username || url.password || url.port || !HOSTS.has(url.hostname)) {
            throw new Error("Yalnızca https Sahibinden ve shbd.io ilan bağlantıları destekleniyor.");
        }
        const path = url.pathname;
        const supported = url.hostname === "shbd.io"
            ? /^\/(?:s\/)?[a-zA-Z0-9_-]{3,100}\/?$/.test(path)
            : /^\/ilan\/[^/]+(?:\/detay)?\/?$/.test(path) || /^\/s\/[a-zA-Z0-9_-]{3,100}\/?$/.test(path);
        if (!supported) throw new Error("Arama veya kategori sayfası yerine tek bir ilanın bağlantısını girin.");
        url.search = "";
        url.hash = "";
        return url.href;
    }

    function decodeEntities(value) {
        const names = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", sup2: "²", lira: "₺" };
        return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, name) => {
            if (name[0] !== "#") return names[name.toLowerCase()] ?? entity;
            const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
        });
    }

    function stripHtml(html) {
        return decodeEntities(String(html).replace(/<!--[\s\S]*?-->/g, " ")
            .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
            .replace(/<\/?(?:div|li|tr|td|th|p|h[1-6]|br|section|dt|dd|ul|ol)\b[^>]*>/gi, "\n")
            .replace(/<[^>]+>/g, " "));
    }

    function number(value) {
        const match = String(value ?? "").trim().match(/^([\d][\d., ]*)/);
        if (!match) return null;
        let text = match[1].trim().replace(/\s/g, "");
        if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
        else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replace(/,/g, "");
        else text = text.replace(",", ".");
        const result = Number(text);
        return Number.isFinite(result) && result >= 0 ? result : null;
    }

    function findLabel(text, label, includeCurrency = false) {
        const nextCurrency = includeCurrency ? "(?:\\n\\s*((?:USD|EUR|GBP|CHF|JPY|CAD|AUD|RUB|AED|SAR|KWD|TRY|TL|[$€£₺]|Amerikan Doları|Dolar|Euro|Sterlin))(?=\\s|$))?" : "";
        const match = text.match(new RegExp(`(?:^|[\\n\\t ])${label}\\s*[:：]?\\s*([^\\n]+)${nextCurrency}`, "iu"));
        if (!match) return null;
        const value = match[1].trim().split(new RegExp(`\\s+(?:${Object.values(LABELS).join("|")})\\s*[:：]`, "iu"))[0].trim();
        return `${value}${match[2] ? ` ${match[2]}` : ""}`;
    }

    function propertyType(value) {
        const text = String(value).toLocaleLowerCase("tr-TR");
        const types = [
            [/\btarla\b/u, "Tarla"], [/\barsa\b/u, "Arsa"], [/müstakil|mustakil/u, "Müstakil Ev"],
            [/rezidans|residence/u, "Rezidans"], [/villa/u, "Villa"], [/daire|apartment/u, "Daire"],
            [/dükkan|dukkan|mağaza/u, "Dükkan"], [/ofis|büro/u, "Ofis"], [/depo/u, "Depo"], [/işyeri|iş yeri/u, "İşyeri"],
        ];
        return types.find(([pattern]) => pattern.test(text))?.[1];
    }

    function finish(fields, title, sourceUrl, warnings = []) {
        return { fields, title: String(title || "").slice(0, 240), sourceUrl: sourceUrl || "", extractedFields: Object.keys(fields), warnings };
    }

    function parseText(value, options = {}) {
        const original = String(value || "").slice(0, MAX_TEXT_LENGTH);
        const text = (/<(?:html|div|li|p|h1|table)\b/i.test(original) ? stripHtml(original) : decodeEntities(original))
            .replace(/\r/g, "").replace(/[\u200b-\u200f\ufeff]/g, "").replace(/[^\S\n]+/g, " ").replace(/\n[ \n]+/g, "\n").trim();
        const fields = {};
        const warnings = [];
        const title = text.split("\n").find((line) => line.trim().length > 3) || "";
        const typeText = findLabel(text, LABELS.propertyType);
        const detectedType = propertyType(typeText || title);
        if (detectedType) fields.propertyType = detectedType;
        const transactionText = `${typeText || ""} ${title}`;
        if (/kiralık|kiralik/iu.test(transactionText)) fields.transactionType = "rent";
        else if (/satılık|satilik/iu.test(transactionText)) fields.transactionType = "sale";

        const numeric = ["price", "grossArea", "netArea", "buildingAge", "totalFloors", "dues", "monthlyRent", "floorAreaRatio"];
        if (["Arsa", "Tarla"].includes(fields.propertyType)) numeric.push("totalArea");
        numeric.forEach((name) => {
            const isMoney = ["price", "monthlyRent", "dues"].includes(name);
            const raw = findLabel(text, LABELS[name], isMoney);
            if (raw === null) return;
            if (isMoney && /\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|RUB|AED|SAR|KWD)\b|[$€£]|Dolar|Euro|Sterlin/iu.test(raw)) {
                warnings.push("Döviz cinsinden verilen tutarı TL olarak kendiniz girin.");
                return;
            }
            if (name === "buildingAge" && /\d+\s*[-–]\s*\d+/.test(raw)) {
                warnings.push("İlandaki bina yaşı aralık olarak verilmiş; kesin yaş alanını kontrol edin.");
                return;
            }
            const parsed = number(raw);
            if (parsed !== null) fields[name] = parsed;
        });
        if (["Arsa", "Tarla"].includes(fields.propertyType) && fields.totalArea === undefined) {
            const area = text.match(/(?:^|\n)\s*m[²2]\s*:?\s*([\d][\d., ]*)/iu);
            const parsed = area ? number(area[1]) : null;
            if (parsed !== null) fields.totalArea = parsed;
        }
        ["blockNo", "parcelNo", "zoningStatus", "titleDeedType", "location"].forEach((name) => {
            const raw = findLabel(text, LABELS[name]);
            if (raw !== null && raw !== "Belirtilmemiş" && raw !== "-") fields[name] = raw.slice(0, 180);
        });
        const room = findLabel(text, LABELS.roomCount)?.match(/^\d+(?:[.,]\d+)?\s*\+\s*\d+/);
        if (room) fields.roomCount = room[0].replace(/\s/g, "").replace(",", ".");
        const floor = findLabel(text, LABELS.floor);
        if (floor && (/^\d{1,2}(?:\+)?$/.test(floor) || /^(?:Bodrum|Bahçe Katı|Zemin|Yüksek Giriş|Giriş Katı|Kot \d+)$/iu.test(floor))) fields.floor = floor;
        if (fields.price === undefined) {
            const lines = text.split("\n");
            const otherAmount = /aidat|depozito|hizmet bedeli|komisyon|tahmini.*kira|kira getirisi|m[²2].*fiyat|masraf|gider/iu;
            for (let index = 0; index < lines.length; index += 1) {
                const price = lines[index].match(/^\s*([\d][\d. ,]*?)\s*(?:TL|₺)\s*$/iu);
                if (!price || otherAmount.test(lines[index - 1] || "")) continue;
                const parsed = number(price[1]);
                if (parsed !== null) { fields.price = parsed; break; }
            }
        }
        if (fields.grossArea === undefined && !["Arsa", "Tarla"].includes(fields.propertyType)) {
            const area = title.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*m[²2](?:\s|$)/iu);
            if (area) warnings.push("Başlıktaki alanın net veya brüt olduğu belirtilmemiş; alan bilgisini kontrol edin.");
        }
        if (original.length >= MAX_TEXT_LENGTH) warnings.push("Uzun metnin yalnızca ilk 100.000 karakteri okundu.");
        return finish(fields, title, options.sourceUrl, warnings);
    }

    function parseHtml(html, options = {}) {
        const source = String(html || "");
        const titleMatch = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) || source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]).trim().slice(0, 240) : "";
        const result = parseText(`${title}\n${stripHtml(source)}`, options);
        if (title) result.title = title;
        for (const match of source.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/gi)) {
            const price = stripHtml(match[1]).trim().match(/^([\d][\d. ,]*?)\s*(?:TL|₺)(?:\s|$)/iu);
            if (price && number(price[1]) !== null) { result.fields.price = number(price[1]); break; }
        }
        const structured = [];
        for (const match of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
            try {
                const data = JSON.parse(match[1]);
                const queue = Array.isArray(data) ? [...data] : [data];
                while (queue.length && structured.length < 100) {
                    const item = queue.shift();
                    if (!item || typeof item !== "object") continue;
                    structured.push(item);
                    if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
                    if (item.mainEntity && typeof item.mainEntity === "object") queue.push(item.mainEntity);
                }
            } catch { /* Malformed site metadata does not prevent text extraction. */ }
        }
        const item = structured.find((entry) => /Product|Apartment|House|Residence|SingleFamilyResidence|RealEstateListing/i.test(String(entry["@type"]))) || {};
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        const currency = String(offers?.priceCurrency || "").toUpperCase();
        if (offers?.price !== undefined && ["TRY", "TL"].includes(currency)) {
            const parsed = number(offers.price);
            if (parsed !== null) result.fields.price = parsed;
        } else if (currency && !["TRY", "TL"].includes(currency)) {
            delete result.fields.price;
            result.warnings.push("İlan fiyatı TL cinsinden değil; TL karşılığını kendiniz girin.");
        }
        if (!result.fields.propertyType) {
            const type = propertyType(`${item.name || ""} ${result.title}`);
            if (type) result.fields.propertyType = type;
        }
        if (item.address && typeof item.address === "object") {
            const address = [item.address.addressRegion, item.address.addressLocality, item.address.streetAddress].filter((part) => typeof part === "string" && part.trim());
            if (address.length) result.fields.location = address.join(" / ").slice(0, 180);
        }
        if (!result.fields.transactionType) {
            if (/kiralık|kiralik/iu.test(result.title)) result.fields.transactionType = "rent";
            else if (/satılık|satilik/iu.test(result.title)) result.fields.transactionType = "sale";
        }
        result.extractedFields = Object.keys(result.fields);
        return result;
    }

    return Object.freeze({ normalizeUrl, parseText, parseHtml });
}));
