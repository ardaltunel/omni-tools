(function configureTextCorrector(global) {
    "use strict";

    // Bu dosyaya API anahtarı eklemeyin. Tarayıcı yalnızca güvenli Worker adresini bilir.
    global.TextCorrectorConfig = Object.freeze({
        endpoint: "https://omni-tools-text-corrector.arifardaaltunel.workers.dev/api/text/correct",
        maxCharacters: 10000,
        requestTimeoutMs: 50000,
    });
})(window);
