/* 跨页面过渡的形变只走合成线程：说明见 layout/_partial/vt-flip.ejs */
window.vtFlip = (function () {
    var root = document.documentElement;

    function bezier(x1, y1, x2, y2) {
        function at(a, b, t) { return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t; }
        return function (x) {
            if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
            var lo = 0, hi = 1, t = x;
            for (var i = 0; i < 24; i++) {
                var d = at(x1, x2, t) - x;
                if (Math.abs(d) < 1e-6) break;
                if (d > 0) hi = t; else lo = t;
                t = (lo + hi) / 2;
            }
            return at(y1, y2, t);
        };
    }
    // linear(0, 0.2 10%, …)：按规范补齐缺省的位置后分段线性
    function linearFn(body) {
        var pts = [];
        body.split(',').forEach(function (part) {
            var tok = part.trim().split(/\s+/);
            var v = parseFloat(tok[0]);
            if (tok.length === 1) pts.push({ v: v, x: null });
            for (var k = 1; k < tok.length; k++) pts.push({ v: v, x: parseFloat(tok[k]) / 100 });
        });
        if (pts.length < 2) return null;
        if (pts[0].x === null) pts[0].x = 0;
        if (pts[pts.length - 1].x === null) pts[pts.length - 1].x = Math.max(1, pts[pts.length - 2].x || 0);
        var max = 0;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].x !== null) { pts[i].x = Math.max(pts[i].x, max); max = pts[i].x; continue; }
            var j = i;
            while (pts[j].x === null) j++;
            for (var k2 = i; k2 < j; k2++) pts[k2].x = pts[i - 1].x + (pts[j].x - pts[i - 1].x) * (k2 - i + 1) / (j - i + 1);
            i = j - 1;
        }
        return function (x) {
            if (x <= pts[0].x) return pts[0].v;
            for (var i = 1; i < pts.length; i++) {
                if (x > pts[i].x) continue;
                var a = pts[i - 1], b = pts[i];
                return b.x === a.x ? b.v : a.v + (b.v - a.v) * (x - a.x) / (b.x - a.x);
            }
            return pts[pts.length - 1].v;
        };
    }
    var NAMED = { linear: [0, 0, 1, 1], ease: [.25, .1, .25, 1], 'ease-in': [.42, 0, 1, 1], 'ease-out': [0, 0, .58, 1], 'ease-in-out': [.42, 0, .58, 1] };
    function easing(s) {
        s = String(s || '').trim();
        if (NAMED[s]) return bezier.apply(null, NAMED[s]);
        var m = s.match(/^cubic-bezier\(([^)]+)\)$/);
        if (m) return bezier.apply(null, m[1].split(',').map(parseFloat));
        m = s.match(/^linear\((.+)\)$/);
        return m ? linearFn(m[1]) : null;
    }

    function find(pseudo) {
        var list = document.getAnimations();
        for (var i = 0; i < list.length; i++) {
            var ef = list[i].effect;
            if (ef && ef.target === root && ef.pseudoElement === pseudo) return list[i];
        }
        return null;
    }
    // 组在屏幕上的矩形：盒子 w×h 经 transform（绕变换原点）投影后的外接矩形
    function rectOf(transform, w, h, fx, fy) {
        var m = new DOMMatrix(transform && transform !== 'none' ? transform : undefined);
        var ox = fx * w, oy = fy * h;
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (c) {
            var p = m.transformPoint(new DOMPoint(c[0] - ox, c[1] - oy));
            var x = p.x / p.w + ox, y = p.y / p.w + oy;
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        });
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    // 变换原点占盒子的比例（计算值已换成 px，按同一时刻的宽高折回比例）
    function originFrac(cs) {
        var o = cs.transformOrigin.split(' ').map(parseFloat);
        var w = parseFloat(cs.width), h = parseFloat(cs.height);
        return [w ? o[0] / w : .5, h ? o[1] / h : .5];
    }
    function cover(w, h, a) { return w / h > a ? [w, w / a] : [h * a, h]; }
    function px(n) { return Math.round(n * 1000) / 1000; }

    // 准备一个组：读出起点、终点、缓动、时长等不变量，返回 build(终点矩形, 终点宽, 终点高) → 一组动画，读不到数据时返回 null
    function prepare(name, spec) {
        var gp = '::view-transition-group(' + name + ')';
        var group = find(gp);
        if (!group) return null;
        var kf = group.effect.getKeyframes();
        var from = kf[0], to = kf[kf.length - 1];
        if (kf.length !== 2 || !from.width || !to.width || from.transform === undefined) return null;
        var ease = easing(from.easing);
        if (!ease) return null;
        var gf = originFrac(getComputedStyle(root, gp));
        var w0 = parseFloat(from.width), h0 = parseFloat(from.height);
        var W = parseFloat(to.width), H = parseFloat(to.height);
        if (!(w0 > 0 && h0 > 0 && W > 0 && H > 0)) return null;
        var A = rectOf(from.transform, w0, h0, gf[0], gf[1]);
        var Z = rectOf(to.transform, W, H, gf[0], gf[1]);
        var timing = group.effect.getTiming();
        var dur = +timing.duration;
        if (!(dur > 0)) return null;
        var n = Math.max(12, Math.ceil(dur / 11));
        var opts = { duration: dur, delay: +timing.delay || 0, fill: 'both' };
        var eases = [];
        for (var i = 0; i <= n; i++) eases.push(ease(i / n));

        // 快照：只需记下模式与变换原点占盒子的比例，盒子尺寸随终点尺寸推出（auto 宽同组、高按比例；cover 铺满组）
        var sides = [];
        ['old', 'new'].forEach(function (side) {
            var mode = spec[side];
            if (mode !== 'auto' && mode !== 'cover') return;
            var ip = '::view-transition-' + side + '(' + name + ')';
            var ics = getComputedStyle(root, ip);
            if (ics.display === 'none') return;
            sides.push({ ip: ip, mode: mode, side: side, f: originFrac(ics) });
        });

        // 圆角：CSS 写在 image-pair 上（屏幕上的半径），改成按组的缩放分别折算的椭圆半径
        var pp = '::view-transition-image-pair(' + name + ')';
        var pair = null, radii = null;
        if (spec.radius) {
            pair = find(pp);
            var pt = pair && pair.effect.getTiming();
            var pe = pair && easing(pair.effect.getKeyframes()[0].easing);
            if (pair && pe && +pt.duration === dur && (+pt.delay || 0) === opts.delay) {
                radii = [];
                for (var j = 0; j <= n; j++) radii.push(spec.radius * (1 - pe(j / n)));
            } else {
                pair = null;
            }
        }

        // 逐帧：组在屏幕上的矩形
        function track(Z) {
            return eases.map(function (p) {
                return {
                    x: A.x + (Z.x - A.x) * p, y: A.y + (Z.y - A.y) * p,
                    w: Math.max(A.w + (Z.w - A.w) * p, .01), h: Math.max(A.h + (Z.h - A.h) * p, .01)
                };
            });
        }

        function build(Z, W, H) {
            // 由组的矩形得组的缩放与各快照的反向缩放
            var frames = track(Z).map(function (b) {
                b.sx = b.w / W;
                b.sy = b.h / H;
                return b;
            });
            var gox = gf[0] * W, goy = gf[1] * H;
            var list = [[gp, frames.map(function (b, i) {
                // 盒子左上角落到 (b.x, b.y)：绕原点缩放后再平移
                return {
                    offset: i / n,
                    transform: 'matrix(' + px(b.sx) + ',0,0,' + px(b.sy) + ',' + px(b.x - gox + b.sx * gox) + ',' + px(b.y - goy + b.sy * goy) + ')'
                };
            })]];
            sides.forEach(function (sd) {
                var aspect = sd.side === 'old' ? w0 / h0 : W / H;
                var iw = W, ih = sd.mode === 'auto' ? W / aspect : H;
                var ox = sd.f[0] * iw, oy = sd.f[1] * ih;
                var local = cover(iw, ih, aspect);
                list.push([sd.ip, frames.map(function (b, i) {
                    var kx, ky, tx, ty;
                    if (sd.mode === 'auto') {
                        // 宽度随组、高度按快照比例：纵向补偿 sx / sy，顶端不动
                        kx = 1; ky = b.sx / b.sy;
                        tx = 0; ty = ky * oy - oy;
                    } else {
                        // 屏幕上应有的裁切铺满尺寸 ÷ 盒子里实际铺满尺寸 ÷ 组的缩放；以盒子中心为不动点
                        var c = cover(b.w, b.h, aspect);
                        kx = c[0] / (local[0] * b.sx); ky = c[1] / (local[1] * b.sy);
                        tx = (kx - 1) * (ox - iw / 2); ty = (ky - 1) * (oy - ih / 2);
                    }
                    return { offset: i / n, transform: 'matrix(' + px(kx) + ',0,0,' + px(ky) + ',' + px(tx) + ',' + px(ty) + ')' };
                })]);
            });
            if (radii) {
                list.push([pp, frames.map(function (b, i) {
                    return { offset: i / n, borderRadius: px(radii[i] / b.sx) + 'px / ' + px(radii[i] / b.sy) + 'px' };
                })]);
            }
            return list.map(function (a) {
                return root.animate(a[1], { duration: opts.duration, delay: opts.delay, fill: opts.fill, pseudoElement: a[0] });
            });
        }

        return { group: group, pair: pair, build: build, track: track, A: A, Z: Z, W: W, H: H, opts: opts };
    }

    // 换上：原有的组动画（及圆角动画）取消，换成新建的动画，与快照的动画同一刻创建、同步起跑
    // 不用 setKeyframes 原地改：合成动画在等合成线程启动的那几帧里，浏览器会沿用改之前取样的样式，
    // 组的盒子停在旧尺寸上，与已生效的快照动画错位
    function flip(name, spec, done) {
        var g = prepare(name, spec);
        if (!g) return null;
        done[name] = g;
        var anims = g.build(g.Z, g.W, g.H);
        g.group.cancel();
        if (g.pair) g.pair.cancel();
        var visual = typeof spec.el === 'function';
        var measure = visual ? spec.el : (function (el) {
            return el && function () { return el.getBoundingClientRect(); };
        })(spec.el && document.querySelector(spec.el));
        var r0 = measure && measure();
        if (!r0) return null;
        // 函数终点：以带名元素此刻的盒子为基准，第一帧检查时就会按差值校正到函数给的矩形（如已吸顶、振幅缩小）
        // 基准必须与 measure() 同一坐标系（布局视口，getBoundingClientRect）。不能拿 g.Z：它是浏览器给的组矩形，
        // 坐标原点是 snapshot containing block——手机 Chrome 顶部地址栏露出时，它比布局视口高出地址栏那一截，
        // 拿两者相减会把终点整体上移约 56px（载波落到大标题上；电脑上没有可伸缩的地址栏，模拟手机尺寸也复现不了）
        if (visual) {
            var boxEl = spec.box && document.querySelector(spec.box);
            r0 = boxEl ? boxEl.getBoundingClientRect() : { left: g.Z.x, top: g.Z.y, width: g.Z.w, height: g.Z.h };
        }
        // 逐帧检查：元素动了就把终点平移 / 改尺寸，按原规则重建动画并接上当前进度
        return function () {
            var r = measure();
            if (!r) return;
            var dx = r.left - r0.left, dy = r.top - r0.top, dw = r.width - r0.width, dh = r.height - r0.height;
            if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(dw) < .5 && Math.abs(dh) < .5) return;
            r0 = r;
            if (visual) {
                g.Z = { x: g.Z.x + dx, y: g.Z.y + dy, w: Math.max(g.Z.w + dw, .01), h: Math.max(g.Z.h + dh, .01) };
            } else {
                g.W = Math.max(g.W + dw, .01);
                g.H = Math.max(g.H + dh, .01);
                g.Z = { x: g.Z.x + dx, y: g.Z.y + dy, w: g.W, h: g.H };
            }
            // 接上进度：沿用旧动画的起点时刻，不用 currentTime——新动画等合成线程启动的那几帧会停在原处，
            // 元素连续几帧都在动时一次次重建，就会被越拖越慢
            var start = anims[0].startTime, t = anims[0].currentTime;
            var next = g.build(g.Z, g.W, g.H);
            next.forEach(function (a) {
                if (start !== null) a.startTime = start;
                else a.currentTime = t;
            });
            anims.forEach(function (a) { a.cancel(); });
            anims = next;
        };
    }

    // 跟随：只有旧页一侧的组（没有对应的新元素，浏览器让它原地不动）沿着另一个组的轨迹一起走，用同样的时长与缓动
    //   box     —— 跟着组的盒子一起非等比伸缩（投影、细边这类贴着盒子边缘的层）
    //   content —— 中心跟着盒子走，按盒子较小一向的倍数等比缩放（卡片上的文字：不被拉扁，也不冲出盒子）
    // 只按领头组起跑时的终点算一次：领头的应是不会移动的组（如铺满视口的封面）
    function follow(name, spec, g) {
        var gp = '::view-transition-group(' + name + ')';
        var cs = getComputedStyle(root, gp);
        var w = parseFloat(cs.width), h = parseFloat(cs.height);
        if (!g || !(w > 0 && h > 0)) return;
        var gf = originFrac(cs);
        var F = rectOf(cs.transform, w, h, gf[0], gf[1]);
        var A = g.A;
        var frames = g.track(g.Z);
        var gox = gf[0] * w, goy = gf[1] * h;
        root.animate(frames.map(function (b, i) {
            var r;
            var kx = b.w / A.w, ky = b.h / A.h;
            if (spec.how === 'content') {
                var k = Math.min(kx, ky);
                r = { w: F.w * k, h: F.h * k };
                r.x = b.x + (F.x + F.w / 2 - A.x) * kx - r.w / 2;
                r.y = b.y + (F.y + F.h / 2 - A.y) * ky - r.h / 2;
            } else {
                r = { x: b.x + (F.x - A.x) * kx, y: b.y + (F.y - A.y) * ky, w: F.w * kx, h: F.h * ky };
            }
            var sx = r.w / w, sy = r.h / h;
            return {
                offset: i / (frames.length - 1),
                transform: 'matrix(' + px(sx) + ',0,0,' + px(sy) + ',' + px(r.x - gox + sx * gox) + ',' + px(r.y - goy + sy * goy) + ')'
            };
        }), { duration: g.opts.duration, delay: g.opts.delay, fill: 'both', pseudoElement: gp });
    }

    return function (vt, specs) {
        if (!vt || !window.DOMMatrix || !document.getAnimations) return;
        vt.ready.then(function () {
            var checks = [], done = {}, name;
            for (name in specs) {
                if (specs[name].follow) continue;
                try {
                    var check = flip(name, specs[name], done);
                    if (check) checks.push(check);
                } catch (err) {}
            }
            for (name in specs) {
                if (!specs[name].follow) continue;
                try { follow(name, specs[name], done[specs[name].follow]); } catch (err) {}
            }
            if (!checks.length) return;
            // 过渡期间每帧量一次带名元素的位置（只读布局，本就要排版），结束即停
            var done = false;
            vt.finished.finally(function () { done = true; });
            (function tick() {
                if (done) return;
                checks.forEach(function (c) { try { c(); } catch (err) {} });
                requestAnimationFrame(tick);
            })();
        }, function () {});
    };
})();
