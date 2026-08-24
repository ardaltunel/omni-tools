(function configureOmniAi(global) {
    "use strict";

    global.OmniAiConfig = Object.freeze({
        endpoint: "https://omni-tools-omni-ai.omni-tools-username-search-worker.workers.dev/api/chat",
        maxCharacters: 10000,
        requestTimeoutMs: 90000,
        storageKey: "omni-ai-chats-v1",
        settingsKey: "omni-ai-settings-v1",
        maximumStoredChats: 30,
    });
})(window);
