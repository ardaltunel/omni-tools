(function initMetaTagGenerator() {
    "use strict";

    const core = window.MetaTagGeneratorCore;
    const panel = document.getElementById("meta-tag-generator");
    if (!core || !panel) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        form: byId("meta-tag-form"),
        title: byId("meta-tag-title-input"),
        description: byId("meta-tag-description-input"),
        pageUrl: byId("meta-tag-page-url"),
        siteName: byId("meta-tag-site-name"),
        author: byId("meta-tag-author"),
        keywords: byId("meta-tag-keywords"),
        language: byId("meta-tag-language"),
        canonical: byId("meta-tag-canonical"),
        colorPicker: byId("meta-tag-color-picker"),
        colorText: byId("meta-tag-color-text"),
        socialTitle: byId("meta-tag-social-title"),
        socialDescription: byId("meta-tag-social-description"),
        imageUrl: byId("meta-tag-image-url"),
        ogType: byId("meta-tag-og-type"),
        twitterCard: byId("meta-tag-twitter-card"),
        twitterSite: byId("meta-tag-twitter-site"),
        twitterCreator: byId("meta-tag-twitter-creator"),
        titleCount: byId("meta-tag-title-count"),
        descriptionCount: byId("meta-tag-description-count"),
        googleTitle: byId("meta-tag-google-title"),
        googleUrl: byId("meta-tag-google-url"),
        googleDescription: byId("meta-tag-google-description"),
        socialImage: byId("meta-tag-social-image"),
        socialPlaceholder: byId("meta-tag-social-placeholder"),
        previewSite: byId("meta-tag-preview-site"),
        previewTitle: byId("meta-tag-preview-title"),
        previewDescription: byId("meta-tag-preview-description"),
        code: byId("meta-tag-code"),
        checks: byId("meta-tag-checks"),
        issues: byId("meta-tag-issues"),
        generate: byId("meta-tag-generate"),
        copy: byId("meta-tag-copy"),
        download: byId("meta-tag-download"),
        clear: byId("meta-tag-clear"),
        sample: byId("meta-tag-sample"),
        status: byId("meta-tag-status"),
        openSitemap: byId("meta-tag-open-sitemap"),
        openRobots: byId("meta-tag-open-robots"),
    };

    let outputMode = "all";
    let currentOutput = "";
    let lastImageUrl = "";
    let statusTimer = null;

    function readData() {
        return {
            title: elements.title.value,
            description: elements.description.value,
            pageUrl: elements.pageUrl.value,
            siteName: elements.siteName.value,
            author: elements.author.value,
            keywords: elements.keywords.value,
            language: elements.language.value,
            canonical: elements.canonical.value,
            themeColor: elements.colorText.value,
            robots: Array.from(panel.querySelectorAll("[data-meta-robots]:checked")).map((input) => input.value),
            socialTitle: elements.socialTitle.value,
            socialDescription: elements.socialDescription.value,
            imageUrl: elements.imageUrl.value,
            ogType: elements.ogType.value,
            twitterCard: elements.twitterCard.value,
            twitterSite: elements.twitterSite.value,
            twitterCreator: elements.twitterCreator.value,
        };
    }

    function setStatus(message, type = "") {
        if (statusTimer) window.clearTimeout(statusTimer);
        elements.status.textContent = message;
        elements.status.hidden = !message;
        elements.status.className = `meta-tag-status${type ? ` is-${type}` : ""}`;
        statusTimer = message ? window.setTimeout(() => {
            elements.status.textContent = "";
            elements.status.hidden = true;
            statusTimer = null;
        }, 3000) : null;
    }

    function renderCode(code) {
        const fragment = document.createDocumentFragment();
        code.split("\n").forEach((line, index, lines) => {
            const span = document.createElement("span");
            span.className = line.startsWith("<title") ? "meta-tag-code-title" : line.startsWith("<") ? "meta-tag-code-element" : "";
            span.textContent = line;
            fragment.append(span);
            if (index < lines.length - 1) fragment.append(document.createTextNode("\n"));
        });
        elements.code.replaceChildren(fragment);
    }

    function renderChecks(result, showIssues = false) {
        elements.checks.replaceChildren();
        result.checks.forEach((check) => {
            const item = document.createElement("li");
            item.className = check.passed ? "is-passed" : "is-missing";
            const mark = document.createElement("span");
            mark.setAttribute("aria-hidden", "true");
            mark.textContent = check.passed ? "✓" : "!";
            const label = document.createElement("span");
            label.textContent = check.label;
            item.append(mark, label);
            elements.checks.append(item);
        });
        elements.issues.replaceChildren();
        const messages = (showIssues ? result.errors : []).concat(result.warnings);
        messages.forEach((message) => {
            const item = document.createElement("li");
            item.textContent = message;
            elements.issues.append(item);
        });
        elements.issues.hidden = messages.length === 0;
    }

    function updateLengthCounter(element, target, recommendedMax, recommendedMin) {
        const length = Array.from(element.value).length;
        target.textContent = `${length} / ${recommendedMax}`;
        target.classList.toggle("is-good", length >= recommendedMin && length <= recommendedMax);
        target.classList.toggle("is-warning", length > 0 && (length < recommendedMin || length > recommendedMax));
    }

    function renderImage(url) {
        if (url === lastImageUrl) return;
        lastImageUrl = url;
        elements.socialImage.hidden = true;
        elements.socialPlaceholder.hidden = false;
        elements.socialImage.removeAttribute("src");
        if (!core.validateHttpUrl(url, "Geçerli bir görsel URL’si girin.").valid) return;
        elements.socialImage.onload = () => {
            elements.socialImage.hidden = false;
            elements.socialPlaceholder.hidden = true;
        };
        elements.socialImage.onerror = () => {
            elements.socialImage.hidden = true;
            elements.socialPlaceholder.hidden = false;
        };
        elements.socialImage.src = url;
    }

    function update(options = {}) {
        const data = readData();
        const result = core.validateMetaForm(data);
        const outputs = core.generateMetaTags(data);
        currentOutput = outputs[outputMode] || outputs.all;
        renderCode(currentOutput || "Alanları doldurduğunuzda meta etiketleri burada gösterilir.");
        updateLengthCounter(elements.title, elements.titleCount, 60, 30);
        updateLengthCounter(elements.description, elements.descriptionCount, 160, 120);

        const normalized = result.normalized;
        elements.googleTitle.textContent = normalized.title || "Sayfa başlığınız burada görünecek";
        elements.googleUrl.textContent = normalized.pageUrl || "https://example.com";
        elements.googleDescription.textContent = normalized.description || "Sayfa açıklamanız burada görünecek.";
        elements.previewSite.textContent = normalized.siteName || (core.validateHttpUrl(normalized.pageUrl).hostname || "example.com");
        elements.previewTitle.textContent = normalized.socialTitle || "Paylaşım başlığı";
        elements.previewDescription.textContent = normalized.socialDescription || "Paylaşım açıklaması burada görünecek.";
        renderImage(normalized.imageUrl);
        renderChecks(result, Boolean(options.showIssues));
        elements.copy.disabled = !result.valid;
        elements.download.disabled = !result.valid;
        if (!options.keepStatus) setStatus("");
        return result;
    }

    function setRobots(values) {
        const selected = new Set(values);
        panel.querySelectorAll("[data-meta-robots]").forEach((input) => { input.checked = selected.has(input.value); });
    }

    function enforceRobotExclusivity(changed) {
        const opposite = { index: "noindex", noindex: "index", follow: "nofollow", nofollow: "follow" }[changed.value];
        if (changed.checked && opposite) {
            const input = panel.querySelector(`[data-meta-robots="${opposite}"]`);
            if (input) input.checked = false;
        }
    }

    function loadSample() {
        elements.title.value = "Omni Tools - Ücretsiz Web Araçları";
        elements.description.value = "PDF, görsel, SEO ve geliştirici araçlarını herhangi bir kurulum yapmadan doğrudan tarayıcınızda ücretsiz olarak kullanın.";
        elements.pageUrl.value = "https://example.com/omni-tools";
        elements.siteName.value = "Omni Tools";
        elements.author.value = "Arda Altunel";
        elements.keywords.value = "web araçları, SEO araçları, geliştirici araçları, PDF";
        elements.language.value = "tr";
        elements.canonical.value = "https://example.com/omni-tools";
        elements.colorText.value = "#18A999";
        elements.colorPicker.value = "#18a999";
        elements.socialTitle.value = "Omni Tools - Tek Panelde Ücretsiz Araçlar";
        elements.socialDescription.value = "Tarayıcıda çalışan pratik web, SEO ve geliştirici araçlarını keşfedin.";
        elements.imageUrl.value = "https://example.com/og-image.png";
        elements.ogType.value = "website";
        elements.twitterCard.value = "summary_large_image";
        elements.twitterSite.value = "@omnitools";
        elements.twitterCreator.value = "@ardaltunel";
        setRobots(["index", "follow"]);
        update();
        setStatus("Örnek veriler yüklendi.", "success");
    }

    async function copyOutput() {
        if (!currentOutput) return;
        try {
            await navigator.clipboard.writeText(currentOutput);
        } catch {
            const helper = document.createElement("textarea");
            helper.value = currentOutput;
            helper.setAttribute("readonly", "");
            helper.style.cssText = "position:fixed;opacity:0";
            document.body.append(helper);
            helper.select();
            document.execCommand("copy");
            helper.remove();
        }
        setStatus("Meta etiket kodu panoya kopyalandı.", "success");
    }

    function downloadHtml() {
        if (!currentOutput) return;
        const language = core.normalizeData(readData()).language;
        const html = `<!doctype html>\n<html lang="${language}">\n<head>\n${currentOutput.split("\n").map((line) => `  ${line}`).join("\n")}\n</head>\n<body></body>\n</html>\n`;
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "meta-tags.html";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus("meta-tags.html indirildi.", "success");
    }

    elements.form.addEventListener("submit", (event) => event.preventDefault());
    elements.form.addEventListener("input", (event) => {
        if (event.target === elements.colorPicker) elements.colorText.value = elements.colorPicker.value.toUpperCase();
        if (event.target === elements.colorText && core.validateThemeColor(elements.colorText.value).valid) elements.colorPicker.value = elements.colorText.value;
        if (event.target.matches("[data-meta-robots]")) enforceRobotExclusivity(event.target);
        update();
    });
    elements.form.addEventListener("change", (event) => {
        if (event.target.matches("select, [data-meta-robots]")) update();
    });
    panel.querySelectorAll("[data-meta-output]").forEach((button) => button.addEventListener("click", () => {
        outputMode = button.dataset.metaOutput;
        panel.querySelectorAll("[data-meta-output]").forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-selected", String(active));
        });
        update();
    }));
    elements.generate.addEventListener("click", () => {
        const result = update({ showIssues: true, keepStatus: true });
        setStatus(result.valid ? "Meta etiketleri başarıyla oluşturuldu." : "İşaretlenen alanları düzeltip tekrar deneyin.", result.valid ? "success" : "error");
    });
    elements.copy.addEventListener("click", copyOutput);
    elements.download.addEventListener("click", downloadHtml);
    elements.sample.addEventListener("click", loadSample);
    elements.clear.addEventListener("click", () => {
        elements.form.reset();
        elements.colorText.value = "#111827";
        elements.colorPicker.value = "#111827";
        setRobots(["index", "follow"]);
        lastImageUrl = "";
        update();
        elements.title.focus();
    });
    elements.openSitemap.addEventListener("click", () => document.querySelector('[data-tool="sitemap-generator"]')?.click());
    elements.openRobots.addEventListener("click", () => document.querySelector('[data-tool="robots-txt-generator"]')?.click());

    update();
}());
