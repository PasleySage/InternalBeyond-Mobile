/* _push_ref_branch.js —— 在指定仓库上，从一个基线提交起，新建一个分支放一份（或几份）文件
   用途：给上游开"参考实现"PR 时用 —— 分支只含方法级改动，不掺镜像专用项。
   用法：node _push_ref_branch.js <本地 index.html> <分支名> <基线提交> "<提交信息>" [仓库] [dest=src …]
   例：  node _push_ref_branch.js _up_pr.html ref/mobile-ctx-ledger 9ae7034a6c78df0c99924f7b285fbb93fabedc89 "…" "" ""
   （仓库留空＝PasleySage/InternalBeyond-Mobile；分支不存在则新建，已存在则报错退出——避免误改）
   ⚠️ 基线提交**传完整 40 位 SHA**：建 commit 的 parents 参数拒缩写（422，2026-10-18 实测踩过）；
      脚本内部已改用 resolve 到的全量 SHA（bc.sha）兜底，但 compare／建 tree 各步也以全量为稳。
   校验：建完后打印 compare，确认相对基线只动了预期文件。 */
const fs=require('fs'),path=require('path'),os=require('os');
const {execSync}=require('child_process');
const file=process.argv[2], branch=process.argv[3], base=process.argv[4], msg=process.argv[5];
const repo=process.argv[6]||'PasleySage/InternalBeyond-Mobile';
const extra=process.argv.slice(7).map(s=>{const i=s.indexOf('=');return {dest:s.slice(0,i),src:s.slice(i+1)}});
if(!file||!branch||!base||!msg){console.error('用法：node _push_ref_branch.js <index.html> <分支名> <基线提交> "<提交信息>" [仓库] [dest=src …]');process.exit(1)}
if(!process.env.GH_CONFIG_DIR)process.env.GH_CONFIG_DIR='C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ibref-'));
/* gh 偶发 401（Bad credentials）：同一个 token 前一分钟还在用，重跑即成功 ⇒ 统一重试 3 次 */
function ghRetry(cmd){
  let last;
  for(let i=1;i<=3;i++){
    try{return execSync(cmd,{encoding:'utf8',maxBuffer:1<<28,env:process.env})}
    catch(e){last=e;if(i<3)console.log('（第 '+i+' 次 gh 调用失败，重试）')}
  }
  throw last;
}
const gh=(a)=>ghRetry('gh api '+a);
const ghIn=(a,f)=>ghRetry('gh api '+a+' --input "'+f+'"');
const api=(p)=>JSON.parse(gh('-H "Accept: application/vnd.github+json" /repos/'+repo+p));
/* 分支存在性探测：404 是预期结果（分支不存在才继续），绕开 ghRetry 的重试噪音 */
const api1=(p)=>execSync('gh api -H "Accept: application/vnd.github+json" /repos/'+repo+p,{encoding:'utf8',maxBuffer:1<<28,env:process.env}).trim();

try{api1('/git/ref/heads/'+branch);console.error('分支已存在：'+branch+'（不覆盖，先人工确认）');process.exit(1)}catch(e){}

const bc=api('/commits/'+base);
const baseTree=bc.commit.tree.sha;
console.log('基线 '+base.slice(0,7)+'  tree '+baseTree);

const entries=[];
function putBlob(dest,src){
  const b=path.join(tmp,'blob_'+entries.length+'.json');
  fs.writeFileSync(b,JSON.stringify({content:fs.readFileSync(src).toString('base64'),encoding:'base64'}),'utf8');
  const sha=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/blobs',b)).sha;
  console.log('blob '+dest+' → '+sha);entries.push({path:dest,mode:'100644',type:'blob',sha:sha});
}
putBlob('index.html',file);
extra.forEach(x=>putBlob(x.dest,x.src));

const b2=path.join(tmp,'tree.json');
fs.writeFileSync(b2,JSON.stringify({base_tree:baseTree,tree:entries}),'utf8');
const tree=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/trees',b2)).sha;
console.log('tree '+tree);

const b3=path.join(tmp,'commit.json');
fs.writeFileSync(b3,JSON.stringify({message:msg,tree:tree,parents:[bc.sha]}),'utf8');
const commit=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/commits',b3)).sha;
console.log('commit '+commit);

const b4=path.join(tmp,'ref.json');
fs.writeFileSync(b4,JSON.stringify({ref:'refs/heads/'+branch,sha:commit}),'utf8');
const ref=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/refs',b4));
console.log('branch → '+ref.ref+' = '+ref.object.sha);

const cmp=api('/compare/'+base+'...'+branch);
console.log('compare '+base.slice(0,7)+'...'+branch+' = '+cmp.status+' / '+cmp.total_commits+' commit / '+cmp.files.length+' file ('+cmp.files.map(f=>f.filename+' +'+f.additions+' -'+f.deletions).join(', ')+')');
fs.rmSync(tmp,{recursive:true,force:true});
