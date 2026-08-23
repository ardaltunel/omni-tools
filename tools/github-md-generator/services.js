(function initGithubMdServices(root) {
    "use strict";

    const API_ROOT = "https://api.github.com";
    const API_VERSION = "2026-03-10";
    const MAX_TREE_ITEMS = 180;

    class GithubApiError extends Error {
        constructor(message, details = {}) {
            super(message);
            this.name = "GithubApiError";
            Object.assign(this, details);
        }
    }

    function parseRepositoryUrl(value) {
        const rawValue = String(value || "").trim();
        let url;
        try {
            url = new URL(rawValue);
        } catch {
            throw new GithubApiError("Geçerli bir GitHub depo adresi girin.", { code: "INVALID_URL" });
        }

        if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
            throw new GithubApiError("URL https://github.com/kullanici/proje biçiminde olmalıdır.", { code: "INVALID_URL" });
        }

        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length !== 2) {
            throw new GithubApiError("Bir deponun ana adresini girin; sorun bildirimi, dal veya dosya bağlantıları desteklenmez.", { code: "INVALID_URL" });
        }

        const owner = decodeURIComponent(segments[0]);
        const repo = decodeURIComponent(segments[1]).replace(/\.git$/i, "");
        if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(owner) || !/^[a-z0-9._-]+$/i.test(repo)) {
            throw new GithubApiError("GitHub kullanıcı veya depo adı geçersiz görünüyor.", { code: "INVALID_URL" });
        }

        return {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
        };
    }

    async function analyzeRepository(repositoryUrl, options = {}) {
        const reference = parseRepositoryUrl(repositoryUrl);
        const request = (path) => fetchGithubJson(path, options.signal);
        const repo = await request(`/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}`);

        if (repo.private) {
            throw new GithubApiError("Bu araç yalnızca herkese açık GitHub depolarını analiz edebilir.", { code: "PRIVATE_REPOSITORY" });
        }

        const basePath = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
        const branch = repo.default_branch || "main";
        const supplemental = await fetchSupplemental([
            `${basePath}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
            `${basePath}/readme`,
            `${basePath}/contents/package.json?ref=${encodeURIComponent(branch)}`,
            `${basePath}/languages`,
        ], request);

        const treeResult = settledValue(supplemental[0]);
        const readmeResult = settledValue(supplemental[1]);
        const packageResult = settledValue(supplemental[2]);
        const languagesResult = settledValue(supplemental[3]);
        const tree = normalizeTree(treeResult?.tree || []);
        const packageJson = parsePackageJson(packageResult);
        const warnings = supplemental
            .map((result, index) => result.status === "rejected" ? getSupplementalWarning(index, result.reason) : null)
            .filter(Boolean);

        if (treeResult?.truncated) {
            warnings.push("Depo ağacı GitHub API sınırı nedeniyle kısmi analiz edildi.");
        }

        const languages = Object.keys(languagesResult || {});
        const analysis = {
            source: "github-api",
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            htmlUrl: repo.html_url,
            cloneUrl: repo.clone_url,
            description: repo.description || "",
            homepage: repo.homepage || "",
            topics: Array.isArray(repo.topics) ? repo.topics : [],
            mainLanguage: repo.language || languages[0] || "",
            languages,
            license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : "",
            licenseName: repo.license?.name || "",
            defaultBranch: branch,
            archived: Boolean(repo.archived),
            hasIssues: Boolean(repo.has_issues),
            hasDiscussions: Boolean(repo.has_discussions),
            hasPages: Boolean(repo.has_pages),
            readme: decodeGithubContent(readmeResult).slice(0, 16000),
            packageJson,
            dependencies: packageJson ? {
                runtime: Object.keys(packageJson.dependencies || {}),
                development: Object.keys(packageJson.devDependencies || {}),
            } : { runtime: [], development: [] },
            scripts: packageJson?.scripts || {},
            files: tree.files,
            directories: tree.directories,
            projectStructure: tree.projectStructure,
            treeTruncated: Boolean(treeResult?.truncated || tree.truncated),
            warnings,
        };

        analysis.detectedTech = detectTechnologies(analysis);
        return analysis;
    }

    function createManualRepository(repositoryUrl, additionalInformation = "") {
        const reference = parseRepositoryUrl(repositoryUrl);
        return {
            source: "manual-fallback",
            owner: reference.owner,
            name: reference.repo,
            fullName: reference.fullName,
            htmlUrl: reference.htmlUrl,
            cloneUrl: `${reference.htmlUrl}.git`,
            description: String(additionalInformation || "").trim(),
            homepage: "",
            topics: [],
            mainLanguage: "",
            languages: [],
            license: "",
            licenseName: "",
            defaultBranch: "",
            archived: false,
            hasIssues: false,
            hasDiscussions: false,
            hasPages: false,
            readme: "",
            packageJson: null,
            dependencies: { runtime: [], development: [] },
            scripts: {},
            files: [],
            directories: [],
            projectStructure: [],
            treeTruncated: false,
            detectedTech: [],
            warnings: ["GitHub analizi kullanılamadığı için yalnızca manuel proje bilgileri kullanıldı."],
        };
    }

    async function fetchGithubJson(path, signal) {
        let response;
        try {
            response = await fetch(`${API_ROOT}${path}`, {
                signal,
                headers: {
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": API_VERSION,
                },
            });
        } catch (error) {
            if (error?.name === "AbortError") throw error;
            throw new GithubApiError("GitHub API'ye bağlanılamadı. Ağ bağlantınızı kontrol edin.", {
                code: "NETWORK_ERROR",
                cause: error,
            });
        }

        if (!response.ok) {
            let apiMessage = "";
            try {
                apiMessage = (await response.json())?.message || "";
            } catch {
                apiMessage = "";
            }

            const remaining = response.headers.get("x-ratelimit-remaining");
            const resetAt = Number(response.headers.get("x-ratelimit-reset")) || 0;
            const isRateLimited = response.status === 403 && remaining === "0";
            let message = "Depo analiz edilemedi.";
            if (response.status === 404) message = "Herkese açık depo bulunamadı. Adresi ve deponun görünürlüğünü kontrol edin.";
            if (isRateLimited) message = "GitHub API istek limiti doldu. Manuel proje açıklamasıyla devam edebilirsiniz.";

            throw new GithubApiError(message, {
                code: isRateLimited ? "RATE_LIMIT" : `HTTP_${response.status}`,
                status: response.status,
                apiMessage,
                resetAt,
            });
        }

        return response.json();
    }

    function settledValue(result) {
        return result?.status === "fulfilled" ? result.value : null;
    }

    async function fetchSupplemental(paths, request) {
        const results = [];
        for (const path of paths) {
            try {
                results.push({ status: "fulfilled", value: await request(path) });
            } catch (error) {
                results.push({ status: "rejected", reason: error });
                if (error?.code === "RATE_LIMIT") {
                    while (results.length < paths.length) results.push({ status: "rejected", reason: error });
                    break;
                }
            }
        }
        return results;
    }

    function getSupplementalWarning(index, error) {
        if ([1, 2].includes(index) && error?.code === "HTTP_404") return null;
        const labels = ["klasör yapısı", "README", "package.json", "dil dağılımı"];
        return `${labels[index]} alınamadı${error?.code === "RATE_LIMIT" ? " (API limiti)" : ""}.`;
    }

    function decodeGithubContent(payload) {
        if (!payload?.content || payload.encoding !== "base64") return "";
        try {
            const binary = atob(payload.content.replace(/\s/g, ""));
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        } catch {
            return "";
        }
    }

    function parsePackageJson(payload) {
        const content = decodeGithubContent(payload);
        if (!content) return null;
        try {
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    function normalizeTree(entries) {
        const ignored = /(^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.idea|\.vscode)(?:\/|$)/i;
        const safeEntries = entries.filter((entry) => entry?.path && !ignored.test(entry.path));
        const files = safeEntries.filter((entry) => entry.type === "blob").map((entry) => entry.path);
        const explicitDirectories = safeEntries.filter((entry) => entry.type === "tree").map((entry) => entry.path);
        const inferredDirectories = files.flatMap((path) => {
            const parts = path.split("/");
            return parts.length > 1 ? parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/")) : [];
        });
        const directories = Array.from(new Set([...explicitDirectories, ...inferredDirectories]));
        const topLevelEntries = safeEntries
            .filter((entry) => !entry.path.includes("/"))
            .sort((left, right) => {
                if (left.type !== right.type) return left.type === "tree" ? -1 : 1;
                return left.path.localeCompare(right.path);
            })
            .slice(0, 28)
            .map((entry) => ({ path: entry.path, type: entry.type === "tree" ? "directory" : "file" }));

        return {
            files: files.slice(0, MAX_TREE_ITEMS),
            directories: directories.slice(0, MAX_TREE_ITEMS),
            projectStructure: topLevelEntries,
            truncated: files.length > MAX_TREE_ITEMS || directories.length > MAX_TREE_ITEMS,
        };
    }

    function detectTechnologies(analysis) {
        const dependencies = new Set([
            ...(analysis.dependencies.runtime || []),
            ...(analysis.dependencies.development || []),
        ].map((value) => value.toLowerCase()));
        const files = new Set(analysis.files.map((value) => value.toLowerCase()));
        const technologies = [];
        const add = (value) => { if (value && !technologies.includes(value)) technologies.push(value); };

        const dependencyMap = [
            ["react", "React"], ["next", "Next.js"], ["vue", "Vue"], ["nuxt", "Nuxt"],
            ["svelte", "Svelte"], ["@angular/core", "Angular"], ["vite", "Vite"],
            ["typescript", "TypeScript"], ["tailwindcss", "Tailwind CSS"], ["express", "Express"],
            ["fastify", "Fastify"], ["electron", "Electron"], ["astro", "Astro"],
            ["jest", "Jest"], ["vitest", "Vitest"], ["playwright", "Playwright"],
            ["@supabase/supabase-js", "Supabase"],
        ];
        dependencyMap.forEach(([dependency, label]) => { if (dependencies.has(dependency)) add(label); });

        const fileSignals = [
            ["requirements.txt", "Python"], ["pyproject.toml", "Python"], ["cargo.toml", "Rust"],
            ["go.mod", "Go"], ["composer.json", "PHP"], ["gemfile", "Ruby"],
            ["pom.xml", "Maven"], ["dockerfile", "Docker"], ["deno.json", "Deno"],
        ];
        fileSignals.forEach(([file, label]) => { if (files.has(file) || files.has(`./${file}`)) add(label); });
        if (analysis.files.some((file) => /(^|\/)(?:supabase-config\.js|supabase\/)/i.test(file)) || analysis.topics.includes("supabase")) add("Supabase");
        if (analysis.hasPages || analysis.topics.includes("github-pages")) add("GitHub Pages");
        add(analysis.mainLanguage);
        analysis.languages.slice(0, 3).forEach(add);
        return technologies.slice(0, 8);
    }

    root.GithubMdServices = Object.freeze({
        GithubApiError,
        analyzeRepository,
        createManualRepository,
        parseRepositoryUrl,
    });
}(window));
