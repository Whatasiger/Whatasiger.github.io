/**
 * gizmo-leaf.js
 * 首页右侧的 Gizmo 入口：一片浮在水面上的叶子（点击进入 /gizmo/）
 *
 *   - 平时静静漂着，隔一阵被风吹动一下，划过水面留下细小的尾流；落下时、悬停 / 按下时轻点水面泛起涟漪
 *   - 水波（water-ripple.js）经过时随波起伏、被推开：每帧取叶片首、中、尾三处的水面坡度与起伏速度，
 *     坡度把叶片推向低处，坡度 × 起伏速度（只沿波的传播方向）让它顺着波被推走，首尾受力不同则转动
 *   - 运动只写 transform（锚点 translate，叶身 rotate / scale），静止后停掉帧循环
 *   - 只在顶栏导航未收起时显示（收起时入口在导航卡片里，CSS 隐藏叶片）；偏好减少动画时静止不动
 */
(function () {
    "use strict";

    var leaf = document.querySelector(".gizmo-leaf");
    if (!leaf) return;
    var body = leaf.querySelector(".gizmo-leaf-body");
    var root = document.documentElement;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ── 配置参数 ─────────────────────────────────────────── */
    var CFG = {
        len:        64,      // 叶片长 / 高（CSS px），与 glint.css 中 .gizmo-leaf 的尺寸一致
        height:     40,
        margin:     28,      // 与内容区 / 视口边缘至少留出的距离（px）
        minGutter:  132,     // 右侧空白窄于此时退到视口右缘
        roam:       120,     // 以锚点为中心的漂动半径（px），超出后被更用力地拉回
        anchorY:    0.62,    // 锚点在页眉以下区域的高度比例
        spring:     0.3,     // 拉回锚点的弹性（/s²）
        drag:       1.1,     // 线速度阻尼（/s），水的黏滞
        angDrag:    1.8,     // 角速度阻尼（/s）
        gustEvery:  [7000, 16000], // 两阵风之间的间隔（ms）
        gustSpeed:  [24, 50],      // 一阵风吹出的初速度（px/s）
        slope:      8000,    // 水面坡度推力（px/s² / 每 px 坡度）：随波来回晃
        surf:       4e7,     // 坡度 × 起伏速度的推力：只沿传播方向，把叶片顺着波推走
        soften:     400,     // 推力软饱和（px/s²）：a → a / (1 + a / soften)，近处的大浪不至于把叶片弹飞，远处的小浪仍推得动
                             // 实测（桌面，默认点击水滴）：200px 外约推开 55px，450px 约 40px，800px 约 12px
        turn:       0.0016,  // 首尾受力差 → 角加速度
        bob:        0.06,    // 波峰抬起时放大的比例（每单位水面高度）
        wakeStep:   16,      // 每漂过这么远（px）留一段尾流
        wakeSpeed:  16       // 速度高于此（px/s）才留尾流
    };

    var wr = function () { return window.waterRipple; };
    var x = 0, y = 0, vx = 0, vy = 0, th = -0.35, w = 0, sc = 1;
    var ax = 0, ay = 0, roamX = CFG.roam, roamY = CFG.roam, minY = 0, maxX = 0, maxY = 0;
    var raf = 0, last = 0, gustTimer = 0, placed = false, landed = false;
    var wakeX = 0, wakeY = 0, wakeDist = 0;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function hidden() { return root.classList.contains("nav-collapsed") || document.hidden; }

    /* ── 锚点：右侧空白的中线、页眉以下偏下的位置 ───────── */
    function layout() {
        var vw = root.clientWidth, vh = window.innerHeight;
        var wrap = document.querySelector("main > .wrap");
        var right = wrap ? wrap.getBoundingClientRect().right : vw * 0.75;
        var header = document.querySelector("header");
        var top = header ? header.getBoundingClientRect().bottom : 0;
        var gutter = vw - right;
        var half = CFG.len / 2;

        if (gutter >= CFG.minGutter) {
            ax = right + gutter / 2;
            roamX = Math.max(8, Math.min(CFG.roam, gutter / 2 - CFG.margin - half));
        } else {
            ax = vw - CFG.margin - half;
            roamX = 10;
        }
        ay = top + (vh - top) * CFG.anchorY;
        roamY = Math.max(20, Math.min(CFG.roam * 1.3, (vh - top) / 2 - 60));
        minY = top + CFG.height;
        maxX = vw - half - 6;
        maxY = vh - CFG.height;

        if (!placed) {
            placed = true;
            x = ax + rand(-0.4, 0.4) * roamX;
            y = ay + rand(-0.3, 0.3) * roamY;
        }
        render();
        start();
    }

    function render() {
        leaf.style.transform = "translate3d(" + (x - CFG.len / 2).toFixed(2) + "px," + (y - CFG.height / 2).toFixed(2) + "px,0)";
        body.style.transform = "rotate(" + th.toFixed(4) + "rad) scale(" + sc.toFixed(4) + ")";
    }

    /* ── 帧循环 ──────────────────────────────────────────── */
    function start() {
        if (raf || reduce || hidden()) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }

    function tick(now) {
        raf = 0;
        if (hidden()) { if (wr()) wr().setProbe(null); return; }
        var dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;

        // 水波：首、中、尾三处取样
        var water = wr(), wet = water && water.isActive();
        var fx = 0, fy = 0, torque = 0, h = 0, n = 0;
        if (water) water.setProbe({ x: x, y: y, r: CFG.len * 0.6 });
        if (wet) {
            var c = Math.cos(th), s = Math.sin(th);
            for (var k = -1; k <= 1; k++) {
                var ox = c * k * CFG.len * 0.32, oy = s * k * CFG.len * 0.32;
                var q = water.sample(x + ox, y + oy);
                if (!q) continue;
                var push = CFG.slope + CFG.surf * q.v;
                var px = -q.gx * push, py = -q.gy * push;
                fx += px;
                fy += py;
                torque += ox * py - oy * px;
                h += q.h;
                n++;
            }
            if (n) {
                fx /= n;
                fy /= n;
                var soft = 1 / (1 + Math.sqrt(fx * fx + fy * fy) / CFG.soften);
                fx *= soft;
                fy *= soft;
                torque *= soft;
                h /= n;
            }
        }

        // 拉回锚点：漂出漂动范围后越来越用力
        var dx = (x - ax) / roamX, dy = (y - ay) / roamY;
        var e = Math.sqrt(dx * dx + dy * dy);
        var k2 = CFG.spring * (e > 1 ? 1 + (e - 1) * 8 : 1);
        fx -= k2 * (x - ax);
        fy -= k2 * (y - ay);

        vx = (vx + fx * dt) * Math.exp(-CFG.drag * dt);
        vy = (vy + fy * dt) * Math.exp(-CFG.drag * dt);
        w = (w + torque * CFG.turn * dt) * Math.exp(-CFG.angDrag * dt);
        x += vx * dt;
        y += vy * dt;
        th += w * dt;

        // 视口边缘：轻轻弹回
        var half = CFG.len / 2;
        if (x < half + 6) { x = half + 6; vx = Math.abs(vx) * 0.4; }
        if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.4; }
        if (y < minY) { y = minY; vy = Math.abs(vy) * 0.4; }
        if (y > maxY) { y = maxY; vy = -Math.abs(vy) * 0.4; }

        // 波峰抬起、波谷沉下（随水面高度略微缩放），平滑过渡
        var target = 1 + Math.max(-0.08, Math.min(0.08, h * CFG.bob));
        sc += (target - sc) * Math.min(1, dt * 10);

        // 尾流：漂得够快时沿路径在水面划出细线
        var speed = Math.sqrt(vx * vx + vy * vy);
        if (water && landed && speed > CFG.wakeSpeed) {
            wakeDist += speed * dt;
            if (wakeDist >= CFG.wakeStep) {
                water.stroke(wakeX, wakeY, x, y, 10, 0.05 * Math.min(speed / 40, 1.5));
                wakeDist = 0;
                wakeX = x;
                wakeY = y;
            }
        } else {
            wakeDist = 0;
            wakeX = x;
            wakeY = y;
        }

        render();
        if (wet || speed > 0.5 || Math.abs(w) > 0.01 || Math.abs(sc - 1) > 0.002) {
            raf = requestAnimationFrame(tick);
        }
    }

    /* ── 风：隔一阵吹动一下 ───────────────────────────────── */
    function scheduleGust() {
        clearTimeout(gustTimer);
        gustTimer = setTimeout(gust, rand(CFG.gustEvery[0], CFG.gustEvery[1]));
    }

    function gust() {
        scheduleGust();
        if (hidden() || leaf.matches(":hover")) return;
        // 方向随机，但离锚点越远越偏向往回吹
        var ang = rand(0, Math.PI * 2);
        var spd = rand(CFG.gustSpeed[0], CFG.gustSpeed[1]);
        var bx = ax - x, by = ay - y, bl = Math.sqrt(bx * bx + by * by) || 1;
        var pull = Math.min(1, bl / Math.max(roamX, roamY));
        var gx = Math.cos(ang) * (1 - pull) + bx / bl * pull;
        var gy = Math.sin(ang) * (1 - pull) + by / bl * pull;
        var gl = Math.sqrt(gx * gx + gy * gy) || 1;
        vx += gx / gl * spd;
        vy += gy / gl * spd;
        w += rand(-0.5, 0.5);
        if (wr()) wr().drop(x, y, 14, 0.25); // 风起时叶尖点一下水
        start();
    }

    /* ── 交互：悬停轻点水面，按下点得更深 ───────────────── */
    leaf.addEventListener("pointerenter", function () {
        if (wr() && landed) wr().drop(x, y, 18, 0.45);
        start();
    });
    leaf.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        if (wr()) wr().drop(x, y, 26, 1.1);
    });

    /* ── 启动：落到水面上，激起一圈涟漪 ─────────────────── */
    function land() {
        layout();
        leaf.classList.add("is-landed");
        if (reduce) { landed = true; return; }
        setTimeout(function () {
            landed = true;
            if (wr()) {
                wr().onStart = start;
                wr().drop(x, y, 24, 0.9);
            }
            start();
        }, 650); // 与 .gizmo-leaf.is-landed 的落下动画同步
        scheduleGust();
    }

    window.addEventListener("resize", layout);
    // 导航收起 / 展开时（html 上的其他类名变化不管）
    var wasCollapsed = root.classList.contains("nav-collapsed");
    new MutationObserver(function () {
        var c = root.classList.contains("nav-collapsed");
        if (c === wasCollapsed) return;
        wasCollapsed = c;
        if (placed) layout();
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", start);

    // 等首页卡片入场、背景烘焙告一段落再落下
    setTimeout(function () {
        if ("requestIdleCallback" in window) requestIdleCallback(land, { timeout: 1500 });
        else land();
    }, 1400);
})();
