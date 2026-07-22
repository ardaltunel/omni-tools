(function initFFmpegAdapter(root) {
    "use strict";

    const namespace = root.OmniConverter;
    if (!namespace?.Adapters) return;

    const { CategoryAdapter } = namespace.Adapters;
    const CORE_BASE_URL = new URL("tools/converter/vendor/ffmpeg/", document.baseURI).href;
    const MODULE_URL = new URL("tools/converter/vendor/ffmpeg/esm/index.js", document.baseURI).href;
    const AUDIO_LOSSY_FORMATS = new Set(["mp3", "aac", "m4a", "ogg", "wma"]);
    const AUDIO_PROFILES = Object.freeze({
        mp3: ["-c:a", "libmp3lame"],
        wav: ["-c:a", "pcm_s16le"],
        flac: ["-c:a", "flac"],
        aac: ["-c:a", "aac"],
        m4a: ["-c:a", "aac"],
        ogg: ["-c:a", "libvorbis"],
        aiff: ["-c:a", "pcm_s16be"],
        wma: ["-c:a", "wmav2"],
    });
    const VIDEO_CODECS = Object.freeze({
        h264: "libx264",
    });
    const OUTPUT_MIME_TYPES = Object.freeze({
        mp3: "audio/mpeg",
        wav: "audio/wav",
        flac: "audio/flac",
        aac: "audio/aac",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
        aiff: "audio/aiff",
        wma: "audio/x-ms-wma",
        mp4: "video/mp4",
        avi: "video/x-msvideo",
        mkv: "video/x-matroska",
        mov: "video/quicktime",
        mpeg: "video/mpeg",
        m4v: "video/x-m4v",
        "3gp": "video/3gpp",
    });

    class FFmpegRuntime {
        constructor() {
            this.instance = null;
            this.loadPromise = null;
            this.queue = Promise.resolve();
            this.logs = [];
            this.lastError = "";
        }

        run(signal, task) {
            const operation = this.queue.then(async () => {
                throwIfAborted(signal);
                const instance = await this.load();
                throwIfAborted(signal);
                const abort = () => this.terminate(instance);
                signal?.addEventListener("abort", abort, { once: true });
                try {
                    return await task(instance);
                } catch (error) {
                    if (signal?.aborted) throw createAbortError();
                    throw error;
                } finally {
                    signal?.removeEventListener("abort", abort);
                }
            });
            this.queue = operation.catch(() => {});
            return operation;
        }

        async load() {
            if (this.instance?.loaded) return this.instance;
            if (this.loadPromise) return this.loadPromise;

            const { FFmpeg } = await loadFFmpegModule();
            const instance = new FFmpeg();
            instance.on("log", ({ message }) => {
                if (!message) return;
                this.logs.push(message);
                if (this.logs.length > 80) this.logs.shift();
            });
            this.instance = instance;
            this.loadPromise = instance.load({
                coreURL: `${CORE_BASE_URL}ffmpeg-core.js`,
                wasmURL: `${CORE_BASE_URL}ffmpeg-core.wasm`,
            }).then(() => {
                if (this.instance !== instance) throw createAbortError();
                return instance;
            }).catch((error) => {
                if (this.instance === instance) {
                    this.instance = null;
                    this.loadPromise = null;
                }
                if (error?.name === "AbortError") throw error;
                throw new Error("FFmpeg motoru yüklenemedi. Ağ bağlantısını yenileyip tekrar deneyin.");
            });
            return this.loadPromise;
        }

        terminate(instance = this.instance) {
            if (!instance || this.instance !== instance) return;
            try {
                instance.terminate();
            } catch (_) {
                // Worker daha önce kapanmış olabilir.
            }
            this.instance = null;
            this.loadPromise = null;
        }

        clearLogs() {
            this.logs.length = 0;
        }
    }

    class FFmpegAdapter extends CategoryAdapter {
        constructor(config) {
            super(config);
            this.ready = true;
            this.previewKind = config.id;
        }

        async convert(item, settings, signal) {
            return runtime.run(signal, async (ffmpeg) => {
                const suffix = `${Date.now()}-${nextOperationId++}`;
                const inputName = `girdi-${suffix}.${safeExtension(item.extension)}`;
                const outputExtension = this.outputExtension(settings);
                const outputName = `cikti-${suffix}.${outputExtension}`;

                try {
                    await ffmpeg.writeFile(inputName, new Uint8Array(await item.sourceBlob.arrayBuffer()));
                    throwIfAborted(signal);
                    const args = this.config.id === "audio"
                        ? buildAudioArgs(inputName, outputName, settings)
                        : buildVideoArgs(inputName, outputName, settings, this.config.codecCompatibility);
                    runtime.clearLogs();
                    const exitCode = await ffmpeg.exec(args);
                    if (exitCode !== 0) throw new Error("FFmpeg dönüşümü tamamlayamadı.");
                    throwIfAborted(signal);
                    const data = await ffmpeg.readFile(outputName);
                    if (!(data instanceof Uint8Array) || !data.byteLength) throw new Error("FFmpeg boş bir çıktı oluşturdu.");
                    return {
                        blob: new Blob([data], { type: OUTPUT_MIME_TYPES[outputExtension] || "application/octet-stream" }),
                    };
                } catch (error) {
                    if (signal?.aborted || error?.name === "AbortError") throw createAbortError();
                    runtime.lastError = error instanceof Error ? error.message : String(error || "");
                    if (/memory|terminated|worker|runtimeerror/i.test(runtime.lastError)) runtime.terminate(ffmpeg);
                    throw new Error("Seçilen biçim veya kodlayıcı FFmpeg çekirdeği tarafından işlenemedi.");
                } finally {
                    if (ffmpeg.loaded) {
                        await Promise.allSettled([
                            ffmpeg.deleteFile(inputName),
                            ffmpeg.deleteFile(outputName),
                        ]);
                    }
                }
            });
        }

        outputExtension(settings) {
            return safeExtension(settings.outputFormat || (this.config.id === "audio" ? "mp3" : "mp4"));
        }

        outputNote() {
            return "FFmpeg çekirdeği ilk dönüşümde bir kez indirilir; sonraki işlemlerde aynı oturumda yeniden kullanılır.";
        }
    }

    function buildAudioArgs(inputName, outputName, settings) {
        const format = safeExtension(settings.outputFormat);
        const profile = AUDIO_PROFILES[format];
        if (!profile) throw new Error("Ses çıkış biçimi desteklenmiyor.");

        const args = ["-i", inputName, "-map_metadata", "-1", "-vn", ...profile];
        if (settings.channels !== "original") args.push("-ac", settings.channels === "mono" ? "1" : "2");
        if (settings.sampleRate !== "original") args.push("-ar", String(settings.sampleRate || "48000"));
        if (AUDIO_LOSSY_FORMATS.has(format)) args.push("-b:a", `${Number(settings.bitrate) || 192}k`);
        if (format === "aiff") args.push("-f", "aiff");
        if (format === "wma") args.push("-f", "asf");
        args.push(outputName);
        return args;
    }

    function buildVideoArgs(inputName, outputName, settings, compatibility) {
        const format = safeExtension(settings.outputFormat);
        const codecKey = String(settings.codec || "h264");
        if (!compatibility?.[format]?.includes(codecKey)) {
            throw new Error("Seçilen video biçimi ile kodlayıcı birbiriyle uyumlu değil.");
        }

        const videoCodec = format === "mpeg" ? "mpeg2video" : VIDEO_CODECS[codecKey];
        const args = ["-i", inputName, "-map_metadata", "-1", "-c:v", videoCodec];
        if (codecKey === "h264" && format !== "mpeg") {
            args.push("-preset", "veryfast", "-pix_fmt", "yuv420p");
        }

        if (settings.videoBitrate && settings.videoBitrate !== "auto") {
            args.push("-b:v", `${settings.videoBitrate}M`);
        } else if (format === "mpeg") {
            const quality = { high: "3", balanced: "5", compact: "7" }[settings.videoQuality] || "5";
            args.push("-q:v", quality);
        } else {
            const quality = { high: "20", balanced: "26", compact: "32" }[settings.videoQuality] || "26";
            args.push("-crf", quality);
        }

        if (settings.fps && settings.fps !== "original") args.push("-r", String(settings.fps));
        if (settings.resolution && settings.resolution !== "original") args.push("-vf", `scale=-2:${settings.resolution}`);

        if (format === "mpeg") args.push("-c:a", "mp2");
        else if (format === "avi") args.push("-c:a", "libmp3lame");
        else args.push("-c:a", "aac");
        args.push("-b:a", `${Number(settings.audioBitrate) || 192}k`);
        if (["mp4", "m4v", "mov"].includes(format)) args.push("-movflags", "+faststart");
        args.push(outputName);
        return args;
    }

    function safeExtension(value) {
        return String(value || "dosya").toLowerCase().replace(/[^a-z0-9]/g, "") || "dosya";
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw createAbortError();
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    function loadFFmpegModule() {
        modulePromise ||= import(MODULE_URL);
        return modulePromise;
    }

    const runtime = new FFmpegRuntime();
    let modulePromise = null;
    let nextOperationId = 1;
    namespace.Adapters.register("ffmpeg", (config) => new FFmpegAdapter(config));
    namespace.FFmpegRuntime = runtime;
})(window);
