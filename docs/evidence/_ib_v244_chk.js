/* 补核：① 附件 accept 的新写法（归档关注的项）② ib-sw.js 内容与缓存名 ③ DB_VER / IB_VER */
const { execSync } = require('child_process');
const fs = require('fs');
const A = __dirname + '/';
const out = [];
const u = fs.readFileSync(A + '_u_index.html', 'utf8');

const all = u.match(/accept="[^"]+"/g) || [];
out.push('== 全站 accept 属性 ' + all.length + ' 处 ==');
all.forEach(a => { const v = a.slice(8, -1); out.push('  ' + a.length + ' 字符 / ' + v.split(',').length + ' 项  ' + a.slice(0, 52) + (a.length > 52 ? ' …' : '')); });
const big = all.filter(a => a.length > 300)[0];
if (big) {
  const v = big.slice(8, -1);
  const list = v.split(',');
  out.push('\n最长那处（chat-doc-file）：' + list.length + ' 项 / ' + v.length + ' 字符 / 含 MIME 通配 = ' + /\/\*/.test(v));
  out.push('  含 .svg ? ' + (list.indexOf('.svg') >= 0) + '　含 .ts ? ' + (list.indexOf('.ts') >= 0) + '　含 .tsx ? ' + (list.indexOf('.tsx') >= 0));
  out.push('  头：' + v.slice(0, 90));
  out.push('  尾：' + v.slice(-90));
}

out.push('\n== 常量 ==');
out.push('  IB_VER = ' + ((u.match(/var IB_VER='([^']+)',IB_VER_DATE='([^']+)'/) || ['?', '?', '?']).slice(1).join(' / ')));
out.push('  DB_VER = ' + ((u.match(/DB_VER\s*=\s*(\d+)/) || ['?', '?'])[1]));
out.push('  归档锚点：_ibGuard=' + /_ibGuard/.test(u) + '  _ibStepLog|_ibTimed=' + /_ibStepLog|_ibTimed/.test(u) + '  _ibRedact=' + /_ibRedact/.test(u) + '  ib_verfix=' + /ib_verfix/.test(u));

/* ib-sw.js 重新拉一次（上一轮可能没落盘） */
const swUrl = 'https://raw.githubusercontent.com/Sui-IB/InternalBeyond-Mobile/main/ib-sw.js';
let sw = '';
for (let i = 1; i <= 3 && sw.length < 500; i++) {
  try { execSync('curl -sL --max-time 60 -o "' + A + '_u_sw.js" "' + swUrl + '" & exit 0', { encoding: 'utf8', maxBuffer: 1 << 22, timeout: 120000 }); } catch (e) {}
  sw = fs.existsSync(A + '_u_sw.js') ? fs.readFileSync(A + '_u_sw.js', 'utf8') : '';
}
out.push('\n== ib-sw.js ==');
out.push('  大小 = ' + (fs.existsSync(A + '_u_sw.js') ? fs.statSync(A + '_u_sw.js').size : -1) + ' B');
out.push('  缓存名 = ' + ((sw.match(/ib-cache-v\d+/) || ['(未找到)'])[0]));
out.push('  content-encoding 判断 = ' + /content-encoding/i.test(sw));
out.push('  快回退常量 = ' + /NAV_TIMEOUT|ASSET_TIMEOUT|FAST_FALLBACK|NAV_FAST_MS/.test(sw));

fs.writeFileSync(A + '_ib_v244_chk.txt', out.join('\n'), 'utf8');
