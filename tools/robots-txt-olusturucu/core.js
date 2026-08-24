(function initRobotsTxtCore(root) {
    "use strict";

    const STANDARD_AGENTS = Object.freeze([
        { value: "*", label: "Tüm Botlar (*)" },
        { value: "Googlebot", label: "Googlebot" },
        { value: "Googlebot-Image", label: "Googlebot-Image" },
        { value: "Bingbot", label: "Bingbot" },
        { value: "DuckDuckBot", label: "DuckDuckBot" },
        { value: "YandexBot", label: "YandexBot" },
        { value: "Baiduspider", label: "Baiduspider" },
        { value: "Applebot", label: "Applebot" },
    ]);

    function validateHttpUrl(value) {
        const input = String(value || "").trim();
        if (!input) return { valid: false, error: "Geçerli bir HTTP veya HTTPS adresi girin." };
        try {
            const url = new URL(input);
            if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
                return { valid: false, error: "Geçerli bir HTTP veya HTTPS adresi girin." };
            }
            return { valid: true, value: url.href, origin: url.origin, hostname: url.hostname };
        } catch {
            return { valid: false, error: "Geçerli bir HTTP veya HTTPS adresi girin." };
        }
    }

    function parseLines(value) {
        return String(value || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    }

    function unique(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).filter((value) => {
            const normalized = String(value || "").trim();
            if (!normalized || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        }).map((value) => String(value).trim());
    }

    function normalizePath(value) {
        const path = String(value || "").trim();
        if (!path) return "";
        return path.startsWith("/") ? path : `/${path}`;
    }

    function duplicateCount(values) {
        const list = (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean);
        return list.length - unique(list).length;
    }

    function normalizeGroup(group = {}) {
        const userAgents = unique(group.userAgents);
        const allowRaw = Array.isArray(group.allow) ? group.allow : parseLines(group.allow);
        const disallowRaw = Array.isArray(group.disallow) ? group.disallow : parseLines(group.disallow);
        const delayValue = String(group.crawlDelay ?? "").trim();
        const crawlDelay = delayValue === "" ? null : Number(delayValue);
        return {
            id: String(group.id || ""),
            userAgents,
            allow: unique(allowRaw.map(normalizePath)),
            disallow: unique(disallowRaw.map(normalizePath)),
            crawlDelay,
            includeEmptyDisallow: Boolean(group.includeEmptyDisallow),
        };
    }

    function generateRobots(groups, sitemaps = []) {
        const normalizedGroups = (Array.isArray(groups) ? groups : []).map(normalizeGroup).filter((group) => group.userAgents.length);
        if (!normalizedGroups.length) throw new Error("En az bir bot grubu ve user-agent seçin.");

        const blocks = normalizedGroups.map((group) => {
            const lines = group.userAgents.map((agent) => `User-agent: ${agent}`);
            group.allow.forEach((path) => lines.push(`Allow: ${path}`));
            group.disallow.forEach((path) => lines.push(`Disallow: ${path}`));
            if (!group.allow.length && !group.disallow.length && group.includeEmptyDisallow) lines.push("Disallow:");
            if (Number.isFinite(group.crawlDelay) && group.crawlDelay >= 0) lines.push(`Crawl-delay: ${group.crawlDelay}`);
            return lines.join("\n");
        });

        const validSitemaps = unique(sitemaps).map((value) => validateHttpUrl(value)).filter((result) => result.valid).map((result) => `Sitemap: ${result.value}`);
        return blocks.concat(validSitemaps.length ? [validSitemaps.join("\n")] : []).join("\n\n").trim();
    }

    function validateConfiguration(configuration = {}) {
        const errors = [];
        const warnings = [];
        const siteResult = validateHttpUrl(configuration.siteUrl);
        if (!siteResult.valid) errors.push(siteResult.error);

        const groups = Array.isArray(configuration.groups) ? configuration.groups : [];
        if (!groups.length) errors.push("En az bir bot grubu ekleyin.");
        groups.forEach((source, index) => {
            const group = normalizeGroup(source);
            const name = `${index + 1}. bot grubu`;
            if (!group.userAgents.length) errors.push(`${name} için en az bir user-agent seçin.`);
            if (group.crawlDelay !== null && (!Number.isFinite(group.crawlDelay) || group.crawlDelay < 0)) errors.push(`${name} için crawl-delay sıfır veya daha büyük olmalıdır.`);
            if (duplicateCount(Array.isArray(source.allow) ? source.allow : parseLines(source.allow))) warnings.push(`${name} içindeki tekrar eden Allow kuralları tekilleştirildi.`);
            if (duplicateCount(Array.isArray(source.disallow) ? source.disallow : parseLines(source.disallow))) warnings.push(`${name} içindeki tekrar eden Disallow kuralları tekilleştirildi.`);
            const conflicts = group.allow.filter((path) => group.disallow.includes(path));
            if (conflicts.length) warnings.push(`${name} içinde hem izin verilen hem engellenen yollar var: ${conflicts.join(", ")}`);
            if (group.userAgents.includes("*") && group.disallow.includes("/")) warnings.push("Dikkat: Bu ayar tüm arama motorlarının sitenizi taramasını engeller.");
            if (!group.allow.length && !group.disallow.length && group.crawlDelay === null && !group.includeEmptyDisallow) warnings.push(`${name} herhangi bir erişim kuralı içermiyor.`);
        });

        const sitemapLines = unique(configuration.sitemaps || []);
        sitemapLines.forEach((sitemap) => {
            const result = validateHttpUrl(sitemap);
            if (!result.valid) errors.push(`Geçersiz sitemap adresi: ${sitemap}`);
            else if (siteResult.valid && result.hostname !== siteResult.hostname) warnings.push(`Sitemap adresi site alan adıyla eşleşmiyor: ${sitemap}`);
        });
        if (duplicateCount(configuration.sitemaps || [])) warnings.push("Tekrar eden sitemap adresleri tekilleştirildi.");

        return { valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), site: siteResult };
    }

    function createSitemapSuggestion(siteUrl) {
        const result = validateHttpUrl(siteUrl);
        return result.valid ? `${result.origin}/sitemap.xml` : "";
    }

    root.RobotsTxtCore = Object.freeze({
        STANDARD_AGENTS,
        validateHttpUrl,
        parseLines,
        unique,
        normalizePath,
        normalizeGroup,
        generateRobots,
        validateConfiguration,
        createSitemapSuggestion,
    });
}(typeof window !== "undefined" ? window : globalThis));
