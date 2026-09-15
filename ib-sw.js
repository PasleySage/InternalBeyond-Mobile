/* InternalBeyond Mobile — ib-sw.js（缓存修正 + 首屏"加载壳" + 导航快速回退）
   与手机端 HTML 放在同一目录，经 HTTPS 访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 服务商 / 中转站的请求原样放行、绝不缓存。

   v6 变更（修 v5 的"点进去出不来"死循环）：
   v5 的加载壳用 `fetch('./index.html',{cache:'no-store'})` 下载，而 SW 里有一条
   "`cache==='no-store'` 的请求不写缓存"的规则（本意是别缓存诊断页的探测请求）——
   于是壳把页面下完了却什么都没存下，点「进入应用」→ 导航发现仍无缓存 → 又给壳 → 死循环。
   现在：壳改用 `cache:'reload'`（照样绕过 HTTP 缓存，但允许 SW 写入），
   并且下载完成后**先确认缓存里确实有了**（最多等 6 秒）才跳转；仍没有则给可点按钮，绝不自动循环。
   同时把壳的界面按 IB 自身的启动画面重做（同一套配色/字体/细进度条，跟随用户已选的主题）。

   v7 变更（同文件）：
   ① 修 bug：v4 的"只缓存完整响应"用**解压后**体积比 `content-length`（gzip 压缩后体积），
      永远不相等 → `index.html` 从来没进过缓存 → 快速回退形同虚设、离线起不来。
      现在：压缩响应不做长度比对（能读全即完整），未压缩才比对；入库前剥掉
      content-encoding/content-length（存的是解压后字节，留着旧头会被二次解压致损坏）。
   ② 首次加载（本地无缓存）先返回 **~2KB 加载壳**：显示进度与速度，完成后自动进入。

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
   注意：`cache:'no-store'` 的请求一律不写缓存（诊断页的探测请求靠这条保持干净）。 */
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

function htmlResponse(body, status) {
  return new Response(body, { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function offlinePage() {
  return htmlResponse('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="margin:0;font:15px/1.7 system-ui,-apple-system,\'Noto Sans SC\',sans-serif;background:#dfe9f6;color:#1f3552;padding:40px 24px">'
    + '<div style="max-width:520px;margin:0 auto"><div style="font-size:18px;font-weight:600;margin-bottom:8px">暂时加载不上</div>'
    + '<div style="opacity:.72;font-size:13px">网络没有响应，本地缓存也没命中。确认网络后重试。</div>'
    + '<button onclick="location.replace(location.href)" style="margin-top:16px;padding:11px 20px;border:0;border-radius:12px;background:#3d6a9e;color:#fff;font-size:15px">重试</button>'
    + '</div></body>', 503);
}

/* 首次加载（本地还没有页面副本）时先给这个壳：界面沿用 IB 自己的启动画面风格。
   下载完 → 确认缓存里有了 → 自动进入；始终没有 → 给按钮，绝不自动循环。 */
function shellPage() {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>InternalBeyond</title>'
    + '<style>'
    + 'html,body{margin:0;height:100%}'
    + 'body{background:#dfe9f6;color:#1f3552;font:15px/1.7 system-ui,-apple-system,"Noto Sans SC",sans-serif;'
    + 'display:flex;align-items:center;justify-content:center;padding:0 24px;-webkit-tap-highlight-color:transparent}'
    + 'body.dark{background:#141a2e;color:#e9f0fb}'
    + '.box{width:min(300px,72vw);text-align:center}'
    + '.brand{font-family:"Cormorant Garamond",Georgia,"Noto Serif SC",serif;font-size:23px;letter-spacing:.05em;opacity:.92}'
    + '.sub{margin-top:8px;font-size:13px;opacity:.6}'
    + '.track{margin:22px 0 0;height:3px;border-radius:2px;background:rgba(62,98,143,.14);overflow:hidden}'
    + 'body.dark .track{background:rgba(255,255,255,.13)}'
    + '.fill{height:100%;width:0;background:#8db6de;transition:width .25s ease}'
    + '.meta{margin-top:11px;font:11.5px/1.6 ui-monospace,Menlo,monospace;opacity:.6;min-height:1.6em}'
    + '.btn{margin-top:20px;padding:11px 22px;border:0;border-radius:12px;background:#3d6a9e;color:#fff;font-size:14px;font-weight:600;display:none}'
    + '</style>'
    + '<body><div class="box">'
    + '<div class="brand" id="bd">Internal Beyond</div>'
    + '<div class="sub" id="sb">正在准备首次加载</div>'
    + '<div class="track"><div class="fill" id="fl"></div></div>'
    + '<div class="meta" id="mt">0%</div>'
    + '<button class="btn" id="bt">进入应用</button>'
    + '</div>'
    + '<script>(function(){'
    + 'var fl=document.getElementById("fl"),mt=document.getElementById("mt"),sb=document.getElementById("sb"),bt=document.getElementById("bt"),bd=document.getElementById("bd");'
    + 'try{if(localStorage.getItem("ib_m_theme")==="infernal")document.body.classList.add("dark")}catch(e){}'
    + 'var n=0;try{n=parseInt(sessionStorage.getItem("ib_shell_n")||"0",10)||0}catch(e){}'
    + 'function say(s){sb.textContent=s}'
    + 'function meta(s){mt.textContent=s}'
    + 'function enter(){try{location.replace("./")}catch(e){}}'
    + 'async function cached(){try{return !!(await caches.match("./index.html",{ignoreSearch:true}))}catch(e){return false}}'
    + 'async function waitCache(ms){var t0=Date.now();while(Date.now()-t0<ms){if(await cached())return true;await new Promise(function(r){setTimeout(r,250)})}return false}'
    + 'async function done(){'
    + '  fl.style.width="100%";'
    + '  if(await cached()){meta("已完成");say("正在进入");enter();return}'
    + '  say("正在写入本地缓存…");meta("稍候");'
    + '  if(await waitCache(6000)){meta("已完成");say("正在进入");enter();return}'
    + '  say("已下载完成，但本地缓存没写成功");meta("点下面按钮进入");bt.textContent="进入应用";bt.style.display="block"'
    + '}'
    + 'function fail(e){say("下载失败："+String(e&&e.message||e));meta("检查网络后重试");bt.textContent="重试";bt.style.display="block"}'
    + 'bt.onclick=function(){if(/重试/.test(bt.textContent)){location.reload();return}enter()};'
    + 'var t0=Date.now();'
    + 'fetch("./index.html",{cache:"reload"}).then(function(res){'
    + '  if(!res.ok)throw new Error("HTTP "+res.status);'
    + '  var total=parseInt(res.headers.get("content-length")||"0",10);'
    + '  if(!res.body||!res.body.getReader){return res.arrayBuffer().then(done)}'
    + '  var rd=res.body.getReader(),got=0;'
    + '  function step(){return rd.read().then(function(x){'
    + '    if(x.done){return done()}'
    + '    got+=x.value.length;'
    + '    var sec=(Date.now()-t0)/1000,sp=sec>0?(got/1024)/sec:0;'
    + '    var pct=total?Math.min(100,got/total*100):0;'
    + '    fl.style.width=(total?pct.toFixed(1):"0")+"%";'
    + '    meta((total?(pct.toFixed(0)+"% · "):"")+(got/1048576).toFixed(2)+" MB"+(sp>0?(" · "+sp.toFixed(0)+" KB/s"):""));'
    + '    return step()})}'
    + '  return step()})'
    + '.catch(fail);'
    + '})();<\/script></body>';
  return htmlResponse(html);
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
