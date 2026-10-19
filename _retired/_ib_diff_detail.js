const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const BASE = 'e7d12621e59decab77cd2e2c276c5f6b630bd83b';
const HEAD = '27d87d6ef94129883fc28e5796a078e87db72ecf';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1024 * 1024 * 80 }).trim(); } catch (e) { return 'ERR ' + String(e.stdout || e.message).slice(0, 300); } };

const out = [];
const cp = JSON.parse(gh('api repos/' + UP + '/compare/' + BASE + '...' + HEAD));
const byName = {};
(cp.files || []).forEach(f => { byName[f.filename] = f; });

out.push('===== ib-sw.js 完整 patch =====');
out.push((byName['ib-sw.js'] || {}).patch || '(无)');
out.push('\n===== README.md 完整 patch =====');
out.push((byName['README.md'] || {}).patch || '(无)');

out.push('\n===== index.html patch（只看 hunk 头 + 增删行摘要）=====');
const p = (byName['index.html'] || {}).patch || '';
let line = '';
p.split('\n').forEach(l => {
  if (l.startsWith('@@')) { out.push('\n--- ' + l); return; }
  if (l.startsWith('+') && !l.startsWith('+++')) { line = l.slice(1); out.push('  + ' + (line.length > 300 ? line.slice(0, 300) + ' …(' + line.length + ')': line)); }
  else if (l.startsWith('-') && !l.startsWith('---')) { out.push('  - ' + (l.length > 140 ? l.slice(1, 141) + ' …': l.slice(1))); }
});

/* 取新版上游 index.html + ib-sw.js，核对关键锚点 */
try {
  fs.writeFileSync(__dirname + '/_up_new_index.html', execSync('curl -sL --max-time 60 https://raw.githubusercontent.com/' + UP + '/main/index.html', { encoding: 'utf8', maxBuffer: 1 << 27 }), 'utf8');
  fs.writeFileSync(__dirname + '/_up_new_sw.js', execSync('curl -sL --max-time 30 https://raw.githubusercontent.com/' + UP + '/main/ib-sw.js', { encoding: 'utf8', maxBuffer: 1 << 24 }), 'utf8');
} catch (e) { out.push('\n下载新版失败: ' + e.message); }

const ni = fs.existsSync(__dirname + '/_up_new_index.html') ? fs.readFileSync(__dirname + '/_up_new_index.html', 'utf8') : '';
const ns = fs.existsSync(__dirname + '/_up_new_sw.js') ? fs.readFileSync(__dirname + '/_up_new_sw.js', 'utf8') : '';
const chk = (name, re, src) => out.push('  ' + (re.test(src) ? '有  ' : '无  ') + name);
out.push('\n===== 新版上游 index.html 关键点（对照我们的修法）=====');
out.push('size=' + ni.length + '  IB_VER=' + (ni.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) || ['?', '?', '?']).slice(1).join(' '));
chk('进度条 9 秒硬兜底（now-t0>9000）', /now-t0>9000/, ni);
chk('预遮罩创建前的"已揭幕"判断（__ibVeilOff）', /__ibVeilOff/, ni);
chk('预遮罩仍在 DOMContentLoaded 里创建', /DOMContentLoaded[\s\S]{0,200}lk-preveil/, ni);
chk('openDB 的 onblocked', /onblocked/, ni);
chk('openDB 的 onversionchange', /onversionchange/, ni);
chk('我们的看门狗/诊断面板（_ibGuard）', /_ibGuard/, ni);
chk('VersionError 自愈（ib_verfix）', /ib_verfix/, ni);
chk('单步超时护栏（_ibCap）', /_ibCap/, ni);
out.push('\n===== 新版上游 ib-sw.js 关键点 =====');
out.push('size=' + ns.length + '  cache=' + ((ns.match(/ib-cache-v\d+/) || ['?'])[0]));
chk('AbortController 超时', /AbortController/, ns);
chk('导航快速回退（NAV_FAST_MS 之类）', /NAV_FAST_MS|快速回退/, ns);
chk('离线兜底页', /offline/i, ns);
chk('content-encoding 处理', /content-encoding/i, ns);

/* 新版上游 index.html 里"白屏相关"那段长什么样 */
const m2 = ni.match(/function ready\(now\)\{[\s\S]{0,700}?\}\n/);
out.push('\n===== 新版上游 ready() 原文 =====\n' + (m2 ? m2[0] : '(未匹配到)'));
const m3 = ni.match(/DOMContentLoaded',function\(\)\{try\{[\s\S]{0,300}?lk-preveil[\s\S]{0,200}?\}\}/);
out.push('\n===== 新版上游 预遮罩创建 原文 =====\n' + (m3 ? m3[0] : '(未匹配到)'));

fs.writeFileSync(__dirname + '/_ib_diff_detail.txt', out.join('\n'), 'utf8');
console.log('done');
