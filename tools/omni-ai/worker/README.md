# Omni AI Worker

Omni AI sohbeti doğrudan Cloudflare Workers AI binding'i üzerinden `@cf/meta/llama-3.3-70b-instruct-fp8-fast` modeline gönderilir. Önce başka bir sağlayıcıdan yanıt veya hata beklenmez; ayrı API anahtarı gerekmez. Varsayılan model ayrı bir düşünme akışı üretmez; Türkçe yanıtlar için sıcaklık `0.2` olarak ayarlanmıştır.

## Ücretsiz kullanım

Hesapta **Workers Free** planını kullanın. Workers AI ücretsiz kotası hesap genelinde günde **10.000 Neuron**'dur; aynı hesaptaki Metin Düzeltici ve Prompt Geliştirici de bu kotayı paylaşır. Kota her gün **00.00 UTC / Türkiye saatiyle 03.00**'te yenilenir. Free planda kota bitince istekler durur. Workers Paid planına geçilirse ücretsiz kotayı aşan kullanım ücretlendirilir.

## Kurulum ve geliştirme

```powershell
npm install
npx wrangler login
npm run deploy
```

`wrangler.jsonc`, üretim hesabını `account_id` ile sabitler; AI binding'i `AI`, IP başına dakikada on istek uygulayan rate-limit binding'i `CHAT_RATE_LIMITER` adındadır. Tarayıcı yalnızca Worker adresini bilir. Dağıtım adresi değişirse `../config.js` içindeki `endpoint` alanını güncelleyin.

```powershell
npm run dev
npm test
npx wrangler deploy --dry-run
```

Yerel geliştirmedeki AI çıkarımları da Cloudflare hesabının aynı günlük kotasını tüketir. Önceki sağlayıcıya ait secret kullanılmaz; yeni secret tanımlanmaz.

## Model ve süre sınırları

- `AI_CHAT_MODEL`: Varsayılan `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; `max_tokens` kullanır. Yalnızca isteğe bağlı `@cf/zai-org/glm-4.7-flash` modeli de desteklenir; onun için `max_completion_tokens` ve `chat_template_kwargs.enable_thinking: false` kullanılır. Diğer model adları varsayılana döner. İki modelde de sıcaklık `0.2`'dir.
- `AI_MAX_OUTPUT_TOKENS`: Üst token sınırı; varsayılan 3.500. Yanıt uzunluğu seçimine göre kısa için 600, dengeli için 1.800, detaylı için 3.500 token kullanılır. Yapılandırılan üst sınır bunları ayrıca sınırlar.
- `AI_TIMEOUT_MS`: Başlatma ve yanıt akışı için tek toplam süre sınırı; varsayılan/en fazla 60 saniye.
- `ALLOWED_ORIGINS`: İzinli web kaynakları. GitHub Pages, yerel geliştirme ve `file:///` kaynakları desteklenir.

Mesaj, sohbet bağlamı, gövde boyutu ve origin kontrolleri korunur. `GET /api/health` sağlayıcıyı, model adını, düşünme modunu ve binding işlevlerinin bulunup bulunmadığını bildirir; çıkarım yapmaz veya kalan kotayı ölçmez.

## Akış ve hata davranışı

Yanıtlar `response.output_text.delta` olaylarıyla akıtılır. Sağlayıcının açık bitiş işareti alındığında `response.completed` üretilir. Token sınırı veya erken bağlantı sonu `response.incomplete` / `AI_INCOMPLETE` olarak bildirilir; kısmi yanıt başarıyla tamamlanmış gibi sunulmaz.

Geçici kapasite hatasında (`3040`) akış başlamadan önce en fazla bir kısa yeniden deneme yapılır. Günlük kota (`3036`), belirsiz ağ hatası, zaman aşımı ve metin üretimi başladıktan sonraki hatalar tekrar denenmez. İstemci iptali hem model sinyalini hem model akış okuyucusunu kapatır. Sağlayıcı iptal sinyalini yok saysa da toplam süre sınırı isteği serbest bırakır; geç gelen model akışı iptal edilir.

Güvenli hata kodları: `AI_QUOTA_EXCEEDED`, `AI_RATE_LIMIT`, `AI_TIMEOUT`, `AI_NOT_CONFIGURED`, `AI_UPSTREAM`, `AI_INCOMPLETE`, `REQUEST_ABORTED`. Sağlayıcının özel hata metinleri veya kullanıcı mesajları hata yanıtlarına eklenmez.

Resmî kaynaklar: [varsayılan Llama modeli](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), [isteğe bağlı GLM modeli](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/), [fiyatlandırma ve ücretsiz kota](https://developers.cloudflare.com/workers-ai/platform/pricing/), [hata kodları](https://developers.cloudflare.com/workers-ai/platform/errors/).
