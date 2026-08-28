(function initOddColorConfig(root) {
    "use strict";

    const config = Object.freeze({
        STARTING_GRID_SIZE: 2,
        MAX_GRID_SIZE: 6,
        STARTING_LIVES: 3,
        STORAGE_KEY: "omni-farkli-rengi-bul-stats-v1",
        CORRECT_TRANSITION_MS: 180,
        ERROR_ANIMATION_MS: 220,
        SHUFFLE_ANIMATION_MS: 300,
    });

    if (typeof module === "object" && module.exports) module.exports = config;
    if (root) root.OddColorConfig = config;
}(typeof globalThis !== "undefined" ? globalThis : window));
