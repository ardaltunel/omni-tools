(function initAtsCvCore(root) {
    "use strict";

    const SECTION_DEFINITIONS = Object.freeze([
        { id: "contact", label: "İletişim Bilgileri", headings: ["iletişim", "iletisim", "contact", "kişisel bilgiler", "kisisel bilgiler"] },
        { id: "summary", label: "Profesyonel Özet", headings: ["hakkımda", "hakkimda", "profesyonel özet", "kariyer özeti", "profil", "özet", "summary", "about me"] },
        { id: "experience", label: "İş Deneyimi", headings: ["iş deneyimi", "is deneyimi", "deneyim", "profesyonel deneyim", "çalışma geçmişi", "calisma gecmisi", "experience", "work experience", "employment"] },
        { id: "education", label: "Eğitim", headings: ["eğitim", "egitim", "akademik geçmiş", "akademik gecmis", "education"] },
        { id: "skills", label: "Teknik Beceriler", headings: ["teknik beceriler", "teknik yetkinlikler", "beceriler", "yetkinlikler", "teknolojiler", "skills", "technical skills", "competencies"] },
        { id: "projects", label: "Projeler", headings: ["projeler", "kişisel projeler", "kisisel projeler", "seçilmiş projeler", "secilmis projeler", "projects"] },
    ]);

    const KEYWORD_DEFINITIONS = Object.freeze([
        ["HTML", ["html", "html5"]], ["CSS", ["css", "css3"]], ["JavaScript", ["javascript", "js"]],
        ["TypeScript", ["typescript", "ts"]], ["React", ["react", "react.js", "reactjs"]],
        ["Vue", ["vue", "vue.js", "vuejs"]], ["Angular", ["angular"]], ["Node.js", ["node.js", "nodejs", "node js"]],
        ["Next.js", ["next.js", "nextjs", "next js"]], ["Nuxt", ["nuxt", "nuxt.js"]], ["Svelte", ["svelte", "sveltekit"]],
        ["Git", ["git"]], ["GitHub", ["github"]], ["GitLab", ["gitlab"]], ["REST API", ["rest api", "restful"]],
        ["GraphQL", ["graphql"]], ["SQL", ["sql"]], ["MySQL", ["mysql"]], ["PostgreSQL", ["postgresql", "postgres"]],
        ["MongoDB", ["mongodb", "mongo db"]], ["Redis", ["redis"]], ["Tailwind CSS", ["tailwind", "tailwind css"]],
        ["Bootstrap", ["bootstrap"]], ["Sass", ["sass", "scss"]], ["Python", ["python"]], ["Django", ["django"]],
        ["Flask", ["flask"]], ["FastAPI", ["fastapi", "fast api"]], ["Java", ["java"]], ["Spring Boot", ["spring boot", "spring"]],
        ["C#", ["c#", "c sharp"]], [".NET", [".net", "dotnet"]], ["C++", ["c++", "cpp"]], ["PHP", ["php"]],
        ["Laravel", ["laravel"]], ["Ruby", ["ruby"]], ["Ruby on Rails", ["ruby on rails", "rails"]], ["Go", ["golang"]],
        ["Rust", ["rust"]], ["Kotlin", ["kotlin"]], ["Swift", ["swift"]], ["Flutter", ["flutter"]],
        ["React Native", ["react native"]], ["Docker", ["docker"]], ["Kubernetes", ["kubernetes", "k8s"]],
        ["AWS", ["aws", "amazon web services"]], ["Azure", ["azure"]], ["Google Cloud", ["google cloud", "gcp"]],
        ["CI/CD", ["ci/cd", "ci cd", "continuous integration"]], ["Jenkins", ["jenkins"]], ["GitHub Actions", ["github actions"]],
        ["Jest", ["jest"]], ["Vitest", ["vitest"]], ["Cypress", ["cypress"]], ["Playwright", ["playwright"]],
        ["Selenium", ["selenium"]], ["Figma", ["figma"]], ["Linux", ["linux"]], ["Nginx", ["nginx"]],
        ["Firebase", ["firebase"]], ["Supabase", ["supabase"]], ["Elasticsearch", ["elasticsearch"]],
        ["Power BI", ["power bi", "powerbi"]], ["Tableau", ["tableau"]], ["Excel", ["excel", "microsoft excel"]],
        ["Machine Learning", ["machine learning", "makine öğrenmesi", "makine ogrenmesi"]],
        ["Yapay Zekâ", ["yapay zeka", "artificial intelligence", "ai"]], ["Veri Analizi", ["veri analizi", "data analysis"]],
        ["Responsive Design", ["responsive design", "responsive tasarım", "duyarlı tasarım"]],
    ].map(([label, aliases]) => Object.freeze({ label, aliases })));

    const PROFESSIONAL_KEYWORDS = Object.freeze([
        ["Agile", ["agile", "çevik", "cevik"]], ["Scrum", ["scrum"]], ["Kanban", ["kanban"]],
        ["Proje Yönetimi", ["proje yönetimi", "project management"]], ["Takım Liderliği", ["takım liderliği", "team leadership", "ekip liderliği"]],
        ["Problem Çözme", ["problem çözme", "problem solving"]], ["İletişim", ["iletişim becerileri", "communication skills"]],
        ["Analitik Düşünme", ["analitik düşünme", "analytical thinking"]], ["Müşteri Deneyimi", ["müşteri deneyimi", "customer experience"]],
        ["UI/UX", ["ui/ux", "user experience", "kullanıcı deneyimi"]], ["Test Otomasyonu", ["test otomasyonu", "test automation"]],
        ["Mikroservis", ["mikroservis", "microservice"]], ["DevOps", ["devops"]], ["Siber Güvenlik", ["siber güvenlik", "cybersecurity"]],
        ["SEO", ["seo", "search engine optimization"]], ["E-ticaret", ["e-ticaret", "ecommerce", "e-commerce"]],
        ["Backend Geliştirme", ["backend developer", "backend geliştirme", "backend gelistirme"]],
        ["Frontend Geliştirme", ["frontend developer", "frontend geliştirme", "frontend gelistirme"]],
        ["Full Stack", ["full stack", "fullstack"]], ["Mobil Geliştirme", ["mobil geliştirme", "mobile development"]],
        ["Veri Bilimi", ["veri bilimi", "data science"]], ["Ürün Yönetimi", ["ürün yönetimi", "product management"]],
    ].map(([label, aliases]) => Object.freeze({ label, aliases })));

    const ACTION_VERBS = Object.freeze([
        "geliştirdim", "gelistirdim", "tasarladım", "tasarladim", "optimize ettim", "uyguladım", "uyguladim",
        "yönettim", "yonettim", "oluşturdum", "olusturdum", "artırdım", "artirdim", "azalttım", "azalttim",
        "iyileştirdim", "iyilestirdim", "koordine ettim", "liderlik ettim", "otomatikleştirdim", "otomatiklestirdim",
        "analiz ettim", "hayata geçirdim", "hayata gecirdim", "katkı sağladım", "katki sagladim", "implemented",
        "developed", "designed", "optimized", "managed", "created", "improved", "increased", "reduced", "led", "delivered",
    ]);

    function normalize(value) {
        return String(value || "")
            .toLocaleLowerCase("tr-TR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i")
            .replace(/\s+/g, " ")
            .trim();
    }

    function includesAlias(normalizedText, alias) {
        const target = normalize(alias);
        if (!target) return false;
        if (/^[a-z0-9]+$/i.test(target) && target.length <= 3) {
            return new RegExp(`(^|[^a-z0-9])${escapeRegExp(target)}([^a-z0-9]|$)`, "i").test(normalizedText);
        }
        return normalizedText.includes(target);
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function findKeywords(text, definitions = KEYWORD_DEFINITIONS) {
        const normalizedText = normalize(text);
        return definitions
            .filter((definition) => definition.aliases.some((alias) => includesAlias(normalizedText, alias)))
            .map((definition) => definition.label);
    }

    function getLines(text) {
        return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    function detectSections(text, contact) {
        const lines = getLines(text);
        const normalizedLines = lines.map(normalize);
        return SECTION_DEFINITIONS.map((section) => {
            const headingFound = normalizedLines.some((line) => matchesSectionHeading(line, section));
            const found = section.id === "contact" ? headingFound || Boolean(contact.email || contact.phone) : headingFound;
            return { id: section.id, label: section.label, found, headingFound };
        });
    }

    function matchesSectionHeading(normalizedLine, section) {
        return section.headings.some((heading) => {
            const target = normalize(heading);
            return normalizedLine === target || (normalizedLine.length <= target.length + 12 && normalizedLine.startsWith(`${target} `));
        });
    }

    function extractSectionText(text, sectionId) {
        const lines = String(text || "").split(/\r?\n/);
        const section = SECTION_DEFINITIONS.find((item) => item.id === sectionId);
        if (!section) return "";
        const start = lines.findIndex((line) => matchesSectionHeading(normalize(line), section));
        if (start < 0) return "";
        const collected = [];
        for (let index = start + 1; index < lines.length; index += 1) {
            const normalizedLine = normalize(lines[index]);
            if (normalizedLine && SECTION_DEFINITIONS.some((item) => item.id !== sectionId && matchesSectionHeading(normalizedLine, item))) break;
            collected.push(lines[index]);
        }
        return collected.join("\n").trim();
    }

    function detectContact(text) {
        const lines = getLines(text);
        const emailMatch = String(text).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
        const phoneMatches = String(text).match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
        const phone = phoneMatches.find((candidate) => candidate.replace(/\D/g, "").length >= 10 && candidate.replace(/\D/g, "").length <= 15) || "";
        const linkedinMatch = String(text).match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%./-]+/i);
        const githubMatch = String(text).match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+/i);
        const portfolioMatch = String(text).match(/https?:\/\/(?!.*(?:linkedin|github)\.com)[^\s<>()]+/i);
        const name = lines.slice(0, 10).find((line) => {
            if (line.length < 5 || line.length > 60 || /[@\d/:|]/.test(line)) return false;
            const words = line.split(/\s+/);
            return words.length >= 2 && words.length <= 5 && words.every((word) => /^[A-Za-zÇĞİÖŞÜçğıöşü'’-]{2,}$/.test(word));
        }) || "";
        return {
            name,
            email: emailMatch?.[0] || "",
            phone,
            linkedin: linkedinMatch?.[0] || "",
            portfolio: githubMatch?.[0] || portfolioMatch?.[0] || "",
            links: Array.from(new Set(String(text).match(/https?:\/\/[^\s<>()]+/gi) || [])),
        };
    }

    function calculateStatistics(text, skills, sections) {
        const words = String(text).trim().match(/[\p{L}\p{N}+#.%'-]+/gu) || [];
        const sentences = String(text).split(/[.!?]+(?:\s|$)/).map((item) => item.trim()).filter((item) => item.split(/\s+/).length >= 3);
        const bulletLines = getLines(text).filter((line) => /^[•●▪◦\-–—*]\s+/.test(line));
        const paragraphs = String(text).split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
        const longParagraphs = paragraphs.filter((paragraph) => (paragraph.match(/[\p{L}\p{N}]+/gu) || []).length > 85);
        const normalizedLines = getLines(text).map(normalize).filter((line) => line.length > 20);
        const repeatedLineCount = normalizedLines.length - new Set(normalizedLines).size;
        const experienceText = extractSectionText(text, "experience");
        const dateRanges = experienceText.match(/(?:19|20)\d{2}\s*(?:[-–—]|ile|to)\s*(?:(?:19|20)\d{2}|günümüz|gunumuz|devam|present)/gi) || [];
        const numericAchievements = detectNumericAchievements(text);
        const actionVerbCount = countActionVerbs(text);
        const projectSection = sections.find((section) => section.id === "projects")?.found;
        const projectText = extractSectionText(text, "projects");
        const projectSignals = getLines(projectText).filter((line) => /^[•●▪◦\-–—*]\s+/.test(line) || /github\.com\/[\w.-]+\/[\w.-]+/i.test(line));
        const specialCharacters = (String(text).match(/[^\p{L}\p{N}\s.,;:!?@%+/#()'’\-–—•]/gu) || []).length;
        return {
            wordCount: words.length,
            sentenceCount: sentences.length,
            averageSentenceLength: sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : words.length,
            readingMinutes: Math.max(1, Math.ceil(words.length / 200)),
            bulletCount: bulletLines.length,
            longParagraphCount: longParagraphs.length,
            repeatedLineCount,
            experienceCount: dateRanges.length,
            projectCount: Math.max(projectSection && projectText ? 1 : 0, projectSignals.length),
            skillCount: skills.length,
            numericAchievementCount: numericAchievements.length,
            actionVerbCount,
            linkCount: (String(text).match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) || []).length,
            specialCharacterRatio: String(text).length ? specialCharacters / String(text).length : 1,
            cvLength: words.length < 220 ? "Kısa" : words.length > 1100 ? "Uzun" : "Uygun",
        };
    }

    function detectNumericAchievements(text) {
        const pattern = /(?:%\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:%|\+|kişi(?:lik)?|kisi(?:lik)?|müşteri|musteri|proje|ay|yıl|yil|adet|kat|saat|gün|gun|kullanıcı|kullanici|tl|₺|usd|eur))/gi;
        return Array.from(new Set((String(text).match(pattern) || []).map((item) => item.trim().toLocaleLowerCase("tr-TR"))));
    }

    function countActionVerbs(text) {
        const normalizedText = normalize(text);
        return ACTION_VERBS.reduce((total, verb) => {
            const pattern = new RegExp(escapeRegExp(normalize(verb)), "g");
            return total + (normalizedText.match(pattern) || []).length;
        }, 0);
    }

    function result(id, label, score, maximum, strengths = [], issues = [], suggestions = [], details = {}) {
        return { id, label, score: Math.max(0, Math.min(maximum, Math.round(score * 10) / 10)), maximum, strengths, issues, suggestions, details };
    }

    function analyzeFormat(context) {
        const { text, fileMeta, statistics } = context;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        let score = 0;
        const extractionQuality = fileMeta.extractionSuccessful && statistics.wordCount >= 80 ? 8 : fileMeta.extractionSuccessful && statistics.wordCount >= 25 ? 5 : 1;
        score += extractionQuality;
        if (extractionQuality === 8) strengths.push("CV metni başarıyla ve yeterli kapsamda çıkarıldı.");
        else issues.push("Dosyadan çıkarılabilen metin sınırlı görünüyor.");

        const columnSignals = Number(fileMeta.columnSignals) || 0;
        score += columnSignals === 0 ? 4 : columnSignals <= 2 ? 2 : 0;
        if (columnSignals > 2) {
            issues.push("Çok sütunlu veya karmaşık yerleşim sinyalleri tespit edildi.");
            suggestions.push("İçeriği tek sütunlu, soldan sağa okunabilen sade bir düzene taşıyın.");
        } else strengths.push("Belge yapısı ATS tarafından sırayla okunmaya uygun görünüyor.");

        const tableSignals = Number(fileMeta.tableSignals) || (String(text).match(/\|[^\n]+\|/g) || []).length;
        score += tableSignals === 0 ? 3 : tableSignals <= 2 ? 1.5 : 0;
        if (tableSignals > 0) {
            issues.push(`${tableSignals} tablo veya tablo benzeri yapı sinyali bulundu.`);
            suggestions.push("Temel CV içeriğini tablo yerine standart başlıklar ve madde işaretleriyle düzenleyin.");
        }

        score += statistics.specialCharacterRatio < 0.008 ? 3 : statistics.specialCharacterRatio < 0.02 ? 1.5 : 0;
        if (statistics.specialCharacterRatio >= 0.02) {
            issues.push("ATS okumasını zorlaştırabilecek yoğun özel karakter kullanımı var.");
            suggestions.push("Dekoratif simgeleri azaltın ve standart noktalama işaretleri kullanın.");
        }
        score += ["pdf", "docx", "txt"].includes(fileMeta.type) ? 2 : 0;
        return result("format", "Format Uyumluluğu", score, 20, strengths, issues, suggestions, { columnSignals, tableSignals });
    }

    function analyzeSections(context) {
        const strengths = [];
        const issues = [];
        const suggestions = [];
        const found = context.sections.filter((section) => section.found);
        const missing = context.sections.filter((section) => !section.found);
        const score = found.length * 2.5;
        if (found.length >= 5) strengths.push("Temel CV bölümlerinin çoğu açık başlıklarla ayrılmış.");
        missing.forEach((section) => issues.push(`${section.label} bölümü bulunamadı.`));
        if (missing.length) suggestions.push(`Eksik bölümleri standart başlıklarla ekleyin: ${missing.map((item) => item.label).join(", ")}.`);
        return result("sections", "Bölüm Yapısı", score, 15, strengths, issues, suggestions, { found: found.map((item) => item.label), missing: missing.map((item) => item.label) });
    }

    function analyzeContact(context) {
        const fields = [
            ["name", "İsim", 2], ["email", "Geçerli e-posta", 2], ["phone", "Geçerli telefon", 2],
            ["linkedin", "LinkedIn bağlantısı", 2], ["portfolio", "GitHub veya portfolio bağlantısı", 2],
        ];
        let score = 0;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        fields.forEach(([key, label, points]) => {
            if (context.contact[key]) score += points;
            else issues.push(`${label} bulunamadı.`);
        });
        if (score >= 8) strengths.push("İletişim bilgileri ATS tarafından kolayca algılanabiliyor.");
        if (issues.length) suggestions.push("İletişim bilgilerini CV'nin üst kısmında düz metin olarak ve ayrı satırlarda gösterin.");
        return result("contact", "İletişim", score, 10, strengths, issues, suggestions, { fields: Object.fromEntries(fields.map(([key]) => [key, Boolean(context.contact[key])])) });
    }

    function analyzeExperience(context) {
        const normalizedText = normalize(context.text);
        const experienceFound = context.sections.find((section) => section.id === "experience")?.found;
        const jobTitles = ["developer", "geliştirici", "gelistirici", "mühendis", "muhendis", "uzman", "analist", "manager", "yönetici", "yonetici", "designer", "tasarımcı", "tasarimci", "stajyer", "intern", "danışman", "danisman", "lider", "lead"];
        const hasJobTitle = jobTitles.some((title) => normalizedText.includes(normalize(title)));
        const hasCompany = /\b(?:a\.?ş\.?|ltd\.?|şti\.?|inc\.?|corp\.?|şirketi|sirketi|company|ajans|agency)\b/i.test(context.text) || context.statistics.experienceCount > 0;
        const hasDates = context.statistics.experienceCount > 0;
        const hasDescriptions = context.statistics.bulletCount >= 2 || context.statistics.longParagraphCount > 0;
        const hasBullets = context.statistics.bulletCount >= 3;
        const hasMetrics = context.statistics.numericAchievementCount >= 2;
        let score = 0;
        score += experienceFound ? 2 : 0;
        score += hasJobTitle ? 2.5 : 0;
        score += hasCompany ? 2 : 0;
        score += hasDates ? 2.5 : 0;
        score += hasDescriptions ? 2 : 0;
        score += hasBullets ? 2 : context.statistics.bulletCount ? 1 : 0;
        score += hasMetrics ? 2 : context.statistics.numericAchievementCount ? 1 : 0;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        if (hasDates && hasJobTitle) strengths.push("Pozisyon ve tarih bilgileri iş deneyimlerinde algılanabiliyor.");
        if (!experienceFound) issues.push("Standart bir İş Deneyimi başlığı bulunamadı.");
        if (!hasDates) issues.push("İş deneyimlerinde açık tarih aralıkları bulunamadı.");
        if (!hasBullets) issues.push("Deneyim açıklamalarında yeterli madde işareti kullanılmamış.");
        if (!hasMetrics) issues.push("İş deneyimlerinde ölçülebilir başarılar az.");
        if (!hasJobTitle || !hasCompany) suggestions.push("Her deneyimde pozisyon, şirket ve tarih aralığını ayrı ve tutarlı biçimde yazın.");
        if (!hasMetrics) suggestions.push("Yaptığınız işi sonuçla birleştirin; yüzde, süre, proje, ekip veya kullanıcı sayısı gibi ölçülebilir çıktılar ekleyin.");
        return result("experience", "İş Deneyimi", score, 15, strengths, issues, suggestions, { hasJobTitle, hasCompany, hasDates, hasDescriptions, hasBullets, hasMetrics });
    }

    function analyzeSkills(context) {
        const skillsSection = context.sections.find((section) => section.id === "skills")?.found;
        const count = context.skills.length;
        let score = skillsSection ? 4 : 0;
        score += count >= 10 ? 8 : count >= 6 ? 6.5 : count >= 3 ? 4.5 : count > 0 ? 2 : 0;
        score += count >= 6 ? 3 : count >= 3 ? 1.5 : 0;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        if (count >= 6) strengths.push(`${count} teknik beceri açık biçimde algılandı.`);
        if (!skillsSection) issues.push("Teknik Beceriler veya Yetkinlikler başlığı bulunamadı.");
        if (count < 3) issues.push("ATS tarafından algılanabilen teknik beceri sayısı düşük.");
        if (!skillsSection || count < 6) suggestions.push("Teknik becerileri ayrı bir bölümde, standart adlarıyla ve ilanla gerçekten ilgili olanları öne çıkararak listeleyin.");
        return result("skills", "Teknik Beceriler", score, 15, strengths, issues, suggestions, { detected: context.skills });
    }

    function analyzeReadability(context) {
        const stats = context.statistics;
        let score = 0;
        score += stats.wordCount >= 300 && stats.wordCount <= 950 ? 3 : stats.wordCount >= 200 && stats.wordCount <= 1200 ? 1.5 : 0;
        score += stats.averageSentenceLength <= 24 ? 2 : stats.averageSentenceLength <= 32 ? 1 : 0;
        score += stats.longParagraphCount === 0 ? 2 : stats.longParagraphCount <= 2 ? 1 : 0;
        score += stats.bulletCount >= 4 && stats.bulletCount <= 35 ? 2 : stats.bulletCount > 0 ? 1 : 0;
        score += stats.repeatedLineCount === 0 ? 1 : 0;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        if (stats.wordCount >= 300 && stats.wordCount <= 950) strengths.push("CV uzunluğu hızlı tarama için uygun aralıkta.");
        if (stats.wordCount < 200) issues.push("CV çok kısa; deneyim ve yetkinlikler yeterince açıklanmamış olabilir.");
        if (stats.wordCount > 1200) issues.push("CV çok uzun; önemli bilgiler kalabalık içinde kaybolabilir.");
        if (stats.longParagraphCount) issues.push(`${stats.longParagraphCount} uzun paragraf tespit edildi.`);
        if (stats.averageSentenceLength > 32) issues.push("Ortalama cümle uzunluğu yüksek.");
        if (stats.bulletCount < 3) issues.push("Madde işareti kullanımı sınırlı.");
        if (stats.longParagraphCount || stats.averageSentenceLength > 32) suggestions.push("Uzun paragrafları 1–2 satırlık, tek bir sonucu anlatan madde işaretlerine dönüştürün.");
        if (stats.wordCount < 200 || stats.wordCount > 1200) suggestions.push("CV'yi role göre odaklayın; çoğu aday için 300–950 kelimelik net bir içerik uygundur.");
        return result("readability", "Okunabilirlik", score, 10, strengths, issues, suggestions, { wordCount: stats.wordCount, averageSentenceLength: stats.averageSentenceLength });
    }

    function analyzeImpact(context) {
        const stats = context.statistics;
        let score = 0;
        score += stats.actionVerbCount >= 8 ? 6 : stats.actionVerbCount >= 5 ? 4.5 : stats.actionVerbCount >= 2 ? 2.5 : stats.actionVerbCount ? 1 : 0;
        score += stats.numericAchievementCount >= 5 ? 6 : stats.numericAchievementCount >= 3 ? 4.5 : stats.numericAchievementCount ? 2 : 0;
        const resultTerms = ["sonucunda", "sayesinde", "artış", "artis", "azalış", "azalis", "verimlilik", "dönüşüm", "donusum", "performans", "tasarruf", "büyüme", "buyume"];
        const resultTermCount = resultTerms.filter((term) => normalize(context.text).includes(normalize(term))).length;
        score += resultTermCount >= 3 ? 3 : resultTermCount ? 1.5 : 0;
        const strengths = [];
        const issues = [];
        const suggestions = [];
        if (stats.actionVerbCount >= 5) strengths.push("Güçlü aksiyon fiilleri deneyimleri aktif biçimde anlatıyor.");
        if (stats.numericAchievementCount >= 3) strengths.push("Sayısal ve ölçülebilir başarı örnekleri bulunuyor.");
        if (stats.actionVerbCount < 3) issues.push("Güçlü aksiyon fiillerinin kullanımı düşük.");
        if (stats.numericAchievementCount < 2) issues.push("Sayısal başarı ve sonuç ifadeleri yetersiz.");
        if (stats.actionVerbCount < 5) suggestions.push("Maddelere geliştirdim, tasarladım, optimize ettim veya yönettim gibi güçlü fiillerle başlayın.");
        if (stats.numericAchievementCount < 3) suggestions.push("Sorumluluk yerine etkiyi gösterin: “React ile 6 responsive arayüz geliştirerek teslim süresini %25 azalttım.” gibi sonuç odaklı ifadeler kullanın.");
        return result("impact", "Etki ve Başarı", score, 15, strengths, issues, suggestions, { actionVerbCount: stats.actionVerbCount, numericAchievementCount: stats.numericAchievementCount });
    }

    function compareJobDescription(cvText, jobDescription) {
        if (!String(jobDescription || "").trim()) return null;
        const definitions = [...KEYWORD_DEFINITIONS, ...PROFESSIONAL_KEYWORDS];
        const requested = definitions.filter((definition) => definition.aliases.some((alias) => includesAlias(normalize(jobDescription), alias)));
        const found = requested.filter((definition) => definition.aliases.some((alias) => includesAlias(normalize(cvText), alias))).map((definition) => definition.label);
        const missing = requested.filter((definition) => !found.includes(definition.label)).map((definition) => definition.label);
        const total = requested.length;
        return {
            found,
            missing,
            matched: found.length,
            total,
            percentage: total ? Math.round((found.length / total) * 100) : 0,
            hasKeywords: total > 0,
        };
    }

    function scoreLabel(score) {
        if (score >= 90) return "Mükemmel";
        if (score >= 80) return "Çok İyi";
        if (score >= 70) return "İyi";
        if (score >= 60) return "Geliştirilebilir";
        return "ATS İçin Zayıf";
    }

    function analyzeCv(text, options = {}) {
        const safeText = String(text || "").replace(/\u0000/g, " ").trim();
        const fileMeta = { type: "txt", extractionSuccessful: Boolean(safeText), columnSignals: 0, tableSignals: 0, ...(options.fileMeta || {}) };
        const contact = detectContact(safeText);
        const sections = detectSections(safeText, contact);
        const skills = findKeywords(safeText);
        const statistics = calculateStatistics(safeText, skills, sections);
        const context = { text: safeText, fileMeta, contact, sections, skills, statistics };
        const categories = [
            analyzeFormat(context), analyzeSections(context), analyzeContact(context), analyzeExperience(context),
            analyzeSkills(context), analyzeReadability(context), analyzeImpact(context),
        ];
        const score = Math.round(categories.reduce((total, category) => total + category.score, 0));
        return {
            score,
            label: scoreLabel(score),
            categories,
            strengths: Array.from(new Set(categories.flatMap((category) => category.strengths))).slice(0, 8),
            issues: Array.from(new Set(categories.flatMap((category) => category.issues))).slice(0, 12),
            suggestions: Array.from(new Set(categories.flatMap((category) => category.suggestions))).slice(0, 10),
            statistics,
            skills,
            sections,
            contact,
            jobMatch: compareJobDescription(safeText, options.jobDescription),
        };
    }

    root.AtsCvCore = Object.freeze({
        analyzeCv,
        analyzeFormat,
        analyzeSections,
        analyzeContact,
        analyzeExperience,
        analyzeSkills,
        analyzeReadability,
        analyzeImpact,
        compareJobDescription,
        detectContact,
        detectSections,
        detectNumericAchievements,
        findKeywords,
        scoreLabel,
        normalize,
        maximumScore: 100,
    });
}(typeof window !== "undefined" ? window : globalThis));
