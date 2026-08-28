(function initRealEstateAnalysisConfig(root, factory) {
    const config = factory();
    if (typeof module === "object" && module.exports) module.exports = config;
    if (root) root.RealEstateAnalysisConfig = config;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateAnalysisConfig() {
    "use strict";

    return Object.freeze({
        storageKey: "omni-tools:emlak-portfoy-analizi:v1",
        defaultRates: Object.freeze({
            totalTitleDeed: 4,
            buyerTitleDeed: 2,
            sellerTitleDeed: 2,
            serviceFee: 2,
            vat: 20,
        }),
        defaultForm: Object.freeze({
            transactionType: "sale",
            propertyType: "Daire",
            price: "",
            netArea: "",
            grossArea: "",
            roomCount: "2+1",
            buildingAge: "",
            floor: "",
            totalFloors: "",
            dues: "",
            monthlyRent: "",
            annualExpenses: "",
            buyerTitleDeedRate: "2",
            sellerTitleDeedRate: "2",
            serviceFeeRate: "2",
            vatRate: "20",
            commissionPayer: "both",
            deposit: "",
            rentalServiceFee: "",
            rentalVatRate: "20",
        }),
        scoreThresholds: Object.freeze({
            rentalYield: Object.freeze([
                Object.freeze({ min: 8, points: 35 }),
                Object.freeze({ min: 6, points: 28 }),
                Object.freeze({ min: 4, points: 20 }),
                Object.freeze({ min: 2, points: 10 }),
                Object.freeze({ min: 0, points: 5 }),
            ]),
            amortization: Object.freeze([
                Object.freeze({ max: 12, points: 30 }),
                Object.freeze({ max: 15, points: 25 }),
                Object.freeze({ max: 20, points: 18 }),
                Object.freeze({ max: 25, points: 10 }),
                Object.freeze({ max: Infinity, points: 5 }),
            ]),
            efficiency: Object.freeze([
                Object.freeze({ min: 85, points: 20 }),
                Object.freeze({ min: 75, points: 16 }),
                Object.freeze({ min: 65, points: 12 }),
                Object.freeze({ min: 55, points: 7 }),
                Object.freeze({ min: 0, points: 3 }),
            ]),
            duesRatio: Object.freeze([
                Object.freeze({ maxExclusive: 5, points: 15 }),
                Object.freeze({ maxExclusive: 10, points: 12 }),
                Object.freeze({ maxExclusive: 15, points: 8 }),
                Object.freeze({ maxExclusive: 20, points: 4 }),
                Object.freeze({ maxExclusive: Infinity, points: 1 }),
            ]),
        }),
    });
}));
