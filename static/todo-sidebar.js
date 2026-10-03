// 首页「TO DO」侧边栏：展开/收起 + Bangumi 实时刷新（失败时保留构建时数据）
(function () {
    var sidebar = document.getElementById("todo-sidebar");
    var drawer = sidebar && sidebar.parentNode;
    var toggle = drawer && drawer.querySelector(".todo-toggle");
    if (!toggle) return;

    var closeBtn = sidebar.querySelector(".todo-close");
    var bgmList = sidebar.querySelector(".todo-bgm");
    var bgmUser = sidebar.getAttribute("data-bgm-user");
    var STATE_KEY = "todo_sidebar_open";
    var BGM_TYPES = [2, 4]; // 2 动画 / 4 游戏
    var BGM_LABEL = { 2: "在看", 4: "在玩" };
    var bgmLoaded = false;
    var animating = false;
    var pendingRender = null;
    var animTimer = null;

    function setOpen(open) {
        if (open === drawer.classList.contains("active")) return;
        drawer.classList.toggle("active", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        try { sessionStorage.setItem(STATE_KEY, open ? "1" : "0"); } catch (e) {}
        animating = true;
        clearTimeout(animTimer);
        animTimer = setTimeout(finishAnimation, 700); // 兜底：无过渡（减少动态效果）时不会触发 transitionend
        loadBangumi();
    }

    function finishAnimation() {
        clearTimeout(animTimer);
        animating = false;
        if (pendingRender) {
            var items = pendingRender;
            pendingRender = null;
            renderBangumi(items);
        }
    }

    // 开合动画期间不替换列表，避免重排导致掉帧
    drawer.addEventListener("transitionend", function (e) {
        if (e.target !== drawer || e.propertyName !== "transform") return;
        finishAnimation();
    });

    // 标签可上下拖动：位置存为视口高度比例，限制在页眉以下、视口以内
    var POS_KEY = "todo_toggle_pos";
    var DRAG_THRESHOLD = 5; // 移动超过这个距离才算拖动，否则视为点击
    var togglePos = 1 / 3;
    var drag = null;
    var suppressClick = false;

    try {
        var savedPos = parseFloat(localStorage.getItem(POS_KEY));
        if (savedPos >= 0 && savedPos <= 1) togglePos = savedPos;
    } catch (e) {}

    function placeToggle() {
        var vh = window.innerHeight;
        var half = toggle.offsetHeight / 2;
        var header = document.querySelector("header");
        var min = (header ? header.getBoundingClientRect().bottom : 0) + half + 8;
        var max = vh - half - 8;
        var y = Math.min(Math.max(togglePos * vh, min), Math.max(min, max));
        toggle.style.top = y + "px";
    }

    toggle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        drag = { id: e.pointerId, startY: e.clientY, startPos: togglePos, moved: false };
    });

    toggle.addEventListener("pointermove", function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dy = e.clientY - drag.startY;
        if (!drag.moved) {
            if (Math.abs(dy) < DRAG_THRESHOLD) return;
            drag.moved = true;
            toggle.setPointerCapture(e.pointerId);
            toggle.classList.add("dragging");
        }
        togglePos = drag.startPos + dy / window.innerHeight;
        placeToggle();
        // 夹紧后回写实际位置，避免拖出边界后再拖回时“空走”
        togglePos = parseFloat(toggle.style.top) / window.innerHeight;
    });

    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.moved) {
            suppressClick = true;
            setTimeout(function () { suppressClick = false; }, 0); // 松手处不在标签上时不会触发 click，别吞掉下一次点击
            toggle.classList.remove("dragging");
            try { localStorage.setItem(POS_KEY, String(togglePos)); } catch (err) {}
        }
        drag = null;
    }
    toggle.addEventListener("pointerup", endDrag);
    toggle.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", placeToggle);
    placeToggle();

    toggle.addEventListener("click", function () {
        if (suppressClick) { suppressClick = false; return; }
        setOpen(!drawer.classList.contains("active"));
    });
    closeBtn.addEventListener("click", function () { setOpen(false); });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && drawer.classList.contains("active")) setOpen(false);
    });

    document.addEventListener("click", function (e) {
        if (!drawer.classList.contains("active")) return;
        if (drawer.contains(e.target)) return;
        setOpen(false);
    });

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function renderItem(c) {
        var subject = c.subject || {};
        var images = subject.images || {};
        var li = el("li");
        var a = el("a");
        a.href = "https://bgm.tv/subject/" + c.subject_id;
        a.target = "_blank";
        a.rel = "noopener";

        var img = el("img");
        img.src = images.small || images.grid || "";
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";

        var text = el("span", "todo-text");
        text.appendChild(el("span", "todo-title", subject.name_cn || subject.name || ""));
        if (c.subject_type === 2) {
            text.appendChild(el("span", "todo-meta", (c.ep_status || 0) + " / " + (subject.eps || "?")));
        }

        a.appendChild(img);
        a.appendChild(text);
        li.appendChild(a);
        return li;
    }

    // 按类型分组：「在看」在上、「在玩」在下，空组不显示
    function renderBangumi(items) {
        var frag = document.createDocumentFragment();
        BGM_TYPES.forEach(function (type) {
            var group = items.filter(function (c) { return c.subject_type === type; });
            if (!group.length) return;
            frag.appendChild(el("p", "todo-sub", BGM_LABEL[type]));
            var ul = el("ul", "todo-list");
            group.forEach(function (c) { ul.appendChild(renderItem(c)); });
            frag.appendChild(ul);
        });
        if (!frag.childNodes.length) frag.appendChild(el("p", "todo-empty", "暂无数据"));
        bgmList.innerHTML = "";
        bgmList.appendChild(frag);
    }

    function loadBangumi() {
        if (bgmLoaded || !bgmUser || !window.fetch) return;
        bgmLoaded = true;
        var base = "https://api.bgm.tv/v0/users/" + encodeURIComponent(bgmUser) + "/collections?type=3&limit=30&subject_type=";
        Promise.all(BGM_TYPES.map(function (t) {
            return fetch(base + t).then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            }).then(function (json) { return json.data || []; });
        })).then(function (lists) {
            var all = [].concat.apply([], lists);
            all.sort(function (a, b) { return Date.parse(b.updated_at) - Date.parse(a.updated_at); });
            if (animating) pendingRender = all;
            else renderBangumi(all);
        }).catch(function () {
            // 保留构建时渲染的数据
        });
    }

    var savedOpen = false;
    try { savedOpen = sessionStorage.getItem(STATE_KEY) === "1"; } catch (e) {}
    if (savedOpen) setOpen(true);

    // 空闲时预取 Bangumi，展开时已是最新数据
    if ("requestIdleCallback" in window) {
        requestIdleCallback(loadBangumi, { timeout: 3000 });
    } else {
        setTimeout(loadBangumi, 1500);
    }
})();
