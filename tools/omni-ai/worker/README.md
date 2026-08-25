# Omni AI Worker

Omni AI sohbet isteklerini öncelikle OpenAI Responses API'ye güvenli biçimde ileten Cloudflare Worker'dır. OpenAI projesinin kredi veya kota sorunu olduğunda Workers AI binding'i otomatik olarak devreye girer. API anahtarı frontend dosyalarına veya Wrangler yapılandırmasına yazılmaz.

## Kurulum

```powershell
npm install
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Birincil model `OPENAI_CHAT_MODEL`, yedek model `WORKERS_AI_MODEL`, çıktı sınırı `OPENAI_MAX_OUTPUT_TOKENS` ve izinli kaynaklar `ALLOWED_ORIGINS` değişkenleriyle yönetilir. Dağıtım adresi değişirse `../config.js` içindeki `endpoint` alanını güncelleyin.

## Geliştirme

```powershell
npm run dev
npm test
```

Yerel secret için `.dev.vars` kullanılabilir; bu dosya Git'e eklenmemelidir.
