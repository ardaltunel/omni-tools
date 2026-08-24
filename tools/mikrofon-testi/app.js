(function (root) {
    "use strict";

    const core = root.MicrophoneTestCore;
    const panel = document.getElementById("microphone-test");
    if (!core || !panel) return;
    const isFileMode = root.location.protocol === "file:";

    const byId = (id) => document.getElementById(id);
    const elements = {
        start: byId("microphone-test-start"),
        stop: byId("microphone-test-stop"),
        status: byId("microphone-test-status"),
        fileWarning: byId("microphone-test-file-warning"),
        device: byId("microphone-test-device"),
        deviceCount: byId("microphone-test-device-count"),
        scan: byId("microphone-test-scan"),
        levelBar: byId("microphone-test-level-bar"),
        level: byId("microphone-test-level"),
        peak: byId("microphone-test-peak"),
        feedback: byId("microphone-test-feedback"),
        canvas: byId("microphone-test-waveform"),
        record: byId("microphone-test-record"),
        silence: byId("microphone-test-silence"),
        timer: byId("microphone-test-timer"),
        recordingState: byId("microphone-test-recording-state"),
        infoDevice: byId("microphone-test-info-device"),
        infoRate: byId("microphone-test-info-rate"),
        infoChannels: byId("microphone-test-info-channels"),
        recordingsEmpty: byId("microphone-test-recordings-empty"),
        recordings: byId("microphone-test-recordings"),
        live: byId("microphone-test-live"),
    };

    const state = {
        stream: null,
        audioContext: null,
        source: null,
        analyser: null,
        samples: null,
        animationFrame: 0,
        mediaRecorder: null,
        chunks: [],
        recordStartedAt: 0,
        recordLimitSeconds: 60,
        recordingTimer: 0,
        recordingLevelTotal: 0,
        recordingLevelCount: 0,
        recordingPeak: 0,
        sessionPeak: 0,
        recordings: [],
        nextRecordingId: 1,
        streamToken: 0,
        discardRecording: false,
        permissionGranted: false,
        knownMicrophones: new Map(),
    };

    function supported() {
        return Boolean(navigator.mediaDevices?.getUserMedia && navigator.mediaDevices?.enumerateDevices);
    }

    function setStatus(message, type = "info") {
        elements.status.textContent = message;
        elements.status.dataset.type = type;
        elements.status.hidden = !message;
        elements.live.textContent = message;
    }

    function errorMessage(error) {
        if (["NotAllowedError", "PermissionDeniedError"].includes(error?.name)) {
            return "Mikrofona erişim izni verilmedi. Tarayıcı ayarlarından mikrofon iznini etkinleştirip tekrar deneyin.";
        }
        if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name)) return "Mikrofon bulunamadı.";
        if (["NotReadableError", "TrackStartError"].includes(error?.name)) return "Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.";
        if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error?.name)) return "Seçilen mikrofon artık bağlı değil.";
        return "Mikrofon başlatılamadı. Cihaz bağlantısını ve tarayıcı izinlerini kontrol edin.";
    }

    function audioConstraints(deviceId = "") {
        const constraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        };
        if (deviceId) constraints.deviceId = { exact: deviceId };
        return constraints;
    }

    async function startMicrophone(deviceId = elements.device.value) {
        if (!supported()) {
            setStatus("Tarayıcınız mikrofon erişimini desteklemiyor.", "error");
            return false;
        }
        if (!root.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
            setStatus("Mikrofon testi güvenli bir HTTPS bağlantısı gerektirir.", "error");
            return false;
        }

        const token = ++state.streamToken;
        setStatus("Mikrofon izni bekleniyor…", "loading");
        setControlsBusy(true);
        stopLiveResources();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false });
            if (token !== state.streamToken) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            state.stream = stream;
            state.permissionGranted = true;
            const microphones = await populateDevices(stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId, { attempts: 4, reset: true });
            if (token !== state.streamToken || !state.stream || stream.getAudioTracks().every((track) => track.readyState === "ended")) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            await createAudioMeter(stream);
            renderTechnicalInfo();
            state.sessionPeak = 0;
            setMicrophoneActive(true);
            const fileModeLimited = isFileMode && !microphones.some((device) => device.label);
            elements.fileWarning.hidden = !fileModeLimited;
            if (fileModeLimited) {
                setStatus("Mikrofon açıldı ancak tarayıcı dosya modunda diğer aygıtların adlarını ve kimliklerini paylaşmıyor.", "error");
                return true;
            }
            const deviceMessage = microphones.length > 1
                ? `${microphones.length} mikrofon listelendi.`
                : "Tarayıcı şu anda yalnızca 1 mikrofon bildiriyor.";
            setStatus(`Mikrofon hazır. ${deviceMessage} Konuşacağınız aygıtı listeden seçebilirsiniz.`, "success");
            return true;
        } catch (error) {
            if (token === state.streamToken) {
                stopLiveResources();
                setMicrophoneActive(false);
                setStatus(errorMessage(error), "error");
            }
            return false;
        } finally {
            setControlsBusy(false);
        }
    }

    function wait(milliseconds) {
        return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
    }

    async function populateDevices(preferredId = elements.device.value, options = {}) {
        try {
            const attempts = Math.max(1, Number(options.attempts) || 1);
            if (options.reset) state.knownMicrophones.clear();
            let currentMicrophones = [];

            for (let attempt = 0; attempt < attempts; attempt += 1) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                currentMicrophones = devices.filter((device) => device.kind === "audioinput");
                if (currentMicrophones.some((device) => device.label)) state.permissionGranted = true;
                if (state.permissionGranted) {
                    currentMicrophones.forEach((device, index) => {
                        const key = device.deviceId || `${device.groupId || "group"}-${device.label || index}`;
                        state.knownMicrophones.set(key, device);
                    });
                }
                if (attempt < attempts - 1) await wait(180 * (attempt + 1));
            }

            const microphones = state.permissionGranted && state.knownMicrophones.size
                ? Array.from(state.knownMicrophones.values())
                : currentMicrophones;
            const labelsVisible = microphones.some((device) => device.label);
            const fragment = document.createDocumentFragment();
            if (!microphones.length) {
                const option = document.createElement("option");
                option.textContent = "Mikrofon bulunamadı";
                option.value = "";
                fragment.append(option);
            } else if (!labelsVisible) {
                const option = document.createElement("option");
                option.textContent = isFileMode ? "Dosya modu: Varsayılan Mikrofon" : "İzin verip aygıtları listeleyin";
                option.value = "";
                fragment.append(option);
            } else {
                microphones.forEach((device, index) => {
                    const option = document.createElement("option");
                    option.value = device.deviceId;
                    option.textContent = device.label || `Mikrofon ${index + 1}`;
                    fragment.append(option);
                });
            }
            elements.device.replaceChildren(fragment);
            const canSelectPreferred = labelsVisible && microphones.some((device) => device.deviceId === preferredId);
            if (canSelectPreferred) elements.device.value = preferredId;
            else if (labelsVisible && microphones[0]) elements.device.value = microphones[0].deviceId;
            elements.device.disabled = !microphones.length || !labelsVisible || Boolean(state.mediaRecorder?.state === "recording");
            elements.deviceCount.textContent = !microphones.length ? "Mikrofon bulunamadı" : (labelsVisible ? `${microphones.length} aygıt bulundu` : (isFileMode ? "Dosya modu sınırlı" : "Mikrofon izni gerekli"));
            return microphones;
        } catch {
            setStatus("Ses cihazları listelenemedi.", "error");
            return [];
        }
    }

    async function createAudioMeter(stream) {
        const AudioContextApi = root.AudioContext || root.webkitAudioContext;
        if (!AudioContextApi) throw new Error("AudioContext desteklenmiyor");
        state.audioContext = new AudioContextApi();
        if (state.audioContext.state === "suspended") await state.audioContext.resume();
        state.source = state.audioContext.createMediaStreamSource(stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;
        state.analyser.smoothingTimeConstant = .72;
        state.samples = new Uint8Array(state.analyser.fftSize);
        state.source.connect(state.analyser);
        drawMeter();
    }

    function drawMeter() {
        if (!state.analyser || !state.samples || !state.stream) return;
        state.analyser.getByteTimeDomainData(state.samples);
        const level = core.calculateLevel(state.samples);
        state.sessionPeak = Math.max(state.sessionPeak, level);
        if (state.mediaRecorder?.state === "recording") {
            state.recordingLevelTotal += level;
            state.recordingLevelCount += 1;
            state.recordingPeak = Math.max(state.recordingPeak, level);
        }
        elements.level.textContent = `%${level}`;
        elements.peak.textContent = `%${state.sessionPeak}`;
        elements.levelBar.style.width = `${level}%`;
        elements.levelBar.parentElement.setAttribute("aria-valuenow", String(level));
        const feedback = core.getLevelFeedback(level);
        elements.feedback.textContent = feedback.text;
        elements.feedback.dataset.tone = feedback.tone;
        drawWaveform(state.samples);
        state.animationFrame = root.requestAnimationFrame(drawMeter);
    }

    function drawWaveform(samples) {
        const canvas = elements.canvas;
        const context = canvas.getContext("2d");
        if (!context) return;
        const ratio = root.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const styles = getComputedStyle(panel);
        context.clearRect(0, 0, width, height);
        context.strokeStyle = styles.getPropertyValue("--accent").trim() || "#22c7b8";
        context.lineWidth = 2 * ratio;
        context.beginPath();
        const step = width / Math.max(1, samples.length - 1);
        samples.forEach((sample, index) => {
            const y = (sample / 255) * height;
            if (index === 0) context.moveTo(0, y);
            else context.lineTo(index * step, y);
        });
        context.stroke();
    }

    function renderTechnicalInfo() {
        const track = state.stream?.getAudioTracks()[0];
        const settings = track?.getSettings?.() || {};
        const name = selectedDeviceName();
        elements.infoDevice.textContent = name;
        elements.infoRate.textContent = settings.sampleRate ? `${Number(settings.sampleRate).toLocaleString("tr-TR")} Hz` : "Bilgi mevcut değil";
        elements.infoChannels.textContent = settings.channelCount || "Bilgi mevcut değil";
    }

    function selectedDeviceName() {
        return elements.device.selectedOptions[0]?.textContent || state.stream?.getAudioTracks()[0]?.label || "Varsayılan Mikrofon";
    }

    function setMicrophoneActive(active) {
        elements.start.hidden = active;
        elements.stop.hidden = !active;
        elements.record.disabled = !active || !root.MediaRecorder;
        elements.silence.disabled = !active || !root.MediaRecorder;
        elements.scan.textContent = active ? "Aygıtları Yenile" : "Aygıtları Tara";
        if (!active) resetMeter();
    }

    function setControlsBusy(busy) {
        elements.start.disabled = busy;
        elements.scan.disabled = busy;
        elements.device.disabled = busy || elements.device.options.length === 0;
    }

    function resetMeter() {
        elements.level.textContent = "%0";
        elements.peak.textContent = "%0";
        elements.levelBar.style.width = "0%";
        elements.levelBar.parentElement.setAttribute("aria-valuenow", "0");
        elements.feedback.textContent = "Mikrofonu başlattığınızda yardımcı seviye geri bildirimi burada görünür.";
        elements.feedback.dataset.tone = "normal";
        const context = elements.canvas.getContext("2d");
        context?.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    }

    async function startRecording(limitSeconds = 60) {
        if (!root.MediaRecorder) {
            setStatus("Tarayıcınız ses kaydını desteklemiyor.", "error");
            return;
        }
        if (!state.stream && !(await startMicrophone())) return;
        if (state.mediaRecorder?.state === "recording") return;

        try {
            const mimeType = core.chooseMimeType(root.MediaRecorder);
            state.chunks = [];
            state.discardRecording = false;
            state.recordLimitSeconds = limitSeconds;
            state.recordingLevelTotal = 0;
            state.recordingLevelCount = 0;
            state.recordingPeak = 0;
            state.mediaRecorder = mimeType ? new MediaRecorder(state.stream, { mimeType }) : new MediaRecorder(state.stream);
            state.mediaRecorder.addEventListener("dataavailable", (event) => { if (event.data?.size) state.chunks.push(event.data); });
            state.mediaRecorder.addEventListener("stop", finishRecording, { once: true });
            state.mediaRecorder.addEventListener("error", () => setStatus("Kayıt başlatılamadı.", "error"), { once: true });
            state.mediaRecorder.start(250);
            state.recordStartedAt = Date.now();
            setRecordingUi(true);
            updateRecordingTimer();
            state.recordingTimer = root.setInterval(updateRecordingTimer, 200);
            setStatus(limitSeconds === 5 ? "Ortam sesi testi kaydediliyor…" : "Test kaydı yapılıyor…", "recording");
        } catch {
            setStatus("Kayıt başlatılamadı.", "error");
            setRecordingUi(false);
        }
    }

    function updateRecordingTimer() {
        const elapsed = Math.min(state.recordLimitSeconds, (Date.now() - state.recordStartedAt) / 1000);
        elements.timer.textContent = core.formatDuration(elapsed);
        if (elapsed >= state.recordLimitSeconds) stopRecording();
    }

    function stopRecording() {
        if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
    }

    function finishRecording() {
        root.clearInterval(state.recordingTimer);
        state.recordingTimer = 0;
        if (state.discardRecording) {
            state.discardRecording = false;
            state.chunks = [];
            state.mediaRecorder = null;
            setRecordingUi(false);
            return;
        }
        const duration = Math.max(1, Math.min(state.recordLimitSeconds, Math.round((Date.now() - state.recordStartedAt) / 1000)));
        const mimeType = state.mediaRecorder?.mimeType || state.chunks[0]?.type || "audio/webm";
        const blob = new Blob(state.chunks, { type: mimeType });
        if (blob.size) {
            const recording = {
                id: state.nextRecordingId++,
                name: selectedDeviceName(),
                duration,
                average: state.recordingLevelCount ? Math.round(state.recordingLevelTotal / state.recordingLevelCount) : 0,
                peak: state.recordingPeak,
                createdAt: new Date(),
                mimeType,
                blob,
                url: URL.createObjectURL(blob),
            };
            state.recordings.push(recording);
            renderRecordings();
            setStatus(`${recording.name} kaydı hazır.`, "success");
        } else {
            setStatus("Kayıt oluşturulamadı. Tekrar deneyin.", "error");
        }
        state.chunks = [];
        state.mediaRecorder = null;
        setRecordingUi(false);
    }

    function setRecordingUi(recording) {
        elements.record.textContent = recording ? "■ Kaydı Durdur" : "● Kaydı Başlat";
        elements.record.classList.toggle("is-recording", recording);
        elements.recordingState.hidden = !recording;
        if (!recording) elements.timer.textContent = "00:00";
        elements.silence.disabled = recording || !state.stream;
        elements.device.disabled = recording || !state.stream;
    }

    function renderRecordings() {
        const fragment = document.createDocumentFragment();
        const newestFirst = [...state.recordings].reverse();
        newestFirst.forEach((recording) => {
            const card = document.createElement("article");
            const heading = document.createElement("div");
            const title = document.createElement("strong");
            const meta = document.createElement("span");
            const audio = document.createElement("audio");
            const actions = document.createElement("div");
            const download = document.createElement("a");
            const remove = document.createElement("button");
            card.className = "microphone-test-recording";
            title.textContent = `Kayıt ${recording.id} — ${recording.name}`;
            meta.textContent = `${core.formatDuration(recording.duration)} · Ortalama %${recording.average} · Tepe %${recording.peak} · ${recording.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
            heading.append(title, meta);
            audio.controls = true;
            audio.preload = "metadata";
            audio.src = recording.url;
            actions.className = "microphone-test-recording-actions";
            download.className = "secondary-button";
            download.href = recording.url;
            download.download = core.createFileName(recording.name, recording.mimeType);
            download.textContent = "Kaydı İndir";
            remove.className = "secondary-button";
            remove.type = "button";
            remove.textContent = "Kaydı Sil";
            remove.addEventListener("click", () => deleteRecording(recording.id));
            actions.append(download, remove);
            card.append(heading, audio, actions);
            fragment.append(card);
        });
        elements.recordings.replaceChildren(fragment);
        elements.recordingsEmpty.hidden = state.recordings.length > 0;
    }

    function deleteRecording(id) {
        const index = state.recordings.findIndex((recording) => recording.id === id);
        if (index < 0) return;
        const [recording] = state.recordings.splice(index, 1);
        URL.revokeObjectURL(recording.url);
        renderRecordings();
        setStatus("Kayıt silindi.", "success");
    }

    function stopLiveResources() {
        if (state.animationFrame) root.cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
        state.source?.disconnect();
        state.analyser?.disconnect();
        state.stream?.getTracks().forEach((track) => track.stop());
        state.stream = null;
        state.source = null;
        state.analyser = null;
        state.samples = null;
        if (state.audioContext && state.audioContext.state !== "closed") state.audioContext.close().catch(() => {});
        state.audioContext = null;
    }

    function stopMicrophone() {
        state.streamToken += 1;
        if (state.mediaRecorder?.state === "recording") stopRecording();
        stopLiveResources();
        setMicrophoneActive(false);
        setStatus("Mikrofon kapatıldı.", "info");
    }

    function releaseAll() {
        state.streamToken += 1;
        if (state.mediaRecorder?.state === "recording") {
            state.discardRecording = true;
            try { state.mediaRecorder.stop(); } catch { /* Kayıt zaten durmuş olabilir. */ }
        }
        root.clearInterval(state.recordingTimer);
        state.recordingTimer = 0;
        stopLiveResources();
        state.recordings.forEach((recording) => URL.revokeObjectURL(recording.url));
        state.recordings = [];
        if (!state.discardRecording) {
            state.mediaRecorder = null;
            state.chunks = [];
        }
        renderRecordings();
        setMicrophoneActive(false);
        setStatus("", "info");
    }

    async function handleDeviceChange() {
        const selected = elements.device.value;
        const devices = await populateDevices(selected, { attempts: 2, reset: true });
        if (state.stream && !devices.some((device) => device.deviceId === selected)) {
            stopMicrophone();
            setStatus("Seçilen mikrofon artık bağlı değil.", "error");
        }
    }

    async function scanDevices() {
        if (state.stream) {
            const devices = await populateDevices(elements.device.value, { attempts: 4, reset: true });
            setStatus(devices.length ? `${devices.length} mikrofon bulundu. Kullanmak istediğiniz aygıtı listeden seçin.` : "Mikrofon bulunamadı.", devices.length ? "success" : "error");
            return;
        }
        await startMicrophone("");
    }

    elements.start.addEventListener("click", () => startMicrophone());
    elements.scan.addEventListener("click", scanDevices);
    elements.stop.addEventListener("click", stopMicrophone);
    elements.device.addEventListener("change", () => startMicrophone(elements.device.value));
    elements.record.addEventListener("click", () => {
        if (state.mediaRecorder?.state === "recording") stopRecording();
        else startRecording(60);
    });
    elements.silence.addEventListener("click", () => startRecording(5));
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    document.addEventListener("tool-activated", (event) => { if (event.detail?.tool !== "microphone-test") releaseAll(); });
    new MutationObserver(() => { if (!panel.classList.contains("active") && (state.stream || state.recordings.length)) releaseAll(); }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    root.addEventListener("pagehide", releaseAll);

    populateDevices();
    elements.fileWarning.hidden = !isFileMode;
    setMicrophoneActive(false);
    renderRecordings();
}(window));
