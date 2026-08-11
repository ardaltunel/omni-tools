(function initConversionEngine(root) {
    "use strict";

    const namespace = root.OmniConverter = root.OmniConverter || {};
    const { Registry, Adapters, Services } = namespace;

    class ConversionEngine {
        constructor({ liveElement, onProgress } = {}) {
            if (!Registry || !Adapters || !Services) throw new Error("Dönüştürme altyapısı yüklenemedi.");
            this.listeners = new Set();
            this.items = [];
            this.selectedId = null;
            this.nextId = 1;
            this.batchRunning = false;
            this.loadingFiles = false;
            this.generation = 0;
            this.batchController = null;
            this.downloadManager = new Services.DownloadManager();
            this.zipManager = new Services.ZipManager();
            this.notificationManager = new Services.NotificationManager(liveElement);
            this.progressManager = new Services.ProgressManager(onProgress);
            this.switchCategory("image", false);
        }

        subscribe(listener) {
            this.listeners.add(listener);
            listener(this.snapshot());
            return () => this.listeners.delete(listener);
        }

        snapshot() {
            return {
                category: this.category,
                adapter: this.adapter,
                settings: { ...this.settings },
                items: this.items,
                selectedId: this.selectedId,
                batchRunning: this.batchRunning,
                loadingFiles: this.loadingFiles,
            };
        }

        switchCategory(categoryId, shouldAnnounce = true) {
            const category = Registry.get(categoryId);
            if (!category || category.id === this.category?.id) return;
            this.cancelAll(false);
            this.releaseAll();
            this.items = [];
            this.selectedId = null;
            this.category = category;
            this.adapter = Adapters.create(category);
            this.settings = Registry.defaultSettings(category.id);
            this.generation += 1;
            this.progressManager.reset("Dosya bekleniyor");
            this.emit();
            if (shouldAnnounce) this.notificationManager.announce(`${category.label} kategorisi seçildi.`);
        }

        setSetting(key, value) {
            const field = this.category.settings.find((entry) => entry.key === key);
            if (!field) return;
            this.settings[key] = field.type === "range" ? Number(value) : field.type === "toggle" ? Boolean(value) : value;
            if (this.category.id === "video" && key === "outputFormat") {
                const compatibleCodecs = this.category.codecCompatibility?.[value] || [];
                if (!compatibleCodecs.includes(this.settings.codec)) this.settings.codec = compatibleCodecs[0] || "h264";
            }
            this.invalidateOutputs();
        }

        async addFiles(fileList) {
            const files = Array.from(fileList || []);
            if (!files.length || this.batchRunning || this.loadingFiles) return;
            const generation = this.generation;
            this.loadingFiles = true;
            this.emit();
            this.progressManager.start(files.length, `${files.length} dosya inceleniyor...`);
            let added = 0;
            let rejected = 0;

            for (let index = 0; index < files.length; index += 1) {
                if (generation !== this.generation) break;
                const file = files[index];
                await Services.yieldToMain();
                try {
                    if (this.isDuplicate(file)) {
                        rejected += 1;
                        this.notificationManager.announce(`${Services.safeDisplayName(file.name)} zaten listede bulunuyor.`);
                    } else {
                        const validation = await this.adapter.validate(file);
                        const metadata = await this.adapter.inspect(file, validation);
                        if (generation !== this.generation) break;
                        const item = {
                            id: this.nextId++,
                            file,
                            sourceBlob: validation.sourceBlob,
                            sourceUrl: URL.createObjectURL(validation.sourceBlob),
                            type: validation.type,
                            extension: validation.extension,
                            metadata,
                            outputBlob: null,
                            outputUrl: null,
                            outputName: "",
                            outputMetadata: null,
                            status: "Bekliyor",
                            error: "",
                            processing: false,
                            controller: null,
                        };
                        this.items.push(item);
                        this.selectedId ||= item.id;
                        added += 1;
                    }
                } catch (error) {
                    rejected += 1;
                    this.notificationManager.announce(`${Services.safeDisplayName(file.name)}: ${friendlyError(error)}`);
                }
                this.progressManager.update(index + 1, `${index + 1}/${files.length} dosya incelendi`);
                this.emit();
            }

            this.loadingFiles = false;
            const parts = [];
            if (added) parts.push(`${added} dosya eklendi.`);
            if (rejected) parts.push(`${rejected} dosya eklenemedi.`);
            this.progressManager.reset(this.items.length ? "Dönüştürme bekleniyor" : "Dosya bekleniyor");
            this.notificationManager.announce(parts.join(" ") || "Dosya eklenemedi.");
            this.emit();
        }

        async convertItem(itemId, fromBatch = false) {
            const item = this.items.find((entry) => entry.id === itemId);
            if (!item || item.processing || (!fromBatch && this.batchRunning)) return false;
            if (!this.adapter.ready) {
                this.notificationManager.announce(this.category.capabilityText);
                return false;
            }

            const generation = this.generation;
            item.controller = new AbortController();
            item.processing = true;
            item.status = "Dönüştürülüyor...";
            item.error = "";
            this.releaseOutput(item);
            this.emit();
            await Services.yieldToMain();

            try {
                const conversionSettings = { ...this.settings };
                const result = await this.adapter.convert(item, conversionSettings, item.controller.signal);
                if (generation !== this.generation || item.controller.signal.aborted) throw createAbortError();
                item.outputBlob = result.blob;
                item.outputUrl = URL.createObjectURL(result.blob);
                item.outputName = Services.replaceExtension(item.file.name, this.adapter.outputExtension(conversionSettings));
                item.outputMetadata = result;
                item.status = "Tamamlandı";
                this.notificationManager.announce(`${Services.safeDisplayName(item.file.name)} dönüştürüldü.`);
                return true;
            } catch (error) {
                if (error?.name === "AbortError") {
                    item.status = "İptal edildi";
                    item.error = "İşlem kullanıcı tarafından iptal edildi.";
                } else {
                    item.status = "Hata";
                    item.error = friendlyError(error);
                    this.notificationManager.announce(`${Services.safeDisplayName(item.file.name)}: ${item.error}`);
                }
                return false;
            } finally {
                item.processing = false;
                item.controller = null;
                this.emit();
            }
        }

        async convertAll() {
            if (!this.items.length || this.batchRunning || this.loadingFiles) return;
            if (!this.adapter.ready) {
                this.notificationManager.announce(this.category.capabilityText);
                return;
            }

            this.batchRunning = true;
            this.batchController = new AbortController();
            this.progressManager.start(this.items.length, "Toplu dönüştürme başlıyor...");
            this.emit();
            let succeeded = 0;
            let completed = 0;

            for (const item of this.items) {
                if (this.batchController.signal.aborted) break;
                if (await this.convertItem(item.id, true)) succeeded += 1;
                completed += 1;
                this.progressManager.update(completed, `${completed}/${this.items.length} tamamlandı`);
                await Services.yieldToMain();
            }

            const cancelled = this.batchController.signal.aborted;
            this.batchRunning = false;
            this.batchController = null;
            this.progressManager.finish(cancelled
                ? `${completed}/${this.items.length} işlemden sonra iptal edildi`
                : `${succeeded}/${this.items.length} dönüşüm tamamlandı`);
            this.notificationManager.announce(cancelled ? "Toplu işlem iptal edildi." : `${succeeded} dosya başarıyla dönüştürüldü.`);
            this.emit();
        }

        cancelItem(itemId) {
            this.items.find((item) => item.id === itemId)?.controller?.abort();
        }

        cancelAll(shouldAnnounce = true) {
            this.batchController?.abort();
            this.items.forEach((item) => item.controller?.abort());
            if (shouldAnnounce && (this.batchRunning || this.items.some((item) => item.processing))) {
                this.notificationManager.announce("İşlem iptal ediliyor...");
            }
        }

        selectItem(itemId) {
            if (!this.items.some((item) => item.id === itemId)) return;
            this.selectedId = itemId;
            this.emit();
        }

        removeItem(itemId) {
            if (this.batchRunning) return;
            const index = this.items.findIndex((item) => item.id === itemId);
            if (index === -1) return;
            this.items[index].controller?.abort();
            this.releaseItem(this.items[index]);
            this.items.splice(index, 1);
            if (this.selectedId === itemId) this.selectedId = this.items[index]?.id || this.items[index - 1]?.id || null;
            this.progressManager.reset(this.items.length ? "Dönüştürme bekleniyor" : "Dosya bekleniyor");
            this.emit();
        }

        clear() {
            if (this.batchRunning || this.loadingFiles) return;
            this.cancelAll(false);
            this.releaseAll();
            this.items = [];
            this.selectedId = null;
            this.generation += 1;
            this.progressManager.reset("Dosya bekleniyor");
            this.notificationManager.announce("Dosya listesi temizlendi.");
            this.emit();
        }

        downloadItem(itemId) {
            const item = this.items.find((entry) => entry.id === itemId);
            if (!item?.outputBlob) return;
            this.downloadManager.download(item.outputBlob, item.outputName);
        }

        downloadAll() {
            const completed = this.completedItems();
            if (!completed.length) return;
            this.downloadManager.downloadMany(completed.map((item) => ({ blob: item.outputBlob, name: item.outputName })));
            this.notificationManager.announce(`${completed.length} dosya için indirme başlatıldı.`);
        }

        async downloadZip() {
            const completed = this.completedItems();
            if (completed.length < 2 || this.batchRunning) return;
            this.batchRunning = true;
            this.progressManager.start(completed.length, "ZIP hazırlanıyor...");
            this.emit();
            try {
                const blob = await this.zipManager.create(completed.map((item) => ({
                    name: item.outputName,
                    blob: item.outputBlob,
                    lastModified: item.file.lastModified,
                })));
                this.downloadManager.download(blob, `donusturulen-dosyalar-${dateStamp()}.zip`);
                this.progressManager.finish("ZIP hazırlandı");
                this.notificationManager.announce("ZIP dosyası başarıyla hazırlandı.");
            } catch (error) {
                this.progressManager.reset("ZIP oluşturulamadı");
                this.notificationManager.announce(friendlyError(error));
            } finally {
                this.batchRunning = false;
                this.emit();
            }
        }

        getSelectedItem() {
            return this.items.find((item) => item.id === this.selectedId) || null;
        }

        completedItems() {
            return this.items.filter((item) => item.outputBlob);
        }

        estimate(item) {
            return this.adapter.estimate(item.file, item.metadata, this.settings);
        }

        outputNote() {
            return this.adapter.outputNote(this.settings);
        }

        invalidateOutputs() {
            this.items.forEach((item) => {
                this.releaseOutput(item);
                item.status = "Bekliyor";
                item.error = "";
            });
            this.progressManager.reset(this.items.length ? "Dönüştürme bekleniyor" : "Dosya bekleniyor");
            this.emit();
        }

        isDuplicate(file) {
            return this.items.some((item) => item.file.name === file.name
                && item.file.size === file.size
                && item.file.lastModified === file.lastModified);
        }

        releaseAll() {
            this.items.forEach((item) => this.releaseItem(item));
        }

        releaseItem(item) {
            if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
            this.releaseOutput(item);
        }

        releaseOutput(item) {
            if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
            item.outputBlob = null;
            item.outputUrl = null;
            item.outputName = "";
            item.outputMetadata = null;
        }

        emit() {
            const state = this.snapshot();
            this.listeners.forEach((listener) => listener(state));
        }
    }

    function friendlyError(error) {
        const message = error instanceof Error ? error.message : String(error || "Bilinmeyen hata.");
        if (/memory|allocation|array buffer|out of memory/i.test(message)) return "Dosya belleğe sığmayacak kadar büyük.";
        if (/decode|source image|corrupt/i.test(message)) return "Dosya bozuk veya tarayıcı tarafından açılamıyor.";
        return message || "Dönüştürme sırasında bir hata oluştu.";
    }

    function createAbortError() {
        return new DOMException("İşlem iptal edildi.", "AbortError");
    }

    function dateStamp() {
        const date = new Date();
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    }

    namespace.ConversionEngine = ConversionEngine;
})(window);
