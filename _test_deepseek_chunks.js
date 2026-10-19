#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const NODE = process.execPath;
const SCRIPT = path.join(__dirname, 'deepseek_to_ib.js');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; } else { fail++; console.log('  ✗ ' + m); } }

// 合成一份 DeepSeek 风格导出：1 个会话，200 条消息，中文为主
const conv = [];
const base = Date.UTC(2026, 0, 1, 0, 0, 0);
for(let i = 0; i < 200; i++){
  conv.push({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: '这是第' + i + '条测试消息，包含一些中文内容和英文单词 hello world 用于估算 token 数量。',
    create_time: Math.round((base + i * 60000) / 1000) // 秒
  });
}
const exportData = { conversations: [ { title: '测试会话', messages: conv } ] };
const dir = path.join(os.tmpdir(), '_tmp_chunk_test');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const inFile = path.join(dir, 'export.json');
fs.writeFileSync(inFile, JSON.stringify(exportData), 'utf8');
const fid = 'friend_1757500000000';

function run(extraArgs){
  const out = cp.execFileSync(NODE, [SCRIPT, inFile, fid, path.join(dir, 'out.json'), ...extraArgs], { encoding: 'utf8' });
  return out;
}

// 估算 tokens（与脚本同算法）
function estTokens(s){
  const cn = (s.match(/[　-〿㐀-鿿＀-￯]/g) || []).length;
  return Math.round(cn + (s.length - cn) * 0.3);
}

console.log('[1] --maxTokens 切分');
{
  run(['--maxTokens=1200']);
  const files = fs.readdirSync(dir).filter(f => /out_part\d+\.json$/.test(f)).sort();
  ok(files.length >= 2, '应切成多段，实际 ' + files.length + ' 段');
  let all = [];
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    ok(Array.isArray(j.chatMessages) && j.chatMessages.length > 0, f + ' 含 chatMessages');
    all = all.concat(j.chatMessages);
  });
  ok(all.length === 200, '总条数应为 200，实际 ' + all.length);
  // id 跨段唯一
  const ids = new Set(all.map(m => m.id));
  ok(ids.size === 200, 'id 跨段应唯一，实际唯一 ' + ids.size);
  // 每段 token 不超预算太多（允许单条溢出）
  files.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const t = j.chatMessages.reduce((a, m) => a + estTokens(m.content), 0);
    ok(t <= 1200 || j.chatMessages.length === 1, f + ' token=' + t + ' 应≤1200（单条超界除外）');
  });
  // 时间严格递增（合并后）
  const ts = all.map(m => m.timestamp);
  let mono = true;
  for(let i = 1; i < ts.length; i++) if(ts[i] <= ts[i-1]) mono = false;
  ok(mono, '合并后时间戳应严格递增');
  // 角色统计正确
  ok(all.filter(m => m.role === 'user').length === 100, 'user 100 条');
  ok(all.filter(m => m.role === 'assistant').length === 100, 'assistant 100 条');
}

console.log('[2] --chunks=N 切分');
{
  fs.readdirSync(dir).filter(f => /out_part\d+\.json$/.test(f)).forEach(f => fs.unlinkSync(path.join(dir, f)));
  run(['--chunks=4']);
  const files = fs.readdirSync(dir).filter(f => /out_part\d+\.json$/.test(f)).sort();
  ok(files.length === 4, '应切成 4 段，实际 ' + files.length);
  let all = [];
  files.forEach(f => { all = all.concat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).chatMessages); });
  ok(all.length === 200, '总条数 200');
  ok(new Set(all.map(m => m.id)).size === 200, 'id 唯一');
}

console.log('[3] 不分段（旧行为保留）');
{
  fs.readdirSync(dir).filter(f => /out_part\d+\.json$/.test(f)).forEach(f => fs.unlinkSync(path.join(dir, f)));
  run([]);
  const single = fs.existsSync(path.join(dir, 'out.json'));
  ok(single, '未给分段参数应输出单个 out.json');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'));
  ok(j.chatMessages.length === 200, '单文件 200 条');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
