(function initializeDiscordEmojiDownloader() {
    "use strict";

    const core = window.DiscordEmojiDownloaderCore;
    const panel = document.getElementById("discord-emoji-downloader");
    if (!core || !panel) return;

    const byId = (id) => document.getElementById(id);
    const elements = {
        modeTabs: Array.from(panel.querySelectorAll("[data-discord-input-mode]")),
        modePanels: Array.from(panel.querySelectorAll("[data-discord-input-panel]")),
        botToken: byId("discord-emoji-bot-token"),
        botConnect: byId("discord-emoji-bot-connect"),
        fileInput: byId("discord-emoji-file-input"),
        fileDrop: byId("discord-emoji-file-drop"),
        fileBrowse: byId("discord-emoji-file-browse"),
        manualInput: byId("discord-emoji-manual-input"),
        manualSubmit: byId("discord-emoji-manual-submit"),
        inputError: byId("discord-emoji-input-error"),
        guildBrowser: byId("discord-emoji-guild-browser"),
        guildSourceLabel: byId("discord-emoji-guild-source-label"),
        guildSearch: byId("discord-emoji-guild-search"),
        guildList: byId("discord-emoji-guild-list"),
        guildEmpty: byId("discord-emoji-guild-empty"),
        reset: byId("discord-emoji-reset"),
        assetBrowser: byId("discord-emoji-asset-browser"),
        guildName: byId("discord-emoji-current-guild"),
        guildSummary: byId("discord-emoji-current-summary"),
        itemTabs: Array.from(panel.querySelectorAll("[data-discord-item-filter]")),
        itemSearch: byId("discord-emoji-item-search"),
        selectAll: byId("discord-emoji-select-all"),
        clearSelection: byId("discord-emoji-clear-selection"),
        selectedCount: byId("discord-emoji-selected-count"),
        itemGrid: byId("discord-emoji-grid"),
        itemEmpty: byId("discord-emoji-items-empty"),
        zipButton: byId("discord-emoji-download-zip"),
        retryButton: byId("discord-emoji-retry"),
        progress: byId("discord-emoji-progress"),
        progressText: byId("discord-emoji-progress-text"),
        progressCount: byId("discord-emoji-progress-count"),
        progressBar: byId("discord-emoji-progress-bar"),
        progressFill: byId("discord-emoji-progress-fill"),
        notice: byId("discord-emoji-notice"),
        live: byId("discord-emoji-live"),
    };

    const state = {
        guilds: [],
        guild: null,
        items: [],
        selected: new Set(),
        failed: new Set(),
        inputMode: "bot",
        sourceMode: "",
        botName: "",
        connectionController: null,
        isConnecting: false,
        itemFilter: "all",
        itemQuery: "",
        guildQuery: "",
        isDownloading: false,
        renderFrame: 0,
        previewCache: new Map(),
        previewGeneration: 0,
    };
    const previewQueue = [];
    let activePreviewRequests = 0;
    const MAX_PREVIEW_REQUESTS = 4;
    const MAX_PREVIEW_CACHE = 200;

    bindEvents();
    setInputMode("bot");
    updateSelectionUi();

    function bindEvents() {
        elements.modeTabs.forEach((button) => {
            button.addEventListener("click", () => setInputMode(button.dataset.discordInputMode));
            button.addEventListener("keydown", handleModeTabKeydown);
        });
        elements.botConnect.addEventListener("click", connectBot);
        elements.botToken.addEventListener("input", clearInputError);
        elements.botToken.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            connectBot();
        });
        elements.fileBrowse.addEventListener("click", (event) => {
            event.stopPropagation();
            elements.fileInput.click();
        });
        elements.fileInput.addEventListener("change", () => loadFiles(elements.fileInput.files));
        elements.fileDrop.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            elements.fileInput.click();
        });
        elements.fileDrop.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            elements.fileInput.click();
        });
        ["dragenter", "dragover"].forEach((type) => {
            elements.fileDrop.addEventListener(type, (event) => {
                event.preventDefault();
                elements.fileDrop.classList.add("is-dragging");
            });
        });
        ["dragleave", "drop"].forEach((type) => {
            elements.fileDrop.addEventListener(type, (event) => {
                event.preventDefault();
                elements.fileDrop.classList.remove("is-dragging");
            });
        });
        elements.fileDrop.addEventListener("drop", (event) => loadFiles(event.dataTransfer?.files));
        elements.manualSubmit.addEventListener("click", loadManualJson);
        elements.manualInput.addEventListener("input", clearInputError);
        elements.manualInput.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                loadManualJson();
            }
        });
        elements.guildSearch.addEventListener("input", () => {
            state.guildQuery = elements.guildSearch.value;
            renderGuilds();
        });
        elements.guildList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-guild-id]");
            if (button) selectGuild(button.dataset.guildId);
        });
        elements.reset.addEventListener("click", resetTool);
        elements.itemTabs.forEach((button) => {
            button.addEventListener("click", () => {
                state.itemFilter = button.dataset.discordItemFilter;
                elements.itemTabs.forEach((tab) => {
                    const active = tab === button;
                    tab.classList.toggle("active", active);
                    tab.setAttribute("aria-pressed", String(active));
                });
                scheduleItemRender();
            });
        });
        elements.itemSearch.addEventListener("input", () => {
            state.itemQuery = elements.itemSearch.value;
            scheduleItemRender();
        });
        elements.selectAll.addEventListener("click", selectVisibleItems);
        elements.clearSelection.addEventListener("click", clearSelection);
        elements.itemGrid.addEventListener("change", handleGridChange);
        elements.itemGrid.addEventListener("click", handleGridClick);
        elements.zipButton.addEventListener("click", () => downloadSelectedZip());
        elements.retryButton.addEventListener("click", retryFailedDownloads);
        window.addEventListener("beforeunload", () => {
            if (state.renderFrame) cancelAnimationFrame(state.renderFrame);
            clearBotSession();
            releasePreviewCache();
        });
        document.addEventListener("tool-activated", (event) => {
            if (event.detail?.tool !== "discord-emoji-downloader") return;
            const focusTarget = state.guilds.length
                ? elements.itemSearch
                : state.inputMode === "bot" ? elements.botToken : state.inputMode === "manual" ? elements.manualInput : elements.fileBrowse;
            window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
        });
    }

    function setInputMode(mode) {
        state.inputMode = ["bot", "file", "manual"].includes(mode) ? mode : "bot";
        elements.modeTabs.forEach((button) => {
            const active = button.dataset.discordInputMode === state.inputMode;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });
        elements.modePanels.forEach((inputPanel) => {
            inputPanel.hidden = inputPanel.dataset.discordInputPanel !== state.inputMode;
        });
        clearInputError();
    }

    async function connectBot() {
        if (state.isConnecting) return;
        clearInputError();
        clearNotice();
        let token = elements.botToken.value;
        if (!token.trim()) {
            showInputError("Bot token alanını boş bırakmayın.");
            return;
        }

        clearBotSession();
        const controller = new AbortController();
        state.connectionController = controller;
        setConnectionBusy(true);
        try {
            const connection = await core.loadBotGuilds(token, { signal: controller.signal });
            if (state.connectionController !== controller) return;
            state.botName = connection.bot.username;
            elements.botConnect.textContent = `Gateway: 0 / ${connection.guilds.length}`;
            const gatewayResult = await core.loadBotGatewayGuilds(token, connection.guilds, {
                signal: controller.signal,
                onProgress: ({ loaded, unavailable, total }) => {
                    if (state.connectionController === controller) {
                        elements.botConnect.textContent = `Gateway: ${loaded + unavailable} / ${total}`;
                    }
                },
            });
            if (state.connectionController !== controller) return;
            const gatewayGuilds = new Map(gatewayResult.guilds.map((guild) => [guild.id, guild]));
            const guilds = connection.guilds.map((guild) => gatewayGuilds.get(guild.id) || {
                ...guild,
                expressionsLoaded: false,
                gatewayUnavailable: true,
            });
            const missingCount = guilds.length - gatewayResult.guilds.length;
            const message = missingCount
                ? `${connection.bot.username} botuyla ${gatewayResult.guilds.length} sunucu yüklendi; ${missingCount} sunucu geçici olarak alınamadı.`
                : `${connection.bot.username} botuyla ${guilds.length} sunucunun emoji ve sticker verileri yüklendi.`;
            acceptGuilds(
                core.sortGuilds(guilds),
                message,
                { sourceMode: "bot" },
            );
        } catch (error) {
            if (error?.code !== "aborted") showInputError(readableError(error, "Discord bağlantısı kurulamadı."));
        } finally {
            token = "";
            elements.botToken.value = "";
            if (state.connectionController === controller) state.connectionController = null;
            setConnectionBusy(false);
        }
    }

    function handleModeTabKeydown(event) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = elements.modeTabs.indexOf(event.currentTarget);
        let nextIndex = currentIndex;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = elements.modeTabs.length - 1;
        else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % elements.modeTabs.length;
        else nextIndex = (currentIndex - 1 + elements.modeTabs.length) % elements.modeTabs.length;
        const nextTab = elements.modeTabs[nextIndex];
        setInputMode(nextTab.dataset.discordInputMode);
        nextTab.focus();
    }

    async function loadFiles(fileList) {
        const files = Array.from(fileList || []).filter((file) => file && (/\.json$/i.test(file.name) || file.type === "application/json"));
        elements.fileInput.value = "";
        if (!files.length) {
            showInputError("Lütfen geçerli bir JSON dosyası seçin.");
            return;
        }

        setInputBusy(true);
        clearInputError();
        try {
            const collections = await Promise.all(files.map(async (file) => core.parseGuildJson(await file.text())));
            const guilds = core.sortGuilds(core.mergeGuildCollections(collections.flat()));
            acceptGuilds(guilds, `${guilds.length} sunucu verisi başarıyla yüklendi.`, { sourceMode: "json" });
        } catch (error) {
            showInputError(readableError(error, "JSON dosyaları okunamadı."));
        } finally {
            setInputBusy(false);
        }
    }

    function loadManualJson() {
        clearInputError();
        try {
            const guilds = core.parseGuildJson(elements.manualInput.value);
            acceptGuilds(guilds, `${guilds.length} sunucu verisi başarıyla işlendi.`, { sourceMode: "json" });
        } catch (error) {
            showInputError(readableError(error, "Geçerli bir Discord Guild JSON verisi bulunamadı."));
        }
    }

    function acceptGuilds(guilds, message, options = {}) {
        if (options.sourceMode !== "bot") clearBotSession();
        state.sourceMode = options.sourceMode || "json";
        state.guilds = guilds;
        state.guildQuery = "";
        elements.guildSearch.value = "";
        elements.guildSourceLabel.textContent = state.sourceMode === "bot" ? `${state.botName} botunun sunucuları` : "Yüklenen veriler";
        elements.guildBrowser.hidden = false;
        renderGuilds();
        selectGuild(guilds[0].id);
        showNotice(message, "success");
        announce(message);
        elements.guildBrowser.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }

    function renderGuilds() {
        const fragment = document.createDocumentFragment();
        const query = core.normalizeSearchText(state.guildQuery);
        const visibleGuilds = state.guilds.filter((guild) => !query || core.normalizeSearchText(guild.name).includes(query));

        visibleGuilds.forEach((guild) => {
            const button = document.createElement("button");
            const icon = document.createElement("span");
            const fallback = document.createElement("span");
            const name = document.createElement("span");
            const count = document.createElement("small");
            button.type = "button";
            button.className = "discord-guild-option";
            button.dataset.guildId = guild.id;
            button.classList.toggle("active", guild.id === state.guild?.id);
            button.setAttribute("aria-pressed", String(guild.id === state.guild?.id));
            icon.className = "discord-guild-icon";
            fallback.className = "discord-guild-icon-fallback";
            fallback.textContent = Array.from(guild.name)[0]?.toLocaleUpperCase("tr-TR") || "S";
            const iconUrl = core.getGuildIconUrl(guild);
            if (iconUrl) {
                const image = document.createElement("img");
                image.crossOrigin = "anonymous";
                image.src = iconUrl;
                image.alt = "";
                image.loading = "lazy";
                image.addEventListener("load", () => fallback.hidden = true, { once: true });
                image.addEventListener("error", () => loadPreviewThroughMemory({
                    key: `guild-icon:${guild.id}:${guild.icon}`,
                    downloadCandidates: [{
                        url: iconUrl,
                        extension: guild.icon.startsWith("a_") ? "gif" : "webp",
                        mimeTypes: ["image/webp", "image/gif", "image/png"],
                        preserveExtension: true,
                    }],
                }, image, fallback));
                icon.append(image);
            }
            icon.append(fallback);
            name.className = "discord-guild-option-copy";
            name.textContent = guild.name;
            count.textContent = state.sourceMode === "bot" && guild.expressionsLoaded !== true
                ? "Gateway verisi alınamadı"
                : `${guild.emojis.length + guild.stickers.length} öğe`;
            name.append(count);
            button.append(icon, name);
            fragment.append(button);
        });

        elements.guildList.replaceChildren(fragment);
        elements.guildEmpty.hidden = visibleGuilds.length > 0;
    }

    function selectGuild(guildId) {
        const guild = state.guilds.find((candidate) => candidate.id === guildId);
        if (!guild) return;
        if (state.sourceMode === "bot" && guild.expressionsLoaded !== true) {
            showGuild(guild);
            elements.guildSummary.textContent = "Gateway verisi alınamadı";
            elements.itemEmpty.textContent = "Bu sunucu Discord Gateway tarafından geçici olarak gönderilmedi. Bot bağlantısını yenileyerek tekrar deneyebilirsiniz.";
            showNotice("Bu sunucunun Gateway verisi alınamadı. Bağlantıyı yenileyerek tekrar deneyin.", "warning");
            return;
        }
        showGuild(guild);
    }

    function showGuild(guild) {
        state.guild = guild;
        state.items = core.createGuildItems(guild);
        state.selected.clear();
        state.failed.clear();
        state.itemFilter = "all";
        state.itemQuery = "";
        elements.itemSearch.value = "";
        elements.itemTabs.forEach((button) => {
            const active = button.dataset.discordItemFilter === "all";
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        elements.guildName.textContent = guild.name;
        elements.guildSummary.textContent = `${guild.emojis.length} emoji · ${guild.stickers.length} sticker`;
        elements.assetBrowser.hidden = false;
        elements.progress.hidden = true;
        elements.retryButton.hidden = true;
        renderGuilds();
        renderItems();
        updateSelectionUi();
    }

    function scheduleItemRender() {
        if (state.renderFrame) cancelAnimationFrame(state.renderFrame);
        state.renderFrame = requestAnimationFrame(() => {
            state.renderFrame = 0;
            renderItems();
        });
    }

    function renderItems() {
        const visibleItems = getVisibleItems();
        const fragment = document.createDocumentFragment();
        updateItemTabCounts();

        visibleItems.forEach((item) => fragment.append(createItemCard(item)));
        elements.itemGrid.replaceChildren(fragment);
        elements.itemGrid.hidden = visibleItems.length === 0;
        elements.itemEmpty.hidden = visibleItems.length > 0;
        if (!visibleItems.length) {
            elements.itemEmpty.textContent = state.items.length
                ? "Aramanızla eşleşen emoji veya sticker bulunamadı."
                : "Bu sunucuda özel emoji veya sticker bulunmuyor.";
        }
    }

    function createItemCard(item) {
        const card = document.createElement("article");
        const selection = document.createElement("label");
        const checkbox = document.createElement("input");
        const checkboxMark = document.createElement("span");
        const preview = document.createElement("div");
        const fallback = document.createElement("span");
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        const details = document.createElement("span");
        const download = document.createElement("button");
        const downloadable = item.downloadCandidates.length > 0;

        card.className = "discord-expression-card";
        card.classList.toggle("is-selected", state.selected.has(item.key));
        card.classList.toggle("is-failed", state.failed.has(item.key));
        card.dataset.itemKey = item.key;
        card.setAttribute("role", "listitem");

        selection.className = "discord-expression-select";
        checkbox.type = "checkbox";
        checkbox.checked = state.selected.has(item.key);
        checkbox.disabled = !downloadable || state.isDownloading;
        checkbox.dataset.itemKey = item.key;
        checkbox.setAttribute("aria-label", `${item.name} öğesini seç`);
        checkboxMark.setAttribute("aria-hidden", "true");
        selection.append(checkbox, checkboxMark);

        preview.className = "discord-expression-preview";
        fallback.className = "discord-expression-fallback";
        fallback.textContent = item.lottie ? "JSON" : item.type === "emoji" ? "E" : "S";
        if (item.previewUrl) {
            const image = document.createElement("img");
            image.crossOrigin = "anonymous";
            image.referrerPolicy = "no-referrer";
            image.src = item.previewUrl;
            image.alt = `${item.name} önizlemesi`;
            image.loading = "lazy";
            image.decoding = "async";
            image.addEventListener("load", () => fallback.hidden = true, { once: true });
            image.addEventListener("error", () => {
                if (item.previewFallbackUrl && image.dataset.fallbackAttempted !== "true") {
                    image.dataset.fallbackAttempted = "true";
                    image.src = item.previewFallbackUrl;
                    return;
                }
                loadPreviewThroughMemory(item, image, fallback);
            });
            preview.append(image);
        }
        preview.append(fallback);

        copy.className = "discord-expression-copy";
        name.textContent = item.name;
        details.textContent = `${item.type === "emoji" ? "Emoji" : "Sticker"} · ${item.formatLabel}`;
        if (!item.available) details.textContent += " · Şu anda kullanılamıyor";
        copy.append(name, details);

        download.type = "button";
        download.className = "discord-expression-download";
        download.dataset.downloadKey = item.key;
        download.textContent = "İndir";
        download.disabled = !downloadable || state.isDownloading;
        download.setAttribute("aria-label", `${item.name} dosyasını indir`);
        if (!downloadable) download.title = "Bu sticker formatı desteklenmiyor.";

        card.append(selection, preview, copy, download);
        return card;
    }

    function updateItemTabCounts() {
        const counts = {
            all: state.items.length,
            emoji: state.items.filter((item) => item.type === "emoji").length,
            sticker: state.items.filter((item) => item.type === "sticker").length,
        };
        elements.itemTabs.forEach((button) => {
            const count = button.querySelector("span");
            if (count) count.textContent = String(counts[button.dataset.discordItemFilter] || 0);
        });
    }

    function getVisibleItems() {
        return core.filterItems(state.items, state.itemFilter, state.itemQuery);
    }

    function handleGridChange(event) {
        const checkbox = event.target.closest("input[data-item-key]");
        if (!checkbox) return;
        if (checkbox.checked) state.selected.add(checkbox.dataset.itemKey);
        else state.selected.delete(checkbox.dataset.itemKey);
        checkbox.closest(".discord-expression-card")?.classList.toggle("is-selected", checkbox.checked);
        updateSelectionUi();
    }

    function handleGridClick(event) {
        const button = event.target.closest("[data-download-key]");
        if (!button) return;
        const item = state.items.find((candidate) => candidate.key === button.dataset.downloadKey);
        if (item) downloadSingleItem(item, button);
    }

    function selectVisibleItems() {
        getVisibleItems().forEach((item) => {
            if (item.downloadCandidates.length) state.selected.add(item.key);
        });
        renderItems();
        updateSelectionUi();
    }

    function clearSelection() {
        state.selected.clear();
        renderItems();
        updateSelectionUi();
    }

    function updateSelectionUi() {
        const count = state.selected.size;
        elements.selectedCount.textContent = `${count} öğe seçildi`;
        elements.zipButton.disabled = count === 0 || state.isDownloading;
        elements.selectAll.disabled = state.isDownloading || !state.items.length;
        elements.clearSelection.disabled = state.isDownloading || count === 0;
    }

    async function downloadSingleItem(item, button) {
        const previousText = button.textContent;
        button.disabled = true;
        button.textContent = "Hazırlanıyor…";
        clearNotice();
        try {
            const asset = await core.fetchDiscordAsset(item);
            const filename = core.createUniqueFilename(item.name, asset.extension, new Set());
            downloadBlob(new Blob([asset.data], { type: asset.contentType }), filename);
            showNotice(`${filename} indirilmeye hazırlandı.`, "success");
        } catch (error) {
            if (item.lottie && item.downloadCandidates[0]?.url && ["network", "timeout"].includes(error?.code)) {
                openDirectCdnDownload(item.downloadCandidates[0].url);
                showNotice("Lottie dosyası CORS nedeniyle ZIP belleğine alınamadı; orijinal Discord CDN dosyası yeni sekmede açıldı.", "warning");
            } else {
                showNotice(readableError(error, "Dosya indirilemedi."), "error");
            }
        } finally {
            button.textContent = previousText;
            button.disabled = state.isDownloading || !item.downloadCandidates.length;
        }
    }

    async function downloadSelectedZip(itemsOverride) {
        if (state.isDownloading || !state.guild) return;
        const chosenItems = itemsOverride || state.items.filter((item) => state.selected.has(item.key));
        if (!chosenItems.length) {
            showNotice("ZIP oluşturmak için en az bir öğe seçin.", "warning");
            return;
        }

        state.isDownloading = true;
        state.failed.clear();
        setDownloadUiBusy(true);
        showProgress(0, chosenItems.length, "Dosyalar hazırlanıyor…");
        clearNotice();
        const usedNames = { emoji: new Set(), sticker: new Set() };

        try {
            const results = await core.mapWithConcurrency(chosenItems, 5, async (item) => {
                const asset = await core.fetchDiscordAsset(item);
                const filename = core.createUniqueFilename(item.name, asset.extension, usedNames[item.type]);
                return {
                    path: `${item.type === "emoji" ? "Emojis" : "Stickers"}/${filename}`,
                    data: asset.data,
                };
            }, (completed, total) => showProgress(completed, total, "Dosyalar hazırlanıyor…"));

            const successfulEntries = [];
            results.forEach((result, index) => {
                if (result.status === "fulfilled") successfulEntries.push(result.value);
                else state.failed.add(chosenItems[index].key);
            });

            if (!successfulEntries.length) {
                throw new core.DiscordEmojiError("all_downloads_failed", "Seçilen dosyaların hiçbiri Discord CDN'inden alınamadı.");
            }

            showProgress(chosenItems.length, chosenItems.length, "ZIP oluşturuluyor…");
            await yieldToBrowser();
            const zip = core.createStoredZip([
                { path: "Emojis/", directory: true, data: new Uint8Array(0) },
                { path: "Stickers/", directory: true, data: new Uint8Array(0) },
                ...successfulEntries,
            ]);
            downloadBlob(zip, core.createZipFilename(state.guild.name));

            const failedCount = state.failed.size;
            const successCount = successfulEntries.length;
            if (failedCount) {
                showNotice(`${successCount} dosya indirildi, ${failedCount} dosya alınamadı. Başarısız dosyaları tekrar deneyebilirsiniz.`, "warning");
                elements.retryButton.hidden = false;
            } else {
                showNotice(`${successCount} dosya başarıyla hazırlandı.`, "success");
                elements.retryButton.hidden = true;
            }
            showProgress(chosenItems.length, chosenItems.length, "ZIP hazırlandı");
            announce(`${successCount} dosya başarıyla hazırlandı.`);
        } catch (error) {
            showNotice(readableError(error, "ZIP oluşturulamadı."), "error");
            elements.retryButton.hidden = state.failed.size === 0;
        } finally {
            state.isDownloading = false;
            setDownloadUiBusy(false);
            renderItems();
            updateSelectionUi();
        }
    }

    function retryFailedDownloads() {
        const failedItems = state.items.filter((item) => state.failed.has(item.key));
        if (!failedItems.length) return;
        state.selected.clear();
        failedItems.forEach((item) => state.selected.add(item.key));
        renderItems();
        updateSelectionUi();
        downloadSelectedZip(failedItems);
    }

    function showProgress(completed, total, label) {
        const percent = total ? Math.round((completed / total) * 100) : 0;
        elements.progress.hidden = false;
        elements.progressText.textContent = label;
        elements.progressCount.textContent = `${completed} / ${total}`;
        elements.progressBar.setAttribute("aria-valuemin", "0");
        elements.progressBar.setAttribute("aria-valuemax", String(total));
        elements.progressBar.setAttribute("aria-valuenow", String(completed));
        elements.progressFill.style.width = `${percent}%`;
    }

    function setInputBusy(busy) {
        elements.fileBrowse.disabled = busy;
        elements.fileBrowse.textContent = busy ? "Dosyalar okunuyor…" : "JSON Dosyası Seç";
    }

    function setConnectionBusy(busy) {
        state.isConnecting = busy;
        elements.botToken.disabled = busy;
        elements.botConnect.disabled = busy;
        elements.botConnect.textContent = busy ? "Sunucular Alınıyor…" : "Sunucuları Getir";
    }

    function setDownloadUiBusy(busy) {
        elements.zipButton.textContent = busy ? "ZIP Hazırlanıyor…" : "Seçilenleri ZIP Olarak İndir";
        elements.retryButton.disabled = busy;
        panel.querySelectorAll(".discord-expression-download, .discord-expression-select input").forEach((control) => {
            control.disabled = busy || control.closest(".discord-expression-card")?.querySelector(".discord-expression-download")?.title.length > 0;
        });
        updateSelectionUi();
    }

    function resetTool() {
        clearBotSession();
        state.guilds = [];
        state.guild = null;
        state.items = [];
        state.selected.clear();
        state.failed.clear();
        state.guildQuery = "";
        state.itemQuery = "";
        elements.guildSearch.value = "";
        elements.itemSearch.value = "";
        elements.manualInput.value = "";
        elements.botToken.value = "";
        releasePreviewCache();
        elements.guildBrowser.hidden = true;
        elements.assetBrowser.hidden = true;
        elements.progress.hidden = true;
        elements.retryButton.hidden = true;
        clearInputError();
        clearNotice();
        const focusTarget = state.inputMode === "bot" ? elements.botToken : state.inputMode === "manual" ? elements.manualInput : elements.fileBrowse;
        focusTarget.focus();
    }

    function clearBotSession() {
        state.connectionController?.abort();
        state.connectionController = null;
        state.botName = "";
        if (elements.botToken) elements.botToken.value = "";
    }

    function showInputError(message) {
        elements.inputError.textContent = message;
        elements.inputError.hidden = false;
        announce(message);
    }

    function clearInputError() {
        elements.inputError.textContent = "";
        elements.inputError.hidden = true;
    }

    function showNotice(message, type) {
        elements.notice.textContent = message;
        elements.notice.className = `discord-emoji-notice is-${type}`;
        elements.notice.hidden = false;
    }

    function clearNotice() {
        elements.notice.textContent = "";
        elements.notice.hidden = true;
    }

    function readableError(error, fallback) {
        if (error?.code === "rate_limit") return "Discord istek sınırına ulaşıldı. Lütfen kısa bir süre sonra tekrar deneyin.";
        if (error?.code === "invalid_token") return "Bot token geçersiz veya Discord tarafından iptal edilmiş. Developer Portal'dan güncel token'ı kontrol edin.";
        if (error?.code === "user_token_not_allowed") return "Normal Discord kullanıcı token'ları güvenlik ve Discord kuralları nedeniyle kabul edilmez. Lütfen bot token'ı kullanın.";
        if (error?.code === "network") return state.isConnecting || state.sourceMode === "bot"
            ? "Discord API'ye ağ veya CORS kısıtlaması nedeniyle bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
            : "Dosya ağ veya CORS kısıtlaması nedeniyle alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
        if (error?.code === "timeout") return "Discord isteği zaman aşımına uğradı. Lütfen tekrar deneyin.";
        if (["gateway_network", "gateway_closed", "gateway_zombie"].includes(error?.code)) {
            return "Discord Gateway bağlantısı kurulamadı veya erken kapandı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
        }
        if (error?.code === "gateway_timeout") return "Discord Gateway sunucu verilerini zamanında göndermedi. Lütfen tekrar bağlanın.";
        if (error?.code === "gateway_invalid_session") return "Discord yeni Gateway oturumu başlatamadı. Lütfen kısa bir süre bekleyip tekrar deneyin.";
        return typeof error?.message === "string" && error.message ? error.message : fallback;
    }

    function loadPreviewThroughMemory(item, image, fallback) {
        if (image.dataset.memoryAttempted === "true") {
            image.remove();
            return;
        }
        image.dataset.memoryAttempted = "true";

        let cached = state.previewCache.get(item.key);
        if (!cached) {
            const generation = state.previewGeneration;
            cached = { status: "loading", promise: queuePreviewRequest(() => core.fetchDiscordAsset(item)) };
            state.previewCache.set(item.key, cached);
            cached.promise.then((asset) => {
                if (generation !== state.previewGeneration) {
                    cached.status = "failed";
                    return "";
                }
                cached.status = "ready";
                cached.url = URL.createObjectURL(new Blob([asset.data], { type: asset.contentType }));
                cached.promise = null;
                trimPreviewCache();
                return cached.url;
            }).catch(() => {
                cached.status = "failed";
                cached.promise = null;
            });
        }

        if (cached.status === "failed") {
            image.remove();
            return;
        }

        const ready = cached.status === "ready" ? Promise.resolve(cached.url) : cached.promise?.then(() => cached.url);
        ready?.then((url) => {
            if (!url || !image.isConnected) return;
            image.removeAttribute("crossorigin");
            image.src = url;
        }).catch(() => image.remove());
    }

    function queuePreviewRequest(task) {
        return new Promise((resolve, reject) => {
            previewQueue.push({ task, resolve, reject });
            runPreviewQueue();
        });
    }

    function runPreviewQueue() {
        while (activePreviewRequests < MAX_PREVIEW_REQUESTS && previewQueue.length) {
            const job = previewQueue.shift();
            activePreviewRequests += 1;
            Promise.resolve()
                .then(job.task)
                .then(job.resolve, job.reject)
                .finally(() => {
                    activePreviewRequests -= 1;
                    runPreviewQueue();
                });
        }
    }

    function trimPreviewCache() {
        if (state.previewCache.size <= MAX_PREVIEW_CACHE) return;
        for (const [key, cached] of state.previewCache) {
            if (cached.status !== "ready") continue;
            URL.revokeObjectURL(cached.url);
            state.previewCache.delete(key);
            if (state.previewCache.size <= MAX_PREVIEW_CACHE) break;
        }
    }

    function releasePreviewCache() {
        state.previewGeneration += 1;
        state.previewCache.forEach((cached) => {
            if (cached.status === "ready" && cached.url) URL.revokeObjectURL(cached.url);
        });
        state.previewCache.clear();
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    function openDirectCdnDownload(url) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    }

    function announce(message) {
        elements.live.textContent = "";
        window.setTimeout(() => elements.live.textContent = message, 20);
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
})();
