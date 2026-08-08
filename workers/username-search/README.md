# Kullanıcı Adı Araştırma Worker

Bu Cloudflare Worker, Omni Tools'un statik GitHub Pages arayüzü için izinli platformlara sunucu tarafı kullanıcı adı kontrolü yapar. Genel amaçlı proxy değildir: hedef URL'ler merkezi bir beyaz listede tanımlıdır ve istemci keyfi bir URL gönderemez.

## Kurulum ve yayınlama

Gerekenler: ücretsiz bir Cloudflare hesabı ve Node.js. Ayrı bir masaüstü sunucu programı gerekmez.

```powershell
cd workers/username-search
npm install
npx wrangler login
npm test
npm run deploy
```

Wrangler'ın verdiği `https://...workers.dev` adresini `tools/username-search/config.js` içindeki `apiBaseUrl` alanına yazın. Ardından GitHub Pages dosyalarını normal biçimde yayınlayın.

Cloudflare panelinden Git entegrasyonu kullanılacaksa proje kökü `workers/username-search`, deploy komutu `npm run deploy` olarak seçilebilir. Özel alan adı kullanılıyorsa alan adının origin değerini `wrangler.jsonc` içindeki `ALLOWED_ORIGINS` listesine ekleyin.

## Güvenlik ve gizlilik

- Yalnızca `GET /api/check?platform=<id>&username=<ad>` ve `GET /api/health` uç noktaları vardır.
- Platform kimlikleri ve dış hedefler beyaz listededir; SSRF için keyfi hedef kabul edilmez.
- Kullanıcı adı biçimi ve platforma özgü biçim Worker'da yeniden doğrulanır.
- İstekler 10 saniyede zaman aşımına uğrar ve yanıt gövdesi en fazla 768 KiB okunur.
- Worker veritabanı, KV, Analytics Engine veya kalıcı log yazmaz.
- CAPTCHA, giriş duvarı veya rate limit aşılmaz; bu durumlar kesin olmayan sonuç/hata olarak döner.

