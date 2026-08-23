(function initGithubMdGenerator(root) {
    "use strict";

    const panel = document.getElementById("github-md-generator");
    if (!panel || !root.GithubMdServices || !root.GithubMdTemplates || !root.GithubMdProviders) return;

    const elements = {};
    [
        "github-md-form", "github-md-url", "github-md-language", "github-md-file",
        "github-md-additional", "github-md-submit", "github-md-status", "github-md-status-title",
        "github-md-status-detail", "github-md-summary", "github-md-summary-name",
        "github-md-summary-language", "github-md-summary-license", "github-md-summary-tech",
        "github-md-editor", "github-md-editor-file", "github-md-provider", "github-md-edit-tab",
        "github-md-preview-tab", "github-md-edit-pane", "github-md-preview-pane",
        "github-md-input", "github-md-highlight", "github-md-preview", "github-md-copy",
        "github-md-download", "github-md-regenerate", "github-md-clear", "github-md-live",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    const state = {
        repository: null,
        markdown: "",
        providerLabel: "",
        sourceUrl: "",
        controller: null,
        copyTimer: null,
        activeTab: "edit",
    };

    bindEvents();
    resetTool();

    function bindEvents() {
        elements["github-md-form"].addEventListener("submit", handleSubmit);
        elements["github-md-url"].addEventListener("input", () => elements["github-md-url"].removeAttribute("aria-invalid"));
        elements["github-md-input"].addEventListener("input", handleEditorInput);
        elements["github-md-input"].addEventListener("scroll", syncEditorScroll);
        elements["github-md-edit-tab"].addEventListener("click", () => setEditorTab("edit"));
        elements["github-md-preview-tab"].addEventListener("click", () => setEditorTab("preview"));
        elements["github-md-copy"].addEventListener("click", copyMarkdown);
        elements["github-md-download"].addEventListener("click", downloadMarkdown);
        elements["github-md-regenerate"].addEventListener("click", regenerateMarkdown);
        elements["github-md-clear"].addEventListener("click", resetTool);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const formValues = getFormValues();
        try {
            root.GithubMdServices.parseRepositoryUrl(formValues.repositoryUrl);
            elements["github-md-url"].removeAttribute("aria-invalid");
        } catch (error) {
            elements["github-md-url"].setAttribute("aria-invalid", "true");
            showStatus("error", "Depo adresi geçersiz", error.message);
            elements["github-md-url"].focus();
            return;
        }

        abortActiveRequest();
        state.controller = new AbortController();
        setBusy(true);
        hideResults();
        showStatus("loading", "Depo analiz ediliyor", "GitHub üst verileri, README, bağımlılıklar ve klasör yapısı inceleniyor…");

        let repository;
        let analysisWarning = "";
        try {
            repository = await root.GithubMdServices.analyzeRepository(formValues.repositoryUrl, { signal: state.controller.signal });
        } catch (error) {
            if (error?.name === "AbortError") return;
            if (!formValues.additionalInformation) {
                showStatus("error", "Depo analiz edilemedi", `${error.message} Ek Bilgi alanına proje açıklaması yazarak tekrar deneyebilirsiniz.`);
                setBusy(false);
                state.controller = null;
                return;
            }
            repository = root.GithubMdServices.createManualRepository(formValues.repositoryUrl, formValues.additionalInformation);
            analysisWarning = error.message;
        }

        try {
            state.repository = repository;
            state.sourceUrl = formValues.repositoryUrl;
            await generateMarkdown(repository, formValues, analysisWarning);
        } catch (error) {
            if (error?.name !== "AbortError") showStatus("error", "Markdown oluşturulamadı", "Beklenmeyen bir hata oluştu. Bilgileri kontrol edip yeniden deneyin.");
        } finally {
            setBusy(false);
            state.controller = null;
        }
    }

    async function generateMarkdown(repository, formValues, analysisWarning = "") {
        const fallbackMarkdown = root.GithubMdTemplates.generate({
            repository,
            fileName: formValues.fileName,
            language: formValues.language,
            additionalInformation: formValues.additionalInformation,
        });
        const result = await root.GithubMdProviders.generate({
            repository,
            fileName: formValues.fileName,
            language: formValues.language,
            additionalInformation: formValues.additionalInformation,
            fallbackMarkdown,
            signal: state.controller?.signal,
            onStatus(detail) {
                showStatus("loading", "Markdown hazırlanıyor", detail);
            },
        });

        state.markdown = result.markdown;
        state.providerLabel = result.providerLabel;
        elements["github-md-input"].value = result.markdown;
        elements["github-md-editor-file"].textContent = formValues.fileName;
        elements["github-md-provider"].textContent = result.providerLabel;
        updateEditor();
        renderRepositorySummary(repository);
        elements["github-md-summary"].hidden = false;
        elements["github-md-editor"].hidden = false;
        setEditorTab("edit");

        const partialMessage = repository.warnings.length
            ? ` Dosyanın bazı bölümleri kısmi verilerle hazırlandı: ${repository.warnings.join(" ")}`
            : "";
        const manualMessage = analysisWarning ? ` GitHub analizi kullanılamadı: ${analysisWarning}` : "";
        const providerMessage = result.providerFailures?.length
            ? ` Öncelikli yapay zekâ sağlayıcısı kullanılamadı; ${result.providerLabel} ile güvenli biçimde devam edildi.`
            : "";
        const hasWarning = Boolean(analysisWarning || repository.warnings.length || result.providerFailures?.length);
        showStatus(hasWarning ? "warning" : "success", `${formValues.fileName} oluşturuldu`, `${result.providerLabel} kullanıldı.${providerMessage}${manualMessage}${partialMessage}`);
        announce(`${formValues.fileName} oluşturuldu.`);
    }

    async function regenerateMarkdown() {
        if (!state.repository) return;
        abortActiveRequest();
        state.controller = new AbortController();
        setBusy(true);
        showStatus("loading", "Markdown yeniden oluşturuluyor", "Güncel dil, dosya ve ek bilgi tercihleri uygulanıyor…");
        try {
            await generateMarkdown(state.repository, getFormValues());
        } catch (error) {
            if (error?.name !== "AbortError") showStatus("error", "Markdown oluşturulamadı", "Yeniden oluşturma sırasında bir hata oluştu.");
        } finally {
            setBusy(false);
            state.controller = null;
        }
    }

    function getFormValues() {
        return {
            repositoryUrl: elements["github-md-url"].value.trim(),
            language: elements["github-md-language"].value,
            fileName: elements["github-md-file"].value,
            additionalInformation: elements["github-md-additional"].value.trim(),
        };
    }

    function renderRepositorySummary(repo) {
        elements["github-md-summary-name"].textContent = repo.fullName || repo.name;
        elements["github-md-summary-language"].textContent = repo.mainLanguage || "—";
        elements["github-md-summary-license"].textContent = repo.license || "Algılanmadı";
        elements["github-md-summary-tech"].textContent = repo.detectedTech.length ? repo.detectedTech.join(" • ") : "Algılanmadı";
    }

    function handleEditorInput() {
        state.markdown = elements["github-md-input"].value;
        updateEditor();
    }

    function updateEditor() {
        const value = elements["github-md-input"].value;
        elements["github-md-highlight"].innerHTML = highlightMarkdown(value) + (value.endsWith("\n") ? " " : "\n ");
        if (state.activeTab === "preview") renderPreview(value);
        resetCopyButton();
    }

    function syncEditorScroll() {
        elements["github-md-highlight"].parentElement.scrollTop = elements["github-md-input"].scrollTop;
        elements["github-md-highlight"].parentElement.scrollLeft = elements["github-md-input"].scrollLeft;
    }

    function setEditorTab(tab) {
        state.activeTab = tab;
        const isEdit = tab === "edit";
        elements["github-md-edit-tab"].classList.toggle("is-active", isEdit);
        elements["github-md-preview-tab"].classList.toggle("is-active", !isEdit);
        elements["github-md-edit-tab"].setAttribute("aria-selected", String(isEdit));
        elements["github-md-preview-tab"].setAttribute("aria-selected", String(!isEdit));
        elements["github-md-edit-pane"].hidden = !isEdit;
        elements["github-md-preview-pane"].hidden = isEdit;
        if (!isEdit) renderPreview(elements["github-md-input"].value);
    }

    function highlightMarkdown(markdown) {
        let inFence = false;
        return String(markdown).split("\n").map((line) => {
            const escaped = escapeHtml(line);
            if (/^\s*```/.test(line)) {
                inFence = !inFence;
                return `<span class="github-md-token-fence">${escaped || " "}</span>`;
            }
            if (inFence) return `<span class="github-md-token-code">${escaped || " "}</span>`;
            if (/^#{1,6}\s/.test(line)) return `<span class="github-md-token-heading">${escaped}</span>`;
            if (/^\s*(?:[-*+] |\d+\. )/.test(line)) return `<span class="github-md-token-list">${highlightInline(escaped)}</span>`;
            if (/^>\s?/.test(line)) return `<span class="github-md-token-quote">${highlightInline(escaped)}</span>`;
            return highlightInline(escaped);
        }).join("\n");
    }

    function highlightInline(escaped) {
        return escaped
            .replace(/(`[^`\n]+`)/g, '<span class="github-md-token-code">$1</span>')
            .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="github-md-token-strong">$1</span>')
            .replace(/(\[[^\]\n]+\]\([^\)\n]+\))/g, '<span class="github-md-token-link">$1</span>');
    }

    function renderPreview(markdown) {
        const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
        const html = [];
        let paragraph = [];
        let listType = "";
        let inFence = false;
        let fenceLines = [];
        let inBadgeGroup = false;

        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
            paragraph = [];
        };
        const closeList = () => {
            if (!listType) return;
            html.push(`</${listType}>`);
            listType = "";
        };

        lines.forEach((line) => {
            const badgeGroupMatch = line.match(/^<p\s+align="(left|center|right)">\s*$/i);
            if (badgeGroupMatch) {
                flushParagraph();
                closeList();
                if (inBadgeGroup) html.push("</div>");
                html.push(`<div class="github-md-badges is-${badgeGroupMatch[1].toLowerCase()}">`);
                inBadgeGroup = true;
                return;
            }
            if (inBadgeGroup && /^<\/p>\s*$/i.test(line)) {
                html.push("</div>");
                inBadgeGroup = false;
                return;
            }
            if (inBadgeGroup) {
                const imageMatch = line.match(/^\s*<img\s+alt="([^"]*)"\s+src="(https:\/\/img\.shields\.io\/[^"\s]+)"\s*>\s*$/i);
                if (imageMatch) {
                    html.push(`<img alt="${escapeHtml(imageMatch[1])}" src="${escapeHtml(imageMatch[2])}">`);
                    return;
                }
                html.push("</div>");
                inBadgeGroup = false;
            }
            if (/^\s*```/.test(line)) {
                flushParagraph();
                closeList();
                if (inFence) {
                    html.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
                    fenceLines = [];
                }
                inFence = !inFence;
                return;
            }
            if (inFence) {
                fenceLines.push(line);
                return;
            }
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                flushParagraph();
                closeList();
                const level = headingMatch[1].length;
                html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
                return;
            }
            const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
            if (unordered || ordered) {
                flushParagraph();
                const targetType = unordered ? "ul" : "ol";
                if (listType !== targetType) {
                    closeList();
                    listType = targetType;
                    html.push(`<${listType}>`);
                }
                html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
                return;
            }
            if (/^>\s?/.test(line)) {
                flushParagraph();
                closeList();
                html.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ""))}</blockquote>`);
                return;
            }
            if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
                flushParagraph();
                closeList();
                html.push("<hr>");
                return;
            }
            if (!line.trim()) {
                flushParagraph();
                closeList();
                return;
            }
            paragraph.push(line.trim());
        });
        if (inBadgeGroup) html.push("</div>");
        if (inFence) html.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
        flushParagraph();
        closeList();
        elements["github-md-preview"].innerHTML = html.join("");
    }

    function renderInline(value) {
        let output = escapeHtml(value);
        output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
            const decodedUrl = url.replace(/&amp;/g, "&");
            if (!/^(?:https?:\/\/|[#/])/i.test(decodedUrl)) return label;
            return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
        });
        return output;
    }

    async function copyMarkdown() {
        const markdown = elements["github-md-input"].value;
        if (!markdown) return;
        try {
            await writeToClipboard(markdown);
            elements["github-md-copy"].textContent = "Kopyalandı";
            announce("Markdown panoya kopyalandı.");
            if (state.copyTimer) root.clearTimeout(state.copyTimer);
            state.copyTimer = root.setTimeout(resetCopyButton, 1800);
        } catch {
            showStatus("error", "Kopyalama başarısız", "Metni editörden seçerek manuel olarak kopyalayabilirsiniz.");
        }
    }

    function downloadMarkdown() {
        const markdown = elements["github-md-input"].value;
        if (!markdown) return;
        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = elements["github-md-file"].value;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        root.setTimeout(() => URL.revokeObjectURL(url), 0);
        announce(`${anchor.download} indirildi.`);
    }

    function resetTool() {
        abortActiveRequest();
        elements["github-md-form"].reset();
        elements["github-md-url"].removeAttribute("aria-invalid");
        elements["github-md-input"].value = "";
        elements["github-md-highlight"].textContent = "";
        elements["github-md-preview"].replaceChildren();
        state.repository = null;
        state.markdown = "";
        state.providerLabel = "";
        state.sourceUrl = "";
        state.controller = null;
        hideResults();
        showStatus("idle", "Depo bekleniyor", "Herkese açık GitHub depo adresini girerek başlayın.");
        setBusy(false);
        setEditorTab("edit");
        resetCopyButton();
    }

    function hideResults() {
        elements["github-md-summary"].hidden = true;
        elements["github-md-editor"].hidden = true;
    }

    function showStatus(type, title, detail) {
        const status = elements["github-md-status"];
        status.className = `github-md-status is-${type}`;
        elements["github-md-status-title"].textContent = title;
        elements["github-md-status-detail"].textContent = detail;
        status.hidden = false;
    }

    function setBusy(isBusy) {
        panel.classList.toggle("is-busy", isBusy);
        elements["github-md-submit"].disabled = isBusy;
        elements["github-md-regenerate"].disabled = isBusy;
        elements["github-md-submit"].textContent = isBusy ? "Analiz ediliyor…" : "Analiz Et ve Oluştur";
    }

    function abortActiveRequest() {
        state.controller?.abort();
        state.controller = null;
    }

    function resetCopyButton() {
        if (state.copyTimer) root.clearTimeout(state.copyTimer);
        state.copyTimer = null;
        elements["github-md-copy"].textContent = "Markdown'ı Kopyala";
    }

    async function writeToClipboard(value) {
        if (navigator.clipboard?.writeText && root.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy failed");
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function announce(message) {
        elements["github-md-live"].textContent = "";
        root.requestAnimationFrame(() => { elements["github-md-live"].textContent = message; });
    }
}(window));
