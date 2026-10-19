/* _deploy_patch_main.js —— 把改动好的文件作为**一个提交**推上镜像 main（支持同时推多个文件）
   用途：自用补丁上线（本地 git 写不落盘，全程走 gh api：blobs → trees → commits → refs）。
   用法：node _deploy_patch_main.js <补丁后的 index.html> "<提交信息>" [仓库] [分支] [更多的 目的路径=本地文件 …]
         主文件默认推到仓库根的 index.html（＝正式上线）。设 **IB_DEST=<仓库内路径>** 可推到别处，
         例如 IB_DEST=test-r7/index.html 用来发布**验证版** —— 只加一个子路径，绝不碰正式版。
         设 **IB_DELETE=<仓库内路径，逗号分隔>** 可在同一次提交里删掉文件（例如清理验证版目录）。
   例：  node _deploy_patch_main.js _up_v4.html "自用补丁 fix-r6（v4）" "" "" ib-ver.html=ib-ver.html
   （目的路径 = 仓库里的路径；第 3/4 个参数留空即用默认仓库与 main）
   会打印：父提交 / 每个文件的 blob / 新 tree / 新提交 / 更新后的 ref。失败即抛错，不吞。
   回滚：node _rollback_main.js <要回退到的 sha> */
const fs=require('fs'),path=require('path'),os=require('os');
const {execSync}=require('child_process');

const file=process.argv[2], msg=process.argv[3];
const repo=process.argv[4]||'PasleySage/InternalBeyond-Mobile';
const branch=process.argv[5]||'main';
const destMain=process.env.IB_DEST||'index.html';/* 主文件的目的路径；默认 ＝ 正式上线 */
const extra=process.argv.slice(6).map(s=>{const i=s.indexOf('=');return {dest:s.slice(0,i),src:s.slice(i+1)}});
if(!file||!msg){console.error('用法：node _deploy_patch_main.js <index.html> "<提交信息>" [repo] [branch] [dest=src …]');process.exit(1)}
if(!process.env.GH_CONFIG_DIR)process.env.GH_CONFIG_DIR='C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ibdeploy-'));
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
const ghIn=(a,bodyFile)=>ghRetry('gh api '+a+' --input "'+bodyFile+'"');
const api=(p)=>JSON.parse(gh('-H "Accept: application/vnd.github+json" /repos/'+repo+p));

const head=api('/commits/'+branch);
const parent=head.sha, baseTree=head.commit.tree.sha;
console.log('父提交 '+parent);
console.log('父 tree '+baseTree);

const entries=[];
function putBlob(dest,src){
  const b64=fs.readFileSync(src).toString('base64');
  const b=path.join(tmp,'blob_'+entries.length+'.json');
  fs.writeFileSync(b,JSON.stringify({content:b64,encoding:'base64'}),'utf8');
  const sha=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/blobs',b)).sha;
  console.log('blob '+dest+' → '+sha);
  entries.push({path:dest,mode:'100644',type:'blob',sha:sha});
}
putBlob(destMain,file);
/* IB_DELETE：在同一次提交里删掉仓库内的文件（tree 里给 sha:null）—— 例如清理验证版子路径 */
const delList=(process.env.IB_DELETE||'').split(',').map(function(s){return s.trim()}).filter(Boolean);
delList.forEach(function(p){console.log('删除 '+p);entries.push({path:p,mode:'100644',type:'blob',sha:null})});
extra.forEach(x=>putBlob(x.dest,x.src));

const b2=path.join(tmp,'tree.json');
fs.writeFileSync(b2,JSON.stringify({base_tree:baseTree,tree:entries}),'utf8');
const tree=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/trees',b2)).sha;
console.log('新 tree '+tree);

const b3=path.join(tmp,'commit.json');
fs.writeFileSync(b3,JSON.stringify({message:msg,tree:tree,parents:[parent]}),'utf8');
const commit=JSON.parse(ghIn('-X POST /repos/'+repo+'/git/commits',b3)).sha;
console.log('新提交  '+commit);

const b4=path.join(tmp,'ref.json');
fs.writeFileSync(b4,JSON.stringify({sha:commit,force:true}),'utf8');
const ref=JSON.parse(ghIn('-X PATCH /repos/'+repo+'/git/refs/heads/'+branch,b4));
console.log('ref 更新 → refs/heads/'+branch+' = '+ref.object.sha);

const cmp=api('/compare/'+parent+'...'+branch);
console.log('compare  '+parent.slice(0,7)+'...'+branch+' = '+cmp.status+' / '+cmp.total_commits+' commit / '+cmp.files.length+' file ('+cmp.files.map(f=>f.filename+' +'+f.additions+' -'+f.deletions).join(', ')+')');
fs.rmSync(tmp,{recursive:true,force:true});

