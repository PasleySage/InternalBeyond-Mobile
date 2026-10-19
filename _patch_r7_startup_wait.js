/* _patch_r7_startup_wait.js —— 补丁清单：「启动等待」（fix-r7，12 处）
 *
 * 目标（见 .scratch\ib-hb-startup-wait\spec.md）：打开应用后的一段等待期内不让 TA 主动开口；
 * 等待期一过交回**原有判断**（放行那一次免掷概率、不排队补发）；等待期内用户说话与 AI 回复完全不受影响。
 *
 *   W1   镜像专用版本标记 v262-p-r7（提上游的 PR 不含这一处）
 *   W2   新增模块级 _hbWaitUntil / _hbWaitDone / _hbNoRoll 与 _hbWaitArm()（按设置确立或重新确立等待期）
 *   W3   心跳巡检开头加闸门（在既有判据之前；除 W10 之外，其后的判据一字不改）
 *   W4   原生唤醒那条路同样加闸门（否则装了原生壳时，唤醒径会绕过闸门）
 *   W5   页面加载后确立等待期（紧随 loadMP）
 *   W6   回到前台重新计时（仅当起点模式含"回到前台"）
 *   W7   设置界面：新增「打开应用后等待」开关 + 等待时长 + 起点模式（插在「主动查岗」之后、卡片内）
 *   W8   设置初始化：把已存值刷进新控件
 *   W9   事件绑定：开关 click / 两个下拉 change（照既有样板）
 *   W10  随机概率那一行：等待期刚放行的那一次免掷（标记读一次即清）
 *   W11a 导入前：记下本机的等待三字段
 *   W11b 导入后：把本机的等待三字段写回（导入语义的第一个例外）
 *
 * 依据：手机端上游 1e2725b0（V2.4.4，sha256 c16aca6e…30511）。
 * 由 _patch_engine.js 重放；本文件是数据，改补丁只改这里。
 */
module.exports={
  id:'r7-startup-wait',
  about:'启动等待（fix-r7）',
  upstream:{repo:'Sui-IB/InternalBeyond-Mobile',commit:'1e2725b0',bytes:3304065,sha256:'c16aca6e…30511'},
  expectCount:12,/* 与头注释「12 处」一致；引擎会核对，写错即报错 */
  needs:['r6-summary'],/* 必须先应用 r6：W1 的锚点是 r6 之后的版本标记行（线上已是 r6） */
  patches:[

  {label:'W1 版本标记（镜像专用，PR 不含）',mirrorOnly:true,
   old:
`var IB_VER='v262-p-r6',IB_VER_DATE='2026-09-18';/* fix-r6：镜像专用版本标记（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处 */`,
   new:
`var IB_VER='v262-p-r7',IB_VER_DATE='2026-09-19';/* fix-r7：镜像专用版本标记（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处 */`},

  {label:'W2 新增 _hbWaitUntil 与 _hbWaitArm',
   old:
`var _hbLastFire=0;`,
   new:
`var _hbLastFire=0;
var _hbWaitUntil=0,_hbWaitDone=0,_hbNoRoll=0;/* fix-r7：启动等待期截止 / 是否已放行过 / 本次是否免掷概率（都只在进程内，不落库） */
function _hbWaitArm(){try{var ps=(_mp&&_mp.presence)||{};if(!ps.waitOn)return;var m=Math.max(1,Math.min(720,parseInt(ps.waitMin)||5));_hbWaitUntil=Date.now()+m*60000;_hbWaitDone=0;_hbNoRoll=0}catch(e){}}/* fix-r7：按设置确立（或重新确立）等待期 */`},

  {label:'W3 心跳巡检开头加闸门',
   old:
`    await loadMP();var ps=_mp.presence||{};
    try{_hbSyncNative()}catch(e){}/* v115-m：每分钟镜像一次，开关/参数/目标变化 60s 内送达原生 */
    if(!ps.hbOn)return;`,
   new:
`    await loadMP();var ps=_mp.presence||{};
    try{_hbSyncNative()}catch(e){}/* v115-m：每分钟镜像一次，开关/参数/目标变化 60s 内送达原生 */
    if(Date.now()<_hbWaitUntil)return;/* fix-r7：启动等待期内按住不动（只 return，不记任何状态） */
    if(_hbWaitUntil&&!_hbWaitDone){_hbWaitDone=1;_hbNoRoll=1}/* fix-r7：等待期刚结束的这一次免掷概率，保证"等到点即发"；开关关着时 _hbWaitUntil 恒为 0，不进这里 */
    if(!ps.hbOn)return;`},

  {label:'W4 原生唤醒那条路同样加闸门',
   old:
`async function _ibPresenceWake(convId){try{
  await loadMP();var ps=(_mp&&_mp.presence)||{};
  if(!ps.hbOn||!ps.bgOn)return;`,
   new:
`async function _ibPresenceWake(convId){try{
  await loadMP();var ps=(_mp&&_mp.presence)||{};
  if(!ps.hbOn||!ps.bgOn)return;
  if(Date.now()<_hbWaitUntil)return;/* fix-r7：启动等待期内，原生唤醒这条路由也按住（与心跳口径一致） */`},

  {label:'W5 页面加载后确立等待期',
   old:
`  await loadMP();
  try{if(navigator.storage&&navigator.storage.persist&&navigator.storage.persisted){navigator.storage.persisted().then(function(p){if(!p)return navigator.storage.persist()}).catch(function(){})}}catch(e){}`,
   new:
`  await loadMP();
  try{_hbWaitArm()}catch(e){}/* fix-r7：启动即按设置确立等待期（紧随 loadMP，_mp 已就绪） */
  try{if(navigator.storage&&navigator.storage.persist&&navigator.storage.persisted){navigator.storage.persisted().then(function(p){if(!p)return navigator.storage.persist()}).catch(function(){})}}catch(e){}`},

  {label:'W6 回到前台重新计时（仅当起点模式含回到前台）',
   old:
`document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')_presTouch();
  else _presCheck();
});`,
   new:
`document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')_presTouch();
  else{_presCheck();try{var _pw9=(_mp&&_mp.presence)||{};if(_pw9.waitOn&&_pw9.waitFrom!=='boot')_hbWaitArm()}catch(e){}}/* fix-r7：起点模式含"回到前台"时重新计时 */
});`},

  {label:'W7 设置界面新增控件',
   old:
`<!-- v123-p：#A 查岗轻量版（默认关） -->`,
   new:
`<!-- v123-p：#A 查岗轻量版（默认关） -->
        <div class="tog"><div class="tog-m"><div class="tog-t">打开应用后等待</div><div class="tog-s">开启后，打开应用的一段时间内 TA 不会主动开口；等待期一过就交回原有判断——这段时间你没说话，它便照常开口；你已说了话，它就不再插话。不影响你说话与它回复。默认关闭。</div></div><div class="sw2" id="pres-wait"></div></div><!-- fix-r7：启动等待 -->
        <div id="pres-wait-row" style="display:none">
          <div class="f-group" style="margin:12px 0 0"><label>等待时长</label><div class="sel"><select id="pres-wait-min"><option value="1">1 分钟</option><option value="3">3 分钟</option><option value="5">5 分钟（默认）</option><option value="10">10 分钟</option><option value="15">15 分钟</option><option value="20">20 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></div></div>
          <div class="f-group" style="margin:12px 0 0"><label>从什么时候起算</label><div class="sel"><select id="pres-wait-from"><option value="resume">冷启动与回到前台都算（默认）</option><option value="boot">只算冷启动</option></select></div></div>
          <p class="hint" style="margin-bottom:0">冷启动＝把应用完全关掉后再打开；回到前台＝应用还在后台、你切回来的那一次。</p>
          <p class="hint" style="margin-bottom:0">留出这段等待，是为了给同步、导入数据留出余裕。</p>
        </div>`},

  {label:'W8 设置初始化时刷入新控件',
   old:
`  sw2($('pres-hb-post'),!!_mp.presence.hbPost);`,
   new:
`  sw2($('pres-hb-post'),!!_mp.presence.hbPost);
  sw2($('pres-wait'),!!_mp.presence.waitOn);try{var _wr9=$('pres-wait-row');if(_wr9)_wr9.style.display=_mp.presence.waitOn?'':'none';var _wm9=$('pres-wait-min');if(_wm9){var _wv9=String(_mp.presence.waitMin||5);if(['1','3','5','10','15','20','30','60'].indexOf(_wv9)===-1)_wv9='5';_wm9.value=_wv9}var _wf9=$('pres-wait-from');if(_wf9)_wf9.value=(_mp.presence.waitFrom==='boot'?'boot':'resume')}catch(e){}/* fix-r7 */`},

  {label:'W9 事件绑定（开关 + 两个下拉）',
   old:
`$('pres-hb-post').addEventListener('click',async()=>{await loadMP();_mp.presence=_mp.presence||{};_mp.presence.hbPost=!_mp.presence.hbPost;sw2($('pres-hb-post'),_mp.presence.hbPost);await saveMP()});`,
   new:
`$('pres-hb-post').addEventListener('click',async()=>{await loadMP();_mp.presence=_mp.presence||{};_mp.presence.hbPost=!_mp.presence.hbPost;sw2($('pres-hb-post'),_mp.presence.hbPost);await saveMP()});
$('pres-wait').addEventListener('click',async()=>{await loadMP();_mp.presence=_mp.presence||{};_mp.presence.waitOn=!_mp.presence.waitOn;sw2($('pres-wait'),_mp.presence.waitOn);var _wr8=$('pres-wait-row');if(_wr8)_wr8.style.display=_mp.presence.waitOn?'':'none';await saveMP();try{_hbWaitArm()}catch(e){}});/* fix-r7 */
$('pres-wait-min').addEventListener('change',async()=>{await loadMP();_mp.presence=_mp.presence||{};_mp.presence.waitMin=parseInt($('pres-wait-min').value)||5;await saveMP();try{_hbWaitArm()}catch(e){}});/* fix-r7 */
$('pres-wait-from').addEventListener('change',async()=>{await loadMP();_mp.presence=_mp.presence||{};_mp.presence.waitFrom=$('pres-wait-from').value==='boot'?'boot':'resume';await saveMP()});/* fix-r7 */`},

  {label:'W10 概率行：免掷标记读一次即清',
   old:
`    if(_md&&Math.random()*100>=Math.max(1,Math.min(100,parseInt(ps.randP)||35)))return;`,
   new:
`    var _roll9=(_md&&!_hbNoRoll);_hbNoRoll=0;/* fix-r7：等待期刚结束的那一次免掷概率（读一次即清，之后照旧随机） */
    if(_roll9&&Math.random()*100>=Math.max(1,Math.min(100,parseInt(ps.randP)||35)))return;`},

  {label:'W11a 导入前：记下本机的等待参数',
   old:
`  var fail=[],cnt={};`,
   new:
`  var fail=[],cnt={};
  var _keepW9=null;try{var _kr9=await dbGet('apiSettings','mobilePrefs');var _kp9=(_kr9&&_kr9.presence)||{};_keepW9={waitOn:_kp9.waitOn,waitMin:_kp9.waitMin,waitFrom:_kp9.waitFrom}}catch(e){}/* fix-r7：导入语义的第一个例外——本机的「启动等待」三字段以本机为准 */`},

  {label:'W11b 导入后：把本机的等待参数写回',
   old:
`  _calEvents=[];_calNotes=[];
  await loadCfgs();await loadMP();`,
   new:
`  _calEvents=[];_calNotes=[];
  await loadCfgs();await loadMP();
  if(_keepW9){try{var _kr10=await dbGet('apiSettings','mobilePrefs');if(_kr10&&typeof _kr10==='object'){var _kn9=0;_kr10.presence=_kr10.presence||{};if(_keepW9.waitOn!==undefined){_kr10.presence.waitOn=_keepW9.waitOn;_kn9++}if(_keepW9.waitMin!==undefined){_kr10.presence.waitMin=_keepW9.waitMin;_kn9++}if(_keepW9.waitFrom!==undefined){_kr10.presence.waitFrom=_keepW9.waitFrom;_kn9++}if(_kn9){await dbPut('apiSettings',_kr10);_mp=null;_mpFromDb=false;await loadMP()}}}catch(e){}}/* fix-r7：本机没设过的字段（undefined）不覆盖，导入进来的值照旧保留 */`}

  ]
};
