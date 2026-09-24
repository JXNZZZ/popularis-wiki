/*just another day in paradise */

/* --------------------------------------------------
   user settins
-------------------------------------------------- */

let USER_SETTINGS = JSON.parse(localStorage.getItem("popularis_settings") || "{}");

window.DISABLE_TILT = USER_SETTINGS.tilt === false;
window.PAGE_TRANSITION_MODE = USER_SETTINGS.transition || "fade";
window.STICKY_HEADER_ENABLED = USER_SETTINGS.stickyheader !== false;
window.SIDEBAR_AUTOSCROLL = USER_SETTINGS.autoscroll !== false;
window.DISABLE_SHADER_ROTATION = USER_SETTINGS.noRotate === true;

const PLAYER_ORDER = [
    "people-adam",
    "people-callan",
    "people-danny",
    "people-feidhlim",
    "people-felix",
    "people-greer",
    "people-harrison",
    "people-jackson",
    "people-jame",
    "people-johan",
    "people-liam",
    "people-lochy",
    "people-mark",
    "people-max",
    "people-ruben",
    "people-robert",
    "people-sam",
    "people-placeholder"
];

const PAGE_META = {
    about: { title: "Home" },
    seasons: { title: "Seasons" },
    players: { title: "Players" },
    lore: { title: "Lore" },
    abilities: { title: "Abilities" },
    locations: { title: "Locations" },
    items: { title: "Items" },
    settings: { title: "Settings" },
    season1: { title: "Season 1" },
    season2: { title: "Season 2" },
    season3: { title: "Season 3" },
    credits: { title: "Credits" },
    "404": { title: "Not Found" }
};

const pageTitleLabel = document.getElementById("page-title");
const breadcrumbs = document.getElementById("breadcrumbs");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

let currentPage = "";

function getPageLabel(name) {
    if (PAGE_META[name]) return PAGE_META[name].title;
    if (name.startsWith("people-")) {
        return name
            .replace("people-", "")
            .split("-")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }
    return name
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function normalizePageName(raw) {
    const name = String(raw || "").trim();
    if (!name) return "about";
    if (PAGE_META[name] || PLAYER_ORDER.includes(name)) return name;
    if (name.startsWith("people-")) return name;
    return "404";
}

function getPageFromHash() {
    const hash = window.location.hash.slice(1);
    return normalizePageName(hash || "about");
}

function updatePageHeader(name) {
    const label = getPageLabel(name);
    if (pageTitleLabel) pageTitleLabel.textContent = label;
    if (breadcrumbs) breadcrumbs.textContent = name === "about" ? "Popularis" : `Popularis / ${label}`;
    document.title = `${label} - Popularis Wiki`;
}

function updateNavState(name) {
    document.querySelectorAll("nav a").forEach(a => {
        a.classList.toggle("active-nav", a.dataset.page === name);
    });
    // only the TOP nav's link drives the underline (the footer and the
    // season mini-header are <nav>s too); hide it when none is active there
    moveUnderlineToActive();
}

function buildSearchIndex() {
    return [
        ...Object.keys(PAGE_META),
        ...PLAYER_ORDER
    ].map(key => ({
        id: key,
        title: getPageLabel(key),
        query: getPageLabel(key).toLowerCase()
    }));
}

const SEARCH_INDEX = buildSearchIndex();

function showSearchResults(results) {
    if (!searchResults) return;

    if (results.length === 0) {
        searchResults.innerHTML = '<button type="button" disabled>No matches found</button>';
        searchResults.classList.add("show");
        return;
    }

    searchResults.innerHTML = results
        .map(item => `
            <button type="button" data-page="${item.id}">${item.title}</button>
        `)
        .join("");

    searchResults.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.page;
            clearSearchResults();
            if (target) navigateToPage(target);
        });
    });

    searchResults.classList.add("show");
}

function clearSearchResults() {
    if (!searchResults) return;
    searchResults.innerHTML = "";
    searchResults.classList.remove("show");
}

function filterSearch(query) {
    if (!query) {
        clearSearchResults();
        return;
    }

    const lower = query.toLowerCase();
    const results = SEARCH_INDEX
        .filter(item => item.query.includes(lower))
        .slice(0, 8);

    showSearchResults(results);
}

function initSearchUI() {
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        filterSearch(searchInput.value);
    });

    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim().length > 0) {
            filterSearch(searchInput.value);
        }
    });

    searchInput.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            searchInput.blur();
            clearSearchResults();
        }
    });

    document.addEventListener("click", event => {
        if (!searchResults || !searchInput) return;
        if (event.target === searchInput || searchResults.contains(event.target)) return;
        clearSearchResults();
    });
}

function generateTableOfContents() {
    const tocContainer = document.getElementById("toc-container");
    const tocLinks = document.getElementById("toc-links");
    const content = document.getElementById("content");
    if (!tocContainer || !tocLinks || !content) return;

    const headings = Array.from(content.querySelectorAll("h2, h3"));
    if (headings.length === 0) {
        tocContainer.classList.add("hidden");
        tocLinks.innerHTML = "";
        return;
    }

    tocContainer.classList.remove("hidden");

    tocLinks.innerHTML = headings.map(heading => {
        if (!heading.id) {
            heading.id = heading.textContent
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "");
        }

        const level = heading.tagName === "H3" ? "level-3" : "level-2";
        return `<button type="button" class="${level}" data-target="${heading.id}">${heading.textContent.trim()}</button>`;
    }).join("");

    tocLinks.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                POP.scrollTo(target);
            }
        });
    });
}

async function navigateToPage(pageName, replaceState = false) {
    const page = normalizePageName(pageName);
    // compare with where we're GOING, not what's on screen: clicking the
    // current page while another is loading must cancel that load, and
    // double-clicking a link must not push two history entries
    if (page === (targetPage || currentPage)) return;
    if (replaceState) {
        history.replaceState({ page }, "", `#${page}`);
    } else {
        history.pushState({ page }, "", `#${page}`);
    }

    if (searchInput) {
        searchInput.value = "";
    }
    clearSearchResults();

    await transitionToPage(page);
}

function scrollContentToTop() {
    const card = document.querySelector(".content-box");
    if (card) {
        card.scrollTo({ top: 0, behavior: "auto" });
    }
}

window.addEventListener("popstate", event => {
    const page = normalizePageName(event.state?.page || getPageFromHash());
    if (targetPage && targetPage !== currentPage && page === currentPage) {
        // Back pressed while another page was still loading: cancel that
        // load and stay on the page that's already showing
        navSeq++;
        targetPage = "";
        document.getElementById("content").classList.remove("blur-out");
        return;
    }
    if (page !== (targetPage || currentPage)) transitionToPage(page);
});


/* --------------------------------------------------
   shader defaults
-------------------------------------------------- */

const fx = new BalatroShader({
    container: "#loader",
    colours: { c1: "#000000", c2: "#000000", c3: "#000000" },
    speed: 1.0,
    contrast: 1.2,
    spinAmount: 0.3,
    pixelSizeFac: 1000,
    spinEase: 0.5,
    zoom: 50,
    offsetX: 0,
    offsetY: 0
});

/* base colours for the current page - defaults if anything goes wrong*/
let BASE_SHADER_COLOURS = { c1: "#000000", c2: "#000000", c3: "#000000" };

/* per‑page hue shift amounts for pulse*/
let PULSE_COLOURS = {
    about: 8,
    players: 12,
    seasons: 15
};


/* --------------------------------------------------
   snakey letter animations
-------------------------------------------------- */

// Tier-aware: low = no letter wrapping at all, otherwise only the page
// title (h1). The wave only runs while the heading is actually on
// screen (an IntersectionObserver toggles .wave-live), so off-screen
// headings cost nothing.
let waveObserver = null;
// `root` is normally the new page's DETACHED fragment, so wrapping the
// letters costs no extra layout (it happens before the page is inserted).
function animateHeadingText(root) {
    root = root || document.getElementById("content");
    const tier = (window.POP && POP.tier) || "medium";
    if (waveObserver) waveObserver.disconnect();
    if (tier === "low") return;
    if (!waveObserver && "IntersectionObserver" in window) {
        waveObserver = new IntersectionObserver(entries => {
            entries.forEach(e => e.target.classList.toggle("wave-live", e.isIntersecting));
        }, { root: document.querySelector(".content-box") });
    }
    // only the page title waves: every animating letter is its own
    // compositor layer, so a page full of waving h2s adds up
    const esc = c => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c);
    root.querySelectorAll("h1").forEach(h => {
        if (!h.dataset.animated) {
            h.dataset.animated = "true";
            h.innerHTML = [...h.textContent].map((ch, i) => ch === " "
                ? `<span class="letter space">&nbsp;</span>`
                : `<span class="letter" style="animation-delay:${(i * 0.06).toFixed(2)}s">${esc(ch)}</span>`).join("");
        }
        if (waveObserver) waveObserver.observe(h);
        else h.classList.add("wave-live");
    });
}


/* --------------------------------------------------
   hover tilt - w3schools
-------------------------------------------------- */

function attachTilt(card) {
    // Attach ONCE per element. loadPage() runs on every navigation and
    // used to add a brand-new mousemove listener to the same persistent
    // .content-box each time — they stacked up and made the tilt crawl.
    if (!card || card.dataset.tiltAttached) return;
    // touch screens have no hover, so tilt would only ever cost frames
    if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    card.dataset.tiltAttached = "true";

    let queued = false;
    let lastX = 0;
    let lastY = 0;

    card.addEventListener("mousemove", e => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (queued) return;
        if ((window.POP && POP.tier === "low") || window.DISABLE_TILT ||
            document.documentElement.classList.contains("pref-reduce-motion")) return;

        // coalesce many mousemove events into one read + one write per frame
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            const r = card.getBoundingClientRect();
            const tiltX = (((lastY - r.top) / r.height) - 0.5) * -5;
            const tiltY = (((lastX - r.left) / r.width) - 0.5) * 5;
            card.style.setProperty("--tiltX", tiltX + "deg");
            card.style.setProperty("--tiltY", tiltY + "deg");
            card.classList.add("hover-tilt");
        });
    });

    card.addEventListener("mouseleave", () => {
        card.classList.remove("hover-tilt");
        card.style.setProperty("--tiltX", "0deg");
        card.style.setProperty("--tiltY", "0deg");
    });
}


/* --------------------------------------------------
   shader pulse - no drifting
-------------------------------------------------- */

let isPulsing = false;
let pulseTimeout = null;

function pulseShader() {
    if (isPulsing) return;
    isPulsing = true;

    const page = document.querySelector("#content").dataset.page;
    const hueShift = PULSE_COLOURS[page] || 20;

    const shifted = {
        c1: shiftHue(BASE_SHADER_COLOURS.c1, hueShift),
        c2: shiftHue(BASE_SHADER_COLOURS.c2, hueShift),
        c3: shiftHue(BASE_SHADER_COLOURS.c3, hueShift)
    };

    fx.applyPreset({
        c1: shifted.c1,
        c2: shifted.c2,
        c3: shifted.c3
    }, 0.35);

    if (pulseTimeout) clearTimeout(pulseTimeout);

    pulseTimeout = setTimeout(() => {
        fx.applyPreset({
            c1: BASE_SHADER_COLOURS.c1,
            c2: BASE_SHADER_COLOURS.c2,
            c3: BASE_SHADER_COLOURS.c3
        }, 0.8);

        isPulsing = false;
    }, 250);
}


/* --------------------------------------------------
   rgb to hue converters so shader can read in css. 
-------------------------------------------------- */

function shiftHue(hex, degree) {
    let { h, s, l } = hexToHSL(hex);
    h = (h + degree) % 360;
    return hslToHex(h, s, l);
}
//not my code here - attempted to make this, but failed and found
//this one
function hexToHSL(H) {
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1];
        g = "0x" + H[2] + H[2];
        b = "0x" + H[3] + H[3];
    } else {
        r = "0x" + H[1] + H[2];
        g = "0x" + H[3] + H[4];
        b = "0x" + H[5] + H[6];
    }
    r /= 255; g /= 255; b /= 255;

    const cmin = Math.min(r,g,b);
    const cmax = Math.max(r,g,b);
    const delta = cmax - cmin;

    let h = 0, s = 0, l = 0;

    if (delta == 0) h = 0;
    else if (cmax == r) h = ((g - b) / delta) % 6;
    else if (cmax == g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return { h, s: s * 100, l: l * 100 };
}

//my code
function hslToHex(h, s, l) {
    s /= 100; l /= 100;

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    return (
        "#" +
        [f(0), f(8), f(4)]
            .map(x => Math.round(x * 255).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
    );
}


/* --------------------------------------------------
   toolbar logic - hides when not selected/open
-------------------------------------------------- */

const toolbar = document.getElementById("editor-toolbar");
attachTilt(toolbar);

document.querySelectorAll("#editor-toolbar button").forEach(btn => {
    btn.addEventListener("click", () => {
        const cmd = btn.dataset.cmd;

        if (cmd === "h1") {
            document.execCommand("formatBlock", false, "h1");
        } else if (cmd === "ul") {
            document.execCommand("insertUnorderedList");
        } else if (cmd === "link") {
            const url = prompt("Enter URL:");
            if (url) document.execCommand("createLink", false, url);
        } else {
            document.execCommand(cmd);
        }
    });
});


/* --------------------------------------------------
   editor mode
   Save now strips every transient runtime artifact
   (letter-wrap spans, scroll-reveal + fade classes,
   editing/tilt state, wiring flags) BEFORE persisting,
   then re-renders the page from the clean copy. Without
   this, saved markup kept the `reveal-on-scroll` class
   with no `revealed`, so content stayed invisible on
   reload — the "bugs out on save" report.
-------------------------------------------------- */

let editing = false;

const TRANSIENT_CLASSES = [
    "fade-in", "reveal-on-scroll", "revealed",
    "blur-out", "blur-in", "blur-in-prep",
    "hover-tilt", "editable", "draggable-img",
    "dragging", "color-shift", "nav-fade-out", "wave-live"
];

function sanitizeEditedHTML(sourceEl) {
    const clone = sourceEl.cloneNode(true);

    // collapse the per-letter heading wrapping back to plain text
    clone.querySelectorAll("[data-animated]").forEach(h => {
        h.textContent = h.textContent;
        h.removeAttribute("data-animated");
    });
    clone.querySelectorAll("span.letter").forEach(span => {
        span.replaceWith(document.createTextNode(span.textContent));
    });

    // drop transient classes + wiring flags + editing attrs
    clone.querySelectorAll("*").forEach(el => {
        TRANSIENT_CLASSES.forEach(c => el.classList.remove(c));
        if (el.getAttribute("class") === "") el.removeAttribute("class");
        el.removeAttribute("data-wired");
        el.removeAttribute("contenteditable");
        el.style.removeProperty("transform");
        el.style.removeProperty("opacity");
        if (el.getAttribute("style") === "") el.removeAttribute("style");
    });

    // any leftover drag clones that slipped in
    clone.querySelectorAll("[style*='position: fixed']").forEach(el => el.remove());

    return clone.innerHTML;
}

document.getElementById("editor-btn").addEventListener("click", () => {
    const content = document.getElementById("content");
    const page = content.dataset.page;
    const btn = document.getElementById("editor-btn");

    editing = !editing;

    if (editing) {
        content.contentEditable = "true";
        content.classList.add("editable");
        btn.innerText = "Save";
        toolbar.classList.add("show");
    } else {
        content.contentEditable = "false";
        content.classList.remove("editable");
        btn.innerText = "Editor";
        toolbar.classList.remove("show");

        // persist a CLEAN copy, then rebuild the page from it so
        // the edit renders exactly as a fresh page load would
        const cleanHTML = sanitizeEditedHTML(content);
        localStorage.setItem("wiki_" + page, cleanHTML);

        loadPage(page).then(() => {
            pulseShader();
            btn.innerText = "Saved ✓";
            setTimeout(() => { btn.innerText = "Editor"; }, 1200);
        });
    }
});



/* --------------------------------------------------
   overengineered draggable images
-------------------------------------------------- */

// Draggable CONTENT images only. Rewritten to fix the clone-spam bug:
// the old version ran on every page load and re-bound the persistent
// #nav-logo each time, so N navigations meant N clones per click (and
// stray clones that never moved). Now: only #content images, wired
// once each, one clone at a time, and a plain click (no drag) never
// leaves a clone behind.
function enableDraggableImages() {
    document.querySelectorAll("#content img").forEach(original => {
        if (original.dataset.dragWired) return;
        if (original.id === "skin-canvas" || original.id === "credits-skin") return;
        if (original.closest(".gallery, .infobox")) return;      // galleries have the lightbox
        original.dataset.dragWired = "1";

        original.draggable = false;
        original.addEventListener("dragstart", e => e.preventDefault());
        original.style.cursor = "grab";
        original.style.userSelect = "none";

        let clone = null;
        let startX = 0, startY = 0, moved = false;

        function getContentTilt() {
            const box = document.querySelector(".content-box");
            if (!box) return { x: 0, y: 0 };
            const matrix = getComputedStyle(box).transform;
            if (matrix === "none") return { x: 0, y: 0 };
            const values = matrix.match(/matrix3d\((.+)\)/);
            if (!values) return { x: 0, y: 0 };
            const nums = values[1].split(",").map(parseFloat);
            return {
                x: Math.asin(-nums[9]) * (180 / Math.PI),
                y: Math.asin(nums[2]) * (180 / Math.PI)
            };
        }

        original.addEventListener("mousedown", e => {
            if (clone) return;               // never spawn a second clone
            e.preventDefault();
            startX = e.clientX; startY = e.clientY; moved = false;

            const rect = original.getBoundingClientRect();
            clone = original.cloneNode(true);
            clone.removeAttribute("id");
            clone.dataset.dragWired = "1";
            Object.assign(clone.style, {
                position: "fixed", left: rect.left + "px", top: rect.top + "px",
                width: rect.width + "px", height: rect.height + "px",
                pointerEvents: "none", zIndex: 999999, cursor: "grabbing",
                transition: "none", transformOrigin: getTransformOrigin(original)
            });
            document.body.appendChild(clone);
            original.style.opacity = "0";
            tilt = getContentTilt();                 // read once per drag, not per move
            // document listeners only live for the duration of one drag
            // (they used to be added per image, per page, and never removed)
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", endDrag);
        });

        let tilt = { x: 0, y: 0 }, moveQueued = false, lastDx = 0, lastDy = 0;
        function onMove(e) {
            if (!clone) return;
            lastDx = e.clientX - startX; lastDy = e.clientY - startY;
            if (Math.abs(lastDx) > 3 || Math.abs(lastDy) > 3) moved = true;
            if (moveQueued) return;
            moveQueued = true;
            requestAnimationFrame(() => {
                moveQueued = false;
                if (clone) clone.style.transform =
                    `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translate(${lastDx}px, ${lastDy}px) scale(1.06)`;
            });
        }

        function endDrag() {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", endDrag);
            if (!clone) return;
            const c = clone;
            clone = null;

            // a plain click (no real movement) — clean up instantly, no stuck clone
            if (!moved) {
                c.remove();
                original.style.opacity = "1";
                return;
            }

            const realRect = original.getBoundingClientRect();
            c.style.transition = "all 0.35s cubic-bezier(0.25, 1.25, 0.5, 1)";
            c.style.left = realRect.left + "px";
            c.style.top = realRect.top + "px";
            c.style.transform = getMatrix(original);
            setTimeout(() => { c.remove(); original.style.opacity = "1"; }, 360);
        }
    });
}

function getMatrix(el) {
    const style = getComputedStyle(el);
    return style.transform === "none" ? "matrix(1,0,0,1,0,0)" : style.transform;
}

function getTransformOrigin(el) {
    const style = getComputedStyle(el);
    return style.transformOrigin || "50% 50%";
}


/* --------------------------------------------------
   Season 2 Sidebar Navigation
-------------------------------------------------- */

function setupSidebarNav() {
    const sidebar = document.querySelector("#sidebar-nav");
    const layout = document.querySelector("#s2-layout");
    const sections = document.querySelectorAll("#s2-content .s2-section");

    if (!sidebar || !layout || sections.length === 0) return;

    // slide-in animation
    layout.classList.add("sidebar-ready");
    requestAnimationFrame(() => {
        layout.classList.add("sidebar-show");
    });

    // click to scroll
    sidebar.querySelectorAll("li").forEach(li => {
        li.addEventListener("click", () => {
            const id = li.dataset.target;
            const target = document.getElementById(id);
            if (target) {
                POP.scrollTo(target);
            }
        });
    });

    // Active-section highlight + sticky mini-header reveal, both through the
    // batched scroll scheduler: all layout reads first, then all writes, once
    // per frame, and a DOM write only when the state actually changes.
    // (The sticky header lives inside the season pages, so the old top-level
    // listener never found it.)
    const items = [...sidebar.querySelectorAll("li")];
    const sticky = document.getElementById("sticky-header");
    const logo = document.getElementById("nav-logo");
    let lastId = null, lastStuck = null;
    POP.onScroll("sidebar", {
        read(box) {
            let id = null;
            for (const sec of sections) {
                const r = sec.getBoundingClientRect();
                if (r.top <= 150 && r.bottom >= 150) { id = sec.id; break; }
            }
            const stuck = logo ? logo.getBoundingClientRect().bottom - box.getBoundingClientRect().top <= 0 : false;
            return { id, stuck };
        },
        write(d) {
            if (d.id && d.id !== lastId) {
                lastId = d.id;
                items.forEach(li => li.classList.toggle("active", li.dataset.target === d.id));
            }
            if (sticky && window.STICKY_HEADER_ENABLED && d.stuck !== lastStuck) {
                lastStuck = d.stuck;
                sticky.classList.toggle("visible", d.stuck);
            }
        }
    });
}

/* --------------------------------------------------
   Logo Bounce/follow tilt
-------------------------------------------------- */
const tilt = document.getElementById("logo-tilt");
const wrapper = document.getElementById("logo-wrapper");

if (wrapper && tilt) {
    let logoQueued = false, logoX = 0, logoY = 0;
    wrapper.addEventListener("mousemove", (e) => {
        logoX = e.clientX; logoY = e.clientY;
        if (logoQueued) return;
        logoQueued = true;
        requestAnimationFrame(() => {          // one read + one write per frame
            logoQueued = false;
            const rect = wrapper.getBoundingClientRect();
            const rotateY = (((logoX - rect.left) / rect.width) - 0.5) * 12;
            const rotateX = (((logoY - rect.top) / rect.height) - 0.5) * -12;
            tilt.style.transform =
                `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.06)`;
        });
    });

    wrapper.addEventListener("mouseleave", () => {
        tilt.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
    });
}

/* --------------------------------------------------
   Snappy Blur Transition
-------------------------------------------------- */

let navSeq = 0;
let targetPage = "";
let firstRendered = false;
function markFirstRender() {
    if (firstRendered) return;
    firstRendered = true;
    document.dispatchEvent(new Event("pop:firstpage"));     // loading screen can go
}
async function transitionToPage(pageName) {
    const content = document.getElementById("content");
    const seq = ++navSeq;                     // newer navigations cancel older ones
    targetPage = pageName;
    if (window.POP) POP.markBusy(900);        // background drops to its busy fps

    // First page of the visit: render immediately, no fade-out delay.
    if (!firstRendered) {
        if (await loadPage(pageName, seq)) markFirstRender();
        return;
    }

    content.classList.add("blur-out");
    pulseShader();

    // the fetch runs DURING the fade-out instead of after it
    await Promise.all([new Promise(r => setTimeout(r, 130)), fetchPage(pageName)]);
    if (seq !== navSeq) return;
    // reset scroll while the OLD page is still laid out and invisible, so
    // it doesn't force a layout of the new one
    scrollContentToTop();
    if (!(await loadPage(pageName, seq))) return;
    markFirstRender();

    // fade in with the Web Animations API: no forced reflow to restart a
    // CSS transition, runs on the compositor (opacity + transform only)
    content.classList.remove("blur-out");
    content.animate(
        [{ opacity: 0, transform: "translate3d(0,-6px,0)" }, { opacity: 1, transform: "none" }],
        { duration: 160, easing: "ease-out" }
    );
}



/* --------------------------------------------------
   load page
-------------------------------------------------- */


/* In-memory page cache + hover/idle prefetch: each page is fetched at most
   once per visit, and usually before it's clicked. */
const PAGE_CACHE = new Map();
const afterPaint = fn => requestAnimationFrame(() => setTimeout(fn, 0));
function fetchPage(name) {
    if (PAGE_CACHE.has(name)) return PAGE_CACHE.get(name);
    const V = window.WIKI_ASSET_VERSION || "12";
    // cache-bust page HTML so edits aren't masked by the browser cache
    const p = fetch(`pages/${name}.html?v=${V}`)
        .then(r => (r.ok ? r.text() : null))
        .catch(() => null);
    PAGE_CACHE.set(name, p);
    p.then(t => { if (t === null) PAGE_CACHE.delete(name); });
    return p;
}
// Pages are also PARSED ahead of time (in idle time, into a <template>), so
// a navigation only has to clone ready-made nodes instead of parsing HTML.
const TEMPLATES = new Map();
function pageTemplate(name, html) {
    let t = TEMPLATES.get(name);
    if (t && t._src === html) return t;
    t = document.createElement("template");
    t.innerHTML = html;
    t._src = html;
    // images: lazy + async decode, so a page swap never waits on them
    t.content.querySelectorAll("img").forEach((img, i) => {
        if (i > 1 && !img.hasAttribute("loading")) img.loading = "lazy";
        img.decoding = "async";
    });
    TEMPLATES.set(name, t);
    return t;
}
function prefetchPage(raw) {
    const name = normalizePageName(raw);
    if (name === "404" || PAGE_CACHE.has(name)) return;
    fetchPage(name).then(html => {
        if (html && window.POP) POP.idle(() => pageTemplate(name, html), 2000);
    });
}
document.addEventListener("pointerover", e => {
    const el = e.target.closest && e.target.closest("[data-page], [data-player]");
    if (el) prefetchPage(el.dataset.page || el.dataset.player);
}, { passive: true });

// `seq` (from transitionToPage) lets a slow fetch that finishes after a newer
// navigation bail out instead of overwriting the newer page.
async function loadPage(name, seq) {
    const content = document.querySelector("#content");
    const FALLBACK_404 = `<h1 class="center-title">404</h1>
        <p class="season-intro">This page wandered off the map and never came back.</p>`;
    const stale = () => seq !== undefined && seq !== navSeq;

    // a missing file falls back to the themed 404 page
    let html = await fetchPage(name);
    if (html === null && name !== "404") { name = "404"; html = await fetchPage("404"); }
    if (html === null) html = FALLBACK_404;
    if (stale()) return false;

    if (window.POP) { POP.markBusy(900); POP.onScroll("sidebar", null); }
    disposeSkinViewers();

    // Build the whole new page OFF-DOCUMENT: clone the pre-parsed template
    // (or parse an editor-saved copy), wrap the title letters and run every
    // wiki enhancement (meta strip, TOC, links, gallery...) on the detached
    // fragment - none of that costs style or layout. Then one insertion.
    const saved = localStorage.getItem("wiki_" + name);
    const frag = saved !== null
        ? pageTemplate("saved:" + name, saved).content.cloneNode(true)
        : pageTemplate(name, html).content.cloneNode(true);
    content.dataset.page = name;
    animateHeadingText(frag);
    if (window.wikiEnhance) window.wikiEnhance(frag, name);
    content.replaceChildren(frag);
    if (window.POP) POP.afterSwap();

    editing = false;
    content.contentEditable = "false";
    content.classList.remove("editable");
    document.getElementById("editor-btn").innerText = "Editor";
    toolbar.classList.remove("show");

    const card = document.querySelector(".content-box");
    if (card) attachTilt(card);

    // drag wiring after the new page has painted
    afterPaint(() => {
        if (seq !== undefined && seq !== navSeq) return;
        enableDraggableImages();
    });

    // Click to transition. Only cards that carry a data-page: #player-next
    // is a .season-box too, but its navigation is wired in setupPlayersPage.
    document.querySelectorAll("#content .season-box[data-page]").forEach(b => {
        b.addEventListener("mouseenter", pulseShader);
        b.addEventListener("click", () => navigateToPage(b.dataset.page));
    });

    applySimpleSettings();              // applies the page's shader preset once
    generateTableOfContents();
    updatePageHeader(name);
    updateNavState(name);
    currentPage = name;
    targetPage = "";          // arrived (a 404 fallback must not stay the "target")

    if (name === "players" || PLAYER_ORDER.includes(name)) setupPlayersPage();
    if (name === "settings") initSimpleSettingsUI();
    if (name === "season1" || name === "season2" || name === "season3") setupSidebarNav();
    return true;
}

// warm the cache for the main pages once the browser is idle
if (window.POP) POP.idle(() => ["seasons", "players", "lore", "abilities", "items"].forEach(prefetchPage), 4000);


/* --------------------------------------------------
   shader presets per page
-------------------------------------------------- */

function applyPresetForPage(name) {
    const presets = {
        about: {
            c1: "#d41353",
            c2: "#85042f",
            c3: "#000000",
            speed: 1.4,
            spinAmount: 0.5,
            contrast: 2,
            zoom: 30,
            pixelSizeFac: 750,
            spinEase: 0.5
        },
        players: {
            c1: "#8c28eb",
            c2: "#551d8a",
            c3: "#000000",
            speed: 1.4,
            spinAmount: 0.4,
            contrast: 2,
            zoom: 50,
            pixelSizeFac: 750,
            spinEase: 0.5
        },
        seasons: {
            c1: "#1aa34a",
            c2: "#0b6129",
            c3: "#000000",
            speed: 1.4,
            spinAmount: 0.35,
            contrast: 1.3,
            zoom: 10,
            pixelSizeFac: 500,
            spinEase: 0.5
        },
        season3: {
            c1: "#fc5603",
            c2: "#c2b7b2",
            c3: "#000000",
            speed: 1.4,
            spinAmount: 0.35,
            contrast: 1.3,
            zoom: 13,
            pixelSizeFac: 1000,
            spinEase: 0.5
        },
        season2: {
            c1: "#85042f",
            c2: "#1aa34a",
            c3: "#000000",
            speed: 1.4,
            spinAmount: 0.35,
            contrast: 1.3,
            zoom: 13,
            pixelSizeFac: 1000,
            spinEase: 0.5
        },
        season1: {
            c1: "#cfcac8",
            c2: "#6b89c2",
            c3: "#000000", /*#d6892b */
            speed: 1.4,
            spinAmount: 0.35,
            contrast: 1.3,
            zoom: 13,
            pixelSizeFac: 1000,
            spinEase: 0.5
        }
    };

        // player pages use the Players theme; any other page without its own
        // preset keeps the current theme (or Home's on a direct first visit)
        if (!presets[name]) {
            if (name.startsWith("people-")) name = "players";
            else if (BASE_SHADER_COLOURS.c1 === "#000000") name = "about";
            else return;
        }

        if (presets[name]) {
            fx.applyPreset(presets[name], 1.2);

            BASE_SHADER_COLOURS = {
                c1: presets[name].c1,
                c2: presets[name].c2,
                c3: presets[name].c3
            };

    // Theme colours. The card's --c1/--c2 are registered NON-inherited
    // properties that transition on the card only; small accents elsewhere
    // read an instant copy. (Transitioning an inherited property on :root
    // restyled every element on the page, every frame, for 1.2s.)
    const cbox = document.querySelector(".content-box");
    if (cbox) {
        cbox.style.setProperty("--c1", presets[name].c1);
        cbox.style.setProperty("--c2", presets[name].c2);
    }
    document.documentElement.style.setProperty("--theme-c1", presets[name].c1);
    document.documentElement.style.setProperty("--theme-c2", presets[name].c2);
}

    }


/* ---------------------------------------------
   Simple Settings: opacity + pause shader
--------------------------------------------- */

let SIMPLE_SETTINGS = JSON.parse(localStorage.getItem("popularis_simple_settings") || "{}");
const opacityRow = document.getElementById("opacity-row");

function applySimpleSettings() {
    const box = document.querySelector(".content-box");

    // EASY READING MODE: only apply opacity if enabled
    if (box && SIMPLE_SETTINGS.easyReading === true && SIMPLE_SETTINGS.opacity !== undefined) {
        const o = SIMPLE_SETTINGS.opacity;
        box.style.background =
            `linear-gradient(rgba(0,0,0,${o}), rgba(0,0,0,${o})) padding-box,
             linear-gradient(135deg, var(--c1), var(--c2)) border-box`;
    } else if (box) {
        // restore pure CSS background
        box.style.removeProperty("background");
    }

    // page preset first, then the pause override on top (previously a paused
    // shader never picked up the new page's colours)
    const page = document.querySelector("#content")?.dataset.page || "about";
    applyPresetForPage(page);
    if (SIMPLE_SETTINGS.pauseShader === true) fx.applyPreset({ speed: 0.1, spinAmount: 0.01 }, 2);
}

function initSimpleSettingsUI() {
    const opacityInput = document.getElementById("setting-opacity");
    const pauseInput = document.getElementById("setting-pause-shader");
    const easyToggle = document.getElementById("easy-reading-toggle");
    const saveBtn    = document.getElementById("save-settings");
    if (!opacityInput || !pauseInput || !easyToggle) return;

    // initial values
    easyToggle.checked = SIMPLE_SETTINGS.easyReading === true;
    opacityInput.value = SIMPLE_SETTINGS.opacity ?? 0.85;
    pauseInput.checked = SIMPLE_SETTINGS.pauseShader === true;

    // easy reading toggle
    easyToggle.onchange = () => {
        SIMPLE_SETTINGS.easyReading = easyToggle.checked;

        if (!easyToggle.checked) {
            // user turned it OFF > nuke settings AND restore defaults
            SIMPLE_SETTINGS = {};
            localStorage.removeItem("popularis_simple_settings");
            sessionStorage.clear();

            const box = document.querySelector(".content-box");
            if (box) box.style.removeProperty("background");   // (was a TypeError)
        } else {
            // turned ON and ensures opacity exists
            if (SIMPLE_SETTINGS.opacity === undefined) {
                SIMPLE_SETTINGS.opacity = parseFloat(opacityInput.value);
            }
            localStorage.setItem("popularis_simple_settings", JSON.stringify(SIMPLE_SETTINGS));
        }

        applySimpleSettings();
    };

    // opacity slider
    opacityInput.oninput = () => {
        SIMPLE_SETTINGS.opacity = parseFloat(opacityInput.value);
        SIMPLE_SETTINGS.easyReading = true;
        easyToggle.checked = true;
        localStorage.setItem("popularis_simple_settings", JSON.stringify(SIMPLE_SETTINGS));
        applySimpleSettings();
    };

    // pause shader
    pauseInput.onchange = () => {
        SIMPLE_SETTINGS.pauseShader = pauseInput.checked;
        localStorage.setItem("popularis_simple_settings", JSON.stringify(SIMPLE_SETTINGS));
        applySimpleSettings();
    };

    // SAVE SETTINGS BUTTON
    if (saveBtn) {
        saveBtn.onclick = () => {
            localStorage.setItem("popularis_simple_settings", JSON.stringify(SIMPLE_SETTINGS));
            applySimpleSettings();

            // tiny visual feedback
            saveBtn.style.transform = "scale(1.06)";
            setTimeout(() => {
                saveBtn.style.transform = "scale(1)";
            }, 140);
        };
    }
}



/* --------------------------------------------------
   nav
-------------------------------------------------- */

document.querySelectorAll("nav a[data-page]").forEach(a => {
    a.addEventListener("click", event => {
        event.preventDefault();
        navigateToPage(a.dataset.page);
    });
});

//nav -esque animations (for all though)
// NAV SHIMMER
//        document.querySelectorAll("nav a").forEach(link => {
//            link.addEventListener("mouseenter", () => {
//                link.classList.remove("nav-fade-out");
//                link.classList.add("color-shift");
//            });
//
//            link.addEventListener("mouseleave", () => {
//                link.classList.remove("color-shift");
//                link.classList.add("nav-fade-out");
//
//                setTimeout(() => {
//                    link.classList.remove("nav-fade-out");
//                }, 350);
//            });
//        });

function initExploreShimmer() {
    document.querySelectorAll(".season-box.explore").forEach(box => {
        const label = box.querySelector("span");
        if (!label) return;

        box.addEventListener("mouseenter", () => {
            label.classList.remove("nav-fade-out");
            label.classList.add("color-shift");
        });

        box.addEventListener("mouseleave", () => {
            label.classList.remove("color-shift");
            label.classList.add("nav-fade-out");

            setTimeout(() => {
                label.classList.remove("nav-fade-out");
            }, 350);
        });
    });
}

const nav = document.querySelector("nav");
const navList = nav ? nav.querySelector("ul") : null;
const navLinks = navList ? navList.querySelectorAll("a") : [];

// Position the sliding underline using each link's offset INSIDE the
// <ul> (its offsetParent). Using offsetTop as well means the bar follows
// the correct line when the nav wraps on mobile, instead of floating at a
// fixed bottom. Much more robust than the old getBoundingClientRect math.
// Link geometry is measured once (and again only on resize / font load),
// so moving the underline during a navigation never forces a layout.
let navGeom = new Map();
function measureNav() {
    navGeom = new Map();
    if (navList) navList.querySelectorAll("a").forEach(a => navGeom.set(a, {
        left: a.offsetLeft, top: a.offsetTop + a.offsetHeight + 3, width: a.offsetWidth
    }));
}
function moveUnderlineTo(link) {
    if (!nav || !navList || !link) return;
    if (!navGeom.has(link)) measureNav();
    const g = navGeom.get(link);
    if (!g) return;
    nav.style.setProperty("--underline-left", g.left + "px");
    nav.style.setProperty("--underline-top", g.top + "px");
    nav.style.setProperty("--underline-width", g.width + "px");
}

function moveUnderlineToActive() {
    if (!nav || !navList) return;
    const active = navList.querySelector("a.active-nav");
    if (active) moveUnderlineTo(active);
    else nav.style.setProperty("--underline-width", "0px");
}

// Hover moves underline; leaving returns it to the active link
navLinks.forEach(link => {
    link.addEventListener("mouseenter", () => moveUnderlineTo(link));
});
if (nav) nav.addEventListener("mouseleave", moveUnderlineToActive);

// Recompute on resize (link positions change as the nav re-wraps)
let underlineRaf;
window.addEventListener("resize", () => {
    cancelAnimationFrame(underlineRaf);
    underlineRaf = requestAnimationFrame(() => { measureNav(); moveUnderlineToActive(); });
});

// Initialise once the logo image has loaded (its width shifts the links)
const navLogo = document.getElementById("nav-logo");
if (navLogo && !navLogo.complete) navLogo.addEventListener("load", () => { measureNav(); moveUnderlineToActive(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureNav(); moveUnderlineToActive(); });
// the stylesheet loads without blocking render: re-measure once it's applied
document.addEventListener("pop:css", () => {
    measureNav(); moveUnderlineToActive();
    if (window.POP) POP.tick();
    if (window.POP_RENDERER) { POP_RENDERER.resize(); POP_RENDERER.kick(); }
});
moveUnderlineToActive();



/* --------------------------------------------------
   initial load
-------------------------------------------------- */

initSearchUI();
navigateToPage(getPageFromHash(), true);

/* skinview3d (~450 KB) is downloaded the first time a page needs a 3D
   model, instead of blocking every page load. */
let skinviewPromise = null;
function loadSkinview() {
    if (window.skinview3d) return Promise.resolve(window.skinview3d);
    if (!skinviewPromise) {
        skinviewPromise = new Promise((resolve, reject) => {
            const sc = document.createElement("script");
            sc.src = "libs/skinview3d.bundle.js";
            sc.async = true;
            sc.onload = () => resolve(window.skinview3d);
            sc.onerror = () => { skinviewPromise = null; reject(); };
            document.head.appendChild(sc);
        });
    }
    return skinviewPromise;
}

// One factory for every 3D skin on the site: capped pixel ratio, idle
// animation only above the low tier, and the render loop pauses whenever
// the model is scrolled off screen.
function makeSkinViewer(canvas, width, height, skin) {
    const tier = (window.POP && POP.tier) || "medium";
    const pr = tier === "low" ? 1 : Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.5);
    const viewer = new skinview3d.SkinViewer({ canvas, width, height, skin, pixelRatio: pr });
    viewer.controls.enableZoom = true;
    viewer.controls.enableRotate = true;
    if (tier !== "low" && !document.documentElement.classList.contains("pref-reduce-motion")) {
        viewer.animation = new skinview3d.IdleAnimation();
    }
    if ("IntersectionObserver" in window) {
        viewer._io = new IntersectionObserver(([e]) => { viewer.renderPaused = !e.isIntersecting; },
            { root: document.querySelector(".content-box") });
        viewer._io.observe(canvas);
    }
    return viewer;
}
// Existence check that doubles as the download: the skin viewer then gets
// the image straight from the cache (a HEAD request + GET was two trips).
function probeImage(url) {
    return new Promise(res => {
        const i = new Image();
        i.onload = () => res(true);
        i.onerror = () => res(false);
        i.src = url;
    });
}
window.probeImage = probeImage;
window.loadSkinview = loadSkinview;
window.makeSkinViewer = makeSkinViewer;

// Viewers used to keep rendering after you left their page (detached
// canvas, live WebGL loop). Every navigation now disposes them.
function disposeSkinViewers() {
    ["skinViewer", "creditsSkinViewer"].forEach(k => {
        const v = window[k];
        if (!v) return;
        try { if (v._io) v._io.disconnect(); v.dispose(); } catch (e) {}
        window[k] = null;
    });
}
window.disposeSkinViewers = disposeSkinViewers;

function setupPlayersPage() {
    // on the Players hub, fetch the 3D-skin library while the visitor is
    // still choosing, so the player page doesn't wait for it after the click
    if (!document.getElementById("skin-canvas") && window.POP) POP.idle(() => loadSkinview().catch(() => {}), 3000);

    // 1. More Players buttons
    document.querySelectorAll(".player-nav-item").forEach(btn => {
        btn.addEventListener("click", () => navigateToPage(btn.dataset.player));
    });

    // 2. NEXT → button
    const nextBtn = document.getElementById("player-next");
    if (nextBtn) {
        nextBtn.onclick = () => {
            const current = document.querySelector("#content").dataset.page;
            const index = PLAYER_ORDER.indexOf(current);
            navigateToPage(PLAYER_ORDER[(index + 1) % PLAYER_ORDER.length]);
        };
    }

    // 3. Skin viewer (library + skin fetched in parallel)
    const canvas = document.getElementById("skin-canvas");
    if (canvas) {
        const playerId = document.querySelector("#content").dataset.page.replace("people-", "");
        const skinPath = `skins/${playerId}.png`;
        Promise.all([
            loadSkinview(),
            probeImage(skinPath)
        ]).then(([, ok]) => {
            if (!canvas.isConnected) return;        // already navigated away
            disposeSkinViewers();
            window.skinViewer = makeSkinViewer(canvas, 224, 186, ok ? skinPath : "skins/placeholder.png");
        }).catch(() => {});
    }


    // 4. Sidebar scroll-to-section (only if sidebar exists)
    const sidebar = document.getElementById("player-sidebar");
    if (sidebar) {
        sidebar.querySelectorAll("li").forEach(item => {
            item.addEventListener("click", () => {
                const target = document.getElementById(item.dataset.target);
                if (target) {
                    POP.scrollTo(target);
                }
            });
        });
    }
}


/* ---------------------------------------------
   RESET SETTINGS
--------------------------------------------- */

function resetSettings() {
    // remove stored settings
    localStorage.removeItem("popularis_simple_settings");

    // restore default background (real CSS version)
    const box = document.querySelector(".content-box");
    if (box) {
        box.style.background = "rgba(0, 0, 0, 0.85)";
    }

    // restore shader movement
    const page = document.querySelector("#content")?.dataset.page || "about";
    applyPresetForPage(page);

    console.log("Settings reset to defaults.");
}