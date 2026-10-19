/* _patch_engine.js —— 通用「锚点补丁」引擎（不依赖行号，供上游每次发版后重放）
 *
 * 用法：node _patch_engine.js <补丁清单.js> <上游文件> [输出文件]
 *
 * 清单（一个 CommonJS 模块）：
 *   module.exports = {
 *     id:'r6-summary', about:'摘要修复',
 *     upstream:{repo, commit, bytes, sha256},
 *     expectCount:13,                        // 本集共有几个 patch（引擎核对，写错即报错）
 *     needs:['r6-summary'],                  // 链式依赖：必须先应用谁
 *     patches:[ {label, old, new, expect?, mirrorOnly?} ]
 *   }
 *
 * 三道断言，任一不过都**不写产物**、以非零码退出：
 *   ① 每处锚点命中数必须等于 expect（默认 1）——上游改动过这里，停下人工看。
 *   ② expectCount 必须等于 patches 的实际个数 —— 头注释与清单长期不同步过两次。
 *   ③ 产物的 script 块语法必须可解析，且坏块数不超过原文 —— 补丁改坏脚本时立刻停，
 *      否则要等到真机白屏才发现。只比较"坏块数有没有增加"，所以上游本身的怪写法不会误报。
 *
 * 环境变量：IB_PR=1 —— 跳过 mirrorOnly 的补丁（用于生成「提交给上游」的版本）。
 * 设计：清单是数据、引擎是代码 —— 新增补丁只写清单，不动这里。
 */
const fs=require('fs'),path=require('path'),vm=require('vm');

function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

function applyPatches(srcText,patches,opt){
  opt=opt||{};
  const includeMirror=opt.includeMirror!==false;
  const EOL=/\r\n/.test(srcText)?'\r\n':'\n';
  let s=srcText;const hits=[],skipped=[];
  (patches||[]).forEach(function(p){
    if(p.mirrorOnly&&!includeMirror){skipped.push(p.label);return}
    const rx=new RegExp(esc(p.old).split('\n').join('\\r?\\n'),'g');
    const n=(s.match(rx)||[]).length;
    const want=(p.expect==null?1:p.expect);
    hits.push([p.label,n]);
    if(n!==want)throw new Error('锚点「'+p.label+'」命中 '+n+' 次（应为 '+want+'）——上游改动过这里，停止生成');
    const repl=p.new.split('\n').join(EOL);
    s=s.replace(rx,function(){return repl});
  });
  return {text:s,hits:hits,skipped:skipped,EOL:EOL};
}

/* 逐个数 script 块，返回"编译不过"的那些（含序号与原因） */
function badBlocks(text){
  const re=/<script[^>]*>([\s\S]*?)<\/script>/g;
  const bad=[];let m,i=0;
  while((m=re.exec(text))){
    try{new vm.Script(m[1])}catch(e){bad.push('#'+i+' '+e.message)}
    i++;
  }
  return bad;
}

/* 断言 ②③ 合在一处：清单自洽 + 产物没被改坏。均在写文件之前调用 */
function assertSpec(spec){
  if(spec.expectCount!=null&&(spec.patches||[]).length!==spec.expectCount)
    throw new Error('清单 '+(spec.id||'?')+'：expectCount 写的是 '+spec.expectCount+'，实际有 '+(spec.patches||[]).length+' 个 patch —— 两者必须一致');
}
function assertOutput(rawText,outText){
  const base=badBlocks(rawText),out=badBlocks(outText);
  if(out.length>base.length)
    throw new Error('产物比原文多了 '+(out.length-base.length)+' 个语法不合法的 script 块：'+out.join(' ／ ')+' —— 补丁把脚本改坏了，停止生成');
  console.log('  语法检查：'+out.length+' 个坏块（原文 '+base.length+' 个）✓');
}

function run(spec,src,out,opt){
  opt=opt||{};
  const raw=fs.readFileSync(src,'utf8');
  const includeMirror=(opt.includeMirror==null)?!process.env.IB_PR:opt.includeMirror;
  assertSpec(spec);
  const r=applyPatches(raw,spec.patches,{includeMirror:includeMirror});
  assertOutput(raw,r.text);
  fs.writeFileSync(out,r.text,'utf8');
  console.log('OK 写入 '+out+'（补丁集 '+(spec.id||'?')+'：'+(spec.about||'')+'）');
  r.hits.forEach(function(h){console.log('  '+h[0]+' → 命中 '+h[1])});
  if(r.skipped.length)console.log('（IB_PR=1：跳过镜像专用处 —— '+r.skipped.join('、')+'）');
  console.log('原文件 '+Buffer.byteLength(raw,'utf8')+' 字节 → 新文件 '+Buffer.byteLength(r.text,'utf8')+' 字节');
  return r;
}

function loadSpec(p){return require(path.resolve(p))}

/* 链式应用：把多个清单按顺序打在**同一个产物**上（补丁是累积的）。
   清单可用 needs:[id] 声明依赖，顺序传错会报错 —— 例如 r7 的版本标记行以 r6 之后的状态为锚点。 */
function runChain(specs,src,out,opt){
  opt=opt||{};
  const includeMirror=(opt.includeMirror==null)?!process.env.IB_PR:opt.includeMirror;
  const raw=fs.readFileSync(src,'utf8');
  let text=raw;
  const done=[];let total=0;
  specs.forEach(function(sp){
    (sp.needs||[]).forEach(function(n){
      if(done.indexOf(n)===-1)throw new Error('清单 '+(sp.id||'?')+' 声明依赖「'+n+'」，但它尚未被应用 —— 请按顺序传入清单');
    });
    assertSpec(sp);
    const r=applyPatches(text,sp.patches,{includeMirror:includeMirror});
    text=r.text;total+=r.hits.length;
    console.log('· 应用 '+(sp.id||'?')+'（'+(sp.about||'')+'）：'+r.hits.length+' 处'+(r.skipped.length?('，跳过镜像专用 '+r.skipped.length+' 处'):''));
    r.hits.forEach(function(h){console.log('    '+h[0]+' → 命中 '+h[1])});
    if(sp.id)done.push(sp.id);
  });
  assertOutput(raw,text);
  fs.writeFileSync(out,text,'utf8');
  console.log('OK 写入 '+out+'（共 '+total+' 处；链条：'+done.join(' → ')+'）');
  console.log('新文件 '+Buffer.byteLength(text,'utf8')+' 字节');
  return {text:text,done:done};
}

module.exports={applyPatches:applyPatches,run:run,runChain:runChain,loadSpec:loadSpec,badBlocks:badBlocks};

if(require.main===module){
  const argv=process.argv.slice(2);
  if(argv.length<2){console.error('用法：node _patch_engine.js <补丁清单.js> <上游文件> [输出文件]');process.exit(2)}
  try{run(loadSpec(argv[0]),argv[1],argv[2]||'_up_patched.html')}
  catch(e){console.error('✗ '+((e&&e.message)||e));process.exit(1)}
}
