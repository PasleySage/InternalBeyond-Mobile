# 上下文账本 · 本地补丁历史归档（已被上游采纳 · 勿再启用）

> **本目录是什么**：2026-10-16～10-19 我们在镜像 `main` 上运行的「上下文账本 `_ctxLedgerM`」本地补丁全套（基于上游 v351-p）。**上游作者已在 v353-p 完整采纳同一功能**（issue #14 关闭、署名），2026-10-20 镜像换基 v360-p 与上游同源，本补丁**整套撤下**，仅存此目录供追溯。
>
> **⚠️ 勿再启用**：本归档的模块与调用点**不可**与上游 v360-p 混用——上游调用点使用句柄的 `tk()`／`tk2()`／`img()`（附言下标测量、图片张数），本归档的 `begin()` 句柄没有这三个方法，混配会 TypeError 被 genReply 的 catch 吞成「连接中断」、回复直接发不出。判据全文见 `docs/briefs/IB-upstream-V3.1.3变更一览.md`「合并提示」。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `index-功能版-v351p.html` | 补丁成品（功能版，含 3 条测试钩子；4,940,787 B，blob `e1a4605f`）——即 2026-10-20 换基前的镜像 main `index.html`，与 `.scratch/ib-ctx-ledger/out/` 原产物逐字节一致 |
| `ctx-ledger-module-提取.js` | `<script id="ib-ctx-ledger">` 模块本体提取（16,249 B；`begin/noteSave/readLast/reportM/rowHtml/tableHtml`，群聊 grp 22 块＋主动开口 hb 16 块映射） |
| `本地账本改动-vs-v351p.diff` | 本地成品 vs 上游 v351-p 全量 diff（80 hunk）——**补丁范围的权威记录**：面板行／genReply 埋点／群聊埋点／备份排除／hb 埋点／CSS／水水钩子＋测试钩子／模块本体 |
| `改动一览.md` | 补丁台账（R1–R3 交付＋patch12–33＋§二十四～§三十，含各轮基线与 blob） |
| `R3-D17真机测试SOP.md` | 真机复测 SOP（历史；?v=18／?v=19 两轮验收记在台账 §二十八～§二十九） |
| `_pr15.diff` | PR #15（第一层）原始 diff（`gh pr diff 15` 拉取） |
| `pr16.diff` / `pr16diff说明.md` | PR #16 第二层增量包原始 diff 与转发说明（注意：是 PR #15→#16 差＝纯第二层，非 PR #16 全量） |
| `_deploy_ctx_ledger.js` | 旧部署脚本（推镜像 main；已退役——现行镜像路线＝`_sync_mirror.js` 同源同步） |

## 历史节点（补丁生命周期）

- 2026-10-16 上线 `d1810a0`（v350-p 基）→ v351-p 重放 `b69c7e9a` → D17 群聊＋主动层 `4ab38416` → D17.1 主动消息不渲染面板行 `bb6f778c` → D18.1 群聊条数改测合并前 `e95c5937`（末态，`?v=19` 复测通过）
- 2026-10-19 作者在 v353-p 采纳第一层并署名（issue #14 关闭）；v356-p 补群聊与主动开口埋点
- 2026-10-20 上游发布 V3.1.2/V3.1.3（v360-p）带完整实现；镜像换基同源，本补丁退役归档
- 归档 tag：`archive/ib-selfpatch-ctx-ledger`（指向 `e95c5937`，fork 上可取回）
- PR #15／#16（分支 `ref/mobile-ctx-ledger`／`ref/mobile-ctx-ledger-group-hb`）去留由用户 2026-10-20 定夺（其亲往 GitHub 处理）

## 还剩什么没进本目录

`.scratch/ib-ctx-ledger/`（本地 effort、不入库）仍有：spec 与 issue 底稿（`issues/`）、已外发草稿（`draft-09/10-*`）、补丁脚本链（`patch/_ctx_patch*.js`）、净版产物（`out/IB-ctx-ledger-净版-v351p.html` 等）、真机日志。这些是本地追踪资产，按 `.gitignore` 约定不入库；本目录收的是**需要随 git 历史长期保存**的那一份。
