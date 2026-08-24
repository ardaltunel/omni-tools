# Prompt Geliştirici Worker

GitHub Pages üzerindeki Prompt Geliştirici arayüzü ile OpenAI Responses API arasında güvenli bir katman sağlar.

## Yerel kullanım

1. `npm install`
2. `.dev.vars` dosyasına `OPENAI_API_KEY` ekleyin.
3. `npm run dev`

## Yayınlama

API anahtarını kaynak koduna veya Wrangler yapılandırmasına yazmayın. Anahtarı etkileşimli olarak `npx wrangler secret put OPENAI_API_KEY` komutuyla tanımlayın ve ardından `npm run deploy` çalıştırın.

Model `OPENAI_PROMPT_MODEL`, izin verilen kaynaklar `ALLOWED_ORIGINS` değişkeniyle yönetilir.
