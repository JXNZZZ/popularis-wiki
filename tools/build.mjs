// Production build for GitHub Pages: copies the site into _site/ and
// minifies the JS + CSS there. You keep editing the normal, readable files;
// the deploy workflow (.github/workflows/pages.yml) runs this on every push.
//
// Run locally (optional):  npm ci && npm run build
import { execFileSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const OUT = "_site";
const BIN = process.env.BIN || join("node_modules", ".bin");
const win = process.platform === "win32";
const bin = name => join(BIN, name + (win ? ".cmd" : ""));

// what gets published (never the BlueMap export, source art, tooling)
const SKIP = new Set(["_site", "node_modules", ".git", ".github", ".claude", "tools",
    "MAP-RENDER", "public", "_originals", "package.json", "package-lock.json"]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of readdirSync(".")) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    cpSync(entry, join(OUT, entry), { recursive: true });
}

// unused leftovers that shouldn't be published
for (const f of ["editor.js", "JS-Instructions.png", "fonts/balatro2.ttf", "images/test.png"]) {
    if (existsSync(join(OUT, f))) rmSync(join(OUT, f));
}

// Gallery: shrink anything huge (phones would download a 6 MB screenshot
// just to view it) and make a small WebP thumbnail for the grid. The
// gallery page asks for images/gallery/thumbs/<name>.webp.
const GAL = join(OUT, "images", "gallery");
if (existsSync(GAL)) {
    const sharp = (await import("sharp")).default;
    mkdirSync(join(GAL, "thumbs"), { recursive: true });
    let n = 0;
    for (const f of readdirSync(GAL)) {
        const m = /^(.+)\.(jpe?g|png|webp)$/i.exec(f);
        if (!m) continue;
        const src = join(GAL, f);
        const input = readFileSync(src);
        await sharp(input).rotate().resize({ width: 480, withoutEnlargement: true })
            .webp({ quality: 72 }).toFile(join(GAL, "thumbs", m[1] + ".webp"));
        const meta = await sharp(input).metadata();
        if (meta.width > 1920) {                       // same file name + format, just smaller
            const big = sharp(input).rotate().resize({ width: 1920 });
            const ext = m[2].toLowerCase();
            const out = ext === "png" ? big.png({ compressionLevel: 9, palette: false })
                      : ext === "webp" ? big.webp({ quality: 82 }) : big.jpeg({ quality: 85, mozjpeg: true });
            writeFileSync(src, await out.toBuffer());
        }
        n++;
    }
    console.log("gallery:", n, "pictures, thumbnails made");
}

// minify every top-level script (libs/ is already minified)
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: win });
for (const f of readdirSync(OUT)) {
    if (!f.endsWith(".js") || !statSync(join(OUT, f)).isFile()) continue;
    run(bin("esbuild"), [join(OUT, f), "--minify", "--target=es2019", "--allow-overwrite",
        "--outfile=" + join(OUT, f), "--log-level=warning"]);
}
run(bin("lightningcss"), ["--minify", join(OUT, "styles.css"), "-o", join(OUT, "styles.css")]);

// Content-hash versioning: the asset version becomes a hash of everything
// being published, so ANY edit (a page, the CSS, an image) automatically gets
// new URLs and a new service-worker cache. No version to bump by hand, and
// returning visitors can never be stuck on stale files.
const hash = createHash("sha256");
(function walk(dir) {
    for (const f of readdirSync(dir).sort()) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else { hash.update(p.split("\\").join("/")); hash.update(readFileSync(p)); }
    }
})(OUT);
const version = hash.digest("hex").slice(0, 10);
const indexPath = join(OUT, "index.html");
const html = readFileSync(indexPath, "utf8")
    .replace(/window\.WIKI_ASSET_VERSION = "[^"]*"/, `window.WIKI_ASSET_VERSION = "${version}"`)
    .replace(/\?v=[0-9A-Za-z]+/g, "?v=" + version);
writeFileSync(indexPath, html);

console.log("built", OUT, "version", version);
