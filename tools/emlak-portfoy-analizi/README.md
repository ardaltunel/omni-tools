# Emlak Portföy Analizi

Konut, işyeri ve arazi için fiyat/alan karşılaştırmasını, kullanıcı verilerine
dayalı tahmini değerlemeyi, kira getirisini ve işlem maliyetlerini hesaplar.
İlanın fiyat ve özelliklerini kopyalayıp yapıştırarak başlayın veya temel
bilgileri elle girin. Hesaplama ve metin ayrıştırma tarayıcıda çalışır.

## Hızlı kullanım

1. İlanın fiyatını ve özelliklerini birlikte kopyalayıp metin alanına yapıştırın.
   “Bu mülkü analiz et” seçiliyken metinden bilgileri doldurun.
2. Aktarılan bilgileri kontrol edin. Konut için net veya brüt alan, arazi için
   toplam alan kullanılabilir. İlan fiyatı karşılaştırma ve maliyet hesaplarını
   sağlar; eksik özellikler tahmin edilmez.
3. Değerleme için bir dayanak ekleyin: benzer mülklerin m² fiyatı, emsal ilanlar
   veya beklenen kira ile hedef getiri oranı.
4. Başka bir ilanı emsal olarak eklemek için “Emsal olarak ekle”yi seçip o ilanın
   fiyat ve alan bilgilerini yapıştırın. Emsalleri elle de düzenleyebilirsiniz.
5. Tahmini tutarı, değer aralığını ve hesaplamanın dayanağını sonuçta inceleyin.
   Kira ve ayrıntılı maliyet bilgileri ek analiz sağlar.

Fiyat ve alan bilgilerini metne birlikte dahil edin. Örneğin:

```text
Satılık daire · İstanbul / Kadıköy
Fiyat: 6.500.000 TL
m² (Brüt): 110
m² (Net): 85
Oda Sayısı: 2+1
Bina Yaşı: 5
```

## Değerleme dayanakları

- **Referans m² fiyatı:** kullanıcının girdiği birim fiyat ile seçilen alanın
  çarpımıdır. Net alan fiyatıyla brüt alan fiyatını birbirine karıştırmayın.
- **Emsal ilanlar:** aynı tür ve alan esasındaki geçerli emsallerin m²
  fiyatlarından karşılaştırma değeri hesaplanır. Aynı bölgeden, benzer özellikte
  ve yakın tarihli ilanlar seçin; ilan fiyatı gerçekleşmiş satış bedeli değildir.
- **Kira / hedef getiri:** yıllık kira tutarının kullanıcının belirlediği brüt
  hedef getiri oranına bölünmesiyle hesaplanan yatırım senaryosudur. Arazi için
  bu yöntem kullanılmaz.

Araç canlı bir bölgesel fiyat veritabanına bağlı değildir. Konum, bina yaşı veya
imar bilgisi girilmesi otomatik piyasa verisi ya da fiyat primi üretmez.
Satıcının istediği fiyat tek başına bağımsız değerleme dayanağı değildir.
Sonuç aralığı girilen verilerin sınırlılığını gösterir; istatistiksel güven
aralığı veya ekspertiz raporu olarak yorumlanmamalıdır.

Metin ayrıştırma ve hesaplamalar dış servis gerektirmez. Girilen ilan metni bu
hesaplamalar için bir sunucuya gönderilmez. Eksik veri varsa ilgili sonuç boş
kalır veya tamamlanması gereken dayanak açıklanır.

## Yerel önizleme

Proje kökündeki `emlak-analizini-baslat.cmd` dosyasını çalıştırın veya:

```powershell
node scripts/serve.cjs
```

Ardından `http://127.0.0.1:8765/emlak-portfoy-analizi` adresini açın. Yerel
önizleme için Node.js gerekir; paket kurulumu gerekmez. Sunucuyu Ctrl+C ile
kapatabilirsiniz. Bu adım yalnızca geliştirici önizlemesi içindir; uygulamanın
metin aktarımı ve hesaplamaları sayfanın içinde çalışır.

## Dosyalar ve doğrulama

- `config.js`: varsayılan form değerleri ve hesaplama ayarları.
- `core.js`: getiri ve işlem maliyeti hesapları.
- `valuation.js`: kullanıcı verilerine dayalı emsal ve kira senaryosu hesabı.
- `listing.js`: ilan metninden özellik çıkarımı.
- `app.js`, `style.css`, kök `index.html`: arayüz ve etkileşimler.

Proje kökünden:

```powershell
node --test tools/emlak-portfoy-analizi/core.test.js tools/emlak-portfoy-analizi/valuation.test.js tools/emlak-portfoy-analizi/listing.test.js tools/emlak-portfoy-analizi/app.test.js scripts/serve.test.cjs
node scripts/generate-catalog.cjs --check
```

Testler metinden bilgi çıkarımını, değerleme dayanaklarını, form akışını ve yerel
önizleme sunucusunu doğrular. Sonuçların doğruluğu kullanıcının girdiği fiyat,
alan ve emsal bilgilerinin doğruluğuna bağlıdır.
