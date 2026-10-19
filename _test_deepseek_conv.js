/* deepseek_to_ib.js 离线自测：模拟 DeepSeek 导出的几种可能结构 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const NODE = process.execPath;
const SCRIPT = __dirname + '/deepseek_to_ib.js';

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  → ' + e : ''))); };

function run(args){
  try{
    const out = execFileSync(NODE, [SCRIPT].concat(args), { encoding: 'utf8', cwd: __dirname });
    return { code: 0, out };
  }catch(e){
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* 结构 A：官方常见 —— 顶层数组，create_time 秒级 */
const A = [
  {
    id: 'conv_1', title: '夜谈', create_time: 1755000000, model: 'deepseek-chat',
    messages: [
      { role: 'user', content: '今天周三，还好吗', create_time: 1755000000 },
      { role: 'assistant', content: '嗯，周三最难熬', create_time: 1755000060 },
      { role: 'system', content: '你是助手', create_time: 1755000000 },
      { role: 'user', content: '睡吧', create_time: 1755000120 }
    ]
  },
  { id: 'conv_2', title: '碎碎念', messages: [
      { role: 'user', content: '第二条会话', timestamp: 1755000000000 }
  ]}
];
fs.writeFileSync(__dirname + '/_t_a.json', JSON.stringify(A, null, 2));

/* 结构 B：包一层 {conversations:[...]}，毫秒级，content 是数组 */
const B = {
  conversations: [{
    title: '角色扮演',
    messages: [
      { role: 'user', parts: null, content: [{ type: 'text', text: '你好' }], created_at: 1756000000000 },
      { role: 'assistant', content: [{ type: 'text', text: '好久不见' }], created_at: 1756000060000 }
    ]
  }]
};
fs.writeFileSync(__dirname + '/_t_b.json', JSON.stringify(B, null, 2));

/* 结构 C：缺时间戳 + 乱序 */
const C = [{
  title: '无序会话',
  messages: [
    { role: 'assistant', content: '先到的回复其实更晚', create_time: 1757000120 },
    { role: 'user', content: '这条更早', create_time: 1757000000 },
    { role: 'user', content: '没有时间字段' }
  ]
}];
fs.writeFileSync(__dirname + '/_t_c.json', JSON.stringify(C, null, 2));

console.log('\n[1] --list 列出会话');
{
  const r = run([__dirname + '/_t_a.json', 'friend_1', '', '--list']);
  ok(r.code === 0, 'list 正常退出', r.out.slice(-200));
  ok(/夜谈/.test(r.out) && /碎碎念/.test(r.out), '列出两个会话标题');
  ok(/2025-08-/.test(r.out) || /\d{4}-\d{2}-\d{2}/.test(r.out), '显示可读时间范围');
}

console.log('\n[2] 结构 A 转换（秒级时间戳 + 跳过 system）');
{
  const out = __dirname + '/_t_a_out.json';
  if(fs.existsSync(out)) fs.unlinkSync(out);
  const r = run([__dirname + '/_t_a.json', 'friend_1757500000000', out]);
  ok(r.code === 0, '转换成功', r.out.slice(-300));
  const o = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(Array.isArray(o.chatMessages), '顶层是 chatMessages 数组');
  ok(o.chatMessages.length === 4, 'system 被跳过，剩 4 条', o.chatMessages.length);
  ok(o.chatMessages.every(m => m.friendId === 'friend_1757500000000'), 'friendId 已注入');
  ok(o.chatMessages.every(m => /^msg_\d+_[ua](_\d+)?$/.test(m.id)), 'id 格式符合 IB 规范（撞车时允许 _n 后缀）',
     o.chatMessages.map(m => m.id).join(','));
  ok(new Set(o.chatMessages.map(m => m.id)).size === 4, 'id 唯一');
  ok(o.chatMessages.every(m => m.timestamp > 1e12), '秒级时间戳已转毫秒', o.chatMessages[0].timestamp);
  ok(o.chatMessages[0].timestamp === 1755000000000, '首条时间精确', o.chatMessages[0].timestamp);
  ok(o.chatMessages.every((m, i, a) => i === 0 || m.timestamp >= a[i - 1].timestamp), '时间递增');
  ok(o.chatMessages.find(m => m.content === '今天周三，还好吗'), '内容保留');
  ok(o.chatMessages.every(m => m.role === 'user' || m.role === 'assistant'), 'role 合法');
}

console.log('\n[3] 结构 B（嵌套 + content 数组 + 毫秒）');
{
  const out = __dirname + '/_t_b_out.json';
  const r = run([__dirname + '/_t_b.json', 'friend_2', out, '--sendername=瑟琳']);
  ok(r.code === 0, '转换成功', r.out.slice(-300));
  const o = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(o.chatMessages.length === 2, '两条都转出来', o.chatMessages.length);
  ok(o.chatMessages[0].content === '你好', 'content 数组被摊平成文本', o.chatMessages[0].content);
  ok(o.chatMessages[1].senderName === '瑟琳', 'senderName 只给 assistant');
  ok(!o.chatMessages[0].senderName, 'user 不带 senderName');
  ok(o.chatMessages[0].timestamp === 1756000000000, '毫秒时间戳保持原值');
}

console.log('\n[4] 结构 C（会话首条为 assistant + 缺时间戳 + 时间戳与原生顺序相反）');
{
  const out = __dirname + '/_t_c_out.json';
  const r = run([__dirname + '/_t_c.json', 'friend_3', out]);
  ok(r.code === 0, '转换成功', r.out.slice(-300));
  const o = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(o.chatMessages.length === 3, '三条都在', o.chatMessages.length);
  // 转换器有意保留对话原生顺序（DeepSeek 导出里 assistant 时间戳不可信，见 deepseek_to_ib.js 说明）
  ok(o.chatMessages[0].content === '先到的回复其实更晚', '保留对话原生顺序（首条仍是 assistant）', o.chatMessages[0].content);
  ok(o.chatMessages.every(m => m.timestamp > 1e12), '全部时间戳合法（首条 assistant 不能落到 1970）',
     o.chatMessages.map(m => m.timestamp).join(','));
  ok(o.chatMessages.every((m, i, a) => i === 0 || m.timestamp > a[i - 1].timestamp), '严格递增（同刻已错开）');
  const early = o.chatMessages.find(m => m.content === '这条更早');
  ok(early && early.timestamp === 1757000000000, 'user 的真实时间戳未被改动', early && early.timestamp);
}

console.log('\n[4b] 首条 user 被过滤 / 纯 assistant 会话（时间戳不能落到 1970）');
{
  // 原生首条 user 内容为空 → 被过滤 → assistant 成为首条
  const D = [{ title: '首条被过滤', messages: [
    { role: 'user', content: '   ', create_time: 1757000000 },
    { role: 'assistant', content: '嗯，我在', create_time: 1757000005 },
    { role: 'user', content: '那就好', create_time: 1757000100 }
  ]}];
  fs.writeFileSync(__dirname + '/_t_d.json', JSON.stringify(D, null, 2));
  const out = __dirname + '/_t_d_out.json';
  if(fs.existsSync(out)) fs.unlinkSync(out);
  const r = run([__dirname + '/_t_d.json', 'friend_4', out]);
  ok(r.code === 0, '转换成功', r.out.slice(-300));
  const o = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(o.chatMessages.length === 2, '空内容 user 被跳过，剩 2 条', o.chatMessages.length);
  ok(o.chatMessages[0].role === 'assistant', 'assistant 成为首条', o.chatMessages[0].role);
  ok(o.chatMessages.every(m => m.timestamp > 1e12), '全部时间戳合法',
     o.chatMessages.map(m => m.timestamp).join(','));
  ok(o.chatMessages.every((m, i, a) => i === 0 || m.timestamp > a[i - 1].timestamp), '严格递增');

  // 纯 assistant 会话：完全没有 user 可锚定
  const E = [{ title: '纯助手', messages: [
    { role: 'assistant', content: '你好呀', create_time: 1757000000 },
    { role: 'assistant', content: '今天过得怎么样' }
  ]}];
  fs.writeFileSync(__dirname + '/_t_e.json', JSON.stringify(E, null, 2));
  const out2 = __dirname + '/_t_e_out.json';
  if(fs.existsSync(out2)) fs.unlinkSync(out2);
  const r2 = run([__dirname + '/_t_e.json', 'friend_5', out2]);
  ok(r2.code === 0, '纯 assistant 会话也能转换', r2.out.slice(-300));
  const o2 = JSON.parse(fs.readFileSync(out2, 'utf8'));
  ok(o2.chatMessages.every(m => m.timestamp > 1e12), '纯 assistant 会话时间戳合法',
     o2.chatMessages.map(m => m.timestamp).join(','));
  ok(o2.chatMessages.every((m, i, a) => i === 0 || m.timestamp > a[i - 1].timestamp), '纯 assistant 会话严格递增');
}

console.log('\n[5] --pick 与 --mindate');
{
  const out = __dirname + '/_t_pick.json';
  const r = run([__dirname + '/_t_a.json', 'friend_1', out, '--pick=1']);
  ok(r.code === 0, 'pick=1 成功', r.out.slice(-200));
  const o = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(o.chatMessages.length === 3, '只转了第 1 个会话（3 条）', o.chatMessages.length);
  const r2 = run([__dirname + '/_t_a.json', 'friend_1', __dirname + '/_t_md.json', '--mindate=2026-01-01']);
  ok(r2.code === 0 || /一条消息都不剩/.test(r2.out), 'mindate 过滤后无残留（或明确报错）', r2.out.slice(-150));
}

console.log('\n[6] 错误处理');
{
  const r = run([__dirname + '/_nope.json', 'friend_1']);
  ok(r.code !== 0 && /读不到文件/.test(r.out), '文件不存在给出明确提示');
  fs.writeFileSync(__dirname + '/_t_bad.json', '{not json');
  const r2 = run([__dirname + '/_t_bad.json', 'friend_1']);
  ok(r2.code !== 0 && /不是有效的 JSON/.test(r2.out), '坏 JSON 给出明确提示');
  fs.writeFileSync(__dirname + '/_t_empty.json', '{"foo":1}');
  const r3 = run([__dirname + '/_t_empty.json', 'friend_1']);
  ok(r3.code !== 0, '无会话结构时报错退出', r3.out.slice(-150));
}

['_t_a.json','_t_b.json','_t_c.json','_t_a_out.json','_t_b_out.json','_t_c_out.json',
 '_t_d.json','_t_d_out.json','_t_e.json','_t_e_out.json',
 '_t_pick.json','_t_md.json','_t_bad.json','_t_empty.json'].forEach(f => {
  try{ fs.unlinkSync(__dirname + '/' + f); }catch(e){}
});

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
