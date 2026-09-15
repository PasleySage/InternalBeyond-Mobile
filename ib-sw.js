/* InternalBeyond Mobile — ib-sw.js（缓存修正 + 超时护栏 + 导航快速回退）
   与手机端 HTML 放在同一目录，经 HTTPS 访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 服务商 / 中转站的请求原样放行、绝不缓存。

   v7 变更：
   ① **删掉 v5/v6 引入的"加载壳"页**——不往应用里塞任何自定义界面，保持 IB 自身的设计。
      首次加载（本地无缓存）直接走网络；网络失败才兜底成可读的离线页。
      （"慢网络下首屏等太久"改由应用自己的启动画面负责：进度条不再到点就走，
        不确认内容就绪绝不满格——见 index.html 的 ready()。）
   ② 缓存名**继续沿用 ib-cache-v6**（故意不提升，避免把用户已经缓存好的页面副本清掉重下）。

   v6 变更（修 v5 的"点进去出不来"）：壳的下载请求曾用 cache:'no-store'，而本文件有
   "no-store 不写缓存"的规则 → 下载完什么都没存下 → 死循环。该壳已随 v7 整体删除。

   v5 变更（修"缓存永远存不上"）：原判断用**解压后**体积比 content-length（gzip 压缩后体积），
   永远不相等 → index.html 从未入库，"快速回退"形同虚设、离线也起不来。
   现在：压缩响应不做长度比对（能读全即完整），未压缩才比对；入库前剥掉
   content-encoding/content-length（存的是解压后字节，留着旧头会被二次解压致损坏）。

   沿革：v3 修"取数无超时/截断入库/离线抛错"；v4 加导航快速回退（3.5s）。 */
const IB_CACHE = 'ib-cache-v6';
const NET_TIMEOUT = 9000;
const NAV_NET_TIMEOUT = 20000;
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

/* 把响应存进缓存。压缩响应不做长度比对（解压后字节数与 content-length 本来就不同）；
   读取 body 失败 = 响应不完整，直接不存。入库前剥掉 content-encoding/content-length。
   注意：`cache:'no-store'` 的请求一律不写缓存（自测页的探测请求靠这条保持干净）。 */
function cacheComplete(req, res) {
  try {
    if (!res || res.status !== 200 || res.type === 'opaque') return Promise.resolve();
    if (req.method !== 'GET' || req.cache === 'no-store') return Promise.resolve();
    var enc = res.headers.get('content-encoding');
    var cl = res.headers.get('content-length');
    var cp = res.clone();
    return cp.arrayBuffer().then(function (buf) {
      if (!enc && cl && parseInt(cl, 10) !== buf.byteLength) return;
      var h = new Headers(res.headers);
      h.delete('content-encoding');
      h.delete('content-length');
      h.set('x-ib-complete', '1');
      return caches.open(IB_CACHE).then(function (c) {
        return c.put(req, new Response(buf, { status: 200, statusText: 'OK', headers: h }));
      });
    }).catch(function () {});
  } catch (e) { return Promise.resolve(); }
}

function offlinePage() {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="margin:0;font:15px/1.7 system-ui,-apple-system,\'Noto Sans SC\',sans-serif;background:#dfe9f6;color:#1f3552;padding:40px 24px">'
    + '<div style="max-width:520px;margin:0 auto"><div style="font-size:18px;font-weight:600;margin-bottom:8px">暂时加载不上</div>'
    + '<div style="opacity:.72;font-size:13px">网络没有响应，本地缓存也没命中。确认网络后重试。</div>'
    + '<button onclick="location.replace(location.href)" style="margin-top:16px;padding:11px 20px;border:0;border-radius:12px;background:#3d6a9e;color:#fff;font-size:15px">重试</button>'
    + '</div></body>';
  return new Response(html, { status: 503, statusText: 'offline', headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
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

function handleNavigate(req) {
  return cachedPage(req).then(function (cached) {
    var netP = timedFetch(req, NAV_NET_TIMEOUT).then(function (r) { cacheComplete(req, r); return r; });
    /* 本地还没有副本：直接走网络（不塞自定义页面进来），失败才兜底成可读的离线页 */
    if (!cached) return netP.catch(function () { return offlinePage(); });
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (done) return; done = true; resolve(cached); }, NAV_FAST_MS);
      netP.then(function (r) { if (done) return; done = true; clearTimeout(t); resolve(r); },
                function () { if (done) return; done = true; clearTimeout(t); resolve(cached); });
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

  if (isNav) { e.respondWith(handleNavigate(e.request)); return; }

  e.respondWith(
    timedFetch(e.request, NET_TIMEOUT).then(function (r) {
      if (r.ok) cacheComplete(e.request, r);
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (m) {
        if (m) return m;
        throw new Error('offline');
      });
    })
  );
});
