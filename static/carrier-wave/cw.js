/* ----
# CARRiER WAVE. 载波
# 目录页：一条纯载波，悬停曲目时被调制；未接收的篇目只留下一次失真。
# 阅读页：顶部载波兼作进度，已读部分携带信号，未读部分只是载波。
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

        var c = hexToRgb(opts.tint);
        this.color = [new Spring(INK[0], 90, 19), new Spring(INK[1], 90, 19), new Spring(INK[2], 90, 19)];
        this.alpha = new Spring(opts.alpha || .5, 90, 19);
        this.signal = mix(c, INK, .32);

        this.pointer = { x: -9999, y: -9999, inside: false };
        this.baseY = 0;
        this.resize();
    }

    Carrier.prototype.resize = function () {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var rect = this.canvas.getBoundingClientRect();
        this.w = rect.width;
        this.h = rect.height;
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    Carrier.prototype.tune = function (tint, seed) {
        var c = mix(hexToRgb(tint), INK, .3);
        for (var i = 0; i < 3; i++) this.color[i].target = c[i];
        this.alpha.target = .78;
        this.mod.target = 1;
        this.envLen.target = 260 + hash(seed) * 320;
    };

    Carrier.prototype.release = function () {
        for (var i = 0; i < 3; i++) this.color[i].target = INK[i];
        this.alpha.target = this.opts.alpha || .5;
        this.mod.target = 0;
        this.loss.target = 0;
    };

    Carrier.prototype.strokeStrand = function (t, s) {
        var ctx = this.ctx;
        var o = this.opts;
        var w = this.w;
        var y0 = this.baseY + s.offset;
        var k = TAU / o.wavelength;
        var ke = TAU / this.envLen.x;
        var amp = this.amp.x * o.amplitude * s.scale * this.scale;
        var mod = this.mod.x;
        var loss = this.loss.x;
        var pull = this.pull.x;
        var px = this.pointer.x;
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

            var env = s.modulated
                ? .5 + .5 * (.62 * Math.sin(ke * xx - t * .9 + s.phase) + .38 * Math.sin(ke * 1.73 * xx + t * .55 + 1.7))
                : 0;
            var a = amp * (1 + mod * s.gain * env * 3.4);
            var y = y0 + a * Math.sin(k * xx - t * o.speed + s.phase);
            if (pull) {
                var dx = (xx - px) / 120;
                y += pull * Math.exp(-dx * dx) * s.scale;
            }

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

    Carrier.prototype.frame = function (t, dt) {
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

        var ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.opts.mode === 'bar') this.drawBar(t, rgb, alpha);
        else this.drawField(t, rgb, alpha);
    };

    Carrier.prototype.drawField = function (t, rgb, alpha) {
        var spread = 3 + this.mod.x * 5;
        var ghost = this.edgeGradient(mix(rgb, FAINT, .4), alpha * .32);
        this.strokeStrand(t, { offset: -spread, scale: .82, gain: .8, phase: 1.1, modulated: true, width: .75, style: ghost });
        this.strokeStrand(t, { offset: spread, scale: .7, gain: .6, phase: 2.3, modulated: true, width: .75, style: ghost });
        this.strokeStrand(t, { offset: 0, scale: 1, gain: 1, phase: 0, modulated: true, width: 1, style: this.edgeGradient(rgb, alpha) });
    };

    Carrier.prototype.drawBar = function (t, rgb, alpha) {
        var px = clamp(this.progress.x, 0, 1) * this.w;
        var faint = this.edgeGradient(FAINT, .55);
        var sig = this.edgeGradient(this.signal, .9);
        this.mod.target = 1;
        this.strokeStrand(t, { offset: 0, scale: 1, gain: 0, phase: 0, modulated: false, width: 1, style: faint, from: px, to: this.w });
        if (px > 1) {
            this.strokeStrand(t, { offset: 0, scale: 1, gain: .55, phase: 0, modulated: true, width: 1.1, style: sig, from: 0, to: px });
            var k = TAU / this.opts.wavelength;
            var y = this.baseY + this.amp.x * this.opts.amplitude * Math.sin(k * px - t * this.opts.speed);
            var ctx = this.ctx;
            ctx.beginPath();
            ctx.arc(px, y, 2.2, 0, TAU);
            ctx.fillStyle = 'rgba(' + (this.signal[0] | 0) + ',' + (this.signal[1] | 0) + ',' + (this.signal[2] | 0) + ',.95)';
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

        carrier.before = function () {
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
        onResize(measure);
        trackPointer(carrier);
        carriers.push(carrier);

        var lossTimer = 0;
        var releaseTimer = 0;

        function enter(el) {
            clearTimeout(lossTimer);
            clearTimeout(releaseTimer);
            var lost = el.getAttribute('data-state') === 'lost';
            var tint = el.getAttribute('data-tint');
            carrier.loss.target = 0;
            carrier.tune(tint, +el.getAttribute('data-seed'));

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
                wavelength: narrow ? 30 : 38,
                amplitude: 2.6,
                speed: 2.2,
                alpha: .5,
                mod: 1,
                envLen: 180 + hash(+canvas.getAttribute('data-seed')) * 200
            });
            carrier.scale = 1;

            var layout = function () {
                carrier.resize();
                carrier.baseY = window.innerWidth < 640 ? 52 : 62;
            };
            carrier.before = function () {
                var max = document.documentElement.scrollHeight - window.innerHeight;
                carrier.progress.target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 1;
            };
            layout();
            onResize(layout);
            trackPointer(carrier);
            carriers.push(carrier);
        }

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

