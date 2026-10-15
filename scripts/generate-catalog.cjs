"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

function decodeHtml(value) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
    return String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
        if (code[0] !== "#") return named[code.toLowerCase()];
        const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
            ? String.fromCodePoint(number) : "\ufffd";
    });
}

// Evaluate only one explicitly named Object.freeze literal, never index.js or
// its browser boot code. The tiny VM has no injected browser or Node globals.
function readFrozenConstant(source, name) {
    const declaration = `const ${name} = Object.freeze(`;
    const start = source.indexOf(declaration);
    if (start < 0) throw new Error(`Missing catalog constant: ${name}`);
    const valueStart = start + declaration.length;
    let depth = 1;
    let quote = "";
    let escaped = false;
    for (let cursor = valueStart; cursor < source.length; cursor += 1) {
        const character = source[cursor];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = "";
            continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === "(") depth += 1;
        else if (character === ")" && --depth === 0) {
            const literal = source.slice(valueStart, cursor).trim();
            if (!["[", "{"].includes(literal[0])) throw new Error(`${name} must remain a data literal`);
            return JSON.parse(vm.runInNewContext(`JSON.stringify(${literal})`, Object.create(null), { timeout: 100 }));
        }
    }
    throw new Error(`Unclosed catalog constant: ${name}`);
}

function readCatalogData(source) {
    const categories = readFrozenConstant(source, "appHomeCategories");
    const icons = readFrozenConstant(source, "appHomeCategoryIcons");
    if (!Array.isArray(categories) || !categories.length) throw new Error("The catalog needs categories");
    const ids = new Set();
    categories.forEach((category) => {
        if (!/^[a-z][a-z0-9-]*$/.test(category.id) || ids.has(category.id)
            || typeof category.name !== "string" || typeof category.description !== "string"
            || !Array.isArray(category.sourceCategories) || !category.sourceCategories.every((value) => typeof value === "string")
            || typeof icons[category.icon] !== "string" || !icons[category.icon].startsWith("<svg ")) {
            throw new Error(`Invalid catalog category: ${category.id}`);
        }
        ids.add(category.id);
    });
    return { categories, icons };
}

function readNavigation(html) {
    const nav = html.match(/<nav\b[^>]*\bid="tool-nav"[^>]*>([\s\S]*?)<\/nav>/);
    if (!nav) throw new Error("Missing canonical #tool-nav");
    const buttons = [...nav[1].matchAll(/<button\b[\s\S]*?<\/button>/g)];
    const tools = buttons.map(([raw]) => {
        const attributes = Object.fromEntries([...raw.slice(0, raw.indexOf(">") + 1)
            .matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
            .map(([, key, , value]) => [key, decodeHtml(value)]));
        const label = raw.match(/<span\b[^>]*>([\s\S]*?)<\/span>/)?.[1];
        if (!attributes.class?.split(/\s+/).includes("nav-item") || !label
            || !/^[a-z][a-z0-9-]*$/.test(attributes["data-tool"])) throw new Error("Invalid canonical navigation button");
        return {
            id: attributes["data-tool"], name: decodeHtml(label.replace(/<[^>]*>/g, "").trim()),
            category: attributes["data-category"] || "", description: attributes["data-description"] || "", raw,
        };
    });
    if (!tools.length || new Set(tools.map((tool) => tool.id)).size !== tools.length) throw new Error("Missing or duplicate tool IDs");
    return tools.sort((first, second) => first.name.localeCompare(second.name, "tr", { sensitivity: "base" }));
}

function categoryFor(tool, categories) {
    return categories.find((category) => category.sourceCategories.includes(tool.category)) || categories[2] || categories[0];
}

function replaceRegion(html, name, content, indent) {
    const start = `<!-- catalog:${name}:start -->`;
    const end = `<!-- catalog:${name}:end -->`;
    if (html.split(start).length !== 2 || html.split(end).length !== 2) throw new Error(`Missing or duplicate ${name} markers`);
    const from = html.indexOf(start) + start.length;
    const to = html.indexOf(end);
    if (to < from) throw new Error(`Reversed ${name} markers`);
    return `${html.slice(0, from)}\n${content}\n${indent}${html.slice(to)}`;
}

function renderFilters(tools, categories) {
    return categories.map((category) => {
        const count = tools.filter((tool) => categoryFor(tool, categories).id === category.id).length;
        return `                        <button class="app-home-category-filter" type="button" data-category="${escapeHtml(category.id)}" aria-pressed="false"><span>${escapeHtml(category.name)}</span><small>${count}</small></button>`;
    }).join("\n");
}

function renderCards(tools, categories, icons) {
    return categories.map((category) => {
        const members = tools.filter((tool) => categoryFor(tool, categories).id === category.id);
        const cards = members.map((tool) => `                            <button class="app-home-card" type="button" data-tool="${escapeHtml(tool.id)}" data-category="${escapeHtml(category.id)}" aria-label="${escapeHtml(tool.name)} uygulamasını aç">
                                <span class="app-home-card-copy"><span class="app-home-card-name">${escapeHtml(tool.name)}</span>${tool.description ? `<small class="app-home-card-description">${escapeHtml(tool.description)}</small>` : ""}</span>
                                <span class="app-home-card-arrow" aria-hidden="true">→</span>
                            </button>`).join("\n");
        return `                    <section class="app-home-category-section" data-category="${escapeHtml(category.id)}" id="app-home-category-${escapeHtml(category.id)}">
                        <div class="app-home-category-heading">
                            <div class="app-home-category-title-group">
                                <span class="app-home-category-symbol" aria-hidden="true">${icons[category.icon]}</span>
                                <div><h2>${escapeHtml(category.name)}</h2><p>${escapeHtml(category.description)}</p></div>
                            </div>
                            <span class="app-home-category-count" data-category-count="${escapeHtml(category.id)}">${members.length} araç</span>
                        </div>
                        <div class="app-home-category-grid">
${cards}
                        </div>
                    </section>`;
    }).join("\n");
}

function renderInitialRoute(tools, source) {
    const aliases = readFrozenConstant(source, "legacyToolRoutes");
    const routes = Object.create(null);
    tools.forEach((tool) => {
        const slug = tool.name.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        routes[tool.id] = tool.id;
        routes[slug] = tool.id;
    });
    Object.entries(aliases).forEach(([alias, tool]) => {
        if (!/^[a-z0-9-]+$/.test(alias) || !tools.some((item) => item.id === tool)) throw new Error(`Invalid legacy route: ${alias}`);
        routes[alias] = tool;
    });
    return `    <script>
        // Generated from canonical navigation and router aliases. Select only
        // the requested tool while the rest of the document is still parsing.
        (() => {
            const routes = ${JSON.stringify(routes)};
            const url = new URL(window.location.href);
            const basePath = new URL(document.baseURI).pathname;
            let requested = url.searchParams.get("tool");
            if (!requested) {
                if (url.protocol !== "file:" && !url.pathname.startsWith(basePath)) return;
                const path = url.protocol === "file:" ? url.hash.replace(/^#\\/?/, "") : url.pathname.slice(basePath.length);
                const segments = path.split("/").filter(Boolean);
                if (segments.length !== 1 || segments[0] === "index.html") return;
                try { requested = decodeURIComponent(segments[0]); } catch { return; }
            }
            const tool = Object.hasOwn(routes, requested) && routes[requested];
            if (!tool) return;
            document.documentElement.dataset.initialTool = tool;
            const style = document.createElement("style");
            style.id = "initial-tool-style";
            style.textContent = \`#app-home{display:none}#\${tool}.tool-panel{display:block}\`;
            document.head.append(style);
        })();
    </script>`;
}

function generateCatalog(html, source) {
    html = html.replace(/\r\n/g, "\n");
    const { categories, icons } = readCatalogData(source);
    const tools = readNavigation(html);
    html = replaceRegion(html, "routes", renderInitialRoute(tools, source), "    ");
    html = replaceRegion(html, "nav", tools.map((tool) => `                ${tool.raw.trim()}`).join("\n"), "                ");
    html = replaceRegion(html, "filters", renderFilters(tools, categories), "                        ");
    html = replaceRegion(html, "cards", renderCards(tools, categories, icons), "                    ");
    html = html.replace(/(<strong id="app-home-tool-count">)\d+(<\/strong>)/, `$1${tools.length}$2`)
        .replace(/(<b id="app-home-category-count">)\d+(<\/b>)/, `$1${categories.length}$2`)
        .replace(/<small>\d+ uygulama, tek panel<\/small>/, `<small>${tools.length} uygulama, tek panel</small>`);
    return { html, tools, categories, icons };
}

function main() {
    const flags = process.argv.slice(2);
    if (flags.some((flag) => flag !== "--check")) throw new Error("Usage: node scripts/generate-catalog.cjs [--check]");
    const htmlPath = path.join(projectRoot, "index.html");
    const original = fs.readFileSync(htmlPath, "utf8");
    const result = generateCatalog(original, fs.readFileSync(path.join(projectRoot, "index.js"), "utf8"));
    if (flags.includes("--check")) {
        if (result.html !== original.replace(/\r\n/g, "\n")) {
            console.error("Catalog is stale. Run: node scripts/generate-catalog.cjs");
            process.exitCode = 1;
            return;
        }
        console.log(`Catalog is current: ${result.tools.length} tools, ${result.categories.length} categories.`);
        return;
    }
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    fs.writeFileSync(htmlPath, result.html.replace(/\n/g, newline));
    console.log(`Generated ${result.tools.length} tools and ${result.categories.length} categories in index.html.`);
}

module.exports = { escapeHtml, decodeHtml, readFrozenConstant, readCatalogData, readNavigation, renderFilters, renderCards, renderInitialRoute, generateCatalog };
if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
