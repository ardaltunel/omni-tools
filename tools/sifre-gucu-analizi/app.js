(function initPasswordStrengthApp() {
    "use strict";

    const core = window.PasswordStrengthCore;
    const panel = document.getElementById("password-strength-analysis");
    if (!core || !panel) return;

    const elements = {
        input: document.getElementById("password-strength-input"),
        toggle: document.getElementById("password-strength-toggle"),
        clear: document.getElementById("password-strength-clear"),
        length: document.getElementById("password-strength-length-label"),
        level: document.getElementById("password-strength-level"),
        inlineScore: document.getElementById("password-strength-score-inline"),
        meter: panel.querySelector(".password-strength-meter"),
        meterBar: document.getElementById("password-strength-meter-bar"),
        entropy: document.getElementById("password-strength-entropy"),
        crackTime: document.getElementById("password-strength-crack-time"),
        pool: document.getElementById("password-strength-pool"),
        poolDetail: document.getElementById("password-strength-pool-detail"),
        scoreRing: document.getElementById("password-strength-score-ring"),
        score: document.getElementById("password-strength-score"),
        scoreLabel: document.getElementById("password-strength-score-label"),
        scoreCopy: document.getElementById("password-strength-score-copy"),
        checklist: document.getElementById("password-strength-checklist"),
        warnings: document.getElementById("password-strength-warnings"),
        suggestions: document.getElementById("password-strength-suggestions"),
        generator: document.getElementById("password-strength-open-generator"),
        live: document.getElementById("password-strength-live"),
    };

    const scoreMessages = Object.freeze({
        "very-weak": "Kolay tahmin edilebilir kalıpları kaldırın ve şifreyi belirgin şekilde uzatın.",
        weak: "Uzunluğu ve karakter çeşitliliğini artırarak tahmin edilebilirliği azaltın.",
        medium: "Temel koruma var; birkaç iyileştirmeyle daha güvenli hale gelebilir.",
        strong: "Şifreniz güçlü görünüyor. Başka hesaplarda tekrar kullanmayın.",
        "very-strong": "Uzunluk, çeşitlilik ve tahmin edilemezlik bakımından çok güçlü görünüyor.",
    });

    let previousLevel = "";

    function createListItem(label, className, symbol) {
        const item = document.createElement("li");
        item.className = className;
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = symbol;
        const text = document.createElement("span");
        text.textContent = label;
        item.append(icon, text);
        return item;
    }

    function getPoolLabels(classes) {
        const labels = [];
        if (classes.hasLowercase) labels.push("küçük harf");
        if (classes.hasUppercase) labels.push("büyük harf");
        if (classes.hasNumber) labels.push("rakam");
        if (classes.hasSymbol) labels.push("özel karakter");
        if (classes.hasSpace) labels.push("boşluk");
        if (classes.hasNonAscii) labels.push("Türkçe / Unicode karakter");
        return labels;
    }

    function renderChecklist(checks) {
        elements.checklist.replaceChildren(...checks.map((check) => createListItem(
            check.label,
            check.passed ? "is-passed" : "is-failed",
            check.passed ? "✓" : "×",
        )));
    }

    function renderFindings(result, isEmpty) {
        elements.warnings.replaceChildren();
        elements.suggestions.replaceChildren();

        if (isEmpty) {
            const empty = document.createElement("p");
            empty.className = "password-strength-warning is-safe";
            empty.textContent = "Analiz için parola alanına yazın veya şifrenizi yapıştırın.";
            elements.warnings.append(empty);
            return;
        }

        if (result.warnings.length) {
            result.warnings.forEach((warning) => {
                const warningItem = document.createElement("p");
                warningItem.className = "password-strength-warning";
                warningItem.textContent = warning;
                elements.warnings.append(warningItem);
            });
        } else {
            const success = document.createElement("p");
            success.className = "password-strength-warning is-safe";
            success.textContent = "Belirgin bir yaygın şifre, tekrar veya ardışık dizi bulunmadı.";
            elements.warnings.append(success);
        }

        result.suggestions.forEach((suggestion) => {
            const item = document.createElement("li");
            item.textContent = suggestion;
            elements.suggestions.append(item);
        });
    }

    function render() {
        const value = elements.input.value;
        const result = core.analyzePassword(value);
        const isEmpty = result.length === 0;
        const displayedLevel = isEmpty ? "Henüz analiz edilmedi" : result.level.label;
        const scoreLabel = isEmpty ? "Şifre bekleniyor" : result.level.label;
        const scoreCopy = isEmpty ? "Analizi başlatmak için parola alanına yazın." : scoreMessages[result.level.id];
        const poolLabels = getPoolLabels(result.classes);

        panel.dataset.strength = isEmpty ? "empty" : result.level.id;
        elements.length.textContent = `${result.length} karakter`;
        elements.level.textContent = displayedLevel;
        elements.inlineScore.textContent = String(result.score);
        elements.meter.setAttribute("aria-valuenow", String(result.score));
        elements.meterBar.style.width = `${result.score}%`;
        elements.entropy.textContent = isEmpty ? "0 bit" : `${Math.round(result.entropy.effective)} bit`;
        elements.crackTime.textContent = isEmpty ? "—" : result.crackTime.label;
        elements.pool.textContent = isEmpty ? "0" : String(result.classes.poolSize);
        elements.poolDetail.textContent = poolLabels.length ? poolLabels.join(" • ") : "Karakter türü bekleniyor";
        elements.scoreRing.style.setProperty("--password-score", String(result.score));
        elements.score.textContent = String(result.score);
        elements.scoreLabel.textContent = scoreLabel;
        elements.scoreCopy.textContent = scoreCopy;
        elements.clear.disabled = isEmpty;

        renderChecklist(result.checks);
        renderFindings(result, isEmpty);

        const nextLevel = isEmpty ? "" : result.level.id;
        if (nextLevel && nextLevel !== previousLevel) {
            elements.live.textContent = `Şifre güvenlik seviyesi: ${result.level.label}. Puan: ${result.score} / 100.`;
        } else if (!nextLevel) {
            elements.live.textContent = "";
        }
        previousLevel = nextLevel;
    }

    function clearPassword(shouldFocus) {
        elements.input.value = "";
        elements.input.type = "password";
        elements.toggle.textContent = "Göster";
        elements.toggle.setAttribute("aria-pressed", "false");
        render();
        if (shouldFocus) elements.input.focus();
    }

    elements.input.addEventListener("input", render);
    elements.toggle.addEventListener("click", () => {
        const shouldShow = elements.input.type === "password";
        elements.input.type = shouldShow ? "text" : "password";
        elements.toggle.textContent = shouldShow ? "Gizle" : "Göster";
        elements.toggle.setAttribute("aria-pressed", String(shouldShow));
        elements.input.focus({ preventScroll: true });
    });
    elements.clear.addEventListener("click", () => clearPassword(true));
    elements.generator.addEventListener("click", () => {
        clearPassword(false);
        document.querySelector('.nav-item[data-tool="password"]')?.click();
    });

    document.addEventListener("tool-activated", (event) => {
        if (event.detail?.tool !== "password-strength-analysis") clearPassword(false);
    });
    document.querySelector(".brand")?.addEventListener("click", () => clearPassword(false));
    new MutationObserver(() => {
        if (!panel.classList.contains("active") && elements.input.value) clearPassword(false);
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("pagehide", () => {
        elements.input.value = "";
    });

    render();
}());
