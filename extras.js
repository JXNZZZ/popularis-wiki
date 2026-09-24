/* ==================================================
   POPULARIS WIKI — extras
   advancement toasts • ambient particles •
   command palette (Ctrl+K) • lore-book reader •
   easter eggs
   Loaded after wiki-features.js.
================================================== */

(function () {
    "use strict";

    var WIKI = window.WIKI || {};
    var content = document.getElementById("content");
    var docEl = document.documentElement;

    function go(page) { if (typeof window.navigateToPage === "function") window.navigateToPage(page); }
    function label(p) { return WIKI.label ? WIKI.label(p) : p; }
    function hasPref(cls) { return docEl.classList.contains(cls); }

    function parseColor(str) {
        if (!str) return null;
        str = str.trim();
        var m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m) return { r: +m[1], g: +m[2], b: +m[3] };
        if (str[0] === "#") {
            var h = str.slice(1);
            if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
            var n = parseInt(h, 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
        return null;
    }

    /* ==================================================
       ADVANCEMENT TOASTS  (Minecraft-style)
    ================================================== */
    var toastStack = document.createElement("div");
    toastStack.id = "toast-stack";
    document.body.appendChild(toastStack);

    function showToast(icon, title, subtitle, desc) {
        var el = document.createElement("div");
        el.className = "toast";
        el.innerHTML =
            '<div class="toast-icon">' + icon + "</div>" +
            '<div class="toast-body">' +
                '<div class="toast-sub">' + (subtitle || "Advancement Made!") + "</div>" +
                '<div class="toast-title">' + title + "</div>" +
                (desc ? '<div class="toast-desc">' + desc + "</div>" : "") +
            "</div>";
        toastStack.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () {
            el.classList.remove("show");
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
        }, 5000);
    }
    window.popToast = showToast;

    // `desc` = plain-English "what you did" (shown in the toast AND on the
    // achievements page)
    var ACHIEVEMENTS = [
        { id: "players",   page: "players",   icon: "&#128101;", title: "Meet the Cast",       desc: "Visited the Players portal" },
        { id: "lore",      page: "lore",      icon: "&#128214;", title: "Lore Master",         desc: "Read the World Lore" },
        { id: "abilities", page: "abilities", icon: "&#9889;",   title: "Power Player",        desc: "Studied the player abilities" },
        { id: "items",     page: "items",     icon: "&#128142;", title: "Treasure Hunter",     desc: "Browsed the Legendary Items" },
        { id: "locations", page: "locations", icon: "&#128506;", title: "Cartographer",        desc: "Opened the interactive map" },
        { id: "credits",   page: "credits",   icon: "&#127916;", title: "Curtain Call",        desc: "Read the credits" },
        { id: "settings",  page: "settings",  icon: "&#9881;",   title: "Tinkerer",            desc: "Opened the settings" },
        { id: "achhunt",   page: "achievements", icon: "&#127942;", title: "Achievement Hunter", desc: "Opened the achievements page" },
        { id: "fullstory", icon: "&#128220;", title: "The Full Story",      desc: "Visited all three seasons" },
        { id: "wanderer",  icon: "&#129517;", title: "Wiki Wanderer",       desc: "Explored 10 different pages" },
        { id: "socialite", icon: "&#127917;", title: "Socialite",           desc: "Visited 5 player pages" },
        { id: "titan",     icon: "&#128293;", title: "You Woke the Titans", desc: "Entered the Konami code" }
    ];
    window.POPULARIS_ACHIEVEMENTS = ACHIEVEMENTS;

    function readArr(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
    function writeArr(key, a) { try { localStorage.setItem(key, JSON.stringify(a)); } catch (e) {} }

    function unlock(id) {
        var u = readArr("popularis_advancements");
        if (u.indexOf(id) !== -1) return;
        var a = ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
        if (!a) return;
        u.push(id); writeArr("popularis_advancements", u);
        showToast(a.icon, a.title, "Advancement Made!", a.desc);
        if (window.popRenderAchievements) window.popRenderAchievements();
    }
    window.popUnlock = unlock;

    function checkAchievements(page) {
        var v = readArr("popularis_visited");
        if (v.indexOf(page) === -1) { v.push(page); writeArr("popularis_visited", v); }

        ACHIEVEMENTS.forEach(function (a) { if (a.page && a.page === page) unlock(a.id); });

        if (["season1", "season2", "season3"].every(function (s) { return v.indexOf(s) !== -1; })) unlock("fullstory");
        if (v.filter(function (p) { return p !== "404" && p !== "about"; }).length >= 10) unlock("wanderer");
        if (v.filter(function (p) { return p.indexOf("people-") === 0; }).length >= 5) unlock("socialite");
    }

    // Render the achievements page grid (called on page load + on unlock)
    function renderAchievements() {
        var grid = document.getElementById("achievements-grid");
        if (!grid) return;
        var unlocked = readArr("popularis_advancements");
        var done = 0;
        grid.innerHTML = ACHIEVEMENTS.map(function (a) {
            var got = unlocked.indexOf(a.id) !== -1;
            if (got) done++;
            return '<div class="ach-card ' + (got ? "unlocked" : "locked") + '">' +
                '<div class="ach-icon">' + (got ? a.icon : "&#128274;") + "</div>" +
                '<div class="ach-info">' +
                    '<div class="ach-title">' + (got ? a.title : "???") + "</div>" +
                    '<div class="ach-desc">' + a.desc + "</div>" +
                "</div>" +
                (got ? '<div class="ach-check">&#10003;</div>' : "") +
            "</div>";
        }).join("");
        var counter = document.getElementById("ach-count");
        if (counter) counter.textContent = done + " / " + ACHIEVEMENTS.length + " unlocked";
        var bar = document.getElementById("ach-bar-fill");
        if (bar) bar.style.width = (done / ACHIEVEMENTS.length * 100).toFixed(0) + "%";
    }
    window.popRenderAchievements = renderAchievements;

    /* ==================================================
       AMBIENT PARTICLES  (theme-coloured embers)
    ================================================== */
    // Drawn by the WebGL background renderer as additive GL_POINTS in the
    // same draw pass as the shader (this used to be a second full-screen 2D
    // canvas with its own 60fps loop and per-particle arc()/fillStyle calls).
    window.popParticleBurst = function () {
        if (window.POP_RENDERER) window.POP_RENDERER.burst(90);
    };
    function updateParticleColour() { /* renderer derives it from the page's c1 */ }

    /* ==================================================
       COMMAND PALETTE  (Ctrl / Cmd + K)
    ================================================== */
    var palette = (function () {
        var index = [];
        (WIKI.CATEGORIES || []).forEach(function (c) {
            c.pages.forEach(function (p) { index.push({ id: p, label: label(p), cat: c.label }); });
        });

        var overlay = document.createElement("div");
        overlay.id = "cmdk";
        overlay.innerHTML =
            '<div class="cmdk-box">' +
                '<input id="cmdk-input" type="text" placeholder="Jump to a page…" autocomplete="off" spellcheck="false">' +
                '<ul id="cmdk-list"></ul>' +
                '<div class="cmdk-hint"><span>&#8593;&#8595; navigate</span><span>&#8629; open</span><span>esc close</span></div>' +
            "</div>";
        document.body.appendChild(overlay);

        var input = overlay.querySelector("#cmdk-input");
        var list = overlay.querySelector("#cmdk-list");
        var results = [];
        var sel = 0;

        function score(item, q) {
            var l = item.label.toLowerCase(), c = item.cat.toLowerCase();
            if (l === q) return 100;
            if (l.indexOf(q) === 0) return 80;
            if (l.indexOf(q) !== -1) return 60;
            if (c.indexOf(q) !== -1) return 40;
            // subsequence
            var qi = 0; for (var i = 0; i < l.length && qi < q.length; i++) if (l[i] === q[qi]) qi++;
            return qi === q.length ? 20 : -1;
        }

        function render() {
            var q = input.value.trim().toLowerCase();
            results = (!q ? index.slice() : index
                .map(function (it) { return { it: it, s: score(it, q) }; })
                .filter(function (x) { return x.s >= 0; })
                .sort(function (a, b) { return b.s - a.s; })
                .map(function (x) { return x.it; })
            ).slice(0, 8);
            sel = 0;
            list.innerHTML = results.map(function (it, i) {
                return '<li class="cmdk-item' + (i === 0 ? " active" : "") + '" data-id="' + it.id + '">' +
                       '<span class="cmdk-label">' + it.label + "</span>" +
                       '<span class="cmdk-cat">' + it.cat + "</span></li>";
            }).join("") || '<li class="cmdk-empty">No pages found</li>';
            Array.prototype.forEach.call(list.querySelectorAll(".cmdk-item"), function (li) {
                li.addEventListener("click", function () { choose(li.dataset.id); });
                li.addEventListener("mousemove", function () {
                    sel = results.findIndex(function (r) { return r.id === li.dataset.id; });
                    highlight();
                });
            });
        }
        function highlight() {
            Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle("active", i === sel); });
        }
        function choose(id) { close(); go(id); }
        function open() {
            overlay.classList.add("show");
            input.value = ""; render(); setTimeout(function () { input.focus(); }, 30);
        }
        function close() { overlay.classList.remove("show"); }
        function toggle() { overlay.classList.contains("show") ? close() : open(); }

        input.addEventListener("input", render);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
        input.addEventListener("keydown", function (e) {
            if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); highlight(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); highlight(); }
            else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) choose(results[sel].id); }
            else if (e.key === "Escape") { close(); }
        });

        document.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); toggle(); }
        });

        return { open: open };
    })();
    window.popPalette = palette;

    /* ==================================================
       LORE-BOOK READER  (flippable Minecraft book)
    ================================================== */
    (function bookReader() {
        var books = WIKI.LORE_BOOKS || [];
        if (!books.length) return;

        var overlay = document.createElement("div");
        overlay.id = "bookreader";
        overlay.innerHTML =
            '<div class="book">' +
                '<button class="book-close" aria-label="Close">&times;</button>' +
                '<div class="book-stage">' +
                    '<div class="book-numeral"></div>' +
                    '<div class="book-title"></div>' +
                    '<div class="book-text"></div>' +
                '</div>' +
                '<div class="book-footer">' +
                    '<button class="book-prev" aria-label="Previous page">&#8249;</button>' +
                    '<span class="book-count"></span>' +
                    '<button class="book-next" aria-label="Next page">&#8250;</button>' +
                '</div>' +
            "</div>";
        document.body.appendChild(overlay);

        var stage = overlay.querySelector(".book-stage");
        var elNum = overlay.querySelector(".book-numeral");
        var elTitle = overlay.querySelector(".book-title");
        var elText = overlay.querySelector(".book-text");
        var elCount = overlay.querySelector(".book-count");

        var current = null, idx = 0;

        function render(dir) {
            if (!current) return;
            elNum.textContent = "Book " + current.numeral;
            elTitle.textContent = current.title;
            elText.textContent = current.pages[idx];
            elCount.textContent = (idx + 1) + " / " + current.pages.length;
            stage.classList.remove("flip-l", "flip-r");
            void stage.offsetWidth;
            stage.classList.add(dir < 0 ? "flip-l" : "flip-r");
        }
        function step(d) {
            if (!current) return;
            var n = idx + d;
            if (n < 0 || n >= current.pages.length) return;
            idx = n; render(d);
        }
        function open(id) {
            current = books.filter(function (b) { return String(b.id) === String(id); })[0] || books[0];
            idx = 0; render(1);
            overlay.classList.add("show");
        }
        function close() { overlay.classList.remove("show"); }
        window.popOpenBook = open;

        overlay.querySelector(".book-close").addEventListener("click", close);
        overlay.querySelector(".book-prev").addEventListener("click", function () { step(-1); });
        overlay.querySelector(".book-next").addEventListener("click", function () { step(1); });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
        document.addEventListener("keydown", function (e) {
            if (!overlay.classList.contains("show")) return;
            if (e.key === "Escape") close();
            else if (e.key === "ArrowLeft") step(-1);
            else if (e.key === "ArrowRight") step(1);
        });

        // delegate clicks on any lore card carrying a data-book id
        document.addEventListener("click", function (e) {
            var card = e.target.closest ? e.target.closest("[data-book]") : null;
            if (card && card.dataset.book) open(card.dataset.book);
        });
    })();

    /* ==================================================
       EASTER EGGS
    ================================================== */
    // dev console greeting
    try {
        console.log(
            "%c POPULARIS WIKI ",
            "background:#d41353;color:#ffd86b;font-size:20px;padding:6px 10px;border-radius:6px;font-weight:bold;"
        );
        console.log("%cPeeking under the hood? Nice. Try the Konami code, or click the logo a few times…",
            "color:#ffd86b;font-size:12px;");
    } catch (e) {}

    // Konami code
    var KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    var kseq = [];
    document.addEventListener("keydown", function (e) {
        kseq.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        if (kseq.length > KONAMI.length) kseq.shift();
        if (KONAMI.every(function (k, i) { return kseq[i] === k; })) {
            kseq = [];
            unlock("titan");
            if (window.popParticleBurst) window.popParticleBurst();
            var flash = document.createElement("div");
            flash.className = "titan-flash";
            document.body.appendChild(flash);
            setTimeout(function () { if (flash.parentNode) flash.remove(); }, 900);
        }
    });

    // logo clicks
    var logoClicks = 0, logoTimer = null;
    document.addEventListener("click", function (e) {
        var logo = e.target.closest ? e.target.closest("#nav-logo, #logo-wrapper") : null;
        if (!logo) return;
        logoClicks++;
        clearTimeout(logoTimer);
        logoTimer = setTimeout(function () { logoClicks = 0; }, 1500);
        if (logoClicks >= 10) {
            logoClicks = 0;
            showToast("&#128330;", "Certified Button Masher", "Secret found!");
            if (window.popParticleBurst) window.popParticleBurst();
        }
    });

    /* ==================================================
       page-change hook (achievements + particle colour)
    ================================================== */
    var lastPage = null;
    function onPage() {
        var p = content && content.dataset.page;
        if (!p || p === lastPage) return;
        lastPage = p;
        updateParticleColour();
        checkAchievements(p);
    }
    if (content) {
        new MutationObserver(onPage).observe(content, { childList: true });
        setTimeout(onPage, 700);
    }
})();
