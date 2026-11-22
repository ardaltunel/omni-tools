(function initializeWalletControls() {
    "use strict";
    const wallet = window.OmniGameWallet;
    if (!wallet) return;
    const controls = [];
    for (const id of ["blackjack", "slot-game"]) {
        const panel = document.getElementById(id);
        const heading = panel?.querySelector(id === "blackjack" ? ".blackjack-header" : ".slot-game-heading");
        if (!heading) continue;
        const group = document.createElement("div");
        group.className = "game-wallet-recovery";
        group.hidden = true;
        const message = document.createElement("p");
        message.setAttribute("role", "status");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "10.000 sanal kredi yükle";
        button.dataset.walletRefill = id;
        group.append(message, button);
        heading.after(group);
        controls.push({ group, message, button });
        button.addEventListener("click", async () => {
            button.disabled = true;
            await wallet.refill();
            render();
        });
    }
    function render() {
        const empty = wallet.read("blackjack").balance < 1;
        const allowed = empty && wallet.canRefill();
        for (const { group, message, button } of controls) {
            group.hidden = !empty;
            button.disabled = !allowed;
            message.textContent = allowed ? "Ortak sanal bakiyen tükendi. Üç oyunda da kullanmak için kredi yükleyebilirsin."
                : "Kredi yüklemeden önce devam eden eli, dönüşü veya ücretsiz dönüşleri tamamla.";
        }
    }
    wallet.subscribe(render);
    render();
})();
