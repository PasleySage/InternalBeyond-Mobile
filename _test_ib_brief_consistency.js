/* 变更一览一致性自检（skill: upstream-update-brief §4b 的两份同源必做项）
   用法：node _test_ib_brief_consistency.js [基准名 | 路径]
     · 只给名字（例 IB-upstream-V2.4.3变更一览）→ 在本目录或 docs/briefs/ 下找
     · 给路径（绝对路径，或含 \ 或 / 的相对路径）→ 按路径找，带不带 .html 都行
   不传参数时：扫本目录与 docs/briefs/，取 mtime 最新的 *变更一览.html 那一对。
   校验：分组数/顺序/标题、每组条目数与声明项数、逐条条目名、标注词、代码提示、标注用词范围、图例覆盖、提交号。 */
'use strict';
const fs = require('fs');
const path = require('path');
const base = __dirname + path.sep;
const BRIEFS = path.join(__dirname, 'docs', 'briefs') + path.sep;

function pickBase() {
  const arg = process.argv[2];
  if (arg) {
    const looksLikePath = path.isAbsolute(arg) || /[\\/]/.test(arg);
    if (looksLikePath) return path.resolve(arg).replace(/\.html$/i, '');
    /* 纯名字：先根目录、再 docs/briefs/（2026-10-19 重构后一览归档在那边） */
    for (const dir of [base, BRIEFS]) {
      const p = dir + arg;
      if (fs.existsSync(p) || fs.existsSync(p + '.html')) return p.replace(/\.html$/i, '');
    }
    return base + arg;
  }
  const cands = [];
  [base, BRIEFS].forEach(dir => {
    let list; try { list = fs.readdirSync(dir); } catch (e) { return; }
    list.filter(f => /变更一览\.html$/.test(f))
      .forEach(f => cands.push({ p: dir + f.replace(/\.html$/i, ''), t: fs.statSync(dir + f).mtimeMs }));
  });
  if (!cands.length) { console.error('没找到 *变更一览.html'); process.exit(2); }
  cands.sort((a, b) => b.t - a.t);
  return cands[0].p;
}

const B = pickBase();
const HTML = B + '.html';
const MD = B + '.md';
if (!fs.existsSync(MD)) { console.error('缺少同名的 .md：' + MD); process.exit(2); }
const html = fs.readFileSync(HTML, 'utf8');
const md = fs.readFileSync(MD, 'utf8');

let pass = 0, fail = 0;
const out = [];
const ok = (c, n, e) => { c ? pass++ : fail++; out.push((c ? '  PASS  ' : '  FAIL  ') + n + (!c && e !== undefined ? '  → ' + e : '')); };
const norm = s => String(s).replace(/<[^>]+>/g, '').replace(/[`*]/g, '').replace(/[""]/g, '"')
  .replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s　]/g, '').replace(/[（(]\s*项.*$/, '').trim();

/* ---- 解析 HTML ---- */
const htmlSecs = [];
html.replace(/<section class="sec">([\s\S]*?)<\/section>/g, (_, sec) => {
  const ttl = (sec.match(/<span class="ttl">([\s\S]*?)<\/span>/) || [])[1] || '';
  const cnt = (sec.match(/<span class="cnt">([\s\S]*?)<\/span>/) || [])[1] || '';
  const items = [];
  sec.replace(/<li>([\s\S]*?)<\/li>/g, (__, li) => {
    const t = (li.match(/<div class="t">([\s\S]*?)<\/div>/) || [])[1] || '';
    const metaHtml = (li.match(/<div class="meta">([\s\S]*?)<\/div>/) || [])[1] || '';
    const badge = (metaHtml.match(/<span class="badge [^"]*">([^<]*)<\/span>/) || [])[1] || '';
    const code = (metaHtml.match(/<code>([^<]*)<\/code>/) || [])[1] || '';
    items.push({ t: norm(t), badge: norm(badge), code: norm(code) });
    return '';
  });
  htmlSecs.push({ ttl: norm(ttl), cnt: norm(cnt), items });
  return '';
});

/* ---- 解析 MD（只认「## …（N 项）」＋紧跟条目表的分组） ---- */
const mdSecs = [];
let cur = null, pending = null, inTable = false;
md.split('\n').forEach(line => {
  const h = /^## (.+)$/.exec(line);
  if (h) {
    const raw = h[1];
    const cnt = (/（([^（）]*项[^（）]*)）\s*$/.exec(raw) || [])[1] || '';
    pending = { ttl: norm(raw.replace(/（[^（）]*项[^（）]*）\s*$/, '')), cnt: norm(cnt), items: [] };
    cur = null; inTable = false;
    return;
  }
  if (inTable && cur) {
    if (!/^\|/.test(line)) { if (line.trim() === '') { inTable = false; cur = null; } return; }
    const c = line.split('|').map(x => x.trim());
    if (c.length < 6 || /^-+$/.test(c[1]) || c[1] === '项') return;
    cur.items.push({ t: norm(c[1]), badge: norm(c[3]), code: norm(c[4]) });
    return;
  }
  if (pending && /^\|\s*项\s*\|/.test(line)) { inTable = true; cur = pending; mdSecs.push(pending); }
});

out.push('基准名：' + B);
out.push('\n[1] 分组：数量与顺序');
ok(htmlSecs.length === mdSecs.length, '分组数一致', htmlSecs.length + ' vs ' + mdSecs.length);
htmlSecs.forEach((s, i) => {
  const m = mdSecs[i] || { ttl: '(缺)' };
  ok(s.ttl === m.ttl, '第 ' + (i + 1) + ' 组标题一致', '"' + s.ttl + '" vs "' + m.ttl + '"');
});

out.push('\n[2] 每组条目数（并与标题声明的项数核对）');
htmlSecs.forEach((s, i) => {
  const m = mdSecs[i] || { items: [] };
  ok(s.items.length === m.items.length, '第 ' + (i + 1) + ' 组「' + s.ttl + '」条数一致',
     s.items.length + ' vs ' + m.items.length);
  const n = (s.cnt.match(/^(\d+)/) || [])[1];
  ok(!n || Number(n) === s.items.length, '第 ' + (i + 1) + ' 组声明项数与实际一致', s.cnt + ' / 实际 ' + s.items.length);
});

out.push('\n[3] 条目名（逐条、按序）');
htmlSecs.forEach((s, i) => {
  const m = mdSecs[i] || { items: [] };
  s.items.forEach((it, k) => {
    const mm = m.items[k] || {};
    ok(it.t === mm.t, '第 ' + (i + 1) + ' 组第 ' + (k + 1) + ' 条同名', '"' + it.t + '" vs "' + (mm.t || '(缺)') + '"');
  });
});

out.push('\n[4] 标注词（逐条）');
const vocab = new Set();
htmlSecs.forEach((s, i) => {
  const m = mdSecs[i] || { items: [] };
  s.items.forEach((it, k) => {
    vocab.add(it.badge);
    const mm = m.items[k] || {};
    ok(it.badge === mm.badge, '第 ' + (i + 1) + ' 组第 ' + (k + 1) + ' 条标注一致',
       '"' + it.badge + '" vs "' + (mm.badge || '(缺)') + '"');
  });
});

out.push('\n[5] 代码 / 文件提示（逐条）');
htmlSecs.forEach((s, i) => {
  const m = mdSecs[i] || { items: [] };
  s.items.forEach((it, k) => {
    const mm = m.items[k] || {};
    ok(it.code === mm.code, '第 ' + (i + 1) + ' 组第 ' + (k + 1) + ' 条代码提示一致',
       '"' + it.code + '" vs "' + (mm.code || '(缺)') + '"');
  });
});

out.push('\n[6] 标注用词范围、图例覆盖、提交号与关键行数');
const allowed = ['本次同步', '与我们重叠', '同向不同实现', '同名不同物', '建议保留'];
[...vocab].forEach(v => ok(allowed.indexOf(v) >= 0, '标注词在约定集合内：' + v));
/* 图例必须覆盖每条用到的标注词；HTML 取 footer 的「图例：」那段，MD 取「**图例**：」那一行 */
const legendOf = (t, re) => { const m = t.match(re); return m ? m[0] : ''; };
const lgH = legendOf(html, /图例：[\s\S]{0,600}?<\/footer>/);
const lgM = legendOf(md, /\*\*图例\*\*：[^\n]*/);
[...vocab].forEach(v => ok(lgH.indexOf(v) >= 0, 'HTML 图例含用到的标注词：' + v));
[...vocab].forEach(v => ok(lgM.indexOf(v) >= 0, 'MD 图例含用到的标注词：' + v));
const sha = s => new Set((html + md).match(/\b[0-9a-f]{7,8}\b/g) || []);
const hShas = sha(html), mShas = sha(md);
[...hShas].forEach(s => ok(mShas.has(s), 'MD 也含 HTML 里的提交号 ' + s));
/* 区间不再写死：从两份文件的「BASE...HEAD」里取，两处必须一致，且 MD 要含这两个提交号 */
const rng = t => { const m = t.match(/([0-9a-f]{7,8})\.\.\.([0-9a-f]{7,8})/); return m ? [m[1], m[2]] : null; };
const rh = rng(html), rm = rng(md);
ok(!!rh && !!rm, '能解析出提交区间（BASE...HEAD）', JSON.stringify([rh, rm]));
if (rh && rm) {
  ok(rh[0] === rm[0] && rh[1] === rm[1], 'HTML / MD 的提交区间一致', rh.join('...') + ' vs ' + rm.join('...'));
  [rh[0], rh[1]].forEach(s => ok(md.includes(s), 'MD 含区间提交号 ' + s));
}
ok(!/Pasleey|Pasly|crazySage/i.test(md), 'MD 无仓库名拼写错误');

out.push('\n==============================');
out.push('通过 ' + pass + ' / 失败 ' + fail);
out.push('==============================');
console.log(out.join('\n'));
process.exit(fail ? 1 : 0);
