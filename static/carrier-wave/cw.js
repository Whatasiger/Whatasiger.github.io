/* ----
# CARRiER WAVE. 载波
# 目录页：一条纯载波，悬停曲目时被调制；未接收的篇目只留下一次失真。
#         偶尔有一束信号沿载波驶过；载波上不时脱落几粒残响，飘散进 limbo。
# 阅读页：顶部载波兼作进度，已读部分携带信号，未读部分只是载波；停下来读的时候它也放缓。
#         标题附近偶尔飘过一两粒残响。
---- */

(function () {
    'use strict';

    var root = document.documentElement;
    var body = document.body;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TAU = Math.PI * 2;
    var INK = [228, 228, 224];
    var FAINT = [98, 101, 109];

    /* ---------- 工具 ---------- */

    function Spring(value, stiffness, damping) {
        this.x = value;
        this.v = 0;
        this.target = value;
        this.k = stiffness;
        this.c = damping;
    }
    Spring.prototype.step = function (dt) {
        if (reduceMotion) {
            this.x = this.target;
            this.v = 0;
            return this.x;
        }
        var n = Math.max(1, Math.ceil(dt * 240));
        var h = dt / n;
        for (var i = 0; i < n; i++) {
            var a = -this.k * (this.x - this.target) - this.c * this.v;
            this.v += a * h;
            this.x += this.v * h;
        }
        return this.x;
    };

    function hexToRgb(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : INK.slice();
    }
    function mix(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function hash(n) {
        var s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    /* ---------- 载波 ---------- */

    function Carrier(canvas, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.opts = opts;

        this.amp = new Spring(root.classList.contains('cw-from-home') ? 1 : 0, 60, 9);
        this.amp.target = 1;
        this.mod = new Spring(opts.mod || 0, 150, 15);
        this.loss = new Spring(0, 220, 22);
        this.envLen = new Spring(opts.envLen || 420, 70, 14);
        this.pull = new Spring(0, 130, 7);
        this.progress = new Spring(0, 140, 17);
        // 自己的时钟：rate 放缓时载波整体变慢，相位连续，不会跳
        this.rate = new Spring(1, 30, 11);
        this.time = 0;
        this.pulses = [];
        this.motes = [];
        this.moteDebt = 0;

        var c = hexToRgb(opts.tint);
        this.color = [new Spring(INK[0], 90, 19), new Spring(INK[1], 90, 19), new Spring(INK[2], 90, 19)];
        this.alpha = new Spring(opts.alpha || .5, 90, 19);
        this.signal = mix(c, INK, .32);
        // 指定了载波色：亮色直接作信号色；暗色（如 limbo. 的黑）整条载波用它，进度点只照亮附近一段
        var w = opts.wave ? hexToRgb(opts.wave) : null;
        this.dark = w && (w[0] * .2126 + w[1] * .7152 + w[2] * .0722) < 50 ? w : null;
        if (w && !this.dark) this.signal = w;

        this.pointer = { x: -9999, y: -9999, inside: false };
        this.baseY = 0;
        // band：画布只是一条随载波上下移动的窄带（高度由 CSS 定），不铺满视口，每帧重绘与合成的面积小得多
        this.band = !!opts.band;
        this.top = null;
        // hold：定格时只画一帧，之后不再重绘（画布不变，跨页面过渡也就不必每帧重新截取它）
        this.hold = false;
        this.held = false;
        this.resize();
    }

    Carrier.prototype.resize = function () {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var rect = this.canvas.getBoundingClientRect();
        this.dpr = dpr;
        this.w = rect.width;
        this.h = rect.height;
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.held = false;
    };

    Carrier.prototype.tune = function (tint, seed, wave, flat) {
        var c = wave ? hexToRgb(wave) : mix(hexToRgb(tint), INK, .3);
        for (var i = 0; i < 3; i++) this.color[i].target = c[i];
        this.alpha.target = .78;
        // flat：载波被拉直，不复存在
        this.amp.target = flat ? 0 : 1;
        this.mod.target = flat ? 0 : 1;
        this.envLen.target = 260 + hash(seed) * 320;
    };

    Carrier.prototype.release = function () {
        for (var i = 0; i < 3; i++) this.color[i].target = INK[i];
        this.alpha.target = this.opts.alpha || .5;
        this.amp.target = 1;
        this.mod.target = 0;
        this.loss.target = 0;
    };

    // 某条线在 xx 处的高度：载波 + 包络调制 + 指针牵引 + 驶过的信号
    Carrier.prototype.yAt = function (t, xx, s) {
        var o = this.opts;
        var k = TAU / o.wavelength;
        var ke = TAU / this.envLen.x;
        var amp = this.amp.x * o.amplitude * s.scale * this.scale;
        var env = s.modulated
            ? .5 + .5 * (.62 * Math.sin(ke * xx - t * .9 + s.phase) + .38 * Math.sin(ke * 1.73 * xx + t * .55 + 1.7))
            : 0;
        var a = amp * (1 + this.mod.x * s.gain * env * 3.4);
        var y = this.baseY + s.offset + a * Math.sin(k * xx - t * o.speed + s.phase);
        if (this.pull.x) {
            var dx = (xx - this.pointer.x) / 120;
            y += this.pull.x * Math.exp(-dx * dx) * s.scale;
        }
        // 信号的起伏随载波振幅收放：载波被拉直（flat）时，驶过的只剩那粒亮点
        var carry = clamp(this.amp.x, 0, 1);
        for (var i = 0; i < this.pulses.length && carry > .001; i++) {
            var p = this.pulses[i];
            var d = (xx - p.cx) / p.width;
            if (d > -3 && d < 3) y += carry * p.amp * p.fade * s.scale * this.scale * Math.exp(-d * d) * Math.sin(d * 5.2 + s.phase * .6);
        }
        return y;
    };

    Carrier.prototype.strokeStrand = function (t, s) {
        var ctx = this.ctx;
        var w = this.w;
        var loss = this.loss.x;
        var from = s.from || 0;
        var to = s.to == null ? w : s.to;
        var step = 3;
        var drawing = false;
        var seg = -1;
        var gate = true;
        var lossTick = Math.floor(t * 14);

        ctx.beginPath();
        for (var x = from; x <= to + step; x += step) {
            var xx = Math.min(x, to);

            if (loss > .01) {
                var si = Math.floor(xx / 22);
                if (si !== seg) {
                    seg = si;
                    gate = hash(si * 3.7 + lossTick * 1.3 + s.phase) > loss * .92;
                }
                if (!gate) { drawing = false; continue; }
            }

            var y = this.yAt(t, xx, s);

            if (drawing) ctx.lineTo(xx, y);
            else { ctx.moveTo(xx, y); drawing = true; }
        }
        ctx.strokeStyle = s.style;
        ctx.lineWidth = s.width;
        ctx.stroke();
    };

    Carrier.prototype.edgeGradient = function (rgb, alpha) {
        var g = this.ctx.createLinearGradient(0, 0, this.w, 0);
        var c = 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',';
        g.addColorStop(0, c + '0)');
        g.addColorStop(.14, c + alpha + ')');
        g.addColorStop(.86, c + alpha + ')');
        g.addColorStop(1, c + '0)');
        return g;
    };

    Carrier.prototype.frame = function (clockT, dt) {
        if (!reduceMotion) this.time += dt * this.rate.step(dt);
        var t = this.time;
        this.amp.step(dt);
        this.mod.step(dt);
        this.loss.step(dt);
        this.envLen.step(dt);
        this.progress.step(dt);
        var rgb = [this.color[0].step(dt), this.color[1].step(dt), this.color[2].step(dt)];
        var alpha = this.alpha.step(dt);

        var p = this.pointer;
        var near = p.inside && Math.abs(p.y - this.baseY) < 90;
        this.pull.target = near ? clamp((p.y - this.baseY) * .4, -26, 26) : 0;
        this.pull.step(dt);

        if (this.hold && this.held) return;
        this.held = this.hold;

        var ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        if (this.band) {
            // 窄带以载波为中线；绘制仍用视口坐标，只把画布整体平移过去（合成层位移，不触发重排）
            var top = Math.round(this.baseY - this.h / 2);
            if (top !== this.top) {
                this.top = top;
                this.canvas.style.transform = 'translateY(' + top + 'px)';
            }
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -top * this.dpr);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.opts.mode === 'bar') this.drawBar(t, rgb, alpha);
        else this.drawField(t, rgb, alpha, dt);
    };

    var MAIN = { offset: 0, scale: 1, gain: 1, phase: 0, modulated: true, width: 1 };

    Carrier.prototype.drawField = function (t, rgb, alpha, dt) {
        this.stepPulses(t);
        this.stepMotes(t, dt);
        this.drawMotes(t, rgb);
        var spread = 3 + this.mod.x * 5;
        var ghost = this.edgeGradient(mix(rgb, FAINT, .4), alpha * .32);
        this.strokeStrand(t, { offset: -spread, scale: .82, gain: .8, phase: 1.1, modulated: true, width: .75, style: ghost });
        this.strokeStrand(t, { offset: spread, scale: .7, gain: .6, phase: 2.3, modulated: true, width: .75, style: ghost });
        MAIN.style = this.edgeGradient(rgb, alpha);
        this.strokeStrand(t, MAIN);
        this.drawPulses(t, rgb);
    };

    /* ---------- 驶过的信号 ---------- */

    // 一束信号：沿载波行进的小波包，中心带一粒亮点
    Carrier.prototype.emit = function (x, dir) {
        if (reduceMotion || this.pulses.length > 5) return;
        this.pulses.push({ x: x, cx: x, dir: dir, born: this.time, fade: 0, amp: 5.5, width: 74, speed: 250, glow: .55 });
    };

    Carrier.prototype.stepPulses = function (t) {
        var w = this.w;
        this.pulses = this.pulses.filter(function (p) {
            var age = t - p.born;
            p.cx = p.x + p.dir * p.speed * age;
            p.fade = clamp(age / .35, 0, 1);
            return p.cx > -240 && p.cx < w + 240;
        });
    };

    Carrier.prototype.drawPulses = function (t, rgb) {
        var ctx = this.ctx;
        var w = this.w;
        var c = 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',';
        for (var i = 0; i < this.pulses.length; i++) {
            var p = this.pulses[i];
            // 与载波两端的渐隐一致
            var edge = clamp(Math.min(p.cx, w - p.cx) / (w * .14), 0, 1);
            var a = p.glow * p.fade * edge * (.55 + .45 * this.scale);
            if (a < .01) continue;
            var y = this.yAt(t, p.cx, MAIN);
            ctx.save();
            ctx.shadowColor = c + (a * .8) + ')';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.cx, y, 1.9, 0, TAU);
            ctx.fillStyle = c + a + ')';
            ctx.fill();
            ctx.restore();
        }
    };

    /* ---------- 残响：从载波上脱落，飘散进 limbo ---------- */

    // 浮现快、消散慢；中途偶尔闪断一下，像接收不稳
    function moteAlpha(m, t) {
        var a = Math.pow(Math.sin(Math.PI * Math.pow((t - m.born) / m.life, .6)), 1.4);
        return hash(m.born * 13 + Math.floor(t * 9)) < .08 ? a * .25 : a;
    }

    Carrier.prototype.stepMotes = function (t, dt) {
        if (reduceMotion || !dt) return;
        var w = this.w;
        // 平时稀疏；信号丢失时脱落得多
        this.moteDebt += dt * (2.6 + this.loss.x * 14);
        while (this.moteDebt >= 1 && this.motes.length < 60) {
            this.moteDebt -= 1;
            var x = w * (.16 + .68 * Math.random());
            this.motes.push({
                x: x,
                dy: this.yAt(t, x, MAIN) - this.baseY,
                vx: (Math.random() - .5) * 6,
                vy: (Math.random() < .5 ? -1 : 1) * (3 + Math.random() * 6),
                born: t,
                life: 3.2 + Math.random() * 3.4,
                r: .7 + Math.random() * .85
            });
        }
        if (this.moteDebt > 1) this.moteDebt = 1;
        this.motes = this.motes.filter(function (m) {
            m.x += m.vx * dt;
            m.dy += m.vy * dt;
            return t - m.born < m.life;
        });
    };

    Carrier.prototype.drawMotes = function (t, rgb) {
        var ctx = this.ctx;
        var c = 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',';
        var s = this.scale;
        for (var i = 0; i < this.motes.length; i++) {
            var m = this.motes[i];
            var a = moteAlpha(m, t) * .58 * (.45 + .55 * s);
            if (a < .01) continue;
            ctx.beginPath();
            ctx.arc(m.x, this.baseY + m.dy * (.5 + .5 * s), m.r, 0, TAU);
            ctx.fillStyle = c + a + ')';
            ctx.fill();
        }
    };

    Carrier.prototype.drawBar = function (t, rgb, alpha) {
        var px = clamp(this.progress.x, 0, 1) * this.w;
        var dark = this.dark;
        var faint = this.edgeGradient(dark || FAINT, .55);
        var sig = this.edgeGradient(dark || this.signal, .9);
        this.mod.target = 1;
        this.strokeStrand(t, { offset: 0, scale: 1, gain: 0, phase: 0, modulated: false, width: 1, style: faint, from: px, to: this.w });
        if (px > 1) {
            this.strokeStrand(t, { offset: 0, scale: 1, gain: .55, phase: 0, modulated: true, width: 1.1, style: sig, from: 0, to: px });
            if (dark) this.drawGlow(t, px);
            var k = TAU / this.opts.wavelength;
            var y = this.baseY + this.amp.x * this.opts.amplitude * Math.sin(k * px - t * this.opts.speed);
            var ctx = this.ctx;
            ctx.beginPath();
            ctx.arc(px, y, 2.2, 0, TAU);
            ctx.fillStyle = 'rgba(' + (this.signal[0] | 0) + ',' + (this.signal[1] | 0) + ',' + (this.signal[2] | 0) + ',.95)';
            ctx.fill();
        }
    };

    // 进度点照亮前后一小段：同一条载波用信号色重描，向两侧渐隐
    Carrier.prototype.drawGlow = function (t, px) {
        var ctx = this.ctx;
        var r = this.w < 640 ? 44 : 64;
        var c = 'rgba(' + (this.signal[0] | 0) + ',' + (this.signal[1] | 0) + ',' + (this.signal[2] | 0) + ',';
        var g = ctx.createLinearGradient(px - r, 0, px + r, 0);
        g.addColorStop(0, c + '0)');
        g.addColorStop(.5, c + '.9)');
        g.addColorStop(1, c + '0)');
        ctx.save();
        ctx.shadowColor = c + '.55)';
        ctx.shadowBlur = 8;
        this.strokeStrand(t, { offset: 0, scale: 1, gain: .55, phase: 0, modulated: true, width: 1.1, style: g, from: Math.max(0, px - r), to: px });
        this.strokeStrand(t, { offset: 0, scale: 1, gain: 0, phase: 0, modulated: false, width: 1, style: g, from: px, to: Math.min(this.w, px + r) });
        ctx.restore();
    };

    /* ---------- 阅读页：标题附近的残响 ---------- */

    // 与目录页载波上脱落的是同一种东西，只是稀少得多；标题滚出视口后不再生成
    function Dust(canvas, title) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.title = title;
        var c = mix(hexToRgb(getComputedStyle(body).getPropertyValue('--tint').trim()), INK, .35);
        this.rgba = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',';
        this.motes = [];
        this.debt = 0;
        this.time = 0;
        this.w = this.h = 0;
    }

    Dust.prototype.frame = function (clockT, dt) {
        var t = this.time += dt;
        var rect = this.canvas.getBoundingClientRect();
        if (rect.width !== this.w || rect.height !== this.h) {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.w = rect.width;
            this.h = rect.height;
            this.canvas.width = Math.round(this.w * dpr);
            this.canvas.height = Math.round(this.h * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        var visible = rect.bottom > 0 && rect.top < window.innerHeight;

        // 入场后才开始，约一秒一粒，同时最多十六粒
        if (visible && t > 1.4) {
            this.debt += dt * 1.05;
            if (this.debt >= 1 && this.motes.length < 16) {
                this.debt = 0;
                // 在标题四周一圈生成：短标题也不会全挤在字形里被挡住
                var r = this.title.getBoundingClientRect();
                var pad = Math.max(70, r.width * .25);
                this.motes.push({
                    x: r.left - rect.left - pad + (r.width + pad * 2) * Math.random(),
                    y: r.top - rect.top + r.height * (-.35 + 1.7 * Math.random()),
                    vx: (Math.random() - .5) * 5,
                    vy: (Math.random() < .5 ? -1 : 1) * (2 + Math.random() * 4.5),
                    born: t,
                    life: 4 + Math.random() * 3.5,
                    r: .7 + Math.random() * .8
                });
            }
        }
        this.motes = this.motes.filter(function (m) {
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            return t - m.born < m.life;
        });

        var ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);
        if (!visible) return;
        for (var i = 0; i < this.motes.length; i++) {
            var m = this.motes[i];
            var a = moteAlpha(m, t) * .62;
            if (a < .01) continue;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, TAU);
            ctx.fillStyle = this.rgba + a + ')';
            ctx.fill();
        }
    };

    /* ---------- 动画循环 ---------- */

    var carriers = [];
    var last = 0;
    var clock = 0;
    var running = false;

    function loop(now) {
        var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
        last = now;
        if (!reduceMotion) clock += dt;
        for (var i = 0; i < carriers.length; i++) {
            if (carriers[i].before) carriers[i].before();
            carriers[i].frame(clock, dt);
        }
        if (running) requestAnimationFrame(loop);
    }
    function start() {
        if (running) return;
        running = true;
        last = 0;
        requestAnimationFrame(loop);
    }
    function stop() { running = false; }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });

    function trackPointer(carrier) {
        window.addEventListener('pointermove', function (e) {
            carrier.pointer.x = e.clientX;
            carrier.pointer.y = e.clientY;
            carrier.pointer.inside = e.pointerType === 'mouse' || e.pointerType === 'pen';
        }, { passive: true });
        document.addEventListener('pointerleave', function () { carrier.pointer.inside = false; });
        window.addEventListener('blur', function () { carrier.pointer.inside = false; });
    }

    function onResize(fn) {
        var raf = 0;
        window.addEventListener('resize', function () {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(fn);
        });
    }

    function reveal(selector, opts) {
        var els = [].slice.call(document.querySelectorAll(selector));
        if (!els.length) return;
        if (!('IntersectionObserver' in window)) {
            els.forEach(function (el) { el.classList.add('is-in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            var k = 0;
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                if (opts && opts.stagger) entry.target.style.setProperty('--k', k++);
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: .01 });
        els.forEach(function (el) { io.observe(el); });
    }

    function ready() {
        var done = false;
        function go() {
            if (done) return;
            done = true;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { root.classList.add('is-ready'); });
            });
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
        setTimeout(go, 700);
    }

    /* ---------- 目录页 ---------- */

    function initIndex() {
        var canvas = document.querySelector('.cw-wave');
        var axis = document.querySelector('[data-cw-axis]');
        var tuner = document.querySelector('.cw-tuner');
        var tunerNo = tuner && tuner.querySelector('.cw-tuner-no');
        var tunerTitle = tuner && tuner.querySelector('.cw-tuner-title');
        if (!canvas || !axis) return;

        var narrow = window.innerWidth < 640;
        var carrier = new Carrier(canvas, {
            mode: 'field',
            band: true,
            wavelength: narrow ? 46 : 58,
            amplitude: narrow ? 4 : 5.5,
            speed: 1.7,
            alpha: .5
        });
        var axisTop = 0;
        var stuckY = narrow ? 58 : 76;
        var stuck = false;

        function measure() {
            narrow = window.innerWidth < 640;
            stuckY = narrow ? 58 : 76;
            var r = axis.getBoundingClientRect();
            axisTop = r.top + r.height / 2 + window.scrollY;
            carrier.opts.wavelength = narrow ? 46 : 58;
            carrier.opts.amplitude = narrow ? 4 : 5.5;
            carrier.resize();
        }

        // 偶尔有一束信号从左侧驶过；入场后才开始
        var nextPulse = 3.6;
        // 从首页卡片进入：卡片载波离场前已对准画布的波长与振幅（head.ejs），这里按它留下的波峰位置定相位；
        // 过渡期间画布定格，与形变到位的卡片载波重合，交接完再流动起来
        // 预渲染时脚本早已跑完，激活揭幕时（pagereveal）再对一次
        function fromHome() {
            if (!root.classList.contains('cw-from-home')) return;
            var hop = null;
            try {
                hop = JSON.parse(sessionStorage.getItem('cw-wave-hop'));
                sessionStorage.removeItem('cw-wave-hop');
            } catch (err) {}
            carrier.amp.x = 1;
            carrier.rate.x = 0;
            carrier.held = false;
            if (hop && Date.now() - hop.t < 6000) {
                // 向上的波峰：sin(k·x − t·speed) = −1
                var o = carrier.opts;
                var t = (TAU / o.wavelength * hop.x + Math.PI / 2) / o.speed;
                var cycle = TAU / o.speed;
                carrier.time = (t % cycle + cycle) % cycle;
                nextPulse = carrier.time + 3.6;
            }
        }
        window.addEventListener('pagereveal', fromHome);

        carrier.before = function () {
            // 过渡期间定格：时钟停住，画布也只画一帧
            carrier.hold = root.classList.contains('cw-from-home');
            carrier.rate.target = carrier.hold ? 0 : 1;
            if (carrier.time > nextPulse) {
                nextPulse = carrier.time + 9 + Math.random() * 8;
                if (!document.hidden) carrier.emit(0, 1);
            }
            var raw = axisTop - window.scrollY;
            carrier.baseY = Math.max(stuckY, raw);
            carrier.scale = .55 + .45 * clamp((raw - stuckY) / 260, 0, 1);
            var s = raw <= stuckY + 2;
            if (s !== stuck) {
                stuck = s;
                body.classList.toggle('is-stuck', s);
            }
        };

        measure();
        fromHome();
        onResize(measure);
        trackPointer(carrier);
        carriers.push(carrier);

        // 悬停篇目时，背景随之染上一层该篇的色调
        var stage = document.querySelector('.cw-stage');
        var glowRgb = '183,196,212';
        function glow(tint) {
            if (!stage) return;
            if (tint) glowRgb = hexToRgb(tint).map(Math.round).join(',');
            stage.style.setProperty('--cw-glow', 'rgba(' + glowRgb + ',' + (tint ? .1 : 0) + ')');
        }

        var lossTimer = 0;
        var releaseTimer = 0;

        function enter(el) {
            clearTimeout(lossTimer);
            clearTimeout(releaseTimer);
            var lost = el.getAttribute('data-state') === 'lost';
            var tint = el.getAttribute('data-tint');
            glow(lost ? '' : tint);
            carrier.loss.target = 0;
            carrier.tune(tint, +el.getAttribute('data-seed'), el.getAttribute('data-wave'), el.hasAttribute('data-flat'));

            if (tuner) {
                tunerNo.textContent = el.getAttribute('data-no');
                tunerTitle.textContent = el.getAttribute('data-title');
                tuner.style.setProperty('--tuner-tint', tint);
                tuner.classList.toggle('is-lost', lost);
                tuner.classList.add('is-on');
            }

            if (lost) {
                lossTimer = setTimeout(function () {
                    carrier.loss.target = 1;
                    carrier.mod.target = 0;
                    lossTimer = setTimeout(function () {
                        carrier.release();
                        glow('');
                        if (tuner) tuner.classList.remove('is-on');
                    }, 520);
                }, 260);
            }
        }

        function leave() {
            clearTimeout(lossTimer);
            clearTimeout(releaseTimer);
            releaseTimer = setTimeout(function () {
                carrier.release();
                glow('');
                if (tuner) tuner.classList.remove('is-on');
            }, 90);
        }

        [].forEach.call(document.querySelectorAll('[data-cw-track]'), function (el) {
            el.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') enter(el); });
            el.addEventListener('pointerleave', leave);
            el.addEventListener('focus', function () { enter(el); });
            el.addEventListener('blur', leave);
            if (el.getAttribute('data-state') === 'lost') {
                el.addEventListener('click', function (e) { e.preventDefault(); enter(el); });
            }
        });

        window.addEventListener('pageshow', function (e) {
            if (e.persisted) {
                carrier.release();
                glow('');
                if (tuner) tuner.classList.remove('is-on');
                measure();
            }
        });

        reveal('.cw-track', { stagger: true });
    }

    /* ---------- 阅读页 ---------- */

    function initReader() {
        var canvas = document.querySelector('.cw-wave-bar');
        if (canvas) {
            var narrow = window.innerWidth < 640;
            var carrier = new Carrier(canvas, {
                mode: 'bar',
                tint: canvas.getAttribute('data-tint'),
                wave: canvas.getAttribute('data-wave'),
                wavelength: narrow ? 30 : 38,
                amplitude: 2.6,
                speed: 2.2,
                alpha: .5,
                mod: 1,
                envLen: 180 + hash(+canvas.getAttribute('data-seed')) * 200
            });
            carrier.scale = 1;
            if (canvas.hasAttribute('data-flat')) carrier.amp.target = 0;

            var layout = function () {
                carrier.resize();
                carrier.baseY = window.innerWidth < 640 ? 52 : 62;
            };
            // 停下来读的时候，载波放缓、起伏收小，不在视野边缘抢注意力；一滚动就醒来
            var flat = canvas.hasAttribute('data-flat');
            var lastScroll = performance.now();
            window.addEventListener('scroll', function () { lastScroll = performance.now(); }, { passive: true });
            carrier.before = function () {
                var max = document.documentElement.scrollHeight - window.innerHeight;
                carrier.progress.target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 1;
                var idle = performance.now() - lastScroll > 2600;
                carrier.rate.target = idle ? .32 : 1;
                if (!flat) carrier.amp.target = idle ? .55 : 1;
            };
            layout();
            onResize(layout);
            trackPointer(carrier);
            carriers.push(carrier);
        }

        var dust = document.querySelector('.cw-dust');
        var title = document.querySelector('.cw-read-title .cw-name-text');
        if (dust && title && !reduceMotion) carriers.push(new Dust(dust, title));

        reveal('.cw-end');

        var prev = document.querySelector('[data-cw-prev]');
        var next = document.querySelector('[data-cw-next]');
        var back = document.querySelector('[data-cw-back]');
        document.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            var tag = (e.target && e.target.tagName) || '';
            if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
            var link = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : e.key === 'Escape' ? back : null;
            if (link) {
                e.preventDefault();
                window.location.href = link.href;
            }
        });
    }

    /* ---------- 启动 ---------- */

    if (body.classList.contains('cw-index')) initIndex();
    if (body.classList.contains('cw-reader')) initReader();
    ready();
    start();
})();

