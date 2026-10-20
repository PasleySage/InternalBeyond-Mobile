/* 语法自检：功能版所有 <script> 块过 vm 编译（只查语法，不执行） */
'use strict';
const fs = require('fs'), vm = require('vm');
const P = 'D:/InternalBeyond/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-功能版-v351p.html';
const html = fs.readFileSync(P, 'utf8');
const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  const code = m[1];
  if (!code.trim()) continue;
  try { new vm.Script(code, { filename: 'block' + i }); }
  catch (e) { bad++; console.log('SYNTAX-FAIL block#' + i + ': ' + e.message); }
}
console.log('功能版共 ' + i + ' 个 script 块，语法失败 ' + bad + (bad ? ' ✗' : ' ✓'));
const net = fs.readFileSync('D:/InternalBeyond/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-净版-v351p.html', 'utf8');
let m2, j = 0, bad2 = 0;
const re2 = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
while ((m2 = re2.exec(net)) !== null) {
  j++;
  const code = m2[1];
  if (!code.trim()) continue;
  try { new vm.Script(code, { filename: 'netblock' + j }); }
  catch (e) { bad2++; console.log('NET-SYNTAX-FAIL block#' + j + ': ' + e.message); }
}
console.log('净版共 ' + j + ' 个 script 块，语法失败 ' + bad2 + (bad2 ? ' ✗' : ' ✓'));
process.exit(bad + bad2 ? 1 : 0);
