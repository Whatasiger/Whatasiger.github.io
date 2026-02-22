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

    // 菜单按钮
    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];

        ks.select(".toggle-btn").onclick = function () {
            menu.classList.toggle("active");
        };

        ks.select(".light-btn").onclick = this.night;

        // 增加安全检查：只有搜索按钮存在时才绑定点击事件
        var search = document.getElementsByClassName("search-btn")[0];
        var bar = document.getElementsByClassName("head-search")[0];

        if (search && bar) {
            search.addEventListener("click", function () {
                bar.classList.toggle("active");
            });
        }
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

        // 目录树节点（★修改点 1：增加了收起按钮的 HTML 结构）
        const trees = ks.create("section", {
            class: "article-list",
            html: `<h4><span class="title">目录</span><div id="close-toc-btn" title="收起目录"></div></h4>`
        });

        ks.each(headings, (t, index) => {
            const text = t.innerText;

            t.id = "title-" + index;

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            trees.appendChild(ks.create("a", { class: className, text, href: `#title-${index}` }));
        });

        wrap.appendChild(trees);

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

        btn.addEventListener("click", () => {
            // ★修改点 3：智能判断设备
            if (window.innerWidth >= 800) {
                // 如果是电脑端，点击悬浮按钮就解除收起状态，目录滑回来
                body.classList.remove("toc-collapsed");
            } else {
                // 如果是手机端，维持原版逻辑，从底部弹起
                trees.classList.toggle("active");
            }
        });
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
    this.to_top = function () {
        var btn = document.getElementsByClassName("to-top")[0];
        var scroll = document.documentElement.scrollTop || document.body.scrollTop;

        scroll >= window.innerHeight / 2 ? btn.classList.add("active") : btn.classList.remove("active");
    };

    this.header();

    if(content){
        this.tree();
        this.links();
        this.comment_list();
    }

    // 返回页首
    window.addEventListener("scroll", this.to_top);

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

    // 本地标题与标签关键字搜索
    this.local_search = function () {
        // 获取我们在 header.ejs 里写好的输入框和结果框
        var input = document.getElementById("local-search-input");
        var result = document.getElementById("local-search-result");

        // 安全检查：如果这两个元素不存在（比如在文章页面），就直接退出，防止代码报错
        if (!input || !result) return;

        // 发起网络请求，去获取 Hexo 生成的 search.xml 文件
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/search.xml", true);
        xhr.onload = function () {
            // 当文件成功加载时 (状态码 200 左右)
            if (xhr.status >= 200 && xhr.status < 400) {
                var xml = xhr.responseXML;

                // 将 XML 数据解析为我们好处理的 JavaScript 数组
                var datas = Array.from(xml.querySelectorAll("entry")).map(function (entry) {
                    // 【新增核心功能：提取标签】
                    // 找到该文章下所有的 tag 节点，把它们的名字提取出来，用空格拼成一句话
                    var tags = Array.from(entry.querySelectorAll("tags tag")).map(function(t) {
                        return t.textContent;
                    }).join(" ");

                    return {
                        title: entry.querySelector("title") ? entry.querySelector("title").textContent : "",
                        url: entry.querySelector("url") ? entry.querySelector("url").textContent : "",
                        tags: tags // 将拼好的标签内容也存入数据包
                    };
                });

                // 监听输入框，只要用户敲击键盘输入内容，就立刻执行下面的代码
                input.addEventListener("input", function () {
                    var keyword = this.value.trim().toLowerCase(); // 获取输入的字，并转为小写，防止大小写导致搜不到
                    result.innerHTML = ""; // 每次输入新内容，先清空上一次的搜索结果

                    // 如果用户把输入框删空了，就隐藏结果框，直接退出
                    if (keyword.length <= 0) {
                        result.style.display = "none";
                        return;
                    }

                    // 准备拼接 HTML 字符串，建立一个无序列表 <ul>
                    var str = '<ul class="search-result-list">';
                    var hasResult = false; // 用来记录到底有没有搜到东西

                    // 遍历所有的文章数据进行匹配
                    datas.forEach(function (data) {
                        var titleLower = data.title.toLowerCase();
                        var tagsLower = data.tags.toLowerCase();

                        // 判断逻辑：如果 标题 里包含了关键字，或者 标签 里包含了关键字
                        if (titleLower.indexOf(keyword) > -1 || tagsLower.indexOf(keyword) > -1) {

                            // 开始拼接每一行的代码
                            str += '<li class="search-result-item">';
                            // 这里的 <a> 标签是我们等下用 CSS 撑满整行的关键
                            str += '<a href="' + data.url + '" class="search-result-link">';
                            str += '<span class="search-result-title">' + data.title + '</span>';

                            // 锦上添花：如果是通过标签匹配到的，但在标题里没有这个字，我们就给个小提示
                            if (tagsLower.indexOf(keyword) > -1 && titleLower.indexOf(keyword) === -1) {
                                str += '<span class="search-result-tag-hint"> # 匹配到标签</span>';
                            }

                            str += '</a></li>';
                            hasResult = true; // 标记我们搜到东西了
                        }
                    });

                    // 如果搜到内容了，就把拼好的 HTML 塞进网页，并显示出来
                    if (hasResult) {
                        result.innerHTML = str + "</ul>";
                        result.style.display = "block";
                    } else {
                        // 如果没搜到，给一个友好的提示，不要一片空白
                        result.innerHTML = '<div class="search-no-result">呜... 没有找到与 "'+ keyword +'" 相关的文章</div>';
                        result.style.display = "block";
                    }
                });
            }
        };
        xhr.send(); // 发送请求
    };

// 在文件初始化末尾，执行这个搜索功能
    this.local_search();

// 图片缩放
ks.image(".post-content:not(.is-special) img, .page-content:not(.is-special) img");

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Hingle %c https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}}
