/**
 * water-ripple.js
 * 首页背景水波纹效果：点击背景浮现水波，拖拽留下尾流，长按持续激发
 *
 * 实现要点：
 *   - 物理与渲染全部在 GPU（WebGL2）：波动方程在半精度浮点纹理上乒乓迭代，
 *     渲染按屏幕原生分辨率逐像素计算折射、色散、明暗与高光，CPU 每帧只发几条绘制命令
 *   - 画布平时隐藏；激发时把「底色 + 背景图（同透明度 / 模糊）」合成为一张纹理，
 *     静水时画面与 CSS 背景完全一致，水波平息后再无缝隐藏
 *   - 画布 z-index:-1，紧跟 body:before 之后绘制，只覆盖背景，不遮挡任何内容
 *   - 物理按固定 60Hz 步进，高刷屏下波速不变；不支持 WebGL2 / 偏好减少动画时直接不启用
 */
(function () {
    "use strict";

    /* ── 配置参数 ─────────────────────────────────────────── */
    var CFG = {
        simLongSide:    512,    // 物理网格长边格数（越大波纹越细腻）
        stepsPerTick:   2,      // 每个 60Hz 节拍的物理步数（影响波速）
        damping:        0.992,  // 每步速度衰减（越接近 1 余波越久）
        maxPixelRatio:  2,      // 渲染分辨率上限（设备像素比）
        maxPixels:      4.2e6,  // 渲染像素总数上限，超出时降低像素比
        refraction:     130,    // 折射偏移强度（CSS px / 单位坡度），越大水显得越深
        dispersion:     0.15,   // RGB 色散比例，边缘带一点虹彩
        shade:          0.18,   // 迎光/背光明暗强度
        depth:          0.02,   // 波峰提亮、波谷压暗的强度，增加体积感
        specular:       0.5,    // 高光强度
        lightDir:       [-0.55, 0.83], // 光源方向（左上）
        dropRadius:     30,     // 点击扰动半径（CSS px），越大波长越长
        dropStrength:   1.8,    // 点击扰动高度
        strokeRadius:   30,     // 拖拽尾流半径（CSS px）
        strokeStrength: 0.35,   // 拖拽尾流高度（每段）
        holdInterval:   160,    // 长按连续激发间隔（ms）
        holdRadius:     16,
        holdStrength:   0.6,
        maxHeight:      3,      // 单格高度上限，防止叠加出尖峰
        idleAmp:        0.005   // 估算振幅低于此值即视为平息，隐藏画布
    };

    /* ── 环境检查 ─────────────────────────────────────────── */
    if (!/^\/$|^\/page\/\d+\/?$/.test(location.pathname)) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* ── 着色器 ──────────────────────────────────────────── */
    var VS = [
        "#version 300 es",
        "in vec2 aPos;",
        "out vec2 vUv;",
        "void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }"
    ].join("\n");

    // 波动方程：R = 高度，G = 速度
    var FS_UPDATE = [
        "#version 300 es",
        "precision highp float;",
        "uniform sampler2D uState;",
        "uniform vec2 uTexel;",
        "uniform float uDamp;",
        "in vec2 vUv;",
        "out vec4 o;",
        "void main() {",
        "    vec4 s = texture(uState, vUv);",
        "    float avg = (texture(uState, vUv + vec2(uTexel.x, 0.0)).r",
        "               + texture(uState, vUv - vec2(uTexel.x, 0.0)).r",
        "               + texture(uState, vUv + vec2(0.0, uTexel.y)).r",
        "               + texture(uState, vUv - vec2(0.0, uTexel.y)).r) * 0.25;",
        "    s.g += (avg - s.r) * 2.0;",
        "    s.g *= uDamp;",
        "    s.r += s.g;",
        "    s.r *= 0.9995;", // 缓慢回落到静水面，避免能量累积成整体抬升
        "    o = s;",
        "}"
    ].join("\n");

    // 扰动：沿线段 A→B 叠加一个余弦形凸起（A=B 即圆形水滴）
    var FS_DROP = [
        "#version 300 es",
        "precision highp float;",
        "uniform sampler2D uState;",
        "uniform vec2 uRes;",
        "uniform vec2 uA;",
        "uniform vec2 uB;",
        "uniform float uRadius;",
        "uniform float uStrength;",
        "uniform float uMaxH;",
        "in vec2 vUv;",
        "out vec4 o;",
        "void main() {",
        "    vec4 s = texture(uState, vUv);",
        "    vec2 p = vUv * uRes;",
        "    vec2 ab = uB - uA;",
        "    float t = clamp(dot(p - uA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);",
        "    float d = length(p - (uA + ab * t));",
        "    float k = max(0.0, 1.0 - d / uRadius);",
        "    k = 0.5 - 0.5 * cos(k * 3.14159265);",
        "    s.r = clamp(s.r + k * uStrength, -uMaxH, uMaxH);",
        "    o = s;",
        "}"
    ].join("\n");

    // 渲染：折射采样背景 + 色散 + 明暗 + 高光；静水处输出与背景完全一致
    var FS_RENDER = [
        "#version 300 es",
        "precision highp float;",
        "uniform sampler2D uState;",
        "uniform sampler2D uBg;",
        "uniform vec2 uTexel;",
        "uniform vec2 uRes;",
        "uniform float uRefract;",
        "uniform float uDisp;",
        "uniform float uShade;",
        "uniform float uSpec;",
        "uniform float uDepth;",
        "uniform vec2 uLight;",
        "in vec2 vUv;",
        "out vec4 o;",
        "void main() {",
        "    float hL = texture(uState, vUv - vec2(uTexel.x, 0.0)).r;",
        "    float hR = texture(uState, vUv + vec2(uTexel.x, 0.0)).r;",
        "    float hD = texture(uState, vUv - vec2(0.0, uTexel.y)).r;",
        "    float hU = texture(uState, vUv + vec2(0.0, uTexel.y)).r;",
        "    vec2 g = vec2(hR - hL, hU - hD);",
        "    vec2 off = -g * uRefract / uRes;",
        "    vec3 c;",
        "    c.r = texture(uBg, vUv + off * (1.0 + uDisp)).r;",
        "    c.g = texture(uBg, vUv + off).g;",
        "    c.b = texture(uBg, vUv + off * (1.0 - uDisp)).b;",
        "    float h = texture(uState, vUv).r;",
        "    float l = dot(g, uLight);",
        // 高光 = 柔和的光晕 + 锐利的亮核
        "    float spec = (pow(clamp(l * 2.0, 0.0, 1.0), 2.0) * 0.45",
        "               + pow(clamp(l * 3.0, 0.0, 1.0), 6.0)) * uSpec;",
        "    c += l * uShade + h * uDepth + spec;",
        "    o = vec4(clamp(c, 0.0, 1.0), 1.0);",
        "}"
    ].join("\n");

    /* ── 状态 ────────────────────────────────────────────── */
    var canvas, gl;
    var progUpdate, progDrop, progRender;
    var quad;
    var simW = 0, simH = 0, vw = 0, vh = 0;
    var state = [];        // 两组 { tex, fbo } 乒乓
    var cur = 0;
    var bgTex = null, bgKey = "", bgImg = null, bgSrc = "";
    var bgCanvas = document.createElement("canvas");
    var bgCtx = bgCanvas.getContext("2d");

    var rafId = null, lastTime = 0, acc = 0;
    var amp = 0;           // 振幅估算，用于判断何时平息
    var visible = false;
    var pendingDrops = []; // 交互事件只入队，由帧循环统一提交到 GPU

    var activePointers = {};
    var activePointerCount = 0;

    /* ── 初始化 ──────────────────────────────────────────── */
    function init() {
        if (document.getElementById("water-ripple-canvas")) return;

        canvas = document.createElement("canvas");
        canvas.id = "water-ripple-canvas";
        canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;visibility:hidden;";

        gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
        if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

        progUpdate = program(VS, FS_UPDATE);
        progDrop   = program(VS, FS_DROP);
        progRender = program(VS, FS_RENDER);
        if (!progUpdate || !progDrop || !progRender) return;

        quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        bgTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        texParams(gl.LINEAR);

        document.body.insertBefore(canvas, document.body.firstChild);

        resize();
        loadBackground();
        bindEvents();

        window.addEventListener("resize", debounce(resize, 150));
        canvas.addEventListener("webglcontextlost", function (e) {
            e.preventDefault();
            stop();
            gl = null;
        });

        // 背景图或主题变化时，下次激发重新合成背景纹理
        new MutationObserver(debounce(loadBackground, 200))
            .observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    }

    function program(vsSrc, fsSrc) {
        var p = gl.createProgram();
        [[gl.VERTEX_SHADER, vsSrc], [gl.FRAGMENT_SHADER, fsSrc]].forEach(function (s) {
            var sh = gl.createShader(s[0]);
            gl.shaderSource(sh, s[1]);
            gl.compileShader(sh);
            gl.attachShader(p, sh);
        });
        gl.bindAttribLocation(p, 0, "aPos");
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
        p.u = {};
        var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < n; i++) {
            var name = gl.getActiveUniform(p, i).name;
            p.u[name] = gl.getUniformLocation(p, name);
        }
        return p;
    }

    function texParams(filter) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    function resize() {
        if (!gl) return;
        vw = window.innerWidth;
        vh = window.innerHeight;

        var dpr = Math.min(window.devicePixelRatio || 1, CFG.maxPixelRatio);
        if (vw * vh * dpr * dpr > CFG.maxPixels) dpr = Math.sqrt(CFG.maxPixels / (vw * vh));
        canvas.width  = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);

        var s = CFG.simLongSide / Math.max(vw, vh);
        simW = Math.max(2, Math.round(vw * s));
        simH = Math.max(2, Math.round(vh * s));

        state.forEach(function (st) {
            gl.deleteTexture(st.tex);
            gl.deleteFramebuffer(st.fbo);
        });
        state = [0, 1].map(function () {
            var tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, simW, simH, 0, gl.RGBA, gl.HALF_FLOAT, null);
            texParams(gl.LINEAR);
            var fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return { tex: tex, fbo: fbo };
        });
        cur = 0;
        amp = 0;
        bgKey = "";
        if (visible) stop();
    }

    /* ── 背景纹理：复刻 body 底色 + body:before 背景图 ─────── */
    function loadBackground() {
        var val = getComputedStyle(document.body).getPropertyValue("--page-bg-image").trim();
        var m = val.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
        var src = m ? m[1] : "";
        bgKey = "";
        if (src === bgSrc) return;
        bgSrc = src;
        bgImg = null;
        if (!src) return;
        var img = new Image();
        img.onload = function () {
            if (bgSrc === src) bgImg = img;
        };
        img.src = src;
    }

    function syncBackground() {
        var bodyCS = getComputedStyle(document.body);
        var beforeCS = getComputedStyle(document.body, "::before");
        var color = bodyCS.backgroundColor;
        if (/rgba\(.*,\s*0\)$|transparent/.test(color)) color = getComputedStyle(document.documentElement).backgroundColor;
        var opacity = parseFloat(beforeCS.opacity) || 0;
        var blurM = (beforeCS.filter || "").match(/blur\(([\d.]+)px\)/);
        var blur = blurM ? parseFloat(blurM[1]) : 0;

        var key = [canvas.width, canvas.height, color, opacity, blur, bgImg ? bgSrc : ""].join("|");
        if (key === bgKey) return;
        bgKey = key;

        var w = canvas.width, h = canvas.height, k = w / vw;
        bgCanvas.width = w;
        bgCanvas.height = h;
        bgCtx.globalAlpha = 1;
        bgCtx.filter = "none";
        bgCtx.fillStyle = color;
        bgCtx.fillRect(0, 0, w, h);
        if (bgImg && opacity > 0) {
            var s  = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
            var dw = bgImg.naturalWidth * s, dh = bgImg.naturalHeight * s;
            bgCtx.globalAlpha = Math.min(opacity, 1);
            if (blur > 0) bgCtx.filter = "blur(" + blur * k + "px)";
            bgCtx.drawImage(bgImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
        }

        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    /* ── GPU 通道 ────────────────────────────────────────── */
    function pass(prog, uniforms) {
        var dst = state[1 - cur];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, simW, simH);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state[cur].tex);
        gl.uniform1i(prog.u.uState, 0);
        uniforms(prog.u);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        cur = 1 - cur;
    }

    function applyDrop(d) {
        pass(progDrop, function (u) {
            gl.uniform2f(u.uRes, vw, vh);
            gl.uniform2f(u.uA, d.ax, d.ay);
            gl.uniform2f(u.uB, d.bx, d.by);
            gl.uniform1f(u.uRadius, d.r);
            gl.uniform1f(u.uStrength, d.s);
            gl.uniform1f(u.uMaxH, CFG.maxHeight);
        });
        amp = Math.min(amp + Math.abs(d.s), CFG.maxHeight);
    }

    function stepSim() {
        pass(progUpdate, function (u) {
            gl.uniform2f(u.uTexel, 1 / simW, 1 / simH);
            gl.uniform1f(u.uDamp, CFG.damping);
        });
        amp *= CFG.damping;
    }

    function draw() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(progRender);
        var u = progRender.u;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state[cur].tex);
        gl.uniform1i(u.uState, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.uniform1i(u.uBg, 1);
        gl.uniform2f(u.uTexel, 1 / simW, 1 / simH);
        gl.uniform2f(u.uRes, vw, vh);
        gl.uniform1f(u.uRefract, CFG.refraction);
        gl.uniform1f(u.uDisp, CFG.dispersion);
        var dark = document.body.classList.contains("dark-theme");
        gl.uniform1f(u.uShade, CFG.shade * (dark ? 0.7 : 1));
        gl.uniform1f(u.uSpec, CFG.specular * (dark ? 0.6 : 1));
        gl.uniform1f(u.uDepth, CFG.depth);
        gl.uniform2f(u.uLight, CFG.lightDir[0], CFG.lightDir[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* ── 动画主循环 ──────────────────────────────────────── */
    function frame(now) {
        rafId = null;
        if (!gl) return;

        // 长时间没有帧（切到后台等）：水波早该平息，直接收起
        if (now - lastTime > 1000 && !activePointerCount) {
            stop();
            return;
        }
        if (!bgKey) syncBackground(); // 波动中切换了主题/背景
        while (pendingDrops.length) applyDrop(pendingDrops.shift());

        // 固定 60Hz 物理步进；切回标签页等长间隔时最多补 4 拍
        acc += Math.min(now - lastTime, 67);
        lastTime = now;
        while (acc >= 1000 / 60) {
            for (var i = 0; i < CFG.stepsPerTick; i++) stepSim();
            acc -= 1000 / 60;
        }

        draw();
        if (!visible) {
            visible = true;
            canvas.style.visibility = "visible";
        }

        if (amp > CFG.idleAmp || activePointerCount > 0) {
            rafId = requestAnimationFrame(frame);
        } else {
            stop();
        }
    }

    function start() {
        if (!gl || rafId) return;
        if (!visible) {
            syncBackground();
            lastTime = performance.now();
            acc = 1000 / 60;
        }
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        visible = false;
        canvas.style.visibility = "hidden";
        amp = 0;
        pendingDrops.length = 0;
        state.forEach(function (st) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        });
    }

    /* ── 交互 ────────────────────────────────────────────── */
    // 坐标统一为 CSS px，y 轴向上（与纹理坐标一致）
    function queueDrop(ax, ay, bx, by, r, s) {
        pendingDrops.push({ ax: ax, ay: vh - ay, bx: bx, by: vh - by, r: r, s: s });
        start();
    }

    function isContentTarget(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(
            "header, footer, .settings-panel, " +
            ".home-social, .home-profile-link, " +
            ".post-item, .page-navigator, " +
            "nav, a, button, input, select, textarea, label, img"
        );
    }

    function onDown(key, x, y, target) {
        if (!gl || isContentTarget(target)) return;
        if (activePointers[key]) onUp(key);
        var p = { x: x, y: y, moved: 0, timer: null };
        p.timer = setInterval(function () {
            // 静止长按时持续激发；拖拽中则交给尾流
            if (p.moved < 2) queueDrop(p.x, p.y, p.x, p.y, CFG.holdRadius, CFG.holdStrength);
            p.moved = 0;
        }, CFG.holdInterval);
        activePointers[key] = p;
        activePointerCount++;
        queueDrop(x, y, x, y, CFG.dropRadius, CFG.dropStrength);
    }

    function onMove(key, x, y) {
        var p = activePointers[key];
        if (!p) return;
        var dx = x - p.x, dy = y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 3) return;
        // 尾流强度随速度略增，但封顶，避免甩动时炸开
        var s = CFG.strokeStrength * Math.min(1 + dist / 40, 2);
        queueDrop(p.x, p.y, x, y, CFG.strokeRadius, s);
        p.moved += dist;
        p.x = x;
        p.y = y;
    }

    function onUp(key) {
        var p = activePointers[key];
        if (!p) return;
        clearInterval(p.timer);
        delete activePointers[key];
        activePointerCount = Math.max(0, activePointerCount - 1);
    }

    function endAll() {
        for (var key in activePointers) {
            if (Object.prototype.hasOwnProperty.call(activePointers, key)) onUp(key);
        }
    }

    function bindEvents() {
        // 鼠标/笔走 Pointer Events；触摸走 Touch Events（滚动时 pointer 会被取消）
        document.addEventListener("pointerdown", function (e) {
            if (e.pointerType === "touch" || e.button !== 0) return;
            onDown("p" + e.pointerId, e.clientX, e.clientY, e.target);
        }, { passive: true });
        document.addEventListener("pointermove", function (e) {
            if (e.pointerType === "touch") return;
            onMove("p" + e.pointerId, e.clientX, e.clientY);
        }, { passive: true });
        document.addEventListener("pointerup",     function (e) { onUp("p" + e.pointerId); }, { passive: true });
        document.addEventListener("pointercancel", function (e) { onUp("p" + e.pointerId); }, { passive: true });

        function eachTouch(e, fn) {
            for (var i = 0; i < e.changedTouches.length; i++) fn(e.changedTouches[i]);
        }
        document.addEventListener("touchstart", function (e) {
            eachTouch(e, function (t) { onDown("t" + t.identifier, t.clientX, t.clientY, t.target); });
        }, { passive: true });
        document.addEventListener("touchmove", function (e) {
            eachTouch(e, function (t) { onMove("t" + t.identifier, t.clientX, t.clientY); });
        }, { passive: true });
        function touchEnd(e) {
            eachTouch(e, function (t) { onUp("t" + t.identifier); });
        }
        document.addEventListener("touchend",    touchEnd, { passive: true });
        document.addEventListener("touchcancel", touchEnd, { passive: true });
        window.addEventListener("blur", endAll);
    }

    /* ── 工具函数 ────────────────────────────────────────── */
    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    /* ── 启动 ──────────────────────────────────────────── */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
