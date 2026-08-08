# Username Search Worker

Cloudflare Worker backend for the Omni Tools username-search tool.

## Development

```powershell
npm install
npm test
npx wrangler dev
```

## Optional Last.fm support

Last.fm's official `user.getInfo` endpoint requires an API key. Configure it as
a Worker secret so it is never exposed to the browser or committed to Git:

```powershell
npx wrangler secret put LASTFM_API_KEY
```

If this secret is not configured, Last.fm returns `unknown` with an explanatory
message instead of treating an access block as a missing account.

## Deploy

```powershell
npx wrangler deploy
```
