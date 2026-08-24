(function initPasswordGameData(root) {
    "use strict";

    root.PasswordGameData = Object.freeze({
        months: Object.freeze(["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"]),
        cities: Object.freeze(["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Trabzon", "Eskişehir", "Mardin", "Samsun", "Çanakkale"]),
        emojis: Object.freeze(["🔥", "🚀", "🧠", "👑", "🎯", "🦊"]),
        reverseWords: Object.freeze(["KOD", "WEB", "OYUN", "BYTE", "VERİ", "EKRAN", "TOOL"]),
        colors: Object.freeze([
            { name: "Mor", hex: "#A102B0" },
            { name: "Mavi", hex: "#102AC0" },
            { name: "Yeşil", hex: "#20B1A0" },
            { name: "Turuncu", hex: "#C210A3" },
            { name: "Pembe", hex: "#D120B0" },
            { name: "Lacivert", hex: "#102B2A" },
        ]),
        riddles: Object.freeze([
            { question: "Uçar ama kuş değildir, kuyruğu vardır ama kedi değildir.", answer: "uçak" },
            { question: "Dışı var, içi yok; tekme yer, suçu yok.", answer: "top" },
            { question: "Kat kat açılır, kokusu mutfağı sarar; keserken göz yaşartır.", answer: "soğan" },
            { question: "Gece görünür, gündüz saklanır; gökte sessizce parlar.", answer: "yıldız" },
            { question: "Dört ayağı vardır ama yürüyemez; üzerinde yemek yenir.", answer: "masa" },
            { question: "Sayfaları vardır ama konuşmaz; açınca bilgi anlatır.", answer: "kitap" },
            { question: "Yağmurda açılır, güneşte kapanır; başının üstünde durur.", answer: "şemsiye" },
            { question: "İki camı vardır, burnun üstünde durur; uzağı yakın eder.", answer: "gözlük" },
            { question: "Dişleri vardır ama ısırmaz; saçları düzene sokar.", answer: "tarak" },
            { question: "Kolu vardır eli yok; zamanı söyler dili yok.", answer: "saat" },
            { question: "Kanadı yok uçar, ağzı yok ıslık çalar.", answer: "rüzgar" },
            { question: "Evi sırtındadır, yavaşça yol alır.", answer: "kaplumbağa" },
            { question: "Beyazdır, gökten iner; avuçta eriyip gider.", answer: "kar" },
            { question: "İçi su dolu, dışı yeşil; yazın serinletir.", answer: "karpuz" },
            { question: "Bir yüzü vardır ama gözü yok; yazı tura diye havaya atılır.", answer: "para" },
            { question: "Kırmızı yanınca durdurur, yeşil yanınca geçirir.", answer: "ışık" },
        ]),
        forbiddenCandidates: Object.freeze(["q", "x", "j"]),
    });
}(typeof window !== "undefined" ? window : globalThis));
