/* IB聊天记录录入器 —— 结构与样式覆盖检查（第三/四层） */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'tools', 'pages', 'IB聊天记录录入器.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  → ' + e : ''))); };

/* 收集 HTML 里声明的 id */
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
/* 收集 JS 里引用的 id */
const jsIds = new Set([
  ...[...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]),
  ...[...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
]);

console.log('\n[A] DOM 引用一致性');
const missing = [...jsIds].filter(id => !htmlIds.has(id));
ok(missing.length === 0, 'JS 引用的 ' + jsIds.size + ' 个 id 在 HTML 中都存在', missing.join(', '));

/* 反查：HTML 里声明但 JS 从未用到的 id（提示可能漏绑定） */
const unused = [...htmlIds].filter(id => !jsIds.has(id));
console.log('  INFO  未被 JS 引用的 id（' + unused.length + '）: ' + (unused.join(', ') || '无'));
const interactive = unused.filter(id => /^btn-|^file-|^(friendId|friendName|interval|base-time|split-lines|compose|new-thread|cur-thread)$/.test(id));
ok(interactive.length === 0, '所有交互型元素都已绑定 JS', interactive.join(', '));

/* 所有 button 是否都有 id（无 id 则无法绑定，除非用 onclick） */
const btns = [...html.matchAll(/<button([^>]*)>/g)].map(m => m[1]);
const noIdBtns = btns.filter(a => !/\sid="/.test(a) && !/onclick=/.test(a));
ok(noIdBtns.length === 0, '所有 <button> 都有 id 或 onclick（共 ' + btns.length + ' 个）', noIdBtns.length + ' 个裸奔');

console.log('\n[B] 关键交互元素存在性');
['compose', 'btn-add-me', 'btn-add-ta', 'list', 'friendId', 'friendName',
 'base-time', 'btn-now', 'interval', 'split-lines', 'cur-thread', 'new-thread',
 'btn-add-thread', 'btn-reseq', 'btn-export', 'btn-clear', 'btn-pick-backup',
 'file-backup', 'btn-resume', 'file-resume', 'roles', 'st-total', 'st-me', 'st-ta', 'toast'
].forEach(id => ok(htmlIds.has(id), '存在 #' + id));

console.log('\n[C] CSS 类覆盖');
/* JS 中赋给 className 的类名 */
const jsClasses = new Set();
[...js.matchAll(/className\s*=\s*'([^']+)'/g)].forEach(m => m[1].split(/\s+/).forEach(c => c && jsClasses.add(c)));
[...js.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)].forEach(m => jsClasses.add(m[1]));
/* HTML 中使用的类名 */
const htmlClasses = new Set();
[...html.matchAll(/\sclass="([^"]+)"/g)].forEach(m => m[1].split(/\s+/).forEach(c => c && htmlClasses.add(c)));

const cssDefined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const allUsed = new Set([...jsClasses, ...htmlClasses]);
const undef = [...allUsed].filter(c => !cssDefined.has(c));
ok(undef.length === 0, '用到的 ' + allUsed.size + ' 个类都在 CSS 中有定义', undef.join(', '));

console.log('\n[D] 基础结构');
ok(/<!DOCTYPE html>/i.test(html), '有 DOCTYPE');
ok(/<meta[^>]+charset=["']?utf-8/i.test(html), '声明 UTF-8（中文不乱码）');
ok(/<meta[^>]+name="viewport"/i.test(html), '含 viewport（手机可用）');
ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/https?:\/\/pasleysage\.github\.io/g, '')), '无外部资源依赖（纯离线单文件）');
ok(html.split('<script>').length === 2, '只有一个 script 块');

console.log('\n[E] 导出文件名与内容');
ok(/'ib-chat-' \+ stamp \+ '\.json'/.test(js) && /stamp\s*=.*pad2\(d\.getMonth/.test(js), '导出文件名格式正确（ib-chat-YYYYMMDD-HHmm.json）');
ok(/JSON\.stringify\(obj,\s*null,\s*2\)/.test(js), '导出为格式化 JSON');

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
