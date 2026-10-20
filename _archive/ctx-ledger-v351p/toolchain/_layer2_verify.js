/* pr16.diff（纯第二层增量）交付前自检（v3：跳过非 JS script 块；git apply 禁 autocrlf；任一检查失败即 exit 1） */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),os=require('os'),{execSync}=require('child_process');
const PR16='D:/InternalBeyond/.scratch/ib-ctx-ledger/out/_gh_pr16_index.html';
const DIFF='D:/InternalBeyond/.scratch/ib-ctx-ledger/out/pr16.diff';
const html=fs.readFileSync(PR16,'utf8');
const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m,i=0,bad=0,skip=0;
while((m=re.exec(html))!==null){i++;
  if(/\btype\s*=\s*["']?(?!text\/javascript|application\/javascript|module)[^>]*["']?/i.test(m[0].split('>')[0])){skip++;continue}
  const code=m[1];if(!code.trim())continue;
  try{new vm.Script(code,{filename:'block'+i})}catch(e){bad++;console.log('SYNTAX-FAIL block#'+i+': '+e.message)}}
console.log('① PR16 共 '+i+' 个 script 块（跳过非 JS '+skip+' 个），语法失败 '+bad+(bad?' ✗':' ✓'));
const d=fs.readFileSync(DIFF,'utf8');
const added=d.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).join('\n');
const cssHits=(added.match(/<style|addRule|insertRule/gi)||[]).length;
if(cssHits)bad++;
console.log('② diff 无新增 CSS 规则（<style/addRule/insertRule 命中：'+cssHits+'）'+(cssHits?' ✗':' ✓'));
let residue=0;
for(const k of ['测试块','上下文空态A','上下文账本·示例']){const has=added.includes(k);if(has)residue++;console.log('   新增行含「'+k+'」：'+(has?'✗ 有':'✓ 无'))}
if(residue)bad++;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gitapply-'));
fs.copyFileSync(PR16.replace('_gh_pr16','_gh_pr15'),path.join(tmp,'index.html'));
try{execSync('git -c core.autocrlf=false apply -p1 '+DIFF,{cwd:tmp,stdio:'pipe'});
  const a=fs.readFileSync(path.join(tmp,'index.html')),b=fs.readFileSync(PR16);
  const same=a.equals(b);if(!same)bad++;
  console.log('③ git apply -p1 ✓ 通过，结果与 PR16 '+(same?'逐字节一致 ✓':'不一致 ✗'))}catch(e){bad++;console.log('③ git apply ✗ '+String(e.message).slice(0,300))}
fs.rmSync(tmp,{recursive:true,force:true});
console.log(bad?('✗ 共 '+bad+' 项不合格'):'✅ 三项全过');
process.exit(bad?1:0);
