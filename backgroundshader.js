//SH-SH-SH-SHADER CO-CO-COMPILER

(function () {

    class BalatroShader {

        /* --------------------------------------------------
           default options and constructor
        -------------------------------------------------- */
        constructor(options = {}) {

            this.opts = Object.assign({
                container: document.body,
                colours: {
                    c1: "#FF1919",
                    c2: "#FFFFFF",
                    c3: "#000000"
                },
                speed: 1,
                spinAmount: 0.5,
                contrast: 1.2,
                pixelSizeFac: 1000.0,   
                spinEase: 0.5,
                zoom: 30.0,
                offsetX: 0,
                offsetY: 0.0,
                enableSpin: true,
                autoResize: true,
                opacity: 1,
                maxFPS: 60,
            }, options);

            /* --------------------------------------------------
               container set
            -------------------------------------------------- */
            this.container =
                typeof this.opts.container === "string"
                    ? document.querySelector(this.opts.container)
                    : this.opts.container;

            if (!this.container) {
                throw new Error("balatroShader: container not found.");
            }

            /* --------------------------------------------------
               canvas
            -------------------------------------------------- */
            this.canvas = document.createElement("canvas");
            this.canvas.style.position = "absolute";
            this.canvas.style.top = "0";
            this.canvas.style.left = "0";
            this.canvas.style.width = "100%";
            this.canvas.style.height = "100%";
            this.canvas.style.pointerEvents = "none";
            this.canvas.style.opacity = this.opts.opacity;

            this.container.appendChild(this.canvas);

            /* --------------------------------------------------
               webgl
            -------------------------------------------------- */
            this.gl = this.canvas.getContext("webgl", { premultipliedAlpha: false });

            if (!this.gl) {
                console.error("WebGL not supported.");
                return;
            }

            /* --------------------------------------------------
               resize handle
            -------------------------------------------------- */
            this.resize = this.resize.bind(this);

            if (this.opts.autoResize) {
                window.addEventListener("resize", this.resize);
            }

            this.resize();

            /* --------------------------------------------------
               shader sources
            -------------------------------------------------- */
            this.vertSrc = `
                attribute vec4 a_position;
                void main() { gl_Position = a_position; }
            `;

            this.fragSrc = `
                precision highp float;

                uniform float time;
                uniform float spin_time;
                uniform float contrast;
                uniform float spin_amount;
                uniform float pixel_fac;
                uniform float spin_ease;
                uniform float zoom;
                uniform vec2 offset;
                uniform vec2 resolution;
                uniform vec4 colour_1;
                uniform vec4 colour_2;
                uniform vec4 colour_3;

                void main() {
                    vec2 screen_coords = gl_FragCoord.xy;
                    float pixel_size = length(resolution.xy) / pixel_fac;

                    vec2 uv = (floor(screen_coords.xy / pixel_size) * pixel_size - 0.5 * resolution.xy)
                              / length(resolution.xy) - offset;

                    float uv_len = length(uv);

                    float speed = (spin_time * spin_ease * 0.2) + 302.2;
                    float angle = atan(uv.y, uv.x)
                                + (spin_amount > 0.0
                                    ? speed - spin_ease * 20.0 * (spin_amount * uv_len + (1.0 - spin_amount))
                                    : 0.0);

                    vec2 mid = (resolution.xy / length(resolution.xy)) / 2.0;

                    uv = vec2(
                        uv_len * cos(angle) + mid.x,
                        uv_len * sin(angle) + mid.y
                    ) - mid;

                    uv *= zoom;
                    speed = time * 2.0;

                    vec2 uv2 = vec2(uv.x + uv.y);

                    for (int i = 0; i < 5; i++) {
                        uv2 += sin(max(uv.x, uv.y)) + uv;

                        uv += 0.5 * vec2(
                            cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
                            sin(uv2.x - 0.113 * speed)
                        );

                        uv -= 1.0 * cos(uv.x + uv.y)
                            - 1.0 * sin(uv.x * 0.711 - uv.y);
                    }

                    float cmod = (0.25 * contrast + 0.5 * spin_amount + 1.2);
                    float paint = min(2.0, max(0.0, length(uv) * 0.035 * cmod));

                    float c1p = max(0.0, 1.0 - cmod * abs(1.0 - paint));
                    float c2p = max(0.0, 1.0 - cmod * abs(paint));
                    float c3p = 1.0 - min(1.0, c1p + c2p);

                    vec4 ret =
                        (0.3 / contrast) * colour_1 +
                        (1.0 - 0.3 / contrast) *
                        (colour_1 * c1p +
                         colour_2 * c2p +
                         vec4(c3p * colour_3.rgb, c3p * colour_1.a));

                    gl_FragColor = ret;
                }
            `;

            /* --------------------------------------------------
               render loop
            -------------------------------------------------- */
            this.init();
            this.lastTime = 0;
            this.simTime = 0;        // accumulated, speed-scaled time
            this.paused = false;

            this.render = this.render.bind(this);
            requestAnimationFrame(this.render);
        }

        /* --------------------------------------------------
           shader compiling
        -------------------------------------------------- */
        compile(type, source) {
            const s = this.gl.createShader(type);
            this.gl.shaderSource(s, source);
            this.gl.compileShader(s);

            if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
                console.error(this.gl.getShaderInfoLog(s));
                return null;
            }

            return s;
        }
        /* --------------------------------------------------
            initialise
        -------------------------------------------------- */
        init() {
            const gl = this.gl;

            // Compile shaders
            const v = this.compile(gl.VERTEX_SHADER, this.vertSrc);
            const f = this.compile(gl.FRAGMENT_SHADER, this.fragSrc);

            // Create program
            this.program = gl.createProgram();
            gl.attachShader(this.program, v);
            gl.attachShader(this.program, f);
            gl.linkProgram(this.program);
            gl.useProgram(this.program);

            // Fullscreen quad buffer
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([
                    -1, -1,   1, -1,   -1, 1,
                    -1,  1,   1, -1,    1, 1
                ]),
                gl.STATIC_DRAW
            );

            // Vertex attribute
            const pos = gl.getAttribLocation(this.program, "a_position");
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            // uniform locations - just presets
            const u = n => gl.getUniformLocation(this.program, n);
            this.u = {
                time:      u("time"),
                spinTime:  u("spin_time"),
                contrast:  u("contrast"),
                spinAmount:u("spin_amount"),
                pixelFac:  u("pixel_fac"),
                spinEase:  u("spin_ease"),
                zoom:      u("zoom"),
                offset:    u("offset"),
                res:       u("resolution"),
                c1:        u("colour_1"),
                c2:        u("colour_2"),
                c3:        u("colour_3")
            };
        }

        /* --------------------------------------------------
           resize dynamically with container width
        -------------------------------------------------- */
        resize() {
            this.canvas.width  = this.container.clientWidth;
            this.canvas.height = this.container.clientHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }

        /* --------------------------------------------------
           colouring
        -------------------------------------------------- */
        hex(hex) {
            hex = hex.replace("#", "");
            if (hex.length === 3) hex = [...hex].map(c => c + c).join("");

            const int = parseInt(hex, 16);
            return [
                ((int >> 16) & 255) / 255,
                ((int >> 8)  & 255) / 255,
                (int & 255) / 255
            ];
        }

        /* --------------------------------------------------
           ease-in-out-cubic (danny suggestion)
        -------------------------------------------------- */
        easeInOutCubic(p) {
            return p < 0.5
                ? 4 * p * p * p
                : 1 - Math.pow(-2 * p + 2, 3) / 2;
        }

        /* --------------------------------------------------
           colour fading/transitions
        -------------------------------------------------- */
        fadeColour(name, newHex, duration = 1.0) {
            const start = this.hex(this.opts.colours[name]);
            const end   = this.hex(newHex);

            let t0 = performance.now();

            const toHex = v => Math.round(v * 255).toString(16).padStart(2, "0");

            const animate = now => {
                let raw = Math.min(1, (now - t0) / (duration * 1000));
                let p   = this.easeInOutCubic(raw);

                const lerp = (a, b) => a + (b - a) * p;

                const r = lerp(start[0], end[0]);
                const g = lerp(start[1], end[1]);
                const b = lerp(start[2], end[2]);

                this.opts.colours[name] = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

                if (raw < 1) requestAnimationFrame(animate);
            };

            requestAnimationFrame(animate);
        }

        fadeColours(newColours, duration = 1.0) {
            if (newColours.c1) this.fadeColour("c1", newColours.c1, duration);
            if (newColours.c2) this.fadeColour("c2", newColours.c2, duration);
            if (newColours.c3) this.fadeColour("c3", newColours.c3, duration);
        }

        /* --------------------------------------------------
           numeric tweening - pretty much intermediate frames in vs
        -------------------------------------------------- */
        tweenValue(name, newValue, duration = 1.0) {
            const start = this.opts[name];
            const end   = newValue;

            let t0 = performance.now();

            const animate = now => {
                let raw = Math.min(1, (now - t0) / (duration * 1000));
                let p   = this.easeInOutCubic(raw);

                this.opts[name] = start + (end - start) * p;

                if (raw < 1) requestAnimationFrame(animate);
            };

            requestAnimationFrame(animate);
        }

        /* --------------------------------------------------
           preset morph/transition
        -------------------------------------------------- */
        applyPreset(preset, duration = 1.0) {
            for (const key in preset) {
                if (key === "c1" || key === "c2" || key === "c3") {
                    this.fadeColour(key, preset[key], duration);
                } else {
                    this.tweenValue(key, preset[key], duration);
                }
            }
        }

        /* --------------------------------------------------
           rendering loop
        -------------------------------------------------- */
        render(t) {
            if (this.paused) return;

            const gl = this.gl;
            if (!gl) return;

            if (!this.lastTime) this.lastTime = t;
            const delta = t - this.lastTime;
            if (delta < 1000 / this.opts.maxFPS) {
                return requestAnimationFrame(this.render);
            }

            // Accumulate speed-scaled time from the REAL elapsed delta.
            // (Previously time was t * speed, so changing speed re-scaled
            // ALL elapsed time and the pattern jumped/spun to a new phase.
            // Accumulating means speed only affects future frames → smooth
            // slow-down when the shader is paused.)
            this.simTime += delta * 0.001 * this.opts.speed;
            this.lastTime = t;

            const time = this.simTime;

            // niform updates
            gl.uniform1f(this.u.time,      time);
            gl.uniform1f(this.u.spinTime,  time);
            gl.uniform1f(this.u.contrast,  this.opts.contrast);
            gl.uniform1f(this.u.spinAmount,this.opts.enableSpin ? this.opts.spinAmount : 0.0);
            gl.uniform1f(this.u.pixelFac,  this.opts.pixelSizeFac);
            gl.uniform1f(this.u.spinEase,  this.opts.spinEase);
            gl.uniform1f(this.u.zoom,      this.opts.zoom);
            gl.uniform2f(this.u.offset,    this.opts.offsetX, this.opts.offsetY);
            gl.uniform2f(this.u.res,       this.canvas.width, this.canvas.height);

            // colour uniforms defau;ts
            const [r1, g1, b1] = this.hex(this.opts.colours.c1);
            const [r2, g2, b2] = this.hex(this.opts.colours.c2);
            const [r3, g3, b3] = this.hex(this.opts.colours.c3);

            gl.uniform4f(this.u.c1, r1, g1, b1, 1);
            gl.uniform4f(this.u.c2, r2, g2, b2, 1);
            gl.uniform4f(this.u.c3, r3, g3, b3, 1);

            // draw
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            requestAnimationFrame(this.render);
        }
    }

    window.BalatroShader = BalatroShader;

})();