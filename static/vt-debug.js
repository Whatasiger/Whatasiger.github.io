/* 跨页面过渡诊断：说明见 layout/_partial/vt-debug.ejs（只在 localStorage cw-vt-debug=1 时由该 partial 同步载入） */
(function () {
    var on = false;
    try { on = localStorage.getItem('cw-vt-debug') === '1'; } catch (err) {}
    if (!on) return;

    var LOG_KEY = 'cw-vt-log';
    var MAX = 60;
    function read() {
        try { return JSON.parse(sessionStorage.getItem(LOG_KEY)) || []; } catch (err) { return []; }
    }
    function write(list) {
        try { sessionStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-MAX))); } catch (err) {}
    }
    function push(entry) {
        var list = read();
        entry.i = list.length ? list[list.length - 1].i + 1 : 1;
        list.push(entry);
        write(list);
        console.info('[cw-vt]', entry);
        return entry.i;
    }
    function patch(i, fields) {
        var list = read();
        for (var k = list.length - 1; k >= 0; k--) {
            if (list[k].i !== i) continue;
            for (var f in fields) list[k][f] = fields[f];
            write(list);
            console.info('[cw-vt] #' + i, fields);
            return;
        }
    }
    function path(u) {
        try { return new URL(u, location.href).pathname; } catch (err) { return String(u); }
    }
    // 当前带过渡名的元素，及其是否在视口内
    function names() {
        var out = [];
        var all = document.querySelectorAll('*');
        for (var k = 0; k < all.length; k++) {
            var n = getComputedStyle(all[k]).viewTransitionName;
            if (!n || n === 'none') continue;
            var r = all[k].getBoundingClientRect();
            out.push(n + (r.bottom > 0 && r.top < innerHeight && r.width && r.height ? '' : '(视口外)'));
        }
        return out.join(' ');
    }
    function vp() {
        var d = document.documentElement;
        var v = window.visualViewport;
        return innerWidth + 'x' + innerHeight + ' client ' + d.clientWidth + 'x' + d.clientHeight +
            (v ? ' vv ' + Math.round(v.width) + 'x' + Math.round(v.height) + ' z' + v.scale : '') +
            ' dpr ' + devicePixelRatio + ' sh ' + d.scrollHeight;
    }
    function track(i, vt) {
        if (!vt) return;
        var t0 = performance.now();
        vt.ready.then(function () {
            patch(i, { ready: Math.round(performance.now() - t0) + 'ms' });
        }, function (err) {
            patch(i, { ready: (err && err.name) + ': ' + (err && err.message) });
        });
        vt.finished.then(function () {
            patch(i, { finished: Math.round(performance.now() - t0) + 'ms' });
        });
    }

    window.addEventListener('pageswap', function (e) {
        var to = e.activation && e.activation.entry && e.activation.entry.url;
        var i = push({
            ev: 'pageswap',
            page: location.pathname,
            to: to ? path(to) : null,
            type: e.activation && e.activation.navigationType,
            vt: !!e.viewTransition,
            vp: vp(),
            cls: document.documentElement.className,
            names: e.viewTransition ? names() : ''
        });
        track(i, e.viewTransition);
    });
    window.addEventListener('pagereveal', function (e) {
        var act = window.navigation && navigation.activation;
        var hop = null;
        try { hop = sessionStorage.getItem('cw-vt-hop'); } catch (err) {}
        var i = push({
            ev: 'pagereveal',
            page: location.pathname,
            from: act && act.from ? path(act.from.url) : null,
            type: act && act.navigationType,
            vt: !!e.viewTransition,
            hop: hop,
            sinceNav: Math.round(performance.now()) + 'ms',
            vp: vp(),
            cls: document.documentElement.className,
            names: e.viewTransition ? names() : ''
        });
        track(i, e.viewTransition);
    });

    window.cwVtLog = function () {
        var list = read();
        console.table(list);
        return JSON.stringify(list, null, 1);
    };
    window.cwVtClear = function () { write([]); };
})();
