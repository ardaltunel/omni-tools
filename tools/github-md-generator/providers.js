(function initGithubMdProviders(root) {
    "use strict";

    const BROWSER_AI_LANGUAGES = new Set(["en", "de", "fr", "es"]);
    const providers = [];

    registerProvider({
        id: "openai-proxy",
        label: "OpenAI Yapay Zekâsı",
        async isAvailable() {
            return Boolean(getOpenAiEndpoint() && typeof root.fetch === "function");
        },
        async generate(context) {
            const endpoint = getOpenAiEndpoint();
            if (!endpoint) throw providerError("OpenAI ara katmanı yapılandırılmamış.", "OPENAI_NOT_CONFIGURED");

            context.onStatus?.("OpenAI yapay zekâsı proje verilerini işliyor…");
            const timeoutController = new AbortController();
            const timeoutMs = clamp(Number(root.GithubMdConfig?.requestTimeoutMs) || 45000, 5000, 90000);
            const timeoutId = root.setTimeout(() => timeoutController.abort(new DOMException("Zaman aşımı", "TimeoutError")), timeoutMs);
            const abortFromContext = () => timeoutController.abort(context.signal?.reason);
            context.signal?.addEventListener("abort", abortFromContext, { once: true });

            try {
                const response = await root.fetch(endpoint, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(createProxyPayload(context)),
                    cache: "no-store",
                    credentials: "omit",
                    referrerPolicy: "no-referrer",
                    signal: timeoutController.signal,
                });
                const payload = await readJsonResponse(response);
                if (!response.ok) {
                    throw providerError(getProxyFailureMessage(response.status, payload?.code), payload?.code || `HTTP_${response.status}`);
                }

                const markdown = cleanModelOutput(payload?.markdown);
                if (!isUsableMarkdown(markdown, context.fileName)) {
                    throw providerError("Yapay zekâ geçerli bir Markdown belgesi döndürmedi.", "INVALID_AI_OUTPUT");
                }
                const model = /^[a-z0-9._-]{1,64}$/i.test(String(payload?.model || "")) ? payload.model : "";
                return {
                    markdown: markdown.trim() + "\n",
                    providerLabel: model ? `OpenAI · ${model}` : "OpenAI Yapay Zekâsı",
                };
            } catch (error) {
                if (context.signal?.aborted) throw context.signal.reason || new DOMException("İstek iptal edildi", "AbortError");
                if (error?.name === "AbortError" || error?.name === "TimeoutError") {
                    throw providerError("OpenAI isteği zaman aşımına uğradı.", "OPENAI_TIMEOUT");
                }
                throw error;
            } finally {
                root.clearTimeout(timeoutId);
                context.signal?.removeEventListener("abort", abortFromContext);
            }
        },
    });

    registerProvider({
        id: "browser-ai",
        label: "Tarayıcı Yapay Zekâsı",
        async isAvailable(context) {
            if (!root.LanguageModel || !BROWSER_AI_LANGUAGES.has(context.language)) return false;
            const options = getLanguageOptions(context.language);
            try {
                const availability = await root.LanguageModel.availability(options);
                return availability !== "unavailable";
            } catch {
                return false;
            }
        },
        async generate(context) {
            const options = getLanguageOptions(context.language);
            const availability = await root.LanguageModel.availability(options);
            context.onStatus?.(availability === "available" ? "Yerel yapay zekâ taslağı iyileştiriyor…" : "Tarayıcı yapay zekâ modeli hazırlanıyor…");
            const session = await root.LanguageModel.create({
                ...options,
                signal: context.signal,
                monitor(monitor) {
                    monitor.addEventListener("downloadprogress", (event) => {
                        context.onStatus?.(`Tarayıcı yapay zekâ modeli indiriliyor: %${Math.round(event.loaded * 100)}`);
                    });
                },
            });

            try {
                const result = await session.prompt(createPrompt(context), { signal: context.signal });
                const markdown = cleanModelOutput(result);
                if (!isUsableMarkdown(markdown, context.fileName)) throw new Error("AI output validation failed");
                return markdown.trim() + "\n";
            } finally {
                session.destroy?.();
            }
        },
    });

    registerProvider({
        id: "smart-template",
        label: root.GithubMdStyleProfiles?.getDefault?.().label || "Akıllı şablon",
        async isAvailable() {
            return Boolean(root.GithubMdTemplates?.generate);
        },
        async generate(context) {
            return root.GithubMdTemplates.generate(context);
        },
    });

    function registerProvider(provider, options = {}) {
        if (!provider?.id || typeof provider.generate !== "function") throw new TypeError("Invalid Markdown provider");
        const existingIndex = providers.findIndex((item) => item.id === provider.id);
        if (existingIndex >= 0) providers.splice(existingIndex, 1);
        if (options.prepend) providers.unshift(provider);
        else providers.push(provider);
    }

    async function generate(context) {
        let lastError = null;
        const providerFailures = [];
        for (const provider of providers) {
            try {
                if (provider.isAvailable && !await provider.isAvailable(context)) continue;
                const output = await provider.generate(context);
                const markdown = typeof output === "string" ? output : output?.markdown;
                if (typeof markdown !== "string") throw providerError("Sağlayıcı geçerli bir Markdown çıktısı döndürmedi.", "INVALID_PROVIDER_OUTPUT");
                return {
                    markdown,
                    provider: provider.id,
                    providerLabel: output?.providerLabel || provider.label,
                    providerFailures,
                };
            } catch (error) {
                if (error?.name === "AbortError") throw error;
                lastError = error;
                providerFailures.push({
                    provider: provider.id,
                    providerLabel: provider.label,
                    message: error?.userMessage || "Sağlayıcı kullanılamadı.",
                    code: error?.code || "PROVIDER_ERROR",
                });
            }
        }
        throw lastError || new Error("No Markdown generator provider is available");
    }

    function getOpenAiEndpoint() {
        const value = String(root.GithubMdConfig?.aiEndpoint || "").trim();
        if (!value) return "";
        try {
            const url = new URL(value);
            const isLocal = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
            if (url.protocol !== "https:" && !isLocal) return "";
            return url.href;
        } catch {
            return "";
        }
    }

    function createProxyPayload(context) {
        const repo = context.repository;
        return {
            fileName: context.fileName,
            language: context.language,
            additionalInformation: context.additionalInformation || "",
            fallbackMarkdown: context.fallbackMarkdown,
            repository: {
                owner: repo.owner,
                name: repo.name,
                fullName: repo.fullName,
                htmlUrl: repo.htmlUrl,
                description: repo.description || "",
                topics: repo.topics,
                mainLanguage: repo.mainLanguage || "",
                languages: repo.languages,
                license: repo.license || "",
                defaultBranch: repo.defaultBranch || "",
                scripts: repo.scripts,
                projectStructure: repo.projectStructure,
                detectedTech: repo.detectedTech,
                readme: repo.readme ? repo.readme.slice(0, 6000) : "",
            },
        };
    }

    async function readJsonResponse(response) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) return null;
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    function getProxyFailureMessage(status, code) {
        if (status === 401 || code === "OPENAI_AUTH") return "OpenAI kimlik doğrulaması başarısız oldu.";
        if (status === 429 || code === "OPENAI_RATE_LIMIT") return "OpenAI kullanım veya istek sınırına ulaşıldı.";
        if (status === 503 || code === "OPENAI_NOT_CONFIGURED") return "OpenAI hizmeti şu anda kullanılamıyor.";
        return "OpenAI ile belge oluşturulamadı.";
    }

    function providerError(message, code) {
        const error = new Error(message);
        error.code = code;
        error.userMessage = message;
        return error;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function getLanguageOptions(language) {
        return {
            expectedInputs: [{ type: "text", languages: Array.from(new Set(["en", language])) }],
            expectedOutputs: [{ type: "text", languages: [language] }],
        };
    }

    function createPrompt(context) {
        const repo = context.repository;
        const verifiedFacts = {
            name: repo.name,
            description: repo.description || null,
            topics: repo.topics,
            mainLanguage: repo.mainLanguage || null,
            detectedTechnologies: repo.detectedTech,
            license: repo.license || null,
            defaultBranch: repo.defaultBranch,
            packageScripts: repo.scripts,
            topLevelStructure: repo.projectStructure,
            existingReadmeExcerpt: repo.readme ? repo.readme.slice(0, 6000) : null,
            additionalInformation: context.additionalInformation || null,
        };
        const styleProfile = root.GithubMdStyleProfiles?.getDefault?.();
        return [
            `Improve the supplied ${context.fileName} Markdown draft for a public GitHub repository.`,
            `Write the entire result in language code "${context.language}".`,
            "Return Markdown only, without wrapping it in a code fence.",
            "Use only the verified facts below. Never invent features, commands, support contacts, response times, versions, or policies.",
            "Preserve all essential sections from the draft. Keep commands and URLs exact.",
            styleProfile ? `Follow the ${styleProfile.label} style profile: ${styleProfile.principles.join(" ")}` : "",
            "",
            "VERIFIED FACTS:",
            JSON.stringify(verifiedFacts, null, 2),
            "",
            "DRAFT:",
            context.fallbackMarkdown,
        ].join("\n");
    }

    function cleanModelOutput(value) {
        let output = String(value || "").trim();
        if (/^```(?:markdown|md)?\s*[\s\S]*\s*```$/i.test(output)) {
            output = output.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "");
        }
        return output;
    }

    function isUsableMarkdown(markdown, fileName) {
        if (markdown.length < 180 || !/^#\s+/m.test(markdown)) return false;
        const headingCount = (markdown.match(/^#{1,6}\s+/gm) || []).length;
        if (fileName === "README.md") return headingCount >= 5;
        return headingCount >= 4;
    }

    root.GithubMdProviders = Object.freeze({
        generate,
        registerProvider,
        list: () => providers.map(({ id, label }) => ({ id, label })),
    });
}(window));
