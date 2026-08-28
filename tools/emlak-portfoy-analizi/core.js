(function initRealEstateAnalysisCore(root, factory) {
    const config = typeof module === "object" && module.exports
        ? require("./config.js")
        : root?.RealEstateAnalysisConfig;
    const core = factory(config);
    if (typeof module === "object" && module.exports) module.exports = core;
    if (root) root.RealEstateAnalysisCore = core;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateAnalysisCore(config) {
    "use strict";

    const safeConfig = config || { scoreThresholds: {} };

    function toFiniteNonNegative(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    function safeDivide(numerator, denominator) {
        const top = toFiniteNonNegative(numerator);
        const bottom = toFiniteNonNegative(denominator);
        return bottom > 0 ? top / bottom : null;
    }

    function calculatePricePerSquareMeter(price, area) {
        return safeDivide(price, area);
    }

    function calculateEfficiency(netArea, grossArea) {
        const ratio = safeDivide(netArea, grossArea);
        return ratio === null ? null : ratio * 100;
    }

    function calculateRentalYield(monthlyRent, price, annualExpenses = 0) {
        const rent = toFiniteNonNegative(monthlyRent);
        const salePrice = toFiniteNonNegative(price);
        const expenses = toFiniteNonNegative(annualExpenses);
        const annualGrossRent = rent * 12;
        const annualNetRent = annualGrossRent - expenses;
        const grossRatio = safeDivide(annualGrossRent, salePrice);
        const netRatio = salePrice > 0 ? annualNetRent / salePrice : null;

        return Object.freeze({
            annualGrossRent,
            annualNetRent,
            grossYield: grossRatio === null ? null : grossRatio * 100,
            netYield: netRatio === null ? null : netRatio * 100,
        });
    }

    function calculateAmortizationYears(price, monthlyRent) {
        return safeDivide(price, toFiniteNonNegative(monthlyRent) * 12);
    }

    function calculateRateAmount(amount, rate) {
        const base = toFiniteNonNegative(amount);
        const percentage = toFiniteNonNegative(rate);
        return base * percentage / 100;
    }

    function paysCommission(payer, party) {
        return payer === "both" || payer === party;
    }

    function calculateBuyerCosts({ price, buyerTitleDeedRate, serviceFeeRate, vatRate, commissionPayer }) {
        const propertyPrice = toFiniteNonNegative(price);
        const titleDeedFee = calculateRateAmount(propertyPrice, buyerTitleDeedRate);
        const serviceFee = paysCommission(commissionPayer, "buyer")
            ? calculateRateAmount(propertyPrice, serviceFeeRate)
            : 0;
        const serviceFeeVat = calculateRateAmount(serviceFee, vatRate);

        return Object.freeze({
            propertyPrice,
            titleDeedFee,
            serviceFee,
            serviceFeeVat,
            total: propertyPrice + titleDeedFee + serviceFee + serviceFeeVat,
        });
    }

    function calculateSellerNet({ price, sellerTitleDeedRate, serviceFeeRate, vatRate, commissionPayer }) {
        const propertyPrice = toFiniteNonNegative(price);
        const titleDeedFee = calculateRateAmount(propertyPrice, sellerTitleDeedRate);
        const serviceFee = paysCommission(commissionPayer, "seller")
            ? calculateRateAmount(propertyPrice, serviceFeeRate)
            : 0;
        const serviceFeeVat = calculateRateAmount(serviceFee, vatRate);

        return Object.freeze({
            propertyPrice,
            titleDeedFee,
            serviceFee,
            serviceFeeVat,
            net: Math.max(0, propertyPrice - titleDeedFee - serviceFee - serviceFeeVat),
        });
    }

    function pointsByMinimum(value, thresholds) {
        return thresholds.find((threshold) => value >= threshold.min)?.points || 0;
    }

    function pointsByMaximum(value, thresholds, key = "max") {
        return thresholds.find((threshold) => value < threshold[key] || (key === "max" && value <= threshold[key]))?.points || 0;
    }

    function getScoreLevel(score) {
        const value = Math.max(0, Math.min(100, Math.round(toFiniteNonNegative(score))));
        if (value >= 85) return Object.freeze({ id: "very-strong", label: "Çok Güçlü" });
        if (value >= 70) return Object.freeze({ id: "strong", label: "Güçlü" });
        if (value >= 55) return Object.freeze({ id: "medium", label: "Orta" });
        if (value >= 40) return Object.freeze({ id: "weak", label: "Zayıf" });
        return Object.freeze({ id: "low", label: "Düşük" });
    }

    function calculatePortfolioScore({ grossYield, amortizationYears, efficiency, duesRatio }) {
        const thresholds = safeConfig.scoreThresholds;
        const components = Object.freeze({
            rentalYield: pointsByMinimum(toFiniteNonNegative(grossYield), thresholds.rentalYield || []),
            amortization: pointsByMaximum(toFiniteNonNegative(amortizationYears), thresholds.amortization || []),
            efficiency: pointsByMinimum(toFiniteNonNegative(efficiency), thresholds.efficiency || []),
            duesRatio: pointsByMaximum(toFiniteNonNegative(duesRatio), thresholds.duesRatio || [], "maxExclusive"),
        });
        const score = Math.max(0, Math.min(100, Object.values(components).reduce((total, points) => total + points, 0)));
        return Object.freeze({ score, components, level: getScoreLevel(score) });
    }

    function generatePortfolioAnalysis({ grossYield, amortizationYears, efficiency, duesRatio }) {
        const yieldValue = toFiniteNonNegative(grossYield);
        const years = toFiniteNonNegative(amortizationYears);
        const efficiencyValue = toFiniteNonNegative(efficiency);
        const duesValue = toFiniteNonNegative(duesRatio);
        const insights = [];

        if (yieldValue >= 8) insights.push("Yıllık brüt kira getirisi güçlü bir seviyede görünüyor.");
        else if (yieldValue >= 6) insights.push("Yıllık brüt kira getirisi dengeli ve yatırım açısından olumlu bir seviyede.");
        else if (yieldValue >= 4) insights.push("Yıllık brüt kira getirisi orta seviyede; alternatif portföylerle karşılaştırılması faydalı olabilir.");
        else insights.push("Yıllık brüt kira getirisi düşük seviyede görünüyor.");

        if (years <= 15) insights.push(`Yaklaşık ${formatDecimal(years, 1)} yıllık amortisman süresi yatırım açısından güçlü bir seviyeye işaret ediyor.`);
        else if (years <= 20) insights.push(`Yaklaşık ${formatDecimal(years, 1)} yıllık amortisman süresi makul bir aralıkta.`);
        else if (years <= 25) insights.push("Amortisman süresi uzadığı için uzun vadeli getiri beklentisi dikkatle değerlendirilmelidir.");
        else insights.push("Amortisman süresi 25 yılın üzerinde olduğu için gayrimenkul kira getirisi açısından zayıf görünüyor.");

        if (efficiencyValue >= 75) insights.push(`Net/brüt kullanım oranı %${formatDecimal(efficiencyValue, 1)} seviyesinde ve alan kullanımı dengeli görünüyor.`);
        else if (efficiencyValue >= 65) insights.push("Net/brüt kullanım oranı kabul edilebilir olsa da ortak alan payı ayrıca incelenebilir.");
        else insights.push("Net/brüt kullanım oranı düşük olduğu için ortak alan payı yüksek olabilir.");

        if (duesValue >= 20) insights.push("Aidatın aylık kiraya oranı yüksek. Bu durum net kira getirisini olumsuz etkileyebilir.");
        else if (duesValue >= 10) insights.push("Aidat/kira oranı belirgin seviyede; düzenli gider etkisi hesaba katılmalıdır.");
        else insights.push("Aidatın tahmini kiraya oranı yönetilebilir seviyede görünüyor.");

        return insights;
    }

    function calculateSaleAnalysis(input) {
        const price = toFiniteNonNegative(input.price);
        const monthlyRent = toFiniteNonNegative(input.monthlyRent);
        const pricePerGrossArea = calculatePricePerSquareMeter(price, input.grossArea);
        const pricePerNetArea = calculatePricePerSquareMeter(price, input.netArea);
        const efficiency = calculateEfficiency(input.netArea, input.grossArea);
        const rent = calculateRentalYield(monthlyRent, price, input.annualExpenses);
        const amortizationYears = calculateAmortizationYears(price, monthlyRent);
        const duesRatioValue = safeDivide(input.dues, monthlyRent);
        const duesRatio = duesRatioValue === null ? null : duesRatioValue * 100;
        const buyer = calculateBuyerCosts(input);
        const seller = calculateSellerNet(input);
        const buyerCommissionCount = paysCommission(input.commissionPayer, "buyer") ? 1 : 0;
        const sellerCommissionCount = paysCommission(input.commissionPayer, "seller") ? 1 : 0;
        const titleDeed = Object.freeze({
            buyer: buyer.titleDeedFee,
            seller: seller.titleDeedFee,
            total: buyer.titleDeedFee + seller.titleDeedFee,
        });
        const serviceFeeBase = calculateRateAmount(price, input.serviceFeeRate);
        const serviceFeeVatBase = calculateRateAmount(serviceFeeBase, input.vatRate);
        const commissionPartyCount = buyerCommissionCount + sellerCommissionCount;
        const transactionCosts = Object.freeze({
            titleDeed: titleDeed.total,
            serviceFee: serviceFeeBase * commissionPartyCount,
            vat: serviceFeeVatBase * commissionPartyCount,
            total: titleDeed.total + ((serviceFeeBase + serviceFeeVatBase) * commissionPartyCount),
        });
        const portfolio = calculatePortfolioScore({
            grossYield: rent.grossYield,
            amortizationYears,
            efficiency,
            duesRatio,
        });

        return Object.freeze({
            price,
            monthlyRent,
            pricePerGrossArea,
            pricePerNetArea,
            efficiency,
            duesRatio,
            amortizationYears,
            rent,
            buyer,
            seller,
            titleDeed,
            transactionCosts,
            portfolio,
            analysis: generatePortfolioAnalysis({
                grossYield: rent.grossYield,
                amortizationYears,
                efficiency,
                duesRatio,
            }),
        });
    }

    function calculateRentalMoveInCost({ monthlyRent, deposit, rentalServiceFee, vatRate }) {
        const firstMonthRent = toFiniteNonNegative(monthlyRent);
        const depositAmount = toFiniteNonNegative(deposit);
        const serviceFee = toFiniteNonNegative(rentalServiceFee);
        const serviceFeeVat = calculateRateAmount(serviceFee, vatRate);
        return Object.freeze({
            firstMonthRent,
            deposit: depositAmount,
            serviceFee,
            serviceFeeVat,
            total: firstMonthRent + depositAmount + serviceFee + serviceFeeVat,
        });
    }

    function formatCurrency(value, options = {}) {
        const amount = toFiniteNonNegative(value);
        const maximumFractionDigits = Number.isInteger(options.maximumFractionDigits)
            ? options.maximumFractionDigits
            : 0;
        return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits })} TL`;
    }

    function formatPercentage(value, digits = 2) {
        return `%${formatDecimal(value, digits)}`;
    }

    function formatDecimal(value, digits = 1) {
        const numericValue = Number(value);
        const amount = Number.isFinite(numericValue) ? numericValue : 0;
        return amount.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    return Object.freeze({
        calculateAmortizationYears,
        calculateBuyerCosts,
        calculateEfficiency,
        calculatePortfolioScore,
        calculatePricePerSquareMeter,
        calculateRateAmount,
        calculateRentalMoveInCost,
        calculateRentalYield,
        calculateSaleAnalysis,
        calculateSellerNet,
        formatCurrency,
        formatDecimal,
        formatPercentage,
        generatePortfolioAnalysis,
        getScoreLevel,
        safeDivide,
        toFiniteNonNegative,
    });
}));
