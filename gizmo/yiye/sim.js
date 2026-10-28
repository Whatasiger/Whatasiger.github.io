/**
 * 一叶 · 物理与关卡（纯逻辑，不碰 DOM：game.js 用它跑游戏，tools/yiye-solve.js 用它在 Node 里求解检验关卡）
 *
 *   - 世界坐标固定 1000 × 620（横版）；竖屏时 game.js 整体转置绘制，逻辑不变
 *   - 涟漪是一圈以固定速度扩散的波前，扫过叶子的那一刻给它一次沿半径向外的冲量，离得越近推得越远
 *   - 石头挡住叶子，也挡住涟漪（石头背后的水面不起波）；荷叶只挡叶子
 *   - 水流在矩形区域里持续推动叶子；漩涡把叶子往中心拖，卷进涡心就沉了
 *   - 固定步长推进，同样的点击序列结果完全一致（求解器依赖这一点）
 */
(function (root) {
    "use strict";

    var W = 1000, H = 620;

    var P = {
        speed:  330,    // 涟漪扩散速度（单位/s）
        reach:  560,    // 涟漪作用半径，之外不再推动
        kick:   260,    // 波源正中处的冲量（单位/s），随距离按 (1 - d/reach)^fallPow 衰减
        fallPow: 1.6,
        drag:   0.85,   // 水的阻尼（/s）：单次冲量 v 能漂出 v / drag 远
        vmax:   340,    // 速度上限
        leafR:  15,     // 叶子的碰撞半径
        bounce: 0.55,   // 碰石头 / 荷叶 / 岸边的回弹
        moteR:  26,     // 拾取萤火的距离
        poolPull: 230,  // 漩涡向心加速度（边缘为 0，向中心线性增大）
        poolSpin: 150,  // 漩涡切向加速度
        sinkR:  22,     // 涡心：叶子中心进入即沉没
        flowEdge: 36,   // 水流矩形边缘的渐变宽度
        dt:     1 / 120 // 固定步长
    };

    /* 关卡：leaf [x, y, 朝向]，goal [x, y, r]（夕照倒影），motes 萤火 [x, y]，
       rocks / pads [x, y, r]，flows [x, y, w, h, ax, ay]（区域内的加速度），pools [x, y, r]，
       par 为「涟漪不超过此数」那一枚印记的标准（由 tools/yiye-solve.js 求出最少步数再酌情放宽） */
    var LEVELS = [
        {
            name: "初涟", hint: "轻点叶子身后的水面，涟漪会把它推开",
            leaf: [220, 310, 0], goal: [780, 310, 48],
            motes: [[500, 310]], par: 2
        },
        {
            name: "两岸", hint: "涟漪从哪边来，叶子就往哪边去；离得越近，推得越远",
            leaf: [170, 470, -0.4], goal: [830, 150, 46],
            motes: [[420, 330], [660, 430]], par: 3
        },
        {
            name: "石影", hint: "石头背后的水面不会起波",
            leaf: [180, 310, 0], goal: [830, 310, 46],
            rocks: [[500, 300, 80], [660, 110, 40]],
            motes: [[500, 115], [700, 480]], par: 4
        },
        {
            name: "荷田", hint: "荷叶不挡涟漪，只挡叶子",
            leaf: [140, 520, -0.6], goal: [860, 110, 44],
            pads: [[360, 380, 62], [560, 250, 58], [330, 160, 52], [720, 430, 64], [760, 250, 40]],
            motes: [[470, 480], [620, 100]], par: 4
        },
        {
            name: "顺流", hint: "水流会一直带着叶子走",
            leaf: [140, 120, 0.3], goal: [870, 500, 46],
            flows: [[80, 250, 840, 120, 95, 0]],
            motes: [[520, 310], [300, 520]], par: 3
        },
        {
            name: "逆水", hint: "两道暗流方向相反，借力，也要防着被冲走",
            leaf: [110, 310, 0], goal: [890, 310, 44],
            flows: [[300, 0, 110, 620, 0, 120], [590, 0, 110, 620, 0, -120]],
            motes: [[355, 150], [645, 470]], par: 4
        },
        {
            name: "漩", hint: "别让叶子卷进漩涡",
            leaf: [170, 310, 0], goal: [830, 310, 46],
            pools: [[500, 310, 170]],
            motes: [[500, 85], [500, 535]], par: 4
        },
        {
            name: "回廊", hint: "绕开石头，找好涟漪的角度",
            leaf: [110, 110, 0.2], goal: [880, 520, 44],
            rocks: [[330, -10, 52], [330, 80, 52], [330, 170, 52], [330, 260, 52], [330, 350, 50],
                    [640, 630, 52], [640, 540, 52], [640, 450, 52], [640, 360, 52], [640, 270, 50]],
            motes: [[480, 560], [790, 110]], par: 6
        },
        {
            name: "双漩", hint: "两只漩涡之间只有一条窄路",
            leaf: [120, 500, -0.3], goal: [880, 140, 44],
            pools: [[400, 220, 150], [640, 420, 150]],
            motes: [[520, 320], [230, 110], [820, 520]], par: 4
        },
        {
            name: "暮归", hint: "最后一片夕照",
            leaf: [110, 560, -0.5], goal: [880, 110, 46],
            rocks: [[300, 400, 60], [520, 170, 70], [760, 360, 56]],
            pads: [[430, 530, 45], [660, 540, 50]],
            flows: [[560, 0, 110, 620, 0, 90]],
            pools: [[890, 560, 120]],
            motes: [[300, 130], [640, 300], [900, 380]], par: 5
        }
    ];

    function fall(d) {
        return d >= P.reach ? 0 : Math.pow(1 - d / P.reach, P.fallPow);
    }

    // 线段 a→b 是否穿过圆 (cx, cy, r)
    function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
        var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        var t = L ? ((cx - ax) * dx + (cy - ay) * dy) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var px = ax + dx * t - cx, py = ay + dy * t - cy;
        return px * px + py * py < r * r;
    }

    function smooth(e0, e1, x) {
        var t = (x - e0) / (e1 - e0);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return t * t * (3 - 2 * t);
    }

    function Game(level) {
        this.lv = level;
        this.x = level.leaf[0]; this.y = level.leaf[1]; this.th = level.leaf[2] || 0;
        this.vx = 0; this.vy = 0; this.w = 0;
        this.t = 0;
        this.used = 0;
        this.ripples = [];
        this.got = (level.motes || []).map(function () { return false; });
        this.state = "play";    // play / won / sunk
        this.endT = 0;          // 进入 won / sunk 的时刻
        this.events = [];       // 给 game.js 的音效 / 粒子：{ type, ... }
    }

    Game.prototype.gotAll = function () {
        for (var i = 0; i < this.got.length; i++) if (!this.got[i]) return false;
        return true;
    };

    // 点在哪里不能起波：岸外、石头上、荷叶上；返回 null 表示可以
    Game.prototype.blockedAt = function (x, y) {
        if (x < 0 || y < 0 || x > W || y > H) return { kind: "shore" };
        var lv = this.lv, i, o, dx, dy;
        for (i = 0; lv.rocks && i < lv.rocks.length; i++) {
            o = lv.rocks[i]; dx = x - o[0]; dy = y - o[1];
            if (dx * dx + dy * dy < (o[2] + 4) * (o[2] + 4)) return { kind: "rock", i: i };
        }
        for (i = 0; lv.pads && i < lv.pads.length; i++) {
            o = lv.pads[i]; dx = x - o[0]; dy = y - o[1];
            if (dx * dx + dy * dy < o[2] * o[2]) return { kind: "pad", i: i };
        }
        return null;
    };

    Game.prototype.tap = function (x, y) {
        if (this.state !== "play" || this.blockedAt(x, y)) return false;
        this.ripples.push({ x: x, y: y, t0: this.t, r: 0, hit: false });
        this.used++;
        return true;
    };

    Game.prototype.shadowed = function (sx, sy, x, y) {
        var rocks = this.lv.rocks;
        for (var i = 0; rocks && i < rocks.length; i++) {
            var o = rocks[i];
            if (segHitsCircle(sx, sy, x, y, o[0], o[1], o[2])) return true;
        }
        return false;
    };

    Game.prototype.collide = function (list) {
        var R = P.leafR;
        for (var i = 0; list && i < list.length; i++) {
            var o = list[i], dx = this.x - o[0], dy = this.y - o[1];
            var d = Math.sqrt(dx * dx + dy * dy), min = o[2] + R;
            if (d >= min || d < 1e-6) continue;
            var nx = dx / d, ny = dy / d;
            this.x = o[0] + nx * min; this.y = o[1] + ny * min;
            var vn = this.vx * nx + this.vy * ny;
            if (vn < 0) {
                this.vx -= (1 + P.bounce) * vn * nx;
                this.vy -= (1 + P.bounce) * vn * ny;
                this.w += (this.vx * ny - this.vy * nx) * 0.004;
                if (-vn > 30) this.events.push({ type: "bump", v: -vn, x: this.x - nx * R, y: this.y - ny * R });
            }
        }
    };

    Game.prototype.step = function () {
        var dt = P.dt, lv = this.lv, i, o, dx, dy, d;
        var prevT = this.t;
        this.t += dt;

        // 涟漪：波前扫过叶子的那一步给冲量
        for (i = this.ripples.length - 1; i >= 0; i--) {
            var rp = this.ripples[i];
            var prev = P.speed * (prevT - rp.t0);
            rp.r = P.speed * (this.t - rp.t0);
            if (!rp.hit && this.state === "play") {
                dx = this.x - rp.x; dy = this.y - rp.y;
                d = Math.sqrt(dx * dx + dy * dy);
                if (d >= Math.max(0, prev) && d < rp.r) {
                    rp.hit = true;
                    if (d < P.reach && !this.shadowed(rp.x, rp.y, this.x, this.y)) {
                        var nx, ny;
                        if (d < 1) { nx = Math.cos(this.th); ny = Math.sin(this.th); }
                        else { nx = dx / d; ny = dy / d; }
                        var mag = P.kick * fall(d);
                        this.vx += nx * mag; this.vy += ny * mag;
                        // 波从侧面打来时叶子跟着转一下
                        this.w += (Math.cos(this.th) * ny - Math.sin(this.th) * nx) * mag * 0.012;
                        this.events.push({ type: "kick", mag: mag });
                    }
                }
            }
            if (rp.r > P.reach + 80) this.ripples.splice(i, 1);
        }

        if (this.state === "won") {
            // 落进夕照：轻轻收向中心
            var g = lv.goal;
            this.vx += (g[0] - this.x) * 7 * dt; this.vy += (g[1] - this.y) * 7 * dt;
            var k = Math.exp(-4.5 * dt);
            this.vx *= k; this.vy *= k;
            this.x += this.vx * dt; this.y += this.vy * dt;
            this.th += this.w * dt; this.w *= Math.exp(-1.2 * dt); this.w += 0.5 * dt;
            return;
        }
        if (this.state === "sunk") {
            var pl = this.sinkPool;
            dx = this.x - pl[0]; dy = this.y - pl[1];
            var a = Math.atan2(dy, dx) + 7 * dt, rr = Math.sqrt(dx * dx + dy * dy) * Math.exp(-2.5 * dt);
            this.x = pl[0] + Math.cos(a) * rr; this.y = pl[1] + Math.sin(a) * rr;
            this.th += 9 * dt;
            return;
        }

        // 水流
        var ax = 0, ay = 0;
        for (i = 0; lv.flows && i < lv.flows.length; i++) {
            o = lv.flows[i];
            var e = P.flowEdge;
            var f = smooth(o[0] - e, o[0] + e, this.x) * (1 - smooth(o[0] + o[2] - e, o[0] + o[2] + e, this.x)) *
                    smooth(o[1] - e, o[1] + e, this.y) * (1 - smooth(o[1] + o[3] - e, o[1] + o[3] + e, this.y));
            ax += o[4] * f; ay += o[5] * f;
        }
        // 漩涡
        for (i = 0; lv.pools && i < lv.pools.length; i++) {
            o = lv.pools[i]; dx = o[0] - this.x; dy = o[1] - this.y;
            d = Math.sqrt(dx * dx + dy * dy);
            if (d < P.sinkR) {
                this.state = "sunk"; this.endT = this.t; this.sinkPool = o;
                this.events.push({ type: "sunk" });
                return;
            }
            if (d < o[2]) {
                var s = 1 - d / o[2];
                ax += dx / d * P.poolPull * s - dy / d * P.poolSpin * s;
                ay += dy / d * P.poolPull * s + dx / d * P.poolSpin * s;
            }
        }
        this.vx += ax * dt; this.vy += ay * dt;

        var damp = Math.exp(-P.drag * dt);
        this.vx *= damp; this.vy *= damp;
        var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (sp > P.vmax) { this.vx *= P.vmax / sp; this.vy *= P.vmax / sp; sp = P.vmax; }
        this.x += this.vx * dt; this.y += this.vy * dt;

        // 碰撞：石头、荷叶、岸
        this.collide(lv.rocks);
        this.collide(lv.pads);
        var R = P.leafR;
        if (this.x < R) { this.x = R; if (this.vx < 0) this.wall(-this.vx, 0, this.y), this.vx = -this.vx * P.bounce; }
        if (this.x > W - R) { this.x = W - R; if (this.vx > 0) this.wall(this.vx, W, this.y), this.vx = -this.vx * P.bounce; }
        if (this.y < R) { this.y = R; if (this.vy < 0) this.wall(-this.vy, this.x, 0), this.vy = -this.vy * P.bounce; }
        if (this.y > H - R) { this.y = H - R; if (this.vy > 0) this.wall(this.vy, this.x, H), this.vy = -this.vy * P.bounce; }

        // 朝向：慢慢转向漂动方向，外加冲量带来的自转
        if (sp > 6) {
            var target = Math.atan2(this.vy, this.vx);
            var diff = Math.atan2(Math.sin(target - this.th), Math.cos(target - this.th));
            this.th += diff * Math.min(1, dt * 2.4 * Math.min(1, sp / 120));
        }
        this.th += this.w * dt;
        this.w *= Math.exp(-2.2 * dt);

        // 萤火
        for (i = 0; lv.motes && i < lv.motes.length; i++) {
            if (this.got[i]) continue;
            o = lv.motes[i]; dx = this.x - o[0]; dy = this.y - o[1];
            if (dx * dx + dy * dy < P.moteR * P.moteR) {
                this.got[i] = true;
                this.events.push({ type: "mote", i: i, n: this.got.filter(Boolean).length });
            }
        }
        // 夕照
        var gl = lv.goal; dx = this.x - gl[0]; dy = this.y - gl[1];
        if (dx * dx + dy * dy < (gl[2] - 8) * (gl[2] - 8)) {
            this.state = "won"; this.endT = this.t;
            this.events.push({ type: "won" });
        }
    };

    Game.prototype.wall = function (v, x, y) {
        if (v > 30) this.events.push({ type: "bump", v: v, x: x, y: y });
    };

    // 叶子与所有涟漪都静下来了（求解器据此决定下一次点击）
    Game.prototype.settled = function () {
        if (this.state !== "play") return true;
        var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        for (var i = 0; i < this.ripples.length; i++) {
            if (!this.ripples[i].hit && this.ripples[i].r < P.reach) return false;
        }
        return sp < 8;
    };

    var api = { W: W, H: H, P: P, LEVELS: LEVELS, Game: Game, fall: fall };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.YiyeSim = api;
})(this);
