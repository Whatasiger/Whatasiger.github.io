<?xml version="1.0" encoding="utf-8"?>
<!--
  订阅源的浏览器预览：atom.xml / rss2.xml（以及 CARRiER WAVE. 的 atom.xml）开头的 <?xml-stylesheet?> 指向这里（scripts/feed-stylesheet.js 插入）
  浏览器直接打开订阅源时显示成一张说明页 + 最近更新的列表；RSS 阅读器不理会样式表，照常读 XML
  同时认 Atom（feed / entry）与 RSS 2.0（rss / channel / item）
  配色取 Glint 的天青色阶与日夜底色；日夜照博客的设置（sessionStorage theme → whatasiger_reader_settings.themeMode，默认夜间）
-->
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:atom="http://www.w3.org/2005/Atom">
<xsl:output method="html" encoding="utf-8" indent="no" doctype-system="about:legacy-compat"/>

<xsl:variable name="isAtom" select="boolean(/atom:feed)"/>
<xsl:variable name="title">
    <xsl:choose>
        <xsl:when test="$isAtom"><xsl:value-of select="/atom:feed/atom:title"/></xsl:when>
        <xsl:otherwise><xsl:value-of select="/rss/channel/title"/></xsl:otherwise>
    </xsl:choose>
</xsl:variable>
<xsl:variable name="subtitle">
    <xsl:choose>
        <xsl:when test="$isAtom"><xsl:value-of select="/atom:feed/atom:subtitle"/></xsl:when>
        <xsl:otherwise><xsl:value-of select="/rss/channel/description"/></xsl:otherwise>
    </xsl:choose>
</xsl:variable>
<xsl:variable name="self">
    <xsl:choose>
        <xsl:when test="$isAtom"><xsl:value-of select="/atom:feed/atom:link[@rel='self']/@href"/></xsl:when>
        <xsl:otherwise><xsl:value-of select="/rss/channel/atom:link[@rel='self']/@href"/></xsl:otherwise>
    </xsl:choose>
</xsl:variable>
<xsl:variable name="home">
    <xsl:choose>
        <xsl:when test="$isAtom"><xsl:value-of select="/atom:feed/atom:link[not(@rel) or @rel='alternate']/@href"/></xsl:when>
        <xsl:otherwise><xsl:value-of select="/rss/channel/link"/></xsl:otherwise>
    </xsl:choose>
</xsl:variable>

<xsl:template match="/">
<html lang="zh-CN">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="robots" content="noindex"/>
    <title>订阅 · <xsl:value-of select="$title"/></title>
    <link rel="icon" href="/static/img/icon.png"/>
    <script>
        (function () {
            var t = 'dark';
            try {
                t = sessionStorage.getItem('theme');
                if (!t) {
                    var m = (JSON.parse(localStorage.getItem('whatasiger_reader_settings')) || {}).themeMode || 'dark';
                    t = m === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (m === 'light' ? 'light' : 'dark');
                }
            } catch (e) {}
            document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
        })();
    </script>
    <style>
        :root {
            --bg: #0e0e10;
            --bg-glow: rgba(111, 159, 199, .16);
            --card: rgba(255, 255, 255, .045);
            --card-line: rgba(255, 255, 255, .08);
            --text: #e4e4e0;
            --muted: rgba(228, 228, 224, .55);
            --accent: #a6cff5;
            --accent-soft: rgba(111, 159, 199, .18);
            --accent-ink: #0e0e10;
            --code: rgba(255, 255, 255, .06);
            color-scheme: dark;
        }
        :root[data-theme="light"] {
            --bg: #e9eff7;
            --bg-glow: rgba(111, 159, 199, .28);
            --card: rgba(255, 255, 255, .62);
            --card-line: rgba(84, 129, 174, .16);
            --text: #24303d;
            --muted: rgba(36, 48, 61, .58);
            --accent: #2d5383;
            --accent-soft: rgba(84, 129, 174, .14);
            --accent-ink: #fff;
            --code: rgba(84, 129, 174, .1);
            color-scheme: light;
        }
        * { box-sizing: border-box; }
        html { background: var(--bg); }
        body {
            margin: 0;
            min-height: 100vh;
            color: var(--text);
            background: radial-gradient(90% 60% at 15% -10%, var(--bg-glow), transparent 70%), var(--bg);
            font: 16px/1.75 "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .wrap { max-width: 46rem; margin: 0 auto; padding: 3.5rem 1rem 4rem; }
        .card {
            padding: 1.6rem 1.7rem;
            border: 1px solid var(--card-line);
            border-radius: 24px;
            background: var(--card);
            box-shadow: 0 18px 40px -18px rgba(0, 0, 0, .45);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
        }
        .head { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.2rem; }
        .head img { width: 56px; height: 56px; border-radius: 16px; flex: none; }
        .badge {
            display: inline-flex; align-items: center; gap: .4em;
            padding: .1em .7em; border-radius: 99px;
            font-size: .75rem; letter-spacing: .12em;
            color: var(--accent); background: var(--accent-soft);
        }
        .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        h1 { margin: .2rem 0 0; font-size: 1.6rem; line-height: 1.3; font-weight: 600; }
        .sub { margin: 0; color: var(--muted); font-size: .92rem; }
        .intro { margin: 0 0 1rem; }
        .url {
            display: flex; gap: .5rem; align-items: stretch;
            margin: 0 0 1rem;
        }
        .url code {
            flex: 1; min-width: 0;
            padding: .55rem .9rem;
            border-radius: 14px;
            background: var(--code);
            font: .9rem/1.6 ui-monospace, "Cascadia Code", Consolas, monospace;
            overflow-x: auto; white-space: nowrap;
        }
        button, .btn {
            flex: none;
            padding: .55rem 1.1rem;
            border: 0; border-radius: 14px;
            font: inherit; font-size: .9rem; font-weight: 500;
            color: var(--accent-ink); background: var(--accent);
            cursor: pointer;
            transition: transform .2s, opacity .2s;
        }
        button:hover { opacity: .9; }
        button:active { transform: scale(.97); }
        .steps { margin: 0 0 1rem; padding-left: 1.3rem; }
        .steps li { margin: .2rem 0; }
        .readers { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
        .readers a {
            display: inline-block; padding: .3rem .9rem; border-radius: 99px;
            font-size: .88rem; background: var(--accent-soft);
        }
        .readers a:hover { text-decoration: none; filter: brightness(1.12); }
        .note { margin: 1rem 0 0; color: var(--muted); font-size: .85rem; }
        h2 { margin: 2.6rem .4rem 1rem; font-size: 1rem; font-weight: 600; letter-spacing: .12em; color: var(--muted); }
        .list { display: grid; gap: .75rem; margin: 0; padding: 0; list-style: none; }
        .item { padding: 1.1rem 1.4rem; border-radius: 20px; }
        .item h3 { margin: 0 0 .25rem; font-size: 1.08rem; font-weight: 600; line-height: 1.45; }
        .item p { margin: 0; color: var(--muted); font-size: .9rem; }
        .meta { display: flex; flex-wrap: wrap; gap: .3rem .8rem; margin-top: .5rem; font-size: .8rem; color: var(--muted); }
        .meta span::before { content: "#"; opacity: .6; margin-right: .1em; }
        .foot { margin-top: 2.4rem; text-align: center; font-size: .85rem; color: var(--muted); }
        @media (max-width: 599px) {
            .wrap { padding-top: 1.5rem; }
            .card { padding: 1.3rem 1.2rem; border-radius: 20px; }
            .url { flex-direction: column; }
        }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <div class="head">
                <img src="/static/img/icon-192.png" alt=""/>
                <div>
                    <span class="badge">订阅源</span>
                    <h1><xsl:value-of select="$title"/></h1>
                    <xsl:if test="normalize-space($subtitle)"><p class="sub"><xsl:value-of select="$subtitle"/></p></xsl:if>
                </div>
            </div>
            <p class="intro">这是本站的订阅源（RSS / Atom）。把下面的地址加进 RSS 阅读器，有新文章时阅读器会自动收到，不必常回来看。</p>
            <div class="url">
                <code id="feed-url"><xsl:value-of select="$self"/></code>
                <button type="button" id="copy">复制地址</button>
            </div>
            <ol class="steps">
                <li>打开你常用的 RSS 阅读器，找到「添加订阅」或「+」。</li>
                <li>粘贴上面的地址，确认即可。</li>
            </ol>
            <ul class="readers">
                <li><a href="https://www.inoreader.com/?add_feed={$self}" target="_blank" rel="noopener">用 Inoreader 订阅</a></li>
                <li><a href="https://feedly.com/i/subscription/feed/{$self}" target="_blank" rel="noopener">用 Feedly 订阅</a></li>
            </ul>
            <p class="note">还没有阅读器？可以试试 Folo、Inoreader、Feedly，苹果设备上的 NetNewsWire、Reeder 也不错。</p>
        </section>

        <h2>最近更新</h2>
        <ul class="list">
            <xsl:apply-templates select="/atom:feed/atom:entry | /rss/channel/item"/>
        </ul>

        <p class="foot"><a href="{$home}">← 回到 <xsl:value-of select="$title"/></a></p>
    </main>
    <script>
        (function () {
            // 日期按读者本地时区显示（订阅源里是 UTC：北京时间零点发的文章写成前一天 16:00）
            [].forEach.call(document.querySelectorAll('time[data-d]'), function (t) {
                var d = new Date(t.getAttribute('data-d'));
                if (isNaN(d)) return;
                t.textContent = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
            });
            var btn = document.getElementById('copy');
            var url = document.getElementById('feed-url').textContent;
            btn.addEventListener('click', function () {
                function done() { btn.textContent = '已复制'; setTimeout(function () { btn.textContent = '复制地址'; }, 1600); }
                if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, select);
                else select();
            });
            function select() {
                var r = document.createRange();
                r.selectNodeContents(document.getElementById('feed-url'));
                var s = getSelection();
                s.removeAllRanges();
                s.addRange(r);
            }
        })();
    </script>
</body>
</html>
</xsl:template>

<xsl:template match="atom:entry">
    <li class="card item">
        <h3><a href="{atom:link[not(@rel) or @rel='alternate']/@href}"><xsl:value-of select="atom:title"/></a></h3>
        <xsl:if test="normalize-space(atom:summary)"><p><xsl:value-of select="atom:summary"/></p></xsl:if>
        <div class="meta">
            <xsl:variable name="d"><xsl:choose><xsl:when test="atom:published"><xsl:value-of select="atom:published"/></xsl:when><xsl:otherwise><xsl:value-of select="atom:updated"/></xsl:otherwise></xsl:choose></xsl:variable>
            <time data-d="{$d}"><xsl:value-of select="substring($d, 1, 10)"/></time>
            <xsl:for-each select="atom:category"><span><xsl:value-of select="@term"/></span></xsl:for-each>
        </div>
    </li>
</xsl:template>

<xsl:template match="item">
    <li class="card item">
        <h3><a href="{link}"><xsl:value-of select="title"/></a></h3>
        <xsl:if test="normalize-space(description)"><p><xsl:value-of select="description"/></p></xsl:if>
        <div class="meta">
            <time data-d="{pubDate}"><xsl:value-of select="substring(pubDate, 6, 11)"/></time>
            <xsl:for-each select="category"><span><xsl:value-of select="."/></span></xsl:for-each>
        </div>
    </li>
</xsl:template>

</xsl:stylesheet>
