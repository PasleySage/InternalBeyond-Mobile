/* IB附件选择器-真机实测.html 的离线自测（可重复运行）
   做三件事：① 从页面里抽出 inline script 并做语法与结构核对；
   ② 用 vm + mock DOM 载入脚本，断言纯函数与状态隔离；
   ③ 校验内嵌的「现状」accept 未被误改（796 字符 / 140 项 / 零通配）。 */
'use strict';
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const base = __dirname + path.sep;
const PAGE = base + 'tools' + path.sep + 'pages' + path.sep + 'IB附件选择器-真机实测.html';
const EXT = path.join(os.tmpdir(), '_tmp_probe_script.js');

let pass = 0, fail = 0;
const lines = [];
const ok = (c, n, e) => { c ? (pass++, 0) : (fail++, 0); lines.push((c ? '  PASS  ' : '  FAIL  ') + n + (!c && e !== undefined ? '  → ' + e : '')); };

const html = fs.readFileSync(PAGE, 'utf8');
const blocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
const code = blocks.map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).join('\n;\n');
fs.writeFileSync(EXT, code, 'utf8');

lines.push('[1] 页面结构');
ok(blocks.length === 1, '恰好一个 inline script 块', blocks.length);
ok(!/<script[^>]*\bsrc=/i.test(html), '无外部脚本依赖（离线可用）');
ok(!/https?:\/\/(?!github\.com|pasleysage)/i.test(code.replace(/github\.com[^"']*/g, '')), '脚本内无外链请求');
const ids = new Set((html.match(/id="([^"]+)"/g) || []).map(s => s.slice(4, -1)));
['cases', 'out', 'copy', 'reset', 'env', 'toggle-all', 'restored', 'dls',
 'fsa', 'fsa-env', 'fsa-a', 'fsa-b', 'fsa-a-out', 'fsa-b-out', 'fsa-a-obs', 'fsa-b-obs'].forEach(i =>
  ok(ids.has(i), '静态 id 存在：' + i));

lines.push('\n[1b] 第 0 步的测试文件下载入口');
['probe.mermaid', 'probe.puml', 'probe.ts', 'probe.svg', 'probe.md'].forEach(f =>
  ok(html.indexOf('href="' + f + '" download="' + f + '"') > 0, '下载入口存在且强制下载：' + f));
ok(/class="dl"/.test(html), '下载链接有可点样式 .dl');
ok(!/https?:\/\/[^"' ]*probe/i.test(html), '下载链接一律相对路径（不写死主机）');

const handlers = {};
const singletons = {};
function makeMock(name) {
  const store = { _name: name, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: { cssText: '' }, value: '', textContent: '', innerHTML: '', className: '', children: [] };
  const special = { querySelector: () => null, closest: () => null, querySelectorAll: () => [],
    addEventListener(ev, fn) { store._h = store._h || {}; store._h[ev] = store._h[ev] || [];
      store._h[ev].push(fn); handlers[name + ':' + ev] = fn; },
    removeEventListener() {}, getAttribute: () => null, setAttribute() {},
    appendChild() {}, focus() {}, click() {}, select() {}, removeAttribute() {} };
  return new Proxy(store, {
    get(t, k) { if (k in t) return t[k]; if (k in special) return special[k]; return makeMock(k); },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const byId = id => (singletons[id] = singletons[id] || makeMock('#' + id));
const docMock = makeMock('document');
docMock.getElementById = byId;
docMock.createElement = (t) => makeMock('<' + t + '>');
docMock.querySelector = () => makeMock('el');
docMock.querySelectorAll = () => [];
docMock.addEventListener = () => {};
docMock.body = makeMock('body');

const store = {};
let CLOCK = 0;
const sandbox = { console, setTimeout: () => 0, clearTimeout: () => {}, document: docMock, confirm: () => true,
  setInterval: () => 0, clearInterval: () => {}, performance: { now: () => CLOCK },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0.0.0 Mobile Safari/537.36' },
  location: { protocol: 'https:' }, Date };
sandbox.window = sandbox; sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.window.matchMedia = () => ({ matches: false });
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: EXT });

const { acceptMeta, humanSize, buildSummary, CASES, ACCEPT_LIVE, ACCEPT_NO_MEDIA, ACCEPT_NO_SVG, ACCEPT_NO_TS,
        slot, save, OBS, OBS_FLAT,
        FSA_OBS, fsaSupported, fsaEnv, syncOut, hasAnyRecord, restoredNote,
        timingStart, timingMark, timingBack, timingEnd, timingText, timingPlain, fmtMs } = sandbox;
const outAtLoad = byId('out').value;

lines.push('\n[2] 内嵌「现状」accept 哨兵（任何误改都会在这里暴露）');
ok(typeof ACCEPT_LIVE === 'string', 'ACCEPT_LIVE 已定义');
ok(ACCEPT_LIVE.length === 796, '长度 796 字符', ACCEPT_LIVE && ACCEPT_LIVE.length);
ok(acceptMeta(ACCEPT_LIVE).items === 140, '条目数 140', acceptMeta(ACCEPT_LIVE).items);
ok(acceptMeta(ACCEPT_LIVE).wildcards === 0, '零 MIME 通配（这是复现的前提）');
ok(ACCEPT_LIVE.split(',')[0] === '.txt' && ACCEPT_LIVE.split(',').slice(-1)[0] === '.ics', '首尾项正确');

lines.push('\n[3] 用例表');
ok(CASES.length === 9, '9 个用例', CASES && CASES.length);
ok(new Set(CASES.map(c => c.id)).size === CASES.length, 'id 唯一');
ok(CASES.filter(c => c.accept == null).length === 1, '恰好一例不写 accept');
ok(acceptMeta(CASES.find(c => c.id === 'star').accept).wildcards === 1, '*/* 记 1 个通配');
const mix = CASES.find(c => c.id === 'mix');
ok(acceptMeta(mix.accept).mimes > 0 && acceptMeta(mix.accept).wildcards > 0, '候选 B 同时含 MIME 与扩展名');

lines.push('\n[3b] 关键对照例：现状只减去 .svg 与 .ts（2026-09-17 归因假设的隔离变量）');
ok(typeof ACCEPT_NO_MEDIA === 'string' && ACCEPT_NO_MEDIA.length > 0, 'ACCEPT_NO_MEDIA 已定义');
ok(ACCEPT_NO_MEDIA.split(',').length === 138, '剩余 138 项', ACCEPT_NO_MEDIA.split(',').length);
ok(ACCEPT_NO_MEDIA.length === 787, '长度 787 字符（796 减掉 9）', ACCEPT_NO_MEDIA.length);
const nomedTokens = ACCEPT_NO_MEDIA.split(',');
ok(nomedTokens.indexOf('.svg') < 0, '已去掉 .svg');
ok(nomedTokens.indexOf('.ts') < 0, '已去掉 .ts（按项比对：.ts 是 .tsx 的子串，不能用 indexOf 判）');
ok(nomedTokens.indexOf('.tsx') >= 0, '未误伤 .tsx');
ok(acceptMeta(ACCEPT_NO_MEDIA).wildcards === 0, '仍零 MIME 通配（只动这两个变量）');
const liveSet = new Set(ACCEPT_LIVE.split(','));
const nomedSet = new Set(ACCEPT_NO_MEDIA.split(','));
ok([...liveSet].filter(x => !nomedSet.has(x)).join(',') === '.ts,.svg',
   '与现状的差集恰好是 .ts 与 .svg 两项', [...liveSet].filter(x => !nomedSet.has(x)).join(','));
ok([...nomedSet].every(x => liveSet.has(x)), '没有引入任何新项');
ok(CASES.find(c => c.id === 'nomed') && CASES.find(c => c.id === 'nomed').accept === ACCEPT_NO_MEDIA,
   '用例表里挂的就是这个常量');
['.txt', '.md', '.csv', '.json', '.py', '.log'].forEach(x => ok(nomedSet.has(x), '其余文本类扩展名保留 ' + x));

lines.push('\n[3c] 单变量对照：只去 .svg / 只去 .ts');
ok(ACCEPT_NO_SVG.split(',').length === 139 && ACCEPT_NO_SVG.indexOf('.svg') < 0 &&
   ACCEPT_NO_SVG.split(',').indexOf('.ts') >= 0, '只去掉 .svg（139 项，.ts 仍在）', ACCEPT_NO_SVG.split(',').length);
ok(ACCEPT_NO_TS.split(',').length === 139 && ACCEPT_NO_TS.split(',').indexOf('.ts') < 0 &&
   ACCEPT_NO_TS.split(',').indexOf('.svg') >= 0, '只去掉 .ts（139 项，.svg 仍在）', ACCEPT_NO_TS.split(',').length);
ok(ACCEPT_NO_SVG.length === 791, '只去 .svg 长度 = 796 − 4 − 1 = 791', ACCEPT_NO_SVG.length);
ok(ACCEPT_NO_TS.length === 792, '只去 .ts 长度 = 796 − 3 − 1 = 792', ACCEPT_NO_TS.length);
ok(CASES.findIndex(c => c.id === 'nosvg') === CASES.findIndex(c => c.id === 'nots') - 1, '两个单变量用例相邻');

lines.push('\n[4] 候选 B 不能改丢关键能力');
const mixSet = new Set(mix.accept.split(','));
['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yml', '.yaml', '.toml', '.ini', '.env',
 '.srt', '.vtt', '.lrc', '.mermaid', '.puml', '.patch', '.diff'].forEach(x => ok(mixSet.has(x), '保留 ' + x));

lines.push('\n[4b] 观测项必须覆盖真机上的两层界面（2026-09-17 实测补漏的回归锁）');
ok(Array.isArray(OBS) && OBS.length === 2, '观测项分两层', OBS && OBS.length);
ok(OBS && OBS[0].group.indexOf('第一层') === 0 && OBS[1].group.indexOf('第二层') === 0, '两层标题命名正确');
const obsLabels = (OBS_FLAT || []).map(o => o.label);
['相机', '录像', '文件', '照片和视频', '没有弹窗，直接进列表'].forEach(x =>
  ok(obsLabels.indexOf(x) >= 0, '第一层可勾选项存在：' + x));
['系统文件列表', '照片/视频网格', '相册（图库）', '看不到或选不了文本文件'].forEach(x =>
  ok(obsLabels.indexOf(x) >= 0, '第二层可勾选项存在：' + x));
ok(new Set((OBS_FLAT || []).map(o => o.key)).size === (OBS_FLAT || []).length, '观测项 key 唯一');
ok((OBS_FLAT || []).every(o => o.key.indexOf('top_') === 0 || o.key.indexOf('in_') === 0), '观测项 key 带层级前缀');

lines.push('\n[5] 纯函数与汇总');
ok(humanSize(0) === '0 B' && humanSize(2048) === '2.0 KB' && humanSize(3145728) === '3.00 MB', 'humanSize 边界');
const s1 = buildSummary();
ok(s1.indexOf('IB 附件选择器 · accept 真机实测') === 0, '汇总首行为标题');
ok(s1.indexOf('Android 14') >= 0, '汇总含 UA 解析');
ok(s1.split('\n').filter(l => /^\d\) /.test(l)).length === 9, '汇总含 9 段');
ok(s1.indexOf('第一层弹窗: ') > 0 && s1.indexOf('第二层进入: ') > 0, '汇总分两层输出');

lines.push('\n[6] 隔离性与持久化');
const a = slot('live'), b = slot('mix');
a.obs.top_camera = true; a.file = 'x.md'; a.memo = '先弹相机+文件';
ok(b.obs.top_camera === undefined && !b.file && !b.memo, '改 live 不污染 mix');
ok(slot('live').obs !== slot('star').obs, '各用例 obs 为独立对象');
ok((buildSummary().match(/相机✓/g) || []).length === 1, '只有被勾选的那条带 ✓');
ok(buildSummary().indexOf('备注: 先弹相机+文件') > 0, '备注进入汇总');
save();
const persisted = store['ib_accept_probe_v1'] ? JSON.parse(store['ib_accept_probe_v1']) : null;
ok(persisted && persisted.live.file === 'x.md' && persisted.live.obs.top_camera === true, 'localStorage 结构与内容正确');
ok(persisted && persisted.live.memo === '先弹相机+文件', '备注被持久化');
ok(persisted && persisted.mix && !persisted.mix.file, '未动过的用例仍为空记录');

lines.push('\n[7] 绕开方案（showOpenFilePicker 对照节）');
ok(Array.isArray(FSA_OBS) && FSA_OBS.length === 6, 'FSA 观测项 6 条（两套词汇都覆盖）', FSA_OBS && FSA_OBS.length);
ok(new Set((FSA_OBS || []).map(o => o.key)).size === 6, 'FSA 观测项 key 唯一');
['none_layer', 'sheet_camera', 'sheet_video', 'sheet_files', 'sheet_gallery', 'broken'].forEach(k =>
  ok((FSA_OBS || []).some(o => o.key === k), 'FSA 观测项含 ' + k));
ok((FSA_OBS || []).some(o => /拍照/.test(o.label) && /相机/.test(o.label)),
   '同一项覆盖「拍照 / 相机」两种叫法（Edge 与小米自带各用一种）');
ok(/data-fsa-memo="a"/.test(html) && /data-fsa-memo="b"/.test(html), 'A / B 各有一个备注框');
ok(/getAttribute\('data-fsa-memo'\)/.test(code), '备注框有 input 处理');
ok(/if \(st\.memo\) lines\.push\('   备注: ' \+ st\.memo\)/.test(code), 'FSA 备注进汇总');
ok(typeof fsaSupported === 'function', 'fsaSupported 是函数');
ok(fsaSupported() === false, '本 mock 环境（无该 API）下判为不可用');
ok(/showOpenFilePicker/.test(fsaEnv()), '环境行提到 showOpenFilePicker');
ok(/不可用/.test(fsaEnv()), '环境行正确报"不可用"');
ok(/安全上下文/.test(fsaEnv()) && /Chrome 132/.test(fsaEnv()), '环境行含安全上下文与版本门槛提示');
ok(/fsaSupported\(\)\s*\)\s*\{\s*fsaNote/.test(code.replace(/\n/g, ' ')) ||
   /showOpenFilePicker/.test(code), 'B 按钮走了特性检测分支');
ok(/FSA_A_INPUT\.setAttribute\('accept', ACCEPT_LIVE\)/.test(code), 'A 按钮用的就是线上那份 140 项 accept（保证与现状可比）');
const s2 = buildSummary();
ok(s2.indexOf('— 绕开那一层：A vs B —') > 0, '汇总含绕开方案一节');
ok(s2.indexOf('A) input[type=file]（现状）') > 0 && s2.indexOf('B) showOpenFilePicker()') > 0, '汇总含 A / B 两行');
ok(s2.split('\n').filter(l => /^\d\) /.test(l)).length === 9, 'A)/B) 行没有污染编号用例段数（仍 9 段）');
ok(s2.indexOf('showOpenFilePicker：') > 0, '汇总含 B 的可用性判定');

lines.push('\n[8] 「清空全部记录」必须连结果文本一起清掉（2026-09-17 真机反馈的回归锁）');
const taVal = () => byId('out').value;
ok(typeof syncOut === 'function' && typeof hasAnyRecord === 'function', 'syncOut / hasAnyRecord 已导出');
ok(outAtLoad.length < 200, '首次打开（无记录）结果区不是整张骨架（长度 < 200）', outAtLoad.length);
ok(outAtLoad.indexOf('1) 现状') < 0, '首次打开不渲染用例标题');
ok(outAtLoad.indexOf('暂无记录') >= 0, '首次打开给出「暂无记录」提示');
ok(restoredNote().indexOf('清空全部记录') > 0, '有记录时会提示「记录被记住了」');

const seed = slot('live'); seed.file = 'seed.md'; save(); syncOut();
ok(taVal().indexOf('seed.md') >= 0, '有记录后结果区出现文件名');
ok(taVal().indexOf('1) 现状') > 0, '有记录时渲染用例骨架');

const resetFn = handlers['#reset:click'];
ok(typeof resetFn === 'function', '拿到「清空全部记录」的 click 处理函数');
resetFn();
ok(taVal().indexOf('seed.md') < 0, '清空后结果文本里没有旧记录');
ok(taVal().indexOf('1) 现状') < 0, '清空后不再渲染用例骨架');
ok(taVal().length < 200, '清空后结果区确实变空（长度 < 200）', taVal().length);
ok(taVal().indexOf('已清空') >= 0, '清空后给出「已清空」提示');
ok(hasAnyRecord() === false, '清空后判定为无记录');
const persisted8 = JSON.parse(store['ib_accept_probe_v1'] || '{}');
ok(Object.keys(persisted8).filter(k => k !== '__at').length === 0,
   'localStorage 里的记录已清空', Object.keys(persisted8).join(','));
ok(restoredNote() === '', '清空后不再提示「记录被记住了」');

const again = slot('mime'); again.file = 'again.md'; save(); syncOut();
ok(taVal().indexOf('again.md') >= 0, '清空后仍能记新结果');
ok(taVal().indexOf('1) 现状') > 0, '记新结果后骨架恢复');

lines.push('\n[8b] 「照抄第一层原文」字段（2026-09-17 用户反馈：归类勾选会被混淆）');
ok(/data-layer1="/.test(html), '每例都有照抄输入框');
ok(/getAttribute\('data-layer1'\)/.test(code), '照抄框有 input 处理');
const l1 = slot('narrow'); l1.layer1 = '相机 ｜ 文件';
ok(hasAnyRecord() === true, '只填「照抄」也算有记录');
save(); syncOut();
ok(buildSummary().indexOf('第一层原文: 相机 ｜ 文件') > 0, '照抄内容进汇总');
ok(buildSummary().split('\n').filter(l => /^\d\) /.test(l)).length === 9, '照抄行没有污染编号段数（仍 9 段）');

lines.push('\n[8c] 「没有弹窗，直接进列表」必须让第二层自动失效（2026-09-17 用户指出的重复）');
ok(typeof sandbox.applyDirect === 'function', 'applyDirect 已导出');
const dc = slot('mix');
dc.obs.top_direct = true; dc.obs.in_filelist = true; dc.obs.in_notext = true;
sandbox.applyDirect('mix');
ok(!dc.obs.in_filelist && !dc.obs.in_notext, '勾了「没有弹窗」后第二层勾选被清掉');
ok(dc.obs.top_direct === true, '第一层的这一项本身保留');
const dcSum = buildSummary();
ok(dcSum.indexOf('第二层进入: 不适用（没有弹窗，直接进列表）') > 0, '汇总里第二层写成「不适用」');
ok(dcSum.indexOf('1) 现状') > 0 && dcSum.split('\n').filter(l => /^\d\) /.test(l)).length === 9, '不适用行不污染编号段数');
dc.obs.top_direct = false;
sandbox.applyDirect('mix');
const dcSum2 = buildSummary();
ok(dcSum2.indexOf('第二层进入: 不适用') < 0, '取消勾选后第二层恢复正常输出');
ok(/id="obsg-' \+ c\.id \+ '-' \+ gi/.test(code), '第二层标题带可定位 id（供联动改字）');
ok(/gi === 1 && !!st\.obs\.top_direct/.test(code), '渲染时按「没有弹窗」决定是否置灰');

lines.push('\n[8d] 「列表里能看到哪几个测试文件」必须是勾选（2026-09-17：备注写法读不准）');
const OBSF = sandbox.OBS_FILES;
ok(Array.isArray(OBSF) && OBSF.length === 5, '5 个测试文件观测项', OBSF && OBSF.length);
ok(new Set((OBSF || []).map(o => o.key)).size === 5, 'key 唯一');
ok((OBSF || []).every(o => /^f_/.test(o.key)), 'key 带 f_ 前缀');
['probe.md', 'probe.mermaid', 'probe.puml', 'probe.ts', 'probe.svg'].forEach(f =>
  ok((OBSF || []).some(o => o.label === f), '观测项与下载文件名一致：' + f));
ok(/OBS_FILES_TITLE/.test(code) && /obsg-' \+ c\.id \+ '-2/.test(code), '渲染了第三组并带可定位 id');
ok(/OBS_FILES_TITLE = '[^']*「下载」[^']*别用「最近」/.test(code), '该组标题写明必须翻「下载」文件夹看（2026-09-17 假阴性教训）');
const fs1 = slot('live');
fs1.obs.f_md = true; fs1.obs.f_mermaid = false;
save(); syncOut();
const fsSum = buildSummary();
ok(fsSum.indexOf('可见文件: ') > 0, '汇总含「可见文件」行');
ok(fsSum.indexOf('probe.md✓') > 0 && fsSum.indexOf('probe.mermaid✗') > 0, '勾选状态进入汇总');
ok(fsSum.split('\n').filter(l => /^\d\) /.test(l)).length === 9, '可见文件行不污染编号段数（仍 9 段）');

lines.push('\n[9] 弹窗耗时测量（2026-09-17 用户要求加：Edge 与自带浏览器差很多）');
ok(typeof fmtMs === 'function', 'fmtMs 已导出');
ok(fmtMs(240) === '240ms' && fmtMs(1200) === '1.20s', 'fmtMs 单位切换正确', fmtMs(1200));

CLOCK = 0;
timingStart('star');
CLOCK = 1200; timingMark('页面转后台');
CLOCK = 5000; timingBack('页面回前台');
CLOCK = 5100; timingEnd('star', 'change');
const t1 = sandbox.state.star.timing;
ok(t1 && t1.appear === 1200, '点→弹窗 = 1200ms', t1 && t1.appear);
ok(t1 && t1.dwell === 3800, '弹窗内 = 3800ms', t1 && t1.dwell);
ok(t1 && t1.back2cb === 100, '回来→回调 = 100ms', t1 && t1.back2cb);
ok(t1 && t1.total === 5100, '总计 = 5100ms', t1 && t1.total);
ok(t1 && t1.src === '页面转后台', '记录了判定来源', t1 && t1.src);
ok(t1 && t1.how === 'change', '记录了收尾方式');
ok(timingText('star').indexOf('1.20s') > 0 && timingText('star').indexOf('5.10s') > 0, '文案含关键耗时');
ok(timingPlain('star').indexOf('点→弹窗 1.20s') >= 0, '汇总简写含 点→弹窗');

CLOCK = 20000;
timingStart('narrow');
CLOCK = 20300; timingEnd('narrow', 'cancel');
const t2 = sandbox.state.narrow.timing;
ok(t2 && t2.appear === null, '未判定到弹窗时刻时 appear 为 null', t2 && t2.appear);
ok(t2 && t2.total === 300, '取消也记总耗时', t2 && t2.total);
ok(timingText('narrow').indexOf('未测到') > 0, '文案如实标注「未测到」');
ok(timingText('narrow').indexOf('取消') > 0, '取消被标注出来');
ok(timingPlain('narrow').indexOf('弹窗时刻未测到') > 0, '汇总简写也如实标注');

CLOCK = 30000;
timingEnd('mix', 'change');
ok(!sandbox.state.mix.timing, '没计时就不会凭空写一条耗时');

CLOCK = 40000;
timingStart('live');
CLOCK = 40100; timingStart('live');
CLOCK = 40300; timingMark('窗口失焦');
CLOCK = 40700; timingEnd('live', 'change');
const t3 = sandbox.state.live.timing;
ok(t3 && t3.appear === 200, '重复点击以最后一次计时为准', t3 && t3.appear);
ok(t3 && t3.total === 600, '总耗时从最后一次点击算', t3 && t3.total);
ok(timingText('live').indexOf('窗口失焦') > 0, '来源可显示为窗口失焦');

const s9 = buildSummary();
ok(s9.indexOf('耗时: ') > 0, '汇总含「耗时:」行');
ok(s9.indexOf('点→弹窗 1.20s') > 0, '汇总里能看到具体耗时');
ok(s9.split('\n').filter(l => /^\d\) /.test(l)).length === 9, '耗时行没有污染编号段数（仍 9 段）');

try { fs.unlinkSync(EXT); } catch (e) {}

lines.push('\n==============================');
lines.push('通过 ' + pass + ' / 失败 ' + fail);
lines.push('==============================');
console.log(lines.join('\n'));
process.exit(fail ? 1 : 0);
