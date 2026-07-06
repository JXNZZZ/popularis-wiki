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
    const active = document.querySelector("nav a.active-nav");
    if (active) moveUnderlineTo(active);
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
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });
}

async function navigateToPage(pageName, replaceState = false) {
    const page = normalizePageName(pageName);
    if (page === currentPage) return;
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
    if (page !== currentPage) {
        transitionToPage(page);
    }
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

function animateHeadingText() {
    document.querySelectorAll("#content h1, #content h2, #content h3").forEach(h => {
        if (h.dataset.animated) return;
        h.dataset.animated = "true";

        const text = h.textContent;

        h.innerHTML = [...text]
            .map((char, i) => {
                if (char === " ") return `<span class="letter space">&nbsp;</span>`;
                return `<span class="letter" style="animation-delay:${i * 0.06}s">${char}</span>`;
            })
            .join("");
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
    card.dataset.tiltAttached = "true";

    let queued = false;
    let lastX = 0;
    let lastY = 0;

    card.addEventListener("mousemove", e => {
        const rect = card.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        if (queued) return;

        // coalesce many mousemove events into one write per frame
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            const r = card.getBoundingClientRect();
            const tiltX = ((lastY / r.height) - 0.5) * -5;
            const tiltY = ((lastX / r.width) - 0.5) * 5;
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
    "dragging", "color-shift", "nav-fade-out"
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

//this is what hell feels like
function enableDraggableImages() {
    document.querySelectorAll("img").forEach(original => {
        original.draggable = false;
        original.addEventListener("dragstart", e => e.preventDefault());

        let clone = null;
        let startX = 0;
        let startY = 0;
        let prevX = 0;
        let prevY = 0;
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;
        //allows to adjust to current dimension of 3D content panel
        let currentAngle = 0;
        let targetAngle = 0;
        let stillFrames = 0;

        let currentScale = 1;
        let targetScale = 1;

        original.style.cursor = "grab";
        original.style.userSelect = "none";
        //allows to adjust to current dimension of 3D content panel (tilt)
        //just using the same values
        function getContentTilt() {
            const box = document.querySelector(".content-box");
            const style = getComputedStyle(box);
            const matrix = style.transform;

            if (matrix === "none") return { x: 0, y: 0 };

            const values = matrix.match(/matrix3d\((.+)\)/);
            if (!values) return { x: 0, y: 0 };

            const nums = values[1].split(",").map(parseFloat);
            //access the last piece of data
            const m21 = nums[9];
            const m02 = nums[2];

            const tiltX = Math.asin(-m21) * (180 / Math.PI);
            const tiltY = Math.asin(m02) * (180 / Math.PI);

            return { x: tiltX, y: tiltY };
        }
        //on click creates a clone that is draggable with ease animation
        original.addEventListener("mousedown", e => {
            dragging = true;

            const rect = original.getBoundingClientRect();

            clone = original.cloneNode(true);
            clone.style.position = "fixed";
            clone.style.left = rect.left + "px";
            clone.style.top = rect.top + "px";
            clone.style.width = rect.width + "px";
            clone.style.height = rect.height + "px";
            clone.style.pointerEvents = "none";
            clone.style.zIndex = 999999;
            clone.style.cursor = "grabbing";
            clone.style.transition = "none";
            const origin = getTransformOrigin(original);
            clone.style.transformOrigin = origin;


            document.body.appendChild(clone);

            original.style.opacity = "0";

            startX = e.clientX;
            startY = e.clientY;
            prevX = e.clientX;
            prevY = e.clientY;
            //scales up to show that it's draggable 
            targetScale = 1.08;
        });
        //moves with mouse and drags. smooth ease animation using a sin alg linked on project page
        document.addEventListener("mousemove", e => {
            if (!dragging || !clone) return;

            offsetX = e.clientX - startX;
            offsetY = e.clientY - startY;

            const dx = e.clientX - prevX;

            if (Math.abs(dx) < 0.5) {
                stillFrames++;
                if (stillFrames > 3) {
                    targetAngle = 0;
                }
            } else {
                stillFrames = 0;
                targetAngle = dx * 0.05;
            }

            currentAngle += (targetAngle - currentAngle) * 0.1;
            currentScale += (targetScale - currentScale) * 0.12;

            const tilt = getContentTilt();

            clone.style.transform = `
                rotateX(${tilt.x}deg)
                rotateY(${tilt.y}deg)
                translate(${offsetX}px, ${offsetY}px)
                rotate(${currentAngle}deg)
                scale(${currentScale})
            `;

            prevX = e.clientX;
            prevY = e.clientY;
        });

        document.addEventListener("mouseup", () => {
            if (!dragging || !clone) return;

            dragging = false;

            const realRect = original.getBoundingClientRect();
            const realMatrix = getMatrix(original);
            const origin = getTransformOrigin(original);

            clone.style.transition = "all 0.35s cubic-bezier(0.25, 1.25, 0.5, 1)";
            clone.style.left = realRect.left + "px";
            clone.style.top = realRect.top + "px";
            clone.style.width = realRect.width + "px";
            clone.style.height = realRect.height + "px";
            clone.style.transformOrigin = origin;
            clone.style.transform = realMatrix;

            // restore orignal before cloen
            setTimeout(() => {
                clone.remove();
                clone = null;
                original.style.opacity = "1";
            }, 350);

            // Reset state
            currentAngle = 0;
            targetAngle = 0;
            currentScale = 1;
            targetScale = 1;
        });



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
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });

    // highlight active section on scroll
    document.querySelector(".content-box").addEventListener("scroll", () => {
        let currentId = null;

        sections.forEach(sec => {
            const rect = sec.getBoundingClientRect();
            if (rect.top <= 150 && rect.bottom >= 150) {
                currentId = sec.id;
            }
        });

        if (!currentId) return;

        sidebar.querySelectorAll("li").forEach(li => {
            li.classList.toggle("active", li.dataset.target === currentId);
        });
    });
}
/* --------------------------------------------------
   Sticky header scroll reveal
-------------------------------------------------- */

const box = document.querySelector(".content-box");
const mainLogo = document.getElementById("nav-logo");
const stickyHeader = document.getElementById("sticky-header");

//fixed the thousand and one bazillion error issues in console

if (box && mainLogo && stickyHeader) {
    box.addEventListener("scroll", () => {
        const logoBottom = mainLogo.getBoundingClientRect().bottom;
        const boxTop = box.getBoundingClientRect().top;

        if (logoBottom - boxTop <= 0) {
            stickyHeader.classList.add("visible");
        } else {
            stickyHeader.classList.remove("visible");
        }
    });
}

/* --------------------------------------------------
   Logo Bounce/follow tilt
-------------------------------------------------- */
const tilt = document.getElementById("logo-tilt");
const wrapper = document.getElementById("logo-wrapper");

wrapper.addEventListener("mousemove", (e) => {
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY = ((x / rect.width) - 0.5) * 12;
    const rotateX = ((y / rect.height) - 0.5) * -12;

    tilt.style.transform =
        `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.06)`;
});

wrapper.addEventListener("mouseleave", () => {
    tilt.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
});

/* --------------------------------------------------
   Snappy Blur Transition
-------------------------------------------------- */

async function transitionToPage(pageName) {
    const content = document.getElementById("content");

    // Blur out fast
    content.classList.add("blur-out");

    // Shader pulse
    pulseShader();

    // Wait for blur-out
    await new Promise(r => setTimeout(r, 130));

    // Load new page
    await loadPage(pageName);

    // Prep new content blurred
    content.classList.add("blur-in-prep");

    // Force reflow
    void content.offsetWidth;

    // Blur in fast
    content.classList.add("blur-in");

    // Cleanup
    setTimeout(() => {
        content.classList.remove("blur-out", "blur-in-prep", "blur-in");
    }, 200);

    scrollContentToTop();
}



/* --------------------------------------------------
   load page
-------------------------------------------------- */


async function loadPage(name) {
    const content = document.querySelector("#content");
    const V = window.WIKI_ASSET_VERSION || "12";
    const FALLBACK_404 = `<h1 class="center-title fade-in">404</h1>
        <p class="season-intro fade-in">This page wandered off the map and never came back.</p>`;

    try {
        // cache-bust page HTML so edits aren't masked by the browser cache
        let res = await fetch(`pages/${name}.html?v=${V}`);
        // a missing file returns a non-OK response (fetch only throws on
        // network errors), so fall back to the themed 404 page
        if (!res.ok && name !== "404") {
            name = "404";
            res = await fetch(`pages/404.html?v=${V}`);
        }
        const html = res.ok ? await res.text() : FALLBACK_404;

        content.dataset.page = name;

        const saved = localStorage.getItem("wiki_" + name);
        content.innerHTML = saved !== null ? saved : html;
        // Apply fade-in to all children
        content.querySelectorAll("*").forEach(el => el.classList.add("fade-in"));

    } catch {
        content.dataset.page = "404";
        content.innerHTML = FALLBACK_404;
        return;
    }

    editing = false;
    content.contentEditable = "false";
    content.classList.remove("editable");
    document.getElementById("editor-btn").innerText = "Editor";
    toolbar.classList.remove("show");

    const card = document.querySelector(".content-box");
    if (card) attachTilt(card);

    content.classList.remove("fade-in");
    void content.offsetWidth;
    content.classList.add("fade-in");

    animateHeadingText();
    enableDraggableImages();

    // Hover pulse
    document.querySelectorAll("#content .season-box").forEach(box => {
        box.addEventListener("mouseenter", () => {
            pulseShader();
        });
    });

    // Click to transition.
    // IMPORTANT: only bind cards that actually carry a data-page.
    // #player-next also has class "season-box" but no data-page, so the
    // old unfiltered selector fired transitionToPage(undefined) →
    // "pages/undefined.html". Its real navigation is wired separately
    // in setupPlayersPage().
    document.querySelectorAll("#content .season-box[data-page]").forEach(box => {
        box.addEventListener("click", () => {
            transitionToPage(box.dataset.page);
        });
    });

    applyPresetForPage(name);
    applySimpleSettings();
    generateTableOfContents();

    if (name === "settings") {
        initSimpleSettingsUI();
    }

    updatePageHeader(name);
    updateNavState(name);
    currentPage = name;

    // after content.innerHTML is set, animations, etc.
    applyPresetForPage(name);
    applySimpleSettings();

    // Run on ALL player pages, not just "players"
    const isPlayerPage =
        name === "players" ||          // main hub
        PLAYER_ORDER.includes(name);   // any people-xxx page

    if (isPlayerPage) {
        setupPlayersPage();
    }

    if (name === "settings") {
        initSimpleSettingsUI();
    }

    if (name === "season2") {
        setupSidebarNav();
    }

    if (name === "season2" || name === "season1" || name === "season3") {
        setupSidebarNav();
    }
}


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

        if (presets[name]) {
            fx.applyPreset(presets[name], 1.2);

            BASE_SHADER_COLOURS = {
                c1: presets[name].c1,
                c2: presets[name].c2,
                c3: presets[name].c3
            };

    // sync border colours to page theme - in tandom with css
    document.documentElement.style.setProperty("--c1", presets[name].c1);
    document.documentElement.style.setProperty("--c2", presets[name].c2);
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

    // SHADER PAUSE (doesn't work atm)
    const paused = SIMPLE_SETTINGS.pauseShader === true;
    if (paused) {
        fx.applyPreset({ speed: 0.1, spinAmount: 0.01 }, 2); //works now - spin changes correctly.
    } else {
        const page = document.querySelector("#content")?.dataset.page || "about";
        applyPresetForPage(page);
    }
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
            if (box) box.style.removeAttribute("style");
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
const navLinks = document.querySelectorAll("nav a");

function moveUnderlineTo(link) {
    const rect = link.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();

    const navStyle = getComputedStyle(nav);
    const navPaddingLeft = parseFloat(navStyle.paddingLeft);

    nav.style.setProperty("--underline-left",
        (rect.left - navRect.left - navPaddingLeft) + "px"
    );

    nav.style.setProperty("--underline-width", rect.width + "px");
}


// Hover moves underline
navLinks.forEach(link => {
    link.addEventListener("mouseenter", () => moveUnderlineTo(link));
});

// Leaving nav returns underline to active link
nav.addEventListener("mouseleave", () => {
    const active = document.querySelector("nav a.active-nav");
    if (active) moveUnderlineTo(active);
});

// Initialize on load
const active = document.querySelector("nav a.active-nav");
if (active) moveUnderlineTo(active);



/* --------------------------------------------------
   initial load
-------------------------------------------------- */

initSearchUI();
navigateToPage(getPageFromHash(), true);

function setupPlayersPage() {

    // 1. Attach click listeners to More Players buttons
    document.querySelectorAll(".player-nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.player;
            transitionToPage(target);
        });
    });

    console.log("SETUP RUNNING FOR:", document.querySelector("#content").dataset.page);
    console.log("LOADPAGE CALLED WITH:", name);

    // 2. Attach NEXT → button
    const nextBtn = document.getElementById("player-next");
    if (nextBtn) {
        nextBtn.onclick = () => {
            const current = document.querySelector("#content").dataset.page;
            setupPlayersPage();
            const playerId = current.replace("people-", "");

            const index = PLAYER_ORDER.indexOf(current);
            const nextIndex = (index + 1) % PLAYER_ORDER.length;

            transitionToPage(PLAYER_ORDER[nextIndex]);
        };
    }

    // 3. Initialize the skin viewer
    const canvas = document.getElementById("skin-canvas");
    if (canvas && window.skinview3d) {

        // Dispose old viewer to prevent WebGL context leaks
        if (window.skinViewer) {
            window.skinViewer.dispose();
        }

        const current = document.querySelector("#content").dataset.page;
        const playerId = current.replace("people-", "");

        const skinPath = `skins/${playerId}.png`;

        fetch(skinPath, { method: "HEAD" })
            .then(res => {
                const finalSkin = res.ok
                    ? skinPath
                    : "skins/placeholder.png";

                window.skinViewer = new skinview3d.SkinViewer({
                    canvas,
                    width: 224,
                    height: 186,
                    skin: finalSkin
                });

                skinViewer.controls.enableZoom = true;
                skinViewer.controls.enableRotate = true;
                skinViewer.animation = new skinview3d.IdleAnimation();
            })
            .catch(() => {
                window.skinViewer = new skinview3d.SkinViewer({
                    canvas,
                    width: 224,
                    height: 186,
                    skin: "skins/placeholder.png"
                });
            });
    }


    // 4. Sidebar scroll-to-section (only if sidebar exists)
    const sidebar = document.getElementById("player-sidebar");
    if (sidebar) {
        sidebar.querySelectorAll("li").forEach(item => {
            item.addEventListener("click", () => {
                const target = document.getElementById(item.dataset.target);
                if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
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