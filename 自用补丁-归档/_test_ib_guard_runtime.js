/* 白屏防御 · 看门狗运行时逻辑测试（不依赖浏览器：假 DOM + 假计时器）
   目的：证明 ①正常启动绝不误弹面板 ②未完成启动必弹并计数 ③面板按钮真接线 */
const fs = require('fs');
const html = fs.readFileSync((process.env.IB_ROOT || __dirname) + '/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  => ' + e : ''))); };

/* ---- 从 index.html 抽出「启动防御」那段源码（helper + 看门狗） ---- */
const startMark = '/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \u542f\u52a8 \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */';
const i0 = html.indexOf(startMark);
const i1 = html.indexOf('(async function init(){', i0);
ok(i0 > 0 && i1 > i0, '能定位到启动防御源码段');
let src = html.slice(i0, i1);
ok(/function _ibGuard\(\)/.test(src), '源码段包含 _ibGuard');

/* ---- 假环境 ---- */
function makeEnv(opts) {
  const ls = new Map();
  if (opts && opts.ls) Object.entries(opts.ls).forEach(([k, v]) => ls.set(k, v));
  const timers = [];
  const els = new Map();
  const win = {};
  const doc = {
    body: { appendChild(el) { els.set(el.id, el); ['ib-guard-msg', 'ib-guard-diag', 'ib-guard-reload', 'ib-guard-safe', 'ib-guard-cache', 'ib-guard-copy'].forEach(id => { if (!els.has(id)) els.set(id, mkEl(id)); }); } },
    createElement() { return mkEl('pending'); },
    getElementById(id) { return els.get(id) || null; }
  };
  function mkEl(id) {
    return { id, _style: '', onclick: null, value: '', textContent: '',
      setAttribute(k, v) { if (k === 'style') this._style = v; },
      remove() {} };
  }
  const reloads = [];
  const env = {
    window: win,
    document: doc,
    localStorage: {
      getItem: k => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: k => ls.delete(k)
    },
    navigator: { onLine: true, userAgent: 'test-ua', deviceMemory: 8 },
    toast: () => {},
    location: { reload: () => reloads.push('reload') },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    fire: ms => timers.filter(t => t.ms === ms).forEach(t => { try { t.fn(); } catch (e) { console.log('    (timer threw: ' + e.message + ')'); } }),
    ls, els, reloads
  };
  win.matchMedia = () => ({ matches: false });
  win.addEventListener = (type, fn) => { (win._h = win._h || {})[type] = fn; };
  win.dispatch = (type, ev) => { const h = (win._h || {})[type]; if (!h) throw new Error('no handler: ' + type); h(ev); };
  return env;
}

function run(src, env) {
  const F = new Function('window', 'document', 'localStorage', 'navigator', 'toast', 'location', 'setTimeout', 'IB_VER', 'IB_VER_DATE', src);
  F(env.window, env.document, env.localStorage, env.navigator, env.toast, env.location, env.setTimeout, 'v-test', '2026-09-15');
}

/* ---- ① 正常启动：绝不该弹面板 ---- */
console.log('\n[A] 正常启动不误报');
{
  const env = makeEnv();
  run(src, env);
  env.window.__ibBootOK = true;             // init 走完
  env.fire(12000);
  ok(!env.els.has('ib-guard'), '12s 看门狗未弹面板');
  ok(env.ls.get('ib_boot_fail') === undefined, '失败计数未被写脏');
  ok(env.window.__ibBootOK === true, '启动完成标记保持');
}

/* ---- ② 卡死启动：必弹面板 + 计数 ---- */
console.log('\n[B] 未完成启动必须弹面板');
{
  const env = makeEnv();
  run(src, env);
  env.fire(12000);
  ok(env.els.has('ib-guard'), '弹出了诊断面板');
  ok(env.ls.get('ib_boot_fail') === '1', '失败计数 = 1', String(env.ls.get('ib_boot_fail')));
  const diag = env.els.get('ib-guard-diag');
  ok(/v-test/.test(diag.value), '诊断信息含版本号');
  ok(/启动超时/.test(env.els.get('ib-guard-msg').textContent), '提示为“启动超时”', env.els.get('ib-guard-msg').textContent);
}

/* ---- ③ 面板按钮接线 ---- */
console.log('\n[C] 面板按钮真接线');
{
  const env = makeEnv();
  run(src, env);
  env.fire(12000);
  const n = ['ib-guard-reload', 'ib-guard-safe', 'ib-guard-cache', 'ib-guard-copy'].filter(id => typeof (env.els.get(id) || {}).onclick === 'function').length;
  ok(n === 4, '四个按钮都挂上了 onclick（' + n + '/4）');
  env.els.get('ib-guard-safe').onclick();
  ok(env.ls.get('ib_safe_boot') === '1', '「安全模式重载」写入标记');
  ok(env.reloads.includes('reload'), '并触发重载');
  env.els.get('ib-guard-reload').onclick();
  ok(env.reloads.length === 2, '「重新加载」触发重载');
}

/* ---- ④ 安全模式判定 ---- */
console.log('\n[D] 安全模式判定与清账');
{
  const env = makeEnv();
  run(src, env);
  ok(env.window.__ibBootOK !== true, '初始未标记启动完成');
  // 无法直接调 helper（在闭包里），用行为验证：fail>=2 时应进入安全模式 → 由面板文案体现
  const env2 = makeEnv({ ls: { ib_boot_fail: '2' } });
  run(src, env2);
  env2.fire(12000);
  ok(/安全模式：开/.test(env2.els.get('ib-guard-diag').value), 'fail>=2 时诊断面板显示安全模式=开', env2.els.get('ib-guard-diag').value.split('\n')[3]);
  const env3 = makeEnv({ ls: { ib_safe_boot: '1' } });
  run(src, env3);
  env3.fire(12000);
  ok(/安全模式：开/.test(env3.els.get('ib-guard-diag').value), '显式标记时也算安全模式');
}

/* ---- ⑤ 全局错误钩子 ---- */
console.log('\n[E] 全局错误先落到面板，而不是白屏');
{
  const env = makeEnv();
  run(src, env);
  env.window.dispatch('error', { message: 'boom-test' });
  ok(env.els.has('ib-guard'), '脚本错误即弹面板');
  ok(env.ls.get('ib_last_err') === 'boom-test', '错误写进 ib_last_err');
  ok(/boom-test/.test(env.els.get('ib-guard-msg').textContent), '面板显示了错误内容');

  const env2 = makeEnv();
  run(src, env2);
  env2.window.dispatch('unhandledrejection', { reason: new Error('async-boom') });
  ok(/async-boom/.test(env2.els.get('ib-guard-msg').textContent), '未处理 Promise 拒绝也会显示');

  const env3 = makeEnv();
  run(src, env3);
  env3.window.__ibBootOK = true;
  env3.window.dispatch('error', { message: 'late-error' });
  ok(!env3.els.has('ib-guard'), '启动完成后的错误不弹面板（不打扰正常使用）');

  const env4 = makeEnv();
  run(src, env4);
  env4.window.dispatch('error', { message: '' });
  ok(!env4.els.has('ib-guard'), '空错误信息被忽略（不误弹）');
}

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
