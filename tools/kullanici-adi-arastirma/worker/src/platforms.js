const platform = (id, usernamePattern, requestUrl, evaluator, options = {}) => Object.freeze({
    id,
    usernamePattern,
    requestUrl,
    evaluator,
    ...options,
});

const unsupported = (id, usernamePattern, reason) => platform(
    id,
    usernamePattern,
    "",
    "unsupported",
    { reason },
);

export const PLATFORMS = Object.freeze([
    platform("github", "^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$", "https://api.github.com/users/{username}", "jsonExact", {
        identityPath: "login", notFoundStatuses: [404],
    }),
    platform("reddit", "^[A-Za-z0-9_-]{3,20}$", "https://oauth.reddit.com/user/{username}/about?raw_json=1", "jsonExact", {
        identityPath: "data.name", notFoundStatuses: [404], requestAdapter: "redditOAuth",
        requiredVariables: ["redditClientId", "redditClientSecret"],
        missingVariableReason: "Reddit kesin profil denetimi için arka plan işleyicisinde REDDIT_CLIENT_ID ve REDDIT_CLIENT_SECRET gizli değişkenlerini gerektiriyor.",
    }),
    unsupported("instagram", "^[A-Za-z0-9._]{1,30}$", "Instagram kişisel profiller için anonim veya uygulama kimlikli rastgele kullanıcı adı sorgusu sunmuyor; web uç noktası tüm arka plan işleyicisi isteklerini reddediyor."),
    platform("tiktok", "^[A-Za-z0-9._]{2,24}$", "https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40{username}", "oembedExact", {
        identityPath: "author_url", expectedUrl: "https://www.tiktok.com/@{username}", missingCodePath: "code", missingCode: 400,
    }),
    platform("youtube", "^[A-Za-z0-9._-]{3,30}$", "https://www.youtube.com/@{username}", "status", { notFoundStatuses: [404] }),
    platform("x", "^[A-Za-z0-9_]{1,15}$", "https://x.com/{username}", "status", { notFoundStatuses: [404] }),
    unsupported("facebook", "^[A-Za-z0-9.]{5,50}$", "Facebook anonim profil isteklerinde hesap varlığına göre değişmeyen bir engel yanıtı döndürüyor."),
    unsupported("linkedin", "^[A-Za-z0-9][A-Za-z0-9-]{2,63}$", "LinkedIn API başka üyeleri özel kullanıcı adıyla anonim aramaya açmıyor; herkese açık profil sayfası arka plan işleyicisi isteklerini HTTP 999 ile engelliyor."),
    platform("twitch", "^[A-Za-z0-9_]{3,25}$", "https://www.twitch.tv/{username}", "message", {
        missingMarkers: ["Twitch is the world&#39;s leading video platform and community for gamers."],
        foundTemplates: ["<meta property=\"al:ios:url\" content=\"twitch.tv/{username}\""],
    }),
    platform("pinterest", "^[A-Za-z0-9_]{3,30}$", "https://www.pinterest.com/oembed.json?url=https%3A%2F%2Fwww.pinterest.com%2F{username}%2F", "status", {
        notFoundStatuses: [400, 404],
    }),
    platform("gitlab", "^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9_])?$", "https://gitlab.com/api/v4/users?username={username}", "jsonArrayExact", { identityPath: "username" }),
    platform("codeberg", "^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$", "https://codeberg.org/api/v1/users/{username}", "jsonExact", { identityPath: "login", notFoundStatuses: [404] }),
    platform("gitea", "^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$", "https://gitea.com/api/v1/users/{username}", "jsonExact", { identityPath: "login", notFoundStatuses: [404] }),
    platform("bitbucket", "^[A-Za-z0-9_-]{1,30}$", "https://api.bitbucket.org/2.0/workspaces/{username}", "jsonExact", {
        identityPath: "slug", notFoundStatuses: [404],
    }),
    platform("dev-community", "^[A-Za-z0-9_-]{1,30}$", "https://dev.to/api/users/by_username?url={username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("hacker-news", "^[A-Za-z0-9_-]{2,15}$", "https://hacker-news.firebaseio.com/v0/user/{username}.json", "nullableJsonExact", { identityPath: "id" }),
    platform("medium", "^[A-Za-z0-9_-]{1,30}$", "https://medium.com/feed/@{username}", "status", { notFoundStatuses: [404] }),
    platform("bluesky", "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$", "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={username}.bsky.social", "bluesky"),
    platform("mastodon", "^[A-Za-z0-9_]{1,30}$", "https://mastodon.social/api/v1/accounts/lookup?acct={username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    unsupported("threads", "^[A-Za-z0-9._]{1,30}$", "Threads anonim profil isteklerini kullanıcıdan bağımsız olarak giriş sayfasına yönlendiriyor."),
    platform("telegram", "^[A-Za-z][A-Za-z0-9_]{4,31}$", "https://t.me/{username}", "message", {
        missingMarkers: ["<title>Telegram Messenger</title>", "If you have <strong>Telegram</strong>, you can contact"],
        foundMarkers: ["tgme_page_title"],
    }),
    platform("soundcloud", "^[A-Za-z0-9_-]{1,50}$", "https://soundcloud.com/oembed?format=json&url=https%3A%2F%2Fsoundcloud.com%2F{username}", "oembedExact", {
        identityPath: "author_url", expectedUrl: "https://soundcloud.com/{username}", notFoundStatuses: [404],
    }),
    unsupported("spotify", "^[A-Za-z0-9._-]{1,64}$", "Spotify rastgele kullanıcı profili endpoint'ini kaldırdı; güncel API yalnızca izin veren mevcut kullanıcının profilini döndürüyor."),
    platform("vimeo", "^[A-Za-z0-9_-]{1,64}$", "https://vimeo.com/{username}", "status", { notFoundStatuses: [404] }),
    platform("steam", "^[A-Za-z0-9_-]{2,32}$", "https://steamcommunity.com/id/{username}/", "message", {
        missingMarkers: ["The specified profile could not be found"], foundMarkers: ["profile_header"],
    }),
    platform("keybase", "^[A-Za-z0-9_]{2,16}$", "https://keybase.io/_/api/1.0/user/lookup.json?username={username}", "keybase"),
    platform("deviantart", "^[A-Za-z][A-Za-z0-9_-]{2,19}$", "https://www.deviantart.com/api/v1/oauth2/user/friends/search?query={username}&access_token={accessToken}", "deviantArtSearch", {
        requestAdapter: "deviantArtOAuth",
        requiredVariables: ["deviantArtClientId", "deviantArtClientSecret"],
        missingVariableReason: "DeviantArt kesin profil denetimi için arka plan işleyicisinde DEVIANTART_CLIENT_ID ve DEVIANTART_CLIENT_SECRET gizli değişkenlerini gerektiriyor.",
    }),
    platform("flickr", "^[A-Za-z0-9@._-]{1,64}$", "https://www.flickr.com/people/{username}", "status", { notFoundStatuses: [404] }),
    platform("tumblr", "^[A-Za-z0-9-]{1,32}$", "https://{username}.tumblr.com/", "status", { notFoundStatuses: [404] }),
    platform("about-me", "^[A-Za-z0-9_-]{1,30}$", "https://about.me/{username}", "status", { notFoundStatuses: [404] }),
    platform("last-fm", "^[A-Za-z0-9_-]{2,15}$", "https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user={username}&api_key={apiKey}&format=json", "lastFm", {
        requiredVariables: ["apiKey"],
        missingVariableReason: "Last.fm kesin profil denetimi için arka plan işleyicisinde LASTFM_API_KEY gizli değişkenini gerektiriyor.",
    }),
    platform("docker-hub", "^[a-z0-9][a-z0-9_-]{1,29}$", "https://registry.hub.docker.com/v2/users/{username}/", "dockerHub", { notFoundStatuses: [404] }),
    platform("npm", "^[a-z0-9][a-z0-9._-]{0,63}$", "https://registry.npmjs.org/-/v1/search?text=maintainer%3A{username}&size=1", "npmMaintainer"),
    platform("scratch", "^[A-Za-z0-9_-]{3,20}$", "https://api.scratch.mit.edu/users/{username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("codeforces", "^[A-Za-z0-9_.-]{3,24}$", "https://codeforces.com/api/user.info?handles={username}&checkHistoricHandles=false", "codeforces"),
    platform("codewars", "^[A-Za-z0-9_-]{1,50}$", "https://www.codewars.com/api/v1/users/{username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("chess-com", "^[A-Za-z0-9_-]{3,25}$", "https://api.chess.com/pub/player/{username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("lichess", "^[A-Za-z0-9_-]{2,30}$", "https://lichess.org/api/user/{username}", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("mixcloud", "^[A-Za-z0-9_-]{1,30}$", "https://api.mixcloud.com/{username}/", "jsonExact", { identityPath: "username", notFoundStatuses: [404] }),
    platform("gravatar", "^[A-Za-z0-9._-]{1,64}$", "https://en.gravatar.com/{username}.json", "gravatar", { notFoundStatuses: [404] }),
    platform("matrix", "^[A-Za-z0-9._=-]{1,64}$", "https://matrix.org/_matrix/client/v3/profile/%40{username}%3Amatrix.org", "status", { notFoundStatuses: [404] }),
    platform("pixelfed", "^[A-Za-z0-9_]{1,30}$", "https://pixelfed.social/api/v1/accounts/lookup?acct={username}", "pixelfed"),
    platform("lemmy", "^[A-Za-z0-9_]{3,20}$", "https://lemmy.world/api/v3/user?username={username}", "lemmy", { notFoundStatuses: [404] }),
    platform("peertube", "^[A-Za-z0-9._-]{1,50}$", "https://peertube.tv/api/v1/accounts/{username}", "jsonExact", { identityPath: "name", notFoundStatuses: [404] }),
    platform("liberapay", "^[A-Za-z0-9_-]{1,32}$", "https://liberapay.com/{username}/public.json", "status", { notFoundStatuses: [404] }),
    platform("linktree", "^[A-Za-z0-9._-]{1,30}$", "https://linktr.ee/{username}", "status", { notFoundStatuses: [404] }),
]);

export const PLATFORM_MAP = new Map(PLATFORMS.map((item) => [item.id, item]));
