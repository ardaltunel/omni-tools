# Ambient Display

Omni Tools içinde, ikinci monitör için tam pencere dijital duvar kâğıdı. Uygulama kartından veya `?tool=ambient-display` bağlantısından açılır; mevcut yönlendirme sistemi adresi `/ambient-display` olarak düzenler. GitHub Pages doğrudan bağlantıları mevcut `404.html` üzerinden karşılar.

## Kullanım

İlk açılışta Aurora Flow görünümü ve cihazın yerel saati gösterilir. Sağ alttaki küçük kontrol ayarları açar; yanındaki düğme tarayıcı tam ekranını açıp kapatır. Dört saniye hareketsizlikten sonra kontroller yumuşakça gizlenir. Fare hareketi, dokunma veya klavye kullanımı kontrolleri geri getirir. Ayarlar açıkken ve klavyeyle kontroller kullanılırken otomatik gizleme durur. Sol üstteki geri düğmesi Omni Tools uygulama listesine döner.

- **Aurora Flow:** Lacivert, mor ve turkuaz tonlarında üç katmanlı ışık akışı; ince, merkezî tipografi. Işık kıvrımları ve yumuşak aydınlık alan fareyi gecikmeli, akıcı biçimde takip eder.
- **Minimal Studio:** Güçlü tipografi, gerçek siyah/OLED, kırık beyaz ve antrasit zeminler; merkez, sol veya sağ kompozisyon.
- **Cyber Desk:** Monospaced saat, hareketli alçak perspektif grid, ışık dalgaları ve fareye tepki veren kontrollü mavi/mor aydınlık alan.

Arka plan hareketi yaklaşık 20–43 saniyelik farklı döngülerle gözle görülür biçimde gelişir. Fare tepkisi yalnızca animasyonlar açıkken Aurora Flow ve Cyber Desk'te çalışır; saat ve kontroller yerinde kalır. Fare ekranı terk ettiğinde, kontroller boşta gizlendiğinde, ayarlar açıldığında veya dokunmatik girişe geçildiğinde ışık yeniden nötr konuma döner. Minimal Studio hareketsiz kalır. WebGL kullanılamıyorsa CSS arka planı hareket etmeyi ve fareye tepki vermeyi sürdürür.

Türkçe/İngilizce, 12/24 saat, saniye/tarih görünürlüğü, saat boyutu/konumu, ışık yoğunluğu ve animasyon ayarları anında uygulanır. Tercihler `omni-ambient-display-v1` anahtarıyla `localStorage` içinde tutulur. Depolama engellenirse uygulama mevcut oturumda çalışır ve ayarlar panelinde bilgi verir. Geçersiz kayıtlar güvenli varsayılanlara döner.

İsteğe bağlı saat kaydırma yaklaşık sekiz dakikalık çok küçük bir hareket kullanır; ekran yanığını önleme garantisi vermez. Sistem azaltılmış hareket tercihi animasyonları ve kaydırmayı durdurur. Desteklenen güvenli tarayıcı bağlamlarında, isteğe bağlı Screen Wake Lock ekranın uyumasını önler. Kilit sekme gizlenince veya uygulamadan çıkılınca bırakılır; tarayıcı desteği ya da izin yoksa açıklama gösterilir. Tarayıcının yerel Escape davranışı tam ekrandan çıkar; ayarlar açıkken Escape ayrıca paneli kapatır.

## Mimari

- `core.js`: Tercih doğrulama, yerel saat/tarih biçimleme ve görünür saat aralığına göre zamanlama. Tarayıcı ve Node tarafından kullanılabilir.
- `app.js`: Mevcut `tool-activated` olayı ve panel etkinliğiyle çalışan arayüz, çeviriler, depolama ve ekran API'leri. Uygulama kendi çevirilerini içerir; açık bir dil seçimi yoksa kök belgenin dilini izler.
- `renderer.js`: Dokular veya harici istekler gerektirmeyen WebGL ışık alanı. Çizim yüzeyi CSS boyutunu ve 1–1,5 ile sınırlandırılan cihaz piksel oranını izler; 3.200 piksel genişlik ve 3,2 milyon toplam piksel bütçesine sığdırılır. Animasyon en fazla 24 FPS çalışır. Desteklenen cihazlarda yüksek hassasiyetli shader, üç oktav ve yumuşak gürültü geçişleri kullanılır; büyütülmüş SVG gren dokusu bulunmaz. Fare hedefi mevcut çizim döngüsünde yaklaşık 240 ms ataletle takip edilir; giriş olayları yeni çizim döngüsü başlatmaz. WebGL kullanılamazsa CSS arka planı korunur.
- `style.css`: Uygulamaya kapsamlandırılmış tam ekran, responsive kompozisyon ve ayar paneli.
- `catalog.css`: Ortak Omni Tools uygulama kartının Ambient Display çeşidi.
- `core.test.js`, `renderer.test.js`: Saat sınırları, geçersiz tercihler, çizim bütçesi, duraklatma ve WebGL bağlamı kurtarma testleri.

Saat dakika hassasiyetindeyken dakikada, saniyeler açıkken saniyede güncellenir. Gizli sekmede ve başka araç etkin olduğunda saat/arka plan döngüleri durur; geri dönünce yerel saat yeniden okunur. Temel çalışma harici API, konum izni veya yeni paket gerektirmez. Var olan site fontları yüklenemezse sistem fontları kullanılır.

## Doğrulama

Proje kökü statik HTML/CSS/JavaScript'tir. Kökte `package.json`, build veya lint komutu bulunmaz. Mevcut araçlarla aynı Node test yaklaşımı kullanılır:

```powershell
node --test tools/ambient-display/core.test.js tools/ambient-display/renderer.test.js
node --check tools/ambient-display/core.js
node --check tools/ambient-display/app.js
node --check tools/ambient-display/renderer.js
node --check index.js
```

Tarayıcı kontrolü için proje kökünü statik HTTP sunucusuyla açın; doğrudan `/ambient-display` yenilemeleri için sunucuda `index.html` geri dönüşü etkin olmalıdır. Masaüstü 16:9 ve 21:9, tablet, telefon ve yatay telefon görünümünü; en büyük saat boyutu ile saniye/12 saat kombinasyonunu; yeniden yüklemede tercihleri; boşta kontrolleri; azaltılmış hareketi; sekme/araç geçişlerini; desteklenmeyen ve reddedilen ekran API'lerini kontrol edin. Tam ekran düğmelerini ve Escape ile çıkışı doğrulayın. Uygulama, tarayıcının yerel Escape davranışını engellemeden `exitFullscreen()` çağrısıyla çıkışı ayrıca tamamlar.

Geliştirme doğrulamasında 17 Ambient Display Node testi ve 22 komşu araç regresyon testi geçti. Kurulu Edge üzerinde Playwright ile 32 temel tarayıcı kontrolü, 7 API/çizim yaşam döngüsü kontrolü ve 320/390 pikselde 18 yerleşim kontrolü tamamlandı. Tam ekran ve Escape, tercihler, engellenen depolama, az hareket, Wake Lock yarış durumları, gerçek WebGL bağlamı kaybı/kurtarma ve WebGL'siz arka plan kontrol edildi. Görsel kontrol 1920×1080, 2560×1080, 1280×800, 820×1180, 390×844, 320×568 ve 844×390 boyutlarını kapsadı. Uygulama JavaScript hatası görülmedi; bağlam kapatılırken mevcut QR kod aracının CDN isteği iptal edilebildi.

Hareket ve fare etkileşimi güncellemesinde 18 ek tarayıcı kontrolü geçti. Gerçek WebGL pikselleri üç saniye arayla karşılaştırılarak hareket; zaman uniformu sabitlenip fare iki yana taşınarak ışık tepkisi doğrulandı. 100 fare olayı tek arayüz animasyon karesinde birleştirildi. Animasyon kapalıyken ve azaltılmış hareket tercihinde yeni çizim/fare işi oluşmadığı, görünürlük geçişinde bekleyen karenin iptal edildiği, ayarlar/Studio/dokunma korumaları, WebGL'siz CSS hareketi, tam ekran kontrolleri ve mobil yerleşim kontrol edildi. JavaScript hatası görülmedi.

Görüntü netliği güncellemesi 1920×1080, 3840×2160, 3440×1440 ve 1,5 cihaz piksel oranıyla 390×844 üzerinde ayrıca doğrulandı. Çizim yüzeyleri sırasıyla 2086×1173, 2385×1341, 2764×1157 ve 635×1375 oldu; her biri genişlik/piksel bütçesine uydu. Yüzde 100 görüntü kesitleri incelendi; gren katmanı kaldırıldı, shader tüm boyutlarda derlendi ve uygulama hatası görülmedi. Hareket, fare tepkisi ve azaltılmış harekette çizimin durması korundu. Kurulu NVIDIA/Edge ortamında masaüstü ölçümü yaklaşık 20 FPS verdi; gerçek hız donanıma ve tarayıcıya bağlıdır.
