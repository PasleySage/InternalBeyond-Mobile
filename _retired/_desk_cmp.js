/* 对比 Sui-IB/InternalBeyond（电脑端）与 Sui-IB/InternalBeyond-Mobile（手机端）的同步状态 */
const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const DESK = 'Sui-IB/InternalBeyond';
const log = [];
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 26 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 200); } };
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

for (const [name, repo] of [['手机端 InternalBeyond-Mobile', UP], ['电脑端 InternalBeyond', DESK]]) {
  const meta = J(gh('api repos/' + repo)) || {};
  log.push('== ' + name + '（' + repo + '）==');
  log.push('  description = ' + (meta.description || '(无)'));
  log.push('  default_branch=' + meta.default_branch + '  pushed_at=' + meta.pushed_at + '  open_issues=' + meta.open_issues + '  size=' + meta.size + 'KB  fork=' + meta.fork);
  const head = gh('api repos/' + repo + '/commits/main --jq .sha');
  const headDate = gh('api repos/' + repo + '/commits/main --jq .commit.committer.date');
  log.push('  main HEAD = ' + head.slice(0, 10) + '  ' + headDate);
  log.push('  最近 8 个提交：');
  const cs = J(gh('api repos/' + repo + '/commits?sha=main&per_page=8')) || [];
  cs.forEach(c => log.push('    ' + c.sha.slice(0, 8) + '  ' + String(c.commit.committer.date).slice(0, 16) + '  ' + c.commit.message.split('\n')[0].slice(0, 90)));
  log.push('  根目录文件：' + (J(gh('api repos/' + repo + '/contents/')) || []).map(f => f.name + (f.type === 'dir' ? '/' : '')).join('  '));
  log.push('');
}

/* 拉电脑端主 HTML，核对与手机端同源的启动逻辑 */
const list = J(gh('api repos/' + DESK + '/contents/')) || [];
const htmls = list.filter(f => f.type === 'file' && /\.html?$/i.test(f.name)).sort((a, b) => b.size - a.size);
log.push('== 电脑端 HTML 文件（按体积）==');
htmls.forEach(f => log.push('  ' + f.name + '  ' + Math.round(f.size / 1024) + 'KB'));

const mainHtml = htmls[0];
if (mainHtml) {
  const t = execSync('curl -sL --max-time 90 ' + mainHtml.download_url, { encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync(__dirname + '/_desk_probe.html', t, 'utf8');
  const chk = (n, re, src) => log.push('  ' + (re.test(src) ? '有  ' : '无  ') + n);
  log.push('\n== 电脑端 ' + mainHtml.name + '（' + t.length + ' 字节）里的启动相关点 ==');
  log.push('  IB_VER = ' + ((t.match(/IB_VER\s*=\s*'([^']+)'/) || ['?', '?'])[1]) + '  日期 = ' + ((t.match(/IB_VER_DATE\s*=\s*'([^']+)'/) || ['?', '?'])[1]));
  chk('进度条 9 秒硬兜底（now-t0>9000）', /now-t0>9000/, t);
  chk('揭幕标记 _ibVeilOff / __ibVeilOff', /_ibVeilOff/, t);
  chk('预遮罩 lk-preveil', /lk-preveil/, t);
  chk('预遮罩在 DOMContentLoaded 里创建', /DOMContentLoaded[\s\S]{0,240}lk-preveil/, t);
  chk('function ready(now)', /function ready\(now\)/, t);
  chk('openDB 的 onblocked', /onblocked/, t);
  chk('openDB 的 onversionchange', /onversionchange/, t);
  chk('Service Worker 注册（ib-sw.js）', /ib-sw\.js/, t);
  chk('启动看门狗/诊断面板（_ibGuard）', /_ibGuard/, t);
  const m = t.match(/function ready\(now\)\{[\s\S]{0,600}?\}\n/);
  log.push('\n== 电脑端 ready() 原文 ==\n' + (m ? m[0] : '(未匹配到)'));
}

fs.writeFileSync(__dirname + '/_desk_cmp.txt', log.join('\n'), 'utf8');
