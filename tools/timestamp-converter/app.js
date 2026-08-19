(function initTimestampConverter(root) {
    "use strict";
    const panel = document.getElementById("timestamp-converter");
    if (!panel) return;
    const el = {}; ["timestamp-converter-unix-form", "timestamp-converter-unix-input", "timestamp-converter-unit", "timestamp-converter-date-form", "timestamp-converter-date-input", "timestamp-converter-zone-note", "timestamp-converter-unix-state", "timestamp-converter-date-state", "timestamp-converter-summary", "timestamp-converter-local", "timestamp-converter-utc", "timestamp-converter-seconds", "timestamp-converter-milliseconds", "timestamp-converter-copy", "timestamp-converter-current-seconds", "timestamp-converter-current-milliseconds", "timestamp-converter-copy-current", "timestamp-converter-live"].forEach((id) => { el[id] = document.getElementById(id); });
    let lastResult = "";
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Yerel saat";
    el["timestamp-converter-zone-note"].textContent = `Yerel saat dilimi: ${zone}`;
    el["timestamp-converter-date-input"].value = toDateTimeLocal(new Date());
    updateCurrent(); root.setInterval(updateCurrent, 1000);
    el["timestamp-converter-unix-form"].addEventListener("submit", (event) => { event.preventDefault(); fromUnix(); });
    el["timestamp-converter-date-form"].addEventListener("submit", (event) => { event.preventDefault(); fromDate(); });
    el["timestamp-converter-copy"].addEventListener("click", () => copy(lastResult));
    el["timestamp-converter-copy-current"].addEventListener("click", () => copy(String(Date.now())));

    function fromUnix() { const raw = el["timestamp-converter-unix-input"].value.trim(); if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return showError("timestamp-converter-unix-state", "Geçerli bir sayısal timestamp girin."); const value = Number(raw); const milliseconds = el["timestamp-converter-unit"].value === "seconds" ? value * 1000 : value; const date = new Date(milliseconds); if (Number.isNaN(date.getTime())) return showError("timestamp-converter-unix-state", "Bu timestamp geçerli bir tarih oluşturmuyor."); el["timestamp-converter-date-input"].value = toDateTimeLocal(date); render(date, "Timestamp tarihe dönüştürüldü."); setState("timestamp-converter-unix-state", "Tamamlandı"); }
    function fromDate() { const raw = el["timestamp-converter-date-input"].value; if (!raw) return showError("timestamp-converter-date-state", "Tarih ve saat seçin."); const date = new Date(raw); if (Number.isNaN(date.getTime())) return showError("timestamp-converter-date-state", "Geçerli bir tarih ve saat seçin."); el["timestamp-converter-unix-input"].value = String(Math.floor(date.getTime() / 1000)); el["timestamp-converter-unit"].value = "seconds"; render(date, "Tarih timestamp’e dönüştürüldü."); setState("timestamp-converter-date-state", "Tamamlandı"); }
    function render(date, summary) { const milliseconds = date.getTime(); const seconds = Math.floor(milliseconds / 1000); el["timestamp-converter-local"].textContent = date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "medium" }); el["timestamp-converter-utc"].textContent = date.toISOString().replace("T", " ").replace("Z", " UTC"); el["timestamp-converter-seconds"].textContent = String(seconds); el["timestamp-converter-milliseconds"].textContent = String(milliseconds); el["timestamp-converter-summary"].textContent = summary; lastResult = `Yerel: ${el["timestamp-converter-local"].textContent}\nUTC: ${el["timestamp-converter-utc"].textContent}\nSaniye: ${seconds}\nMilisaniye: ${milliseconds}`; el["timestamp-converter-copy"].disabled = false; announce(summary); }
    function updateCurrent() { const now = Date.now(); el["timestamp-converter-current-seconds"].textContent = String(Math.floor(now / 1000)); el["timestamp-converter-current-milliseconds"].textContent = `${now} ms`; }
    function toDateTimeLocal(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
    function setState(id, message, error = false) { const state = el[id]; state.textContent = message; state.classList.toggle("is-error", error); }
    function showError(id, message) { setState(id, "Hata", true); el["timestamp-converter-summary"].textContent = message; announce(message); }
    async function copy(value) { if (!value) return; try { if (navigator.clipboard?.writeText && root.isSecureContext) await navigator.clipboard.writeText(value); else { const node = document.createElement("textarea"); node.value = value; node.style.cssText = "position:fixed;opacity:0"; document.body.append(node); node.select(); document.execCommand("copy"); node.remove(); } announce("Değer panoya kopyalandı."); } catch { announce("Değer kopyalanamadı."); } }
    function announce(message) { el["timestamp-converter-live"].textContent = message; }
}(window));
