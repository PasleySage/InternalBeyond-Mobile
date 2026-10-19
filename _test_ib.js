/* IB聊天记录录入器 —— 离线逻辑自测（第二层：纯函数/数据流） */
const path = require('path');

/* ---- 极简 DOM mock：让页面脚本能在 node 里跑起来 ---- */
const elCache = new Map();
function mkEl(id){
  const store = { _id: id, value: '', textContent: '', innerHTML: '', checked: false };
  const handler = {
    get(t, k){
      if(k in store) return store[k];
      if(k === 'style') return {};
      if(k === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if(k === 'files') return [];
      if(k === 'dataset') return {};
      if(k === 'children') return [];
      if(k === 'length') return 0;
      if(k === Symbol.toPrimitive) return () => '';
      return function(){ return mkEl(id + '>child'); };
    },
    set(t, k, v){ store[k] = v; return true; },
    has(){ return true; }
  };
  return new Proxy(store, handler);
}
global.document = {
  getElementById(id){
    if(!elCache.has(id)) elCache.set(id, mkEl(id));
    return elCache.get(id);
  },
  createElement(){ return mkEl('new'); },
  createDocumentFragment(){ return mkEl('frag'); },
  querySelector(){ return mkEl('q'); },
  querySelectorAll(){ return []; },
  addEventListener(){},
  body: mkEl('body')
};
global.window = global;
const lsMap = new Map();
global.localStorage = {
  getItem: k => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: k => lsMap.delete(k)
};
global.alert = () => {};
global.confirm = () => true;
global.Blob = function(){};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };

/* ---- 载入页面脚本 ---- */
const html = require('fs').readFileSync(path.join(__dirname, 'IB聊天记录录入器.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
require('fs').writeFileSync(path.join(__dirname, '_tmp_script_0.js'), js);
const M = require('./_tmp_script_0.js');

/* ---- 断言小工具 ---- */
let pass = 0, fail = 0;
function ok(cond, name, extra){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
const S = M.state;

console.log('\n[1] 时间工具往返');
{
  const ts = new Date(2026, 8, 10, 23, 48, 0, 0).getTime();
  const s = M.tsToLocal(ts);
  const back = M.localToTs(s);
  ok(s === '2026-09-10 23:48', 'tsToLocal 输出纯文本格式', s);
  ok(!/T/.test(s), '不含 datetime-local 的 T 分隔符（兼容老浏览器）', s);
  ok(back === ts, 'localToTs 往返一致', back + ' vs ' + ts);
  ok(M.localToTs('') === 0 && M.localToTs('garbage') === 0, '非法输入返回 0');
  ok(M.localToTs(null) === 0 && M.localToTs(undefined) === 0, 'null/undefined 返回 0');

  // 宽松解析：各种手写格式
  const want = new Date(2026, 8, 10, 20, 30, 0, 0).getTime();
  const cases = [
    ['2026-09-10 20:30', '标准空格'],
    ['2026-09-10T20:30', 'T 分隔'],
    ['2026/9/10 20:30', '斜杠+单位数'],
    ['2026.9.10 20:30', '点分隔'],
    ['2026年9月10日 20:30', '中文'],
    ['  2026-09-10   20:30  ', '多余空白'],
    ['2026-09-10 20：30', '全角冒号']
  ];
  cases.forEach(([inp, name]) => {
    ok(M.localToTs(inp) === want, '解析 ' + name + '（' + inp + '）', M.localToTs(inp));
  });
  ok(M.localToTs('2026-09-10') === new Date(2026, 8, 10, 12, 0, 0, 0).getTime(), '只给日期按 12:00');
  const onlyTime = M.localToTs('20:30');
  const d = new Date(onlyTime);
  ok(d.getHours() === 20 && d.getMinutes() === 30, '只给时间按今天', d.toString());
  ok(M.localToTs('2026-13-45 99:99') === 0, '离谱数值返回 0');
}

console.log('\n[2] friendId 清洗');
{
  ok(M.normalizeFriendId('  "friend_123"  ') === 'friend_123', '去空白与引号');
  ok(M.normalizeFriendId(null) === '', 'null 返回空串');
  ok(M.normalizeFriendId(undefined) === '', 'undefined 返回空串');
}

console.log('\n[3] 录入与消息 id 唯一性');
{
  S.friendId = 'friend_1757500000000';
  S.friendName = '阿月';
  S.msgs = [];
  S.threads = [];
  S.curThread = '';
  S.base = new Date(2026, 8, 10, 20, 0, 0, 0).getTime();
  S.interval = 60;
  const a = M.addMsg('user', '在吗');
  const b = M.addMsg('assistant', '在的');
  const c = M.addMsg('user', '   ');           // 空白应被拒绝
  ok(a && b, '正常录入成功');
  ok(c === null, '空白内容不录入');
  ok(S.msgs.length === 2, '只进了 2 条', '实际 ' + S.msgs.length);
  ok(a.role === 'user' && b.role === 'assistant', '角色正确');
  ok(b.timestamp === a.timestamp + 60000, '时间按间隔递增', b.timestamp - a.timestamp);
  ok(a.id !== b.id, 'id 不重复');
  // 同毫秒同角色也要保证唯一
  const d = M.addMsg('user', '又是同一毫秒', { timestamp: a.timestamp });
  ok(d && d.id !== a.id, '同毫秒同角色 id 仍唯一', d && d.id);
  ok(M.idsUnique(), 'idsUnique 判定为真');
  S.msgs.pop();
}

console.log('\n[4] 增删改序');
{
  const n0 = S.msgs.length;
  M.addMsg('user', '第三条');
  ok(S.msgs.length === n0 + 1, '追加后条数 +1');
  ok(M.moveMsg(0, 1), '下移成功');
  ok(S.msgs[0].content === '在的', '下移后顺序交换', S.msgs[0].content);
  ok(M.moveMsg(0, -1) === false, '首条上移被拒');
  const cnt = S.msgs.length;
  ok(M.dupMsg(1) && S.msgs.length === cnt + 1, '复制一条 +1');
  ok(M.idsUnique(), '复制后 id 仍唯一');
  ok(S.msgs[2].timestamp >= S.msgs[1].timestamp, '副本时间顺延');
  ok(M.setMsgText(0, '改过了'), '改正文返回 true');
  ok(S.msgs[0].content === '改过了', '正文已更新');
  ok(M.delMsg(0) && S.msgs.length === cnt, '删除成功');
  M.resequence();
  ok(M.isTimeAscending(), '重排后时间递增');
  ok(S.msgs[0].timestamp === S.base, '重排基准 = base');
}

console.log('\n[5] 导出结构（IB机 导入格式）');
{
  S.msgs = [];
  S.threads = [];
  S.curThread = '';
  S.friendId = 'friend_1757500000000';
  M.addMsg('user', '你好');
  M.addMsg('assistant', '嗯，我在');
  const out = M.buildExport();
  ok(!!out.chatMessages && Array.isArray(out.chatMessages), '顶层含 chatMessages 数组');
  ok(out.chatMessages.length === 2, '消息条数正确');
  const m0 = out.chatMessages[0];
  ok(m0.id && typeof m0.id === 'string', '有 id');
  ok(m0.role === 'user' || m0.role === 'assistant', 'role 合法', m0.role);
  ok(typeof m0.content === 'string', 'content 是字符串');
  ok(m0.friendId === 'friend_1757500000000', 'friendId 已注入', m0.friendId);
  ok(typeof m0.timestamp === 'number' && m0.timestamp > 0, 'timestamp 是数字', m0.timestamp);
  ok(out.chatMessages[1].senderName === '阿月', '助手消息带 senderName', out.chatMessages[1].senderName);
  ok(!out.chatMessages[0].senderName, 'user 消息不带 senderName');
  ok(out.chatThreads === undefined, '无频道时不含 chatThreads');
  // 主频道不落 threadId（IB 主聊天区靠 friendId 聚合）
  ok(!('threadId' in m0) || m0.threadId === '', '主频道消息不写死 threadId');
}

console.log('\n[6] 带频道导出');
{
  S.threads = [{ id: 'thread_1', name: '夜谈', memoryEnabled: false, created: 1757500000000 }];
  S.curThread = 'thread_1';
  S.msgs = [];
  M.addMsg('user', '频道里的第一句');
  const out = M.buildExport();
  ok(Array.isArray(out.chatThreads) && out.chatThreads.length === 1, '含 chatThreads');
  ok(out.chatThreads[0].id === 'thread_1' && out.chatThreads[0].friendId === S.friendId, '频道挂到角色下');
  ok(out.chatThreads[0].name === '夜谈', '频道名保留');
  ok(out.chatMessages[0].threadId === 'thread_1', '消息带 threadId');
}

console.log('\n[7] 校验 validate');
{
  S.msgs = []; S.threads = [];
  S.friendId = '';
  ok(M.validate().some(e => e.includes('friendId')), '缺 friendId 报错');
  S.friendId = 'friend_1';
  ok(M.validate().some(e => e.includes('还没有录入')), '无消息报错');
  M.addMsg('user', '有内容');
  ok(M.validate().length === 0, '填好后零错误', JSON.stringify(M.validate()));
  M.addMsg('user', '   ');   // 空内容不会进（addMsg 已拦）
  S.msgs.push({ id: 'dup', role: 'user', content: 'x', timestamp: 1 });
  S.msgs.push({ id: 'dup', role: 'user', content: 'y', timestamp: 2 });
  ok(M.validate().some(e => e.includes('重复')), '重复 id 报错');
  S.msgs = S.msgs.filter(m => m.id !== 'dup');
  S.msgs.push({ id: 'blank', role: 'user', content: '', timestamp: 3 });
  ok(M.validate().some(e => e.includes('空的')), '空内容报错');
}

console.log('\n[8] parseRoles 读角色');
{
  const backup = {
    apiConfigs: [
      { id: 'friend_1757500000000', name: '瑟琳' },
      { id: 'friend_1757600000000', name: '局长', title: 'Chief' },
      { _group: true, id: 'grp_1', name: '群聊' },
      { name: '没有 id' }
    ]
  };
  const roles = M.parseRoles(backup);
  ok(roles.length === 2, '筛掉群组与无 id 项，得 2 个角色', '实际 ' + roles.length);
  ok(roles[0].id === 'friend_1757500000000' && roles[0].name === '瑟琳', '角色 1 正确');
  ok(M.parseRoles({}).length === 0, '空对象返回空数组');
  ok(M.parseRoles(null).length === 0, 'null 不炸');
}

console.log('\n[9] restoreFrom 往返');
{
  const before = M.buildExport();
  const json = JSON.parse(JSON.stringify(before));
  S.msgs = []; S.threads = []; S.friendId = ''; S.friendName = '';
  ok(M.restoreFrom(json) === true, '读回返回 true');
  ok(S.msgs.length === before.chatMessages.length, '条数还原', S.msgs.length);
  ok(S.friendId === before.chatMessages[0].friendId, 'friendId 还原', S.friendId);
  ok(S.threads.length === (before.chatThreads || []).length, '频道数还原');
  ok(M.restoreFrom({ foo: 1 }) === false, '无 chatMessages 返回 false');
  ok(M.restoreFrom(null) === false, 'null 不炸');
}

console.log('\n[10] 多行拆分录入');
{
  S.msgs = []; S.splitLines = true; S.interval = 60;
  document.getElementById('compose').value = '第一行\n第二行\n\n第三行';
  M.commitCompose('user');
  ok(S.msgs.length === 3, '空行被跳过，得 3 条', '实际 ' + S.msgs.length);
  ok(S.msgs[0].content === '第一行' && S.msgs[2].content === '第三行', '内容按行拆分');
  S.splitLines = false;
  document.getElementById('compose').value = '整段\n不拆';
  S.msgs = [];
  M.commitCompose('assistant');
  ok(S.msgs.length === 1 && S.msgs[0].content === '整段\n不拆', '不拆模式保留换行');
  document.getElementById('compose').value = '   ';
  const cnt = S.msgs.length;
  M.commitCompose('user');
  ok(S.msgs.length === cnt, '空输入不录入');
}

console.log('\n[11] 忽略时间（base 留空 = 全自动）');
{
  S.msgs = []; S.threads = []; S.base = null; S.interval = 60;
  const t0 = Date.now();
  const a = M.addMsg('user', '第一句');
  const b = M.addMsg('assistant', '第二句');
  ok(a && b, '不设时间基准也能正常录入');
  ok(Math.abs(a.timestamp - t0) < 60000, 'base 留空时第一条取当前时间', a.timestamp);
  ok(b.timestamp === a.timestamp + 60000, '后续按间隔递增（顺序正确）');
  ok(M.isTimeAscending(), '导出前时间严格递增（IB 靠它排序）');
  const out = M.buildExport();
  ok(out.chatMessages.every(m => typeof m.timestamp === 'number' && m.timestamp > 0), '导出时间戳都是正数');
  ok(out.chatMessages[0].timestamp < out.chatMessages[1].timestamp, '导出顺序 = 录入顺序');
  S.base = null;
  ok(M.resequence() === 2, '留空状态下重排不炸');
  ok(M.isTimeAscending(), '重排后仍递增');
  ok(M.validate().length === 0, '自动模式下校验通过', JSON.stringify(M.validate()));
}

console.log('\n[12] 指定与留空切换');
{
  S.msgs = []; S.base = new Date(2026, 8, 10, 20, 0, 0, 0).getTime();
  M.addMsg('user', '甲'); M.addMsg('user', '乙');
  ok(S.msgs[0].timestamp === S.base, '指定基准后第一条 = 基准');
  S.base = null; M.resequence();
  ok(S.msgs[0].timestamp === new Date(2026, 8, 10, 20, 0, 0, 0).getTime(), '切回留空时保留已有起点', S.msgs[0].timestamp);
  ok(M.isTimeAscending(), '切换后顺序不乱');
}

console.log('\n[13] 改时间后自动顺延（对话里提到真实日期的场景）');
{
  S.msgs = []; S.threads = []; S.interval = 60;
  S.base = new Date(2026, 7, 15, 21, 0, 0, 0).getTime();   // 2026-08-15 21:00
  M.addMsg('user', '一'); M.addMsg('assistant', '二'); M.addMsg('user', '三'); M.addMsg('assistant', '四');
  const old2 = S.msgs[2].timestamp;
  // 把第 2 条改成真实时间 2026-08-15 21:30
  const realTs = M.localToTs('2026-08-15 21:30');
  M.setMsgTime(1, realTs);
  const moved = M.cascadeFrom(1);
  ok(moved === 2, '顺延了后面 2 条', moved);
  ok(S.msgs[1].timestamp === realTs, '被改的那条 = 指定时间');
  ok(S.msgs[2].timestamp === realTs + 60000, '第 3 条顺延 1 个间隔', S.msgs[2].timestamp);
  ok(S.msgs[3].timestamp === realTs + 120000, '第 4 条顺延 2 个间隔');
  ok(S.msgs[2].timestamp !== old2, '确实被改了');
  ok(M.isTimeAscending(), '全程仍然递增（IB 排序不乱）');
  ok(S.msgs[0].timestamp < S.msgs[1].timestamp, '前面的不受影响');
  // 关闭顺延时不应改动后面
  const t3 = S.msgs[3].timestamp;
  M.setMsgTime(2, S.msgs[2].timestamp + 999);
  ok(S.msgs[3].timestamp === t3, '不调用 cascadeFrom 时后面不动');
  // 间隔改为 10 秒后顺延步长跟着变
  S.interval = 10;
  M.setMsgTime(0, S.msgs[0].timestamp);
  M.cascadeFrom(0);
  ok(S.msgs[1].timestamp === S.msgs[0].timestamp + 10000, '顺延步长跟随间隔设置', S.msgs[1].timestamp - S.msgs[0].timestamp);
  S.interval = 60;
}

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
