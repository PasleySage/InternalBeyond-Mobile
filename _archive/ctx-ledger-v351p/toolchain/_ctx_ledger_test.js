/* ═══════════════════════════════════════════════════════════════════
   IB-ctx-ledger 桩测（Phase 3＋D17）
   对象：out/IB-ctx-ledger-功能版.html 内 <script id="ib-ctx-ledger"> 模块
   跑法：node _ctx_ledger_test.js   （exit 0＝全过；argv 可换双版本路径）
   分组：A 快照形状｜B head 不存（D17 作者约定③）｜C 组映射/headShow｜D 三态渲染｜E 报告结构｜
        F 面板行表格｜G registry｜H wrap 测量｜I 空态 A/B｜J 缺通道降级｜
        K 同步入口守卫｜L 群聊/主动开口两层（D17 patch31）
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const vm = require('vm');
const P = process.argv[2] || 'D:/InternalBeyond/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-功能版-v351p.html';
const PNET = process.argv[3] || 'D:/InternalBeyond/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-净版-v351p.html';
const html = fs.readFileSync(P, 'utf8');
const m = html.match(/<script id="ib-ctx-ledger">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL 模块未找到'); process.exit(1); }
/* 净版（PR 载体）：必须先跑 node patch/_make_net.js 生成；缺失即失败（顺带守住流水线顺序） */
let netHtml = null;
try { netHtml = fs.readFileSync(PNET, 'utf8'); }
catch (e) { console.error('FAIL 净版不存在（' + PNET + '）——先跑 node patch/_make_net.js'); process.exit(1); }
const mNet = netHtml.match(/<script id="ib-ctx-ledger">([\s\S]*?)<\/script>/);
if (!mNet) { console.error('FAIL 净版模块未找到'); process.exit(1); }

let pass = 0, fail = 0;
const fails = [];
function ck(name, ok) { if (ok) { pass++; } else { fail++; fails.push(name); } }

/* ── mock 工厂（每次全新隔离）── */
function makeM() {
  const store = { apiSettings: {}, chatMessages: {} };
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  sandbox.window = {
    dbGet: async (s, k) => (store[s] ? store[s][k] : undefined),
    dbGetAll: async (s) => Object.values(store[s] || {}),
    dbPut: async (s, v) => { store[s] = store[s] || {}; store[s][v.id] = v; },
    _dbLastAnyByFriend: async (fid) => (store.chatMessages[fid + '_m1'] || null),
    _blogTokenEstM: t => Array.from(String(t)).length,
    _tkFmtN: n => { n = n || 0; if (n < 1000) return String(Math.round(n)); if (n < 1e6) return (n / 1000).toFixed(1) + 'k'; return (n / 1e6).toFixed(2) + 'M'; } /* patch21：模块改调上游 _tkFmtN，mock 同步提供 */
  };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox);
  return { M: sandbox.window._ctxLedgerM, store, win: sandbox.window };
}
const flush = () => new Promise(r => setTimeout(r, 80));
const blk = (id, len, tok) => ({ id: id, len: len, tok: tok }); /* D17：作者约定③——块形状 {id,len,tok}，无 head */
function mkSnap(o) {
  o = o || {};
  return Object.assign({
    at: Date.now(), who: '测试TA', path: 'dm', cfgId: 'c1', threadId: '', quiet: false,
    total: 12847, cr: 0, cw: 0, totalChars: 0, totalTok: 0,
    sys1: { len: 0, tok: 0, blocks: [] }, sys2: { len: 0, tok: 0, blocks: [] },
    hist: { len: 0, tok: 0, n: 0, u: 0, a: 0, img: 0, summary: null, missed: 0 },
    tails: { len: 0, tok: 0, blocks: [] }
  }, o);
}
/* 标准一轮快照（供报告/面板测试） */
function stdSnap() {
  return mkSnap({
    totalChars: 13000, totalTok: 12500,
    sys1: { len: 11500, tok: 11000, blocks: [blk('dm.sys.persona', 300, 290), blk('dm.sys.tools', 0, 0), blk('dm.sys.protocols', 10900, 10460), blk('dm.sys.am_instr', 300, 290)] },
    sys2: { len: 400, tok: 390, blocks: [blk('dm.sys2.amcore', 0, 0), blk('dm.sys2.chap', 400, 390)] },
    hist: { len: 900, tok: 860, n: 3, u: 2, a: 1, img: 2, summary: null, missed: 0 },
    tails: { len: 200, tok: 190, blocks: [blk('dm.tail.time', 40, 40), blk('dm.tail.cal', 160, 150)] }
  });
}

(async function () {

/* ═══ A. 快照形状（票05 Q1 四段＋cr/cw）═══ */
{
  const { M } = makeM();
  const T = M.begin();
  T.add('dm.sys.persona', '你是TA');            // 3 字
  T.add('dm.sys.tools', '');                     // 空串也记 0
  T.addHist('user: 你好\n\nassistant: 你好呀', 2, 1, 1, 0);
  T.addSummary('这是摘要');
  T.add('dm.sys2.amcore', '档案内容');
  T.add('dm.tail.time', '当前时间：x');
  T.seg('sys1段', 'sys2段');
  T.wrap(76);
  const s = T.snapshot({ who: 'TA', quiet: false });
  ck('A1 顶层字段含 cr/cw', 'cr' in s && 'cw' in s && s.total === 0 && s.cr === 0 && s.cw === 0);
  ck('A2 四段结构', s.sys1 && s.sys2 && s.hist && s.tails && Array.isArray(s.sys1.blocks));
  ck('A3 空串记 {id,0}', s.sys1.blocks.find(b => b.id === 'dm.sys.tools').len === 0);
  ck('A4 hist 段计数', s.hist.n === 2 && s.hist.u === 1 && s.hist.a === 1);
  ck('A5 summary 单列', s.hist.summary && s.hist.summary.len === 4);
  ck('A6 块形状 {id,len,tok}（D17 起无 head 字段）', (b => b.id && b.len === 4 && b.head === undefined)(s.sys1.blocks[0]));
  const _T7 = M.begin(); _T7.add('dm.sys.persona', 'x');
  ck('A7 snapshot 后句柄即弃（每轮独立状态，下轮互不干扰）', _T7.snapshot({}).sys1.blocks.length === 1);
  s.total = 100; s.cr = 50; s.cw = 10; // 回填模拟
  ck('A8 回填字段可写', s.total === 100 && s.cr === 50);
  // A9 滚动摘要只计一次（patch24 修 MAJOR：snapshot 折叠＋agg 再计双计）——窗口 400＋摘要 60，组级 460 非 520
  {
    const { M: M9 } = makeM();
    const T9 = M9.begin();
    T9.addHist('窗'.repeat(400), 1, 1, 0, 0);
    T9.addSummary('摘'.repeat(60));
    const s9 = T9.snapshot({});
    ck('A9 滚动摘要只计一次（快照 460、组级 460）', s9.hist.len === 460 && M9.agg(s9).hist.len === 460 && s9.hist.summary.len === 60);
  }
  // A10 并发轮次句柄隔离（patch24 修 CRITICAL：跨会话并发不串话）——两个句柄交错 add
  // D17：head 不再存储，串话判据从「JSON 含文本」改为「块数＋各块 len」（A/B 数据取不同长度以区分）
  {
    const { M: M10 } = makeM();
    const TA = M10.begin(), TB = M10.begin();
    TA.add('dm.sys.persona', 'A的人设AAAA'); TB.add('dm.sys.persona', 'B');
    TA.add('dm.tail.time', 'A的时间AAAA'); TB.add('dm.tail.time', 'B的时间');
    const sA = TA.snapshot({ who: 'A' }), sB = TB.snapshot({ who: 'B' });
    ck('A10 并发轮次不串话（交错 add 互不污染、快照不丢）', sA.who === 'A' && sB.who === 'B' && sA.sys1.blocks.length === 1 && sA.tails.blocks.length === 1 && sB.sys1.blocks.length === 1 && sB.tails.blocks.length === 1 && sA.sys1.blocks[0].len === 'A的人设AAAA'.length && sB.sys1.blocks[0].len === 1 && sA.tails.blocks[0].len === 'A的时间AAAA'.length && sB.tails.blocks[0].len === 'B的时间'.length);
  }
}

/* ═══ B. head 不存（D17 作者移植约定③：快照只存 id/len/tok；渲染层零泄漏不变）═══ */
{
  const { M } = makeM();
  const T = M.begin(); T.add('dm.sys.persona', '私密约定内容'.repeat(30));
  const s = T.snapshot({});
  ck('B1 块不存 head 预览（约定③）', s.sys1.blocks[0].head === undefined);
  const _T2 = M.begin(); _T2.add('dm.sys2.amcore', '档案正文'.repeat(40));
  ck('B2 所有块一律不存 head（无按块开关、无「采而不渲」）', _T2.snapshot({}).sys2.blocks[0].head === undefined);
  const rep = M.reportM([stdSnap()]);
  ck('B3 渲染层零块 head 泄漏', !/dm\.sys\.|dm\.tail\.|dm\.hist\./.test(rep));
  const _T4 = M.begin(); _T4.addSummary('摘要正文'.repeat(30));
  ck('B4 摘要同样不存 head', _T4.snapshot({}).hist.summary.head === undefined && _T4.snapshot({}).hist.summary.len === 120);
}

/* ═══ C. 组映射 / headShow 与票面一致 ═══ */
{
  const { M } = makeM();
  ck('C1 GROUP_M 62 块全覆盖（24 dm＋22 grp＋16 hb）', Object.keys(M.GROUP_M).length === 62);
  ck('C2 六组固定语义序', M.GROUPS.map(g => g[0]).join(',') === 'persona,rules,hist,memory,dynamic,other');
  ck('C3 headShow 与票02 §10 一致', M.HEADSHOW['dm.sys.persona'] === 1 && M.HEADSHOW['dm.hist.summary'] === 1 && M.HEADSHOW['dm.sys2.amcore'] === undefined && M.HEADSHOW['dm.tail.cal'] === undefined);
  ck('C4 ZERO_NOTABLE＝{tools,amcore}', Object.keys(M.ZERO_NOTABLE).sort().join(',') === 'dm.sys.tools,dm.sys2.amcore');
}

/* ═══ D. 三态渲染（票01 §8＋票06 修订块）═══ */
{
  const { M } = makeM();
  const base = stdSnap();
  const rep0 = M.reportM([base]);
  ck('D1 「其他」恒空不进为0注记', !rep0.includes('为 0 的组：') || !rep0.split('（为 0 的组')[1].split('）')[0].includes('其他'));
  // D2 notable 组为 0 → 进注记
  const sNoMem = JSON.parse(JSON.stringify(base));
  sNoMem.sys2.blocks = sNoMem.sys2.blocks.filter(b => b.id !== 'dm.sys2.chap');
  const rep2 = M.reportM([sNoMem]);
  ck('D2 memory 组为 0（amcore 无 always）→ 显式 0 进注记', rep2.includes('（为 0 的组：记忆与档案）'));
  // D3 组非零时 tools=0 → 尾注
  ck('D3 组非零时 tools=0 → 组行尾注（patch17：拼接处空格归一）', /功能与规则：[\d,]+ \/ [\d,]+ \(\d+%\) · 工具 0/.test(rep0));
  // D4 quiet 轮 tools 豁免
  const sQuiet = JSON.parse(JSON.stringify(base)); sQuiet.quiet = true;
  ck('D4 quiet 轮 tools=0 不尾注', !/· 工具 0/.test(M.reportM([sQuiet])));
  // D5 quiet 轮 rules 组为 0 不进注记
  const sQuiet0 = JSON.parse(JSON.stringify(base)); sQuiet0.quiet = true;
  sQuiet0.sys1.blocks = []; sQuiet0.sys2.blocks = [];
  ck('D5 quiet 轮 rules 组 0 不进注记', !M.reportM([sQuiet0]).includes('（为 0 的组：功能与规则）'));
  // D6 missed → 尾注
  const sMiss = JSON.parse(JSON.stringify(base));
  sMiss.tails.blocks.push({ id: 'dm.tail.beyond', missed: 1 });
  ck('D6 missed:1 → 组行尾注「本轮未计入」', /动态资料：[\d,]+ \/ [\d,]+ \(\d+%\) · 本轮未计入/.test(M.reportM([sMiss])));
}

/* ═══ E. 报告 markdown 结构（票06 锁稿＋修订块）═══ */
{
  const { M } = makeM();
  const rep = M.reportM([stdSnap(), mkSnap(stdSnap())]);
  ck('E1 轮头 ## 精简格式（R3 排版：总 i+cr+cw＋半角(缓存 cr)，删总字数）', /## \d{2}:\d{2} · 测试TA · 总 12\.8k \(缓存 0\) · 最大：/.test(rep) && !/· 约 [\d,]+ 字 ·/.test(rep));
  // E1b 全量公式锁定（B 裁决策1）：stdSnap 的 cr=cw=0，甲/B 两公式都输出 12.8k——无此例则公式回归根本测不出
  const sC = stdSnap(); sC.cr = 11000; sC.cw = 2000;
  ck('E1b 轮头总=i+cr+cw 全量（12847+11000+2000→25.8k；括号缓存 11.0k）', /## \d{2}:\d{2} · 测试TA · 总 25\.8k \(缓存 11\.0k\) · 最大：/.test(M.reportM([sC])));
  ck('E2 轮间 --- 分隔', rep.includes('\n---\n'));
  ck('E3 非零组行固定语义序（组行锚带「- 」前缀防轮头「最大」干扰；注记行在组行后＝锁稿格式）', rep.indexOf('- 人设与资料：') < rep.indexOf('- 功能与规则：') && rep.indexOf('- 功能与规则：') < rep.indexOf('- 前序历史：') && rep.indexOf('- 前序历史：') < rep.indexOf('- 动态资料：') && rep.indexOf('- 动态资料：') < rep.indexOf('（为 0 的组：记忆与档案）'));
  ck('E4 hist 组行极简＋尾巴（R3 排版：字数 / tok (占比%) · N条 · N图）', /前序历史：[\d,]+ \/ [\d,]+ \(\d+%\) · 3条/.test(rep) && rep.includes('· 2图'));
  ck('E5 怎么看/数据怎么看/想省点 三段在（patch25 文案重构：组名含义六行＋新副标）', rep.includes('怎么看') && rep.includes('组名含义（六组按固定语义排序，没写完的均以“等”指代）：') && rep.includes('数据怎么看：') && rep.includes('想省点上下文，可以这么调：') && rep.includes('- 前序历史：之前发过的原话、滚动摘要、封存的前情提要等。') && rep.includes('- 人设与资料：TA 是谁、你是谁、System Prompt 等。'));
  const gs = M.agg(stdSnap());
  let gt = 0;
  for (const k in gs) gt += gs[k].len;          // 先全集
  let sum = 0;
  for (const k in gs) if (gs[k].len > 0) sum += Math.round(gs[k].len / gt * 100);
  ck('E6 非零组占比合计≈100（±2）', gt === 13000 && Math.abs(sum - 100) <= 2);
  ck('E7 格式说明行＋轮间空行分隔（R3 排版重构）', rep.includes('（列表格式：字数 / tok数 (占比%)）') && /\n\n---\n\n/.test(rep));
}

/* ═══ F. 面板行 / 展开表格（票07）═══ */
{
  const { M } = makeM();
  const s = stdSnap();
  const row = M.rowHtml(s);
  ck('F1 折叠行文案＝N 组·占比最高组（B 裁：不显体积，结构交代）', /<b>4 组 · 占比最高 功能与规则<\/b>/.test(row) && row.includes('›') && !/实测/.test(row));
  // F1b 全零组边界（B 裁决策3）：不出「占比最高 」空悬子句
  const row0 = M.rowHtml(mkSnap());
  ck('F1b 全零组只显「N 组」（无「占比最高」子句、无空悬）', /<b>0 组<\/b>/.test(row0) && !row0.includes('占比最高'));
  const tb = M.tableHtml(s);
  ck('F2 表格 4 列（列头去「(约)」：字/tok；约/估算下沉表下注记，R3 需求1）', tb.includes('<th>组</th>') && tb.includes('<th>字</th>') && tb.includes('<th>tok</th>') && tb.includes('<th>占比(%)</th>'));
  const tds = (tb.match(/<td>[^<]*<\/td>/g) || []).join('');
  ck('F2b 表格 td 无「约」无「%」（量纲下沉注记后单元格仍只放数，R3 需求1）', !/约|%/.test(tds));
  ck('F2c 表格布局定稿 CSS（patch23：display:table!important 破块盒化＋26/28/26/20＋数字列 nowrap 无省略号）', html.includes('.ctx-expand table{width:100%!important;table-layout:fixed!important;display:table!important;margin:0!important;font-size:0.8em!important}') && html.includes('.ctx-expand table th,.ctx-expand table td{text-align:center!important;box-sizing:border-box!important;padding:5px 3px}') && html.includes('.ctx-expand table th:nth-child(1),.ctx-expand table td:nth-child(1){width:26%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}') && html.includes('.ctx-expand table th:nth-child(2),.ctx-expand table td:nth-child(2){width:28%}') && html.includes('.ctx-expand table th:nth-child(3),.ctx-expand table td:nth-child(3){width:26%}') && html.includes('.ctx-expand table th:nth-child(4),.ctx-expand table td:nth-child(4){width:20%}') && html.includes('.ctx-expand table td:nth-child(2),.ctx-expand table td:nth-child(3),.ctx-expand table td:nth-child(4){white-space:nowrap!important}') && !/td:nth-child\(2\),\.ctx-expand table td:nth-child\(3\),\.ctx-expand table td:nth-child\(4\)\{white-space:nowrap;overflow:hidden/.test(html));
  ck('F2d 折叠行字号与 mi-row 一致 0.8rem（R2 线1）', html.includes('cursor:pointer;align-items:center;font-size:0.8rem}'));
  ck('F2e 折叠行数值靠右紧挨箭头（R3 需求3：margin-left:auto）', html.includes('.ctx-row b{color:var(--tx);font-weight:500;text-align:right;word-break:break-all;margin-left:auto}'));
  ck('F2f 占比单元格多行居中（R3 需求2：占比/条数分两行、class ctx-pct）', /<td class="ctx-pct">10<br>3 条<\/td>/.test(tb) && html.includes('.ctx-expand table td.ctx-pct{text-align:center;line-height:1.45}'));
  ck('F2g 尾注 span 包裹可折行（patch24：防 20% 列溢出，数字仍 nowrap 单行）', /<td class="ctx-pct">86<br><span class="ctx-znote">· 工具 0<\/span><\/td>/.test(tb) && html.includes('.ctx-expand table td .ctx-znote{white-space:normal}'));
  ck('F3 表格不含 head', !tb.includes('你是'));
  ck('F4 注记含估算说明（R3 需求1）＋敏感块＋想省', tb.includes('字/tok 均为约估算值。其中字数为包含标点符号的字符总数；tok因本地无法获取模型的真实分词库') && tb.includes('记忆、日历、Beyond、信箱里的具体内容去对应页面看') && tb.includes('下一轮想省，可调小上下文条数'));
  ck('F5 表格默认折叠（ctx-expand 无 open class）', /class="ctx-expand" id="mi-ctx-expand"/.test(tb));
}

/* ═══ G. registry（并发串行／cap 500／取尾 N／跳坏消息）═══ */
{
  const { M, store } = makeM();
  store.chatMessages.m1 = { id: 'm1', ctxSnap: mkSnap({ at: 1, who: 'A', totalChars: 10 }) };
  store.chatMessages.m2 = { id: 'm2', ctxSnap: mkSnap({ at: 2, who: 'B', totalChars: 20 }) };
  store.chatMessages.m3 = { id: 'm3' }; // 无快照
  M.noteSave('m1'); M.noteSave('m2'); M.noteSave('m3');
  await flush();
  const rl = await M.readLast(6);
  ck('G1 并发 noteSave 串行不丢', rl.length === 2 && rl[0].who === 'A' && rl[1].who === 'B');
  store.apiSettings.ibCtxLedger = { id: 'ibCtxLedger', ids: [] };
  for (let i = 0; i < 503; i++) store.apiSettings.ibCtxLedger.ids.push('x' + i);
  for (let i = 0; i < 503; i++) store.chatMessages['x' + i] = { id: 'x' + i, ctxSnap: mkSnap({}) };
  store.chatMessages.new1 = { id: 'new1', ctxSnap: mkSnap({}) };
  M.noteSave('new1');
  await flush();
  const ids = store.apiSettings.ibCtxLedger.ids;
  ck('G2 cap 500（504 条清最旧 4）', ids.length === 500 && ids[0] === 'x4' && ids[499] === 'new1');
  ck('G3 清最旧＝delete ctxSnap 不删消息', !store.chatMessages.x0.ctxSnap && !!store.chatMessages.x0.id && !!store.chatMessages.x4.ctxSnap);
  await flush(); // 等 cap 清理链跑完再进下一场景
  ck('G4 读时取最近 N（N=6 常量）', M.N_TURNS === 6);
  const { M: M3, store: st3 } = makeM();  // 独立实例隔离残留异步
  st3.apiSettings.ibCtxLedger = { id: 'ibCtxLedger', ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  st3.chatMessages.f = { id: 'f', ctxSnap: mkSnap({ at: 6, who: 'f' }) };
  st3.chatMessages.g = { id: 'g', ctxSnap: mkSnap({ at: 7, who: 'g' }) };
  st3.chatMessages.h = { id: 'h', ctxSnap: mkSnap({ at: 8, who: 'h' }) };
  const rl2 = await M3.readLast(6);
  ck('G5 readLast 只取尾 6 中有快照的（a–e 无消息跳过→3 份）', rl2.length === 3 && rl2[2].who === 'h');
}

/* ═══ H. wrap 测量（原 76 无条件 bug 回归）═══ */
{
  const { M } = makeM();
  const T1 = M.begin(); T1.add('dm.tail.time', '当前时间：x'); T1.seg('a', 'b'); T1.wrap(76);
  ck('H1 wrap(76) 计入 tails.len/totalChars', T1.snapshot({}).tails.len === 6 + 76);
  const T2 = M.begin(); T2.add('dm.tail.time', 'x'); T2.seg('a', 'b'); T2.wrap(0);
  const s2 = T2.snapshot({});
  ck('H2 wrap(0) 不扣（旧代码会 +76＝隐性 bug）', s2.tails.len === 1 && s2.totalChars === 3);
  const T3 = M.begin(); T3.add('dm.tail.time', 'x'); T3.seg('a', 'b');
  ck('H3 不调 wrap 默认 0', T3.snapshot({}).tails.len === 1);
  ck('H4 WRAP_OVERHEAD=76 保留为桩测基准', M.WRAP_OVERHEAD === 76);
  ck('H5 埋点三元形式存在（不依赖 if 内才测）', html.includes('_ctxT.wrap((tails.length&&hist.length)?(_IB_TAIL_HEAD.length+_IB_TAIL_USER.length):0)'));
}

/* ═══ I. 空态 A/B（票06 Q4；收进模块可桩测）═══ */
{
  const { M, store } = makeM();
  ck('I1 无配置无消息 → A', (await M.emptyText()) === M.EMPTY_A);
  store.apiConfigs = { c1: { id: 'c1' } };
  ck('I2 有配置无消息 → A', (await M.emptyText()) === M.EMPTY_A);
  store.chatMessages['c1_m1'] = { id: 'c1_m1', role: 'assistant' };
  ck('I3 有配置有 AI 消息 → B', (await M.emptyText()) === M.EMPTY_B);
  store.chatMessages['c1_m1'] = { id: 'c1_m1', role: 'user' };
  ck('I4 最后一条是 user → A（语义仍成立）', (await M.emptyText()) === M.EMPTY_A);
  const { M: M2, win } = makeM();
  win.dbGetAll = async () => { throw new Error('db fail'); };
  ck('I5 dbGetAll 抛 → A 兜底不崩', (await M2.emptyText()) === M2.EMPTY_A);
}

/* ═══ J. 缺通道降级 ═══ */
{
  const { M, win } = makeM();
  const saved = win._blogTokenEstM; delete win._blogTokenEstM;
  const TJ = M.begin(); TJ.add('dm.sys.persona', '测试');
  const s = TJ.snapshot({});
  ck('J1 缺 _blogTokenEstM：不抛、tok 记 0', s.sys1.tok === 0);
  win._blogTokenEstM = saved;
  const { M: M2, win: win2 } = makeM();
  win2.dbGet = async () => { throw new Error('db fail'); };
  ck('J2 dbGet 抛：readLast 返回 [] 不崩', (await M2.readLast(6)).length === 0);
  const T2j = M2.begin();
  try { T2j.add('dm.tail.cal', { toString() { throw new Error('boom'); } }); ck('J3 add 异常（坏 text）记 missed 不抛', true); } catch (e) { ck('J3 add 异常（坏 text）记 missed 不抛', false); }
  T2j.add({ toString() { throw new Error('boom2'); } }, 'x'); // 坏 id：不得炸全轮
  const sm = T2j.snapshot({});
  ck('J4 missed 块入快照', !!sm && sm.tails.blocks[0].missed === 1);
  ck('J4b 坏 id 不炸全轮（snapshot 非 null；坏 id 块按设计落 tails 段）', !!sm && sm.tails.blocks.length === 2 && sm.tails.blocks[0].missed === 1);
}

/* ═══ K. 同步入口守卫（三条：静态／行为／埋点 idiom）═══ */
{
  const { M } = makeM();
  // K1 静态：模块与被改文件不赋值任何既有 window 函数（防 Heisenbug 类）
  const modSrc = m[1];
  const winAssigns = (modSrc.match(/window\.[A-Za-z_$][\w$]*\s*=/g) || []).filter(x => x.indexOf('_ctxLedgerM') < 0);
  ck('K1 模块零 window 既有函数赋值（只挂 _ctxLedgerM）', winAssigns.length === 0);
  const guarded = ['genReply', 'callAIC', 'buildHist', 'buildMemBlock', 'buildAmBlocks', 'buildPostsBlock', '_getBlogReadInjectionM', 'buildCalBlock', 'buildBeyondTail', 'buildUserCtx', '_coldBlockM', '_chapTextM', 'buildMusicTail', '_bxInboxTail'];
  const wrapped = guarded.filter(fn => html.includes('window.' + fn + ' =') || html.includes('window.' + fn + '='));
  ck('K2 功能版零 builder 包装（Heisenbug 类不可能）', wrapped.length === 0);
  // K3 行为：语义源头读到 undefined/Promise 时记 0 而非假文本（上游改异步不静默错数）
  const TK3 = M.begin(); TK3.add('dm.sys2.cold', undefined);
  ck('K3 cold 读到 undefined → 记 0 不产假文本', TK3.snapshot({}).sys2.blocks[0].len === 0);
  // K4 hist 采集先于 wrap（时序守卫）：wrap 后 hist.len 不含标记
  const TK4 = M.begin(); TK4.addHist('窗口文本', 1, 1, 0, 0); TK4.wrap(200);
  ck('K4 hist.len 不受 wrap 影响（采集在包裹前）', TK4.snapshot({}).hist.len === 4);
  // K5 埋点 idiom 存在性（形态 A/B/C＋protocols 只读）
  ck('K5a 形态C app hoist 存在', html.includes("var _ctxT_app='';try{_ctxT_app=(window._ibAppTailM"));
  ck('K5b 形态C presence hoist 存在', html.includes("var _ctxT_pr='';try{_ctxT_pr=(_presGap&&_presGap.fid===cfg.id)?(_presGap.text||''):''"));
  ck('K5c 形态C gwfeed hoist 存在', html.includes("var _ctxT_gw='';try{if(_gwFeedQ&&_gwFeedQ.length)"));
  ck('K5d beyond+bxinbox 双 temp 存在', html.includes('if(_ibx){tails.push(_ibx);_ctxT_bx=_ibx}') && html.includes('_ctxT_bd=bt||'));
  ck('K5e protocols 只读 parts（slice/filter/join 不写）', html.includes("parts.slice(_ctxP1).filter(Boolean).join('\\n\\n')") && !html.includes('_ctxP1]=') && !/parts\.splice\(_ctxP1/.test(html));
  ck('K5f 23 个 add 点全部在 if/quiet 之外（无条件）抽查 persona/time/mem', html.includes("_ctxT.add('dm.sys.persona',parts[0])") && html.includes("_ctxT.add('dm.tail.time',tails[tails.length-1])") && html.includes("_ctxT.add('dm.tail.mem',_memTailM||'')"));
  // K8 导出剔除 ctxSnap（票05 Q5 隐私裁定的回归保护，patch24 补——此前 0 断言覆盖）
  ck('K8 导出备份剔除 ctxSnap（delete 在位）', html.includes('delete v.upstreamRaw;delete v.thinkingSources;delete v.ctxSnap'));
  // K6 测试块双版本校验（patch26：PR 载体＝净版，测试块随净版下线，绝不污染上游）
  const flines = html.split('\n');
  const ti0 = flines.findIndex(l => l.includes('/* ▼▼ 测试块'));
  let inSend = false, hitClose = false;
  for (let i = ti0; i >= 0; i--) {
    if (/^\}\)\(\);\s*$/.test(flines[i])) { hitClose = true; break; }
    if (/^async function send\(q\)\{/.test(flines[i])) { inSend = true; break; }
  }
  ck('K6a 功能版：测试块在 send(q) 体内（R2 线0 回归）', ti0 >= 0 && inSend && !hitClose);
  // K6b 净版：测试块与调试指令必须缺席（patch26：PR 载体＝净版）
  ck('K6b 净版：测试块缺席（PR 载体零测试钩子）', !netHtml.includes('/* ▼▼ 测试块') && !netHtml.includes('上下文账本·示例'));
  // K6c 净版与功能版核心模块逐字节相同（差异仅在测试块）
  ck('K6c 净版模块与功能版逐字节相同（差异仅在测试块）', mNet[1] === m[1] && netHtml.length < html.length);
  // K7 helper pack IIFE 可完整执行（绑定零 ReferenceError 的行为判据）
  const hp = html.match(/<script id="ib-helper-pack">([\s\S]*?)<\/script>/);
  function makeMock(name) {
    const store = { _name: name, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } }, style: {}, value: '', textContent: '', innerHTML: '', className: '', disabled: false, children: [], hidden: false, scrollTop: 0, scrollHeight: 0 };
    const special = { querySelector: () => null, querySelectorAll: () => [], closest: () => null, addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {}, removeChild() {}, insertAdjacentHTML() {}, getAttribute: () => null, setAttribute() {}, focus() {}, click() {}, remove() {}, replaceWith() {} };
    return new Proxy(store, { get(t, k) { if (k in t) return t[k]; if (k in special) return special[k]; return makeMock(k); }, set(t, k, v) { t[k] = v; return true; } });
  }
  const docMock = makeMock('document');
  docMock.getElementById = () => makeMock('el'); docMock.querySelector = () => makeMock('el'); docMock.querySelectorAll = () => []; docMock.createElement = () => makeMock('el'); docMock.addEventListener = () => {}; docMock.body = makeMock('body'); docMock.readyState = 'complete';
  const sb7 = { console: { log() {}, warn() {}, error() {} } };
  sb7.window = sb7; sb7.document = docMock;
  sb7.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb7.setInterval = () => 0; sb7.clearInterval = () => {}; sb7.setTimeout = () => 0; sb7.requestAnimationFrame = () => {};
  sb7._ctxLedgerM = { EMPTY_A: 'A', EMPTY_B: 'B', readLast: async () => [], reportM: () => '报告', emptyText: async () => 'A' };
  vm.createContext(sb7);
  let loadOk = true;
  try { vm.runInContext(hp[1], sb7, { filename: 'helper-pack' }); } catch (e) { loadOk = false; }
  ck('K7 helper pack IIFE 完整执行（零 ReferenceError，IBHelper 挂载）', loadOk && sb7.window.IBHelper && typeof sb7.window.IBHelper.open === 'function' && typeof sb7.window.IBHelper.vis === 'function');
}

/* ═══ L. 群聊／主动开口两层（D17 patch31；规格票01 §3/§4＋draft-10 §4 分组）═══ */
{
  const { M } = makeM();
  // L1 映射
  ck('L1b 两层新块映射抽查', M.GROUP_M['grp.sys.rules'] === 'rules' && M.GROUP_M['grp.sys2.chap'] === 'hist'
    && M.GROUP_M['grp.tail.gsum'] === 'hist' && M.GROUP_M['grp.sys2.amstable'] === 'memory'
    && M.GROUP_M['grp.tail.mem'] === 'memory' && M.GROUP_M['grp.tail.time'] === 'dynamic'
    && M.GROUP_M['grp.tail.idle'] === 'dynamic' && M.GROUP_M['hb.ctx.recent'] === 'hist'
    && M.GROUP_M['hb.ctx.time'] === 'dynamic' && M.GROUP_M['hb.ctx.relation'] === 'persona'
    && M.GROUP_M['hb.sys.amstable'] === 'memory' && M.GROUP_M['hb.sys.persona_lock'] === 'persona'
    && M.GROUP_M['hb.ctx.instruction'] === 'dynamic');
  // L2 段分类（grp.sys→sys1、grp.sys2→sys2、grp.tail/hb.tail/hb.ctx→tails、hb.sys→sys1）
  {
    const T2 = M.begin();
    T2.add('grp.sys.persona', '人设'); T2.add('grp.sys.rules', '规则');
    T2.add('grp.sys2.amstable', '档案'); T2.add('grp.sys2.chap', '前情'); T2.add('grp.sys2.persona', '收束');
    T2.add('grp.tail.time', '时间'); T2.add('grp.tail.mem', '记忆');
    T2.add('hb.sys.persona', '人设2'); T2.add('hb.tail.mem', '记忆2');
    T2.add('hb.ctx.time', '时间2'); T2.add('hb.ctx.recent', '最近'); T2.add('hb.ctx.instruction', '指令');
    T2.seg('sys1段', 'sys2段');
    const s2 = T2.snapshot({ path: 'group' });
    ck('L2a grp.sys.*＋hb.sys.* 入 sys1 段', s2.sys1.blocks.length === 3 && s2.sys1.blocks.every(b => b.id.indexOf('grp.sys.') === 0 || b.id.indexOf('hb.sys.') === 0));
    ck('L2b grp.sys2.* 入 sys2 段', s2.sys2.blocks.length === 3 && s2.sys2.blocks.every(b => b.id.indexOf('grp.sys2.') === 0));
    ck('L2c grp.tail.* 入 tails 段', s2.tails.blocks.filter(b => b.id.indexOf('grp.tail.') === 0).length === 2);
    ck('L2d hb.sys.* 入 sys1 段（hb 无 _SYS_SPLIT_M、system 整段）', s2.sys1.blocks.some(b => b.id === 'hb.sys.persona'));
    ck('L2e hb.tail.*／hb.ctx.* 入 tails 段', s2.tails.blocks.filter(b => b.id.indexOf('hb.tail.') === 0).length === 1 && s2.tails.blocks.filter(b => b.id.indexOf('hb.ctx.') === 0).length === 3);
  }
  // L3 群聊一轮端到端（窗口＋摘要＋gsum＋块二）
  {
    const T3 = M.begin();
    T3.add('grp.sys.persona', '你是群成员'); T3.add('grp.sys.rules', '【群聊规则】');
    T3.add('grp.sys.sitenote', '站点'); T3.add('grp.sys.userctx', '资料');
    T3.add('grp.sys2.amstable', '档案'); T3.add('grp.sys2.chap', '前情提要'); T3.add('grp.sys2.persona', '收束');
    T3.addHist('user: 你好\n\n[成员B] 嗨', 3, 2, 1, 0); T3.addSummary('群摘要');
    T3.add('grp.tail.time', '当前时间：x'); T3.add('grp.tail.gsum', '');
    T3.add('grp.tail.mem', '想起的记忆');
    T3.seg('sys1', 'sys2'); T3.wrap(76);
    const s3 = T3.snapshot({ who: '成员A', path: 'group', quiet: false });
    const g3 = M.agg(s3);
    ck('L3a 群轮 rules 组＝群聊规则块', g3.rules.len === '【群聊规则】'.length);
    ck('L3b 群轮 hist 组＝窗口＋摘要＋gsum(空)＋前情提要（摘要只计一次）', g3.hist.len === 'user: 你好\n\n[成员B] 嗨'.length + '群摘要'.length + 0 + '前情提要'.length);
    ck('L3c 群轮 memory 组＝amstable＋mem', g3.memory.len === '档案'.length + '想起的记忆'.length);
    ck('L3d 群轮 hist 组 n＝窗口条数', g3.hist.n === 3);
    const rep3 = M.reportM([s3]);
    ck('L3e 群轮报告含成员名＋hist 条数', rep3.includes('· 成员A ·') && /前序历史：[\d,]+ \/ [\d,]+ \(\d+%\) · 3条/.test(rep3));
    ck('L3f 群轮报告零块 ID 泄漏', !/grp\./.test(rep3));
  }
  // L4 主动开口一轮端到端（ctx 块进 tails 段；rules 组 0 是路径属性）
  {
    const T4 = M.begin();
    T4.add('hb.sys.persona', '你是TA'); T4.add('hb.sys.userctx', '资料');
    T4.add('hb.sys.amstable', '档案'); T4.add('hb.sys.persona_lock', '收束');
    T4.add('hb.tail.mem', '记忆');
    T4.add('hb.ctx.time', '当前时间：x'); T4.add('hb.ctx.recent', '【最近的聊天记录】\n用户：在吗');
    T4.add('hb.ctx.instruction', '你们的对话已经安静了大约 30 分钟');
    T4.seg('你是TA\n\n资料\n\n档案\n\n收束', '');
    const s4 = T4.snapshot({ who: '深水', path: 'hb', quiet: false });
    const g4 = M.agg(s4);
    ck('L4a hb 轮 persona 组＝人设＋资料＋收束', g4.persona.len === '你是TA'.length + '资料'.length + '收束'.length);
    ck('L4b hb 轮 hist 组＝最近聊天记录', g4.hist.len === '【最近的聊天记录】\n用户：在吗'.length);
    ck('L4c hb 轮 dynamic 组＝时间＋指令行', g4.dynamic.len === '当前时间：x'.length + '你们的对话已经安静了大约 30 分钟'.length);
    ck('L4d hb 轮 rules 组 0（无工具块／协议区——路径属性，草稿§3 明载）', g4.rules.len === 0);
    ck('L4e hb 轮报告显「为 0 的组：功能与规则」', M.reportM([s4]).includes('（为 0 的组：功能与规则）'));
  }
  // L5 静态接线（功能版 HTML）
  const GUARD = "var _ctxT=(typeof _ctxLedgerM!=='undefined'&&_ctxLedgerM&&_ctxLedgerM.begin)?_ctxLedgerM.begin():{add:function(){},addHist:function(){},addSummary:function(){},seg:function(){},wrap:function(){},snapshot:function(){return null}};var _ctxSnap=null;";
  ck('L5a 入口 guard 两处（群聊成员循环＋主动开口）', html.split(GUARD).length - 1 === 2);
  ck('L5b 群聊收口 path:group', html.includes("_ctxT.snapshot({who:selfName,path:'group'"));
  ck('L5c 主动收口 path:hb', html.includes("_ctxT.snapshot({who:cfgName(cfg),path:'hb'"));
  ck('L5d 句柄透传 _hbCtxFor（opt._ctxT）', html.includes("_hbCtxFor(cfg,(String(ctx).split('【最近的聊天记录】')[1]||'').slice(0,800),{_ctxT:_ctxT});"));
  ck('L5e _hbCtxFor no-op 句柄（后台一次性调用零开销、不落账本）', html.includes("var _ctxT=(opt&&opt._ctxT)?opt._ctxT:{add:function(){},addHist:function(){},addSummary:function(){},seg:function(){},wrap:function(){},snapshot:function(){return null}};"));
  ck('L5f 数组下标测量 idiom（beyond＋bxinbox 双块）', html.includes("tails.length>_ctxGb?tails[_ctxGb]:''") && html.includes("tails.length>_ctxGb+1?tails[_ctxGb+1]:''"));
  ck('L5g 群聊 wrap 实测 idiom', html.includes('_ctxT.wrap((tails.length&&messages.length)?'));
  ck('L5h 写入点挂载：am×3（群正常/群中止/主动连发）／am9×1／_am9×1', html.split('if(_ctxSnap)am.ctxSnap=_ctxSnap;').length - 1 === 3 && html.split('if(_ctxSnap)am9.ctxSnap=_ctxSnap;').length - 1 === 1 && html.split('if(_ctxSnap)_am9.ctxSnap=_ctxSnap;').length - 1 === 1);
  ck('L5i usage 回填：群＋主动 Number(r.u.*) 各一、1对1 _ru 不动', html.split('_ctxSnap.total=Number(r.u.i)||0').length - 1 === 2 && html.split('_ctxSnap.total=Number(_ru&&_ru.i)||0').length - 1 === 1);
  ck('L5j 无 UI 提案：零新 CSS 类（ctx-grp／ctx-hb 不存在）', !html.includes('ctx-grp') && !html.includes('ctx-hb'));
  ck('L5k ZERO_NOTABLE／ZERO_NOTE 不扩展（作者⑦删零提示的味道，两层不加）', Object.keys(M.ZERO_NOTABLE).length === 2 && Object.keys(M.ZERO_NOTE).length === 2);
  // L5m D17.1：主动消息（path:'hb'）不渲染面板行（上游无 usage/Token 行；用户 2026-10-19 真机裁定）
  ck('L5m 主动消息隐藏面板行（openMsgInfo 条件排 hb；dm/group 不变）', html.includes("if(m.ctxSnap&&!(m.ctxSnap.path==='hb')){try{var _cg=b.querySelector('.mi-grid')") && html.split('if(m.ctxSnap').length - 1 === 1 && html.includes('_ctxLedgerM.rowHtml(m.ctxSnap)'));
}

/* ═══ M. 群聊条数：collapse 前测量（D18.1 patch33 回归；真调 collapseSameRoleM）═══ */
{
  /* 从功能版提取 collapseSameRoleM 本体（vm 外 new Function 包一层，只喂 _HIST_LEAD_NOTE_M） */
  const fl = html.split('\n');
  const i0 = fl.findIndex(l => l.indexOf('function collapseSameRoleM(msgs){') === 0);
  let i1 = i0; while (i1 < fl.length && fl[i1] !== '}') i1++;
  ck('M0 collapseSameRoleM 提取成功', i0 >= 0 && i1 > i0 && fl[i1] === '}');
  const collapse = new Function('_HIST_LEAD_NOTE_M', fl.slice(i0, i1 + 1).join('\n') + '\nreturn collapseSameRoleM;')('（前情提示）');
  /* 真机场景复现：Selene 轮的窗口＝[用户开场(user-role)]＋[test 的回复(源 assistant，群聊映射成 user-role)] */
  const combined = [
    { role: 'user', content: '[用户] 我们一起测试一下上下文日志的功能～' },
    { role: 'assistant', content: '[test] 好，来。上下文日志——我现在能看到的，是你从上一轮到这一轮之间传递过来的上文，包括我们的对话历史、系统注入的那几段参考资料。', senderName: 'test' }
  ];
  const mapped = combined.map(m => ({ role: 'user', content: m.content })); /* 群聊映射：用户与非自身成员都进 user-role */
  const messages = collapse(mapped);
  ck('M1 复现 D17 bug：合并后 length=1（成员回复被并进用户消息 blob）', messages.length === 1 && messages[0].content.indexOf('[test]') >= 0);
  ck('M2 新测法：mapped.length=2（真实条数，含成员发言）', mapped.length === 2);
  ck('M3 文本等价：mapped.join 与合并后内容逐字节相同（同一 \'\\n\\n\' 拼接，已验证的 234 不变）', mapped.map(m => m.content).join('\n\n') === messages.map(m => m.content).join('\n\n'));
  ck('M4 u/a 按源 role：u=1（真实用户）a=1（AI 成员）', combined.filter(m => m.role === 'user').length === 1 && combined.filter(m => m.role !== 'user').length === 1);
  ck('M5 img 按 mapped（本例 0；成员图映射时已丢弃）', mapped.reduce((a, m) => a + ((m && m.images && m.images.length) || 0), 0) === 0);
  /* 三成员连位场景：user+test+Selene 全 user-role → 合并后 1 条、合并前 3 条 */
  const c3 = [{ role: 'user', content: 'A' }, { role: 'assistant', content: 'B', senderName: 'test' }, { role: 'assistant', content: 'C', senderName: 'Selene' }];
  const m3 = c3.map(m => ({ role: 'user', content: m.content }));
  ck('M6 三成员连位：旧测法 1 条 / 新测法 3 条', collapse(m3).length === 1 && m3.length === 3);
  /* 静态接线 */
  const capIdx = html.indexOf("_ctxT.addHist(mapped.map("), colIdx = html.indexOf('const messages=collapseSameRoleM(mapped);');
  ck('M7 捕获点在 collapse 行之前', capIdx > 0 && colIdx > 0 && capIdx < colIdx);
  ck('M8 旧测法（addHist(messages.map）已移除', !html.includes('_ctxT.addHist(messages.map('));
  ck('M9 新 u/a 形态（源 role from combined）在位', html.includes("combined.filter(function(m){return m&&m.role==='user'}).length") && html.includes("combined.filter(function(m){return m&&m.role!=='user'}).length"));
  ck('M10 1对1 捕获点未动（仍测 hist，用户裁定不修合并案）', html.includes("_ctxT.addHist(hist.map(function(m){return (m&&m.content)||''}).join('\\n\\n'),hist.length"));
}

console.log('═══════════════════════════════════');
console.log('桩测结果：' + pass + ' 过 / ' + fail + ' 败');
if (fail) { fails.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('全部通过 ✓');

})().catch(e => { console.error('桩测崩溃：', e); process.exit(1); });
