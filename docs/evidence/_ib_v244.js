/* IB 手机端 V2.4.3b → V2.4.4：区间数据 + 常量/归档锚点 + diff 摘要 */
const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const A = __dirname + '/';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 200); } };
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const out = [];

const BASE = gh('api repos/PasleySage/InternalBeyond-Mobile/commits/main --jq .sha');
const HEAD = gh('api repos/' + UP + '/commits/main --jq .sha');
out.push('BASE(镜像 main) = ' + BASE);
out.push('HEAD(上游)      = ' + HEAD);
out.push('HEAD msg:\n---\n' + gh('api repos/' + UP + '/commits/' + HEAD + ' --jq .commit.message') + '\n---');
out.push('HEAD author = ' + gh('api repos/' + UP + '/commits/' + HEAD + ' --jq .commit.author.name') + ' / ' + gh('api repos/' + UP + '/commits/' + HEAD + ' --jq .commit.author.date'));

/* 关键文件 blob 对照 */
out.push('\n== contents API 对照 ==');
['index.html', 'ib-sw.js', 'README.md'].forEach(f => {
  const b = J(gh('api "repos/' + UP + '/contents/' + f + '?ref=' + BASE + '"'));
  const h = J(gh('api "repos/' + UP + '/contents/' + f + '?ref=' + HEAD + '"'));
  if (!h) { out.push('  ' + f + ' : 取不到'); return; }
  const bs = b ? b.sha.slice(0, 8) : '?', hs = h.sha.slice(0, 8);
  out.push('  ' + f.padEnd(12) + (bs === hs ? '未变  ' : '已变  ') + (b ? b.size : '?') + ' → ' + h.size + '  ' + bs + ' → ' + hs);
});

/* 两版原文 */
const dl = (ref, f, to) => { try { fs.writeFileSync(to, execSync('curl -sL --max-time 180 https://raw.githubusercontent.com/' + UP + '/' + ref + '/' + f, { encoding: 'utf8', maxBuffer: 1 << 28 }), 'utf8'); } catch (e) { out.push('下载失败 ' + f + '@' + ref + ': ' + e.message); } };
dl(BASE, 'index.html', A + '_b_index.html');
dl(HEAD, 'index.html', A + '_u_index.html');
dl(HEAD, 'ib-sw.js', A + '_u_sw.js');
dl(HEAD, 'README.md', A + '_u_readme.md');

const rd = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const b = rd(A + '_b_index.html'), u = rd(A + '_u_index.html'), sw = rd(A + '_u_sw.js'), nr = rd(A + '_u_readme.md');
const K = (s, re) => { const m = s.match(re); return m ? m.slice(1).join(' / ') : '?'; };
out.push('\n== 常量对照 ==');
out.push('  IB_VER   BASE = ' + K(b, /var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) + '   HEAD = ' + K(u, /var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/));
out.push('  DB_VER   BASE = ' + K(b, /DB_VER\s*=\s*(\d+)/) + '   HEAD = ' + K(u, /DB_VER\s*=\s*(\d+)/));
out.push('  cache    BASE = ' + K(b, /ib-cache-v\d+/) + '   HEAD = ' + K(u, /ib-cache-v\d+/) + '   （ib-sw.js HEAD = ' + K(sw, /ib-cache-v\d+/) + '）');
out.push('  长度      BASE = ' + b.length + ' chars   HEAD = ' + u.length + ' chars   Δ=' + (u.length - b.length));

out.push('\n== 归档项在上游 HEAD 的采纳状态 ==');
const chk = (n, re, src) => out.push('  ' + (re.test(src) ? '已采纳  ' : '未采纳  ') + n);
chk('诊断面板 _ibGuard', /_ibGuard/, u);
chk('各步耗时埋点 _ibStepLog / _ibTimed', /_ibStepLog|_ibTimed/, u);
chk('脱敏 _ibRedact', /_ibRedact/, u);
chk('VersionError 自愈 ib_verfix', /ib_verfix/, u);
chk('SW 压缩响应完整性（content-encoding）', /content-encoding/i, sw);

out.push('\n== 上游 README「最近更新」==');
const i2 = nr.indexOf('最近更新');
out.push(i2 >= 0 ? nr.slice(i2, i2 + 2200) : '(未找到)');

/* 原始 diff */
const diff = gh('api "repos/' + UP + '/compare/' + BASE + '...' + HEAD + '" -H "Accept: application/vnd.github.diff"');
fs.writeFileSync(A + '_ib_v244.diff', diff, 'utf8');
out.push('\n== diff 落盘 _ib_v244.diff，' + diff.length + ' 字符 ==');
['记忆', '检索', '标签', '群聊', '人格', '锚定', '表情包', '颜文字', 'accept'].forEach(k => out.push('  关键词 ' + k.padEnd(6) + ' 出现 ' + (diff.split(k).length - 1) + ' 次'));

/* 摘要 */
const lines = diff.split('\n');
const hunks = [];
let cur = null;
lines.forEach(l => {
  if (/^@@/.test(l)) { cur = { head: l, rows: [] }; hunks.push(cur); }
  else if (cur && /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)) cur.rows.push(l);
});
out.push('\n=== 共 ' + hunks.length + ' 个 hunk ===');
hunks.forEach((h, i) => {
  out.push('\n--- ' + h.head + ' ---');
  h.rows.forEach(r => out.push((r[0] === '-' ? '[-] ' : '[+] ') + r.slice(1, 940)));
});
const add = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
const del = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
out.push('\n=== 合计 +' + add + ' / -' + del + ' ===');

fs.writeFileSync(A + '_ib_v244_probe.txt', out.join('\n'), 'utf8');
