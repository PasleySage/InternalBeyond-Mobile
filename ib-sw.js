/* InternalBeyond Mobile — ib-sw.js（联网优先 + 超时护栏；离线回退缓存）
   与手机端 HTML 放在同一目录，经 HTTPS 访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 服务商 / 中转站的请求原样放行、绝不缓存。

   v245-p 白屏防御（原版三个坑）：
   ① 原版 fetch 无超时：弱网下导航请求永久挂起 → 冷启动纯白屏、且安装形态没有刷新入口；
   ② 原版把任何 r.ok 的响应都写进缓存：连接中途断掉的**截断 HTML** 也会入库，
      之后反复白屏（"关掉重开好几次才好"）；
   ③ 原版离线兜底失败直接抛错 → 浏览器默认错误页/白屏。
   现在：取数带超时；只有**完整**响应（content-length 对得上）才入库；兜底返回可读的离线页。 */
const IB_CACHE = 'ib-cache-v3';
const NET_TIMEOUT = 9000;

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

  e.respondWith(
    timedFetch(e.request, isNav ? 12000 : NET_TIMEOUT).then(function (r) {
      if (isNav || r.ok) cacheIfComplete(e.request, r);
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (m) {
        if (m) return m;
        return caches.match('./index.html', { ignoreSearch: true }).then(function (m2) {
          if (m2 && isNav) return m2;
          return caches.match('./', { ignoreSearch: true }).then(function (m3) {
            if (m3 && isNav) return m3;
            if (isNav) return offlinePage();
            throw new Error('offline');
          });
        });
      });
    })
  );
});
