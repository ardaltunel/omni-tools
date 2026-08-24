# Metin Düzeltici Worker

GitHub Pages üzerindeki Metin Düzeltici ile OpenAI Responses API arasında güvenli ara katmandır. API anahtarı frontend’e gönderilmez.

## Kurulum

```powershell
npm install
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Dağıtımdan sonra oluşan Worker adresini `../config.js` içindeki `endpoint` alanına yazın. Model, `wrangler.jsonc` içindeki `OPENAI_TEXT_MODEL` değişkeninden değiştirilebilir.

Yerel geliştirmede anahtarı yalnızca `.dev.vars` dosyasına `OPENAI_API_KEY=...` biçiminde ekleyin. Bu dosya Git tarafından takip edilmez.

Worker yalnızca izinli origin’lerden gelen `/api/text/correct` POST isteklerini kabul eder. GitHub Pages, yerel geliştirme sunucusu ve `file:///` kullanımı desteklenir; istek boyutu ve metin uzunluğu sınırlandırılır. Cloudflare rate-limit binding’i dakikada sekiz istek uygular.
