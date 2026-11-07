/* Twikoo 评论（Glint）：容器与配置在 layout/_partial/comments.ejs 的 #tcomment data-* 上
   兼容层：历史评论分散在旧路径 /<abbrlink>/、新路径及其各种写法下，这里拦截 Twikoo 的取评论请求、按各写法分别取回再合并 */
(function () {
    var container = document.getElementById('tcomment');
    if (!container) return;

    var bloggerNick = container.dataset.bloggerNick || 'Whatasiger';
    var bloggerLabel = container.dataset.bloggerLabel || '博主';
    var bloggerAvatar = container.dataset.bloggerAvatar || '';
    var envId = container.dataset.envId || '';
    var lang = container.dataset.lang || 'zh-CN';
    var twikooPath = container.dataset.twikooPath || '';
    var twikooJsUrl = container.dataset.twikooJs || 'https://cdn.jsdelivr.net/npm/twikoo@1.7.7/dist/twikoo.min.js';
    var configuredSiteUrl = container.dataset.siteUrl || '';
    var generatedCurrentPath = container.dataset.currentPath || '';
    var observer = null;
    var twikooPatchedFetch = false;
    var twikooPatchedXhr = false;
    var twikooScriptLoading = false;

    function __isTwikooEndpoint(url) {
        if (!url || !envId) return false;
        return String(url).indexOf(envId) === 0;
    }

    function __normalizeHref(pathValue) {
        if (!pathValue) return window.location.href;
        if (/^https?:\/\//i.test(pathValue)) return pathValue;
        return window.location.origin + pathValue;
    }

    function __normalizeOrigin(originValue) {
        return (originValue || '').replace(/\/+$/, '');
    }

    function __normalizePath(pathValue) {
        var p = (pathValue || '').trim();
        if (!p) return '/';
        if (/^https?:\/\//i.test(p)) {
            try {
                p = new URL(p).pathname;
            } catch (e) {}
        }
        p = p.replace(/index\.html$/i, '');
        if (p.charAt(0) !== '/') p = '/' + p;
        if (p.charAt(p.length - 1) !== '/') p = p + '/';
        return p;
    }

    function __trimTrailingSlash(pathValue) {
        if (!pathValue || pathValue === '/') return pathValue;
        return pathValue.replace(/\/+$/, '');
    }

    function __withIndexHtml(pathValue) {
        var p = __normalizePath(pathValue);
        return p === '/' ? '/index.html' : p + 'index.html';
    }

    function __pushUnique(list, value) {
        if (!value) return;
        if (list.indexOf(value) === -1) list.push(value);
    }

    function __pushPathVariants(list, pathValue) {
        var normalized = __normalizePath(pathValue);
        __pushUnique(list, normalized);
        __pushUnique(list, __trimTrailingSlash(normalized));
        __pushUnique(list, __withIndexHtml(normalized));
    }

    function __pushFullUrlVariants(list, pathValue) {
        var origins = [
            __normalizeOrigin(window.location.origin),
            __normalizeOrigin(configuredSiteUrl)
        ];
        for (var i = 0; i < origins.length; i++) {
            if (!origins[i]) continue;
            var normalized = __normalizePath(pathValue);
            __pushUnique(list, origins[i] + normalized);
            __pushUnique(list, origins[i] + __trimTrailingSlash(normalized));
            __pushUnique(list, origins[i] + __withIndexHtml(normalized));
        }
    }

    function __getTwikooUrlCandidates(legacyPath, currentPath) {
        var candidates = [];
        __pushPathVariants(candidates, legacyPath);
        __pushPathVariants(candidates, currentPath);
        __pushPathVariants(candidates, generatedCurrentPath);
        __pushFullUrlVariants(candidates, legacyPath);
        __pushFullUrlVariants(candidates, currentPath);
        __pushFullUrlVariants(candidates, generatedCurrentPath);
        return candidates;
    }

    function __commentKey(comment) {
        if (!comment) return '';
        return comment.id || comment._id || comment.objectId || [
            comment.nick,
            comment.mailMd5 || comment.mail || '',
            comment.created || '',
            comment.comment || ''
        ].join('|');
    }

    function __mergeCommentsResponse(responses, sort) {
        var map = {};
        var merged = [];
        var totalCount = 0;
        var hasCount = false;
        var more = false;
        var base = {};
        var accessToken = '';
        var i;
        var j;

        for (i = 0; i < responses.length; i++) {
            var response = responses[i] || {};
            var data = response.data || [];
            if (!base.data) base = Object.assign({}, response);
            if (typeof response.count === 'number') {
                totalCount += response.count;
                hasCount = true;
            }
            more = more || Boolean(response.more);
            accessToken = accessToken || response.accessToken || '';

            for (j = 0; j < data.length; j++) {
                var key = __commentKey(data[j]);
                if (key && !map[key]) {
                    map[key] = true;
                    merged.push(data[j]);
                }
            }
        }

        merged.sort(function (a, b) {
            var ca = a && a.created ? a.created : 0;
            var cb = b && b.created ? b.created : 0;
            if (sort === 'oldest') return ca - cb;
            return cb - ca;
        });

        base.data = merged;
        base.more = more;
        base.count = hasCount ? Math.max(totalCount, merged.length) : merged.length;
        base.accessToken = accessToken;
        return base;
    }

    // 某些版本/场景下 Twikoo 提交评论可能未复用 init.path，
    // 这里做两件事：
    // 1) COMMENT_SUBMIT 强制写入旧路径，避免后续再分流；
    // 2) COMMENT_GET 同时读取旧链接、新链接和 index.html/完整 URL 变体，并在前端合并。
    function __patchTwikooRequestPath() {
        if (!twikooPath) return;
        var legacyPath = __normalizePath(twikooPath);
        var currentPath = __normalizePath(window.location.pathname || generatedCurrentPath);
        var twikooUrlCandidates = __getTwikooUrlCandidates(legacyPath, currentPath);

        function __payloadWithUrl(payload, urlValue) {
            return Object.assign({}, payload, { url: urlValue });
        }

        function __fetchCommentList(originalFetch, reqUrl, init, payload, urlValue) {
            var nextPayload = Object.assign({}, payload, { url: urlValue });
            var nextInit = Object.assign({}, init, { body: JSON.stringify(nextPayload) });
            return originalFetch(reqUrl, nextInit).then(function (response) {
                return response.clone().json().catch(function () {
                    return null;
                });
            }).catch(function () {
                return null;
            });
        }

        if (window.fetch && !twikooPatchedFetch) {
            var originalFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                try {
                    var reqUrl = typeof input === 'string' ? input : (input && input.url);
                    if (__isTwikooEndpoint(reqUrl) && init && typeof init.body === 'string' && init.body) {
                        var payload = JSON.parse(init.body);
                        if (payload && payload.event === 'COMMENT_GET' && twikooUrlCandidates.length > 1) {
                            return Promise.all(twikooUrlCandidates.map(function (urlValue) {
                                return __fetchCommentList(originalFetch, reqUrl, init, payload, urlValue);
                            })).then(function (jsonList) {
                                var validResponses = jsonList.filter(Boolean);
                                if (!validResponses.length) return originalFetch(input, init);
                                var merged = __mergeCommentsResponse(validResponses, payload.sort);
                                return new Response(JSON.stringify(merged), {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                });
                            });
                        }
                        if (payload && payload.event === 'COMMENT_SUBMIT') {
                            payload.url = legacyPath;
                            payload.href = __normalizeHref(legacyPath);
                            init.body = JSON.stringify(payload);
                        }
                    }
                } catch (e) {}
                return originalFetch(input, init);
            };
            twikooPatchedFetch = true;
        }

        if (window.XMLHttpRequest && !twikooPatchedXhr) {
            var NativeXMLHttpRequest = window.XMLHttpRequest;

            function __xhrCommentList(reqUrl, headers, payload, urlValue) {
                return new Promise(function (resolve) {
                    var xhr = new NativeXMLHttpRequest();
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState !== 4) return;
                        if (xhr.status === 200) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    };
                    xhr.onerror = function () {
                        resolve(null);
                    };
                    xhr.open('POST', reqUrl, true);
                    for (var name in headers) {
                        if (Object.prototype.hasOwnProperty.call(headers, name)) {
                            xhr.setRequestHeader(name, headers[name]);
                        }
                    }
                    xhr.send(JSON.stringify(__payloadWithUrl(payload, urlValue)));
                });
            }

            function PatchedXMLHttpRequest() {
                this._xhr = new NativeXMLHttpRequest();
                this._headers = {};
                this._listeners = {};
                this._intercepted = false;
                this._method = '';
                this._url = '';
                this._openArgs = null;
                this._readyState = 0;
                this._status = 0;
                this._statusText = '';
                this._responseText = '';
                this._response = '';
                this.onreadystatechange = null;
                this.onload = null;
                this.onloadend = null;
                this.onerror = null;
                this.onabort = null;
                this.ontimeout = null;
            }

            function __defineXhrGetter(name, fallbackValue) {
                Object.defineProperty(PatchedXMLHttpRequest.prototype, name, {
                    configurable: true,
                    enumerable: true,
                    get: function () {
                        if (this._intercepted) {
                            var ownName = '_' + name;
                            return this[ownName] === undefined ? fallbackValue : this[ownName];
                        }
                        return this._xhr[name];
                    }
                });
            }

            function __fireXhrEvent(xhr, type) {
                var event = { type: type, target: xhr, currentTarget: xhr };
                var handler = xhr['on' + type];
                if (typeof handler === 'function') {
                    try {
                        handler.call(xhr, event);
                    } catch (e) {}
                }
                var listeners = xhr._listeners[type] || [];
                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i].call(xhr, event);
                    } catch (e) {}
                }
            }

            function __completeInterceptedXhr(xhr, status, responseText) {
                xhr._intercepted = true;
                xhr._readyState = 4;
                xhr._status = status;
                xhr._statusText = status === 200 ? 'OK' : '';
                xhr._responseText = responseText;
                xhr._response = responseText;
                __fireXhrEvent(xhr, 'readystatechange');
                if (status === 200) {
                    __fireXhrEvent(xhr, 'load');
                } else {
                    __fireXhrEvent(xhr, 'error');
                }
                __fireXhrEvent(xhr, 'loadend');
            }

            __defineXhrGetter('readyState', 0);
            __defineXhrGetter('status', 0);
            __defineXhrGetter('statusText', '');
            __defineXhrGetter('responseText', '');
            __defineXhrGetter('response', '');
            __defineXhrGetter('responseURL', '');

            PatchedXMLHttpRequest.UNSENT = NativeXMLHttpRequest.UNSENT || 0;
            PatchedXMLHttpRequest.OPENED = NativeXMLHttpRequest.OPENED || 1;
            PatchedXMLHttpRequest.HEADERS_RECEIVED = NativeXMLHttpRequest.HEADERS_RECEIVED || 2;
            PatchedXMLHttpRequest.LOADING = NativeXMLHttpRequest.LOADING || 3;
            PatchedXMLHttpRequest.DONE = NativeXMLHttpRequest.DONE || 4;
            PatchedXMLHttpRequest.prototype.UNSENT = PatchedXMLHttpRequest.UNSENT;
            PatchedXMLHttpRequest.prototype.OPENED = PatchedXMLHttpRequest.OPENED;
            PatchedXMLHttpRequest.prototype.HEADERS_RECEIVED = PatchedXMLHttpRequest.HEADERS_RECEIVED;
            PatchedXMLHttpRequest.prototype.LOADING = PatchedXMLHttpRequest.LOADING;
            PatchedXMLHttpRequest.prototype.DONE = PatchedXMLHttpRequest.DONE;

            PatchedXMLHttpRequest.prototype.open = function () {
                this._method = arguments[0];
                this._url = arguments[1];
                this._openArgs = arguments;
                this._readyState = 1;
                __fireXhrEvent(this, 'readystatechange');
            };

            PatchedXMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                this._headers[name] = value;
            };

            PatchedXMLHttpRequest.prototype.addEventListener = function (type, listener) {
                if (!this._listeners[type]) this._listeners[type] = [];
                this._listeners[type].push(listener);
            };

            PatchedXMLHttpRequest.prototype.removeEventListener = function (type, listener) {
                var listeners = this._listeners[type] || [];
                var index = listeners.indexOf(listener);
                if (index !== -1) listeners.splice(index, 1);
            };

            PatchedXMLHttpRequest.prototype.dispatchEvent = function (event) {
                __fireXhrEvent(this, event && event.type);
                return true;
            };

            PatchedXMLHttpRequest.prototype.getResponseHeader = function (name) {
                if (this._intercepted) {
                    return name && name.toLowerCase() === 'content-type' ? 'application/json' : null;
                }
                return this._xhr.getResponseHeader(name);
            };

            PatchedXMLHttpRequest.prototype.getAllResponseHeaders = function () {
                if (this._intercepted) return 'content-type: application/json\r\n';
                return this._xhr.getAllResponseHeaders();
            };

            PatchedXMLHttpRequest.prototype.abort = function () {
                if (this._intercepted) {
                    __fireXhrEvent(this, 'abort');
                    __fireXhrEvent(this, 'loadend');
                    return;
                }
                return this._xhr.abort();
            };

            PatchedXMLHttpRequest.prototype.overrideMimeType = function (mimeType) {
                if (this._xhr.overrideMimeType) this._xhr.overrideMimeType(mimeType);
            };

            PatchedXMLHttpRequest.prototype.send = function (body) {
                var self = this;
                var reqUrl = this._url;
                var payload = null;

                try {
                    if (__isTwikooEndpoint(reqUrl) && typeof body === 'string' && body) {
                        payload = JSON.parse(body);
                    }
                } catch (e) {}

                if (payload && payload.event === 'COMMENT_GET' && twikooUrlCandidates.length > 1) {
                    Promise.all(twikooUrlCandidates.map(function (urlValue) {
                        return __xhrCommentList(reqUrl, self._headers, payload, urlValue);
                    })).then(function (jsonList) {
                        var validResponses = jsonList.filter(Boolean);
                        var merged = validResponses.length
                            ? __mergeCommentsResponse(validResponses, payload.sort)
                            : { data: [], more: false, count: 0 };
                        __completeInterceptedXhr(self, 200, JSON.stringify(merged));
                    });
                    return;
                }

                if (payload && payload.event === 'COMMENT_SUBMIT') {
                    payload.url = legacyPath;
                    payload.href = __normalizeHref(legacyPath);
                    body = JSON.stringify(payload);
                }

                this._xhr.onreadystatechange = function () {
                    __fireXhrEvent(self, 'readystatechange');
                };
                this._xhr.onload = function () {
                    __fireXhrEvent(self, 'load');
                };
                this._xhr.onloadend = function () {
                    __fireXhrEvent(self, 'loadend');
                };
                this._xhr.onerror = function () {
                    __fireXhrEvent(self, 'error');
                };
                this._xhr.onabort = function () {
                    __fireXhrEvent(self, 'abort');
                };
                this._xhr.ontimeout = function () {
                    __fireXhrEvent(self, 'timeout');
                };
                this._xhr.open.apply(this._xhr, this._openArgs);
                for (var name in this._headers) {
                    if (Object.prototype.hasOwnProperty.call(this._headers, name)) {
                        this._xhr.setRequestHeader(name, this._headers[name]);
                    }
                }
                this._xhr.send(body);
            };

            window.XMLHttpRequest = PatchedXMLHttpRequest;
            twikooPatchedXhr = true;
        }
    }

    // 判断某个后代节点是否属于 commentEl 自身（不跨越嵌套的 .tk-comment）
    function __isOwnDescendant(commentEl, el) {
        if (!el || !commentEl) return false;
        var cur = el.parentNode;
        while (cur && cur !== commentEl) {
            if (cur.nodeType === 1 && cur.classList && cur.classList.contains('tk-comment')) {
                return false;
            }
            cur = cur.parentNode;
        }
        return cur === commentEl;
    }

    // 仅在 commentEl 自身范围内查找（排除嵌套子评论）
    function __ownQueryFirst(commentEl, selector) {
        var all = commentEl.querySelectorAll(selector);
        for (var i = 0; i < all.length; i++) {
            if (__isOwnDescendant(commentEl, all[i])) return all[i];
        }
        return null;
    }

    function __ownQueryAll(commentEl, selector) {
        var all = commentEl.querySelectorAll(selector);
        var own = [];
        for (var i = 0; i < all.length; i++) {
            if (__isOwnDescendant(commentEl, all[i])) own.push(all[i]);
        }
        return own;
    }

    function __ownText(commentEl, selector) {
        var el = __ownQueryFirst(commentEl, selector);
        return el ? (el.textContent || '').trim() : '';
    }

    function __isBloggerComment(commentEl) {
        if (!commentEl) return false;
        // tk-admin 类只看自身，不受子回复影响，作为最可信证据
        if (commentEl.classList.contains('tk-admin')) return true;

        var nickText = __ownText(commentEl, '.tk-nick') || __ownText(commentEl, '.tk-nick-link');
        if (nickText && nickText === bloggerNick) return true;

        var tagNodes = __ownQueryAll(commentEl, '.tk-tag, .tk-extra, .tk-meta span, .tk-nick + span');
        for (var i = 0; i < tagNodes.length; i++) {
            var text = (tagNodes[i].textContent || '').trim();
            if (text === bloggerLabel) return true;
        }
        return false;
    }

    function __replaceAvatar(commentEl) {
        if (!bloggerAvatar || !__isBloggerComment(commentEl)) return;

        // 头像也必须取自身的，避免拿到嵌套子评论的头像
        var avatarImg = __ownQueryFirst(commentEl, '.tk-avatar img, .tk-avatar-img');
        if (!avatarImg) return;

        if (avatarImg.getAttribute('src') !== bloggerAvatar) {
            avatarImg.setAttribute('src', bloggerAvatar);
        }
        avatarImg.removeAttribute('srcset');
        avatarImg.setAttribute('data-force-blogger-avatar', 'true');
    }

    function __applyBloggerAvatar(root) {
        if (!bloggerAvatar) return;
        var scope = root || document;
        var comments = scope.querySelectorAll('.tk-comment');
        for (var i = 0; i < comments.length; i++) {
            __replaceAvatar(comments[i]);
        }
    }

    function __watchComments() {
        var target = document.querySelector('#twikoo, #tcomment, .twikoo');
        if (!target || observer) return;

        observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];
                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    var node = mutation.addedNodes[j];
                    if (!node || node.nodeType !== 1) continue;
                    if (node.matches && node.matches('.tk-comment')) {
                        __replaceAvatar(node);
                    } else if (node.querySelectorAll) {
                        __applyBloggerAvatar(node);
                    }
                }
            }
        });
        observer.observe(target, {
            childList: true,
            subtree: true
        });
    }

    function __initTwikoo() {
        if (!window.twikoo) return;
        __patchTwikooRequestPath();
        var opts = {
            envId: envId,
            el: '#tcomment',
            lang: lang,
            onCommentLoaded: function () {
                __applyBloggerAvatar();
                __watchComments();
            }
        };
        if (twikooPath) opts.path = twikooPath;
        twikoo.init(opts);
    }

    function __loadTwikoo() {
        __patchTwikooRequestPath();
        if (window.twikoo) {
            __initTwikoo();
            return;
        }
        if (twikooScriptLoading) return;
        twikooScriptLoading = true;

        var script = document.createElement('script');
        script.src = twikooJsUrl;
        script.async = true;
        script.onload = __initTwikoo;
        script.onerror = function () {
            twikooScriptLoading = false;
        };
        document.head.appendChild(script);
    }

    // 从首页卡片一镜到底进来时，等过渡结束再加载：脚本解析执行与加载动画都不与过渡抢主线程（vtSettled 见 _partial/post-vt.ejs）
    // 评论区快进入视口（约一屏内）才加载 Twikoo：读长文时不必一进页面就去请求评论后端；留言板这类评论在首屏附近的页面立即加载
    function __whenNear(fn) {
        // 带着页内找不到的锚点打开（如评论通知里指向某条评论的链接）时立即加载，否则 Twikoo 来不及定位
    var hash = '';
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    if (!window.IntersectionObserver || (hash && !document.getElementById(hash))) { fn(); return; }
        var io = new IntersectionObserver(function (entries) {
            if (!entries.some(function (en) { return en.isIntersecting; })) return;
            io.disconnect();
            fn();
        }, { rootMargin: '100% 0px' });
        io.observe(container);
    }
    function __start() {
        if (window.vtSettled) window.vtSettled.then(function () { __whenNear(__loadTwikoo); });
        else __whenNear(__loadTwikoo);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', __start);
    } else {
        __start();
    }
})();
