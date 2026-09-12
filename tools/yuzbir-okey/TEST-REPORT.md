
## Takip çalışması
- Derleme ve 43 test geçti.
- Geri toplama anlık kaydı ve kalan süre oyun kaydına eklendi; süre geri sayım sırasında da kaydediliyor.
- Açık çiftte okey değişimi tıklama/sürükleme yollarında yeni çift eklemeden önce değerlendiriliyor.
- Tıklanan seri ucuna göre okey işleme, ikinci taşın taken kaydının temizlenmesi ve kurallar metni düzeltildi.
- 390x844 ve 844x390 ekran boyutları tarayıcıda incelendi; geçici boyutlar geri alındı. Dikeyde masa dönüyor ve gömülü sayfa kaydırma gerektiriyor. Küçük ekranlarda masa kontrolleri hâlâ küçük; bu bir kullanılabilirlik sınırlaması. Taş/deste/sol alma alanlarına touch-action:none eklendi, dokunmatik ayar satırları en az 44px yapıldı.
- Gerçek telefon veya gerçek dokunmatik olay gönderen test aracı kullanılmadı. Fiziksel dokunmatik sürükleme testi tamamlandı denemez; PointerEvent kod yolu ve iptal temizliği incelendi.

### Tekrarlanabilir istatistik
Komut: npx tsx tests/statistics.ts. Sabit tohum: 817261.
1000 başlangıç dağıtımında açılabilir el: oyuncu %26, bot koltukları %20, %17,1, %18,7. Oyuncu 22, diğerleri 21 taş aldığı için başlangıç kıyası eşit taş sayılı değildir.
200 tam oyunda açılma: oyuncu modeli %77, botlar %77,5, %69,5, %69. Herkesin açılması 47/200 (%23,5). Ortalama 22,415 hamle. Her hamlede 106 benzersiz taş kontrolü geçti; oyunlar kilitlenmedi.
Oyuncu modeli, aynı bot motorunu kullanan ve açılışı geciktirmeyen bir vekildir; gerçek insan performansı değildir. Oyunlar katlamasız tek el modundadır. Katlamalı mod veya tüm stratejiler için genelleme yapılmamalı. 200 oyunda oranların belirsizliği yaklaşık ±6 puan düzeyindedir. Veriler botlara dağıtım avantajı iddiasını desteklemiyor, insan-bot eşitliği kanıtı da değildir.
