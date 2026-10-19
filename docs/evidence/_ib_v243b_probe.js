/* V2.4.3 → V2.4.3b 精确探针：区间 diff、常量对照、blob 对照、电脑端仓库现状 */
const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const FK = 'PasleySage/InternalBeyond-Mobile';
const DESK = 'Sui-IB/InternalBeyond';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 300); } };
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const out = [];

const base = gh('api repos/' + FK + '/commits/main --jq .sha');
const head = gh('api repos/' + UP + '/commits/main --jq .sha');
out.push('BASE = ' + base);
out.push('HEAD = ' + head);
out.push('HEAD msg = ' + gh('api repos/' + UP + '/commits/main --jq .commit.message'));
out.push('HEAD author = ' + gh('api repos/' + UP + '/commits/main --jq ".commit.author.name"') + ' / ' + gh('api repos/' + UP + '/commits/main --jq .commit.author.date'));

/* 原始 unified diff（compare 太大不给 patch） */
const diff = gh('api "repos/' + UP + '/compare/' + base + '...' + head + '" -H "Accept: application/vnd.github.diff"');
fs.writeFileSync(__dirname + '/_ib_v243b.diff', diff, 'utf8');
out.push('\n== diff 落盘 _ib_v243b.diff，' + diff.length + ' 字符 ==');

/* 关键文件在 BASE / HEAD 两版的 blob 与尺寸 */
out.push('\n== contents API：关键文件 blob 对照 ==');
['index.html', 'ib-sw.js', 'README.md', 'manifest.json', 'LICENSE'].forEach(f => {
  const a = J(gh('api "repos/' + UP + '/contents/' + f + '?ref=' + base + '"'));
  const b = J(gh('api "repos/' + UP + '/contents/' + f + '?ref=' + head + '"'));
  if (!a || !b) { out.push('  ' + f + ' : 取不到'); return; }
  out.push('  ' + f.padEnd(14) + (a.sha === b.sha ? '未变  ' : '已变  ') + a.size + ' → ' + b.size + '  ' + a.sha.slice(0, 8) + ' → ' + b.sha.slice(0, 8));
});

/* 上游仓库文件总览（HEAD 根目录） */
const root = J(gh('api "repos/' + UP + '/contents/?ref=' + head + '"'));
if (root) out.push('\n== 上游 HEAD 根目录 ==\n  ' + root.map(x => x.name + '(' + x.size + ')').join('  '));

/* 两版原文对照常量 */
try {
  fs.writeFileSync(__dirname + '/_b_index.html', execSync('curl -sL --max-time 120 https://raw.githubusercontent.com/' + UP + '/' + base + '/index.html', { encoding: 'utf8', maxBuffer: 1 << 28 }), 'utf8');
} catch (e) { out.push('下载 BASE index.html 失败: ' + e.message); }
const bi = fs.existsSync(__dirname + '/_b_index.html') ? fs.readFileSync(__dirname + '/_b_index.html', 'utf8') : '';
const hi = fs.existsSync(__dirname + '/_u_index.html') ? fs.readFileSync(__dirname + '/_u_index.html', 'utf8') : '';
out.push('\n== BASE/HEAD index.html 常量对照 ==');
const ver = (s) => (s.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) || ['?', '?', '?']).slice(1).join(' / ');
out.push('  IB_VER  BASE = ' + ver(bi) + '   HEAD = ' + ver(hi));
const dbv = (s) => (s.match(/DB_VER\s*=\s*(\d+)/) || ['?', '?'])[1];
out.push('  DB_VER  BASE = ' + dbv(bi) + '   HEAD = ' + dbv(hi));
const cache = (s) => (s.match(/ib-cache-v\d+/) || ['?'])[0];
out.push('  cache   BASE = ' + cache(bi) + '   HEAD = ' + cache(hi));
out.push('  长度      BASE = ' + bi.length + ' chars   HEAD = ' + hi.length + ' chars   Δ=' + (hi.length - bi.length));
out.push('  CRLF 行数  BASE = ' + (bi.split('\n').length) + '   HEAD = ' + (hi.split('\n').length));

/* 归档项采纳复检（形态 B） */
out.push('\n== 归档四项在上游 HEAD 的采纳状态 ==');
[['诊断面板 _ibGuard', /_ibGuard/], ['各步耗时埋点 _ibStepLog', /_ibStepLog|_ibTimed/], ['脱敏 _ibRedact', /_ibRedact/], ['VersionError 自愈 ib_verfix', /ib_verfix/]].forEach(([n, re]) => out.push('  ' + (re.test(hi) ? '已采纳' : '未采纳') + '  ' + n));
out.push('  SW 压缩响应完整性（ib-sw.js HEAD）: ' + (/content-encoding/i.test(execSync('curl -sL --max-time 30 https://raw.githubusercontent.com/' + UP + '/main/ib-sw.js', { encoding: 'utf8' })) ? '已采纳' : '未采纳'));

/* 电脑端仓库现状（是否也有新提交） */
out.push('\n== 电脑端 ' + DESK + ' 现状 ==');
out.push('  head = ' + gh('api repos/' + DESK + '/commits/main --jq .sha'));
const dlog = J(gh('api "repos/' + DESK + '/commits?per_page=6"'));
if (dlog) dlog.forEach(c => out.push('   ' + c.sha.slice(0, 8) + '  ' + c.commit.committer.date + '  ' + c.commit.message.split('\n')[0]));

fs.writeFileSync(__dirname + '/_ib_v243b_probe.txt', out.join('\n'), 'utf8');
