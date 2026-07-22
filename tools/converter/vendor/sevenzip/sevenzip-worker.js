import SevenZip from "./7zz.es6.js";

const COMPRESSION_LEVELS = Object.freeze({
    fast: "1",
    balanced: "5",
    maximum: "9",
});

self.addEventListener("message", async (event) => {
    let stage = "başlatma";
    const logs = [];
    try {
        const { files, outputFormat, compression } = event.data || {};
        if (!Array.isArray(files) || !files.length) throw new Error("Arşivlenecek dosya bulunamadı.");

        const module = await SevenZip({
            locateFile: (name) => new URL(name, import.meta.url).href,
            print: (message) => logs.push(String(message)),
            printErr: (message) => logs.push(String(message)),
        });

        stage = "çalışma alanı";
        module.FS.mkdir("/omni-output");
        module.FS.chdir("/omni-output");

        stage = "dosyaları hazırlama";
        const inputPaths = writeInputFiles(module.FS, files);
        const level = COMPRESSION_LEVELS[compression] || COMPRESSION_LEVELS.balanced;
        stage = "arşiv üretme";
        const outputPath = createArchive(module, inputPaths, outputFormat, level);
        stage = "çıktıyı okuma";
        const output = module.FS.readFile(outputPath).slice();
        if (!output.byteLength) throw new Error("Arşiv motoru boş bir çıktı oluşturdu.");

        self.postMessage({ ok: true, output: output.buffer }, [output.buffer]);
    } catch (error) {
        self.postMessage({
            ok: false,
            message: `${stage}: ${error?.message || String(error)} ${logs.slice(-2).join(" ")}`.trim(),
        });
    }
});

function writeInputFiles(fileSystem, files) {
    const usedPaths = new Set();
    return files.map((entry, index) => {
        const path = uniquePath(entry.pathname || `dosya-${index + 1}`, usedPaths);
        ensureParentDirectories(fileSystem, path);
        fileSystem.writeFile(path, new Uint8Array(entry.data));
        return path;
    });
}

function createArchive(module, inputPaths, outputFormat, level) {
    if (outputFormat === "tar.gz") {
        run(module, ["a", "-ttar", "cikti.tar", ...inputPaths, "-y", "-bd", "-bso0", "-bsp0", "-bse0"]);
        run(module, ["a", "-tgzip", "cikti.tar.gz", "cikti.tar", `-mx=${level}`, "-y", "-bd", "-bso0", "-bsp0", "-bse0"]);
        return "cikti.tar.gz";
    }

    const type = outputFormat === "7z" ? "7z" : outputFormat === "tar" ? "tar" : "zip";
    const outputPath = `cikti.${type}`;
    const options = type === "tar" ? [] : [`-mx=${level}`];
    run(module, ["a", `-t${type}`, outputPath, ...inputPaths, ...options, "-y", "-bd", "-bso0", "-bsp0", "-bse0"]);
    return outputPath;
}

function run(module, args) {
    const result = module.callMain(args);
    if (result !== 0) throw new Error("Arşiv motoru işlemi tamamlayamadı.");
}

function uniquePath(path, usedPaths) {
    const normalized = String(path || "dosya").replace(/^\/+/, "");
    if (!usedPaths.has(normalized)) {
        usedPaths.add(normalized);
        return normalized;
    }

    const dot = normalized.lastIndexOf(".");
    const base = dot > 0 ? normalized.slice(0, dot) : normalized;
    const extension = dot > 0 ? normalized.slice(dot) : "";
    let counter = 2;
    let candidate = `${base}-${counter}${extension}`;
    while (usedPaths.has(candidate)) candidate = `${base}-${++counter}${extension}`;
    usedPaths.add(candidate);
    return candidate;
}

function ensureParentDirectories(fileSystem, path) {
    const parts = path.split("/").slice(0, -1);
    let current = "";
    parts.forEach((part) => {
        current = current ? `${current}/${part}` : part;
        try {
            fileSystem.mkdir(current);
        } catch (error) {
            if (error?.errno !== 20) throw error;
        }
    });
}
