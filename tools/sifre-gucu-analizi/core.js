(function initPasswordStrengthCore(root) {
    "use strict";

    const COMMON_PASSWORDS = Object.freeze(new Set([
        "123456", "1234567", "12345678", "123456789", "1234567890", "000000", "111111", "123123", "654321",
        "password", "password1", "password123", "passw0rd", "qwerty", "qwerty123", "qwertyuiop", "asdfgh", "asdfghjkl",
        "zxcvbn", "abc123", "abcdef", "admin", "admin123", "administrator", "root", "welcome", "welcome1", "letmein",
        "iloveyou", "monkey", "dragon", "football", "baseball", "master", "login", "princess", "sunshine", "superman",
        "trustno1", "freedom", "whatever", "computer", "internet", "secret", "changeme", "default", "guest", "test123",
        "1q2w3e4r", "qazwsx", "1qaz2wsx", "zaq12wsx", "p@ssword", "p@ssw0rd", "senha", "bonjour", "hola123",
        "sifre", "sifre123", "şifre", "şifre123", "parola", "parola123", "turkiye", "türkiye", "istanbul", "ankara",
        "galatasaray", "fenerbahce", "fenerbahçe", "besiktas", "beşiktaş", "trabzonspor", "atatürk", "ataturk",
        "mehmet", "mustafa", "ahmet", "ayse", "ayşe", "fatma", "canim", "canım", "askim", "aşkım", "sevgilim",
    ]));

    const SEQUENCE_SOURCES = Object.freeze([
        "01234567890", "9876543210", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba",
        "qwertyuiop", "poiuytrewq", "asdfghjkl", "lkjhgfdsa", "zxcvbnm", "mnbvcxz",
        "qwerty", "ytrewq", "azerty", "abcdef", "fedcba",
    ]);

    const RISKY_WORDS = Object.freeze([
        "password", "passw0rd", "sifre", "şifre", "parola", "admin", "administrator", "letmein", "welcome",
        "qwerty", "asdfgh", "zxcvbn", "iloveyou", "login", "secret", "default", "root",
    ]);

    function normalize(value) {
        return String(value || "").normalize("NFKC").toLocaleLowerCase("tr-TR").trim();
    }

    function compact(value) {
        return normalize(value).replace(/[^\p{L}\p{N}]/gu, "");
    }

    function getCharacters(password) {
        return Array.from(String(password || ""));
    }

    function detectCharacterClasses(password) {
        const value = String(password || "");
        const characters = getCharacters(value);
        const hasLowercase = /\p{Ll}/u.test(value);
        const hasUppercase = /\p{Lu}/u.test(value);
        const hasNumber = /\p{N}/u.test(value);
        const hasSpace = /\s/u.test(value);
        const hasSymbol = characters.some((character) => !/[\p{L}\p{N}\s]/u.test(character));
        const hasNonAscii = characters.some((character) => character.codePointAt(0) > 127);
        let poolSize = 0;
        if (hasLowercase) poolSize += 29;
        if (hasUppercase) poolSize += 29;
        if (hasNumber) poolSize += 10;
        if (hasSymbol) poolSize += 33;
        if (hasSpace) poolSize += 1;
        if (hasNonAscii) poolSize += 12;
        return { hasLowercase, hasUppercase, hasNumber, hasSymbol, hasSpace, hasNonAscii, poolSize: Math.max(poolSize, characters.length ? 1 : 0) };
    }

    function detectRepeatedPatterns(password) {
        const value = normalize(password);
        const repeatedRuns = value.match(/(.)\1{2,}/gu) || [];
        const repeatedBlocks = [];
        for (let size = 2; size <= Math.min(8, Math.floor(value.length / 2)); size += 1) {
            for (let start = 0; start <= value.length - (size * 2); start += 1) {
                const block = value.slice(start, start + size);
                let repeats = 1;
                while (value.slice(start + (repeats * size), start + ((repeats + 1) * size)) === block) repeats += 1;
                if (repeats >= 2 && !repeatedBlocks.some((item) => item.block === block && item.start === start)) {
                    repeatedBlocks.push({ block, repeats, start });
                }
            }
        }
        const strongestBlock = repeatedBlocks.sort((a, b) => (b.block.length * b.repeats) - (a.block.length * a.repeats))[0] || null;
        const severity = Math.min(10, (repeatedRuns.length * 3) + (strongestBlock ? Math.min(7, strongestBlock.repeats + strongestBlock.block.length / 2) : 0));
        return { found: repeatedRuns.length > 0 || Boolean(strongestBlock), repeatedRuns, repeatedBlock: strongestBlock, severity };
    }

    function detectSequences(password) {
        const value = compact(password);
        const matches = [];
        SEQUENCE_SOURCES.forEach((source) => {
            for (let size = Math.min(8, value.length); size >= 4; size -= 1) {
                for (let start = 0; start <= value.length - size; start += 1) {
                    const candidate = value.slice(start, start + size);
                    if (source.includes(candidate) && !matches.includes(candidate)) matches.push(candidate);
                }
            }
        });
        const riskyWords = RISKY_WORDS.filter((word) => value.includes(compact(word)));
        const longest = [...matches, ...riskyWords].sort((a, b) => b.length - a.length)[0] || "";
        return { found: matches.length > 0 || riskyWords.length > 0, matches, riskyWords, longest, severity: Math.min(12, longest.length ? Math.max(4, longest.length) : 0) };
    }

    function detectCommonPassword(password) {
        const normalized = normalize(password);
        const compacted = compact(password);
        const leetNormalized = compacted
            .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t");
        return COMMON_PASSWORDS.has(normalized) || COMMON_PASSWORDS.has(compacted) || COMMON_PASSWORDS.has(leetNormalized);
    }

    function splitPassphraseWords(password) {
        const separated = String(password || "")
            .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
            .replace(/[\p{N}_\-–—.!?@#$%^&*+=[\]{}()\\/|:;,]+/gu, " ");
        return separated.split(/\s+/u).map((word) => word.trim()).filter((word) => Array.from(word).length >= 3);
    }

    function detectPassphrase(password) {
        const words = splitPassphraseWords(password);
        const uniqueWords = new Set(words.map(normalize));
        const length = getCharacters(password).length;
        return { words, isPassphrase: length >= 16 && words.length >= 3 && uniqueWords.size >= 3 };
    }

    function detectAmbiguousCharacters(password) {
        const characters = getCharacters(password);
        const ambiguous = characters.filter((character) => "O0oIl1ıİ|".includes(character));
        const ratio = characters.length ? ambiguous.length / characters.length : 0;
        return { count: ambiguous.length, excessive: ambiguous.length >= 5 && ratio >= 0.35, ratio };
    }

    function calculateLengthScore(length) {
        if (length <= 0) return 0;
        if (length <= 7) return Math.min(11, length * 1.5);
        if (length <= 11) return 14 + ((length - 8) * 3);
        if (length <= 15) return 26 + ((length - 12) * 3);
        if (length <= 19) return 37 + (length - 16);
        return 40;
    }

    function calculateDiversityScore(classes, passphrase) {
        let score = 0;
        score += classes.hasLowercase ? 4 : 0;
        score += classes.hasUppercase ? 4 : 0;
        score += classes.hasNumber ? 4 : 0;
        score += classes.hasSymbol ? 4 : 0;
        score += classes.hasSpace ? 2 : 0;
        const classCount = [classes.hasLowercase, classes.hasUppercase, classes.hasNumber, classes.hasSymbol, classes.hasSpace].filter(Boolean).length;
        if (classCount >= 3) score += 4;
        if (classCount >= 4) score += 3;
        if (passphrase.isPassphrase) score += 8;
        return Math.min(25, score);
    }

    function calculateEntropy(length, poolSize, patterns) {
        const theoretical = length && poolSize > 1 ? length * Math.log2(poolSize) : 0;
        let penaltyBits = 0;
        penaltyBits += patterns.common ? Math.max(0, theoretical - 12) : 0;
        penaltyBits += patterns.repeats.severity * 1.8;
        penaltyBits += patterns.sequences.severity * 1.6;
        penaltyBits += patterns.ambiguous.excessive ? 3 : 0;
        if (patterns.passphrase.isPassphrase) penaltyBits = Math.max(0, penaltyBits - 5);
        const effective = Math.max(0, Math.min(theoretical, theoretical - penaltyBits));
        return { theoretical: Math.round(theoretical * 10) / 10, effective: Math.round(effective * 10) / 10, penaltyBits: Math.round(penaltyBits * 10) / 10 };
    }

    function calculateScore(password, classes, patterns, entropy) {
        const length = getCharacters(password).length;
        if (!length) return { score: 0, components: { length: 0, diversity: 0, entropy: 0, unpredictability: 0 } };
        const lengthScore = calculateLengthScore(length);
        const diversityScore = calculateDiversityScore(classes, patterns.passphrase);
        const entropyScore = Math.min(20, entropy.effective / 5);
        let unpredictabilityScore = 15;
        unpredictabilityScore -= patterns.repeats.severity;
        unpredictabilityScore -= patterns.sequences.severity;
        unpredictabilityScore -= patterns.ambiguous.excessive ? 2 : 0;
        if (patterns.common) unpredictabilityScore = 0;
        let score = Math.round(lengthScore + diversityScore + entropyScore + Math.max(0, unpredictabilityScore));
        if (length < 8) score = Math.min(score, 24);
        if (patterns.common) score = Math.min(score, 10);
        if (patterns.sequences.longest.length >= Math.max(6, length * 0.7)) score = Math.min(score, 20);
        const repeatedRunLength = Math.max(0, ...patterns.repeats.repeatedRuns.map((run) => getCharacters(run).length));
        const repeatedBlockLength = patterns.repeats.repeatedBlock ? patterns.repeats.repeatedBlock.block.length * patterns.repeats.repeatedBlock.repeats : 0;
        const repeatCoverage = Math.max(repeatedRunLength, repeatedBlockLength) / length;
        if (repeatCoverage >= 0.7) score = Math.min(score, 24);
        else if (repeatCoverage >= 0.4) score = Math.min(score, 44);
        return {
            score: Math.max(0, Math.min(100, score)),
            components: {
                length: Math.round(lengthScore * 10) / 10,
                diversity: Math.round(diversityScore * 10) / 10,
                entropy: Math.round(entropyScore * 10) / 10,
                unpredictability: Math.round(Math.max(0, unpredictabilityScore) * 10) / 10,
            },
        };
    }

    function formatCrackTime(effectiveEntropy) {
        if (!effectiveEntropy) return { seconds: 0, label: "Anında" };
        const guessesPerSecond = 10 ** 10;
        const seconds = (2 ** Math.min(1023, effectiveEntropy)) / guessesPerSecond / 2;
        if (seconds < 1) return { seconds, label: "Anında" };
        if (seconds < 10) return { seconds, label: "Birkaç saniye" };
        if (seconds < 60) return { seconds, label: `${Math.round(seconds)} saniye` };
        if (seconds < 3600) return { seconds, label: `${formatNumber(seconds / 60)} dakika` };
        if (seconds < 86400) return { seconds, label: `${formatNumber(seconds / 3600)} saat` };
        if (seconds < 31557600) return { seconds, label: `${formatNumber(seconds / 86400)} gün` };
        const years = seconds / 31557600;
        if (years < 1000) return { seconds, label: `${formatNumber(years)} yıl` };
        if (years < 1e6) return { seconds, label: `${formatNumber(years / 1000)} bin yıl` };
        if (years < 1e9) return { seconds, label: `${formatNumber(years / 1e6)} milyon yıl` };
        if (years < 1e12) return { seconds, label: `${formatNumber(years / 1e9)} milyar yıl` };
        if (years >= 1e15) return { seconds, label: "1 katrilyon yıldan fazla" };
        return { seconds, label: `${formatNumber(years / 1e12)} trilyon yıl` };
    }

    function formatNumber(value) {
        if (value < 10) return String(Math.max(1, Math.round(value * 10) / 10)).replace(".", ",");
        return Math.round(value).toLocaleString("tr-TR");
    }

    function getLevel(score) {
        if (score >= 85) return { label: "Çok Güçlü", id: "very-strong" };
        if (score >= 65) return { label: "Güçlü", id: "strong" };
        if (score >= 45) return { label: "Orta", id: "medium" };
        if (score >= 25) return { label: "Zayıf", id: "weak" };
        return { label: "Çok Zayıf", id: "very-weak" };
    }

    function buildChecks(length, classes, patterns) {
        return [
            { id: "length", label: "En az 12 karakter", passed: length >= 12 },
            { id: "uppercase", label: "Büyük harf içeriyor", passed: classes.hasUppercase },
            { id: "lowercase", label: "Küçük harf içeriyor", passed: classes.hasLowercase },
            { id: "number", label: "Rakam içeriyor", passed: classes.hasNumber },
            { id: "symbol", label: "Özel karakter veya uzun parola cümlesi", passed: classes.hasSymbol || patterns.passphrase.isPassphrase },
            { id: "repeat", label: "Tekrarlayan karakter dizisi yok", passed: !patterns.repeats.found },
            { id: "sequence", label: "Ardışık veya klavye dizisi yok", passed: !patterns.sequences.found },
            { id: "common", label: "Yaygın şifre değil", passed: !patterns.common },
        ];
    }

    function buildWarnings(length, patterns) {
        const warnings = [];
        if (length && length < 8) warnings.push("Şifre sekiz karakterden kısa olduğu için kolay tahmin edilebilir.");
        if (patterns.common) warnings.push("Bu parola yaygın şifre listesinde bulunuyor ve kullanılmamalı.");
        if (patterns.repeats.found) warnings.push("Tekrarlayan karakter veya kelime dizisi tespit edildi.");
        if (patterns.sequences.found) warnings.push(`Tahmin edilebilir bir dizi bulundu${patterns.sequences.longest ? `: “${patterns.sequences.longest}”` : ""}.`);
        if (patterns.ambiguous.excessive) warnings.push("O, 0, l, 1 ve I gibi benzer karakterler yoğun kullanılmış.");
        return warnings;
    }

    function buildSuggestions(length, classes, patterns) {
        const suggestions = [];
        if (length < 12) suggestions.push("Şifrenizi en az 12, tercihen 16 veya daha fazla karakter yapın.");
        if (!classes.hasUppercase && !patterns.passphrase.isPassphrase) suggestions.push("Büyük ve küçük harfleri birlikte kullanın.");
        if (!classes.hasNumber && !patterns.passphrase.isPassphrase) suggestions.push("Tahmin edilmesi zor bir konumda rakam kullanın.");
        if (!classes.hasSymbol && !patterns.passphrase.isPassphrase) suggestions.push("Özel karakter ekleyin veya birbiriyle ilgisiz en az dört kelimelik uzun bir parola cümlesi kullanın.");
        if (patterns.repeats.found) suggestions.push("Aynı karakteri veya kelime bloğunu art arda tekrar etmeyin.");
        if (patterns.sequences.found) suggestions.push("123456, abcdef ve qwerty gibi ardışık veya klavye dizilerinden kaçının.");
        if (patterns.common) suggestions.push("Bu parolayı kullanmayın; tamamen benzersiz bir parola oluşturun.");
        suggestions.push("Ad, doğum tarihi, kullanıcı adı veya takım adı gibi kişisel ve kolay araştırılabilir bilgileri kullanmayın.");
        return Array.from(new Set(suggestions));
    }

    function analyzePassword(password) {
        const value = String(password || "");
        const length = getCharacters(value).length;
        const classes = detectCharacterClasses(value);
        const patterns = {
            common: detectCommonPassword(value),
            repeats: detectRepeatedPatterns(value),
            sequences: detectSequences(value),
            passphrase: detectPassphrase(value),
            ambiguous: detectAmbiguousCharacters(value),
        };
        const entropy = calculateEntropy(length, classes.poolSize, patterns);
        const scoring = calculateScore(value, classes, patterns, entropy);
        const level = getLevel(scoring.score);
        return {
            score: scoring.score,
            level,
            length,
            classes,
            patterns,
            entropy,
            crackTime: formatCrackTime(entropy.effective),
            checks: buildChecks(length, classes, patterns),
            warnings: buildWarnings(length, patterns),
            suggestions: buildSuggestions(length, classes, patterns),
            components: scoring.components,
        };
    }

    root.PasswordStrengthCore = Object.freeze({
        analyzePassword,
        detectCharacterClasses,
        detectRepeatedPatterns,
        detectSequences,
        detectCommonPassword,
        detectPassphrase,
        detectAmbiguousCharacters,
        calculateEntropy,
        formatCrackTime,
        getLevel,
        commonPasswordCount: COMMON_PASSWORDS.size,
    });
}(typeof window !== "undefined" ? window : globalThis));
