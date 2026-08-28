(function initRealEstateAnalysisConfig(root, factory) {
    const config = factory();
    if (typeof module === "object" && module.exports) module.exports = config;
    if (root) root.RealEstateAnalysisConfig = config;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateAnalysisConfig() {
    "use strict";

    const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

    return Object.freeze({
        storageKey: "omni-tools:emlak-portfoy-analizi:v2",
        legacyStorageKeys: Object.freeze(["omni-tools:emlak-portfoy-analizi:v1"]),
        propertyGroups: Object.freeze({
            housing: Object.freeze(["Daire", "Villa", "Müstakil Ev", "Rezidans"]),
            commercial: Object.freeze(["Dükkan", "Ofis", "İşyeri", "Depo"]),
            land: Object.freeze(["Arsa", "Tarla"]),
            other: Object.freeze(["Diğer"]),
        }),
        defaultRates: Object.freeze({
            totalTitleDeed: 4,
            buyerTitleDeed: 2,
            sellerTitleDeed: 2,
            buyerServiceFee: 2,
            sellerServiceFee: 2,
            vat: 20,
        }),
        rentalServiceFeeMode: "one-month-rent",
        recommendedMaximumSaleServiceFeeRate: 4,
        priceScenarioDiscounts: Object.freeze([0, 2.5, 5, 7.5]),
        maxComparables: 5,
        minRecommendedComparables: 3,
        autoCalculationDelayMs: 350,
        copyStatusDurationMs: 2000,
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
            totalArea: "",
            blockNo: "",
            parcelNo: "",
            floorAreaRatio: "",
            zoningStatus: "",
            titleDeedType: "",
            landComparablePrice: "",
            titleDeedTransactionValue: "",
            buyerTitleDeedRate: "2",
            sellerTitleDeedRate: "2",
            buyerServiceFeeRate: "2",
            sellerServiceFeeRate: "2",
            vatRate: "20",
            buyerOtherCosts: "",
            sellerOtherCosts: "",
            deposit: "",
            rentalServiceFee: "",
            rentalVatRate: "20",
            offerPrice: "",
            comparables: Object.freeze([]),
            rentalServiceFeeCustomized: false,
            titleDeedTransactionValueCustomized: false,
        }),
        scoreCriteria: Object.freeze({
            rentalYield: Object.freeze({ label: "Kira Getirisi", maximum: 35 }),
            amortization: Object.freeze({ label: "Amortisman", maximum: 30 }),
            efficiency: Object.freeze({ label: "Alan Verimliliği", maximum: 20 }),
            duesRatio: Object.freeze({ label: "Aidat Oranı", maximum: 15 }),
        }),
        scoreThresholds: Object.freeze({
            rentalYield: freezeRows([
                { min: 8, points: 35 },
                { min: 6, points: 28 },
                { min: 4, points: 20 },
                { min: 2, points: 10 },
                { min: 0, points: 5 },
            ]),
            amortization: freezeRows([
                { max: 12, points: 30 },
                { max: 15, points: 25 },
                { max: 20, points: 18 },
                { max: 25, points: 10 },
                { max: Infinity, points: 5 },
            ]),
            efficiency: freezeRows([
                { min: 85, points: 20 },
                { min: 75, points: 16 },
                { min: 65, points: 12 },
                { min: 55, points: 7 },
                { min: 0, points: 3 },
            ]),
            duesRatio: freezeRows([
                { maxExclusive: 5, points: 15 },
                { maxExclusive: 10, points: 12 },
                { maxExclusive: 15, points: 8 },
                { maxExclusive: 20, points: 4 },
                { maxExclusive: Infinity, points: 1 },
            ]),
        }),
    });
}));
