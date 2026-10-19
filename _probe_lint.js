#!/usr/bin/env node
/*
 * _probe_lint.js —— 探针与记录类文档的机械自检（2026-10-12 建）
 *
 * 为什么要有它：2026-10-12 一轮里出了 4 类错误，2026-10-13 又出第 5 类，全部**本可机械判定**，
 * 全靠人工撞见（用户审查五轮才抓齐）：
 *
 *   ① 隐藏控制字符 —— 写 `var SPLIT = '\u001e'` 时落进文件的是字面 0x1E。
 *      语法能过、功能正常（实测可用），但复制粘贴或编码一碰就静默失效。
 *      当时是写完主动 grep 才抓到的 —— 属于运气，不是纪律。
 *   ② 字段生产与消费不一致 —— 采集器加了 12 个新字段，**忘了报告脚本不读它们**，
 *      白跑一轮真机（真机开机一次成本不低）。
 *   ③ 标题重复 —— 编辑 map 时旧文本匹配失败、改用脚本重写，造成「仍被挡着」重复两次。
 *      事后 grep 才发现。
 *   ④ 空壳节 —— 往 CONTEXT.md 插节时把另一节的正文挤走，标题与内容分离。
 *   ⑤ 引用悬空 —— 删了票 02 的 §7，§3/§4 里引用 D1–D4 的地方不知道；改了轮数口径，
 *      写「9 轮」的证据行不同步。**改了一处、忘了引用它的另一处**，五轮审查的根因。
 *      ⑤ 是跨文件的（要读目标文件的标题），单独一整节跑，扫整个 effort 目录。
 *   ⑥ __dirname 上跳（2026-10-19 加）—— 根级脚本用 `__dirname/..` 定位，文件一移定位就漂，
 *      且失效是静默的（退出码照样 0）。`_check_docs.js` 与本品各出过一次同款事故。
 *   ⑦ 文档引用路径不存在（2026-10-19 加）—— 深清理后悬空引用 6 处、技能里死路径活一天，
 *      全靠人肉 grep。反引号路径（含分隔符）在 .md 正文出现即检存在性。
 *
 * 六条都是确定性的：同样的输入必然给出同样的判定。所以它们属于**检查器**，不属于文档规约。
 *
 * 用法：
 *   node _probe_lint.js                       # 默认集＝glob 全 effort .md（排除证据/临时文件）＋3 探针＋CONTEXT.md；另恒扫全 effort 跑引用检查
 *   node _probe_lint.js <路径> ...            # 只检查指定文件（覆盖默认集；引用扫描仍扫全 effort）
 *
 * 退出码：FAIL 数为 0 时退 0，否则退 1。WARN 不影响退出码。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;        // 工作空间根（拆分后脚本所在即根）
const LEDGER = path.join(ROOT, '.scratch', 'ib-ctx-ledger');

// ── 默认检查集的构成（S2，2026-10-13）─────────────────────
// A = glob：effort 目录下全部 .md（含 issues/ 子目录、含 map.md）
// B = 显式：三个探针脚本
// C = 若存在：工作空间根 CONTEXT.md
// DEFAULTS = A ∪ B ∪ C；命令行显式传路径时覆盖本集合（行为不变）。
// 排除规则（显式清单）——证据文件与临时文件不参与结构检查：
//   ① 名以「无」「对话」开头且不含「-」：原始输出证据（无always.md、对话中创建always.md）
//   ② 名含 fixture／tmp／.bak：一次性夹具与备份
// ⚠️ 排除基于文件名模式（无/对话开头且无连字符）——新增文件若命名巧合会被静默排除。
//    若发现某 .md 未被扫描：先检查文件名是否触发此规则；必要时改为显式文件名清单。
const EXCLUDE_MD = [/^无[^-]*$/, /^对话[^-]*$/, /fixture/, /tmp/i, /\.bak$/];
function collectMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push.apply(out, collectMd(p));
    else if (/\.md$/.test(f)) out.push(p);
  });
  return out;
}
const EFFORT_MD = collectMd(LEDGER);               // 引用扫描用：effort 内全部 .md（不排除，见 ⑤ 节）
const DEFAULTS = (function () {
  const out = EFFORT_MD.filter(f => !EXCLUDE_MD.some(re => re.test(path.basename(f))));   // A：glob
  ['预览预算-1挂采集器.js', '预览预算-2出报告.js', '真实分布-3出分布表.js'].forEach(n => { // B：显式探针
    const p = path.join(LEDGER, n);
    if (fs.existsSync(p)) out.push(p);
  });
  const ctx = path.join(ROOT, 'CONTEXT.md');       // C：存在才加
  if (fs.existsSync(ctx)) out.push(ctx);
  return out;
})();

function die(msg, code) { console.error(msg); process.exit(code == null ? 1 : code); }

// ── ① 隐藏控制字符 ──────────────────────────────────────────────
// 只查 .js/.md。允许 \t \n \r；其余 C0 控制字符与 DEL 一律 FAIL。
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
function checkControlChars(file, src, out) {
  const hits = [];
  src.split('\n').forEach((line, i) => {
    const m = line.match(CTRL_RE);
    if (m) hits.push({ line: i + 1, chars: m.map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) });
  });
  if (hits.length) {
    out.push(['FAIL', '隐藏控制字符', hits.length + ' 处']);
    hits.slice(0, 6).forEach(h => {
      out.push(['', '  L' + h.line + ': ' + h.chars.join(' ')]);
      const ctx = src.split('\n')[h.line - 1];
      out.push(['', '    ' + ctx.trim().slice(0, 90)]);
    });
    out.push(['', '  → 一律改用显式转义写法（\\u001e），别让不可见字符进文件。']);
  }
}

// ── ② 字段生产与消费不一致 ─────────────────────────────────────
// 采集器写入 cur.X 的字段集，与报告脚本读取的字段集求差集。
// 差集非空 = 采了没人读 = 白采。
function collectCurFields(src) {
  const set = new Set();
  let m;
  const re = /\bcur\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}
// 采集器内部对 cur.X 的「读取」（排除赋值那一次）——用于判断字段是否被就地用到
function collectCurReads(src) {
  const set = new Set();
  let m;
  const re = /\bcur\.([A-Za-z_$][\w$]*)\b(?!\s*=)/g;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}
function collectReads(src) {
  // 消费侧：报告脚本里对数据对象的读取
  // ⚠️ 只认「报告侧的典型读法」——t.X / turn.X（报告脚本遍历采集器结果时用这两个变量名）。
  //    不可把 cur.X 也算进来：采集器内部会读自己写的字段（算差集、拼 head），
  //    那样每个字段都会「自己消费自己」，检查形同虚设。
  const set = new Set();
  let m;
  const re = /\b(?:t|turn)\.([A-Za-z_$][\w$]*)\b/g;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}
function checkFieldParity(producers, consumers, out) {
  if (!producers.length || !consumers.length) return;
  producers.forEach(pf => {
    // 一个采集器对应所有报告/分布脚本：合并它们的读取集合
    const read = new Set();
    consumers.forEach(c => {
      collectReads(fs.readFileSync(c.path, 'utf8')).forEach(f => read.add(f));
    });
    const produced = collectCurFields(fs.readFileSync(pf.path, 'utf8'));
    // 采集器内部自读不算消费（见上），但内部自读的字段仍可能有意义——
    // 所以只报「既没被报告读、也没被采集器自己再读一次」的字段。
    const selfRead = collectCurReads(fs.readFileSync(pf.path, 'utf8'));
    const orphan = [];
    produced.forEach(f => { if (!read.has(f) && !selfRead.has(f)) orphan.push(f); });
    if (orphan.length) {
      // WARN 而非 FAIL：字段"没人读"有时是合理的（诊断副产物、留待下轮用），
      // 机器判不出这个区别。降级为 WARN，避免假警报让人忽略整份检查。
      out.push(['WARN', '采集器写了但没人读（可能是诊断副产物，也可能是白采）', orphan.length + ' 个（' + path.basename(pf.path) + '）']);
      orphan.slice(0, 20).forEach(f => out.push(['', '  cur.' + f]));
      out.push(['', '  → 逐个看：是留给下一轮/报告的就去接上；纯副产物就留着；确实没人用的删掉。']);
    }
  });
}

// ── ③ 标题重复 ─────────────────────────────────────────────────
// 同一文件内，## 与 ### 标题重复出现即 FAIL（脚本重写时的典型事故）。
function checkDupHeadings(file, src, out) {
  const seen = new Map();
  const dup = [];
  src.split('\n').forEach((line, i) => {
    const m = line.match(/^(#{2,3})\s+(\S.*)$/);
    if (!m) return;
    const key = m[2].trim();
    if (seen.has(key)) dup.push({ line: i + 1, first: seen.get(key), text: key });
    else seen.set(key, i + 1);
  });
  if (dup.length) {
    out.push(['FAIL', '标题重复', dup.length + ' 处']);
    dup.slice(0, 10).forEach(d => out.push(['', '  L' + d.first + ' 与 L' + d.line + ' 同为「' + d.text.slice(0, 50) + '」']));
    out.push(['', '  → 编辑失败改用脚本重写时最容易犯；重跑一次本检查。']);
  }
}

// ── ④ 空壳节 ───────────────────────────────────────────────────
// ### 标题后、下一个标题前若没有任何非空正文，即为空壳节。
function checkEmptySection(file, src, out) {
  const lines = src.split('\n');
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(/^(#{2,3})\s+\S/); if (m) heads.push(i); });
  const bad = [];
  for (let k = 0; k < heads.length; k++) {
    const start = heads[k] + 1;
    const end = k + 1 < heads.length ? heads[k + 1] : lines.length;
    const bodyLines = lines.slice(start, end).filter(l => l.trim() !== '');
    if (bodyLines.length === 0) {
      // 空壳。豁免「父节后紧跟子节」的合法分层：下一行（忽略空行）就是更深层标题（层级数更大）。
      const nxt = lines.slice(start).find(l => l.trim() !== '');
      const curLvl = (lines[heads[k]].match(/^#+/) || ['#'])[0].length;
      const nxtLvl = nxt ? (nxt.match(/^#+/) || ['#'])[0].length : 0;
      if (nxt && nxtLvl > curLvl) continue;
      bad.push({ line: heads[k] + 1, text: lines[heads[k]].trim(), last: k + 1 === heads.length });
    }
  }
  if (bad.length) {
    out.push(['FAIL', '空壳节（有标题无正文）', bad.length + ' 处']);
    bad.slice(0, 8).forEach(b => out.push(['', '  L' + b.line + ': ' + b.text.slice(0, 60) + (b.last ? '（末节）' : '')]));
    out.push(['', '  → 往文件插节时把另一节正文挤走，或移动时留下孤立标题。']);
  }
}

// ── ⑤ 引用锚点与标签（跨文件，扫整个 effort 目录）──────────
// effort 文档互引用密集（票↔票、节↔节）。删节／改号之后引用方不会自动知道——
// 2026-10-12/13 两轮里这类悬空出了五次，全靠人工撞见。本检查把两类引用变成机械判定：
//   ⑤a §N 锚点：`[文本](xx.md) §N`（§N 在链接文本内或紧随链接后）／`票 NN §N`／裸 `§N`
//        → 目标文件须有对应编号标题（`### 2. 标题` 或 `## Answer §1 标题` 两种写法都认）
//   ⑤b D/Q 标签：`D1`/`Q1` 式编号（本 effort 的拍板项）→ effort 内须有定义
//        （`**D1 …**` 粗体标签，或标题内含该标签）
// 判不了的留着不判（宁可漏报不可误报）：
//   · canonical 数字发散（同概念不同值，如一轮写 9 轮一轮写 7 轮）需要语义，不在本检查内；
//   · `§N–§M` 区间是行文 shorthand，不当引用（如「Answer 见 §2–§6、§8–§12」）；
//   · 标签用全局注册表：跨文件同名会互相兜底（map 写「Q2 裁决」由票 04 的 Q2 满足）；
//   · 紧跟票号的裸形式（「01 §2」＝票 01 的 §2）归属该票；其余裸 §N 若本文件无此节、
//     句内也未标明目标票，报 WARN（目标不明）而不硬判同文件——宁可漏报不可误报。
// EFFORT_MD（effort 内全部 .md，不做排除）在文件头定义，本节直接用。

function headingNums(src) {
  const nums = new Set();
  src.split('\n').forEach(l => {
    let m = l.match(/^#{2,3}\s+(\d+)[.．\s]/);           // ### 2. 标题
    if (m) { nums.add(m[1]); return; }
    m = l.match(/^#{2,3}\s+(?:Answer\s+)?§\s*(\d+)/);    // ## Answer §1 ／ ## §3 标题
    if (m) nums.add(m[1]);
  });
  return nums;
}

function labelDefs(src) {
  const defs = new Set();
  src.split('\n').forEach(l => {
    const clean = l.replace(/\b([DQ]\d+)\s*[–\-—~]\s*([DQ]\d+)\b/g, ' ');  // 区间不算定义也不算引用
    let m;
    const bold = /\*\*([DQ]\d+)/g;                        // **D1 …** 粗体标签（定义位）
    while ((m = bold.exec(clean))) defs.add(m[1]);
    const quote = /「([DQ]\d+)/g;                         // 「Q7 补测排期」角引标签（定义位）
    while ((m = quote.exec(clean))) defs.add(m[1]);
    const head = /^#{2,3}\s+.*?\b([DQ]\d+)\b/g;           // 标题内含（### 3. Q1「…」）
    while ((m = head.exec(clean))) defs.add(m[1]);
  });
  return defs;
}

function ticketTarget(file, n) {
  const dir = path.dirname(file);
  const issuesDir = path.basename(file) === 'map.md' ? path.join(dir, 'issues') : dir;
  try {
    const hit = fs.readdirSync(issuesDir).find(f => new RegExp('^' + n + '-.*\\.md$').test(f));
    return hit ? path.join(issuesDir, hit) : null;
  } catch (e) { return null; }
}

function checkAnchorRefs(file, src, idx, out) {
  const seen = new Set();
  const rel = p => path.relative(ROOT, p);
  // 「§N（该节已删）」式标注＝有意的历史叙述（说明节已不存在），不当悬空报
  const annotated = (line, endIdx) => /^\s*（[^）]{0,16}(?:已删|已移除|现已删除)/.test(line.slice(endIdx));
  const report = (n, target, lineNo) => {
    const key = lineNo + '|' + n + '|' + (target || 'self');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(['FAIL', '悬空引用', rel(file) + ' 第 ' + lineNo + ' 行引用 §' + n +
      '，但 ' + (target ? rel(target) : '本文件') + ' 无此编号标题']);
  };
  const hasNum = (target, n) => (target ? idx.get(target) : idx.get(file)).has(n);
  src.split('\n').forEach((line, i) => {
    const lineNo = i + 1;
    const handled = new Set();                            // 本行已由 ①/② 判过的节号，③ 跳过
    // ① 链接文本内的 §N，与紧随链接后的 §N
    const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(line))) {
      const target = /\.md$/.test(m[2]) ? path.resolve(path.dirname(file), m[2]) : null;
      if (target && !fs.existsSync(target)) continue;     // 指向 effort 外，不判
      const inText = m[1].match(/§\s*(\d+)/);
      if (inText) { handled.add(inText[1]); if (!hasNum(target, inText[1])) report(inText[1], target, lineNo); }
      const tail = line.slice(m.index + m[0].length);
      const after = tail.match(/^\s{0,2}§\s*(\d+)/);
      if (after && target) {
        handled.add(after[1]);
        if (!annotated(line, m.index + m[0].length + after.index + after[0].length) &&
            !hasNum(target, after[1])) report(after[1], target, lineNo);
      }
    }
    // ② 「票 NN §N」无链接形式（NN 与 § 间可隔一个 Answer）→ issues/NN-*.md
    const tickRe = /票\s*(\d{1,2})\s+(?:Answer\s+)?§\s*(\d+)/g;
    while ((m = tickRe.exec(line))) {
      handled.add(m[2]);
      const target = ticketTarget(file, m[1]);
      if (target && !annotated(line, m.index + m[0].length) && !hasNum(target, m[2])) report(m[2], target, lineNo);
    }
    // ③ 裸 §N：按归属确定度分级判（确定→FAIL，多半→WARN，不明→WARN）
    // 表格行归属：行首单元格链接到某票（Frontier 表的写法），行内裸 §N 归该票
    const rowTick = (line.match(/^\s*\|?\s*\[[^\]]*\]\((?:issues\/)?(\d{1,2})-[^)]+\.md\)/) || [])[1];
    const bareRe = /§\s*(\d+)/g;
    while ((m = bareRe.exec(line))) {
      if (handled.has(m[1])) continue;                    // 本行已由 ①/② 判过同一节号
      const pre = line.slice(0, m.index);
      if (/\)\s*$/.test(pre)) continue;                   // 紧随链接后，① 已判
      if (/票\s*\d{1,2}\s*$/.test(pre)) continue;         // 「票 NN §N」，② 已判
      if (annotated(line, m.index + m[0].length)) continue; // 「§N（该节已删）」历史叙述，豁免
      // 归属一（确定）：前面紧跟票号（可隔一个 Answer）——「01 §2」「01 Answer §2」
      const adj = pre.match(/(?:^|[^\w§])(\d{1,2})\s+(?:Answer\s+)?$/);
      if (adj) {
        const t = ticketTarget(file, adj[1]);
        if (t) { if (!hasNum(t, m[1])) report(m[1], t, lineNo); continue; }
      }
      // 归属二（确定）：表格行首链接的票
      if (rowTick) {
        const t = ticketTarget(file, rowTick);
        if (t) { if (!hasNum(t, m[1])) report(m[1], t, lineNo); continue; }
      }
      if (hasNum(null, m[1])) continue;                   // 同文件有这节，正常
      // 归属三（多半）：句内最近的「票 NN」或指向票文件的链接（前 60 字内）
      const near = pre.slice(-60);
      const lb = near.match(/票\s*(\d{1,2})(?!\d)/g);
      const lnk = near.match(/\]\((?:issues\/)?(\d{1,2})-[^)]+\.md\)/g);
      let t2 = null;
      if (lb && lb.length) t2 = ticketTarget(file, lb[lb.length - 1].replace(/\D/g, ''));
      else if (lnk && lnk.length) t2 = ticketTarget(file, lnk[lnk.length - 1].replace(/\D/g, ''));
      if (t2) {
        if (!hasNum(t2, m[1])) out.push(['WARN', '引用或悬空', rel(file) + ' 第 ' + lineNo + ' 行引用 §' + m[1] +
          '，' + rel(t2) + ' 无此编号标题（按句内最近的票号归属，请人工确认）']);
        continue;
      }
      out.push(['WARN', '引用目标不明', rel(file) + ' 第 ' + lineNo + ' 行引用 §' + m[1] +
        '：本文件无此节、句内也未标明目标票——若指别票请补「票 NN」或链接']);
    }
  });
}

function checkLabelRefs(file, src, defsAll, out) {
  const rel = p => path.relative(ROOT, p);
  src.split('\n').forEach((line, i) => {
    const clean = line.replace(/\b([DQ]\d+)\s*[–\-—~]\s*([DQ]\d+)\b/g, ' ');  // 区间不当引用
    const re = /\b([DQ]\d+)\b/g;
    let m;
    while ((m = re.exec(clean))) {
      if (defsAll.has(m[1])) continue;
      out.push(['FAIL', '悬空标签引用', rel(file) + ' 第 ' + (i + 1) + ' 行引用 ' + m[1] +
        '，effort 内无定义（粗体标签 **' + m[1] + ' 或标题内含）']);
    }
  });
}

// ── ⑥ __dirname 禁上跳（根级脚本）────────────────────────────
// 2026-10-19 事故：`_check_docs.js` 的 `ROOT = path.resolve(__dirname,'..')` 在目录提升后
// 指向 `D:\`，默认检查面塌到 4 个文件还报「全部通过」一整天；`_probe_lint.js` 十月份
// 出过同族 bug（ROOT 多一层，裸跑从来查不到文件）。根级脚本没有上行的理由——
// 它一跳，定位就跟着文件位置漂移，而这类失效是静默的（退出码照样是 0）。
// 检查面显式收窄为**根级 `_*.js`＋三个探针**：`.scratch` 里的一次性脚本住得深，
// 上跳是合法定位方式，不判（宁漏毋滥）。
const UP_RE = /__dirname\s*(?:,\s*['"]\.\.['"]|\+\s*['"]\/\.\.)/;
function rootJsFiles() {
  const out = [];
  try {
    fs.readdirSync(ROOT).forEach(n => { if (/^_.*\.js$/.test(n)) out.push(path.join(ROOT, n)); });
  } catch (e) { /* 目录读不到就跳过 */ }
  ['预览预算-1挂采集器.js', '预览预算-2出报告.js', '真实分布-3出分布表.js'].forEach(n => {
    const p = path.join(LEDGER, n);
    if (fs.existsSync(p)) out.push(p);
  });
  return out;
}
function checkDirnameUp(out) {
  const files = rootJsFiles();
  if (!files.length) return;
  const hits = [];
  files.forEach(p => {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                   // 注释行不判（事故范例就写在注释里）
      const m = line.match(UP_RE);
      if (m) hits.push({ file: path.basename(p), line: i + 1, text: line.trim().slice(0, 80) });
    });
  });
  if (hits.length) {
    out.push(['FAIL', '__dirname 上跳（根级脚本禁位）', hits.length + ' 处']);
    hits.slice(0, 8).forEach(h => out.push(['', '  ' + h.file + ' L' + h.line + ': ' + h.text]));
    out.push(['', '  → 根级脚本定位只用 __dirname；确需上跳说明它不该住根上（_check_docs 2026-10-19 事故同款）。']);
  }
}

// ── ⑦ 文档引用的路径必须存在 ─────────────────────────────────
// 2026-10-19 深清理后悬空引用 6 处；更早，技能里 `D:\InternalBeyond\` 死路径活了一整天。
// 反引号路径（含 `/` 或 `\`）出现在 .md 正文（跳过 ``` 围栏块）即检：
//   · 相对路径按「md 所在目录 → 工作区根」两级解析，任一存在即放行（本仓两种写法都有）；
//   · `D:\IB-Workspace-*` 绝对路径直接检（双工作区约定，见 AGENTS.md）；
//   · 通配符／`{a,b}` 简写／`<占位符>`／命令行／URL／带删除标注的行一律不判（宁可漏报）。
// 扫描面＝全工作区 .md，排除 .git／node_modules／.scratch（历史 effort）／.obsidian／
// .workbuddy/memory（append-only 日志）；.workbuddy/skills 是活指令，纳入。
const SKIP_DIRS_7 = new Set(['.git', 'node_modules', '.scratch', '.obsidian']);
// 与上游逐字节同步的文件（`_sync_mirror.js`／`_win_sync.js` 的覆盖目标）不本地编辑，
// 其内部路径以上游仓库布局为准 —— 桌面端 README 引用 `DLC/IB-Cinema.js`（上游仓库自身
// 多一层 `DLC\`）即属此类。显式列出，不静默排除。
const UPSTREAM_SYNCED_7 = new Set(['README.md']);
const ANNOT_7 = /已删|删除|已移除|现已删除|已清|git 历史|深清理|已归档|已迁|不存在|拆分前/;
// 双工作区约定（AGENTS.md）：本仓文档大量以相对路径引用另一工作区的资产
// （`_patches\`、`docs\说明书-电脑端.md` 等）。相对路径三级解析：
// md 所在目录 → 本工作区根 → 另一工作区根。
const SIBLING = path.basename(ROOT) === 'IB-Workspace-Mobile' ? 'D:/IB-Workspace-Desktop' : 'D:/IB-Workspace-Mobile';
function collectMd7(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS_7.has(e.name)) return;
      if (dir === ROOT && e.name === '.workbuddy') {                 // 只收 skills，不收 memory
        collectMd7(path.join(p, 'skills'), out);
        return;
      }
      collectMd7(p, out);
    } else if (/\.md$/.test(e.name)) {
      if (UPSTREAM_SYNCED_7.has(e.name)) return;                       // 上游同步件，路径以上游为准
      out.push(p);
    }
  });
  return out;
}
function checkPathRefs(out) {
  const mds = collectMd7(ROOT, []);
  if (!mds.length) return;
  const WS = /^[a-z]:[\\/]ib-workspace-(mobile|desktop)/i;
  const hits = [];
  mds.forEach(p => {
    const rel = path.relative(ROOT, p);
    let inFence = false;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return; }
      if (inFence || ANNOT_7.test(line)) return;
      const re = /`([^`]+)`/g;
      let m;
      while ((m = re.exec(line))) {
        const tok = m[1].trim();
        if (!/[\\/]/.test(tok)) continue;                             // 纯文件名不判（归属歧义，显式不收）
        if (/^(https?:|file:)/i.test(tok)) continue;                  // URL
        if (/[*{}<>]/.test(tok)) continue;                            // 通配符／简写／占位符
        if (tok.indexOf('=') >= 0) continue;                          // 带参数
        if (/\s/.test(tok)) continue;                                 // 带空格＝行文不是路径（如「入 6.5k / 出 1.2k」）
        if (/^(node|git|gh|cd|bash|npm|python|curl|ls|cat|grep|find|cp|mv)\s/i.test(tok)) continue;  // 命令行
        if (/^[~]/.test(tok)) continue;                               // home 相对（环境相关）
        if (/^\//.test(tok)) continue;                                // POSIX 绝对路径（/usr/bin、/mingw64/bin，环境相关）
        if (/^(Downloads|Desktop|Documents)[\\/]/i.test(tok)) continue;  // 用户 profile 目录（环境相关）
        if (/^(vendor|safe-bin)[\\/]/i.test(tok)) continue;           // 宿主环境内部路径（app.asar 内，不在工作区）
        if (/\.\.\.|…/.test(tok)) continue;                           // 省略路径／提交区间
        // 形状收窄：要么是带扩展名的文件，要么以分隔符结尾的目录；且去掉尾部分隔符后
        // 还必须含一个内部分隔符——这一刀切掉 `DLC/`／`_patches\`／`Android\` 这类裸目录名
        // （它们是名字不是路径，从文档位置无法解析），也切掉 `\uXXXX` 与仓库 slug。
        if (!(/[^/\\]\.[A-Za-z0-9]+$/.test(tok) || /[\\/]$/.test(tok))) continue;
        if (!/[\\/]/.test(tok.replace(/[\\/]+$/, ''))) continue;
        let ok = false;
        if (/^[a-z]:[\\/]/i.test(tok)) {                              // 绝对路径：只检双工作区
          if (WS.test(tok.replace(/\\/g, '/'))) ok = fs.existsSync(tok);
          else ok = true;                                             // 环境相关路径不判
        } else {
          ok = fs.existsSync(path.resolve(path.dirname(p), tok)) ||
               fs.existsSync(path.resolve(ROOT, tok)) ||
               fs.existsSync(path.resolve(SIBLING, tok));
        }
        if (!ok) hits.push({ rel, line: i + 1, tok: tok.slice(0, 70) });
      }
    });
  });
  if (hits.length) {
    out.push(['FAIL', '文档引用的路径不存在', hits.length + ' 处']);
    hits.slice(0, 50).forEach(h => out.push(['', '  ' + h.rel + ' 第 ' + h.line + ' 行：`' + h.tok + '`']));
    if (hits.length > 50) out.push(['', '  …还有 ' + (hits.length - 50) + ' 处未显示']);
    out.push(['', '  → 确认是删除件就在该行加标注（如「（已删，git 历史可查）」）；是笔误就改对。']);
  }
}

// ── 运行 ───────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const files = argv.length ? argv : DEFAULTS;

const jsProducers = files.filter(f => /挂采集器\.js$/.test(f) && fs.existsSync(f));
const jsConsumers = files.filter(f => /出报告\.js$|出分布表\.js$/.test(f) && fs.existsSync(f));

let totalFail = 0;
let structFail = 0;

console.log('--- 探针与记录类文档 ---');
files.forEach(f => {
  if (!fs.existsSync(f)) { console.log('· 跳过（不存在）' + path.basename(f)); return; }
  const src = fs.readFileSync(f, 'utf8');
  const out = [];
  if (/\.(js|md)$/.test(f)) {
    checkControlChars(f, src, out);
    if (/\.md$/.test(f)) { checkDupHeadings(f, src, out); checkEmptySection(f, src, out); }
  }
  if (!out.length) {
    console.log('✓ ' + path.relative(ROOT, f));
  } else {
    console.log('✗ ' + path.relative(ROOT, f));
    out.forEach(([lv, msg, extra]) => { if (lv) console.log('  ' + lv + ' ' + msg + (extra ? '（' + extra + '）' : '')); else console.log(msg); });
    structFail += out.filter(r => r[0] === 'FAIL').length;
  }
});

// 字段一致性是跨文件的，单独跑
if (jsProducers.length && jsConsumers.length) {
  console.log('--- 字段生产／消费一致性 ---');
  const prodInfo = jsProducers.map(p => ({ path: p, name: path.basename(p) }));
  const consInfo = jsConsumers.map(c => ({ path: c, name: path.basename(c) }));
  const out = [];
  checkFieldParity(prodInfo, consInfo, out);
  if (!out.length) {
    console.log('✓ 采集器写的字段都有消费方');
  } else {
    out.forEach(([lv, msg, extra]) => { if (lv) console.log('  ' + lv + ' ' + msg + (extra ? '（' + extra + '）' : '')); else console.log(msg); });
    totalFail += out.filter(r => r[0] === 'FAIL').length;
  }
}

// 引用检查是跨文件的：扫整个 effort 目录，与传入的文件清单无关
console.log('--- 引用锚点与标签（整 effort 扫描）---');
if (!EFFORT_MD.length) {
  console.log('· 跳过（effort 目录不存在或无 .md）');
} else {
  const idx = new Map();
  const defsAll = new Set();
  const srcs = new Map();
  EFFORT_MD.forEach(f => {
    const s = fs.readFileSync(f, 'utf8');
    srcs.set(f, s);
    idx.set(f, headingNums(s));
    labelDefs(s).forEach(l => defsAll.add(l));
  });
  const out = [];
  EFFORT_MD.forEach(f => {
    checkAnchorRefs(f, srcs.get(f), idx, out);
    checkLabelRefs(f, srcs.get(f), defsAll, out);
  });
  if (!out.length) {
    console.log('✓ ' + EFFORT_MD.length + ' 个 .md：§N 锚点与 D/Q 标签引用无悬空');
  } else {
    out.forEach(r => console.log('  ' + r[0] + ' ' + r[1] + '（' + r[2] + '）'));
    totalFail += out.filter(r => r[0] === 'FAIL').length;
  }
}

// ⑥ __dirname 禁上跳（根级脚本；工作区级检查，与传入文件清单无关）
console.log('--- __dirname 禁上跳（根级脚本）---');
{
  const out = [];
  checkDirnameUp(out);
  if (!out.length) {
    console.log('✓ 根级脚本无 __dirname 上跳');
  } else {
    out.forEach(([lv, msg, extra]) => { if (lv) console.log('  ' + lv + ' ' + msg + (extra ? '（' + extra + '）' : '')); else console.log(msg); });
    totalFail += out.filter(r => r[0] === 'FAIL').length;
  }
}

// ⑦ 文档引用的路径必须存在（工作区级检查，与传入文件清单无关）
console.log('--- 文档引用路径存在性 ---');
{
  const out = [];
  checkPathRefs(out);
  if (!out.length) {
    console.log('✓ 正文反引号路径全部存在（或已带删除标注）');
  } else {
    out.forEach(([lv, msg, extra]) => { if (lv) console.log('  ' + lv + ' ' + msg + (extra ? '（' + extra + '）' : '')); else console.log(msg); });
    totalFail += out.filter(r => r[0] === 'FAIL').length;
  }
}

// 下限断言（S1.2）：默认跑法下 effort 还在、扫描面却塌缩 ⇒ 检查器定位坏了，不是文档变少。
// 2026-10-19 事故：_check_docs.js 默认集塌到 4 个文件仍报「全部通过」一整天。
if (!argv.length && fs.existsSync(LEDGER) && files.length < 10) {
  console.log('✗ 检查面塌缩：默认集只扫到 ' + files.length + ' 个文件（effort 目录存在，理应远多于此）——先查检查器自己的定位（__dirname 上跳类 bug）。');
  process.exit(1);
}

console.log('');
console.log('结构检查：扫描 ' + files.length + ' 个文件（glob + 显式）' + (structFail ? '：' + structFail + ' 项 FAIL' : '：全部通过'));
process.exit(totalFail ? 1 : 0);