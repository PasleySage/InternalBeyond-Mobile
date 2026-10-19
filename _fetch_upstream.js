#!/usr/bin/env node
/*
 * _fetch_upstream.js —— 上游快照的**唯一取数入口**（2026-09-19 建）
 *
 * 为什么要有它：同一个 3.3 MB 的 index.html 在一轮会话里被下载过 5 次以上，
 * 每次落点都不同（_up.html / _up_pr.html / _up_index_V244.html / up.html …），
 * 最后在工作区根目录留下一份 3.3 MB 的未声明残留。
 *
 * 约定：
 *   - 快照只落在本目录（Android\），文件名固定为 _up_<short7>.html
 *   - 落盘前打印字节数与 sha256；可用 --expect-sha 断言前缀
 *   - 它是**可重生成件**（CONTEXT.md「残留」判定：先看有没有声明，再看能不能重生成）
 *     ⇒ 用完跑 `node _fetch_upstream.js --clean` 清掉，别留在工作区根目录
 *
 * 用法：
 *   node _fetch_upstream.js 1e2725b0
 *   node _fetch_upstream.js main --expect-sha c16aca6e5ca59fde
 *   node _fetch_upstream.js 9ef2ed12 --repo Sui-IB/InternalBeyond --file InternalBeyond.html
 *   node _fetch_upstream.js --clean
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_REPO = 'Sui-IB/InternalBeyond-Mobile';
const DEFAULT_FILE = 'index.html';

function usage() {
  console.log([
    '用法: node _fetch_upstream.js <commit|branch> [选项]',
    '      node _fetch_upstream.js --clean',
    '',
    '选项:',
    '  --repo <owner/name>   默认 ' + DEFAULT_REPO,
    '  --file <path>         仓库内路径，默认 ' + DEFAULT_FILE + '（电脑端用 InternalBeyond.html）',
    '  --out <path>          自定义落点（默认 Android\\_up_<short7>.html）',
    '  --expect-sha <前缀>   sha256 不以该前缀开头就失败退出',
    '  --clean               删除本目录下所有 _up_*.html 快照'
  ].join('\n'));
}

(async () => {
  const argv = process.argv.slice(2);
  const o = { ref: null, repo: DEFAULT_REPO, file: DEFAULT_FILE, out: null, expect: null, clean: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clean') o.clean = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--file') o.file = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--expect-sha') o.expect = argv[++i];
    else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
    else if (a.startsWith('--')) { console.error('未知参数: ' + a); usage(); process.exit(2); }
    else o.ref = a;
  }

  const dir = __dirname;

  if (o.clean) {
    const hits = fs.readdirSync(dir).filter(f => /^_up_[0-9a-f]+\.html$/i.test(f));
    hits.forEach(f => { fs.unlinkSync(path.join(dir, f)); console.log('removed  ' + f); });
    console.log('清理完成，共 ' + hits.length + ' 个快照');
    return;
  }

  if (!o.ref) { usage(); process.exit(2); }

  const short = /^[0-9a-f]{7,40}$/i.test(o.ref)
    ? o.ref.slice(0, 7)
    : o.ref.replace(/[^A-Za-z0-9._-]/g, '_');

  const url = `https://raw.githubusercontent.com/${o.repo}/${o.ref}/${o.file}`;
  const out = o.out || path.join(dir, `_up_${short}.html`);

  console.log('GET     ' + url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) { console.error('HTTP ' + res.status + ' ' + res.statusText); process.exit(1); }

  const buf = Buffer.from(await res.arrayBuffer());
  const sha = crypto.createHash('sha256').update(buf).digest('hex');

  if (o.expect) {
    const want = o.expect.toLowerCase();
    if (!sha.startsWith(want)) {
      console.error('sha256 不符：期望以 ' + want + ' 开头，实得 ' + sha);
      console.error('（不要拿这份快照去对行号 —— 先确认 commit 是不是你要的那个）');
      process.exit(1);
    }
    console.log('sha256  与 --expect-sha 相符 ✓');
  }

  fs.writeFileSync(out, buf);
  console.log('saved   ' + path.basename(out) + '   ' + buf.length + ' B');
  console.log('sha256  ' + sha);
  console.log('用完清理: node _fetch_upstream.js --clean');
})().catch(e => {
  console.error('失败：' + ((e && e.message) || e));
  process.exit(1);
});
