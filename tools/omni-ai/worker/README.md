# Omni AI Worker

Omni AI sohbet isteklerini OpenAI Responses API'ye güvenli biçimde ileten Cloudflare Worker'dır. API anahtarı frontend dosyalarına veya Wrangler yapılandırmasına yazılmaz.

## Kurulum

```powershell
npm install
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Model `OPENAI_CHAT_MODEL`, çıktı sınırı `OPENAI_MAX_OUTPUT_TOKENS` ve izinli kaynaklar `ALLOWED_ORIGINS` değişkenleriyle yönetilir. Dağıtım adresi değişirse `../config.js` içindeki `endpoint` alanını güncelleyin.

## Geliştirme

```powershell
npm run dev
npm test
```

Yerel secret için `.dev.vars` kullanılabilir; bu dosya Git'e eklenmemelidir.
