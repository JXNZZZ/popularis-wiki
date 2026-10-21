// Turns the BlueMap render (MAP-RENDER/web) into a folder that works on
// GitHub Pages - or any plain static host - with no Java server running.
//
//   node tools/export-map.mjs [outputFolder]      (default: map/  - served at <site>/map/)
//
// Why this is needed: BlueMap saves its 3D tiles gzip-compressed (*.prbm.gz)
// and expects a web server that unpacks them on the fly and answers
// "204 empty" for tiles that were never rendered. GitHub Pages can't do
// either. So the export adds a tiny service worker (bluemap-sw.js) that does
// both jobs inside the visitor's browser.
//
// Re-run this after every re-render, then commit + push the map/ folder.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join("MAP-RENDER", "web");
const OUT = process.argv[2] || "map";
if (!existsSync(join(SRC, "index.html"))) {
    console.error("No BlueMap render found in " + SRC + " (run  java -jar bluemap-cli.jar -r  in MAP-RENDER first).");
    process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, {
    recursive: true,
    // source maps + the PHP/SQL backend are useless on a static host
    filter: src => !/\.js\.map$|sql\.php$/.test(src)
});

// only list maps that were actually rendered (nether/end weren't, and the
// viewer shows errors for missing maps)
const settingsPath = join(OUT, "settings.json");
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const rendered = readdirSync(join(OUT, "maps")).filter(m => existsSync(join(OUT, "maps", m, "settings.json")));
settings.maps = (settings.maps || []).filter(m => rendered.includes(m));
writeFileSync(settingsPath, JSON.stringify(settings));

// the real viewer moves to app.html; index.html becomes a loader that
// installs the service worker first (it has to control the page BEFORE
// the viewer starts asking for tiles)
let app = readFileSync(join(OUT, "index.html"), "utf8");
app = app.replace("<head>", `<head>
        <script>
            // opened without the tile unpacker in charge? go through the loader.
            // (checks it's OUR worker: the wiki's own worker also covers this folder)
            var c = navigator.serviceWorker && navigator.serviceWorker.controller;
            if (!c || !/bluemap-sw\.js/.test(c.scriptURL))
                location.replace("index.html" + location.search + location.hash);
        </script>`);
app = app.replace("<title>BlueMap</title>", "<title>Popularis Map</title>");
writeFileSync(join(OUT, "app.html"), app);

writeFileSync(join(OUT, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Popularis Map</title>
    <style>
        html, body { margin: 0; height: 100%; background: #0b0812; color: #cfc6b8;
            font: 15px "Segoe UI", system-ui, sans-serif; display: grid; place-items: center; }
    </style>
</head>
<body>
    <p id="msg">Loading the map&hellip;</p>
    <script>
        (function () {
            var msg = document.getElementById("msg");
            var go = function () { location.replace("app.html" + location.search + location.hash); };
            if (!("serviceWorker" in navigator) || !window.DecompressionStream) {
                msg.textContent = "This browser is too old for the 3D map - try an up-to-date Chrome, Firefox, Edge or Safari.";
                return;
            }
            // the wiki's own service worker also covers this folder, so check
            // that it's specifically the map's tile unpacker in charge
            var ours = function () {
                var c = navigator.serviceWorker.controller;
                return !!c && /bluemap-sw\.js/.test(c.scriptURL);
            };
            if (ours()) return go();
            navigator.serviceWorker.addEventListener("controllerchange", function () { if (ours()) go(); });
            navigator.serviceWorker.register("bluemap-sw.js").then(function () {
                return navigator.serviceWorker.ready;
            }).then(function () {
                setTimeout(function () { if (ours()) go(); else location.reload(); }, 600);
            }).catch(function (e) { msg.textContent = "Couldn't start the map: " + e.message; });
        })();
    </script>
</body>
</html>
`);

writeFileSync(join(OUT, "bluemap-sw.js"), `// Makes a BlueMap render work on a plain static host (GitHub Pages).
// - *.prbm tiles and textures.json are stored as .gz: fetch the .gz and
//   unpack it here (what BlueMap's own web server normally does)
// - tiles that were never rendered don't exist: answer "204 empty"
//   instead of a 404, exactly like BlueMap's server
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    const p = url.pathname;
    const packed = /\\.prbm$/.test(p) || /\\/textures\\.json$/.test(p);
    const tile = p.includes("/tiles/");
    if (!packed && !tile) return;

    e.respondWith((async () => {
        const res = await fetch(packed ? p + ".gz" + url.search : req);
        if (!res.ok) return tile ? new Response(null, { status: 204 }) : res;
        if (!packed) return res;
        const buf = new Uint8Array(await res.arrayBuffer());
        const type = p.endsWith(".json") ? "application/json" : "application/octet-stream";
        // some hosts unpack .gz themselves - only unpack if it's still gzip
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return new Response(buf, { headers: { "Content-Type": type } });
        const body = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(body, { headers: { "Content-Type": type } });
    })());
});
`);

writeFileSync(join(OUT, ".nojekyll"), "");   // GitHub Pages must not skip any files

writeFileSync(join(OUT, "README.md"), `# Popularis Map

The 3D BlueMap of the Popularis world, set up to run on GitHub Pages
(no Java server needed). The wiki's Locations page shows it in a frame,
and it's also at <site>/map/ on its own.

THIS FOLDER IS GENERATED - don't edit it by hand. To update the map:
1. Re-render in MAP-RENDER:  java -jar bluemap-cli.jar -r
2. In the wiki folder run:   node tools/export-map.mjs
3. Commit and push.
`);

const count = (function walk(d) { let n = 0; for (const f of readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? walk(join(d, f.name)) : 1; return n; })(OUT);
console.log("exported", count, "files to", OUT);
