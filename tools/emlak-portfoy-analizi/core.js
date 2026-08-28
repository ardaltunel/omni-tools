(function initRealEstateAnalysisCore(root, factory) {
    const config = typeof module === "object" && module.exports
        ? require("./config.js")
        : root?.RealEstateAnalysisConfig;
    const core = factory(config);
    if (typeof module === "object" && module.exports) module.exports = core;
    if (root) root.RealEstateAnalysisCore = core;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateAnalysisCore(config) {
    "use strict";

    const safeConfig = config || { scoreThresholds: {}, scoreCriteria: {} };

    function toFiniteNonNegative(value) {
        if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
        let normalized = typeof value === "string" ? value.trim().replace(/\s/g, "") : value;
        if (typeof normalized === "string") {
            if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
            else if (normalized.includes(",") && normalized.includes(".")) {
                normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
                    ? normalized.replace(/\./g, "").replace(",", ".")
                    : normalized.replace(/,/g, "");
            } else normalized = normalized.replace(",", ".");
        }
        const number = Number(normalized);
        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    function numberOrZero(value) {
        return toFiniteNonNegative(value) ?? 0;
    }

    function isKnown(value) {
        return toFiniteNonNegative(value) !== null;
    }

    function safeDivide(numerator, denominator) {
        const top = toFiniteNonNegative(numerator);
        const bottom = toFiniteNonNegative(denominator);
        return top !== null && bottom !== null && bottom > 0 ? top / bottom : null;
    }

    function calculatePricePerSquareMeter(price, area) {
        return safeDivide(price, area);
    }

    function calculateEfficiency(netArea, grossArea) {
        const ratio = safeDivide(netArea, grossArea);
        return ratio === null ? null : ratio * 100;
    }

    function calculateRentalYield(monthlyRent, price, annualExpenses = null) {
        const rent = toFiniteNonNegative(monthlyRent);
        const salePrice = toFiniteNonNegative(price);
        const expenses = toFiniteNonNegative(annualExpenses);
        const annualGrossRent = rent === null ? null : rent * 12;
        const annualNetRent = annualGrossRent === null ? null : annualGrossRent - (expenses ?? 0);
        const grossRatio = safeDivide(annualGrossRent, salePrice);
        const netRatio = salePrice !== null && salePrice > 0 && annualNetRent !== null
            ? annualNetRent / salePrice
            : null;

        return Object.freeze({
            annualGrossRent,
            annualNetRent,
            annualExpenses: expenses,
            grossYield: grossRatio === null ? null : grossRatio * 100,
            netYield: netRatio === null ? null : netRatio * 100,
        });
    }

    function calculateAmortizationYears(price, monthlyRent) {
        const rent = toFiniteNonNegative(monthlyRent);
        return rent === null ? null : safeDivide(price, rent * 12);
    }

    function calculateRateAmount(amount, rate) {
        const base = toFiniteNonNegative(amount);
        const percentage = toFiniteNonNegative(rate);
        return base === null || percentage === null ? 0 : base * percentage / 100;
    }

    function getLegacyServiceRate(input, party) {
        const rate = toFiniteNonNegative(input.serviceFeeRate);
        const payer = input.commissionPayer || "both";
        return rate !== null && (payer === "both" || payer === party) ? rate : 0;
    }

    function getPartyServiceRate(input, party) {
        const key = party === "buyer" ? "buyerServiceFeeRate" : "sellerServiceFeeRate";
        const rate = toFiniteNonNegative(input[key]);
        return rate === null ? getLegacyServiceRate(input, party) : rate;
    }

    function resolveTitleDeedBase(input) {
        return toFiniteNonNegative(input.titleDeedTransactionValue) ?? numberOrZero(input.price);
    }

    function calculateBuyerCosts(input) {
        const propertyPrice = numberOrZero(input.price);
        const titleDeedBase = resolveTitleDeedBase(input);
        const titleDeedFee = calculateRateAmount(titleDeedBase, input.buyerTitleDeedRate);
        const serviceFeeRate = getPartyServiceRate(input, "buyer");
        const serviceFee = calculateRateAmount(propertyPrice, serviceFeeRate);
        const serviceFeeVat = calculateRateAmount(serviceFee, input.vatRate);
        const otherCosts = numberOrZero(input.buyerOtherCosts);

        return Object.freeze({
            propertyPrice,
            titleDeedBase,
            titleDeedFee,
            serviceFeeRate,
            serviceFee,
            serviceFeeVat,
            otherCosts,
            total: propertyPrice + titleDeedFee + serviceFee + serviceFeeVat + otherCosts,
        });
    }

    function calculateSellerNet(input) {
        const propertyPrice = numberOrZero(input.price);
        const titleDeedBase = resolveTitleDeedBase(input);
        const titleDeedFee = calculateRateAmount(titleDeedBase, input.sellerTitleDeedRate);
        const serviceFeeRate = getPartyServiceRate(input, "seller");
        const serviceFee = calculateRateAmount(propertyPrice, serviceFeeRate);
        const serviceFeeVat = calculateRateAmount(serviceFee, input.vatRate);
        const otherCosts = numberOrZero(input.sellerOtherCosts);

        return Object.freeze({
            propertyPrice,
            titleDeedBase,
            titleDeedFee,
            serviceFeeRate,
            serviceFee,
            serviceFeeVat,
            otherCosts,
            net: Math.max(0, propertyPrice - titleDeedFee - serviceFee - serviceFeeVat - otherCosts),
        });
    }

    function pointsByMinimum(value, thresholds) {
        return thresholds.find((threshold) => value >= threshold.min)?.points ?? 0;
    }

    function pointsByMaximum(value, thresholds, key = "max") {
        return thresholds.find((threshold) => (
            key === "maxExclusive" ? value < threshold[key] : value <= threshold[key]
        ))?.points ?? 0;
    }

    function getScoreLevel(score) {
        const numericScore = toFiniteNonNegative(score) ?? 0;
        const value = Math.max(0, Math.min(100, Math.round(numericScore)));
        if (value >= 85) return Object.freeze({ id: "very-strong", label: "Çok Güçlü" });
        if (value >= 70) return Object.freeze({ id: "strong", label: "Güçlü" });
        if (value >= 55) return Object.freeze({ id: "medium", label: "Orta" });
        if (value >= 40) return Object.freeze({ id: "weak", label: "Zayıf" });
        return Object.freeze({ id: "low", label: "Düşük" });
    }

    function calculateScoreCompleteness(metrics) {
        const keys = ["grossYield", "amortizationYears", "efficiency", "duesRatio"];
        const availableCount = keys.filter((key) => isKnown(metrics[key])).length;
        return Object.freeze({
            availableCount,
            totalCount: keys.length,
            percentage: Math.round((availableCount / keys.length) * 100),
        });
    }

    function calculateFinancialScore(metrics) {
        const thresholds = safeConfig.scoreThresholds || {};
        const criteria = safeConfig.scoreCriteria || {};
        const definitions = {
            rentalYield: {
                value: toFiniteNonNegative(metrics.grossYield),
                points: (value) => pointsByMinimum(value, thresholds.rentalYield || []),
            },
            amortization: {
                value: toFiniteNonNegative(metrics.amortizationYears),
                points: (value) => pointsByMaximum(value, thresholds.amortization || []),
            },
            efficiency: {
                value: toFiniteNonNegative(metrics.efficiency),
                points: (value) => pointsByMinimum(value, thresholds.efficiency || []),
            },
            duesRatio: {
                value: toFiniteNonNegative(metrics.duesRatio),
                points: (value) => pointsByMaximum(value, thresholds.duesRatio || [], "maxExclusive"),
            },
        };
        const components = {};
        let earnedPoints = 0;
        let availableMaximum = 0;

        Object.entries(definitions).forEach(([key, definition]) => {
            const maximum = Number(criteria[key]?.maximum) || { rentalYield: 35, amortization: 30, efficiency: 20, duesRatio: 15 }[key];
            const available = definition.value !== null;
            const points = available ? definition.points(definition.value) : null;
            if (available) {
                earnedPoints += points;
                availableMaximum += maximum;
            }
            components[key] = Object.freeze({
                label: criteria[key]?.label || key,
                points,
                maximum,
                available,
            });
        });

        const score = availableMaximum > 0
            ? Math.max(0, Math.min(100, Math.round((earnedPoints / availableMaximum) * 100)))
            : 0;
        const completeness = calculateScoreCompleteness(metrics);
        return Object.freeze({
            score,
            earnedPoints,
            availableMaximum,
            components: Object.freeze(components),
            completeness,
            level: getScoreLevel(score),
        });
    }

    function calculatePortfolioScore(metrics) {
        return calculateFinancialScore(metrics);
    }

    function calculateComparablePrice(comparable) {
        if (!comparable || typeof comparable !== "object") return null;
        return calculatePricePerSquareMeter(comparable.price, comparable.grossArea);
    }

    function getComparablePrices(comparables) {
        return (Array.isArray(comparables) ? comparables : [])
            .map((item) => typeof item === "number" ? toFiniteNonNegative(item) : calculateComparablePrice(item))
            .filter((value) => value !== null);
    }

    function calculateComparableAverage(comparables) {
        const prices = getComparablePrices(comparables);
        return prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
    }

    function calculateComparableMedian(comparables) {
        const prices = getComparablePrices(comparables).sort((a, b) => a - b);
        if (prices.length < 3) return null;
        const middle = Math.floor(prices.length / 2);
        return prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
    }

    function calculateComparableDifference(portfolioPricePerSquareMeter, comparisonPricePerSquareMeter) {
        const portfolioPrice = toFiniteNonNegative(portfolioPricePerSquareMeter);
        const comparisonPrice = toFiniteNonNegative(comparisonPricePerSquareMeter);
        if (portfolioPrice === null || comparisonPrice === null || comparisonPrice <= 0) return null;
        return ((portfolioPrice - comparisonPrice) / comparisonPrice) * 100;
    }

    function generateComparableAnalysis(difference, count) {
        const numericDifference = typeof difference === "number" && Number.isFinite(difference) ? difference : null;
        if (!count || numericDifference === null) return "Karşılaştırma için geçerli emsal eklenmedi.";
        const absoluteDifference = formatDecimal(Math.abs(numericDifference), 1);
        if (Math.abs(numericDifference) < 0.05) return "Portföy, girilen emsallerle aynı m² fiyatı seviyesinde.";
        return numericDifference < 0
            ? `Portföy, girilen emsallerin karşılaştırma m² fiyatına göre yaklaşık %${absoluteDifference} daha uygun.`
            : `Portföy, girilen emsallerin karşılaştırma m² fiyatından yaklaşık %${absoluteDifference} daha yüksek.`;
    }

    function calculateComparableAnalysis(comparables, portfolioPricePerSquareMeter) {
        const items = (Array.isArray(comparables) ? comparables : []).map((item, index) => ({
            ...item,
            index,
            pricePerSquareMeter: calculateComparablePrice(item),
        })).filter((item) => item.pricePerSquareMeter !== null);
        const average = calculateComparableAverage(items.map((item) => item.pricePerSquareMeter));
        const median = calculateComparableMedian(items.map((item) => item.pricePerSquareMeter));
        const comparisonValue = median ?? average;
        const difference = calculateComparableDifference(portfolioPricePerSquareMeter, comparisonValue);
        const count = items.length;
        const minimumRecommended = Number(safeConfig.minRecommendedComparables) || 3;
        const qualityMessage = count === 0
            ? "Emsal eklemek zorunlu değildir."
            : count === 1
                ? `Daha güvenilir karşılaştırma için en az ${minimumRecommended} emsal önerilir.`
                : count < minimumRecommended
                    ? "Karşılaştırma sınırlı sayıda emsale dayanıyor."
                    : "Emsal sayısı karşılaştırma için yeterli seviyede.";
        return Object.freeze({
            items: Object.freeze(items.map((item) => Object.freeze(item))),
            count,
            average,
            median,
            comparisonValue,
            comparisonBasis: median !== null ? "medyan" : "ortalama",
            difference,
            qualityMessage,
            message: generateComparableAnalysis(difference, count),
        });
    }

    function calculateOfferDifference(listPrice, offerPrice) {
        const ratio = safeDivide(offerPrice, listPrice);
        return ratio === null ? null : (ratio - 1) * 100;
    }

    function calculatePriceScenario(input, scenarioPrice, label = "Teklif") {
        const price = toFiniteNonNegative(scenarioPrice);
        if (price === null || price <= 0) return null;
        const scenarioInput = {
            ...input,
            price,
            titleDeedTransactionValue: price,
        };
        const rent = calculateRentalYield(input.monthlyRent, price, input.annualExpenses);
        const grossPrice = calculatePricePerSquareMeter(price, input.grossArea);
        return Object.freeze({
            label,
            price,
            discount: calculateOfferDifference(input.price, price),
            pricePerGrossArea: grossPrice,
            grossYield: rent.grossYield,
            amortizationYears: calculateAmortizationYears(price, input.monthlyRent),
            buyer: calculateBuyerCosts(scenarioInput),
            seller: calculateSellerNet(scenarioInput),
        });
    }

    function calculatePriceScenarios(input, discounts = safeConfig.priceScenarioDiscounts || []) {
        const listPrice = toFiniteNonNegative(input.price);
        if (listPrice === null || listPrice <= 0) return Object.freeze([]);
        return Object.freeze(discounts.map((discount) => {
            const rate = toFiniteNonNegative(discount) ?? 0;
            const label = rate === 0 ? "Mevcut fiyat" : `%${formatDecimal(rate, Number.isInteger(rate) ? 0 : 1)} indirim`;
            return calculatePriceScenario(input, listPrice * (1 - rate / 100), label);
        }).filter(Boolean));
    }

    function calculateLandAnalysis(input) {
        const price = toFiniteNonNegative(input.price);
        const totalArea = toFiniteNonNegative(input.totalArea);
        const comparablePrice = toFiniteNonNegative(input.landComparablePrice);
        const pricePerSquareMeter = calculatePricePerSquareMeter(price, totalArea);
        const comparableTotalValue = comparablePrice === null || totalArea === null
            ? null
            : comparablePrice * totalArea;
        const comparableDifference = calculateComparableDifference(pricePerSquareMeter, comparablePrice);
        const buyer = calculateBuyerCosts(input);
        const seller = calculateSellerNet(input);
        return Object.freeze({
            price,
            totalArea,
            pricePerSquareMeter,
            comparablePrice,
            comparableTotalValue,
            comparableDifference,
            comparisonText: generateComparableAnalysis(comparableDifference, comparablePrice === null ? 0 : 1),
            buyer,
            seller,
            transactionCosts: buildTransactionCosts(buyer, seller),
        });
    }

    function buildTransactionCosts(buyer, seller) {
        const titleDeed = buyer.titleDeedFee + seller.titleDeedFee;
        const serviceFee = buyer.serviceFee + seller.serviceFee;
        const vat = buyer.serviceFeeVat + seller.serviceFeeVat;
        const other = buyer.otherCosts + seller.otherCosts;
        return Object.freeze({ titleDeed, serviceFee, vat, other, total: titleDeed + serviceFee + vat + other });
    }

    function generateFinancialAnalysis(input) {
        const insights = [];
        const grossYield = toFiniteNonNegative(input.grossYield);
        const years = toFiniteNonNegative(input.amortizationYears);
        const efficiency = toFiniteNonNegative(input.efficiency);
        const duesRatio = toFiniteNonNegative(input.duesRatio);
        const comparableDifference = typeof input.comparableDifference === "number" ? input.comparableDifference : null;
        const offerDifference = typeof input.offerDifference === "number" ? input.offerDifference : null;
        const completeness = toFiniteNonNegative(input.completeness);

        if (grossYield !== null) {
            if (grossYield >= 8) insights.push(`Yıllık brüt kira getirisi %${formatDecimal(grossYield, 1)} ile güçlü bir seviyede görünüyor.`);
            else if (grossYield >= 6) insights.push(`Yıllık brüt kira getirisi %${formatDecimal(grossYield, 1)} ile dengeli ve yatırım açısından olumlu bir seviyede.`);
            else if (grossYield >= 4) insights.push(`Yıllık brüt kira getirisi %${formatDecimal(grossYield, 1)} ile orta seviyede; alternatif portföylerle karşılaştırılabilir.`);
            else insights.push(`Yıllık brüt kira getirisi %${formatDecimal(grossYield, 1)} ile düşük seviyede görünüyor.`);
        }
        if (years !== null) {
            if (years <= 15) insights.push(`Yaklaşık ${formatDecimal(years, 1)} yıllık amortisman süresi güçlü bir yatırım göstergesi oluşturuyor.`);
            else if (years <= 20) insights.push(`Yaklaşık ${formatDecimal(years, 1)} yıllık amortisman süresi makul bir aralıkta.`);
            else if (years <= 25) insights.push(`Yaklaşık ${formatDecimal(years, 1)} yıllık amortisman süresi uzun vadeli getiri beklentisinin dikkatle değerlendirilmesini gerektiriyor.`);
            else insights.push("Amortisman süresi 25 yılın üzerinde olduğu için gayrimenkul kira getirisi açısından zayıf görünüyor.");
        }
        if (efficiency !== null) {
            if (efficiency >= 75) insights.push(`Net/brüt kullanım oranı %${formatDecimal(efficiency, 1)} seviyesinde ve alan kullanımı dengeli görünüyor.`);
            else if (efficiency >= 65) insights.push("Net/brüt kullanım oranı kabul edilebilir olsa da ortak alan payı ayrıca incelenebilir.");
            else insights.push("Net/brüt kullanım oranı düşük olduğu için ortak alan payı yüksek olabilir.");
        }
        if (duesRatio === null) insights.push("Aidat bilgisi girilmedi; bu kriter skora dahil edilmedi.");
        else if (duesRatio >= 20) insights.push("Aidatın aylık kiraya oranı yüksek. Bu durum net kira getirisini olumsuz etkileyebilir.");
        else if (duesRatio >= 10) insights.push("Aidat/kira oranı belirgin seviyede; düzenli gider etkisi hesaba katılmalıdır.");
        else insights.push("Aidatın tahmini kiraya oranı yönetilebilir seviyede görünüyor.");

        if (comparableDifference !== null) insights.push(generateComparableAnalysis(comparableDifference, 1));
        if (offerDifference !== null) insights.push(`Girilen teklif, ilan fiyatından %${formatDecimal(Math.abs(offerDifference), 1)} ${offerDifference <= 0 ? "daha düşük" : "daha yüksek"}.`);
        if (completeness !== null && completeness < 100) insights.push(`Skor %${formatDecimal(completeness, 0)} veri tamlığıyla, eksik kriterler dışarıda bırakılarak normalize edildi.`);
        return insights;
    }

    function generatePortfolioAnalysis(input) {
        return generateFinancialAnalysis(input);
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
        const transactionCosts = buildTransactionCosts(buyer, seller);
        const comparables = calculateComparableAnalysis(input.comparables, pricePerGrossArea);
        const portfolio = calculateFinancialScore({ grossYield: rent.grossYield, amortizationYears, efficiency, duesRatio });
        const scenarios = calculatePriceScenarios(input);
        const offer = calculatePriceScenario(input, input.offerPrice, "Özel teklif");
        const offerComparableDifference = offer
            ? calculateComparableDifference(offer.pricePerGrossArea, comparables.comparisonValue)
            : null;
        const offerDetails = offer ? Object.freeze({
            ...offer,
            comparableDifference: offerComparableDifference,
            comparableMessage: generateComparableAnalysis(offerComparableDifference, comparables.count),
        }) : null;
        const analysisInput = {
            grossYield: rent.grossYield,
            amortizationYears,
            efficiency,
            duesRatio,
            comparableDifference: comparables.difference,
            offerDifference: offer?.discount ?? null,
            completeness: portfolio.completeness.percentage,
        };

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
            titleDeed: Object.freeze({ buyer: buyer.titleDeedFee, seller: seller.titleDeedFee, total: transactionCosts.titleDeed }),
            transactionCosts,
            portfolio,
            comparables,
            scenarios,
            offer: offerDetails,
            analysis: generateFinancialAnalysis(analysisInput),
        });
    }

    function calculateRentalMoveInCost(input) {
        const firstMonthRent = numberOrZero(input.monthlyRent);
        const deposit = numberOrZero(input.deposit);
        const serviceFee = numberOrZero(input.rentalServiceFee);
        const serviceFeeVat = calculateRateAmount(serviceFee, input.vatRate);
        const dues = toFiniteNonNegative(input.dues);
        const contractStartTotal = firstMonthRent + deposit + serviceFee + serviceFeeVat;
        return Object.freeze({
            firstMonthRent,
            deposit,
            serviceFee,
            serviceFeeVat,
            dues,
            contractStartTotal,
            firstMonthCashTotal: dues === null ? null : contractStartTotal + dues,
            total: contractStartTotal,
        });
    }

    function formatCurrency(value, options = {}) {
        const amount = toFiniteNonNegative(value);
        if (amount === null) return "—";
        const maximumFractionDigits = Number.isInteger(options.maximumFractionDigits) ? options.maximumFractionDigits : 0;
        return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits })} TL`;
    }

    function formatPercentage(value, digits = 2) {
        const amount = typeof value === "number" && Number.isFinite(value) ? value : null;
        return amount === null ? "—" : `%${formatDecimal(amount, digits)}`;
    }

    function formatDecimal(value, digits = 1) {
        const amount = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(amount)) return "—";
        return amount.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    return Object.freeze({
        calculateAmortizationYears,
        calculateBuyerCosts,
        calculateComparableAnalysis,
        calculateComparableAverage,
        calculateComparableDifference,
        calculateComparableMedian,
        calculateComparablePrice,
        calculateEfficiency,
        calculateFinancialScore,
        calculateLandAnalysis,
        calculateOfferDifference,
        calculatePortfolioScore,
        calculatePricePerSquareMeter,
        calculatePriceScenario,
        calculatePriceScenarios,
        calculateRateAmount,
        calculateRentalMoveInCost,
        calculateRentalYield,
        calculateSaleAnalysis,
        calculateScoreCompleteness,
        calculateSellerNet,
        formatCurrency,
        formatDecimal,
        formatPercentage,
        generateComparableAnalysis,
        generateFinancialAnalysis,
        generatePortfolioAnalysis,
        getScoreLevel,
        safeDivide,
        toFiniteNonNegative,
    });
}));
