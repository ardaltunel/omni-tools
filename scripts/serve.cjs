"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIME_TYPES = Object.freeze({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".wasm": "application/wasm", ".mp3": "audio/mpeg",
    ".mp4": "video/mp4", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
});

function isWithin(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function createStaticServer({ root = path.resolve(__dirname, "..") } = {}) {
    const staticRoot = fs.realpathSync(root);
    return http.createServer((request, response) => {
        const fail = (status, message, extra = {}) => {
            response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
            response.end(request.method === "HEAD" ? undefined : message);
        };
        if (!["GET", "HEAD"].includes(request.method)) return fail(405, "Yalnızca GET ve HEAD desteklenir.", { allow: "GET, HEAD" });
        const host = request.headers.host || "";
        if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return fail(403, "Yerel sunucu adresi gerekiyor.");
        let pathname;
        try { pathname = decodeURIComponent((request.url || "/").split("?")[0]); }
        catch { return fail(400, "Geçersiz adres."); }
        if (!pathname.startsWith("/") || /[\\\0]/.test(pathname)) return fail(400, "Geçersiz adres.");
        const segments = pathname.split("/").filter(Boolean);
        if (segments.some((segment) => segment.startsWith("."))) return fail(403, "Bu dosyaya erişilemez.");
        let filename = path.resolve(staticRoot, `.${pathname}`);
        if (!isWithin(staticRoot, filename)) return fail(403, "Bu dosyaya erişilemez.");
        try {
            if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, "index.html");
            if (!fs.existsSync(filename) && !path.extname(pathname)) filename = path.join(staticRoot, "index.html");
            const realFile = fs.realpathSync(filename);
            if (!isWithin(staticRoot, realFile) || !fs.statSync(realFile).isFile()) return fail(403, "Bu dosyaya erişilemez.");
            const stats = fs.statSync(realFile);
            response.writeHead(200, {
                "content-type": MIME_TYPES[path.extname(realFile).toLowerCase()] || "application/octet-stream",
                "content-length": stats.size,
                "cache-control": "no-store", "x-content-type-options": "nosniff",
            });
            if (request.method === "HEAD") return response.end();
            const stream = fs.createReadStream(realFile);
            stream.on("error", () => response.destroy());
            stream.pipe(response);
        } catch { return fail(404, "Dosya bulunamadı."); }
    });
}

if (require.main === module) {
    const args = process.argv.slice(2);
    let port = 8765;
    if (args.length) {
        if (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1])) {
            process.stderr.write("Kullanım: node scripts/serve.cjs [--port 8765]\n");
            process.exitCode = 1;
        } else port = Number(args[1]);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        process.stderr.write("Port 1 ile 65535 arasında olmalı.\n");
        process.exitCode = 1;
    }
    if (!process.exitCode) {
        const server = createStaticServer();
        server.on("error", (error) => {
            process.stderr.write(error.code === "EADDRINUSE"
                ? `${port} portu zaten kullanımda. Mevcut yerel sunucuyu kullanın veya --port ile farklı bir port seçin.\n`
                : `Sunucu başlatılamadı: ${error.message}\n`);
            process.exitCode = 1;
        });
        server.listen(port, "127.0.0.1", () => {
            process.stdout.write(`Omni Tools: http://127.0.0.1:${port}/emlak-portfoy-analizi\nDurdurmak için Ctrl+C.\n`);
        });
    }
}

module.exports = { createStaticServer, isWithin, MIME_TYPES };
