#!/usr/bin/env node
/*
 * _check_publish.js —— 外发文稿的发布前自检（2026-09-19 建）
 *
 * 为什么要有它：这套自检以前每次都是临时内联的 node -e，而且同一个坑**复发过一次** ——
 * 占位符在同一份草稿里有两种写法（#___ 与 #__\_），精确字符串替换只命中一处，
 * 结果 PR 正文带着 #__\_ 发了出去，靠事后 `gh pr edit` 补救。
 * 纪律会失手，检查不会。
 *
 * 用法：
 *   node _check_publish.js <草稿.md> [更多草稿.md ...]
 *   node _check_publish.js --body-only <已抽出的正文.md>     # 整篇都当正文检查
 *   node _check_publish.js --expect-mermaid 1 <草稿.md>
 *
 * 约定：草稿结构 = 头部备注 + 一行 `---` + 正文。
 * 有 `---` 时**只检查正文**（头部备注不发出，允许出现内部字样）。
 * 退出码：全部通过 0，任一失败 1。
 *
 * ⚠️ **英文稿**：IB 的对外文稿开始有英文版（2026-10-14 起）。本脚本原先全部断言都是
 * 中文字面量，对英文稿**几乎零覆盖**（实测：含 I/my/we/mirror/self-patch/probe page/
 * iteration 的英文样例 rc=0 放行）。现已补英文词表 —— 这是给所有将来的英文对外文稿铺路，
 * 纯增量，中文稿行为不变。两条注意：
 *   · `probe` 单词**不禁**（IB 有「缓存探针」「图片探针」两个用户可见指令，英文稿要引用
 *     cache probe / image probe）；只禁 `probe page` 这个短语。
 *   · 英文第一人称含 **we/our/us** —— 「we can see that…」暗示作者＋读者共同体，
 *     而这类稿子是「用户向作者报告机制」，不能用 we。
 * ⚠️ **2026-10-18 发布实测补的两条断言**：
 *   ① 正文（剔除完整占位符 `#__ISSUE__` 后）出现 `__` 即 FAIL —— 宽松正则 `/#_+/g` 只换
 *     `#__` 前缀，会把 `refs #__ISSUE__` 换成 `refs #14ISSUE__`，字母后缀留在正文里；
 *     回填只应是整串精确替换，残留双下划线即回填不完整。
 *   ② 正文出现字面 `\uXXXX` 即 FAIL —— GitHub 上传会把字面 `\uXXXX` 转成控制字符脱符形式
 *     （实测 `` `\u001e` `` → `` `\^^` ``，`--body-file` 与 `gh api --input` 均不可免），
 *     改用「U+XXXX」表述，事实等价。
 */
const fs = require('fs');
const path = require('path');

// 正文里不允许出现的字样：**本空间内部**的资产名与构建标记（不是代码里的标识符）
// 注意：代码里真实存在的标识符（`_noThink` / `_sumLastErrM` / `fix-r6`）**允许**出现 ——
// 它们本来就在 PR 的 diff 里，正文点名它是正确的（例如说明"聊天主链没动"）。
// 被禁的是"我们这个仓库/镜像"才有的东西：镜像版本标记、自用补丁归档、探针页。
//
// ⚠️ 英文稿支持（2026-10-14 补）：IB 开始收到英文外发稿，而本检查器原先全是中文字面量
// ⇒ 英文稿里的 mirror / self-patch / probe page 一个都拦不住（实测 rc=0 放行）。
// 下面每个词表都有中英两套，**新增只增不改**（中文稿既有行为不变）。
// ⚠️ `probe` **单词不禁** —— IB 界面上「缓存探针」「图片探针」是两个用户可见指令，
// 英文稿必须能引用（cache probe / image probe）。只禁 `probe page`（内部测试 HTML 页）这个短语。
const INTERNAL = ['自用补丁', '镜像', 'IBSP', 'v262-p', '探针页', 'IB_PR=1'];
// 英文内部字样：单词走 `\b` 正则（见下方 2b，裸 includes 会误伤 `mirroring`），
// 短语走普通包含。`mirror repository` 与 `mirror` 同理（mirror 单独出现已足够指代镜像资产）。
const INTERNAL_EN_PHRASE = ['self-patch', 'self patch', 'probe page', 'probe-page'];
// 版本演进说法（"从 v1 改到 v6""三版""迭代"这类）
const EVOLUTION_WORDS = ['迭代', '早期版本', '初版', '前一版'];
const EVOLUTION_EN = ['iteration', 'earlier version', 'previous revision', 'earlier revision', 'prior revision'];
const EVOLUTION_RE = /第[一二三四五六七八九十\d]+(?:版|稿)/;

function extractBody(text) {
  const lines = text.split('\n');
  const limit = Math.min(lines.length, 80);
  for (let i = 0; i < limit; i++) {
    if (lines[i].trim() === '---') {
      return { body: lines.slice(i + 1).join('\n'), split: true };
    }
  }
  return { body: text, split: false };
}

function scan(file, opts) {
  const raw = fs.readFileSync(file, 'utf8');
  const { body, split } = opts.bodyOnly ? { body: raw, split: false } : extractBody(raw);
  // 行号以「正文」为准（抽出后重排），报错时同时给出正文内行号
  const lines = body.split('\n');

  const fails = [];
  const notes = [];

  const each = (re, label, fn) => {
    lines.forEach((l, i) => {
      const m = l.match(re);
      if (m) (fn ? fn(m, l, i + 1) : fails.push(`${label}  L${i + 1}: ${l.trim().slice(0, 90)}`));
    });
  };

  // 1) 占位符残留
  each(/#_+/, '占位符残留');
  // 1b) 双下划线残留：占位符回填只应是整串精确替换 —— 剔除完整占位符 #__ISSUE__ 后，
  //     正文任何地方不该再有 __（宽松正则会留下字母后缀，如 refs #14ISSUE__，2026-10-18 实测）
  lines.forEach((l, i) => {
    if (l.split('#__ISSUE__').join('').includes('__')) fails.push(`双下划线残留（回填不完整）  L${i + 1}: ${l.trim().slice(0, 90)}`);
  });
  // 1c) 字面 \uXXXX：GitHub 上传会把字面 \uXXXX 转成控制字符脱符形式（实测 `\u001e` → `\^^`，
  //     --body-file 与 gh api --input 两条路径均不可免）⇒ 改用「U+XXXX」表述，事实等价
  each(/\\u[0-9a-fA-F]{4}/, '字面 \\uXXXX 转义');
  // 2) 内部字样
  INTERNAL.forEach(tok => {
    lines.forEach((l, i) => {
      if (l.includes(tok)) fails.push(`内部字样「${tok}」  L${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  });
  // 2b) 内部字样（英文稿）—— 按 `\b` 词边界匹配，**只拦 `mirror` 作名词**那一种。
  // ⚠️ 两个实测踩过的坑：
  //   ① 裸 `includes` 会误伤正常英文 `mirroring`（"mirroring how the cache probe
  //      accepts its short forms"＝效仿缓存探针，与内部资产无关）⇒ 必须 `\b`。
  //   ② `\bmirror\b` 之外的变形（mirrors/mirrored/mirroring）**刻意不拦** —— 对外文稿
  //      来说 "mirroring the cache probe" 是正常英文，拦它比漏它更糟。
  // 短语词条（self-patch / probe page）本身含空格，用普通包含即可。
  const INTERNAL_EN_RE = /\bmirror\b/gi;
  const INTERNAL_EN_PHRASE = ['self-patch', 'self patch', 'probe page', 'probe-page'];
  lines.forEach((l, i) => {
    const m = l.match(INTERNAL_EN_RE);
    if (m) fails.push(`内部字样(EN)「${m[0].toLowerCase()}」  L${i + 1}: ${l.trim().slice(0, 90)}`);
    INTERNAL_EN_PHRASE.forEach(tok => {
      if (l.toLowerCase().includes(tok)) fails.push(`内部字样(EN)「${tok}」  L${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  });
  // 3) 版本演进字样
  EVOLUTION_WORDS.forEach(tok => {
    lines.forEach((l, i) => {
      if (l.includes(tok)) fails.push(`版本演进字样「${tok}」  L${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  });
  EVOLUTION_EN.forEach(tok => {
    lines.forEach((l, i) => {
      if (l.toLowerCase().includes(tok)) fails.push(`版本演进字样(EN)「${tok}」  L${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  });
  each(EVOLUTION_RE, '版本演进字样');

  // 4) 第一人称（账号即用户发言 ⇒ 一律略过人称）
  const firstPerson = (body.match(/我(?!们)/g) || []).length;
  const we = (body.match(/我们/g) || []).length;
  if (firstPerson) fails.push(`第一人称「我」出现 ${firstPerson} 次（应为 0）`);
  if (we) fails.push(`第一人称「我们」出现 ${we} 次（应为 0）`);
  // 4b) 第一人称（英文稿，2026-10-14 补）—— 含 we/our/us，**不是**中文「我/我们」的机械沿袭：
  // 英文技术写作里 "we can see that…" 暗示「作者＋读者」共同体，而本稿是「用户向作者报告机制」，
  // 不能用 we。用 \b 词边界避免误伤 were/its/This。
  // ⚠️ 所有格/变形要显式列出：`\bour\b` 抓不到 `ours`（词边界不成立，实测漏过）。
  const FP_EN = /\b(i|my|me|mine|we|our|ours|us)\b/gi;
  const fpEn = body.match(FP_EN) || [];
  if (fpEn.length) {
    const uniq = [...new Set(fpEn.map(s => s.toLowerCase()))];
    fails.push(`第一人称(EN) 出现 ${fpEn.length} 次（应为 0）：${uniq.join(' / ')}`);
  }

  // 5) 代码围栏必须成对
  const fences = lines.filter(l => /^```/.test(l)).length;
  if (fences % 2) fails.push(`代码围栏 ${fences} 个（奇数 ⇒ 有未闭合的代码块）`);

  // 6) mermaid 块数（只报告；给了 --expect-mermaid 才断言）
  const mermaid = (body.match(/^```mermaid/gm) || []).length;
  notes.push(`mermaid 块 ${mermaid} 个`);
  if (opts.expectMermaid !== null && mermaid !== opts.expectMermaid) {
    fails.push(`mermaid 块数为 ${mermaid}，期望 ${opts.expectMermaid}`);
  }

  notes.push(`正文 ${Buffer.byteLength(body)} B` + (split ? '（已按首个 --- 切出正文）' : '（未发现 ---，整篇按正文检查）'));

  return { fails, notes };
}

const argv = process.argv.slice(2);
const opts = { bodyOnly: false, expectMermaid: null };
const files = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--body-only') opts.bodyOnly = true;
  else if (a === '--expect-mermaid') opts.expectMermaid = Number(argv[++i]);
  else if (a === '-h' || a === '--help') {
    console.log('用法: node _check_publish.js [--body-only] [--expect-mermaid N] <草稿.md> [...]');
    process.exit(0);
  } else files.push(a);
}

if (!files.length) {
  console.error('没给文件。用法: node _check_publish.js <草稿.md> [...]');
  process.exit(2);
}

let bad = 0;
for (const f of files) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) { console.log(`\n✗ ${f}  —— 文件不存在`); bad++; continue; }
  const { fails, notes } = scan(p, opts);
  if (fails.length) {
    bad++;
    console.log(`\n✗ ${path.basename(f)}  —— ${fails.length} 处不合格`);
    fails.forEach(x => console.log('   · ' + x));
  } else {
    console.log(`\n✓ ${path.basename(f)}  —— 通过`);
  }
  notes.forEach(n => console.log('   – ' + n));
}

console.log('\n' + (bad ? `不合格 ${bad} 份，**不要提交**` : '全部通过，可以进入提交闸门'));
process.exit(bad ? 1 : 0);
