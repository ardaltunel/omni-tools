const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
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
    serviceFeeRate: 2,
    vatRate: 20,
    commissionPayer: "both",
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
    assert.equal(result.portfolio.level.label, "Güçlü");
});

test("alıcı ve satıcı maliyetlerini komisyon ödeyen tarafa göre değiştirir", () => {
    const both = core.calculateSaleAnalysis(saleInput);
    assert.equal(both.buyer.titleDeedFee, 130000);
    assert.equal(both.buyer.serviceFee, 130000);
    assert.equal(both.buyer.serviceFeeVat, 26000);
    assert.equal(both.buyer.total, 6786000);
    assert.equal(both.seller.net, 6214000);

    const buyerOnly = core.calculateSaleAnalysis({ ...saleInput, commissionPayer: "buyer" });
    assert.equal(buyerOnly.buyer.total, 6786000);
    assert.equal(buyerOnly.seller.serviceFee, 0);
    assert.equal(buyerOnly.seller.net, 6370000);
    assert.equal(buyerOnly.transactionCosts.total, 416000);
});

test("kiralık ilk giriş maliyetini KDV ile hesaplar", () => {
    assert.deepEqual(core.calculateRentalMoveInCost({
        monthlyRent: 40000,
        deposit: 80000,
        rentalServiceFee: 40000,
        vatRate: 20,
    }), {
        firstMonthRent: 40000,
        deposit: 80000,
        serviceFee: 40000,
        serviceFeeVat: 8000,
        total: 168000,
    });
});

test("yıllık gider kirayı aşarsa net getiriyi negatif hesaplar", () => {
    const result = core.calculateRentalYield(10000, 2000000, 150000);
    assert.equal(result.annualNetRent, -30000);
    assert.equal(result.netYield, -1.5);
    assert.equal(core.formatPercentage(result.netYield, 1), "%-1,5");
});

test("sıfır alan ve kira değerlerinde NaN veya Infinity üretmez", () => {
    assert.equal(core.calculatePricePerSquareMeter(6500000, 0), null);
    assert.equal(core.calculateAmortizationYears(6500000, 0), null);
    assert.equal(core.safeDivide(1, 0), null);

    const result = core.calculateSaleAnalysis({ ...saleInput, netArea: 0, grossArea: 0, monthlyRent: 0 });
    assert.equal(result.pricePerGrossArea, null);
    assert.equal(result.pricePerNetArea, null);
    assert.equal(result.amortizationYears, null);
    assert.equal(JSON.stringify(result).includes("Infinity"), false);
    assert.equal(JSON.stringify(result).includes("NaN"), false);
});

test("araç ana sayfa, route metadata ve istemci dosyalarıyla kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");

    assert.match(html, /data-tool="emlak-portfoy-analizi"/);
    assert.match(html, /id="emlak-portfoy-analizi"/);
    assert.match(html, /tools\/emlak-portfoy-analizi\/style\.css/);
    assert.match(html, /tools\/emlak-portfoy-analizi\/config\.js/);
    assert.match(html, /tools\/emlak-portfoy-analizi\/core\.js/);
    assert.match(html, /tools\/emlak-portfoy-analizi\/app\.js/);
    assert.match(script, /"emlak-portfoy-analizi"\s*:/);
});
