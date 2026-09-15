/* InternalBeyond Mobile — ib-sw.js（缓存修正 + 首屏"加载壳" + 导航快速回退）
   与手机端 HTML 放在同一目录，经 HTTPS 访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 服务商 / 中转站的请求原样放行、绝不缓存。

   v5 变更（修 v4 的一个真 bug + 慢网络首屏）：
   ① 修 bug：v4 的"只缓存完整响应"用**解压后**体积去比 `content-length`（gzip 压缩后体积），
      永远不相等 → **index.html 从来没进过缓存**，"快速回退"因此形同虚设、离线也起不来。
      现在：压缩响应（有 content-encoding）不做长度比对（读取 body 成功即视为完整，截断的流会读失败），
      未压缩响应才比对 content-length；并且入库前**删掉 content-encoding/content-length**
      （存的是解压后的字节，若留着旧头，取出来会被浏览器再解压一次 → 内容损坏）。
   ② 慢网络首屏：本地还没有缓存时，导航先返回一个 **1.5KB 的"加载壳"**（显示进度与速度），
      壳自己把 index.html 拉完写进缓存后自动重载 → 由缓存瞬间起页。
      起因：单文件 HTML 有 1.33MB，实测某些网络下行只有 0.4Mbps，首屏要等 20~30 秒纯白。
   ③ 缓存名 v4 → v5（旧缓存 activate 时清掉）。

   沿革：v3 修"取数无超时/截断入库/离线抛错"；v4 加导航快速回退（3.5s）。 */
const IB_CACHE = 'ib-cache-v5';
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

/* 把响应存进缓存。压缩响应不做长度比对（解压后的字节数与 content-length 本来就不同）；
   读取 body 失败 = 响应不完整，直接不存。入库前剥掉 content-encoding/content-length。 */
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
    + '<body style="margin:0;font:15px/1.7 system-ui,-apple-system,\'Noto Sans SC\',sans-serif;background:#eef2f8;color:#22344f;padding:34px 20px">'
    + '<h2 style="margin:0 0 10px">暂时加载不上</h2>'
    + '<p style="opacity:.78">网络没有响应，本地缓存也没命中。确认网络后点下面按钮重试。</p>'
    + '<button onclick="location.replace(location.href)" style="margin-top:14px;padding:11px 18px;border:0;border-radius:11px;background:#3d6a9e;color:#fff;font-size:15px">重试</button>'
    + '</body>';
  return new Response(html, { status: 503, statusText: 'offline', headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/* 首次加载（本地无缓存）时先给这个壳：显示进度，下载完自动重载 → 由缓存瞬间起页 */
function shellPage() {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>正在加载</title>'
    + '<body style="margin:0;font:15px/1.7 system-ui,-apple-system,\'Noto Sans SC\',sans-serif;background:#eef2f8;color:#22344f;padding:36px 22px">'
    + '<div style="max-width:520px;margin:0 auto">'
    + '<div style="font-size:17px;font-weight:600;margin-bottom:6px">首次加载，正在下载</div>'
    + '<div id="m" style="opacity:.78;font-size:13px;margin-bottom:14px">应用是单文件，约 1.4MB；网络较慢时要等几十秒，进度在下面。</div>'
    + '<div style="height:8px;border-radius:6px;background:#dbe5f1;overflow:hidden"><div id="b" style="height:100%;width:0;background:#3d6a9e;transition:width .2s"></div></div>'
    + '<div id="t" style="font:12px/1.6 ui-monospace,Menlo,monospace;margin-top:10px;opacity:.8">0%</div>'
    + '<button id="r" style="margin-top:16px;padding:11px 18px;border:0;border-radius:11px;background:#3d6a9e;color:#fff;font-size:15px;display:none">重试</button>'
    + '</div>'
    + '<script>(function(){'
    + 'var b=document.getElementById("b"),t=document.getElementById("t"),r=document.getElementById("r"),m=document.getElementById("m");'
    + 'var n=0;try{n=parseInt(sessionStorage.getItem("ib_shell_n")||"0",10)||0}catch(e){}'
    + 'function done(){try{b.style.width="100%";'
    + 'if(n>=1){t.textContent="下载完成，点下面按钮进入（不再自动重载，避免在慢网络里反复下载）";r.textContent="进入应用";r.style.display="block";r.onclick=function(){location.replace("./")};return}'
    + 'try{sessionStorage.setItem("ib_shell_n",String(n+1))}catch(e2){};location.replace("./")}catch(e){}}'
    + 'function fail(e){m.textContent="下载失败："+String(e&&e.message||e);r.style.display="block"}'
    + 'r.onclick=function(){location.reload()};'
    + 'var t0=Date.now();'
    + 'fetch("./index.html",{cache:"no-store"}).then(function(res){'
    + '  if(!res.ok)throw new Error("HTTP "+res.status);'
    + '  var total=parseInt(res.headers.get("content-length")||"0",10);'
    + '  if(!res.body||!res.body.getReader){return res.arrayBuffer().then(function(){done()})}'
    + '  var rd=res.body.getReader(),got=0;'
    + '  function step(){return rd.read().then(function(x){'
    + '    if(x.done){done();return}'
    + '    got+=x.value.length;'
    + '    var sp=(got/1024)/((Date.now()-t0)/1000);'
    + '    var pct=total?Math.min(100,got/total*100):0;'
    + '    b.style.width=(total?pct.toFixed(1):"0")+"%";'
    + '    t.textContent=(total?(pct.toFixed(0)+"%  "):"")+(got/1048576).toFixed(2)+"MB"+(sp>0?("  "+sp.toFixed(0)+"KB/s"):"");'
    + '    return step()})}'
    + '  return step()})'
    + '.catch(fail);'
    + '})();<\/script>'
    + '</body>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
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
    if (!cached) return shellPage(); /* 本地还没有页面副本：先给壳，别让用户对着纯白等 20 秒 */
    var netP = timedFetch(req, NAV_NET_TIMEOUT).then(function (r) { cacheComplete(req, r); return r; });
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
