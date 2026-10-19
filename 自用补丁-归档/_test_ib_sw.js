/* ib-sw.js 单元测试（Node，自建 caches/fetch/Response 桩）
   重点验证：①压缩响应能正确入库且剥掉 content-encoding ②未压缩截断响应不入库
   ③无缓存时给"加载壳" ④有缓存时网络慢用缓存、网络快用网络 ⑤子资源同样入库 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/ib-sw.js', 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  => ' + e : ''))); };

/* ---------- 桩 ---------- */
function makeEnv(netImpl) {
  const store = new Map();               // 单缓存库：key = 去 search 的 URL
  const key = (r) => { const u = typeof r === 'string' ? new URL(r, 'https://site.test/') : new URL(r.url); return u.origin + u.pathname; };
  const cacheObj = {
    async put(req, res) { store.set(key(req), res); },
    async match(req, opts) { return store.get(key(req)) || undefined; },
    async keys() { return [...store.keys()].map(u => new Request(u)); }
  };
  const cachesStub = {
    open: async () => cacheObj,
    keys: async () => ['ib-cache-v5'],
    delete: async () => true,
    match: async (req, opts) => store.get(key(req)) || undefined
  };
  const handlers = {};
  const calls = [];
  const self = {
    location: { origin: 'https://site.test' },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} }
  };
  const fetchStub = (req, opts) => { calls.push(String(req.url || req)); return netImpl(req, opts); };
  const F = new Function('self', 'caches', 'fetch', 'Response', 'Headers', 'Request', 'AbortController', 'setTimeout', 'clearTimeout', src);
  F(self, cachesStub, fetchStub, Response, Headers, Request, AbortController, setTimeout, clearTimeout);
  const fire = async (req) => {
    let p = null;
    const plain = { url: req.url, method: 'GET', mode: req.mode !== undefined ? req.mode : 'navigate', destination: req.destination !== undefined ? req.destination : 'document', cache: req.cache || 'default' };
    const ev = { request: plain, respondWith: (x) => { p = x; } };
    handlers['fetch'](ev);
    return p ? await p : null;
  };
  return { store, fire, calls, self, handlers, cacheObj };
}
const NAV = { url: 'https://site.test/InternalBeyond-Mobile/', mode: 'navigate', destination: 'document' };
const APP = '<!doctype html><html><body>APP-v247</body></html>';

(async () => {
  console.log('\n[A] 压缩（gzip）响应必须能入库，且剥掉 content-encoding（v4 的 bug 就在这）');
  {
    const env = makeEnv(async () => new Response(APP, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip', 'content-length': String(Buffer.byteLength(APP) - 1) }
    }));
    /* 先放一份旧副本，让导航走"网络优先"这条路（否则会返回加载壳） */
    env.store.set('https://site.test/InternalBeyond-Mobile/', new Response('OLD-APP', { status: 200 }));
    const r = await env.fire(NAV);
    const text = await r.text();
    ok(text === APP, '导航返回了网络响应本体');
    await new Promise(r2 => setTimeout(r2, 30));
    const hit = env.store.get('https://site.test/InternalBeyond-Mobile/');
    ok(!!hit && (await hit.clone().text()) === APP, '新响应已覆盖写入缓存（旧版会因长度比对不等而跳过）');
    if (hit) {
      ok(!hit.headers.get('content-encoding'), '缓存副本已剥掉 content-encoding（否则取出来会被二次解压致损坏）');
      ok(hit.headers.get('x-ib-complete') === '1', '缓存副本带 x-ib-complete 标记');
    }
  }

  console.log('\n[B] 未压缩但被截断的响应不得入库');
  {
    const env = makeEnv(async () => new Response(APP, { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(Buffer.byteLength(APP) + 500) } }));
    await env.fire(NAV);
    await new Promise(r2 => setTimeout(r2, 30));
    ok(!env.store.get('https://site.test/InternalBeyond-Mobile/'), '声明长度与实际不符 → 不缓存');
  }

  console.log('\n[C] 本地无缓存 + 网络失败 → 不做自定义壳，只给可读的离线页');
  {
    const env = makeEnv(async () => { throw new Error('网络挂了'); });
    const t0 = Date.now();
    const r = await env.fire(NAV);
    const html = await r.text();
    ok(html.includes('暂时加载不上'), '网络失败 → 可读的离线页');
    ok(!html.includes('正在准备首次加载') && !html.includes('首次加载'), '不再出现自定义加载壳');
    ok(Date.now() - t0 < 1000, '快速返回，不长时间挂住（实测 ' + (Date.now() - t0) + 'ms）');
  }

  console.log('\n[D] 有缓存 + 网络很慢 → 3.5 秒后用缓存起页');
  {
    const env = makeEnv(async () => new Promise(() => {}));           // 永不返回
    env.store.set('https://site.test/InternalBeyond-Mobile/', new Response('CACHED-APP', { status: 200, headers: { 'x-ib-complete': '1' } }));
    const t0 = Date.now();
    const r = await env.fire(NAV);
    const text = await r.text();
    const ms = Date.now() - t0;
    ok(text === 'CACHED-APP', '返回的是缓存副本');
    ok(ms >= 3400 && ms < 5000, '在 3.5 秒左右回退（实测 ' + ms + 'ms）');
  }

  console.log('\n[E] 有缓存 + 网络很快 → 用网络的新内容');
  {
    const env = makeEnv(async () => new Response('FRESH-APP', { status: 200, headers: { 'content-type': 'text/html' } }));
    env.store.set('https://site.test/InternalBeyond-Mobile/', new Response('OLD-APP', { status: 200 }));
    const r = await env.fire(NAV);
    ok((await r.text()) === 'FRESH-APP', '用的是网络响应');
  }

  console.log('\n[F] 子资源（非导航）同样正确入库');
  {
    const env = makeEnv(async () => new Response('console.log(1)', { status: 200, headers: { 'content-encoding': 'br', 'content-length': '8' } }));
    await env.fire({ url: 'https://site.test/InternalBeyond-Mobile/apps/x.js', mode: 'no-cors', destination: 'script' });
    await new Promise(r2 => setTimeout(r2, 30));
    const hit = env.store.get('https://site.test/InternalBeyond-Mobile/apps/x.js');
    ok(!!hit && !hit.headers.get('content-encoding'), '子资源已入库且无 content-encoding');
  }

  console.log('\n[H] 不再有自定义加载壳（保持 IB 自身设计）');
  {
    ok(!/shellPage/.test(src), '源码里已无 shellPage');
    ok(/if \(!cached\) return netP\.catch\(function \(\) \{ return offlinePage\(\); \}\)/.test(src), '本地无缓存时直接走网络，失败才给离线页');
    ok(/const IB_CACHE = 'ib-cache-v6'/.test(src), '缓存名沿用 v6（不提升，避免清掉用户已缓存的页面副本）');

    /* 无缓存 + 网络失败 → 离线页（而不是任何自定义壳） */
    const env = makeEnv(async () => { throw new Error('网络挂了'); });
    const r = await env.fire(NAV);
    const t = await r.text();
    ok(/暂时加载不上/.test(t) && !/Internal Beyond<\/div>/.test(t), '无缓存且网络失败 → 只给可读的离线页');
  }

  console.log('\n[G] 源码级约定');
  ok(src.includes("const IB_CACHE = 'ib-cache-v6'"), '缓存版本已提升到 v6');
  ok(/if \(!enc && cl && parseInt\(cl, 10\) !== buf\.byteLength\) return;/.test(src), '长度比对只在"未压缩"时才生效');
  ok(/h\.delete\('content-encoding'\)/.test(src) && /h\.delete\('content-length'\)/.test(src), '入库前剥掉 content-encoding 与 content-length');

  console.log('\n==============================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  console.log('==============================');
  process.exit(fail ? 1 : 0);
})();
