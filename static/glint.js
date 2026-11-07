/* ----

# Glint Theme (based on Hingle, refactored by Whatasiger)
# Original By: Dreamer-Paul（Hingle，Last Update: 2024.9.2）
# Refactored By: Whatasiger

基于 Hingle 改写的 Hexo 博客主题。

Hingle 为奇趣保罗原创，并遵守 MIT 开源协议。欢迎访问原作者的博客：https://paugram.com

---- */

var Glint = function (config) {
    var body = document.body;
    var content = ks.select(".post-content:not(.is-special), .page-content:not(.is-special)");

    // 全局阅读设置（保存在 localStorage，控制字体 / 背景等）
    var SETTINGS_KEY = "whatasiger_reader_settings";
    // 字重档位映射表：1~5 档映射到更分明的 CSS 字重
    var FONT_WEIGHT_LEVELS = [300, 400, 500, 600, 700];

    function getWeightFromLevel(level) {
        var idx = (parseInt(level, 10) || 3) - 1;
        if (idx < 0) idx = 0;
        if (idx >= FONT_WEIGHT_LEVELS.length) idx = FONT_WEIGHT_LEVELS.length - 1;
        return FONT_WEIGHT_LEVELS[idx];
    }

    function getLevelFromWeight(weight) {
        var w = parseInt(weight, 10) || 450;
        var closest = 1;
        var minDiff = Infinity;
        for (var i = 0; i < FONT_WEIGHT_LEVELS.length; i++) {
            var diff = Math.abs(w - FONT_WEIGHT_LEVELS[i]);
            if (diff < minDiff) {
                minDiff = diff;
                closest = i + 1;
            }
        }
        return closest;
    }

    var SOURCE_HAN_FONT_STACK = '"Noto Sans SC", "Source Han Sans SC", "Source Han Sans CN", "Noto Sans CJK SC", "思源黑体", "思源黑体 CN", "Microsoft YaHei", sans-serif';
    var SYSTEM_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';

    var defaultSettings = {
        immersive: false,      // 沉浸模式：下滑收起顶栏，快速上滑才重新出现
        hideTodo: false,       // 是否关闭首页 TODO 侧边栏
        fontFamily: "noto-sans-sc", // 字体：noto-sans-sc（思源黑体）或 system-default（系统默认）
        fontWeight: getWeightFromLevel(3), // 正文字重：五档中的第三档（500）
        letterSpacing: 3,      // 字间距（-2 ~ 8，单位 0.01em，滑动条无级）
        fontSize: 100,         // 字号百分比（90 ~ 130，滑动条无级）
        bgOpacity: 55,         // 背景可见度默认 55%（设置滑块按一半数值显示）
        bgBlur: 8,             // 阅读页（及 CW 预告页）的背景模糊度（0~20px），默认 8px
        homeBlur: 0,           // 首页（及归档等其余页面）的背景模糊度（0~20px），默认清晰
        accent: "blue",        // 主题色：blue（天青）/ lavender / sakura / mikan / wakakusa / mint，见 glint.css 第 0 节
        themeMode: "dark",     // 日夜：dark 夜间（默认）/ light 白天 / auto 跟随系统；日月按钮只是本次浏览中临时切换
        bodyFont: "sans",      // 阅读页正文字体：sans（随「字体」）/ serif（思源宋体，选中才加载）
        lineHeight: 1.8,       // 正文行距（1.5 ~ 2.4）
        paraSpacing: 1,        // 段距（0 ~ 2em）
        readWidth: 50,         // 行宽（36 ~ 60em，桌面端正文的最大宽度）
        indent: false          // 段首缩进两字
    };

    var currentSettings = (function () {
        try {
            var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            if (saved && typeof saved === "object") {
                delete saved.showToTop;      // 已移除的开关
                delete saved.hideBackground;
                return Object.assign({}, defaultSettings, saved);
            }
        } catch (e) {
            // ignore
        }
        return Object.assign({}, defaultSettings);
    })();

    function persistSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
        } catch (e) {
            // ignore
        }
    }

    // 滚动统一走一个监听：每帧最多跑一次，各处用 onScrollFrame(fn) 登记
    var scrollHandlers = [];
    var scrollTicking = false;
    function onScrollFrame(fn) { scrollHandlers.push(fn); }
    window.addEventListener("scroll", function () {
        if (scrollTicking) return;
        scrollTicking = true;
        window.requestAnimationFrame(function () {
            scrollTicking = false;
            for (var i = 0; i < scrollHandlers.length; i++) scrollHandlers[i]();
        });
    }, { passive: true });

    // 把背景图的模糊「烤」成一张静态图（canvas 模糊一次），body:before 不再挂 filter: blur
    // 全屏固定层带模糊滤镜时，上面任何东西在动（滚动、卡片悬停、跨页过渡），GPU 每帧都要把整屏模糊重算一遍
    // 原先只在手机端烤，现在桌面端同样处理；模糊过的图不需要满分辨率，按模糊半径降低画布密度，烤得快、占内存也少
    // 模糊度要变（拖设置滑块）时先退回 CSS 模糊实时预览，松手后再重新烘焙；水波纹读到的是烤好的图 + 无模糊，结果一致
    // 首页指针移上文章卡片时，还会按文章页的模糊度把那张封面预先烤好（prebake），文章页首帧就直接用上（见 head.ejs），
    // 一镜到底的全程都没有实时的全屏模糊
    // 抖动：每个通道加上 ±1 级的三角分布噪点，把 8 位色深下暗部平滑渐变的台阶（色带）打散成看不出的细颗粒
    // 浏览器合成只有 8 位，10bit 屏幕也一样会出台阶；噪点幅度只有 1 级，肉眼看不出颗粒。背景烘焙与卡片模糊层共用
    function dither(ctx, w, h) {
        try {
            var data = ctx.getImageData(0, 0, w, h);
            var d = data.data;
            for (var i = 0; i < d.length; i += 4) {
                var n = Math.random() - Math.random();     // -1 ~ 1，三角分布
                d[i] += n; d[i + 1] += n; d[i + 2] += n;   // Uint8ClampedArray 会自动四舍五入并夹在 0–255
            }
            ctx.putImageData(data, 0, 0);
        } catch (e) {}      // 跨域图片画进来后画布被污染、读不出像素：不抖动（导出也会失败，退回 CSS 模糊）
    }

    var bgBake = (function () {
        var PREBAKE_KEY = "glint-bg-prebake";   // 与 head.ejs 中文章页读取的键一致
        var seq = 0;                // 每次烘焙 / 撤销都加一，过期的异步结果直接丢弃
        var timer = null;
        var bakedUrl = "";          // 当前在用的 blob 地址
        var rawInline = null;       // 烘焙前 body 上 --page-bg-image 的内联值（"" 表示来自样式表）
        var lastWidth = window.innerWidth;

        // 按当前视口 cover 铺满时的尺寸，把图模糊成一张画布并导出无损 PNG；cb(blob | null)
        // 有损 WebP 会在暗部压出一格一格的方块，所以不用；fine 为真时（页面上真正用的那张）提高密度并加抖动去色带，
        // 为假时（预烤，要以 data URL 存进 sessionStorage）保持低密度、不抖动（噪点会让 PNG 压不小），文章页落定后再按 fine 重烤
        function blurBlob(img, blur, cb, fine) {
            try {
                var dpr = Math.min(window.devicePixelRatio || 1, 2);
                var cover = Math.max(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight); // 原图 1px 显示成多少 CSS px
                var density = Math.min(dpr, (fine ? 8 : 4) / blur);  // 画布每 CSS px 的像素数：模糊半径至少留 4 / 8 个画布像素
                var k = Math.min(1, cover * density);       // 画布相对原图的缩放
                var w = Math.max(1, Math.round(img.naturalWidth * k));
                var h = Math.max(1, Math.round(img.naturalHeight * k));
                var r = blur * k / cover;                    // CSS 模糊半径换算成画布像素
                var c = document.createElement("canvas");
                c.width = w;
                c.height = h;
                var ctx = c.getContext("2d");
                ctx.filter = "blur(" + r + "px)";
                if (ctx.filter && ctx.filter.indexOf("blur") !== -1) {
                    ctx.drawImage(img, 0, 0, w, h);
                } else {
                    // 不支持 canvas 滤镜（旧版 Safari）：先缩小再放大，近似模糊
                    var f = Math.max(1, r * 1.5);
                    var s = document.createElement("canvas");
                    s.width = Math.max(1, Math.round(w / f));
                    s.height = Math.max(1, Math.round(h / f));
                    var sctx = s.getContext("2d");
                    sctx.imageSmoothingQuality = "high";
                    sctx.drawImage(img, 0, 0, s.width, s.height);
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(s, 0, 0, w, h);
                }
                if (fine) dither(ctx, w, h);
                c.toBlob(function (blob) { cb(blob || null); }, "image/png");
            } catch (e) {
                cb(null);           // 跨域图片等无法导出时，保持 CSS 模糊
            }
        }
        function loadImage(src, cb) {
            var img = new Image();
            img.onload = function () {
                (img.decode ? img.decode() : Promise.resolve()).then(function () { cb(img); }, function () { cb(img); });
            };
            img.onerror = function () { cb(null); };
            img.src = src;
        }

        // 换图 / 换滤镜的那一帧不要过渡（否则会从模糊动画到清晰再变回来）
        function withoutTransition(fn) {
            body.classList.add("no-bg-transition");
            fn();
            getComputedStyle(body, "::before").filter; // 强制先按无过渡生效
            requestAnimationFrame(function () { body.classList.remove("no-bg-transition"); });
        }

        function setImage(url) {
            if (url) {
                if (rawInline === null) rawInline = body.style.getPropertyValue("--page-bg-image");
                body.style.setProperty("--page-bg-image", 'url("' + url + '")');
            } else if (rawInline !== null) {
                if (rawInline) body.style.setProperty("--page-bg-image", rawInline);
                else body.style.removeProperty("--page-bg-image");
                rawInline = null;
            }
            if (bakedUrl && bakedUrl !== url && bakedUrl.indexOf("blob:") === 0) URL.revokeObjectURL(bakedUrl);
            bakedUrl = url || "";
        }

        function unbake() {
            seq++;
            clearTimeout(timer);
            if (!body.classList.contains("bg-baked")) return;
            withoutTransition(function () {
                setImage(null);
                body.classList.remove("bg-baked");
            });
        }

        function bake() {
            var my = ++seq;
            var blur = parseFloat(getComputedStyle(body).getPropertyValue("--bg-blur")) || 0;
            // 已烘焙时要从原图重新烤，不能拿烤过的图再模糊一遍
            var raw;
            if (rawInline === null) {
                raw = getComputedStyle(body).getPropertyValue("--page-bg-image");
            } else if (rawInline) {
                raw = rawInline;
            } else {
                // 原值来自样式表（head.ejs）：临时撤掉内联值读一次
                var cur = body.style.getPropertyValue("--page-bg-image");
                body.style.removeProperty("--page-bg-image");
                raw = getComputedStyle(body).getPropertyValue("--page-bg-image");
                body.style.setProperty("--page-bg-image", cur);
            }
            var m = raw.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
            if (!m) return;

            if (blur <= 0) {        // 不需要模糊：只撤掉滤镜
                withoutTransition(function () {
                    setImage(null);
                    body.classList.add("bg-baked");
                });
                return;
            }

            loadImage(m[1], function (img) {
                if (my !== seq || !img) return;
                blurBlob(img, blur, function (blob) {
                    if (my !== seq || !blob) return;
                    var url = URL.createObjectURL(blob);
                    var pre = new Image();
                    pre.src = url;
                    (pre.decode ? pre.decode() : Promise.resolve()).then(function () {
                        if (my !== seq) { URL.revokeObjectURL(url); return; }
                        withoutTransition(function () {
                            setImage(url);
                            body.classList.add("bg-baked");
                        });
                    }, function () { URL.revokeObjectURL(url); });
                }, true);
            });
        }

        // 预烤：src 为文章页将用的背景图，blur 为文章页的模糊度；结果以 data URL 存进 sessionStorage，供下一页首帧使用
        var prebaking = "";
        function prebake(src, blur) {
            if (!src || !(blur > 0)) return;
            var tag = src + "|" + blur + "|" + window.innerWidth + "x" + window.innerHeight;
            if (prebaking === tag) return;
            try {
                var p = JSON.parse(sessionStorage.getItem(PREBAKE_KEY));
                if (p && p.src + "|" + p.blur + "|" + p.w + "x" + p.h === tag) return;
            } catch (e) {}
            prebaking = tag;
            loadImage(src, function (img) {
                if (!img) { prebaking = ""; return; }
                blurBlob(img, blur, function (blob) {
                    if (!blob) { prebaking = ""; return; }
                    var fr = new FileReader();
                    fr.onload = function () {
                        prebaking = "";
                        try {
                            sessionStorage.setItem(PREBAKE_KEY, JSON.stringify({
                                src: src, blur: blur, w: window.innerWidth, h: window.innerHeight, url: fr.result
                            }));
                        } catch (e) {}
                    };
                    fr.onerror = function () { prebaking = ""; };
                    fr.readAsDataURL(blob);
                }, false);
            });
        }

        // 文章页首帧已用上预烤的图（head.ejs 挂 html.bg-prebaked + #bg-prebake 样式）：换成与自己烤好时相同的状态，不必再烤
        var prebakeStyle = document.getElementById("bg-prebake");
        var adopted = false;
        if (prebakeStyle && document.documentElement.classList.contains("bg-prebaked")) {
            var pm = prebakeStyle.textContent.match(/url\("([^"]+)"\)/);
            if (pm) {
                rawInline = "";     // 原图仍在 head.ejs 的样式里
                body.style.setProperty("--page-bg-image", 'url("' + pm[1] + '")');
                bakedUrl = pm[1];
                body.classList.add("bg-baked");
                adopted = true;
            }
            prebakeStyle.remove();
            document.documentElement.classList.remove("bg-prebaked");
        }

        // 背景层（body:before）上的过渡都走完再动手：换图时 withoutTransition 会撤掉过渡，
        // 若这时「从文章回首页」的变清晰 / 变亮（header.ejs，0.8s）还没走完，就会被硬切到终点，背景颤一下；
        // 页面加载偏慢时这段过渡开始得晚，固定等 1s 并不总够，所以按实际在跑的动画等
        function whenBgIdle(fn) {
            if (body.classList.contains("no-bg-transition")) {     // header.ejs 还没放开过渡（两帧之后才放）：先等
                requestAnimationFrame(function () { whenBgIdle(fn); });
                return;
            }
            var running = document.getAnimations ? document.getAnimations().filter(function (a) {
                var e = a.effect;
                return e && e.target === body && e.pseudoElement === "::before" && a.playState === "running";
            }) : [];
            if (!running.length) { fn(); return; }
            Promise.all(running.map(function (a) { return a.finished.catch(function () {}); }))
                .then(function () { whenBgIdle(fn); });
        }

        // DOM 就绪（文章封面已换上，见 post.ejs）后等切页过渡走完再烤；不等 load，外部脚本慢时也不耽误
        var scheduled = 0;
        function schedule(delay) {
            clearTimeout(timer);
            var my = ++scheduled, at = seq;             // 期间又排了一次或被 unbake 撤销，就作废
            timer = setTimeout(function () {
                whenBgIdle(function () { if (my === scheduled && at === seq) bake(); });
            }, delay || 0);
        }

        // 预渲染中（首页悬停文章卡片时）还没有过渡要让路，立即烤；点进来时背景已是烤好的图
        if (!adopted) {
            var wait = document.prerendering ? 0 : 1000;
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { schedule(wait); });
            else schedule(wait);
        } else {
            // 用上的是预烤的低密度图（没有抖动）：等一镜到底落定、再空一会儿，按正式规格重烤一张悄悄换上（两张几乎一样，看不出切换）
            (window.vtSettled || Promise.resolve()).then(function () { schedule(1200); });
        }
        window.addEventListener("resize", function () {
            if (window.innerWidth === lastWidth) return; // 只理会宽度变化（地址栏伸缩只改高度）
            lastWidth = window.innerWidth;
            schedule(300);
        });

        return { schedule: schedule, unbake: unbake, prebake: prebake };
    })();

    // 首页：指针移上（或按下、聚焦）文章卡片时，按文章页的模糊度预烤它的背景（见上方 bgBake.prebake）
    // 只有首页（含分页，都有 .home-hero）的卡片会一镜到底进文章，归档 / 标签页不必
    function setupBgPrebake() {
        if (!document.querySelector(".home-hero")) return;
        ks(".post-item.card-style:not(.cw-card)").each(function (card) {
            var layer = card.querySelector(".post-card-img[data-cover]");   // 卡片显示的是缩小的封面，文章页背景用原图（archive-list.ejs 记在 data-cover）
            if (!layer) return;
            function go() {
                var src = layer.getAttribute("data-cover");
                var blur = typeof currentSettings.bgBlur === "number" ? currentSettings.bgBlur : defaultSettings.bgBlur;
                if (src) bgBake.prebake(src, Math.max(0, Math.min(20, blur)));
            }
            ["pointerenter", "pointerdown", "focus"].forEach(function (t) {
                card.addEventListener(t, go, { passive: true });
            });
        });
    }

    // 思源宋体：选「宋体」正文时才加载（首帧前由 head.ejs 按设置插入；在设置里切换时由这里插入），地址须与 head.ejs 一致
    var SERIF_CSS = "https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@300;400;500;600;700&display=swap";
    function loadSerif() {
        if (document.getElementById("font-serif-css")) return;
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.id = "font-serif-css";
        l.href = SERIF_CSS;
        document.head.appendChild(l);
    }

    function applyReadingSettings() {
        // 背景可见度（统一映射到 CSS 变量）
        var bgValue = typeof currentSettings.bgOpacity === "number"
            ? currentSettings.bgOpacity
            : defaultSettings.bgOpacity;
        if (bgValue < 0) bgValue = 0;
        if (bgValue > 100) bgValue = 100;
        // 将 0~100 线性映射到 0~1 的透明度范围，10 => 0.1
        var baseOpacity = bgValue / 100;
        body.style.setProperty("--bg-opacity", String(baseOpacity));

        // 背景模糊度（仅文章页应用持久化的值，首页由初始化和滑动条独立管理）
        if (body.classList.contains("post-page")) {
            var bgBlurValue = typeof currentSettings.bgBlur === "number"
                ? currentSettings.bgBlur
                : defaultSettings.bgBlur;
            bgBlurValue = Math.max(0, Math.min(20, bgBlurValue));
            body.style.setProperty("--bg-blur", bgBlurValue + "px");
        }

        // 字体设置
        var fontFamily = currentSettings.fontFamily || defaultSettings.fontFamily;
        if (fontFamily === "noto-sans-sc") {
            body.style.fontFamily = SOURCE_HAN_FONT_STACK;
        } else {
            body.style.fontFamily = SYSTEM_FONT_STACK;
        }
        document.documentElement.classList.toggle("font-system", fontFamily !== "noto-sans-sc"); // 顶栏的内联字体随之撤掉（glint.css「顶栏字体」）

        // 沉浸模式：开启时由 setupImmersive() 根据滚动收起 / 唤出顶栏；关闭时立即复位
        body.classList.toggle("immersive", !!currentSettings.immersive);
        if (!currentSettings.immersive) document.documentElement.classList.remove("header-hidden");

        // 首页 TODO 侧边栏显示 / 隐藏
        if (currentSettings.hideTodo) {
            body.classList.add("hide-todo");
        } else {
            body.classList.remove("hide-todo");
        }

        // 主题色：默认天青不挂属性，其余挂 html[data-accent]
        var accent = currentSettings.accent || defaultSettings.accent;
        if (accent === "blue") document.documentElement.removeAttribute("data-accent");
        else document.documentElement.setAttribute("data-accent", accent);

        // 文章阅读排版（仅在阅读页生效）
        if (body.classList.contains("post-page")) {
            body.style.setProperty("--reader-font-weight", String(currentSettings.fontWeight));
            body.style.setProperty("--reader-letter-spacing", (currentSettings.letterSpacing / 100) + "em");
            body.style.setProperty("--reader-font-size", (currentSettings.fontSize / 100) + "rem");
            body.style.setProperty("--reader-line-height", String(currentSettings.lineHeight));
            body.style.setProperty("--reader-para", currentSettings.paraSpacing + "em");
            body.style.setProperty("--reader-width", currentSettings.readWidth + "em");
            body.style.setProperty("--reader-indent", currentSettings.indent ? "2em" : "0");
            var serif = currentSettings.bodyFont === "serif";
            if (serif) loadSerif();
            body.classList.toggle("reader-serif", serif);
        }
    }

    function updateSliderFill(input) {
        if (input._gs) input._gs.sync();   // 滑动条由 makeSlider 画（见下方）
    }

    function updateAllSliderFills() {
        var sliders = document.querySelectorAll(".settings-row-range input[type='range'], .settings-tile input[type='range']");
        for (var i = 0; i < sliders.length; i++) updateSliderFill(sliders[i]);
    }

    // 设置面板的无极滑动条「液态胶囊」（glint.css「设置面板 · 无极滑动条」）
    // 原生 input 改成 step="any"、透明地叠在最上面，拖动 / 点按 / 键盘 / 读屏都还是它；胶囊的样子由这里按数值逐帧画：
    // 显示位置用一根很硬的弹簧跟着数值——拖动时几乎贴手，点轨道跳位、松手吸附时滑过去，不瞬移
    // snap：本来就分档的设置（字重），拖动时照样无极，松手后吸附到最近一档
    var GS_SLIDERS = {
        "setting-font-weight": { snap: true, format: function (v) { return String(getWeightFromLevel(Math.round(v))); } },
        "setting-letter-spacing": { format: function (v) { return (v > 0.05 ? "+" : "") + v.toFixed(1); } },
        "setting-font-size": { format: function (v) { return Math.round(v) + "%"; } },
        "setting-bg-opacity": { format: function (v) { return Math.round(v * 2) + "%"; } },
        "setting-bg-blur": { format: function (v) { return v.toFixed(1) + "px"; } },
        "setting-home-blur": { format: function (v) { return v.toFixed(1) + "px"; } },
        "setting-line-height": { format: function (v) { return v.toFixed(2); } },
        "setting-para-spacing": { format: function (v) { return v.toFixed(1) + "em"; } },
        "setting-read-width": { format: function (v) { return Math.round(v) + "em"; } }
    };

    function makeSlider(input, opt) {
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var wrap = document.createElement("glint-slider");
        wrap.innerHTML = "<gs-track><gs-fill></gs-fill><gs-grip></gs-grip><gs-val></gs-val></gs-track>";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        var val = wrap.querySelector("gs-val");
        var min = parseFloat(input.min) || 0, max = parseFloat(input.max) || 100;
        var x = 0, v = 0, target = 0;           // 显示位置（0–1）与它的速度
        var frame = 0, last = 0;

        function readP() {
            var p = (parseFloat(input.value) - min) / (max - min);
            return Math.min(1, Math.max(0, p || 0));
        }
        function step(now) {
            frame = 0;
            var dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
            last = now;
            if (reduce) { x = target; v = 0; }
            else for (var i = 0; i < 4; i++) {  // ω≈55、临界阻尼：约 60ms 到位，不过冲
                v += (-3000 * (x - target) - 110 * v) * dt / 4;
                x += v * dt / 4;
            }
            var busy = Math.abs(x - target) > 1e-4 || Math.abs(v) > 1e-3;
            if (!busy) { x = target; v = 0; last = 0; }
            wrap.style.setProperty("--p", x.toFixed(4));
            if (busy) frame = requestAnimationFrame(step);
        }
        function sync(jump) {
            target = readP();
            val.textContent = opt.format(parseFloat(input.value) || 0);
            if (jump) { x = target; v = 0; }
            if (!frame) frame = requestAnimationFrame(step);
        }
        // 松手 / 键盘改完：分档的设置吸附到最近一档（发一次 input，让设置照常生效；胶囊由弹簧滑过去）
        function settle() {
            if (!opt.snap) return;
            var n = String(Math.round(parseFloat(input.value)));
            if (input.value === n) return;
            input.value = n;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        input.addEventListener("pointerdown", function () {
            wrap.classList.add("is-active");
            function up() {
                wrap.classList.remove("is-active");
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
                settle();
            }
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
        });
        input.addEventListener("change", settle);
        sync(true);
        return { sync: sync };
    }

    function setupFancySliders() {
        Object.keys(GS_SLIDERS).forEach(function (id) {
            var input = document.getElementById(id);
            if (!input || input._gs) return;
            input._gs = makeSlider(input, GS_SLIDERS[id]);
        });
    }

    // 浮层（设置面板 / 手机端导航卡片）同时打开时，后打开的置于最上层
    function bringToFront(el) {
        var tops = document.querySelectorAll(".on-top");
        for (var i = 0; i < tops.length; i++) tops[i].classList.remove("on-top");
        el.classList.add("on-top");
    }

    // 非模态浮层：关闭时立即隔离焦点；保留 CSS 收起动效，不锁住页面其它区域。
    var disclosures = [];
    function bindDisclosure(panel, trigger, className, visible, options) {
        options = options || {};
        function sync() {
            var open = visible ? visible() : panel.classList.contains(className);
            // 先转移焦点，再设 inert；真实浏览器可能在设 inert 的瞬间就把焦点丢到 body。
            if (!open && panel.contains(document.activeElement)) {
                if (trigger) trigger.focus();
                else document.activeElement.blur();
            }
            panel.toggleAttribute("inert", !open);
            panel.setAttribute("aria-hidden", String(!open));
            if (trigger) trigger.setAttribute("aria-expanded", String(open));
        }
        function set(open, restore) {
            panel.classList.toggle(className, open);
            if (open) bringToFront(panel);
            sync();
            if (restore && trigger) trigger.focus();
        }
        var observer = new MutationObserver(sync);
        observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        observer.observe(body, { attributes: true, attributeFilter: ["class"] });
        disclosures.push({ panel: panel, trigger: trigger, set: set, dismiss: options.dismiss || function () { set(false, true); },
            canDismiss: options.canDismiss || function () { return panel.classList.contains(className); },
            visible: function () { return panel.getAttribute("aria-hidden") === "false"; }
        });
        sync();
        return set;
    }
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
        var open = disclosures.filter(function (d) { return d.visible() && d.canDismiss(); });
        var chosen = open.find(function (d) { return d.panel.contains(document.activeElement) || d.trigger === document.activeElement; }) ||
            open.find(function (d) { return d.panel.classList.contains("on-top"); }) || open[open.length - 1];
        if (!chosen) return;
        chosen.dismiss();
        e.preventDefault();
    });

    function setupSettingsPanel() {
        var panel = document.getElementById("reader-settings-panel");
        var btn = ks.select(".settings-btn");

        if (!panel || !btn) return;

        var immersiveInput = document.getElementById("setting-immersive");
        var hideTodoInput = document.getElementById("setting-hide-todo");
        var fontFamilyInput = document.getElementById("setting-font-family");
        var weightInput = document.getElementById("setting-font-weight");
        var letterInput = document.getElementById("setting-letter-spacing");
        var sizeInput = document.getElementById("setting-font-size");
        var bgInput = document.getElementById("setting-bg-opacity");
        var bgBlurInput = document.getElementById("setting-bg-blur");
        var homeBlurInput = document.getElementById("setting-home-blur");
        var resetBtn = document.getElementById("setting-reset-btn");
        var accentInput = document.getElementById("setting-accent");
        var accentName = document.getElementById("setting-accent-name");
        var themeModeInput = document.getElementById("setting-theme-mode");
        function setThemeModeSegment(value) {
            if (!themeModeInput) return;
            themeModeInput.setAttribute("data-value", value);
            [].forEach.call(themeModeInput.querySelectorAll("button"), function (b) {
                b.setAttribute("aria-checked", String(b.getAttribute("data-value") === value));
            });
        }
        setThemeModeSegment(currentSettings.themeMode || "dark");
        if (themeModeInput) {
            themeModeInput.addEventListener("click", function (e) {
                var opt = e.target.closest("button[data-value]");
                if (!opt) return;
                var value = opt.getAttribute("data-value");
                if (value === (currentSettings.themeMode || "dark")) return;
                setThemeModeSegment(value);
                currentSettings.themeMode = value;
                persistSettings();
                try { sessionStorage.removeItem("theme-pick"); } catch (err) {}   // 改了模式就不再沿用本次浏览中的临时切换
                setDark(modeIsDark());
            });
        }
        var bodyFontInput = document.getElementById("setting-body-font");
        var lineInput = document.getElementById("setting-line-height");
        var paraInput = document.getElementById("setting-para-spacing");
        var widthInput = document.getElementById("setting-read-width");
        var indentInput = document.getElementById("setting-indent");
        function setBodyFontSegment(value) {
            if (!bodyFontInput) return;
            bodyFontInput.setAttribute("data-value", value);
            [].forEach.call(bodyFontInput.querySelectorAll("button"), function (b) {
                b.setAttribute("aria-checked", String(b.getAttribute("data-value") === value));
            });
        }

        // 初始化表单值
        if (immersiveInput) immersiveInput.checked = !!currentSettings.immersive;
        if (hideTodoInput) hideTodoInput.checked = !!currentSettings.hideTodo;
        // 字体二选一按钮：data-value 驱动滑块位置，各按钮文字用对应字体显示以便预览
        function setFontSegment(value) {
            fontFamilyInput.setAttribute("data-value", value);
            var opts = fontFamilyInput.querySelectorAll("button");
            for (var i = 0; i < opts.length; i++) {
                opts[i].setAttribute("aria-checked", String(opts[i].getAttribute("data-value") === value));
            }
        }
        if (fontFamilyInput) {
            var fontOpts = fontFamilyInput.querySelectorAll("button");
            for (var fi = 0; fi < fontOpts.length; fi++) {
                fontOpts[fi].style.fontFamily = fontOpts[fi].getAttribute("data-value") === "noto-sans-sc"
                    ? SOURCE_HAN_FONT_STACK : SYSTEM_FONT_STACK;
            }
            setFontSegment(currentSettings.fontFamily || defaultSettings.fontFamily);
        }
        // 主题色色块：选中项挂 aria-checked，分组标题右侧显示名称
        function setAccentSwatch(value) {
            var opts = accentInput.querySelectorAll("button");
            for (var i = 0; i < opts.length; i++) {
                var on = opts[i].getAttribute("data-value") === value;
                opts[i].setAttribute("aria-checked", String(on));
                if (on && accentName) accentName.textContent = opts[i].getAttribute("data-name");
            }
        }
        if (accentInput) setAccentSwatch(currentSettings.accent || defaultSettings.accent);
        if (weightInput) weightInput.value = getLevelFromWeight(currentSettings.fontWeight);
        if (letterInput) letterInput.value = currentSettings.letterSpacing;
        if (sizeInput) sizeInput.value = currentSettings.fontSize;
        if (lineInput) lineInput.value = currentSettings.lineHeight;
        if (paraInput) paraInput.value = currentSettings.paraSpacing;
        if (widthInput) widthInput.value = currentSettings.readWidth;
        if (indentInput) indentInput.checked = !!currentSettings.indent;
        if (bodyFontInput) {
            bodyFontInput.querySelector('[data-value="serif"]').style.fontFamily = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
            setBodyFontSegment(currentSettings.bodyFont || "sans");
        }
        if (bgInput) bgInput.value = ((typeof currentSettings.bgOpacity === "number"
            ? currentSettings.bgOpacity
            : defaultSettings.bgOpacity) / 2);
        var isPostPage = body.classList.contains("post-page");
        // 「背景模糊」分两项：阅读页（bgBlur，CW 预告页也用它）与首页（homeBlur，首页、归档等其余页面）。
        // 两个滑动条在哪页都显示、都能调；只有调的正是当前页用的那一项时才实时预览
        var isBlurPage = isPostPage || body.classList.contains("soon-page");
        var savedBlur = typeof currentSettings.bgBlur === "number" ? currentSettings.bgBlur : defaultSettings.bgBlur;
        var savedHomeBlur = typeof currentSettings.homeBlur === "number" ? currentSettings.homeBlur : defaultSettings.homeBlur;
        var initBlur = isBlurPage ? savedBlur : savedHomeBlur;
        if (bgBlurInput) bgBlurInput.value = savedBlur;
        if (homeBlurInput) homeBlurInput.value = savedHomeBlur;
        // header.ejs 开头已按同样的规则设好（从文章回首页时还在从文章页的模糊度往 0 过渡）：已设过就不再覆盖，
        // 否则这里若赶在它放开过渡之前执行，模糊会瞬间清零，不走动画
        if (!body.style.getPropertyValue("--bg-blur")) body.style.setProperty("--bg-blur", initBlur + "px");

        updateAllSliderFills();

        // 分页「外观 / 阅读」：阅读页默认打开「阅读」，其余页面打开「外观」；本次浏览中记住上次停在哪页
        var tabBar = panel.querySelector(".settings-tabs");
        if (tabBar) {
            var TAB_KEY = "glint-settings-tab";
            var tabBtns = [].slice.call(tabBar.querySelectorAll("[role='tab']"));
            var panes = [].slice.call(panel.querySelectorAll(".settings-pane"));
            var setTab = function (name, focus) {
                tabBar.setAttribute("data-tab", name);
                tabBtns.forEach(function (b) {
                    var on = b.getAttribute("data-tab") === name;
                    b.setAttribute("aria-selected", String(on));
                    b.tabIndex = on ? 0 : -1;
                    if (on && focus) b.focus();
                });
                panes.forEach(function (p) {
                    var on = p.getAttribute("data-pane") === name;
                    p.setAttribute("aria-hidden", String(!on));
                    p.toggleAttribute("inert", !on);
                });
                try { sessionStorage.setItem(TAB_KEY, name); } catch (e) {}
            };
            var savedTab = null;
            try { savedTab = sessionStorage.getItem(TAB_KEY); } catch (e) {}
            setTab(savedTab === "look" || savedTab === "read" ? savedTab : (isPostPage ? "read" : "look"));
            tabBar.addEventListener("click", function (e) {
                var b = e.target.closest("[role='tab']");
                if (b) setTab(b.getAttribute("data-tab"));
            });
            tabBar.addEventListener("keydown", function (e) {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                setTab(tabBar.getAttribute("data-tab") === "look" ? "read" : "look", true);
            });
        }

        // 二选一按钮与分页也能拖动选择：按住拖，白色滑块跟着指针走，松手选中最近的一项（glintDragPick 见 header.ejs）
        if (window.glintDragPick) [].forEach.call(panel.querySelectorAll(".settings-segment, .settings-tabs"), function (box) {
            var btns = [].slice.call(box.querySelectorAll("button"));
            var pad = box.classList.contains("settings-tabs") ? 3 : 2;     // 与 glint.css 里滑块的内缩一致
            window.glintDragPick(box, {
                items: function () { return btns; },
                move: function (x, b) {
                    var r = box.getBoundingClientRect(), w = (r.width - pad * 2) / btns.length;
                    box.style.setProperty("--drag-x", Math.max(0, Math.min(r.width - pad * 2 - w, x - r.left - pad - w / 2)) + "px");
                    btns.forEach(function (o) { o.classList.toggle("is-drag-target", o === b); });
                },
                end: function (b) {
                    box.style.removeProperty("--drag-x");
                    btns.forEach(function (o) { o.classList.remove("is-drag-target"); });
                    if (b && b.getAttribute("aria-checked") !== "true" && b.getAttribute("aria-selected") !== "true") b.click();
                }
            });
        });

        var setPanelOpen = bindDisclosure(panel, btn, "open");
        // 打开 / 关闭面板
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            setPanelOpen(!panel.classList.contains("open"));
        });

        document.addEventListener("click", function (e) {
            if (!panel.classList.contains("open")) return;
            if (panel.contains(e.target) || e.target === btn) return;
            setPanelOpen(false);
        });

        // 绑定设置变更
        if (immersiveInput) {
            immersiveInput.addEventListener("change", function () {
                currentSettings.immersive = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (hideTodoInput) {
            hideTodoInput.addEventListener("change", function () {
                currentSettings.hideTodo = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (fontFamilyInput) {
            fontFamilyInput.addEventListener("click", function (e) {
                var opt = e.target.closest("button[data-value]");
                if (!opt) return;
                var value = opt.getAttribute("data-value");
                if (value === currentSettings.fontFamily) return;
                setFontSegment(value);
                currentSettings.fontFamily = value;
                persistSettings();
                applyReadingSettings();
            });
        }

        // 界面主题（Glint / Origin）：滑块先滑过去，再跳到另一套界面的同一页（window.switchUI 见 _partial/ui-switch.ejs）
        var uiInput = document.getElementById("setting-ui");
        if (uiInput) {
            uiInput.addEventListener("click", function (e) {
                var opt = e.target.closest("button[data-value]");
                if (!opt || opt.getAttribute("aria-checked") === "true") return;
                var value = opt.getAttribute("data-value");
                uiInput.setAttribute("data-value", value);
                var opts = uiInput.querySelectorAll("button");
                for (var i = 0; i < opts.length; i++) opts[i].setAttribute("aria-checked", String(opts[i] === opt));
                setTimeout(function () { if (window.switchUI) window.switchUI(value); }, 280);
            });
        }

        // 切换主题色：支持时用一次视图过渡，让全站颜色整体淡入新色，而不是各处按自己的过渡时长先后变色
        function switchAccent(value) {
            function apply() {
                setAccentSwatch(value);
                currentSettings.accent = value;
                persistSettings();
                applyReadingSettings();
                updateAllSliderFills();
            }
            if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                document.startViewTransition(apply);
            } else {
                apply();
            }
        }
        if (accentInput) {
            accentInput.addEventListener("click", function (e) {
                var opt = e.target.closest("button[data-value]");
                if (!opt) return;
                var value = opt.getAttribute("data-value");
                if (value === (currentSettings.accent || defaultSettings.accent)) return;
                switchAccent(value);
            });
        }

        if (weightInput) {
            weightInput.addEventListener("input", function () {
                var lvl = Math.round(parseFloat(this.value)) || 3;    // 拖动时无极，字重按最近一档生效；松手后滑动条吸附过去
                currentSettings.fontWeight = getWeightFromLevel(lvl);
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        if (letterInput) {
            letterInput.addEventListener("input", function () {
                currentSettings.letterSpacing = Math.round((parseFloat(this.value) || 0) * 100) / 100;   // 无极：不再取整
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        function bindReaderSlider(input, key, round) {
            if (!input) return;
            input.addEventListener("input", function () {
                var v = parseFloat(this.value);
                if (isNaN(v)) v = defaultSettings[key];
                currentSettings[key] = Math.round(v * round) / round;
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }
        bindReaderSlider(lineInput, "lineHeight", 100);
        bindReaderSlider(paraInput, "paraSpacing", 100);
        bindReaderSlider(widthInput, "readWidth", 10);
        if (indentInput) {
            indentInput.addEventListener("change", function () {
                currentSettings.indent = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }
        if (bodyFontInput) {
            bodyFontInput.addEventListener("click", function (e) {
                var opt = e.target.closest("button[data-value]");
                if (!opt) return;
                var value = opt.getAttribute("data-value");
                if (value === (currentSettings.bodyFont || "sans")) return;
                setBodyFontSegment(value);
                currentSettings.bodyFont = value;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (sizeInput) {
            sizeInput.addEventListener("input", function () {
                currentSettings.fontSize = Math.round((parseFloat(this.value) || defaultSettings.fontSize) * 10) / 10;
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        if (bgInput) {
            bgInput.addEventListener("input", function () {
                var v = parseFloat(this.value, 10);
                if (isNaN(v)) v = defaultSettings.bgOpacity / 2;
                if (v < 0) v = 0;
                if (v > 50) v = 50;
                currentSettings.bgOpacity = Math.round(v * 20) / 10;
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        // live：这一项是否作用于当前页（是才实时预览、松手重烤）
        function bindBlur(input, key, live) {
            if (!input) return;
            input.addEventListener("input", function () {
                var v = Math.round(parseFloat(this.value) * 10) / 10;
                if (isNaN(v) || v < 0) v = 0;
                if (v > 20) v = 20;
                currentSettings[key] = v;
                persistSettings();
                if (live) {
                    bgBake.unbake(); // 拖动中用 CSS 模糊实时预览
                    body.style.setProperty("--bg-blur", v + "px");
                    try { sessionStorage.setItem("glint-bg-blur", String(v)); } catch (err) {}   // 下一页从这个模糊度过渡（header.ejs）
                }
                updateSliderFill(this);
            });
            input.addEventListener("change", function () { if (live) bgBake.schedule(); }); // 松手后重新烘焙
        }
        bindBlur(bgBlurInput, "bgBlur", isBlurPage);
        bindBlur(homeBlurInput, "homeBlur", !isBlurPage);

        if (resetBtn) {
            resetBtn.addEventListener("click", function () {
                currentSettings.immersive = defaultSettings.immersive;
                currentSettings.hideTodo = defaultSettings.hideTodo;
                currentSettings.fontFamily = defaultSettings.fontFamily;
                currentSettings.fontWeight = defaultSettings.fontWeight;
                currentSettings.letterSpacing = defaultSettings.letterSpacing;
                currentSettings.fontSize = defaultSettings.fontSize;
                currentSettings.bgOpacity = defaultSettings.bgOpacity;
                currentSettings.bgBlur = defaultSettings.bgBlur;
                currentSettings.homeBlur = defaultSettings.homeBlur;
                currentSettings.accent = defaultSettings.accent;
                ["themeMode", "bodyFont", "lineHeight", "paraSpacing", "readWidth", "indent"].forEach(function (k) { currentSettings[k] = defaultSettings[k]; });
                setThemeModeSegment(currentSettings.themeMode);
                try { sessionStorage.removeItem("theme-pick"); } catch (err) {}
                setDark(modeIsDark());

                persistSettings();
                applyReadingSettings();

                var resetBlur = isBlurPage ? defaultSettings.bgBlur : defaultSettings.homeBlur;
                if (parseFloat(body.style.getPropertyValue("--bg-blur")) !== resetBlur) {
                    bgBake.unbake();
                    body.style.setProperty("--bg-blur", resetBlur + "px");
                    try { sessionStorage.setItem("glint-bg-blur", String(resetBlur)); } catch (err) {}
                    bgBake.schedule(900); // 等模糊过渡走完
                }

                if (immersiveInput) immersiveInput.checked = !!currentSettings.immersive;
                if (hideTodoInput) hideTodoInput.checked = !!currentSettings.hideTodo;
                if (fontFamilyInput) setFontSegment(currentSettings.fontFamily);
                if (accentInput) setAccentSwatch(currentSettings.accent);
                if (weightInput) weightInput.value = getLevelFromWeight(currentSettings.fontWeight);
                if (letterInput) letterInput.value = currentSettings.letterSpacing;
                if (sizeInput) sizeInput.value = currentSettings.fontSize;
                if (lineInput) lineInput.value = currentSettings.lineHeight;
                if (paraInput) paraInput.value = currentSettings.paraSpacing;
                if (widthInput) widthInput.value = currentSettings.readWidth;
                if (indentInput) indentInput.checked = !!currentSettings.indent;
                setBodyFontSegment(currentSettings.bodyFont);
                if (bgInput) bgInput.value = currentSettings.bgOpacity / 2;
                if (bgBlurInput) bgBlurInput.value = defaultSettings.bgBlur;
                if (homeBlurInput) homeBlurInput.value = defaultSettings.homeBlur;
                updateAllSliderFills();
            });
        }
    }

    // 首页右上角从按钮本身长出来的浮层（.corner-morph，见 glint.css「首页右上角浮层」）：
    // 打开前量好起点（按钮 / 胶囊的布局尺寸，不含按下时的缩放）与终点高度写进 CSS 变量
    // onToggle(open, 终点高度)：开合时回调（含 Esc 收起），可选
    function cornerMorph(panel, trigger, anchor, onToggle) {
        var inner = panel.querySelector(".corner-morph-inner");
        var openH = 0;
        function measure() {
            panel.style.setProperty("--from-w", anchor.offsetWidth + "px");
            panel.style.setProperty("--from-h", anchor.offsetHeight + "px");
            openH = Math.max(inner ? inner.offsetHeight + 2 : 0, anchor.offsetHeight); // 加上下 1px 边框；至少与按钮竖栏一样高
            panel.style.setProperty("--open-h", openH + "px");
        }
        var setOpen = bindDisclosure(panel, trigger, "open");
        function set(open, restore) {
            if (open) measure();
            setOpen(open, restore);
        }
        measure();
        if (onToggle) {
            var was = null;
            new MutationObserver(function () {
                var open = panel.classList.contains("open");
                if (open !== was) onToggle(was = open, openH);
            }).observe(panel, { attributes: true, attributeFilter: ["class"] });
        }
        trigger.addEventListener("click", function (e) {
            e.stopPropagation();
            set(!panel.classList.contains("open"));
        });
        // 点浮层外面收起（点胶囊上的按钮不算）
        document.addEventListener("click", function (e) {
            if (!panel.classList.contains("open")) return;
            if (e.target.closest && e.target.closest(".corner-morph, .bg-dock")) return;
            set(false);
        });
        return set;
    }

    // 首页背景切换（_data/backgrounds.yml）：首页右上角的按钮 + 浮层 .bg-picker，顶栏导航收起时入口在导航卡片的 .head-menu-bg
    // 平时只放极缩略图，且要等打开浮层 / 导航卡片才加载；选中后才加载原图，解码好再淡出、换图、淡入
    // 所选写进 head 里的 #bg-choice 样式（与 head.ejs 首帧套用的同一份），选回默认就撤掉；body 的类名变化会让水波纹重新合成静水画面
    function setupBgSwitch() {
        var BG_KEY = "whatasiger_home_bg";      // 与 head.ejs 首帧读取的键一致
        var tiles = [].slice.call(document.querySelectorAll(".bg-tile[data-bg-id]"));
        if (!tiles.length) return;
        var DAILY = "@daily";                   // 「每日轮换」：按日期在各张之间轮换，算法与 head.ejs 首帧一致
        var real = [];                          // 真实的背景 id（按 backgrounds.yml 顺序，去重）
        tiles.forEach(function (t) {
            var id = t.getAttribute("data-bg-id");
            if (id !== DAILY && real.indexOf(id) === -1) real.push(id);
        });
        function todayId() {
            var d = new Date();
            var day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
            return real[day % real.length];
        }
        function resolve(id) { return id === DAILY ? todayId() : id; }
        var credits = [].slice.call(document.querySelectorAll(".bg-credit"));
        var btn = ks.select(".bg-switch");
        var picker = document.getElementById("bg-picker");
        var nav = document.querySelector(".head-menu");

        function srcOf(id) {
            id = resolve(id);
            for (var i = 0; i < tiles.length; i++) {
                if (tiles[i].getAttribute("data-bg-id") === id) return tiles[i].getAttribute("data-bg-src");
            }
            return "";
        }
        var defaultTile = tiles.filter(function (t) { return t.hasAttribute("data-bg-default"); })[0] || tiles[0];
        var defaultId = defaultTile.getAttribute("data-bg-id");
        var shown = defaultId;                  // 屏上正显示的那张
        try {
            var saved = localStorage.getItem(BG_KEY);
            if (saved && (saved === DAILY || srcOf(saved))) shown = saved;
        } catch (e) {}
        var chosen = shown;                     // 刚选中的那张（原图可能还在加载）
        var seq = 0;                            // 连点时只认最后一次

        function tileOf(id) {
            for (var i = 0; i < tiles.length; i++) if (tiles[i].getAttribute("data-bg-id") === id && tiles[i].hasAttribute("data-bg-src")) return tiles[i];
            return null;
        }
        function mark() {
            var today = chosen === DAILY ? todayId() : "";
            tiles.forEach(function (t) {
                var id = t.getAttribute("data-bg-id");
                t.classList.toggle("is-current", id === chosen);
                t.classList.toggle("is-today", id === today);   // 每日轮换时，当天轮到的那张描一圈虚线
                t.classList.toggle("is-loading", id === chosen && id !== shown);
                t.setAttribute("aria-checked", String(id === chosen));
            });
            // 署名：屏上那张的画师与出处
            var t = tileOf(resolve(shown));
            var name = t && t.getAttribute("data-bg-name"), artist = t && t.getAttribute("data-bg-artist"), link = t && t.getAttribute("data-bg-link");
            credits.forEach(function (c) {
                c.classList.toggle("is-empty", !artist);
                c.innerHTML = artist ? (shown === DAILY ? '<span class="bg-credit-tag">今日</span>' : "") + "「" + name + "」by " +
                    (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + artist + '<i class="fa fa-external-link" aria-hidden="true"></i></a>' : artist) : "";
            });
        }

        var thumbsLoaded = false;
        function loadThumbs() {
            if (thumbsLoaded) return;
            thumbsLoaded = true;
            tiles.forEach(function (t) {
                if (t.hasAttribute("data-bg-thumb")) t.querySelector(".bg-tile-img").style.backgroundImage = 'url("' + t.getAttribute("data-bg-thumb") + '")';
            });
        }

        function save(id) {
            try {
                if (id === defaultId) localStorage.removeItem(BG_KEY);
                else localStorage.setItem(BG_KEY, id);
            } catch (e) {}
        }

        function setChoice(id) {
            var st = document.getElementById("bg-choice");
            if (resolve(id) === defaultId) { if (st) st.remove(); return; }
            if (!st) {
                st = document.createElement("style");
                st.id = "bg-choice";
                document.head.appendChild(st);
            }
            st.textContent = 'body{--page-bg-image:url("' + srcOf(id) + '")}';
        }

        function choose(id) {
            if (id === chosen) return;
            var my = ++seq;
            chosen = id;
            if (resolve(id) === resolve(shown)) {          // 换成「每日轮换」而今天正好轮到屏上这张（或反之）：不必换图
                save(id);
                shown = id;
                setChoice(id);
                mark();
                return;
            }
            mark();
            var img = new Image();
            var ready = new Promise(function (resolve, reject) {
                img.onload = resolve;
                img.onerror = reject;
            }).then(function () { return img.decode ? img.decode().catch(function () {}) : null; });
            img.src = srcOf(id);
            ready.then(function () {
                if (my !== seq) return;
                save(id);
                var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                body.classList.add("bg-swapping");      // 先淡出（body:before 自带透明度过渡）
                setTimeout(function () {
                    if (my !== seq) return;
                    bgBake.unbake();                    // 烤过的图是旧背景，撤掉后按新图重来
                    setChoice(id);
                    shown = id;
                    mark();
                    bgBake.schedule(0);
                    requestAnimationFrame(function () { body.classList.remove("bg-swapping"); });
                }, reduce ? 0 : 280);
            }, function () {
                if (my !== seq) return;
                chosen = shown;                         // 原图没载下来：退回屏上那张
                mark();
            });
        }

        tiles.forEach(function (t) {
            t.addEventListener("click", function () { choose(t.getAttribute("data-bg-id")); });
        });
        mark();

        if (btn && picker) {
            btn.addEventListener("pointerdown", loadThumbs);    // 按下就开始取缩略图，展开时多半已到
            btn.addEventListener("click", loadThumbs);
            cornerMorph(picker, btn, btn.closest(".bg-dock") || btn);  // 从整条胶囊（背景 + 沉浸）长出来，同音乐
        }

        // 导航卡片里的那排：卡片展开时才加载缩略图
        if (nav && nav.querySelector(".head-menu-bg")) {
            new MutationObserver(function () {
                if (nav.classList.contains("active")) loadThumbs();
            }).observe(nav, { attributes: true, attributeFilter: ["class"] });
        }
    }

    // 首页沉浸：中央卡片（博主卡、文章卡片、分页）与 Gizmo 叶片淡出，只留背景、TODO 与右上角两枚胶囊；
    // 淡出后再挂 home-zen-done 把 main 收成一屏高，底栏落在屏幕底边外，一下滑就露出来（glint.css「首页沉浸」）
    // 入口：右上角 .bg-dock 下半的按钮，导航收起时是导航卡片里的 .head-menu-zen；本次浏览中记住（sessionStorage，首帧见 index.ejs）
    function setupHomeZen() {
        var KEY = "glint-home-zen";
        var btns = [].slice.call(document.querySelectorAll(".zen-switch"));
        if (!btns.length) return;
        var root = document.documentElement;
        var timer = 0;
        function mark(on) {
            btns.forEach(function (b) {
                b.setAttribute("aria-pressed", String(on));
                if (!b.classList.contains("head-menu-zen")) b.setAttribute("aria-label", on ? "退出沉浸" : "沉浸：只留背景");
                var label = b.querySelector("span");
                if (label) label.textContent = on ? "退出沉浸" : "沉浸：只留背景";
                var icon = b.querySelector(".fa");
                if (icon) icon.className = "fa " + (on ? "fa-compress" : "fa-expand");
            });
        }
        function set(on) {
            clearTimeout(timer);
            try { on ? sessionStorage.setItem(KEY, "1") : sessionStorage.removeItem(KEY); } catch (e) {}
            mark(on);
            if (on) {
                var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                root.classList.add("home-zen");
                timer = setTimeout(function () { root.classList.add("home-zen-done"); }, reduce ? 0 : 420); // 与卡片淡出时长一致
            } else {
                root.classList.remove("home-zen", "home-zen-done");  // 卡片重新播一遍入场动画
            }
        }
        btns.forEach(function (b) {
            b.addEventListener("click", function () { set(!root.classList.contains("home-zen")); });
        });
        mark(root.classList.contains("home-zen"));
    }

    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];
        var toggleBtn = ks.select(".toggle-btn");

        var setMenuOpen = menu && bindDisclosure(menu, toggleBtn, "active", function () {
            return !document.documentElement.classList.contains("nav-collapsed") || menu.classList.contains("active");
        }, { canDismiss: function () {
            return document.documentElement.classList.contains("nav-collapsed") && menu.classList.contains("active");
        } });
        if (toggleBtn && menu) toggleBtn.onclick = function (e) {
            e.stopPropagation();
            setMenuOpen(!menu.classList.contains("active"));
        };

        // 点击菜单内的链接后自动收起（手机端浮动菜单体验）
        if (menu) {
            var menuLinks = menu.querySelectorAll("a");
            menuLinks.forEach(function (link) {
                link.addEventListener("click", function () {
                    setMenuOpen(false);
                });
            });
        }

        // 点击菜单外部区域时关闭菜单
        document.addEventListener("click", function (e) {
            if (menu && menu.classList.contains("active")) {
                if (!menu.contains(e.target) && e.target !== toggleBtn) {
                    setMenuOpen(false);
                }
            }
        });

        ks.select(".light-btn").onclick = this.night;

        // 增加安全检查：只有搜索按钮存在时才绑定点击事件
        var search = document.getElementsByClassName("search-btn")[0];
        var bar = document.getElementsByClassName("head-search")[0];

        if (search && bar) {
            var setSearchOpen = bindDisclosure(bar, search, "active", function () {
                return window.innerWidth >= 600 || bar.classList.contains("active");
            }, { canDismiss: function () {
                return window.innerWidth < 600 && bar.classList.contains("active");
            } });
            window.addEventListener("resize", function () { setSearchOpen(bar.classList.contains("active")); });
            search.addEventListener("click", function () {
                var open = !bar.classList.contains("active");
                setSearchOpen(open);
                if (open) bar.querySelector("input").focus();
            });
        }

        // 初始化右上角设置面板
        setupSettingsPanel();
        setupFancySliders();
        setupBgSwitch();
        setupHomeZen();
    };

    // 沉浸模式：向下滚动即收起顶栏；向上滚动要够快才唤出（慢慢往回翻不会打扰阅读）
    // 「够快」= 最近 450ms 内向上滚过的距离达到 500px（约 1.11px/ms）：滚轮拨一两格不会触发，连拨到 500px 以上 / 快速上滑才会
    function setupImmersive() {
        var root = document.documentElement;
        var REVEAL_WINDOW = 450;    // ms：只统计这段时间内的上滑距离（一次连拨滚轮通常在这之内）
        var REVEAL_DISTANCE = 500;  // px：上滑达到这个距离才唤出顶栏
        var TOP_ZONE = 64;          // 离页顶这么近时始终显示顶栏
        var samples = [];           // 最近的 { t, y }
        var lastY = window.pageYOffset || 0;

        // 有浮层打开或正在搜索时不收起，免得面板没了依托
        function busy() {
            return !!document.querySelector(".settings-panel.open, .bg-picker.open, .head-menu.active, .head-search.active, .search-panel.open") ||
                (document.activeElement && document.activeElement.id === "local-search-input");
        }

        function update() {
            var y = window.pageYOffset || 0;
            var now = performance.now();
            var dy = y - lastY;
            lastY = y;

            if (!body.classList.contains("immersive")) { samples.length = 0; return; }

            if (y <= TOP_ZONE || busy()) {
                root.classList.remove("header-hidden");
                samples.length = 0;
                return;
            }

            if (dy > 0) {
                // 向下：收起，并清掉上滑记录
                root.classList.add("header-hidden");
                samples.length = 0;
                return;
            }
            if (dy === 0) return;

            // 向上：只看最近一小段时间内滚过的距离
            // 刚开始上滑、或距上次滚动已隔了一阵（慢慢往上翻）时，以这一步的起点重新计；一次跳很远（如 PageUp）也算快
            if (!samples.length || now - samples[samples.length - 1].t > REVEAL_WINDOW) {
                samples = [{ t: now, y: y - dy }];
            }
            samples.push({ t: now, y: y });
            while (samples.length > 1 && now - samples[0].t > REVEAL_WINDOW) samples.shift();
            if (samples[0].y - y >= REVEAL_DISTANCE) root.classList.remove("header-hidden");
        }

        onScrollFrame(update);
    }

    // 首页封面卡片的悬浮感：轻微倾斜 + 指针处的光斑，样式在 glint.css 卡片一节
    // 倾斜用弹簧逐帧直接写内联 transform（不经 CSS 变量，只重算卡片自身样式）：指针连续移动时目标连续变化，速度也连续，
    // 不像过渡那样每次移动都从零速度重新起步；光斑只改 transform，不重画渐变
    // 只在有精确指针、且未要求减少动效时启用；触屏上只有 CSS 的上浮
    function setupCardFloat() {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        // 最大倾斜角（deg）：卡片很宽，绕竖轴转同样角度时左右两端前后差得多，所以横向（rotateY）比纵向（rotateX）小一些
        var TILT_X = 7, TILT_Y = 4.5;
        var PERSPECTIVE = 900;      // px：与 glint.css .post-item.card-style:not(.cw-card) 的 perspective() 一致；越小透视越强
        var SHADOW_SHIFT = 2.4;     // px / deg：投影朝倾斜的反方向挪，像卡片真的翘起来、影子落在后面
        // 光斑按原生尺寸画、只平移不缩放（放大的合成层会直接拉伸纹理，发糊、出色带）；尺寸与层次在 glint.css .post-card-spot
        var OMEGA = 12, ZETA = 0.85; // 弹簧的固有频率（rad/s）与阻尼比：约 0.3s 到位，几乎不过冲
        ks(".post-item.card-style:not(.cw-card)").each(function (card) {
            var sheen = card.querySelector(".post-card-sheen");
            if (!sheen) return;
            var spot = document.createElement("span");
            spot.className = "post-card-spot";
            sheen.appendChild(spot);
            var shadow = card.querySelector(".post-card-shadow");

            var rx = { x: 0, v: 0, to: 0 }, ry = { x: 0, v: 0, to: 0 };
            var frame = 0, last = 0, px = 0, py = 0, moved = false;

            // 指针位置 → 倾斜目标与光斑
            function aim() {
                moved = false;
                var r = card.getBoundingClientRect();
                var x = Math.min(Math.max((px - r.left) / r.width, 0), 1);
                var y = Math.min(Math.max((py - r.top) / r.height, 0), 1);
                rx.to = (0.5 - y) * TILT_X;
                ry.to = (x - 0.5) * TILT_Y;
                spot.style.transform = "translate3d(" + (x * card.offsetWidth).toFixed(1) + "px," + (y * card.offsetHeight).toFixed(1) + "px,0)";
            }
            function spring(s, dt) {
                var a = -OMEGA * OMEGA * (s.x - s.to) - 2 * ZETA * OMEGA * s.v;
                s.v += a * dt;
                s.x += s.v * dt;
                if (Math.abs(s.x - s.to) < 0.002 && Math.abs(s.v) < 0.01) { s.x = s.to; s.v = 0; return false; }
                return true;
            }
            function step(now) {
                frame = 0;
                // 被点进文章（一镜到底的快照已摆正）后不再写
                if (card.classList.contains("vt-active")) return;
                if (moved) aim();
                var dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
                last = now;
                // 分几小步积分，帧间隔长时也稳定
                var busy = false;
                for (var i = 0; i < 4; i++) {
                    var bx = spring(rx, dt / 4), by = spring(ry, dt / 4);
                    busy = bx || by;
                }
                var tilted = rx.x || ry.x;
                card.style.transform = tilted
                    ? "perspective(" + PERSPECTIVE + "px) rotateX(" + rx.x.toFixed(3) + "deg) rotateY(" + ry.x.toFixed(3) + "deg)"
                    : "";
                if (shadow) shadow.style.translate = tilted
                    ? (-ry.x * SHADOW_SHIFT).toFixed(2) + "px " + (rx.x * SHADOW_SHIFT).toFixed(2) + "px"
                    : "";
                if (busy) frame = requestAnimationFrame(step);
                else last = 0;
            }
            function kick() {
                if (!frame) frame = requestAnimationFrame(step);
            }
            card.addEventListener("pointerenter", function (e) {
                px = e.clientX; py = e.clientY;
                aim();              // 光斑先就位再淡入，不从默认位置滑过来
                kick();
            });
            card.addEventListener("pointermove", function (e) {
                px = e.clientX; py = e.clientY;
                moved = true;
                kick();
            });
            card.addEventListener("pointerleave", function () {
                moved = false;
                rx.to = 0; ry.to = 0;
                kick();
            });
        });
    }

    // 首页封面卡片悬停时的模糊层：用 canvas 把「模糊 + 压暗」烤成一张小图（每张卡片一次），
    // 悬停时只做透明度与缩放；原先逐帧改 filter: blur 半径，每帧都要对放大后的整张封面重算模糊
    // 触屏上点按时卡片同样会短暂进入悬停态，也一并烤（卡片小、半分辨率，成本很低）；卡片接近视口时在空闲时间逐张处理
    function setupCardBlur() {
        if (!("IntersectionObserver" in window)) return;
        // 各层的模糊半径、亮度与 glint.css 中的 filter 一致；q 为画布每 CSS px 的像素数（再乘设备像素比，最多按 2 倍算）
        // 原先 10px 层只烤半分辨率（0.5），高分屏上要放大四倍以上，暗部能看出一格一格的像素
        var LAYERS = {
            "post-card-blur": { blur: 10, bright: 0.8, q: 0.75 },
            "post-card-soft": { blur: 3, bright: 0.94, q: 1 }
        };
        var DPR = Math.min(window.devicePixelRatio || 1, 2);
        var els = [].slice.call(document.querySelectorAll(".post-item.card-style:not(.cw-card) .post-card-blur, .post-item.card-style:not(.cw-card) .post-card-soft"));
        if (!els.length) return;
        var queue = [], busy = false;
        var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 60); };

        function pump() {
            if (busy || !queue.length) return;
            busy = true;
            idle(function () {
                bake(queue.shift(), function () { busy = false; pump(); });
            }, { timeout: 1500 });
        }
        function bake(el, done) {
            // 卡片封面可能是 image-set(1x, 2x)（archive-list.ejs）或还在 data-bg-style 里没写上：按设备像素比取对应那张来烤
            var src = el.dataset.src || el.getAttribute("data-bg-style") || el.style.backgroundImage;
            el.dataset.src = src;       // 原图地址：重新烤时要从原图来，不能拿烤过的图再模糊
            var urls = [], um, ure = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
            while ((um = ure.exec(src))) urls.push(um[1]);
            var m = urls.length ? [null, DPR > 1.25 ? urls[urls.length - 1] : urls[0]] : null;
            var w = el.offsetWidth, h = el.offsetHeight;   // 不用中间层的浏览器里它是 display: none，宽高为 0，跳过
            var L = LAYERS[el.classList.contains("post-card-soft") ? "post-card-soft" : "post-card-blur"];
            var BLUR = L.blur, BRIGHT = L.bright, Q = L.q * DPR;
            if (!m || !w || !h) { done(); return; }
            var img = new Image();
            img.onerror = done;
            img.onload = function () {
                try {
                    var c = Math.max(w / img.naturalWidth, h / img.naturalHeight); // 原图 1px 显示成多少 CSS px（cover）
                    var k = c * Q;
                    var cw = Math.max(1, Math.round(img.naturalWidth * k));
                    var ch = Math.max(1, Math.round(img.naturalHeight * k));
                    var r = BLUR * Q;
                    var canvas = document.createElement("canvas");
                    canvas.width = cw;
                    canvas.height = ch;
                    var ctx = canvas.getContext("2d");
                    ctx.filter = "blur(" + r + "px) brightness(" + BRIGHT + ")";
                    if (ctx.filter && ctx.filter.indexOf("blur") !== -1) {
                        ctx.drawImage(img, 0, 0, cw, ch);
                    } else {
                        // 不支持 canvas 滤镜（旧版 Safari）：先缩小再放大近似模糊，再叠一层黑压暗
                        var f = Math.max(1, r * 1.5);
                        var s = document.createElement("canvas");
                        s.width = Math.max(1, Math.round(cw / f));
                        s.height = Math.max(1, Math.round(ch / f));
                        var sctx = s.getContext("2d");
                        sctx.imageSmoothingQuality = "high";
                        sctx.drawImage(img, 0, 0, s.width, s.height);
                        ctx.imageSmoothingQuality = "high";
                        ctx.drawImage(s, 0, 0, cw, ch);
                        ctx.globalCompositeOperation = "source-atop";
                        ctx.fillStyle = "rgba(0, 0, 0, " + (1 - BRIGHT) + ")";
                        ctx.fillRect(0, 0, cw, ch);
                    }
                    dither(ctx, cw, ch);
                    // 导出用无损 PNG：有损 WebP 按小方块压缩、色度减半，在这种很暗又几乎平滑的区域会压出一格一格的方块
                    canvas.toBlob(function (blob) {
                        if (!blob) { done(); return; }
                        var url = URL.createObjectURL(blob);
                        var pre = new Image();
                        pre.src = url;
                        (pre.decode ? pre.decode() : Promise.resolve()).then(function () {
                            var old = el.dataset.blurUrl;
                            el.removeAttribute("data-bg-style");   // 还没轮到延后加载时已烤好：不再写回封面
                            el.style.backgroundImage = 'url("' + url + '")';
                            el.classList.add("is-baked");
                            el.dataset.blurUrl = url;
                            el.dataset.blurWidth = w;
                            if (old) URL.revokeObjectURL(old);
                            done();
                        }, function () { URL.revokeObjectURL(url); done(); });
                    }, "image/png");
                } catch (e) {
                    done();     // 无法导出时保持 CSS 滤镜
                }
            };
            img.src = m[1];
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                io.unobserve(entry.target);
                queue.push(entry.target);
            });
            pump();
        }, { rootMargin: "400px 0px" });
        els.forEach(function (el) { io.observe(el); });

        // 卡片宽度变化较大时（cover 的缩放随之变化，模糊半径会走样）重新烤
        var timer = null;
        window.addEventListener("resize", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                els.forEach(function (el) {
                    var bw = +el.dataset.blurWidth;
                    if (bw && Math.abs(el.offsetWidth - bw) / bw > 0.12 && queue.indexOf(el) === -1) queue.push(el);
                });
                pump();
            }, 300);
        });
    }

    // 关灯切换 (使用 sessionStorage 记忆单次会话)
    // 日夜切换：支持视图过渡时，新的配色从日月按钮处以圆形向外扩散铺满整屏（clip-path 动画挂在 ::view-transition-new(root) 上，
    // 缓动先快后缓）；不支持或要求减少动效时直接切换。记忆仍在 sessionStorage（header.ejs 首帧前读取）
    // 切到日 / 夜：支持视图过渡时，新配色从日月按钮处以圆形扩散铺满整屏（clip-path 挂在 ::view-transition-new(root) 上）；
    // 不支持或要求减少动效时直接切换。结果写回 sessionStorage theme（一叶等页面读它），手机地址栏颜色跟着换
    function setDark(dark) {
        if (body.classList.contains("dark-theme") === dark) return;
        var btn = ks.select(".light-btn");
        var root = document.documentElement;
        function flip() {
            body.classList.toggle("dark-theme", dark);
            try { sessionStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute("content", dark ? "#0e0e10" : "#e9eff7");   // 与 header.ejs 首帧一致
            updateAllSliderFills();
        }
        // 日月图标转入：先摘掉再强制回流，连点时动画也能重新开始
        function spin() {
            if (!btn) return;
            btn.classList.remove("is-flipping");
            void btn.offsetWidth;
            btn.classList.add("is-flipping");
            btn.addEventListener("animationend", function () { btn.classList.remove("is-flipping"); }, { once: true });
        }
        if (!document.startViewTransition || !btn || !btn.offsetWidth || root.classList.contains("theme-flipping") ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            flip();
            spin();
            return;
        }
        var r = btn.getBoundingClientRect();
        var x = r.left + r.width / 2, y = r.top + r.height / 2;
        var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.classList.add("theme-flipping");
        var vt = document.startViewTransition(function () { flip(); spin(); });
        vt.ready.then(function () {
            root.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + R + "px at " + x + "px " + y + "px)"] },
                { duration: 720, easing: "cubic-bezier(.22, 1, .36, 1)", pseudoElement: "::view-transition-new(root)" });
        }, function () {});
        vt.finished.finally(function () { root.classList.remove("theme-flipping"); });
    }
    // 设置里的「日夜」模式（夜间 / 白天 / 跟随系统）此刻应是哪一边
    function modeIsDark() {
        var mode = currentSettings.themeMode || "dark";
        return mode === "auto" ? !window.matchMedia("(prefers-color-scheme: light)").matches : mode !== "light";
    }
    // 跟随系统时：系统换了外观、且本次浏览中没手动点过日月按钮，就跟着切
    try {
        window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
            var pick = null;
            try { pick = sessionStorage.getItem("theme-pick"); } catch (e) {}
            if (!pick && currentSettings.themeMode === "auto") setDark(modeIsDark());
        });
    } catch (e) {}

    // 日月按钮：本次浏览中临时切换（sessionStorage theme-pick），不改设置里的模式
    this.night = function () {
        var dark = !body.classList.contains("dark-theme");
        try { sessionStorage.setItem("theme-pick", dark ? "dark" : "light"); } catch (e) {}
        setDark(dark);
    };

    // 目录树
    this.tree = function () {
        const wrap = ks.select(".wrap");
        const headings = content.querySelectorAll("h1:not(.footnotes *), h2:not(.footnotes *), h3:not(.footnotes *), h4:not(.footnotes *), h5:not(.footnotes *), h6:not(.footnotes *)");

        // has-trees 一般已由 layout.ejs 在服务端挂上（首帧即是最终版面），这里以实际标题为准
        if (headings.length === 0) {
            body.classList.remove("has-trees");
            return;
        }

        body.classList.add("has-trees");

        // 计算数量，得出最高层级
        const levelCount = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

        headings.forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            levelCount[tagName]++;
        });

        let firstLevel = 1;
        if (levelCount.h1 === 0 && levelCount.h2 > 0) {
            firstLevel = 2;
        }
        else if (levelCount.h1 === 0 && levelCount.h2 === 0 && levelCount.h3 > 0) {
            firstLevel = 3;
        }

        // 目录卡片：固定的标题栏 + 单独滚动的列表（标题栏不随列表滚走）
        const trees = ks.create("section", {
            class: "article-list",
            html: `<h4 class="article-list-head"><i class="fa fa-list-ul" aria-hidden="true"></i><span class="title">目录</span><button id="close-toc-btn" type="button" title="收起目录" aria-label="收起目录"></button></h4><nav class="article-list-body" aria-label="文章目录"></nav>`
        });
        const tocBody = trees.querySelector(".article-list-body");

        ks.each(headings, (t, index) => {
            // 用 textContent：等字体期间正文是 visibility: hidden（head.ejs 的 page-loading），innerText 会跳过不可见的文字取到空串
            const text = t.textContent.replace(/\s+/g, " ").trim();

            // 保留渲染器 / 作者的 ID；仅为缺失项分配全页唯一的 ID。
            if (!t.id) {
                var id = "title-" + index;
                var suffix = 1;
                while (document.getElementById(id)) id = "title-" + index + "-" + suffix++;
                t.id = id;
            }

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            tocBody.appendChild(ks.create("a", { class: className, text, href: "#" + encodeURIComponent(t.id) }));
        });

        wrap.appendChild(trees);

        function setActiveTocItem(activeIdx) {
            if (activeIdx < 0 || activeIdx >= tocLinks.length) return;

            if (activeIdx !== lastActive) {
                lastActive = activeIdx;

                for (var j = 0; j < tocLinks.length; j++) {
                    if (j === activeIdx) {
                        tocLinks[j].classList.add("active");
                        tocLinks[j].setAttribute("aria-current", "true");
                    } else {
                        tocLinks[j].classList.remove("active");
                        tocLinks[j].removeAttribute("aria-current");
                    }
                }

                // 让当前激活项尽量出现在 TOC 视口里（仅滚动目录列表内部）
                var activeLink = tocLinks[activeIdx];
                if (activeLink && tocBody.scrollHeight > tocBody.clientHeight) {
                    var linkRect = activeLink.getBoundingClientRect();
                    var listRect = tocBody.getBoundingClientRect();
                    if (linkRect.top < listRect.top + 16 || linkRect.bottom > listRect.bottom - 16) {
                        tocBody.scrollTop += linkRect.top - listRect.top - listRect.height / 2;
                    }
                }
            }

            syncActiveGroup(activeIdx);
            updateMini(activeIdx);
        }

        // ★修改点 2：给右上角的“收起”按钮绑定事件
        const closeBtn = document.getElementById("close-toc-btn");
        if(closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                // 桌面端：卡片缩回右上角的迷你目录；手机端：关掉展开的目录卡片（同样缩回迷你目录）
                if (window.innerWidth >= 800) body.classList.add("toc-collapsed");
                else trees.classList.remove("active");
            });
        }

        // 绑定元素（右下角的悬浮按钮，原本只在手机端出现）
        const buttons = ks.select(".buttons");
        const btn = ks.create("button", {
            class: "toggle-list",
            attr: [
                {name: "title", value: "切换文章目录"},
            ],
        });
        buttons.appendChild(btn);

        btn.addEventListener("click", (e) => {
            e.stopPropagation();

            if (window.innerWidth >= 800) {
                // 电脑端：悬浮目录按钮直接切换收起/展开，让阅读区更清爽
                body.classList.toggle("toc-collapsed");
            } else {
                trees.classList.toggle("active");
            }
        });

        // 手机端：点了某个章节（有子章节的父项只是展开子项，不算）就收起卡片，让出正文
        tocBody.addEventListener("click", function (e) {
            if (window.innerWidth >= 800) return;
            var link = e.target.closest("a");
            if (link && !link.classList.contains("has-toc-children")) trees.classList.remove("active");
        });

        // 移动端：目录展开后，点击目录外区域自动收起
        document.addEventListener("click", function (e) {
            if (window.innerWidth >= 800) return;
            if (!trees.classList.contains("active")) return;
            if (trees.contains(e.target) || btn.contains(e.target)) return;
            trees.classList.remove("active");
        });

        // ===== Scrollspy：高亮当前阅读到的章节 =====
        var tocLinks = Array.prototype.slice.call(trees.querySelectorAll("a"));

        // ===== 迷你目录：桌面端目录收起后、手机端平时，右上角的小块，点击即展开 =====
        // 每道短横线代表一个一级章节（超过 8 个时按比例折算），当前章节那道亮起，是整个目录的缩略
        var level1Idx = [];
        tocLinks.forEach(function (link, i) {
            if (/(?:^|\s)item-1(?:\s|$)/.test(link.className)) level1Idx.push(i);
        });
        var mini = ks.create("button", {
            class: "toc-mini",
            attr: [
                {name: "type", value: "button"},
                {name: "title", value: "展开目录"},
                {name: "aria-label", value: "展开目录"},
            ],
        });
        var MINI_WIDTHS = [100, 72, 88, 64, 94, 78, 84, 68]; // 长短错落，像一列标题
        var miniBars = [];
        for (var bi = 0; bi < Math.min(Math.max(level1Idx.length, 1), MINI_WIDTHS.length); bi++) {
            var bar = document.createElement("span");
            bar.style.width = MINI_WIDTHS[bi] + "%";
            mini.appendChild(bar);
            miniBars.push(bar);
        }
        body.appendChild(mini);
        trees.id = "article-toc";
        mini.setAttribute("aria-controls", trees.id);
        var syncToc = bindDisclosure(trees, mini, "active", function () {
            return window.innerWidth >= 800 ? !body.classList.contains("toc-collapsed") : trees.classList.contains("active");
        }, {
            canDismiss: function () { return true; },
            dismiss: function () {
                if (window.innerWidth >= 800) body.classList.add("toc-collapsed");
                syncToc(false, true);
            }
        });
        window.addEventListener("resize", function () { syncToc(trees.classList.contains("active")); });
        mini.addEventListener("click", function (e) {
            e.stopPropagation();
            // 桌面端撤掉收起状态；手机端展开目录卡片（点卡片外会自动收起）
            if (window.innerWidth >= 800) body.classList.remove("toc-collapsed");
            else {
                mini.classList.remove("is-docked"); // 半隐状态下点它也直接展开
                trees.classList.add("active");
            }
        });

        // 手机端：向下滚动时迷你目录半隐到屏幕右缘（不挡正文），向上滚动再完整露出；与原先右下角按钮的停靠手感一致
        var miniMedia = window.matchMedia("(max-width: 799px)");
        var miniLastTop = window.pageYOffset || 0;
        function updateMiniDock() {
            var top = window.pageYOffset || 0;
            if (!miniMedia.matches || trees.classList.contains("active")) {
                mini.classList.remove("is-docked");
            } else {
                var delta = top - miniLastTop;
                // 小阈值，避免轻微抖动导致频繁触发
                if (delta > 6 && top > 24) mini.classList.add("is-docked");
                else if (delta < -4) mini.classList.remove("is-docked");
            }
            miniLastTop = top;
        }
        onScrollFrame(updateMiniDock);
        window.addEventListener("resize", updateMiniDock);

        function updateMini(activeIdx) {
            if (!miniBars || !miniBars.length) return;
            var pos = 0;
            for (var k = 0; k < level1Idx.length; k++) {
                if (level1Idx[k] <= activeIdx) pos = k;
            }
            var lit = level1Idx.length > miniBars.length
                ? Math.round(pos * (miniBars.length - 1) / (level1Idx.length - 1))
                : pos;
            for (var m = 0; m < miniBars.length; m++) miniBars[m].classList.toggle("is-active", m === lit);
        }
        var headingArr = Array.prototype.slice.call(headings);

        // ===== 目录次级层级折叠（默认收起，滚动进入或点击箭头时展开） =====
        var groupOf = {};            // groupKey -> { parent, children, hasChildren }
        var groupKeyByLinkIdx = {};  // tocLinks 索引 -> 所属 groupKey
        var activeGroupKey = -1;

        function setGroupOpen(key, open) {
            var g = groupOf[key];
            if (!g || !g.hasChildren) return;
            g.parent.classList.toggle("is-toc-open", open);
            for (var ci = 0; ci < g.children.length; ci++) {
                g.children[ci].classList.toggle("is-toc-open", open);
            }
        }

        function syncActiveGroup(activeIdx) {
            var key = groupKeyByLinkIdx[activeIdx];
            if (key === undefined || key === activeGroupKey) return;
            var prev = activeGroupKey;
            activeGroupKey = key;
            // 自动收起上一组（用户手动展开的会在该组离开活跃区时被收起一次，符合"目录跟随阅读"的预期）
            if (prev !== -1) setGroupOpen(prev, false);
            setGroupOpen(key, true);
        }

        (function buildTocGroups() {
            var current = -1;
            for (var li = 0; li < tocLinks.length; li++) {
                var link = tocLinks[li];
                var m = link.className.match(/(?:^|\s)item-(\d+)/);
                var level = m ? parseInt(m[1], 10) : 1;
                if (level === 1) {
                    current = li;
                    groupOf[current] = { parent: link, children: [], hasChildren: false };
                    groupKeyByLinkIdx[li] = current;
                } else if (current !== -1) {
                    link.classList.add("is-toc-child");
                    groupOf[current].children.push(link);
                    groupOf[current].hasChildren = true;
                    groupKeyByLinkIdx[li] = current;
                }
            }

            Object.keys(groupOf).forEach(function (rawKey) {
                var key = parseInt(rawKey, 10);
                var g = groupOf[key];
                if (!g.hasChildren) return;
                g.parent.classList.add("has-toc-children");

                // 点击父级目录项本身即可展开/收起子层级（不跳转锚点）
                g.parent.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var willOpen = !g.parent.classList.contains("is-toc-open");
                    setGroupOpen(key, willOpen);
                    // 展开后如果用户想跳到该标题，仍然执行锚点滚动
                    var target = headingArr[key]; // 目录与标题直接关联，不把任意 ID 当 CSS 选择器
                    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                });
            });
        })();

        if (tocLinks.length > 0 && headingArr.length === tocLinks.length) {
            var lastActive = -1;
            // 点击目录跳转后 smooth scroll 期间短暂锁住高亮，防止误高亮上一项。
            // 时间窗口短 + 用户主动滚动方向反转时立即解锁，保证跟随灵敏。
            var pinnedIdx = -1;
            var pinnedUntil = 0;
            var pinnedScrollDir = 0;
            var prevScrollY = window.pageYOffset || 0;

            // 每个标题是否已越过阅读线（视口顶部往下 80px）；由 IntersectionObserver 在越线时更新，滚动时不必逐个量位置
            var SPY_LINE = 80;
            var passed = headingArr.map(function (h) { return h.getBoundingClientRect().top - SPY_LINE <= 0; });
            if (window.IntersectionObserver) {
                // 根区域 = 阅读线以下（向下放得足够远）：标题完全在线下时比例为 1，顶端一越线就降到 1 以下
                var spyObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (en) {
                        passed[headingArr.indexOf(en.target)] = en.intersectionRatio < 1 && en.boundingClientRect.top - SPY_LINE <= 0;
                    });
                    updateScrollSpy();
                }, { rootMargin: -SPY_LINE + "px 0px 100000px 0px", threshold: 1 });
                headingArr.forEach(function (h) { spyObserver.observe(h); });
            }

            function updateScrollSpy() {
                var curY = window.pageYOffset || 0;

                if (pinnedIdx !== -1) {
                    var scrollDelta = curY - prevScrollY;
                    // 用户主动反向滚动 → 立刻解锁
                    if (pinnedScrollDir !== 0 && scrollDelta !== 0 &&
                        ((pinnedScrollDir > 0 && scrollDelta < -2) ||
                         (pinnedScrollDir < 0 && scrollDelta > 2))) {
                        pinnedIdx = -1;
                    } else if (Date.now() < pinnedUntil) {
                        setActiveTocItem(pinnedIdx);
                        prevScrollY = curY;
                        return;
                    } else {
                        var pinnedHeading = headingArr[pinnedIdx];
                        if (pinnedHeading) {
                            var pinnedTop = pinnedHeading.getBoundingClientRect().top;
                            if (Math.abs(pinnedTop - 60) > 20) {
                                setActiveTocItem(pinnedIdx);
                                prevScrollY = curY;
                                return;
                            }
                        }
                        pinnedIdx = -1;
                    }
                }

                prevScrollY = curY;
                if (!window.IntersectionObserver) {
                    for (var hi = 0; hi < headingArr.length; hi++) passed[hi] = headingArr[hi].getBoundingClientRect().top - SPY_LINE <= 0;
                }
                var activeIdx = -1;
                for (var i = 0; i < passed.length; i++) {
                    if (passed[i]) activeIdx = i;
                    else break;
                }
                if (activeIdx === -1) activeIdx = 0;
                setActiveTocItem(activeIdx);
            }

            // 点目录跳转后的锁定 / 反向滚动解锁仍要逐帧判断方向
            onScrollFrame(updateScrollSpy);
            tocLinks.forEach(function (link, index) {
                link.addEventListener("click", function () {
                    var headingEl = headingArr[index];
                    pinnedIdx = index;
                    pinnedUntil = Date.now() + 600;
                    pinnedScrollDir = headingEl
                        ? (headingEl.getBoundingClientRect().top > 0 ? 1 : -1)
                        : 0;
                    setActiveTocItem(index);
                });
            });
            updateScrollSpy();
        }
    };

    // 自动添加外链
    // 脚注就地预览（glint.css「脚注预览」）：不必跳到文末再跳回来
    // - 有精确指针时：悬停 / 键盘聚焦脚注标号片刻即在旁边浮出一张小毛玻璃卡片，点标号照旧跳到文末
    // - 触屏：点标号先浮出卡片（再点一次或点卡片里的「跳到文末」才跳），点别处 / 滚动即收起
    // - 卡片从标号处弹出（transform-origin 对准标号，展开用 --ease-spring）；内容取自文末对应的脚注，去掉回跳符号
    var fnPeek = null;
    function setupFootnotePeek() {
        if (!content || !content.querySelector("a[data-footnote-ref]")) return;
        var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        var pop = document.createElement("div");
        pop.className = "fn-peek";
        pop.id = "fn-peek";
        pop.setAttribute("role", "tooltip");
        pop.setAttribute("aria-hidden", "true");
        pop.innerHTML = '<div class="fn-peek-head"><span class="fn-peek-no"></span><a class="fn-peek-jump" href="#">跳到文末<i class="fa fa-angle-down" aria-hidden="true"></i></a></div><div class="fn-peek-body"></div>';
        document.body.appendChild(pop);
        var noEl = pop.querySelector(".fn-peek-no"), bodyEl = pop.querySelector(".fn-peek-body"), jump = pop.querySelector(".fn-peek-jump");
        var current = null, showTimer = 0, hideTimer = 0;

        function targetOf(a) {
            var id = (a.getAttribute("href") || "").slice(1);
            try { id = decodeURIComponent(id); } catch (e) {}
            return id ? document.getElementById(id) : null;
        }
        function show(a) {
            clearTimeout(hideTimer);
            var li = targetOf(a);
            if (!li) return;
            if (current !== a) {
                var clone = li.cloneNode(true);
                [].forEach.call(clone.querySelectorAll("[data-footnote-backref]"), function (b) { b.remove(); });
                bodyEl.innerHTML = clone.innerHTML;
                noEl.textContent = "注 " + a.textContent.trim();
                jump.setAttribute("href", a.getAttribute("href"));
                if (current) current.removeAttribute("aria-describedby");
                current = a;
            }
            a.setAttribute("aria-describedby", "fn-peek");
            // 定位：优先放在标号下方，放不下就放上方；左右夹在视口内，弹出原点对准标号
            var r = a.getBoundingClientRect();
            var vw = document.documentElement.clientWidth, vh = window.innerHeight;
            var w = Math.min(352, vw - 24);
            pop.style.width = w + "px";
            pop.classList.add("is-measuring");
            var h = pop.offsetHeight;
            pop.classList.remove("is-measuring");
            var cx = r.left + r.width / 2;
            var left = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
            var below = r.bottom + 10 + h <= vh - 12 || r.top - 10 - h < 60;
            var top = below ? r.bottom + 10 : r.top - 10 - h;
            pop.style.left = left + "px";
            pop.style.top = Math.max(60, top) + "px";
            pop.style.setProperty("--ox", (cx - left) + "px");
            pop.style.setProperty("--oy", below ? "-10px" : (h + 10) + "px");
            pop.classList.toggle("is-above", !below);
            pop.setAttribute("aria-hidden", "false");
            pop.classList.add("open");
        }
        function hide(delay) {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
                pop.classList.remove("open");
                pop.setAttribute("aria-hidden", "true");
                if (current) current.removeAttribute("aria-describedby");
            }, delay || 0);
        }
        function isOpen() { return pop.classList.contains("open"); }

        [].forEach.call(content.querySelectorAll("a[data-footnote-ref]"), function (a) {
            if (fine) {
                a.addEventListener("pointerenter", function () { clearTimeout(hideTimer); clearTimeout(showTimer); showTimer = setTimeout(function () { show(a); }, isOpen() ? 0 : 140); });
                a.addEventListener("pointerleave", function () { hide(220); });
            }
            a.addEventListener("focus", function () { show(a); });
            a.addEventListener("blur", function () { if (!pop.contains(document.activeElement)) hide(150); });
        });
        if (fine) {
            pop.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
            pop.addEventListener("pointerleave", function () { hide(220); });
        }
        jump.addEventListener("click", function (e) {
            var li = current && targetOf(current);
            if (!li) return;
            e.preventDefault();
            hide();
            li.scrollIntoView({ behavior: "smooth", block: "start" });
            history.pushState(null, "", jump.getAttribute("href"));
        });
        document.addEventListener("pointerdown", function (e) {
            if (isOpen() && !pop.contains(e.target) && !e.target.closest("a[data-footnote-ref]")) hide();
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) hide(); });
        onScrollFrame(function () { if (isOpen() && !fine) hide(); else if (isOpen() && current) show(current); });

        // 供下方 links() 的点击处理调用：触屏上第一次点标号只浮出卡片，返回 true 表示已处理（不跳转）
        fnPeek = function (a) {
            if (fine) { hide(); return false; }
            if (isOpen() && current === a) return false;
            show(a);
            return true;
        };
    }

    this.links = function () {
        var l = content.getElementsByTagName("a");

        if(l){
            ks.each(l, function (t) {
                // 脚注引用链接和回跳链接不在新标签页打开
                if (t.hasAttribute("data-footnote-ref") || t.hasAttribute("data-footnote-backref")) return;
                t.target = "_blank";
            });
        }

        // 脚注链接平滑滚动（不触发默认的跳转刷新）
        content.addEventListener("click", function (e) {
            var a = e.target.closest("a[data-footnote-ref], a[data-footnote-backref]");
            if (!a) return;
            if (a.hasAttribute("data-footnote-ref") && fnPeek && fnPeek(a)) { e.preventDefault(); return; }   // 触屏：先就地预览
            var href = a.getAttribute("href");
            if (!href || href.charAt(0) !== "#") return;
            var target = document.getElementById(href.slice(1));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            // 更新 URL hash，但不触发页面跳转
            history.pushState(null, "", href);
        });
    };

    this.comment_list = function () {
        ks(".comment-content [href^='#comment']").each(function (t) {
            var item = ks.select(t.getAttribute("href"));

            t.onmouseover = function () {
                item.classList.add("active");
            };

            t.onmouseout = function () {
                item.classList.remove("active");
            };
        });
    };

    this.header();
    setupImmersive();
    setupCardFloat();
    setupCardBlur();
    setupBgPrebake();

    if(!content) body.classList.remove("has-trees");
    if(content){
        this.tree();
        setupFootnotePeek();
        this.links();
        this.comment_list();
    }

    // 首次应用阅读设置（在夜间模式与其它初始化之前执行）
    applyReadingSettings();

    // 日夜模式在 header.ejs 开头首帧前就已敲定（sessionStorage theme），这里不再重复

    // 如果开启复制内容提示
    if(config.copyright){
        document.oncopy = function () {
            ks.notice("复制内容请注明来源并保留版权信息！", {color: "yellow", overlay: true})
        };
    }

    //
    // ! Hexo 特别功能
    //

    // 站内搜索（glint.css「站内搜索」）：顶栏的搜索框 + 从它下方长出来的毛玻璃面板 .search-panel
    // - 索引 /search.json（scripts/search-index.js）：文章、独立页面、CARRiER WAVE. 各篇、Gizmo；第一次聚焦（或指针移上）才下载
    // - 空格分隔多个词，须全部命中；按「标题 > 标签 > 简介 > 正文命中次数」打分排序，正文最多摘两段、所有词都高亮
    // - ↑↓ 选择（强调框弹簧滑动）、↵ 打开、Esc 关闭；任何页面按 / 或 Ctrl / ⌘ + K 唤起
    // - 点文章结果时标题文字一路飞到文章页的正文标题处（_partial/title-hop.ejs）
    this.local_search = function () {
        var input = document.getElementById("local-search-input");
        var panel = document.getElementById("search-panel");
        var list = document.getElementById("local-search-result");
        if (!input || !panel || !list) return;
        var bar = input.closest(".head-search");
        var status = panel.querySelector(".search-status");
        var pill = list.querySelector(".search-pill");
        var root = document.documentElement;
        var MAX = 20;
        var data = null, loading = null, failed = false, composing = false, open = false;
        var items = [], active = -1, timer = 0, lastQuery = null;

        function esc(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

        function load() {
            if (data) return Promise.resolve(data);
            if (loading) return loading;
            loading = fetch("/search.json", { credentials: "same-origin" }).then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            }).then(function (arr) {
                data = arr.map(function (x) {
                    x.g = x.g || [];
                    x.tl = String(x.t || "").toLowerCase();
                    x.gl = x.g.map(function (g) { return String(g).toLowerCase(); });
                    x.sl = String(x.s || "").toLowerCase();
                    x.cl = String(x.c || "").toLowerCase();
                    return x;
                });
                failed = false;
                return data;
            }).catch(function (err) { loading = null; failed = true; throw err; });
            return loading;
        }

        function count(hay, t) {
            var n = 0, i = hay.indexOf(t);
            while (i > -1 && n < 30) { n++; i = hay.indexOf(t, i + t.length); }
            return n;
        }
        function score(x, terms) {
            var sc = 0;
            for (var k = 0; k < terms.length; k++) {
                var t = terms[k], hit = false, p = x.tl.indexOf(t);
                if (p > -1) { sc += p === 0 ? 14 : 10; hit = true; }
                for (var j = 0; j < x.gl.length; j++) {
                    if (x.gl[j] === t) { sc += 8; hit = true; }
                    else if (x.gl[j].indexOf(t) > -1) { sc += 5; hit = true; }
                }
                if (x.sl.indexOf(t) > -1) { sc += 3; hit = true; }
                var n = count(x.cl, t);
                if (n) { sc += 1 + Math.min(n, 10) * 0.5; hit = true; }
                if (!hit) return -1;
            }
            return sc;
        }
        function mark(text, re) {
            return esc(text).replace(re, function (m) { return '<mark>' + m + "</mark>"; });
        }
        // 正文摘段：各词第一次出现的位置，彼此相距够远才另起一段，最多两段
        function snippets(x, terms, re) {
            var spots = [];
            terms.forEach(function (t) {
                var i = x.cl.indexOf(t);
                if (i > -1) spots.push(i);
            });
            spots.sort(function (a, b) { return a - b; });
            var out = [], last = -1e9;
            for (var i = 0; i < spots.length && out.length < 2; i++) {
                if (spots[i] - last < 70) continue;
                last = spots[i];
                var a = Math.max(0, spots[i] - 28), b = Math.min(x.c.length, spots[i] + 52);
                var s = x.c.slice(a, b).replace(/\n+/g, " / ");
                out.push((a > 0 ? "…" : "") + mark(s, re) + (b < x.c.length ? "…" : ""));
            }
            return out;
        }

        function setStatus(html) { status.innerHTML = html || ""; }

        function render() {
            if (composing) return;
            var q = input.value.trim();
            panel.classList.toggle("has-query", !!q);
            if (!q) { lastQuery = ""; fill([]); setStatus(""); return; }
            if (!data) {
                setStatus(failed ? '索引加载失败，<button type="button" class="search-retry">重试</button>' : "正在载入索引…");
                // 失败只显示一次失败提示：若再调 render() 会立刻重新 load()，断网时成了不停发请求的死循环；之后只由「重试」按钮重新加载
                load().then(render, function () {
                    if (!data && input.value.trim()) setStatus('索引加载失败，<button type="button" class="search-retry">重试</button>');
                });
                return;
            }
            if (q === lastQuery) return;
            lastQuery = q;
            var terms = q.toLowerCase().split(/\s+/).filter(Boolean).filter(function (t, i, a) { return a.indexOf(t) === i; });
            var re = new RegExp(terms.slice().sort(function (a, b) { return b.length - a.length; }).map(function (t) { return escRe(esc(t)); }).join("|"), "gi");
            var hits = [];
            data.forEach(function (x) {
                var sc = score(x, terms);
                if (sc >= 0) hits.push({ x: x, sc: sc });
            });
            hits.sort(function (a, b) { return b.sc - a.sc || (b.x.d > a.x.d ? 1 : b.x.d < a.x.d ? -1 : 0); });
            var total = hits.length;
            fill(hits.slice(0, MAX).map(function (h) { return { x: h.x, terms: terms, re: re }; }));
            setStatus(total ? "共 " + total + " 条" + (total > MAX ? "，显示前 " + MAX + " 条" : "") : "没有找到与「" + esc(q) + "」相关的内容");
        }

        var KIND_ICON = { "页面": "fa-file-text-o", "CARRiER WAVE.": "fa-podcast", "Gizmo": "fa-leaf" };   // 写全类名：tools/fa-subset.py 靠 fa-xxx 扫描用到的图标
        function fill(rows) {
            var html = rows.map(function (r, i) {
                var x = r.x, ext = /^https?:\/\//.test(x.u);
                var thumb = x.i
                    ? '<span class="sr-thumb" style="background-image:url(\'' + esc(x.i) + '\')"></span>'
                    : '<span class="sr-thumb is-icon"><i class="fa ' + (KIND_ICON[x.k] || "fa-file-text-o") + '"></i></span>';
                var snips = snippets(x, r.terms, r.re);
                if (!snips.length && x.s) snips = [mark(x.s, r.re)];
                return '<a class="sr-item" role="option" id="sr-' + i + '" aria-selected="false" style="--i:' + i + '" href="' + esc(x.u) + '"' +
                    (ext ? ' target="_blank" rel="noopener"' : "") + ' data-kind="' + esc(x.k) + '">' + thumb +
                    '<span class="sr-main"><span class="sr-top"><span class="sr-title">' + mark(x.t, r.re) + "</span>" +
                    (x.d ? '<time class="sr-date">' + esc(x.d) + "</time>" : "") + "</span>" +
                    snips.map(function (s) { return '<span class="sr-snip">' + s + "</span>"; }).join("") +
                    '<span class="sr-meta"><span class="sr-kind">' + esc(x.k) + "</span>" +
                    x.g.map(function (g) { return '<span class="sr-tag">#' + mark(g, r.re) + "</span>"; }).join("") + "</span></span></a>";
            }).join("");
            list.innerHTML = html;
            list.insertBefore(pill, list.firstChild);
            items = [].slice.call(list.querySelectorAll(".sr-item"));
            pill.classList.remove("is-on");
            active = -1;
            list.scrollTop = 0;
            if (items.length) setActive(0, false, true);
            else input.removeAttribute("aria-activedescendant");
        }

        // 强调框：一枚 .search-pill 在结果之间弹簧滑动（与顶栏导航的强调框同一套做法）
        function setActive(i, scroll, instant) {
            if (!items.length) return;
            i = (i + items.length) % items.length;
            if (items[active]) items[active].setAttribute("aria-selected", "false");
            active = i;
            var it = items[i];
            it.setAttribute("aria-selected", "true");
            input.setAttribute("aria-activedescendant", it.id);
            if (instant || !pill.classList.contains("is-on")) pill.classList.add("no-glide");
            pill.style.setProperty("--y", it.offsetTop + "px");
            pill.style.setProperty("--h", it.offsetHeight + "px");
            pill.classList.add("is-on");
            if (pill.classList.contains("no-glide")) { void pill.offsetWidth; pill.classList.remove("no-glide"); }
            if (scroll) it.scrollIntoView({ block: "nearest" });
        }

        // 面板从搜索框下方长出来：起点是与搜索框同宽同高的胶囊（贴在右上角），展开成卡片（clip-path，展开弹簧 / 收起平稳）
        function place() {
            var r = input.getBoundingClientRect();
            panel.style.setProperty("--sp-right", Math.max(8, root.clientWidth - r.right) + "px");
            panel.style.setProperty("--from-w", r.width + "px");
            panel.style.setProperty("--from-h", r.height + "px");
        }
        function setOpen(v) {
            if (open === v) return;
            open = v;
            if (v) {
                place();
                panel.removeAttribute("inert");
                panel.setAttribute("aria-hidden", "false");
                bringToFront(panel);
                requestAnimationFrame(function () { panel.classList.add("open"); });
            } else {
                panel.classList.remove("open");
                panel.setAttribute("inert", "");
                panel.setAttribute("aria-hidden", "true");
            }
            input.setAttribute("aria-expanded", String(v));
        }
        window.addEventListener("resize", function () { if (open) place(); });

        function focusSearch() {
            // 手机端搜索框平时收起：先展开（搜索按钮的开关逻辑在 header() 里）
            if (bar && !bar.classList.contains("active") && window.innerWidth < 600) {
                var btn = document.querySelector(".search-btn");
                if (btn) btn.click();
            }
            input.focus();
            input.select();
        }

        input.addEventListener("pointerenter", function () { load().catch(function () {}); }, { once: true });
        input.addEventListener("focus", function () {
            load().then(function () { lastQuery = null; render(); }, function () { render(); });
            setOpen(true);
            render();
        });
        input.addEventListener("input", function (e) {
            clearTimeout(timer);
            if (composing || e.isComposing) return;
            setOpen(true);
            timer = setTimeout(render, 60);
        });
        input.addEventListener("compositionstart", function () { composing = true; clearTimeout(timer); });
        input.addEventListener("compositionend", function () { composing = false; render(); });
        input.addEventListener("keydown", function (e) {
            if (e.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (!items.length) return;
                e.preventDefault();
                setOpen(true);
                setActive(active + (e.key === "ArrowDown" ? 1 : -1), true);
            } else if (e.key === "Enter") {
                if (!items.length) return;
                e.preventDefault();
                (items[active] || items[0]).click();
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (open) { setOpen(false); return; }
                input.blur();
                if (window.innerWidth < 600) {
                    var d = disclosures.find(function (d) { return d.panel === bar; });
                    if (d && d.canDismiss()) d.dismiss();
                }
            }
        });
        // 焦点离开搜索框与面板才收起；点面板里的空白处不夺走焦点
        function inside(el) { return el && (panel.contains(el) || (bar && bar.contains(el))); }
        [input, panel].forEach(function (el) {
            el.addEventListener("focusout", function (e) { if (!inside(e.relatedTarget)) setOpen(false); });
        });
        panel.addEventListener("mousedown", function (e) { if (!e.target.closest("a, button")) e.preventDefault(); });
        panel.addEventListener("click", function (e) {
            if (e.target.closest(".search-retry")) { e.preventDefault(); failed = false; lastQuery = null; input.focus(); render(); return; }
            var it = e.target.closest(".sr-item");
            if (!it || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || it.target === "_blank") return;
            if (it.getAttribute("data-kind") === "文章") {
                try { sessionStorage.setItem("title-hop", JSON.stringify({ to: new URL(it.href).pathname.replace(/index\.html$/, ""), t: Date.now() })); } catch (err) {}
                window.glintTitleHopEl = it.querySelector(".sr-title");
            }
        });
        list.addEventListener("pointermove", function (e) {
            var it = e.target.closest(".sr-item");
            if (it && items.indexOf(it) !== active) setActive(items.indexOf(it), false);
        });

        // 任何页面按 / 或 Ctrl / ⌘ + K 唤起（正在输入框 / 文本域里打字时 / 不算）
        document.addEventListener("keydown", function (e) {
            var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
            if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); focusSearch(); }
            else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); focusSearch(); }
        });
    };

// 在文件初始化末尾，执行这个搜索功能
    this.local_search();

// 正文图片：懒加载由构建期写上的 loading="lazy" 负责（scripts/lazy-images.js），这里只挂灯箱（下方，取代 kico 的 ks.image）
// 原先在页尾把 src 换成空白 GIF 再按需回填：那时浏览器早已开始下载原图，换完图片还会塌成 1px 再撑开、版面跳动
var CONTENT_IMG_SEL = ".post-content:not(.is-special) img, .page-content:not(.is-special) img";

// 图片灯箱（glint.css「图片灯箱」）：点正文图片，图片从原位置形变放大到屏幕中央（一镜到底），毛玻璃底衬渐显
// - 缩放：双指捏合 / 滚轮（以指针处为中心）/ 双击（放大到 2.5 倍或复位）；放大后拖动平移，松手时弹回可视范围
// - 切换：左右滑动、← → 键、两侧按钮；同一篇里的图片依次切换
// - 关闭：下拉（底衬随之变淡）/ Esc / 点空白处 / 关闭按钮；原图还在屏上时缩回原位置
// - 形变都只动 transform / opacity；展开、回弹用 --ease-spring
(function () {
    var imgs = [].filter.call(document.querySelectorAll(CONTENT_IMG_SEL), function (im) { return !im.closest("a"); });
    if (!imgs.length) return;
    var root = document.documentElement;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var SPRING = (getComputedStyle(root).getPropertyValue("--ease-spring") || "").trim();
    if (!/linear\(|cubic-bezier\(/.test(SPRING)) SPRING = "cubic-bezier(.2, 1.2, .3, 1)";
    var EXIT = "cubic-bezier(.4, 0, .2, 1)";

    var lb = null, view, back, bar, count, cap, prevBtn, nextBtn;
    var index = -1, src = null;             // 当前图片序号与它在正文里的那张
    var W = 0, H = 0;                       // 复位（适配屏幕）时的显示尺寸
    var X = 0, Y = 0, S = 1;                // 当前位置（左上角，屏幕坐标）与缩放倍数（相对复位尺寸）
    var anim = null, turn = 0;

    function build() {
        lb = document.createElement("div");
        lb.className = "lb";
        lb.setAttribute("role", "dialog");
        lb.setAttribute("aria-modal", "true");
        lb.setAttribute("aria-label", "查看图片");
        lb.innerHTML = '<div class="lb-back"></div><img class="lb-img" alt="" draggable="false">' +
            '<div class="lb-bar"><span class="lb-count"></span><span class="lb-cap"></span></div>' +
            '<button type="button" class="lb-btn lb-prev" aria-label="上一张"><i class="fa fa-angle-left"></i></button>' +
            '<button type="button" class="lb-btn lb-next" aria-label="下一张"><i class="fa fa-angle-right"></i></button>' +
            '<button type="button" class="lb-btn lb-close" aria-label="关闭"><i class="fa fa-times"></i></button>';
        view = lb.querySelector(".lb-img");
        back = lb.querySelector(".lb-back");
        bar = lb.querySelector(".lb-bar");
        count = lb.querySelector(".lb-count");
        cap = lb.querySelector(".lb-cap");
        prevBtn = lb.querySelector(".lb-prev");
        nextBtn = lb.querySelector(".lb-next");
        prevBtn.addEventListener("click", function () { go(-1); });
        nextBtn.addEventListener("click", function () { go(1); });
        lb.querySelector(".lb-close").addEventListener("click", close);
        bindGestures();
    }

    function vw() { return root.clientWidth; }
    function vh() { return window.innerHeight; }
    function naturalSize(im) {
        var w = im.naturalWidth || +im.getAttribute("width") || im.width || 1;
        var h = im.naturalHeight || +im.getAttribute("height") || im.height || 1;
        return { w: w, h: h };
    }
    function fit(im) {
        var n = naturalSize(im);
        var maxW = vw() * 0.92, maxH = vh() * 0.84;
        var k = Math.min(maxW / n.w, maxH / n.h, 2);      // 小图最多放大到两倍，免得糊
        W = Math.round(n.w * k);
        H = Math.round(n.h * k);
        view.style.width = W + "px";
        view.style.height = H + "px";
    }
    function home() { return { x: (vw() - W) / 2, y: (vh() - H) / 2, s: 1 }; }
    function apply() { view.style.transform = "translate(" + X + "px, " + Y + "px) scale(" + S + ")"; }
    function stop() { if (anim) { anim.cancel(); anim = null; } }
    // 从当前状态动画到 (x, y, s)；结束后把终点写回内联样式
    function animateTo(x, y, s, dur, easing, done) {
        stop();
        var from = "translate(" + X + "px, " + Y + "px) scale(" + S + ")";
        X = x; Y = y; S = s;
        var to = "translate(" + X + "px, " + Y + "px) scale(" + S + ")";
        view.style.transform = to;
        if (reduce || !dur) { if (done) done(); return; }
        anim = view.animate([{ transform: from }, { transform: to }], { duration: dur, easing: easing });
        anim.onfinish = function () { anim = null; if (done) done(); };
    }
    function rectOf(im) {
        var r = im.getBoundingClientRect();
        return r.width && r.bottom > 0 && r.top < vh() ? r : null;
    }
    // 缩放后限制在可视范围内：比屏幕小就居中，比屏幕大就不露出空边
    function clamped(x, y, s) {
        var w = W * s, h = H * s;
        x = w <= vw() ? (vw() - w) / 2 : Math.min(0, Math.max(vw() - w, x));
        y = h <= vh() ? (vh() - h) / 2 : Math.min(0, Math.max(vh() - h, y));
        return { x: x, y: y };
    }

    function updateBar() {
        count.textContent = imgs.length > 1 ? (index + 1) + " / " + imgs.length : "";
        cap.textContent = src.getAttribute("alt") || "";
        bar.classList.toggle("is-empty", !count.textContent && !cap.textContent);
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === imgs.length - 1;
        lb.classList.toggle("is-single", imgs.length < 2);
    }

    function open(i) {
        if (!lb) build();
        index = i;
        src = imgs[i];
        view.src = src.currentSrc || src.getAttribute("src");
        fit(src);
        updateBar();
        document.body.appendChild(lb);
        root.classList.add("lb-open");
        var h = home();
        var r = rectOf(src);
        if (r) { X = r.left; Y = r.top; S = r.width / W; } else { X = h.x; Y = h.y + 30; S = .9; }
        apply();
        src.classList.add("lb-source");     // 原图藏起来：看上去就是它飞了出来
        void lb.offsetWidth;
        lb.classList.add("open");
        animateTo(h.x, h.y, 1, 560, SPRING);
        lb.querySelector(".lb-close").focus({ preventScroll: true });
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", onResize);
    }

    function close() {
        if (!lb || !lb.classList.contains("open")) return;
        turn++;
        view.style.opacity = "";
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResize);
        lb.classList.remove("open");
        var r = rectOf(src), me = src;
        function done() {
            me.classList.remove("lb-source");
            if (lb.parentNode) lb.parentNode.removeChild(lb);
            root.classList.remove("lb-open");
            view.style.opacity = "";
            lb.style.removeProperty("--drag");
        }
        if (r) animateTo(r.left, r.top, r.width / W, 340, EXIT, done);
        else {
            view.style.opacity = "0";
            animateTo(X, Y + 40, S * .92, 260, EXIT, done);
        }
    }

    function go(d) {
        var j = index + d;
        if (j < 0 || j >= imgs.length) { bounce(d); return; }
        var my = ++turn;                    // 切换途中又切换 / 关闭：只认最后一次
        var out = d > 0 ? -1 : 1;
        var old = src;
        old.classList.remove("lb-source");
        // 旧图朝滑动方向退场，新图从另一侧弹入
        animateTo(X + out * vw() * 0.35, Y, S, 160, "ease-in", function () {
            if (my !== turn) return;
            index = j;
            src = imgs[j];
            src.classList.add("lb-source");
            view.style.opacity = "0";
            view.src = src.currentSrc || src.getAttribute("src");
            var ready = view.decode ? view.decode().catch(function () {}) : Promise.resolve();
            ready.then(function () {
                if (my !== turn) return;
                fit(view.naturalWidth ? view : src);
                updateBar();
                var h = home();
                X = h.x - out * vw() * 0.35; Y = h.y; S = 1;
                apply();
                view.style.opacity = "";
                animateTo(h.x, h.y, 1, 520, SPRING);
            });
        });
    }
    function bounce(d) {
        var h = { x: X, y: Y, s: S };
        animateTo(X - d * 40, Y, S, 120, "ease-out", function () { animateTo(h.x, h.y, h.s, 420, SPRING); });
    }
    function zoomAt(mx, my, s2, dur) {
        s2 = Math.max(1, Math.min(5, s2));
        var x = mx - (mx - X) * s2 / S, y = my - (my - Y) * s2 / S;
        var c = clamped(x, y, s2);
        if (dur) animateTo(c.x, c.y, s2, dur, SPRING);
        else { stop(); X = c.x; Y = c.y; S = s2; apply(); }
        lb.classList.toggle("is-zoomed", s2 > 1.01);
    }
    function onResize() {
        fit(view.naturalWidth ? view : src);
        var h = home();
        stop(); X = h.x; Y = h.y; S = 1; apply();
        lb.classList.remove("is-zoomed");
    }
    function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        else if (e.key === "+" || e.key === "=") zoomAt(vw() / 2, vh() / 2, S * 1.5, 360);
        else if (e.key === "-") zoomAt(vw() / 2, vh() / 2, S / 1.5, 360);
        else if (e.key === "Tab") {            // 焦点留在灯箱里
            var btns = [].filter.call(lb.querySelectorAll("button"), function (b) { return !b.disabled && b.offsetParent; });
            var k = btns.indexOf(document.activeElement);
            e.preventDefault();
            btns[(k + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
    }

    function bindGestures() {
        var pts = {}, mode = "", start = null, moved = false, lastTap = 0, vx = 0, lastT = 0, lastX = 0;
        function list() { return Object.keys(pts).map(function (k) { return pts[k]; }); }
        function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; }

        lb.addEventListener("pointerdown", function (e) {
            if (e.target.closest(".lb-btn")) return;
            if (e.button !== 0 && e.pointerType === "mouse") return;
            lb.setPointerCapture(e.pointerId);
            pts[e.pointerId] = { x: e.clientX, y: e.clientY };
            stop();
            var p = list();
            moved = false;
            if (p.length === 2) {
                mode = "pinch";
                var m = mid(p[0], p[1]);
                start = { m: m, X: X, Y: Y, S: S };
            } else if (p.length === 1) {
                mode = "";
                start = { x: e.clientX, y: e.clientY, X: X, Y: Y, S: S };
                vx = 0; lastT = e.timeStamp; lastX = e.clientX;
            }
        });
        lb.addEventListener("pointermove", function (e) {
            if (!pts[e.pointerId]) return;
            pts[e.pointerId] = { x: e.clientX, y: e.clientY };
            var p = list();
            if (mode === "pinch" && p.length === 2) {
                var m = mid(p[0], p[1]);
                var s2 = Math.max(.8, Math.min(6, start.S * m.d / start.m.d));
                var ux = (start.m.x - start.X) / start.S, uy = (start.m.y - start.Y) / start.S;
                X = m.x - ux * s2; Y = m.y - uy * s2; S = s2;
                apply();
                moved = true;
                return;
            }
            if (p.length !== 1 || !start) return;
            var dx = e.clientX - start.x, dy = e.clientY - start.y;
            if (!mode) {
                if (Math.hypot(dx, dy) < 6) return;
                mode = start.S > 1.01 ? "pan" : (Math.abs(dx) > Math.abs(dy) ? "swipe" : "pull");
            }
            moved = true;
            var dt = Math.max(1, e.timeStamp - lastT);
            vx = (e.clientX - lastX) / dt; lastT = e.timeStamp; lastX = e.clientX;
            if (mode === "pan") { X = start.X + dx; Y = start.Y + dy; apply(); }
            else if (mode === "swipe") {
                var edge = (index === 0 && dx > 0) || (index === imgs.length - 1 && dx < 0);
                X = start.X + (edge ? dx * .3 : dx); apply();
            } else if (mode === "pull") {
                var k = Math.min(1, Math.abs(dy) / 360);
                Y = start.Y + dy; X = start.X + dx * .4; S = 1 - k * .18;
                X += W * (1 - S) / 2; Y += H * (1 - S) / 2;
                apply();
                lb.style.setProperty("--drag", String(1 - k * .85));
            }
        });
        function up(e) {
            if (!pts[e.pointerId]) return;
            delete pts[e.pointerId];
            var p = list();
            if (mode === "pinch") {
                if (p.length === 1) {               // 还剩一根手指：接着平移
                    mode = "pan";
                    start = { x: p[0].x, y: p[0].y, X: X, Y: Y, S: S };
                    return;
                }
                if (S < 1.01) { var h = home(); animateTo(h.x, h.y, 1, 420, SPRING); lb.classList.remove("is-zoomed"); }
                else { var c = clamped(X, Y, S); animateTo(c.x, c.y, S, 420, SPRING); lb.classList.add("is-zoomed"); }
                mode = "";
                return;
            }
            if (p.length) return;
            var dx = e.clientX - (start ? start.x : e.clientX), dy = e.clientY - (start ? start.y : e.clientY);
            if (mode === "pan") { var c2 = clamped(X, Y, S); animateTo(c2.x, c2.y, S, 420, SPRING); }
            else if (mode === "swipe") {
                if ((dx < -60 || vx < -.5) && index < imgs.length - 1) go(1);
                else if ((dx > 60 || vx > .5) && index > 0) go(-1);
                else { var h2 = home(); animateTo(h2.x, h2.y, 1, 420, SPRING); }
            } else if (mode === "pull") {
                if (Math.abs(dy) > 110) close();
                else { lb.style.removeProperty("--drag"); var h3 = home(); animateTo(h3.x, h3.y, 1, 420, SPRING); }
            } else if (!moved) {
                // 轻点：双击 / 双点切换缩放；点在图片外的空白处关闭
                var now = e.timeStamp;
                if (now - lastTap < 300) {
                    lastTap = 0;
                    if (S > 1.05) { var h4 = home(); animateTo(h4.x, h4.y, 1, 420, SPRING); lb.classList.remove("is-zoomed"); }
                    else zoomAt(e.clientX, e.clientY, 2.5, 420);
                    return;
                }
                lastTap = now;
                var onImg = e.clientX >= X && e.clientX <= X + W * S && e.clientY >= Y && e.clientY <= Y + H * S;
                if (!onImg && S <= 1.01) setTimeout(function () { if (lastTap === now) close(); }, 260);
            }
            mode = "";
        }
        lb.addEventListener("pointerup", up);
        lb.addEventListener("pointercancel", up);
        lb.addEventListener("wheel", function (e) {
            e.preventDefault();
            zoomAt(e.clientX, e.clientY, S * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)), 0);
        }, { passive: false });
    }

    imgs.forEach(function (im, i) {
        im.classList.add("lb-zoomable");
        im.setAttribute("tabindex", "0");
        im.setAttribute("role", "button");
        if (!im.getAttribute("aria-label")) im.setAttribute("aria-label", (im.getAttribute("alt") || "图片") + "（点击放大）");
        im.addEventListener("click", function () { if (im.complete && im.naturalWidth) open(i); });
        im.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(i); } });
    });
})();


// 引用块（Quote Box）折叠/展开交互
// 由 scripts/quote-box.js 在渲染期把 <blockquote> 改写为 .quote-box 结构，
// 这里只负责点击表头（或折叠按钮）时切换 .is-collapsed。
(function () {
    function bindQuoteBoxes() {
        var headers = document.querySelectorAll(".quote-box .quote-header");
        for (var i = 0; i < headers.length; i++) {
            (function (header) {
                if (header.getAttribute("data-quote-bound") === "1") return;
                header.setAttribute("data-quote-bound", "1");
                header.addEventListener("click", function () {
                    var box = header.parentNode;
                    while (box && (!box.classList || !box.classList.contains("quote-box"))) {
                        box = box.parentNode;
                    }
                    if (box) box.classList.toggle("is-collapsed");
                });
            })(headers[i]);
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindQuoteBoxes);
    } else {
        bindQuoteBoxes();
    }
})();

// 正文段落的 content-visibility: auto 只为首帧（见 glint.css）：页面真正打开、过渡落定后，空闲时整篇排好，
// 目录 / 脚注跳转与滚动条都回到真实高度；预渲染中不排，免得点击时还在排版
(function () {
    var article = document.querySelector(".post-content:not(.is-special), .page-content:not(.is-special)");
    if (!article) return;
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    function layOut() {
        (window.vtSettled || Promise.resolve()).then(function () {
            idle(function () { article.classList.add("is-laid-out"); }, { timeout: 2000 });
        });
    }
    if (document.prerendering) document.addEventListener("prerenderingchange", layOut, { once: true });
    else layOut();
})();

// 续读位置：记住每篇文章读到哪一块（正文的直接子元素，按序号记，不记像素：字号 / 字体 / 视口变了也找得回），
// 再打开时在底部浮出「上次读到……」，点「继续阅读」才跳过去（不自动跳：读者可能就是想从头看，也免得打断一镜到底）
// 读到正文末尾即删掉记录；带锚点（目录 / 脚注 / 分享的链接）打开时不提示
(function () {
    var article = document.querySelector(".post-content:not(.is-special)");
    if (!article) return;
    var KEY = "whatasiger_read_progress";   // { 路径: { i: 块序号, f: 块内比例, p: 全文百分比, t: 时间 } }
    var MAX = 60;                           // 最多记这么多篇，超出删最早的
    var LINE = 0.3;                         // 阅读线：视口高度的 30% 处，越过它的那一块算「正在读」
    var path = location.pathname;
    var blocks = [].filter.call(article.children, function (el) {
        return el.tagName !== "SCRIPT" && el.tagName !== "STYLE" && !el.classList.contains("footnotes");
    });
    if (blocks.length < 8) return;          // 太短的不必记

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function store(all) {
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    }
    var saved = load()[path];

    // 当前读到哪：阅读线所在的那一块，以及阅读线落在它的几成处
    function current() {
        var line = window.innerHeight * LINE;
        var lo = 0, hi = blocks.length - 1;
        while (lo < hi) {                   // 二分：最后一块顶边在阅读线以上的
            var mid = (lo + hi + 1) >> 1;
            if (blocks[mid].getBoundingClientRect().top <= line) lo = mid; else hi = mid - 1;
        }
        var r = blocks[lo].getBoundingClientRect();
        var a = article.getBoundingClientRect();
        return {
            i: lo,
            f: r.height > 0 ? Math.max(0, Math.min(1, (line - r.top) / r.height)) : 0,
            p: Math.max(0, Math.min(100, Math.round((line - a.top) / Math.max(1, a.height) * 100))),
            end: a.bottom <= window.innerHeight * 0.9
        };
    }

    // 记录：读者自己滚动过才开始（免得一进页就拿页顶覆盖掉旧记录），停下 600ms 再写
    var dirty = false, timer = 0, started = false;
    function save() {
        clearTimeout(timer);
        if (!dirty) return;
        dirty = false;
        var all = load();
        var c = current();
        if (c.end) {
            delete all[path];               // 读完了：下次不再提示
        } else if (c.i < 2 && c.f < 0.5) {
            return;                         // 还在开头，不必记，也不覆盖旧记录
        } else {
            all[path] = { i: c.i, f: Math.round(c.f * 100) / 100, p: c.p, t: Date.now() };
            var keys = Object.keys(all);
            if (keys.length > MAX) {
                keys.sort(function (x, y) { return all[x].t - all[y].t; });
                for (var k = 0; k < keys.length - MAX; k++) delete all[keys[k]];
            }
        }
        store(all);
    }
    window.addEventListener("scroll", function () {
        if (!started) return;
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(save, 600);
    }, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });

    function begin() { started = true; }
    var settled = window.vtSettled || Promise.resolve();

    if (!saved || location.hash || !(saved.i >= 0) || saved.i >= blocks.length) {
        settled.then(begin);
        return;
    }

    // 浮条：段首摘一句 + 进度 + 继续阅读 / 关闭
    var target = blocks[saved.i];
    var excerpt = (target.textContent || "").replace(/\s+/g, " ").trim();
    if (excerpt.length > 18) excerpt = excerpt.slice(0, 18) + "…";
    var bar = document.createElement("div");
    bar.className = "resume-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<i class="fa fa-bookmark"></i>' +
        '<span class="resume-text"><span class="resume-label">上次读到 ' + saved.p + '%</span><span class="resume-excerpt"></span></span>' +
        '<button type="button" class="resume-go">继续阅读</button>' +
        '<button type="button" class="resume-close" aria-label="不用了"></button>';
    bar.querySelector(".resume-excerpt").textContent = excerpt || "（图片或空段落）";

    var hideTimer = 0;
    function hide() {
        clearTimeout(hideTimer);
        bar.classList.remove("is-shown");
        setTimeout(function () { bar.remove(); }, 400);
    }
    function go() {
        hide();
        article.classList.add("is-laid-out");   // 先整篇排好，位置才准（见上方 content-visibility）
        requestAnimationFrame(function () {
            var r = target.getBoundingClientRect();
            var y = window.pageYOffset + r.top + r.height * (saved.f || 0) - window.innerHeight * LINE;
            window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
            target.classList.remove("resume-mark");
            void target.offsetWidth;
            target.classList.add("resume-mark");    // 轻轻亮一下，告诉读者是哪一段
            setTimeout(function () { target.classList.remove("resume-mark"); }, 2400);
        });
    }
    bar.querySelector(".resume-go").addEventListener("click", go);
    bar.querySelector(".resume-close").addEventListener("click", hide);

    settled.then(function () {
        setTimeout(function () {
            document.body.appendChild(bar);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { bar.classList.add("is-shown"); });
            });
            hideTimer = setTimeout(hide, 12000);    // 一直不理会就自己收起
            begin();
            // 读者自己往下读过了上次的位置，浮条就没用了
            onScrollFar();
        }, 700);
    });
    function onScrollFar() {
        var ticking = false;
        var check = function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {    // 每帧最多量一次
                ticking = false;
                if (!bar.isConnected) { window.removeEventListener("scroll", check); return; }
                if (current().i >= saved.i) { hide(); window.removeEventListener("scroll", check); }
            });
        };
        window.addEventListener("scroll", check, { passive: true });
    }
})();

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Glint %c based on Hingle · https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}}

// 续读的延伸（glint.css「续读位置」末尾）：
// 1. 列表上的「读到 x%」：首页卡片、归档时间线、文末「继续阅读」与相关阅读里，读到一半的文章挂一枚进度胶囊（读的是上面续读脚本的记录）
// 2. 目录里标出读过的章节：另记每篇读到过的最远一块（localStorage whatasiger_read_max，读完记为全篇），整章都读过的那一项亮一枚小勾
// 3. 目录卡片标题栏显示「本章约剩 x 分钟」：按当前章节剩下的字数、每分钟约 550 字（与文章页「预计阅读」一致）估算
// 目录由 Glint 构造时生成（页脚的内联脚本），所以等 DOMContentLoaded 再动手
;(function () {    // 行首分号：上一段以 }} 结尾，不加会被接成一次函数调用
    var PROG_KEY = "whatasiger_read_progress", MAX_KEY = "whatasiger_read_max", MAX_POSTS = 120, CPM = 550;
    function load(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
    function norm(u) { try { return new URL(u, location.href).pathname.replace(/index\.html$/, ""); } catch (e) { return ""; } }

    function badges() {
        var prog = load(PROG_KEY);      // 记录为空也要走一遍：读完最后一篇后退回来（往返缓存），旧徽章得删掉
        var spots = [
            ["a.post-item.card-style:not(.cw-card)", ".post-card-meta"],
            [".archive-row", ".archive-meta"],
            [".post-near-card", ".post-near-meta"],
            [".post-related-item", ".post-related-meta"]
        ];
        spots.forEach(function (sp) {
            [].forEach.call(document.querySelectorAll(sp[0]), function (a) {
                var rec = prog[norm(a.href)], box = a.querySelector(sp[1]);
                var old = box && box.querySelector(".read-badge");
                if (old) old.remove();
                if (!rec || !(rec.p > 0) || !box) return;
                var pct = Math.max(1, Math.min(99, Math.round(rec.p)));
                var b = document.createElement("span");
                b.className = "read-badge";
                b.style.setProperty("--rp", pct + "%");
                b.textContent = "读到 " + pct + "%";
                b.title = "上次读到这里，打开后可继续阅读";
                if (sp[0] === ".archive-row") box.insertBefore(b, box.firstChild); else box.appendChild(b);
            });
        });
    }

    function chapters() {
        var article = document.querySelector(".post-content:not(.is-special)");
        var toc = document.querySelector(".article-list");
        if (!article || !toc) return;
        var path = location.pathname;
        var blocks = [].filter.call(article.children, function (el) {
            return el.tagName !== "SCRIPT" && el.tagName !== "STYLE" && !el.classList.contains("footnotes");
        });
        if (!blocks.length) return;
        // 各块的字数（去掉空白）与目录项对应的块序号
        var lens = blocks.map(function (el) { return el.textContent.replace(/\s+/g, "").length; });
        var links = [].slice.call(toc.querySelectorAll(".article-list-body a[href^='#']"));
        var heads = links.map(function (a) {
            var id = a.getAttribute("href").slice(1);
            try { id = decodeURIComponent(id); } catch (e) {}
            var h = document.getElementById(id), at = -1;
            for (var i = 0; h && i < blocks.length; i++) if (blocks[i] === h || blocks[i].contains(h)) { at = i; break; }
            return { a: a, at: at };
        }).filter(function (x) { return x.at >= 0; });
        if (!heads.length) return;

        var all = load(MAX_KEY);
        var max = all[path] ? all[path].m : -1;
        function mark() {
            heads.forEach(function (h, k) {
                var end = k + 1 < heads.length ? heads[k + 1].at : blocks.length;
                h.a.classList.toggle("is-read", max >= end);
            });
        }
        mark();

        var remain = document.createElement("span");
        remain.className = "toc-remain";
        var head = toc.querySelector(".article-list-head");
        var title = head && head.querySelector(".title");
        if (title) title.insertAdjacentElement("afterend", remain);

        var LINE = 0.3, ticking = false, saveTimer = 0;
        function currentBlock() {
            var line = window.innerHeight * LINE, lo = 0, hi = blocks.length - 1;
            while (lo < hi) {
                var mid = (lo + hi + 1) >> 1;
                if (blocks[mid].getBoundingClientRect().top <= line) lo = mid; else hi = mid - 1;
            }
            var r = blocks[lo].getBoundingClientRect();
            return { i: lo, f: r.height > 0 ? Math.max(0, Math.min(1, (line - r.top) / r.height)) : 0, top: blocks[0].getBoundingClientRect().top > line };
        }
        function update() {
            ticking = false;
            var c = currentBlock();
            // 本章剩余：当前块往后到下一个标题之前
            var k = -1;
            for (var j = 0; j < heads.length; j++) if (heads[j].at <= c.i) k = j;
            if (c.top || k < 0) { remain.textContent = ""; }
            else {
                var end = k + 1 < heads.length ? heads[k + 1].at : blocks.length, rest = lens[c.i] * (1 - c.f);
                for (var b = c.i + 1; b < end; b++) rest += lens[b];
                var min = Math.ceil(rest / CPM);
                remain.textContent = rest < 30 ? "本章将尽" : "本章约剩 " + min + " 分钟";
            }
            // 读到过的最远处：逐帧跟着滚动连续经过的范围往前推（平滑滚动每帧只走几段，一路接得上；拖滚动条、刷新时恢复的滚动位置
            // 一下跳过去，接不上就不算），位置停稳 2 秒才记下；读到正文末尾记为全篇
            var a = article.getBoundingClientRect();
            var reached = a.bottom <= window.innerHeight * 0.9 ? blocks.length : c.i;
            // 点了底部的「继续阅读」：那一次跳转是读者自己要接着读，算数
            if (reached > cand && (reached - Math.max(cand, 0) <= 30 || Date.now() < jumpOk)) cand = reached;
            clearTimeout(stableTimer);
            if (cand > max) stableTimer = setTimeout(function () { advance(cand); }, 2000);
        }
        var stableTimer = 0, cand = max, jumpOk = 0;
        document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".resume-go")) jumpOk = Date.now() + 1500; }, true);
        function advance(reached) {
            if (reached <= max) return;
            {
                max = reached;
                mark();
                clearTimeout(saveTimer);
                saveTimer = setTimeout(function () {
                    var cur = load(MAX_KEY);
                    cur[path] = { m: max, t: Date.now() };
                    var keys = Object.keys(cur);
                    if (keys.length > MAX_POSTS) {
                        keys.sort(function (x, y) { return cur[x].t - cur[y].t; });
                        for (var q = 0; q < keys.length - MAX_POSTS; q++) delete cur[keys[q]];
                    }
                    try { localStorage.setItem(MAX_KEY, JSON.stringify(cur)); } catch (e) {}
                }, 800);
            }
        }
        function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
        // 等过渡落定、正文整篇排好（content-visibility 撤掉）后再开始量，免得按估计高度算错
        (window.vtSettled || Promise.resolve()).then(function () {
            setTimeout(function () {
                window.addEventListener("scroll", onScroll, { passive: true });
                window.addEventListener("resize", onScroll);
                update();
            }, 400);
        });
    }

    function run() { badges(); chapters(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
    window.addEventListener("pageshow", function (e) { if (e.persisted) badges(); });   // 从文章返回（往返缓存）时补上刚产生的进度
})();

// 更新日志（glint.css「更新日志折叠与更新提示」）：
// 1. 「关于网站」页里，各版本标题（#### **版本名**（日期））可点击折叠；只展开最新的一版，旧版本收起（行高 0fr ↔ 1fr 过渡）
//    从目录点到收起的版本时自动展开；带 #changelog-latest 打开时滚到最新一版
// 2. 发了新版本后，老读者再来时底部浮出一次「Whatasiger 更新到了「版本名」」（footer.ejs 的 GLINT_RELEASE；第一次来的读者只记下、不提示；
//    看过「关于网站」或点了关闭就不再出现）。只在非阅读页出现，不打扰读文章；记录在 localStorage whatasiger_seen_release
;(function () {
    var REL_KEY = "whatasiger_seen_release";
    var rel = window.GLINT_RELEASE;
    var relKey = rel ? rel.name + "@" + rel.date : "";
    var content = document.querySelector(".page-content:not(.is-special)");
    var onAbout = rel && location.pathname.replace(/index\.html$/, "") === rel.url;

    function remember() { try { if (relKey) localStorage.setItem(REL_KEY, relKey); } catch (e) {} }

    if (content && onAbout) {
        var heads = [].filter.call(content.querySelectorAll("h4"), function (h) {
            return /（\d{4}-\d{2}-\d{2}）\s*$/.test(h.textContent);
        });
        if (heads.length > 1) {
            var latest = heads[heads.length - 1];
            heads.forEach(function (h) {
                // 把标题之后、下一条分隔线 / 版本标题之前的内容收进折叠盒
                var box = document.createElement("div"), inner = document.createElement("div");
                box.className = "cl-body";
                inner.className = "cl-inner";
                box.appendChild(inner);
                var n = h.nextSibling;
                while (n && !(n.nodeType === 1 && (n.tagName === "HR" || heads.indexOf(n) !== -1))) {
                    var next = n.nextSibling;
                    inner.appendChild(n);
                    n = next;
                }
                h.parentNode.insertBefore(box, n);
                h.classList.add("cl-head");
                h.setAttribute("role", "button");
                h.setAttribute("tabindex", "0");
                var open = h === latest;
                h.setAttribute("aria-expanded", String(open));
                box.classList.toggle("is-open", open);
                if (h === latest) h.classList.add("is-latest");
                function toggle(v) {
                    var o = typeof v === "boolean" ? v : h.getAttribute("aria-expanded") !== "true";
                    h.setAttribute("aria-expanded", String(o));
                    box.classList.toggle("is-open", o);
                }
                h._clToggle = toggle;
                h.addEventListener("click", function (e) {
                    if (e.target.closest("a.headerlink")) return;    // 点锚点照常
                    toggle();
                });
                h.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
                });
            });
            // 从目录 / 锚点跳到收起的版本：先展开
            function openFor(id) {
                var t = id && document.getElementById(id);
                if (t && t._clToggle) t._clToggle(true);
            }
            document.addEventListener("click", function (e) {
                var a = e.target.closest && e.target.closest(".article-list-body a[href^='#']");
                if (!a) return;
                var id = a.getAttribute("href").slice(1);
                try { id = decodeURIComponent(id); } catch (err) {}
                openFor(id);
            }, true);
            var hash = "";
            try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
            if (hash === "changelog-latest") {
                (window.vtSettled || Promise.resolve()).then(function () {
                    setTimeout(function () { latest.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
                });
            } else openFor(hash);
        }
    }

    // 更新提示
    if (!relKey) return;
    if (onAbout) { remember(); return; }
    var seen = null;
    try { seen = localStorage.getItem(REL_KEY); } catch (e) {}
    if (!seen) { remember(); return; }              // 第一次来：只记下
    if (seen === relKey || document.body.classList.contains("post-page")) return;
    var bar = document.createElement("div");
    bar.className = "release-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<span class="release-spark" aria-hidden="true"></span><span class="release-text">Whatasiger 更新到了「<b></b>」</span>' +
        '<a class="release-go" href="' + rel.url + '#changelog-latest">看看有什么新东西<i class="fa fa-angle-right" aria-hidden="true"></i></a>' +
        '<button type="button" class="release-close" aria-label="不再提示"></button>';
    bar.querySelector("b").textContent = rel.name;
    function hide() {
        remember();
        bar.classList.remove("is-shown");
        setTimeout(function () { bar.remove(); }, 400);
    }
    bar.querySelector(".release-close").addEventListener("click", hide);
    bar.querySelector(".release-go").addEventListener("click", remember);
    function show() {
        document.body.appendChild(bar);
        requestAnimationFrame(function () { requestAnimationFrame(function () { bar.classList.add("is-shown"); }); });
    }
    if (document.prerendering) document.addEventListener("prerenderingchange", function () { setTimeout(show, 1600); }, { once: true });
    else setTimeout(show, 1600);
})();
