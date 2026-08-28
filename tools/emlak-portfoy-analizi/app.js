(function initRealEstateAnalysisApp() {
    "use strict";

    const panel = document.getElementById("emlak-portfoy-analizi");
    const form = document.getElementById("real-estate-form");
    const core = window.RealEstateAnalysisCore;
    const config = window.RealEstateAnalysisConfig;
    if (!panel || !form || !core || !config) return;

    const currencyFields = new Set([
        "price", "dues", "monthlyRent", "annualExpenses", "landComparablePrice",
        "titleDeedTransactionValue", "buyerOtherCosts", "sellerOtherCosts", "deposit",
        "rentalServiceFee", "offerPrice",
    ]);
    const decimalFields = new Set([
        "netArea", "grossArea", "totalArea", "floorAreaRatio", "buyerTitleDeedRate",
        "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate", "vatRate", "rentalVatRate",
    ]);
    const integerFields = new Set(["buildingAge", "totalFloors"]);
    const elements = {
        roomField: document.getElementById("real-estate-room-field"),
        netField: document.getElementById("real-estate-net-field"),
        grossField: document.getElementById("real-estate-gross-field"),
        buildingAgeField: document.getElementById("real-estate-building-age-field"),
        floorField: document.getElementById("real-estate-floor-field"),
        totalFloorsField: document.getElementById("real-estate-total-floors-field"),
        duesField: document.getElementById("real-estate-dues-field"),
        landDetails: document.getElementById("real-estate-land-details"),
        saleInvestment: document.getElementById("real-estate-sale-investment"),
        saleCosts: document.getElementById("real-estate-sale-costs"),
        rentalCosts: document.getElementById("real-estate-rental-costs"),
        priceLabel: document.getElementById("real-estate-price-label"),
        totalTitleRate: document.getElementById("real-estate-total-title-rate"),
        totalServiceRate: document.getElementById("real-estate-total-service-rate"),
        serviceRateWarning: document.getElementById("real-estate-service-rate-warning"),
        rentalServiceWarning: document.getElementById("real-estate-rental-service-warning"),
        errors: document.getElementById("real-estate-errors"),
        emptyResult: document.getElementById("real-estate-empty-result"),
        saleResult: document.getElementById("real-estate-sale-result"),
        landResult: document.getElementById("real-estate-land-result"),
        rentalResult: document.getElementById("real-estate-rental-result"),
        reset: document.getElementById("real-estate-reset"),
        clearStorage: document.getElementById("real-estate-clear-storage"),
        copy: document.getElementById("real-estate-copy"),
        buyerCopy: document.getElementById("real-estate-buyer-copy"),
        ownerCopy: document.getElementById("real-estate-owner-copy"),
        landCopy: document.getElementById("real-estate-land-copy"),
        rentalCopy: document.getElementById("real-estate-rental-copy"),
        buyerWhatsapp: document.getElementById("real-estate-buyer-whatsapp"),
        ownerWhatsapp: document.getElementById("real-estate-owner-whatsapp"),
        copyStatus: document.getElementById("real-estate-copy-status"),
    };
    let latestResult = null;
    let latestState = null;
    let rentalServiceFeeCustomized = false;
    let titleDeedTransactionValueCustomized = false;
    let hasSuccessfulAnalysis = false;
    let autoCalculationTimer = null;
    let copyStatusTimer = null;

    function parseCurrency(value) {
        const text = String(value ?? "").trim();
        if (!text) return null;
        const digits = text.replace(/\D/g, "");
        if (!digits) return null;
        const number = Number(digits);
        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    function parseLocalizedDecimal(value) {
        const text = String(value ?? "").trim().replace(/\s/g, "");
        if (!text) return null;
        let normalized = text;
        if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
        else if (normalized.includes(",") && normalized.includes(".")) {
            normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
                ? normalized.replace(/\./g, "").replace(",", ".")
                : normalized.replace(/,/g, "");
        } else normalized = normalized.replace(",", ".");
        const number = Number(normalized);
        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    function formatCurrencyInput(value) {
        const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (!digits) return "";
        const number = Number(digits);
        return Number.isFinite(number) ? number.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) : "";
    }

    function sanitizeDecimalInput(value) {
        const normalized = String(value ?? "").replace(/[^\d,.]/g, "").replace(/,/g, ".");
        const parts = normalized.split(".");
        return parts.length > 1 ? `${parts.shift()}.${parts.join("").slice(0, 2)}` : parts[0];
    }

    function getTransactionType() {
        return form.elements.transactionType.value === "rent" ? "rent" : "sale";
    }

    function getPropertyGroup(propertyType = form.elements.propertyType.value) {
        return Object.entries(config.propertyGroups).find(([, values]) => values.includes(propertyType))?.[0] || "other";
    }

    function readState() {
        const state = {};
        Object.keys(config.defaultForm).forEach((name) => {
            if (name === "comparables") return;
            if (name === "rentalServiceFeeCustomized") {
                state[name] = rentalServiceFeeCustomized;
                return;
            }
            if (name === "titleDeedTransactionValueCustomized") {
                state[name] = titleDeedTransactionValueCustomized;
                return;
            }
            if (name === "transactionType") {
                state[name] = getTransactionType();
                return;
            }
            const field = form.elements[name];
            state[name] = field ? String(field.value ?? "") : String(config.defaultForm[name] ?? "");
        });
        state.comparables = [];
        return state;
    }

    function getNumericState(state) {
        const parsed = { ...state };
        currencyFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        decimalFields.forEach((name) => { parsed[name] = parseLocalizedDecimal(state[name]); });
        integerFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        parsed.comparables = [];
        return parsed;
    }

    function migrateStoredFormData(saved) {
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
        const migrated = { ...config.defaultForm, ...saved };
        if (!("buyerServiceFeeRate" in saved) || !("sellerServiceFeeRate" in saved)) {
            const legacyRate = String(saved.serviceFeeRate ?? config.defaultRates.buyerServiceFee);
            const payer = saved.commissionPayer || "both";
            migrated.buyerServiceFeeRate = payer === "seller" ? "0" : legacyRate;
            migrated.sellerServiceFeeRate = payer === "buyer" ? "0" : legacyRate;
        }
        migrated.comparables = [];
        migrated.offerPrice = "";
        migrated.rentalServiceFeeCustomized = Boolean(saved.rentalServiceFeeCustomized || saved.rentalServiceFee);
        migrated.titleDeedTransactionValueCustomized = Boolean(saved.titleDeedTransactionValueCustomized || saved.titleDeedTransactionValue);
        return migrated;
    }

    function applyState(state) {
        const safeState = migrateStoredFormData(state) || { ...config.defaultForm, comparables: [] };
        form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
        Object.keys(config.defaultForm).forEach((name) => {
            if (["comparables", "rentalServiceFeeCustomized", "titleDeedTransactionValueCustomized"].includes(name)) return;
            if (name === "transactionType") {
                const type = safeState[name] === "rent" ? "rent" : "sale";
                form.querySelector(`input[name="transactionType"][value="${type}"]`).checked = true;
                return;
            }
            const field = form.elements[name];
            if (!field) return;
            const value = safeState[name] == null ? "" : String(safeState[name]);
            field.value = currencyFields.has(name) ? formatCurrencyInput(value) : value;
        });
        rentalServiceFeeCustomized = Boolean(safeState.rentalServiceFeeCustomized);
        titleDeedTransactionValueCustomized = Boolean(safeState.titleDeedTransactionValueCustomized);
        if (!titleDeedTransactionValueCustomized && form.elements.price.value) {
            form.elements.titleDeedTransactionValue.value = form.elements.price.value;
        }
        updateDynamicView();
        updateRateSummaries();
        clearErrors();
    }

    function loadState() {
        try {
            const current = window.localStorage.getItem(config.storageKey);
            if (current) return migrateStoredFormData(JSON.parse(current));
            for (const legacyKey of config.legacyStorageKeys) {
                const legacy = window.localStorage.getItem(legacyKey);
                if (!legacy) continue;
                const migrated = migrateStoredFormData(JSON.parse(legacy));
                if (migrated) window.localStorage.setItem(config.storageKey, JSON.stringify(migrated));
                return migrated;
            }
        } catch {
            return null;
        }
        return null;
    }

    function saveState() {
        try {
            window.localStorage.setItem(config.storageKey, JSON.stringify(readState()));
        } catch {
            // Depolama kapalıysa hesaplama çalışmaya devam eder.
        }
    }

    function clearSavedState() {
        try {
            [config.storageKey, ...config.legacyStorageKeys].forEach((key) => window.localStorage.removeItem(key));
        } catch {
            // Depolama kapalıysa başlangıç değerleri yine uygulanır.
        }
    }

    function appendFloorOptions() {
        const select = form.elements.floor;
        if (!select || select.options.length > 5) return;
        for (let floor = 1; floor <= 50; floor += 1) select.add(new Option(String(floor), String(floor)));
        select.add(new Option("50+", "50+"));
    }

    function updateDynamicView() {
        const isRental = getTransactionType() === "rent";
        const group = getPropertyGroup();
        const isLand = group === "land";
        const isCommercial = group === "commercial";
        elements.roomField.hidden = isLand || isCommercial;
        [elements.netField, elements.grossField, elements.buildingAgeField, elements.floorField, elements.totalFloorsField, elements.duesField]
            .forEach((element) => { element.hidden = isLand; });
        elements.landDetails.hidden = !isLand;
        elements.saleInvestment.hidden = isRental || isLand;
        elements.saleCosts.hidden = isRental;
        elements.rentalCosts.hidden = !isRental;
        elements.priceLabel.textContent = isRental ? "Aylık kira" : "İlan / satış fiyatı";
        form.querySelector('button[type="submit"]').lastChild.textContent = isRental ? " Giriş Maliyetini Hesapla" : " Analiz Et";
        form.querySelectorAll(".real-estate-rental-optional").forEach((item) => { item.hidden = !isRental; });
        renumberVisibleSections();
    }

    function renumberVisibleSections() {
        let index = 1;
        form.querySelectorAll(".real-estate-form-card").forEach((section) => {
            if (section.hidden) return;
            const step = section.querySelector(".real-estate-step");
            if (step) step.textContent = String(index++).padStart(2, "0");
        });
    }

    function updateRateSummaries() {
        const buyerTitle = parseLocalizedDecimal(form.elements.buyerTitleDeedRate.value) ?? 0;
        const sellerTitle = parseLocalizedDecimal(form.elements.sellerTitleDeedRate.value) ?? 0;
        const buyerService = parseLocalizedDecimal(form.elements.buyerServiceFeeRate.value) ?? 0;
        const sellerService = parseLocalizedDecimal(form.elements.sellerServiceFeeRate.value) ?? 0;
        const totalTitle = buyerTitle + sellerTitle;
        const totalService = buyerService + sellerService;
        elements.totalTitleRate.textContent = `Toplam %${core.formatDecimal(totalTitle, Number.isInteger(totalTitle) ? 0 : 1)}`;
        elements.totalServiceRate.textContent = core.formatPercentage(totalService, Number.isInteger(totalService) ? 0 : 1);
        const exceedsRecommendation = totalService > config.recommendedMaximumSaleServiceFeeRate;
        elements.serviceRateWarning.hidden = !exceedsRecommendation;
        elements.serviceRateWarning.textContent = exceedsRecommendation
            ? `Toplam hizmet bedeli oranı %${core.formatDecimal(config.recommendedMaximumSaleServiceFeeRate, 0)}'ün üzerinde. Güncel mevzuat ve taraflar arasındaki sözleşmeyi kontrol edin.`
            : "";
    }

    function updateRentalServiceWarning() {
        const rent = parseCurrency(form.elements.price.value);
        const fee = parseCurrency(form.elements.rentalServiceFee.value);
        const exceedsRent = rent !== null && fee !== null && fee > rent;
        elements.rentalServiceWarning.hidden = !exceedsRent;
        elements.rentalServiceWarning.textContent = exceedsRent
            ? "Girilen hizmet bedeli bir aylık kira tutarını aşıyor. Güncel mevzuat ve sözleşme koşullarını kontrol edin."
            : "";
    }

    function clearErrors() {
        elements.errors.hidden = true;
        elements.errors.replaceChildren();
        form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
    }

    function validate(state) {
        const errors = [];
        const mark = (name, message) => {
            errors.push(message);
            form.elements[name]?.setAttribute("aria-invalid", "true");
        };
        const isRental = state.transactionType === "rent";
        const isLand = getPropertyGroup(state.propertyType) === "land";
        if (!(state.price > 0)) mark("price", isRental ? "Aylık kira tutarını girin." : "Satış fiyatını girin.");
        if (!isRental && isLand && !(state.totalArea > 0)) mark("totalArea", "Toplam alan 0'dan büyük olmalıdır.");
        if (!isRental && !isLand) {
            if (!(state.netArea > 0)) mark("netArea", "Net alan 0'dan büyük olmalıdır.");
            if (!(state.grossArea > 0)) mark("grossArea", "Brüt alan 0'dan büyük olmalıdır.");
            if (state.netArea > 0 && state.grossArea > 0 && state.netArea > state.grossArea) mark("netArea", "Net alan brüt alandan büyük olamaz.");
            if (!(state.monthlyRent > 0)) mark("monthlyRent", "Tahmini aylık kira tutarını girin.");
        }
        const numericFloor = /^\d+$/.test(String(state.floor || "")) ? Number(state.floor) : null;
        if (numericFloor !== null && state.totalFloors > 0 && numericFloor > state.totalFloors) mark("floor", "Kat değeri toplam kat sayısından büyük olamaz.");
        const rateNames = isRental
            ? ["rentalVatRate"]
            : ["buyerTitleDeedRate", "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate", "vatRate"];
        rateNames.forEach((name) => {
            if (state[name] !== null && state[name] > 100) mark(name, "Oran alanları %100'ü geçemez.");
        });
        return [...new Set(errors)];
    }

    function showErrors(errors, shouldScroll = true) {
        const title = document.createElement("strong");
        const list = document.createElement("ul");
        title.textContent = "Analiz için bazı bilgileri düzeltin:";
        errors.forEach((message) => {
            const item = document.createElement("li");
            item.textContent = message;
            list.append(item);
        });
        elements.errors.replaceChildren(title, list);
        elements.errors.hidden = false;
        if (shouldScroll) {
            elements.errors.focus({ preventScroll: true });
            elements.errors.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value ?? "—");
    }

    function formatSquareMeterPrice(value) {
        return value === null ? "—" : `${core.formatCurrency(value)} / m²`;
    }

    function formatYears(value) {
        return value === null ? "—" : `${core.formatDecimal(value, 1)} yıl`;
    }

    function formatOptionalCurrency(value, missingText = "Bilgi girilmedi") {
        return value === null ? missingText : core.formatCurrency(value);
    }

    function formatSignedPercentage(value, digits = 1) {
        if (typeof value !== "number" || !Number.isFinite(value)) return "—";
        const sign = value > 0 ? "+" : "";
        return `${sign}%${core.formatDecimal(value, digits)}`;
    }

    function renderScoreComponents(portfolio) {
        const container = document.getElementById("real-estate-score-components");
        const fragment = document.createDocumentFragment();
        Object.values(portfolio.components).forEach((component) => {
            const card = document.createElement("article");
            const top = document.createElement("div");
            const label = document.createElement("span");
            const score = document.createElement("strong");
            const track = document.createElement("div");
            const fill = document.createElement("span");
            label.textContent = component.label;
            score.textContent = component.available ? `${component.points} / ${component.maximum}` : "Bilgi yok";
            track.className = "real-estate-progress";
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", component.label);
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", String(component.maximum));
            track.setAttribute("aria-valuenow", String(component.points ?? 0));
            fill.style.width = `${component.available ? (component.points / component.maximum) * 100 : 0}%`;
            top.append(label, score);
            track.append(fill);
            card.append(top, track);
            fragment.append(card);
        });
        container.replaceChildren(fragment);
    }

    function renderCostDetails(result) {
        setText("real-estate-total-transaction-cost", `Toplam tahmini gider ${core.formatCurrency(result.transactionCosts.total)}`);
        setText("real-estate-buyer-total", core.formatCurrency(result.buyer.total));
        setText("real-estate-buyer-price", core.formatCurrency(result.buyer.propertyPrice));
        setText("real-estate-buyer-title-fee", core.formatCurrency(result.buyer.titleDeedFee));
        setText("real-estate-buyer-service-fee", core.formatCurrency(result.buyer.serviceFee));
        setText("real-estate-buyer-vat", core.formatCurrency(result.buyer.serviceFeeVat));
        setText("real-estate-buyer-other", core.formatCurrency(result.buyer.otherCosts));
        setText("real-estate-seller-net", core.formatCurrency(result.seller.net));
        setText("real-estate-seller-price", core.formatCurrency(result.seller.propertyPrice));
        setText("real-estate-seller-title-fee", core.formatCurrency(result.seller.titleDeedFee));
        setText("real-estate-seller-service-fee", core.formatCurrency(result.seller.serviceFee));
        setText("real-estate-seller-vat", core.formatCurrency(result.seller.serviceFeeVat));
        setText("real-estate-seller-other", core.formatCurrency(result.seller.otherCosts));
        setText("real-estate-title-total", core.formatCurrency(result.transactionCosts.titleDeed));
        setText("real-estate-service-total", core.formatCurrency(result.transactionCosts.serviceFee));
        setText("real-estate-vat-total", core.formatCurrency(result.transactionCosts.vat));
    }

    function renderSale(state, result) {
        elements.emptyResult.hidden = true;
        elements.landResult.hidden = true;
        elements.rentalResult.hidden = true;
        elements.saleResult.hidden = false;
        const scoreCard = document.getElementById("real-estate-score-card");
        scoreCard.dataset.level = result.portfolio.level.id;
        setText("real-estate-score", result.portfolio.score);
        setText("real-estate-score-label", result.portfolio.level.label);
        setText("real-estate-completeness", core.formatPercentage(result.portfolio.completeness.percentage, 0));
        document.getElementById("real-estate-completeness-note").hidden = result.portfolio.completeness.percentage === 100;
        renderScoreComponents(result.portfolio);
        setText("real-estate-kpi-gross", formatSquareMeterPrice(result.pricePerGrossArea));
        setText("real-estate-kpi-net", formatSquareMeterPrice(result.pricePerNetArea));
        setText("real-estate-kpi-yield", core.formatPercentage(result.rent.grossYield, 2));
        setText("real-estate-kpi-amortization", formatYears(result.amortizationYears));
        setText("real-estate-efficiency", core.formatPercentage(result.efficiency, 1));
        setText("real-estate-dues-ratio", state.dues === null ? "Aidat bilgisi girilmedi" : core.formatPercentage(result.duesRatio, 1));
        setText("real-estate-annual-rent", core.formatCurrency(result.rent.annualGrossRent));
        setText("real-estate-annual-expenses-result", formatOptionalCurrency(state.annualExpenses));
        setText("real-estate-net-yield", core.formatPercentage(result.rent.netYield, 2));
        renderCostDetails(result);
        setText("real-estate-analysis-summary", `Girilen verilere göre yıllık brüt kira getirisi ${core.formatPercentage(result.rent.grossYield, 1)}, amortisman süresi ${formatYears(result.amortizationYears)} ve Finansal Verim Skoru ${result.portfolio.score}/100 seviyesinde.`);
        const list = document.getElementById("real-estate-analysis-list");
        list.replaceChildren(...result.analysis.map((insight) => {
            const item = document.createElement("li");
            item.textContent = insight;
            return item;
        }));
        updateShareLinks(state, result);
    }

    function renderLand(state, result) {
        elements.emptyResult.hidden = true;
        elements.saleResult.hidden = true;
        elements.rentalResult.hidden = true;
        elements.landResult.hidden = false;
        setText("real-estate-land-square-price", formatSquareMeterPrice(result.pricePerSquareMeter));
        setText("real-estate-land-comparison-text", result.comparablePrice === null ? "Emsal m² fiyatı girildiğinde karşılaştırma gösterilir." : result.comparisonText);
        setText("real-estate-land-price", core.formatCurrency(result.price));
        setText("real-estate-land-area", `${core.formatDecimal(result.totalArea, 0)} m²`);
        setText("real-estate-land-comparable", formatSquareMeterPrice(result.comparablePrice));
        setText("real-estate-land-comparable-total", core.formatCurrency(result.comparableTotalValue));
        setText("real-estate-land-difference", formatSignedPercentage(result.comparableDifference, 2));
        setText("real-estate-land-buyer-total", core.formatCurrency(result.buyer.total));
        setText("real-estate-land-seller-net", core.formatCurrency(result.seller.net));
        setText("real-estate-land-title-fees", core.formatCurrency(result.transactionCosts.titleDeed));
        setText("real-estate-land-service-fees", core.formatCurrency(result.transactionCosts.serviceFee + result.transactionCosts.vat));
    }

    function renderRental(state, result) {
        elements.emptyResult.hidden = true;
        elements.saleResult.hidden = true;
        elements.landResult.hidden = true;
        elements.rentalResult.hidden = false;
        setText("real-estate-rental-total", core.formatCurrency(result.contractStartTotal));
        setText("real-estate-rental-first-month", core.formatCurrency(result.firstMonthRent));
        setText("real-estate-rental-deposit-result", core.formatCurrency(result.deposit));
        setText("real-estate-rental-service-result", core.formatCurrency(result.serviceFee));
        setText("real-estate-rental-vat-result", core.formatCurrency(result.serviceFeeVat));
        setText("real-estate-rental-dues-result", result.dues === null ? "Aidat bilgisi girilmedi" : core.formatCurrency(result.dues));
        setText("real-estate-rental-cash-total", result.firstMonthCashTotal === null ? "Aidat bilgisi girilmedi" : core.formatCurrency(result.firstMonthCashTotal));
        setText("real-estate-rental-cash-note", result.firstMonthCashTotal === null
            ? "Aidat tutarı bilinmediği için ilk ay toplam nakit çıkışı hesaplanmadı."
            : "Sözleşme başlangıç maliyeti ile ilk ay aidatının toplamıdır.");
    }

    function showEmptyResult() {
        elements.emptyResult.hidden = false;
        elements.saleResult.hidden = true;
        elements.landResult.hidden = true;
        elements.rentalResult.hidden = true;
        latestResult = null;
        latestState = null;
    }

    function optionalLine(lines, label, value, formatter = (item) => item) {
        if (value === null || value === undefined || value === "") return;
        lines.push(`${label}: ${formatter(value)}`);
    }

    function buildPropertyDetailLines(state) {
        const lines = [];
        optionalLine(lines, "Tür", state.propertyType);
        if (getPropertyGroup(state.propertyType) === "land") {
            optionalLine(lines, "Alan", state.totalArea, (value) => `${core.formatDecimal(value, 0)} m²`);
            optionalLine(lines, "Ada", state.blockNo);
            optionalLine(lines, "Parsel", state.parcelNo);
            optionalLine(lines, "Emsal / KAKS", state.floorAreaRatio, (value) => core.formatDecimal(value, 2));
            optionalLine(lines, "İmar Durumu", state.zoningStatus);
            optionalLine(lines, "Tapu Niteliği", state.titleDeedType);
            return lines;
        }
        optionalLine(lines, "Oda Sayısı", getPropertyGroup(state.propertyType) === "commercial" ? null : state.roomCount);
        optionalLine(lines, "Brüt Alan", state.grossArea, (value) => `${core.formatDecimal(value, 0)} m²`);
        optionalLine(lines, "Net Alan", state.netArea, (value) => `${core.formatDecimal(value, 0)} m²`);
        optionalLine(lines, "Bina Yaşı", state.buildingAge, (value) => `${core.formatDecimal(value, 0)} yaş`);
        optionalLine(lines, "Kat", state.floor);
        optionalLine(lines, "Toplam Kat", state.totalFloors, (value) => core.formatDecimal(value, 0));
        return lines;
    }

    function buildGeneralSaleReport(state, result) {
        const lines = ["Gayrimenkul Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `Brüt m² Fiyatı: ${formatSquareMeterPrice(result.pricePerGrossArea)}`, `Net m² Fiyatı: ${formatSquareMeterPrice(result.pricePerNetArea)}`, `Tahmini Aylık Kira: ${core.formatCurrency(state.monthlyRent)}`, `Yıllık Brüt Getiri: ${core.formatPercentage(result.rent.grossYield, 2)}`, `Amortisman Süresi: ${formatYears(result.amortizationYears)}`, `Finansal Verim Skoru: ${result.portfolio.score}/100`, `Veri Tamlığı: ${core.formatPercentage(result.portfolio.completeness.percentage, 0)}`];
        lines.push("", `Tahmini Alıcı Toplam Maliyeti: ${core.formatCurrency(result.buyer.total)}`, `Tahmini Satıcı Net Tutarı: ${core.formatCurrency(result.seller.net)}`, "", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return lines.join("\n");
    }

    function buildBuyerReport(state, result) {
        const lines = ["Gayrimenkul Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `Brüt m² Fiyatı: ${formatSquareMeterPrice(result.pricePerGrossArea)}`, `Tahmini Aylık Kira: ${core.formatCurrency(state.monthlyRent)}`, `Yıllık Brüt Getiri: ${core.formatPercentage(result.rent.grossYield, 2)}`, `Amortisman: ${formatYears(result.amortizationYears)}`];
        lines.push(`Tahmini Alıcı Toplam Maliyeti: ${core.formatCurrency(result.buyer.total)}`, "", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return lines.join("\n");
    }

    function buildOwnerReport(state, result) {
        const lines = ["Gayrimenkul Fiyat Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `Brüt m² Fiyatı: ${formatSquareMeterPrice(result.pricePerGrossArea)}`];
        lines.push(`Tahmini Satıcı Net Tutarı: ${core.formatCurrency(result.seller.net)}`, `Tapu Harcı: ${core.formatCurrency(result.seller.titleDeedFee)}`, `Hizmet Bedeli: ${core.formatCurrency(result.seller.serviceFee + result.seller.serviceFeeVat)}`);
        lines.push("", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return lines.join("\n");
    }

    function buildLandReport(state, result) {
        const lines = ["Arazi Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `m² Fiyatı: ${formatSquareMeterPrice(result.pricePerSquareMeter)}`];
        optionalLine(lines, "Emsal m² Fiyatı", result.comparablePrice, formatSquareMeterPrice);
        if (result.comparableDifference !== null) lines.push(`Emsallere Göre: ${result.comparisonText}`);
        lines.push(`Tahmini Alıcı Toplam Maliyeti: ${core.formatCurrency(result.buyer.total)}`, `Satıcı Net Tutarı: ${core.formatCurrency(result.seller.net)}`, "", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return lines.join("\n");
    }

    function buildRentalReport(state, result) {
        const lines = ["Kiralık Gayrimenkul Analizi", "", ...buildPropertyDetailLines(state), "", `Aylık Kira: ${core.formatCurrency(result.firstMonthRent)}`, `Depozito: ${core.formatCurrency(result.deposit)}`, `Hizmet Bedeli: ${core.formatCurrency(result.serviceFee)}`, `KDV: ${core.formatCurrency(result.serviceFeeVat)}`];
        optionalLine(lines, "Aidat", result.dues, (value) => core.formatCurrency(value));
        lines.push("", `Sözleşme Başlangıç Maliyeti: ${core.formatCurrency(result.contractStartTotal)}`);
        optionalLine(lines, "İlk Ay Toplam Nakit Çıkışı", result.firstMonthCashTotal, (value) => core.formatCurrency(value));
        lines.push("", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return lines.join("\n");
    }

    function updateShareLinks(state, result) {
        elements.buyerWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(buildBuyerReport(state, result))}`;
        elements.ownerWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(buildOwnerReport(state, result))}`;
    }

    async function copyText(text, message = "Rapor panoya kopyalandı.") {
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.append(textarea);
                textarea.select();
                const copied = document.execCommand("copy");
                textarea.remove();
                if (!copied) throw new Error("copy-failed");
            }
            window.clearTimeout(copyStatusTimer);
            elements.copyStatus.textContent = message;
            copyStatusTimer = window.setTimeout(() => {
                if (elements.copyStatus.textContent === message) elements.copyStatus.textContent = "";
            }, config.copyStatusDurationMs);
        } catch {
            window.clearTimeout(copyStatusTimer);
            elements.copyStatus.textContent = "Kopyalama başarısız oldu. Tarayıcı izinlerini kontrol edin.";
        }
    }

    function calculateAndRender({ shouldScroll = false, showValidation = true } = {}) {
        clearErrors();
        const rawState = readState();
        const state = getNumericState(rawState);
        const errors = validate(state);
        if (errors.length) {
            if (showValidation) showErrors(errors, shouldScroll);
            return false;
        }
        const isRental = state.transactionType === "rent";
        const isLand = !isRental && getPropertyGroup(state.propertyType) === "land";
        latestState = state;
        if (isRental) {
            latestResult = core.calculateRentalMoveInCost({ monthlyRent: state.price, deposit: state.deposit, rentalServiceFee: state.rentalServiceFee, vatRate: state.rentalVatRate, dues: state.dues });
            renderRental(state, latestResult);
        } else if (isLand) {
            latestResult = core.calculateLandAnalysis(state);
            renderLand(state, latestResult);
        } else {
            latestResult = core.calculateSaleAnalysis(state);
            renderSale(state, latestResult);
        }
        hasSuccessfulAnalysis = true;
        saveState();
        elements.copyStatus.textContent = "";
        if (shouldScroll) {
            const target = isRental ? elements.rentalResult : isLand ? elements.landResult : elements.saleResult;
            target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        }
        return true;
    }

    function scheduleAutomaticCalculation() {
        if (!hasSuccessfulAnalysis) return;
        window.clearTimeout(autoCalculationTimer);
        autoCalculationTimer = window.setTimeout(() => {
            if (!calculateAndRender({ showValidation: false })) elements.copyStatus.textContent = "Veriler değişti. Eksik alanları tamamladığınızda analiz otomatik güncellenecek.";
        }, config.autoCalculationDelayMs);
    }

    function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    form.addEventListener("input", (event) => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement)) return;
        if (currencyFields.has(field.name)) field.value = formatCurrencyInput(field.value);
        else if (decimalFields.has(field.name)) field.value = sanitizeDecimalInput(field.value);
        else if (integerFields.has(field.name)) field.value = field.value.replace(/\D/g, "");
        if (field.name === "rentalServiceFee") rentalServiceFeeCustomized = true;
        if (field.name === "titleDeedTransactionValue") titleDeedTransactionValueCustomized = true;
        if (field.name === "price" && getTransactionType() === "rent" && config.rentalServiceFeeMode === "one-month-rent" && !rentalServiceFeeCustomized) form.elements.rentalServiceFee.value = field.value;
        if (field.name === "price" && getTransactionType() === "sale" && !titleDeedTransactionValueCustomized) form.elements.titleDeedTransactionValue.value = field.value;
        field.removeAttribute("aria-invalid");
        if (["buyerTitleDeedRate", "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate"].includes(field.name)) updateRateSummaries();
        if (["price", "rentalServiceFee"].includes(field.name)) updateRentalServiceWarning();
        saveState();
        scheduleAutomaticCalculation();
    });

    form.addEventListener("change", (event) => {
        if (event.target.name === "transactionType") {
            const isRental = getTransactionType() === "rent";
            if (isRental && config.rentalServiceFeeMode === "one-month-rent" && !rentalServiceFeeCustomized && !form.elements.rentalServiceFee.value) form.elements.rentalServiceFee.value = form.elements.price.value;
            if (!isRental && !titleDeedTransactionValueCustomized) form.elements.titleDeedTransactionValue.value = form.elements.price.value;
            updateDynamicView();
            updateRentalServiceWarning();
            showEmptyResult();
            hasSuccessfulAnalysis = false;
        } else if (event.target.name === "propertyType") {
            updateDynamicView();
            showEmptyResult();
            hasSuccessfulAnalysis = false;
        } else scheduleAutomaticCalculation();
        saveState();
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        calculateAndRender({ shouldScroll: true, showValidation: true });
    });

    elements.reset.addEventListener("click", () => {
        rentalServiceFeeCustomized = false;
        titleDeedTransactionValueCustomized = false;
        hasSuccessfulAnalysis = false;
        applyState(config.defaultForm);
        saveState();
        showEmptyResult();
        form.elements.price.focus();
        elements.copyStatus.textContent = "Form başlangıç değerlerine döndürüldü.";
    });

    elements.clearStorage.addEventListener("click", () => {
        clearSavedState();
        rentalServiceFeeCustomized = false;
        titleDeedTransactionValueCustomized = false;
        hasSuccessfulAnalysis = false;
        applyState(config.defaultForm);
        showEmptyResult();
        form.elements.price.focus();
        elements.copyStatus.textContent = "Kaydedilen son veriler temizlendi.";
    });

    elements.copy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildGeneralSaleReport(latestState, latestResult), "Genel rapor panoya kopyalandı.");
    });
    elements.buyerCopy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildBuyerReport(latestState, latestResult), "Alıcı raporu panoya kopyalandı.");
    });
    elements.ownerCopy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildOwnerReport(latestState, latestResult), "Mülk sahibi raporu panoya kopyalandı.");
    });
    elements.landCopy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildLandReport(latestState, latestResult), "Arazi raporu panoya kopyalandı.");
    });
    elements.rentalCopy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildRentalReport(latestState, latestResult));
    });

    appendFloorOptions();
    applyState(loadState() || config.defaultForm);
    updateRentalServiceWarning();
    showEmptyResult();
}());
