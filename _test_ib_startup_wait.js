/* _test_ib_startup_wait.js —— 「启动等待」（fix-r7）的断言式回归测试
 *
 * 用法：node _test_ib_startup_wait.js [已打补丁的 index.html]      （默认读 ./index.html）
 *
 * 只测**外部可观察行为**，不测实现细节：
 *   ① 等待期确立规则：开关关 / 缺字段 / 分钟兜底与钳制 / 起算时间点
 *   ② 闸门的位置与语义：必须排在既有判据之前，且只 return、不改任何状态
 *   ③ 开关关闭时零影响：等待期恒为 0，闸门永不生效
 *   ④ 起点模式的接线：init 会确立；回到前台会重新确立，且"只算冷启动"时不重申
 *   ⑤ 产物语法可解析（补丁没有把脚本改坏）
 *
 * 做法：把产物里 r7 的两段代码抽出来，在 vm 里配一个假 _mp 跑真值表；
 *       其余用结构断言（既有测试脚本同样风格，不引新框架）。
 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const file=process.argv[2]||path.join(__dirname,'index.html');
const src=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
function ok(name,cond,extra){if(cond){pass++;console.log('  ✓ '+name)}else{fail++;console.log('  ✗ '+name+(extra?('  —— '+extra):''))}}

const mVar=src.match(/var _hbWaitUntil=0[,;][^\n]*/);
const mFn=src.match(/function _hbWaitArm\(\)\{[\s\S]*?catch\(e\)\{\}\}/);
const MIN=60000;

console.log('文件：'+file);
console.log('\n[1] 抽出 r7 代码');
ok('找到 _hbWaitUntil 声明',!!mVar);
ok('找到 _hbWaitArm 函数',!!mFn);
if(!mVar||!mFn){console.log('\n结果：无法继续（产物里没有 r7 代码）');process.exit(1)}

function armCtx(presence){
  const ctx={_mp:{presence:presence},Date:Date,Math:Math,parseInt:parseInt};
  vm.createContext(ctx);
  vm.runInContext(mVar[0]+'\n'+mFn[0],ctx);
  vm.runInContext('_hbWaitArm()',ctx);
  return ctx;
}
function arm(presence){return armCtx(presence)._hbWaitUntil}

console.log('\n[2] 等待期确立规则（真值表）');
ok('开关关闭 ⇒ 不设等待期（零影响）',arm({waitOn:false})===0);
ok('缺字段（老数据）⇒ 不设等待期',arm({})===0);
ok('waitOn 为字符串 "false" 之类真值也不炸',typeof arm({waitOn:'x'})==='number');
const t5=arm({waitOn:true,waitMin:5}),d5=t5-Date.now();
ok('开 5 分钟 ⇒ 约 5 分钟后到期',Math.abs(d5-5*MIN)<3000,'实际 '+Math.round(d5/MIN)+' 分钟');
const t0=arm({waitOn:true,waitMin:0}),d0=t0-Date.now();
ok('分钟为 0 ⇒ 兜底 5 分钟',Math.abs(d0-5*MIN)<3000,'实际 '+Math.round(d0/MIN)+' 分钟');
const tBig=arm({waitOn:true,waitMin:9999}),dBig=tBig-Date.now();
ok('分钟超大 ⇒ 钳制到 720 分钟',Math.abs(dBig-720*MIN)<3000,'实际 '+Math.round(dBig/MIN)+' 分钟');
const tBad=arm({waitOn:true,waitMin:'abc'}),dBad=tBad-Date.now();
ok('分钟非数字 ⇒ 兜底 5 分钟',Math.abs(dBad-5*MIN)<3000,'实际 '+Math.round(dBad/MIN)+' 分钟');
const cOff=armCtx({waitOn:false});
ok('开关关时"已放行/免掷"两个标记也保持 0（零影响）',cOff._hbWaitDone===0&&cOff._hbNoRoll===0);

console.log('\n[3] 闸门的位置与语义');
const gateIdx=src.indexOf('if(Date.now()<_hbWaitUntil)return;');
const hbOnIdx=src.indexOf('if(!ps.hbOn)return;');
ok('心跳里存在闸门',gateIdx>0);
ok('闸门排在「定时推送总开关」判据之前',gateIdx>0&&hbOnIdx>0&&gateIdx<hbOnIdx);
const gateLine=src.slice(gateIdx,src.indexOf('\n',gateIdx));
ok('闸门只 return、不改任何状态',/return;\s*\/\*/.test(gateLine)&&!/=(?!=)/.test(gateLine.replace(/Date\.now\(\)/,'')));
ok('心跳块内只有一处闸门',src.split('if(Date.now()<_hbWaitUntil)return;').length===3);/* 心跳 + 原生唤醒 = 2 处 */
ok('原生唤醒那条路也有闸门（口径一致）',/async function _ibPresenceWake\(convId\)\{[\s\S]{0,200}if\(Date\.now\(\)<_hbWaitUntil\)return;/.test(src));

console.log('\n[3b] 到点即发（免掷概率只作用于刚放行的那一次）');
ok('免掷标记只在等待期开启过时才置位',/if\(_hbWaitUntil&&!_hbWaitDone\)\{_hbWaitDone=1;_hbNoRoll=1\}/.test(src));
ok('概率行读一次即清（不改变后续随机行为）',/var _roll9=\(_md&&!_hbNoRoll\);_hbNoRoll=0;/.test(src));
ok('免掷后仍走原来的概率判据（没有把概率删掉）',/_roll9&&Math\.random\(\)\*100>=/.test(src));

console.log('\n[4] 接线：init 与回到前台');
ok('init 里紧接着 loadMP 就确立等待期',/await loadMP\(\);\s*\n\s*try\{_hbWaitArm\(\)\}/.test(src));
ok('回到前台会重新确立（含模式判断）',/else\{_presCheck\(\);try\{var _pw9=[\s\S]{0,160}_hbWaitArm\(\)/.test(src));
ok('「只算冷启动」时不重申',/_pw9\.waitOn&&_pw9\.waitFrom!=='boot'/.test(src));

console.log('\n[5] 设置界面接线');
ok('开关控件存在',src.includes('id="pres-wait"'));
ok('分钟下拉存在',src.includes('id="pres-wait-min"'));
ok('起点下拉存在',src.includes('id="pres-wait-from"'));
ok('起点下拉含两个取值',src.includes('value="resume"')&&src.includes('value="boot"'));
ok('绑定：开关 click',src.includes("$('pres-wait').addEventListener('click'"));
ok('绑定：分钟 change',src.includes("$('pres-wait-min').addEventListener('change'"));
ok('绑定：起点 change',src.includes("$('pres-wait-from').addEventListener('change'"));
ok('初始化时刷入已存值',/sw2\(\$\('pres-wait'\),!!_mp\.presence\.waitOn\)/.test(src));
const _selOpts=(src.match(/<select id="pres-wait-min">([\s\S]*?)<\/select>/)||[])[1]||'';
const _vals=(_selOpts.match(/value="(\d+)"/g)||[]).map(function(s){return s.match(/\d+/)[0]});
const _wl=(src.match(/if\(\['([\d',]+)'\]\.indexOf\(_wv9\)/)||[])[1]||'';
const _wlArr=_wl.split(',').map(function(s){return s.replace(/'/g,'')});
ok('等待时长下拉含 3 与 20 两档',_vals.indexOf('3')>-1&&_vals.indexOf('20')>-1,'实际档位：'+_vals.join('/'));
ok('版本标记处没有残留上一版注释（W1 必须整行替换）',src.indexOf('fix-r6：镜像专用版本标记')===-1);
ok('档位下拉与初始化白名单完全一致（防两处不同步）',_vals.length>0&&JSON.stringify(_vals)===JSON.stringify(_wlArr),'下拉='+_vals.join('/')+' 白名单='+_wlArr.join('/'));

console.log('\n[5b] 导入时保全本端专有字段');
ok('导入前记下本机三字段',/_keepW9=\{waitOn:_kp9\.waitOn,waitMin:_kp9\.waitMin,waitFrom:_kp9\.waitFrom\}/.test(src));
ok('导入后重新读记录并写回',/if\(_kn9\)\{await dbPut\('apiSettings',_kr10\);/.test(src));
ok('本机没设过的字段（undefined）不覆盖',/_keepW9\.waitOn!==undefined/.test(src)&&/_keepW9\.waitMin!==undefined/.test(src)&&/_keepW9\.waitFrom!==undefined/.test(src));
ok('只在导入的记录存在时才动它（不凭空造记录）',/if\(_kr10&&typeof _kr10==='object'\)/.test(src));
ok('写回后重载偏好缓存',/if\(_kn9\)\{await dbPut\('apiSettings',_kr10\);_mp=null;_mpFromDb=false;await loadMP\(\)\}/.test(src));

console.log('\n[6] 产物语法可解析');
const blocks=[];
const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let mm;
while((mm=re.exec(src)))blocks.push(mm[1]);
let bad=0;
blocks.forEach(function(b,i){try{new vm.Script(b)}catch(e){bad++;console.log('    block#'+i+' 语法错误：'+e.message)}});
ok('全部 '+blocks.length+' 个 script 块可解析',bad===0);

console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
