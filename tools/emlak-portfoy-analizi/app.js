(function initRealEstateAnalysisApp() {
    "use strict";

    const panel = document.getElementById("emlak-portfoy-analizi");
    const form = document.getElementById("real-estate-form");
    const core = window.RealEstateAnalysisCore;
    const config = window.RealEstateAnalysisConfig;
    const valuation = window.RealEstateValuation;
    const listing = window.RealEstateListing;
    if (!panel || !form || !core || !config || !valuation || !listing) return;

    const currencyFields = new Set([
        "price", "dues", "monthlyRent", "annualExpenses", "landComparablePrice",
        "titleDeedTransactionValue", "buyerOtherCosts", "sellerOtherCosts", "deposit",
        "rentalServiceFee", "offerPrice", "referencePricePerM2",
    ]);
    const decimalFields = new Set([
        "netArea", "grossArea", "totalArea", "floorAreaRatio", "buyerTitleDeedRate",
        "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate", "vatRate", "rentalVatRate", "targetYield",
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
    let latestValuation = null;
    let importedSource = "";
    let importedTitle = "";
    let comparableSequence = 0;
    let areaBasisCustomized = false;
    const byId = (id) => document.getElementById(`real-estate-${id}`);

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
        return String(value ?? "").replace(/[^\d,.]/g, "");
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
        state.comparables = readComparables();
        return state;
    }

    function getNumericState(state) {
        const parsed = { ...state };
        currencyFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        decimalFields.forEach((name) => { parsed[name] = parseLocalizedDecimal(state[name]); });
        integerFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        parsed.comparables = state.comparables;
        if (parsed.valuationMethod === "reference" && getPropertyGroup(parsed.propertyType) === "land") parsed.landComparablePrice = parsed.referencePricePerM2;
        return parsed;
    }

    function applyState(state) {
        areaBasisCustomized = false;
        const safeState = { ...config.defaultForm, ...(state || {}) };
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
        byId("valuation-comparables").replaceChildren();
        safeState.comparables.forEach((item) => addComparable(item));
        if (!titleDeedTransactionValueCustomized && form.elements.price.value) {
            form.elements.titleDeedTransactionValue.value = form.elements.price.value;
        }
        updateDynamicView();
        updateRateSummaries();
        clearErrors();
    }

    function clearRetiredSavedState() {
        try {
            config.retiredStorageKeys.forEach((key) => window.localStorage.removeItem(key));
        } catch {
            // Depolama kapalıysa form yine boş başlangıç değerleriyle açılır.
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
        elements.priceLabel.textContent = isRental ? "Aylık kira" : "İstenen fiyat (isteğe bağlı)";
        form.querySelector('button[type="submit"]').lastChild.textContent = isRental ? " Giriş Maliyetini Hesapla" : " Değerini ve Maliyetini Hesapla";
        byId("valuation-input").hidden = isRental;
        byId("area-basis-field").hidden = isLand;
        panel.querySelector(".real-estate-building-details").hidden = isLand;
        const rentalOption = form.elements.valuationMethod.querySelector('option[value="rental"]');
        rentalOption.disabled = isLand;
        if (isLand && form.elements.valuationMethod.value === "rental") form.elements.valuationMethod.value = "reference";
        updateValuationMethod();
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

    function validate(state, estimate) {
        const errors = [];
        const mark = (name, message) => {
            errors.push(message);
            form.elements[name]?.setAttribute("aria-invalid", "true");
        };
        const isRental = state.transactionType === "rent";
        const isLand = getPropertyGroup(state.propertyType) === "land";
        if (!(state.price > 0) && (isRental || !estimate.available)) mark("price", isRental ? "Aylık kira tutarını girin." : "Bir ilan fiyatı veya değerleme için emsal m² fiyatı, benzer ilan ya da kira hedefi ekleyin.");
        if (!isRental && isLand && !(state.totalArea > 0)) mark("totalArea", "Toplam alan 0'dan büyük olmalıdır.");
        if (!isRental && !isLand) {
            if (!(state.netArea > 0) && !(state.grossArea > 0) && state.valuationMethod !== "rental") mark("grossArea", "Net veya brüt alan bilgilerinden birini girin.");
            if (state.netArea > 0 && state.grossArea > 0 && state.netArea > state.grossArea) mark("netArea", "Net alan brüt alandan büyük olamaz.");
        }
        const numericFloor = /^\d+$/.test(String(state.floor || "")) ? Number(state.floor) : null;
        if (numericFloor !== null && state.totalFloors > 0 && numericFloor > state.totalFloors) mark("floor", "Kat değeri toplam kat sayısından büyük olamaz.");
        const rateNames = isRental
            ? ["rentalVatRate"]
            : ["buyerTitleDeedRate", "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate", "vatRate"];
        rateNames.forEach((name) => {
            if (state[name] !== null && state[name] > 100) mark(name, "Oran alanları %100'ü geçemez.");
        });
        if (!isRental && state.valuationMethod === "rental" && state.targetYield > 100) mark("targetYield", "Hedef getiri %100'ü geçemez.");
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
        scoreCard.hidden = !(state.monthlyRent > 0);
        document.getElementById("real-estate-score-components-title").closest("section").hidden = !(state.monthlyRent > 0);
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
        setText("real-estate-analysis-summary", state.monthlyRent > 0 ? `Girilen verilere göre yıllık brüt kira getirisi ${core.formatPercentage(result.rent.grossYield, 1)}, amortisman süresi ${formatYears(result.amortizationYears)} ve Finansal Verim Skoru ${result.portfolio.score}/100 seviyesinde.` : "Fiyat ve alan bilgileriyle işlem maliyetleri hesaplandı. Aylık kira eklerseniz getiri ve geri dönüş süresini de görebilirsiniz.");
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
        latestValuation = null;
        byId("valuation-result").hidden = true;
    }

    function optionalLine(lines, label, value, formatter = (item) => item) {
        if (value === null || value === undefined || value === "") return;
        lines.push(`${label}: ${formatter(value)}`);
    }

    function buildPropertyDetailLines(state) {
        const lines = [];
        optionalLine(lines, "Tür", state.propertyType);
        optionalLine(lines, "Konum", state.location);
        optionalLine(lines, "Kaynak ilan", importedSource);
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
        return [lines.join("\n"), valuationReport()].filter(Boolean).join("\n\n");
    }

    function buildBuyerReport(state, result) {
        const lines = ["Gayrimenkul Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `Brüt m² Fiyatı: ${formatSquareMeterPrice(result.pricePerGrossArea)}`, `Tahmini Aylık Kira: ${core.formatCurrency(state.monthlyRent)}`, `Yıllık Brüt Getiri: ${core.formatPercentage(result.rent.grossYield, 2)}`, `Amortisman: ${formatYears(result.amortizationYears)}`];
        lines.push(`Tahmini Alıcı Toplam Maliyeti: ${core.formatCurrency(result.buyer.total)}`, "", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return [lines.join("\n"), valuationReport()].filter(Boolean).join("\n\n");
    }

    function buildOwnerReport(state, result) {
        const lines = ["Gayrimenkul Fiyat Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `Brüt m² Fiyatı: ${formatSquareMeterPrice(result.pricePerGrossArea)}`];
        lines.push(`Tahmini Satıcı Net Tutarı: ${core.formatCurrency(result.seller.net)}`, `Tapu Harcı: ${core.formatCurrency(result.seller.titleDeedFee)}`, `Hizmet Bedeli: ${core.formatCurrency(result.seller.serviceFee + result.seller.serviceFeeVat)}`);
        lines.push("", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return [lines.join("\n"), valuationReport()].filter(Boolean).join("\n\n");
    }

    function buildLandReport(state, result) {
        const lines = ["Arazi Analizi", "", ...buildPropertyDetailLines(state), "", `Satış Fiyatı: ${core.formatCurrency(state.price)}`, `m² Fiyatı: ${formatSquareMeterPrice(result.pricePerSquareMeter)}`];
        optionalLine(lines, "Emsal m² Fiyatı", result.comparablePrice, formatSquareMeterPrice);
        if (result.comparableDifference !== null) lines.push(`Emsallere Göre: ${result.comparisonText}`);
        lines.push(`Tahmini Alıcı Toplam Maliyeti: ${core.formatCurrency(result.buyer.total)}`, `Satıcı Net Tutarı: ${core.formatCurrency(result.seller.net)}`, "", "Bu değerler tahmini ve bilgilendirme amaçlıdır.");
        return [lines.join("\n"), valuationReport()].filter(Boolean).join("\n\n");
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

    function updateValuationMethod() {
        const method = form.elements.valuationMethod.value;
        byId("reference-fields").hidden = method !== "reference";
        byId("comparable-fields").hidden = method !== "comparables";
        byId("yield-fields").hidden = method !== "rental";
        if (method === "rental") elements.saleInvestment.open = true;
        if (method === "comparables" && !byId("valuation-comparables").children.length) addComparable();
    }

    function readComparables() {
        return [...byId("valuation-comparables").children].map((row) => ({
            price: parseCurrency(row.querySelector('[data-value="price"]').value),
            area: parseLocalizedDecimal(row.querySelector('[data-value="area"]').value),
            areaBasis: row.querySelector('[data-value="basis"]').value,
            propertyType: row.dataset.propertyType,
            location: row.dataset.location || "",
            sourceUrl: row.dataset.sourceUrl || "",
        }));
    }

    function addComparable(data = {}) {
        const container = byId("valuation-comparables");
        if (container.children.length >= config.maxComparables) {
            setImportStatus(`En fazla ${config.maxComparables} emsal ekleyebilirsiniz. Birini silip tekrar deneyin.`, true);
            return false;
        }
        const row = document.createElement("div");
        row.className = "real-estate-comparable-row";
        row.dataset.propertyType = data.propertyType || form.elements.propertyType.value;
        row.dataset.location = data.location || "";
        row.dataset.sourceUrl = data.sourceUrl || "";
        const rowId = ++comparableSequence;
        const name = document.createElement("strong");
        name.textContent = `${row.dataset.propertyType}${data.location ? ` · ${data.location}` : ""}`;
        row.append(name);
        const fields = document.createElement("div");
        fields.className = "real-estate-comparable-grid";
        for (const [key, text, value, placeholder] of [["price", "İlan fiyatı (TL)", data.price, "6.000.000"], ["area", "Alan (m²)", data.area, "100"]]) {
            const label = document.createElement("label");
            label.className = "real-estate-field";
            const caption = document.createElement("span");
            caption.textContent = text;
            const input = document.createElement("input");
            input.id = `real-estate-comparable-${rowId}-${key}`;
            input.type = "text";
            input.inputMode = key === "price" ? "numeric" : "decimal";
            input.dataset.value = key;
            input.value = value == null ? "" : key === "price" ? formatCurrencyInput(Math.round(Number(value))) : String(value);
            input.placeholder = placeholder;
            label.htmlFor = input.id;
            label.append(caption, input);
            fields.append(label);
        }
        const basisLabel = document.createElement("label");
        basisLabel.className = "real-estate-field";
        const basisText = document.createElement("span");
        basisText.textContent = "Alan türü";
        const select = document.createElement("select");
        select.id = `real-estate-comparable-${rowId}-basis`;
        select.dataset.value = "basis";
        const isLand = getPropertyGroup(row.dataset.propertyType) === "land";
        (isLand ? [["total", "Toplam"]] : [["gross", "Brüt"], ["net", "Net"]]).forEach(([value, text]) => select.add(new Option(text, value)));
        select.value = data.areaBasis || (isLand ? "total" : form.elements.areaBasis.value);
        basisLabel.htmlFor = select.id;
        basisLabel.append(basisText, select);
        fields.append(basisLabel);
        const remove = document.createElement("button");
        remove.className = "ghost-button";
        remove.type = "button";
        remove.textContent = "Sil";
        remove.setAttribute("aria-label", `${row.dataset.propertyType} emsalini sil`);
        remove.addEventListener("click", () => { row.remove(); scheduleAutomaticCalculation(); });
        fields.append(remove);
        row.append(fields);
        if (data.sourceUrl) {
            const source = document.createElement("a");
            try {
                source.href = listing.normalizeUrl(data.sourceUrl);
                source.target = "_blank";
                source.rel = "noopener noreferrer";
                source.textContent = "Kaynak ilanı aç";
                row.append(source);
            } catch { /* Geçersiz kaynak bağlantısı rapora aktarılmaz. */ }
        }
        container.append(row);
        return true;
    }

    function estimateValue(state) {
        const method = state.valuationMethod;
        return valuation.estimate({ ...state,
            referencePricePerM2: method === "reference" ? state.referencePricePerM2 : null,
            comparables: method === "comparables" ? state.comparables : [],
            targetYield: method === "rental" ? state.targetYield : null,
        });
    }

    function renderValuation(state, result) {
        latestValuation = result;
        byId("valuation-result").hidden = state.transactionType === "rent";
        byId("valuation-result").dataset.position = result.position;
        setText("real-estate-valuation-confidence", result.confidenceLabel);
        setText("real-estate-valuation-title", result.available ? result.method === "rental" ? "Hedef getiriye göre alım aralığı" : "Tahmini değer aralığı" : "Değer aralığı için bir dayanak ekleyin");
        setText("real-estate-valuation-range", result.available ? `${core.formatCurrency(result.low)} – ${core.formatCurrency(result.high)}` : "Henüz hesaplanmadı");
        setText("real-estate-valuation-midpoint", result.available ? `Hesaplanan orta değer: ${core.formatCurrency(result.estimate)}` : "Tek bir ilanın fiyatı, piyasa değerini belirlemek için yeterli değildir.");
        setText("real-estate-valuation-source", result.available ? `${result.areaBasis === "total" ? "Toplam" : result.areaBasis === "net" ? "Net" : "Brüt"} alan: ${result.area === null ? "Girilmedi" : `${core.formatDecimal(result.area, 1)} m²`} · Birim değer: ${formatSquareMeterPrice(result.pricePerM2)}` : "");
        const position = byId("valuation-position");
        position.hidden = result.differencePercent === null;
        const difference = Math.abs(result.differencePercent || 0);
        position.textContent = result.position === "fair" ? "İstenen fiyat, hesaplanan değere yakın (±%5)." : `İstenen fiyat, hesaplanan değerin %${core.formatDecimal(difference, 1)} ${result.position === "above" ? "üzerinde" : "altında"}.`;
        byId("valuation-reasons").replaceChildren(...result.reasons.map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
        setText("real-estate-valuation-warning", result.warnings.join(" "));
        byId("valuation-copy").hidden = !result.available;
    }

    function valuationReport() {
        if (!latestValuation?.available) return "";
        const r = latestValuation;
        const lines = ["Gayrimenkul Değerleme Özeti", importedTitle, latestState?.location, `Tahmini aralık: ${core.formatCurrency(r.low)} – ${core.formatCurrency(r.high)}`, `Orta değer: ${core.formatCurrency(r.estimate)}`, `Dayanak: ${r.confidenceLabel}`, ...r.reasons];
        if (r.differencePercent !== null) lines.push(`İstenen fiyatın orta değere farkı: ${formatSignedPercentage(r.differencePercent)}`);
        if (importedSource) lines.push(`Kaynak: ${importedSource}`);
        lines.push(...r.warnings);
        return lines.filter(Boolean).join("\n");
    }

    function setImportStatus(text, error = false) {
        byId("import-status").textContent = text;
        byId("import-status").dataset.error = String(error);
    }

    function applyListing(data, target) {
        const fields = data?.fields;
        if (!fields || !Object.keys(fields).some((key) => ["price", "grossArea", "netArea", "totalArea"].includes(key))) throw new Error("Fiyat veya alan bilgisi bulunamadı. İlanın fiyat ve özellikler bölümünü birlikte kopyalayın.");
        if (target === "comparable") {
            if (fields.transactionType === "rent") throw new Error("Satış değerlemesi için kiralık yerine satılık bir emsal ekleyin.");
            const canonical = (url) => String(url || "").split(/[?#]/)[0].replace(/\/$/, "");
            if (data.sourceUrl && (canonical(data.sourceUrl) === canonical(importedSource) || readComparables().some((item) => canonical(item.sourceUrl) === canonical(data.sourceUrl)))) throw new Error("Bu ilan zaten eklendi. Karşılaştırmak için farklı bir ilan seçin.");
            const type = fields.propertyType;
            if (!type) throw new Error("Emsalin gayrimenkul türü bulunamadı. Metne “Satılık daire” veya “Satılık arsa” bilgisini ekleyin.");
            if (type !== form.elements.propertyType.value) throw new Error("Emsal, analiz ettiğiniz mülkle aynı türde olmalı. Örneğin daireyi başka bir daireyle karşılaştırın.");
            const land = getPropertyGroup(type) === "land";
            const basis = land ? "total" : form.elements.areaBasis.value;
            const area = fields[land ? "totalArea" : basis === "net" ? "netArea" : "grossArea"];
            if (!(Number(fields.price) > 0) || !(Number(area) > 0)) throw new Error(`Emsalin satış fiyatı ve ${land ? "toplam" : basis === "net" ? "net" : "brüt"} m² bilgisi gerekli.`);
            if (!addComparable({ price: fields.price, area, areaBasis: basis, propertyType: type, location: fields.location, sourceUrl: data.sourceUrl })) throw new Error(`En fazla ${config.maxComparables} emsal ekleyebilirsiniz.`);
            form.elements.valuationMethod.value = "comparables";
            updateValuationMethod();
        } else {
            const cleanFields = {};
            Object.keys(config.defaultForm).forEach((key) => {
                if (["comparables", "valuationMethod", "referencePricePerM2", "targetYield", "rentalServiceFeeCustomized", "titleDeedTransactionValueCustomized"].includes(key)) return;
                const value = fields[key];
                if (typeof value === "number" && Number.isFinite(value) && value >= 0) cleanFields[key] = currencyFields.has(key) ? String(Math.round(value)) : String(value);
                else if (typeof value === "string") cleanFields[key] = value.slice(0, 250);
            });
            if (cleanFields.floor && ![...form.elements.floor.options].some((item) => item.value === cleanFields.floor)) form.elements.floor.add(new Option(cleanFields.floor, cleanFields.floor));
            if (cleanFields.roomCount && ![...form.elements.roomCount.options].some((item) => item.value === cleanFields.roomCount)) form.elements.roomCount.add(new Option(cleanFields.roomCount, cleanFields.roomCount));
            importedSource = data.sourceUrl || "";
            importedTitle = String(data.title || "").slice(0, 250);
            hasSuccessfulAnalysis = false;
            applyState({ ...config.defaultForm, ...cleanFields, areaBasis: !fields.grossArea && fields.netArea ? "net" : "gross" });
            if (getTransactionType() === "rent") form.elements.rentalServiceFee.value = form.elements.price.value;
            showEmptyResult();
        }

        const label = target === "comparable" ? "Emsal eklendi." : "İlan bilgileri dolduruldu. Kontrol edip bir değerleme dayanağı ekleyin.";
        setImportStatus(`${label}${data.warnings?.length ? ` ${data.warnings.join(" ")}` : ""}`);
        calculateAndRender({ showValidation: false });
    }

    byId("parse-text").addEventListener("click", () => {
        try {
            const text = byId("listing-text").value.trim();
            if (!text) throw new Error("Önce ilan metnini yapıştırın.");
            applyListing(listing.parseText(text), byId("import-target").value);
        } catch (error) { setImportStatus(error.message, true); }
    });
    byId("add-comparable").addEventListener("click", () => addComparable());
    byId("valuation-copy").addEventListener("click", () => copyText(valuationReport(), "Değerleme özeti kopyalandı."));
    panel.querySelectorAll("[data-estate-example]").forEach((button) => button.addEventListener("click", () => {
        const land = button.dataset.estateExample === "land";
        importedSource = "";
        importedTitle = "Örnek verilerle analiz";

        applyState({ ...config.defaultForm, propertyType: land ? "Arsa" : "Daire", price: land ? "3000000" : "6500000", totalArea: land ? "500" : "", grossArea: land ? "" : "110", netArea: land ? "" : "85", monthlyRent: land ? "" : "30000", roomCount: land ? "" : "2+1", referencePricePerM2: land ? "5500" : "60000" });
        setImportStatus("Örnek veriler gösteriliyor. Bunlar gerçek bir ilan veya güncel bölge fiyatı değildir.");
        calculateAndRender();
    }));

    function calculateAndRender({ shouldScroll = false, showValidation = true } = {}) {
        clearErrors();
        const rawState = readState();
        const state = getNumericState(rawState);
        const estimate = estimateValue(state);
        const errors = validate(state, estimate);
        if (errors.length) {
            showEmptyResult();
            if (showValidation) showErrors(errors, shouldScroll);
            return false;
        }
        const isRental = state.transactionType === "rent";
        const isLand = !isRental && getPropertyGroup(state.propertyType) === "land";
        if (isLand && estimate.available) state.landComparablePrice = estimate.pricePerM2;
        showEmptyResult();
        latestState = state;
        if (!isRental && !(state.price > 0)) {
            elements.emptyResult.hidden = true;
        } else if (isRental) {
            latestResult = core.calculateRentalMoveInCost({ monthlyRent: state.price, deposit: state.deposit, rentalServiceFee: state.rentalServiceFee, vatRate: state.rentalVatRate, dues: state.dues });
            renderRental(state, latestResult);
        } else if (isLand) {
            latestResult = core.calculateLandAnalysis(state);
            renderLand(state, latestResult);
        } else {
            latestResult = core.calculateSaleAnalysis(state);
            renderSale(state, latestResult);
        }
        renderValuation(state, estimate);
        if (!isRental && !isLand && latestResult) updateShareLinks(state, latestResult);
        hasSuccessfulAnalysis = true;
        elements.copyStatus.textContent = "";
        if (shouldScroll) {
            const target = isRental ? elements.rentalResult : byId("valuation-result");
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

        if (field.dataset.value === "price" || currencyFields.has(field.name)) field.value = formatCurrencyInput(field.value);
        else if (field.dataset.value === "area") field.value = sanitizeDecimalInput(field.value);
        else if (decimalFields.has(field.name)) field.value = sanitizeDecimalInput(field.value);
        else if (integerFields.has(field.name)) field.value = field.value.replace(/\D/g, "");
        if (["netArea", "grossArea"].includes(field.name) && !areaBasisCustomized) {
            const basis = form.elements.areaBasis.value;
            const selectedArea = parseLocalizedDecimal(form.elements[basis === "net" ? "netArea" : "grossArea"].value);
            const alternative = parseLocalizedDecimal(form.elements[basis === "net" ? "grossArea" : "netArea"].value);
            if (!(selectedArea > 0) && alternative > 0) form.elements.areaBasis.value = basis === "net" ? "gross" : "net";
        }
        if (field.name === "rentalServiceFee") rentalServiceFeeCustomized = true;
        if (field.name === "titleDeedTransactionValue") titleDeedTransactionValueCustomized = true;
        if (field.name === "price" && getTransactionType() === "rent" && config.rentalServiceFeeMode === "one-month-rent" && !rentalServiceFeeCustomized) form.elements.rentalServiceFee.value = field.value;
        if (field.name === "price" && getTransactionType() === "sale" && !titleDeedTransactionValueCustomized) form.elements.titleDeedTransactionValue.value = field.value;
        field.removeAttribute("aria-invalid");
        if (["buyerTitleDeedRate", "sellerTitleDeedRate", "buyerServiceFeeRate", "sellerServiceFeeRate"].includes(field.name)) updateRateSummaries();
        if (["price", "rentalServiceFee"].includes(field.name)) updateRentalServiceWarning();
        scheduleAutomaticCalculation();
    });

    form.addEventListener("change", (event) => {

        if (event.target.name === "areaBasis") areaBasisCustomized = true;
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
        } else {
            if (event.target.name === "valuationMethod") updateValuationMethod();
            scheduleAutomaticCalculation();
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        calculateAndRender({ shouldScroll: true, showValidation: true });
    });

    elements.reset.addEventListener("click", () => {

        window.clearTimeout(autoCalculationTimer);
        importedSource = "";
        importedTitle = "";
        byId("listing-text").value = "";
        byId("import-target").value = "property";
        setImportStatus("İlan metnini yapıştırın veya aşağıdaki alanları doldurun.");
        rentalServiceFeeCustomized = false;
        titleDeedTransactionValueCustomized = false;
        hasSuccessfulAnalysis = false;
        applyState(config.defaultForm);
        showEmptyResult();
        form.elements.price.focus();
        elements.copyStatus.textContent = "Form başlangıç değerlerine döndürüldü.";
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
    clearRetiredSavedState();
    applyState(config.defaultForm);
    updateRentalServiceWarning();
    showEmptyResult();
}());
