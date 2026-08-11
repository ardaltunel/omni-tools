(function initializeUsernameSearchConfig(global) {
    "use strict";

    // Cloudflare Worker yayınlandıktan sonra workers.dev kök adresini buraya yazın.
    // Örnek: "https://omni-tools-username-search.example.workers.dev"
    global.UsernameSearchConfig = Object.freeze({
        apiBaseUrl: "https://omni-tools-username-search.omni-tools-username-search-worker.workers.dev",
    });
})(typeof window !== "undefined" ? window : globalThis);
