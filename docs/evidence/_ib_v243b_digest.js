/* 把 unified diff 压缩成可读摘要：hunk 定位 + 仅变更行 */
const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const gh = (a) => execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

const out = [];
out.push('=== 提交完整信息 ===');
out.push(gh('api repos/' + UP + '/commits/main --jq .commit.message'));
out.push('=== end ===\n');

const d = fs.readFileSync(__dirname + '/_ib_v243b.diff', 'utf8').split('\n');
let hunk = 0, add = 0, del = 0;
const LIM = 900;
out.push('=== hunk 定位（new 文件行号）===');
d.forEach(l => {
  if (l.startsWith('@@')) { hunk++; out.push(l.slice(0, 120)); }
});
out.push('\n共 ' + hunk + ' 个 hunk\n');

out.push('=== 仅变更行（- 旧 / + 新，截断 ' + LIM + ' 字符）===');
let cur = '';
d.forEach(l => {
  if (l.startsWith('@@')) { cur = l.replace(/@@.*@@/, '').trim(); out.push('\n--- ' + cur + ' ---'); return; }
  if (l.startsWith('---') || l.startsWith('+++') || l.startsWith('diff ') || l.startsWith('index ')) return;
  if (l.startsWith('-') && !l.startsWith('---')) { del++; out.push('[-] ' + l.slice(1, LIM)); }
  else if (l.startsWith('+') && !l.startsWith('+++')) { add++; out.push('[+] ' + l.slice(1, LIM)); }
});
out.push('\n=== 合计 +' + add + ' / -' + del + ' ===');
fs.writeFileSync(__dirname + '/_ib_v243b_digest.txt', out.join('\n'), 'utf8');
