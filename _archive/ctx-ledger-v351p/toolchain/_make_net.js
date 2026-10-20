/* 净版生成：功能版删测试块（5 行：2 注释＋3 dispatch），diff 应只剩该块
   用法：node _make_net.js [功能版.html] [净版.html]
   默认＝现行 v351p 基线对：
     in  out/IB-ctx-ledger-功能版-v351p.html
     out out/IB-ctx-ledger-净版-v351p.html
   ⚠ 2026-10-19 retro #2：原脚本路径钉在已弃的 9ae7034a 旧基线对上（直接跑会
     生成旧版净版）；现默认指向现行产物，也可显式传双路径。
   ⚠ patch31–33 各自 phase2 已内联同逻辑再生净版；本脚本是独立复核/重建入口。 */
'use strict';
const fs=require('fs');
const DIR='D:/InternalBeyond/.scratch/ib-ctx-ledger/out/';
const full=fs.readFileSync(process.argv[2]||DIR+'IB-ctx-ledger-功能版-v351p.html','utf8');
const OUT=process.argv[3]||DIR+'IB-ctx-ledger-净版-v351p.html';
const lines=full.split('\n');
const i0=lines.findIndex(l=>l.includes('/* ▼▼ 测试块'));
const i1=lines.findIndex(l=>l.includes('/* ▲▲ 测试块结束 ▲▲ */'));
if(i0<0||i1<0||i1<i0){console.error('测试块锚未找到');process.exit(1)}
if(i1-i0!==4){console.error('测试块行数异常：'+(i1-i0+1)+'（期望 5）');process.exit(1)}
const removed=lines.slice(i0,i1+1);
fs.writeFileSync(DIR+'_test_block_removed.txt',removed.join('\n')+'\n');
const net=lines.slice(0,i0).concat(lines.slice(i1+1)).join('\n');
fs.writeFileSync(OUT,net);
['上下文空态A','上下文账本·示例','测试块'].forEach(k=>{
  if(net.includes(k)){console.error('净版仍含测试块特征：'+k);process.exit(1)}
});
console.log('净版已生成：'+OUT+'（删 '+(i1-i0+1)+' 行；残留行已存 _test_block_removed.txt 供回填）');
console.log('净版大小：'+net.length+' 字符（功能版 '+full.length+'）');
