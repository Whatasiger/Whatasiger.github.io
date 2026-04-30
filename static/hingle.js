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

    var defaultSettings = {
        showToTop: false,      // 默认隐藏「回到顶部」
        hideBackground: false, // 是否隐藏背景图片
        fontFamily: "noto-sans-sc", // 字体：noto-sans-sc（思源黑体）或 system-default（系统默认）
        fontWeight: getWeightFromLevel(3), // 正文字重第三档
        letterSpacing: 3,      // 字间距第六档（-2起步，第6个=3）
        fontSize: 100,         // 字号第三档（90起步，第3heo个=110）
        bgOpacity: 50,         // 背景可见度第八档（0起步step5，第8个=35）
        bgBlur: 8              // 背景模糊度（0~20px），文章页默认8px
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

        // 背景模糊度（文章页应用用户设置，非文章页归零）
        var bgBlurValue = typeof currentSettings.bgBlur === "number"
            ? currentSettings.bgBlur
            : defaultSettings.bgBlur;
        bgBlurValue = Math.max(0, Math.min(20, bgBlurValue));
        body.style.setProperty("--bg-blur",
            body.classList.contains("post-page") ? bgBlurValue + "px" : "0px");

        // 字体设置
        var fontFamily = currentSettings.fontFamily || defaultSettings.fontFamily;
        if (fontFamily === "noto-sans-sc") {
            body.style.fontFamily = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
        } else {
            body.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
        }

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

        // 文章阅读排版（仅在阅读页生效）
        if (body.classList.contains("post-page")) {
            body.style.setProperty("--reader-font-weight", String(currentSettings.fontWeight));
            body.style.setProperty("--reader-letter-spacing", (currentSettings.letterSpacing / 100) + "em");
            body.style.setProperty("--reader-font-size", (currentSettings.fontSize / 100) + "rem");
        }
    }

    function setupSettingsPanel() {
        var panel = document.getElementById("reader-settings-panel");
        var btn = ks.select(".settings-btn");

        if (!panel || !btn) return;

        var showTopInput = document.getElementById("setting-show-top");
        var hideBgInput = document.getElementById("setting-hide-bg");
        var fontFamilyInput = document.getElementById("setting-font-family");
        var weightInput = document.getElementById("setting-font-weight");
        var letterInput = document.getElementById("setting-letter-spacing");
        var sizeInput = document.getElementById("setting-font-size");
        var bgInput = document.getElementById("setting-bg-opacity");
        var bgBlurInput = document.getElementById("setting-bg-blur");
        var resetBtn = document.getElementById("setting-reset-btn");

        // 初始化表单值
        if (showTopInput) showTopInput.checked = !!currentSettings.showToTop;
        if (hideBgInput) hideBgInput.checked = !!currentSettings.hideBackground;
        if (fontFamilyInput) fontFamilyInput.value = currentSettings.fontFamily || defaultSettings.fontFamily;
        if (weightInput) weightInput.value = getLevelFromWeight(currentSettings.fontWeight);
        if (letterInput) letterInput.value = currentSettings.letterSpacing;
        if (sizeInput) sizeInput.value = currentSettings.fontSize;
        if (bgInput) bgInput.value = ((typeof currentSettings.bgOpacity === "number"
            ? currentSettings.bgOpacity
            : defaultSettings.bgOpacity) / 2);
        if (bgBlurInput) bgBlurInput.value = body.classList.contains("post-page")
            ? (typeof currentSettings.bgBlur === "number" ? currentSettings.bgBlur : defaultSettings.bgBlur)
            : 0;

        // 打开 / 关闭面板
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            panel.classList.toggle("open");
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

        if (hideBgInput) {
            hideBgInput.addEventListener("change", function () {
                currentSettings.hideBackground = !!this.checked;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (fontFamilyInput) {
            fontFamilyInput.addEventListener("change", function () {
                currentSettings.fontFamily = this.value;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (weightInput) {
            weightInput.addEventListener("input", function () {
                var lvl = parseInt(this.value, 10) || 3;
                currentSettings.fontWeight = getWeightFromLevel(lvl);
                persistSettings();
                applyReadingSettings();
            });
        }

        if (letterInput) {
            letterInput.addEventListener("input", function () {
                currentSettings.letterSpacing = parseInt(this.value, 10) || 0;
                persistSettings();
                applyReadingSettings();
            });
        }

        if (sizeInput) {
            sizeInput.addEventListener("input", function () {
                currentSettings.fontSize = parseInt(this.value, 10) || defaultSettings.fontSize;
                persistSettings();
                applyReadingSettings();
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
            });
        }

        if (bgBlurInput) {
            bgBlurInput.addEventListener("input", function () {
                var v = parseInt(this.value, 10);
                if (isNaN(v) || v < 0) v = 0;
                if (v > 20) v = 20;
                currentSettings.bgBlur = v;
                persistSettings();
                // 直接设置 CSS 变量，绕过 applyReadingSettings 的页面类型过滤
                // 实现"除非用户手动调整"的实时预览（任何页面均生效）
                body.style.setProperty("--bg-blur", v + "px");
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener("click", function () {
                currentSettings.showToTop = defaultSettings.showToTop;
                currentSettings.hideBackground = defaultSettings.hideBackground;
                currentSettings.fontFamily = defaultSettings.fontFamily;
                currentSettings.fontWeight = defaultSettings.fontWeight;
                currentSettings.letterSpacing = defaultSettings.letterSpacing;
                currentSettings.fontSize = defaultSettings.fontSize;
                currentSettings.bgOpacity = defaultSettings.bgOpacity;
                currentSettings.bgBlur = defaultSettings.bgBlur;

                persistSettings();
                applyReadingSettings();

                if (showTopInput) showTopInput.checked = !!currentSettings.showToTop;
                if (hideBgInput) hideBgInput.checked = !!currentSettings.hideBackground;
                if (fontFamilyInput) fontFamilyInput.value = currentSettings.fontFamily;
                if (weightInput) weightInput.value = getLevelFromWeight(currentSettings.fontWeight);
                if (letterInput) letterInput.value = currentSettings.letterSpacing;
                if (sizeInput) sizeInput.value = currentSettings.fontSize;
                if (bgInput) bgInput.value = currentSettings.bgOpacity / 2;
                if (bgBlurInput) bgBlurInput.value = body.classList.contains("post-page") ? currentSettings.bgBlur : 0;
            });
        }
    }

    // 菜单按钮
    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];
        var toggleBtn = ks.select(".toggle-btn");

        toggleBtn.onclick = function (e) {
            e.stopPropagation();
            menu.classList.toggle("active");
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

    // 关灯切换 (使用 sessionStorage 记忆单次会话)
    this.night = function () {
        if(body.classList.contains("dark-theme")){
            body.classList.remove("dark-theme");
            // 记录当前标签页的状态为：开灯
            sessionStorage.setItem("theme", "light");
        }
        else{
            body.classList.add("dark-theme");
            // 记录当前标签页的状态为：关灯
            sessionStorage.setItem("theme", "dark");
        }
    };

    // 目录树
    this.tree = function () {
        const wrap = ks.select(".wrap");
        const headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");

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

        const trees = ks.create("section", {
            class: "article-list",
            html: `<h4><span class="title">目录</span><button id="close-toc-btn" type="button" title="收起目录" aria-label="收起目录"></button></h4>`
        });

        ks.each(headings, (t, index) => {
            const text = t.innerText;

            t.id = "title-" + index;

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            trees.appendChild(ks.create("a", { class: className, text, href: `#title-${index}` }));
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

                // 让当前激活项尽量出现在 TOC 视口里（仅滚动 TOC 容器内部）
                var activeLink = tocLinks[activeIdx];
                if (activeLink && trees.scrollHeight > trees.clientHeight) {
                    var linkRect = activeLink.getBoundingClientRect();
                    var listRect = trees.getBoundingClientRect();
                    if (linkRect.top < listRect.top + 16 || linkRect.bottom > listRect.bottom - 16) {
                        trees.scrollTop += linkRect.top - listRect.top - listRect.height / 2;
                    }
                }
            }

            syncActiveGroup(activeIdx);
        }

        // ★修改点 2：给右上角的“收起”按钮绑定事件
        const closeBtn = document.getElementById("close-toc-btn");
        if(closeBtn) {
            closeBtn.addEventListener("click", () => {
                body.classList.add("toc-collapsed"); // 给 body 挂上“收起状态”
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
                t.target = "_blank";
            });
        }
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

    // 文章阅读进度条（仅文章页）
    this.reading_progress = function () {
        if (!body.classList.contains("post-page")) return;

        var article = document.querySelector(".post-content");
        if (!article) return;

        var bar = document.createElement("div");
        bar.className = "reading-progress";
        body.appendChild(bar);

        var ticking = false;
        var doc = document.documentElement;

        function update() {
            var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
            var articleTop = article.getBoundingClientRect().top + scrollTop;
            var articleBottom = articleTop + article.offsetHeight;
            var ratio = (scrollTop - articleTop) / Math.max(1, articleBottom - articleTop);

            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;

            bar.style.transform = "scaleX(" + ratio + ")";
            ticking = false;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(update);
        }

        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate);
        window.addEventListener("load", requestUpdate);
        requestUpdate();
    };

    this.header();

    if(content){
        this.tree();
        this.links();
        this.comment_list();
    }

    this.reading_progress();

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

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Hingle %c https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}}
