(function initEncoderDecoder(root) {
    "use strict";
    const panel = document.getElementById("encoder-decoder");
    if (!panel) return;
    const elements = {};
    ["encoder-decoder-mode", "encoder-decoder-input", "encoder-decoder-run", "encoder-decoder-clear", "encoder-decoder-copy", "encoder-decoder-output", "encoder-decoder-empty", "encoder-decoder-error", "encoder-decoder-result", "encoder-decoder-input-state", "encoder-decoder-result-state", "encoder-decoder-live"].forEach((id) => { elements[id] = document.getElementById(id); });
    let output = "";

    elements["encoder-decoder-run"].addEventListener("click", transform);
    elements["encoder-decoder-clear"].addEventListener("click", clear);
    elements["encoder-decoder-copy"].addEventListener("click", copy);
    elements["encoder-decoder-input"].addEventListener("input", reset);
    elements["encoder-decoder-mode"].addEventListener("change", reset);

    function transform() {
        const value = elements["encoder-decoder-input"].value;
        if (!value) return showError("Dönüştürmek için bir metin girin.");
        try {
            output = convert(value, elements["encoder-decoder-mode"].value);
            elements["encoder-decoder-output"].textContent = output;
            elements["encoder-decoder-empty"].hidden = true;
            elements["encoder-decoder-error"].hidden = true;
            elements["encoder-decoder-result"].hidden = false;
            setState("Tamamlandı", "success");
            announce("Dönüşüm tamamlandı.");
        } catch (error) { showError(error.message || "Dönüştürme sırasında bir hata oluştu."); }
    }

    function convert(value, mode) {
        switch (mode) {
            case "base64-encode": return bytesToBase64(new TextEncoder().encode(value));
            case "base64-decode": return new TextDecoder().decode(base64ToBytes(value));
            case "url-encode": return encodeURIComponent(value);
            case "url-decode": return decodeURIComponent(value.replace(/\+/g, "%20"));
            case "html-escape": return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            case "html-unescape": return unescapeHtml(value);
            case "unicode-encode": return Array.from(value, (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
            case "unicode-decode": return decodeUnicode(value);
            case "jwt-decode": return decodeJwt(value);
            default: throw new Error("Geçersiz dönüşüm türü.");
        }
    }

    function bytesToBase64(bytes) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
    function base64ToBytes(value) { const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="); const binary = atob(padded); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
    function unescapeHtml(value) { const node = document.createElement("textarea"); node.innerHTML = value; return node.value; }
    function decodeUnicode(value) { const matches = value.match(/(?:U\+|\\u\{|\\u)([0-9a-fA-F]{1,6})\}?/g); if (!matches) throw new Error("Unicode değerlerini U+0041 veya \\u0041 biçiminde girin."); return matches.map((match) => String.fromCodePoint(parseInt(match.replace(/^(U\+|\\u\{|\\u)|\}$/g, ""), 16))).join(""); }
    function decodeJwt(value) { const parts = value.trim().split("."); if (parts.length < 2) throw new Error("JWT üç noktayla ayrılmış bölüm içermelidir."); const header = JSON.parse(new TextDecoder().decode(base64ToBytes(parts[0]))); const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(parts[1]))); return JSON.stringify({ header, payload }, null, 2); }

    function reset() { output = ""; elements["encoder-decoder-result"].hidden = true; elements["encoder-decoder-error"].hidden = true; elements["encoder-decoder-empty"].hidden = false; setState("Hazır"); }
    function clear() { elements["encoder-decoder-input"].value = ""; elements["encoder-decoder-input"].focus(); reset(); announce("Girdi temizlendi."); }
    function showError(message) { output = ""; elements["encoder-decoder-result"].hidden = true; elements["encoder-decoder-empty"].hidden = true; elements["encoder-decoder-error"].textContent = message; elements["encoder-decoder-error"].hidden = false; setState("Hata", "error"); announce(message); }
    function setState(message, tone = "") { [elements["encoder-decoder-input-state"], elements["encoder-decoder-result-state"]].forEach((element) => { element.textContent = message; element.classList.toggle("is-success", tone === "success"); element.classList.toggle("is-error", tone === "error"); }); }
    async function copy() { if (!output) return; try { await writeClipboard(output); elements["encoder-decoder-copy"].textContent = "Kopyalandı"; root.setTimeout(() => { elements["encoder-decoder-copy"].textContent = "Çıktıyı Kopyala"; }, 1600); announce("Çıktı panoya kopyalandı."); } catch { announce("Çıktı kopyalanamadı."); } }
    async function writeClipboard(value) { if (navigator.clipboard?.writeText && root.isSecureContext) return navigator.clipboard.writeText(value); const node = document.createElement("textarea"); node.value = value; node.style.cssText = "position:fixed;opacity:0;"; document.body.append(node); node.select(); const copied = document.execCommand("copy"); node.remove(); if (!copied) throw new Error("copy failed"); }
    function announce(message) { elements["encoder-decoder-live"].textContent = message; }
}(window));
