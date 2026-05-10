const translatePanel = document.getElementById("translate");
const translateConvertButton = translatePanel.querySelector("#translate-convert");
const translateSourceSelect = translatePanel.querySelector("#translate-lang-one");
const translateTargetSelect = translatePanel.querySelector("#translate-lang-two");
const translateTextArea = translatePanel.querySelector("#translate-text");
const translateStatusMessage = translatePanel.querySelector("#translate-status");

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

function setTranslateStatus(message = "", isError = false) {
    translateStatusMessage.textContent = message;
    translateStatusMessage.classList.toggle("error", isError);
}

function setTranslateLoading(isLoading) {
    translateConvertButton.disabled = isLoading;
    translateConvertButton.querySelector("span:first-child").textContent = isLoading ? "Çevriliyor" : "Çevir";
}

function readTranslationResponse(data) {
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error("Unexpected translation response.");
    }

    return data[0]
        .filter((part) => Array.isArray(part) && typeof part[0] === "string")
        .map((part) => part[0])
        .join("");
}

async function translateText() {
    const sourceLanguage = translateSourceSelect.value;
    const targetLanguage = translateTargetSelect.value;
    const text = translateTextArea.value.trim();

    if (!text) {
        setTranslateStatus("Çevirmek için metin gir.", true);
        translateTextArea.focus();
        return;
    }

    const params = new URLSearchParams({
        client: "gtx",
        sl: sourceLanguage,
        tl: targetLanguage,
        dt: "t",
        q: text,
    });

    setTranslateLoading(true);
    setTranslateStatus("Çeviri hazırlanıyor.");

    try {
        const response = await fetch(`${TRANSLATE_ENDPOINT}?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`Translation failed with ${response.status}.`);
        }

        const data = await response.json();
        translateTextArea.value = readTranslationResponse(data);
        setTranslateStatus("Çeviri hazır.");
    } catch (error) {
        setTranslateStatus("Çeviri başarısız oldu. Lütfen tekrar dene.", true);
    } finally {
        setTranslateLoading(false);
    }
}

translateConvertButton.addEventListener("click", translateText);
