/* InternalBeyond Mobile — ib-sw.js（导航"快速回退" + 超时护栏；离线兜底）
   与手机端 HTML 放在同一目录，经 HTTPS 访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 服务商 / 中转站的请求原样放行、绝不缓存。

   v247-p 变更（针对"下载慢 → 等半天白屏"）：
   导航请求不再死等网络：若 3.5 秒内网络还没把页面送达，就先把缓存里那一份交给浏览器
   （页面立刻能起来），同时让网络请求继续跑，完整到达后写入缓存供下次使用。
   首次访问（本地无缓存）仍走网络，最长 12 秒，失败给可读的离线页。
   —— 起因：单文件 HTML 有 1.33MB(gzip)，实测从 GitHub Pages 拉取 7~14 秒，
      旧版"网络优先且无超时"会让冷启动长时间纯白（页面还没到，任何应用代码都跑不了）。

   v245-p 变更（此前的三个坑）：
   ① fetch 无超时 → 弱网下导航永久挂起；② 任何 r.ok 都写缓存 → 截断 HTML 也会入库，反复白屏；
   ③ 离线兜底直接抛错 → 浏览器默认错误页/白屏。 */
const IB_CACHE = 'ib-cache-v4';
const NET_TIMEOUT = 9000;
const NAV_NET_TIMEOUT = 12000;
const NAV_FAST_MS = 3500;

function timedFetch(req, ms) {
  var ctl = null;
  try { ctl = new AbortController(); } catch (e) { return fetch(req); }
  var t = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, ms || NET_TIMEOUT);
  return fetch(req, { signal: ctl.signal }).then(function (r) {
    clearTimeout(t);
    return r;
  }, function (e) {
    clearTimeout(t);
    throw e;
  });
}

function cacheIfComplete(req, res) {
  try {
    if (!res || res.status !== 200 || res.type === 'opaque') return Promise.resolve();
    if (req.method !== 'GET' || req.cache === 'no-store') return Promise.resolve();
    var cl = res.headers.get('content-length');
    var cp = res.clone();
    return cp.arrayBuffer().then(function (buf) {
      if (cl && parseInt(cl, 10) !== buf.byteLength) return; /* 截断响应绝不入库 */
      var h = new Headers(res.headers);
      h.set('x-ib-complete', '1');
      return caches.open(IB_CACHE).then(function (c) {
        return c.put(req, new Response(buf, { status: 200, statusText: 'OK', headers: h }));
      });
    }).catch(function () {});
  } catch (e) { return Promise.resolve(); }
}

function offlinePage() {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="margin:0;font:15px/1.7 system-ui,-apple-system,\'Noto Sans SC\',sans-serif;background:#eef2f8;color:#22344f;padding:34px 20px">'
    + '<h2 style="margin:0 0 10px">暂时加载不上</h2>'
    + '<p style="opacity:.78">网络没有响应，本地缓存也没命中。确认网络后点下面按钮重试。</p>'
    + '<button onclick="location.replace(location.href)" style="margin-top:14px;padding:11px 18px;border:0;border-radius:11px;background:#3d6a9e;color:#fff;font-size:15px">重试</button>'
    + '</body>';
  return new Response(html, {
    status: 503, statusText: 'offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function cachedPage(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (m) {
    if (m) return m;
    return caches.match('./index.html', { ignoreSearch: true }).then(function (m2) {
      if (m2) return m2;
      return caches.match('./', { ignoreSearch: true });
    });
  });
}

/* 导航：缓存里有一份就"网络快则用网络、网络慢则先用缓存"，两不耽误 */
function handleNavigate(req) {
  var netP = timedFetch(req, NAV_NET_TIMEOUT).then(function (r) {
    cacheIfComplete(req, r);
    return r;
  });
  return cachedPage(req).then(function (cached) {
    if (!cached) {
      return netP.catch(function () { return offlinePage(); });
    }
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(cached); /* 网络太慢：先让应用起来，网络请求继续跑、回来补缓存 */
      }, NAV_FAST_MS);
      netP.then(function (r) {
        if (done) return;
        done = true; clearTimeout(t);
        resolve(r);
      }, function () {
        if (done) return;
        done = true; clearTimeout(t);
        resolve(cached);
      });
    });
  });
}

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== IB_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;

  var isNav = (e.request.mode === 'navigate' || e.request.destination === 'document');

  if (isNav) {
    e.respondWith(handleNavigate(e.request));
    return;
  }

  e.respondWith(
    timedFetch(e.request, NET_TIMEOUT).then(function (r) {
      if (r.ok) cacheIfComplete(e.request, r);
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (m) {
        if (m) return m;
        throw new Error('offline');
      });
    })
  );
});
