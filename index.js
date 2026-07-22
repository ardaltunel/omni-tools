const toolNav = document.querySelector(".tool-nav");
const workspace = document.querySelector(".workspace");
const brand = document.querySelector(".brand");
sortToolNavigation();

const panels = document.querySelectorAll(".tool-panel");
const navItems = document.querySelectorAll(".nav-item");
const appHome = document.getElementById("app-home");
document.body.classList.add("is-app-home");
const homeAppCards = createAppHomeCards();
initializeAppSearch(homeAppCards);

navItems.forEach((item) => item.classList.remove("active"));

navItems.forEach((item) => {
    item.addEventListener("click", () => activateTool(item.dataset.tool));
});

brand?.addEventListener("click", clearActiveTool);
brand?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    clearActiveTool();
});

function activateTool(tool) {
    navItems.forEach((item) => item.classList.toggle("active", item.dataset.tool === tool));
    panels.forEach((panel) => panel.classList.toggle("active", panel.id === tool));
    if (appHome) appHome.hidden = true;
    document.body.classList.remove("is-app-home");
    document.body.classList.add("is-tool-active");
    resetToolScroll();
    document.dispatchEvent(new CustomEvent("tool-activated", { detail: { tool } }));

    if (tool === "crypto" && !cryptoPricesLoaded) {
        fetchCryptoPrices();
    }
}

function clearActiveTool() {
    navItems.forEach((item) => item.classList.remove("active"));
    panels.forEach((panel) => panel.classList.remove("active"));
    if (appHome) appHome.hidden = false;
    document.body.classList.remove("is-tool-active");
    document.body.classList.add("is-app-home");
    resetToolScroll();
}

function resetToolScroll() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

    if (workspace) {
        workspace.scrollTo({ top: 0, left: 0, behavior });
    }

    window.scrollTo({ top: 0, left: 0, behavior });
}

function sortToolNavigation() {
    if (!toolNav) return;
    Array.from(toolNav.querySelectorAll(".nav-item"))
        .sort((a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), "tr", { sensitivity: "base" }))
        .forEach((item) => toolNav.appendChild(item));
}

function createAppHomeCards() {
    const grid = document.getElementById("app-home-grid");
    if (!grid) return [];

    const fragment = document.createDocumentFragment();
    const cards = Array.from(navItems, (item, index) => {
        const toolName = item.querySelector("span")?.textContent.trim() || item.textContent.trim();
        const card = document.createElement("button");
        const number = document.createElement("span");
        const label = document.createElement("span");
        const arrow = document.createElement("span");

        card.className = "app-home-card";
        card.type = "button";
        card.dataset.tool = item.dataset.tool;
        card.setAttribute("aria-label", `${toolName} uygulamasını aç`);
        number.className = "app-home-card-number";
        number.setAttribute("aria-hidden", "true");
        number.textContent = String(index + 1).padStart(2, "0");
        label.className = "app-home-card-name";
        label.textContent = toolName;
        arrow.className = "app-home-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2192";

        card.append(number, label, arrow);
        card.addEventListener("click", () => activateTool(item.dataset.tool));
        fragment.appendChild(card);
        return card;
    });

    grid.replaceChildren(fragment);
    return cards;
}

function initializeAppSearch(cards) {
    const searchControls = Array.from(document.querySelectorAll("[data-app-search]"), (container) => {
        const input = container.querySelector("[data-app-search-input]");
        const clearButton = container.querySelector("[data-app-search-clear]");
        const shortcut = container.querySelector(".app-search-shortcut");
        const status = document.getElementById(input?.getAttribute("aria-describedby"));
        return { container, input, clearButton, shortcut, status };
    }).filter(({ input, clearButton, shortcut, status }) => input && clearButton && shortcut && status);
    const homeEmpty = document.getElementById("app-home-empty");
    const homeGrid = document.getElementById("app-home-grid");
    const homeListTitle = document.getElementById("app-home-list-title");
    const brandSummary = brand?.querySelector("small");

    if (!searchControls.length || !homeEmpty || !homeGrid || !homeListTitle) return;

    const searchableItems = Array.from(navItems, (item, index) => ({
        navItem: item,
        homeCard: cards[index],
        name: normalizeAppSearchText(item.querySelector("span")?.textContent || item.textContent),
    }));
    const totalAppCount = searchableItems.length;

    if (brandSummary) brandSummary.textContent = `${totalAppCount} uygulama, tek panel`;

    const filterApps = (value = "") => {
        const rawValue = String(value);
        const query = normalizeAppSearchText(rawValue.trim());
        let visibleCount = 0;

        searchableItems.forEach(({ homeCard, name }) => {
            const isMatch = !query || name.includes(query);
            if (homeCard) homeCard.hidden = !isMatch;
            if (isMatch) {
                visibleCount += 1;
                const number = homeCard?.querySelector(".app-home-card-number");
                if (number) number.textContent = String(visibleCount).padStart(2, "0");
            }
        });

        const hasQuery = query.length > 0;
        const hasResults = visibleCount > 0;
        searchControls.forEach(({ input, clearButton, shortcut, status }) => {
            if (input.value !== rawValue) input.value = rawValue;
            clearButton.hidden = !hasQuery;
            shortcut.hidden = hasQuery;

            if (!hasQuery) {
                status.textContent = "Tüm uygulamalar gösteriliyor.";
            } else if (!hasResults) {
                status.textContent = "Uygulama bulunamadı.";
            } else {
                status.textContent = `${visibleCount} uygulama bulundu.`;
            }
        });

        homeEmpty.hidden = !hasQuery || hasResults;
        homeGrid.hidden = hasQuery && !hasResults;
        homeListTitle.textContent = hasQuery ? "Arama sonuçları" : "Tüm uygulamalar";
    };

    const clearSearch = (input) => {
        filterApps("");
        input.focus();
    };

    searchControls.forEach(({ input, clearButton }) => {
        const handleSearchChange = () => filterApps(input.value);
        input.addEventListener("input", handleSearchChange);
        input.addEventListener("search", handleSearchChange);
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            clearSearch(input);
        });
        clearButton.addEventListener("click", () => clearSearch(input));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target;
        const isEditable = target instanceof HTMLElement
            && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
        if (isEditable) return;

        event.preventDefault();
        if (appHome?.hidden) clearActiveTool();
        const preferredSearch = searchControls.find(({ container }) => container.classList.contains("app-home-search"));
        preferredSearch?.input.focus();
    });

    filterApps("");
}

function normalizeAppSearchText(value) {
    return String(value)
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i");
}

const githubForm = document.getElementById("github-form");
const githubUsername = document.getElementById("github-username");
const githubResult = document.getElementById("github-result");

githubForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchGithubProfile();
});

async function searchGithubProfile() {
    const username = githubUsername.value.trim();
    if (!username) {
        githubResult.className = "github-result empty-state";
        githubResult.textContent = "Bir GitHub kullanıcı adı gir.";
        return;
    }

    githubResult.className = "github-result empty-state";
    githubResult.innerHTML = '<div class="github-empty-mark">GH</div><span>Profil yükleniyor...</span>';

    try {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Kullanıcı bulunamadı.");
        const repos = await fetchGithubRepos(data.repos_url);

        const blogUrl = data.blog?.startsWith("http") ? data.blog : `https://${data.blog}`;
        githubResult.className = "github-result";
        githubResult.innerHTML = `
            <div class="github-profile">
                <img class="github-avatar" src="${data.avatar_url}" alt="${escapeHtml(data.login)} profil fotoğrafı">
                <div>
                    <h3>${escapeHtml(data.name || data.login)}</h3>
                    <a href="${data.html_url}" target="_blank" rel="noreferrer">@${escapeHtml(data.login)}</a>
                </div>
            </div>
            <p class="github-bio">${escapeHtml(data.bio || "Bu hesabın biyografisi yok.")}</p>
            <div class="github-stats">
                <div><span>Repo</span><strong>${data.public_repos}</strong></div>
                <div><span>Takipçi</span><strong>${data.followers}</strong></div>
                <div><span>Takip</span><strong>${data.following}</strong></div>
                <div><span>Gist</span><strong>${data.public_gists}</strong></div>
            </div>
            <div class="github-meta">
                <p><span>Konum</span><strong>${escapeHtml(data.location || "Yok")}</strong></p>
                <p><span>Şirket</span><strong>${escapeHtml(data.company || "Yok")}</strong></p>
                <p><span>Site</span><strong>${data.blog ? `<a href="${escapeHtml(blogUrl)}" target="_blank" rel="noreferrer">${escapeHtml(data.blog)}</a>` : "Yok"}</strong></p>
                <p><span>Twitter</span><strong>${escapeHtml(data.twitter_username ? `@${data.twitter_username}` : "Yok")}</strong></p>
            </div>
            <div class="github-section-title">
                <strong>Son Repolar</strong>
                <a href="${data.html_url}?tab=repositories" target="_blank" rel="noreferrer">Tümünü Aç</a>
            </div>
            <div class="github-repos">
                ${renderGithubRepos(repos)}
            </div>
        `;
    } catch (error) {
        githubResult.className = "github-result empty-state";
        githubResult.innerHTML = `<div class="github-empty-mark">!</div><span>${escapeHtml(error.message)}</span>`;
    }
}

async function fetchGithubRepos(reposUrl) {
    const response = await fetch(`${reposUrl}?sort=updated&per_page=5`);
    if (!response.ok) return [];
    return response.json();
}

function renderGithubRepos(repos) {
    if (!repos.length) {
        return '<div class="github-repo-card"><p>Gösterilecek public repo bulunamadı.</p></div>';
    }

    return repos.map((repo) => `
        <article class="github-repo-card">
            <a href="${repo.html_url}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)}</a>
            <p>${escapeHtml(repo.description || "Açıklama yok.")}</p>
            <div class="github-repo-meta">
                <span>${escapeHtml(repo.language || "Dil yok")}</span>
                <span>★ ${repo.stargazers_count}</span>
                <span>Fork ${repo.forks_count}</span>
            </div>
        </article>
    `).join("");
}

const numbleBoard = document.getElementById("numble-board");
const numbleKeypad = document.getElementById("numble-keypad");
const numbleMessage = document.getElementById("numble-message");
const numbleRound = document.getElementById("numble-round");
const numbleHardButton = document.getElementById("numble-hard");
const numbleSummary = document.getElementById("numble-summary");
const numbleCopy = document.getElementById("numble-copy");
const numbleGames = document.getElementById("numble-games");
const numbleWins = document.getElementById("numble-wins");
const numbleStreak = document.getElementById("numble-streak");

const numbleState = {
    answer: "",
    current: "",
    row: 0,
    rows: Array.from({ length: 6 }, () => ""),
    marks: Array.from({ length: 6 }, () => Array(5).fill("")),
    over: false,
    hard: false,
    requiredExact: Array(5).fill(null),
    requiredPresent: new Set(),
    stats: { games: 0, wins: 0, streak: 0 },
};

document.getElementById("numble-new").addEventListener("click", startNumbleGame);
numbleHardButton.addEventListener("click", toggleNumbleHardMode);
numbleCopy.addEventListener("click", copyNumbleResult);
document.addEventListener("keydown", handleNumbleKeyboard);

function startNumbleGame() {
    numbleState.answer = String(getRandomInt(90000) + 10000);
    numbleState.current = "";
    numbleState.row = 0;
    numbleState.rows = Array.from({ length: 6 }, () => "");
    numbleState.marks = Array.from({ length: 6 }, () => Array(5).fill(""));
    numbleState.over = false;
    numbleState.requiredExact = Array(5).fill(null);
    numbleState.requiredPresent = new Set();
    numbleMessage.textContent = "Tahminini gir.";
    numbleSummary.textContent = "Klavye ile de oynayabilirsin.";
    renderNumble();
}

function renderNumble() {
    numbleRound.textContent = `${numbleState.row}/6`;
    numbleBoard.innerHTML = numbleState.rows.map((value, rowIndex) => {
        const rowValue = rowIndex === numbleState.row && !numbleState.over ? numbleState.current : value;
        const cells = Array.from({ length: 5 }, (_, cellIndex) => {
            const mark = numbleState.marks[rowIndex][cellIndex];
            return `<div class="numble-cell ${mark}">${rowValue[cellIndex] || ""}</div>`;
        }).join("");
        return `<div class="numble-row">${cells}</div>`;
    }).join("");

    numbleKeypad.innerHTML = [
        ..."0123456789",
        "Sil",
        "Gir",
    ].map((key) => {
        const action = key === "Sil" || key === "Gir";
        return `<button class="numble-key ${action ? "action" : ""}" type="button" data-key="${key}">${key}</button>`;
    }).join("");

    numbleKeypad.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => handleNumbleInput(button.dataset.key));
    });
    updateNumbleStats();
}

function handleNumbleKeyboard(event) {
    const activePanel = document.querySelector(".tool-panel.active");
    if (activePanel?.id !== "numble") return;
    if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleNumbleInput(event.key);
    } else if (event.key === "Backspace") {
        event.preventDefault();
        handleNumbleInput("Sil");
    } else if (event.key === "Enter") {
        event.preventDefault();
        handleNumbleInput("Gir");
    }
}

function handleNumbleInput(key) {
    if (numbleState.over) return;
    if (/^\d$/.test(key)) {
        if (numbleState.current.length < 5) {
            numbleState.current += key;
            renderNumble();
        }
        return;
    }

    if (key === "Sil") {
        numbleState.current = numbleState.current.slice(0, -1);
        renderNumble();
        return;
    }

    if (key === "Gir") submitNumbleGuess();
}

function submitNumbleGuess() {
    const guess = numbleState.current;
    if (guess.length !== 5) {
        numbleMessage.textContent = "5 haneli bir sayı gir.";
        return;
    }

    if (numbleState.hard && !passesNumbleHardRules(guess)) return;

    const marks = scoreNumbleGuess(guess, numbleState.answer);
    numbleState.rows[numbleState.row] = guess;
    numbleState.marks[numbleState.row] = marks;
    updateNumbleHardRequirements(guess, marks);
    numbleState.row += 1;
    numbleState.current = "";

    if (guess === numbleState.answer) {
        endNumbleGame(true);
    } else if (numbleState.row >= 6) {
        endNumbleGame(false);
    } else {
        numbleMessage.textContent = "Devam et.";
        renderNumble();
    }
}

function scoreNumbleGuess(guess, answer) {
    const marks = Array(5).fill("absent");
    const remaining = {};

    for (let index = 0; index < 5; index++) {
        if (guess[index] === answer[index]) {
            marks[index] = "exact";
        } else {
            remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
        }
    }

    for (let index = 0; index < 5; index++) {
        if (marks[index] === "exact") continue;
        if (remaining[guess[index]] > 0) {
            marks[index] = "present";
            remaining[guess[index]] -= 1;
        }
    }

    return marks;
}

function updateNumbleHardRequirements(guess, marks) {
    marks.forEach((mark, index) => {
        if (mark === "exact") numbleState.requiredExact[index] = guess[index];
        if (mark === "exact" || mark === "present") numbleState.requiredPresent.add(guess[index]);
    });
}

function passesNumbleHardRules(guess) {
    for (let index = 0; index < 5; index++) {
        const required = numbleState.requiredExact[index];
        if (required && guess[index] !== required) {
            numbleMessage.textContent = `${index + 1}. sırada ${required} kalmalı.`;
            return false;
        }
    }

    for (const digit of numbleState.requiredPresent) {
        if (!guess.includes(digit)) {
            numbleMessage.textContent = `${digit} rakamını kullanmalısın.`;
            return false;
        }
    }
    return true;
}

function endNumbleGame(won) {
    numbleState.over = true;
    numbleState.stats.games += 1;
    if (won) {
        numbleState.stats.wins += 1;
        numbleState.stats.streak += 1;
        numbleMessage.textContent = "Bildin.";
    } else {
        numbleState.stats.streak = 0;
        numbleMessage.textContent = `Cevap ${numbleState.answer}.`;
    }
    numbleSummary.textContent = won
        ? `${numbleState.row}/6 denemede buldun.`
        : `Bulamadın. Gizli sayı ${numbleState.answer}.`;
    renderNumble();
}

function toggleNumbleHardMode() {
    numbleState.hard = !numbleState.hard;
    numbleHardButton.textContent = `Zor Mod: ${numbleState.hard ? "Açık" : "Kapalı"}`;
    numbleMessage.textContent = numbleState.hard ? "Zor mod açık." : "Zor mod kapalı.";
}

function updateNumbleStats() {
    numbleGames.textContent = numbleState.stats.games;
    numbleWins.textContent = numbleState.stats.wins;
    numbleStreak.textContent = numbleState.stats.streak;
}

async function copyNumbleResult() {
    const rows = numbleState.marks
        .slice(0, numbleState.row)
        .map((row) => row.map((mark) => mark === "exact" ? "🟩" : mark === "present" ? "🟨" : "⬛").join(""))
        .join("\n");
    const text = `Numble ${numbleState.over ? `${numbleState.row}/6` : "devam ediyor"}\n${rows}`;
    await navigator.clipboard.writeText(text);
    numbleCopy.textContent = "Kopyalandı";
    setTimeout(() => numbleCopy.textContent = "Sonucu Kopyala", 1200);
}

const passwordOutput = document.getElementById("password-output");
const passwordLength = document.getElementById("password-length");
const passwordLengthValue = document.getElementById("password-length-value");
const passwordStrength = document.getElementById("password-strength");
const passwordEntropy = document.getElementById("password-entropy");
const passwordMeter = document.querySelector(".password-meter");
const passwordOptions = {
    lowercase: document.getElementById("pass-lowercase"),
    uppercase: document.getElementById("pass-uppercase"),
    numbers: document.getElementById("pass-numbers"),
    symbols: document.getElementById("pass-symbols"),
    noDuplicate: document.getElementById("pass-no-duplicate"),
    noAmbiguous: document.getElementById("pass-no-ambiguous"),
};

const passwordCharacters = {
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers: "0123456789",
    symbols: "!$%&*+-=?@#^_~",
};
const ambiguousCharacters = new Set("0O1Il|`'\"{}[]()/\\,.;:");

passwordLength.addEventListener("input", generatePassword);
Object.values(passwordOptions).forEach((option) => option.addEventListener("change", generatePassword));
document.getElementById("generate-password").addEventListener("click", generatePassword);
document.getElementById("copy-password").addEventListener("click", copyPassword);

function getRandomInt(max) {
    const random = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do {
        crypto.getRandomValues(random);
    } while (random[0] >= limit);
    return random[0] % max;
}

function shuffleSecure(items) {
    for (let index = items.length - 1; index > 0; index--) {
        const swapIndex = getRandomInt(index + 1);
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
}

function getPasswordGroups() {
    return ["lowercase", "uppercase", "numbers", "symbols"]
        .filter((key) => passwordOptions[key].checked)
        .map((key) => {
            let chars = passwordCharacters[key];
            if (passwordOptions.noAmbiguous.checked) {
                chars = [...chars].filter((char) => !ambiguousCharacters.has(char)).join("");
            }
            return { key, chars };
        })
        .filter((group) => group.chars.length > 0);
}

function generatePassword() {
    const groups = getPasswordGroups();
    if (!groups.length) {
        passwordOptions.lowercase.checked = true;
        groups.push({ key: "lowercase", chars: passwordCharacters.lowercase });
    }

    const length = Number(passwordLength.value);
    const pool = groups.map((group) => group.chars).join("");
    const uniquePool = [...new Set(pool)];
    const useUnique = passwordOptions.noDuplicate.checked;
    const finalLength = useUnique ? Math.min(length, uniquePool.length) : length;
    passwordLength.value = finalLength;
    passwordLengthValue.textContent = finalLength;

    const password = groups.map((group) => group.chars[getRandomInt(group.chars.length)]);
    while (password.length < finalLength) {
        const source = useUnique ? uniquePool.join("") : pool;
        const nextChar = source[getRandomInt(source.length)];
        if (!useUnique || !password.includes(nextChar)) {
            password.push(nextChar);
        }
    }

    passwordOutput.value = shuffleSecure(password).join("");
    updatePasswordStrength(uniquePool.length, finalLength);
}

function updatePasswordStrength(poolSize, length) {
    const entropy = Math.round(Math.log2(Math.max(poolSize, 1) ** length));
    passwordEntropy.textContent = `${entropy} bit`;
    passwordMeter.classList.remove("weak", "medium", "strong");

    const strength = entropy < 60 ? "weak" : entropy < 100 ? "medium" : "strong";
    passwordMeter.classList.add(strength);
    passwordStrength.textContent = strength === "weak" ? "Zayıf" : strength === "medium" ? "Orta" : "Güçlü";
}

async function copyPassword() {
    const button = document.getElementById("copy-password");
    await navigator.clipboard.writeText(passwordOutput.value);
    button.textContent = "Kopyalandı";
    setTimeout(() => button.textContent = "Kopyala", 1200);
}

const cryptoList = document.getElementById("crypto-list");
const refreshCryptoButton = document.getElementById("refresh-crypto");
const cryptoIds = ["bitcoin", "tether", "ethereum", "litecoin", "cardano", "dogecoin"];
const cryptoNames = {
    bitcoin: "Bitcoin",
    tether: "Tether",
    ethereum: "Ethereum",
    litecoin: "Litecoin",
    cardano: "Cardano",
    dogecoin: "Dogecoin",
};
let cryptoPricesLoaded = false;

refreshCryptoButton.addEventListener("click", () => {
    cryptoPricesLoaded = false;
    fetchCryptoPrices();
});

async function fetchCryptoPrices() {
    if (cryptoPricesLoaded) return;
    cryptoPricesLoaded = true;
    refreshCryptoButton.disabled = true;
    refreshCryptoButton.textContent = "Yükleniyor";
    cryptoList.innerHTML = `
        <div class="empty-state crypto-empty is-loading">
            <strong>Fiyatlar yükleniyor</strong>
            <span>CoinGecko üzerinden güncel piyasa verisi alınıyor.</span>
        </div>
    `;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join("%2C")}&vs_currencies=usd&include_24hr_change=true`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("CoinGecko yanıt vermedi.");
        const data = await response.json();
        cryptoList.innerHTML = cryptoIds.map((coin) => {
            const coinInfo = data[coin];
            if (!coinInfo) return "";
            const change = Number(coinInfo.usd_24h_change || 0);
            return `
                <article class="coin ${change < 0 ? "falling" : "rising"}">
                    <img src="tools/assets/crypto/${coin}.png" alt="${coin}">
                    <div class="coin-name">
                        <h3>${cryptoNames[coin] || coin}</h3>
                        <span>/USD</span>
                    </div>
                    <div class="coin-price">
                        <strong>$${Number(coinInfo.usd).toLocaleString("en-US")}</strong>
                        <span class="coin-change">${change.toFixed(3)}%</span>
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        cryptoPricesLoaded = false;
        cryptoList.innerHTML = `
            <div class="empty-state crypto-empty error">
                <strong>Fiyatlar alınamadı</strong>
                <span>${error.message} Daha sonra tekrar deneyin.</span>
            </div>
        `;
    } finally {
        refreshCryptoButton.disabled = false;
        refreshCryptoButton.textContent = "Fiyatları Yenile";
    }
}

const qrText = document.getElementById("qr-text");
const qrLight = document.getElementById("qr-light");
const qrDark = document.getElementById("qr-dark");
const qrSize = document.getElementById("qr-size");
const qrContainer = document.getElementById("qr-code");
const qrDownload = document.getElementById("qr-download");
const qrShare = document.getElementById("qr-share");
const qrSizeLabel = document.getElementById("qr-size-label");

[qrText, qrLight, qrDark, qrSize].forEach((input) => input.addEventListener("input", generateQRCode));
qrSize.addEventListener("change", generateQRCode);
qrShare.addEventListener("click", shareQRCode);

async function generateQRCode() {
    if (typeof QRCode === "undefined") {
        qrContainer.textContent = "QR kütüphanesi yüklenemedi.";
        return;
    }

    const size = Number(qrSize.value);
    qrSizeLabel.textContent = `${size}x${size}`;
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: qrText.value.trim() || "https://ardaltunel.vercel.app",
        height: size,
        width: size,
        colorLight: qrLight.value,
        colorDark: qrDark.value,
    });
    qrDownload.href = await resolveQRDataUrl();
}

function resolveQRDataUrl() {
    return new Promise((resolve) => {
        setTimeout(() => {
            const img = qrContainer.querySelector("img");
            const canvas = qrContainer.querySelector("canvas");
            resolve(img?.currentSrc || canvas?.toDataURL("image/png") || "#");
        }, 80);
    });
}

async function shareQRCode() {
    try {
        const dataUrl = await resolveQRDataUrl();
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "QRCode.png", { type: blob.type });
        if (!navigator.canShare?.({ files: [file] })) throw new Error();
        await navigator.share({ files: [file], title: qrText.value || "QRCode" });
    } catch {
        alert("Tarayıcınız dosya paylaşımını desteklemiyor.");
    }
}

const speechForm = document.getElementById("speech-form");
const speechText = document.getElementById("speech-text");
const voiceList = document.getElementById("voice-list");
const speechButton = document.getElementById("speech-button");
const speechStop = document.getElementById("speech-stop");
const speechStatus = document.getElementById("speech-status");
const synth = window.speechSynthesis;
let isPaused = false;

speechForm.addEventListener("submit", (event) => {
    event.preventDefault();
    speakText();
});
speechStop.addEventListener("click", () => {
    synth.cancel();
    isPaused = false;
    speechButton.textContent = "Seslendir";
    speechStatus.textContent = "Durduruldu";
});

function loadVoices() {
    const voices = synth.getVoices();
    if (!voices.length) {
        voiceList.innerHTML = '<option>Sesler yükleniyor</option>';
        speechStatus.textContent = "Sesler yükleniyor";
        return;
    }

    voiceList.innerHTML = voices.map((voice) => {
        const selected = voice.name === "Google US English" ? "selected" : "";
        return `<option value="${voice.name}" ${selected}>${voice.name} (${voice.lang})</option>`;
    }).join("");
    speechStatus.textContent = `${voices.length} ses hazır`;
}

function speakText() {
    const text = speechText.value.trim();
    if (!text) {
        speechStatus.textContent = "Metin gerekli";
        speechText.focus();
        return;
    }

    if (synth.speaking && !isPaused) {
        synth.pause();
        isPaused = true;
        speechButton.textContent = "Devam Et";
        speechStatus.textContent = "Duraklatıldı";
        return;
    }

    if (isPaused) {
        synth.resume();
        isPaused = false;
        speechButton.textContent = "Duraklat";
        speechStatus.textContent = "Seslendiriliyor";
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = synth.getVoices().find((voice) => voice.name === voiceList.value);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onend = () => {
        isPaused = false;
        speechButton.textContent = "Seslendir";
        speechStatus.textContent = "Tamamlandı";
    };
    synth.speak(utterance);
    speechButton.textContent = "Duraklat";
    speechStatus.textContent = "Seslendiriliyor";
}

if (synth) {
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
} else {
    speechStatus.textContent = "Desteklenmiyor";
    speechButton.disabled = true;
    speechStop.disabled = true;
}

const gradientColorA = document.getElementById("gradient-color-a");
const gradientColorB = document.getElementById("gradient-color-b");
const gradientPreview = document.getElementById("gradient-preview");
const gradientCode = document.getElementById("gradient-code");
const gradientDirectionLabel = document.getElementById("gradient-direction-label");
const directionButtons = document.querySelectorAll("#direction-buttons button");
let gradientDirection = "to bottom";

[gradientColorA, gradientColorB].forEach((input) => input.addEventListener("input", generateGradient));
directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        directionButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        gradientDirection = button.dataset.direction;
        generateGradient();
    });
});

document.getElementById("copy-gradient").addEventListener("click", async () => {
    await navigator.clipboard.writeText(gradientCode.value);
    document.getElementById("copy-gradient").textContent = "Kopyalandı";
    setTimeout(() => document.getElementById("copy-gradient").textContent = "Kopyala", 1200);
});

function generateGradient() {
    const css = `background-image: linear-gradient(${gradientDirection}, ${gradientColorA.value}, ${gradientColorB.value});`;
    gradientPreview.style.backgroundImage = `linear-gradient(${gradientDirection}, ${gradientColorA.value}, ${gradientColorB.value})`;
    gradientCode.value = css;
    gradientDirectionLabel.textContent = gradientDirection;
}

const turkishTypingTexts = [
    "küçük araçlar sade bir arayüzde birleştiğinde günlük işler daha hızlı ve keyifli hale gelir",
    "başarılı bir yazma testi kullanıcıyı bekletmeden başlar ve metin tamamlandığında sonucu açıkça gösterir",
    "temiz bir tasarım gereksiz dikkat dağıtıcıları azaltır ve yapılan işe odaklanmayı kolaylaştırır",
    "türkçe karakterleri doğru kullanmak hem yazma hızını hem de metin doğruluğunu daha gerçekçi ölçer",
    "bir uygulamanın iyi hissettirmesi için yalnızca çalışması yetmez akışı da doğal ve anlaşılır olmalıdır",
    "hızlı yazmak kadar sakin kalmak da önemlidir çünkü dikkatli ilerleyen kullanıcı daha az hata yapar",
];
const quoteSection = document.getElementById("quote");
const userInput = document.getElementById("quote-input");
const timerEl = document.getElementById("timer");
const mistakesEl = document.getElementById("mistakes");
const resultEl = document.getElementById("typing-result");
const accuracyEl = document.getElementById("accuracy");
const wpmEl = document.getElementById("wpm");
const typingState = document.getElementById("typing-state");
const typingSummary = document.getElementById("typing-summary");

let quote = "";
let elapsedSeconds = 0;
let timer = null;
let mistakes = 0;
let testStarted = false;
let lastTextIndex = -1;
let startTimestamp = null;
let nextTypingTimeout = null;

userInput.addEventListener("input", compareTypingInput);
userInput.addEventListener("keydown", handleTypingKeydown);
document.getElementById("new-quote").addEventListener("click", () => prepareTypingTest(true));

function renderNewQuote() {
    let nextIndex = Math.floor(Math.random() * turkishTypingTexts.length);
    if (turkishTypingTexts.length > 1) {
        while (nextIndex === lastTextIndex) {
            nextIndex = Math.floor(Math.random() * turkishTypingTexts.length);
        }
    }

    lastTextIndex = nextIndex;
    quote = turkishTypingTexts[nextIndex];
    quoteSection.innerHTML = quote.split("").map((value) => `<span class="quote-char">${escapeHtml(value)}</span>`).join("");
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function compareTypingInput() {
    if (!testStarted && userInput.value.length > 0) {
        startTypingTimer();
    }

    const quoteChars = Array.from(document.querySelectorAll(".quote-char"));
    const inputChars = userInput.value.split("");
    mistakes = 0;

    quoteChars.forEach((char, index) => {
        char.classList.remove("success", "fail");
        if (inputChars[index] == null) return;
        if (char.innerText === inputChars[index]) {
            char.classList.add("success");
        } else {
            char.classList.add("fail");
            mistakes++;
        }
    });
    mistakes += Math.max(inputChars.length - quoteChars.length, 0);

    mistakesEl.textContent = mistakes;
    updateLiveStats();

    const isComplete = quoteChars.length &&
        inputChars.length >= quoteChars.length;

    if (isComplete) finishTypingTest();
}

function handleTypingKeydown(event) {
    if (event.key !== "Enter" || userInput.disabled) return;
    event.preventDefault();
    if (!testStarted && userInput.value.length > 0) {
        startTypingTimer();
        compareTypingInput();
    }
    finishTypingTest();
}

function updateTimer() {
    if (!startTimestamp) return;
    elapsedSeconds = Math.floor((Date.now() - startTimestamp) / 1000);
    timerEl.textContent = `${elapsedSeconds}s`;
}

function startTypingTimer() {
    testStarted = true;
    startTimestamp = Date.now();
    typingState.textContent = "Test başladı";
    timer = setInterval(updateTimer, 250);
}

function finishTypingTest() {
    if (!testStarted) return;
    clearInterval(timer);
    updateTimer();
    testStarted = false;
    userInput.disabled = true;
    resultEl.style.display = "block";
    typingState.textContent = "Tamamlandı";

    const durationSeconds = Math.max((Date.now() - startTimestamp) / 1000, 1);
    const elapsedMinutes = durationSeconds / 60;
    const typedChars = userInput.value.length;
    const correctChars = Math.max(typedChars - mistakes, 0);
    const speed = (typedChars / 5 / elapsedMinutes).toFixed(2);
    const accuracy = typedChars ? Math.round((correctChars / typedChars) * 100) : 0;
    wpmEl.textContent = `${speed} wpm`;
    accuracyEl.textContent = `${accuracy}%`;
    typingSummary.textContent = `${durationSeconds.toFixed(1)} saniyede tamamlandı. Doğruluk ${accuracy}%, hız ${speed} wpm. Yeni metin hazırlandı; yazmaya başlayınca sonraki test otomatik başlar.`;

    nextTypingTimeout = setTimeout(() => {
        prepareTypingTest(false);
        typingState.textContent = "Yeni metin hazır";
        userInput.focus();
    }, 900);
}

function updateLiveStats() {
    const typedChars = userInput.value.length;
    const correctChars = Math.max(typedChars - mistakes, 0);
    const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);
    accuracyEl.textContent = typedChars ? `${Math.round((correctChars / typedChars) * 100)}%` : "-";
    wpmEl.textContent = typedChars ? `${(typedChars / 5 / elapsedMinutes).toFixed(2)} wpm` : "-";
}

function resetTypingState(clearResult) {
    clearInterval(timer);
    clearTimeout(nextTypingTimeout);
    elapsedSeconds = 0;
    mistakes = 0;
    testStarted = false;
    startTimestamp = null;
    userInput.value = "";
    userInput.disabled = false;
    timerEl.textContent = "0s";
    mistakesEl.textContent = "0";
    accuracyEl.textContent = "-";
    wpmEl.textContent = "-";
    if (clearResult) {
        resultEl.style.display = "block";
        typingSummary.textContent = "İlk harfi yazdığında test başlayacak. Enter ile erken bitirebilirsin.";
    }
    typingState.textContent = "Hazır";
    document.querySelectorAll(".quote-char").forEach((char) => char.classList.remove("success", "fail"));
}

function prepareTypingTest(clearResult = true) {
    resetTypingState(clearResult);
    renderNewQuote();
}

startNumbleGame();
generatePassword();
generateGradient();
generateQRCode();
prepareTypingTest(true);
