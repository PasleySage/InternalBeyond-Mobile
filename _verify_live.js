/* _verify_live.js —— 轮询镜像 Pages 构建状态，并核对线上文件与本地文件逐字节一致
   用法：node _verify_live.js <本地文件> <线上 URL> [最多轮数]
   例：  node _verify_live.js _up_patched.html https://pasleysage.github.io/InternalBeyond-Mobile/index.html 12
   说明：轮询间隔 8 秒（默认 12 轮）；用同步 execSync + curl，符合本空间的既有做法。
   2026-09-19 实测教训（两条，都已写进代码）：
   ① 本机 curl 走 CONNECT 代理，构建窗口内可能**读到被截断的响应**（表现为 3.0MB 的怪尺寸，而响应头的
      Content-Length 其实是真值）⇒ 必须带 --fail --retry，尺寸不符只当"还没好"，不要据此改任何东西。
   ② **GitHub Pages 的 CDN 会缓存**：刚推完立刻回读，拿到的可能是**旧内容**（曾据此误判"上线失败"）
      ⇒ 每次请求都换一个 cache-busting 参数；不带这个，CDN 没刷新时这个脚本会一轮轮白等。 */
const fs=require('fs'),{execSync}=require('child_process');
const crypto=require('crypto');
const file=process.argv[2], url=process.argv[3];
const maxRounds=parseInt(process.argv[4],10)||12;
const repo=process.env.IB_REPO||'PasleySage/InternalBeyond-Mobile';
const branch=process.env.IB_BRANCH||'main';
if(!file||!url){console.error('用法：node _verify_live.js <本地文件> <线上 URL> [最多轮数]');process.exit(1)}
if(!process.env.GH_CONFIG_DIR)process.env.GH_CONFIG_DIR='C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const sh=(c)=>execSync(c,{encoding:'utf8',maxBuffer:1<<28,env:process.env});
const sha=(b)=>crypto.createHash('sha256').update(b).digest('hex');
const local=fs.readFileSync(file);
const localSha=sha(local);
console.log('本地 '+file+'  '+local.length+' B  sha256 '+localSha.slice(0,16)+'…');

for(let i=1;i<=maxRounds;i++){
  let st='?',cm='?';
  try{const j=JSON.parse(sh('gh api /repos/'+repo+'/pages/builds/latest'));st=j.status;cm=String(j.commit||'').slice(0,7)}catch(e){}
  let live=null,note='';
  try{
    const tmp='_live_probe.bin';
    /* 带 cache-busting：CDN 按 URL 缓存，不换 URL 就可能一直读到旧内容 */
    const cb=url+(url.indexOf('?')>-1?'&':'?')+'cb='+Date.now()+'-'+Math.floor(Math.random()*1e6);
    const hdr=sh('curl -sSL --fail --retry 3 --retry-all-errors -D - -o '+tmp+' "'+cb+'"');
    const cl=/content-length:\s*(\d+)/i.exec(hdr);
    live=fs.readFileSync(tmp);
    note=cl?('（Content-Length '+cl[1]+'）'):'';
    try{fs.unlinkSync(tmp)}catch(e){}
  }catch(e){note='（curl 失败）'}
  const same=live!=null&&live.length===local.length&&sha(live)===localSha;
  console.log('第 '+i+' 轮：pages='+st+'@'+cm+'  线上 '+(live?live.length+' B':'取不到')+note+(same?'  ✅ 逐字节一致':'  …'));
  if(same){console.log('✅ 完成：线上与本地补丁文件逐字节一致');process.exit(0)}
  if(i<maxRounds)sh(String.raw`powershell -NoProfile -Command "Start-Sleep -Seconds 8"`);
}
console.log('⚠️ 轮询结束仍未一致：等 Pages 再构建一轮，或核对分支/缓存');
process.exit(1);

