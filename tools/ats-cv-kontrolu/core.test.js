const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "../..");

function loadModule(fileName, extras = {}) {
    const sandbox = { ...extras };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, fileName), "utf8"), sandbox, { filename: fileName });
    return sandbox;
}

const strongCv = `
ARDA ALTUNEL
arda@example.com | +90 555 123 45 67
https://linkedin.com/in/arda-altunel
https://github.com/ardaltunel

PROFESYONEL ÖZET
Frontend geliştirici olarak erişilebilir ve hızlı web ürünleri geliştiriyorum.

İŞ DENEYİMİ
Frontend Developer — Örnek Teknoloji Ltd.
2022 – Günümüz
• React ve TypeScript kullanarak 6 farklı responsive web arayüzü geliştirdim.
• Sayfa yüklenme süresini %35 azalttım ve 20 müşteri için deneyimi iyileştirdim.
• 5 kişilik ekipte Git ve Agile süreçlerini yönettim.

EĞİTİM
Bilgisayar Mühendisliği, Örnek Üniversitesi
2018 – 2022

TEKNİK BECERİLER
HTML, CSS, JavaScript, TypeScript, React, Node.js, Git, REST API, SQL, Tailwind CSS, Jest, Docker

PROJELER
• Portfolio uygulamasını Next.js ile tasarladım ve performansı %25 artırdım.
`;

test("yedi kategori toplamı 100 puanlık deterministik ATS skorunu oluşturur", () => {
    const core = loadModule("core.js").AtsCvCore;
    const options = { fileMeta: { type: "pdf", extractionSuccessful: true, columnSignals: 0, tableSignals: 0 } };
    const first = core.analyzeCv(strongCv, options);
    const second = core.analyzeCv(strongCv, options);

    assert.equal(first.categories.length, 7);
    assert.equal(first.categories.reduce((sum, category) => sum + category.maximum, 0), 100);
    assert.equal(first.score, Math.round(first.categories.reduce((sum, category) => sum + category.score, 0)));
    assert.equal(first.score, second.score);
    assert.ok(first.score >= 80 && first.score <= 100);
});

test("zayıf ve eksik CV yüksek puan alamaz", () => {
    const core = loadModule("core.js").AtsCvCore;
    const result = core.analyzeCv("Ben web sitesi yaptım. HTML biliyorum.", { fileMeta: { type: "txt", extractionSuccessful: true } });

    assert.ok(result.score < 60);
    assert.equal(result.label, "ATS İçin Zayıf");
    assert.ok(result.issues.some((issue) => issue.includes("İş Deneyimi")));
    assert.ok(result.issues.some((issue) => issue.includes("e-posta")));
});

test("iletişim bilgilerini ve teknik becerileri doğrular", () => {
    const core = loadModule("core.js").AtsCvCore;
    const result = core.analyzeCv(strongCv, { fileMeta: { type: "docx", extractionSuccessful: true } });

    assert.equal(result.contact.name, "ARDA ALTUNEL");
    assert.equal(result.contact.email, "arda@example.com");
    assert.ok(result.contact.phone.includes("555"));
    assert.ok(result.contact.linkedin);
    assert.ok(result.contact.portfolio);
    for (const skill of ["React", "TypeScript", "Git", "REST API", "Jest", "Docker"]) assert.ok(result.skills.includes(skill));
});

test("sayısal başarıları ve aksiyon odaklı yazımı gerçek metinden hesaplar", () => {
    const core = loadModule("core.js").AtsCvCore;
    const result = core.analyzeCv(strongCv, { fileMeta: { type: "txt", extractionSuccessful: true } });

    assert.ok(result.statistics.numericAchievementCount >= 4);
    assert.ok(result.statistics.actionVerbCount >= 5);
    assert.equal(result.statistics.experienceCount, 1);
    assert.equal(result.statistics.projectCount, 1);
    assert.ok(result.categories.find((category) => category.id === "impact").score >= 9);
});

test("iş ilanında yalnızca desteklenen mesleki anahtar kelimeleri karşılaştırır", () => {
    const core = loadModule("core.js").AtsCvCore;
    const match = core.compareJobDescription(strongCv, "Ekibimiz React, TypeScript, REST API, Jest, Kubernetes ve Scrum bilen bir Frontend Developer arıyor. Güzel bir gün ve iyi bir ortam sunuyoruz.");

    assert.ok(match.total >= 7);
    assert.ok(match.found.includes("React"));
    assert.ok(match.missing.includes("Kubernetes"));
    assert.ok(match.missing.includes("Scrum"));
    assert.ok(!match.found.includes("güzel"));
    assert.equal(match.percentage, Math.round((match.matched / match.total) * 100));
    assert.equal(core.compareJobDescription(strongCv, ""), null);
});

test("puan etiketleri tanımlanan eşiklerle çalışır", () => {
    const core = loadModule("core.js").AtsCvCore;
    assert.equal(core.scoreLabel(90), "Mükemmel");
    assert.equal(core.scoreLabel(80), "Çok İyi");
    assert.equal(core.scoreLabel(70), "İyi");
    assert.equal(core.scoreLabel(60), "Geliştirilebilir");
    assert.equal(core.scoreLabel(59), "ATS İçin Zayıf");
});

test("dosya doğrulaması tür ve 12 MB sınırını uygular", () => {
    const parser = loadModule("parser.js").AtsCvParser;
    assert.equal(parser.validateFile({ name: "cv.pdf", size: 1024 }), "pdf");
    assert.equal(parser.validateFile({ name: "cv.DOCX", size: 2048 }), "docx");
    assert.throws(() => parser.validateFile({ name: "cv.pages", size: 100 }), /Desteklenmeyen/);
    assert.throws(() => parser.validateFile({ name: "cv.txt", size: 13 * 1024 * 1024 }), /12 MB/);
});

test("TXT dosyası tamamen tarayıcı tarafı metne dönüştürülür", async () => {
    const parser = loadModule("parser.js", { TextDecoder, setTimeout }).AtsCvParser;
    const bytes = new TextEncoder().encode("ARDA ALTUNEL\narda@example.com\nİŞ DENEYİMİ\n2022 – Günümüz\nReact ile web uygulamaları geliştirdim.");
    const progress = [];
    const parsed = await parser.parseFile({ name: "arda-cv.txt", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }, (value) => progress.push(value));

    assert.match(parsed.text, /ARDA ALTUNEL/);
    assert.match(parsed.text, /React/);
    assert.equal(parsed.meta.type, "txt");
    assert.equal(parsed.meta.extractionSuccessful, true);
    assert.ok(progress.length >= 2);
});

test("araç ana sayfa, metadata ve istemci tarafı dosyalarıyla kayıtlıdır", () => {
    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(projectRoot, "index.js"), "utf8");

    assert.match(html, /data-tool="ats-cv-kontrolu"/);
    assert.match(html, /id="ats-cv-kontrolu"/);
    assert.match(html, /tools\/ats-cv-kontrolu\/core\.js/);
    assert.match(html, /tools\/ats-cv-kontrolu\/parser\.js/);
    assert.match(html, /tools\/ats-cv-kontrolu\/app\.js/);
    assert.match(script, /"ats-cv-kontrolu"\s*:/);
});
