(function () {
    "use strict";

    const panel = document.getElementById("osint-center");
    const Core = window.OsintCenterCore;
    const ServiceApi = window.OsintCenterServices;
    if (!panel || !Core || !ServiceApi) return;

    const HISTORY_KEY = "omniTools.osintHistory.v1";
    const MODULES = {
        domain: {
            title: "Domain Intelligence",
            kicker: "DOMAIN",
            description: "Alan adının kayıt, DNS ve erişilebilir HTTP sinyallerini birlikte inceleyin.",
            label: "Alan adı",
            placeholder: "github.com",
        },
        whois: {
            title: "WHOIS",
            kicker: "RDAP / WHOIS",
            description: "Alan adının standart RDAP kayıt bilgilerini okunabilir biçimde görüntüleyin.",
            label: "Alan adı",
            placeholder: "google.com",
        },
        dns: {
            title: "DNS Lookup",
            kicker: "DNS-OVER-HTTPS",
            description: "A, AAAA, MX, NS, TXT, CNAME, SOA ve CAA kayıtlarını sorgulayın.",
            label: "Alan adı",
            placeholder: "cloudflare.com",
            dnsType: true,
        },
        ip: {
            title: "IP Lookup",
            kicker: "IP INTELLIGENCE",
            description: "Public IPv4/IPv6 adresinin ağ, ASN, reverse DNS ve yaklaşık konum verilerini inceleyin.",
            label: "IPv4 veya IPv6",
            placeholder: "8.8.8.8",
        },
        headers: {
            title: "HTTP Header Analyzer",
            kicker: "HTTP RESPONSE",
            description: "CORS ile görünür olan response header alanlarını ve security header durumunu inceleyin.",
            label: "HTTP veya HTTPS URL",
            placeholder: "https://github.com",
        },
        subdomains: {
            title: "Subdomain Discovery",
            kicker: "PASSIVE CT",
            description: "Aktif brute-force yapmadan Certificate Transparency kayıtlarındaki subdomainleri araştırın.",
            label: "Alan adı",
            placeholder: "example.com",
        },
        url: {
            title: "URL Analyzer",
            kicker: "LOCAL ANALYSIS",
            description: "URL yapısını, query parametrelerini, credentials ve punycode sinyallerini yerel olarak analiz edin.",
            label: "HTTP veya HTTPS URL",
            placeholder: "https://github.com/search?q=osint&lang=tr",
        },
        expander: {
            title: "URL Expander",
            kicker: "REDIRECT CHECK",
            description: "Kısa URL'nin yönlendiği nihai adresi, tarayıcı izin verdiği ölçüde güvenle kontrol edin.",
            label: "Kısa veya yönlendiren URL",
            placeholder: "https://bit.ly/...",
        },
        "user-agent": {
            title: "User-Agent Analyzer",
            kicker: "LOCAL ANALYSIS",
            description: "Tarayıcı, işletim sistemi, cihaz, mimari ve bot sinyallerini yerel olarak analiz edin.",
            label: "User-Agent metni",
            placeholder: "Mozilla/5.0 ...",
            multiline: true,
            currentUa: true,
        },
        email: {
            title: "Email Intelligence",
            kicker: "EMAIL DOMAIN",
            description: "E-posta biçimini ve alan adının public DNS/MX durumunu, posta kutusunu sorgulamadan inceleyin.",
            label: "E-posta adresi",
            placeholder: "test@gmail.com",
        },
    };

    const elements = {
        moduleCards: Array.from(panel.querySelectorAll("[data-osint-module]")),
        quickForm: document.getElementById("osint-quick-form"),
        quickInput: document.getElementById("osint-quick-input"),
        detectionBadge: document.getElementById("osint-detection-badge"),
        quickError: document.getElementById("osint-quick-error"),
        moduleForm: document.getElementById("osint-module-form"),
        queryField: document.getElementById("osint-query-field"),
        queryLabel: document.getElementById("osint-query-label"),
        dnsTypeField: document.getElementById("osint-dns-type-field"),
        dnsType: document.getElementById("osint-dns-type"),
        currentUa: document.getElementById("osint-current-ua"),
        submit: document.getElementById("osint-submit"),
        cancel: document.getElementById("osint-cancel"),
        activeKicker: document.getElementById("osint-active-kicker"),
        workbenchTitle: document.getElementById("osint-workbench-title"),
        workbenchDescription: document.getElementById("osint-workbench-description"),
        formError: document.getElementById("osint-form-error"),
        progress: document.getElementById("osint-progress"),
        progressTitle: document.getElementById("osint-progress-title"),
        progressDetail: document.getElementById("osint-progress-detail"),
        resultToolbar: document.getElementById("osint-result-toolbar"),
        duration: document.getElementById("osint-duration"),
        copyAll: document.getElementById("osint-copy-all"),
        downloadJson: document.getElementById("osint-download-json"),
        results: document.getElementById("osint-results"),
        liveStatus: document.getElementById("osint-live-status"),
        historyList: document.getElementById("osint-history-list"),
        clearHistory: document.getElementById("osint-clear-history"),
    };

    const services = ServiceApi.createOsintServices();
    const state = {
        activeModule: "domain",
        queryInput: document.getElementById("osint-query-input"),
        controller: null,
        runId: 0,
        exportData: null,
    };

    elements.moduleCards.forEach((card) => {
        card.addEventListener("click", () => selectModule(card.dataset.osintModule, { focus: true }));
    });
    elements.moduleForm.addEventListener("submit", (event) => {
        event.preventDefault();
        runResearch(state.activeModule, state.queryInput.value);
    });
    elements.quickForm.addEventListener("submit", handleQuickSearch);
    elements.quickInput.addEventListener("input", updateDetectedType);
    elements.cancel.addEventListener("click", cancelActiveResearch);
    elements.currentUa.addEventListener("click", () => {
        state.queryInput.value = navigator.userAgent || "";
        runResearch("user-agent", state.queryInput.value);
    });
    elements.copyAll.addEventListener("click", () => copyText(JSON.stringify(state.exportData, null, 2), elements.copyAll));
    elements.downloadJson.addEventListener("click", downloadJson);
    elements.clearHistory.addEventListener("click", clearHistory);

    selectModule("domain");
    renderHistory();

    function createElement(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function selectModule(moduleId, options = {}) {
        const definition = MODULES[moduleId];
        if (!definition) return;
        state.activeModule = moduleId;
        elements.moduleCards.forEach((card) => {
            const active = card.dataset.osintModule === moduleId;
            card.classList.toggle("active", active);
            card.setAttribute("aria-pressed", String(active));
        });
        elements.activeKicker.textContent = definition.kicker;
        elements.workbenchTitle.textContent = definition.title;
        elements.workbenchDescription.textContent = definition.description;
        elements.queryLabel.textContent = definition.label;
        elements.dnsTypeField.hidden = !definition.dnsType;
        elements.currentUa.hidden = !definition.currentUa;

        const currentValue = state.queryInput ? state.queryInput.value : "";
        const tagName = definition.multiline ? "textarea" : "input";
        if (!state.queryInput || state.queryInput.tagName.toLowerCase() !== tagName) {
            const replacement = document.createElement(tagName);
            replacement.id = "osint-query-input";
            replacement.autocomplete = "off";
            replacement.spellcheck = false;
            state.queryInput.replaceWith(replacement);
            state.queryInput = replacement;
            elements.queryLabel.setAttribute("for", replacement.id);
        }
        state.queryInput.placeholder = definition.placeholder;
        state.queryInput.value = options.value !== undefined ? options.value : currentValue;
        hideMessage(elements.formError);
        if (options.focus) state.queryInput.focus();
    }

    function updateDetectedType() {
        const detection = Core.detectQueryType(elements.quickInput.value);
        const idle = !elements.quickInput.value.trim();
        const unknown = detection.type === "unknown" && !idle;
        elements.detectionBadge.dataset.state = idle ? "idle" : (unknown ? "error" : "ready");
        elements.detectionBadge.textContent = idle
            ? "Algılanan tür bekleniyor"
            : (unknown ? "Tür algılanamadı" : `Algılandı: ${detection.label}`);
        hideMessage(elements.quickError);
    }

    function handleQuickSearch(event) {
        event.preventDefault();
        const query = elements.quickInput.value.trim();
        const detection = Core.detectQueryType(query);
        const moduleMap = { domain: "domain", ip: "ip", url: "url", email: "email", "user-agent": "user-agent" };
        const moduleId = moduleMap[detection.type];
        if (!moduleId) {
            showMessage(elements.quickError, "Sorgu türü algılanamadı. Geçerli bir alan adı, IP, URL, e-posta veya User-Agent girin.");
            return;
        }
        selectModule(moduleId, { value: query });
        panel.querySelector(".osint-workbench").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        runResearch(moduleId, query);
    }

    function normalizeQuery(moduleId, value) {
        const input = String(value || "").trim();
        if (!input) throw new TypeError("Sorgu alanı boş bırakılamaz.");
        if (["domain", "whois", "dns", "subdomains"].includes(moduleId)) {
            const domain = Core.normalizeDomain(input);
            if (!Core.isValidDomain(domain)) throw new TypeError("Geçersiz domain.");
            return domain;
        }
        if (moduleId === "ip") {
            const ip = input.replace(/^\[|\]$/g, "");
            if (!Core.isValidIp(ip)) throw new TypeError("Geçersiz IP adresi.");
            return ip;
        }
        if (["headers", "url", "expander"].includes(moduleId)) return Core.normalizeUrl(input).href;
        if (moduleId === "email") {
            if (!Core.isValidEmail(input)) throw new TypeError("Geçersiz e-posta adresi.");
            return input;
        }
        if (moduleId === "user-agent" && input.length < 8) throw new TypeError("Geçerli bir User-Agent metni girin.");
        return input;
    }

    async function runResearch(moduleId, rawQuery) {
        let query;
        try {
            query = normalizeQuery(moduleId, rawQuery);
        } catch (error) {
            showMessage(elements.formError, error.message);
            state.queryInput.focus();
            return;
        }
        selectModule(moduleId, { value: query });
        cancelActiveResearch(false);
        const runId = state.runId + 1;
        state.runId = runId;
        const controller = new AbortController();
        state.controller = controller;
        state.exportData = null;
        setBusy(true, moduleId);
        hideMessage(elements.formError);
        elements.resultToolbar.hidden = true;
        renderLoading();
        const startedAt = performance.now();

        try {
            let result;
            switch (moduleId) {
                case "domain": result = await services.researchDomain(query, controller.signal); break;
                case "whois": result = await services.lookupWhois(query, controller.signal); break;
                case "dns": result = await services.lookupDns(query, elements.dnsType.value, controller.signal); break;
                case "ip": result = await services.lookupIp(query, controller.signal); break;
                case "headers": result = await services.analyzeHeaders(query, controller.signal); break;
                case "subdomains": result = await services.discoverSubdomains(query, controller.signal, updateSubdomainProgress); break;
                case "url": result = Core.analyzeUrl(query); break;
                case "expander": result = await services.expandUrl(query, controller.signal); break;
                case "user-agent": result = Core.analyzeUserAgent(query); break;
                case "email": result = await services.lookupEmail(query, controller.signal); break;
                default: throw new TypeError("Bilinmeyen araştırma modülü.");
            }
            if (runId !== state.runId) return;
            const elapsed = performance.now() - startedAt;
            state.exportData = Core.createExportPayload(query, MODULES[moduleId].title, result, new Date().toISOString());
            renderResult(moduleId, result);
            elements.duration.textContent = `${formatDuration(elapsed)} saniyede tamamlandı.`;
            elements.resultToolbar.hidden = false;
            elements.liveStatus.textContent = `${MODULES[moduleId].title} araştırması tamamlandı.`;
            addHistory(query, moduleId);
        } catch (error) {
            if (runId !== state.runId || (error && error.code === "ABORTED")) return;
            renderError(error);
            elements.liveStatus.textContent = error && error.message ? error.message : "Araştırma tamamlanamadı.";
        } finally {
            if (runId === state.runId) {
                state.controller = null;
                setBusy(false, moduleId);
            }
        }
    }

    function setBusy(busy, moduleId) {
        elements.progress.hidden = !busy;
        elements.cancel.hidden = !busy;
        elements.submit.disabled = false;
        elements.submit.textContent = busy ? "Yeni Araştırma" : "Araştır";
        elements.progressTitle.textContent = moduleId === "subdomains" ? "Pasif kaynaklar taranıyor..." : "Araştırılıyor...";
        elements.progressDetail.textContent = moduleId === "subdomains" ? "Certificate Transparency kayıtları alınıyor" : "Public kaynaklara bağlanılıyor";
    }

    function updateSubdomainProgress(completed, total) {
        elements.progressDetail.textContent = total ? `${completed} / ${total} DNS sonucu kontrol edildi` : "Sertifika kayıtları hazırlanıyor";
    }

    function cancelActiveResearch(showState = true) {
        if (state.controller) {
            state.controller.abort();
            state.controller = null;
            state.runId += 1;
        }
        setBusy(false, state.activeModule);
        if (showState) {
            renderEmpty("Araştırma iptal edildi", "Yeni bir sorgu girebilir veya aynı araştırmayı tekrar başlatabilirsiniz.", "X");
            elements.liveStatus.textContent = "Araştırma iptal edildi.";
        }
    }

    function renderLoading() {
        const box = createElement("div", "osint-empty-state");
        box.append(createElement("span", "", "..."), createElement("strong", "", "Public kaynaklar araştırılıyor"));
        box.append(createElement("p", "", "Modüller birbirinden bağımsız çalışır; erişilemeyen bir kaynak diğer sonuçları engellemez."));
        elements.results.replaceChildren(box);
    }

    function renderEmpty(title, description, mark) {
        const box = createElement("div", "osint-empty-state");
        box.append(createElement("span", "", mark || "OS"), createElement("strong", "", title), createElement("p", "", description));
        elements.results.replaceChildren(box);
    }

    function renderError(error) {
        const box = createElement("div", "osint-empty-state is-error");
        box.append(createElement("span", "", "!"), createElement("strong", "", "Araştırma tamamlanamadı"));
        box.append(createElement("p", "", friendlyError(error)));
        elements.results.replaceChildren(box);
        elements.resultToolbar.hidden = true;
    }

    function friendlyError(error) {
        if (!error) return "Bu kaynak şu anda yanıt vermiyor.";
        if (error.code === "RATE_LIMIT") return "API istek sınırına ulaşıldı. Lütfen kısa bir süre sonra tekrar deneyin.";
        if (error.code === "TIMEOUT") return "Kaynak zamanında yanıt vermedi. Lütfen tekrar deneyin.";
        if (error.code === "NETWORK_OR_CORS") return error.message || "Tarayıcı güvenlik politikası nedeniyle bu bilgi doğrudan alınamadı.";
        return error.message || "Bu kaynak şu anda yanıt vermiyor.";
    }

    function renderResult(moduleId, result) {
        const renderers = {
            domain: renderDomain,
            whois: renderWhois,
            dns: renderDns,
            ip: renderIp,
            headers: renderHeaders,
            subdomains: renderSubdomains,
            url: renderUrl,
            expander: renderExpander,
            "user-agent": renderUserAgent,
            email: renderEmail,
        };
        const content = renderers[moduleId](result);
        elements.results.replaceChildren(content);
    }

    function resultFragment() {
        return document.createDocumentFragment();
    }

    function summaryGrid(items) {
        const grid = createElement("div", "osint-summary-grid");
        items.forEach((item) => {
            const card = createElement("div", "osint-summary-card");
            if (item.tone) card.dataset.tone = item.tone;
            card.append(createElement("span", "", item.label), createElement("strong", "", displayValue(item.value)));
            grid.append(card);
        });
        return grid;
    }

    function makeSection(title, description) {
        const section = createElement("section", "osint-result-section");
        const head = createElement("div", "osint-result-section-head");
        const copy = createElement("div");
        copy.append(createElement("h4", "", title));
        if (description) copy.append(createElement("p", "", description));
        head.append(copy);
        const body = createElement("div", "osint-result-section-body");
        section.append(head, body);
        return { section, head, body };
    }

    function keyValueGrid(items) {
        const grid = createElement("div", "osint-kv-grid");
        items.forEach((item) => {
            const row = createElement("div", "osint-kv-item");
            const value = displayValue(item.value);
            row.append(createElement("span", "osint-kv-label", item.label), createElement("span", "osint-kv-value", value));
            if (item.copy !== false && value !== "Bilinmiyor" && value !== "Alınamadı") {
                const button = createElement("button", "osint-copy-button", "Kopyala");
                button.type = "button";
                button.setAttribute("aria-label", `${item.label} değerini kopyala`);
                button.addEventListener("click", () => copyText(String(item.value), button));
                row.append(button);
            }
            grid.append(row);
        });
        return grid;
    }

    function table(headers, rows) {
        const wrap = createElement("div", "osint-table-wrap");
        const tableNode = createElement("table", "osint-table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headers.forEach((header) => headerRow.append(createElement("th", "", header)));
        thead.append(headerRow);
        const tbody = document.createElement("tbody");
        rows.forEach((values) => {
            const row = document.createElement("tr");
            values.forEach((value) => row.append(createElement("td", "", displayValue(value))));
            tbody.append(row);
        });
        tableNode.append(thead, tbody);
        wrap.append(tableNode);
        return wrap;
    }

    function chips(values) {
        const list = createElement("div", "osint-chip-list");
        (values || []).forEach((value) => list.append(createElement("span", "osint-chip", value)));
        if (!list.children.length) list.append(createElement("span", "osint-chip", "Kayıt yok"));
        return list;
    }

    function warning(message) {
        return createElement("div", "osint-partial-warning", message);
    }

    function rawDetails(data, label = "Ham Sonucu Göster") {
        const details = createElement("details", "osint-details");
        details.append(createElement("summary", "", label), createElement("pre", "", JSON.stringify(data, null, 2)));
        return details;
    }

    function renderDomain(result) {
        const fragment = resultFragment();
        const firstIp = result.dns && result.dns.records.A && result.dns.records.A.records[0]
            ? result.dns.records.A.records[0].value : null;
        fragment.append(summaryGrid([
            { label: "Domain", value: result.domain },
            { label: "IP", value: firstIp || "Alınamadı" },
            { label: "Domain Yaşı", value: result.whois && result.whois.age ? result.whois.age.text : "Alınamadı" },
            { label: "DNS", value: result.dns ? "Aktif" : "Alınamadı", tone: result.dns ? "success" : "warning" },
            { label: "HTTPS", value: result.http ? `Erişildi · HTTP ${result.http.status}` : "Kontrol edilemedi", tone: result.http ? "success" : "warning" },
            { label: "Registrar", value: result.whois ? result.whois.registrar : "Alınamadı" },
        ]));
        Object.entries(result.errors || {}).forEach(([source, error]) => {
            if (error) fragment.append(warning(`${source.toUpperCase()}: ${error.message}`));
        });
        if (result.whois) fragment.append(renderWhoisSection(result.whois));
        if (result.dns) fragment.append(renderDnsSection(result.dns));
        if (result.http) fragment.append(renderHeaderSection(result.http));
        return fragment;
    }

    function renderWhois(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Domain", value: result.domain },
            { label: "Registrar", value: result.registrar },
            { label: "Domain Yaşı", value: result.age ? result.age.text : null },
            { label: "DNSSEC", value: result.dnssec, tone: result.dnssec === "İmzalı" ? "success" : "warning" },
        ]));
        fragment.append(renderWhoisSection(result));
        return fragment;
    }

    function renderWhoisSection(result) {
        const section = makeSection("WHOIS / RDAP Kayıt Bilgileri", "Klasik WHOIS yerine standart, makinece okunabilir RDAP verisi kullanılır.");
        section.body.append(keyValueGrid([
            { label: "Domain", value: result.domain },
            { label: "Registrar", value: result.registrar },
            { label: "Kayıt Tarihi", value: formatDate(result.creationDate) },
            { label: "Bitiş Tarihi", value: formatDate(result.expirationDate) },
            { label: "Güncelleme Tarihi", value: formatDate(result.updatedDate) },
            { label: "Domain Yaşı", value: result.age ? result.age.text : null },
            { label: "DNSSEC", value: result.dnssec },
            { label: "Registry Handle", value: result.handle },
        ]));
        const statusBlock = makeSectionBlock("Domain Durumları", chips(result.statuses));
        const nameserverBlock = makeSectionBlock("Nameserverlar", chips(result.nameservers));
        section.body.append(statusBlock, nameserverBlock);
        section.section.append(rawDetails(result.raw));
        return section.section;
    }

    function makeSectionBlock(title, content) {
        const block = createElement("div");
        const label = createElement("p", "osint-kicker", title);
        label.style.marginTop = "14px";
        block.append(label, content);
        return block;
    }

    function renderDns(result) {
        const fragment = resultFragment();
        const total = Object.values(result.records).reduce((sum, group) => sum + group.records.length, 0);
        fragment.append(summaryGrid([
            { label: "Domain", value: result.domain },
            { label: "Kayıt Türü", value: result.requestedType === "ALL" ? "Tüm Kayıtlar" : result.requestedType },
            { label: "Toplam Kayıt", value: total },
            { label: "Başarılı Tür", value: Object.keys(result.records).length, tone: "success" },
        ]));
        fragment.append(renderDnsSection(result));
        return fragment;
    }

    function renderDnsSection(result) {
        const section = makeSection("DNS Kayıtları", "Sorgular HTTPS üzerinden Google Public DNS JSON API'ye gönderilir.");
        Object.entries(result.errors || {}).forEach(([type, error]) => section.body.append(warning(`${type}: ${error.message}`)));
        const rows = [];
        Object.entries(result.records).forEach(([type, group]) => {
            group.records.forEach((record) => {
                let value = record.value;
                let detail = "";
                if (type === "MX") { value = record.exchange; detail = `Öncelik: ${displayValue(record.priority)}`; }
                if (type === "SOA") { value = record.primaryNameserver; detail = `Sorumlu: ${record.responsibleMailbox} · Serial: ${record.serial}`; }
                if (type === "CAA") { value = record.value; detail = `${displayValue(record.flags)} ${displayValue(record.tag)}`; }
                rows.push([type, record.name, value, detail || "—", record.ttl]);
            });
            if (!group.records.length) rows.push([type, result.domain, "Kayıt bulunamadı", "—", "—"]);
        });
        section.body.append(table(["Tür", "Ad", "Değer", "Detay", "TTL"], rows));
        return section.section;
    }

    function renderIp(result) {
        const fragment = resultFragment();
        if (result.isPrivate) {
            fragment.append(summaryGrid([
                { label: "IP", value: result.ip },
                { label: "Sürüm", value: `IPv${result.version}` },
                { label: "Tür", value: "Private / Yerel", tone: "warning" },
                { label: "Public Konum", value: "Bulunmaz" },
            ]));
            fragment.append(warning(result.note));
            return fragment;
        }
        fragment.append(summaryGrid([
            { label: "IP", value: result.ip },
            { label: "Sürüm", value: `IPv${result.version}` },
            { label: "ASN", value: formatAsn(result.asn) },
            { label: "Ülke", value: [result.country, result.countryCode].filter(Boolean).join(" · ") },
            { label: "Şehir", value: result.city },
            { label: "Ağ", value: result.network },
        ]));
        fragment.append(warning(result.geolocationNotice));
        Object.entries(result.errors || {}).forEach(([source, error]) => {
            if (error) fragment.append(warning(`${source}: ${error.message}`));
        });
        const section = makeSection("IP ve Ağ Bilgileri", "Reverse DNS, geolocation ve RDAP kaynakları bağımsız olarak sorgulanır.");
        section.body.append(keyValueGrid([
            { label: "IP Address", value: result.ip },
            { label: "Reverse Hostname", value: result.reverseHostnames.join(", ") || null },
            { label: "ASN", value: formatAsn(result.asn) },
            { label: "Organization", value: result.organization },
            { label: "ISP", value: result.isp },
            { label: "Network / Prefix", value: result.network },
            { label: "Registry", value: result.registry },
            { label: "Geolocation Kaynağı", value: result.geolocationSource, copy: false },
            { label: "Country", value: result.country },
            { label: "Country Code", value: result.countryCode },
            { label: "Region", value: result.region },
            { label: "City", value: result.city },
            { label: "Postal Code", value: result.postalCode },
            { label: "Timezone", value: result.timezone },
            { label: "Latitude", value: result.latitude },
            { label: "Longitude", value: result.longitude },
        ]));
        if (Number.isFinite(result.latitude) && Number.isFinite(result.longitude)) {
            const link = createElement("a", "osint-external-link", "Haritada Aç");
            link.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(result.latitude)}&mlon=${encodeURIComponent(result.longitude)}#map=10/${encodeURIComponent(result.latitude)}/${encodeURIComponent(result.longitude)}`;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.style.marginTop = "12px";
            section.body.append(link);
        }
        fragment.append(section.section);
        return fragment;
    }

    function renderHeaders(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Status Code", value: `${result.status} ${result.statusText}`.trim() },
            { label: "HTTPS", value: result.finalUrl.startsWith("https://") ? "Aktif" : "Pasif", tone: result.finalUrl.startsWith("https://") ? "success" : "warning" },
            { label: "Görünür Header", value: Object.keys(result.headers).length },
            { label: "Yönlendirme", value: result.redirected ? "Var" : "Yok" },
        ]));
        fragment.append(renderHeaderSection(result));
        return fragment;
    }

    function renderHeaderSection(result) {
        const section = makeSection("HTTP Response Headers", result.visibilityNotice);
        section.body.append(keyValueGrid([
            { label: "İstenen URL", value: result.requestedUrl },
            { label: "Nihai URL", value: result.finalUrl },
            { label: "Status", value: `${result.status} ${result.statusText}`.trim() },
            { label: "SSL / HTTPS", value: result.sslNotice, copy: false },
        ]));
        const security = createElement("div", "osint-status-list");
        result.security.forEach((check) => {
            const row = createElement("div", "osint-status-row");
            row.dataset.status = check.status;
            row.append(createElement("span", "", check.status === "ok" ? "✓" : (check.status === "warning" ? "⚠" : "•")));
            row.append(createElement("strong", "", check.label), createElement("small", "", check.detail));
            security.append(row);
        });
        section.body.append(makeSectionBlock("Security Headers Summary", security));
        const headerRows = Object.entries(result.headers).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value]);
        section.body.append(makeSectionBlock("Görünür Response Header Alanları", headerRows.length ? table(["Header", "Değer"], headerRows) : warning("Sunucu CORS üzerinden görünür bir response header paylaşmadı.")));
        if (result.technologies.length) {
            section.body.append(makeSectionBlock("Güvenilir Teknoloji Sinyalleri", table(["Sinyal", "Kaynak", "Değer"], result.technologies.map((item) => [item.name, item.source, item.value]))));
        }
        return section.section;
    }

    function renderSubdomains(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Domain", value: result.domain },
            { label: "Bulunan", value: result.total },
            { label: "DNS Çözümlenen", value: result.resolvedCount, tone: "success" },
            { label: "Pasif Kaynak", value: result.source },
        ]));
        if (result.limited) fragment.append(warning(`${result.total} benzersiz sonuç bulundu. Tarayıcı yükünü sınırlamak için ilk ${result.limit} kayıt DNS üzerinden kontrol edildi.`));
        const section = makeSection(`${result.total} Subdomain Bulundu`, "Wildcard ve duplicate kayıtlar temizlendi; aktif brute-force yapılmadı.");
        const controls = createElement("div", "osint-subdomain-controls");
        const input = createElement("input", "osint-subdomain-filter");
        input.type = "search";
        input.placeholder = "Subdomain ara...";
        input.setAttribute("aria-label", "Subdomain sonuçlarında ara");
        const sortButton = createElement("button", "secondary-button", "A → Z");
        sortButton.type = "button";
        controls.append(input, sortButton);
        const tableHost = createElement("div");
        let ascending = true;
        const redraw = () => {
            const query = input.value.trim().toLocaleLowerCase("tr-TR");
            const rows = result.results
                .filter((item) => item.subdomain.toLocaleLowerCase("tr-TR").includes(query))
                .sort((a, b) => (ascending ? 1 : -1) * a.subdomain.localeCompare(b.subdomain))
                .map((item) => [item.subdomain, item.ips.join(", ") || "—", item.dnsStatus]);
            tableHost.replaceChildren(table(["Subdomain", "Resolved IP", "DNS Status"], rows));
        };
        input.addEventListener("input", redraw);
        sortButton.addEventListener("click", () => {
            ascending = !ascending;
            sortButton.textContent = ascending ? "A → Z" : "Z → A";
            redraw();
        });
        section.body.append(controls, tableHost);
        redraw();
        fragment.append(section.section);
        return fragment;
    }

    function renderUrl(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Protocol", value: result.protocol.toUpperCase(), tone: result.isHttps ? "success" : "warning" },
            { label: "Hostname", value: result.hostname },
            { label: "URL Uzunluğu", value: `${result.length} karakter` },
            { label: "Query Parametresi", value: result.queryParameters.length },
        ]));
        if (result.hasCredentials) fragment.append(warning("URL içinde kullanıcı adı veya parola biçiminde credentials bulunuyor. Bu bilgi hiçbir kaynağa gönderilmeden yerel olarak tespit edildi."));
        if (result.hasPunycode) fragment.append(warning("Hostname punycode (xn--) içeriyor. Unicode benzerliği nedeniyle adresi dikkatle doğrulayın."));
        const section = makeSection("URL Yapısı", "Bu modül tamamen tarayıcı içinde çalışır; URL hiçbir sunucuya gönderilmez.");
        section.body.append(keyValueGrid([
            { label: "Original URL", value: result.originalUrl },
            { label: "Normalized URL", value: result.normalizedUrl },
            { label: "Protocol", value: result.protocol },
            { label: "Hostname", value: result.hostname },
            { label: "Port", value: result.port },
            { label: "Pathname", value: result.pathname },
            { label: "Fragment", value: result.fragment },
            { label: "Top-level domain", value: result.tld },
            { label: "Encoded karakter", value: result.encodedCharacterCount },
            { label: "Punycode", value: result.hasPunycode ? "Var" : "Yok" },
        ]));
        if (result.queryParameters.length) section.body.append(makeSectionBlock("Query Parametreleri", table(["Parametre", "Değer"], result.queryParameters.map((item) => [item.key, item.value]))));
        fragment.append(section.section);
        return fragment;
    }

    function renderExpander(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Yönlendirme", value: result.redirected ? "Bulundu" : "Bulunmadı", tone: result.redirected ? "success" : "warning" },
            { label: "Nihai Status", value: result.finalStatus },
            { label: "Adım", value: result.chain.length },
            { label: "Nihai Host", value: new URL(result.finalUrl).hostname },
        ]));
        fragment.append(warning(result.limitation));
        const section = makeSection("Redirect Akışı", "URL otomatik olarak açılmaz; yalnızca tarayıcı fetch sonucu analiz edilir.");
        const timeline = createElement("div", "osint-timeline");
        result.chain.forEach((step, index) => {
            const item = createElement("div", "osint-timeline-item");
            item.append(createElement("span", "osint-timeline-dot", String(index + 1)));
            item.append(createElement("span", "osint-timeline-url", step.url), createElement("span", "osint-status-badge", step.status));
            timeline.append(item);
        });
        section.body.append(timeline);
        const copy = createElement("button", "primary-button", "Nihai URL'yi Kopyala");
        copy.type = "button";
        copy.style.marginTop = "12px";
        copy.addEventListener("click", () => copyText(result.finalUrl, copy));
        section.body.append(copy);
        fragment.append(section.section);
        return fragment;
    }

    function renderUserAgent(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Browser", value: result.browser },
            { label: "Sürüm", value: result.browserVersion },
            { label: "İşletim Sistemi", value: result.operatingSystem },
            { label: "Cihaz", value: result.deviceType },
            { label: "Engine", value: result.engine },
            { label: "Bot / Crawler", value: result.isBot ? "Algılandı" : "Algılanmadı", tone: result.isBot ? "warning" : "success" },
        ]));
        const section = makeSection("User-Agent Analizi", "Regex tabanlı yerel analizdir; nadir veya değiştirilmiş User-Agent değerleri bilinmiyor görünebilir.");
        section.body.append(keyValueGrid([
            { label: "Browser", value: result.browser },
            { label: "Browser Version", value: result.browserVersion },
            { label: "Rendering Engine", value: result.engine },
            { label: "Operating System", value: result.operatingSystem },
            { label: "OS Version", value: result.osVersion },
            { label: "Device Type", value: result.deviceType },
            { label: "Architecture", value: result.architecture },
            { label: "Mobile", value: result.isMobile ? "Evet" : "Hayır" },
            { label: "Bot / Crawler", value: result.isBot ? "Evet" : "Hayır" },
            { label: "Ham User-Agent", value: result.raw },
        ]));
        fragment.append(section.section);
        return fragment;
    }

    function renderEmail(result) {
        const fragment = resultFragment();
        fragment.append(summaryGrid([
            { label: "Syntax", value: result.syntaxValid ? "Geçerli" : "Geçersiz", tone: result.syntaxValid ? "success" : "warning" },
            { label: "Domain", value: result.domain },
            { label: "MX", value: result.mxAvailable ? "Mevcut" : "Bulunamadı", tone: result.mxAvailable ? "success" : "warning" },
            { label: "Disposable", value: result.disposable ? "Listede" : "Listede değil", tone: result.disposable ? "warning" : "success" },
        ]));
        fragment.append(warning(result.privacyNotice));
        const section = makeSection("E-posta ve Domain Bilgileri", result.disposableCheckCoverage);
        section.body.append(keyValueGrid([
            { label: "E-posta", value: result.email },
            { label: "Local Part", value: result.localPart },
            { label: "Domain", value: result.domain },
            { label: "TLD", value: result.tld },
            { label: "MX Availability", value: result.mxAvailable ? "Mevcut" : "Bulunamadı" },
            { label: "Domain DNS Status", value: result.domainDnsActive ? "Aktif" : "Kayıt bulunamadı" },
            { label: "Disposable Domain", value: result.disposable ? "Bilinen listede" : "Bilinen listede değil" },
        ]));
        section.body.append(makeSectionBlock("MX Sunucuları", result.mxServers.length
            ? table(["Öncelik", "Sunucu", "TTL"], result.mxServers.map((mx) => [mx.priority, mx.exchange, mx.ttl]))
            : warning("MX kaydı bulunamadı. Bu durum tek başına e-posta adresinin varlığı hakkında bilgi vermez.")));
        fragment.append(section.section);
        return fragment;
    }

    function displayValue(value) {
        if (value === null || value === undefined || value === "") return "Bilinmiyor";
        if (Array.isArray(value)) return value.length ? value.join(", ") : "Bilinmiyor";
        if (typeof value === "boolean") return value ? "Evet" : "Hayır";
        return String(value);
    }

    function formatDate(value) {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(date);
    }

    function formatDuration(milliseconds) {
        return Math.max(0.01, milliseconds / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    }

    function formatAsn(value) {
        if (value === null || value === undefined || value === "") return null;
        const normalized = String(value).trim();
        return /^AS/i.test(normalized) ? normalized.toUpperCase() : `AS${normalized}`;
    }

    async function copyText(text, button) {
        if (!text) return;
        const original = button ? button.textContent : "";
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
            else {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.append(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
            }
            if (button) {
                button.textContent = "Kopyalandı";
                setTimeout(() => { button.textContent = original; }, 1200);
            }
        } catch (_error) {
            if (button) {
                button.textContent = "Kopyalanamadı";
                setTimeout(() => { button.textContent = original; }, 1500);
            }
        }
    }

    function downloadJson() {
        if (!state.exportData) return;
        try {
            const blob = new Blob([JSON.stringify(state.exportData, null, 2)], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `osint-${safeFilePart(state.exportData.queryType)}-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (_error) {
            showMessage(elements.formError, "JSON dosyası hazırlanamadı.");
        }
    }

    function safeFilePart(value) {
        return String(value || "result").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "result";
    }

    function loadHistory() {
        try {
            const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            return Array.isArray(value) ? value.slice(0, 10) : [];
        } catch (_error) {
            return [];
        }
    }

    function addHistory(query, moduleId) {
        const safeQuery = Core.sanitizeHistoryQuery(query, moduleId);
        const existing = loadHistory().filter((item) => !(item.query === safeQuery && item.moduleId === moduleId));
        const next = [{ query: safeQuery, moduleId, timestamp: new Date().toISOString() }, ...existing].slice(0, 10);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (_error) { /* Storage may be disabled. */ }
        renderHistory();
    }

    function clearHistory() {
        try { localStorage.removeItem(HISTORY_KEY); } catch (_error) { /* Storage may be disabled. */ }
        renderHistory();
    }

    function renderHistory() {
        const history = loadHistory();
        if (!history.length) {
            elements.historyList.replaceChildren(createElement("div", "osint-history-empty", "Henüz bir araştırma yapılmadı."));
            return;
        }
        const fragment = document.createDocumentFragment();
        history.forEach((item) => {
            const definition = MODULES[item.moduleId];
            if (!definition) return;
            const button = createElement("button", "osint-history-item");
            button.type = "button";
            const copy = createElement("span");
            copy.append(createElement("strong", "", item.query), createElement("small", "", definition.title));
            button.append(copy, createElement("span", "osint-history-time", timeAgo(item.timestamp)));
            button.addEventListener("click", () => {
                selectModule(item.moduleId, { value: item.query });
                runResearch(item.moduleId, item.query);
            });
            fragment.append(button);
        });
        elements.historyList.replaceChildren(fragment);
    }

    function timeAgo(timestamp) {
        const elapsed = Date.now() - new Date(timestamp).getTime();
        if (!Number.isFinite(elapsed) || elapsed < 60000) return "şimdi";
        const minutes = Math.floor(elapsed / 60000);
        if (minutes < 60) return `${minutes} dk`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} sa`;
        return `${Math.floor(hours / 24)} gün`;
    }

    function showMessage(element, message) {
        element.textContent = message;
        element.hidden = false;
    }

    function hideMessage(element) {
        element.textContent = "";
        element.hidden = true;
    }

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
}());
