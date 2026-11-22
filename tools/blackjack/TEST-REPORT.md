# Blackjack kontrol raporu — 23 Kasım 2026

Denetim tarihi: **2026-11-23**. Kapsam: kart çizimi, dağıtım ve ödeme animasyonları, çip sürükleme, ses, beş oyuncu yeri, kayıt/geri yükleme ve mevcut ortak cüzdanla tutarlılık.

Bu yenilemede Blackjack motoru ve ortak cüzdan dosyaları değiştirilmedi. S17 kuralı, doğal Blackjack için 3:2 kazanç, sigorta, bölme ve ikiye katlama hesapları korundu; sonuçlara müdahale eden bir ağırlıklandırma eklenmedi. Rapor yerel doğrulamayı kapsar; GitHub Pages yayınının tamamlandığını bildirmez.

## Otomatik doğrulama

Komut: `node --test tools/blackjack/*.test.js`

| Kapsam | Sonuç |
| --- | ---: |
| Blackjack altındaki tüm testler | **54/54** |
| Uygulama ve ortak cüzdan entegrasyonu | 24/24 |
| Kart çizimi | 4/4 |
| Hareket/animasyon modülü | 6/6 |
| Ses modülü | 7/7 |
| Motor, denetim ve beş yer test grupları | 13/13 |
| Depodaki JavaScript test paketi | **623/623** |

Yeni kart, hareket ve ses modülleri toplam 17 test içerir.

Mevcut 5.000 turluk deterministik motor denemesi geçti: 548 bölme, 1.263 ikiye katlama ve 373 sigorta kararı. Durum geçişlerinde JSON kaydetme/geri yükleme, bahis–ödeme–bakiye korunumu ve ikinci kez ödeme yapılmaması doğrulandı.

Bu denetimde ayrıca salt okunur bir beş yer yük denemesi çalıştırıldı: 1.000 tur, 5.000 başlangıç yeri, 5.463 sonuçlanan el, 463 bölme, 1.776 ikiye katlama, 69 sigorta kararı ve 12.151 geri yükleme kontrol noktası. Düşük karıştırma eşiğine sahip tek desteli test, tur içinde deste tükenmesini de zorladı. Her kontrol noktasında eldeki/destedeki kart kimlikleri benzersiz kaldı; para korunumu ve tek ödeme kontrolü geçti. Bu ek deneme kalıcı test sayısına dahil değildir.

## Motor ve para kuralları

- Krupiye varsayılan olarak soft veya hard 17'de durur. Motorun isteğe bağlı soft 17'de kart çekme davranışı da mevcut testlerde korunur.
- Doğal Blackjack'in toplam iadesi bahsin 2,5 katıdır; net kazanç 3:2'dir. Bölünmüş eldeki 21 doğal Blackjack sayılmaz. Doğal olmayan 21, krupiyenin doğal Blackjack'ine kaybeder.
- Sigorta, başlangıç bahislerinin yarısı üzerinden hesaplanır ve kazanırsa sigorta dahil 3 kat iade edilir. Beş yer için tek sigorta kararı uygulanır. Anında net kazanç oluşsa bile sigorta maliyeti için açılış bakiyesi gerekir.
- Bölme ek bahsi tahsil eder; aynı yerde en fazla iki el oluşur. Bölünmüş aslara birer kart verilip eller durdurulur. Uygun iki kartlı bölünmüş elde ikiye katlama yapılabilir; ikiye katlanan ele tek kart verilir.
- Beş yer aynı krupiyeyi paylaşır; doğal Blackjack olan eller oyuncu sırasından atlanır. İlk dağıtım için kart yetmezse önceden karıştırılır; tur içinde tükenirse yeni kart kimlikleriyle devam edilir.
- Motor değerleri yarım kredi birimindedir; desteklenen bakiye hassasiyeti çeyrek kredidir. Ortak cüzdandaki kalan kuruşlar kaybolmaz ve ekranda tam bakiye gösterilir.

## Uygulama ve animasyon kontrolleri

- Her kart/hamle durumu ve finansal değişiklik, animasyondan önce ortak cüzdanın revizyon kontrollü kaydına yazılır. İki sekmedeki eşzamanlı dağıtım veya sonuçlandırma tek tahsilat/ödeme üretir; eski sekme kanonik kaydı benimser.
- İlk dağıtım kart kart beklenir. Bekleyen kartın toplamı ve hamle sonucu, kart masaya gelmeden gösterilmez.
- Kapalı krupiye kartı için gerçek yüz, renk veya kart kimliği DOM'a yazılmaz. Kart arkasını üretirken özel kart alanlarının okunmadığı test edilir. Animasyon kopyalarının SVG kimlikleri yeniden adlandırılır; kapalı ön yüz boş tutulur.
- Animasyon iptali, reddi, hedef kartın DOM'dan kaybolması veya yerel animasyon oluşturma hatası kayıtlı hamleyi kilitlemez. Görsel işlem, yeni bir oyun hamlesi veya ek ücret üretmeden tamamlanabilir.
- Gizlenme, araç değişimi ve yeniden boyutlandırma eski sunumu geçersiz kılar. Dönüşte kayıtlı kartlar üzerinden devam edilir. Başka oyundaki salt bakiye değişikliği aktif kart uçuşlarını bozmaz.
- Başka oyun harcaması karşılanamayan başlangıç bahislerini temizlediğinde masa çipleri ve bahis toplamları da yenilenir.
- Ses tercihi değiştirilirken kartlar yeniden dağıtılmaz. Normal/hızlı animasyon tercihi korunur. Azaltılmış harekette uçuşlar atlanır; sonuç ve ödeme aynı kalır.
- Görsel çipler 150, 35 ve sigortadaki 5 kredi gibi tutarları doğru kupürlerle gösterir. Bölünmüş yerdeki çipler son elin ödeme uçuşundan sonra temizlenir; tamamlanmış tur geri yüklenince yeniden belirmez.
- Sesler kısa kart/çip efektlerinden oluşur; ses sayısı, tekrar sıklığı ve örnek seviyeleri sınırlıdır. Ortam sesi varsayılan olarak kapalıdır; gizli veya etkin olmayan araçta durur.

## Tarayıcıda doğrulanan senaryolar

Edge üzerinde 13 yasal fixture senaryosunun tamamı kontrol edildi. Fixture'lar kart/evre alanlarını elle uydurmak yerine gerçek motor hamleleriyle oluşturulur; her biri geri yüklenebilir ve altı destenin 312 benzersiz kartını korur. Kayıtlar bellektedir; gerçek oyuncu localStorage kaydı kullanılmaz.

Turların başlangıç bakiyesi 10.000 kredidir. Hazır elde açılan örneklerde ilk bahis önceden motor tarafından düşülmüştür.

| Senaryo / hamle | Doğrulanan sonuç |
| --- | --- |
| Boş masa | Bahis seçimi ve yeni dağıtım hazır |
| Normal dağıtım | Kartlar sırayla iner; dağıtım sırasında hamleler kilitlidir |
| Doğal Blackjack | Son bakiye **10.150** |
| Beraberlik, Dur | Son bakiye **10.000** |
| Oyuncu Bust, Kart Çek | Son bakiye **9.900** |
| Krupiye Bust, Dur | Son bakiye **10.100** |
| Böl ve iki elde de İkiye Katla | Son bakiye **10.400** |
| Sigorta, krupiye Blackjack | Son bakiye **10.000** |
| Sigorta kaybı, ardından Dur | Son bakiye **9.850** |
| Beş yer, her oynanabilir elde Dur | Kayıp / Blackjack / beraberlik / kayıp / kazanç; son bakiye **10.050**, masada kalan çip yok |
| Yedi kartlı el | Çok kartlı elin görüntülenmesi ve kaydırılması |
| Çok kartlı iki bölünmüş el | Kayıp + beraberlik; son bakiye **9.900** |
| Boş ortak cüzdan | Bakiye **0** kalır; otomatik kredi yüklenmez |

Fixture ve tam uygulama girişinde ayrıca şunlar doğrulandı:

- Fareyle 100 kredilik çip 3. yere sürüklendi.
- CDP dokunma girdisiyle 50 kredilik çip 3. yere tam bir kez eklendi; hayalet çip başlangıçta parmak/imleç tutuş noktasını korudu.
- Çip tepsisindeki 65 px yatay dokunma kaydırması ek bahis oluşturmadı.
- Yeniden yükleme aynı **Sinek 2 / Maça Vale** elini ve **9.900** ortak bakiyeyi korudu; kapalı krupiye kartının ön yüzü boş kaldı. Hızlı animasyon, sessiz mod ve **%30** ses seviyesi geri geldi.
- Edge dokunma emülasyonunda Kart Çek ile **Kupa Vale** geldi; BUST ve krupiye açılışı doğru gösterildi. Son bakiye **9.900** kaldı; masada sonuçlanmamış çip veya hata kaydı yoktu.
- Dağıtım sırasında Blackjack → Slot → Blackjack geçişinde Slot ve dönen Blackjack **9.900** gösterdi; dağıtım ek tahsilat olmadan devam etti.
- Azaltılmış harekette doğal Blackjack, uçuş oluşturmadan doğru sonuçlandı.
- Denetlenen senaryolarda tarayıcı hata ve uyarı kayıtları boştu.

## Dar ekran ve dokunma hedefleri

| İstenen boyut | Ölçülen kullanılabilir belge alanı | Yatay sayfa taşması |
| --- | --- | ---: |
| 390 px genişlik | 375 px genişlik | 0 px |
| 320 px genişlik | 305 px genişlik | 0 px |
| 768 px genişlik | 753 px genişlik | 0 px |
| 844 × 390 px yatay | 829 × 390 px | 0 px |

Dokunmatik oyun denetimlerinde en az 44 px hedef yüksekliği ve görünür, 44 px yüksekliğinde ses seviyesi denetimi doğrulandı. Çok kartlı/bölünmüş eller ve beş yer düzeni kontrol edildi.

Bu boyutlar Edge üzerinde daraltılmış/emüle edilmiş belge alanlarıdır. CDP dokunma girdisi kullanılması fiziksel telefonda test yapıldığı anlamına gelmez. Fiziksel iOS/Android, diğer tarayıcılar, hoparlörden duyulan sesin öznel kalitesi veya ölçülmüş 60 FPS/işleme süresi bu raporun doğrulanmış kapsamına dahil değildir.

## Tekrar çalıştırma

1. `node --test tools/blackjack/*.test.js`
2. `node tools/blackjack/create-audit-fixture.cjs`
3. Oluşan **geçici** `bj-premium-qa.html` dosyasını yalıtılmış yerel sunucuda açın. Senaryoyu sayfadaki QA düğmeleriyle seçin. Üretim paneli, güncel stil bağlantıları ve ortak cüzdan/kart/hareket/ses/uygulama betikleri `index.html` içinden alınır; HTML veya betik bağlantıları değiştiğinde fixture'ı yeniden üretin.
4. Tam uygulamayı ayrı bir yerel origin üzerinde `/?tool=blackjack` ile açarak kayıt ve araç geçişini ayrıca kontrol edin.
5. Üretilen `bj-premium-qa.html` dosyasını yayımlamadan önce kaldırın; QA sayfasını dağıtıma eklemeyin.
