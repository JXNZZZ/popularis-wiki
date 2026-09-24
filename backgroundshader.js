//SH-SH-SH-SHADER CO-CO-COMPILER  (v3 — off the main thread)
//
// The swirl + embers are drawn by bg-core.js. Where the browser supports it
// (Chrome, Edge, Firefox, Safari 17+) the canvas is handed to a Web Worker
// with transferControlToOffscreen(): the background then renders on its own
// thread, so a page load / layout / long script never stalls it and it
// never steals time from the page. Elsewhere bg-core.js is loaded and run
// on the main thread instead (same code, same look).
//
// This file is the main-thread side: it owns the <canvas> element, measures
// the window, reads the settings classes on <html> and forwards changes as
// small messages. No per-frame work happens here in worker mode.
//
// Public API kept compatible with v1/v2: new BalatroShader(opts),
// .applyPreset(preset, seconds), plus window.POP_RENDERER.

(function () {
    "use strict";

    // render-size parameters per tier (must match TIERS in bg-core.js)
    const SIZE = { low: [0.72, 170000], medium: [0.86, 380000], high: [1.00, 950000] };

    function renderSize(cssW, cssH, tier, dynScale) {
        const T = SIZE[tier] || SIZE.medium;
        let s = Math.min(1, 1000 / Math.hypot(cssW, cssH)) * T[0] * dynScale;   // 1 px ≈ 1 shader block
        s = Math.min(s, Math.sqrt(T[1] / Math.max(1, cssW * cssH)));
        s = Math.max(0.16, Math.min(1, s));
        return { w: Math.max(1, Math.round(cssW * s)), h: Math.max(1, Math.round(cssH * s)), scale: s, cssW, cssH };
    }

    function assetURL(path) {
        return path + "?v=" + (window.WIKI_ASSET_VERSION || "0");
    }

    class BalatroShader {
        constructor(options = {}) {
            this.opts = Object.assign({
                container: document.body,
                colours: { c1: "#FF1919", c2: "#FFFFFF", c3: "#000000" },
                speed: 1, spinAmount: 0.5, contrast: 1.2, pixelSizeFac: 1000,
                spinEase: 0.5, zoom: 30, offsetX: 0, offsetY: 0, enableSpin: true
            }, options);
            this.container = typeof this.opts.container === "string"
                ? document.querySelector(this.opts.container) : this.opts.container;
            if (!this.container) throw new Error("BalatroShader: container not found.");

            this.dynScale = 1;            // lowered by the adaptive governor (perf.js)
            this.queue = [];              // messages sent before the renderer exists
            this.mode = "booting";
            this._makeCanvas();

            this.flags = this._readFlags();
            this.size = this._measure();

            // settings / tier classes on <html>
            new MutationObserver(() => {
                const f = this._readFlags(), tierChanged = f.tier !== this.flags.tier;
                this.flags = f;
                this._send("flags", { flags: f });
                if (tierChanged) this.resize();
            }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
            if (window.matchMedia) {
                const mq = matchMedia("(prefers-reduced-motion: reduce)");
                const onMq = () => this.syncFlags();
                if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
            }

            let rt;
            window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => this.resize(), 120); });
            document.addEventListener("visibilitychange", () => this._send("flags", { flags: { hidden: document.hidden } }));

            // busy (scrolling / navigating) and power-saver changes are pushed
            // by perf.js only when they flip - nothing is polled per frame
            if (window.POP && POP.onState) POP.onState(st => this._send("flags", { flags: st }));

            window.POP_RENDERER = this;

            // Create the GL context only AFTER the first paint: context creation
            // and shader compilation can be slow on weak / software GPUs. The
            // context also serves as the GPU probe for perf.js.
            const boot = () => this._boot();
            if (document.readyState === "complete") setTimeout(boot, 0);
            else requestAnimationFrame(() => setTimeout(boot, 0));
        }

        _makeCanvas() {
            if (this.canvas) this.canvas.remove();
            const c = document.createElement("canvas");
            c.setAttribute("aria-hidden", "true");
            // rendered at the shader's block resolution and upscaled with nearest-
            // neighbour: the pixel-art look for a fraction of the fragments
            c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" +
                "image-rendering:-moz-crisp-edges;image-rendering:crisp-edges;image-rendering:pixelated;";
            this.container.appendChild(c);
            this.canvas = c;
        }

        _readFlags() {
            const c = document.documentElement.classList;
            const reduce = c.contains("pref-reduce-motion") ||
                !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
            return {
                tier: c.contains("gfx-low") ? "low" : c.contains("gfx-high") ? "high" : "medium",
                shaderOn: !c.contains("pref-shader-off"),
                scanOn: !c.contains("pref-no-grid"),
                reduce,
                embersOn: !c.contains("pref-no-particles") && !reduce,
                level: typeof window.PARTICLE_LEVEL === "number" ? window.PARTICLE_LEVEL : 1,
                hidden: document.hidden
            };
        }

        _measure() {
            const cssW = this.container.clientWidth || window.innerWidth;
            const cssH = this.container.clientHeight || window.innerHeight;
            return renderSize(cssW, cssH, this.flags.tier, this.dynScale);
        }

        _init() {
            const o = this.opts;
            return {
                opts: { colours: Object.assign({}, o.colours), speed: o.speed, spinAmount: o.spinAmount, contrast: o.contrast,
                    pixelSizeFac: o.pixelSizeFac, spinEase: o.spinEase, zoom: o.zoom,
                    offsetX: o.offsetX, offsetY: o.offsetY, enableSpin: o.enableSpin },
                flags: Object.assign({}, this.flags, window.POP && POP.isBusy
                    ? { busy: POP.isBusy(), saver: POP.saver ? POP.saver() : false } : {}),
                size: this.size
            };
        }

        _boot() {
            const canWorker = window.Worker && this.canvas.transferControlToOffscreen &&
                !/[?&]bgmain\b/.test(location.search);          // ?bgmain forces the fallback (testing)
            if (!canWorker) return this._bootMain();
            let off;
            try { off = this.canvas.transferControlToOffscreen(); }
            catch (e) { return this._bootMain(); }

            const w = new Worker(assetURL("bg-core.js"));
            const fail = () => {
                if (this.mode !== "worker-pending") return;
                w.terminate();
                this._makeCanvas();                  // the old one belongs to the worker now
                this._bootMain();
            };
            w.onerror = fail;
            w.onmessage = e => {
                const m = e.data;
                if (m.type === "gpu") { if (window.POP && POP.reportGPU) POP.reportGPU(m.renderer); }
                else if (m.type === "verdict") { if (window.POP && POP.govVerdict) POP.govVerdict(m.v); }
                else if (m.type === "ready") {
                    this.mode = "worker";
                    if (window.POP && POP.sampleFrames) POP.sampleFrames();
                }
                else if (m.type === "nogl") fail();
            };
            this.worker = w;
            this.mode = "worker-pending";
            w.postMessage(Object.assign({ type: "init", canvas: off }, this._init()), [off]);
            this._flush();
        }

        _bootMain() {
            this.worker = null;
            this.mode = "main-loading";
            const start = () => {
                const env = {
                    onGPU: r => { if (window.POP && POP.reportGPU) POP.reportGPU(r); },
                    onFrame: t => { if (window.POP && POP.frame) POP.frame(t); }   // main-thread governor
                };
                this.core = new window.PopRenderer.RendererCore(this.canvas, this._init(), env);
                if (!this.core.initGL()) { this.canvas.style.display = "none"; this.mode = "none"; return; }
                this.mode = "main";
                this._flush();
                this.core.kick();
            };
            if (window.PopRenderer) return start();
            const sc = document.createElement("script");
            sc.src = assetURL("bg-core.js");
            sc.onload = start;
            document.head.appendChild(sc);
        }

        _flush() {
            const q = this.queue; this.queue = [];
            q.forEach(([type, data]) => this._send(type, data));
        }

        _send(type, data) {
            if (this.worker) { this.worker.postMessage(Object.assign({ type }, data)); return; }
            const c = this.core;
            if (!c) { this.queue.push([type, data]); return; }
            if (type === "flags") c.setFlags(data.flags);
            else if (type === "size") c.setSize(data.size);
            else if (type === "preset") c.applyPreset(data.preset, data.duration);
            else if (type === "burst") c.burst(data.n);
            else if (type === "kick") c.kick();
        }

        /* ---------- public API ---------- */
        applyPreset(preset, duration = 1.0) {
            // also remember the latest targets, so a renderer that (re)starts
            // later - e.g. the main-thread fallback - begins from the right look
            for (const k in preset) {
                if (k === "c1" || k === "c2" || k === "c3") this.opts.colours[k] = preset[k];
                else if (k in this.opts) this.opts[k] = preset[k];
            }
            this._send("preset", { preset, duration });
        }
        resize() {
            this.size = this._measure();
            this._send("size", { size: this.size });
        }
        syncFlags() {                         // e.g. after the particle slider moves
            this.flags = this._readFlags();
            this._send("flags", { flags: this.flags });
        }
        setDynScale(v) { this.dynScale = Math.max(0.4, Math.min(1, v)); this.resize(); }
        burst(n = 90) { this._send("burst", { n }); }
        kick() { this._send("kick", {}); }
    }

    window.BalatroShader = BalatroShader;
})();
