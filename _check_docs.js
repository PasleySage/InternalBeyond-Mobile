#!/usr/bin/env node
/*
 * _check_docs.js —— 记录类文档的自洽性检查（2026-09-19 建）
 *
 * 为什么要有它：2026-09-19 一轮里就出了 4 处同类错误，全靠人工撞见 ——
 *   · spec.md「优先级决定」表两行还写"待批"，与同文件「已外发」表矛盾
 *   · 复核清单出口优先级出现两个 `4.`，修成 `5.` 后又与原 `5.` 撞车
 *   · 日志尾部堆了 26 个空行
 *   · 外发前占位符有 `#___` / `#__\_` 两种写法（这条归 `_check_publish.js` 管）
 *
 * 两级输出，**只有硬性项影响退出码**：
 *   FAIL（机械可判定）：编号重复/倒退、refs 指向不一致、文件尾部多余空行
 *   WARN（本质是判断题）：同一份文档里既有"待批/待发"又有"已外发" ——
 *        文档可能是在描述规则，也可能两条说的是不同条目，机械判定会误报，
 *        所以只列出行号交给人看。（本空间编号有两套：issue 文件 06 / GitHub #5，
 *        跨套无法自动配对 —— 当初那个真 bug 正是"06 那行写待批、#5 那行写已外发"。）
 *
 * 用法：node _check_docs.js            # 检查默认文档集 + 记忆文件
 *      node _check_docs.js <路径> ...  # 只检查指定文件
 * 退出码：FAIL 数为 0 时退 0，否则退 1。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const PENDING = ['待批', '待发'];
const DONE = ['已外发', '已发表'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.md$/.test(e.name)) out.push(p);
  }
  return out;
}

function defaultFiles() {
  return [
    'AGENTS.md', 'CONTEXT.md', 'README.md',
    ...walk(path.join(ROOT, 'docs')),
    ...walk(path.join(ROOT, '.scratch'))
  ].filter(f => fs.existsSync(f));
}

function memoryFiles() {
  return walk(path.join(ROOT, '.workbuddy', 'memory'));
}

function countTrailingBlank(text) {
  const m = text.match(/(\n[ \t]*)+$/);
  if (!m) return 0;
  return m[0].split('\n').length - 1 - (text.endsWith('\n') ? 1 : 0);
}

function checkContent(file, text, { checkLists = true, checkStatus = true } = {}) {
  const fails = [];
  const warns = [];
  const lines = text.split('\n');
  let inFence = false;

  // ---- 编号：同一块有序列表里不得重复或倒退 ----
  if (checkLists) {
    let lastNum = null, lastIndent = null, blanks = 0;
    lines.forEach((l, i) => {
      if (/^```/.test(l)) { inFence = !inFence; return; }
      if (inFence) return;

      if (/^\s*$/.test(l)) {
        blanks++;
        if (blanks >= 2) { lastNum = null; lastIndent = null; }   // 连续空行 ⇒ 视为换块
        return;
      }

      // 分段点：ATX 标题、分隔线、以及"整行加粗"小标题（`**机制**` / `**机制**：`）—— 其后重新编号属正常
      const isBreak = /^\s*#{1,6}\s/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*\*\*[^*]+\*\*[:：]?\s*$/.test(l);
      const m = l.match(/^(\s*)(\d+)\.\s/);
      if (isBreak || !m) {
        if (isBreak) { lastNum = null; lastIndent = null; }
        /* 任何非列表项的正文行（`**表情包**（需在设置打开…）`、段落、表格…）都隔断了两个编号列表。
           上一条编号若不是紧邻的列表项，就不该参与"重复/倒退"比较 —— 重新起头是正常的。
           2026-10-11 实测：`docs\说明书-电脑端.md` L104-107 是颜文字 1-4、L111-115 是表情包 1-5，
           两个独立列表各自的 1. 原本被误报成"编号倒退"。 */
        else if (l.trim() && !/^\s*[-*+]\s/.test(l) && !/^\s*\|/.test(l)) { lastNum = null; lastIndent = null; }
        blanks = 0;
        return;
      }

      const indent = m[1].length, n = Number(m[2]);
      if (lastNum !== null && indent === lastIndent && n <= lastNum) {
        fails.push(`编号重复或倒退  L${i + 1}: 出现 ${n}. ，上一条是 ${lastNum}. —— ${l.trim().slice(0, 60)}`);
      }
      lastNum = n; lastIndent = indent; blanks = 0;
    });
  }

  // ---- 状态词共存（WARN，不判生死）----
  if (checkStatus) {
    const pendLines = [], doneLines = [];
    lines.forEach((l, i) => {
      if (l.includes('出稿待批')) return;                 // 规范句，不是状态记录
      if (PENDING.some(w => l.includes(w))) pendLines.push(i + 1);
      if (DONE.some(w => l.includes(w))) doneLines.push(i + 1);
    });
    if (pendLines.length && doneLines.length) {
      warns.push(`同文件既有"待批/待发"（L${pendLines.join(',')}）又有"已外发"（L${doneLines.join(',')}）—— 核一下是不是同一条`);
    }
  }

  // ---- refs 必须指向同一个号 ----
  const refs = [...text.matchAll(/refs #(\d+)/g)].map(m => m[1]);
  if (refs.length && new Set(refs).size > 1) {
    fails.push(`refs 指向不一致: ${[...new Set(refs)].map(n => '#' + n).join(' / ')}`);
  }

  // ---- 尾部多余空行 ----
  const blanks = countTrailingBlank(text);
  if (blanks > 0) fails.push(`文件尾部有 ${blanks} 个多余空行`);

  // 占位符（`#___` / `#__\_`）不在这里查 —— 那是外发闸门的职责，见 `_check_publish.js` 第 1 条断言。
  // 内部文档讲这个坑时本来就会把两种写法写出来，在这里查只会误报。

  return { fails, warns };
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const docs = args.length ? args.map(a => path.resolve(a)) : defaultFiles();
const mem = args.length ? [] : memoryFiles();

let bad = 0, warned = 0, scanned = 0;

console.log('--- 记录类文档 ---');
for (const f of docs) {
  if (!fs.existsSync(f)) { console.log(`· 跳过（不存在）${path.relative(ROOT, f)}`); continue; }
  scanned++;
  const rel = path.relative(ROOT, f);
  const { fails, warns } = checkContent(f, fs.readFileSync(f, 'utf8'));
  if (fails.length) {
    bad++;
    console.log(`\n✗ ${rel}  —— ${fails.length} 处不合格`);
    fails.forEach(x => console.log('   · ' + x));
  } else {
    console.log(`✓ ${rel}`);
  }
  if (warns.length) { warned += warns.length; warns.forEach(x => console.log('   ⚠ 需人看：' + x)); }
}

if (mem.length) {
  console.log('\n--- 记忆文件（只查尾部空行）---');
  let memBad = 0;
  for (const f of mem) {
    scanned++;
    const { fails } = checkContent(f, fs.readFileSync(f, 'utf8'), { checkLists: false, checkStatus: false });
    const only = fails.filter(x => x.includes('尾部'));
    if (only.length) { bad++; memBad++; console.log(`✗ ${path.relative(path.join(ROOT, '.workbuddy', 'memory'), f)}  —— ${only.join('; ')}`); }
  }
  if (!memBad) console.log('✓ 全部正常（含 ' + mem.length + ' 个记忆文件）');
}

console.log('\n检查 ' + scanned + ' 个文件：' + (bad ? bad + ' 个不合格' : '全部通过') + (warned ? `，另有 ${warned} 条提示待人看` : ''));
process.exit(bad ? 1 : 0);
