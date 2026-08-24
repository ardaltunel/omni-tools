(function (root) {
    "use strict";

    const MIME_TYPES = Object.freeze([
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg",
    ]);

    function chooseMimeType(MediaRecorderApi) {
        if (!MediaRecorderApi?.isTypeSupported) return "";
        return MIME_TYPES.find((type) => MediaRecorderApi.isTypeSupported(type)) || "";
    }

    function formatDuration(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(safeSeconds / 60);
        return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
    }

    function calculateLevel(samples) {
        if (!samples?.length) return 0;
        let squareTotal = 0;
        for (let index = 0; index < samples.length; index += 1) {
            const normalized = (samples[index] - 128) / 128;
            squareTotal += normalized * normalized;
        }
        const rms = Math.sqrt(squareTotal / samples.length);
        return Math.min(100, Math.round(rms * 360));
    }

    function getLevelFeedback(level) {
        if (level >= 85) return { tone: "high", text: "Ses seviyesi çok yüksek. Mikrofon kazancını biraz azaltmanız önerilir." };
        if (level < 10) return { tone: "low", text: "Ses seviyesi düşük. Mikrofona biraz daha yaklaşmayı deneyebilirsiniz." };
        return { tone: "normal", text: "Ses seviyesi konuşma testi için uygun görünüyor." };
    }

    function slugify(value) {
        return String(value || "mikrofon")
            .toLocaleLowerCase("tr-TR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "mikrofon";
    }

    function extensionFromMimeType(mimeType) {
        if (String(mimeType).includes("mp4")) return "m4a";
        return String(mimeType).includes("ogg") ? "ogg" : "webm";
    }

    function createFileName(deviceName, mimeType) {
        return `mikrofon-testi-${slugify(deviceName)}.${extensionFromMimeType(mimeType)}`;
    }

    root.MicrophoneTestCore = Object.freeze({
        MIME_TYPES,
        chooseMimeType,
        formatDuration,
        calculateLevel,
        getLevelFeedback,
        slugify,
        extensionFromMimeType,
        createFileName,
    });
}(typeof window !== "undefined" ? window : globalThis));
