/* _patch_r6_summary.js —— 补丁清单：「摘要修复」（fix-r6，13 处）
 *
 * 改动围绕两件事：① 摘要请求的输出预算被思维链吃光；② 失败原因说不清（每个出口都给真因）。
 *   H1  摘要请求带 _noThink 标记
 *   H2  OpenAI 兼容分支：命中 DeepSeek 时下发 thinking:{type:'disabled'}
 *   H3a 空正文时记住真因（按 finish 区分）
 *   H3b 新增模块级 _sumLastErrM
 *   H3c 「立即更新」的提示直接显示真因（不再套 "未生成：" 前缀）
 *   H4  并发早退（已有一轮在跑）给真话，且每次尝试先清空上一次的真因
 *   H5  「已经没什么要补的」这条早退给真话（文案由用户定稿）
 *   H6k 摘要未启用 / H7 频道记录读不到 / H8 读窗口失败 / H9 没有可用 Key / H10 整理期间封档线变了 —— 全部给真因
 *   H11 镜像专用版本标记 v262-p-r6（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处
 *
 * 依据：手机端上游 1e2725b0（V2.4.4，sha256 c16aca6e…30511）。
 * 由 _patch_engine.js 重放；本文件是数据，改补丁只改这里。
 */
module.exports={
  id:'r6-summary',
  about:'摘要修复（fix-r6）',
  upstream:{repo:'Sui-IB/InternalBeyond-Mobile',commit:'1e2725b0',bytes:3304065,sha256:'c16aca6e…30511'},
  expectCount:13,
  patches:[

  {label:'H1 摘要请求带 _noThink',
   old:
`  const clean=Object.assign({},cfg,{systemPrompt:'',streaming:false,thinkingEnabled:false,promptCache:false,webSearch:false});
  const r=await callAI(clean,[{role:'user',content:prompt}],'',()=>{},null,{maxTokens:4000});`,
   new:
`  const clean=Object.assign({},cfg,{systemPrompt:'',streaming:false,thinkingEnabled:false,promptCache:false,webSearch:false});
  const r=await callAI(clean,[{role:'user',content:prompt}],'',()=>{},null,{maxTokens:4000,_noThink:true});/* fix-r6：摘要不许思考——对默认开启思考的端点（DeepSeek 两档都是）下发关闭参数 */`},

  {label:'H2 下发 thinking:disabled',
   old:
`    b.max_tokens=maxT;
    if(cfg.promptCache!==false)b.prompt_cache_key='ib_'+String(cfg.id||'');`,
   new:
`    b.max_tokens=maxT;
    if(pa&&pa._noThink&&(cfg.provider==='deepseek'||/deepseek\\.com/i.test(ep)))b.thinking={type:'disabled'};/* fix-r6：DeepSeek 官方参数 thinking:{type:'disabled'} */
    if(cfg.promptCache!==false)b.prompt_cache_key='ib_'+String(cfg.id||'');`},

  {label:'H3a 记住空正文真因（按 finish 区分）',
   old:
`  if(!text)return null;
  if(text.length>LIM+100)text=text.slice(0,LIM)+'…';`,
   new:
`  if(!text){_sumLastErrM=((r&&r.fin)==='length')?'摘要没写出来：模型把输出预算用在思考上了（finish=length，可换个不带思考的模型执笔）':'摘要没写出来：正文是空的（finish='+String((r&&r.fin)||'?')+'），可稍后再试';return null}/* fix-r6：按 finish 区分真因（对齐电脑端 :12207 的口径），不把"思考吃光"当成唯一解释 */
  if(text.length>LIM+100)text=text.slice(0,LIM)+'…';`},

  {label:'H3b 新增 _sumLastErrM',
   old:
`let _summarizingM=false;const _sumFailCdM={};`,
   new:
`let _summarizingM=false;let _sumLastErrM='';const _sumFailCdM={};/* fix-r6 */`},

  {label:'H3c 提示直接显示真因',
   old:
`  else toast('未生成：消息不足或 API 不可用');`,
   new:
`  else toast(_sumLastErrM||'未生成：消息不足或 API 不可用');/* fix-r6：直接显示真因（各出口都写好了人话，不再套前缀） */`},

  {label:'H5 已无要补的内容时给真话',
   old:
`    if(toSum.length<2)return null;`,
   new:
`    if(toSum.length<2){_sumLastErrM='摘要已是最新：暂时没有要补的内容（再聊多些，会自动跟上）';return null}/* fix-r6：文案由用户定稿 */`},

  {label:'H4 并发早退给真话 + 每次尝试清空真因',
   old:
`  if(_summarizingM)return null;_summarizingM=true;`,
   new:
`  if(_summarizingM){_sumLastErrM='摘要正在整理中，稍等十几秒再点一次';return null}/* fix-r6：并发早退给真话 */
  _summarizingM=true;_sumLastErrM='';/* fix-r6：每次尝试先清空上一次的真因，避免读到陈旧原因 */`},

  {label:'H6k 摘要未启用也给真因',
   old:
`    const ss=await getSummarySettingsM();if(!ss.enabled)return null;`,
   new:
`    const ss=await getSummarySettingsM();if(!ss.enabled){_sumLastErrM='对话摘要没有开启：API 页 → 全局设置 → 对话摘要 里打开';return null}/* fix-r6：出口都给真因 */`},

  {label:'H7 频道记录缺失也给真因',
   old:
`if(!thr0)return null;seal=Number(thr0.sealTimestamp||0)}`,
   new:
`if(!thr0){_sumLastErrM='读不到这个频道的记录：退出去重进一次再试';return null}seal=Number(thr0.sealTimestamp||0)}`},

  {label:'H8 读窗口失败也给真因',
   old:
`    try{all=await _sumTailM(cfg.id,threadId,seal,win+keep)}catch(e){return null}`,
   new:
`    try{all=await _sumTailM(cfg.id,threadId,seal,win+keep)}catch(e){_sumLastErrM='读取本地记录失败：'+String((e&&e.message)||e);return null}/* fix-r6：出口都给真因 */`},

  {label:'H9 无 Key 也给真因',
   old:
`    if(!sumCfg.apiKey)return null;`,
   new:
`    if(!sumCfg.apiKey){_sumLastErrM='摘要用的 API 没填 Key，去 API 页补上就能用';return null}/* fix-r6：出口都给真因 */`},

  {label:'H10 封档线变化也给真因',
   old:
`      if(Number(latest||0)!==seal)return null;`,
   new:
`      if(Number(latest||0)!==seal){_sumLastErrM='这次整理作废了：期间封档位置变了，再点一次即可';return null}/* fix-r6：出口都给真因 */`},

  {label:'H11 版本标记（镜像专用，PR 不含）',mirrorOnly:true,
   old:
`var IB_VER='v262-p',IB_VER_DATE='2026-09-18';`,
   new:
`var IB_VER='v262-p-r6',IB_VER_DATE='2026-09-18';/* fix-r6：镜像专用版本标记（Data 页可辨认是否已换构建）；提上游的 PR 不含这一处 */`}

  ]
};
