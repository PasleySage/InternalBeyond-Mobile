/* _ibRedact（诊断面板脱敏）单元测试：把函数从线上 HTML 里抽出来直接跑 */
const fs = require('fs');
const html = fs.readFileSync((process.env.IB_ROOT || __dirname) + '/index.html', 'utf8');
const START = 'function _ibRedact(s){';
const a = html.indexOf(START);
if (a < 0) { console.log('FAIL  找不到 _ibRedact'); process.exit(1); }
const endMark = "}catch(e){return '(脱敏失败)'}\n}";
const b = html.indexOf(endMark, a);
if (b < 0) { console.log('FAIL  找不到函数结尾'); process.exit(1); }
const src = html.slice(a, b + endMark.length);
const _ibRedact = new Function(src + '; return _ibRedact;')();

let pass = 0, fail = 0;
const ok = (c, n, e) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (e ? '  => ' + e : ''))); };
const red = (s) => _ibRedact(s);

console.log('\n[A] 密钥类参数与 token');
ok(!/AIzaSyABCDEFGH123456/.test(red('https://g.example.com/v1?key=AIzaSyABCDEFGH123456')), 'URL 里的 key= 被隐去', red('https://g.example.com/v1?key=AIzaSyABCDEFGH123456'));
ok(!/sk-abc123456789/.test(red('auth fail: sk-abc123456789 rejected')), 'sk- 开头的密钥被隐去', red('auth fail: sk-abc123456789 rejected'));
ok(!/gho_ABCDEFGH123456/.test(red('token gho_ABCDEFGH123456 invalid')), 'GitHub token 被隐去');
ok(!/abcdefghijklmnop/.test(red('Authorization: Bearer abcdefghijklmnop')), 'Bearer 令牌被隐去', red('Authorization: Bearer abcdefghijklmnop'));
ok(!/mypassword123/.test(red('?password=mypassword123&x=1')), 'password= 被隐去');
ok(!/tok123456/.test(red('api_key=tok123456')), 'api_key= 被隐去');

console.log('\n[B] 网址只留首尾标签，去掉路径与查询');
{
  const r = red('请求失败 https://api.relay-abc.com/v1/chat/completions?model=x');
  ok(/https:\/\/api\.\*\*\*\.com\/…/.test(r), '三段式域名中间被打码、路径查询被去掉', r);
  ok(!/relay-abc/.test(r), '域名中段（可能是站点标识）不再出现', r);
  const r2 = red('https://example.com/path?a=b');
  ok(!/\/path/.test(r2) && !/a=b/.test(r2), '两段式域名保留、路径查询去掉', r2);
}

console.log('\n[C] 普通文本与边界');
ok(red('本地数据库无法打开') === '本地数据库无法打开', '普通中文错误原文原样保留');
ok(red('') === '' && red(null) === '' && red(undefined) === '', '空值安全');
ok(!/[\u0000-\u001f]/.test(red('a\nb\tc')), '控制字符被替换（复制到聊天窗口不会乱）');
ok(red('x'.repeat(2000)).length === 600, '长度截断到 600', String(red('x'.repeat(2000)).length));
ok(typeof red({toString: () => 'obj'}) === 'string', '非字符串输入不抛错');

console.log('\n==============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('==============================');
process.exit(fail ? 1 : 0);
