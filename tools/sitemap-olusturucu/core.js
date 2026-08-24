(function initSitemapGeneratorCore(root) {
    "use strict";

    const CHANGE_FREQUENCIES = Object.freeze(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
    const MAX_SITEMAP_URLS = 50000;
    const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;
    const MAX_CLIENT_URLS = 5000;

    function validateHttpUrl(value) {
        const input = String(value || "").trim();
        if (!input) return { valid: false, error: "Geçerli bir HTTP veya HTTPS URL’si girin." };
        try {
            const url = new URL(input);
            if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
                return { valid: false, error: "Geçerli bir HTTP veya HTTPS URL’si girin." };
            }
            return {
                valid: true,
                value: url.href,
                hostname: url.hostname.toLocaleLowerCase("tr-TR"),
                origin: url.origin,
            };
        } catch {
            return { valid: false, error: "Geçerli bir HTTP veya HTTPS URL’si girin." };
        }
    }

    function parseUrlLines(value) {
        return String(value || "")
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    function collectUrls(values, existingUrls = []) {
        const lines = Array.isArray(values) ? values : parseUrlLines(values);
        const seen = new Set();
        existingUrls.forEach((value) => {
            const result = validateHttpUrl(value);
            if (result.valid) seen.add(result.value);
        });
        const valid = [];
        const invalid = [];
        const duplicates = [];

        lines.forEach((line, index) => {
            const result = validateHttpUrl(line);
            if (!result.valid) {
                invalid.push({ value: line, line: index + 1, error: result.error });
                return;
            }
            if (seen.has(result.value)) {
                duplicates.push({ value: line, normalized: result.value, line: index + 1 });
                return;
            }
            seen.add(result.value);
            valid.push(result.value);
        });
        return { valid, invalid, duplicates, total: lines.length };
    }

    function validateLastmod(value) {
        const input = String(value || "").trim();
        if (!input) return { valid: true, value: "" };
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) return { valid: false, error: "Son güncelleme tarihi YYYY-AA-GG biçiminde olmalıdır." };
        const [year, month, day] = input.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
        return isRealDate
            ? { valid: true, value: input }
            : { valid: false, error: "Geçerli bir son güncelleme tarihi girin." };
    }

    function validateChangefreq(value) {
        const input = String(value || "").trim();
        if (!input) return { valid: true, value: "" };
        return CHANGE_FREQUENCIES.includes(input)
            ? { valid: true, value: input }
            : { valid: false, error: "Geçerli bir değişim sıklığı seçin." };
    }

    function validatePriority(value) {
        const input = String(value ?? "").trim();
        if (!input) return { valid: true, value: "" };
        if (!/^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/u.test(input)) {
            return { valid: false, error: "Öncelik 0.0 ile 1.0 arasında olmalıdır." };
        }
        let normalized = input.includes(".") ? input.replace(/0+$/u, "").replace(/\.$/u, "") : input;
        if (normalized === "0" || normalized === "1") normalized += ".0";
        return { valid: true, value: normalized };
    }

    function inspectEntries(entries, options = {}) {
        const advanced = Boolean(options.advanced);
        const list = Array.isArray(entries) ? entries : [];
        const seen = new Set();
        const valid = [];
        const issues = [];

        list.forEach((entry, index) => {
            const url = validateHttpUrl(entry?.loc);
            if (!url.valid) {
                issues.push({ index, field: "loc", error: url.error });
                return;
            }
            if (seen.has(url.value)) {
                issues.push({ index, field: "loc", error: "Bu URL listede zaten bulunuyor.", duplicate: true });
                return;
            }

            const normalized = { loc: url.value };
            if (advanced) {
                const lastmod = validateLastmod(entry?.lastmod);
                const changefreq = validateChangefreq(entry?.changefreq);
                const priority = validatePriority(entry?.priority);
                for (const [field, result] of [["lastmod", lastmod], ["changefreq", changefreq], ["priority", priority]]) {
                    if (!result.valid) issues.push({ index, field, error: result.error });
                    else if (result.value) normalized[field] = result.value;
                }
                if (![lastmod, changefreq, priority].every((result) => result.valid)) return;
            }

            seen.add(url.value);
            valid.push(normalized);
        });
        return { valid, issues, total: list.length, invalidCount: issues.length };
    }

    function escapeXml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function renderNode(name, value, indent) {
        return `${indent}<${name}>${escapeXml(value)}</${name}>`;
    }

    function generateSitemap(entries, options = {}) {
        const advanced = Boolean(options.advanced);
        const inspection = inspectEntries(entries, { advanced });
        if (inspection.issues.length) throw new Error("Sitemap oluşturulmadan önce hatalı URL ve alanları düzeltin.");
        if (!inspection.valid.length) throw new Error("Sitemap oluşturmak için en az bir geçerli URL ekleyin.");
        if (inspection.valid.length > MAX_SITEMAP_URLS) throw new Error("Standart sitemap sınırı olan 50.000 URL aşıldı.");

        const lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ];
        inspection.valid.forEach((entry) => {
            lines.push("  <url>", renderNode("loc", entry.loc, "    "));
            if (advanced && entry.lastmod) lines.push(renderNode("lastmod", entry.lastmod, "    "));
            if (advanced && entry.changefreq) lines.push(renderNode("changefreq", entry.changefreq, "    "));
            if (advanced && entry.priority) lines.push(renderNode("priority", entry.priority, "    "));
            lines.push("  </url>");
        });
        lines.push("</urlset>");
        const xml = lines.join("\n");
        if (byteLength(xml) > MAX_SITEMAP_BYTES) throw new Error("Sıkıştırılmamış sitemap boyutu 50 MB sınırını aşıyor.");
        return xml;
    }

    function generateSitemapIndex(entries) {
        const inspection = inspectEntries(entries, { advanced: false });
        if (inspection.issues.length) throw new Error("Sitemap index oluşturulmadan önce hatalı URL’leri düzeltin.");
        if (!inspection.valid.length) throw new Error("Sitemap index oluşturmak için en az bir geçerli sitemap URL’si ekleyin.");
        if (inspection.valid.length > MAX_SITEMAP_URLS) throw new Error("Standart sitemap index sınırı olan 50.000 URL aşıldı.");

        const lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ];
        inspection.valid.forEach((entry) => {
            lines.push("  <sitemap>", renderNode("loc", entry.loc, "    "), "  </sitemap>");
        });
        lines.push("</sitemapindex>");
        const xml = lines.join("\n");
        if (byteLength(xml) > MAX_SITEMAP_BYTES) throw new Error("Sıkıştırılmamış sitemap index boyutu 50 MB sınırını aşıyor.");
        return xml;
    }

    function analyzeDomains(entries) {
        const domains = [];
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            const result = validateHttpUrl(entry?.loc ?? entry);
            if (result.valid && !domains.includes(result.hostname)) domains.push(result.hostname);
        });
        return {
            primaryDomain: domains[0] || "",
            domains,
            hasMultipleDomains: domains.length > 1,
        };
    }

    function buildRobotsLine(entries) {
        const first = (Array.isArray(entries) ? entries : []).map((entry) => validateHttpUrl(entry?.loc ?? entry)).find((result) => result.valid);
        return first ? `Sitemap: ${first.origin}/sitemap.xml` : "";
    }

    function byteLength(value) {
        if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(value)).byteLength;
        return unescape(encodeURIComponent(String(value))).length;
    }

    root.SitemapGeneratorCore = Object.freeze({
        CHANGE_FREQUENCIES,
        MAX_SITEMAP_URLS,
        MAX_SITEMAP_BYTES,
        MAX_CLIENT_URLS,
        validateHttpUrl,
        parseUrlLines,
        collectUrls,
        validateLastmod,
        validateChangefreq,
        validatePriority,
        inspectEntries,
        escapeXml,
        generateSitemap,
        generateSitemapIndex,
        analyzeDomains,
        buildRobotsLine,
        byteLength,
    });
}(typeof window !== "undefined" ? window : globalThis));
