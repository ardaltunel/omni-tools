(function initSimpleSitemapGenerator() {
    "use strict";

    const core = window.SitemapGeneratorCore;
    const panel = document.getElementById("sitemap-generator");
    if (!core || !panel) return;

    const get = (id) => document.getElementById(id);
    const elements = {
        input: get("sitemap-simple-input"),
        total: get("sitemap-simple-total"),
        valid: get("sitemap-simple-valid"),
        invalid: get("sitemap-simple-invalid"),
        inputMessage: get("sitemap-simple-input-message"),
        xml: get("sitemap-simple-xml"),
        domainWarning: get("sitemap-simple-domain-warning"),
        sample: get("sitemap-simple-sample"),
        clear: get("sitemap-simple-clear"),
        generate: get("sitemap-simple-generate"),
        copy: get("sitemap-simple-copy"),
        download: get("sitemap-simple-download"),
        outputMessage: get("sitemap-simple-output-message"),
    };

    let currentXml = "";

    function setMessage(element, message, type = "") {
        element.textContent = message;
        element.hidden = !message;
        element.classList.toggle("is-error", type === "error");
        element.classList.toggle("is-success", type === "success");
    }

    function analyzeInput() {
        const lines = core.parseUrlLines(elements.input.value);
        const result = core.collectUrls(lines.slice(0, core.MAX_CLIENT_URLS));
        const overflow = Math.max(0, lines.length - core.MAX_CLIENT_URLS);
        const invalidCount = result.invalid.length + result.duplicates.length + overflow;
        const entries = result.valid.map((loc) => ({ loc }));
        const domains = core.analyzeDomains(entries);

        elements.total.textContent = String(lines.length);
        elements.valid.textContent = String(result.valid.length);
        elements.invalid.textContent = String(invalidCount);
        elements.clear.disabled = lines.length === 0;
        elements.domainWarning.hidden = !domains.hasMultipleDomains;

        const notices = [];
        if (result.invalid.length) notices.push(`${result.invalid.length} geçersiz URL atlanacak.`);
        if (result.duplicates.length) notices.push(`${result.duplicates.length} tekrar eden URL tekilleştirildi.`);
        if (overflow) notices.push(`5.000 URL sınırını aşan ${overflow} satır işlenmeyecek.`);
        setMessage(elements.inputMessage, notices.join(" "), notices.length ? "error" : "");
        return { lines, result, entries, invalidCount, overflow };
    }

    function resetOutput() {
        currentXml = "";
        elements.xml.textContent = "Sitemap oluşturduğunuzda XML burada gösterilir.";
        elements.copy.disabled = true;
        elements.download.disabled = true;
        setMessage(elements.outputMessage, "");
    }

    function renderXml(xml) {
        const fragment = document.createDocumentFragment();
        xml.split(/(<[^>]+>)/gu).filter(Boolean).forEach((part) => {
            const span = document.createElement("span");
            span.className = part.startsWith("<") ? "xml-tag" : "xml-value";
            span.textContent = part;
            fragment.append(span);
        });
        elements.xml.replaceChildren(fragment);
    }

    function generate() {
        const analysis = analyzeInput();
        if (!analysis.entries.length) {
            setMessage(elements.outputMessage, "Sitemap oluşturmak için en az bir geçerli URL girin.", "error");
            return;
        }
        try {
            currentXml = core.generateSitemap(analysis.entries);
            renderXml(currentXml);
            elements.copy.disabled = false;
            elements.download.disabled = false;
            const extra = analysis.invalidCount || analysis.result.duplicates.length
                ? " Hatalı ve tekrar eden satırlar çıktıya eklenmedi."
                : "";
            setMessage(elements.outputMessage, `${analysis.entries.length} URL içeren sitemap.xml oluşturuldu.${extra}`, "success");
        } catch (error) {
            setMessage(elements.outputMessage, error.message || "Sitemap oluşturulamadı.", "error");
        }
    }

    async function copyXml() {
        if (!currentXml) return;
        try {
            await navigator.clipboard.writeText(currentXml);
        } catch {
            const helper = document.createElement("textarea");
            helper.value = currentXml;
            helper.setAttribute("readonly", "");
            helper.style.position = "fixed";
            helper.style.opacity = "0";
            document.body.append(helper);
            helper.select();
            document.execCommand("copy");
            helper.remove();
        }
        setMessage(elements.outputMessage, "XML panoya kopyalandı.", "success");
    }

    function downloadXml() {
        if (!currentXml) return;
        const blob = new Blob([currentXml], { type: "application/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "sitemap.xml";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage(elements.outputMessage, "sitemap.xml indirildi.", "success");
    }

    elements.input.addEventListener("input", () => {
        resetOutput();
        analyzeInput();
    });
    elements.sample.addEventListener("click", () => {
        elements.input.value = [
            "https://example.com/",
            "https://example.com/about",
            "https://example.com/contact",
            "https://example.com/blog",
        ].join("\n");
        resetOutput();
        analyzeInput();
        elements.input.focus();
    });
    elements.clear.addEventListener("click", () => {
        elements.input.value = "";
        resetOutput();
        analyzeInput();
        elements.input.focus();
    });
    elements.generate.addEventListener("click", generate);
    elements.copy.addEventListener("click", copyXml);
    elements.download.addEventListener("click", downloadXml);

    analyzeInput();
}());
