// Makes a BlueMap render work on a plain static host (GitHub Pages).
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
    const packed = /\.prbm$/.test(p) || /\/textures\.json$/.test(p);
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
