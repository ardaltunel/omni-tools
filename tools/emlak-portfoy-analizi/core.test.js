const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const config = require("./config.js");
const core = require("./core.js");

const projectRoot = path.resolve(__dirname, "../..");
const saleInput = {
    price: 6500000,
    netArea: 85,
    grossArea: 110,
    monthlyRent: 40000,
    annualExpenses: 10000,
    dues: 3500,
    buyerTitleDeedRate: 2,
    sellerTitleDeedRate: 2,
    buyerServiceFeeRate: 2,
    sellerServiceFeeRate: 2,
    vatRate: 20,
    buyerOtherCosts: null,
    sellerOtherCosts: null,
    comparables: [],
};

test("istenen satılık örneğini doğru hesaplar", () => {
    const result = core.calculateSaleAnalysis(saleInput);
    assert.ok(Math.abs(result.pricePerGrossArea - 59090.909) < 0.01);
    assert.ok(Math.abs(result.pricePerNetArea - 76470.588) < 0.01);
    assert.equal(result.rent.annualGrossRent, 480000);
    assert.ok(Math.abs(result.rent.grossYield - 7.384615) < 0.0001);
    assert.ok(Math.abs(result.rent.netYield - 7.230769) < 0.0001);
    assert.ok(Math.abs(result.amortizationYears - 13.541666) < 0.0001);
    assert.ok(Math.abs(result.efficiency - 77.272727) < 0.0001);
    assert.equal(result.portfolio.score, 81);
    assert.equal(result.portfolio.completeness.percentage, 100);
    assert.equal(result.portfolio.level.label, "Güçlü");
});

test("alıcı ve satıcı ayrı hizmet bedellerini ve KDV'yi hesaplar", () => {
    const result = core.calculateSaleAnalysis(saleInput);
    assert.equal(result.buyer.titleDeedFee, 130000);
    assert.equal(result.buyer.serviceFee, 130000);
    assert.equal(result.buyer.serviceFeeVat, 26000);
    assert.equal(result.buyer.total, 6786000);
    assert.equal(result.seller.serviceFee, 130000);
    assert.equal(result.seller.net, 6214000);
    assert.equal(result.transactionCosts.serviceFee, 260000);
});

test("eski commissionPayer girdisini geriye uyumlu hesaplar", () => {
    const result = core.calculateSaleAnalysis({
        ...saleInput,
        buyerServiceFeeRate: null,
        sellerServiceFeeRate: null,
        serviceFeeRate: 2,
        commissionPayer: "buyer",
    });
    assert.equal(result.buyer.serviceFee, 130000);
    assert.equal(result.seller.serviceFee, 0);
});

test("aidat boşken kriteri dışarıda bırakır ve skoru normalize eder", () => {
    const portfolio = core.calculateSaleAnalysis({ ...saleInput, dues: null }).portfolio;
    assert.equal(portfolio.components.duesRatio.available, false);
    assert.equal(portfolio.components.duesRatio.points, null);
    assert.equal(portfolio.earnedPoints, 69);
    assert.equal(portfolio.availableMaximum, 85);
    assert.equal(portfolio.score, 81);
    assert.equal(portfolio.completeness.percentage, 75);
});

test("gerçek sıfır aidatı maksimum kriter puanıyla değerlendirir", () => {
    const result = core.calculateSaleAnalysis({ ...saleInput, dues: 0 });
    assert.equal(result.duesRatio, 0);
    assert.equal(result.portfolio.components.duesRatio.points, 15);
    assert.equal(result.portfolio.completeness.percentage, 100);
});

test("arsa m² fiyatını, emsal toplamını ve farkını hesaplar", () => {
    const result = core.calculateLandAnalysis({
        ...saleInput,
        price: 12000000,
        totalArea: 5360,
        landComparablePrice: 2400,
    });
    assert.ok(Math.abs(result.pricePerSquareMeter - 2238.80597) < 0.0001);
    assert.equal(result.comparableTotalValue, 12864000);
    assert.ok(Math.abs(result.comparableDifference - (-6.7164179)) < 0.0001);
    assert.match(result.comparisonText, /daha uygun/);
});

test("emsal ortalaması ve üç emsal medyanını doğru hesaplar", () => {
    const comparables = [
        { price: 6000000, grossArea: 100 },
        { price: 6600000, grossArea: 100 },
        { price: 9000000, grossArea: 100 },
    ];
    assert.equal(core.calculateComparableAverage(comparables), 72000);
    assert.equal(core.calculateComparableMedian(comparables), 66000);
    const analysis = core.calculateComparableAnalysis(comparables, 59000);
    assert.equal(analysis.comparisonBasis, "medyan");
    assert.equal(analysis.count, 3);
});

test("tek ve iki emsal için medyan üretmez", () => {
    assert.equal(core.calculateComparableMedian([{ price: 6000000, grossArea: 100 }]), null);
    assert.equal(core.calculateComparableMedian([60000, 66000]), null);
});

test("özel fiyat senaryosunda getiri ve amortismanı doğru hesaplar", () => {
    const result = core.calculatePriceScenario(saleInput, 6000000, "Teklif");
    assert.equal(result.grossYield, 8);
    assert.equal(result.amortizationYears, 12.5);
    assert.ok(Math.abs(result.discount - (-7.69230769)) < 0.0001);
});

test("config indirimleriyle dört fiyat senaryosu üretir", () => {
    const scenarios = core.calculatePriceScenarios(saleInput);
    assert.equal(scenarios.length, 4);
    assert.equal(scenarios[0].price, 6500000);
    assert.equal(scenarios[3].price, 6012500);
});

test("kiralık sözleşme başlangıcı ve aidatlı ilk ay nakit çıkışını hesaplar", () => {
    const result = core.calculateRentalMoveInCost({
        monthlyRent: 40000,
        deposit: 80000,
        rentalServiceFee: 40000,
        vatRate: 20,
        dues: 3500,
    });
    assert.equal(result.contractStartTotal, 168000);
    assert.equal(result.firstMonthCashTotal, 171500);
    assert.equal(result.serviceFeeVat, 8000);
});

test("kiralıkta m² bilgisi olmadan hesaplama yapar ve aidatı bilinmiyor bırakır", () => {
    const result = core.calculateRentalMoveInCost({ monthlyRent: 40000, deposit: null, rentalServiceFee: 40000, vatRate: 20, dues: null });
    assert.equal(result.contractStartTotal, 88000);
    assert.equal(result.dues, null);
    assert.equal(result.firstMonthCashTotal, null);
});

test("tapu işlem bedelini tapu harcında, gerçek fiyatı finansal analizde kullanır", () => {
    const result = core.calculateSaleAnalysis({ ...saleInput, titleDeedTransactionValue: 6000000 });
    assert.equal(result.buyer.titleDeedFee, 120000);
    assert.equal(result.seller.titleDeedFee, 120000);
    assert.ok(Math.abs(result.pricePerGrossArea - 59090.909) < 0.01);
    assert.ok(Math.abs(result.rent.grossYield - 7.384615) < 0.0001);
});

test("diğer taraf masraflarını alıcı toplamı ve satıcı netine dahil eder", () => {
    const result = core.calculateSaleAnalysis({ ...saleInput, buyerOtherCosts: 25000, sellerOtherCosts: 10000 });
    assert.equal(result.buyer.total, 6811000);
    assert.equal(result.seller.net, 6204000);
    assert.equal(result.transactionCosts.other, 35000);
});

test("boş, negatif, NaN ve Infinity değerlerinde geçersiz çıktı üretmez", () => {
    assert.equal(core.toFiniteNonNegative(""), null);
    assert.equal(core.toFiniteNonNegative(-1), null);
    assert.equal(core.toFiniteNonNegative(NaN), null);
    assert.equal(core.toFiniteNonNegative(Infinity), null);
    assert.equal(core.toFiniteNonNegative(0), 0);
    assert.equal(core.calculatePricePerSquareMeter(6500000, 0), null);
    assert.equal(core.calculateAmortizationYears(6500000, 0), null);
    const result = core.calculateSaleAnalysis({ ...saleInput, netArea: "", grossArea: 0, monthlyRent: NaN, dues: undefined });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("Infinity"), false);
    assert.equal(serialized.includes("NaN"), false);
    assert.equal(serialized.includes("undefined"), false);
});

test("Türkçe ve noktalı ondalık girişlerini güvenli ayrıştırır", () => {
    assert.equal(core.toFiniteNonNegative("2,5"), 2.5);
    assert.equal(core.toFiniteNonNegative("2.5"), 2.5);
    assert.equal(core.toFiniteNonNegative("6.500.000"), 6500000);
});

test("config sınırları ve varsayılan oranları tek yerde tutar", () => {
    assert.deepEqual(config.retiredStorageKeys, [
        "omni-tools:emlak-portfoy-analizi:v2",
        "omni-tools:emlak-portfoy-analizi:v1",
    ]);
    assert.equal(config.recommendedMaximumSaleServiceFeeRate, 4);
    assert.equal(config.maxComparables, 5);
    assert.equal(config.minRecommendedComparables, 3);
    assert.equal(config.copyStatusDurationMs, 2000);
    assert.deepEqual(config.priceScenarioDiscounts, [0, 2.5, 5, 7.5]);
});

test("araç DOM, metadata, route fallback ve istemci modülleriyle kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    const redirect = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const fallback = fs.readFileSync(path.join(projectRoot, "404.html"), "utf8");

    assert.match(html, /data-tool="emlak-portfoy-analizi"/);
    assert.match(html, /id="real-estate-land-details"/);
    assert.doesNotMatch(html, /id="real-estate-comparable-list"/);
    assert.doesNotMatch(html, /id="real-estate-offer-section"/);
    assert.match(html, /Finansal Verim Skoru/);
    assert.match(html, /tools\/emlak-portfoy-analizi\/app\.js\?v=5/);
    assert.doesNotMatch(html, /id="real-estate-clear-storage"/);
    assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)/);
    assert.match(app, /clearRetiredSavedState/);
    assert.doesNotMatch(app, /real-estate-comparable-list/);
    assert.match(app, /setTimeout/);
    assert.match(redirect, /noindex,follow/);
    assert.match(redirect, /emlak-portfoy-analizi/);
    assert.match(fallback, /searchParams\.set\("tool"/);
});
