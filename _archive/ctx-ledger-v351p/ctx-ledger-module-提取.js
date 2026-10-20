<script id="ib-ctx-ledger">
/* ────────────────────────────────────────────────────────────────
   上下文账本 _ctxLedgerM（旁挂观测模块 · 2026-10-16 · Phase 2a）
   规格：.scratch/ib-ctx-ledger/issues/01（捕获埋点）／05（快照形状）／
   02（headShow）／04（六组映射）／06（水水指令）／07（面板行）
   性质：与缓存探针 _ibOaiCacheDiagM 同规格——同路径旁挂、各自独立、
   全 try/catch、任何异常只丢块、绝不抛回组包；不碰缓存探针一个字。
   ──────────────────────────────────────────────────────────────── */
(function(){
'use strict';
/* ── 常量（票05 Q3/Q7；WRAP_OVERHEAD＝tails 包裹标记字符数基线值：_IB_TAIL_HEAD 65 字＋_IB_TAIL_USER 11 字；实际值由埋点 wrap() 在 :10774 包裹 if 前实测，本常量退为桩测基准——上游改标记文案时零漂移）── */
var N_TURNS=6,U_CAP=500,HEAD_N=150,WRAP_OVERHEAD=76;/* D17：HEAD_N 随作者移植约定③退为历史常量——add/snapshot 均不再存 150 字预览，只存 id/len/tok；保留备查 */
/* ── 六组固定语义序＋副标（票04 §1/§5 Q5；跨轮可比为支柱，非按大小排序）── */
var GROUPS=[["persona","人设与资料","TA 是谁、你是谁、System Prompt 等"],
["rules","功能与规则","工具用法与能力设定，只要不关能力，每次发的内容都一样"],
["hist","前序历史","之前发过的原话、滚动摘要、封存的前情提要等"],/* 2026-10-17 两次改名（patch18→patch25）：对话历史→本窗历史→前序历史（用户终裁，副标同步重写） */
["memory","记忆与档案","TA 主动记住的：一直记得的、置顶的、临时想起来的内容等"],
["dynamic","动态资料","每轮现取：时间、日程、Blog、Beyond、信箱、音乐、离开时长、调取结果等"],
["other","其他","不好归到上面五组的部分，正常为空"]];
/* ── 块 ID → 语义组（票04 §2 交付物②；报告层可改映射——改组名/归属不重打埋点）── */
var GROUP_M={"dm.sys.persona":"persona","dm.sys.userctx":"persona","dm.sys.nopersona":"persona","dm.sys.sitenote":"persona","dm.sys2.persona":"persona","dm.sys.protocols":"rules","dm.sys.tools":"rules","dm.sys.am_instr":"rules","dm.hist.summary":"hist","dm.sys2.chap":"hist","dm.sys2.amcore":"memory","dm.sys2.cold":"memory","dm.tail.mem":"memory","dm.tail.amdyn":"memory","dm.tail.time":"dynamic","dm.tail.cal":"dynamic","dm.tail.music":"dynamic","dm.tail.posts":"dynamic","dm.tail.blogread":"dynamic","dm.tail.beyond":"dynamic","dm.tail.bxinbox":"dynamic","dm.tail.presence":"dynamic","dm.tail.gwfeed":"dynamic","dm.tail.app":"dynamic","grp.sys.persona":"persona","grp.sys.rules":"rules","grp.sys.sitenote":"persona","grp.sys.userctx":"persona","grp.sys.am_instr":"rules","grp.sys.ask":"rules","grp.sys.sticker":"rules","grp.sys.beyond_instr":"rules","grp.sys.call":"rules","grp.sys2.amstable":"memory","grp.sys2.chap":"hist","grp.sys2.persona":"persona","grp.tail.time":"dynamic","grp.tail.idle":"dynamic","grp.tail.auto":"dynamic","grp.tail.app":"dynamic","grp.tail.gsum":"hist","grp.tail.mem":"memory","grp.tail.amdyn":"memory","grp.tail.beyond":"dynamic","grp.tail.bxinbox":"dynamic","grp.tail.gwfeed":"dynamic","hb.sys.persona":"persona","hb.sys.nopersona":"persona","hb.sys.userctx":"persona","hb.sys.am_instr":"rules","hb.sys.amstable":"memory","hb.sys.persona_lock":"persona","hb.tail.mem":"memory","hb.tail.amdyn":"memory","hb.tail.beyond":"dynamic","hb.ctx.time":"dynamic","hb.ctx.relation":"persona","hb.ctx.recent":"hist","hb.ctx.cal":"dynamic","hb.ctx.phonesnap":"dynamic","hb.ctx.instruction":"dynamic","hb.ctx.callinvite":"dynamic"};/* D17：群聊 grp.*（22）＋主动开口 hb.*（16）两层块 ID→六组映射（票01 §3/§4；hb 路径无 _SYS_SPLIT_M，system 块统一 hb.sys.* 前缀；idle/auto/instruction 按「每轮现取」归 dynamic）*/
/* ── headShow 映射（票02 §10 定值；注：06/07 两入口定稿均为组级渲染、不放 head，
   故本映射当前不渲染——保留映射与桩测断言（任何渲染路径不得输出块 head），
   防回归；若未来形态变更要显 head，按此映射取用）── */
var HEADSHOW={"dm.sys.persona":1,"dm.sys.userctx":1,"dm.sys2.cold":1,"dm.tail.mem":1,"dm.tail.posts":1,"dm.tail.blogread":1,"dm.tail.music":1,"dm.hist.summary":1};
/* ── 本应有却空的块（票01 §8：值为 0 时报告显式 0；quiet 轮的 tools 由 meta.quiet 豁免，见票06 修订块②）── */
var ZERO_NOTABLE={"dm.sys.tools":1,"dm.sys2.amcore":1};
var ZERO_NOTE={"dm.sys.tools":"· 工具 0","dm.sys2.amcore":"· 常驻档案 0"}; /* 组行尾注：notable 块显式 0（2026-10-17 定稿）*/
var MISS_NOTE="· 本轮未计入"; /* 组行尾注：埋点异常（2026-10-17 定稿）*/
var EMPTY_A="还没有账本。和任一位 TA 聊上一轮——发一条消息、等 TA 回，账本在每轮请求发出前自动记下。"; /* 票06 Q4 空态A */
var EMPTY_B="这些消息都在记账功能启用之前，没有账本。新发一条消息给 TA，之后每轮都会自动记下（账本只保留最近 6 轮）。"; /* 票06 Q4 空态B */
/* ── 内部工具 ── */
var noteQ=null;/* registry 写串行链（noteSave 并发保护）*/
  function noopTurn(){return{add:function(){},addHist:function(){},addSummary:function(){},seg:function(){},wrap:function(){},snapshot:function(){return null}}}/* patch24：begin 失败时的全 no-op 句柄，调用点零 guard */
  function lenP(t){try{return Array.from(t).length}catch(e){return 0}}
  function estTok(t){try{var f=window._blogTokenEstM;if(typeof f==="function"){var v=f(t);return(typeof v==="number"&&isFinite(v))?v:0}return 0}catch(e){return 0}}
  function esc(x){return String(x).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function fmtN(n){return String(Math.max(0,Math.round(n||0))).replace(/\B(?=(\d{3})+(?!\d))/g,",")}/* patch26：负值钳制，对齐上游 amsum 同款 */
/* ── 轮次与捕获（begin 返回轮次句柄，add 系列挂句柄——patch24 修 CRITICAL 并发串话：
   genReply 的 begin→snapshot 间有 40+ await，跨会话并发生成时模块级 cur 单例会被后一个 begin
   整体覆盖：前一轮 add 落进后一轮累积器、snapshot 捕获对方块（含 head 预览，跨 TA 内容落错
   消息）、后一轮 snapshot 返 null 丢轮。状态随句柄走后这类交错不可能发生。
   add 系列仍无条件执行，空串也记 {id,0}，异常记 {id,missed:1}——票01 §8）── */
  function begin(){
  var h=null;try{h={at:Date.now(),who:"",path:"dm",cfgId:"",threadId:"",quiet:false,blocks:[],hist:null,sumText:null,sys1Len:0,sys2Len:0,wrapLen:0}}catch(e){return noopTurn()}
  function add(id,text){try{var t=(text==null)?"":String(text);h.blocks.push({id:id,len:lenP(t),tok:estTok(t)})}catch(e){try{h.blocks.push({id:id,missed:1})}catch(e2){}}}/* D17：作者约定③——块只存 id/len/tok，不存 head 预览（渲染层本就不显 head，外观零变化）*/
  function addHist(text,n,u,a,img){try{var t=(text==null)?"":String(text);h.hist={len:lenP(t),tok:estTok(t),n:n|0,u:u|0,a:a|0,img:img|0,missed:0}}catch(e){try{h.hist={missed:1}}catch(e2){}}}
  function addSummary(text){try{h.sumText=(text==null)?"":String(text)}catch(e){}}
  function seg(s1,s2){try{h.sys1Len=lenP((s1==null)?"":String(s1));h.sys2Len=lenP((s2==null)?"":String(s2))}catch(e){}}
  function wrap(n){try{h.wrapLen=(typeof n==="number"&&isFinite(n))?n:0}catch(e){}}
/* ── 收口（票05 Q1 四段结构＋cr/cw；:10782 callAIC 前调用，total/cr/cw 调用方在响应后回填）── */
  function snapshot(meta){
  try{
    var m=meta||{};
    h.at=m.at||Date.now();h.who=m.who||"";h.path=m.path||"dm";
    h.cfgId=m.cfgId||"";h.threadId=m.threadId||"";h.quiet=!!m.quiet;
    var b1=[],b2=[],bt=[],s1t=0,s2t=0,tt=0,tl=0;
    for(var i=0;i<h.blocks.length;i++){
      var b=h.blocks[i],_bid="";try{_bid=String((b&&b.id)||"")}catch(e){_bid=""}
      if(_bid.indexOf("dm.sys2.")===0||_bid.indexOf("grp.sys2.")===0){b2.push(b);if(!b.missed)s2t+=b.tok||0}/* D17：grp.sys2.* 同入块二段（与 _SYS_SPLIT_M 缓存断点对齐）*/
      else if(_bid.indexOf("dm.sys.")===0||_bid.indexOf("grp.sys.")===0||_bid.indexOf("hb.sys.")===0){b1.push(b);if(!b.missed)s1t+=b.tok||0}/* D17：grp.sys.*／hb.sys.* 同入块一段；grp.tail.*／hb.tail.*／hb.ctx.* 落 else 段（tails——hb 的 ctx 块在 user 消息内、tail 之后）*/
      else{bt.push(b);if(!b.missed){tt+=b.tok||0;tl+=b.len}}
    }
    var hLen=0,hTok=0,hn=0,hu=0,ha=0,hImg=0,hMiss=0,sum=null;
    if(h.hist&&!h.hist.missed){hLen=h.hist.len;hTok=h.hist.tok;hn=h.hist.n;hu=h.hist.u;ha=h.hist.a;hImg=h.hist.img}
    else if(h.hist&&h.hist.missed)hMiss=1;
    if(h.sumText){sum={len:lenP(h.sumText),tok:estTok(h.sumText)};hLen+=sum.len;hTok+=sum.tok}/* D17：摘要同样不存 head（约定③）*/
    var s1=h.sys1Len||0,s2=h.sys2Len||0;
    var snap={at:h.at,who:h.who,path:h.path,cfgId:h.cfgId,threadId:h.threadId,quiet:h.quiet,
      total:0,cr:0,cw:0,
      totalChars:s1+s2+hLen+tl+(h.wrapLen||0),totalTok:s1t+s2t+hTok+tt,
      sys1:{len:s1,tok:s1t,blocks:b1},
      sys2:{len:s2,tok:s2t,blocks:b2},
      hist:{len:hLen,tok:hTok,n:hn,u:hu,a:ha,img:hImg,summary:sum,missed:hMiss},
      tails:{len:tl+(h.wrapLen||0),tok:tt,blocks:bt}};
    /* 口径注记（patch21，独立审查建议）：各段 len＝seg() 实测全段长（含段间分隔符）、tok＝块 tok 之和——
       同一对象两个口径，不可相除算「字/tok 比」；报告占比一律走 agg 的组 len。totalChars/totalTok、
       hist.u/hist.a 为票05 Q1 定稿形状的观测字段，当前无渲染消费，保留备查。 */
    return snap;
  }catch(e){return null}
}
  return{add:add,addHist:addHist,addSummary:addSummary,seg:seg,wrap:wrap,snapshot:snapshot};
}
/* ── 组聚合＋三态（票04 §2 映射；票01 §8 三态：正常空→other/quiet-rules 不显示、其余零组进「为 0 的组」注记＝显式 0；
   组非零时 notable 块为 0→组行尾注；missed→组行尾注「本轮未计入」。尾注措辞占位、R2 定）── */
  function agg(s){
  var gs={},i,j;
  for(i=0;i<GROUPS.length;i++)gs[GROUPS[i][0]]={gid:GROUPS[i][0],name:GROUPS[i][1],sub:GROUPS[i][2],len:0,tok:0,n:0,missed:[],znotes:[]};
  function put(id,b){
    var _id="";try{_id=String((b&&b.id)||"")}catch(e){_id=""}
    var G=gs[GROUP_M[_id]||"other"];
    if(!G)return;
    if(b.missed){G.missed.push(_id);return}
    G.len+=b.len;G.tok+=b.tok||0;
    if(ZERO_NOTABLE[_id]&&b.len===0&&!(s.quiet&&_id==="dm.sys.tools"))G.znotes.push(_id);
  }
  var segs=[s.sys1,s.sys2,s.tails];
  for(i=0;i<segs.length;i++){var bs=(segs[i]&&segs[i].blocks)||[];for(j=0;j<bs.length;j++)put(bs[j].id,bs[j])}
  var H=gs.hist;
  if(s.hist){if(s.hist.missed)H.missed.push("dm.hist.window");else{H.len+=s.hist.len;H.tok+=s.hist.tok||0;H.n=s.hist.n||0}}/* patch24：删摘要双计——snapshot 已折叠进 hist.len（:32288），此处不再重复加 */
  return gs;
}
/* ── 组行数据（三态过滤＋占比＋尾注；reportM/tableHtml 共享数据层、各自渲染层——patch21 提取，双渲染器输出逐字节不变）── */
  function groupRows(s){
  var gs=agg(s),rows=[],zeros=[],_gt=0,i,big="",bigc=-1,nz=0;
  for(i=0;i<GROUPS.length;i++)_gt+=gs[GROUPS[i][0]].len;/* 占比分母＝组 len 总和（块级口径，各组加起来≈100%；轮头不显总字数——R3 排版重构，字数看组行相加）*/
  for(i=0;i<GROUPS.length;i++){
    var G=gs[GROUPS[i][0]],gid=G.gid;
    if(G.len===0&&G.missed.length===0){
      if(gid!=="other"&&!(s.quiet&&gid==="rules"))zeros.push(G.name);
      continue;
    }
    if(G.len>0){nz++;if(G.len>bigc){bigc=G.len;big=G.name}}/* big/nz 随数据层一起出（patch26）：reportM 轮头与 rowHtml 折叠行共用，删两处重复计算 */
    rows.push({gid:gid,name:G.name,len:G.len,tok:G.tok,pct:_gt?Math.round(G.len/_gt*100):0,n:(gid==="hist"?(G.n||0):0),img:(gid==="hist"&&s.hist&&s.hist.img)?s.hist.img:0,missed:G.missed,znotes:G.znotes});
  }
  return {rows:rows,zeros:zeros,big:big,nz:nz};
}
/* ── 水水报告（Markdown 列表＝票06 锁稿主体＋2026-10-16 修订块；## 轮头＋--- 轮间＋怎么看〈组名含义／数据怎么看／想省点上下文〉）── */
  function reportM(snaps){
  var out=["最近 "+snaps.length+" 轮的上下文账本（每轮请求发出前、组包完成时顺手记下；列表数字均为估算，轮头「总」是 API 返回的真值）：","（列表格式：字数 / tok数 (占比%)）",""];
  for(var idx=0;idx<snaps.length;idx++){
    var s=snaps[idx],gr=groupRows(s),rl=[],big=gr.big;
    for(var ri=0;ri<gr.rows.length;ri++){
      var R=gr.rows[ri];
      var line="- "+R.name+"："+fmtN(R.len)+" / "+fmtN(R.tok)+" ("+R.pct+"%)";
      if(R.gid==="hist"&&R.n)line+=" · "+R.n+"条";
      if(R.gid==="hist"&&R.img)line+=" · "+R.img+"图";
      if(R.missed.length)line+=" "+MISS_NOTE;
      for(var z=0;z<R.znotes.length;z++)line+=" "+(ZERO_NOTE[R.znotes[z]]||"");/* patch17：尾注拼接处统一加空格（· 工具 0 → " · 工具 0"）*/
      rl.push(line);
    }
    var t=new Date(s.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});
    var meas=window._tkFmtN((s.total||0)+(s.cr||0)+(s.cw||0));/* B 裁（2026-10-17 R2）＋R3 标签收尾：轮头「总」＝usage.i＋缓存读 cr＋缓存写 cw 全量（与组行估算同量级；甲裁「=usage.i 与面板同数」真机复测翻车——缓存命中时面板行 2.5k vs 表格历史 128k——已作废）；cw 采而不显；patch21：复用上游 _tkFmtN（:18828），删本地 tkFmt */
    out.push("## "+t+" · "+s.who+" · 总 "+meas+" (缓存 "+window._tkFmtN(s.cr||0)+") · 最大："+(big||"—"));
    out=out.concat(rl);
    if(gr.zeros.length)out.push("（为 0 的组："+gr.zeros.join("、")+"）");
    if(idx<snaps.length-1){out.push("");out.push("---");out.push("")}
  }
  out.push("");out.push("怎么看");out.push("组名含义（六组按固定语义排序，没写完的均以“等”指代）：");
  for(var q=0;q<GROUPS.length;q++)out.push("- "+GROUPS[q][1]+"："+GROUPS[q][2]+"。");
  out.push("数据怎么看：");
  out.push("- 字数和占比都是按字符推算的，用来比对各组大小，不一定和面板绝对一致。");
  out.push("- 在水水报告每轮开头的「总」是服务商返回的精确账单；列表里各组数字是本地估算的，有误差是正常的。");
  out.push("- 图片只计帧数、不计字符；账本为了保护隐私和节省空间，只记录各组占用的体积大小，不显示具体内容，想看具体内容请去对应的页面。");
  out.push("");out.push("想省点上下文，可以这么调：");
  out.push("- 前序历史太长时，调小上下文条数最立竿见影。");
  out.push("- 关掉不用的能力，功能与规则的占比会整块变小。");
  out.push("- 动态资料按当前场景注入，不需要时对应来源会自动不带。");
  out.push("- 想省缓存的钱，去小助手水水用「缓存探针」查查为什么没命中。");
  return out.join("\n");
}
/* ── 长按面板（票07：折叠态文案＋行内展开 4 列表；HTML 由 Phase 2b 绑定）── */
  function rowHtml(s){
  var gr=groupRows(s);
  return "<div class=\"ctx-row\" id=\"mi-ctx-row\"><span class=\"ctx-lb\">上下文</span><b>"+gr.nz+" 组"+(gr.big?(" · 占比最高 "+esc(gr.big)):"")+"</b><i class=\"ctx-arr\">›</i></div>";/* B 裁（2026-10-17 R2）：面板行不显体积——Token 行已交代输入量，账本估算与实测并排会造成认知割裂（真机：缓存命中时 2.5k vs 表格 128k）；只给结构：非零组数＋占比最高组，全零组省略子句 */
}
  function tableHtml(s){
  var gr=groupRows(s),rows=[];
  for(var ri=0;ri<gr.rows.length;ri++){
    var R=gr.rows[ri];
    var lines=[String(R.pct)];/* R3 需求2：占比单元格多行居中——原「88·979 条」列宽不够乱换行 */
    if(R.gid==="hist"&&R.n)lines.push(R.n+" 条");
    var tail="";
    if(R.missed.length)tail=MISS_NOTE;
    for(var z=0;z<R.znotes.length;z++){var _zn=ZERO_NOTE[R.znotes[z]];if(_zn)tail+=(tail?" ":"")+_zn}/* patch24：多条尾注空格归一（与 reportM 一致）*/
    if(tail)lines.push("<span class=\"ctx-znote\">"+esc(tail)+"</span>");/* 尾注随之各占一行（patch24：span 包裹允许折行防溢出；告别「87· 工具 0」挤挨）*/
    rows.push("<tr><td>"+esc(R.name)+"</td><td>"+fmtN(R.len)+"</td><td>"+fmtN(R.tok)+"</td><td class=\"ctx-pct\">"+lines.join("<br>")+"</td></tr>");
  }
  var h="<div class=\"ctx-expand\" id=\"mi-ctx-expand\"><div class=\"mdr\"><table><thead><tr><th>组</th><th>字</th><th>tok</th><th>占比(%)</th></tr></thead><tbody>"+rows.join("")+"</tbody></table></div>";
  if(gr.zeros.length)h+="<div class=\"ctx-note\">（为 0 的组："+esc(gr.zeros.join("、"))+"）</div>";
  h+="<div class=\"ctx-note\">记忆、日历、Beyond、信箱里的具体内容去对应页面看，账本只记「多大」。</div>";
  h+="<div class=\"ctx-note\">字/tok 均为约估算值。其中字数为包含标点符号的字符总数；tok因本地无法获取模型的真实分词库，按经验公式推算，绝对值可能与面板计费有差异，但不影响各组占比参考。</div>";/* R3 需求1 列头去「(约)」下沉表下；patch25 补足字/tok 口径说明（用户裁） */
  h+="<div class=\"ctx-note\">下一轮想省，可调小上下文条数；不用的能力关掉，功能与规则会整块变小。</div></div>";
  return h;
}
/* ── registry（apiSettings.ibCtxLedger＝{ids:[...]} 时序；读时取尾 N；cap 500 清最旧，同 ibTokenStats 套路）── */
  function noteSave(mid){
  noteQ=(noteQ||Promise.resolve()).then(function(){
    return (async function(){
    try{
      if(!mid)return;
      var doc=await window.dbGet("apiSettings","ibCtxLedger");
      var ids=(doc&&Array.isArray(doc.ids))?doc.ids:[];/* patch24：ids 被污染成非数组时 push 会抛、登记/读取静默停摆 */
      ids.push(mid);
      var over=ids.length-U_CAP;
      if(over>0){
        var old=ids.splice(0,over);
        for(var i=0;i<old.length;i++){
          try{var m=await window.dbGet("chatMessages",old[i]);if(m&&m.ctxSnap){delete m.ctxSnap;await window.dbPut("chatMessages",m)}}catch(e){}
        }
      }
      await window.dbPut("apiSettings",{id:"ibCtxLedger",ids:ids});
    }catch(e){}
    })();
  }).catch(function(){});
}
  function readLast(n){
  return (async function(){
    try{
      var doc=await window.dbGet("apiSettings","ibCtxLedger");
      var ids=(doc&&Array.isArray(doc.ids))?doc.ids:[];/* patch24：ids 被污染成非数组时 push 会抛、登记/读取静默停摆 */
      if(!ids.length)return [];
      var take=ids.slice(-(n||N_TURNS)),out=[];
      for(var i=0;i<take.length;i++){
        try{var m=await window.dbGet("chatMessages",take[i]);if(m&&m.ctxSnap)out.push(m.ctxSnap)}catch(e){}
      }
      return out;
    }catch(e){return []}
  })();
}
/* ── 空态 A/B 判定（票06 Q4；registry 无可读快照时探测本机有没有 AI 消息）──
   注：helper pack 跨 script 块读不到主脚本 let（_cfgs/_msgs 无 window 导出），故走 db 通道。 */
  function emptyText(){
    return (async function(){
      try{
        var cfgs=await window.dbGetAll("apiConfigs");
        var list=(cfgs||[]).filter(function(c){return c&&c.id});
        for(var i=0;i<list.length&&i<10;i++){
          try{
            var last=window._dbLastAnyByFriend?await window._dbLastAnyByFriend(list[i].id):null;
            if(last&&last.role!=="user")return EMPTY_B;
          }catch(e){}
        }
        return EMPTY_A;
      }catch(e){return EMPTY_A}
    })();
  }
/* ── 挂载通道自检（缺通道只提示、不中断采集；仿 A 探针）── */
(function(){
  var miss=[];
  if(typeof window.dbGet!=="function")miss.push("dbGet");
  if(typeof window.dbPut!=="function")miss.push("dbPut");
  if(typeof window._blogTokenEstM!=="function")miss.push("_blogTokenEstM");
  if(typeof window._tkFmtN!=="function")miss.push("_tkFmtN");/* patch21：轮头数字格式化走后端 _tkFmtN，缺了轮头变 NaN */
  try{
    if(miss.length)console.log("⚠️ 上下文账本：取数通道缺失（"+miss.join("、")+"）——对应功能降级，不影响采集");
    else console.log("✅ 上下文账本 _ctxLedgerM 已就绪（dbGet／dbPut／_blogTokenEstM／_tkFmtN 通道齐全）");
  }catch(e){}
})();
window._ctxLedgerM={begin:begin,emptyText:emptyText,EMPTY_A:EMPTY_A,EMPTY_B:EMPTY_B,noteSave:noteSave,readLast:readLast,reportM:reportM,rowHtml:rowHtml,tableHtml:tableHtml,agg:agg,GROUPS:GROUPS,GROUP_M:GROUP_M,HEADSHOW:HEADSHOW,ZERO_NOTABLE:ZERO_NOTABLE,N_TURNS:N_TURNS,U_CAP:U_CAP,WRAP_OVERHEAD:WRAP_OVERHEAD,MISS_NOTE:MISS_NOTE,ZERO_NOTE:ZERO_NOTE};
})();
</script>