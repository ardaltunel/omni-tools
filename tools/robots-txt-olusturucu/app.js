(function initRobotsTxtGenerator() {
    "use strict";

    const core = window.RobotsTxtCore;
    const panel = document.getElementById("robots-txt-generator");
    if (!core || !panel) return;

    const get = (id) => document.getElementById(id);
    const elements = {
        siteUrl: get("robots-txt-site-url"),
        siteError: get("robots-txt-site-error"),
        template: get("robots-txt-template"),
        applyTemplate: get("robots-txt-apply-template"),
        groups: get("robots-txt-groups"),
        groupTemplate: get("robots-txt-group-template"),
        addGroup: get("robots-txt-add-group"),
        sitemaps: get("robots-txt-sitemaps"),
        sitemapSuggestion: get("robots-txt-sitemap-suggestion"),
        preview: get("robots-txt-preview"),
        validation: get("robots-txt-validation"),
        status: get("robots-txt-status"),
        generate: get("robots-txt-generate"),
        copy: get("robots-txt-copy"),
        download: get("robots-txt-download"),
        clear: get("robots-txt-clear"),
        sample: get("robots-txt-sample"),
        openSitemap: get("robots-txt-open-sitemap"),
    };

    const templates = {
        allow: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: [], includeEmptyDisallow: true }] },
        block: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: ["/"] }] },
        admin: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: ["/admin/", "/login/"] }] },
        wordpress: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: ["/wp-admin/", "/wp-login.php"] }] },
        ecommerce: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: ["/cart/", "/checkout/", "/account/", "/search/"] }] },
        custom: { siteUrl: "", sitemaps: [], groups: [{ userAgents: ["*"], allow: [], disallow: [] }] },
    };

    let nextGroupId = 1;
    let currentText = "";
    let statusTimer = null;

    function createGroup(source = {}) {
        const group = {
            id: `robots-group-${nextGroupId++}`,
            userAgents: Array.isArray(source.userAgents) ? source.userAgents : ["*"],
            allow: Array.isArray(source.allow) ? source.allow : [],
            disallow: Array.isArray(source.disallow) ? source.disallow : [],
            crawlDelay: source.crawlDelay ?? "",
            includeEmptyDisallow: Boolean(source.includeEmptyDisallow),
        };
        const fragment = elements.groupTemplate.content.cloneNode(true);
        const card = fragment.querySelector("[data-robots-group]");
        card.dataset.groupId = group.id;
        card.querySelector("[data-group-number]").textContent = String(elements.groups.children.length + 1);
        card.querySelectorAll("[data-agent]").forEach((checkbox) => {
            checkbox.checked = group.userAgents.includes(checkbox.value);
        });
        const standard = new Set(core.STANDARD_AGENTS.map((agent) => agent.value));
        card.querySelector("[data-field='customAgent']").value = group.userAgents.filter((agent) => !standard.has(agent)).join(", ");
        card.querySelector("[data-field='allow']").value = group.allow.join("\n");
        card.querySelector("[data-field='disallow']").value = group.disallow.join("\n");
        card.querySelector("[data-field='crawlDelay']").value = group.crawlDelay;
        card.dataset.emptyDisallow = group.includeEmptyDisallow ? "true" : "false";
        elements.groups.append(fragment);
        updateGroupControls();
        updatePreview();
    }

    function readGroups() {
        return Array.from(elements.groups.querySelectorAll("[data-robots-group]")).map((card) => {
            const standardAgents = Array.from(card.querySelectorAll("[data-agent]:checked")).map((input) => input.value);
            const customAgents = String(card.querySelector("[data-field='customAgent']").value || "").split(",").map((value) => value.trim()).filter(Boolean);
            return {
                id: card.dataset.groupId,
                userAgents: standardAgents.concat(customAgents),
                allow: core.parseLines(card.querySelector("[data-field='allow']").value),
                disallow: core.parseLines(card.querySelector("[data-field='disallow']").value),
                crawlDelay: card.querySelector("[data-field='crawlDelay']").value,
                includeEmptyDisallow: card.dataset.emptyDisallow === "true",
            };
        });
    }

    function readConfiguration() {
        return {
            siteUrl: elements.siteUrl.value.trim(),
            groups: readGroups(),
            sitemaps: core.parseLines(elements.sitemaps.value),
        };
    }

    function renderPreview(text) {
        const fragment = document.createDocumentFragment();
        text.split("\n").forEach((line, index, lines) => {
            const row = document.createElement("span");
            row.className = "robots-txt-code-line";
            const separator = line.indexOf(":");
            if (separator >= 0) {
                const directive = document.createElement("span");
                directive.className = "robots-txt-directive";
                directive.textContent = line.slice(0, separator + 1);
                const value = document.createElement("span");
                value.className = "robots-txt-value";
                value.textContent = line.slice(separator + 1);
                row.append(directive, value);
            } else row.textContent = line;
            fragment.append(row);
            if (index < lines.length - 1) fragment.append(document.createTextNode("\n"));
        });
        elements.preview.replaceChildren(fragment);
    }

    function renderValidation(result, showSuccess = false, showErrors = false) {
        elements.validation.replaceChildren();
        const messages = (showErrors ? result.errors.map((text) => ({ text, type: "error" })) : []).concat(result.warnings.map((text) => ({ text, type: "warning" })));
        if (!messages.length && showSuccess) messages.push({ text: "Yapılandırma geçerli; robots.txt dosyanız hazır.", type: "success" });
        elements.validation.hidden = messages.length === 0;
        messages.forEach((message) => {
            const item = document.createElement("div");
            item.className = `robots-txt-validation-item is-${message.type}`;
            const mark = document.createElement("span");
            mark.setAttribute("aria-hidden", "true");
            mark.textContent = message.type === "error" ? "×" : message.type === "warning" ? "!" : "✓";
            const text = document.createElement("p");
            text.textContent = message.text;
            item.append(mark, text);
            elements.validation.append(item);
        });
    }

    function updatePreview(options = {}) {
        const configuration = readConfiguration();
        const result = core.validateConfiguration(configuration);
        elements.siteError.textContent = configuration.siteUrl && !result.site.valid ? result.site.error : "";
        elements.siteError.hidden = !elements.siteError.textContent;
        try {
            currentText = core.generateRobots(configuration.groups, configuration.sitemaps);
        } catch {
            currentText = "User-agent: *\nDisallow:";
        }
        renderPreview(currentText);
        renderValidation(result, Boolean(options.confirm), Boolean(options.confirm));
        elements.copy.disabled = !currentText || !result.valid;
        elements.download.disabled = !currentText || !result.valid;
        if (!options.keepStatus) setStatus("");
        return result;
    }

    function updateGroupControls() {
        const cards = Array.from(elements.groups.querySelectorAll("[data-robots-group]"));
        cards.forEach((card, index) => {
            card.querySelector("[data-group-number]").textContent = String(index + 1);
            card.querySelector("[data-remove-group]").disabled = cards.length === 1;
        });
    }

    function setStatus(message, type = "") {
        if (statusTimer) {
            window.clearTimeout(statusTimer);
            statusTimer = null;
        }
        elements.status.textContent = message;
        elements.status.hidden = !message;
        elements.status.className = `robots-txt-status${type ? ` is-${type}` : ""}`;
        if (message) {
            statusTimer = window.setTimeout(() => {
                elements.status.textContent = "";
                elements.status.hidden = true;
                statusTimer = null;
            }, 3000);
        }
    }

    function replaceConfiguration(source) {
        elements.groups.replaceChildren();
        elements.siteUrl.value = source.siteUrl || "";
        elements.sitemaps.value = (source.sitemaps || []).join("\n");
        (source.groups || []).forEach(createGroup);
        if (!source.groups?.length) createGroup();
        updatePreview();
    }

    function applyTemplate() {
        const selected = templates[elements.template.value] || templates.custom;
        const siteUrl = elements.siteUrl.value.trim();
        const sitemaps = core.parseLines(elements.sitemaps.value);
        replaceConfiguration({ ...selected, siteUrl, sitemaps });
        setStatus("Şablon uygulandı; alanları sitenize göre düzenleyebilirsiniz.", "success");
    }

    async function copyText() {
        if (!currentText) return;
        try {
            await navigator.clipboard.writeText(currentText);
        } catch {
            const helper = document.createElement("textarea");
            helper.value = currentText;
            helper.setAttribute("readonly", "");
            helper.style.cssText = "position:fixed;opacity:0";
            document.body.append(helper);
            helper.select();
            document.execCommand("copy");
            helper.remove();
        }
        setStatus("robots.txt içeriği panoya kopyalandı.", "success");
    }

    function downloadText() {
        if (!currentText) return;
        const url = URL.createObjectURL(new Blob([currentText], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "robots.txt";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus("robots.txt dosyası indirildi.", "success");
    }

    panel.addEventListener("input", (event) => {
        const card = event.target.closest("[data-robots-group]");
        if (card && ["allow", "disallow"].includes(event.target.dataset.field)) card.dataset.emptyDisallow = "false";
        updatePreview();
        if (event.target === elements.siteUrl && !elements.sitemaps.value.trim()) {
            const suggestion = core.createSitemapSuggestion(elements.siteUrl.value);
            elements.sitemapSuggestion.textContent = suggestion ? `Önerilen adres: ${suggestion}` : "";
            elements.sitemapSuggestion.hidden = !suggestion;
        }
    });
    panel.addEventListener("change", (event) => {
        if (event.target.matches("[data-agent]")) updatePreview();
    });
    elements.groups.addEventListener("click", (event) => {
        const button = event.target.closest("[data-remove-group]");
        if (!button) return;
        button.closest("[data-robots-group]").remove();
        updateGroupControls();
        updatePreview();
    });
    elements.addGroup.addEventListener("click", () => createGroup({ userAgents: ["Googlebot"] }));
    elements.applyTemplate.addEventListener("click", applyTemplate);
    elements.generate.addEventListener("click", () => {
        const result = updatePreview({ confirm: true, keepStatus: true });
        setStatus(result.valid ? "robots.txt başarıyla oluşturuldu." : "Dosyayı oluşturmadan önce işaretlenen hataları düzeltin.", result.valid ? "success" : "error");
    });
    elements.copy.addEventListener("click", copyText);
    elements.download.addEventListener("click", downloadText);
    elements.clear.addEventListener("click", () => {
        elements.template.value = "custom";
        elements.sitemapSuggestion.hidden = true;
        replaceConfiguration(templates.custom);
        elements.siteUrl.focus();
    });
    elements.sample.addEventListener("click", () => {
        elements.template.value = "custom";
        replaceConfiguration({
            siteUrl: "https://example.com",
            sitemaps: ["https://example.com/sitemap.xml"],
            groups: [{ userAgents: ["*"], allow: ["/public/", "/images/"], disallow: ["/admin/", "/private/"] }],
        });
        setStatus("Örnek yapılandırma yüklendi.", "success");
    });
    elements.openSitemap.addEventListener("click", () => {
        const target = document.querySelector('[data-tool="sitemap-generator"]');
        if (target) target.click();
    });

    createGroup(templates.allow.groups[0]);
}());
