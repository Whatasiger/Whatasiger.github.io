/**
 * 一叶 · 画面、输入、声音与界面（物理与关卡在 sim.js）
 *
 *   - 画布按世界坐标 1000 × 620 绘制：横屏原样，竖屏整体转置（setTransform 交换 x / y），逻辑不变
 *   - 静物（水面底色、岸、石头）烤进离屏画布，每帧只画会动的东西：云影、水流、漩涡、夕照、萤火、涟漪、叶子
 *   - 配色随博客：主题色取 localStorage whatasiger_reader_settings.accent（叶子与界面），日夜取 sessionStorage theme
 *   - 进度存 localStorage whatasiger_gizmo_yiye（每关三枚印记分别记：抵达 / 萤火拾齐 / 涟漪不超过标准）
 */
(function () {
    "use strict";

    var S = window.YiyeSim, P = S.P, W = S.W, H = S.H, LEVELS = S.LEVELS;
    var root = document.documentElement, body = document.body;
    var day = root.classList.contains("day");
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

    var cv = document.getElementById("pond"), ctx = cv.getContext("2d");
    function $(id) { return document.getElementById(id); }

    /* ── 颜色：把 CSS 里的任意颜色（含 oklch）解析成 rgb，方便拼透明度 ── */
    var probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    function rgbOf(css) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000"; probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        var d = probe.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
    }
    function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
    var C = {};
    function readColors() {
        C.glow = rgbOf(cssVar("--tc-glow") || "#9fcff7");
        C.dim = rgbOf(cssVar("--tc-dim") || "#6e8aad");
        C.ice = rgbOf(cssVar("--tc-ice") || "#cfe5fb");
        C.sun = day ? [236, 150, 86] : [243, 164, 98];
        C.sunPale = [255, 230, 190];
        C.mote = day ? [255, 186, 70] : [255, 226, 150];
        // 水面：夜里是暮色的深青，白天是映着天光的浅蓝；都往夕照那一侧泛暖
        C.waterA = day ? [128, 164, 200] : [20, 31, 46];
        C.waterB = day ? [170, 196, 222] : [38, 54, 74];
        C.shore = day ? [146, 172, 198] : [9, 14, 21];
        C.ringHi = day ? [255, 255, 255] : [210, 230, 250];
        C.ringLo = day ? [40, 70, 110] : [0, 6, 14];
        C.rock = day ? [92, 104, 120] : [36, 42, 52];
        C.pad = day ? [104, 150, 112] : [52, 86, 70];
    }
    readColors();

    /* ── 布局与坐标 ───────────────────────────────────────── */
    var dpr = 1, vw = 0, vh = 0, s = 1, ox = 0, oy = 0, portrait = false;
    var staticLayer = document.createElement("canvas"), sctx = staticLayer.getContext("2d");
    var leafSprite = null, leafShadow = null, glowSprite = null;

    function layout() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        vw = window.innerWidth; vh = window.innerHeight;
        cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
        portrait = vh > vw * 1.05;
        var dw = portrait ? H : W, dh = portrait ? W : H;
        var top = vw < 520 ? 60 : 68, bottom = 56, side = vw < 520 ? 10 : 24;
        s = Math.min((vw - side * 2) / dw, (vh - top - bottom) / dh);
        ox = (vw - dw * s) / 2;
        oy = top + (vh - top - bottom - dh * s) / 2;
        buildStatic();
        buildSprites();
    }
    // 世界 → 画布像素的变换（竖屏时交换 x / y）
    function worldTf(c) {
        if (portrait) c.setTransform(0, s * dpr, s * dpr, 0, ox * dpr, oy * dpr);
        else c.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);
    }
    function toWorld(px, py) {
        return portrait ? [(py - oy) / s, (px - ox) / s] : [(px - ox) / s, (py - oy) / s];
    }
    function toScreen(x, y) {
        return portrait ? [ox + y * s, oy + x * s] : [ox + x * s, oy + y * s];
    }
    // 屏幕上「往下」在世界坐标里的方向（投影用）
    function downVec(px) { return portrait ? [px / s, 0] : [0, px / s]; }

    /* ── 叶子图形：与博客 Gizmo 叶片同一条路径（viewBox 64 × 40，叶尖朝右） ── */
    var BLADE = new Path2D("M4 21C14 6 40 2 62 18C42 34 16 36 4 21Z");
    var GLOSS = new Path2D("M11 15C21 7.5 38 5.5 54 12.5");
    var VEIN = new Path2D("M0 23.5Q2.5 22 4.5 21Q32 19.5 60 18.2M16 20.6Q20 14 26 11M28 20Q33 13 39 10.5M40 19.4Q45 14 50 13M18 20.6Q23 26 30 28.5M31 20Q36 25 42 26.5");
    var LEAF_LEN = 56;                // 叶子在世界里的长度
    var LEAF_K = LEAF_LEN / 64;

    function buildSprites() {
        var px = s * dpr * LEAF_K;     // 叶片 viewBox 单位 → 设备像素
        var pad = 6;
        // 叶子本体
        leafSprite = document.createElement("canvas");
        leafSprite.width = Math.ceil(64 * px + pad * 2); leafSprite.height = Math.ceil(40 * px + pad * 2);
        var c = leafSprite.getContext("2d");
        c.translate(pad, pad); c.scale(px, px);
        var g = c.createLinearGradient(0, 0, 64, 40);
        g.addColorStop(0, rgba(C.glow, 0.97)); g.addColorStop(1, rgba(C.dim, 0.94));
        c.fillStyle = g; c.fill(BLADE);
        c.lineWidth = 0.8; c.strokeStyle = rgba(C.ice, 0.55); c.stroke(BLADE);
        c.lineCap = "round";
        c.lineWidth = 0.9; c.strokeStyle = "rgba(255,255,255,0.45)"; c.stroke(VEIN);
        c.lineWidth = 1.2; c.strokeStyle = "rgba(255,255,255,0.4)"; c.stroke(GLOSS);
        leafSprite.pad = pad; leafSprite.px = px;
        // 投影：模糊的叶形剪影
        leafShadow = document.createElement("canvas");
        var bl = Math.max(2, 4 * s * dpr);
        leafShadow.width = leafSprite.width + bl * 4; leafShadow.height = leafSprite.height + bl * 4;
        c = leafShadow.getContext("2d");
        c.filter = "blur(" + bl + "px)";
        c.translate(pad + bl * 2, pad + bl * 2); c.scale(px, px);
        c.fillStyle = day ? "rgba(20,40,70,0.35)" : "rgba(0,0,0,0.6)";
        c.fill(BLADE);
        leafShadow.pad = pad + bl * 2;
        // 通用柔光：白色径向渐变，用时再着色 / 设透明度
        glowSprite = document.createElement("canvas");
        glowSprite.width = glowSprite.height = 128;
        c = glowSprite.getContext("2d");
        g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.5)");
        g.addColorStop(0.6, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.fillRect(0, 0, 128, 128);
        tintCache = {};
    }
    var tintCache = {};
    function tintedGlow(col) {
        var k = col.join();
        if (tintCache[k]) return tintCache[k];
        var c2 = document.createElement("canvas"); c2.width = c2.height = 128;
        var c = c2.getContext("2d");
        c.drawImage(glowSprite, 0, 0);
        c.globalCompositeOperation = "source-in";
        c.fillStyle = rgba(col, 1); c.fillRect(0, 0, 128, 128);
        return (tintCache[k] = c2);
    }
    function glow(c, x, y, r, col, a) {
        c.globalAlpha = a;
        c.drawImage(tintedGlow(col), x - r, y - r, r * 2, r * 2);
        c.globalAlpha = 1;
    }

    /* ── 云影：一张平滑噪声，铺满水面缓缓漂移 ───────────── */
    var cloud = (function () {
        var cw = 160, ch = 100, c2 = document.createElement("canvas");
        c2.width = cw; c2.height = ch;
        var c = c2.getContext("2d"), img = c.createImageData(cw, ch);
        function hash(i, j) { var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); }
        function noise(x, y, per) {
            var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
            var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
            var a = hash(i % per, j % per), b = hash((i + 1) % per, j % per), cc = hash(i % per, (j + 1) % per), d = hash((i + 1) % per, (j + 1) % per);
            return a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy;
        }
        for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
            var v = 0, amp = 0.55, f = 4;
            for (var o = 0; o < 4; o++) { v += amp * noise(x / cw * f, y / ch * f * 0.62 + 0.0001, f); amp *= 0.5; f *= 2; }
            v = Math.max(0, (v - 0.42) * 2.4);
            var k = (y * cw + x) * 4;
            img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
            img.data[k + 3] = Math.min(255, v * 255);
        }
        c.putImageData(img, 0, 0);
        return c2;
    })();

    /* ── 静物层：岸、水面底色、石头 ─────────────────────── */
    function buildStatic() {
        staticLayer.width = cv.width; staticLayer.height = cv.height;
        var c = sctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = rgba(C.shore, 1); c.fillRect(0, 0, cv.width, cv.height);
        worldTf(c);
        // 岸外一圈淡淡的暮色光晕
        var halo = c.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 900);
        halo.addColorStop(0, rgba(C.waterB, 0.35)); halo.addColorStop(1, rgba(C.shore, 0));
        c.fillStyle = halo; c.fillRect(-600, -600, W + 1200, H + 1200);

        var R = 34;
        c.save();
        c.beginPath(); c.roundRect(0, 0, W, H, R); c.clip();
        var lv = scene.lv, sun = lv.sun || lv.goal;
        // 底色：远处（离夕照远）深、近处浅，再叠夕照的暖光
        var g = c.createLinearGradient(W - sun[0], H - sun[1], sun[0], sun[1]);
        g.addColorStop(0, rgba(C.waterA, 1)); g.addColorStop(1, rgba(C.waterB, 1));
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        var warm = c.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], 620);
        warm.addColorStop(0, rgba(C.sun, day ? 0.35 : 0.3)); warm.addColorStop(0.45, rgba(C.sun, day ? 0.1 : 0.08)); warm.addColorStop(1, rgba(C.sun, 0));
        c.fillStyle = warm; c.fillRect(0, 0, W, H);
        // 水流区域：底色略深，顺着流向
        (lv.flows || []).forEach(function (f) {
            c.fillStyle = day ? "rgba(40,80,130,0.08)" : "rgba(0,0,0,0.12)";
            c.beginPath(); c.roundRect(f[0], f[1], f[2], f[3], 30); c.fill();
        });
        // 漩涡：中心下陷的暗影
        (lv.pools || []).forEach(function (p) {
            var pg = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], p[2]);
            pg.addColorStop(0, day ? "rgba(20,40,70,0.55)" : "rgba(0,0,0,0.6)");
            pg.addColorStop(0.35, day ? "rgba(20,40,70,0.2)" : "rgba(0,0,0,0.25)");
            pg.addColorStop(1, "rgba(0,0,0,0)");
            c.fillStyle = pg; c.beginPath(); c.arc(p[0], p[1], p[2], 0, Math.PI * 2); c.fill();
        });
        // 岸边内阴影
        c.shadowColor = day ? "rgba(30,60,100,0.45)" : "rgba(0,0,0,0.75)";
        c.shadowBlur = 36 * s * dpr;
        c.beginPath(); c.rect(-400, -400, W + 800, H + 800); c.roundRect(0, 0, W, H, R);
        c.fillStyle = "#000"; c.fill("evenodd");
        c.restore();
        // 岸线
        c.lineWidth = 1.2 / s;
        c.strokeStyle = rgba(C.glow, day ? 0.5 : 0.18);
        c.beginPath(); c.roundRect(0, 0, W, H, R); c.stroke();
    }

    // 石头与荷叶画在涟漪之上（涟漪从它们底下过）
    function drawRocks(c) {
        var lv = scene.lv;
        (lv.rocks || []).forEach(function (o, i) {
            var x = o[0], y = o[1], r = o[2];
            var hit = scene.poke && scene.poke.kind === "rock" && scene.poke.i === i ? scene.poke.k : 0;
            c.save();
            c.translate(x + Math.sin(hit * 40) * hit * 3, y);
            // 水线：石头四周一圈浅浅的亮边
            c.strokeStyle = rgba(C.ringHi, day ? 0.35 : 0.12);
            c.lineWidth = 2;
            c.beginPath(); c.arc(0, 0, r + 5, 0, Math.PI * 2); c.stroke();
            var d = downVec(5);
            c.fillStyle = day ? "rgba(20,40,70,0.25)" : "rgba(0,0,0,0.45)";
            c.beginPath(); c.arc(d[0], d[1], r + 1, 0, Math.PI * 2); c.fill();
            // 不太圆的石头：用半径扰动的闭合曲线
            var seed = x * 0.37 + y * 0.11, n = 9;
            var pts = [];
            for (var k = 0; k < n; k++) {
                var a = k / n * Math.PI * 2, rr = r * (0.9 + 0.1 * Math.sin(seed + k * 2.3));
                pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
            }
            // 过各边中点的二次曲线：圆润但不正圆的卵石
            c.beginPath();
            for (k = 0; k <= n; k++) {
                var p0 = pts[k % n], p1 = pts[(k + 1) % n], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
                if (k === 0) c.moveTo(mx, my); else c.quadraticCurveTo(p0[0], p0[1], mx, my);
            }
            c.closePath();
            var lt = downVec(-r * 0.5);
            var rg = c.createRadialGradient(lt[0], lt[1], r * 0.1, 0, 0, r * 1.1);
            rg.addColorStop(0, rgba(C.rock.map(function (v) { return Math.min(255, v + 46); }), 1));
            rg.addColorStop(1, rgba(C.rock, 1));
            c.fillStyle = rg; c.fill();
            c.strokeStyle = day ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.07)";
            c.lineWidth = 1.2; c.stroke();
            c.restore();
        });
        (lv.pads || []).forEach(function (o, i) {
            var hit = scene.poke && scene.poke.kind === "pad" && scene.poke.i === i ? scene.poke.k : 0;
            var r = o[2] * (1 + Math.sin(hit * 18) * hit * 0.06);
            var rot = (o[0] * 0.013 + o[1] * 0.007) + Math.sin(scene.clock * 0.4 + i) * 0.04;
            c.save();
            c.translate(o[0], o[1]); c.rotate(rot);
            var d = downVec(4);
            c.fillStyle = day ? "rgba(20,50,40,0.22)" : "rgba(0,0,0,0.4)";
            c.beginPath(); c.arc(d[0], d[1], r, 0, Math.PI * 2); c.fill();
            // 荷叶：带一道缺口的圆
            c.beginPath();
            c.moveTo(0, 0); c.arc(0, 0, r, 0.18, Math.PI * 2 - 0.18); c.closePath();
            var pg = c.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
            pg.addColorStop(0, rgba(C.pad.map(function (v) { return Math.min(255, v + 40); }), 1));
            pg.addColorStop(1, rgba(C.pad, 1));
            c.fillStyle = pg; c.fill();
            c.strokeStyle = day ? "rgba(255,255,255,0.35)" : "rgba(200,255,220,0.12)";
            c.lineWidth = 1; c.stroke();
            c.strokeStyle = day ? "rgba(255,255,255,0.3)" : "rgba(200,255,220,0.1)";
            c.lineWidth = 0.8;
            c.beginPath();
            for (var k = 0; k < 9; k++) {
                var a = 0.5 + k / 9 * (Math.PI * 2 - 1);
                c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
            }
            c.stroke();
            c.restore();
        });
    }

    /* ── 场景 ─────────────────────────────────────────────── */
    // 标题画面的演示水面：没有终点，叶子被自动的涟漪推着慢慢漂
    var DEMO = { name: "", leaf: [380, 360, -0.3], goal: [-9999, -9999, 0], sun: [790, 200, 52], motes: [], par: 0 };
    var scene = {
        lv: DEMO, game: null, idx: -1, demo: true,
        clock: 0, acc: 0,
        trail: [], fx: [], sparks: [], flyers: [],
        flowDots: [], poke: null, bob: 0,
        fade: 1, ended: false, demoTimer: 1.2
    };

    function makeFlowDots(lv) {
        var dots = [];
        (lv.flows || []).forEach(function (f, fi) {
            var n = Math.round(f[2] * f[3] / 5200);
            for (var i = 0; i < n; i++) dots.push({ f: fi, x: f[0] + Math.random() * f[2], y: f[1] + Math.random() * f[3], life: Math.random() });
        });
        return dots;
    }

    function load(idx, demo) {
        var lv = demo ? DEMO : LEVELS[idx];
        scene.lv = lv; scene.idx = idx; scene.demo = !!demo;
        scene.game = new S.Game(lv);
        scene.trail = []; scene.fx = []; scene.sparks = []; scene.flyers = [];
        scene.flowDots = makeFlowDots(lv);
        scene.poke = null; scene.bob = 0; scene.ended = false; scene.acc = 0;
        scene.fade = 1;
        scene.fx.push({ x: lv.leaf[0], y: lv.leaf[1], t: 0, amp: 0.5 });     // 叶子落水
        buildStatic();
        if (!demo) {
            $("lv-no").textContent = "其" + NUM[idx];
            $("lv-name").textContent = lv.name;
            $("rip-par").textContent = lv.par;
            $("mote-all").textContent = lv.motes.length;
            updateStats();
            showHint(lv.hint, 7000);
            try { localStorage.setItem(KEY_LAST, String(idx)); } catch (e) {}
        }
    }

    /* ── 进度 ─────────────────────────────────────────────── */
    var KEY = "whatasiger_gizmo_yiye", KEY_LAST = "whatasiger_gizmo_yiye_last";
    var save = { best: {}, mute: false };
    try { var raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw && raw.best) save = raw; } catch (e) {}
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
    function marksOf(i) { var b = save.best[i]; return b ? [!!b.done, !!b.motes, !!b.par] : [false, false, false]; }
    function unlocked(i) { return i === 0 || marksOf(i - 1)[0]; }

    /* ── 声音（Web Audio 现合成：水滴、萤火的铃声、归来的和弦） ── */
    var ac = null, master = null, verb = null;
    var SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880];   // G 宫五声
    function audio() {
        if (save.mute) return null;
        if (!ac) {
            var A = window.AudioContext || window.webkitAudioContext;
            if (!A) return null;
            ac = new A();
            master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
            // 合成一段混响：衰减的噪声
            verb = ac.createConvolver();
            var len = ac.sampleRate * 2.2, ir = ac.createBuffer(2, len, ac.sampleRate);
            for (var ch = 0; ch < 2; ch++) {
                var d = ir.getChannelData(ch);
                for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
            }
            verb.buffer = ir;
            var wet = ac.createGain(); wet.gain.value = 0.32;
            verb.connect(wet); wet.connect(master);
        }
        if (ac.state === "suspended") ac.resume();
        return ac;
    }
    function voice(freq, t, dur, vol, type, glide) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type || "sine";
        o.frequency.setValueAtTime(freq * (glide || 1), t);
        if (glide) o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); g.connect(verb);
        o.start(t); o.stop(t + dur + 0.05);
    }
    var sfx = {
        drop: function (y) {
            if (!audio()) return;
            var t = ac.currentTime, n = SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.floor((1 - y / H) * SCALE.length)))];
            voice(n, t, 0.55, 0.22, "sine", 1.9);
            voice(n * 2, t, 0.18, 0.04, "sine", 1.6);
        },
        mote: function (k) {
            if (!audio()) return;
            var t = ac.currentTime, f = SCALE[Math.min(SCALE.length - 1, 2 + k * 2)] * 2;
            voice(f, t, 1.2, 0.07); voice(f * 2.76, t, 0.5, 0.02); voice(f * 5.4, t, 0.25, 0.008);
        },
        won: function () {
            if (!audio()) return;
            var t = ac.currentTime;
            [392, 493.88, 587.33, 783.99, 987.77].forEach(function (f, i) { voice(f, t + i * 0.09, 2.2, 0.08); voice(f / 2, t + i * 0.09, 1.6, 0.03, "triangle"); });
        },
        sunk: function () {
            if (!audio()) return;
            var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
            o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(60, t + 1.1);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
            o.connect(g); g.connect(master); g.connect(verb); o.start(t); o.stop(t + 1.3);
        },
        bump: function (v) {
            if (!audio()) return;
            voice(150 + Math.random() * 30, ac.currentTime, 0.18, Math.min(0.12, v / 1600), "triangle");
        },
        dull: function () {
            if (!audio()) return;
            voice(210, ac.currentTime, 0.12, 0.06, "triangle");
        }
    };
    function setMute(m) {
        save.mute = m; persist();
        var b = $("btn-sound");
        b.querySelector(".snd-on").style.display = m ? "none" : "";
        b.querySelector(".snd-off").style.display = m ? "" : "none";
        b.setAttribute("aria-label", m ? "声音：关" : "声音：开");
        if (m && ac) ac.suspend();
    }

    /* ── 输入 ─────────────────────────────────────────────── */
    function tapAt(px, py) {
        var w = toWorld(px, py), g = scene.game;
        if (!g || g.state !== "play") return;
        var blk = g.blockedAt(w[0], w[1]);
        if (blk) {
            if (blk.kind !== "shore") { scene.poke = { kind: blk.kind, i: blk.i, k: 1 }; sfx.dull(); }
            return;
        }
        g.tap(w[0], w[1]);
        splash(w[0], w[1], 1);
        sfx.drop(w[1]);
        if (scene.demo) { scene.demoTimer = Math.max(scene.demoTimer, 4); return; }   // 标题画面也能点水玩，自动涟漪让一让
        updateStats();
        hideHint();
    }
    cv.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault();
        tapAt(e.clientX, e.clientY);
    });
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    function splash(x, y, k) {
        for (var i = 0; i < 9; i++) {
            var a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 70) * k;
            scene.sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.3, r: 1.2 + Math.random() * 1.6, col: C.ringHi });
        }
    }

    /* ── 界面 ─────────────────────────────────────────────── */
    var hintTimer = 0;
    function showHint(text, ms) {
        var h = $("hint");
        h.textContent = text;
        h.classList.add("show");
        clearTimeout(hintTimer);
        if (ms) hintTimer = setTimeout(hideHint, ms);
    }
    function hideHint() { $("hint").classList.remove("show"); }

    var shown = "";
    function updateStats() {
        var g = scene.game, lv = scene.lv;
        if (!g || scene.demo) return;
        var n = g.got.filter(Boolean).length, key = g.used + "/" + n + "/" + lv.par;
        if (key === shown) return;      // 每帧都会调，只在数字变了时碰 DOM
        shown = key;
        $("rip-n").textContent = g.used;
        $("stat-rip").classList.toggle("over", g.used > lv.par);
        $("mote-n").textContent = n;
    }
    function pulse(id) {
        var el = $(id);
        el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    }

    var openLayer = "title";
    function open(id) {
        ["title", "picker", "result"].forEach(function (k) { $(k).classList.toggle("open", k === id); });
        openLayer = id;
        body.classList.toggle("at-title", id === "title");
        if (id) hideHint();
        var first = id && $(id).querySelector(id === "result" ? "#btn-next" : "button:not([disabled])");
        if (first && id !== "title") setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
    }

    function markSvg(on) {
        return '<svg viewBox="0 0 64 40" class="' + (on ? "mark-on" : "mark-off") + '"><use href="#leaf-mark"/></svg>';
    }
    function renderPicker() {
        var box = $("levels"), html = "", total = 0;
        LEVELS.forEach(function (lv, i) {
            var m = marksOf(i), ok = unlocked(i);
            total += m.filter(Boolean).length;
            html += '<button class="lv' + (i === scene.idx && !scene.demo ? " cur" : "") + '" data-i="' + i + '"' + (ok ? "" : " disabled") +
                ' aria-label="其' + NUM[i] + ' ' + lv.name + (ok ? "" : "（未解锁）") + '">' +
                "<small>其" + NUM[i] + "</small><b>" + lv.name + '</b><span class="marks">' + m.map(markSvg).join("") + "</span></button>";
        });
        box.innerHTML = html;
        $("mark-total").textContent = total;
    }
    $("levels").addEventListener("click", function (e) {
        var b = e.target.closest(".lv");
        if (!b || b.disabled) return;
        audio();
        open(null);
        load(+b.dataset.i);
    });

    function nextIdx() {
        for (var i = 0; i < LEVELS.length; i++) if (!marksOf(i)[0]) return i;
        var last = 0;
        try { last = +localStorage.getItem(KEY_LAST) || 0; } catch (e) {}
        return Math.min(LEVELS.length - 1, last);
    }

    $("btn-start").addEventListener("click", function () { audio(); open(null); load(nextIdx()); });
    $("btn-pick").addEventListener("click", function () { renderPicker(); open("picker"); });
    $("btn-levels").addEventListener("click", function () { renderPicker(); open("picker"); });
    $("btn-pick-close").addEventListener("click", function () { open(scene.demo ? "title" : null); });
    $("btn-restart").addEventListener("click", function () { if (!scene.demo) { open(null); load(scene.idx); } });
    $("btn-again").addEventListener("click", function () { open(null); load(scene.idx); });
    $("btn-next").addEventListener("click", function () {
        open(null);
        if (scene.idx + 1 < LEVELS.length) load(scene.idx + 1);
        else { load(0, true); open("title"); }
    });
    $("btn-sound").addEventListener("click", function () { setMute(!save.mute); if (!save.mute) sfx.drop(H * 0.3); });
    setMute(!!save.mute);

    document.addEventListener("keydown", function (e) {
        if (e.key === "r" || e.key === "R") { if (!scene.demo && openLayer !== "picker") { open(null); load(scene.idx); } }
        else if (e.key === "Escape") {
            if (openLayer === "picker") open(scene.demo ? "title" : null);
            else if (!openLayer || openLayer === "result") { renderPicker(); open("picker"); }
        }
    });

    function finish() {
        var g = scene.game, lv = scene.lv, i = scene.idx;
        var mOk = g.gotAll(), pOk = g.used <= lv.par;
        var b = save.best[i] || {};
        b.done = true; b.motes = b.motes || mOk; b.par = b.par || pOk;
        b.ripples = Math.min(b.ripples || 99, g.used);
        save.best[i] = b; persist();

        $("res-title").textContent = "其" + NUM[i] + " · " + lv.name;
        var all = LEVELS.every(function (_, k) { return marksOf(k)[0]; });
        $("res-sub").textContent = i === LEVELS.length - 1 && all ? "十汀皆归。谢谢你陪这片叶子漂了一程" : "叶子回到了夕照里";
        $("rm-0").classList.add("on");
        $("rm-1").classList.toggle("on", mOk);
        $("rm-2").classList.toggle("on", pOk);
        $("rm-1-v").textContent = g.got.filter(Boolean).length + " / " + g.got.length;
        $("rm-2-v").textContent = g.used + (pOk ? " ≤ " : " > ") + lv.par;
        $("btn-next").textContent = i + 1 < LEVELS.length ? "下一汀" : "回到开头";
        open("result");
    }

    /* ── 推进 ─────────────────────────────────────────────── */
    function handleEvents() {
        var g = scene.game, ev = g.events;
        g.events = [];
        ev.forEach(function (e) {
            if (e.type === "kick") scene.bob = Math.min(1, scene.bob + e.mag / 260);
            else if (e.type === "bump") { sfx.bump(e.v); splash(e.x, e.y, 0.5); }
            else if (e.type === "mote") {
                var m = scene.lv.motes[e.i];
                sfx.mote(e.n);
                for (var k = 0; k < 14; k++) {
                    var a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
                    scene.sparks.push({ x: m[0], y: m[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.5, r: 1.4 + Math.random() * 1.8, col: C.mote });
                }
                var sp = toScreen(m[0], m[1]);
                scene.flyers.push({ x: sp[0], y: sp[1], t: 0 });
            }
            else if (e.type === "won") {
                sfx.won();
                var gl = scene.lv.goal;
                scene.fx.push({ x: gl[0], y: gl[1], t: 0, amp: 1, warm: true });
                scene.fx.push({ x: gl[0], y: gl[1], t: -0.25, amp: 0.7, warm: true });
            }
            else if (e.type === "sunk") { sfx.sunk(); showHint("叶子卷进了漩涡……再来一次", 1600); }
        });
    }

    function update(dt) {
        scene.clock += dt;
        var g = scene.game;
        scene.acc += dt;
        while (scene.acc >= P.dt) { g.step(); scene.acc -= P.dt; }
        handleEvents();
        if (!scene.demo) updateStats();

        // 演示：每隔一阵在叶子靠水面边缘的那一侧点一下，把它往中间推
        if (scene.demo) {
            scene.demoTimer -= dt;
            if (scene.demoTimer <= 0) {
                scene.demoTimer = 2.2 + Math.random() * 2;
                var cx = W * 0.45 - g.x, cy = H * 0.55 - g.y, a = Math.atan2(cy, cx) + Math.PI + (Math.random() - 0.5) * 1.6;
                var r = 60 + Math.random() * 90, tx = g.x + Math.cos(a) * r, ty = g.y + Math.sin(a) * r;
                if (!g.blockedAt(tx, ty)) { g.tap(tx, ty); splash(tx, ty, 0.8); }
            }
        }

        // 结束：沉没后重来；归来后弹出结算
        if (!scene.ended && g.state !== "play") {
            if (g.state === "sunk" && g.t - g.endT > 1.4) { scene.ended = true; load(scene.idx); return; }
            if (g.state === "won" && g.t - g.endT > 1.25) { scene.ended = true; finish(); }
        }

        // 尾迹
        var last = scene.trail[scene.trail.length - 1];
        if (!last || Math.hypot(g.x - last.x, g.y - last.y) > 7) scene.trail.push({ x: g.x, y: g.y, t: scene.clock, sp: Math.hypot(g.vx, g.vy) });
        while (scene.trail.length && scene.clock - scene.trail[0].t > 1.6) scene.trail.shift();

        scene.bob *= Math.exp(-3 * dt);
        if (scene.poke) { scene.poke.k -= dt * 2.2; if (scene.poke.k <= 0) scene.poke = null; }
        scene.fade = Math.max(0, scene.fade - dt * 2.2);

        scene.fx.forEach(function (f) { f.t += dt; });
        scene.fx = scene.fx.filter(function (f) { return f.t < 1.6; });
        scene.sparks.forEach(function (p) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); });
        scene.sparks = scene.sparks.filter(function (p) { return p.life < p.max; });

        // 拾到的萤火飞向顶栏的计数
        if (scene.flyers.length) {
            var tgt = $("stat-mote").getBoundingClientRect();
            scene.flyTarget = [tgt.left + 20, tgt.top + tgt.height / 2];
        }
        scene.flyers.forEach(function (f) {
            f.t += dt;
            if (f.t >= 0.75 && !f.done) { f.done = true; pulse("stat-mote"); }
        });
        scene.flyers = scene.flyers.filter(function (f) { return f.t < 0.8; });

        // 水流里的光点
        var lv = scene.lv;
        scene.flowDots.forEach(function (d) {
            var f = lv.flows[d.f], k = 0.75;
            d.x += f[4] * k * dt; d.y += f[5] * k * dt; d.life += dt * 0.5;
            if (d.x < f[0]) d.x += f[2]; if (d.x > f[0] + f[2]) d.x -= f[2];
            if (d.y < f[1]) d.y += f[3]; if (d.y > f[1] + f[3]) d.y -= f[3];
            if (d.life > 1) d.life -= 1;
        });
    }

    /* ── 绘制 ─────────────────────────────────────────────── */
    // 石头背后的涟漪缺口：返回 [起, 止] 角度区间（只对半径超过石头距离的圈生效）
    function shadowArcs(rp) {
        if (rp.arcs) return rp.arcs;
        var arcs = [];
        (scene.lv.rocks || []).forEach(function (o) {
            var dx = o[0] - rp.x, dy = o[1] - rp.y, D = Math.hypot(dx, dy);
            if (D <= o[2]) return;
            var half = Math.asin(o[2] / D), a = Math.atan2(dy, dx);
            arcs.push({ a0: a - half, a1: a + half, D: Math.sqrt(D * D - o[2] * o[2]) });
        });
        return (rp.arcs = arcs);
    }
    function ringPath(c, rp, r) {
        var cuts = shadowArcs(rp).filter(function (q) { return r > q.D; });
        if (!cuts.length) { c.moveTo(rp.x + r, rp.y); c.arc(rp.x, rp.y, r, 0, Math.PI * 2); return; }
        // 以第一个缺口的止端为起点，把其余缺口按角度排好，依次画开放的弧
        var base = cuts[0].a1, TAU = Math.PI * 2;
        var segs = cuts.map(function (q) {
            var s0 = ((q.a0 - base) % TAU + TAU) % TAU, len = q.a1 - q.a0;
            return [s0, s0 + len];
        }).sort(function (a, b) { return a[0] - b[0]; });
        var cur = 0;
        segs.forEach(function (sg) {
            if (sg[0] > cur) { c.moveTo(rp.x + Math.cos(base + cur) * r, rp.y + Math.sin(base + cur) * r); c.arc(rp.x, rp.y, r, base + cur, base + sg[0]); }
            cur = Math.max(cur, sg[1]);
        });
        if (cur < TAU) { c.moveTo(rp.x + Math.cos(base + cur) * r, rp.y + Math.sin(base + cur) * r); c.arc(rp.x, rp.y, r, base + cur, base + TAU); }
    }
    function drawRipple(c, rp, r, amp, warm) {
        var reach = P.reach;
        for (var k = 0; k < 3; k++) {
            var rr = r - k * 13;
            if (rr <= 1) continue;
            var a = amp * Math.pow(Math.max(0, 1 - rr / reach), 1.3) * (1 - k * 0.3);
            if (a <= 0.005) continue;
            c.beginPath(); ringPath(c, rp, rr + 2.5);
            c.strokeStyle = rgba(C.ringLo, a * (day ? 0.25 : 0.55)); c.lineWidth = 3; c.stroke();
            c.beginPath(); ringPath(c, rp, rr);
            c.strokeStyle = rgba(warm ? C.sunPale : C.ringHi, a * (day ? 0.8 : 0.5)); c.lineWidth = 1.6; c.stroke();
        }
    }

    function draw() {
        var c = ctx, g = scene.game, lv = scene.lv, t = scene.clock;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(staticLayer, 0, 0);
        worldTf(c);
        c.save();
        c.beginPath(); c.roundRect(0, 0, W, H, 34); c.clip();

        // 云影
        var drift = reduce ? 0 : (t * 9) % W;
        c.globalAlpha = day ? 0.16 : 0.05;
        c.drawImage(cloud, -drift, 0, W, H); c.drawImage(cloud, W - drift, 0, W, H);
        c.globalAlpha = 1;

        // 夕照倒影
        var sun = lv.sun || lv.goal, sr = sun[2];
        var lit = g.state === "won" ? Math.min(1, (g.t - g.endT) / 0.6) : (g.gotAll() && !scene.demo ? 0.35 : 0);
        var breathe = 1 + Math.sin(t * 1.3) * 0.05;
        glow(c, sun[0], sun[1], sr * (3.2 + lit * 1.2) * breathe, C.sun, (day ? 0.55 : 0.45) + lit * 0.3);
        glow(c, sun[0], sun[1], sr * 1.5, C.sunPale, 0.65 + lit * 0.3);
        c.save();
        c.translate(sun[0], sun[1]);
        var sg = c.createRadialGradient(0, 0, 0, 0, 0, sr);
        sg.addColorStop(0, "rgba(255,248,230,0.95)"); sg.addColorStop(0.55, rgba(C.sunPale, 0.75)); sg.addColorStop(1, rgba(C.sun, 0));
        c.fillStyle = sg; c.beginPath(); c.arc(0, 0, sr, 0, Math.PI * 2); c.fill();
        c.restore();
        // 倒影的碎光：屏幕上横向的细线，随时间闪动
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        var sp = toScreen(sun[0], sun[1]), srs = sr * s * dpr;
        for (var k = 0; k < 9; k++) {
            var ph = t * (0.7 + k * 0.13) + k * 1.7;
            var yy = (k - 4) * srs * 0.24 + Math.sin(ph * 1.3) * 2 * dpr;
            var ww = srs * (1.5 - Math.abs(k - 4) * 0.22) * (0.75 + 0.25 * Math.sin(ph));
            var xx = Math.sin(ph * 0.7) * srs * 0.15;
            c.fillStyle = rgba(C.sunPale, (0.22 + 0.18 * Math.sin(ph * 2.1)) * (1 + lit));
            c.beginPath(); c.ellipse(sp[0] * dpr + xx, sp[1] * dpr + yy, Math.max(1, ww), Math.max(0.6, 1.2 * dpr), 0, 0, Math.PI * 2); c.fill();
        }
        c.restore();

        // 水流光点
        scene.flowDots.forEach(function (d) {
            var f = lv.flows[d.f], ang = Math.atan2(f[5], f[4]), L = 16;
            var edge = Math.min(d.x - f[0], f[0] + f[2] - d.x, d.y - f[1], f[1] + f[3] - d.y);
            var a = Math.sin(d.life * Math.PI) * Math.min(1, edge / 30) * (day ? 0.55 : 0.32);
            if (a <= 0) return;
            c.strokeStyle = rgba(C.ringHi, a); c.lineWidth = 1.4; c.lineCap = "round";
            c.beginPath(); c.moveTo(d.x - Math.cos(ang) * L, d.y - Math.sin(ang) * L); c.lineTo(d.x, d.y); c.stroke();
        });

        // 漩涡：四条旋臂（与 sim.js 的切向力同向转动）
        (lv.pools || []).forEach(function (p) {
            for (var arm = 0; arm < 4; arm++) {
                c.beginPath();
                for (var q = 0; q <= 40; q++) {
                    var u = q / 40, rr = p[2] * (1 - u) + 8 * u;
                    var a = arm * Math.PI / 2 - t * 1.6 + u * 4.2;
                    var px = p[0] + Math.cos(a) * rr, py = p[1] + Math.sin(a) * rr;
                    if (q === 0) c.moveTo(px, py); else c.lineTo(px, py);
                }
                c.strokeStyle = rgba(C.ringHi, day ? 0.3 : 0.12); c.lineWidth = 2; c.stroke();
            }
            c.fillStyle = day ? "rgba(20,40,70,0.4)" : "rgba(0,0,0,0.5)";
            c.beginPath(); c.arc(p[0], p[1], P.sinkR * 0.8, 0, Math.PI * 2); c.fill();
        });

        // 涟漪（玩家的 + 纯装饰的）
        g.ripples.forEach(function (rp) { drawRipple(c, rp, rp.r, 1); });
        scene.fx.forEach(function (f) {
            if (f.t <= 0) return;
            drawRipple(c, f, P.speed * 0.7 * f.t, f.amp * (1 - f.t / 1.6), f.warm);
        });

        drawRocks(c);

        // 萤火
        (lv.motes || []).forEach(function (m, i) {
            if (g.got[i]) return;
            var mx = m[0] + Math.sin(t * 1.3 + i * 2) * 5, my = m[1] + Math.cos(t * 1.7 + i) * 5;
            var fl = 0.75 + 0.25 * Math.sin(t * 5 + i * 3);
            glow(c, mx, my, 56, C.mote, (day ? 0.5 : 0.32) * fl);
            glow(c, mx, my, 16, C.mote, 0.85);
            c.strokeStyle = rgba(C.mote, (day ? 0.7 : 0.35) * fl); c.lineWidth = 1.2;
            c.beginPath(); c.arc(mx, my, 13 + 3 * Math.sin(t * 2 + i), 0, Math.PI * 2); c.stroke();
            glow(c, mx, my, 7, [255, 252, 240], 1);
        });

        // 尾迹：两道向后张开的细线
        var tr = scene.trail;
        c.lineCap = "round";
        for (var i = 1; i < tr.length; i++) {
            var p0 = tr[i - 1], p1 = tr[i], age = t - p1.t;
            var a = (1 - age / 1.6) * Math.min(1, p1.sp / 80) * (day ? 0.4 : 0.2);
            if (a <= 0.01) continue;
            var dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
            var spread = 7 + age * 14, spread0 = 7 + (t - p0.t) * 14;
            c.strokeStyle = rgba(C.ringHi, a); c.lineWidth = 1.2;
            c.beginPath();
            c.moveTo(p0.x + nx * spread0, p0.y + ny * spread0); c.lineTo(p1.x + nx * spread, p1.y + ny * spread);
            c.moveTo(p0.x - nx * spread0, p0.y - ny * spread0); c.lineTo(p1.x - nx * spread, p1.y - ny * spread);
            c.stroke();
        }

        // 叶子
        var sc = 1 + scene.bob * 0.1, alpha = 1;
        if (g.state === "sunk") { var k2 = Math.min(1, (g.t - g.endT) / 1.2); sc *= 1 - k2 * 0.8; alpha = 1 - k2; }
        if (g.state === "won") sc *= 1 - Math.min(1, (g.t - g.endT) / 1.2) * 0.25;
        if (scene.fade > 0) { sc *= 1 + scene.fade * 0.25; alpha *= 1 - scene.fade; }
        drawLeaf(c, g.x, g.y, g.th, sc, alpha);

        // 火花
        scene.sparks.forEach(function (p) {
            var a = 1 - p.life / p.max;
            c.fillStyle = rgba(p.col, a * 0.85);
            c.beginPath(); c.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2); c.fill();
        });
        c.restore();

        // 飞向顶栏的萤火（屏幕坐标）
        if (scene.flyers.length) {
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            var ft = scene.flyTarget;
            scene.flyers.forEach(function (f) {
                var u = Math.min(1, f.t / 0.75), e = 1 - Math.pow(1 - u, 3);
                var x = f.x + (ft[0] - f.x) * e, y = f.y + (ft[1] - f.y) * e - Math.sin(u * Math.PI) * 60;
                glow(c, x, y, 18, C.mote, 0.6 * (1 - u * 0.4));
                glow(c, x, y, 5, [255, 250, 230], 1);
            });
        }
    }

    function drawLeaf(c, x, y, th, sc, alpha) {
        if (!leafSprite || alpha <= 0) return;
        var k = 1 / (s * dpr);                 // 设备像素 → 世界单位
        c.save();
        c.globalAlpha = alpha;
        var d = downVec(6 + scene.bob * 6);
        c.translate(x + d[0], y + d[1]); c.rotate(th); c.scale(sc * k, sc * k);
        c.drawImage(leafShadow, -leafShadow.pad - 33 * leafSprite.px, -leafShadow.pad - 20 * leafSprite.px);
        c.restore();
        c.save();
        c.globalAlpha = alpha;
        c.translate(x, y); c.rotate(th); c.scale(sc * k, sc * k);
        c.drawImage(leafSprite, -leafSprite.pad - 33 * leafSprite.px, -leafSprite.pad - 20 * leafSprite.px);
        c.restore();
    }

    /* ── 主循环 ───────────────────────────────────────────── */
    var lastT = 0;
    function frame(now) {
        var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
        lastT = now;
        if (openLayer !== "result" && openLayer !== "picker") update(dt);
        else scene.clock += dt;           // 浮层打开时水面定格，只让光继续呼吸
        draw();
        requestAnimationFrame(frame);
    }

    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
        };
    }

    load(0, true);
    layout();
    var rt = 0;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layout, 80); });
    requestAnimationFrame(frame);
})();
