/* ==================================================
   POPULARIS WIKI — polish layer
   loading screen • scroll reveals • back-to-top
   settings wiring (reset + font size)
   (loaded BEFORE router.js on purpose)
================================================== */

(function () {
    "use strict";

    /* --------------------------------------------------
       one-time migration:
       old editor snapshots (wiki_<page>) hold pre-redesign
       markup and would override the new pages. Clear them
       once, then never again.
    -------------------------------------------------- */

    var WIKI_VERSION = "2";

    try {
        if (localStorage.getItem("popularis_wiki_version") !== WIKI_VERSION) {
            Object.keys(localStorage)
                .filter(function (k) { return k.indexOf("wiki_") === 0; })
                .forEach(function (k) { localStorage.removeItem(k); });
            localStorage.setItem("popularis_wiki_version", WIKI_VERSION);
        }
    } catch (e) { /* storage unavailable — fine */ }

    /* --------------------------------------------------
       preferences — applied to <html> immediately so there
       is no flash (shader off, reduced motion, etc.)
    -------------------------------------------------- */

    function loadPrefs() {
        try { return JSON.parse(localStorage.getItem("popularis_prefs") || "{}"); }
        catch (e) { return {}; }
    }
    function savePrefs(p) {
        try { localStorage.setItem("popularis_prefs", JSON.stringify(p)); } catch (e) {}
    }

    // FONT SIZE: must scale the ROOT font-size — every text size on the
    // site is in `rem`, so scaling #content did nothing. Scaling <html>
    // scales the whole page proportionally.
    function applyFontSize() {
        var size = "normal";
        try { size = localStorage.getItem("popularis_fontsize") || "normal"; } catch (e) {}
        var r = document.documentElement;
        r.classList.toggle("font-small", size === "small");
        r.classList.toggle("font-large", size === "large");
        return size;
    }

    function applyPrefs() {
        var p = loadPrefs();
        var r = document.documentElement;
        r.classList.toggle("pref-reduce-motion", p.reduceMotion === true);
        r.classList.toggle("pref-shader-off",    p.shader === false);
        r.classList.toggle("pref-no-grid",       p.grid === false);
        r.classList.toggle("pref-no-progress",   p.progress === false);
        r.classList.toggle("pref-no-wikilinks",  p.wikilinks === false);
        r.classList.toggle("pref-no-particles",  p.particles === false);
        // particle visibility 0..1 (read live by extras.js)
        window.PARTICLE_LEVEL = (p.particleLevel === undefined) ? 1 : Number(p.particleLevel);
        return p;
    }

    // expose so the shader can honour "shader off" without a reload
    window.POPULARIS_PREFS = { load: loadPrefs, save: savePrefs, apply: applyPrefs };

    applyFontSize();
    applyPrefs();

    /* --------------------------------------------------
       loading screen
    -------------------------------------------------- */

    var TIPS = [
        "Waking the Titans…",
        "Stoking Ignivar's forges…",
        "Growing Verdantis' jungles…",
        "Raising the Great Divide…",
        "Hiding the three riddles…",
        "Folding non-Euclidean caves…",
        "Polishing legendary items…"
    ];

    var loadScreen = document.getElementById("loading-screen");
    var barFill = document.getElementById("loading-bar-fill");
    var tipEl = document.getElementById("loading-tip");

    var MIN_SHOW = 1400;   // feels intentional, not sluggish
    var startedAt = Date.now();
    var progress = 0;
    var hidden = false;

    // simulated progress that eases toward 90% until real load finishes
    var progressTimer = setInterval(function () {
        if (!barFill) return;
        progress += (90 - progress) * 0.12;
        barFill.style.width = progress.toFixed(1) + "%";
    }, 120);

    // rotating flavour tips
    var tipIndex = 0;
    var tipTimer = setInterval(function () {
        if (!tipEl) return;
        tipEl.classList.add("swap");
        setTimeout(function () {
            tipIndex = (tipIndex + 1) % TIPS.length;
            tipEl.textContent = TIPS[tipIndex];
            tipEl.classList.remove("swap");
        }, 280);
    }, 1600);

    function hideLoadingScreen() {
        if (hidden || !loadScreen) return;
        hidden = true;

        clearInterval(progressTimer);
        clearInterval(tipTimer);

        if (barFill) barFill.style.width = "100%";

        setTimeout(function () {
            loadScreen.classList.add("done");
            // remove from the tree once faded so it can't trap clicks
            setTimeout(function () {
                if (loadScreen.parentNode) loadScreen.parentNode.removeChild(loadScreen);
            }, 700);
        }, 250);
    }

    window.addEventListener("load", function () {
        var elapsed = Date.now() - startedAt;
        setTimeout(hideLoadingScreen, Math.max(0, MIN_SHOW - elapsed));
    });

    // fail-safe: never strand the visitor behind the loader
    setTimeout(hideLoadingScreen, 7000);

    /* --------------------------------------------------
       everything below needs the DOM
    -------------------------------------------------- */

    document.addEventListener("DOMContentLoaded", function () {

        var contentBox = document.querySelector(".content-box");
        var content = document.getElementById("content");

        /* ----------------------------------------------
           back to top
        ---------------------------------------------- */

        var backToTop = document.getElementById("back-to-top");

        if (backToTop && contentBox) {
            contentBox.addEventListener("scroll", function () {
                backToTop.classList.toggle("show", contentBox.scrollTop > 350);
            }, { passive: true });

            backToTop.addEventListener("click", function () {
                contentBox.scrollTo({ top: 0, behavior: "smooth" });
            });
        }

        /* ----------------------------------------------
           scroll reveal
           (root is the content card, since that's what scrolls)
        ---------------------------------------------- */

        var REVEAL_SELECTOR = [
            ".season-summary",
            ".s2-section",
            ".player-section",
            ".quote-card",
            ".stat",
            ".info-card",
            ".lore-card",
            ".riddle-card",
            ".timeline li"
        ].join(",");

        var observer = null;

        if ("IntersectionObserver" in window && contentBox) {
            observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("revealed");
                        observer.unobserve(entry.target);
                    }
                });
            }, { root: contentBox, rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
        }

        function applyReveals(scope) {
            if (!observer || !scope) return;
            scope.querySelectorAll(REVEAL_SELECTOR).forEach(function (el) {
                if (el.classList.contains("reveal-on-scroll")) return;
                el.classList.add("reveal-on-scroll");
                observer.observe(el);
            });
        }

        /* ----------------------------------------------
           route clicks for ANY [data-page] inside content
           that the router doesn't already handle.
           Router binds .season-box + the top nav only, so
           this covers hero .btn buttons AND the sticky
           mini-header nav on the season pages.
        ---------------------------------------------- */

        function wirePageButtons(scope) {
            if (!scope) return;
            scope.querySelectorAll("[data-page]").forEach(function (el) {
                // the router already wires .season-box cards
                if (el.classList.contains("season-box")) return;
                if (el.dataset.wired) return;
                el.dataset.wired = "true";
                el.style.cursor = "pointer";
                el.addEventListener("click", function (e) {
                    e.preventDefault();
                    if (typeof window.navigateToPage === "function") {
                        window.navigateToPage(el.dataset.page);
                    }
                });
            });
        }

        /* ----------------------------------------------
           player bottom-nav: tap the label to pin it open
           (hover works on desktop; this makes it usable on
           touch and keyboards)
        ---------------------------------------------- */

        function wireBottomNav(scope) {
            if (!scope) return;
            var nav = scope.querySelector("#player-bottom-nav");
            var label = scope.querySelector("#player-bottom-nav-collapsed-label");
            if (!nav || !label || label.dataset.wired) return;
            label.dataset.wired = "true";
            label.setAttribute("role", "button");
            label.setAttribute("tabindex", "0");
            label.style.cursor = "pointer";

            var toggle = function () { nav.classList.toggle("pinned"); };
            label.addEventListener("click", toggle);
            label.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
            });
        }

        /* ----------------------------------------------
           settings wiring the router doesn't cover:
           font size, feature toggles, reset
        ---------------------------------------------- */

        // wire a checkbox to a boolean key in popularis_prefs.
        // `onWhenChecked` = the pref value stored when the box is ticked.
        function wirePrefToggle(scope, id, key, onWhenChecked, defaultChecked) {
            var input = scope.querySelector("#" + id);
            if (!input || input.dataset.wired) return;
            input.dataset.wired = "true";
            var prefs = loadPrefs();
            var val = prefs[key];
            input.checked = (val === undefined) ? defaultChecked : (val === onWhenChecked);
            input.addEventListener("change", function () {
                var p = loadPrefs();
                p[key] = input.checked ? onWhenChecked : !onWhenChecked;
                savePrefs(p);
                applyPrefs();
            });
        }

        function wireSettingsExtras(scope) {
            if (!scope) return;

            var fontSelect = scope.querySelector("#font-size-setting");
            if (fontSelect && !fontSelect.dataset.wired) {
                fontSelect.dataset.wired = "true";
                fontSelect.value = applyFontSize();
                fontSelect.addEventListener("change", function () {
                    try { localStorage.setItem("popularis_fontsize", fontSelect.value); } catch (e) {}
                    applyFontSize();
                });
            }

            // particle visibility slider
            var pAmt = scope.querySelector("#setting-particle-amount");
            if (pAmt && !pAmt.dataset.wired) {
                pAmt.dataset.wired = "true";
                var pv = loadPrefs().particleLevel;
                pAmt.value = (pv === undefined) ? 1 : pv;
                pAmt.addEventListener("input", function () {
                    var p = loadPrefs();
                    p.particleLevel = parseFloat(pAmt.value);
                    savePrefs(p);
                    applyPrefs();
                });
            }

            // new feature toggles (defaults chosen so nothing is a surprise)
            wirePrefToggle(scope, "setting-shader",    "shader",     true,  true);   // ticked = shader ON
            wirePrefToggle(scope, "setting-grid",      "grid",       true,  true);   // ticked = grid ON
            wirePrefToggle(scope, "setting-progress",  "progress",   true,  true);   // ticked = bar ON
            wirePrefToggle(scope, "setting-wikilinks", "wikilinks",  true,  true);   // ticked = links ON
            wirePrefToggle(scope, "setting-particles", "particles",  true,  true);   // ticked = particles ON
            wirePrefToggle(scope, "setting-reduce-motion", "reduceMotion", true, false); // ticked = reduce motion

            var resetBtn = scope.querySelector("#reset-settings");
            if (resetBtn && !resetBtn.dataset.wired) {
                resetBtn.dataset.wired = "true";
                resetBtn.addEventListener("click", function () {
                    try {
                        localStorage.removeItem("popularis_simple_settings");
                        localStorage.removeItem("popularis_settings");
                        localStorage.removeItem("popularis_fontsize");
                        localStorage.removeItem("popularis_prefs");
                    } catch (e) {}

                    if (typeof window.resetSettings === "function") {
                        window.resetSettings();
                    }
                    applyFontSize();
                    applyPrefs();

                    // sync the visible controls back to defaults
                    var easy = scope.querySelector("#easy-reading-toggle");
                    var pause = scope.querySelector("#setting-pause-shader");
                    var opacity = scope.querySelector("#setting-opacity");
                    if (easy) easy.checked = false;
                    if (pause) pause.checked = false;
                    if (opacity) opacity.value = 0.85;
                    if (fontSelect) fontSelect.value = "normal";
                    ["setting-shader","setting-grid","setting-progress","setting-wikilinks","setting-particles"].forEach(function (id) {
                        var el = scope.querySelector("#" + id); if (el) el.checked = true;
                    });
                    var rm = scope.querySelector("#setting-reduce-motion"); if (rm) rm.checked = false;
                    var pa = scope.querySelector("#setting-particle-amount"); if (pa) pa.value = 1;

                    resetBtn.textContent = "Done!";
                    setTimeout(function () {
                        resetBtn.textContent = "Reset to Defaults";
                    }, 1200);
                });
            }
        }

        /* ----------------------------------------------
           re-run per page load — the router replaces
           #content's children, so watch for it
        ---------------------------------------------- */

        if (content) {
            applyReveals(content);
            wireSettingsExtras(content);
            wirePageButtons(content);
            wireBottomNav(content);

            new MutationObserver(function () {
                applyReveals(content);
                wireSettingsExtras(content);
                wirePageButtons(content);
                wireBottomNav(content);
            }).observe(content, { childList: true });
        }
    });
})();
