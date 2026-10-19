/* 上一轮同步点之后，上游又更新了什么（含锚点重叠判定与发布说明） */
const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const FK = 'PasleySage/InternalBeyond-Mobile';
const DESK = 'Sui-IB/InternalBeyond';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 27 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 200); } };
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const out = [];

const forkMain = gh('api repos/' + FK + '/commits/main --jq .sha');
const upHead = gh('api repos/' + UP + '/commits/main --jq .sha');
out.push('本地镜像 main = ' + forkMain.slice(0, 12) + '（上一轮同步点）');
out.push('上游现在 head = ' + upHead.slice(0, 12));
out.push('上游 head 日期 = ' + gh('api repos/' + UP + '/commits/main --jq .commit.committer.date'));

const cp = J(gh('api repos/' + UP + '/compare/' + forkMain + '...' + upHead));
if (cp) {
  out.push('\nstatus=' + cp.status + ' ahead_by=' + cp.ahead_by + ' behind_by=' + cp.behind_by + ' total_commits=' + cp.total_commits);
  const f = cp.files || [];
  out.push('files=' + f.length + '  +' + f.reduce((s, x) => s + x.additions, 0) + '/-' + f.reduce((s, x) => s + x.deletions, 0));
  out.push('\n== commits（旧→新）==');
  (cp.commits || []).forEach((c, i) => out.push(String(i + 1).padStart(2) + '. ' + c.sha.slice(0, 8) + '  ' + String(c.commit.committer.date).slice(0, 16) + '  ' + c.commit.message.split('\n')[0]));
  out.push('\n== files ==');
  f.sort((a, b) => b.changes - a.changes).forEach(x => out.push('  ' + x.status + '  +' + x.additions + '/-' + x.deletions + '  ' + x.filename));
} else out.push('compare 失败');

/* 上游新版关键文件 */
try {
  fs.writeFileSync(__dirname + '/_u_index.html', execSync('curl -sL --max-time 90 https://raw.githubusercontent.com/' + UP + '/main/index.html', { encoding: 'utf8', maxBuffer: 1 << 28 }), 'utf8');
  fs.writeFileSync(__dirname + '/_u_sw.js', execSync('curl -sL --max-time 30 https://raw.githubusercontent.com/' + UP + '/main/ib-sw.js', { encoding: 'utf8', maxBuffer: 1 << 24 }), 'utf8');
  fs.writeFileSync(__dirname + '/_u_readme.md', execSync('curl -sL --max-time 60 https://raw.githubusercontent.com/' + UP + '/main/README.md', { encoding: 'utf8', maxBuffer: 1 << 26 }), 'utf8');
} catch (e) { out.push('下载上游文件失败: ' + e.message); }

const ni = fs.existsSync(__dirname + '/_u_index.html') ? fs.readFileSync(__dirname + '/_u_index.html', 'utf8') : '';
const ns = fs.existsSync(__dirname + '/_u_sw.js') ? fs.readFileSync(__dirname + '/_u_sw.js', 'utf8') : '';
const nr = fs.existsSync(__dirname + '/_u_readme.md') ? fs.readFileSync(__dirname + '/_u_readme.md', 'utf8') : '';
const chk = (n, re, src) => out.push('  ' + (re.test(src) ? '有  ' : '无  ') + n);
out.push('\n== 上游新版 index.html（' + ni.length + ' 字符）==');
out.push('  IB_VER = ' + ((ni.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) || ['?', '?', '?']).slice(1).join(' / ')));
chk('进度条 9 秒硬兜底（now-t0>9000）', /now-t0>9000/, ni);
chk('预遮罩揭幕守卫（_ibVeilOff）', /_ibVeilOff/, ni);
chk('ready() 里有 20s/30s 放行', /el>20000|el>30000|now-t0>20000|now-t0>30000/, ni);
chk('openDB onblocked', /onblocked/, ni);
chk('【我们的归档项】诊断面板 _ibGuard', /_ibGuard/, ni);
chk('【我们的归档项】启动各步耗时埋点 _ibStepLog', /_ibStepLog/, ni);
chk('【我们的归档项】VersionError 自愈 ib_verfix', /ib_verfix/, ni);
chk('【我们的归档项】脱敏 _ibRedact', /_ibRedact/, ni);
out.push('  表情包 = ' + ((ni.match(/表情包/g) || []).length) + ' 次；颜文字 = ' + ((ni.match(/颜文字/g) || []).length) + ' 次');
const m = ni.match(/function ready\(now\)\{[\s\S]{0,500}?\n/);
out.push('\n  ready() 原文：\n    ' + (m ? m[0].replace(/\n/g, '\n    ') : '(未匹配)'));

out.push('\n== 上游新版 ib-sw.js（' + ns.length + ' 字符）==');
out.push('  cache = ' + ((ns.match(/ib-cache-v\d+/) || ['?'])[0]));
chk('超时常量', /NAV_TIMEOUT|ASSET_TIMEOUT|FAST_FALLBACK|withTimeout/, ns);
chk('【我们的归档项】压缩响应完整性判断', /content-encoding/i, ns);

out.push('\n== 上游 README 的「最近更新」段落 ==');
const i2 = nr.indexOf('最近更新');
out.push(i2 >= 0 ? nr.slice(i2, i2 + 2600) : '(未找到)');

out.push('\n== 电脑端 Sui-IB/InternalBeyond 现状 ==');
out.push('  head = ' + gh('api repos/' + DESK + '/commits/main --jq .sha').slice(0, 12) + '  ' + gh('api repos/' + DESK + '/commits/main --jq .commit.committer.date'));
out.push('  最近 3 条：' + gh('api "repos/' + DESK + '/commits?per_page=3" --jq ".[] | .sha[0:8] + \'  \' + .commit.committer.date + \'  \' + (.commit.message | split(\"\\n\")[0])"').split('\n').join('\n            '));

fs.writeFileSync(__dirname + '/_ib_new_compare.txt', out.join('\n'), 'utf8');
