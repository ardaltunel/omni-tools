(function initAtsCvApp(root) {
    "use strict";

    const core = root.AtsCvCore;
    const parser = root.AtsCvParser;
    const panel = document.getElementById("ats-cv-kontrolu");
    if (!panel || !core || !parser) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        form: byId("ats-cv-form"), fileInput: byId("ats-cv-file"), dropZone: byId("ats-cv-drop-zone"), browse: byId("ats-cv-browse"),
        fileCard: byId("ats-cv-file-card"), fileType: byId("ats-cv-file-type"), fileName: byId("ats-cv-file-name"), fileMeta: byId("ats-cv-file-meta"),
        fileRemove: byId("ats-cv-file-remove"), fileChange: byId("ats-cv-file-change"), jobDescription: byId("ats-cv-job-description"), jobCount: byId("ats-cv-job-count"),
        analyze: byId("ats-cv-analyze"), status: byId("ats-cv-status"), progress: byId("ats-cv-progress"), results: byId("ats-cv-results"),
        scoreRing: byId("ats-cv-score-ring"), score: byId("ats-cv-score"), scoreLabel: byId("ats-cv-score-label"), scoreSummary: byId("ats-cv-score-summary"),
        resultFile: byId("ats-cv-result-file"), resultMeta: byId("ats-cv-result-meta"), subscores: byId("ats-cv-subscores"), stats: byId("ats-cv-stats"),
        jobMatch: byId("ats-cv-job-match"), jobPercentage: byId("ats-cv-job-percentage"), matchBar: byId("ats-cv-match-bar"), matchSummary: byId("ats-cv-match-summary"),
        foundKeywords: byId("ats-cv-found-keywords"), missingKeywords: byId("ats-cv-missing-keywords"), skills: byId("ats-cv-skills"), skillCount: byId("ats-cv-skill-count"),
        strengths: byId("ats-cv-strengths"), issues: byId("ats-cv-issues"), suggestions: byId("ats-cv-suggestions"),
        newAnalysis: byId("ats-cv-new"), copy: byId("ats-cv-copy"), reset: byId("ats-cv-reset"), live: byId("ats-cv-live"),
    };

    let selectedFile = null;
    let latestResult = null;
    let latestFileMeta = null;
    let analyzing = false;

    bindEvents();

    function bindEvents() {
        elements.browse.addEventListener("click", (event) => {
            event.stopPropagation();
            elements.fileInput.click();
        });
        elements.fileInput.addEventListener("change", () => setSelectedFile(elements.fileInput.files?.[0]));
        elements.fileRemove.addEventListener("click", clearSelectedFile);
        elements.fileChange.addEventListener("click", () => elements.fileInput.click());
        elements.dropZone.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            elements.fileInput.click();
        });
        elements.dropZone.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            elements.fileInput.click();
        });
        ["dragenter", "dragover"].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.add("is-dragging");
        }));
        ["dragleave", "drop"].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.remove("is-dragging");
        }));
        elements.dropZone.addEventListener("drop", (event) => setSelectedFile(event.dataTransfer?.files?.[0]));
        elements.jobDescription.addEventListener("input", updateJobCount);
        elements.form.addEventListener("submit", analyzeSelectedCv);
        elements.newAnalysis.addEventListener("click", startNewAnalysis);
        elements.copy.addEventListener("click", copyResults);
        elements.reset.addEventListener("click", resetAll);
    }

    function setSelectedFile(file) {
        if (!file || analyzing) return;
        try {
            const type = parser.validateFile(file);
            selectedFile = file;
            latestResult = null;
            latestFileMeta = null;
            elements.fileType.textContent = type.toLocaleUpperCase("tr-TR");
            elements.fileName.textContent = file.name;
            elements.fileMeta.textContent = `${formatBytes(file.size)} · Analize hazır`;
            elements.dropZone.hidden = true;
            elements.fileCard.hidden = false;
            elements.results.hidden = true;
            elements.analyze.disabled = false;
            setStatus("success", "CV dosyası hazır. İsterseniz hedef iş ilanını ekleyip analizi başlatın.");
        } catch (error) {
            clearSelectedFile();
            setStatus("error", error.message);
        } finally {
            elements.fileInput.value = "";
        }
    }

    function clearSelectedFile() {
        if (analyzing) return;
        selectedFile = null;
        latestResult = null;
        latestFileMeta = null;
        elements.fileInput.value = "";
        elements.fileCard.hidden = true;
        elements.dropZone.hidden = false;
        elements.results.hidden = true;
        elements.analyze.disabled = true;
        setStatus("idle", "Analiz için bir CV dosyası seçin.");
    }

    async function analyzeSelectedCv(event) {
        event.preventDefault();
        if (!selectedFile || analyzing) {
            setStatus("error", "Önce analiz edilecek CV dosyasını seçin.");
            return;
        }
        setAnalyzing(true);
        try {
            const parsed = await parser.parseFile(selectedFile, updateProgress);
            updateProgress(90, "ATS kriterleri hesaplanıyor…");
            await yieldToBrowser();
            const result = core.analyzeCv(parsed.text, { fileMeta: parsed.meta, jobDescription: elements.jobDescription.value });
            latestResult = result;
            latestFileMeta = parsed.meta;
            renderResults(result, parsed.meta);
            updateProgress(100, "Analiz tamamlandı.");
            const truncationNote = parsed.meta.truncated ? " Çok uzun metnin ilk bölümü analiz edildi." : "";
            setStatus("success", `ATS analizi tamamlandı.${truncationNote}`);
            elements.results.hidden = false;
            announce(`ATS uyumluluk puanınız ${result.score}. ${result.label}.`);
            elements.results.scrollIntoView({ behavior: root.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        } catch (error) {
            latestResult = null;
            latestFileMeta = null;
            elements.results.hidden = true;
            setStatus("error", error.message || "CV analiz edilemedi. Farklı bir dosya ile tekrar deneyin.");
        } finally {
            setAnalyzing(false);
        }
    }

    function renderResults(result, fileMeta) {
        elements.scoreRing.style.setProperty("--ats-score", String(result.score));
        elements.score.textContent = String(result.score);
        elements.scoreLabel.textContent = result.label;
        elements.scoreSummary.textContent = scoreSummary(result.score);
        elements.resultFile.textContent = fileMeta.fileName;
        elements.resultMeta.textContent = [fileMeta.type.toLocaleUpperCase("tr-TR"), fileMeta.pageCount ? `${fileMeta.pageCount} sayfa` : null, formatBytes(fileMeta.fileSize)].filter(Boolean).join(" · ");

        elements.subscores.replaceChildren(...result.categories.map(createSubscore));
        renderStatistics(result.statistics);
        renderTags(elements.skills, result.skills, "Teknik beceri algılanmadı.");
        elements.skillCount.textContent = String(result.skills.length);
        renderList(elements.strengths, result.strengths, "Belirgin bir güçlü yön tespit edilemedi.");
        renderList(elements.issues, result.issues, "Kritik bir sorun tespit edilmedi.");
        renderSuggestions(result.suggestions);
        renderJobMatch(result.jobMatch);
    }

    function createSubscore(category) {
        const card = document.createElement("article");
        const label = document.createElement("span");
        const score = document.createElement("strong");
        const bar = document.createElement("div");
        const fill = document.createElement("i");
        card.className = "ats-cv-subscore";
        label.textContent = category.label;
        score.textContent = `${formatScore(category.score)} / ${category.maximum}`;
        bar.className = "ats-cv-subscore-bar";
        fill.style.setProperty("--ats-progress", `${Math.round((category.score / category.maximum) * 100)}%`);
        bar.appendChild(fill);
        card.append(label, score, bar);
        return card;
    }

    function renderStatistics(stats) {
        const definitions = [
            [stats.wordCount.toLocaleString("tr-TR"), "Toplam kelime"],
            [String(stats.experienceCount), "İş deneyimi"],
            [String(stats.projectCount), "Proje sinyali"],
            [String(stats.skillCount), "Teknik beceri"],
            [String(stats.numericAchievementCount), "Sayısal başarı"],
            [stats.cvLength, "CV uzunluğu"],
            [String(stats.linkCount), "Bağlantı"],
            [`${stats.readingMinutes} dk`, "Tahmini okuma"],
            [String(stats.averageSentenceLength).replace(".", ","), "Ort. cümle (kelime)"],
        ];
        elements.stats.replaceChildren(...definitions.map(([value, label]) => {
            const card = document.createElement("article");
            const strong = document.createElement("strong");
            const span = document.createElement("span");
            card.className = "ats-cv-stat-card";
            strong.textContent = value;
            span.textContent = label;
            card.append(strong, span);
            return card;
        }));
    }

    function renderJobMatch(jobMatch) {
        elements.jobMatch.hidden = !jobMatch;
        if (!jobMatch) return;
        elements.jobPercentage.textContent = jobMatch.hasKeywords ? `${jobMatch.percentage}%` : "—";
        elements.matchBar.style.width = `${jobMatch.percentage}%`;
        elements.matchSummary.textContent = jobMatch.hasKeywords
            ? `Anahtar kelime eşleşmesi: ${jobMatch.matched} / ${jobMatch.total}`
            : "İş ilanında desteklenen teknoloji, rol veya mesleki yetkinlik anahtar kelimesi bulunamadı.";
        renderTags(elements.foundKeywords, jobMatch.found, "Eşleşen anahtar kelime yok.");
        renderTags(elements.missingKeywords, jobMatch.missing, "Eksik anahtar kelime yok.");
    }

    function renderTags(container, values, emptyMessage) {
        if (!values.length) {
            const empty = document.createElement("span");
            empty.className = "ats-cv-empty-tag";
            empty.textContent = emptyMessage;
            container.replaceChildren(empty);
            return;
        }
        container.replaceChildren(...values.map((value) => {
            const tag = document.createElement("span");
            tag.className = "ats-cv-tag";
            tag.textContent = value;
            return tag;
        }));
    }

    function renderList(container, values, emptyMessage) {
        const source = values.length ? values : [emptyMessage];
        container.replaceChildren(...source.map((value) => {
            const item = document.createElement("li");
            item.textContent = value;
            return item;
        }));
    }

    function renderSuggestions(suggestions) {
        const source = suggestions.length ? suggestions : ["CV'niz temel ATS kriterlerini karşılıyor. Her başvuru öncesinde içeriği hedef role göre güncelleyin."];
        elements.suggestions.replaceChildren(...source.map((suggestion, index) => {
            const card = document.createElement("article");
            const number = document.createElement("span");
            const copy = document.createElement("div");
            const heading = document.createElement("strong");
            const paragraph = document.createElement("p");
            card.className = "ats-cv-suggestion";
            number.textContent = "→";
            heading.textContent = `Öneri ${index + 1}`;
            paragraph.textContent = suggestion;
            copy.append(heading, paragraph);
            card.append(number, copy);
            return card;
        }));
    }

    async function copyResults() {
        if (!latestResult) return;
        const text = buildCopyText(latestResult, latestFileMeta);
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else fallbackCopy(text);
            setStatus("success", "Analiz sonuçları panoya kopyalandı.");
            announce("Analiz sonuçları panoya kopyalandı.");
        } catch {
            setStatus("error", "Sonuçlar panoya kopyalanamadı. Tarayıcı iznini kontrol edin.");
        }
    }

    function buildCopyText(result, fileMeta) {
        const lines = [
            "ATS CV KONTROLÜ", `Dosya: ${fileMeta.fileName}`, `ATS Uyumluluk Puanı: ${result.score} / 100 — ${result.label}`, "",
            "ALT SKORLAR", ...result.categories.map((category) => `${category.label}: ${formatScore(category.score)} / ${category.maximum}`), "",
            "GÜÇLÜ YÖNLER", ...result.strengths.map((item) => `✓ ${item}`), "", "KRİTİK SORUNLAR", ...result.issues.map((item) => `! ${item}`), "",
            "GELİŞTİRME ÖNERİLERİ", ...result.suggestions.map((item) => `→ ${item}`), "", `Algılanan teknik beceriler: ${result.skills.join(", ") || "Yok"}`,
        ];
        if (result.jobMatch) lines.push("", "İŞ İLANI UYUMU", `Eşleşme: ${result.jobMatch.matched} / ${result.jobMatch.total} (${result.jobMatch.percentage}%)`, `Eksik anahtar kelimeler: ${result.jobMatch.missing.join(", ") || "Yok"}`);
        return lines.join("\n");
    }

    function fallbackCopy(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Kopyalama desteklenmiyor.");
    }

    function startNewAnalysis() {
        clearSelectedFile();
        setStatus("idle", "Yeni analiz için bir CV dosyası seçin.");
        elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
        elements.fileInput.click();
    }

    function resetAll() {
        clearSelectedFile();
        elements.jobDescription.value = "";
        updateJobCount();
        setStatus("idle", "Analiz sıfırlandı. Yeni bir CV dosyası seçebilirsiniz.");
        elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function setAnalyzing(value) {
        analyzing = value;
        panel.classList.toggle("is-analyzing", value);
        elements.fileInput.disabled = value;
        elements.browse.disabled = value;
        elements.fileRemove.disabled = value;
        elements.fileChange.disabled = value;
        elements.jobDescription.disabled = value;
        elements.analyze.disabled = value || !selectedFile;
        elements.progress.hidden = !value;
        if (!value) elements.progress.value = 0;
    }

    function updateProgress(value, message) {
        elements.progress.hidden = false;
        elements.progress.value = value;
        setStatus("loading", message);
    }

    function updateJobCount() {
        elements.jobCount.textContent = `${elements.jobDescription.value.length.toLocaleString("tr-TR")} / 30.000`;
    }

    function setStatus(tone, message) {
        elements.status.className = `ats-cv-status is-${tone}`;
        elements.status.textContent = message;
    }

    function announce(message) {
        elements.live.textContent = "";
        root.requestAnimationFrame(() => { elements.live.textContent = message; });
    }

    function scoreSummary(score) {
        if (score >= 90) return "CV'niz ATS sistemleri için güçlü, düzenli ve kolay taranabilir görünüyor.";
        if (score >= 80) return "CV'niz ATS açısından iyi durumda; birkaç hedefli düzenlemeyle daha da güçlenebilir.";
        if (score >= 70) return "Temel yapı uygun, ancak bazı bölümler ve başarı ifadeleri geliştirilmelidir.";
        if (score >= 60) return "CV okunabiliyor fakat ATS uyumluluğu için önemli iyileştirmeler gerekiyor.";
        return "CV'nin ATS tarafından doğru okunması ve sıralanması için temel yapı ile içeriğin güçlendirilmesi gerekiyor.";
    }

    function formatScore(value) {
        return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
    }

    function yieldToBrowser() {
        return new Promise((resolve) => root.setTimeout(resolve, 0));
    }
}(window));
