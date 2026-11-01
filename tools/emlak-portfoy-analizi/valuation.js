(function initRealEstateValuation(root, factory) {
    const valuation = factory();
    if (typeof module === "object" && module.exports) module.exports = valuation;
    if (root) root.RealEstateValuation = valuation;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRealEstateValuation() {
    "use strict";

    function positiveNumber(value) {
        if (typeof value !== "number" && typeof value !== "string") return null;
        let normalized = typeof value === "string" ? value.trim().replace(/\s/g, "") : value;
        if (normalized === "") return null;
        if (typeof normalized === "string") {
            if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
            else if (normalized.includes(",") && normalized.includes(".")) {
                normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
                    ? normalized.replace(/\./g, "").replace(",", ".")
                    : normalized.replace(/,/g, "");
            } else normalized = normalized.replace(",", ".");
        }
        const number = Number(normalized);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function normalizeText(value) {
        return typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
    }

    function median(values) {
        const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
        if (!sorted.length) return null;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
    }

    function getArea(input) {
        const isLand = ["arsa", "tarla"].includes(normalizeText(input.propertyType));
        const areaBasis = isLand ? "total" : input.areaBasis === "net" ? "net" : "gross";
        const area = positiveNumber(areaBasis === "total" ? input.totalArea : areaBasis === "net" ? input.netArea : input.grossArea);
        return { isLand, area, areaBasis };
    }

    function getComparablePrices(input, context) {
        const propertyType = normalizeText(input.propertyType);
        const seenSources = new Set();
        let rejectedCount = 0;
        const prices = [];
        for (const comparable of Array.isArray(input.comparables) ? input.comparables : []) {
            if (!comparable || typeof comparable !== "object") { rejectedCount += 1; continue; }
            const type = normalizeText(comparable.propertyType);
            const basisMatches = context.isLand
                ? comparable.areaBasis === "total" || !comparable.areaBasis
                : comparable.areaBasis === context.areaBasis;
            const price = positiveNumber(comparable.price);
            const area = positiveNumber(comparable.area);
            const unitPrice = price !== null && area !== null ? positiveNumber(price / area) : null;
            const source = typeof comparable.sourceUrl === "string" ? comparable.sourceUrl.trim().split(/[?#]/)[0].replace(/\/$/, "") : "";
            if (!basisMatches || (type && propertyType && type !== propertyType) || unitPrice === null || (source && seenSources.has(source))) {
                rejectedCount += 1;
                continue;
            }
            if (source) seenSources.add(source);
            prices.push(unitPrice);
        }
        return { prices, rejectedCount };
    }

    function estimate(input = {}) {
        if (!input || typeof input !== "object") input = {};
        const context = getArea(input);
        const comparables = getComparablePrices(input, context);
        const reference = positiveNumber(input.referencePricePerM2);
        const rent = positiveNumber(input.monthlyRent);
        const targetYield = positiveNumber(input.targetYield);
        const warnings = ["Bu hesap, girilen verilere dayalı bir ön değerlendirmedir; güncel piyasa verisi veya ekspertiz raporu değildir."];
        const reasons = [];
        const base = {
            available: false,
            method: "none",
            estimate: null,
            low: null,
            high: null,
            pricePerM2: null,
            differencePercent: null,
            position: "unknown",
            sampleCount: 0,
            confidenceLabel: "Veri bekleniyor",
            reasons,
            warnings,
            area: context.area,
            areaBasis: context.areaBasis,
        };
        if (comparables.rejectedCount) warnings.push(`${comparables.rejectedCount} emsal; eksik/geçersiz veri, farklı tür veya m² temeli ya da tekrar eden kaynak nedeniyle hesaba katılmadı.`);

        let amount = null;
        let unitPrice = null;
        let method = "none";
        let spread = 0.1;
        let confidenceLabel = "Sınırlı veri";
        let sampleCount = 0;
        if (context.area !== null && comparables.prices.length) {
            method = "comparables";
            sampleCount = comparables.prices.length;
            unitPrice = median(comparables.prices);
            amount = unitPrice * context.area;
            const deviation = median(comparables.prices.map((price) => Math.abs(price - unitPrice))) || 0;
            spread = Math.max(sampleCount < 3 ? 0.1 : 0.05, Math.min(0.5, deviation / unitPrice));
            confidenceLabel = sampleCount >= 3 ? `${sampleCount} emsale dayalı` : "Az sayıda emsal";
            reasons.push(`${sampleCount} geçerli emsalin ${context.areaBasis === "total" ? "toplam alan" : context.areaBasis === "net" ? "net" : "brüt"} m² fiyatı medyanı, mülkün alanıyla çarpıldı.`);
            warnings.push("Emsallerin aynı mahallede, benzer nitelikte ve yakın tarihli olduğunu kontrol edin. İlan fiyatları gerçekleşmiş satış fiyatı değildir.");
            warnings.push(`Aralık, emsal fiyatlarının dağılımı ve en az %${sampleCount < 3 ? "10" : "5"} senaryo payıyla oluşturuldu; istatistiksel güven aralığı değildir.`);
            if (sampleCount < 3) warnings.push("Karşılaştırmayı güçlendirmek için en az 3 farklı emsal ekleyin.");
            if (comparables.prices.some((price) => price > unitPrice * 1.5 || price < unitPrice * 0.5)) warnings.push("Emsal m² fiyatları belirgin biçimde ayrışıyor; benzerlik ve fiyat girişlerini kontrol edin.");
        } else if (context.area !== null && reference !== null) {
            method = "reference";
            unitPrice = reference;
            amount = reference * context.area;
            reasons.push("Girdiğiniz bölgesel referans m² fiyatı, mülkün aynı temeldeki alanıyla çarpıldı.");
            warnings.push("Referans m² fiyatı kullanıcı girdisidir; uygulama tarafından doğrulanmış bir bölge fiyatı değildir. Aralık, bu varsayımın ±%10 senaryosudur.");
        } else if (!context.isLand && rent !== null && targetYield !== null && targetYield <= 100) {
            method = "rental";
            amount = rent * 12 / (targetYield / 100);
            unitPrice = context.area === null ? null : amount / context.area;
            spread = 0.15;
            confidenceLabel = "Kira varsayımına dayalı";
            reasons.push("Yıllık brüt kira, girdiğiniz hedef yıllık brüt getiri oranına bölündü.");
            warnings.push("Bu sonuç kira gelirine göre bir yatırım senaryosudur; piyasa değeri değildir. Giderler ve boş kalma süresi düşülmedi. Aralık, sonucun ±%15 senaryosudur.");
        } else {
            if (context.area === null) reasons.push(context.isLand ? "Arsa veya tarlanın toplam m² alanını girin." : `Mülkün ${context.areaBasis === "net" ? "net" : "brüt"} m² alanını girin.`);
            reasons.push(context.isLand
                ? "Aynı tür ve bölgeden emsal ekleyin veya referans m² fiyatını girin."
                : "Aynı m² temelinde emsal veya referans m² fiyatı ekleyin; alternatif olarak aylık kira ve hedef brüt getiri oranını birlikte girin.");
            if (targetYield !== null && targetYield > 100) reasons.push("Hedef yıllık brüt getiri oranı %100'ü aşamaz.");
            return base;
        }

        if (positiveNumber(amount) === null || (unitPrice !== null && positiveNumber(unitPrice) === null) || !Number.isFinite(amount * (1 + spread))) {
            reasons.push("Girilen değerler hesaplama sınırını aşıyor; fiyat ve alanı kontrol edin.");
            return base;
        }
        const askingPrice = positiveNumber(input.price);
        const differencePercent = askingPrice === null ? null : (askingPrice / amount - 1) * 100;
        return {
            ...base,
            available: true,
            method,
            estimate: amount,
            low: amount * (1 - spread),
            high: amount * (1 + spread),
            pricePerM2: unitPrice,
            differencePercent: Number.isFinite(differencePercent) ? differencePercent : null,
            position: differencePercent === null || !Number.isFinite(differencePercent) ? "unknown" : differencePercent < -5 ? "below" : differencePercent > 5 ? "above" : "fair",
            sampleCount,
            confidenceLabel,
        };
    }

    return Object.freeze({ estimate, median, positiveNumber });
}));
