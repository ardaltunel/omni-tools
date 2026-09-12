# Blackjack kontrol raporu — 12 Eylül 2026

## Ek mobil kontrol

320×740, 360×800, 390×844, 430×932, 667×375 ve 844×390 boyutları denetlendi. Sayfa yatay taşması görülmedi. Dokunmatik CSS kuralları fixture'da `&touch` parametresiyle ayrıca etkinleştirildi; bu, gerçek parmak hareketi veya mobil işletim sistemi emülasyonu değildir.

Bu turda düzeltildi:

- Kart alanının yatay kaydırması her render'da sıfırlanıyordu. Ses değişiminden önce/sonra 40 px konumun korunduğu doğrulandı. Yeni çekilen kart için animasyon sonrası sıranın sonu gösterilir.
- Mobil çipler sıkışıyordu. Çipler 44×44 px; çip sırası yatay kaydırılabilir. Dokunmatik hamle, dağıtım, metin ve sigorta düğmeleri en az 44 px yüksekliğinde.
- Dokunmatik ses seviyesi artık hover gerektirmeyen sürekli görünür bir çubuktur. Masaüstü hover davranışı korunur.
- Küçük ekranda bölünmüş ellerin durum yazıları gizleniyordu; artık görünür.
- 320 px ekranda çok kartlı el ile çip alanı neredeyse bitişikti. Düzeltme sonrası kart kutusu ile çip alanı arasında yaklaşık 14 px boşluk ölçüldü (390 px ekranda 21 px).

Mobil boyutta Böl → İkiye Katla → ikinci elde Dur akışı çalıştırıldı; bahis toplamı 100 → 200 → 300 ve aktif el geçişi doğrulandı. Test sayfası hata kaydı boş. 5.000 el regresyon testi tekrar geçti. Fiziksel telefon, iOS Safari, gerçek dokunma/kaydırma ve mobil ses çıkışı için donanım doğrulaması hâlâ yapılmadı.

## Düzeltilen bulgular

- **Bahis toplamı:** Bölme, ikiye katlama ve sigorta sonrası bakiye doğru azalırken üst sayaç, masa çipleri ve bahis açıklaması ilk bahsi gösteriyordu. Üç gösterge artık ellerdeki toplam bahis ve sigortayı birlikte gösteriyor. Son bahsi tekrarlama hâlâ ilk bahsi kullanır.
- **Doğal Blackjack üstünlüğü:** `resolveHand`, doğal olmayan 21'i krupiyenin iki kartlık Blackjack'iyle berabere sayabiliyordu. Artık kayıp olarak hesaplanır. Normal akıştaki erken Blackjack kontrolü bu durumu çoğunlukla önlüyordu; çözümleyici de artık doğru sonuç verir.
- **Sonuç aşaması:** RESOLVING sırasında “Bahisler açık” başlığı yerine “El hesaplanıyor” gösteriliyor.
- **Tablet yerleşimi:** Eski responsive kurallar kontrol alanını relative konuma, masa alanını grid düzenine geçiriyordu. Kontroller tekrar masanın altına sabitlendi; el alanındaki eski minimum yükseklik kaldırıldı.
- **Çok kartlı eller:** Dar ekranda kartlar ikinci satıra geçerek çiplerin üzerine taşıyordu. Her el gerektiğinde bağımsız yatay kaydırılabilir; klavyeyle odaklanabilir. Dağıtım animasyonu kaydırma kutusunda kırpılmaz.
- **Bozuk istatistik kaydı:** Kaydedilmiş `stats: null` oyunun açılışında hata oluşturabiliyordu. Boş istatistiklere dönülüyor.
- **Az kartlı deste:** Tek desteli düşük karıştırma eşiğinde üç kartla dört kart dağıtmaya çalışılabiliyordu. Dört karttan az kaldığında dağıtımdan önce karıştırılıyor.

## Otomatik doğrulama

Komut: `node --test tools/blackjack/engine.test.js tools/blackjack/audit.test.js`

Altı test grubu geçti. Sabit tohumla 5.000 el: 548 bölme, 1.263 ikiye katlama, 373 sigorta kararı. Her durum geçişinde JSON kaydetme/geri yükleme eşitliği; bahis, ödeme ve bakiye korunumu; sonuçların ikinci kez ödenmemesi doğrulandı.

Mevcut testler ayrıca As hesabı, soft 17, 3:2 ödeme, split Aslar, sigorta kazanma/kaybetme, yetersiz bakiye, tekrar bahis, deste karıştırma ve sanal bakiye yenilemeyi kapsıyor. `node --check tools/blackjack/app.js` geçti.

## Tarayıcı doğrulaması

Oyuncunun localStorage kaydına dokunmayan, bellekte kayıt tutan ayrı test sayfası kullanıldı. Üretim HTML'i ve güncel CSS/JS aynen yüklendi.

- Masaüstü ve 820 px tablet görünümü; 390 ve 320 px mobil genişlik.
- Bölme sonrası bahis 100 → 200; sigorta sonrası 100 → 150.
- Çok kartlı bölünmüş ellerde yatay kaydırma ve kart–çip ayrımı.
- Mobil sigorta kabulü ve normal oyuncu sırasına dönüş.
- Ses çubuğuna Tab ile erişim, ok tuşuyla %100 → %99 ayarı ve odak ayrılınca kapanma.
- Mobil çip ekleme, dağıtım sırasında bahis ve hamle düğmelerinin kilitlenmesi.
- 320 px ekranında yatay sayfa taşması yok; hamle düğmeleri 44 px yüksekliğinde.
- İncelenen test sayfasında tarayıcı hata kaydı yok.

## Sınırlar ve tekrar çalıştırma

Gerçek iOS/Android cihazında dokunmatik jestler, Safari/Firefox ve hoparlörden sesin öznel kalitesi bu çalışmada doğrulanmadı. Boyut testleri masaüstü Chromium görünümündedir. Bu rapor tüm olası ellerin veya tüm cihazların hatasız olduğunu iddia etmez.

`node tools/blackjack/create-audit-fixture.cjs` geçici `.blackjack-audit.html` üretir. Yerel sunucuda `?case=split`, `splitmany`, `many`, `insurance`, `betting` senaryoları açılabilir. Testten sonra oluşturulan HTML dosyasını kaldırın; test sayfasını yayımlamayın.
