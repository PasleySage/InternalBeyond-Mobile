/* _mk_summary_patch.js —— 生成「摘要修复」自用补丁（锚点替换，不依赖行号，供上游每次发版后重放）
   用法：node _mk_summary_patch.js <上游 index.html> [输出文件]
   断言：每处锚点必须命中且只命中 1 次，否则报错退出（上游改了这里就该人工看一眼再放行）。
   改动共 13 处，围绕两件事：① 摘要请求的输出预算被思维链吃光；② 失败原因说不清（每个出口都给真因）。
     H1  摘要请求带 _noThink 标记
     H2  OpenAI 兼容分支：命中 DeepSeek 时下发 thinking:{type:'disabled'}
     H3a 空正文时记住真因（不再是静默 null）
     H3b 新增模块级 _sumLastErrM
     H3c 「立即更新」的提示直接显示真因（不再套 "未生成：" 前缀）
     H4  并发早退（已有一轮在跑）给真话，且每次尝试先清空上一次的真因
     H5  「已经没什么要补的」这条早退给真话（文案由用户定稿）
     H6k 摘要未启用 / H7 频道记录读不到 / H8 读窗口失败 / H9 没有可用 Key / H10 整理期间封档线变了 —— 全部给真因
     H11 镜像专用版本标记 v262-p-r6（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处
   依据：手机端上游 1e2725b0（V2.4.4，sha256 c16aca6e…30511）。 */
const fs=require('fs');
const src=process.argv[2]||'_up_index.html';
const out=process.argv[3]||'_up_patched.html';
let s=fs.readFileSync(src,'utf8');
const EOL=/\r\n/.test(s)?'\r\n':'\n';
let hits=[];
function rep(oldLit,newLit,label){
  const rx=new RegExp(oldLit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').split('\n').join('\\r?\\n'),'g');
  const n=(s.match(rx)||[]).length;
  hits.push([label,n]);
  if(n!==1)throw new Error('锚点「'+label+'」命中 '+n+' 次（应为 1）——上游改动过这里，停止生成');
  s=s.replace(rx,()=>newLit.split('\n').join(EOL));
}

rep(
`  const clean=Object.assign({},cfg,{systemPrompt:'',streaming:false,thinkingEnabled:false,promptCache:false,webSearch:false});
  const r=await callAI(clean,[{role:'user',content:prompt}],'',()=>{},null,{maxTokens:4000});`,
`  const clean=Object.assign({},cfg,{systemPrompt:'',streaming:false,thinkingEnabled:false,promptCache:false,webSearch:false});
  const r=await callAI(clean,[{role:'user',content:prompt}],'',()=>{},null,{maxTokens:4000,_noThink:true});/* fix-r6：摘要不许思考——对默认开启思考的端点（DeepSeek 两档都是）下发关闭参数 */`,
'H1 摘要请求带 _noThink');

rep(
`    b.max_tokens=maxT;
    if(cfg.promptCache!==false)b.prompt_cache_key='ib_'+String(cfg.id||'');`,
`    b.max_tokens=maxT;
    if(pa&&pa._noThink&&(cfg.provider==='deepseek'||/deepseek\\.com/i.test(ep)))b.thinking={type:'disabled'};/* fix-r6：DeepSeek 官方参数 thinking:{type:'disabled'} */
    if(cfg.promptCache!==false)b.prompt_cache_key='ib_'+String(cfg.id||'');`,
'H2 下发 thinking:disabled');

rep(
`  if(!text)return null;
  if(text.length>LIM+100)text=text.slice(0,LIM)+'…';`,
`  if(!text){_sumLastErrM=((r&&r.fin)==='length')?'摘要没写出来：模型把输出预算用在思考上了（finish=length，可换个不带思考的模型执笔）':'摘要没写出来：正文是空的（finish='+String((r&&r.fin)||'?')+'），可稍后再试';return null}/* fix-r6：按 finish 区分真因（对齐电脑端 :12207 的口径），不把"思考吃光"当成唯一解释 */
  if(text.length>LIM+100)text=text.slice(0,LIM)+'…';`,
'H3a 记住空正文真因（按 finish 区分）');

rep(
`let _summarizingM=false;const _sumFailCdM={};`,
`let _summarizingM=false;let _sumLastErrM='';const _sumFailCdM={};/* fix-r6 */`,
'H3b 新增 _sumLastErrM');

rep(
`  else toast('未生成：消息不足或 API 不可用');`,
`  else toast(_sumLastErrM||'未生成：消息不足或 API 不可用');/* fix-r6：直接显示真因（各出口都写好了人话，不再套前缀） */`,
'H3c 提示直接显示真因');

rep(
`    if(toSum.length<2)return null;`,
`    if(toSum.length<2){_sumLastErrM='摘要已是最新：暂时没有要补的内容（再聊多些，会自动跟上）';return null}/* fix-r6：文案由用户定稿 */`,
'H5 已无要补的内容时给真话');

rep(
`  if(_summarizingM)return null;_summarizingM=true;`,
`  if(_summarizingM){_sumLastErrM='摘要正在整理中，稍等十几秒再点一次';return null}/* fix-r6：并发早退给真话 */
  _summarizingM=true;_sumLastErrM='';/* fix-r6：每次尝试先清空上一次的真因，避免读到陈旧原因 */`,
'H4 并发早退给真话 + 每次尝试清空真因');

rep(
`    const ss=await getSummarySettingsM();if(!ss.enabled)return null;`,
`    const ss=await getSummarySettingsM();if(!ss.enabled){_sumLastErrM='对话摘要没有开启：API 页 → 全局设置 → 对话摘要 里打开';return null}/* fix-r6：出口都给真因 */`,
'H6k 摘要未启用也给真因');

rep(
`if(!thr0)return null;seal=Number(thr0.sealTimestamp||0)}`,
`if(!thr0){_sumLastErrM='读不到这个频道的记录：退出去重进一次再试';return null}seal=Number(thr0.sealTimestamp||0)}`,
'H7 频道记录缺失也给真因');

rep(
`    try{all=await _sumTailM(cfg.id,threadId,seal,win+keep)}catch(e){return null}`,
`    try{all=await _sumTailM(cfg.id,threadId,seal,win+keep)}catch(e){_sumLastErrM='读取本地记录失败：'+String((e&&e.message)||e);return null}/* fix-r6：出口都给真因 */`,
'H8 读窗口失败也给真因');

rep(
`    if(!sumCfg.apiKey)return null;`,
`    if(!sumCfg.apiKey){_sumLastErrM='摘要用的 API 没填 Key，去 API 页补上就能用';return null}/* fix-r6：出口都给真因 */`,
'H9 无 Key 也给真因');

rep(
`      if(Number(latest||0)!==seal)return null;`,
`      if(Number(latest||0)!==seal){_sumLastErrM='这次整理作废了：期间封档位置变了，再点一次即可';return null}/* fix-r6：出口都给真因 */`,
'H10 封档线变化也给真因');

if(!process.env.IB_PR){
rep(
`var IB_VER='v262-p',IB_VER_DATE='2026-09-18';`,
`var IB_VER='v262-p-r6',IB_VER_DATE='2026-09-18';/* fix-r6：镜像专用版本标记（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处 */`,
'H11 版本标记（镜像专用，PR 不含）');
}else{
console.log('（IB_PR=1：跳过 H11 版本标记 —— 这一处只属于镜像，不进提交给上游的版本）');
}

fs.writeFileSync(out,s,'utf8');
console.log('OK 写入 '+out);
hits.forEach(([l,n])=>console.log('  '+l+' → 命中 '+n));
console.log('原文件 '+origSize()+' 字节 → 新文件 '+Buffer.byteLength(s,'utf8')+' 字节');
function origSize(){return Buffer.byteLength(fs.readFileSync(src,'utf8'),'utf8')}
