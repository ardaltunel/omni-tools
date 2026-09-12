# Slot oyunu test raporu — 12 Eylül 2026

## Kapsam ve sonuç
Oyun motoru, bakiye kaydı, animasyon sırasında işlem kilidi, bonus satın alma, otomatik dönüş yaşam döngüsü, ses kaynakları ve dar ekran yerleşimi incelendi. Aşağıdaki hatalar düzeltildi; bu rapor tüm cihazlarda hatasızlık garantisi değildir.

## Düzeltilen sorunlar
- Dönüş başında yalnızca bahis düşümünün kaydedilmesi yenilemede sonucu kaybettiriyordu. Hesaplanan sonuç animasyondan önce kalıcı duruma yazılıyor; hesaplama başarısızsa önceki durum geri yükleniyor.
- Büyük kazanç ve bonus açılışında motor kilidi erken kalkıyordu. Sunum tamamlanıncaya kadar yeni dönüş, bahis ve bonus işlemleri kilitli.
- Hatalı ücretsiz dönüşün otomatik yeniden denenmesi engellendi; kullanıcı yeniden başlatabilir.
- Başka araca veya gizli sekmeye geçildiğinde otomatik seri duruyor. Ücretsiz dönüşler araca dönüldüğünde devam ediyor; görünürlük olayları ve zamanlayıcı korumaları kod üzerinden incelendi.
- Sessize alırken ses bağlamını askıya almak eski efektleri sonradan devam ettirebiliyordu. Etkin kaynaklar durduruluyor ve tamamlanan kaynaklar bağlantılarını bırakıyor.
- Küçük ekranlarda bakiye kesilmesi, ücretsiz dönüş etiketinin kısalması ve küçük kontrol hedefleri düzeltildi. 400 piksel altında HUD iki sütun; bahis/otomatik/bonus düğmeleri en az 44 piksel yüksekliğinde.
- Boşluk kısayolu metin alanlarında ve değiştirici tuşlarla tetiklenmiyor.

## Çalıştırılan kontroller
`node --test tools/slot-game/engine.test.js tools/slot-game/audit.test.js`

Mevcut motor testleri geçti: 6×5 ızgara, 8+ eşleşme, zincirleme düşüş, scatter ödülleri, çarpan, ücretsiz dönüş, bonus bedeli, bahis sınırları ve bakiye yenileme.

Ek sabit tohumlu test: 2.000 dönüş, 208 ücretsiz dönüş, 1.517 zincirleme adım. Her dönüşte bakiye denklemi, ücretsiz dönüş sayısı, 30 benzersiz hücre, çift başlatma/ödeme engeli ve önceden kaydedilen sonuç ile normal sonuç eşitliği doğrulandı. Bu örneklem bir RTP sertifikasyonu değildir.

Tarayıcıda gerçek HTML/CSS/JS kullanan, kullanıcı kaydına dokunmayan yerel test sayfası kullanıldı:
- Zorlanmış 5.000 kazanç: animasyon sırasında kayıt 14.900, yeni dönüş düğmesi kilitli.
- Zorlanmış hesaplama hatası: bakiye 10.000 olarak geri geldi, düğme yeniden kullanılabilir.
- 5.000 sanal krediyle bonus: pencere kapandı, 10 ücretsiz dönüş kaydedildi, açılışta dönüş kilitli.
- 320, 375 ve 768 piksel görünüm kontrolleri. 320 pikselde bakiye kesilmesi düzeltme sonrasında giderildi; 320 ve 768 piksel DOM ölçümlerinde yatay taşma ve kırık görsel yok.
- Konsolda görülen tek hata testin bilerek ürettiği hesaplama hatasıydı.

## Sınırlar ve tekrar çalıştırma
Gerçek iOS/Android dokunmatik donanımı, Safari, kulaklıkla ses niteliği ve performans profili bu oturumda ölçülmedi. Ses yaşam döngüsü kod düzeyinde incelendi. Çok sekmeli ortak bakiye eşzamanlaması bu değişikliklerin kapsamına alınmadı.

Test sayfasını üretmek için `node tools/slot-game/create-audit-fixture.cjs`; ardından yerel sunucuda `/.slot-audit.html?case=big` veya `?case=error` açılır. Test sayfası yalnızca geçici bellek kaydı kullanır. Üretilen HTML test sonrasında silindi.

## Ek mobil inceleme
320×740, 390×844 ve 740×360 tarayıcı görünümleri incelendi. Dar ekranda ses sürgüsü sürekli erişilebilir hale getirildi; grid başlık düzeninin dokunmatik flex kuralını etkisiz bırakması düzeltildi. Ses seviyesi 70 → 65 değişimi DOM ve kayıtta doğrulandı. Bonus penceresi ekran içinde sabitlendi, dinamik ekran yüksekliği ve iç kaydırma eklendi. Yatay ekranda pencere üstü 13,5 ve altı 346,5 piksel olarak ölçüldü (360 piksel ekran); Vazgeç çalıştı. Otomatik dönüş menüsünün beş seçeneği 44 piksel yüksekliğinde doğrulandı. Telefonlarda HUD iki sütuna genişletildi; tablet/dokunmatik kontrol yükseklikleri en az 44 piksel yapıldı. Bunlar tarayıcı boyutlandırma ve UI kontrolleridir, fiziksel dokunmatik cihaz emülasyonu değildir.
