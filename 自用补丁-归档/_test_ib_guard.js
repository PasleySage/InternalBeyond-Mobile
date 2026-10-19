/* InternalBeyond-Mobile —— 白屏防御补丁回归（v245-p）
   层次：①全部内联 script 语法可编译 ②补丁锚点存在 ③反模式已消失 ④SW 逻辑锚点 */
const fs = require('fs');
const path = require('path');
const ROOT = process.env.IB_ROOT || __dirname;

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  => ' + e : ''))); };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'ib-sw.js'), 'utf8');

console.log('\n[A] 全部内联 script 语法可编译');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
let bad = [];
blocks.forEach((m, i) => {
  if (/\ssrc=/.test(m[1])) return;           // 外链脚本跳过（本应用没有）
  try { new Function(m[2]); } catch (e) { bad.push('#' + i + ' ' + e.message); }
});
ok(bad.length === 0, blocks.length + ' 个内联脚本块编译通过', bad.join(' | '));
ok(blocks.length >= 22, '脚本块数量未减少（' + blocks.length + ' >= 22）');

console.log('\n[B] 补丁锚点存在');
[
  ['_ibCap 单步超时护栏', /function _ibCap\(p,ms\)/],
  ['_ibSafeMode 安全模式判定', /function _ibSafeMode\(\)/],
  ['_ibMarkOK 成功清账', /function _ibMarkOK\(\)/],
  ['启动看门狗 12s 兜底', /setTimeout\(function\(\)\{try\{[\s\S]{0,400}ib-splash/],
  ['诊断面板容器', /w\.id='ib-guard'|id="ib-guard"/],
  ['全局 error 钩子', /addEventListener\('error',function\(e\)\{try\{if\(!e\|\|!e\.message\)return/],
  ['全局 unhandledrejection 钩子', /addEventListener\('unhandledrejection',function\(e\)/],
  ['openDB onblocked', /req\.onblocked=function\(\)/],
  ['openDB onversionchange 让路', /db\.onversionchange=function\(\)\{try\{db\.close\(\)/],
  ['init 收尾按预遮罩状态决定是否打"启动成功"', /navTo\('profile'\);\r?\n\s*if\(_ibVeilStuck\(\)\)_ibFailBump\(\);else _ibMarkOK\(\);/],
  ['init 异常路径强制撤预遮罩', /_lkVeilOff\(\);_veilOff=true/],
  ['_lkBoot 背景加载限时', /Promise\.race\(\[loadBgs\(\),new Promise\(function\(r\)\{setTimeout\(r,4000\)\}\)\]\)/],
  ['安全模式跳过桌面/背景', /if\(!SAFE\)\{/],
  ['字体非阻塞装载器', /id="ib-fontloader"/],
  ['v247 库版本自愈（VersionError → 清缓存重载一次）', /if\(e&&e\.name==='VersionError'&&!sessionStorage\.getItem\('ib_verfix'\)\)/],
  ['启动各步耗时记录（_ibTimed）', /function _ibTimed\(n,p,ms\)/],
  ['openDB 已埋点', /_ibTimed\('openDB',openDB\(\),15000\)/],
  ['_lkBoot 已埋点', /_ibTimed\('_lkBoot',_lkBoot\(\),6000\)/],
  ['看门狗盯"启动画面是否还在"', /if\(document\.getElementById\('ib-splash'\)\)\{_ibFailBump\(\);window\.__ibGuardShow\('启动画面停留超过 12 秒/],
  ['诊断面板含各步耗时', /启动各步耗时/],
  ['就绪判定细节写入面板', /window\.__ibReadyDbg=/],
  ['兜底：不再无限停在 96%', /if\(now-t0>30000\)return true;/],
  ['启动画面心跳记录', /window\.__ibFrameAt=Date\.now\(\)/],
  ['预遮罩竞态已修（已揭幕/已启动完成则不再挂上）', /if\(window\.__ibVeilOff\|\|window\.__ibBootOK\)return;/],
  ['_lkVeilOff 记录揭幕标记', /window\.__ibVeilOff=true;/],
  ['脱敏助手存在', /function _ibRedact\(s\)/],
  ['错误原文走脱敏', /o\.push\('错误：'\+_ibRedact\(/],
  ['面板写明已自动隐去', /密钥类参数与网址细节已自动隐去/],
  ['面板提示公开贴出前先看「错误」行', /若要贴到公开的 issue 评论或群聊，建议先看一眼「错误」那一行，或直接删掉那行再贴/],
  ['面板跟随主题（IB 配色）', /dk\?'#141a2e':'#dfe9f6'/]
].forEach(([name, re]) => ok(re.test(html), name));

console.log('\n[C] 反模式已消除');
ok(!/@import url\('https:\/\/fonts\.googleapis\.com/.test(html), '无 render-blocking 的 Google Fonts @import');
ok(!/try\{await loadBgs\(\)\}catch\(e\)\{\}/.test(html), '无裸 await loadBgs()（无限等待）');
ok(!/try\{await loadMP\(\);\n/.test(html), 'loadMP 已带超时');
ok(!/try\{await _lkBoot\(\)\}catch\(e\)\{try\{if\(localStorage\.getItem\('ib_lockOn'\)!=='1'\)_lkVeilOff\(\)/.test(html), '异常路径不再看锁屏开关决定是否撤预遮罩');
ok(!/now-t0>9000/.test(html), '进度条已去掉"满 9 秒就走"的硬兜底');
ok(/function ready\(now\)\{[\s\S]{0,420}lk-preveil/.test(html) && /m&&m\.children&&m\.children\.length/.test(html), 'ready() 现在要求预遮罩已撤且主界面已渲染');
ok(/_ibMarkOK\(\)\{[\s\S]{0,300}ib-guard'\);if\(_g\)_g\.remove\(\)/.test(html), '启动成功会把已弹出的诊断面板收掉（不盖住正常应用）');
ok(/function _ibVeilStuck\(\)/.test(html), '新增"预遮罩是否还挂着"的判定');
ok(/if\(_ibVeilStuck\(\)\)\{try\{_lkVeilOff\(\)\}catch\(x8\)\{\};try\{await _ibTimed\('_lkBoot重试',_lkBoot\(\),5000\)\}catch\(x7\)\{\}\}/.test(html), '_lkBoot 超时（不抛错）时仍保证撤预遮罩');
ok(/if\(_ibVeilStuck\(\)\)_ibFailBump\(\);else _ibMarkOK\(\);/.test(html), '预遮罩没撤掉就不打"启动成功"，看门狗照常报警');

console.log('\n[D] Service Worker 加固');
try { new Function(sw); ok(true, 'ib-sw.js 语法可编译'); } catch (e) { ok(false, 'ib-sw.js 语法可编译', e.message); }
ok(/ib-cache-v6/.test(sw), '缓存版本已提升到 v6（旧缓存 activate 时清掉）');
ok(/new AbortController\(\)/.test(sw), '取数带超时中止');
ok(/!enc && cl && parseInt\(cl, 10\) !== buf\.byteLength/.test(sw), '长度比对只在未压缩响应上生效（压缩响应按"能否读全"判断）');
ok(/h\.delete\('content-encoding'\)/.test(sw), '入库前剥掉 content-encoding（防二次解压损坏）');
ok(/x-ib-complete/.test(sw), '完整响应打标');
ok(/offlinePage\(\)/.test(sw), '离线兜底页（不再是浏览器默认错误页）');
ok(/destination === 'document'/.test(sw), '导航请求单独识别');
ok(/NAV_FAST_MS = 3500/.test(sw), '导航快速回退阈值 3500ms');
ok(/function handleNavigate\(req\)/.test(sw), '导航走 handleNavigate');
ok(/resolve\(cached\); \}, NAV_FAST_MS\)/.test(sw) && /netP\.then\(function \(r\)/.test(sw), '网络慢时把缓存副本先交出去，网络请求继续跑补缓存');
ok(!/shellPage/.test(sw), '没有自定义"加载壳"页（不在应用里塞外来界面）');
ok(/if \(!cached\) return netP\.catch\(function \(\) \{ return offlinePage\(\); \}\)/.test(sw), '本地无缓存时直接走网络，失败才给离线页');

console.log('\n[E] 数据面未被触碰（白屏补丁不该动存储与业务）');
ok(!/IB_STORES\s*=\s*\[[^\]]*\]\s*;?\s*\/\/.*v245/.test(html), 'store 清单未被本补丁改动');
ok(/const DB_NAME='InternalBeyondDB',DB_VER=15;/.test(html), 'DB_NAME / DB_VER 未变（不会触发意外的库升级）');
ok(/_mioRunImport/.test(html) && /dbPutAll/.test(html), '导入通道函数仍在');
ok(/SYNC_STORES/.test(html), '备份 store 清单仍在');

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
