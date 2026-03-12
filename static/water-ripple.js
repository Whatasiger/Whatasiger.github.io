/**
 * water-ripple.js (Rewritten version)
 * 首页背景水波纹效果 —— 追求“轻盈、润泽、灵动”的高级质感
 *
 * 核心设计：
 *   - 物理：Hugo Elias 离散波动方程，优化衰减以实现“轻灵”感。
 *   - 渲染：除了传统的折射（Refraction），新增了高光（Specular）与边缘发光（Edge Glow），
 *           模拟光线在润泽水面的反射，提升质感。
 *   - 性能：双缓冲 Float32Array + 低分辨率离屏计算，确保 60fps 丝滑。
 *   - 交互：支持单击、长按持续激发、以及拖拽形成的 V 型尾流。
 */
(function () {
    "use strict";

    /* ── 配置参数 ─────────────────────────────────────────── */
    var CFG = {
        scale:        0.35,   // 计算分辨率缩放比（相对于视口），略低可提升“柔和度”
        dampening:    0.985,  // 衰减系数，增加一点使波纹更持久而优雅（0.9~0.99）
        distortion:   0.8,    // 折射偏移强度，适中，保持“轻微”
        specular:     2.5,    // 高光强度，值越大水面看起来越“润泽”
        edgeGlow:     0.12,   // 边缘发光强度，增加“灵动”感
        alpha:        0.4,    // 整体最大不透明度
        dropRadius:   12,     // 扰动半径
        dropStrength: 280,    // 初始扰动能量
        holdInterval: 180,    // 长按时连续激发的频率 (ms)
        moveMinDist:  4,      // 拖拽触发新扰动的最小距离
        idleEnergy:   0.15,   // 停止动画的能量阈值，更细腻
    };

    /* ── 环境检查 ─────────────────────────────────────────── */
    var path = location.pathname;
    var isHome = /^\/$|^\/page\/\d+\/?$/.test(path);
    if (!isHome) return;

    /* ── 状态管理 ─────────────────────────────────────────── */
    var canvas, ctx;
    var W = 0, H = 0;
    var buf0, buf1;
    var cur = 0;

    var bgCanvas = null;
    var bgCtx    = null;
    var bgLoaded = false;
    var bgImg    = null;

    var rafId     = null;
    var isRunning = false;

    var mouse = {
        down: false,
        x: 0, y: 0,
        lastX: 0, lastY: 0,
        holdTimer: null,
    };

    /* ── 初始化逻辑 ───────────────────────────────────── */
    function init() {
        if (document.getElementById("water-ripple-canvas")) return;

        canvas = document.createElement("canvas");
        canvas.id = "water-ripple-canvas";
        // z-index: 0 配合 pointer-events: none 确保不阻碍点击且在内容下方
        canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;";

        document.body.insertBefore(canvas, document.body.firstChild);
        ctx = canvas.getContext("2d", { alpha: true });

        updateSize();
        loadBackground();
        bindEvents();

        window.addEventListener("resize", debounce(function() {
            updateSize(true);
        }, 200));
    }

    function updateSize(force) {
        var newW = Math.ceil(window.innerWidth  * CFG.scale);
        var newH = Math.ceil(window.innerHeight * CFG.scale);

        if (!force && newW === W && newH === H) return;

        W = newW;
        H = newH;

        buf0 = new Float32Array(W * H);
        buf1 = new Float32Array(W * H);
        cur  = 0;

        canvas.width  = W;
        canvas.height = H;
        ctx = canvas.getContext("2d", { alpha: true });

        if (bgLoaded && bgImg) renderBgCache();
    }

    /* ── 背景图处理 ─────────────────────────────────────── */
    function loadBackground() {
        var bgVal = getComputedStyle(document.body).getPropertyValue("--page-bg-image").trim();
        var match = bgVal.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
        if (!match || !match[1] || match[1] === "none") {
            bgLoaded = false;
            return;
        }

        var src = match[1];
        var img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function () {
            bgImg = img;
            renderBgCache();
            bgLoaded = true;
        };
        img.src = src;
    }

    function renderBgCache() {
        bgCanvas = document.createElement("canvas");
        bgCanvas.width  = W;
        bgCanvas.height = H;
        bgCtx = bgCanvas.getContext("2d");

        var s  = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
        var dw = bgImg.naturalWidth  * s;
        var dh = bgImg.naturalHeight * s;
        bgCtx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    /* ── 核心物理仿真 ────────────────────────────────────── */
    function step() {
        var r = cur === 0 ? buf0 : buf1;
        var w = cur === 0 ? buf1 : buf0;
        var damp = CFG.dampening;
        var maxE = 0;

        for (var y = 1; y < H - 1; y++) {
            var row = y * W;
            for (var x = 1; x < W - 1; x++) {
                var i = row + x;
                // 拉普拉斯算子简化计算
                var v = (r[i - 1] + r[i + 1] + r[i - W] + r[i + W]) * 0.5 - w[i];
                v *= damp;

                // 极小值清理，避免 CPU 空转
                if (v < 0.0001 && v > -0.0001) v = 0;

                w[i] = v;
                if (v !== 0) {
                    var av = v < 0 ? -v : v;
                    if (av > maxE) maxE = av;
                }
            }
        }
        cur = 1 - cur;
        return maxE;
    }

    /* ── 灵动渲染引擎 ────────────────────────────────────── */
    function render() {
        if (!bgLoaded || !bgCanvas) return;

        var hBuf = cur === 0 ? buf0 : buf1;
        var bgData = bgCtx.getImageData(0, 0, W, H).data;
        var outData = ctx.createImageData(W, H);
        var dst = outData.data;

        var distStr = CFG.distortion;
        var specStr = CFG.specular;
        var glowStr = CFG.edgeGlow;
        var maxA    = CFG.alpha;

        for (var y = 1; y < H - 1; y++) {
            var row = y * W;
            for (var x = 1; x < W - 1; x++) {
                var i = row + x;

                // 计算水平和垂直梯度
                var gx = hBuf[i + 1] - hBuf[i - 1];
                var gy = hBuf[i + W] - hBuf[i - W];

                if (gx === 0 && gy === 0) continue;

                // 1. 折射计算 (Refraction)
                var sx = Math.round(x + gx * distStr);
                var sy = Math.round(y + gy * distStr);

                // 边界约束
                if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
                if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;

                // 2. 高光与润泽感 (Specular & Highlights)
                // 基于梯度模拟表面法线方向，计算简单的漫反射/高光增益
                var mag = Math.sqrt(gx * gx + gy * gy);
                // 向上倾斜的表面（gy < 0）通常接收更多上方光照
                var specular = -gy * specStr + mag * glowStr;

                var si = (sy * W + sx) * 4;
                var di = i * 4;

                // 3. 颜色混合
                // 取采样点颜色，并注入高光
                var r = bgData[si]     + specular;
                var g = bgData[si + 1] + specular;
                var b = bgData[si + 2] + specular;

                // 限制颜色范围并在边缘保持柔和 alpha
                dst[di]     = r > 255 ? 255 : (r < 0 ? 0 : r);
                dst[di + 1] = g > 255 ? 255 : (g < 0 ? 0 : g);
                dst[di + 2] = b > 255 ? 255 : (b < 0 ? 0 : b);

                // Alpha 随波动能量自然衰减，实现“轻灵”感
                var alpha = Math.min(mag * 0.015, 1) * maxA;
                dst[di + 3] = (alpha * 255) | 0;
            }
        }
        ctx.putImageData(outData, 0, 0);
    }

    /* ── 动画主循环 ──────────────────────────────────────── */
    function loop() {
        var energy = step();
        render();

        if (energy > CFG.idleEnergy || mouse.down) {
            rafId = requestAnimationFrame(loop);
        } else {
            isRunning = false;
            rafId = null;
            ctx.clearRect(0, 0, W, H);
        }
    }

    function startLoop() {
        if (isRunning) return;
        isRunning = true;
        rafId = requestAnimationFrame(loop);
    }

    /* ── 交互逻辑 ────────────────────────────────────────── */
    function addDrop(lx, ly, radius, strength) {
        var r = Math.ceil(radius);
        var buf = cur === 0 ? buf0 : buf1;

        for (var dy = -r; dy <= r; dy++) {
            for (var dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                var nx = (lx + dx) | 0;
                var ny = (ly + dy) | 0;

                if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue;

                var dist = Math.sqrt(dx * dx + dy * dy);
                var fade = Math.pow(1 - dist / r, 2);
                buf[ny * W + nx] += strength * fade;
            }
        }
    }

    function isContentTarget(el) {
        if (!el || el === canvas) return false;
        // 排除头像、卡片、社交栏等核心内容区域
        return !!el.closest(
            "header, footer, .settings-panel, " +
            ".home-social, .home-profile-link, " +
            ".post-item, .page-navigator, " +
            "nav, a, button, input, select, textarea, label, img"
        );
    }

    function onMouseDown(e) {
        if ((e.button !== undefined && e.button !== 0) || isContentTarget(e.target)) return;

        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) * CFG.scale;
        var y = (e.clientY - rect.top)  * CFG.scale;

        mouse.down  = true;
        mouse.x     = x;
        mouse.y     = y;
        mouse.lastX = x;
        mouse.lastY = y;

        addDrop(x, y, CFG.dropRadius, CFG.dropStrength);
        startLoop();

        // 长按逻辑
        clearInterval(mouse.holdTimer);
        mouse.holdTimer = setInterval(function() {
            if (!mouse.down) return clearInterval(mouse.holdTimer);
            // 长按时注入较小的能量，保持水面波动
            addDrop(mouse.x, mouse.y, CFG.dropRadius * 0.8, CFG.dropStrength * 0.4);
            startLoop();
        }, CFG.holdInterval);
    }

    function onMouseMove(e) {
        if (!mouse.down) return;

        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) * CFG.scale;
        var y = (e.clientY - rect.top)  * CFG.scale;

        var dx = x - mouse.lastX;
        var dy = y - mouse.lastY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= CFG.moveMinDist) {
            // 拖拽时注入能量，自然形成尾流
            addDrop(x, y, CFG.dropRadius * 0.6, CFG.dropStrength * 0.5);
            mouse.lastX = x;
            mouse.lastY = y;
            mouse.x = x;
            mouse.y = y;
            startLoop();
        }
    }

    function onMouseUp() {
        mouse.down = false;
        clearInterval(mouse.holdTimer);
    }

    function bindEvents() {
        document.addEventListener("mousedown",  onMouseDown);
        document.addEventListener("mousemove",  onMouseMove);
        document.addEventListener("mouseup",    onMouseUp);
        document.addEventListener("mouseleave", onMouseUp);

        document.addEventListener("touchstart", function(e) {
            var t = e.touches[0];
            onMouseDown({ clientX: t.clientX, clientY: t.clientY, target: t.target });
        }, { passive: true });

        document.addEventListener("touchmove", function(e) {
            var t = e.touches[0];
            onMouseMove({ clientX: t.clientX, clientY: t.clientY });
        }, { passive: true });

        document.addEventListener("touchend", onMouseUp);
    }

    /* ── 工具函数 ────────────────────────────────────────── */
    function debounce(fn, ms) {
        var timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    // 观察背景或主题变化
    var observer = new MutationObserver(debounce(loadBackground, 300));
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });

    /* ── 启动 ──────────────────────────────────────────── */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
