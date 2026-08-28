(function initRealEstateAnalysisApp() {
    "use strict";

    const panel = document.getElementById("emlak-portfoy-analizi");
    const form = document.getElementById("real-estate-form");
    const core = window.RealEstateAnalysisCore;
    const config = window.RealEstateAnalysisConfig;
    if (!panel || !form || !core || !config) return;

    const currencyFields = new Set(["price", "dues", "monthlyRent", "annualExpenses", "deposit", "rentalServiceFee"]);
    const decimalFields = new Set(["netArea", "grossArea", "buyerTitleDeedRate", "sellerTitleDeedRate", "serviceFeeRate", "vatRate", "rentalVatRate"]);
    const integerFields = new Set(["buildingAge", "floor", "totalFloors"]);
    const elements = {
        saleInvestment: document.getElementById("real-estate-sale-investment"),
        saleCosts: document.getElementById("real-estate-sale-costs"),
        rentalCosts: document.getElementById("real-estate-rental-costs"),
        priceLabel: document.getElementById("real-estate-price-label"),
        totalTitleRate: document.getElementById("real-estate-total-title-rate"),
        errors: document.getElementById("real-estate-errors"),
        emptyResult: document.getElementById("real-estate-empty-result"),
        saleResult: document.getElementById("real-estate-sale-result"),
        rentalResult: document.getElementById("real-estate-rental-result"),
        reset: document.getElementById("real-estate-reset"),
        clearStorage: document.getElementById("real-estate-clear-storage"),
        copy: document.getElementById("real-estate-copy"),
        rentalCopy: document.getElementById("real-estate-rental-copy"),
        copyStatus: document.getElementById("real-estate-copy-status"),
    };
    let latestResult = null;
    let latestState = null;

    function parseCurrency(value) {
        const digits = String(value || "").replace(/\D/g, "");
        const number = Number(digits);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    function parseLocalizedDecimal(value) {
        const normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".");
        const number = Number(normalized);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    function formatCurrencyInput(value) {
        const digits = String(value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (!digits) return "";
        const number = Number(digits);
        return Number.isFinite(number) ? number.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) : "";
    }

    function sanitizeDecimalInput(value) {
        const normalized = String(value || "").replace(/[^\d,.]/g, "").replace(/,/g, ".");
        const parts = normalized.split(".");
        return parts.length > 1 ? `${parts.shift()}.${parts.join("").slice(0, 2)}` : parts[0];
    }

    function getTransactionType() {
        return form.elements.transactionType.value === "rent" ? "rent" : "sale";
    }

    function readState() {
        const state = {};
        Object.keys(config.defaultForm).forEach((name) => {
            if (name === "transactionType") {
                state[name] = getTransactionType();
                return;
            }
            const field = form.elements[name];
            state[name] = field ? String(field.value || "") : String(config.defaultForm[name] || "");
        });
        return state;
    }

    function getNumericState(state) {
        const parsed = { ...state };
        currencyFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        decimalFields.forEach((name) => { parsed[name] = parseLocalizedDecimal(state[name]); });
        integerFields.forEach((name) => { parsed[name] = parseCurrency(state[name]); });
        return parsed;
    }

    function applyState(state) {
        const safeState = { ...config.defaultForm, ...(state || {}) };
        Array.from(form.elements).forEach((field) => field.removeAttribute?.("aria-invalid"));
        Object.keys(config.defaultForm).forEach((name) => {
            if (name === "transactionType") {
                const radio = form.querySelector(`input[name="transactionType"][value="${safeState[name] === "rent" ? "rent" : "sale"}"]`);
                if (radio) radio.checked = true;
                return;
            }
            const field = form.elements[name];
            if (!field) return;
            const value = safeState[name] == null ? "" : String(safeState[name]);
            field.value = currencyFields.has(name) ? formatCurrencyInput(value) : value;
        });
        updateTransactionView();
        updateTotalTitleRate();
        clearErrors();
    }

    function loadState() {
        try {
            const saved = window.localStorage.getItem(config.storageKey);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    }

    function saveState() {
        try {
            window.localStorage.setItem(config.storageKey, JSON.stringify(readState()));
        } catch {
            // Depolama kapalıysa araç hesaplamaya devam eder.
        }
    }

    function clearSavedState() {
        try {
            window.localStorage.removeItem(config.storageKey);
        } catch {
            // Depolama kapalıysa başlangıç değerleri yine uygulanır.
        }
    }

    function updateTransactionView() {
        const isRental = getTransactionType() === "rent";
        elements.saleInvestment.hidden = isRental;
        elements.saleCosts.hidden = isRental;
        elements.rentalCosts.hidden = !isRental;
        elements.priceLabel.textContent = isRental ? "Aylık kira" : "İlan / satış fiyatı";
        form.querySelector('button[type="submit"]').lastChild.textContent = isRental ? " Giriş Maliyetini Hesapla" : " Analiz Et";
    }

    function updateTotalTitleRate() {
        const buyerRate = parseLocalizedDecimal(form.elements.buyerTitleDeedRate.value);
        const sellerRate = parseLocalizedDecimal(form.elements.sellerTitleDeedRate.value);
        const totalRate = buyerRate + sellerRate;
        elements.totalTitleRate.textContent = `Toplam %${core.formatDecimal(totalRate, Number.isInteger(totalRate) ? 0 : 1)}`;
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

        if (!(state.price > 0)) mark("price", state.transactionType === "rent" ? "Aylık kira tutarını girin." : "Satış fiyatını girin.");
        if (!(state.netArea > 0)) mark("netArea", "Net alan 0'dan büyük olmalıdır.");
        if (!(state.grossArea > 0)) mark("grossArea", "Brüt alan 0'dan büyük olmalıdır.");
        if (state.netArea > 0 && state.grossArea > 0 && state.netArea > state.grossArea) mark("netArea", "Net alan brüt alandan büyük olamaz.");
        if (state.transactionType === "sale" && !(state.monthlyRent > 0)) mark("monthlyRent", "Tahmini aylık kira tutarını girin.");
        if (state.floor > 0 && state.totalFloors > 0 && state.floor > state.totalFloors) mark("floor", "Kat değeri toplam kat sayısından büyük olamaz.");

        const rateNames = state.transactionType === "sale"
            ? ["buyerTitleDeedRate", "sellerTitleDeedRate", "serviceFeeRate", "vatRate"]
            : ["rentalVatRate"];
        rateNames.forEach((name) => {
            if (state[name] > 100) mark(name, "Oran alanları %100'ü geçemez.");
        });
        return errors;
    }

    function showErrors(errors) {
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
        elements.errors.focus({ preventScroll: true });
        elements.errors.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function formatSquareMeterPrice(value) {
        return value === null ? "—" : `${core.formatCurrency(value)} / m²`;
    }

    function formatYears(value) {
        return value === null ? "—" : `${core.formatDecimal(value, 1)} yıl`;
    }

    function renderSale(state, result) {
        elements.emptyResult.hidden = true;
        elements.rentalResult.hidden = true;
        elements.saleResult.hidden = false;
        const scoreCard = document.getElementById("real-estate-score-card");
        scoreCard.dataset.level = result.portfolio.level.id;
        setText("real-estate-score", result.portfolio.score);
        setText("real-estate-score-label", result.portfolio.level.label);
        setText("real-estate-kpi-gross", formatSquareMeterPrice(result.pricePerGrossArea));
        setText("real-estate-kpi-net", formatSquareMeterPrice(result.pricePerNetArea));
        setText("real-estate-kpi-yield", core.formatPercentage(result.rent.grossYield, 2));
        setText("real-estate-kpi-amortization", formatYears(result.amortizationYears));
        setText("real-estate-efficiency", core.formatPercentage(result.efficiency, 1));
        setText("real-estate-dues-ratio", core.formatPercentage(result.duesRatio, 1));
        setText("real-estate-annual-rent", core.formatCurrency(result.rent.annualGrossRent));
        setText("real-estate-annual-expenses-result", core.formatCurrency(state.annualExpenses));
        setText("real-estate-net-yield", core.formatPercentage(result.rent.netYield, 2));
        setText("real-estate-total-transaction-cost", `Toplam tahmini gider ${core.formatCurrency(result.transactionCosts.total)}`);
        setText("real-estate-buyer-total", core.formatCurrency(result.buyer.total));
        setText("real-estate-buyer-price", core.formatCurrency(result.buyer.propertyPrice));
        setText("real-estate-buyer-title-fee", core.formatCurrency(result.buyer.titleDeedFee));
        setText("real-estate-buyer-service-fee", core.formatCurrency(result.buyer.serviceFee));
        setText("real-estate-buyer-vat", core.formatCurrency(result.buyer.serviceFeeVat));
        setText("real-estate-seller-net", core.formatCurrency(result.seller.net));
        setText("real-estate-seller-price", core.formatCurrency(result.seller.propertyPrice));
        setText("real-estate-seller-title-fee", core.formatCurrency(result.seller.titleDeedFee));
        setText("real-estate-seller-service-fee", core.formatCurrency(result.seller.serviceFee));
        setText("real-estate-seller-vat", core.formatCurrency(result.seller.serviceFeeVat));
        setText("real-estate-title-total", core.formatCurrency(result.transactionCosts.titleDeed));
        setText("real-estate-service-total", core.formatCurrency(result.transactionCosts.serviceFee));
        setText("real-estate-vat-total", core.formatCurrency(result.transactionCosts.vat));

        setText("real-estate-analysis-summary", `Girdiğiniz verilere göre gayrimenkulün yıllık brüt kira getirisi ${core.formatPercentage(result.rent.grossYield, 1)} ve tahmini amortisman süresi ${core.formatDecimal(result.amortizationYears, 1)} yıl seviyesinde.`);
        const list = document.getElementById("real-estate-analysis-list");
        list.replaceChildren(...result.analysis.map((insight) => {
            const item = document.createElement("li");
            item.textContent = insight;
            return item;
        }));
    }

    function renderRental(state, result) {
        elements.emptyResult.hidden = true;
        elements.saleResult.hidden = true;
        elements.rentalResult.hidden = false;
        setText("real-estate-rental-total", core.formatCurrency(result.total));
        setText("real-estate-rental-first-month", core.formatCurrency(result.firstMonthRent));
        setText("real-estate-rental-deposit-result", core.formatCurrency(result.deposit));
        setText("real-estate-rental-service-result", core.formatCurrency(result.serviceFee));
        setText("real-estate-rental-vat-result", core.formatCurrency(result.serviceFeeVat));
        setText("real-estate-rental-dues-result", core.formatCurrency(state.dues));
    }

    function showEmptyResult() {
        elements.emptyResult.hidden = false;
        elements.saleResult.hidden = true;
        elements.rentalResult.hidden = true;
        latestResult = null;
        latestState = null;
    }

    function buildSaleCopyText(state, result) {
        return [
            "Gayrimenkul Analizi",
            "",
            `Satış Fiyatı: ${core.formatCurrency(state.price)}`,
            `Brüt Alan: ${core.formatDecimal(state.grossArea, 0)} m²`,
            `Net Alan: ${core.formatDecimal(state.netArea, 0)} m²`,
            "",
            `Brüt m² Fiyatı: ${core.formatCurrency(result.pricePerGrossArea)} / m²`,
            `Net m² Fiyatı: ${core.formatCurrency(result.pricePerNetArea)} / m²`,
            `Tahmini Aylık Kira: ${core.formatCurrency(state.monthlyRent)}`,
            `Yıllık Brüt Getiri: ${core.formatPercentage(result.rent.grossYield, 2)}`,
            `Amortisman Süresi: ${core.formatDecimal(result.amortizationYears, 1)} yıl`,
            "",
            `Portföy Skoru: ${result.portfolio.score}/100`,
            "",
            "Bu değerler bilgilendirme amaçlı tahmini hesaplamalardır.",
        ].join("\n");
    }

    function buildRentalCopyText(state, result) {
        return [
            "Kiralık Gayrimenkul Analizi",
            "",
            `Aylık Kira: ${core.formatCurrency(result.firstMonthRent)}`,
            `Depozito: ${core.formatCurrency(result.deposit)}`,
            `Hizmet Bedeli: ${core.formatCurrency(result.serviceFee)}`,
            `KDV: ${core.formatCurrency(result.serviceFeeVat)}`,
            `Aidat: ${core.formatCurrency(state.dues)}`,
            "",
            `Tahmini İlk Giriş Maliyeti: ${core.formatCurrency(result.total)}`,
            "",
            "Bu değerler bilgilendirme amaçlı tahmini hesaplamalardır.",
        ].join("\n");
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
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
            elements.copyStatus.textContent = "Analiz panoya kopyalandı.";
        } catch {
            elements.copyStatus.textContent = "Kopyalama başarısız oldu. Tarayıcı izinlerini kontrol edin.";
        }
    }

    form.addEventListener("input", (event) => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement)) return;
        if (currencyFields.has(field.name)) field.value = formatCurrencyInput(field.value);
        else if (decimalFields.has(field.name)) field.value = sanitizeDecimalInput(field.value);
        else if (integerFields.has(field.name)) field.value = field.value.replace(/\D/g, "");
        field.removeAttribute("aria-invalid");
        if (["buyerTitleDeedRate", "sellerTitleDeedRate"].includes(field.name)) updateTotalTitleRate();
        saveState();
    });
    form.addEventListener("change", (event) => {
        if (event.target.name === "transactionType") {
            updateTransactionView();
            showEmptyResult();
        }
        saveState();
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors();
        const rawState = readState();
        const state = getNumericState(rawState);
        const errors = validate(state);
        if (errors.length) {
            showErrors([...new Set(errors)]);
            showEmptyResult();
            return;
        }
        latestState = state;
        latestResult = state.transactionType === "sale"
            ? core.calculateSaleAnalysis(state)
            : core.calculateRentalMoveInCost({
                monthlyRent: state.price,
                deposit: state.deposit,
                rentalServiceFee: state.rentalServiceFee,
                vatRate: state.rentalVatRate,
            });
        if (state.transactionType === "sale") renderSale(state, latestResult);
        else renderRental(state, latestResult);
        saveState();
        elements.copyStatus.textContent = "";
        const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        elements.saleResult.hidden
            ? elements.rentalResult.scrollIntoView({ behavior: scrollBehavior, block: "start" })
            : elements.saleResult.scrollIntoView({ behavior: scrollBehavior, block: "start" });
    });
    elements.reset.addEventListener("click", () => {
        applyState(config.defaultForm);
        saveState();
        showEmptyResult();
        form.elements.price.focus();
        elements.copyStatus.textContent = "Form başlangıç değerlerine döndürüldü.";
    });
    elements.clearStorage.addEventListener("click", () => {
        clearSavedState();
        applyState(config.defaultForm);
        showEmptyResult();
        form.elements.price.focus();
        elements.copyStatus.textContent = "Kaydedilen son veriler temizlendi.";
    });
    elements.copy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildSaleCopyText(latestState, latestResult));
    });
    elements.rentalCopy.addEventListener("click", () => {
        if (latestState && latestResult) copyText(buildRentalCopyText(latestState, latestResult));
    });

    applyState(loadState() || config.defaultForm);
    showEmptyResult();
}());
