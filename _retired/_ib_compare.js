const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const BASE = 'e7d12621e59decab77cd2e2c276c5f6b630bd83b'; /* V2.4.0b，我们补丁的基线 */
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1024 * 1024 * 80 }).trim(); } catch (e) { return 'ERR ' + String(e.stdout || e.message).slice(0, 200); } };

const out = [];
const head = gh('api repos/' + UP + '/commits/main --jq .sha');
out.push('new_head = ' + head);
const cp = JSON.parse(gh('api repos/' + UP + '/compare/' + BASE + '...' + head));
out.push('status=' + cp.status + ' ahead_by=' + cp.ahead_by + ' behind_by=' + cp.behind_by + ' total_commits=' + cp.total_commits);
out.push('files_changed=' + (cp.files || []).length + ' additions=' + (cp.files || []).reduce((s, f) => s + f.additions, 0) + ' deletions=' + (cp.files || []).reduce((s, f) => s + f.deletions, 0));
out.push('\n== commits（旧→新）==');
(cp.commits || []).forEach((c, i) => {
  out.push(String(i + 1).padStart(2) + '. ' + c.sha.slice(0, 8) + '  ' + String(c.commit.author.date).slice(0, 16) + '  ' + c.commit.author.name + '\n    ' + c.commit.message.split('\n')[0]);
});
out.push('\n== files ==');
(cp.files || []).sort((a, b) => (b.changes) - (a.changes)).forEach(f => out.push('  ' + f.status + ' +' + f.additions + '/-' + f.deletions + '  ' + f.filename));

fs.writeFileSync(__dirname + '/_ib_compare.txt', out.join('\n'), 'utf8');

/* 顺带取新版版本号 */
try {
  const r = execSync('curl -sL --max-time 40 https://raw.githubusercontent.com/' + UP + '/main/index.html', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 });
  const m = r.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/);
  fs.writeFileSync(__dirname + '/_ib_ver.txt', 'new upstream IB_VER = ' + (m ? m[1] + ' (' + m[2] + ')' : '未找到') + '\nsize=' + r.length, 'utf8');
} catch (e) { fs.writeFileSync(__dirname + '/_ib_ver.txt', 'ERR ' + e.message, 'utf8'); }
console.log('done');
