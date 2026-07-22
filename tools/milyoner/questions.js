(function initMillionaireQuestions(root, factory) {
    "use strict";

    const questions = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = questions;
    } else {
        root.OmniMillionaireQuestions = questions;
    }
})(typeof globalThis !== "undefined" ? globalThis : window, function createMillionaireQuestions() {
    "use strict";

    const DIFFICULTY_LABELS = Object.freeze({
        1: "Çok kolay",
        2: "Kolay",
        3: "Kolay-orta",
        4: "Orta",
        5: "Orta-zor",
        6: "Zor",
        7: "Final",
    });
    const PACK_DIFFICULTIES = Object.freeze([
        [1, 1, 1, 2],
        [2, 3, 3, 3],
        [4, 4, 5, 5],
        [6, 6, 7, 7],
    ]);

    const packs = [
        pack("Genel Kültür", "{subject} ülkesinin para birimi hangisidir?", "{subject} ülkesinin resmi para birimi {answer} olarak kullanılır.", [
            ["Japonya", "Yen"], ["Birleşik Krallık", "Sterlin"], ["İsviçre", "İsviçre frangı"], ["Güney Kore", "Won"],
        ]),
        pack("Genel Kültür", "{subject} hangi şehirde bulunur?", "{subject}, {answer} şehrinin en tanınan yapılarından biridir.", [
            ["Eyfel Kulesi", "Paris"], ["Kolezyum", "Roma"], ["Big Ben", "Londra"], ["Sagrada Familia", "Barselona"],
        ]),
        pack("Genel Kültür", "{subject} kısaltmasının açılımı hangisidir?", "{subject}, “{answer}” adının uluslararası kısaltmasıdır.", [
            ["UNESCO", "BM Eğitim, Bilim ve Kültür Örgütü"], ["UNICEF", "BM Çocuklara Yardım Fonu"], ["WHO", "Dünya Sağlık Örgütü"], ["NATO", "Kuzey Atlantik Antlaşması Örgütü"],
        ]),
        pack("Genel Kültür", "{subject} geleneği en çok hangi ülkeyle özdeşleşir?", "{subject} geleneği {answer} kültürüyle güçlü biçimde özdeşleşmiştir.", [
            ["Hanami", "Japonya"], ["Oktoberfest", "Almanya"], ["Rio Karnavalı", "Brezilya"], ["Ölüler Günü", "Meksika"],
        ]),

        pack("Tarih", "{subject} hangi yılda gerçekleşmiştir?", "{subject}, {answer} yılında gerçekleşmiştir.", [
            ["Türkiye Cumhuriyeti'nin ilanı", "1923"], ["İstanbul'un fethi", "1453"], ["Fransız Devrimi'nin başlaması", "1789"], ["İlk insanlı Ay yolculuğu", "1969"],
        ]),
        pack("Tarih", "{subject} en çok hangi uygarlıkla ilişkilendirilir?", "{subject}, {answer} uygarlığının tarihsel mirasında önemli yer tutar.", [
            ["Hiyeroglif yazısı", "Antik Mısır"], ["Çivi yazısı", "Sümerler"], ["İlk fonetik alfabelerden biri", "Fenikeliler"], ["On İki Levha Kanunları", "Romalılar"],
        ]),
        pack("Tarih", "{subject} hangi tarihsel mücadeleyle tanınır?", "{subject}, “{answer}” sürecindeki rolüyle dünya tarihine geçmiştir.", [
            ["Mahatma Gandhi", "Hindistan'ın bağımsızlık hareketi"], ["Nelson Mandela", "Güney Afrika'da apartheid karşıtlığı"], ["Abraham Lincoln", "ABD'de köleliğin kaldırılması süreci"], ["Mustafa Kemal Atatürk", "Türk Kurtuluş Savaşı"],
        ]),
        pack("Tarih", "{subject} hangi başarıyla tarihe geçmiştir?", "{subject}, “{answer}” başarısıyla tanınır.", [
            ["Roald Amundsen", "Güney Kutbu'na ilk ulaşan ekip"], ["Yuri Gagarin", "Uzaya çıkan ilk insan"], ["Macellan seferi", "Dünyanın çevresini dolaşan ilk sefer"], ["İbn Battuta", "Geniş coğrafyaları anlatan seyahatname"],
        ]),

        pack("Coğrafya", "{subject} ülkesinin başkenti hangisidir?", "{subject} ülkesinin başkenti {answer} şehridir.", [
            ["Kanada", "Ottawa"], ["Avustralya", "Canberra"], ["Brezilya", "Brasilia"], ["Mısır", "Kahire"],
        ]),
        pack("Coğrafya", "{subject} Nehri hangi denize veya okyanusa dökülür?", "{subject} Nehri, {answer} sularına ulaşır.", [
            ["Nil", "Akdeniz"], ["Amazon", "Atlas Okyanusu"], ["Tuna", "Karadeniz"], ["Volga", "Hazar Denizi"],
        ]),
        pack("Coğrafya", "{subject} Dağı hangi ülkededir?", "{subject} Dağı {answer} sınırları içinde bulunur.", [
            ["Fuji", "Japonya"], ["Kilimanjaro", "Tanzanya"], ["Aconcagua", "Arjantin"], ["Ağrı", "Türkiye"],
        ]),
        pack("Coğrafya", "{subject} hangi iki su kütlesini birbirine bağlar?", "{subject}, {answer} arasında doğal bir geçittir.", [
            ["İstanbul Boğazı", "Karadeniz ile Marmara Denizi"], ["Çanakkale Boğazı", "Marmara Denizi ile Ege Denizi"], ["Cebelitarık Boğazı", "Akdeniz ile Atlas Okyanusu"], ["Bering Boğazı", "Arktik Okyanusu ile Pasifik Okyanusu"],
        ]),

        pack("Bilim", "{subject} elementinin kimyasal sembolü hangisidir?", "{subject} elementinin periyodik tablodaki sembolü {answer} şeklindedir.", [
            ["Altın", "Au"], ["Demir", "Fe"], ["Oksijen", "O"], ["Sodyum", "Na"],
        ]),
        pack("Bilim", "“{subject}” tanımı hangi gezegeni anlatır?", "{answer}, {subject} özelliğiyle bilinir.", [
            ["Güneş'e en yakın gezegen", "Merkür"], ["Güneş Sistemi'nin en büyük gezegeni", "Jüpiter"], ["Belirgin halkalarıyla tanınan gezegen", "Satürn"], ["Kızıl Gezegen olarak bilinen gezegen", "Mars"],
        ]),
        pack("Bilim", "{subject} organının temel görevlerinden biri hangisidir?", "{subject}, vücutta “{answer}” görevini yerine getirir.", [
            ["Kalp", "Kanı vücuda pompalamak"], ["Akciğer", "Oksijen ve karbondioksit alışverişi"], ["Böbrek", "Kandaki atıkları süzmek"], ["Karaciğer", "Safra üretmek ve maddeleri işlemek"],
        ]),
        pack("Bilim", "Fizikte {subject} için kullanılan SI birimi hangisidir?", "{subject} büyüklüğünün SI birimi {answer} olarak adlandırılır.", [
            ["kuvvet", "Newton"], ["enerji", "Joule"], ["güç", "Watt"], ["basınç", "Pascal"],
        ]),

        pack("Teknoloji", "{subject} internet protokolünün temel görevi hangisidir?", "{subject}, “{answer}” amacıyla kullanılır.", [
            ["HTTP", "Web sayfalarını aktarmak"], ["SMTP", "E-posta göndermek"], ["DNS", "Alan adını IP adresine çevirmek"], ["FTP", "Dosya aktarmak"],
        ]),
        pack("Teknoloji", "{subject} uzantılı bir dosya genellikle ne içerir?", "{subject} uzantısı çoğunlukla {answer} için kullanılır.", [
            [".png", "Kayıpsız sıkıştırılmış görsel"], [".mp3", "Sıkıştırılmış ses"], [".pdf", "Taşınabilir belge"], [".zip", "Sıkıştırılmış arşiv"],
        ]),
        pack("Teknoloji", "{subject} bileşeninin temel görevi hangisidir?", "{subject}, bilgisayarda “{answer}” görevini üstlenir.", [
            ["CPU", "Komutları işlemek"], ["RAM", "Geçici çalışma verisini tutmak"], ["SSD", "Veriyi kalıcı saklamak"], ["GPU", "Grafik işlemlerini hızlandırmak"],
        ]),
        pack("Teknoloji", "{subject} kavramı en doğru nasıl açıklanır?", "{subject}, “{answer}” anlamına gelir.", [
            ["Şifreleme", "Veriyi anahtar olmadan okunamaz hale getirme"], ["Yedekleme", "Verinin güvenli bir kopyasını oluşturma"], ["İki aşamalı doğrulama", "İkinci bir kimlik kontrolü kullanma"], ["Açık kaynak", "Kaynak kodunu incelenebilir biçimde yayımlama"],
        ]),

        pack("Sinema", "{subject} karakteri hangi filmde yer alır?", "{subject}, {answer} filmindeki karakterlerden biridir.", [
            ["Woody", "Oyuncak Hikayesi"], ["Neo", "Matrix"], ["Amelie Poulain", "Amelie"], ["Simba", "Aslan Kral"],
        ]),
        pack("Sinema", "{subject} filminin yönetmeni kimdir?", "{subject} filmini {answer} yönetmiştir.", [
            ["Başlangıç", "Christopher Nolan"], ["Ruhların Kaçışı", "Hayao Miyazaki"], ["Parazit", "Bong Joon-ho"], ["Büyük Budapeşte Oteli", "Wes Anderson"],
        ]),
        pack("Sinema", "“{subject}” tanımı hangi sinema türüne aittir?", "{answer} türü, {subject} özelliğiyle ayırt edilir.", [
            ["Gerçek kişi ve olayları araştırmacı biçimde aktarma", "Belgesel"], ["Çizim veya modelleri hareket yanılsamasıyla canlandırma", "Animasyon"], ["Öyküyü şarkı ve danslarla ilerletme", "Müzikal"], ["Bilimsel olasılıklar ve gelecek üzerinden kurgu oluşturma", "Bilim kurgu"],
        ]),
        pack("Sinema", "{subject} terimi film yapımında neyi ifade eder?", "{subject}, “{answer}” anlamında kullanılır.", [
            ["Senaryo", "Sahne, diyalog ve olay örgüsü metni"], ["Sinematografi", "Görüntü ve ışık anlatımının tasarımı"], ["Montaj", "Çekimlerin anlamlı bir sırada birleştirilmesi"], ["Film müziği", "Sahneleri destekleyen özgün ses ve besteler"],
        ]),

        pack("Müzik", "{subject} hangi çalgı ailesindedir?", "{subject}, {answer} ailesinde sınıflandırılır.", [
            ["Keman", "Yaylı çalgılar"], ["Flüt", "Üflemeli çalgılar"], ["Davul", "Vurmalı çalgılar"], ["Piyano", "Tuşlu çalgılar"],
        ]),
        pack("Müzik", "Müzikte {subject} terimi ne anlama gelir?", "{subject}, “{answer}” anlamına gelen bir müzik terimidir.", [
            ["tempo", "Eserin çalınma hızı"], ["forte", "Güçlü ve yüksek sesle"], ["piano", "Hafif ve yumuşak sesle"], ["crescendo", "Sesin giderek güçlenmesi"],
        ]),
        pack("Müzik", "{subject} adlı eserin bestecisi kimdir?", "{subject}, {answer} tarafından bestelenmiştir.", [
            ["Dört Mevsim", "Antonio Vivaldi"], ["Sihirli Flüt", "Wolfgang Amadeus Mozart"], ["Dokuzuncu Senfoni", "Ludwig van Beethoven"], ["Kuğu Gölü", "Pyotr İlyiç Çaykovski"],
        ]),
        pack("Müzik", "{subject} türünü ayırt eden özellik hangisidir?", "{subject}, “{answer}” özelliğiyle güçlü biçimde ilişkilidir.", [
            ["Caz", "Doğaçlamaya geniş yer vermesi"], ["Blues", "On iki ölçülük kalıbın sık kullanılması"], ["Reggae", "Vurgunun çoğunlukla ara vuruşlarda olması"], ["Flamenko", "Gitar, el çırpma ve dans birlikteliği"],
        ]),

        pack("Spor", "{subject} takımında sahada aynı anda kaç oyuncu bulunur?", "Standart bir {subject} takımında sahada aynı anda {answer} oyuncu yer alır.", [
            ["Futbol", "11"], ["Basketbol", "5"], ["Voleybol", "6"], ["Hentbol", "7"],
        ]),
        pack("Spor", "“{subject}” açıklaması hangi spor terimini anlatır?", "{answer}, {subject} anlamında kullanılan bir spor terimidir.", [
            ["Teniste servis karşılanmadan alınan sayı", "Ace"], ["Golfte bir çukuru par sayısından bir eksik vuruşla bitirme", "Birdie"], ["Basketbolda yayın gerisinden kazanılan sayı", "Üçlük"], ["Futbolda ceza alanındaki ihlale verilen vuruş", "Penaltı"],
        ]),
        pack("Spor", "{subject} hangi sporda kullanılan bir ekipmandır?", "{subject}, {answer} sporunda kullanılır.", [
            ["Tüytop", "Badminton"], ["Pak", "Buz hokeyi"], ["Flöre", "Eskrim"], ["Kulplu beygir", "Jimnastik"],
        ]),
        pack("Spor", "{subject} için doğru açıklama hangisidir?", "{subject}, “{answer}” biçiminde tanımlanır.", [
            ["Maraton", "42,195 kilometrelik koşu"], ["Dekatlon", "On atletizm yarışından oluşan mücadele"], ["Triatlon", "Yüzme, bisiklet ve koşu birleşimi"], ["Modern pentatlon", "Beş farklı disiplinden oluşan yarışma"],
        ]),

        pack("Sanat ve Edebiyat", "{subject} adlı eserin yazarı kimdir?", "{subject}, {answer} tarafından yazılmıştır.", [
            ["İnce Memed", "Yaşar Kemal"], ["Saatleri Ayarlama Enstitüsü", "Ahmet Hamdi Tanpınar"], ["Kürk Mantolu Madonna", "Sabahattin Ali"], ["Sinekli Bakkal", "Halide Edib Adıvar"],
        ]),
        pack("Sanat ve Edebiyat", "{subject} adlı dünya klasiğinin yazarı kimdir?", "{subject}, {answer} tarafından kaleme alınmıştır.", [
            ["1984", "George Orwell"], ["Küçük Prens", "Antoine de Saint-Exupery"], ["Don Kişot", "Miguel de Cervantes"], ["Suç ve Ceza", "Fyodor Dostoyevski"],
        ]),
        pack("Sanat ve Edebiyat", "{subject} tablosunun ressamı kimdir?", "{subject}, {answer} imzalı bir eserdir.", [
            ["Yıldızlı Gece", "Vincent van Gogh"], ["Guernica", "Pablo Picasso"], ["Belleğin Azmi", "Salvador Dali"], ["İnci Küpeli Kız", "Johannes Vermeer"],
        ]),
        pack("Sanat ve Edebiyat", "“{subject}” açıklaması hangi sanat akımını anlatır?", "{answer} akımı, {subject} yaklaşımıyla tanınır.", [
            ["Işık ve anlık izlenimleri görünür fırça darbeleriyle aktarma", "İzlenimcilik"], ["Nesneleri geometrik biçimler ve çoklu bakışlarla gösterme", "Kübizm"], ["Düşler ve bilinçaltından beslenen gerçeküstü imgeler kurma", "Sürrealizm"], ["Antik kültür, insan ve oran düşüncesini yeniden öne çıkarma", "Rönesans"],
        ]),

        pack("Doğa", "{subject} hangi hayvan sınıfında yer alır?", "{subject}, {answer} sınıfına ait bir canlıdır.", [
            ["Balina", "Memeliler"], ["Penguen", "Kuşlar"], ["Kurbağa", "İki yaşamlılar"], ["Deniz kaplumbağası", "Sürüngenler"],
        ]),
        pack("Doğa", "{subject} ağacının veya bitkisinin ürünü hangisidir?", "{subject}, {answer} verir.", [
            ["Meşe", "Palamut"], ["Çam", "Kozalak"], ["Zeytin ağacı", "Zeytin"], ["Fındık ocağı", "Fındık"],
        ]),
        pack("Doğa", "Ekosistemde {subject} için en uygun rol hangisidir?", "{subject}, ekosistemde çoğunlukla {answer} rolünü üstlenir.", [
            ["Yeşil bitkiler", "Üretici"], ["Mantarlar", "Ayrıştırıcı"], ["Arılar", "Tozlaştırıcı"], ["Otçul hayvanlar", "Birincil tüketici"],
        ]),
        pack("Doğa", "{subject} olgusunun temel açıklaması hangisidir?", "{subject}, “{answer}” sonucunda veya biçiminde ortaya çıkar.", [
            ["Kutup ışıkları", "Yüklü parçacıkların atmosferle etkileşmesi"], ["Mercan beyazlaması", "Isı stresiyle alg ortaklığının bozulması"], ["Mevsimsel göç", "Canlıların dönemsel olarak yer değiştirmesi"], ["Kış uykusu", "Metabolizmanın uzun süre yavaşlatılması"],
        ]),

        pack("Günlük Yaşam", "{subject} pişirme yöntemi nasıl uygulanır?", "{subject}, “{answer}” yöntemiyle yapılır.", [
            ["Haşlama", "Yiyeceği sıcak sıvıda pişirme"], ["Buharda pişirme", "Yiyeceği su buharıyla pişirme"], ["Izgara", "Yiyeceği doğrudan kuru ısıyla pişirme"], ["Fırınlama", "Yiyeceği kapalı sıcak hava ortamında pişirme"],
        ]),
        pack("Günlük Yaşam", "{subject} dönüşümünün sonucu hangisidir?", "{subject} eşitliği {answer} sonucunu verir.", [
            ["1 kilometre", "1.000 metre"], ["1 saat", "60 dakika"], ["1 litre", "1.000 mililitre"], ["1 kilogram", "1.000 gram"],
        ]),
        pack("Günlük Yaşam", "{subject} özelliğine en uygun malzeme hangisidir?", "{answer}, {subject} özelliğine günlük yaşamdan iyi bir örnektir.", [
            ["Elektriği iyi iletme", "Bakır"], ["Elektriği yalıtma", "Kauçuk"], ["Işığı büyük ölçüde geçirme", "Cam"], ["Yüksek mekanik dayanım", "Çelik"],
        ]),
        pack("Günlük Yaşam", "{subject} uygulamasının temel yararı hangisidir?", "{subject}, “{answer}” amacıyla uygulanır.", [
            ["Yiyeceği buzdolabında saklamak", "Mikroorganizma çoğalmasını yavaşlatmak"], ["Elleri sabunla yıkamak", "Kir ve mikroorganizmaları uzaklaştırmak"], ["Çiğ ve pişmiş gıdayı ayırmak", "Çapraz bulaşmayı azaltmak"], ["Düzenli yedek almak", "Veri kaybına karşı kopya bulundurmak"],
        ]),

        pack("Matematik", "{subject} işleminin sonucu kaçtır?", "{subject} işleminin sonucu {answer} olur.", [
            ["18 + 24", "42"], ["72 - 29", "43"], ["7 x 8", "56"], ["144 / 12", "12"],
        ]),
        pack("Matematik", "{subject} kaçtır?", "{subject} işlemi {answer} sonucunu verir.", [
            ["200'ün yüzde 10'u", "20"], ["120'nin yüzde 25'i", "30"], ["300'ün yüzde 15'i", "45"], ["240'ın yüzde 25'i", "60"],
        ]),
        pack("Matematik", "{subject} şeklinin alanı kaç birimkaredir?", "{subject} için alan {answer} birimkaredir.", [
            ["Bir kenarı 5 olan karenin", "25"], ["Kenarları 6 ve 4 olan dikdörtgenin", "24"], ["Tabanı 8, yüksekliği 5 olan üçgenin", "20"], ["Pi 3 alınarak yarıçapı 2 olan dairenin", "12"],
        ]),
        pack("Matematik", "{subject} dizisinde sıradaki sayı hangisidir?", "{subject} dizisinin kuralına göre sıradaki sayı {answer} olur.", [
            ["2, 4, 8, 16", "32"], ["1, 4, 9, 16", "25"], ["3, 6, 12, 24", "48"], ["1, 1, 2, 3, 5", "8"],
        ]),

        pack("Mantık", "“{subject}” sözcüğüyle en doğrudan ilişkili eylem hangisidir?", "{subject} ile en doğrudan ilişkili eylem {answer} eylemidir.", [
            ["Kitap", "Okumak"], ["Anahtar", "Açmak"], ["Pusula", "Yön bulmak"], ["Makas", "Kesmek"],
        ]),
        pack("Mantık", "{subject} ise sonuç hangi gün olur?", "Günler sırayla sayıldığında sonuç {answer} olur.", [
            ["Pazartesiden üç gün sonrası", "Perşembe"], ["Cumadan iki gün sonrası", "Pazar"], ["Çarşambadan iki gün öncesi", "Pazartesi"], ["Cumartesiden dört gün sonrası", "Çarşamba"],
        ]),
        pack("Mantık", "{subject} grubunda diğerlerinden farklı olan hangisidir?", "{answer}, verilen grupta diğerleriyle aynı sınıfta değildir.", [
            ["Elma, armut, muz, havuç", "Havuç"], ["Kare, üçgen, daire, kırmızı", "Kırmızı"], ["Pazartesi, salı, ocak, çarşamba", "Ocak"], ["Metre, litre, kilogram, sandalye", "Sandalye"],
        ]),
        pack("Mantık", "{subject} Buna göre doğru sonuç hangisidir?", "Verilen sıralamaya göre doğru sonuç: {answer}.", [
            ["Ali, Buse'den; Buse de Cem'den uzundur.", "En uzun Ali'dir"], ["Deniz, Ece'den; Fırat da Deniz'den yaşlıdır.", "En yaşlı Fırat'tır"], ["Kalem defterden; silgi de kalemden ucuzdur.", "En ucuz silgidir"], ["Mavi kutu kırmızıdan; yeşil kutu da maviden ağırdır.", "En ağır yeşil kutudur"],
        ]),
    ];

    const questions = [];

    packs.forEach((currentPack, packIndex) => {
        const difficultyPattern = PACK_DIFFICULTIES[packIndex % PACK_DIFFICULTIES.length];
        const answers = currentPack.entries.map((entry) => entry[1]);

        currentPack.entries.forEach(([subject, answer], itemIndex) => {
            const questionIndex = questions.length;
            const correctIndex = questionIndex % 4;
            const distractors = answers.filter((_, answerIndex) => answerIndex !== itemIndex);
            const options = distractors.slice();
            options.splice(correctIndex, 0, answer);
            const difficulty = difficultyPattern[itemIndex];

            questions.push(Object.freeze({
                id: `milyoner-${String(questionIndex + 1).padStart(3, "0")}`,
                text: fillTemplate(currentPack.question, subject, answer),
                options: Object.freeze(options),
                correctIndex,
                category: currentPack.category,
                difficulty,
                difficultyLabel: DIFFICULTY_LABELS[difficulty],
                explanation: fillTemplate(currentPack.explanation, subject, answer),
            }));
        });
    });

    return Object.freeze(questions);

    function pack(category, question, explanation, entries) {
        return Object.freeze({ category, question, explanation, entries: Object.freeze(entries) });
    }

    function fillTemplate(template, subject, answer) {
        return template.replaceAll("{subject}", subject).replaceAll("{answer}", answer);
    }
});
