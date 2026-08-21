(function initializeCurrencyRatesTool() {
    "use strict";

    const core = window.CurrencyRatesCore;
    const panel = document.getElementById("doviz-kurlari");
    if (!core || !panel) return;

    const API_BASE = "https://api.frankfurter.dev/v2";
    const CACHE_KEY = "omni-tools:currency-rates:v1";
    const FETCH_TIMEOUT_MS = 15000;
    const elements = {
        amount: document.getElementById("currency-amount"),
        converterForm: document.getElementById("currency-converter-form"),
        converterResult: document.getElementById("currency-converter-result"),
        converterStatus: document.getElementById("currency-converter-status"),
        count: document.getElementById("currency-total-count"),
        directorySummary: document.getElementById("currency-directory-summary"),
        from: document.getElementById("currency-from"),
        lastUpdated: document.getElementById("currency-last-updated"),
        list: document.getElementById("currency-rates-list"),
        notice: document.getElementById("currency-rates-notice"),
        rateDate: document.getElementById("currency-rate-date"),
        refresh: document.getElementById("currency-rates-refresh"),
        search: document.getElementById("currency-search-input"),
        searchClear: document.getElementById("currency-search-clear"),
        swap: document.getElementById("currency-swap"),
        to: document.getElementById("currency-to"),
    };

    const state = {
        entries: [],
        entriesByCode: new Map(),
        hasLoaded: false,
        isLoading: false,
        retrievedAt: null,
    };

    const currencyDisplayNames = typeof Intl.DisplayNames === "function"
        ? new Intl.DisplayNames(["tr-TR", "tr"], { type: "currency" })
        : null;

    elements.converterForm.addEventListener("submit", (event) => event.preventDefault());
    elements.amount.addEventListener("input", updateConversion);
    elements.from.addEventListener("change", updateConversion);
    elements.to.addEventListener("change", updateConversion);
    elements.swap.addEventListener("click", swapCurrencies);
    elements.refresh.addEventListener("click", () => loadRates({ force: true }));
    elements.search.addEventListener("input", renderFilteredRates);
    elements.searchClear.addEventListener("click", () => {
        elements.search.value = "";
        elements.search.focus();
        renderFilteredRates();
    });

    document.addEventListener("tool-activated", (event) => {
        if (event.detail?.tool === "doviz-kurlari") loadRates();
    });

    if (panel.classList.contains("active")) loadRates();

    async function loadRates({ force = false } = {}) {
        if (state.isLoading || (state.hasLoaded && !force)) return;
        state.isLoading = true;
        setLoadingState();

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
            const [currenciesResponse, ratesResponse] = await Promise.all([
                fetch(`${API_BASE}/currencies`, { signal: controller.signal }),
                fetch(`${API_BASE}/rates?base=TRY`, { signal: controller.signal }),
            ]);
            if (!currenciesResponse.ok || !ratesResponse.ok) {
                throw new Error(`Kur servisi ${ratesResponse.status || currenciesResponse.status} durum kodu döndürdü.`);
            }

            const [metadata, rateRows] = await Promise.all([
                currenciesResponse.json(),
                ratesResponse.json(),
            ]);
            const entries = core.buildCurrencyEntries(metadata, rateRows, currencyDisplayNames);
            if (!entries.length) throw new Error("Kur servisi geçerli para birimi verisi döndürmedi.");

            const retrievedAt = new Date();
            applyRates(entries, retrievedAt);
            writeCache({ metadata, rateRows, retrievedAt: retrievedAt.toISOString() });
            setNotice("", "");
        } catch (error) {
            const cachedData = readCache();
            if (cachedData) {
                const cachedEntries = core.buildCurrencyEntries(
                    cachedData.metadata,
                    cachedData.rateRows,
                    currencyDisplayNames,
                );
                applyRates(cachedEntries, new Date(cachedData.retrievedAt));
                setNotice("Canlı kur servisine ulaşılamadı. Son kaydedilen veriler gösteriliyor.", "warning");
            } else {
                showLoadError(error);
            }
        } finally {
            window.clearTimeout(timeoutId);
            state.isLoading = false;
            elements.refresh.disabled = false;
            elements.refresh.textContent = "Kurları Yenile";
        }
    }

    function setLoadingState() {
        elements.refresh.disabled = true;
        elements.refresh.textContent = "Yükleniyor…";
        elements.list.setAttribute("aria-busy", "true");
        elements.converterStatus.textContent = "Veriler yükleniyor";
        setNotice("", "");

        if (!state.hasLoaded) {
            elements.list.replaceChildren(createEmptyState(
                "Kurlar yükleniyor",
                "Güncel para birimi verileri Frankfurter üzerinden alınıyor.",
                "is-loading",
            ));
        }
    }

    function applyRates(entries, retrievedAt) {
        state.entries = entries;
        state.entriesByCode = new Map(entries.map((entry) => [entry.code, entry]));
        state.retrievedAt = retrievedAt;
        state.hasLoaded = true;

        populateCurrencySelect(elements.from, "TRY");
        populateCurrencySelect(elements.to, "USD");
        elements.from.disabled = false;
        elements.to.disabled = false;
        elements.swap.disabled = false;
        elements.search.disabled = false;
        elements.count.textContent = `${entries.length} para birimi`;
        elements.converterStatus.textContent = "Kurlar hazır";

        const dates = entries.map((entry) => entry.date).filter(Boolean).sort();
        elements.rateDate.textContent = dates.length ? formatRateDate(dates[dates.length - 1]) : "Bilinmiyor";
        elements.lastUpdated.textContent = formatDateTime(retrievedAt);
        elements.list.setAttribute("aria-busy", "false");

        renderFilteredRates();
        updateConversion();
    }

    function populateCurrencySelect(select, preferredCode) {
        const previousValue = select.value;
        const selectedCode = state.entriesByCode.has(previousValue) ? previousValue : preferredCode;
        const fragment = document.createDocumentFragment();

        state.entries.forEach((entry) => {
            const option = document.createElement("option");
            option.value = entry.code;
            option.textContent = `${entry.code} — ${entry.name}`;
            option.selected = entry.code === selectedCode;
            fragment.append(option);
        });
        select.replaceChildren(fragment);
    }

    function renderFilteredRates() {
        if (!state.hasLoaded) return;
        const query = core.normalizeSearchText(elements.search.value.trim());
        const filteredEntries = query
            ? state.entries.filter((entry) => entry.searchText.includes(query))
            : state.entries;

        elements.searchClear.hidden = !elements.search.value;
        elements.directorySummary.textContent = query
            ? `${filteredEntries.length} eşleşme bulundu.`
            : `${state.entries.length} desteklenen para birimi gösteriliyor.`;

        if (!filteredEntries.length) {
            elements.list.replaceChildren(createEmptyState(
                "Sonuç bulunamadı",
                "Farklı bir para birimi kodu veya adı deneyin.",
                "",
            ));
            return;
        }

        const fragment = document.createDocumentFragment();
        filteredEntries.forEach((entry) => fragment.append(createRateCard(entry)));
        elements.list.replaceChildren(fragment);
    }

    function createRateCard(entry) {
        const card = document.createElement("article");
        const identity = document.createElement("div");
        const flag = document.createElement("span");
        const name = document.createElement("div");
        const code = document.createElement("strong");
        const fullName = document.createElement("span");
        const value = document.createElement("div");
        const rate = document.createElement("strong");
        const label = document.createElement("span");

        card.className = "currency-rate-card";
        identity.className = "currency-rate-identity";
        flag.className = "currency-flag";
        flag.setAttribute("aria-hidden", "true");
        renderFlag(flag, entry);
        code.textContent = entry.code;
        fullName.textContent = entry.name;
        value.className = "currency-rate-value";
        rate.textContent = `${formatNumber(entry.tryValue)} TL`;
        label.textContent = `1 ${entry.code}`;

        name.append(code, fullName);
        identity.append(flag, name);
        value.append(rate, label);
        card.append(identity, value);
        return card;
    }

    function renderFlag(container, entry) {
        const fallback = document.createElement("span");
        fallback.className = `currency-flag-code is-${entry.visualKind || "flag"}`;
        fallback.dataset.currency = entry.code;
        fallback.textContent = entry.badge;

        if (!entry.flagRegion) {
            container.append(fallback);
            return;
        }

        const image = document.createElement("img");
        image.crossOrigin = "anonymous";
        image.src = `https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${entry.flagRegion.toLowerCase()}.svg`;
        image.alt = "";
        image.width = 28;
        image.height = 21;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => container.replaceChildren(fallback), { once: true });
        container.append(image);
    }

    function updateConversion() {
        if (!state.hasLoaded) return;
        const amount = elements.amount.valueAsNumber;
        const fromCode = elements.from.value;
        const toCode = elements.to.value;
        const converted = core.convertAmount(amount, fromCode, toCode, state.entriesByCode);
        const label = elements.converterResult.querySelector("span");
        const result = elements.converterResult.querySelector("strong");
        const detail = elements.converterResult.querySelector("small");

        if (converted === null) {
            label.textContent = "Geçerli bir miktar girin";
            result.textContent = "—";
            detail.textContent = "Miktar sıfır veya daha büyük bir sayı olmalıdır.";
            elements.converterResult.classList.add("is-error");
            return;
        }

        elements.converterResult.classList.remove("is-error");
        label.textContent = `${formatNumber(amount)} ${fromCode}`;
        result.textContent = `${formatNumber(converted)} ${toCode}`;
        const unitRate = core.convertAmount(1, fromCode, toCode, state.entriesByCode);
        detail.textContent = `1 ${fromCode} = ${formatNumber(unitRate)} ${toCode}`;
    }

    function swapCurrencies() {
        const previousFrom = elements.from.value;
        elements.from.value = elements.to.value;
        elements.to.value = previousFrom;
        updateConversion();
        elements.swap.classList.remove("is-swapping");
        void elements.swap.offsetWidth;
        elements.swap.classList.add("is-swapping");
    }

    function showLoadError(error) {
        const isTimeout = error?.name === "AbortError";
        const detail = isTimeout
            ? "Kur servisi zaman aşımına uğradı. İnternet bağlantınızı kontrol edip yeniden deneyin."
            : "Güncel kurlar alınamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.";
        elements.list.setAttribute("aria-busy", "false");
        elements.list.replaceChildren(createEmptyState("Kurlar yüklenemedi", detail, "is-error"));
        elements.directorySummary.textContent = "Kur verisine şu anda ulaşılamıyor.";
        elements.converterStatus.textContent = "Bağlantı hatası";
        elements.rateDate.textContent = "—";
        elements.lastUpdated.textContent = "—";
        elements.count.textContent = "—";
        setNotice(detail, "error");
    }

    function createEmptyState(title, description, className) {
        const container = document.createElement("div");
        const heading = document.createElement("strong");
        const detail = document.createElement("span");
        container.className = `currency-rates-empty${className ? ` ${className}` : ""}`;
        heading.textContent = title;
        detail.textContent = description;
        container.append(heading, detail);
        return container;
    }

    function setNotice(message, tone) {
        elements.notice.hidden = !message;
        elements.notice.className = `currency-rates-notice${tone ? ` is-${tone}` : ""}`;
        elements.notice.textContent = message;
    }

    function formatNumber(value) {
        const absoluteValue = Math.abs(Number(value));
        const maximumFractionDigits = absoluteValue > 0 && absoluteValue < 0.01 ? 8 : 4;
        return new Intl.NumberFormat("tr-TR", {
            maximumFractionDigits,
            minimumFractionDigits: 0,
        }).format(value);
    }

    function formatRateDate(value) {
        const date = new Date(`${value}T12:00:00Z`);
        return Number.isNaN(date.getTime())
            ? value
            : new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "UTC" }).format(date);
    }

    function formatDateTime(value) {
        return new Intl.DateTimeFormat("tr-TR", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(value);
    }

    function writeCache(data) {
        try {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
            // Depolama kapalıysa araç canlı veriyle çalışmaya devam eder.
        }
    }

    function readCache() {
        try {
            const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY));
            if (!cached?.metadata || !cached?.rateRows || !cached?.retrievedAt) return null;
            return cached;
        } catch {
            return null;
        }
    }
}());
