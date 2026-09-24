// SH-SH-SH-SHADER CO-CO-COMPILER — the background renderer core (v3)
//
// This file runs in TWO places:
//  * inside a Web Worker, drawing to an OffscreenCanvas. The background then
//    never shares a thread with the page: page loads, scrolling and layout
//    can't stall the swirl, and the swirl can't stall them. (Chrome, Edge,
//    Firefox, Safari 17+.)
//  * on the main thread as a fallback, when a browser can't do that
//    (backgroundshader.js decides and talks to it).
// It never touches the DOM; everything it needs arrives as messages/calls.
//
// Tricks: renders at the shader's own pixel-block resolution (upscaled with
// nearest-neighbour by CSS), per-tier frame caps, lower caps while the page
// scrolls / navigates / idles / runs on battery, frames between draws do no
// work at all, parameter smoothing inside the one loop, no per-frame
// allocation, sleeps when nothing moves, survives WebGL context loss.

(function (scope) {
    "use strict";

    const TIERS = {
        //        normal fps / busy fps / res multiplier / pixel budget / embers
        low:    { fps: 24, busyFps: 12, scale: 0.72, maxPx: 170000, embers: 18 },
        medium: { fps: 30, busyFps: 20, scale: 0.86, maxPx: 380000, embers: 36 },
        high:   { fps: 60, busyFps: 40, scale: 1.00, maxPx: 950000, embers: 60 }
    };
    const NUM_KEYS = ["speed", "spinAmount", "contrast", "pixelSizeFac", "spinEase", "zoom", "offsetX", "offsetY"];
    const COL_KEYS = ["c1", "c2", "c3"];
    const MAX_PARTICLES = 200;

    function hexToRgb(hex, out) {
        let h = String(hex || "#000").replace("#", "");
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16) || 0;
        out = out || new Float32Array(3);
        out[0] = ((n >> 16) & 255) / 255; out[1] = ((n >> 8) & 255) / 255; out[2] = (n & 255) / 255;
        return out;
    }

    // Render size = the shader's own pixel-block grid, scaled per tier and by
    // the adaptive governor, capped by a pixel budget.
    function renderSize(cssW, cssH, tier, dynScale) {
        const T = TIERS[tier] || TIERS.medium;
        let s = Math.min(1, 1000 / Math.hypot(cssW, cssH)) * T.scale * dynScale;   // 1 px ≈ 1 block at fac 1000
        s = Math.min(s, Math.sqrt(T.maxPx / Math.max(1, cssW * cssH)));
        s = Math.max(0.16, Math.min(1, s));
        return { w: Math.max(1, Math.round(cssW * s)), h: Math.max(1, Math.round(cssH * s)), scale: s };
    }

    const VERT_BG = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";

    const FRAG_BG = (hp) => `
        precision ${hp ? "highp" : "mediump"} float;
        uniform float time, contrast, spin_amount, pixel_fac, spin_ease, zoom, vig, scan;
        uniform vec2 offset, resolution;
        uniform vec3 colour_1, colour_2, colour_3;
        void main() {
            vec2 res = resolution;
            float rlen = length(res);
            float pixel_size = rlen / pixel_fac;
            vec2 uv = (floor(gl_FragCoord.xy / pixel_size) * pixel_size - 0.5 * res) / rlen - offset;
            float uv_len = length(uv);
            float speed = (time * spin_ease * 0.2) + 302.2;
            float angle = atan(uv.y, uv.x) + (spin_amount > 0.0
                ? speed - spin_ease * 20.0 * (spin_amount * uv_len + (1.0 - spin_amount)) : 0.0);
            vec2 mid = (res / rlen) / 2.0;
            uv = vec2(uv_len * cos(angle) + mid.x, uv_len * sin(angle) + mid.y) - mid;
            uv *= zoom;
            speed = time * 2.0;
            vec2 uv2 = vec2(uv.x + uv.y);
            for (int i = 0; i < 5; i++) {
                uv2 += sin(max(uv.x, uv.y)) + uv;
                uv += 0.5 * vec2(cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121), sin(uv2.x - 0.113 * speed));
                uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
            }
            float cmod = (0.25 * contrast + 0.5 * spin_amount + 1.2);
            float paint = min(2.0, max(0.0, length(uv) * 0.035 * cmod));
            float c1p = max(0.0, 1.0 - cmod * abs(1.0 - paint));
            float c2p = max(0.0, 1.0 - cmod * abs(paint));
            float c3p = 1.0 - min(1.0, c1p + c2p);
            vec3 ret = (0.3 / contrast) * colour_1
                     + (1.0 - 0.3 / contrast) * (colour_1 * c1p + colour_2 * c2p + c3p * colour_3);
            // baked vignette (was a full-screen CSS layer)
            vec2 q = gl_FragCoord.xy / res - 0.5;
            float e = length(q) * 1.41421;
            ret *= 1.0 - vig * 0.38 * clamp((e - 0.55) / 0.45, 0.0, 1.0);
            // baked scanlines (was a full-screen mix-blend-mode layer)
            ret *= 1.0 - scan * 0.05 * step(1.0, mod(gl_FragCoord.y, 2.0));
            gl_FragColor = vec4(ret, 1.0);
        }`;

    const VERT_PT = "attribute vec4 a;uniform float ps;varying float al;" +
        "void main(){gl_Position=vec4(a.xy,0.0,1.0);gl_PointSize=a.z*ps;al=a.w;}";
    const FRAG_PT = "precision mediump float;uniform vec3 col;varying float al;" +
        "void main(){gl_FragColor=vec4(col*al,al);}";

    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
        return s;
    }
    function program(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
        return p;
    }

    const raf = typeof scope.requestAnimationFrame === "function"
        ? cb => scope.requestAnimationFrame(cb)
        : cb => setTimeout(() => cb(performance.now()), 16);

    /* Frame-pacing governor verdicts (the decisions live in perf.js):
       windows of 90 frames; >20% slow frames twice in a row = "bad",
       ten clean windows = "good". Frames while busy are ignored. */
    function Pacer(report) {
        const frames = [];
        let lastT = 0, bad = 0, good = 0;
        return function (t, busy) {
            const prev = lastT; lastT = t;
            if (busy || !prev) return;
            const d = t - prev;
            if (d <= 0 || d > 400) return;
            frames.push(d);
            if (frames.length < 90) return;
            const s = frames.slice().sort((a, b) => a - b);
            const vsync = Math.max(6, s[Math.floor(s.length * 0.25)]);
            let slow = 0;
            for (let i = 0; i < frames.length; i++) if (frames[i] > Math.max(vsync * 1.6, 24)) slow++;
            frames.length = 0;
            if (slow / 90 > 0.2) { bad++; good = 0; } else { good++; bad = 0; }
            if (bad >= 2) { bad = 0; report("bad"); }
            else if (good >= 10) { good = 0; report("good"); }
        };
    }

    class RendererCore {
        // env: { onGPU(str), onFrame(t) (optional), onVerdict(v) (optional) }
        constructor(canvas, init, env) {
            this.canvas = canvas;
            this.env = env || {};
            this.opts = Object.assign({
                colours: { c1: "#FF1919", c2: "#FFFFFF", c3: "#000000" },
                speed: 1, spinAmount: 0.5, contrast: 1.2, pixelSizeFac: 1000,
                spinEase: 0.5, zoom: 30, offsetX: 0, offsetY: 0, enableSpin: true
            }, init.opts || {});
            this.cur = {}; this.tgt = {};
            NUM_KEYS.forEach(k => { this.cur[k] = this.tgt[k] = +this.opts[k]; });
            this.col = {}; this.colT = {};
            COL_KEYS.forEach(k => { this.col[k] = hexToRgb(this.opts.colours[k]); this.colT[k] = hexToRgb(this.opts.colours[k]); });
            this.tau = 0.4;
            this.simTime = 0; this.lastDraw = 0;
            this.dirty = true; this.running = false;
            this.particles = [];
            this.pbuf = new Float32Array(MAX_PARTICLES * 4);
            this.cssW = 1; this.cssH = 1; this.scale = 1;
            this.flags = { tier: "medium", shaderOn: true, scanOn: true, reduce: false, embersOn: true, level: 1,
                busy: false, saver: false, hidden: false };
            Object.assign(this.flags, init.flags || {});
            if (init.size) this.setSize(init.size);
            this.pace = Pacer(v => this.env.onVerdict && this.env.onVerdict(v));
            this._loop = this._loop.bind(this);

            if (canvas.addEventListener) {
                canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); this.gl = null; }, false);
                canvas.addEventListener("webglcontextrestored", () => { this.initGL(); this.kick(); }, false);
            }
        }

        initGL() {
            const gl = this.canvas.getContext("webgl", {
                alpha: false, antialias: false, depth: false, stencil: false,
                premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "default"
            });
            this.gl = gl;
            let r = "none";
            if (gl) {
                const ext = gl.getExtension("WEBGL_debug_renderer_info");
                r = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
            }
            if (this.env.onGPU) this.env.onGPU(r);
            if (!gl) return false;
            const hp = (() => { const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return f && f.precision > 0; })();
            this.bg = program(gl, VERT_BG, FRAG_BG(hp));
            this.pt = program(gl, VERT_PT, FRAG_PT);
            if (!this.bg || !this.pt) { this.gl = null; return false; }

            // one oversized triangle covers the screen (cheaper than a quad)
            this.triBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            this.ptBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this.pbuf.byteLength, gl.DYNAMIC_DRAW);

            const U = (p, n) => gl.getUniformLocation(p, n);
            this.u = {
                time: U(this.bg, "time"), contrast: U(this.bg, "contrast"), spin: U(this.bg, "spin_amount"),
                pix: U(this.bg, "pixel_fac"), ease: U(this.bg, "spin_ease"), zoom: U(this.bg, "zoom"),
                off: U(this.bg, "offset"), res: U(this.bg, "resolution"),
                c1: U(this.bg, "colour_1"), c2: U(this.bg, "colour_2"), c3: U(this.bg, "colour_3"),
                vig: U(this.bg, "vig"), scan: U(this.bg, "scan"),
                pcol: U(this.pt, "col"), ps: U(this.pt, "ps")
            };
            this.aBg = gl.getAttribLocation(this.bg, "p");
            this.aPt = gl.getAttribLocation(this.pt, "a");
            gl.disable(gl.DEPTH_TEST);
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.dirty = true;
            return true;
        }

        /* ---------- inputs ---------- */
        setSize(sz) {
            this.cssW = sz.cssW; this.cssH = sz.cssH; this.scale = sz.scale;
            if (this.canvas.width !== sz.w || this.canvas.height !== sz.h) {
                this.canvas.width = sz.w; this.canvas.height = sz.h;
                if (this.gl) this.gl.viewport(0, 0, sz.w, sz.h);
            }
            this.dirty = true;
        }
        setFlags(f) {
            Object.assign(this.flags, f);
            this.dirty = true;
            if (this.flags.hidden) { this.lastDraw = 0; return; }
            this.kick();
        }
        applyPreset(preset, duration) {
            for (const key in preset) {
                if (COL_KEYS.includes(key)) hexToRgb(preset[key], this.colT[key]);
                else if (NUM_KEYS.includes(key)) this.tgt[key] = +preset[key];
            }
            this.tau = Math.max(0.05, (duration == null ? 1 : duration) / 3);
            this.kick();
        }
        burst(n) {
            const w = this.cssW, h = this.cssH;
            for (let i = 0; i < (n || 90) && this.particles.length < MAX_PARTICLES; i++) {
                const a = Math.random() * 6.2832, v = (Math.random() * 4 + 1) * 60;
                this.particles.push({ x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                    r: Math.random() * 2.4 + 0.8, life: 1, decay: (0.012 + Math.random() * 0.01) * 60, sway: 0, burst: true });
            }
            this.kick();
        }
        kick() {
            this.dirty = true;
            if (!this.running && !this.flags.hidden && this.gl) { this.running = true; raf(this._loop); }
        }

        /* ---------- per frame ---------- */
        _spawn() {
            return { x: Math.random() * this.cssW, y: this.cssH + Math.random() * 30,
                vx: (Math.random() - 0.5) * 18, vy: -(Math.random() * 30 + 11),
                r: Math.random() * 2 + 0.6, life: Math.random() * 0.5 + 0.5, decay: 0, sway: Math.random() * 6.28, burst: false };
        }

        _step(dt) {
            const F = this.flags;
            const k = 1 - Math.exp(-dt / this.tau);
            let moving = false;
            for (let i = 0; i < NUM_KEYS.length; i++) {
                const key = NUM_KEYS[i], d = this.tgt[key] - this.cur[key];
                if (Math.abs(d) > 1e-4) { this.cur[key] += d * k; moving = true; } else this.cur[key] = this.tgt[key];
            }
            for (let i = 0; i < 3; i++) {
                const c = this.col[COL_KEYS[i]], t = this.colT[COL_KEYS[i]];
                for (let j = 0; j < 3; j++) {
                    const d = t[j] - c[j];
                    if (Math.abs(d) > 1e-4) { c[j] += d * k; moving = true; } else c[j] = t[j];
                }
            }
            if (!F.reduce) this.simTime += dt * this.cur.speed;

            // embers — count scales with tier and the Particle Visibility slider
            const target = F.embersOn ? Math.round((TIERS[F.tier] || TIERS.medium).embers * F.level) : 0;
            let ambient = 0;
            for (let i = 0; i < this.particles.length; i++) if (!this.particles[i].burst) ambient++;
            while (ambient < target) { this.particles.push(this._spawn()); ambient++; }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                if (!p.burst && ambient > target) { this.particles.splice(i, 1); ambient--; continue; }
                p.sway += dt * 1.2;
                p.x += (p.vx + (p.burst ? 0 : Math.sin(p.sway) * 18)) * dt;
                p.y += p.vy * dt;
                if (p.burst) { const f = Math.pow(0.96, dt * 60); p.vx *= f; p.vy = p.vy * f + 72 * dt; p.life -= p.decay * dt; }
                if (p.life <= 0 || (!p.burst && p.y < -12)) this.particles.splice(i, 1);
            }
            return moving;
        }

        _loop(t) {
            const F = this.flags;
            if (F.hidden || !this.gl) { this.running = false; this.lastDraw = 0; return; }
            this.pace(t, F.busy);
            if (this.env.onFrame) this.env.onFrame(t);

            // frames between draws cost nothing: no simulation, no GL calls
            const T = TIERS[F.tier] || TIERS.medium;
            let fps = F.busy ? T.busyFps : T.fps;
            if (F.saver) fps = Math.min(fps, 30);          // battery / nobody interacting
            if (!this.dirty && this.lastDraw && t - this.lastDraw < 1000 / fps - 1.5) { raf(this._loop); return; }
            const dt = this.lastDraw ? Math.min(0.1, (t - this.lastDraw) / 1000) : 1 / 60;
            this.lastDraw = t;

            const tweening = this._step(dt);
            const animating = (F.shaderOn && !F.reduce && this.cur.speed > 0.002) || this.particles.length > 0;

            // nothing moves: draw one final frame, then let the loop sleep
            if (!animating && !tweening) {
                if (this.dirty) this._draw();
                this.running = false;
                this.lastDraw = 0;
                return;
            }
            raf(this._loop);
            this._draw();
        }

        _draw() {
            const gl = this.gl; if (!gl) return;
            this.dirty = false;
            const u = this.u, c = this.cur, F = this.flags;

            if (F.shaderOn) {
                gl.disable(gl.BLEND);
                gl.useProgram(this.bg);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.triBuf);
                gl.enableVertexAttribArray(this.aBg);
                gl.vertexAttribPointer(this.aBg, 2, gl.FLOAT, false, 0, 0);
                gl.uniform1f(u.time, this.simTime);
                gl.uniform1f(u.contrast, c.contrast);
                gl.uniform1f(u.spin, this.opts.enableSpin ? c.spinAmount : 0);
                gl.uniform1f(u.pix, c.pixelSizeFac);
                gl.uniform1f(u.ease, c.spinEase);
                gl.uniform1f(u.zoom, c.zoom);
                gl.uniform2f(u.off, c.offsetX, c.offsetY);
                gl.uniform2f(u.res, this.canvas.width, this.canvas.height);
                gl.uniform3fv(u.c1, this.col.c1);
                gl.uniform3fv(u.c2, this.col.c2);
                gl.uniform3fv(u.c3, this.col.c3);
                gl.uniform1f(u.vig, 1);
                gl.uniform1f(u.scan, F.scanOn ? 1 : 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.disableVertexAttribArray(this.aBg);
            } else {
                gl.clearColor(0.027, 0.02, 0.047, 1);         // = the page background colour
                gl.clear(gl.COLOR_BUFFER_BIT);
            }

            const n = Math.min(this.particles.length, MAX_PARTICLES);
            if (n) {
                const b = this.pbuf, w = this.cssW, h = this.cssH, s = this.scale;
                for (let i = 0; i < n; i++) {
                    const p = this.particles[i], o = i * 4;
                    b[o] = p.x / w * 2 - 1;
                    b[o + 1] = 1 - p.y / h * 2;
                    b[o + 2] = Math.max(1, Math.round(p.r * 2 * s));
                    b[o + 3] = p.burst ? Math.max(0, p.life) * 0.9 : (0.25 + p.life * 0.5) * F.level;
                }
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE);                  // additive glow (colour is pre-multiplied)
                gl.useProgram(this.pt);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.subarray(0, n * 4));
                gl.enableVertexAttribArray(this.aPt);
                gl.vertexAttribPointer(this.aPt, 4, gl.FLOAT, false, 0, 0);
                gl.uniform3f(u.pcol, Math.min(1, this.col.c1[0] * 1.25 + 0.08),
                    Math.min(1, this.col.c1[1] * 1.25 + 0.08), Math.min(1, this.col.c1[2] * 1.25 + 0.08));
                gl.uniform1f(u.ps, 1);
                gl.drawArrays(gl.POINTS, 0, n);
                gl.disableVertexAttribArray(this.aPt);
            }
        }
    }

    const api = { RendererCore, renderSize, TIERS };

    if (typeof scope.document === "undefined" && typeof scope.postMessage === "function") {
        /* ---------- worker mode ---------- */
        let core = null;
        scope.onmessage = e => {
            const m = e.data;
            if (m.type === "init") {
                core = new RendererCore(m.canvas, m, {
                    // no report on failure: the main-thread fallback will probe
                    // (e.g. Safari 16.4 has OffscreenCanvas but not WebGL in it)
                    onGPU: r => { if (r !== "none") scope.postMessage({ type: "gpu", renderer: r }); },
                    onVerdict: v => scope.postMessage({ type: "verdict", v })
                });
                const ok = core.initGL();
                scope.postMessage({ type: ok ? "ready" : "nogl" });
                if (ok) core.kick();
                return;
            }
            if (!core) return;
            if (m.type === "size") core.setSize(m.size);
            else if (m.type === "flags") core.setFlags(m.flags);
            else if (m.type === "preset") core.applyPreset(m.preset, m.duration);
            else if (m.type === "burst") core.burst(m.n);
            else if (m.type === "kick") core.kick();
        };
    } else {
        scope.PopRenderer = api;
    }
})(typeof self !== "undefined" ? self : this);
