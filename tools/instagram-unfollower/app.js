const INSTAGRAM_UNFOLLOWER_SOURCE_URL = "https://raw.githubusercontent.com/cobanov/instagram/main/dist/instagram-unfollower.one-line.js";
const INSTAGRAM_UNFOLLOWER_API_URL = "https://api.github.com/repos/cobanov/instagram/contents/dist/instagram-unfollower.one-line.js?ref=main";
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const CACHE_KEY = "omni-tools-instagram-unfollower-source-v1";

const root = typeof document === "undefined" ? null : document.querySelector("#instagram-unfollower");
const byId = (suffix) => root?.querySelector(`#instagram-unfollower-${suffix}`);

const elements = {
    copyButton: byId("copy-button"),
    refreshButton: byId("refresh-button"),
    sourceState: byId("source-state"),
    sourceMeta: byId("source-meta"),
    message: byId("message"),
    error: byId("error"),
};

const state = {
    source: "",
    fetchedAt: 0,
    hash: "",
    checking: false,
};

function isUsableInstagramUnfollowerSource(source) {
    return typeof source === "string"
        && source.length > 5_000
        && source.includes("instagram.com")
        && source.includes("Taramayı başlat");
}

function getCacheAge(cache, now = Date.now()) {
    return Math.max(0, now - Number(cache?.fetchedAt || 0));
}

function isCacheFresh(cache, now = Date.now()) {
    return Boolean(cache?.source)
        && getCacheAge(cache, now) < UPDATE_INTERVAL_MS;
}

function formatCheckedAt(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "Henüz denetlenmedi";
    }
    return new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(timestamp));
}

function readCachedSource() {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        return isUsableInstagramUnfollowerSource(cache?.source) ? cache : null;
    } catch {
        return null;
    }
}

function saveCachedSource(cache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Önbellek kullanılamasa da kaynak betik yalnızca bu oturumda kullanılabilir.
    }
}

async function getSourceHash(source) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
        return "";
    }
    const bytes = new TextEncoder().encode(source);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Source(encodedSource) {
    const binary = atob(encodedSource.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
}

async function fetchSourceFromGitHub() {
    const requestOptions = {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { Accept: "application/vnd.github+json" },
    };
    let rawStatus = 0;
    try {
        const rawResponse = await fetch(INSTAGRAM_UNFOLLOWER_SOURCE_URL, requestOptions);
        rawStatus = rawResponse.status;
        if (rawResponse.ok) {
            return { source: await rawResponse.text(), sourceLabel: "GitHub Raw" };
        }
    } catch {
        // Raw GitHub CDN geçici olarak erişilemezse aynı dosyayı API üzerinden dene.
    }

    const apiResponse = await fetch(INSTAGRAM_UNFOLLOWER_API_URL, requestOptions);
    if (!apiResponse.ok) {
        throw new Error(`Kaynak sunucusu ${rawStatus || "erişilemedi"}/${apiResponse.status} yanıtı verdi.`);
    }
    const payload = await apiResponse.json();
    if (typeof payload.content !== "string" || payload.encoding !== "base64") {
        throw new Error("GitHub API beklenen kaynak dosyasını döndürmedi.");
    }
    return { source: decodeBase64Source(payload.content), sourceLabel: "GitHub API" };
}

function setMessage(message = "") {
    if (!elements.message) return;
    elements.message.hidden = !message;
    elements.message.textContent = message;
}

function setError(message = "") {
    if (!elements.error) return;
    elements.error.hidden = !message;
    elements.error.textContent = message;
}

function renderSourceStatus({ stateName, label, meta }) {
    if (elements.sourceState) {
        elements.sourceState.dataset.state = stateName;
        elements.sourceState.textContent = label;
    }
    if (elements.sourceMeta) {
        elements.sourceMeta.textContent = meta;
    }
    if (elements.copyButton) {
        elements.copyButton.disabled = state.checking;
        elements.copyButton.textContent = state.checking ? "Kod hazırlanıyor…" : "Güncel kodu kopyala";
    }
    if (elements.refreshButton) {
        elements.refreshButton.disabled = state.checking;
    }
}

function applySource(cache) {
    state.source = cache.source;
    state.fetchedAt = Number(cache.fetchedAt) || Date.now();
    state.hash = cache.hash || "";
}

function getSourceMeta(cache) {
    const hash = cache.hash ? ` · SHA-256 ${cache.hash.slice(0, 12)}` : "";
    const size = new Intl.NumberFormat("tr-TR").format(Math.ceil(cache.source.length / 1_024));
    const sourceLabel = cache.sourceLabel ? ` · ${cache.sourceLabel}` : "";
    return `Son denetleme: ${formatCheckedAt(cache.fetchedAt)} · ${size} KB${hash}${sourceLabel}`;
}

async function fetchLatestSource({ force = false } = {}) {
    if (state.checking) return state.source;

    const cached = readCachedSource();
    if (!force && isCacheFresh(cached)) {
        applySource(cached);
        renderSourceStatus({
            stateName: "cached",
            label: "Güncel sürüm hazır",
            meta: `${getSourceMeta(cached)} · Sonraki otomatik denetleme 24 saat içinde.`,
        });
        return state.source;
    }

    state.checking = true;
    setError("");
    setMessage("");
    renderSourceStatus({
        stateName: "checking",
        label: "Güncellemeler denetleniyor",
        meta: "GitHub'daki güncel betik kontrol ediliyor…",
    });

    try {
        const { source, sourceLabel } = await fetchSourceFromGitHub();
        if (!isUsableInstagramUnfollowerSource(source)) {
            throw new Error("İndirilen kaynak beklenen Insta Takip Etmeyenler betiği değil.");
        }

        const nextCache = {
            source,
            fetchedAt: Date.now(),
            hash: await getSourceHash(source),
            sourceLabel,
        };
        applySource(nextCache);
        saveCachedSource(nextCache);
        renderSourceStatus({
            stateName: "ready",
            label: "Güncel sürüm hazır",
            meta: `${getSourceMeta(nextCache)} · Kaynak betik çalıştırılmadan yalnızca kopyalanmaya hazır.`,
        });
    } catch (error) {
        if (cached) {
            applySource(cached);
            renderSourceStatus({
                stateName: "cached",
                label: "Önbellekteki sürüm hazır",
                meta: `${getSourceMeta(cached)} · Yeni sürüm şu anda denetlenemedi.`,
            });
            setError("GitHub'a ulaşılamadı; son indirilen sürümü kullanabilirsin.");
        } else {
            renderSourceStatus({
                stateName: "error",
                label: "Kaynak yüklenemedi",
                meta: "Bağlantını kontrol edip yeniden dene veya GitHub'daki kaynağı doğrudan aç.",
            });
            setError(error instanceof Error ? error.message : "Kaynak betik yüklenemedi.");
        }
    } finally {
        state.checking = false;
        if (state.source) {
            renderSourceStatus({
                stateName: elements.sourceState?.dataset.state || "ready",
                label: elements.sourceState?.textContent || "Güncel sürüm hazır",
                meta: elements.sourceMeta?.textContent || "Kaynak betik kopyalanmaya hazır.",
            });
        } else if (elements.refreshButton) {
            elements.refreshButton.disabled = false;
            if (elements.copyButton) {
                elements.copyButton.disabled = false;
                elements.copyButton.textContent = "Güncel kodu kopyala";
            }
        }
    }

    return state.source;
}

function legacyCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.append(textArea);
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    textArea.remove();
    if (!copied) {
        throw new Error("Tarayıcı kodu panoya kopyalayamadı.");
    }
}

async function copyTextToClipboard(text) {
    try {
        if (!navigator.clipboard?.writeText) {
            throw new Error("Pano API'si kullanılamıyor.");
        }
        await navigator.clipboard.writeText(text);
    } catch {
        legacyCopyText(text);
    }
}

async function copySource() {
    if (!state.source) {
        setError("");
        setMessage("Güncel kod hazırlanıyor…");
        await fetchLatestSource({ force: true });
    }
    if (!state.source) {
        setMessage("");
        setError("Güncel kod hazırlanamadı. Kaynak kodu bağlantısını kullanarak manuel olarak kopyalayabilirsin.");
        return false;
    }

    try {
        await copyTextToClipboard(state.source);
        setError("");
        setMessage("Güncel kod panoya kopyalandı. Instagram sekmesinde konsolu açıp kodu yapıştırarak çalıştırabilirsin.");
        return true;
    } catch (error) {
        setMessage("");
        setError(error instanceof Error ? `${error.message} Kodu GitHub sayfasından manuel olarak kopyalayabilirsin.` : "Kod panoya kopyalanamadı.");
        return false;
    }
}

function initializeInstagramUnfollower() {
    if (!root) return;

    elements.copyButton?.addEventListener("click", copySource);
    elements.refreshButton?.addEventListener("click", () => fetchLatestSource({ force: true }));
    document.addEventListener("tool-activated", ({ detail }) => {
        if (detail?.tool === "instagram-unfollower") {
            fetchLatestSource();
        }
    });

    // Route betiği, modül yüklenmeden hemen önce etkinleşmiş olabilir. Bir sonraki
    // görevde tekrar kontrol ederek ilk doğrudan açılışta da güncelleme denetimini başlat.
    window.setTimeout(() => {
        if (root.classList.contains("active")) {
            fetchLatestSource();
        }
    }, 0);
}

initializeInstagramUnfollower();

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CACHE_KEY,
        INSTAGRAM_UNFOLLOWER_API_URL,
        INSTAGRAM_UNFOLLOWER_SOURCE_URL,
        UPDATE_INTERVAL_MS,
        formatCheckedAt,
        getCacheAge,
        isCacheFresh,
        isUsableInstagramUnfollowerSource,
    };
}
