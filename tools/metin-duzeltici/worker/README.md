# Metin Düzeltici Worker

GitHub Pages üzerindeki Metin Düzeltici, Cloudflare Workers AI binding'i üzerinden `@cf/meta/llama-3.3-70b-instruct-fp8-fast` modelini kullanır. Ayrı bir yapay zekâ API anahtarı veya ücretli sağlayıcıya geçiş yoktur. Tarayıcı yalnızca Worker adresini bilir.

## Ücretsiz kullanım

Cloudflare hesabındaki **Workers Free planını** kullanın. Workers AI, hesap genelinde günde **10.000 Neuron** ücretsiz kullanım sağlar; bu miktar sabit sayıda istek değildir ve metnin uzunluğuna göre tüketilir. Kota her gün **00.00 UTC / Türkiye saatiyle 03.00**'te yenilenir. Free planda kota bitince istekler durur; otomatik ücretli geçiş yapılmaz. Workers Paid planındaki ücretsiz kotayı aşan kullanım ise ücretlendirilir.

Varsayılan Llama modeli ücretsiz kotayla ve JSON Mode ile uyumludur. `AI_TEXT_MODEL` değiştirilirse yeni modelin ücretsiz planda kullanılabildiğini ve JSON Mode desteklediğini ayrıca kontrol edin. Model değiştirmek, hesap genelindeki günlük kotayı yenilemez.

## Kurulum

```powershell
npm install
npx wrangler login
npm run deploy
```

Cloudflare oturumunu açmak yeterlidir; `secret put` veya başka bir sağlayıcı hesabı gerekmez. `wrangler.jsonc` içindeki `ai.binding` alanı model erişimini `AI` adıyla bağlar. Önceki dağıtımdan kalan bir sağlayıcı anahtarı kullanıma alınmaz.

Dağıtımdan sonra oluşan Worker adresini `../config.js` içindeki `endpoint` alanına yazın. Mevcut Worker adı korunduğu için aynı Cloudflare hesabına yapılan güncellemede adres değişmez. Model ve sınırlar `AI_TEXT_MODEL`, `AI_TIMEOUT_MS` ve `AI_MAX_OUTPUT_TOKENS` değişkenlerinden yönetilir.

Yerel geliştirme için `npm run dev` kullanın. Workers AI çıkarımı Cloudflare hesabında çalışır ve aynı günlük kotayı tüketir.

## Hatalar ve doğrulama

Worker yalnızca izinli origin'lerden gelen `/api/text/correct` POST isteklerini kabul eder. GitHub Pages, yerel geliştirme sunucusu ve `file:///` kullanımı desteklenir; gövde boyutu ve 10.000 karakter sınırı uygulanır. Cloudflare rate-limit binding'i IP başına dakikada sekiz istek uygular.

JSON şemalı model çıktısı ayrıca sunucuda doğrulanır. Geçici kapasite hatasında en fazla bir kısa yeniden deneme yapılır. Günlük kota, belirsiz ağ hatası, zaman aşımı ve istemci iptali otomatik yeniden denenmez. İstek için tek bir toplam süre sınırı vardır; model iptal sinyalini işleyemese bile yanıt zaman aşımında serbest bırakılır.

- `AI_QUOTA_EXCEEDED`: Günlük ücretsiz kota doldu (`3036`); saat 03.00'teki yenilenmeyi bekleyin.
- `AI_RATE_LIMIT`: Geçici kapasite/istek sınırı (`3040`); biraz sonra tekrar deneyin.
- `AI_TIMEOUT`: İstek süresi doldu; metni koruyup yeniden deneyebilirsiniz.
- `AI_NOT_CONFIGURED`: AI binding'i veya hesap/model erişimi kontrol edilmeli.
- `AI_UPSTREAM` / `INVALID_AI_OUTPUT`: Sağlayıcıya ulaşılamadı veya sonuç doğrulanamadı.

`GET /api/health`, sağlayıcı/model adını ve binding işlevlerinin mevcut olup olmadığını bildirir. Bu kontrol çıkarım yapmaz ve kalan kotayı ölçmez.

```powershell
npm test
npx wrangler deploy --dry-run
```

Resmî kaynaklar: [Workers AI fiyatlandırması ve ücretsiz kota](https://developers.cloudflare.com/workers-ai/platform/pricing/), [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), [AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [sağlayıcı hata kodları](https://developers.cloudflare.com/workers-ai/platform/errors/).
