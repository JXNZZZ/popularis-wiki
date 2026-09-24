/* ==================================================
   POPULARIS WIKI — performance core (loaded before everything else)

   * Quality tiers (gfx-low / gfx-medium / gfx-high on <html>), picked from
     the real hardware, or forced in Settings -> Graphics Quality.
   * Adaptive governor: watches actual frame pacing and steps quality down
     (render resolution first, then tier) when a device can't keep up, and
     remembers the result for next visit.
   * One batched scroll scheduler: every scroll-driven effect does all of its
     layout READS first and all of its WRITES second, once per frame, so the
     effects never force layout on each other (no layout thrashing).
================================================== */

(function () {
    "use strict";

    const root = document.documentElement;
    const POP = window.POP = window.POP || {};

    function readJSON(key, fallback) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
        catch (e) { return fallback; }
    }
    function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

    /* ---------------- device -> tier ---------------- */

    // The GPU string comes from the background renderer's own WebGL context
    // (POP.reportGPU below), so detection never creates a throwaway context
    // and never blocks the first paint.
    function detectTier(gpu) {
        const n = navigator;
        const mem = n.deviceMemory || 4, cores = n.hardwareConcurrency || 4;
        const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
        const saveData = !!(n.connection && n.connection.saveData);
        gpu = String(gpu || "").toLowerCase();

        if (gpu === "none" || saveData) return "low";
        if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(gpu)) return "low";  // CPU rendering
        if (mem <= 2 || cores <= 2) return "low";
        if (coarse) {
            if (/apple gpu/.test(gpu)) return "medium";                                    // iPhone / iPad
            return (mem >= 6 && cores >= 8 && /adreno \(tm\) (6[4-9]|7)\d\d|mali-g(7[7-9]|[89]\d|\d{3})|xclipse|immortalis/.test(gpu))
                ? "medium" : "low";
        }
        if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m\d|arc a\d/.test(gpu)) return "high";
        return "medium";                                                                    // integrated / unknown
    }

    function resolveTier() {
        const g = readJSON("popularis_prefs", {}).graphics || "auto";
        POP.auto = g === "auto";
        if (!POP.auto) return g;
        const cached = readJSON("popularis_gfx_auto", null);
        if (cached && cached.ua === navigator.userAgent && Date.now() - cached.at < (cached.ttl || 864e5)) {
            POP.needsProbe = false;
            POP.detected = cached.detected || cached.tier;
            return cached.tier;
        }
        // first visit: provisional guess from CPU / memory / pointer until the
        // renderer reports its GPU a moment after first paint
        POP.needsProbe = true;
        return detectTier("");
    }

    POP.reportGPU = function (renderer) {
        POP.gpu = String(renderer || "").toLowerCase();
        if (!POP.auto || !POP.needsProbe) return;
        POP.needsProbe = false;
        const t = detectTier(POP.gpu);
        POP.detected = t;
        writeJSON("popularis_gfx_auto", { tier: t, ua: navigator.userAgent, at: Date.now() });
        if (t !== POP.tier) {
            POP.applyTier(t);
            document.dispatchEvent(new CustomEvent("pop:tier", { detail: t }));
        }
    };

    POP.applyTier = function (t) {
        t = (t === "low" || t === "high") ? t : "medium";
        POP.tier = t;
        if (!root.classList.contains("gfx-" + t)) {
            root.classList.remove("gfx-low", "gfx-medium", "gfx-high");
            root.classList.add("gfx-" + t);
        }
    };

    // Called by Settings when the Graphics Quality select changes
    POP.refreshTier = function () {
        POP.applyTier(resolveTier());
        if (window.POP_RENDERER) window.POP_RENDERER.setDynScale(1);
        document.dispatchEvent(new CustomEvent("pop:tier", { detail: POP.tier }));
    };
    POP.refreshTier();

    /* ---------------- adaptive governor ---------------- */
    // Fed one timestamp per frame by the background renderer's loop.

    const frames = [];
    let lastT = 0, bad = 0, good = 0, navBusyUntil = 0;
    const armAt = performance.now() + 3000;          // ignore the loading screen

    const ORDER = ["low", "medium", "high"];
    function setAutoTier(t) {
        POP.applyTier(t);
        // a governor decision is only remembered for 2 h (a thermal dip or a
        // busy moment shouldn't pin the device to a lower tier all day)
        writeJSON("popularis_gfx_auto", { tier: t, detected: POP.detected || t, ua: navigator.userAgent,
            at: Date.now(), ttl: t === POP.detected ? 864e5 : 72e5 });
        const r = window.POP_RENDERER;
        if (r) r.setDynScale(1);
        document.dispatchEvent(new CustomEvent("pop:tier", { detail: t }));
    }

    function stepDown() {
        const r = window.POP_RENDERER;
        if (r && r.dynScale > 0.62) { r.setDynScale(r.dynScale * 0.8); return; }   // 1) lower resolution
        if (!POP.auto) { if (r && r.dynScale > 0.4) r.setDynScale(r.dynScale * 0.8); return; }  // forced preset: resolution only
        const i = ORDER.indexOf(POP.tier);
        if (i > 0) { setAutoTier(ORDER[i - 1]); downAt = performance.now(); }         // 2) lower tier
        upStreak = 0;
    }
    let upStreak = 0, downAt = -1e9;
    function stepUp() {
        const r = window.POP_RENDERER;
        if (r && r.dynScale < 1) { r.setDynScale(Math.min(1, r.dynScale * 1.12)); return; }
        // full resolution and still smooth for a long while: recover one tier,
        // never above what the hardware was detected as
        if (!POP.auto || performance.now() - downAt < 3e5 || ++upStreak < 3) return;   // 5 min hysteresis
        upStreak = 0;
        const i = ORDER.indexOf(POP.tier), cap = ORDER.indexOf(POP.detected || POP.tier);
        if (i >= 0 && i < cap) setAutoTier(ORDER[i + 1]);
    }

    POP.frame = function (t) {
        const prev = lastT; lastT = t;
        if (t < armAt || t < navBusyUntil || !prev) return;   // page swaps are expected work
        const d = t - prev;
        if (d <= 0 || d > 400) return;                                     // tab switch / debugger pause
        frames.push(d);
        if (frames.length < 90) return;
        const s = frames.slice().sort((a, b) => a - b);
        const vsync = Math.max(6, s[Math.floor(s.length * 0.25)]);
        let slow = 0;
        for (let i = 0; i < frames.length; i++) if (frames[i] > Math.max(vsync * 1.6, 24)) slow++;
        frames.length = 0;
        if (slow / 90 > 0.2) { bad++; good = 0; } else { good++; bad = 0; }
        if (bad >= 2) { bad = 0; stepDown(); }
        else if (good >= 10) { good = 0; stepUp(); }
    };
    // When the background renders in a worker, nothing on the main thread
    // runs every frame any more - so sample the page's own frame pacing in
    // short bursts (~3 s every 10 s) to still catch a struggling compositor.
    let sampling = false;
    POP.sampleFrames = function () {
        if (sampling) return;
        sampling = true;
        let n = 0;
        const f = t => {
            POP.frame(t);
            if (++n < 190) requestAnimationFrame(f);
            else { sampling = false; setTimeout(POP.sampleFrames, 10000); }
        };
        requestAnimationFrame(f);
    };
    // verdicts computed elsewhere (the background renderer's worker)
    POP.govVerdict = function (v) {
        if (performance.now() < armAt) return;
        if (v === "bad") stepDown(); else if (v === "good") stepUp();
    };

    /* ---------------- batched scroll scheduler ---------------- */
    // POP.onScroll(key, { read(box) -> data, write(data, box) })
    // Re-registering a key replaces it; passing null removes it.

    const handlers = new Map();
    let queued = false, lastScroll = -1e9;

    let skipFrames = 0;
    function run() {
        // right after a page swap, let the browser lay the new page out in
        // its normal render step first; reading rects in the same frame
        // would force that layout early, inside script, and then again
        if (skipFrames > 0) { skipFrames--; requestAnimationFrame(run); return; }
        queued = false;
        const box = POP.box;
        if (!box) return;
        const reads = [];
        handlers.forEach(h => {
            let data;
            try { data = h.read ? h.read(box) : undefined; } catch (e) { console.error(e); }
            reads.push(h, data);
        });
        for (let i = 0; i < reads.length; i += 2) {
            try { if (reads[i].write) reads[i].write(reads[i + 1], box); } catch (e) { console.error(e); }
        }
    }

    POP.onScroll = function (key, handler) {
        if (handler) handlers.set(key, handler); else handlers.delete(key);
        POP.tick();
    };
    POP.afterSwap = function () { skipFrames = 1; };
    POP.tick = function () {
        if (!queued) { queued = true; requestAnimationFrame(run); }
    };
    POP.isBusy = function () {
        const n = performance.now();
        return n - lastScroll < 200 || n < navBusyUntil;
    };
    POP.markBusy = function (ms) {
        navBusyUntil = Math.max(navBusyUntil, performance.now() + (ms || 800));
        checkState();
    };

    /* State-change notifications (busy / power-saver), so the background
       renderer - possibly in a worker - is TOLD when things change instead of
       polling every frame. Timers only exist while a state is about to expire. */
    const stateListeners = [];
    let stBusy = false, stSaver = false, stTimer = 0, stTimerAt = 0;
    function checkState() {
        const n = performance.now();
        const busy = POP.isBusy(), saver = POP.saver ? POP.saver() : false;
        if (busy !== stBusy || saver !== stSaver) {
            stBusy = busy; stSaver = saver;
            stateListeners.forEach(fn => { try { fn({ busy, saver }); } catch (e) {} });
        }
        // wake up again exactly when the next state could flip
        let next = Infinity;
        if (busy) next = Math.max(lastScroll + 200, navBusyUntil);
        else if (!saver && !onBattery) next = Math.max(lastInput, lastScroll) + 10000;
        if (next !== Infinity && (!stTimer || next < stTimerAt)) {
            clearTimeout(stTimer);
            stTimerAt = next;
            stTimer = setTimeout(() => { stTimer = 0; checkState(); }, Math.max(16, next - n + 5));
        }
    }
    POP.onState = function (fn) { stateListeners.push(fn); fn({ busy: stBusy, saver: stSaver }); };

    POP.box = document.querySelector(".content-box");
    if (POP.box) {
        POP.box.addEventListener("scroll", () => {
            lastScroll = performance.now();
            if (!stBusy || stSaver) checkState();           // leading edge only; a timer handles the end
            POP.tick();
        }, { passive: true });
    }
    window.addEventListener("resize", () => POP.tick(), { passive: true });

    // Power saving: the background drops to 30 fps when running on battery or
    // after 10 s without any input (nobody notices ambient motion at 30 fps;
    // batteries do notice 60).
    let lastInput = performance.now(), onBattery = false;
    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach(ev =>
        window.addEventListener(ev, () => {
            lastInput = performance.now();
            if (stSaver && !onBattery) checkState();       // only does work when leaving saver
        }, { passive: true, capture: true }));
    if (navigator.getBattery) {
        navigator.getBattery().then(b => {
            const upd = () => { onBattery = !b.charging; checkState(); };
            upd(); b.addEventListener("chargingchange", upd);
        }).catch(() => {});
    }
    POP.saver = function () {
        return onBattery || performance.now() - Math.max(lastInput, lastScroll) > 10000;
    };
    checkState();                                          // arm the idle timer

    // Smooth-scroll to a section. Sections use content-visibility:auto, whose
    // placeholder heights are estimates, so a jump could land in the wrong
    // place; lock real layout for the duration of the scroll.
    let cvTimer = 0;
    POP.scrollTo = function (el) {
        if (!el) return;
        const c = document.getElementById("content");
        if (c) { c.classList.add("cv-lock"); clearTimeout(cvTimer); cvTimer = setTimeout(() => c.classList.remove("cv-lock"), 1500); }
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    POP.idle = window.requestIdleCallback
        ? (fn, timeout) => requestIdleCallback(fn, { timeout: timeout || 2000 })
        : (fn) => setTimeout(fn, 200);
})();
