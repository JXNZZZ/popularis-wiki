/* ==================================================
   POPULARIS WIKI — feature layer
   infoboxes • wiki-links • related pages • TOC •
   image lightbox • reading progress • category
   drawer • recently-updated feed
   Loaded AFTER router.js; hooks #content mutations.
================================================== */

(function () {
    "use strict";

    var WIKI = window.WIKI;
    if (!WIKI) return;

    var content = document.getElementById("content");
    var contentBox = document.querySelector(".content-box");

    function go(page) {
        if (typeof window.navigateToPage === "function") window.navigateToPage(page);
    }
    function label(p) { return WIKI.label(p); }
    function pref(cls) { return document.documentElement.classList.contains(cls); }

    /* ==================================================
       READING PROGRESS  (built once)
    ================================================== */
    (function readingProgress() {
        var fill = document.getElementById("reading-progress-fill");
        if (!fill || !contentBox || !window.POP) return;
        // scaleX (compositor-only) instead of width (layout + paint per frame)
        var last = -1;
        POP.onScroll("progress", {
            read: function (box) {
                var max = box.scrollHeight - box.clientHeight;
                return max > 0 ? box.scrollTop / max : 0;
            },
            write: function (f) {
                f = Math.round(f * 1000) / 1000;
                if (f !== last) { last = f; fill.style.transform = "scaleX(" + f + ")"; }
            }
        });
    })();

    /* ==================================================
       HOME SCROLL JOURNEY — parallax + scroll-spy + reveal
       (one persistent scroll listener; acts only on the
        home page's .home-scroll, otherwise no-ops)
    ================================================== */
    // Registered with the batched scheduler only while the home page is
    // showing: every rect is READ first, then every transform/class WRITTEN,
    // and writes are skipped when nothing changed. Parallax is a GPU
    // translate3d and is off entirely on the low tier / reduced motion.
    function homeScrollHandler(home) {
        var panels = Array.prototype.slice.call(home.querySelectorAll(".scroll-panel"));
        var bgs = panels.map(function (p) { return p.querySelector(".scroll-panel-bg"); });
        var inners = panels.map(function (p) { return p.querySelector(".scroll-panel-inner"); });
        var dots = Array.prototype.slice.call(home.querySelectorAll(".rail-dot"));
        var lastShift = panels.map(function () { return null; });
        var lastActive = null;

        return {
            read: function (box) {
                var cRect = box.getBoundingClientRect();
                var cCenter = cRect.top + cRect.height / 2;
                var rects = panels.map(function (p) { return p.getBoundingClientRect(); });
                return { cRect: cRect, cCenter: cCenter, rects: rects };
            },
            write: function (d) {
                if (!home.isConnected) return;
                var parallax = !(window.POP && POP.tier === "low") && !pref("pref-reduce-motion");
                var activeId = null, bestDist = Infinity;
                d.rects.forEach(function (r, i) {
                    var pCenter = r.top + r.height / 2;
                    var visible = r.bottom > d.cRect.top && r.top < d.cRect.bottom;
                    // parallax: only for panels on screen, only when it moved a whole px
                    if (bgs[i] && parallax && visible) {
                        var shift = Math.round(((pCenter - d.cCenter) / d.cRect.height) * 52);
                        if (shift !== lastShift[i]) {
                            lastShift[i] = shift;
                            bgs[i].style.transform = "translate3d(0," + shift + "px,0)";
                        }
                    }
                    // reveal the side card once the panel is meaningfully in view
                    if (inners[i] && r.top < d.cRect.bottom - 70 && r.bottom > d.cRect.top + 70 &&
                        !inners[i].classList.contains("revealed")) {
                        inners[i].classList.add("revealed");
                    }
                    var dist = Math.abs(pCenter - d.cCenter);
                    if (dist < bestDist) { bestDist = dist; activeId = panels[i].id; }
                });
                if (activeId && activeId !== lastActive) {
                    lastActive = activeId;
                    dots.forEach(function (dot) { dot.classList.toggle("active", dot.dataset.target === activeId); });
                }
            }
        };
    }

    function enhanceHomeScroll(scope, page) {
        if (!window.POP) return;
        var home = page === "about" ? scope.querySelector(".home-scroll") : null;
        if (!home) { POP.onScroll("home", null); return; }
        if (home.dataset.wired) return;
        home.dataset.wired = "1";

        // panels use scroll-reveal, not the blanket .fade-in (which would
        // pre-show them and defeat the effect)
        scope.querySelectorAll(".story-panel .scroll-panel-inner").forEach(function (el) {
            el.classList.remove("fade-in");
        });

        // side-car dots -> smooth-scroll the target panel into the card
        home.querySelectorAll(".rail-dot").forEach(function (dot) {
            dot.addEventListener("click", function () {
                var t = document.getElementById(dot.dataset.target);
                if (t) POP.scrollTo(t);
            });
        });

        POP.onScroll("home", homeScrollHandler(home));   // also runs an initial pass
    }

    /* ==================================================
       IMAGE LIGHTBOX  (built once, delegated)
    ================================================== */
    var lightbox = (function () {
        var overlay = document.createElement("div");
        overlay.id = "lightbox";
        overlay.innerHTML =
            '<button id="lightbox-close" aria-label="Close">&times;</button>' +
            '<div id="lightbox-count"></div>' +
            '<button id="lightbox-prev" aria-label="Previous image">&#8249;</button>' +
            '<figure id="lightbox-stage"><img id="lightbox-img" alt=""><figcaption id="lightbox-cap"></figcaption></figure>' +
            '<button id="lightbox-next" aria-label="Next image">&#8250;</button>';
        document.body.appendChild(overlay);

        var img = overlay.querySelector("#lightbox-img");
        var cap = overlay.querySelector("#lightbox-cap");
        var count = overlay.querySelector("#lightbox-count");
        var prevBtn = overlay.querySelector("#lightbox-prev");
        var nextBtn = overlay.querySelector("#lightbox-next");

        var items = [];
        var idx = 0;

        // full-size images come as WebP where a WebP version exists
        var webpOK = (function () {
            try { return document.createElement("canvas").toDataURL("image/webp").indexOf("data:image/webp") === 0; }
            catch (e) { return false; }
        })();
        function render() {
            var it = items[idx];
            if (!it) return;
            img.decoding = "async";
            img.src = (webpOK && /^images\/(thumbs\/)?explore_[a-z0-9]+\.jpg$/.test(it.src)) ? it.src.replace(/\.jpg$/, ".webp") : it.src;
            img.alt = it.cap || "";
            cap.textContent = it.cap || "";
            var multi = items.length > 1;
            prevBtn.style.display = multi ? "" : "none";
            nextBtn.style.display = multi ? "" : "none";
            count.style.display = multi ? "" : "none";
            count.textContent = (idx + 1) + " / " + items.length;
        }
        function open(list, index) {
            items = list || [];
            idx = index || 0;
            render();
            overlay.classList.add("show");
        }
        function close() { overlay.classList.remove("show"); }
        function step(d) {
            if (items.length < 2) return;
            idx = (idx + d + items.length) % items.length;
            render();
        }

        overlay.addEventListener("click", function (e) {
            if (e.target === overlay || e.target.id === "lightbox-close") close();
        });
        img.addEventListener("click", function (e) {
            e.stopPropagation();
            if (items.length > 1) step(1); else close();
        });
        prevBtn.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
        nextBtn.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
        document.addEventListener("keydown", function (e) {
            if (!overlay.classList.contains("show")) return;
            if (e.key === "Escape") close();
            else if (e.key === "ArrowLeft") step(-1);
            else if (e.key === "ArrowRight") step(1);
        });
        return { open: open, close: close };
    })();

    function enhanceLightbox(scope) {
        scope.querySelectorAll("img").forEach(function (im) {
            if (im.dataset.zoomWired) return;
            if (im.id === "skin-canvas") return;
            if (im.closest("#nav-logo, .infobox, .gallery")) return; // gallery wires itself
            im.dataset.zoomWired = "1";
            im.style.cursor = "zoom-in";
            im.addEventListener("click", function () {
                lightbox.open([{ src: im.src, cap: im.alt || im.dataset.caption || "" }], 0);
            });
        });
    }

    /* ==================================================
       GALLERY (data-driven from WIKI.PAGES[page].gallery)
    ================================================== */
    function enhanceGallery(scope, page) {
        var meta = WIKI.PAGES[page];
        var gal = meta && meta.gallery;
        if (!gal || !gal.length) return;
        if (scope.querySelector(".gallery")) return;

        // The grid shows small thumbnails (WebP where available); the full
        // image is only downloaded when it's opened in the lightbox.
        var thumbs = gal.map(function (it, i) {
            var th = it.thumb || (/^images\/explore_[a-z0-9]+\.jpg$/.test(it.src) ? it.src.replace("images/", "images/thumbs/") : it.src);
            var webp = /^images\/thumbs\/explore_/.test(th) ? '<source type="image/webp" srcset="' + th.replace(/\.jpg$/, ".webp") + '">' : "";
            return '<button class="gallery-item" data-i="' + i + '" aria-label="' + (it.cap || "Image") + '">' +
                   '<picture>' + webp + '<img src="' + th + '" alt="' + (it.cap || "") + '" loading="lazy" decoding="async" width="640" height="360"></picture>' +
                   (it.cap ? '<span class="gallery-cap">' + it.cap + "</span>" : "") +
                   "</button>";
        }).join("");
        var gridHTML = '<div class="gallery">' + thumbs + "</div>";

        // Season pages already ship an #s2-gallery section ("Coming soon") —
        // replace its placeholder. Otherwise append a fresh Gallery section.
        var section = scope.querySelector("#s2-gallery");
        if (section) {
            section.querySelectorAll("p").forEach(function (p) { p.remove(); });
            section.insertAdjacentHTML("beforeend", gridHTML);
        } else {
            var block = document.createElement("section");
            block.className = "gallery-section";
            block.innerHTML = "<h2>Gallery</h2>" + gridHTML;
            var refs = scope.querySelector(".page-refs");
            if (refs) scope.insertBefore(block, refs);
            else scope.appendChild(block);
            section = block;
        }

        var items = gal.slice();
        section.querySelectorAll(".gallery-item").forEach(function (btn) {
            btn.addEventListener("click", function () {
                lightbox.open(items, parseInt(btn.dataset.i, 10) || 0);
            });
        });
    }

    /* ==================================================
       LAST-UPDATED strip
    ================================================== */
    function enhanceMeta(scope, page) {
        if (page === "about") return;   // home has its own immersive hero
        var meta = WIKI.PAGES[page];
        if (!meta) return;
        if (scope.querySelector(".page-meta-strip")) return;

        var cat = WIKI.categoryOf(page);
        var d = new Date(meta.updated + "T00:00:00");
        var nice = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

        var strip = document.createElement("div");
        strip.className = "page-meta-strip";
        strip.innerHTML =
            (cat ? '<span class="pm-cat" data-cat="' + cat + '">' + cat + "</span>" : "") +
            '<span class="pm-updated">Updated ' + nice + "</span>";

        // place right after the first heading if present, else at top
        var firstH = scope.querySelector("h1");
        if (firstH && firstH.parentNode) {
            firstH.parentNode.insertBefore(strip, firstH.nextSibling);
        } else {
            scope.insertBefore(strip, scope.firstChild);
        }

        var chip = strip.querySelector(".pm-cat");
        if (chip) chip.addEventListener("click", function () {
            if (window._wikiOpenDrawer) window._wikiOpenDrawer();
        });
    }

    /* ==================================================
       INFOBOX  (player pages)
    ================================================== */
    function enhanceInfobox(scope, page) {
        var p = WIKI.PLAYERS[page];
        if (!p) return;
        var col = scope.querySelector("#player-sidebar-column");
        if (!col || col.querySelector(".infobox")) return;

        var teamLabel = p.team === "volcanic" ? "Volcanic Team"
                       : p.team === "jungle" ? "Jungle Team"
                       : "Unaffiliated";
        var teamClass = p.team ? "team-" + p.team : "team-none";

        var box = document.createElement("aside");
        box.className = "infobox";
        box.innerHTML =
            '<div class="infobox-title">' + p.name + "</div>" +
            '<div class="infobox-badge ' + teamClass + '">' + teamLabel + "</div>" +
            "<dl>" +
                '<dt>Ability</dt><dd>' + p.ability + "</dd>" +
                '<dt>Found At</dt><dd>' + p.foundAt + "</dd>" +
                '<dt>Season</dt><dd>' + p.season + "</dd>" +
                '<dt>Status</dt><dd><span class="status-dot"></span>' + p.status + "</dd>" +
            "</dl>";

        // sits at the top of the right rail, above the skin viewer
        col.insertBefore(box, col.firstChild);
    }

    /* ==================================================
       CREDITS — 3D author skin viewer
    ================================================== */
    function enhanceCredits(scope, page) {
        if (page !== "credits") return;
        var canvas = scope.querySelector("#credits-skin");
        if (!canvas || !window.loadSkinview || canvas.dataset.wired) return;
        canvas.dataset.wired = "1";

        // library is lazy-loaded; the shared factory caps pixel ratio and
        // pauses rendering while the model is off screen
        Promise.all([
            window.loadSkinview(),
            window.probeImage("images/jackson-skin.png")
        ]).then(function (res) {
            if (!canvas.isConnected) return;
            try {
                if (window.creditsSkinViewer) window.creditsSkinViewer.dispose();
                window.creditsSkinViewer = window.makeSkinViewer(canvas, 280, 280,
                    res[1] ? "images/jackson-skin.png" : "skins/placeholder.png");
            } catch (e) { /* invalid skin — leave blank */ }
        }).catch(function () {});
    }

    /* ==================================================
       TABLE OF CONTENTS  (in-content, Wikipedia-style)
    ================================================== */
    function enhanceTOC(scope, page) {
        // season pages have a side nav; player + home (scroll journey) don't need it
        if (page === "about") return;
        if (scope.querySelector("#s2-layout, #player-layout, .home-scroll")) return;
        if (scope.querySelector(".wiki-toc")) return;

        var heads = Array.prototype.slice.call(scope.querySelectorAll("h2"))
            .filter(function (h) { return !h.classList.contains("center-title") || scope.querySelectorAll("h2").length > 1; });
        // require a few sections to be worth it
        var real = scope.querySelectorAll("h2");
        if (real.length < 2) return;

        var toc = document.createElement("nav");
        toc.className = "wiki-toc";
        var items = "";
        real.forEach(function (h, i) {
            if (!h.id) h.id = "sec-" + page + "-" + i;
            items += '<li><a data-toc="' + h.id + '">' + h.textContent.trim() + "</a></li>";
        });
        toc.innerHTML =
            '<div class="toc-head"><span>Contents</span>' +
            '<button class="toc-toggle" aria-label="Toggle contents">&minus;</button></div>' +
            "<ol>" + items + "</ol>";

        // insert after the intro paragraph (or the meta strip / first heading)
        var anchor = scope.querySelector(".season-intro") ||
                     scope.querySelector(".page-meta-strip") ||
                     scope.querySelector("h1");
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(toc, anchor.nextSibling);
        } else {
            scope.insertBefore(toc, scope.firstChild);
        }

        toc.querySelectorAll("a[data-toc]").forEach(function (a) {
            a.addEventListener("click", function () {
                var t = document.getElementById(a.dataset.toc);
                if (t) POP.scrollTo(t);
            });
        });
        toc.querySelector(".toc-toggle").addEventListener("click", function () {
            toc.classList.toggle("collapsed");
            this.innerHTML = toc.classList.contains("collapsed") ? "+" : "&minus;";
        });

        // scroll-spy through the batched scheduler. One key, so a new page
        // replaces the old spy (it used to add a listener per page, forever).
        if (window.POP) {
            var links = Array.prototype.slice.call(toc.querySelectorAll("a[data-toc]"));
            var heads = Array.prototype.slice.call(real);
            var lastCur;
            POP.onScroll("toc", {
                read: function (box) {
                    var top = box.getBoundingClientRect().top, cur = null;
                    for (var i = 0; i < heads.length; i++) {
                        if (heads[i].getBoundingClientRect().top - top <= 120) cur = heads[i].id; else break;
                    }
                    return cur;
                },
                write: function (cur) {
                    if (cur === lastCur) return;
                    lastCur = cur;
                    links.forEach(function (l) { l.classList.toggle("active", l.dataset.toc === cur); });
                }
            });
        }
    }

    /* ==================================================
       REFERENCES & SEE ALSO  (one collapsible panel)
    ================================================== */
    function enhanceRefs(scope, page) {
        var meta = WIKI.PAGES[page];
        var rel = (meta && meta.related) || (WIKI.PLAYERS[page] ? ["players", "abilities", "season2"] : []);
        var refs = WIKI.refsFor ? WIKI.refsFor(page) : [];
        if ((!rel || !rel.length) && (!refs || !refs.length)) return;
        if (scope.querySelector(".page-refs")) return;

        var seeAlso = rel.length
            ? '<div class="refs-col"><h4>See Also</h4><div class="related-grid">' +
              rel.map(function (r) {
                  return '<button class="related-card" data-page="' + r + '">' +
                         '<span class="related-arrow">&rarr;</span>' + label(r) + "</button>";
              }).join("") +
              "</div></div>"
            : "";

        var refList = refs.length
            ? '<div class="refs-col"><h4>References</h4><ol class="ref-list">' +
              refs.map(function (r) {
                  var link = r.page
                      ? '<a class="ref-link" data-page="' + r.page + '">' + r.label + "</a>"
                      : '<a class="ref-link" href="' + (r.href || "#") + '" target="_blank" rel="noopener">' + r.label + "</a>";
                  return "<li>" + link + (r.note ? '<span class="ref-note">' + r.note + "</span>" : "") + "</li>";
              }).join("") +
              "</ol></div>"
            : "";

        var open = true;
        try { open = localStorage.getItem("popularis_refs_open") !== "0"; } catch (e) {}

        var panel = document.createElement("section");
        panel.className = "page-refs" + (open ? "" : " collapsed");
        panel.innerHTML =
            '<button class="refs-toggle" aria-expanded="' + open + '">' +
                '<span class="refs-title">References &amp; See Also</span>' +
                '<span class="refs-chevron">&#9662;</span>' +
            "</button>" +
            '<div class="refs-body"><div class="refs-grid">' + seeAlso + refList + "</div></div>";
        scope.appendChild(panel);

        // internal links (data-page). external <a href> keep native behaviour.
        panel.querySelectorAll("[data-page]").forEach(function (b) {
            b.dataset.wired = "1"; // stop polish.js from double-binding
            b.addEventListener("click", function (e) { e.preventDefault(); go(b.dataset.page); });
        });

        var toggle = panel.querySelector(".refs-toggle");
        toggle.addEventListener("click", function () {
            var collapsed = panel.classList.toggle("collapsed");
            toggle.setAttribute("aria-expanded", String(!collapsed));
            try { localStorage.setItem("popularis_refs_open", collapsed ? "0" : "1"); } catch (e) {}
        });
    }

    /* ==================================================
       WIKI-LINKS
    ================================================== */
    var EXCLUDE = "A,H1,H2,H3,H4,PRE,CODE,BUTTON,SCRIPT,STYLE,DT," +
                  ".infobox,.wiki-toc,.page-refs,.ref-list,.page-meta-strip,.gallery,.gallery-section," +
                  "#player-sidebar,#sidebar-nav,#player-bottom-nav,.no-link,.season-box";

    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    // Single pass: one tree walk (exclusion checked once per text node) and
    // one combined, longest-first regex. The old version did a full tree
    // walk + closest() per term, per text node: ~100 ms on a big page on a
    // slow phone, now a few ms.
    var linkRe = null;
    function enhanceLinks(scope, page) {
        if (pref("pref-no-wikilinks")) return;
        if (!linkRe) {
            var terms = Object.keys(WIKI.LINKS).sort(function (a, b) { return b.length - a.length; });
            if (!terms.length) return;
            linkRe = new RegExp("(^|[^A-Za-z0-9])(" + terms.map(escapeRe).join("|") + ")(?![A-Za-z0-9])", "g");
        }

        var nodes = [];
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                if (node.parentElement && node.parentElement.closest(EXCLUDE)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        for (var n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

        var used = {};                      // first occurrence only, per term
        nodes.forEach(function (node) {
            var text = node.nodeValue, hits = [], m;
            linkRe.lastIndex = 0;
            while ((m = linkRe.exec(text))) {
                var term = m[2], target = WIKI.LINKS[term];
                var start = m.index + m[1].length;
                linkRe.lastIndex = start + term.length;       // leave the boundary char for the next match
                if (used[term] || target === page) continue;  // never self-link
                used[term] = true;
                hits.push({ start: start, term: term, target: target });
            }
            if (!hits.length) return;

            var frag = document.createDocumentFragment(), pos = 0;
            hits.forEach(function (h) {
                if (h.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, h.start)));
                var link = document.createElement("a");
                link.className = "wikilink";
                link.dataset.page = h.target;
                link.dataset.wired = "1"; // stop polish.js from double-binding
                link.textContent = h.term;
                link.title = label(h.target);
                frag.appendChild(link);
                pos = h.start + h.term.length;
            });
            if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    // one delegated listener for every wiki-link on every page
    if (content) {
        content.addEventListener("click", function (e) {
            var a = e.target.closest && e.target.closest("a.wikilink");
            if (!a || content.isContentEditable) return;
            e.preventDefault();
            go(a.dataset.page);
        });
    }

    /* ==================================================
       CATEGORY DRAWER  (built once)
    ================================================== */
    (function drawer() {
        var btn = document.createElement("button");
        btn.id = "wiki-drawer-btn";
        btn.setAttribute("aria-label", "Browse categories");
        btn.innerHTML = "&#9776;";
        document.body.appendChild(btn);

        var panel = document.createElement("aside");
        panel.id = "wiki-drawer";
        var cats = WIKI.CATEGORIES.map(function (c) {
            var links = c.pages.map(function (p) {
                return '<li><button class="drawer-page" data-page="' + p + '">' + label(p) + "</button></li>";
            }).join("");
            return '<div class="drawer-cat">' +
                   '<div class="drawer-cat-head"><span class="drawer-ico">' + c.icon + "</span>" + c.label + "</div>" +
                   '<ul class="drawer-pages">' + links + "</ul></div>";
        }).join("");

        var recent = WIKI.recentlyUpdated(5).map(function (r) {
            var d = new Date(r.updated + "T00:00:00");
            var nice = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return '<li><button class="drawer-page recent" data-page="' + r.id + '">' +
                   label(r.id) + '<span class="recent-date">' + nice + "</span></button></li>";
        }).join("");

        panel.innerHTML =
            '<div class="drawer-title">POPULARIS WIKI</div>' +
            '<div class="drawer-sub">Browse by category</div>' +
            '<div class="drawer-scroll">' + cats +
                '<div class="drawer-cat"><div class="drawer-cat-head"><span class="drawer-ico">&#128337;</span>Recently Updated</div>' +
                '<ul class="drawer-pages">' + recent + "</ul></div>" +
            "</div>";

        var scrim = document.createElement("div");
        scrim.id = "wiki-drawer-scrim";

        document.body.appendChild(scrim);
        document.body.appendChild(panel);

        function openDrawer() { panel.classList.add("open"); scrim.classList.add("show"); }
        function closeDrawer() { panel.classList.remove("open"); scrim.classList.remove("show"); }
        window._wikiOpenDrawer = openDrawer;

        btn.addEventListener("click", openDrawer);
        scrim.addEventListener("click", closeDrawer);
        panel.querySelectorAll(".drawer-page").forEach(function (b) {
            b.addEventListener("click", function () { go(b.dataset.page); closeDrawer(); });
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

        // highlight the active page whenever it changes
        window.addEventListener("hashchange", markActive);
        window._wikiMarkDrawer = markActive;
        function markActive() {
            var cur = (location.hash || "#about").slice(1) || "about";
            panel.querySelectorAll(".drawer-page").forEach(function (b) {
                b.classList.toggle("current", b.dataset.page === cur);
            });
        }
        markActive();
    })();

    /* ==================================================
       FOOTER  (wired once — links live outside #content)
    ================================================== */
    (function footer() {
        var footer = document.getElementById("site-footer");
        if (!footer) return;

        footer.querySelectorAll("a[data-page]").forEach(function (a) {
            a.addEventListener("click", function (e) {
                e.preventDefault();
                go(a.dataset.page);
            });
        });

        var topBtn = document.getElementById("footer-top");
        if (topBtn && contentBox) {
            topBtn.addEventListener("click", function () {
                contentBox.scrollTo({ top: 0, behavior: "smooth" });
            });
        }

        var updated = document.getElementById("footer-updated");
        if (updated) {
            var recent = WIKI.recentlyUpdated(1)[0];
            if (recent) {
                var d = new Date(recent.updated + "T00:00:00");
                var nice = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                updated.textContent = "Last updated " + nice;
            }
        }
    })();

    /* ==================================================
       run everything for a page
    ================================================== */
    // `scope` may be a DETACHED fragment: router.js enhances the new page
    // before inserting it, so none of this costs layout or style work.
    function enhance(scope, page) {
        scope = scope || content;
        page = page || (content && content.dataset.page);
        if (!scope || !page) return;

        if (window.POP) POP.onScroll("toc", null);   // re-added by enhanceTOC if this page has one
        enhanceMeta(scope, page);
        enhanceHomeScroll(scope, page);
        enhanceCredits(scope, page);
        enhanceInfobox(scope, page);
        enhanceTOC(scope, page);
        enhanceLinks(scope, page);
        enhanceRefs(scope, page);
        enhanceGallery(scope, page);   // after refs so it inserts above the panel
        enhanceLightbox(scope);        // after gallery so gallery imgs are skipped
        if (window._wikiMarkDrawer) window._wikiMarkDrawer();
    }

    window.wikiEnhance = function (scope, page) {
        try { enhance(scope, page); } catch (e) { console.error(e); }
    };
    if (content && content.children.length) window.wikiEnhance();
})();
