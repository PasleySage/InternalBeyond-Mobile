/* _check_tables.js — 对外文稿的表格读数自查
 *
 * 为什么有这个：2026-10-10 写 issue 时，把用量表的「输入未缓存」与「缓存读」两列
 * 混为一谈，又把倒序列表当正序读，错误数字进了对外文稿。纪律会失手，检查不会。
 *
 * 它做什么：扫对外文稿里的 markdown 表格，检查三件机械上可判定的事——
 *   1. 表头有同义多列（如「入参」「输入」「输入未缓存」）却逐行不同写法 ⇒ 容易串列
 *   2. 同一列的单元格量纲不一致（混了「k」后缀与纯数字、混了不同小数位） ⇒ 抄错列
 *   3. 单元格写着数字、但该行其它列是文字（说明这是张混合表，需人工确认是否按列取）
 * 另有：把表头与首行数据原样打印，便于人工用「按列名取」的顺序核对一遍。
 *
 * 用法（在外发之前跑，正文所在的 md 都该跑）：
 *   node _check_tables.js <file.md> [more.md …]
 *   node _check_tables.js --dir <目录>     # 递归扫 *.md
 *
 * 退出码：0 = 无机械疑点（不等于内容正确）；1 = 有疑点；2 = 参数错。
 * 本脚本只读，不改文件。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* 同义列：出现两个以上容易被当作同一列的表头。
 * ⚠️ 英文支持（2026-10-14 补）：原表全是中文/驼峰词，英文表头（Input / Cache read / Output）
 * 一个都命中不到 —— 而这三个恰好是最易串列的组合。实测英文表 rc=0「0 处需人看」。
 * 英文词条一律小写，匹配时对表头小写化。 */
const SYNONYM_GROUPS = [
  ['输入', '入参', '输入未缓存', '未缓存', 'prompt_tokens', 'input', 'uncached', 'fresh input'],
  ['缓存读', '缓存', 'cache_read_input_tokens', 'hit', 'cache read', 'cache_read', 'cached', 'cache hit', 'from cache'],
  ['输出', '出参', 'completion_tokens', 'output', 'completion'],
  ['时间', '时刻', 'timestamp', 'time', 'clock'],
];

/* 数字单元格的量纲识别 */
function shape(cell) {
  const s = String(cell).trim().replace(/[,\s]/g, '');
  /* 英文文本判定必须在**去空格之前**做（2026-10-14 实测踩坑）：上面那行 replace 已把空格
   * 全部去掉，`full window sent` 变成 `fullwindowsent`，任何依赖 `\s` 的锚点都不成立。
   * 这里用原始 trimmed 值判定，并要求至少两个连续英文字母，避免把 'k'/'M'/'x' 这类
   * 单字母单位误判成文字列（那会破坏 'num+unit' 的判定）。 */
  const raw = String(cell).trim();
  const latin = /(?:^|[^A-Za-z0-9%])[A-Za-z]{2,}(?:[^A-Za-z0-9]|$)/.test(raw);
  if (!s) return 'empty';
  if (/^[+-]?\d+(\.\d+)?[kK]$/.test(s)) return 'num+k';
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return 'num';
  if (/^[+-]?\d+(\.\d+)?%$/.test(s)) return 'pct';
  if (/^[+-]?\d+(\.\d+)?[a-zA-Z]{1,3}$/.test(s)) return 'num+unit';
  if (/[一-鿿]/.test(s)) return 'text';
  if (latin) return 'text';
  return 'other';
}

function parseTables(lines) {
  const tables = [];
  let cur = null;
  const flush = () => { if (cur && cur.rows.length) tables.push(cur); cur = null; };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    const isRow = /^\s*\|.*\|\s*$/.test(t);
    const isSep = isRow && /^\s*\|[\s:|-]+\|\s*$/.test(t);

    if (isSep) {
      /* 分隔行属于当前表（只可能紧跟在表头后），不另起表，也不结束表 */
      if (cur) cur.sepAfter = cur.rows.length === 1;
      continue;
    }
    if (isRow) {
      if (!cur) cur = { start: i + 1, rows: [], sepAfter: false };
      cur.rows.push({ line: i + 1, cells: splitRow(t) });
      continue;
    }
    flush();
  }
  flush();

  /* 判据按可靠性排序，任一命中即认为首行是表头：
     1. 首行后面紧跟分隔行（`|---|---|`，标准 markdown 表格）—— 最确定
     2. 首行任一格为空（`| | 第一次 | 第二次 |` 这种两列表，本仓的实测稿都这么写）
     3. 首行任一格形如 `**粗体**` 或以 `：` 结尾（表头标签的常见写法）
     都不命中就整表当无表头处理 —— 宁可漏报，不可把数据行误当列名，
     那正是这个脚本要消灭的错误本身。*/
  return tables.filter(tb => tb.rows.length >= 2).map(tb => {
    const first = tb.rows[0].cells;
    const sep = tb.sepAfter === true;
    const emptyCell = first.some(c => c === '');
    const labelish = first.some(c => /^\*\*.+\*\*$/.test(c) || /：$/.test(c));
    const hasHeader = sep || emptyCell || labelish;
    return {
      start: tb.start,
      head: hasHeader ? tb.rows[0] : null,
      data: hasHeader ? tb.rows.slice(1) : tb.rows
    };
  });
}

function splitRow(t) {
  return t.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
}

function checkFile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    return [{ sev: 'err', line: 0, msg: `读不了：${e.message}` }];
  }
  const lines = raw.split(/\r?\n/);
  const issues = [];
  const tables = parseTables(lines);
  if (!tables.length) return issues;

  tables.forEach(tb => {
    const data = tb.data;
    const tag = `L${tb.start}`;
    const colName = (i) => (tb.head && tb.head.cells[i]) || `第${i + 1}列`;

    /* 1. 同义列 */
    if (tb.head) {
      SYNONYM_GROUPS.forEach(group => {
        const hit = tb.head.cells.filter(c => group.some(g => c.toLowerCase().includes(g.toLowerCase())));
        if (hit.length >= 2) {
          issues.push({
            sev: 'warn', line: tb.start,
            msg: `${tag} 表头有同义多列 [${hit.join(' | ')}] —— 抄数时按【列名】取，不要按列序；这类表最容易串列`
          });
        }
      });
    }

    /* 2. 同列量纲不一致 —— 只在**至少一半是数字**的列上判，否则说明这是文字说明列，
          （像「改动点」「涉及位置」这种一格一说法），量纲本来就不该统一。 */
    const ncol = Math.max(...data.map(r => r.cells.length));
    for (let c = 0; c < ncol; c++) {
      const shapes = new Map();
      data.forEach(r => {
        const sh = shape((r.cells || [])[c] == null ? '' : r.cells[c]);
        if (sh !== 'empty') shapes.set(sh, (shapes.get(sh) || 0) + 1);
      });
      const total = [...shapes.values()].reduce((a, b) => a + b, 0);
      const numish = (shapes.get('num') || 0) + (shapes.get('num+k') || 0) +
                     (shapes.get('num+unit') || 0) + (shapes.get('pct') || 0);
      if (shapes.size >= 2 && total >= 2 && numish / total >= 0.5) {
        const kinds = [...shapes.entries()].map(([k, n]) => `${k}×${n}`).join('  ');
        issues.push({
          sev: 'warn', line: tb.start,
          msg: `${tag} 第 ${c + 1} 列「${colName(c)}」量纲不统一：${kinds} —— 确认每格是否同一单位`
        });
      }
    }

    /* 3. 混合表提示 */
    const hasNumCol = Array.from({ length: ncol }, (_, c) =>
      data.some(r => shape((r.cells || [])[c] || '').startsWith('num'))).some(Boolean);
    const textCells = data.reduce((n, r) => n + (r.cells || []).filter(x => shape(x) === 'text').length, 0);
    if (hasNumCol && textCells > 0) {
      issues.push({
        sev: 'note', line: tb.start,
        msg: `${tag} 数字列与文字列混排 —— 若要引用某格的数，回原表按列名核一遍`
      });
    }

    /* 4. 打印列名 → 首行取值，供人工按列名核对 */
    issues.push({
      sev: 'dump', line: tb.start,
      msg: `${tag} 列名 → 首行取值：\n` +
           Array.from({ length: ncol }, (_, c) =>
             `        ${c + 1}. ${colName(c)} = ${(data[0].cells || [])[c] == null ? '(缺)' : data[0].cells[c]}`
           ).join('\n') +
           (tb.head ? '' : '\n        （本表无表头，列名按位置编；抄数前请确认来源表的列序）')
    });
  });

  return issues;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('用法：node _check_tables.js <file.md …>  |  --dir <目录>');
    process.exit(2);
  }
  let files = [];
  if (args[0] === '--dir') {
    if (!args[1] || !fs.existsSync(args[1])) { console.error('--dir 需要一个存在的目录'); process.exit(2); }
    files = walk(args[1], []);
  } else {
    files = args.filter(a => fs.existsSync(a));
    if (!files.length) { console.error('没有可读的文件'); process.exit(2); }
  }

  let warn = 0, note = 0, dump = 0, err = 0;
  for (const f of files) {
    const issues = checkFile(f);
    if (!issues.length) continue;
    console.log(`\n=== ${f} ===`);
    for (const i of issues) {
      if (i.sev === 'dump') { dump++; console.log(`  [核对表] ${i.msg}`); }
      else if (i.sev === 'err') { err++; console.log(`  ✗ ${i.msg}`); }
      else if (i.sev === 'warn') { warn++; console.log(`  ! L${i.line} ${i.msg}`); }
      else { note++; console.log(`  · L${i.line} ${i.msg}`); }
    }
  }
  console.log(`\n检查 ${files.length} 个文件：${warn} 处需人看、${note} 处提示、${dump} 张表待人工按列名核对、${err} 处出错`);
  console.log('提醒：脚本只查机械疑点，数字本身对不对仍要回原表核。');
  process.exit(warn + err > 0 ? 1 : 0);
}

main();