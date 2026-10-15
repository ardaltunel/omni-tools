# Ambiyans Ekranı

Omni Tools içinde, ikinci monitör için dijital duvar kâğıdı. Uygulama kartından, `/ambiyans-ekrani` veya `?tool=ambient-display` bağlantısından açılır. Eski `/ambient-display` bağlantıları da çalışır. GitHub Pages doğrudan bağlantıları mevcut `404.html` üzerinden karşılar.

## Kullanım

İlk açılışta diğer araçlarla aynı sayfa düzeni, masaüstünde sol uygulama menüsü, başlık ve Aurora Flow önizlemesi gösterilir. Başlıktaki **Tam ekran** düğmesi yalnızca ambiyans görünümünü tarayıcı tam ekranına alır; kendiliğinden tam ekrana geçilmez. Escape veya görünümün sağ altındaki tam ekran düğmesi normal sayfa düzenine döndürür. Desteklenmeyen veya reddedilen tam ekran isteği sayfa düzenini değiştirmez.

Sağ alttaki küçük kontrol ayarları açar. Görünümün içindeki kontroller dört saniye hareketsizlikten sonra yumuşakça gizlenir; sayfa başlığındaki Tam ekran düğmesi görünür kalır. Fare hareketi, dokunma veya klavye kullanımı kontrolleri geri getirir. Ayarlar açıkken ve klavyeyle kontroller kullanılırken otomatik gizleme durur. Tam ekran görünümündeki sol üst geri düğmesi Omni Tools uygulama listesine döner. Mobilde proje genelindeki üst menü düzeni kullanılır.

- **Aurora Flow:** Lacivert, mor ve turkuaz tonlarında üç katmanlı ışık akışı; ince, merkezî tipografi. Işık kıvrımları ve yumuşak aydınlık alan fareyi gecikmeli, akıcı biçimde takip eder.
- **Minimal Studio:** Güçlü tipografi, gerçek siyah/OLED, kırık beyaz ve antrasit zeminler; merkez, sol veya sağ kompozisyon.
- **Cyber Desk:** Monospaced saat, alçak perspektif grid, ışık dalgaları ve fareye tepki veren kontrollü mavi/mor aydınlık alan. Grid ve yörünge hareketi yüksek kalite modunda açılır.

Arka plan hareketi yaklaşık 20–43 saniyelik farklı döngülerle gelişir. Fare tepkisi yalnızca animasyonlar açıkken, dengeli/yüksek kalite modlarında Aurora Flow ve Cyber Desk'te çalışır; saat ve kontroller yerinde kalır. Fare ekranı terk ettiğinde, kontroller boşta gizlendiğinde, ayarlar açıldığında veya dokunmatik girişe geçildiğinde ışık yeniden nötr konuma döner. Minimal Studio hareketsiz kalır. WebGL kullanılamıyorsa CSS arka planı korunur; yüksek kalite modunda CSS fare tepkisi de devam eder.

Ayarlar içindeki **Performans** seçimi üç çalışma düzeyi sunar:

- **Düşük güç:** Sabit CSS arka planı; WebGL bağlamı başlatılmaz, çizim döngüsü ve fare efektleri kapalıdır. Diğer modlardan geçilince shader kaynakları bırakılır ve çizim yüzeyi 1×1 piksele küçültülür. Saat ve diğer ayarlar çalışmaya devam eder.
- **Dengeli (varsayılan):** En fazla 1,2 milyon piksel, 2048 piksel genişlik, 1× cihaz piksel oranı ve 18 FPS. Daha hafif shader ile akıcı ışıklar ve fare tepkisi; ek tam ekran parallax, halo, panel blur'u ve Cyber CSS animasyonları kapalıdır.
- **Yüksek kalite:** En fazla 3,2 milyon piksel, 3200 piksel genişlik, 1,5× cihaz piksel oranı ve 24 FPS. Ayrıntılı ışık, parallax, halo ve Cyber hareketleri açık; kaynak tüketimi daha yüksektir.

Performans tercihi de saklanır. Önceki sürümlerden kalan kayıtlarda yeni alan bulunmuyorsa diğer tercihler korunarak dengeli mod seçilir. Düşük güçte isteğe bağlı saat kaydırma ayrıca kullanılabilir; bu ayar arka plan çizimini başlatmaz.

Türkçe/İngilizce, 12/24 saat, saniye/tarih görünürlüğü, saat boyutu/konumu, ışık yoğunluğu ve animasyon ayarları anında uygulanır. Tercihler `omni-ambient-display-v1` anahtarıyla `localStorage` içinde tutulur. Depolama engellenirse uygulama mevcut oturumda çalışır ve ayarlar panelinde bilgi verir. Geçersiz kayıtlar güvenli varsayılanlara döner.

İsteğe bağlı saat kaydırma yaklaşık sekiz dakikalık çok küçük bir hareket kullanır; ekran yanığını önleme garantisi vermez. Sistem azaltılmış hareket tercihi animasyonları ve kaydırmayı durdurur. Desteklenen güvenli tarayıcı bağlamlarında, isteğe bağlı Screen Wake Lock ekranın uyumasını önler. Kilit sekme gizlenince veya uygulamadan çıkılınca bırakılır; tarayıcı desteği ya da izin yoksa açıklama gösterilir. Tarayıcının yerel Escape davranışı tam ekrandan çıkar; ayarlar açıkken Escape ayrıca paneli kapatır.

## Mimari

- `core.js`: Tercih doğrulama, yerel saat/tarih biçimleme ve görünür saat aralığına göre zamanlama. Tarayıcı ve Node tarafından kullanılabilir.
- `app.js`: Mevcut `tool-activated` olayı ve panel etkinliğiyle çalışan arayüz, çeviriler, depolama ve ekran API'leri. Uygulama kendi çevirilerini içerir; açık bir dil seçimi yoksa kök belgenin dilini izler.
- `renderer.js`: Dokular veya harici istekler gerektirmeyen, performans profiline göre sınırlanan WebGL ışık alanı. Bağlam yalnızca görünür, etkin ve çizim gerektiren bir görünümde başlatılır. Desteklenen cihazlarda yüksek hassasiyetli shader ve yumuşak gürültü geçişleri kullanılır; büyütülmüş SVG gren dokusu bulunmaz. Dengeli mod iki oktavlı geniş ışık kıvrımları, yüksek kalite modu üç oktavlı ayrıntılı sis ve ışık huzmeleri kullanır. Fare hedefi mevcut çizim döngüsünde yaklaşık 240 ms ataletle takip edilir; giriş olayları yeni çizim döngüsü başlatmaz. WebGL kullanılamazsa CSS arka planı korunur.
- `style.css`: Uygulamaya kapsamlandırılmış sayfa içi görünüm, isteğe bağlı tam ekran ve ayar paneli. Belirli yüksekliği olan stage bir CSS boyut container'ıdır; saat, ışık alanı ve responsive kurallar `cqw`/`cqh` ile gerçek görünüm boyutlarına uyar. Tam ekrana geçişte aynı kompozisyon ekran boyutuna ölçeklenir.
- `catalog.css`: Ortak Omni Tools uygulama kartının Ambiyans Ekranı çeşidi.
- `core.test.js`, `renderer.test.js`: Saat sınırları, geçersiz tercihler, çizim bütçesi, duraklatma ve WebGL bağlamı kurtarma testleri.

Saat dakika hassasiyetindeyken dakikada, saniyeler açıkken saniyede güncellenir. Gizli sekmede, başka araç etkin olduğunda ve sayfa içindeki görünüm tamamen ekran dışında kaldığında saat/arka plan döngüleri durur; geri dönünce yerel saat yeniden okunur. Ekran dışı görünümün duraklaması IntersectionObserver ile izlenir. Başlıktaki Tam ekran düğmesi görünüm ekran dışında olsa da çalışır. Geciken tam ekran istekleri, araçtan ayrılıp geri dönülmüş olsa bile önceki etkinlik oturumundan kaldıysa kabul edilmez. Temel çalışma harici API, konum izni veya yeni paket gerektirmez. Var olan site fontları yüklenemezse sistem fontları kullanılır.

## Doğrulama

Proje kökü statik HTML/CSS/JavaScript'tir. Kökte `package.json`, build veya lint komutu bulunmaz. Mevcut araçlarla aynı Node test yaklaşımı kullanılır:

```powershell
node --test tools/ambient-display/core.test.js tools/ambient-display/renderer.test.js
node --check tools/ambient-display/core.js
node --check tools/ambient-display/app.js
node --check tools/ambient-display/renderer.js
node --check index.js
```

Tarayıcı kontrolü için proje kökünü statik HTTP sunucusuyla açın; doğrudan `/ambiyans-ekrani` ve `/ambient-display` yenilemeleri için sunucuda `index.html` geri dönüşü etkin olmalıdır. Masaüstü 16:9 ve 21:9, tablet, telefon ve yatay telefon görünümünü; en büyük saat boyutu ile saniye/12 saat kombinasyonunu; yeniden yüklemede tercihleri; boşta kontrolleri; azaltılmış hareketi; sekme/araç geçişlerini; desteklenmeyen ve reddedilen ekran API'lerini kontrol edin. Her performans modunda yüzey boyutunu ve çizim sayısını; düşük güçte, gizli sekmede ve başka araçtayken arka plan işinin durduğunu doğrulayın. Tam ekran düğmelerini ve Escape ile çıkışı doğrulayın. Uygulama, tarayıcının yerel Escape davranışını engellemeden `exitFullscreen()` çağrısıyla çıkışı ayrıca tamamlar.

Performans güncellemesinde 23 Ambiyans Ekranı Node testi ve katalog/yönlendirme/komşu araçlarla birlikte toplam 80 test geçti. JavaScript sözdizimi, üretilen katalog güncelliği ve diff boşluk kontrolü de geçti. Kökte build/lint komutu olmadığı için bunlara ait bir başarı sonucu üretilmedi.

Kurulu Edge üzerinde Playwright ile 9 gruplandırılmış tarayıcı kontrolü geçti; JavaScript hatası görülmedi. Düşük güçte sıfır WebGL bağlamı, sıfır çizim ve sıfır arka plan CSS animasyonu ölçüldü. 1920×1080 görünümde dengeli mod 1460×821 yüzeyde yaklaşık 16,3 çizim/saniye, yüksek kalite modu 2086×1173 yüzeyde yaklaşık 21,7 çizim/saniye üretti. Bunlar bu cihazdaki çizim ölçümleridir; CPU/GPU kullanım yüzdesi değildir. 4K ve mobilde piksel bütçeleri, eski tercihlerin aktarılması, yeniden yüklemede tercihlerin saklanması, kalite geçişlerinde kaynakların bırakılması, fare tepkisi, kapalı animasyon/gizli sekme/başka araç/azaltılmış hareket duraklamaları, Türkçe/İngilizce metinler ve eski/yeni adresler doğrulandı. Masaüstü Aurora ve Cyber görünümleri görsel olarak incelendi.

Sayfa içi görünüm güncellemesinde 39 ilgili Node testi ve 26 tarayıcı kontrol grubu geçti; JavaScript hatası görülmedi. Sol menü, doğrudan/eski adresler, tam ekrana giriş ve düğme/Escape ile aynı yerleşime dönüş, araçlar arası geçiş ve geri gezinme kontrol edildi. Yedi ekran boyutunda üç tasarım ve üç hizalama ile 63 en büyük saat/saniye/12 saat kombinasyonu alana sığdı. Gerçek kaydırmada saat, WebGL ve CSS animasyonlarının durup geri geldiği; Wake Lock'ın bırakılıp yeniden alındığı; görünüm ekran dışındayken başlık düğmesinin tam ekranı açabildiği doğrulandı. Geciken başarılı/reddedilen tam ekran isteklerinin başka araca geçişten veya ayrılıp geri dönüşten sonra görünümü ya da ayar odağını değiştirmediği de kontrol edildi.
