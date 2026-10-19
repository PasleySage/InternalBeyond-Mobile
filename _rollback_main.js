/* _rollback_main.js —— 把镜像 main 退回指定提交（默认退回自用补丁之前的上游提交）
   用法：node _rollback_main.js [目标 sha] [repo] [branch]
   例：  node _rollback_main.js 1e2725b0a6ff321d387c00e94178ab3f0d6933db
   说明：非快进，需要 force；退回后 Pages 会重新构建，用 _verify_live.js 复核线上与上游原文逐字节一致。 */
const fs=require('fs'),path=require('path'),os=require('os');
const {execSync}=require('child_process');
const target=process.argv[2]||'1e2725b0a6ff321d387c00e94178ab3f0d6933db';
const repo=process.argv[3]||'PasleySage/InternalBeyond-Mobile';
const branch=process.argv[4]||'main';
if(!process.env.GH_CONFIG_DIR)process.env.GH_CONFIG_DIR='C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ibrollback-'));
const body=path.join(tmp,'ref.json');
fs.writeFileSync(body,JSON.stringify({sha:target,force:true}),'utf8');
const out=execSync('gh api -X PATCH /repos/'+repo+'/git/refs/heads/'+branch+' --input "'+body+'"',{encoding:'utf8',maxBuffer:1<<28,env:process.env});
const ref=JSON.parse(out);
console.log('refs/heads/'+branch+' → '+ref.object.sha);
try{
  const cmp=JSON.parse(execSync('gh api /repos/'+repo+'/compare/'+target+'...'+branch,{encoding:'utf8',maxBuffer:1<<28,env:process.env}));
  console.log('compare '+target.slice(0,7)+'...'+branch+' = '+cmp.status+' / '+cmp.total_commits+' commit');
}catch(e){}
try{
  const pg=JSON.parse(execSync('gh api /repos/'+repo+'/pages/builds/latest',{encoding:'utf8',maxBuffer:1<<28,env:process.env}));
  console.log('Pages '+pg.status+'@'+String(pg.commit||'').slice(0,7)+'（重建需要一两分钟，之后用 _verify_live.js 复核）');
}catch(e){}
fs.rmSync(tmp,{recursive:true,force:true});
