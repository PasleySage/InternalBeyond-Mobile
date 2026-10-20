/* gen_tree.js —— 生成 docs/workspace-tree.md（一次性生成器，产物即文档）
 * 注释列按显示宽度对齐（CJK 记 2 列）；条目数据在下方 ENTRIES，改结构后重跑即可。 */
const fs = require('fs');
const path = require('path');

// ── 条目数据：[前缀, 名称, 注释]；前缀即 tree 的连接符部分 ──
const E = [];
const F = (name, note) => E.push(['├── ', name, note]);
const L = (name, note) => E.push(['└── ', name, note]);
const C1 = (name, note) => E.push(['│   ├── ', name, note]);
const C1L = (name, note) => E.push(['│   └── ', name, note]);
const C2 = (name, note) => E.push(['│       ├── ', name, note]);
const C2L = (name, note) => E.push(['│       └── ', name, note]);

// 根 · 产品与索引
F('index.html', '核心应用：上游 v360-p 原文（blob d4ed84c · 4,949,808 B · IB_VER=v360-p）');
F('ib-sw.js', 'Service Worker（缓存名单 ib-cache；本轮 blob 6f48fcbb 未变）');
F('ib-ver.html', 'IB 版本探针页（上游件）');
F('manifest.webmanifest', 'PWA 清单（安装形态；上游件）');
F('icon-192.png', 'PWA 图标 192×192（上游件）');
F('icon-512.png', 'PWA 图标 512×512（上游件）');
F('README.md', '上游同步件（_sync_mirror.js 覆盖目标，本地勿编辑）');
F('COPYRIGHT.md', '上游同步件（同上）');
F('LICENSE', '上游同步件（同上）');
F('AGENTS.md', 'AI 行为守则 + 根记忆入口（开工先读）');
F('CONTEXT.md', '术语表 / 历史上下文 / 真机实测数据');
F('_工具与产物清单.md', '脚本与产物唯一索引（§〇–§十七，含删除判据）');
F('_live_sync.txt', '同步复核证据（V3.1.0 人工版；_check_sync.js 跑不动时的手取样板）');
F('deepseek_to_ib.js', 'DeepSeek 导出记录 → IB 聊天记录转换');
// 根 · 同步与部署
F('_fetch_upstream.js', '上游源码快照取数入口（--expect-sha 断言）');
F('_verify_live.js', '轮询 Pages 重建 + 线上逐字节核对（内置 cache-busting）');
F('_sync_mirror.js', '镜像 main 同源同步（以上游 tree 为基准）');
F('_rollback_main.js', '镜像 main 回滚到指定提交');
F('_push_ref_branch.js', '参考实现分支推送（基线须传 40 位 SHA）');
F('_check_sync.js', '镜像/上游同源核对（sandbox 跑不动，用 bash 侧 gh/curl）');
// 根 · 检查器
F('_check_publish.js', '外发稿自检（占位符 / \\uXXXX / 内部字样）');
F('_check_docs.js', '文档自洽检查（编号 / refs / 尾部空行）');
F('_check_tables.js', '表格读数自查（列名 / 量纲 / 混排）');
F('_probe_lint.js', '结构 lint（⑥__dirname 禁上跳 ⑦md 路径存在性；_archive 豁免）');
// 根 · 活测试（预提交守栏跑这 6 个中的 5 个 + brief 一致性）
F('_test_ib.js', '活测试：IB 应用行为');
F('_test_ib_structure.js', '活测试：index.html 结构');
F('_test_ib_attach_probe.js', '活测试：附件探针');
F('_test_ib_brief_consistency.js', '活测试：变更一览 HTML/MD 双格式一致');
F('_test_deepseek_conv.js', '活测试：DeepSeek 会话转换');
F('_test_deepseek_chunks.js', '活测试：DeepSeek 分块');
F('_gen_tree.js', '目录树生成器（产出 docs/workspace-tree.md；结构有变时改它重跑）');
// 目录
F('apps/', '上游资产（3 件：catalog.js/json、ib-app-cinema.js；同步时逐字节比对）');
F('assets/', '上游资产（readme/ 横幅 svg + png ×2）');
F('data/', '本地素材');
C1L('chat/', '聊天记录样本（ib-selene-chat_part1–5.json）');
F('docs/', '项目文档');
C1('adr/', '架构决策记录（0002 启动等待开关 / 0004 工作区拆分）');
C1('agents/', '流程规范（issue-loop / issue-tracker / spec-and-tickets / triage-labels / domain / win-shell-env）');
C1('briefs/', '上游变更一览（现仅 V3.1.3 一对；V3.1.1 已于 10-20 删，git 历史可查）');
C1('investigations/', '排查手册（IB白屏-诊断与自救手册）');
C1('issues/', '已外发英文稿存档（issue #14 / #17 / PR #15）');
C1('workspace-readme.md', '工作区说明（架构树简版 / 镜像路线 / 常用操作）');
C1('workspace-tree.md', '本文件');
C1L('IB-本体缺陷-复核清单.md', '两端共用的本体缺陷清单');
F('tools/', '本地工具链');
C1L('pages/', '被测静态页（聊天记录录入器 / 附件选择器真机实测）');
F('自用补丁-归档/', 'v246-p 启动层补丁恢复源（2026-09-25 用户定「留档」；非账本件，勿与账本归档混放）');
F('_archive/', '冻结历史区（退役补丁归档；_probe_lint ⑦ 整体豁免）');
C1L('ctx-ledger-v351p/', '已被上游 v353-p 采纳的旧版账本补丁全套（勿再启用）');
C2('README.md', '归档说明（文件清单 / 历史节点 / 勿混用警告）');
C2('index-功能版-v351p.html', '旧成品＝换基前的镜像 main index.html（blob e1a4605f）');
C2('ctx-ledger-module-提取.js', '模块本体提取（16 KB）');
C2('本地账本改动-vs-v351p.diff', '80 hunk：补丁范围的权威记录');
C2('改动一览.md', '补丁台账（R1–R3 + patch12–33 + §二十四–§三十）');
C2('R3-D17真机测试SOP.md', '真机复测 SOP（历史）');
C2('_pr15.diff', 'PR #15 原始 diff');
C2('pr16.diff', 'PR #16 第二层增量 diff（13 hunk）');
C2('pr16diff说明.md', '增量包转发说明');
C2L('_deploy_ctx_ledger.js', '旧部署脚本（已退役；镜像现行路线＝_sync_mirror.js）');
// 隐藏条目（集中列于末尾）
F('.githooks/', '预提交守栏（core.hooksPath 指向处）');
C1L('pre-commit', '6 活测试 + _check_docs + _probe_lint；任一失败即阻止提交');
F('.scratch/', '本地 effort（.gitignore 不入库）：11 个 effort 目录 + 4 张 10-17 真机截图');
F('.workbuddy/', '会话记忆（memory/）＋项目技能 ib-upstream-issue-publish（.gitignore 不入库，不展开）');
F('.obsidian/', 'Obsidian 配置（.gitignore 不入库）');
F('.git/', '仓库元数据（不展开）');
L('.gitignore', '忽略规则（.scratch / .workbuddy / .obsidian / node_modules / *.bak / _tmp_*）');

// ── 宽度感知对齐（CJK 记 2 列） ──
function dw(s) { let w = 0; for (const ch of s) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1; return w; }
const COL = Math.min(42, Math.max(...E.map(([p, n]) => dw(p + n))) + 2);
const lines = E.map(([p, n, note]) => {
  const head = p + n;
  const pad = ' '.repeat(Math.max(1, COL - dw(head)));
  return head + pad + '# ' + note;
});

const doc = `# IB 手机端工作区 · 目录结构树（带注释）

> **截至 2026-10-20**（v360-p 换基＋账本归档后）。结构＝本地扫描，注释人工维护；隐藏条目集中列于末尾。
> 同步基准：镜像 \`main\`＝上游 v360-p \`4649aaa7\`（纯同源）；\`local-work\`＝同源 index＋本地工具/测试/归档。
> 规模：根目录 32 个文件，仓库跟踪 85 个文件（\`git ls-files\`，含本文件与 \`_gen_tree.js\`）。

\`\`\`text
D:\\IB-Workspace-Mobile\\
${lines.join('\n')}
\`\`\`

## 阅读要点

1. **上游同步件**（\`_sync_mirror.js\` 逐字节覆盖，本地勿编辑）：\`index.html\`、\`ib-sw.js\`、\`manifest.webmanifest\`、\`icon-192.png\`、\`icon-512.png\`、\`ib-ver.html\`、\`README.md\`、\`COPYRIGHT.md\`、\`LICENSE\`、\`apps/\`、\`assets/\`。
2. **目录纪律**：根＝产品＋索引；\`docs/\`＝文档；\`tools/pages/\`＝被测静态页；\`data/\`＝素材；\`_archive/\`＝冻结历史区（_probe_lint ⑦ 整体豁免）；\`.scratch/\`＝本地 effort（不入库）。
3. **2026-10-20 换基后的结构变化**：新增 \`_archive/ctx-ledger-v351p/\`（9 件）；\`_deploy_ctx_ledger.js\` 由根移入该归档；\`docs/briefs/\` 只剩 V3.1.3 一对（V3.1.1 应用户要求已删）；晚轮新增根目录 \`_gen_tree.js\`（目录树生成器，根文件 31→32）。
4. **脚本用途与「什么时候可以删」**见 \`_工具与产物清单.md\`；本树只注结构、不注用法。架构树简版另见 \`docs/workspace-readme.md\`。

---
**生成**：2026-10-20；树体由根目录 \`_gen_tree.js\` 产出（随仓库跟踪；注释列按显示宽度对齐）。结构有变时改生成器里的条目数据重跑，勿手改树体。
`;

fs.writeFileSync(path.join(__dirname, 'docs', 'workspace-tree.md'), doc, 'utf8');
console.log('已生成 docs/workspace-tree.md，注释列 =', COL, '，条目', lines.length, '行');
