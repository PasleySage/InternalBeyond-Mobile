/* 1) 复核 V2.4.3 那轮 diff 里是否已有「记忆检索 / 群聊」改动
   2) 电脑端 Sui-IB/InternalBeyond 逐提交 blob 对照，定位本地 Windows 副本落在哪个提交 */
const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const DESK = 'Sui-IB/InternalBeyond';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 200); } };
const out = [];

/* ---- 1 ---- */
const d243 = gh('api "repos/' + UP + '/compare/eae90dec...dc7006db" -H "Accept: application/vnd.github.diff"');
fs.writeFileSync(__dirname + '/_ib_v243.diff', d243, 'utf8');
const cnt = (re) => (d243.match(re) || []).length;
out.push('== V2.4.3（eae90dec...dc7006db）diff 关键词计数 ==');
out.push('  diff 长度 = ' + d243.length);
['记忆', '检索', '标签', '群聊', '表情包', '颜文字', 'dk-pic', 'kao-panel', 'ib-marq-pack', 'press'].forEach(k => {
  out.push('  ' + k.padEnd(12) + ' 出现 ' + (d243.split(k).length - 1) + ' 次');
});

/* ---- 2 ---- */
const local = 'D:/IB-Workspace-Desktop/InternalBeyond.html';
const buf = fs.readFileSync(local);
const L = { size: buf.length, sha: crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex') };
out.push('\n== 电脑端本地 Windows/InternalBeyond.html ==');
out.push('  字节 = ' + L.size + '　blob = ' + L.sha);

const deskLog = JSON.parse(gh('api "repos/' + DESK + '/commits?per_page=12"'));
out.push('\n== Sui-IB/InternalBeyond 提交与 InternalBeyond.html blob ==');
out.push('  ' + 'commit'.padEnd(12) + 'date'.padEnd(22) + 'html blob'.padEnd(12) + 'size'.padEnd(10) + 'readme blob');
deskLog.forEach(c => {
  const t = JSON.parse(gh('api "repos/' + DESK + '/git/trees/' + c.sha + '?recursive=0"'));
  const h = t.tree.find(x => x.path === 'InternalBeyond.html');
  const r = t.tree.find(x => x.path === 'README.md');
  const mark = (h && h.sha === L.sha) ? '  <== 本地就是这版' : '';
  out.push('  ' + c.sha.slice(0, 8).padEnd(12) + c.commit.committer.date.padEnd(22) + (h ? h.sha.slice(0, 8) : '?').padEnd(12) + String(h ? h.size : '?').padEnd(10) + (r ? r.sha.slice(0, 8) : '?') + mark);
});

/* 电脑端两轮提交的区间统计 */
const dcp = JSON.parse(gh('api "repos/' + DESK + '/compare/e58572b5...66725d2f"'));
if (dcp) {
  out.push('\n== 电脑端 e58572b5...66725d2f ==');
  out.push('  ahead_by=' + dcp.ahead_by + ' total_commits=' + dcp.total_commits);
  (dcp.commits || []).forEach(c => out.push('   ' + c.sha.slice(0, 8) + '  ' + c.commit.committer.date + '  ' + c.commit.message.split('\n')[0]));
  (dcp.files || []).forEach(f => out.push('   ' + f.status + ' +' + f.additions + '/-' + f.deletions + '  ' + f.filename));
}

fs.writeFileSync(__dirname + '/_ib_v243b_extra.txt', out.join('\n'), 'utf8');
