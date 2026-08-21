(function initCurrencyRatesCore(root, factory) {
    const core = factory();
    if (typeof module === "object" && module.exports) module.exports = core;
    if (root) root.CurrencyRatesCore = core;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCurrencyRatesCore() {
    "use strict";

    const PRIORITY_CODES = Object.freeze(["TRY", "USD", "EUR", "GBP"]);
    const REGION_OVERRIDES = Object.freeze({
        ANG: "CW",
        EUR: "EU",
        GBP: "GB",
        TRY: "TR",
        XAF: "",
        XAG: "",
        XAU: "",
        XCD: "",
        XCG: "CW",
        XDR: "",
        XOF: "",
        XPD: "",
        XPF: "",
        XPT: "",
    });
    const BADGE_OVERRIDES = Object.freeze({
        XAF: "CFA",
        XAG: "Ag",
        XAU: "Au",
        XCD: "EC",
        XDR: "SDR",
        XOF: "CFA",
        XPD: "Pd",
        XPF: "CFP",
        XPT: "Pt",
    });
    const VISUAL_KIND_OVERRIDES = Object.freeze({
        XAF: "regional",
        XAG: "metal",
        XAU: "metal",
        XCD: "regional",
        XDR: "reserve",
        XOF: "regional",
        XPD: "metal",
        XPF: "regional",
        XPT: "metal",
    });

    function normalizeSearchText(value) {
        return String(value || "")
            .toLocaleLowerCase("tr-TR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i");
    }

    function getFlagRegion(code) {
        const normalizedCode = String(code || "").toUpperCase();
        const region = Object.prototype.hasOwnProperty.call(REGION_OVERRIDES, normalizedCode)
            ? REGION_OVERRIDES[normalizedCode]
            : normalizedCode.slice(0, 2);
        return /^[A-Z]{2}$/.test(region) ? region : "";
    }

    function getCurrencyBadge(code) {
        const normalizedCode = String(code || "").toUpperCase();
        return BADGE_OVERRIDES[normalizedCode] || normalizedCode.slice(0, 2);
    }

    function getCurrencyVisualKind(code) {
        const normalizedCode = String(code || "").toUpperCase();
        return VISUAL_KIND_OVERRIDES[normalizedCode] || "flag";
    }

    function getLocalizedCurrencyName(code, fallbackName, displayNames) {
        try {
            const localizedName = displayNames?.of(code);
            if (localizedName && localizedName !== code) return localizedName;
        } catch {
            // API adı aşağıdaki güvenli yedek olarak kullanılır.
        }
        return fallbackName || code;
    }

    function buildCurrencyEntries(metadata, rateRows, displayNames) {
        const metadataByCode = new Map(
            (Array.isArray(metadata) ? metadata : []).map((currency) => [currency.iso_code, currency]),
        );

        return (Array.isArray(rateRows) ? rateRows : [])
            .filter((row) => row && /^[A-Z]{3}$/.test(row.quote) && Number(row.rate) > 0)
            .map((row) => {
                const info = metadataByCode.get(row.quote) || {};
                const name = getLocalizedCurrencyName(row.quote, info.name, displayNames);
                return {
                    code: row.quote,
                    name,
                    apiName: info.name || name,
                    symbol: info.symbol || "",
                    badge: getCurrencyBadge(row.quote),
                    flagRegion: getFlagRegion(row.quote),
                    visualKind: getCurrencyVisualKind(row.quote),
                    date: row.date || "",
                    perTry: Number(row.rate),
                    tryValue: 1 / Number(row.rate),
                    searchText: normalizeSearchText(`${row.quote} ${name} ${info.name || ""} ${info.symbol || ""}`),
                };
            })
            .sort((first, second) => {
                const firstPriority = PRIORITY_CODES.indexOf(first.code);
                const secondPriority = PRIORITY_CODES.indexOf(second.code);
                if (firstPriority !== -1 || secondPriority !== -1) {
                    if (firstPriority === -1) return 1;
                    if (secondPriority === -1) return -1;
                    return firstPriority - secondPriority;
                }
                return first.name.localeCompare(second.name, "tr", { sensitivity: "base" });
            });
    }

    function convertAmount(amount, fromCode, toCode, entries) {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount < 0) return null;
        const byCode = entries instanceof Map
            ? entries
            : new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.code, entry]));
        const from = byCode.get(fromCode);
        const to = byCode.get(toCode);
        if (!from || !to || !(from.perTry > 0) || !(to.perTry > 0)) return null;
        return numericAmount * (to.perTry / from.perTry);
    }

    return Object.freeze({
        buildCurrencyEntries,
        convertAmount,
        getCurrencyBadge,
        getCurrencyVisualKind,
        getFlagRegion,
        normalizeSearchText,
    });
}));
