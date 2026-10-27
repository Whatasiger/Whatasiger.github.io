/* ----

# Hingle Theme
# By: Dreamer-Paul
# Last Update: 2024.9.2

一个简洁大气，含夜间模式的 Hexo 博客模板。

本代码为奇趣保罗原创，并遵守 MIT 开源协议。欢迎访问我的博客：https://paugram.com

---- */

var Paul_Hingle = function (config) {
    var body = document.body;
    var content = ks.select(".post-content:not(.is-special), .page-content:not(.is-special)");

    // 全局阅读设置（保存在 localStorage，控制回到顶部 / 字体 / 背景）
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
        showToTop: false,      // 默认隐藏「回到顶部」
        immersive: false,      // 沉浸模式：下滑收起顶栏，快速上滑才重新出现
        hideBackground: false, // 是否隐藏背景图片
        hideTodo: false,       // 是否关闭首页 TODO 侧边栏
        fontFamily: "noto-sans-sc", // 字体：noto-sans-sc（思源黑体）或 system-default（系统默认）
        fontWeight: getWeightFromLevel(3), // 正文字重第三档
        letterSpacing: 3,      // 字间距第六档（-2起步，第6个=3）
        fontSize: 100,         // 字号第三档（90起步，第3heo个=110）
        bgOpacity: 55,         // 背景可见度第八档（0起步step5，第8个=35）
        bgBlur: 8,             // 背景模糊度（0~20px），文章页默认8px
        accent: "blue"         // 主题色：blue（天青）/ lavender / sakura / mikan / wakakusa / mint，见 hingle.css 第 0 节
    };

    var currentSettings = (function () {
        try {
            var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            if (saved && typeof saved === "object") {
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

        // 沉浸模式：开启时由 setupImmersive() 根据滚动收起 / 唤出顶栏；关闭时立即复位
        body.classList.toggle("immersive", !!currentSettings.immersive);
        if (!currentSettings.immersive) document.documentElement.classList.remove("header-hidden");

        // 回到顶部按钮：通过类控制 + JS 逻辑双保险
        if (currentSettings.showToTop) {
            body.classList.remove("hide-to-top");
        } else {
            body.classList.add("hide-to-top");
        }

        // 背景图片显示 / 隐藏
        if (currentSettings.hideBackground) {
            body.classList.add("no-bg-image");
        } else {
            body.classList.remove("no-bg-image");
        }

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
        }
    }

    function updateSliderFill(input) {
        var min = parseFloat(input.min) || 0;
        var max = parseFloat(input.max) || 100;
        var val = parseFloat(input.value) || 0;
        var pct = ((val - min) / (max - min)) * 100;
        var isDark = body.classList.contains("dark-theme");
        // 进度色取主题色阶（随主题色切换）：夜间用柔和一级，白天用主色一级
        var fill = isDark ? "color-mix(in srgb, var(--tc-soft) 50%, transparent)" : "color-mix(in srgb, var(--tc-main) 55%, transparent)";
        var track = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
        input.style.backgroundImage = "linear-gradient(90deg, " + fill + " " + pct + "%, " + track + " " + pct + "%)";
    }

    function updateAllSliderFills() {
        var sliders = document.querySelectorAll(".settings-row-range input[type='range']");
        for (var i = 0; i < sliders.length; i++) updateSliderFill(sliders[i]);
    }

    // 浮层（设置面板 / 手机端导航卡片）同时打开时，后打开的置于最上层
    function bringToFront(el) {
        var tops = document.querySelectorAll(".on-top");
        for (var i = 0; i < tops.length; i++) tops[i].classList.remove("on-top");
        el.classList.add("on-top");
    }

    function setupSettingsPanel() {
        var panel = document.getElementById("reader-settings-panel");
        var btn = ks.select(".settings-btn");

        if (!panel || !btn) return;

        var showTopInput = document.getElementById("setting-show-top");
        var immersiveInput = document.getElementById("setting-immersive");
        var hideBgInput = document.getElementById("setting-hide-bg");
        var hideTodoInput = document.getElementById("setting-hide-todo");
        var fontFamilyInput = document.getElementById("setting-font-family");
        var weightInput = document.getElementById("setting-font-weight");
        var letterInput = document.getElementById("setting-letter-spacing");
        var sizeInput = document.getElementById("setting-font-size");
        var bgInput = document.getElementById("setting-bg-opacity");
        var bgBlurInput = document.getElementById("setting-bg-blur");
        var resetBtn = document.getElementById("setting-reset-btn");
        var accentInput = document.getElementById("setting-accent");
        var accentName = document.getElementById("setting-accent-name");

        // 初始化表单值
        if (showTopInput) showTopInput.checked = !!currentSettings.showToTop;
        if (immersiveInput) immersiveInput.checked = !!currentSettings.immersive;
        if (hideBgInput) hideBgInput.checked = !!currentSettings.hideBackground;
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
        if (bgInput) bgInput.value = ((typeof currentSettings.bgOpacity === "number"
            ? currentSettings.bgOpacity
            : defaultSettings.bgOpacity) / 2);
        var isPostPage = body.classList.contains("post-page");
        var initBlur = isPostPage
            ? (typeof currentSettings.bgBlur === "number" ? currentSettings.bgBlur : defaultSettings.bgBlur)
            : 0;
        if (bgBlurInput) bgBlurInput.value = initBlur;
        body.style.setProperty("--bg-blur", initBlur + "px");

        updateAllSliderFills();

        // 打开 / 关闭面板
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (panel.classList.toggle("open")) bringToFront(panel);
        });

        document.addEventListener("click", function (e) {
            if (!panel.classList.contains("open")) return;
            if (panel.contains(e.target) || e.target === btn) return;
            panel.classList.remove("open");
        });

        // 绑定设置变更
        if (showTopInput) {
            showTopInput.addEventListener("change", function () {
                currentSettings.showToTop = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (immersiveInput) {
            immersiveInput.addEventListener("change", function () {
                currentSettings.immersive = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (hideBgInput) {
            hideBgInput.addEventListener("change", function () {
                currentSettings.hideBackground = !!this.checked;
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
                var lvl = parseInt(this.value, 10) || 3;
                currentSettings.fontWeight = getWeightFromLevel(lvl);
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        if (letterInput) {
            letterInput.addEventListener("input", function () {
                currentSettings.letterSpacing = parseInt(this.value, 10) || 0;
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        if (sizeInput) {
            sizeInput.addEventListener("input", function () {
                currentSettings.fontSize = parseInt(this.value, 10) || defaultSettings.fontSize;
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
                currentSettings.bgOpacity = Math.round(v * 2);
                persistSettings();
                applyReadingSettings();
                updateSliderFill(this);
            });
        }

        if (bgBlurInput) {
            bgBlurInput.addEventListener("input", function () {
                var v = parseInt(this.value, 10);
                if (isNaN(v) || v < 0) v = 0;
                if (v > 20) v = 20;
                body.style.setProperty("--bg-blur", v + "px");
                if (isPostPage) {
                    currentSettings.bgBlur = v;
                    persistSettings();
                }
                updateSliderFill(this);
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener("click", function () {
                currentSettings.showToTop = defaultSettings.showToTop;
                currentSettings.immersive = defaultSettings.immersive;
                currentSettings.hideBackground = defaultSettings.hideBackground;
                currentSettings.hideTodo = defaultSettings.hideTodo;
                currentSettings.fontFamily = defaultSettings.fontFamily;
                currentSettings.fontWeight = defaultSettings.fontWeight;
                currentSettings.letterSpacing = defaultSettings.letterSpacing;
                currentSettings.fontSize = defaultSettings.fontSize;
                currentSettings.bgOpacity = defaultSettings.bgOpacity;
                currentSettings.bgBlur = defaultSettings.bgBlur;
                currentSettings.accent = defaultSettings.accent;

                persistSettings();
                applyReadingSettings();

                var resetBlur = isPostPage ? defaultSettings.bgBlur : 0;
                body.style.setProperty("--bg-blur", resetBlur + "px");

                if (showTopInput) showTopInput.checked = !!currentSettings.showToTop;
                if (immersiveInput) immersiveInput.checked = !!currentSettings.immersive;
                if (hideBgInput) hideBgInput.checked = !!currentSettings.hideBackground;
                if (hideTodoInput) hideTodoInput.checked = !!currentSettings.hideTodo;
                if (fontFamilyInput) setFontSegment(currentSettings.fontFamily);
                if (accentInput) setAccentSwatch(currentSettings.accent);
                if (weightInput) weightInput.value = getLevelFromWeight(currentSettings.fontWeight);
                if (letterInput) letterInput.value = currentSettings.letterSpacing;
                if (sizeInput) sizeInput.value = currentSettings.fontSize;
                if (bgInput) bgInput.value = currentSettings.bgOpacity / 2;
                if (bgBlurInput) bgBlurInput.value = resetBlur;
                updateAllSliderFills();
            });
        }
    }

    // 菜单按钮
    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];
        var toggleBtn = ks.select(".toggle-btn");

        toggleBtn.onclick = function (e) {
            e.stopPropagation();
            if (menu.classList.toggle("active")) bringToFront(menu);
        };

        // 点击菜单内的链接后自动收起（手机端浮动菜单体验）
        if (menu) {
            var menuLinks = menu.querySelectorAll("a");
            menuLinks.forEach(function (link) {
                link.addEventListener("click", function () {
                    menu.classList.remove("active");
                });
            });
        }

        // 点击菜单外部区域时关闭菜单
        document.addEventListener("click", function (e) {
            if (menu && menu.classList.contains("active")) {
                if (!menu.contains(e.target) && e.target !== toggleBtn) {
                    menu.classList.remove("active");
                }
            }
        });

        ks.select(".light-btn").onclick = this.night;

        // 增加安全检查：只有搜索按钮存在时才绑定点击事件
        var search = document.getElementsByClassName("search-btn")[0];
        var bar = document.getElementsByClassName("head-search")[0];

        if (search && bar) {
            search.addEventListener("click", function () {
                bar.classList.toggle("active");
            });
        }

        // 初始化右上角设置面板
        setupSettingsPanel();
    };

    // 沉浸模式：向下滚动即收起顶栏；向上滚动要够快才唤出（慢慢往回翻不会打扰阅读）
    // 「够快」= 最近 450ms 内向上滚过的距离达到 250px（约 0.55px/ms）：滚轮拨一两格不会触发，连拨到 250px 以上 / 快速上滑才会
    function setupImmersive() {
        var root = document.documentElement;
        var REVEAL_WINDOW = 450;    // ms：只统计这段时间内的上滑距离（一次连拨滚轮通常在这之内）
        var REVEAL_DISTANCE = 500;  // px：上滑达到这个距离才唤出顶栏
        var TOP_ZONE = 64;          // 离页顶这么近时始终显示顶栏
        var samples = [];           // 最近的 { t, y }
        var lastY = window.pageYOffset || 0;
        var ticking = false;

        // 有浮层打开或正在搜索时不收起，免得面板没了依托
        function busy() {
            return !!document.querySelector(".settings-panel.open, .head-menu.active, .head-search.active") ||
                (document.activeElement && document.activeElement.id === "local-search-input");
        }

        function update() {
            ticking = false;
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

        window.addEventListener("scroll", function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(update);
        }, { passive: true });
    }

    // 关灯切换 (使用 sessionStorage 记忆单次会话)
    this.night = function () {
        if(body.classList.contains("dark-theme")){
            body.classList.remove("dark-theme");
            sessionStorage.setItem("theme", "light");
        }
        else{
            body.classList.add("dark-theme");
            sessionStorage.setItem("theme", "dark");
        }
        // 日月图标转入：先摘掉再强制回流，连点时动画也能重新开始
        var btn = ks.select(".light-btn");
        if (btn) {
            btn.classList.remove("is-flipping");
            void btn.offsetWidth;
            btn.classList.add("is-flipping");
            btn.addEventListener("animationend", function () { btn.classList.remove("is-flipping"); }, { once: true });
        }
        updateAllSliderFills();
    };

    // 目录树
    this.tree = function () {
        const wrap = ks.select(".wrap");
        const headings = content.querySelectorAll("h1:not(.footnotes *), h2:not(.footnotes *), h3:not(.footnotes *), h4:not(.footnotes *), h5:not(.footnotes *), h6:not(.footnotes *)");

        if (headings.length === 0) {
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
            const text = t.innerText;

            t.id = "title-" + index;

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            tocBody.appendChild(ks.create("a", { class: className, text, href: `#title-${index}` }));
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

            var shouldForceOpenToc = false;

            // 手机端：目录按钮处于“半隐藏”时，点击后按钮先弹出，并且直接打开目录
            if (window.innerWidth < 600 && btn.classList.contains("toc-toggle-docked")) {
                btn.classList.remove("toc-toggle-docked");
                shouldForceOpenToc = true;

                // 与目录按钮保持同步：同时让“回到顶部”按钮弹出
                var toTopBtn = document.getElementsByClassName("to-top")[0];
                if (toTopBtn) {
                    toTopBtn.classList.remove("to-top-docked");
                }
            }

            if (window.innerWidth >= 800) {
                // 电脑端：悬浮目录按钮直接切换收起/展开，让阅读区更清爽
                body.classList.toggle("toc-collapsed");
            } else {
                // 如果是手机端，半隐藏状态点击后直接打开目录，否则维持切换逻辑
                if (shouldForceOpenToc) {
                    trees.classList.add("active");
                } else {
                    trees.classList.toggle("active");
                }
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

        // 手机端目录按钮：下滑半隐藏，上滑恢复
        const mobileMedia = window.matchMedia("(max-width: 599px)");
        let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;

        function updateMobileTocButtonState() {
            if (!btn) return;

            // 非手机端或目录抽屉已展开时，按钮始终保持正常位置
            if (!mobileMedia.matches || trees.classList.contains("active")) {
                btn.classList.remove("toc-toggle-docked");
                lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
                return;
            }

            const currentTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            const delta = currentTop - lastScrollTop;

            // 设定小阈值，避免轻微抖动导致频繁触发动画
            if (delta > 6 && currentTop > 24) {
                btn.classList.add("toc-toggle-docked");
            } else if (delta < -4) {
                btn.classList.remove("toc-toggle-docked");
            }

            lastScrollTop = currentTop;
        }

        window.addEventListener("scroll", updateMobileTocButtonState, { passive: true });
        window.addEventListener("resize", updateMobileTocButtonState);
        updateMobileTocButtonState();

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
        window.addEventListener("scroll", updateMiniDock, { passive: true });
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
                    var href = g.parent.getAttribute("href");
                    if (href) {
                        var target = document.querySelector(href);
                        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                });
            });
        })();

        if (tocLinks.length > 0 && headingArr.length === tocLinks.length) {
            var spyTicking = false;
            var lastActive = -1;
            // 点击目录跳转后 smooth scroll 期间短暂锁住高亮，防止误高亮上一项。
            // 时间窗口短 + 用户主动滚动方向反转时立即解锁，保证跟随灵敏。
            var pinnedIdx = -1;
            var pinnedUntil = 0;
            var pinnedScrollDir = 0;
            var prevScrollY = window.pageYOffset || 0;

            function updateScrollSpy() {
                spyTicking = false;
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
                var threshold = 80;
                var activeIdx = -1;

                for (var i = 0; i < headingArr.length; i++) {
                    var rect = headingArr[i].getBoundingClientRect();
                    if (rect.top - threshold <= 0) {
                        activeIdx = i;
                    } else {
                        break;
                    }
                }
                if (activeIdx === -1) activeIdx = 0;
                setActiveTocItem(activeIdx);
            }

            function requestScrollSpy() {
                if (spyTicking) return;
                spyTicking = true;
                window.requestAnimationFrame(updateScrollSpy);
            }

            window.addEventListener("scroll", requestScrollSpy, { passive: true });
            window.addEventListener("resize", requestScrollSpy);
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
            requestScrollSpy();
        }
    };

    // 自动添加外链
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

    // 返回页首
    var toTopMobileMedia = window.matchMedia("(max-width: 599px)");
    var lastToTopScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;

    this.to_top = function () {
        var btn = document.getElementsByClassName("to-top")[0];
        var scroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

        if (!btn) return;

        // 用户主动关闭回到顶部时，强制保持隐藏
        if (!currentSettings.showToTop) {
            btn.classList.remove("active");
            btn.classList.remove("to-top-docked");
            lastToTopScrollTop = scroll;
            return;
        }

        if (scroll >= window.innerHeight / 2) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
            btn.classList.remove("to-top-docked");
            lastToTopScrollTop = scroll;
            return;
        }

        // 与目录按钮保持一致：移动端下滑半隐藏、上滑弹出
        if (!toTopMobileMedia.matches) {
            btn.classList.remove("to-top-docked");
            lastToTopScrollTop = scroll;
            return;
        }

        // 移动端目录展开时，回到顶部按钮保持弹出，不参与半隐藏逻辑
        var activeToc = document.querySelector(".article-list.active");
        if (activeToc) {
            btn.classList.remove("to-top-docked");
            lastToTopScrollTop = scroll;
            return;
        }

        var delta = scroll - lastToTopScrollTop;
        if (delta > 6 && scroll > 24) {
            btn.classList.add("to-top-docked");
        } else if (delta < -4) {
            btn.classList.remove("to-top-docked");
        }

        lastToTopScrollTop = scroll;
    };

    this.header();
    setupImmersive();

    if(content){
        this.tree();
        this.links();
        this.comment_list();
    }

    // 返回页首
    window.addEventListener("scroll", this.to_top);

    // 首次应用阅读设置（在夜间模式与其它初始化之前执行）
    applyReadingSettings();

    // 如果开启自动夜间模式
    // =========================================
    // 主题初始化逻辑：基于 sessionStorage 和默认关灯设定
    // =========================================
    var currentTheme = sessionStorage.getItem("theme");

    if (currentTheme === "light") {
        // 如果当前标签页明确记录了你要开灯，则保持开灯
        document.body.classList.remove("dark-theme");
    } else {
        // 否则（没记录，或是你彻底关闭后重新打开的新标签页），一律强制进入默认的关灯模式
        document.body.classList.add("dark-theme");
        sessionStorage.setItem("theme", "dark");
    }

    // 如果开启复制内容提示
    if(config.copyright){
        document.oncopy = function () {
            ks.notice("复制内容请注明来源并保留版权信息！", {color: "yellow", overlay: true})
        };
    }

    //
    // ! Hexo 特别功能
    //

    // 本地全文搜索（标题 / 标签 / 正文 三路匹配，并显示正文片段）
    this.local_search = function () {
        var input = document.getElementById("local-search-input");
        var result = document.getElementById("local-search-result");

        if (!input || !result) return;

        // ----- 工具函数 -----
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
        function escapeRegExp(s) {
            return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        // 把 HTML 摘要里的标签去掉、空白压一压，得到纯文本
        function plainText(html) {
            return String(html || "")
                .replace(/<style[\s\S]*?<\/style>/gi, " ")
                .replace(/<script[\s\S]*?<\/script>/gi, " ")
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, " ")
                .trim();
        }
        // 在 contentLower 里找 keyword，截一段上下文做高亮
        function buildSnippet(content, keyword, contextLen) {
            if (!content) return "";
            var lower = content.toLowerCase();
            var idx = lower.indexOf(keyword);
            if (idx === -1) return "";

            var half = Math.max(15, Math.floor((contextLen || 80) / 2));
            var start = Math.max(0, idx - half);
            var end = Math.min(content.length, idx + keyword.length + half);

            var snippet = content.slice(start, end);
            if (start > 0) snippet = "…" + snippet;
            if (end < content.length) snippet = snippet + "…";

            // 转义后再用占位符替换实现高亮，避免高亮标签被一并转义
            var safeSnippet = escapeHtml(snippet);
            var pattern = new RegExp(escapeRegExp(escapeHtml(keyword)), "gi");
            return safeSnippet.replace(pattern, function (m) {
                return '<mark class="search-result-mark">' + m + "</mark>";
            });
        }

        // ----- 加载 search.xml -----
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/search.xml", true);
        xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 400) return;
            var xml = xhr.responseXML;
            if (!xml) return;

            var datas = Array.from(xml.querySelectorAll("entry")).map(function (entry) {
                var tags = Array.from(entry.querySelectorAll("tags tag")).map(function (t) {
                    return t.textContent;
                }).join(" ");

                var contentNode = entry.querySelector("content");
                var contentText = contentNode ? plainText(contentNode.textContent) : "";

                return {
                    title: entry.querySelector("title") ? entry.querySelector("title").textContent : "",
                    url: entry.querySelector("url") ? entry.querySelector("url").textContent : "",
                    tags: tags,
                    content: contentText
                };
            });

            var MAX_RESULTS = 8;
            var debounceTimer = null;

            function runSearch() {
                var keyword = input.value.trim().toLowerCase();
                result.innerHTML = "";

                if (keyword.length <= 0) {
                    result.style.display = "none";
                    return;
                }

                var str = '<ul class="search-result-list">';
                var hits = 0;

                for (var i = 0; i < datas.length && hits < MAX_RESULTS; i++) {
                    var data = datas[i];
                    var titleLower = data.title.toLowerCase();
                    var tagsLower = data.tags.toLowerCase();
                    var contentLower = data.content.toLowerCase();

                    var inTitle = titleLower.indexOf(keyword) > -1;
                    var inTags = tagsLower.indexOf(keyword) > -1;
                    var inContent = contentLower.indexOf(keyword) > -1;

                    if (!inTitle && !inTags && !inContent) continue;

                    str += '<li class="search-result-item">';
                    str += '<a href="' + escapeHtml(data.url) + '" class="search-result-link">';
                    str += '<span class="search-result-title">' + escapeHtml(data.title) + "</span>";

                    if (inTags && !inTitle) {
                        str += '<span class="search-result-tag-hint"> # 匹配到标签</span>';
                    }
                    if (inContent && !inTitle) {
                        var snippet = buildSnippet(data.content, keyword, 80);
                        if (snippet) {
                            str += '<span class="search-result-snippet">' + snippet + "</span>";
                        }
                    }

                    str += "</a></li>";
                    hits++;
                }

                if (hits > 0) {
                    result.innerHTML = str + "</ul>";
                    result.style.display = "block";
                } else {
                    result.innerHTML =
                        '<div class="search-no-result">呜... 没有找到与 "' +
                        escapeHtml(keyword) +
                        '" 相关的文章</div>';
                    result.style.display = "block";
                }
            }

            input.addEventListener("input", function () {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(runSearch, 80); // 输入节流，避免每个按键都跑一遍全文匹配
            });
        };
        xhr.send();
    };

// 在文件初始化末尾，执行这个搜索功能
    this.local_search();

// 图片懒加载 + 缩放
// 1. 把正文图片的真实地址转存到 ks-original，用轻量占位符替换 src，
//    这样浏览器不会在页面初始就请求视口外的图片。
// 2. ks.lazy() 基于 IntersectionObserver，图片进入视口时自动回填 src。
// 3. ks.image() 优先读取 ks-original，因此懒加载与灯箱天然兼容。
var CONTENT_IMG_SEL = ".post-content:not(.is-special) img, .page-content:not(.is-special) img";
var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

(function () {
    var imgs = document.querySelectorAll(CONTENT_IMG_SEL);
    if (!imgs.length) return;

    for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var src = img.getAttribute("src");
        if (!src || src === BLANK) continue;
        img.setAttribute("ks-original", src);
        img.setAttribute("src", BLANK);
    }

    ks.lazy(CONTENT_IMG_SEL);
})();

ks.image(CONTENT_IMG_SEL);

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

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Hingle %c https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}}
