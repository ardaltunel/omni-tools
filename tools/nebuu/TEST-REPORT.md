# Nebuu telefon düzeltmeleri — 12 Eylül 2026

Bulunan ve düzeltilen sorunlar:
- Null beta/gamma değerleri sıfır kabul edilerek yanlış kalibrasyon oluşturuyordu.
- Geri sayım ve cevap animasyonu sırasında işlenmeyen sensör hareketleri algılayıcıyı kilitleyebiliyordu. Bu evrelerde kalibrasyon/nötre dönüş işleniyor, yeni cevap üretilmiyor.
- Ekranın diğer yatay yönüne geçişte eski açı referansı kullanılıyordu. Açı değişince kalibrasyon yenileniyor.
- 180/-180 sınırındaki sabit örnekler normal medyanla kararsız sayılıyordu. Açısal fark üzerinden medyan kullanılıyor.
- Sensör olay zamanı ve manuel kontrol zamanı artık aynı performance.now saatini kullanıyor.
- Cevap animasyonunda dikey/yatay geçişi eski kelimeyi kısa süre yeniden açabiliyordu. Bekleyen cevap tamamlanarak sonraki kelimeye geçiliyor.
- Arka planda geri sayımın devam etmesi durduruldu; dönüşte yön kontrolüyle devam ediliyor.
- Kısa yatay ekranlarda büyük kelimeler ve hazırlık alanı kontrolleri sıkıştırıyordu. Yüksekliğe uyumlu yazı, kaydırılabilir hazırlık ve erişilebilir alt düğmeler uygulandı.
- Yeniden sensör ayarı ve yön uyarısından menüye dönüş kontrolleri eklendi.

Doğrulama:
- node --test tools/nebuu/core.test.js: mevcut testler ve beş yeni regresyon testi geçti.
- Gerçek uygulama kodunu kullanan izole tarayıcı testinde sentetik DeviceOrientation olaylarıyla doğru → nötr → pas → dikey/yatay → nötr → doğru dizisi doğrulandı. Doğru sayısı 1 → 2; pas ayrı kelimede kaydedildi.
- 375×812 dikey ekrandan 812×375 yataya başlangıç ve oyun sırasında 667×320 yataya dönüşte oyun devam etti.
- 667×320 görünümde PAS/DOĞRU düğmeleri y=271–315 aralığında, yeniden ayarlama düğmesi y=184–228 aralığında; yatay taşma yok.

Sınır: Sentetik sensör ve tarayıcı viewport testleri fiziksel telefon/gerçek Safari sensör testi değildir. Cihaza özgü hareket yönü, izin ve donanım davranışları gerçek telefonda ayrıca doğrulanmalıdır.
