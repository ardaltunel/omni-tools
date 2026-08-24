# GitHub MD Oluşturucu — OpenAI Ara Katmanı

Bu isteğe bağlı Cloudflare Worker, GitHub Pages üzerinde çalışan arayüz ile OpenAI Responses API arasında güvenli bir ara katman oluşturur. OpenAI anahtarı tarayıcıya veya kaynak koduna gönderilmez. Worker kurulmasa ya da OpenAI kullanılamasa bile GitHub MD Oluşturucu mevcut akıllı şablon sistemiyle çalışmaya devam eder.

Tarayıcıdaki GitHub API kotası dolarsa Worker depoyu sunucu tarafında yeniden analiz eder. README, manifest, dosya yolları ve güvenli kaynak kesitleri yapay zekâya kanıt olarak gönderilir; **Ek Bilgi** alanı boş bırakılabilir.

## Güvenlik

- Bir sohbet, ekran görüntüsü veya herkese açık alanda paylaşılan anahtarı önce OpenAI panelinden iptal edin ve yenisini oluşturun.
- Gerçek anahtarı `config.js`, `wrangler.jsonc`, Git deposu veya GitHub Pages dosyalarına yazmayın.
- Üretimde OpenAI projesi için harcama sınırı ve Cloudflare üzerinde ek hız sınırlama kuralı kullanın. Worker içindeki IP sınırı hızlı bir korumadır; küresel ve kalıcı bir kota değildir.
- Varsayılan CORS listesi yalnızca `https://ardaltunel.github.io` ile yerel geliştirme adreslerine izin verir.

## Kurulum

Worker klasöründe çalıştırın:

```powershell
npm install
npm run secret
```

Komut istediğinde **yeni oluşturduğunuz** OpenAI anahtarını terminaldeki gizli değer alanına yapıştırın. Anahtar Cloudflare secret olarak saklanır ve dosyaya yazılmaz.

İsteğe bağlı olarak GitHub API kotasını yükseltmek için yalnızca herkese açık depoları okuma yetkili bir GitHub token'ını da secret olarak ekleyebilirsiniz:

```powershell
npx wrangler secret put GITHUB_TOKEN
```

Bu token zorunlu değildir; bulunmadığında GitHub'ın anahtarsız API'si ve ham dosya yedeği kullanılır.

Ardından Worker'ı yayımlayın:

```powershell
npm run deploy
```

Yayınlanan adresi `tools/github-md-generator/config.js` içinde tanımlayın:

```js
global.GithubMdConfig = Object.freeze({
    aiEndpoint: "https://WORKER-ADRESINIZ.workers.dev/api/github-md/generate",
    requestTimeoutMs: 45000,
});
```

`OPENAI_MODEL` değeri varsayılan olarak `gpt-5.4-mini` kullanır ve gerekirse `wrangler.jsonc` içinden değiştirilebilir.

## Çalışma sırası

1. Tarayıcıda GitHub depo analizi
2. Gerekirse Worker üzerinden GitHub API veya ham dosya analizi
3. Güvenli OpenAI ara katmanı
4. Tarayıcıda desteklenen yerel yapay zekâ
5. Akıllı Markdown şablonu

Bir sağlayıcı zaman aşımına uğrar, kotaya takılır, geçersiz çıktı üretir veya anahtarı bozulursa sıradaki sağlayıcı otomatik olarak denenir. `file://` ile açılan sayfada da şablon sistemi çalışır; OpenAI ara katmanı güvenlik nedeniyle HTTPS dağıtımı ve yerel HTTP geliştirme adresleri için tasarlanmıştır.

## Test

Proje kökünden:

```powershell
node --test tools/github-md-generator/worker/test/worker.test.js
```
