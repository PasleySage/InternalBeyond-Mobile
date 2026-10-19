#!/usr/bin/env node
/**
 * DeepSeek 导出 → IB机 可导入的备份 JSON
 *
 * 用法：
 *   node deepseek_to_ib.js <导出文件.json> <friendId> [输出文件.json] [选项]
 *
 * 示例：
 *   node deepseek_to_ib.js deepseek_export.json friend_1757500000000
 *   node deepseek_to_ib.js export.json friend_1757500000000 out.json --pick=all
 *   node deepseek_to_ib.js export.json friend_1757500000000 out.json --pick=1,3
 *   node deepseek_to_ib.js export.json friend_1 out.json --sendername=瑟琳
 *
 * 选项：
 *   --pick=all|1,3,5    选哪些会话（默认 all）。不带参数运行时会先列出会话清单
 *   --sendername=名字   给 assistant 消息加上 senderName（IB 里显示的角色名）
 *   --list              只列出会话清单，不转换
 *   --mindate=2026-01-01  只保留该日期之后的消息
 *   --maxTokens=K       按「近似 token 上限」切分成多个文件（每个文件独立可导入），如 --maxTokens=8000
 *   --chunks=N          平均切成 N 个文件（与 --maxTokens 二选一；都给时以 --chunks 为准）
 *   --strip-citations   去掉 DeepSeek 联网搜索的 [citation:N] 引用标记（导出里不含对应链接，留着只会穿帮）
 *
 * 分段说明：
 *   - 每段都是自包含、可独立导入的 { chatMessages:[...] }，消息 id 跨段全局唯一
 *   - 段内按时间排序、段间也按时间先后，导入 IB 后合并结果与一次导完完全等价
 *   - 建议按时间顺序逐段导入（其实顺序无所谓，IB 按时间戳排序；但顺序导更直观）
 *
 * 说明：
 *   - 时间戳自动识别秒/毫秒
 *   - role 只保留 user / assistant（system 等会跳过）
 *   - 内容里的时间由 DeepSeek 原始 create_time 决定，聊天里提到的日期能对上
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const opt = {};
const pos = [];
argv.forEach(a => {
  if(a.startsWith('--')){
    const [k, v] = a.slice(2).split('=');
    opt[k] = v === undefined ? true : v;
  } else pos.push(a);
});
const inFile = pos[0];
const friendId = pos[1];
const outFile = pos[2];

function die(msg){ console.error('× ' + msg); process.exit(1); }
if(!inFile) die('请给出导出文件路径，例如：node deepseek_to_ib.js export.json friend_1757500000000');

/* ---------- 读取 & 解析 ---------- */
let raw;
try{ raw = fs.readFileSync(inFile, 'utf8'); }
catch(e){ die('读不到文件：' + inFile); }
let data;
try{ data = JSON.parse(raw.replace(/^\ufeff/, '')); }
catch(e){ die('这不是有效的 JSON：' + e.message); }

/* ---------- 归一化：找出会话数组 ---------- */
function findConversationArray(d){
  if(Array.isArray(d)) return d;
  if(!d || typeof d !== 'object') return [];
  const keys = ['conversations', 'chats', 'data', 'items', 'list', 'sessions', 'history'];
  for(const k of keys){
    if(Array.isArray(d[k])) return d[k];
  }
  // 只有单个会话对象
  if(Array.isArray(d.messages)) return [d];
  // 兜底：取第一个值是数组且元素像会话的字段
  for(const k of Object.keys(d)){
    const v = d[k];
    if(Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' &&
       (Array.isArray(v[0].messages) || v[0].title || v[0].id)) return v;
  }
  return [];
}
/** 构建消息字典：顶层 messages 可能是数组（每条带 id）或对象（数字键索引） */
function buildMsgMap(d){
  const map = new Map();
  const src = d && (d.messages || d.chat_messages || d.mapping);
  if(Array.isArray(src)){
    for(const m of src) if(m && m.id != null) map.set(String(m.id), m);
  } else if(src && typeof src === 'object'){
    for(const k of Object.keys(src)){
      const m = src[k];
      if(m && m.id != null) map.set(String(m.id), m);
      else map.set(String(k), m);
    }
  }
  return map;
}
/**
 * 取出会话的消息数组（保持对话顺序）：
 *  - 优先 conversation.messageIds 引用式（DeepSeek / 部分导出常见）
 *  - 否则内联 messages / chat_messages / turns
 * 返回 [{ raw: 消息对象, ord: 在对话中的序号 }]
 */
function findMessages(c, msgMap){
  if(!c || typeof c !== 'object') return [];
  if(Array.isArray(c.messageIds) && msgMap && msgMap.size){
    const out = [];
    c.messageIds.forEach((mid, ord) => {
      const m = msgMap.get(String(mid));
      if(m) out.push({ raw: m, ord });
    });
    if(out.length) return out;
  }
  let arr = null;
  if(Array.isArray(c.messages)) arr = c.messages;
  else if(Array.isArray(c.chat_messages)) arr = c.chat_messages;
  else if(Array.isArray(c.turns)) arr = c.turns;
  else {
    for(const k of Object.keys(c)){
      if(Array.isArray(c[k]) && c[k].length && c[k][0] && typeof c[k][0] === 'object' &&
         ('role' in c[k][0] || 'content' in c[k][0])){ arr = c[k]; break; }
    }
  }
  if(arr) return arr.map((m, ord) => ({ raw: m, ord }));
  return [];
}
/** 时间戳：自动识别秒/毫秒，统一成毫秒 */
function toMs(t){
  if(t == null) return 0;
  if(typeof t === 'number'){
    if(t > 1e14) return 0;                 // 纳秒/异常值，放弃
    return t < 1e12 ? Math.round(t * 1000) : Math.round(t);
  }
  const s = String(t).trim();
  if(!s) return 0;
  if(/^\d+$/.test(s)) return toMs(+s);
  const d = Date.parse(s);
  return isNaN(d) ? 0 : d;
}
/** 取消息里的第一个时间字段 */
function pickTime(m){
  const keys = ['create_time', 'created_at', 'createdAt', 'timestamp', 'time', 'ts', 'created', 'updated_at', 'updatedAt'];
  for(const k of keys){
    if(m[k] != null && toMs(m[k])) return toMs(m[k]);
  }
  return 0;
}
/** 取消息正文（可能是字符串 / 数组 / 对象） */
function pickContent(m){
  let c = m.content != null ? m.content : (m.text != null ? m.text : m.message);
  if(c == null) return '';
  if(typeof c === 'string') return c;
  if(Array.isArray(c)){
    return c.map(x => {
      if(typeof x === 'string') return x;
      if(x && typeof x === 'object') return String(x.text != null ? x.text : (x.content != null ? x.content : ''));
      return '';
    }).join('');
  }
  if(typeof c === 'object'){
    if(Array.isArray(c.parts)) return c.parts.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
    return String(c.text != null ? c.text : (c.value != null ? c.value : ''));
  }
  return String(c);
}
/** 去掉 DeepSeek 联网搜索引用标记 [citation:N]（导出里不含对应链接，留着只会穿帮）
 *  仅删标记并做最小清理，不改动正文其它内容 */
function stripCitations(s){
  if(!s) return s;
  let out = String(s).replace(/\[citation:\d+\]/g, '');
  out = out.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}
/** 归一 role：IB 只认 user / assistant */
function pickRole(m){
  const r = String(m.role != null ? m.role : (m.author != null ? m.author : (m.from || ''))).toLowerCase();
  if(/assistant|ai|model|bot|deepseek|机器|助手/.test(r)) return 'assistant';
  if(/user|human|me|我|用户/.test(r)) return 'user';
  return '';
}

/* ---------- 列出会话 ---------- */
const convs = findConversationArray(data);
const msgMap = buildMsgMap(data);
if(!convs.length) die('这份 JSON 里没找到会话结构（没有 messages 数组）。把文件开头几百字符发我看看。');

const parsed = convs.map((c, i) => {
  const msgs = findMessages(c, msgMap).map(m => ({
    role: pickRole(m.raw),
    content: opt['strip-citations'] ? stripCitations(pickContent(m.raw)) : pickContent(m.raw),
    ts: pickTime(m.raw),
    ord: m.ord
  })).filter(m => m && m.role && String(m.content).trim());
  return {
    index: i + 1,
    title: String(c.title || c.name || c.subject || ('会话 ' + (i + 1))),
    msgs
  };
}).filter(c => c.msgs.length);

if(!parsed.length) die('找到了会话，但里面没有可识别的消息（role/content 都对不上）。把文件开头发我看看。');

console.log('\n会话清单：');
parsed.forEach(c => {
  const t0 = c.msgs[0].ts ? new Date(c.msgs[0].ts) : null;
  const t1 = c.msgs[c.msgs.length - 1].ts ? new Date(c.msgs[c.msgs.length - 1].ts) : null;
  const fmt = d => d ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
                        ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')) : '无时间';
  console.log('  [' + c.index + '] ' + c.title + '  —  ' + c.msgs.length + ' 条' +
              (t0 ? ('（' + fmt(t0) + ' → ' + fmt(t1) + '）') : '（无时间戳）'));
});

if(opt.list){ console.log('\n（--list 模式，未生成文件）'); process.exit(0); }

/* ---------- 选择会话 ---------- */
let picked = parsed;
const pickArg = opt.pick === undefined ? 'all' : String(opt.pick);
if(pickArg && pickArg !== 'all'){
  const want = pickArg.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  picked = parsed.filter(c => want.includes(c.index));
  if(!picked.length) die('--pick 没匹配到任何会话，参考上面的编号');
}
console.log('\n将转换 ' + picked.length + ' 个会话');

/* ---------- 生成 ---------- */
const minDate = opt.mindate ? Date.parse(opt.mindate) : 0;
if(opt.mindate && isNaN(minDate)) die('--mindate 日期读不懂，用 2026-01-01 这种写法');

const used = new Set();
function mkId(ts, role){
  const base = 'msg_' + (ts || Date.now()) + '_' + (role === 'user' ? 'u' : 'a');
  let id = base, i = 1;
  while(used.has(id)) id = base + '_' + (i++);
  used.add(id);
  return id;
}

const out = { chatMessages: [] };
let skipped = 0, noTime = 0;
// 关键：DeepSeek 导出里每条 assistant 消息的时间戳比它回复的 user 消息「早几毫秒」，
// 真实回复间隔在导出中没有被保留（相邻间隔恒为负）。因此：
//  - user 消息：沿用真实 create_time，仅做单调兜底（绝不改日期，避免对话里提到的具体日期穿帮）；
//  - assistant 消息：源时间戳不可用，改为「按回复字数合成的拟真延迟」——
//    delay = clamp(字数*30ms, 2s, 60s)，并卡在「下一条 user 的 45% 处」之前，
//    让时间轴呈现「你说完→TA 隔几秒到几十秒回」的自然节奏，而非千篇一律 +1s。
//  全程按对话原生顺序(ord)拼接，不再做全局时间戳重排，导入顺序天然正确。
let lastUser = 0;
picked.forEach(conv => {
  const ordered = conv.msgs.slice().sort((a, b) => ((a.ord || 0) - (b.ord || 0)) || ((a.ts || 0) - (b.ts || 0)));
  const tsArr = new Array(ordered.length);
  // 第一遍：定 user 真实时间戳（保持单调，lastUser 仅用于 user 之间）
  for(let i = 0; i < ordered.length; i++){
    const m = ordered[i];
    if(m.role !== 'user') continue;
    let ts = m.ts;
    if(!ts){ noTime++; ts = lastUser ? lastUser + 1000 : Date.now(); }
    if(lastUser && ts <= lastUser) ts = lastUser + 1000;
    lastUser = ts; tsArr[i] = ts;
  }
  // 会话开头可能直接就是 assistant（原生首条 user 被过滤掉、或导出本身如此），
  // 此时没有可锚定的 user 时间戳。统一贴到「首个 user 之前」（整体前移 leadN+1 秒），
  // 既保持严格递增，也不会让首条落到 1970 年。
  let leadN = 0; while(leadN < ordered.length && ordered[leadN].role !== 'user') leadN++;
  let leadBase = 0;
  if(leadN){
    let firstUserTs = 0;
    for(let i = leadN; i < ordered.length; i++){ if(tsArr[i]){ firstUserTs = tsArr[i]; break; } }
    leadBase = (firstUserTs || Date.now()) - (leadN + 1) * 1000;
  }
  // 第二遍：定 assistant 的拟真延迟 —— 必须按消息顺序边走边更新 running last，
  // 否则会把所有 assistant 顶到整段末尾再级联压缩（part 跨度塌成几分钟）。
  let last = ordered.length ? (tsArr[0] || 0) : 0;
  for(let i = 0; i < ordered.length; i++){
    const m = ordered[i];
    if(m.role === 'user'){ last = tsArr[i]; continue; }
    let uIdx = i - 1; while(uIdx >= 0 && ordered[uIdx].role !== 'user') uIdx--;
    const uTs = uIdx >= 0 ? tsArr[uIdx] : 0;
    if(!uTs){
      // 会话开头的 assistant：按 leadBase 顺序排开，落在首个 user 之前
      let ts = leadBase + i * 1000;
      if(last && ts <= last) ts = last + 1000;
      last = ts; tsArr[i] = ts;
      continue;
    }
    let nIdx = i + 1; while(nIdx < ordered.length && ordered[nIdx].role !== 'user') nIdx++;
    const nTs = nIdx < ordered.length ? tsArr[nIdx] : null;
    let delay = Math.round((m.content || '').length * 30);
    delay = Math.max(2000, Math.min(delay, 60000));
    const cap = nTs != null ? Math.max(1000, Math.floor((nTs - uTs) * 0.45)) : 60000;
    let ts = uTs + Math.min(delay, cap);
    if(last && ts <= last) ts = last + 1000; // 兜底单调
    last = ts; tsArr[i] = ts;
  }
  // 落盘
  ordered.forEach((m, i) => {
    const ts = tsArr[i];
    if(minDate && ts < minDate){ skipped++; return; }
    const rec = {
      id: mkId(ts, m.role),
      role: m.role,
      content: String(m.content).replace(/\r\n/g, '\n'),
      friendId: String(friendId || ''),
      timestamp: ts
    };
    if(opt.sendername && typeof opt.sendername === 'string' && m.role === 'assistant'){
      rec.senderName = opt.sendername;
    }
    out.chatMessages.push(rec);
  });
});
// 注意：不再做全局时间戳排序——会话已按原生顺序拼接、时间戳已保证严格递增，
// 任何按时间戳的导入都不会改变正确顺序。

if(!out.chatMessages.length) die('过滤后一条消息都不剩（检查 --mindate）');

/* ---------- 分段 ---------- */
// 粗略 token 估算：CJK/全角字符≈1 token，其余非空白≈0.3 token
function estTokens(s){
  const cn = (String(s).match(/[　-〿㐀-鿿＀-￯]/g) || []).length;
  return Math.round(cn + (String(s).length - cn) * 0.3);
}
const totalTok = out.chatMessages.reduce((a, m) => a + estTokens(m.content), 0);
const all = out.chatMessages;

// 切成多段（连续切片，保持时间先后）。--chunks 严格 N 段；--maxTokens 按 token 预算贪心切
function buildChunks(){
  if(opt.chunks){
    const n = parseInt(opt.chunks, 10);
    if(!(n >= 1)) die('--chunks 须为正整数');
    // 整体为 UAUA 交替且首条为 user，故每段取偶数条即保证末条为 assistant（以完整 UA 一轮收尾）
    let size = Math.floor(all.length / n);
    if(size % 2 !== 0) size -= 1;
    if(size < 2) size = 2;
    const res = [];
    for(let k = 0; k < n; k++){
      const start = k * size;
      const end = (k === n - 1) ? all.length : start + size; // 最后一段吃剩余，保证恰好 N 段
      res.push(all.slice(start, end));
    }
    // 兜底：若最后一段仍以 user 收尾（仅当整链末条恰为 user 时），把末条 user 并入上一段
    if(res.length > 1 && res[res.length - 1].slice(-1)[0].role === 'user'){
      const last = res.pop();
      const tailUser = last.pop();
      res[res.length - 1].push(tailUser);
    }
    return res;
  }
  if(opt.maxTokens){
    const k = parseInt(opt.maxTokens, 10);
    if(!(k >= 1)) die('--maxTokens 须为正整数');
    const res = []; let cur = [], curTok = 0;
    for(const m of all){
      const t = estTokens(m.content);
      if(cur.length && curTok + t > k){ res.push(cur); cur = []; curTok = 0; }
      cur.push(m); curTok += t;
    }
    if(cur.length) res.push(cur);
    return res;
  }
  return [all];
}

const fmt2 = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
                ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

function writeChunk(arr, idx, total){
  const base = outFile ? path.basename(outFile, path.extname(outFile)) : 'ib-chat-from-deepseek';
  const dir = outFile ? path.dirname(outFile) : path.dirname(inFile);
  const name = total > 1 ? (base + '_part' + idx + '.json') : (base + '.json');
  const target = path.join(dir, name);
  fs.writeFileSync(target, JSON.stringify({ chatMessages: arr }, null, 2), 'utf8');
  const f = new Date(arr[0].timestamp), l = new Date(arr[arr.length - 1].timestamp);
  console.log('  ✓ ' + name + '  —  ' + arr.length + ' 条（' +
              arr.filter(m => m.role === 'user').length + ' 我说 / ' +
              arr.filter(m => m.role === 'assistant').length + ' TA说）  ' + fmt2(f) + ' → ' + fmt2(l));
  return target;
}

const chunks = buildChunks();
if(chunks.length === 1){
  console.log('\n✓ 已生成：' + writeChunk(chunks[0], 1, 1));
  console.log('  时间跨度如上  （约 ' + totalTok + ' tokens）');
} else {
  console.log('\n✓ 已生成 ' + chunks.length + ' 段' +
              (opt.maxTokens ? ('（每段约 ≤ ' + parseInt(opt.maxTokens, 10) + ' tokens）') : '') + '：');
  chunks.forEach((arr, i) => writeChunk(arr, i + 1, chunks.length));
}

if(noTime) console.log('  注意：有 ' + noTime + ' 条在原始导出里没有时间戳，已按相邻消息顺序补上（不改动其它消息的时间）');
if(skipped) console.log('  已按 --mindate 跳过 ' + skipped + ' 条');
if(!friendId) console.log('  警告：没填 friendId，导入 IB 后消息会没有归属角色。建议带上第二个参数。');
console.log('\n下一步：IB机 → 数据 → 导入 → 逐段选择文件 → 勾选 chatMessages（建议按时间顺序导入）');
