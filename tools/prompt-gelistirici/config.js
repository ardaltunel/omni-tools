(function configurePromptDeveloper(global) {
    "use strict";

    // API anahtarı tarayıcı kodunda bulunmaz; yalnızca güvenli Worker adresi kullanılır.
    global.PromptDeveloperConfig = Object.freeze({
        endpoint: "https://omni-tools-prompt-developer.omni-tools-username-search-worker.workers.dev/api/prompt/improve",
        maxCharacters: 5000,
        requestTimeoutMs: 50000,
    });
})(window);
