(function initMetaTagGeneratorCore(root) {
    "use strict";

    const LANGUAGES = Object.freeze([
        { value: "tr", label: "Türkçe", locale: "tr_TR" },
        { value: "en", label: "English", locale: "en_US" },
        { value: "de", label: "Deutsch", locale: "de_DE" },
        { value: "fr", label: "Français", locale: "fr_FR" },
        { value: "es", label: "Español", locale: "es_ES" },
        { value: "it", label: "Italiano", locale: "it_IT" },
        { value: "pt", label: "Português", locale: "pt_PT" },
    ]);
    const OG_TYPES = Object.freeze(["website", "article", "profile", "product"]);
    const TWITTER_CARDS = Object.freeze(["summary", "summary_large_image"]);
    const ROBOTS_VALUES = Object.freeze(["index", "noindex", "follow", "nofollow", "noarchive", "nosnippet", "noimageindex"]);

    function escapeHtmlAttribute(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function validateHttpUrl(value, message = "Geçerli bir HTTP veya HTTPS URL’si girin.") {
        const input = String(value || "").trim();
        if (!input) return { valid: false, empty: true, error: message };
        try {
            const url = new URL(input);
            if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return { valid: false, error: message };
            return { valid: true, value: url.href, hostname: url.hostname, origin: url.origin };
        } catch {
            return { valid: false, error: message };
        }
    }

    function validateThemeColor(value) {
        const color = String(value || "").trim();
        return /^#[0-9a-f]{6}$/iu.test(color)
            ? { valid: true, value: color.toUpperCase() }
            : { valid: false, error: "Tema rengi #RRGGBB biçiminde olmalıdır." };
    }

    function normalizeTwitterHandle(value) {
        const input = String(value || "").trim();
        if (!input) return { valid: true, value: "" };
        const handle = input.replace(/^@/u, "");
        return /^[A-Za-z0-9_]{1,15}$/u.test(handle)
            ? { valid: true, value: `@${handle}` }
            : { valid: false, value: input, error: "Twitter/X kullanıcı adı yalnızca harf, rakam ve alt çizgi içermelidir." };
    }

    function normalizeRobots(values) {
        const source = Array.from(new Set((Array.isArray(values) ? values : []).filter((value) => ROBOTS_VALUES.includes(value))));
        const output = source.filter((value) => !["index", "noindex", "follow", "nofollow"].includes(value));
        if (source.includes("noindex")) output.unshift("noindex");
        else if (source.includes("index")) output.unshift("index");
        if (source.includes("nofollow")) output.splice(Math.min(1, output.length), 0, "nofollow");
        else if (source.includes("follow")) output.splice(Math.min(1, output.length), 0, "follow");
        return output;
    }

    function normalizeData(data = {}) {
        const language = LANGUAGES.find((item) => item.value === data.language) || LANGUAGES[0];
        const pageUrl = validateHttpUrl(data.pageUrl);
        const canonical = String(data.canonical || "").trim() ? validateHttpUrl(data.canonical) : { valid: true, value: "" };
        const imageUrl = String(data.imageUrl || "").trim() ? validateHttpUrl(data.imageUrl, "Geçerli bir görsel URL’si girin.") : { valid: true, value: "" };
        const themeColor = validateThemeColor(data.themeColor || "#111827");
        const twitterSite = normalizeTwitterHandle(data.twitterSite);
        const twitterCreator = normalizeTwitterHandle(data.twitterCreator);
        return {
            title: String(data.title || "").trim(),
            description: String(data.description || "").trim(),
            pageUrl: pageUrl.valid ? pageUrl.value : String(data.pageUrl || "").trim(),
            siteName: String(data.siteName || "").trim(),
            author: String(data.author || "").trim(),
            keywords: String(data.keywords || "").split(",").map((item) => item.trim()).filter(Boolean).join(", "),
            language: language.value,
            locale: language.locale,
            canonical: canonical.valid ? canonical.value : String(data.canonical || "").trim(),
            themeColor: themeColor.valid ? themeColor.value : String(data.themeColor || "").trim(),
            robots: normalizeRobots(data.robots),
            socialTitle: String(data.socialTitle || "").trim() || String(data.title || "").trim(),
            socialDescription: String(data.socialDescription || "").trim() || String(data.description || "").trim(),
            imageUrl: imageUrl.valid ? imageUrl.value : String(data.imageUrl || "").trim(),
            ogType: OG_TYPES.includes(data.ogType) ? data.ogType : "website",
            twitterCard: TWITTER_CARDS.includes(data.twitterCard) ? data.twitterCard : "summary_large_image",
            twitterSite: twitterSite.valid ? twitterSite.value : String(data.twitterSite || "").trim(),
            twitterCreator: twitterCreator.valid ? twitterCreator.value : String(data.twitterCreator || "").trim(),
        };
    }

    function metaName(name, content) {
        return content ? `<meta name="${escapeHtmlAttribute(name)}" content="${escapeHtmlAttribute(content)}">` : "";
    }

    function metaProperty(property, content) {
        return content ? `<meta property="${escapeHtmlAttribute(property)}" content="${escapeHtmlAttribute(content)}">` : "";
    }

    function generateSeoTags(data) {
        const value = normalizeData(data);
        const lines = [];
        if (value.title) lines.push(`<title>${escapeHtmlAttribute(value.title)}</title>`);
        lines.push(metaName("description", value.description));
        lines.push(metaName("author", value.author));
        lines.push(metaName("keywords", value.keywords));
        lines.push(value.language ? `<meta http-equiv="content-language" content="${escapeHtmlAttribute(value.language)}">` : "");
        lines.push(metaName("robots", value.robots.join(", ")));
        lines.push(metaName("theme-color", value.themeColor));
        if (value.canonical) lines.push(`<link rel="canonical" href="${escapeHtmlAttribute(value.canonical)}">`);
        return lines.filter(Boolean).join("\n");
    }

    function generateOpenGraphTags(data) {
        const value = normalizeData(data);
        return [
            metaProperty("og:title", value.socialTitle),
            metaProperty("og:description", value.socialDescription),
            metaProperty("og:type", value.ogType),
            metaProperty("og:url", value.pageUrl),
            metaProperty("og:image", value.imageUrl),
            metaProperty("og:site_name", value.siteName),
            metaProperty("og:locale", value.locale),
        ].filter(Boolean).join("\n");
    }

    function generateTwitterTags(data) {
        const value = normalizeData(data);
        return [
            metaName("twitter:card", value.twitterCard),
            metaName("twitter:title", value.socialTitle),
            metaName("twitter:description", value.socialDescription),
            metaName("twitter:image", value.imageUrl),
            metaName("twitter:site", value.twitterSite),
            metaName("twitter:creator", value.twitterCreator),
        ].filter(Boolean).join("\n");
    }

    function generateMetaTags(data) {
        const seo = generateSeoTags(data);
        const openGraph = generateOpenGraphTags(data);
        const twitter = generateTwitterTags(data);
        return { seo, openGraph, twitter, all: [seo, openGraph, twitter].filter(Boolean).join("\n\n") };
    }

    function validateMetaForm(data = {}) {
        const errors = [];
        const warnings = [];
        const title = String(data.title || "").trim();
        const description = String(data.description || "").trim();
        const pageUrl = validateHttpUrl(data.pageUrl);
        const canonical = String(data.canonical || "").trim() ? validateHttpUrl(data.canonical) : { valid: true };
        const image = String(data.imageUrl || "").trim() ? validateHttpUrl(data.imageUrl, "Geçerli bir görsel URL’si girin.") : { valid: true };
        const color = validateThemeColor(data.themeColor || "");
        const siteHandle = normalizeTwitterHandle(data.twitterSite);
        const creatorHandle = normalizeTwitterHandle(data.twitterCreator);

        if (!title) errors.push("Sayfa başlığı boş bırakılamaz.");
        if (!description) errors.push("Sayfa açıklaması boş bırakılamaz.");
        if (!pageUrl.valid) errors.push("Geçerli bir sayfa URL’si girin.");
        if (!canonical.valid) errors.push("Geçerli bir canonical URL girin.");
        if (!image.valid) errors.push(image.error);
        if (!color.valid) errors.push(color.error);
        if (!siteHandle.valid) errors.push(siteHandle.error);
        if (!creatorHandle.valid) errors.push(creatorHandle.error);

        if (title && title.length < 30) warnings.push("Başlık önerilen yaklaşık uzunluğun altında.");
        if (title.length > 60) warnings.push("Başlık önerilen uzunluğun üzerinde; arama sonuçlarında kesilebilir.");
        if (description && description.length < 120) warnings.push("Açıklama önerilen yaklaşık uzunluğun altında.");
        if (description.length > 160) warnings.push("Açıklama önerilen uzunluğun üzerinde; arama sonuçlarında kesilebilir.");
        if (!String(data.canonical || "").trim()) warnings.push("Canonical URL eklenmedi.");
        if (!String(data.imageUrl || "").trim()) warnings.push("Open Graph paylaşım görseli eklenmedi.");

        const normalized = normalizeData(data);
        const checks = [
            { label: "Sayfa başlığı mevcut", passed: Boolean(title) },
            { label: "Meta açıklaması mevcut", passed: Boolean(description) },
            { label: "Sayfa URL’si geçerli", passed: pageUrl.valid },
            { label: "Canonical URL mevcut", passed: Boolean(normalized.canonical) && canonical.valid },
            { label: "Open Graph ayarlandı", passed: Boolean(normalized.socialTitle && normalized.socialDescription && pageUrl.valid) },
            { label: "Twitter/X Card ayarlandı", passed: Boolean(normalized.twitterCard && normalized.socialTitle) },
            { label: "Paylaşım görseli mevcut", passed: Boolean(normalized.imageUrl) && image.valid },
        ];
        return { valid: errors.length === 0, errors, warnings, checks, normalized };
    }

    root.MetaTagGeneratorCore = Object.freeze({
        LANGUAGES,
        OG_TYPES,
        TWITTER_CARDS,
        ROBOTS_VALUES,
        escapeHtmlAttribute,
        validateHttpUrl,
        validateThemeColor,
        normalizeTwitterHandle,
        normalizeRobots,
        normalizeData,
        generateSeoTags,
        generateOpenGraphTags,
        generateTwitterTags,
        generateMetaTags,
        validateMetaForm,
    });
}(typeof window !== "undefined" ? window : globalThis));
