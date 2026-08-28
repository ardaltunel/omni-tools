const toolNav = document.querySelector(".tool-nav");
const workspace = document.querySelector(".workspace");
const brand = document.querySelector(".brand");
sortToolNavigation();

const panels = document.querySelectorAll(".tool-panel");
const navItems = document.querySelectorAll(".nav-item");
const appHome = document.getElementById("app-home");
const defaultPageTitle = "Omni Tools | Arda Altunel";
const defaultPageDescription = document.querySelector('meta[name="description"]')?.content || "";
const defaultPageKeywords = document.querySelector('meta[name="keywords"]')?.content || "";
const defaultCanonicalUrl = document.querySelector('link[rel="canonical"]')?.href || "";
const legacyToolRoutes = Object.freeze({
    "alninda-ne-var": "nebuu",
    "discord-emoji-downloader": "discord-emoji-indir",
    "username-search": "kullanici-adi-arastirma",
    "osint-center": "osint-arastirma",
    converter: "uzanti-donusturucu",
    "metadata-cleaner": "medya-veri-temizleyici",
    "exif-viewer": "exif-veri-goruntuleme",
    milyoner: "milyoner-bilgi-yarismasi",
    weather: "weather-app",
    "deal-game": "var-misin-yok-musun",
});
const preferredToolRoutes = Object.freeze(Object.fromEntries(
    Array.from(navItems, (item) => [
        item.dataset.tool,
        createToolRouteSlug(item.querySelector("span")?.textContent || item.textContent),
    ]),
));
const preferredRouteTools = Object.freeze(Object.fromEntries(
    Object.entries(preferredToolRoutes).map(([tool, route]) => [route, tool]),
));
const appHomeCategories = Object.freeze([
    {
        id: "oyunlar",
        name: "Oyunlar",
        icon: "sports_esports",
        description: "Bulmacalar, masa oyunları ve eğlenceli meydan okumalar",
        sourceCategories: ["Oyunlar", "Oyun Yardımcısı"],
    },
    {
        id: "yapay-zeka",
        name: "Yapay Zekâ",
        icon: "auto_awesome",
        description: "Yaz, geliştir, düzelt ve fikirlerini hızlandır",
        sourceCategories: ["Yapay Zekâ"],
    },
    {
        id: "uretimlilik",
        name: "Üretkenlik",
        icon: "bolt",
        description: "Günlük işlerini daha kısa sürede tamamlayan pratik araçlar",
        sourceCategories: ["Araçlar", "Verimlilik", "Dil", "Erişilebilirlik"],
    },
    {
        id: "gelistirici",
        name: "Geliştirici & Web",
        icon: "code",
        description: "Kod, GitHub, SEO ve web projeleri için yardımcılar",
        sourceCategories: ["Geliştirici", "SEO", "Tasarım"],
    },
    {
        id: "medya",
        name: "Medya & Dosyalar",
        icon: "perm_media",
        description: "Görsel, ses ve dosya verilerini yönet",
        sourceCategories: ["Medya", "Gizlilik"],
    },
    {
        id: "guvenlik",
        name: "Güvenlik & Araştırma",
        icon: "shield",
        description: "Hesaplarını güçlendir, açık kaynak verilerini araştır",
        sourceCategories: ["Güvenlik", "OSINT"],
    },
    {
        id: "sosyal",
        name: "Sosyal Medya",
        icon: "alternate_email",
        description: "Sosyal hesaplar ve topluluklar için yardımcı araçlar",
        sourceCategories: ["Sosyal Medya"],
    },
    {
        id: "gunluk",
        name: "Finans & Günlük",
        icon: "monitoring",
        description: "Kurlar, hava durumu ve kariyer için hızlı çözümler",
        sourceCategories: ["Finans", "Hava Durumu", "Kariyer"],
    },
]);
document.body.classList.add("is-app-home");
const homeAppCards = createAppHomeCards();
initializeAppSearch(homeAppCards);

navItems.forEach((item) => item.classList.remove("active"));

navItems.forEach((item) => {
    item.addEventListener("click", () => activateTool(item.dataset.tool, { historyMode: "push" }));
});

brand?.addEventListener("click", () => clearActiveTool({ historyMode: "push" }));
brand?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    clearActiveTool({ historyMode: "push" });
});

initializeToolRouting();

function activateTool(tool, options = {}) {
    const requestedTool = tool;
    tool = resolveToolRoute(tool);
    const matchingPanel = document.getElementById(tool);
    const matchingNavItem = Array.from(navItems).find((item) => item.dataset.tool === tool);
    if (!matchingPanel || !matchingNavItem) return false;

    navItems.forEach((item) => item.classList.toggle("active", item.dataset.tool === tool));
    panels.forEach((panel) => panel.classList.toggle("active", panel.id === tool));
    if (appHome) appHome.hidden = true;
    document.body.classList.remove("is-app-home");
    document.body.classList.add("is-tool-active");
    resetToolScroll();
    updateToolHistory(tool, options.historyMode || (requestedTool !== tool ? "replace" : undefined));
    updatePageMetadata(tool);
    document.dispatchEvent(new CustomEvent("tool-activated", { detail: { tool } }));

    if (tool === "crypto" && !cryptoPricesLoaded) {
        fetchCryptoPrices();
    }
    return true;
}

function clearActiveTool(options = {}) {
    navItems.forEach((item) => item.classList.remove("active"));
    panels.forEach((panel) => panel.classList.remove("active"));
    if (appHome) appHome.hidden = false;
    document.body.classList.remove("is-tool-active");
    document.body.classList.add("is-app-home");
    resetToolScroll();
    updateToolHistory(null, options.historyMode);
    updatePageMetadata(null);
}

function resetToolScroll() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

    if (workspace) {
        workspace.scrollTo({ top: 0, left: 0, behavior });
    }

    window.scrollTo({ top: 0, left: 0, behavior });
}

function sortToolNavigation() {
    if (!toolNav) return;
    Array.from(toolNav.querySelectorAll(".nav-item"))
        .sort((a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), "tr", { sensitivity: "base" }))
        .forEach((item) => toolNav.appendChild(item));
}

function createAppHomeCards() {
    const grid = document.getElementById("app-home-grid");
    if (!grid) return [];

    const fragment = document.createDocumentFragment();
    const sectionGrids = new Map();
    const categoryCounts = new Map(appHomeCategories.map((category) => [category.id, 0]));

    appHomeCategories.forEach((category) => {
        const section = document.createElement("section");
        const heading = document.createElement("div");
        const titleGroup = document.createElement("div");
        const symbol = document.createElement("span");
        const copy = document.createElement("div");
        const title = document.createElement("h2");
        const description = document.createElement("p");
        const count = document.createElement("span");
        const cardsGrid = document.createElement("div");

        section.className = "app-home-category-section";
        section.dataset.category = category.id;
        section.id = `app-home-category-${category.id}`;
        heading.className = "app-home-category-heading";
        titleGroup.className = "app-home-category-title-group";
        symbol.className = "app-home-category-symbol";
        symbol.textContent = category.icon;
        symbol.setAttribute("aria-hidden", "true");
        title.textContent = category.name;
        description.textContent = category.description;
        count.className = "app-home-category-count";
        count.dataset.categoryCount = category.id;
        cardsGrid.className = "app-home-category-grid";

        copy.append(title, description);
        titleGroup.append(symbol, copy);
        heading.append(titleGroup, count);
        section.append(heading, cardsGrid);
        fragment.appendChild(section);
        sectionGrids.set(category.id, cardsGrid);
    });

    const cards = Array.from(navItems, (item, index) => {
        const toolName = item.querySelector("span")?.textContent.trim() || item.textContent.trim();
        const category = getAppHomeCategory(item.dataset.category);
        const card = document.createElement("button");
        const copy = document.createElement("span");
        const label = document.createElement("span");
        const arrow = document.createElement("span");

        card.className = "app-home-card";
        card.type = "button";
        card.dataset.tool = item.dataset.tool;
        card.dataset.category = category.id;
        card.setAttribute("aria-label", `${toolName} uygulamasını aç`);
        copy.className = "app-home-card-copy";
        label.className = "app-home-card-name";
        label.textContent = toolName;
        arrow.className = "app-home-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2192";

        copy.append(label);
        if (item.dataset.description) {
            const description = document.createElement("small");
            description.className = "app-home-card-description";
            description.textContent = item.dataset.description;
            copy.appendChild(description);
        }

        if (item.dataset.icon) {
            const icon = document.createElement("span");
            icon.className = "app-home-card-icon";
            icon.textContent = item.dataset.icon;
            icon.setAttribute("aria-hidden", "true");
            card.classList.add("has-icon");
            card.appendChild(icon);
        }
        card.append(copy, arrow);
        card.addEventListener("click", () => activateTool(item.dataset.tool, { historyMode: "push" }));
        sectionGrids.get(category.id)?.appendChild(card);
        categoryCounts.set(category.id, (categoryCounts.get(category.id) || 0) + 1);
        return card;
    });

    appHomeCategories.forEach((category) => {
        const count = fragment.querySelector(`[data-category-count="${category.id}"]`);
        if (count) count.textContent = `${categoryCounts.get(category.id) || 0} araç`;
    });
    grid.replaceChildren(fragment);
    return cards;
}

function getAppHomeCategory(sourceCategory) {
    return appHomeCategories.find((category) => category.sourceCategories.includes(sourceCategory))
        || appHomeCategories[2];
}

function initializeAppSearch(cards) {
    const searchControls = Array.from(document.querySelectorAll("[data-app-search]"), (container) => {
        const input = container.querySelector("[data-app-search-input]");
        const clearButton = container.querySelector("[data-app-search-clear]");
        const shortcut = container.querySelector(".app-search-shortcut");
        const status = document.getElementById(input?.getAttribute("aria-describedby"));
        return { container, input, clearButton, shortcut, status };
    }).filter(({ input, clearButton, shortcut, status }) => input && clearButton && shortcut && status);
    const homeEmpty = document.getElementById("app-home-empty");
    const homeGrid = document.getElementById("app-home-grid");
    const homeListTitle = document.getElementById("app-home-list-title");
    const categoryFilters = document.getElementById("app-home-category-filters");
    const toolCount = document.getElementById("app-home-tool-count");
    const categoryCount = document.getElementById("app-home-category-count");
    const brandSummary = brand?.querySelector("small");

    if (!searchControls.length || !homeEmpty || !homeGrid || !homeListTitle || !categoryFilters) return;

    const searchableItems = Array.from(navItems, (item, index) => ({
        navItem: item,
        homeCard: cards[index],
        category: getAppHomeCategory(item.dataset.category).id,
        searchText: normalizeAppSearchText([
            item.querySelector("span")?.textContent || item.textContent,
            item.dataset.tool,
            preferredToolRoutes[item.dataset.tool],
            item.dataset.category,
            item.dataset.search,
            item.dataset.description,
        ].filter(Boolean).join(" ")),
    }));
    const totalAppCount = searchableItems.length;
    let activeCategory = "all";
    const homeSearchInput = searchControls.find(({ container }) => container.classList.contains("app-home-search"))?.input
        || searchControls[0].input;

    if (brandSummary) brandSummary.textContent = `${totalAppCount} uygulama, tek panel`;
    if (toolCount) toolCount.textContent = totalAppCount;
    if (categoryCount) categoryCount.textContent = appHomeCategories.length;

    const filterFragment = document.createDocumentFragment();
    [{ id: "all", name: "Tümü" }, ...appHomeCategories].forEach((category) => {
        const count = category.id === "all"
            ? totalAppCount
            : searchableItems.filter((item) => item.category === category.id).length;
        const button = document.createElement("button");
        button.className = "app-home-category-filter";
        button.type = "button";
        button.dataset.category = category.id;
        button.setAttribute("aria-pressed", String(category.id === "all"));
        button.innerHTML = `<span>${category.name}</span><small>${count}</small>`;
        button.addEventListener("click", () => {
            activeCategory = category.id;
            categoryFilters.querySelectorAll(".app-home-category-filter").forEach((item) => {
                item.setAttribute("aria-pressed", String(item === button));
            });
            filterApps(homeSearchInput.value);
        });
        filterFragment.appendChild(button);
    });
    categoryFilters.replaceChildren(filterFragment);

    const filterApps = (value = "") => {
        const rawValue = String(value);
        const query = normalizeAppSearchText(rawValue.trim());
        const queryTokens = query.split(" ").filter(Boolean);
        let visibleCount = 0;

        searchableItems.forEach(({ homeCard, searchText, category }) => {
            const matchesQuery = !query || queryTokens.every((token) => searchText.includes(token));
            const matchesCategory = activeCategory === "all" || category === activeCategory;
            const isMatch = matchesQuery && matchesCategory;
            if (homeCard) homeCard.hidden = !isMatch;
            if (isMatch) {
                visibleCount += 1;
            }
        });

        homeGrid.querySelectorAll(".app-home-category-section").forEach((section) => {
            const visibleCards = section.querySelectorAll(".app-home-card:not([hidden])").length;
            section.hidden = visibleCards === 0;
            const count = section.querySelector(".app-home-category-count");
            if (count) count.textContent = `${visibleCards} araç`;
        });

        const hasQuery = query.length > 0;
        const hasResults = visibleCount > 0;
        const activeCategoryName = appHomeCategories.find((category) => category.id === activeCategory)?.name;
        searchControls.forEach(({ input, clearButton, shortcut, status }) => {
            if (input.value !== rawValue) input.value = rawValue;
            clearButton.hidden = !hasQuery;
            shortcut.hidden = hasQuery;

            if (!hasQuery) {
                status.textContent = activeCategoryName
                    ? `${activeCategoryName} kategorisinde ${visibleCount} uygulama gösteriliyor.`
                    : "Tüm uygulamalar gösteriliyor.";
            } else if (!hasResults) {
                status.textContent = "Uygulama bulunamadı.";
            } else {
                status.textContent = `${visibleCount} uygulama bulundu.`;
            }
        });

        homeEmpty.hidden = hasResults;
        homeGrid.hidden = !hasResults;
        homeListTitle.textContent = hasQuery
            ? "Arama sonuçları"
            : (activeCategoryName || "Tüm uygulamalar");
    };

    const clearSearch = (input) => {
        filterApps("");
        input.focus();
    };

    searchControls.forEach(({ input, clearButton }) => {
        const handleSearchChange = () => filterApps(input.value);
        input.addEventListener("input", handleSearchChange);
        input.addEventListener("search", handleSearchChange);
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            clearSearch(input);
        });
        clearButton.addEventListener("click", () => clearSearch(input));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target;
        const isEditable = target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
        if (isEditable) return;

        event.preventDefault();
        if (appHome?.hidden) clearActiveTool({ historyMode: "push" });
        const preferredSearch = searchControls.find(({ container }) => container.classList.contains("app-home-search"));
        preferredSearch?.input.focus();
    });

    filterApps("");
}

function initializeToolRouting() {
    const restoreRoute = () => {
        const requestedTool = getRequestedToolFromLocation();
        if (requestedTool && activateTool(requestedTool)) return;
        clearActiveTool();
    };

    window.addEventListener("popstate", restoreRoute);
    if (window.location.protocol === "file:") {
        window.addEventListener("hashchange", () => {
            const requestedTool = getRequestedToolFromLocation();
            const activeTool = document.querySelector(".nav-item.active")?.dataset.tool;
            const normalizedTool = resolveToolRoute(requestedTool);
            if (requestedTool && activeTool === normalizedTool && appHome?.hidden) return;
            if (!requestedTool && appHome && !appHome.hidden) return;
            restoreRoute();
        });
    }

    window.setTimeout(() => {
        const requestedTool = getRequestedToolFromLocation();
        if (requestedTool && activateTool(requestedTool, { historyMode: "replace" })) return;
        updatePageMetadata(null);
    }, 0);
}

function getRequestedToolFromLocation() {
    const url = new URL(window.location.href);
    if (url.protocol === "file:" && url.hash) {
        const hashSegments = url.hash.slice(1).split("/").filter(Boolean);
        if (hashSegments.length === 1) {
            try {
                return decodeURIComponent(hashSegments[0]);
            } catch {
                return null;
            }
        }
    }

    const legacyTool = url.searchParams.get("tool");
    if (legacyTool) return legacyTool;

    const appBasePath = getAppBasePath();
    const routePath = url.pathname.startsWith(appBasePath)
        ? url.pathname.slice(appBasePath.length)
        : "";
    const pathSegments = routePath.split("/").filter(Boolean);
    if (pathSegments.length !== 1 || pathSegments[0] === "index.html") return null;

    try {
        return decodeURIComponent(pathSegments[0]);
    } catch {
        return null;
    }
}

function getAppBasePath() {
    const basePath = new URL(document.baseURI).pathname;
    return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

function createToolRouteSlug(value) {
    return String(value)
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function resolveToolRoute(route) {
    return legacyToolRoutes[route] || preferredRouteTools[route] || route;
}

function getPreferredToolRoute(tool) {
    return preferredToolRoutes[tool] || tool;
}

function updateToolHistory(tool, historyMode) {
    if (!historyMode || !["push", "replace"].includes(historyMode)) return;

    const route = tool ? getPreferredToolRoute(tool) : "";

    if (window.location.protocol === "file:") {
        const routeHash = route ? `#/${encodeURIComponent(route)}` : "";
        if (window.location.hash === routeHash) return;

        if (historyMode === "replace") {
            window.location.replace(routeHash || window.location.href.split("#")[0]);
        } else {
            window.location.hash = routeHash;
        }
        return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("tool");
    const appBasePath = getAppBasePath();
    url.pathname = route ? `${appBasePath}${encodeURIComponent(route)}` : appBasePath;
    const method = historyMode === "replace" ? "replaceState" : "pushState";
    window.history[method]({ tool: tool || null }, "", `${url.pathname}${url.search}${url.hash}`);
}

function updatePageMetadata(tool) {
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImageAlt = document.querySelector('meta[property="og:image:alt"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterImageAlt = document.querySelector('meta[name="twitter:image:alt"]');
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const toolMetadata = {
        "milyoner-bilgi-yarismasi": {
            title: "Milyoner Bilgi Yarışması | Omni Tools",
            description: "15 soruyu geç, jokerlerini doğru kullan ve büyük ödüle ulaş.",
            keywords: "milyoner bilgi yarışması, bilgi yarışması, quiz, genel kültür, soru oyunu, millionaire",
        },
        "medya-veri-temizleyici": {
            description: "JPEG, PNG ve WebP fotoğraflardaki EXIF, XMP, IPTC ve GPS mahremiyet verilerini tarayıcıda kayıpsız temizleyin.",
            keywords: "metadata cleaner, exif temizleme, fotoğraf metadata silme, gps kaldırma, medya veri temizleyici",
        },
        "exif-veri-goruntuleme": {
            description: "Fotoğraflarınızdaki EXIF, GPS, kamera, tarih ve diğer meta verileri detaylı olarak görüntüleyin.",
            keywords: "exif viewer, metadata viewer, exif veri görüntüleme, gps metadata, fotoğraf kamera bilgisi, xmp iptc icc",
        },
        "kullanici-adi-arastirma": {
            description: "Bir kullanıcı adının internette hangi platformlarda kullanıldığını herkese açık API ve profil sinyalleriyle araştırın.",
            keywords: "kullanıcı adı araştırma, username search, OSINT, sosyal medya hesap bulma, profil araştırma",
        },
        "osint-arastirma": {
            description: "Alan adı, IP, DNS, WHOIS/RDAP, URL, alt alan adı, kullanıcı aracısı ve e-posta alan adı bilgilerini herkese açık kaynaklarla araştırın.",
            keywords: "osint, ip lookup, domain intelligence, dns lookup, whois rdap, url analyzer, subdomain discovery, email intelligence, user agent",
        },
        "discord-emoji-indir": {
            description: "Discord sunucularındaki özel emoji ve çıkartmaları görüntüleyin, seçin ve doğrudan tarayıcınızda ZIP olarak indirin.",
            keywords: "discord emoji indir, discord sticker indir, bot token, guild json, emoji zip, animated emoji gif, lottie sticker",
        },
        "github-unfollower": {
            title: "GitHub Takip Etmeyenler | Omni Tools",
            description: "Sizi geri takip etmeyen GitHub hesaplarını bulun, inceleyin ve seçerek takipten çıkarın.",
            keywords: "github unfollower, github takip etmeyenler, github takipten çıkarma, followers, following",
        },
        "github-md-generator": {
            title: "GitHub MD Oluşturucu | Omni Tools",
            description: "Herkese açık GitHub depolarını analiz ederek README, SECURITY, SUPPORT, CONTRIBUTING ve CODE OF CONDUCT Markdown dosyaları oluşturun.",
            keywords: "github md generator, readme generator, markdown oluşturucu, security md, contributing md, github dokümantasyon",
        },
        "ats-cv-kontrolu": {
            title: "ATS CV Kontrolü | Omni Tools",
            description: "CV'nizin ATS uyumluluğunu tarayıcıda analiz edin, eksikleri görün ve hedef iş ilanıyla anahtar kelime eşleşmesini kontrol edin.",
            keywords: "ats cv kontrolü, cv analiz, özgeçmiş kontrolü, iş ilanı eşleşmesi, ats puanı, cv anahtar kelime, kariyer aracı",
        },
        "password-strength-analysis": {
            title: "Şifre Gücü Analizi | Omni Tools",
            description: "Şifrenizin güvenlik seviyesini, entropisini ve tahmini kırılma süresini tamamen tarayıcınızda analiz edin.",
            keywords: "şifre gücü analizi, parola güvenlik testi, parola entropisi, kırılma süresi, güçlü şifre kontrolü, brute force",
        },
        "password-game": {
            title: "Şifre Oyunu | Omni Tools",
            description: "Kurallar gittikçe zorlaşıyor. Tek bir şifreyle hepsini geçebilir misin?",
            keywords: "şifre oyunu, parola oyunu, password game, kümülatif kurallar, bulmaca oyunu, türkçe oyun",
        },
        "microphone-test": {
            title: "Mikrofon Testi | Omni Tools",
            description: "Mikrofonunuzu canlı test edin, farklı ses girişlerinden kayıt alın ve kayıtları dinleyerek karşılaştırın.",
            keywords: "mikrofon testi, microphone test, ses seviyesi, mikrofon kaydı, ses girişi, mikrofon karşılaştırma",
        },
        "sitemap-generator": {
            title: "Sitemap Oluşturucu | Omni Tools",
            description: "URL listenizden SEO uyumlu bir sitemap.xml dosyasını tamamen tarayıcınızda oluşturun.",
            keywords: "sitemap oluşturucu, sitemap generator, sitemap xml, site haritası, url listesi, seo aracı",
        },
        "robots-txt-generator": {
            title: "Robots.txt Oluşturucu | Omni Tools",
            description: "Web siteniz için arama motoru botlarına uygun robots.txt dosyasını kolayca oluşturun.",
            keywords: "robots txt oluşturucu, robots.txt generator, user agent, googlebot, bingbot, allow, disallow, crawl delay, sitemap, seo aracı",
        },
        "meta-tag-generator": {
            title: "Meta Etiket Oluşturucu | Omni Tools",
            description: "Web siteniz için SEO, Open Graph ve Twitter/X meta etiketlerini oluşturun ve paylaşım önizlemelerini kontrol edin.",
            keywords: "meta etiket oluşturucu, meta tag generator, seo başlık, meta description, open graph, twitter card, canonical, robots meta, sosyal medya önizleme",
        },
        "text-corrector": {
            title: "Metin Düzeltici | Omni Tools",
            description: "Metninizi yapay zekâ ile düzeltin, daha akıcı, anlaşılır ve istediğiniz tona uygun hale getirin.",
            keywords: "metin düzeltici, ai metin düzeltme, yazım denetimi, dilbilgisi, noktalama, anlatım bozukluğu, profesyonel metin, türkçe editör",
        },
        "prompt-developer": {
            title: "Prompt Geliştirici | Omni Tools",
            description: "Basit fikirlerinizi daha net, detaylı ve etkili yapay zekâ promptlarına dönüştürün.",
            keywords: "prompt geliştirici, prompt iyileştirme, prompt mühendisliği, codex prompt, yapay zekâ talimatı, görev tanımı, prompt detaylandırma",
        },
        "omni-ai": {
            title: "Omni AI | Omni Tools",
            description: "Sorularınızı sorun, fikir üretin, kod yazın ve yapay zekâ ile çalışın.",
            keywords: "omni ai, yapay zekâ asistanı, ai sohbet, chatbot, kod yazma, metin yazma, özetleme, fikir üretme, soru cevap",
        },
        "instagram-unfollower": {
            title: "Insta Takip Etmeyenler | Omni Tools",
            description: "Instagram'da sizi geri takip etmeyen hesapları güncel betikle inceleyin.",
            keywords: "instagram unfollower, instagram takip etmeyenler, instagram geri takip, takipten çıkarma",
        },
        nebuu: {
            description: "Telefonunu alnına koy, arkadaşlarının ipuçlarıyla Türkçe kelimeleri hareket ederek tahmin et.",
            keywords: "nebuu, alnında ne var, kelime tahmin oyunu, telefon hareket oyunu, parti oyunu, heads up türkçe",
        },
        blackjack: {
            title: "Blackjack | Omni Tools",
            description: "Sanal çiplerle, klasik Blackjack kurallarına göre tarayıcıda üst düzey masa deneyimi yaşa.",
            keywords: "blackjack, iskambil, kart oyunu, casino masası, sanal kredi, 21 oyunu",
        },
        "farkli-rengi-bul": {
            title: "Farklı Rengi Bul | Omni Tools",
            description: "Renk algını test et ve giderek birbirine yaklaşan renkler arasındaki farklı kareyi bul.",
            keywords: "farklı rengi bul, renk algısı testi, renk oyunu, görsel dikkat, hsl renk, odd color game, ücretsiz oyun",
        },
        "slot-game": {
            title: "Slot Oyunu | Omni Tools",
            description: "6x5 ızgara, zincirleme düşüş sistemi, çarpanlar ve ücretsiz dönüşlerle özgün sanal slot oyununu ücretsiz oyna.",
            keywords: "slot game, cascade, tumble, free spins, multiplier, sanal slot, arcade oyunu",
        },
        "doviz-kurlari": {
            title: "Döviz Kurları ve Para Birimi Dönüştürücü | Omni Tools",
            description: "Dünya para birimlerinin güncel TL karşılıklarını görüntüleyin ve herhangi iki para birimi arasında anında dönüşüm yapın.",
            keywords: "döviz kurları, kur çevirici, para birimi dönüştürücü, dolar tl, euro tl, güncel kurlar",
        },
        "emlak-portfoy-analizi": {
            title: "Emlak Portföy Analizi | Omni Tools",
            description: "Gayrimenkul m² fiyatı, kira getirisi, amortisman, tapu harcı ve alıcı-satıcı işlem maliyetlerini ücretsiz analiz edin.",
            keywords: "emlak portföy analizi, gayrimenkul yatırım, m² fiyatı hesaplama, kira getirisi, amortisman, emlak komisyon hesaplama, tapu masrafı, alıcı maliyeti, satıcı net tutarı",
        },
    };
    const metadata = toolMetadata[tool] || {};
    const toolName = Array.from(navItems)
        .find((item) => item.dataset.tool === tool)
        ?.querySelector("span")
        ?.textContent
        .trim();
    const title = metadata.title || (toolName ? `${toolName} | Omni Tools` : defaultPageTitle);
    const description = metadata.description || defaultPageDescription;
    const keywords = metadata.keywords || defaultPageKeywords;
    const canonicalUrl = tool && defaultCanonicalUrl
        ? new URL(encodeURIComponent(getPreferredToolRoute(tool)), defaultCanonicalUrl).href
        : defaultCanonicalUrl;
    const socialImageAlt = toolName ? `${toolName} — Omni Tools paylaşım önizlemesi` : "Omni Tools — 56 uygulama, tek panel";

    document.title = title;
    if (descriptionMeta) descriptionMeta.content = description;
    if (keywordsMeta) keywordsMeta.content = keywords;
    if (ogTitle) ogTitle.content = title;
    if (ogDescription) ogDescription.content = description;
    if (ogUrl && canonicalUrl) ogUrl.content = canonicalUrl;
    if (ogImageAlt) ogImageAlt.content = socialImageAlt;
    if (twitterTitle) twitterTitle.content = title;
    if (twitterDescription) twitterDescription.content = description;
    if (twitterImageAlt) twitterImageAlt.content = socialImageAlt;
    if (canonicalLink && canonicalUrl) canonicalLink.href = canonicalUrl;
}

function normalizeAppSearchText(value) {
    return String(value)
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

const githubForm = document.getElementById("github-form");
const githubUsername = document.getElementById("github-username");
const githubResult = document.getElementById("github-result");

function renderGithubEmptyState({ mark, title, description, tone = "" }) {
    githubResult.className = `github-result empty-state${tone ? ` is-${tone}` : ""}`;

    const content = document.createElement("div");
    const markElement = document.createElement("div");
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    const detail = document.createElement("span");

    content.className = "github-empty-content";
    markElement.className = "github-empty-mark";
    markElement.setAttribute("aria-hidden", "true");
    markElement.textContent = mark;
    copy.className = "github-empty-copy";
    heading.textContent = title;
    detail.textContent = description;
    copy.append(heading, detail);
    content.append(markElement, copy);
    githubResult.replaceChildren(content);
}

githubForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchGithubProfile();
});

async function searchGithubProfile() {
    const username = githubUsername.value.trim();
    if (!username) {
        renderGithubEmptyState({
            mark: "@",
            title: "Kullanıcı adı gerekli",
            description: "Aramaya başlamak için bir GitHub kullanıcı adı gir.",
        });
        return;
    }

    renderGithubEmptyState({
        mark: "GH",
        title: "Profil yükleniyor",
        description: "GitHub profil ve repo bilgileri getiriliyor...",
    });

    try {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Kullanıcı bulunamadı.");
        const repoResult = await fetchGithubRepos(data.repos_url);

        const blogUrl = data.blog?.startsWith("http") ? data.blog : `https://${data.blog}`;
        githubResult.className = "github-result";
        githubResult.innerHTML = `
            <div class="github-profile">
                <img class="github-avatar" src="${data.avatar_url}" alt="${escapeHtml(data.login)} profil fotoğrafı">
                <div>
                    <h3>${escapeHtml(data.name || data.login)}</h3>
                    <a href="${data.html_url}" target="_blank" rel="noreferrer">@${escapeHtml(data.login)}</a>
                </div>
            </div>
            <p class="github-bio">${escapeHtml(data.bio || "Bu hesabın biyografisi yok.")}</p>
            <div class="github-stats">
                <div><span>Depo</span><strong>${data.public_repos}</strong></div>
                <div><span>Takipçi</span><strong>${data.followers}</strong></div>
                <div><span>Takip</span><strong>${data.following}</strong></div>
                <div><span>Gist</span><strong>${data.public_gists}</strong></div>
            </div>
            <div class="github-meta">
                <p><span>Konum</span><strong>${escapeHtml(data.location || "Yok")}</strong></p>
                <p><span>Şirket</span><strong>${escapeHtml(data.company || "Yok")}</strong></p>
                <p><span>Site</span><strong>${data.blog ? `<a href="${escapeHtml(blogUrl)}" target="_blank" rel="noreferrer">${escapeHtml(data.blog)}</a>` : "Yok"}</strong></p>
                <p><span>Twitter</span><strong>${escapeHtml(data.twitter_username ? `@${data.twitter_username}` : "Yok")}</strong></p>
            </div>
            <div class="github-section-title">
                <strong>Son Repolar</strong>
                <a href="${data.html_url}?tab=repositories" target="_blank" rel="noreferrer">Tümünü Aç</a>
            </div>
            <div class="github-repos">
                ${renderGithubRepos(repoResult)}
            </div>
        `;
    } catch (error) {
        renderGithubEmptyState({
            mark: "!",
            title: "Profil alınamadı",
            description: error.message,
            tone: "error",
        });
    }
}

async function fetchGithubRepos(reposUrl) {
    const query = new URLSearchParams({
        type: "owner",
        sort: "pushed",
        direction: "desc",
        per_page: "5",
    });

    try {
        const response = await fetch(`${reposUrl}?${query}`, {
            headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) {
            const rateLimited = response.status === 403 || response.status === 429;
            return {
                items: [],
                error: rateLimited
                    ? "GitHub istek sınırına ulaşıldı. Repo listesi kısa bir süre sonra yeniden denenebilir."
                    : "Repo bilgileri şu anda alınamadı.",
            };
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) return { items: [], error: "GitHub beklenmeyen bir repo yanıtı döndürdü." };

        const items = payload
            .filter((repo) => repo && !repo.private)
            .sort((left, right) => (Date.parse(right.pushed_at) || 0) - (Date.parse(left.pushed_at) || 0))
            .slice(0, 5);
        return { items, error: "" };
    } catch (_) {
        return { items: [], error: "Repo listesine şu anda bağlanılamadı." };
    }
}

function renderGithubRepos(result) {
    if (result.error) {
        return `<div class="github-repo-card is-error"><strong>Repo listesi alınamadı</strong><p>${escapeHtml(result.error)}</p></div>`;
    }

    if (!result.items.length) {
        return '<div class="github-repo-card is-empty"><strong>Herkese açık depo bulunamadı</strong><p>Bu kullanıcının herkese açık bir deposu yok.</p></div>';
    }

    return result.items.map((repo) => `
        <article class="github-repo-card">
            <div class="github-repo-heading">
                <a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(repo.name)}</a>
                ${repo.fork ? '<span class="github-repo-badge">Çatallanmış</span>' : ""}
            </div>
            <p>${escapeHtml(repo.description || "Açıklama yok.")}</p>
            <div class="github-repo-meta">
                <span>${escapeHtml(repo.language || "Dil yok")}</span>
                <span>★ ${repo.stargazers_count}</span>
                <span>Çatal ${repo.forks_count}</span>
                <time datetime="${escapeHtml(repo.pushed_at || "")}">${formatGithubRepoDate(repo.pushed_at)}</time>
            </div>
        </article>
    `).join("");
}

function formatGithubRepoDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Güncelleme bilinmiyor";

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (elapsedSeconds < 60) return "Az önce güncellendi";
    if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} dakika önce güncellendi`;
    if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} saat önce güncellendi`;
    if (elapsedSeconds < 604800) return `${Math.floor(elapsedSeconds / 86400)} gün önce güncellendi`;
    if (elapsedSeconds < 2592000) return `${Math.floor(elapsedSeconds / 604800)} hafta önce güncellendi`;

    return `${date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })} tarihinde güncellendi`;
}

const numbleBoard = document.getElementById("numble-board");
const numbleKeypad = document.getElementById("numble-keypad");
const numbleMessage = document.getElementById("numble-message");
const numbleRound = document.getElementById("numble-round");
const numbleHardButton = document.getElementById("numble-hard");
const numbleSummary = document.getElementById("numble-summary");
const numbleCopy = document.getElementById("numble-copy");
const numbleGames = document.getElementById("numble-games");
const numbleWins = document.getElementById("numble-wins");
const numbleStreak = document.getElementById("numble-streak");

const numbleState = {
    answer: "",
    current: "",
    row: 0,
    rows: Array.from({ length: 6 }, () => ""),
    marks: Array.from({ length: 6 }, () => Array(5).fill("")),
    over: false,
    hard: false,
    requiredExact: Array(5).fill(null),
    requiredPresent: new Set(),
    stats: { games: 0, wins: 0, streak: 0 },
};

document.getElementById("numble-new").addEventListener("click", startNumbleGame);
numbleHardButton.addEventListener("click", toggleNumbleHardMode);
numbleHardButton.addEventListener("pointerup", () => numbleHardButton.blur());
numbleCopy.addEventListener("click", copyNumbleResult);
document.addEventListener("keydown", handleNumbleKeyboard);

function startNumbleGame() {
    numbleState.answer = String(getRandomInt(90000) + 10000);
    numbleState.current = "";
    numbleState.row = 0;
    numbleState.rows = Array.from({ length: 6 }, () => "");
    numbleState.marks = Array.from({ length: 6 }, () => Array(5).fill(""));
    numbleState.over = false;
    numbleState.requiredExact = Array(5).fill(null);
    numbleState.requiredPresent = new Set();
    numbleMessage.textContent = "Tahminini gir.";
    numbleSummary.textContent = "Klavye ile de oynayabilirsin.";
    renderNumble();
}

function renderNumble() {
    numbleRound.textContent = `${numbleState.row}/6`;
    numbleBoard.innerHTML = numbleState.rows.map((value, rowIndex) => {
        const rowValue = rowIndex === numbleState.row && !numbleState.over ? numbleState.current : value;
        const cells = Array.from({ length: 5 }, (_, cellIndex) => {
            const mark = numbleState.marks[rowIndex][cellIndex];
            return `<div class="numble-cell ${mark}">${rowValue[cellIndex] || ""}</div>`;
        }).join("");
        return `<div class="numble-row">${cells}</div>`;
    }).join("");

    numbleKeypad.innerHTML = [
        ..."0123456789",
        "Sil",
        "Gir",
    ].map((key) => {
        const action = key === "Sil" || key === "Gir";
        return `<button class="numble-key ${action ? "action" : ""}" type="button" data-key="${key}">${key}</button>`;
    }).join("");

    numbleKeypad.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => handleNumbleInput(button.dataset.key));
    });
    updateNumbleStats();
}

function handleNumbleKeyboard(event) {
    const activePanel = document.querySelector(".tool-panel.active");
    if (activePanel?.id !== "numble") return;
    if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleNumbleInput(event.key);
    } else if (event.key === "Backspace") {
        event.preventDefault();
        handleNumbleInput("Sil");
    } else if (event.key === "Enter") {
        event.preventDefault();
        handleNumbleInput("Gir");
    }
}

function handleNumbleInput(key) {
    if (numbleState.over) return;
    if (/^\d$/.test(key)) {
        if (numbleState.current.length < 5) {
            numbleState.current += key;
            renderNumble();
        }
        return;
    }

    if (key === "Sil") {
        numbleState.current = numbleState.current.slice(0, -1);
        renderNumble();
        return;
    }

    if (key === "Gir") submitNumbleGuess();
}

function submitNumbleGuess() {
    const guess = numbleState.current;
    if (guess.length !== 5) {
        numbleMessage.textContent = "5 haneli bir sayı gir.";
        return;
    }

    if (numbleState.hard && !passesNumbleHardRules(guess)) return;

    const marks = scoreNumbleGuess(guess, numbleState.answer);
    numbleState.rows[numbleState.row] = guess;
    numbleState.marks[numbleState.row] = marks;
    updateNumbleHardRequirements(guess, marks);
    numbleState.row += 1;
    numbleState.current = "";

    if (guess === numbleState.answer) {
        endNumbleGame(true);
    } else if (numbleState.row >= 6) {
        endNumbleGame(false);
    } else {
        numbleMessage.textContent = "Devam et.";
        renderNumble();
    }
}

function scoreNumbleGuess(guess, answer) {
    const marks = Array(5).fill("absent");
    const remaining = {};

    for (let index = 0; index < 5; index++) {
        if (guess[index] === answer[index]) {
            marks[index] = "exact";
        } else {
            remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
        }
    }

    for (let index = 0; index < 5; index++) {
        if (marks[index] === "exact") continue;
        if (remaining[guess[index]] > 0) {
            marks[index] = "present";
            remaining[guess[index]] -= 1;
        }
    }

    return marks;
}

function updateNumbleHardRequirements(guess, marks) {
    marks.forEach((mark, index) => {
        if (mark === "exact") numbleState.requiredExact[index] = guess[index];
        if (mark === "exact" || mark === "present") numbleState.requiredPresent.add(guess[index]);
    });
}

function passesNumbleHardRules(guess) {
    for (let index = 0; index < 5; index++) {
        const required = numbleState.requiredExact[index];
        if (required && guess[index] !== required) {
            numbleMessage.textContent = `${index + 1}. sırada ${required} kalmalı.`;
            return false;
        }
    }

    for (const digit of numbleState.requiredPresent) {
        if (!guess.includes(digit)) {
            numbleMessage.textContent = `${digit} rakamını kullanmalısın.`;
            return false;
        }
    }
    return true;
}

function endNumbleGame(won) {
    numbleState.over = true;
    numbleState.stats.games += 1;
    if (won) {
        numbleState.stats.wins += 1;
        numbleState.stats.streak += 1;
        numbleMessage.textContent = "Bildin.";
    } else {
        numbleState.stats.streak = 0;
        numbleMessage.textContent = `Cevap ${numbleState.answer}.`;
    }
    numbleSummary.textContent = won
        ? `${numbleState.row}/6 denemede buldun.`
        : `Bulamadın. Gizli sayı ${numbleState.answer}.`;
    renderNumble();
}

function toggleNumbleHardMode() {
    numbleState.hard = !numbleState.hard;
    numbleHardButton.textContent = `Zor Mod: ${numbleState.hard ? "Açık" : "Kapalı"}`;
    numbleMessage.textContent = numbleState.hard ? "Zor mod açık." : "Zor mod kapalı.";
}

function updateNumbleStats() {
    numbleGames.textContent = numbleState.stats.games;
    numbleWins.textContent = numbleState.stats.wins;
    numbleStreak.textContent = numbleState.stats.streak;
}

async function copyNumbleResult() {
    const rows = numbleState.marks
        .slice(0, numbleState.row)
        .map((row) => row.map((mark) => mark === "exact" ? "🟩" : mark === "present" ? "🟨" : "⬛").join(""))
        .join("\n");
    const text = `Numble ${numbleState.over ? `${numbleState.row}/6` : "devam ediyor"}\n${rows}`;
    await navigator.clipboard.writeText(text);
    numbleCopy.textContent = "Kopyalandı";
    setTimeout(() => numbleCopy.textContent = "Sonucu Kopyala", 1200);
}

const passwordOutput = document.getElementById("password-output");
const passwordLength = document.getElementById("password-length");
const passwordLengthValue = document.getElementById("password-length-value");
const passwordStrength = document.getElementById("password-strength");
const passwordEntropy = document.getElementById("password-entropy");
const passwordMeter = document.querySelector(".password-meter");
const passwordOptions = {
    lowercase: document.getElementById("pass-lowercase"),
    uppercase: document.getElementById("pass-uppercase"),
    numbers: document.getElementById("pass-numbers"),
    symbols: document.getElementById("pass-symbols"),
    noDuplicate: document.getElementById("pass-no-duplicate"),
    noAmbiguous: document.getElementById("pass-no-ambiguous"),
};

const passwordCharacters = {
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers: "0123456789",
    symbols: "!$%&*+-=?@#^_~",
};
const ambiguousCharacters = new Set("0O1Il|`'\"{}[]()/\\,.;:");

passwordLength.addEventListener("input", generatePassword);
Object.values(passwordOptions).forEach((option) => option.addEventListener("change", generatePassword));
document.getElementById("generate-password").addEventListener("click", generatePassword);
document.getElementById("copy-password").addEventListener("click", copyPassword);

function getRandomInt(max) {
    const random = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do {
        crypto.getRandomValues(random);
    } while (random[0] >= limit);
    return random[0] % max;
}

function shuffleSecure(items) {
    for (let index = items.length - 1; index > 0; index--) {
        const swapIndex = getRandomInt(index + 1);
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
}

function getPasswordGroups() {
    return ["lowercase", "uppercase", "numbers", "symbols"]
        .filter((key) => passwordOptions[key].checked)
        .map((key) => {
            let chars = passwordCharacters[key];
            if (passwordOptions.noAmbiguous.checked) {
                chars = [...chars].filter((char) => !ambiguousCharacters.has(char)).join("");
            }
            return { key, chars };
        })
        .filter((group) => group.chars.length > 0);
}

function generatePassword() {
    const groups = getPasswordGroups();
    if (!groups.length) {
        passwordOptions.lowercase.checked = true;
        groups.push({ key: "lowercase", chars: passwordCharacters.lowercase });
    }

    const length = Number(passwordLength.value);
    const pool = groups.map((group) => group.chars).join("");
    const uniquePool = [...new Set(pool)];
    const useUnique = passwordOptions.noDuplicate.checked;
    const finalLength = useUnique ? Math.min(length, uniquePool.length) : length;
    passwordLength.value = finalLength;
    passwordLengthValue.textContent = finalLength;

    const password = groups.map((group) => group.chars[getRandomInt(group.chars.length)]);
    while (password.length < finalLength) {
        const source = useUnique ? uniquePool.join("") : pool;
        const nextChar = source[getRandomInt(source.length)];
        if (!useUnique || !password.includes(nextChar)) {
            password.push(nextChar);
        }
    }

    passwordOutput.value = shuffleSecure(password).join("");
    updatePasswordStrength(uniquePool.length, finalLength);
}

function updatePasswordStrength(poolSize, length) {
    const entropy = Math.round(Math.log2(Math.max(poolSize, 1) ** length));
    passwordEntropy.textContent = `${entropy} bit`;
    passwordMeter.classList.remove("weak", "medium", "strong");

    const strength = entropy < 60 ? "weak" : entropy < 100 ? "medium" : "strong";
    passwordMeter.classList.add(strength);
    passwordStrength.textContent = strength === "weak" ? "Zayıf" : strength === "medium" ? "Orta" : "Güçlü";
}

async function copyPassword() {
    const button = document.getElementById("copy-password");
    await navigator.clipboard.writeText(passwordOutput.value);
    button.textContent = "Kopyalandı";
    setTimeout(() => button.textContent = "Kopyala", 1200);
}

const cryptoList = document.getElementById("crypto-list");
const refreshCryptoButton = document.getElementById("refresh-crypto");
const cryptoIds = ["bitcoin", "tether", "ethereum", "litecoin", "cardano", "dogecoin"];
const cryptoNames = {
    bitcoin: "Bitcoin",
    tether: "Tether",
    ethereum: "Ethereum",
    litecoin: "Litecoin",
    cardano: "Cardano",
    dogecoin: "Dogecoin",
};
let cryptoPricesLoaded = false;

refreshCryptoButton.addEventListener("click", () => {
    cryptoPricesLoaded = false;
    fetchCryptoPrices();
});

async function fetchCryptoPrices() {
    if (cryptoPricesLoaded) return;
    cryptoPricesLoaded = true;
    refreshCryptoButton.disabled = true;
    refreshCryptoButton.textContent = "Yükleniyor";
    cryptoList.innerHTML = `
        <div class="empty-state crypto-empty is-loading">
            <strong>Fiyatlar yükleniyor</strong>
            <span>CoinGecko üzerinden güncel piyasa verisi alınıyor.</span>
        </div>
    `;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join("%2C")}&vs_currencies=usd&include_24hr_change=true`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("CoinGecko yanıt vermedi.");
        const data = await response.json();
        cryptoList.innerHTML = cryptoIds.map((coin) => {
            const coinInfo = data[coin];
            if (!coinInfo) return "";
            const change = Number(coinInfo.usd_24h_change || 0);
            return `
                <article class="coin ${change < 0 ? "falling" : "rising"}">
                    <img src="tools/assets/crypto/${coin}.png" alt="${coin}">
                    <div class="coin-name">
                        <h3>${cryptoNames[coin] || coin}</h3>
                        <span>/USD</span>
                    </div>
                    <div class="coin-price">
                        <strong>$${Number(coinInfo.usd).toLocaleString("en-US")}</strong>
                        <span class="coin-change">${change.toFixed(3)}%</span>
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        cryptoPricesLoaded = false;
        cryptoList.innerHTML = `
            <div class="empty-state crypto-empty error">
                <strong>Fiyatlar alınamadı</strong>
                <span>${error.message} Daha sonra tekrar deneyin.</span>
            </div>
        `;
    } finally {
        refreshCryptoButton.disabled = false;
        refreshCryptoButton.textContent = "Fiyatları Yenile";
    }
}

const qrText = document.getElementById("qr-text");
const qrLight = document.getElementById("qr-light");
const qrDark = document.getElementById("qr-dark");
const qrSize = document.getElementById("qr-size");
const qrContainer = document.getElementById("qr-code");
const qrDownload = document.getElementById("qr-download");
const qrShare = document.getElementById("qr-share");
const qrSizeLabel = document.getElementById("qr-size-label");

[qrText, qrLight, qrDark, qrSize].forEach((input) => input.addEventListener("input", generateQRCode));
qrSize.addEventListener("change", generateQRCode);
qrShare.addEventListener("click", shareQRCode);

async function generateQRCode() {
    if (typeof QRCode === "undefined") {
        qrContainer.textContent = "QR kütüphanesi yüklenemedi.";
        return;
    }

    const size = Number(qrSize.value);
    qrSizeLabel.textContent = `${size}x${size}`;
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: qrText.value.trim() || "https://ardaltunel.vercel.app",
        height: size,
        width: size,
        colorLight: qrLight.value,
        colorDark: qrDark.value,
    });
    qrDownload.href = await resolveQRDataUrl();
}

function resolveQRDataUrl() {
    return new Promise((resolve) => {
        setTimeout(() => {
            const img = qrContainer.querySelector("img");
            const canvas = qrContainer.querySelector("canvas");
            resolve(img?.currentSrc || canvas?.toDataURL("image/png") || "#");
        }, 80);
    });
}

async function shareQRCode() {
    try {
        const dataUrl = await resolveQRDataUrl();
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "QRCode.png", { type: blob.type });
        if (!navigator.canShare?.({ files: [file] })) throw new Error();
        await navigator.share({ files: [file], title: qrText.value || "QRCode" });
    } catch {
        alert("Tarayıcınız dosya paylaşımını desteklemiyor.");
    }
}

const speechForm = document.getElementById("speech-form");
const speechText = document.getElementById("speech-text");
const voiceList = document.getElementById("voice-list");
const speechButton = document.getElementById("speech-button");
const speechStop = document.getElementById("speech-stop");
const speechStatus = document.getElementById("speech-status");
const synth = window.speechSynthesis;
let isPaused = false;

speechForm.addEventListener("submit", (event) => {
    event.preventDefault();
    speakText();
});
speechStop.addEventListener("click", () => {
    synth.cancel();
    isPaused = false;
    speechButton.textContent = "Seslendir";
    speechStatus.textContent = "Durduruldu";
});

function loadVoices() {
    const voices = synth.getVoices();
    if (!voices.length) {
        voiceList.innerHTML = '<option>Sesler yükleniyor</option>';
        speechStatus.textContent = "Sesler yükleniyor";
        return;
    }

    voiceList.innerHTML = voices.map((voice) => {
        const selected = voice.name === "Google US English" ? "selected" : "";
        return `<option value="${voice.name}" ${selected}>${voice.name} (${voice.lang})</option>`;
    }).join("");
    speechStatus.textContent = `${voices.length} ses hazır`;
}

function speakText() {
    const text = speechText.value.trim();
    if (!text) {
        speechStatus.textContent = "Metin gerekli";
        speechText.focus();
        return;
    }

    if (synth.speaking && !isPaused) {
        synth.pause();
        isPaused = true;
        speechButton.textContent = "Devam Et";
        speechStatus.textContent = "Duraklatıldı";
        return;
    }

    if (isPaused) {
        synth.resume();
        isPaused = false;
        speechButton.textContent = "Duraklat";
        speechStatus.textContent = "Seslendiriliyor";
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = synth.getVoices().find((voice) => voice.name === voiceList.value);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onend = () => {
        isPaused = false;
        speechButton.textContent = "Seslendir";
        speechStatus.textContent = "Tamamlandı";
    };
    synth.speak(utterance);
    speechButton.textContent = "Duraklat";
    speechStatus.textContent = "Seslendiriliyor";
}

if (synth) {
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
} else {
    speechStatus.textContent = "Desteklenmiyor";
    speechButton.disabled = true;
    speechStop.disabled = true;
}

const gradientColorA = document.getElementById("gradient-color-a");
const gradientColorB = document.getElementById("gradient-color-b");
const gradientPreview = document.getElementById("gradient-preview");
const gradientCode = document.getElementById("gradient-code");
const gradientDirectionLabel = document.getElementById("gradient-direction-label");
const directionButtons = document.querySelectorAll("#direction-buttons button");
let gradientDirection = "to bottom";

[gradientColorA, gradientColorB].forEach((input) => input.addEventListener("input", generateGradient));
directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        directionButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        gradientDirection = button.dataset.direction;
        generateGradient();
    });
});

document.getElementById("copy-gradient").addEventListener("click", async () => {
    await navigator.clipboard.writeText(gradientCode.value);
    document.getElementById("copy-gradient").textContent = "Kopyalandı";
    setTimeout(() => document.getElementById("copy-gradient").textContent = "Kopyala", 1200);
});

function generateGradient() {
    const css = `background-image: linear-gradient(${gradientDirection}, ${gradientColorA.value}, ${gradientColorB.value});`;
    gradientPreview.style.backgroundImage = `linear-gradient(${gradientDirection}, ${gradientColorA.value}, ${gradientColorB.value})`;
    gradientCode.value = css;
    gradientDirectionLabel.textContent = gradientDirection;
}

const turkishTypingTexts = [
    "küçük araçlar sade bir arayüzde birleştiğinde günlük işler daha hızlı ve keyifli hale gelir",
    "başarılı bir yazma testi kullanıcıyı bekletmeden başlar ve metin tamamlandığında sonucu açıkça gösterir",
    "temiz bir tasarım gereksiz dikkat dağıtıcıları azaltır ve yapılan işe odaklanmayı kolaylaştırır",
    "türkçe karakterleri doğru kullanmak hem yazma hızını hem de metin doğruluğunu daha gerçekçi ölçer",
    "bir uygulamanın iyi hissettirmesi için yalnızca çalışması yetmez akışı da doğal ve anlaşılır olmalıdır",
    "hızlı yazmak kadar sakin kalmak da önemlidir çünkü dikkatli ilerleyen kullanıcı daha az hata yapar",
];
const quoteSection = document.getElementById("quote");
const userInput = document.getElementById("quote-input");
const timerEl = document.getElementById("timer");
const mistakesEl = document.getElementById("mistakes");
const resultEl = document.getElementById("typing-result");
const accuracyEl = document.getElementById("accuracy");
const wpmEl = document.getElementById("wpm");
const typingState = document.getElementById("typing-state");
const typingSummary = document.getElementById("typing-summary");

let quote = "";
let elapsedSeconds = 0;
let timer = null;
let mistakes = 0;
let testStarted = false;
let lastTextIndex = -1;
let startTimestamp = null;
let nextTypingTimeout = null;

userInput.addEventListener("input", compareTypingInput);
userInput.addEventListener("keydown", handleTypingKeydown);
document.getElementById("new-quote").addEventListener("click", () => prepareTypingTest(true));

function renderNewQuote() {
    let nextIndex = Math.floor(Math.random() * turkishTypingTexts.length);
    if (turkishTypingTexts.length > 1) {
        while (nextIndex === lastTextIndex) {
            nextIndex = Math.floor(Math.random() * turkishTypingTexts.length);
        }
    }

    lastTextIndex = nextIndex;
    quote = turkishTypingTexts[nextIndex];
    quoteSection.innerHTML = quote.split("").map((value) => `<span class="quote-char">${escapeHtml(value)}</span>`).join("");
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function compareTypingInput() {
    if (!testStarted && userInput.value.length > 0) {
        startTypingTimer();
    }

    const quoteChars = Array.from(document.querySelectorAll(".quote-char"));
    const inputChars = userInput.value.split("");
    mistakes = 0;

    quoteChars.forEach((char, index) => {
        char.classList.remove("success", "fail");
        if (inputChars[index] == null) return;
        if (char.innerText === inputChars[index]) {
            char.classList.add("success");
        } else {
            char.classList.add("fail");
            mistakes++;
        }
    });
    mistakes += Math.max(inputChars.length - quoteChars.length, 0);

    mistakesEl.textContent = mistakes;
    updateLiveStats();

    const isComplete = quoteChars.length &&
        inputChars.length >= quoteChars.length;

    if (isComplete) finishTypingTest();
}

function handleTypingKeydown(event) {
    if (event.key !== "Enter" || userInput.disabled) return;
    event.preventDefault();
    if (!testStarted && userInput.value.length > 0) {
        startTypingTimer();
        compareTypingInput();
    }
    finishTypingTest();
}

function updateTimer() {
    if (!startTimestamp) return;
    elapsedSeconds = Math.floor((Date.now() - startTimestamp) / 1000);
    timerEl.textContent = `${elapsedSeconds}s`;
}

function startTypingTimer() {
    testStarted = true;
    startTimestamp = Date.now();
    typingState.textContent = "Test başladı";
    timer = setInterval(updateTimer, 250);
}

function finishTypingTest() {
    if (!testStarted) return;
    clearInterval(timer);
    updateTimer();
    testStarted = false;
    userInput.disabled = true;
    resultEl.style.display = "block";
    typingState.textContent = "Tamamlandı";

    const durationSeconds = Math.max((Date.now() - startTimestamp) / 1000, 1);
    const elapsedMinutes = durationSeconds / 60;
    const typedChars = userInput.value.length;
    const correctChars = Math.max(typedChars - mistakes, 0);
    const speed = (typedChars / 5 / elapsedMinutes).toFixed(2);
    const accuracy = typedChars ? Math.round((correctChars / typedChars) * 100) : 0;
    wpmEl.textContent = `${speed} wpm`;
    accuracyEl.textContent = `${accuracy}%`;
    typingSummary.textContent = `${durationSeconds.toFixed(1)} saniyede tamamlandı. Doğruluk ${accuracy}%, hız ${speed} wpm. Yeni metin hazırlandı; yazmaya başlayınca sonraki test otomatik başlar.`;

    nextTypingTimeout = setTimeout(() => {
        prepareTypingTest(false);
        typingState.textContent = "Yeni metin hazır";
        userInput.focus();
    }, 900);
}

function updateLiveStats() {
    const typedChars = userInput.value.length;
    const correctChars = Math.max(typedChars - mistakes, 0);
    const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);
    accuracyEl.textContent = typedChars ? `${Math.round((correctChars / typedChars) * 100)}%` : "-";
    wpmEl.textContent = typedChars ? `${(typedChars / 5 / elapsedMinutes).toFixed(2)} wpm` : "-";
}

function resetTypingState(clearResult) {
    clearInterval(timer);
    clearTimeout(nextTypingTimeout);
    elapsedSeconds = 0;
    mistakes = 0;
    testStarted = false;
    startTimestamp = null;
    userInput.value = "";
    userInput.disabled = false;
    timerEl.textContent = "0s";
    mistakesEl.textContent = "0";
    accuracyEl.textContent = "-";
    wpmEl.textContent = "-";
    if (clearResult) {
        resultEl.style.display = "block";
        typingSummary.textContent = "İlk harfi yazdığında test başlayacak. Enter ile erken bitirebilirsin.";
    }
    typingState.textContent = "Hazır";
    document.querySelectorAll(".quote-char").forEach((char) => char.classList.remove("success", "fail"));
}

function prepareTypingTest(clearResult = true) {
    resetTypingState(clearResult);
    renderNewQuote();
}

startNumbleGame();
generatePassword();
generateGradient();
generateQRCode();
prepareTypingTest(true);
