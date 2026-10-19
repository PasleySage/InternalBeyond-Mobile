/* 验证镜像是否与上游完全同源
   —— 抓取一律「curl 落盘 → sha256 比对」，不让大文件走 execSync 的 stdout（会把 -s 失败误报成「不一致」），
      curl 非零退出用 `& exit 0` 兜住，并对每次抓取重试 3 轮。
      缓存保鲜改用请求头（Cache-Control: no-cache），不再用 ?cb= 查询串。 */
const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const SITE = 'https://pasleysage.github.io/InternalBeyond-Mobile/';
const RAW = 'https://raw.githubusercontent.com/Sui-IB/InternalBeyond-Mobile/main/';
const FK = 'PasleySage/InternalBeyond-Mobile';
const UP = 'Sui-IB/InternalBeyond-Mobile';
const A = __dirname + '/';
const log = [];
const sh = (c, mb) => { try { return execSync(c, { encoding: 'utf8', maxBuffer: mb || (1 << 24) }).trim(); } catch (e) { return 'ERR:' + String(e.message).slice(0, 120); } };

/* curl 落盘，最多 3 轮；返回落盘字节数（<1000 视为失败） */
function fetch(url, to) {
  const noCache = /^https:\/\/pasleysage/.test(url) ? ' -H "Cache-Control: no-cache" -H "Pragma: no-cache"' : '';
  for (let i = 1; i <= 3; i++) {
    try { execSync('curl -sL --retry 2 --max-time 180' + noCache + ' -o "' + to + '" "' + url + '" & exit 0',
      { encoding: 'utf8', maxBuffer: 1 << 22, timeout: 400000 }); } catch (e) { /* 交给下面的体积判定 */ }
    const n = fs.existsSync(to) ? fs.statSync(to).size : 0;
    if (n > 1000) return n;
  }
  return fs.existsSync(to) ? fs.statSync(to).size : -1;
}
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/* 同一份文件：上游原文 vs 线上 */
function cmp(label, upUrl, liveUrl, name) {
  const u = A + '_chk_up_' + name, l = A + '_chk_live_' + name;
  const nu = fetch(upUrl, u), nl = fetch(liveUrl, l);
  if (nu > 1000 && nl > 1000) {
    const su = sha(u), sl = sha(l);
    log.push(label + '：上游 ' + nu + ' B / 线上 ' + nl + ' B → ' + (su === sl ? '✓ 逐字节一致' : '✗ 不一致')
      + '\n    sha256 上游 = ' + su + '\n    sha256 线上 = ' + sl);
    return l;
  }
  log.push(label + '：抓取失败（上游 ' + nu + ' B / 线上 ' + nl + ' B），未能比对');
  return null;
}

log.push('== 构建状态 ==');
log.push('Pages ' + sh('gh api repos/' + FK + '/pages/builds/latest --jq .status') +
  '  commit=' + sh('gh api repos/' + FK + '/pages/builds/latest --jq .commit').slice(0, 8) +
  '  （' + sh('gh api repos/' + FK + '/pages/builds/latest --jq .created_at') + '）');

log.push('\n== 线上文件 vs 上游原文（sha256） ==');
const liveIdxPath = cmp('index.html', RAW + 'index.html', SITE + 'index.html', 'index.html');
cmp('ib-sw.js  ', RAW + 'ib-sw.js', SITE + 'ib-sw.js', 'ib-sw.js');
if (liveIdxPath && fs.existsSync(liveIdxPath)) {
  const live = fs.readFileSync(liveIdxPath, 'utf8');
  log.push('  线上 IB_VER = ' + ((live.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) || ['?', '?', '?']).slice(1).join(' / ')));
}

log.push('\n== 我们自己的文件应已消失 ==');
/* 只认 HTTP 状态码：Pages 的 404 也是一个 HTML 页，不能靠「响应体像不像 HTML」判断 */
function httpCode(url, to) {
  for (let i = 1; i <= 3; i++) {
    let o = '';
    try { o = execSync('curl -s -o "' + to + '" -w "%{http_code}" --max-time 30 "' + url + '" & exit 0',
      { encoding: 'utf8', maxBuffer: 1 << 20, timeout: 120000 }); } catch (e) { /* 重试 */ }
    o = String(o || '').trim();
    if (/^\d{3}$/.test(o)) return o;
  }
  return '';
}
['probe.html', 'panel-preview.html'].forEach(f => {
  const code = httpCode(SITE + f, A + '_chk_gone_' + f);
  log.push('  ' + f + ' → ' + (code === '' ? '取不到（网络）'
    : 'HTTP ' + code + (code === '404' ? '  ✓ 已下线' : (code === '200' ? '  ⚠ 仍可访问' : ''))));
});

log.push('\n== fork 与上游 ref 对照 ==');
const fkMain = sh('gh api repos/' + FK + '/commits/main --jq .sha');
const upMain = sh('gh api repos/' + UP + '/commits/main --jq .sha');
log.push('  fork main = ' + fkMain.slice(0, 12) + '   上游 main = ' + upMain.slice(0, 12) + (fkMain === upMain ? '  ✓ 同一提交' : '  ✗ 不同'));
log.push('  fork tree = ' + sh('gh api repos/' + FK + '/commits/main --jq .commit.tree.sha').slice(0, 12) +
  '   上游 tree = ' + sh('gh api repos/' + UP + '/commits/main --jq .commit.tree.sha').slice(0, 12));
log.push('  归档 tag archive/ib-selfpatch-v246p = ' + sh('gh api repos/' + FK + '/git/ref/tags/archive/ib-selfpatch-v246p --jq .object.sha').slice(0, 12));
log.push('  我们的 PR 分支 = ' + sh('gh api repos/' + FK + '/git/ref/heads/fix/android-white-screen-boot-guard --jq .object.sha').slice(0, 12));

fs.writeFileSync(A + '_live_sync.txt', log.join('\n'), 'utf8');
