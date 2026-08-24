(function exposeOmniAiMarkdown(global) {
    "use strict";

    function safeUrl(value) {
        try {
            const url = new URL(String(value || ""), global.location?.href || "https://example.com");
            return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
        } catch { return ""; }
    }

    function appendInline(parent, source) {
        const text = String(source || "");
        const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_))/gu;
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            if (match.index > offset) parent.append(document.createTextNode(text.slice(offset, match.index)));
            if (match[2] !== undefined) {
                const href = safeUrl(match[3]);
                if (href) {
                    const link = document.createElement("a");
                    link.href = href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = match[2];
                    parent.append(link);
                } else parent.append(document.createTextNode(match[2]));
            } else if (match[4] !== undefined) {
                const code = document.createElement("code");
                code.textContent = match[4];
                parent.append(code);
            } else if (match[5] !== undefined || match[6] !== undefined) {
                const strong = document.createElement("strong");
                appendInline(strong, match[5] ?? match[6]);
                parent.append(strong);
            } else {
                const emphasis = document.createElement("em");
                appendInline(emphasis, match[7] ?? match[8]);
                parent.append(emphasis);
            }
            offset = match.index + match[0].length;
        }
        if (offset < text.length) parent.append(document.createTextNode(text.slice(offset)));
    }

    function isTableDivider(line) {
        return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
    }

    function tableCells(line) {
        return line.trim().replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim());
    }

    function createCodeBlock(language, code) {
        const wrapper = document.createElement("div");
        const toolbar = document.createElement("div");
        const label = document.createElement("span");
        const copy = document.createElement("button");
        const pre = document.createElement("pre");
        const codeElement = document.createElement("code");
        wrapper.className = "omni-ai-code-block";
        toolbar.className = "omni-ai-code-toolbar";
        label.textContent = language || "Kod";
        copy.type = "button";
        copy.textContent = "Kopyala";
        copy.setAttribute("aria-label", "Kod bloğunu kopyala");
        copy.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(code);
                copy.textContent = "Kopyalandı";
                global.setTimeout(() => { copy.textContent = "Kopyala"; }, 1600);
            } catch { copy.textContent = "Kopyalanamadı"; }
        });
        codeElement.className = language ? `language-${language.replace(/[^a-z0-9_-]/giu, "")}` : "";
        codeElement.textContent = code;
        pre.append(codeElement);
        toolbar.append(label, copy);
        wrapper.append(toolbar, pre);
        return wrapper;
    }

    function renderMarkdown(container, markdown) {
        const fragment = document.createDocumentFragment();
        const lines = String(markdown || "").replace(/\r\n?/gu, "\n").split("\n");
        let index = 0;
        let paragraph = [];

        const flushParagraph = () => {
            if (!paragraph.length) return;
            const element = document.createElement("p");
            appendInline(element, paragraph.join("\n"));
            fragment.append(element);
            paragraph = [];
        };

        while (index < lines.length) {
            const line = lines[index];
            const fence = line.match(/^```\s*([\w.+-]*)\s*$/u);
            if (fence) {
                flushParagraph();
                const content = [];
                index += 1;
                while (index < lines.length && !/^```\s*$/u.test(lines[index])) content.push(lines[index++]);
                fragment.append(createCodeBlock(fence[1], content.join("\n")));
                index += 1;
                continue;
            }

            if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
                flushParagraph();
                const table = document.createElement("table");
                const head = document.createElement("thead");
                const headRow = document.createElement("tr");
                tableCells(line).forEach((value) => {
                    const cell = document.createElement("th");
                    appendInline(cell, value);
                    headRow.append(cell);
                });
                head.append(headRow);
                table.append(head);
                index += 2;
                const body = document.createElement("tbody");
                while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
                    const row = document.createElement("tr");
                    tableCells(lines[index]).forEach((value) => {
                        const cell = document.createElement("td");
                        appendInline(cell, value);
                        row.append(cell);
                    });
                    body.append(row);
                    index += 1;
                }
                table.append(body);
                const scroll = document.createElement("div");
                scroll.className = "omni-ai-table-scroll";
                scroll.append(table);
                fragment.append(scroll);
                continue;
            }

            const heading = line.match(/^(#{1,4})\s+(.+)$/u);
            if (heading) {
                flushParagraph();
                const element = document.createElement(`h${heading[1].length + 1}`);
                appendInline(element, heading[2]);
                fragment.append(element);
                index += 1;
                continue;
            }

            if (/^>\s?/u.test(line)) {
                flushParagraph();
                const quote = document.createElement("blockquote");
                const values = [];
                while (index < lines.length && /^>\s?/u.test(lines[index])) values.push(lines[index++].replace(/^>\s?/u, ""));
                appendInline(quote, values.join("\n"));
                fragment.append(quote);
                continue;
            }

            const listMatch = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/u);
            if (listMatch) {
                flushParagraph();
                const ordered = Boolean(listMatch[2]);
                const list = document.createElement(ordered ? "ol" : "ul");
                while (index < lines.length) {
                    const itemMatch = lines[index].match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/u);
                    if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
                    const item = document.createElement("li");
                    appendInline(item, itemMatch[3]);
                    list.append(item);
                    index += 1;
                }
                fragment.append(list);
                continue;
            }

            if (!line.trim()) {
                flushParagraph();
                index += 1;
                continue;
            }
            paragraph.push(line);
            index += 1;
        }
        flushParagraph();
        container.replaceChildren(fragment);
    }

    global.OmniAiMarkdown = Object.freeze({ renderMarkdown, safeUrl });
})(window);
