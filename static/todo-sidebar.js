// 首页「TO DO」侧边栏：展开/收起 + Bangumi 实时刷新（失败时保留构建时数据）
(function () {
    var sidebar = document.getElementById("todo-sidebar");
    var toggle = document.querySelector(".todo-toggle");
    if (!sidebar || !toggle) return;

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
        sidebar.classList.toggle("active", open);
        toggle.classList.toggle("active", open);
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
    sidebar.addEventListener("transitionend", function (e) {
        if (e.target !== sidebar || e.propertyName !== "transform") return;
        finishAnimation();
    });

    toggle.addEventListener("click", function () {
        setOpen(!sidebar.classList.contains("active"));
    });
    closeBtn.addEventListener("click", function () { setOpen(false); });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && sidebar.classList.contains("active")) setOpen(false);
    });

    document.addEventListener("click", function (e) {
        if (!sidebar.classList.contains("active")) return;
        if (sidebar.contains(e.target) || toggle.contains(e.target)) return;
        setOpen(false);
    });

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function renderBangumi(items) {
        var frag = document.createDocumentFragment();
        items.forEach(function (c) {
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
            var meta = el("span", "todo-meta");
            meta.appendChild(el("span", "todo-badge", BGM_LABEL[c.subject_type] || "进行中"));
            if (c.subject_type === 2) {
                meta.appendChild(document.createTextNode((c.ep_status || 0) + " / " + (subject.eps || "?")));
            }
            text.appendChild(meta);

            a.appendChild(img);
            a.appendChild(text);
            li.appendChild(a);
            frag.appendChild(li);
        });
        if (!items.length) frag.appendChild(el("li", "todo-empty", "暂无数据"));
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
