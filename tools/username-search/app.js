(function initializeUsernameSearchApp() {
    "use strict";

    const core = window.UsernameSearchCore;
    const platforms = window.UsernameSearchPlatforms;
    const config = window.UsernameSearchConfig || {};
    const form = document.getElementById("username-search-form");
    if (!core || !Array.isArray(platforms) || !form) return;

    const elements = {
        input: document.getElementById("username-search-input"),
        submit: document.getElementById("username-search-submit"),
        stop: document.getElementById("username-search-stop"),
        error: document.getElementById("username-search-error"),
        progress: document.getElementById("username-search-progress"),
        progressTitle: document.getElementById("username-search-progress-title"),
        progressCount: document.getElementById("username-search-progress-count"),
        progressBar: document.getElementById("username-search-progress-bar"),
        summary: document.getElementById("username-search-summary"),
        summaryChecked: document.getElementById("username-search-summary-checked"),
        summaryFound: document.getElementById("username-search-summary-found"),
        summaryNotFound: document.getElementById("username-search-summary-not-found"),
        summaryUnknown: document.getElementById("username-search-summary-unknown"),
        controls: document.getElementById("username-search-result-controls"),
        filters: Array.from(document.querySelectorAll("[data-username-result-filter]")),
        foundOnly: document.getElementById("username-search-found-only"),
        platformFilter: document.getElementById("username-search-platform-filter"),
        results: document.getElementById("username-search-results"),
        empty: document.getElementById("username-search-empty"),
        emptyTitle: document.getElementById("username-search-empty-title"),
        emptyCopy: document.getElementById("username-search-empty-copy"),
        exportControls: document.getElementById("username-search-export"),
        exportFormat: document.getElementById("username-search-export-format"),
        download: document.getElementById("username-search-download"),
        liveStatus: document.getElementById("username-search-live-status"),
        modeBadge: document.getElementById("username-search-mode-badge"),
    };

    if (Object.values(elements).some((value) => value === null)) return;

    const state = {
        scanId: 0,
        controller: null,
        username: "",
        searchedAt: "",
        results: new Map(),
        filter: "all",
        platformQuery: "",
        running: false,
        completed: false,
        stopped: false,
        stopRequested: false,
    };

    const apiBaseUrl = core.normalizeApiBaseUrl(config.apiBaseUrl);
    elements.modeBadge.textContent = apiBaseUrl ? "Backend destekli kontrol" : "Tarayıcı kontrolü";

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void startSearch();
    });
    elements.stop.addEventListener("click", stopSearch);
    elements.filters.forEach((button) => {
        button.addEventListener("click", () => {
            state.filter = button.dataset.usernameResultFilter || "all";
            elements.foundOnly.checked = state.filter === "found";
            renderResults();
        });
    });
    elements.foundOnly.addEventListener("change", () => {
        state.filter = elements.foundOnly.checked ? "found" : "all";
        renderResults();
    });
    elements.platformFilter.addEventListener("input", () => {
        state.platformQuery = elements.platformFilter.value.trim().toLocaleLowerCase("tr-TR");
        renderResults();
    });
    elements.download.addEventListener("click", downloadResults);
    elements.input.addEventListener("input", clearInputError);
    elements.input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        form.requestSubmit();
    });
    document.addEventListener("tool-activated", (event) => {
        if (event.detail?.tool !== "username-search") return;
        window.setTimeout(() => elements.input.focus({ preventScroll: true }), 120);
    });

    renderResults();

    async function startSearch() {
        const validation = core.validateUsername(elements.input.value);
        if (!validation.valid) {
            showInputError(validation.message);
            return;
        }

        if (state.controller) state.controller.abort();
        const scanId = state.scanId + 1;
        const controller = new AbortController();
        state.scanId = scanId;
        state.controller = controller;
        state.username = validation.username;
        state.searchedAt = new Date().toISOString();
        state.results = new Map();
        state.filter = "all";
        state.platformQuery = "";
        state.running = true;
        state.completed = false;
        state.stopped = false;
        state.stopRequested = false;
        elements.input.value = validation.username;
        elements.platformFilter.value = "";
        elements.foundOnly.checked = false;
        clearInputError();
        renderResults();
        updateScanChrome();

        let nextIndex = 0;
        const workerCount = Math.min(6, platforms.length);
        const runWorker = async () => {
            while (!controller.signal.aborted) {
                const platformIndex = nextIndex;
                nextIndex += 1;
                if (platformIndex >= platforms.length) return;
                const platform = platforms[platformIndex];
                let result;

                try {
                    result = await core.checkPlatformWithBackend(platform, state.username, {
                        signal: controller.signal,
                        timeoutMs: 12000,
                        apiBaseUrl,
                    });
                } catch (error) {
                    if (error?.name === "AbortError" || controller.signal.aborted) return;
                    result = createUnexpectedErrorResult(platform, state.username);
                }

                if (state.scanId !== scanId || controller.signal.aborted) return;
                state.results.set(platform.id, result);
                updateScanChrome();
                renderResults();
            }
        };

        try {
            await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
        } catch (_error) {
            // Workers convert individual platform errors to results. This guard
            // prevents an unexpected rejection from escaping the UI lifecycle.
        }

        if (state.scanId !== scanId) return;
        state.running = false;
        state.stopped = controller.signal.aborted;
        state.completed = !controller.signal.aborted;
        state.controller = null;
        updateScanChrome();
        renderResults();
    }

    function createUnexpectedErrorResult(platform, username) {
        return {
            id: platform.id,
            platform: platform.name,
            username,
            url: core.interpolateTemplate(platform.profileUrl, username),
            priority: platform.priority || 0,
            iconUrl: platform.iconUrl || "",
            checkedAt: new Date().toISOString(),
            durationMs: 0,
            status: "error",
            detail: "Beklenmeyen bir kontrol hatası oluştu.",
        };
    }

    function stopSearch() {
        if (!state.running || !state.controller) return;
        state.stopRequested = true;
        elements.progressTitle.textContent = "Tarama durduruluyor";
        elements.liveStatus.textContent = "Aktif platform istekleri iptal ediliyor.";
        state.controller.abort();
    }

    function showInputError(message) {
        elements.input.setAttribute("aria-invalid", "true");
        elements.error.textContent = message;
        elements.error.hidden = false;
        elements.input.focus();
    }

    function clearInputError() {
        elements.input.removeAttribute("aria-invalid");
        elements.error.textContent = "";
        elements.error.hidden = true;
    }

    function updateScanChrome() {
        const checked = state.results.size;
        const total = platforms.length;
        const percentage = total ? Math.round((checked / total) * 100) : 0;
        const results = Array.from(state.results.values());
        const summary = core.buildSummary(results);

        elements.progress.hidden = !state.username;
        elements.summary.hidden = !state.username;
        elements.controls.hidden = !state.username;
        elements.stop.hidden = !state.running;
        elements.submit.textContent = state.running ? "Yeni Arama" : "Ara";
        elements.progressCount.textContent = `${checked} / ${total}`;
        elements.progressBar.style.setProperty("--username-progress", `${percentage}%`);
        elements.progressBar.setAttribute("aria-valuenow", String(checked));
        elements.progressBar.setAttribute("aria-valuemax", String(total));
        elements.summaryChecked.textContent = String(summary.checked);
        elements.summaryFound.textContent = String(summary.found);
        elements.summaryNotFound.textContent = String(summary.notFound);
        elements.summaryUnknown.textContent = String(summary.unknown);
        elements.exportControls.hidden = state.running || results.length === 0;

        if (state.running) {
            elements.progressTitle.textContent = `${total} platform kontrol ediliyor...`;
            elements.liveStatus.textContent = `${checked} / ${total} platform kontrol edildi.`;
        } else if (state.stopped) {
            elements.progressTitle.textContent = "Tarama durduruldu";
            elements.liveStatus.textContent = `Tarama durduruldu. ${checked} platform sonucu hazır.`;
        } else if (state.completed) {
            elements.progressTitle.textContent = "Tarama tamamlandı";
            elements.liveStatus.textContent = `Tarama tamamlandı. ${summary.found} hesap bulundu.`;
        }
    }

    function renderResults() {
        const allResults = core.sortResults(Array.from(state.results.values()));
        const counts = {
            all: allResults.length,
            found: allResults.filter((result) => result.status === "found").length,
            notFound: allResults.filter((result) => result.status === "notFound").length,
            unknown: allResults.filter((result) => ["unknown", "error"].includes(result.status)).length,
        };

        elements.filters.forEach((button) => {
            const filter = button.dataset.usernameResultFilter || "all";
            const isActive = state.filter === filter;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
            const count = button.querySelector("span");
            if (count) count.textContent = String(counts[filter] || 0);
        });

        const filtered = allResults.filter((result) => {
            const matchesStatus = state.filter === "all"
                || result.status === state.filter
                || (state.filter === "unknown" && result.status === "error");
            const matchesPlatform = !state.platformQuery
                || result.platform.toLocaleLowerCase("tr-TR").includes(state.platformQuery);
            return matchesStatus && matchesPlatform;
        });

        const fragment = document.createDocumentFragment();
        filtered.forEach((result) => fragment.appendChild(createResultCard(result)));
        elements.results.replaceChildren(fragment);

        if (!state.username) {
            setEmptyState("Arama için hazır", "Kullanıcı adını yazıp Ara butonuna basın.", true);
        } else if (state.running && allResults.length === 0) {
            elements.empty.hidden = true;
            elements.results.replaceChildren(createSkeleton(), createSkeleton(), createSkeleton());
        } else if (filtered.length === 0) {
            setEmptyState("Filtreyle eşleşen sonuç yok", "Filtreleri veya platform aramasını değiştirmeyi deneyin.", true);
        } else {
            elements.empty.hidden = true;
        }
    }

    function setEmptyState(title, copy, visible) {
        elements.emptyTitle.textContent = title;
        elements.emptyCopy.textContent = copy;
        elements.empty.hidden = !visible;
    }

    function createSkeleton() {
        const skeleton = document.createElement("div");
        skeleton.className = "username-result-card username-result-skeleton";
        skeleton.setAttribute("aria-hidden", "true");
        skeleton.innerHTML = "<span></span><div><i></i><i></i><i></i></div>";
        return skeleton;
    }

    function createResultCard(result) {
        const card = document.createElement("article");
        const icon = document.createElement("div");
        const fallback = document.createElement("span");
        const body = document.createElement("div");
        const heading = document.createElement("div");
        const titleGroup = document.createElement("div");
        const title = document.createElement("h3");
        const username = document.createElement("span");
        const status = document.createElement("span");
        const profileUrl = document.createElement("span");
        const detail = document.createElement("p");
        const actions = document.createElement("div");

        card.className = `username-result-card is-${result.status}`;
        icon.className = "username-result-icon";
        fallback.className = "username-result-icon-fallback";
        fallback.textContent = getPlatformInitials(result.platform);
        icon.appendChild(fallback);
        if (result.iconUrl) {
            const image = document.createElement("img");
            image.src = result.iconUrl;
            image.alt = "";
            image.loading = "lazy";
            image.referrerPolicy = "no-referrer";
            image.addEventListener("load", () => fallback.setAttribute("aria-hidden", "true"), { once: true });
            image.addEventListener("error", () => image.remove(), { once: true });
            icon.appendChild(image);
        }

        body.className = "username-result-body";
        heading.className = "username-result-heading";
        titleGroup.className = "username-result-title";
        title.textContent = result.platform;
        username.textContent = `@${result.username}`;
        titleGroup.append(title, username);
        status.className = "username-result-status";
        status.textContent = `${getStatusSymbol(result.status)} ${getStatusCopy(result.status)}`;
        heading.append(titleGroup, status);
        profileUrl.className = "username-result-url";
        profileUrl.textContent = result.url;
        profileUrl.title = result.url;
        detail.className = "username-result-detail";
        detail.textContent = result.detail;
        body.append(heading, profileUrl, detail);

        actions.className = "username-result-actions";
        if (result.status !== "notFound") {
            const link = document.createElement("a");
            link.className = result.status === "found" ? "primary-button" : "secondary-button";
            link.href = result.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = result.status === "found" ? "Profili Aç" : "Adresi Aç";
            link.setAttribute("aria-label", `${result.platform} ${result.status === "found" ? "profilini" : "adresini"} yeni sekmede aç`);
            actions.appendChild(link);
        }

        card.append(icon, body, actions);
        return card;
    }

    function getPlatformInitials(name) {
        return name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
    }

    function getStatusSymbol(status) {
        return { found: "✓", notFound: "×", unknown: "?", error: "!" }[status] || "?";
    }

    function getStatusCopy(status) {
        return {
            found: "Hesap Bulundu",
            notFound: "Bulunamadı",
            unknown: "Kontrol Edilemedi",
            error: "Hata / Rate Limit",
        }[status] || "Kontrol Edilemedi";
    }

    function downloadResults() {
        const results = Array.from(state.results.values());
        if (!results.length) return;
        const payload = core.buildExportPayload(state.username, state.searchedAt, results, { stopped: state.stopped });
        const format = elements.exportFormat.value;
        let content;
        let mimeType;
        if (format === "csv") {
            content = core.exportAsCsv(payload);
            mimeType = "text/csv;charset=utf-8";
        } else if (format === "txt") {
            content = core.exportAsText(payload);
            mimeType = "text/plain;charset=utf-8";
        } else {
            content = core.exportAsJson(payload);
            mimeType = "application/json;charset=utf-8";
        }

        const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
        const anchor = document.createElement("a");
        const date = state.searchedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
        anchor.href = blobUrl;
        anchor.download = `username-search-${core.safeFilenamePart(state.username)}-${date}.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
        elements.liveStatus.textContent = `${format.toLocaleUpperCase("tr-TR")} sonuç dosyası indirildi.`;
    }
})();
