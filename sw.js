/* ==================================================
   POPULARIS WIKI — service worker
   Repeat visits load instantly and the wiki keeps working offline.

   * The page shell (index.html) is network-first, so a new deployment
     shows up straight away when online, with the cached copy offline.
   * Everything else (CSS, JS, pages, images, fonts) is served from the
     cache immediately and refreshed in the background.

   The version comes from index.html (it registers "sw.js?v=<WIKI_ASSET_VERSION>";
   on deploy tools/build.mjs stamps a content hash there automatically),
   so bumping the version there is all a deploy needs: the new worker gets a
   new cache and deletes the old one when it activates.
================================================== */

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE = "popularis-" + VERSION;
const Q = "?v=" + VERSION;

const PAGES = ["about", "seasons", "players", "lore", "abilities", "locations", "items",
    "settings", "season1", "season2", "season3", "credits", "404"];

const PRECACHE = [
    "./",
    "index.html",
    "styles.css" + Q,
    "perf.js" + Q, "polish.js" + Q, "backgroundshader.js" + Q, "bg-core.js" + Q, "wikidata.js" + Q,
    "router.js" + Q, "wiki-features.js" + Q, "extras.js" + Q,
    "fonts/balatro.woff2",
    "images/wiki_title.webp",
    "images/favicon.png"
].concat(PAGES.map(p => "pages/" + p + ".html" + Q));

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE)
            // one failed file must not stop the others from being cached
            .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith("popularis-") && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;          // e.g. the BlueMap iframe

    // page shell: network first (so deploys show immediately), but never
    // wait more than 3 s on a bad connection before using the cached copy.
    // The cache refresh is registered with waitUntil synchronously, so it
    // survives even when the timeout answers first.
    if (req.mode === "navigate") {
        const net = fetch(req);
        event.waitUntil(net.then(res => {
            if (res.ok) return caches.open(CACHE).then(c => c.put("index.html", res.clone()));
        }).catch(() => {}));
        const fallback = () => caches.match("index.html");
        const timeout = new Promise(r => setTimeout(r, 3000)).then(fallback);
        event.respondWith(
            Promise.race([net.then(r => r.clone()).catch(fallback), timeout])
                .then(res => res || net)
                .catch(fallback)
        );
        return;
    }

    // HEAD requests, ranges etc. go straight to the network
    if (req.headers.has("range")) return;

    // Versioned files (?v=...) never change under the same URL: cache-first,
    // no background re-download on every visit (saves data on phones).
    if (url.searchParams.has("v")) {
        event.respondWith(caches.open(CACHE).then(cache =>
            cache.match(req).then(hit => hit || fetch(req).then(res => {
                if (res.ok && res.type === "basic") event.waitUntil(cache.put(req, res.clone()));
                return res;
            }))));
        return;
    }

    // everything else (images, fonts, skins): stale-while-revalidate, with
    // the background refresh kept alive by waitUntil
    const cached = caches.open(CACHE).then(cache => cache.match(req).then(hit => ({ cache, hit })));
    const refreshed = cached.then(({ cache, hit }) =>
        fetch(req)
            .then(res => {
                if (res.ok && res.type === "basic") return cache.put(req, res.clone()).then(() => res);
                return res;
            })
            .catch(() => hit || Response.error()));
    event.waitUntil(refreshed.catch(() => {}));
    event.respondWith(cached.then(({ hit }) => hit || refreshed));
});
