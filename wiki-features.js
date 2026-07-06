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
        if (!fill || !contentBox) return;
        contentBox.addEventListener("scroll", function () {
            var max = contentBox.scrollHeight - contentBox.clientHeight;
            var pct = max > 0 ? (contentBox.scrollTop / max) * 100 : 0;
            fill.style.width = pct.toFixed(1) + "%";
        }, { passive: true });
    })();

    /* ==================================================
       HOME SCROLL JOURNEY — parallax + scroll-spy + reveal
       (one persistent scroll listener; acts only on the
        home page's .home-scroll, otherwise no-ops)
    ================================================== */
    function updateHomeScroll() {
        if (!contentBox || !content) return;
        var home = content.querySelector(".home-scroll");
        if (!home) return;

        var cRect = contentBox.getBoundingClientRect();
        var cCenter = cRect.top + cRect.height / 2;
        var panels = home.querySelectorAll(".scroll-panel");
        var activeId = null;
        var bestDist = Infinity;

        panels.forEach(function (panel) {
            var r = panel.getBoundingClientRect();
            var pCenter = r.top + r.height / 2;

            // parallax: shift the image opposite to its distance from centre
            var bg = panel.querySelector(".scroll-panel-bg");
            if (bg) {
                var frac = (pCenter - cCenter) / cRect.height;   // ~ -1 .. 1
                bg.style.transform = "translateY(" + (frac * 52).toFixed(1) + "px)";
            }

            // reveal the side card once the panel is meaningfully in view
            var inner = panel.querySelector(".scroll-panel-inner");
            if (inner && r.top < cRect.bottom - 70 && r.bottom > cRect.top + 70) {
                inner.classList.add("revealed");
            }

            // active section = panel centre nearest the viewport centre
            var dist = Math.abs(pCenter - cCenter);
            if (dist < bestDist) { bestDist = dist; activeId = panel.id; }
        });

        if (activeId) {
            home.querySelectorAll(".rail-dot").forEach(function (dot) {
                dot.classList.toggle("active", dot.dataset.target === activeId);
            });
        }
    }

    if (contentBox) {
        var homeRaf = false;
        contentBox.addEventListener("scroll", function () {
            if (homeRaf) return;
            homeRaf = true;
            requestAnimationFrame(function () { homeRaf = false; updateHomeScroll(); });
        }, { passive: true });
        window.addEventListener("resize", updateHomeScroll);
    }

    function enhanceHomeScroll(scope, page) {
        if (page !== "about") return;
        var home = scope.querySelector(".home-scroll");
        if (!home || home.dataset.wired) return;
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
                if (t && contentBox) {
                    var top = contentBox.scrollTop +
                        (t.getBoundingClientRect().top - contentBox.getBoundingClientRect().top) - 10;
                    contentBox.scrollTo({ top: top, behavior: "smooth" });
                }
            });
        });

        updateHomeScroll();  // initial pass (parallax + reveal in-view + active dot)
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

        function render() {
            var it = items[idx];
            if (!it) return;
            img.src = it.src;
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

        var thumbs = gal.map(function (it, i) {
            return '<button class="gallery-item" data-i="' + i + '" aria-label="' + (it.cap || "Image") + '">' +
                   '<img src="' + it.src + '" alt="' + (it.cap || "") + '" loading="lazy">' +
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
        if (!canvas || !window.skinview3d || canvas.dataset.wired) return;
        canvas.dataset.wired = "1";

        function mount(skin) {
            try {
                if (window.creditsSkinViewer) window.creditsSkinViewer.dispose();
                window.creditsSkinViewer = new skinview3d.SkinViewer({
                    canvas: canvas, width: 280, height: 280, skin: skin
                });
                window.creditsSkinViewer.controls.enableZoom = true;
                window.creditsSkinViewer.animation = new skinview3d.IdleAnimation();
            } catch (e) { /* invalid skin — leave blank */ }
        }

        fetch("images/jackson-skin.png", { method: "HEAD" })
            .then(function (res) { mount(res.ok ? "images/jackson-skin.png" : "skins/placeholder.png"); })
            .catch(function () { mount("skins/placeholder.png"); });
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
                if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
        toc.querySelector(".toc-toggle").addEventListener("click", function () {
            toc.classList.toggle("collapsed");
            this.innerHTML = toc.classList.contains("collapsed") ? "+" : "&minus;";
        });

        // scroll-spy
        if (contentBox) {
            var spy = function () {
                var links = toc.querySelectorAll("a[data-toc]");
                var current = null;
                real.forEach(function (h) {
                    var r = h.getBoundingClientRect();
                    var boxR = contentBox.getBoundingClientRect();
                    if (r.top - boxR.top <= 120) current = h.id;
                });
                links.forEach(function (l) {
                    l.classList.toggle("active", l.dataset.toc === current);
                });
            };
            contentBox.addEventListener("scroll", spy, { passive: true });
            spy();
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

    function enhanceLinks(scope, page) {
        if (pref("pref-no-wikilinks")) return;
        var terms = Object.keys(WIKI.LINKS).sort(function (a, b) { return b.length - a.length; });

        terms.forEach(function (term) {
            var target = WIKI.LINKS[term];
            if (target === page) return; // never self-link
            var re = new RegExp("(?:^|[^A-Za-z0-9])(" + escapeRe(term) + ")(?![A-Za-z0-9])");

            var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    if (node.parentElement && node.parentElement.closest(EXCLUDE)) return NodeFilter.FILTER_REJECT;
                    return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            });

            var node = walker.nextNode();
            if (!node) return; // first occurrence only, per page

            var m = re.exec(node.nodeValue);
            if (!m) return;
            var start = m.index + m[0].length - m[1].length; // account for leading boundary char
            var before = node.nodeValue.slice(0, start);
            var matchText = node.nodeValue.slice(start, start + term.length);
            var after = node.nodeValue.slice(start + term.length);

            var link = document.createElement("a");
            link.className = "wikilink";
            link.dataset.page = target;
            link.dataset.wired = "1"; // stop polish.js from double-binding
            link.textContent = matchText;
            link.title = label(target);
            link.addEventListener("click", function (e) {
                e.preventDefault();
                go(target);
            });

            var frag = document.createDocumentFragment();
            if (before) frag.appendChild(document.createTextNode(before));
            frag.appendChild(link);
            if (after) frag.appendChild(document.createTextNode(after));
            node.parentNode.replaceChild(frag, node);
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
    function enhance() {
        if (!content) return;
        var page = content.dataset.page;
        if (!page) return;

        // each enhancer is idempotent (checks before inserting), and the
        // observer is disconnected around this call, so running it once per
        // fresh page render is safe and re-renders (e.g. editor save) work too.
        enhanceMeta(content, page);
        enhanceHomeScroll(content, page);
        enhanceCredits(content, page);
        enhanceInfobox(content, page);
        enhanceTOC(content, page);
        enhanceLinks(content, page);
        enhanceRefs(content, page);
        enhanceGallery(content, page);   // after refs so it inserts above the panel
        enhanceLightbox(content);        // after gallery so gallery imgs are skipped
        if (window._wikiMarkDrawer) window._wikiMarkDrawer();
    }

    if (content) {
        var pending = false;
        var observer = new MutationObserver(function () {
            if (pending) return;
            pending = true;
            // setTimeout (not rAF) so enhancements still run when the tab
            // is loaded in the background — rAF is paused for hidden tabs.
            setTimeout(function () {
                pending = false;
                observer.disconnect();          // don't react to our own inserts
                try { enhance(); } finally {
                    observer.observe(content, { childList: true });
                }
            }, 0);
        });
        observer.observe(content, { childList: true });

        // initial page (content may already be populated)
        setTimeout(function () {
            observer.disconnect();
            try { enhance(); } finally {
                observer.observe(content, { childList: true });
            }
        }, 0);
    }
})();
