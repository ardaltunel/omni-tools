(function initPasswordGameRules(root) {
    "use strict";

    const data = root.PasswordGameData;
    const utils = root.PasswordGameUtils;
    if (!data || !utils) return;

    const includesNormalized = (password, value) => utils.normalize(password).includes(utils.normalize(value));
    const countUppercase = (password) => (String(password).match(/\p{Lu}/gu) || []).length;
    const digits = (password) => String(password).match(/[0-9]/g) || [];

    const rules = [
        { id: 1, title: "İlk adım", description: () => "Şifren en az 6 karakter olmalı.", validate: (password) => utils.characters(password).length >= 6 },
        { id: 2, title: "Büyük düşün", description: () => "En az bir büyük harf içermeli.", validate: (password) => /\p{Lu}/u.test(password) },
        { id: 3, title: "Biraz sayı", description: () => "En az bir rakam içermeli.", validate: (password) => /[0-9]/u.test(password) },
        { id: 4, title: "Özel dokunuş", description: () => "!, @, #, $, %, & veya ? karakterlerinden birini içermeli.", validate: (password) => /[!@#$%&?]/u.test(password) },
        { id: 5, title: "Daha uzun", description: () => "Şifre en az 10 karakter uzunluğunda olmalı.", validate: (password) => utils.characters(password).length >= 10 },
        { id: 6, title: "Rakam dengesi", description: () => "Şifredeki bütün rakamların toplamı tam 18 olmalı.", validate: (password) => utils.digitSum(password) === 18 },
        { id: 7, title: "Takvim yaprağı", description: () => "Türkçe ay isimlerinden birini içermeli.", validate: (password) => data.months.some((month) => includesNormalized(password, month)) },
        { id: 8, title: "Emoji seçimi", description: (context) => `Gösterilen emojilerden birini kullan: ${context.emojiChoices.join("  ")}`, validate: (password, context) => context.emojiChoices.some((emoji) => password.includes(emoji)) },
        { id: 9, title: "Çiftler kulübü", description: () => "En az iki farklı çift rakam içermeli.", validate: (password) => new Set(digits(password).filter((digit) => Number(digit) % 2 === 0)).size >= 2 },
        { id: 10, title: "Mini işlem", description: (context) => `${context.math.left} + ${context.math.right} işleminin cevabı şifrede bulunmalı.`, validate: (password, context) => password.includes(String(context.math.answer)) },
        { id: 11, title: "Şehir turu", description: (context) => `Şifre “${context.city}” şehrini içermeli.`, validate: (password, context) => includesNormalized(password, context.city) },
        { id: 12, title: "Sesli harfler", description: () => "En az 3 Türkçe sesli harf bulunmalı.", validate: (password) => (utils.normalize(password).match(/[aeıioöuü]/gu) || []).length >= 3 },
        { id: 13, title: "Tekrar eden rakam", description: () => "Aynı rakam şifrede en az iki kez geçmeli.", validate: (password) => Object.values(digits(password).reduce((counts, digit) => ({ ...counts, [digit]: (counts[digit] || 0) + 1 }), {})).some((count) => count >= 2) },
        { id: 14, title: "Mini palindrom", description: () => "İçinde aba, 121 veya kek gibi 3 karakterlik bir palindrom bulunmalı.", validate: (password) => {
            const chars = utils.characters(utils.normalize(password));
            return chars.some((character, index) => index + 2 < chars.length && character === chars[index + 2]);
        } },
        { id: 15, title: "Rengi bul", description: (context) => `${context.color.name} renk örneğinin doğru HEX kodunu üç seçenek arasından şifreye ekle.`, validate: (password, context) => password.toLocaleUpperCase("tr-TR").includes(context.color.hex) },
        { id: 16, title: "Bugün hangi gün?", description: (context) => `Bugünün Türkçe gün adını ekle: ${context.dayName}.`, validate: (password, context) => includesNormalized(password, context.dayName) },
        { id: 17, title: "Omni imzası", description: () => "Şifre büyük harflerle OMNI kelimesini içermeli.", validate: (password) => password.includes("OMNI") },
        { id: 18, title: "Omni numarası", description: () => "OMNI kelimesinin hemen ardından bir rakam gelmeli.", validate: (password) => /OMNI[0-9]/u.test(password) },
        { id: 19, title: "Büyük harf takımı", description: () => "Şifrede en az 4 büyük harf olmalı.", validate: (password) => countUppercase(password) >= 4 },
        { id: 20, title: "Sembol ikilisi", description: () => "#, @, !, % ve & sembollerinden tam iki farklı tanesi kullanılmalı.", validate: (password) => new Set((password.match(/[#@!%&]/g) || [])).size === 2 },
        { id: 21, title: "Ters köşe", description: (context) => `“${context.reverseWord}” kelimesinin tersini şifreye yaz.`, validate: (password, context) => includesNormalized(password, context.reversedWord) },
        { id: 22, title: "Uzun yol", description: () => "Toplam uzunluk en az 30 karakter olmalı.", validate: (password) => utils.characters(password).length >= 30 },
        { id: 23, title: "Beş rakam", description: () => "En az 5 rakam içermeli; rakamların toplamı yine 18 olmalı.", validate: (password) => digits(password).length >= 5 },
        { id: 24, title: "Yasak harf", description: (context) => `Bundan sonra “${context.forbiddenLetter}” harfini kullanamazsın.`, validate: (password, context) => !utils.normalize(password).includes(context.forbiddenLetter) },
        { id: 25, title: "Şanslı sayı", description: (context) => `Bugünün şanslı sayısı ${context.luckyNumber}; şifrede bulunmalı.`, validate: (password, context) => password.includes(String(context.luckyNumber)) },
        { id: 26, title: "Emoji çifti", description: () => "Yan yana iki aynı oyun emojisi bulunmalı.", validate: (password) => data.emojis.some((emoji) => password.includes(`${emoji}${emoji}`)) },
        { id: 27, title: "Gizli kelime", description: (context) => `Bilmece: ${context.riddle.question}`, validate: (password, context) => includesNormalized(password, context.riddle.answer) },
        { id: 28, title: "Asal uzunluk", description: () => "Toplam karakter sayısı asal sayı olmalı: 31, 37, 41, 43, 47…", validate: (password) => utils.isPrime(utils.characters(password).length) },
        { id: 29, title: "Son dokunuş", description: () => "Şifre ? karakteriyle bitmeli.", validate: (password) => password.endsWith("?") },
        { id: 30, title: "Son sınav", description: () => "Açılan bütün kurallar aynı anda başarılı olmalı.", validate: (_password, context) => Boolean(context.allPreviousValid) },
    ];

    root.PasswordGameRules = Object.freeze(rules.map((rule) => Object.freeze(rule)));
}(typeof window !== "undefined" ? window : globalThis));
