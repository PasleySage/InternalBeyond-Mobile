# D:\IB-Workspace-Mobile

Internal Beyond（IB）**手机端（PWA）**工作空间 —— 上游 `Sui-IB/InternalBeyond-Mobile`，我方镜像 `PasleySage/InternalBeyond-Mobile`（含自有补丁的非官方修改版）。2026-10-19 从混合工作区拆出（`docs\adr\0004`）；电脑端在独立工作区 `D:\IB-Workspace-Desktop`。

## Project overview

| 线路 | 体量 | 技术形态 | 上游 |
|---|---|---|---|
| **手机端** | 单文件 PWA（`index.html` + `ib-sw.js` 等，约 490 万字节级） | 纯 PWA（Service Worker） | `Sui-IB/InternalBeyond-Mobile`（V3.1.x） |

本工作区**不是产品**；职责是跟版、出变更一览、维护镜像补丁与归档、写上游 issue / 参考实现稿。

## Architecture

```
D:\IB-Workspace-Mobile\
├─ index.html  ib-sw.js  ib-ver.html  manifest.webmanifest  icon-*.png  ← 镜像 main＋PWA 面（勿动，见白名单）
├─ README.md  LICENSE  COPYRIGHT.md  apps\  assets\                     ← 上游文件（同步时逐字节比对）
├─ _工具与产物清单.md            脚本与产物的**唯一索引**
├─ _*.js                        同步 / 部署 / 探针 / 发布自检 / 测试
├─ deepseek_to_ib.js  _live_sync.txt
├─ CONTEXT.md  AGENTS.md        术语表 / 根记忆入口
├─ docs\
│  ├─ adr\  agents\  workspace-readme.md
│  ├─ briefs\          IB-upstream-V3.1.1变更一览（现行基线；旧版一览已清，git 历史可查）
│  ├─ issues\          已外发英文稿存档（带 GitHub 编号：issue #14 / #17、PR #15）
│  ├─ investigations\  IB白屏-诊断与自救手册
│  └─ IB-本体缺陷-复核清单.md   两端共用的本体缺陷清单
├─ tools\pages\        被测静态页（聊天记录录入器 / 附件选择器实测）
├─ data\chat\          聊天记录转换素材（ib-selene-chat_part*.json）
├─ 自用补丁-归档\       已撤下补丁的恢复源（用户 2026-09-25 定「留档」）
└─ .scratch\                    本地 effort：spec + issues + 对外稿（不入库）
```

**镜像产物的现行路线**：纯上游同步走 `_sync_mirror.js`（以上游 tree 为基准）；上下文账本功能版走 `_deploy_ctx_ledger.js`（从 `.scratch\ib-ctx-ledger\` 的净版／功能版推镜像 main，每次部署前打回滚 tag）。r6/r7 时代的锚点补丁引擎链已于 2026-10-19 深清理移除（功能均已上游化，见 `_工具与产物清单.md` §十七）；电脑端 parity 补丁流水线在 `D:\IB-Workspace-Desktop\_patches\`（引擎＋driver＋测试，自包含）。

## Code style（编码思路）

1. **不做向后兼容层。** 删掉过时路径，不要加兼容垫片、fallback 或「先迁一点」的中间态。上游发版后补丁锚点失效，就**重打锚点或撤掉该项**，不写兼容读法。
2. **选刚好满足当前需求的最简实现。** 避免投机性抽象、配置项和间接层。三处相似代码好过一个过早的框架；清单里能写清的锚点替换，不要升级成模板引擎。
3. **分层生长。** 先做出端到端能跑的最小版本，再往上叠能力。**绝不拿一个能用的产品去换未完成的复杂度**——补丁一项一验收，绿了再下一项。
4. **模块边界清楚。** 引擎 / 清单 / driver / 测试各管一事；新增补丁**只写清单**，不改引擎。不与桌面端工作区跨仓引用，同构逻辑允许副本，改一边时对照另一边。
5. **优先用已有能力。** 动手前先查 `_工具与产物清单.md` 与既有 `_*.js`；项目里已有的解析、同步、自检工具不要重写。要引入外部库先确认是否真能降低复杂度（IB 本体是单文件，依赖越少越好）。
6. **假定库已有能力前先核实。** 不要假设「浏览器做不到 / 现有函数没有」——先 grep 源码与文档（单文件用 `grep -n` + 抽段，勿整读）。
7. **架构决定按长期形态做。** 不接受「先这样、以后再换」的临时方案；若必须临时，写进 ADR 并写明退出条件。
8. **不破坏 IB 原前端设计。** 宁可改进度条语义，也不自造控件；UI 形状、图标 path **从源码抄**，禁止近似自画。
9. **临时验证代码用完即清。** debug 输出、一次性脚本、假数据、无引用的探针，在交付前删除；正式测试与诊断日志保留。

## UI guidelines

- 沿用页面既有控件类与视觉语言（按钮、提示、卡片）；**零新造视觉** 优先。
- 界面预览必须**落盘**成文件，不得只内联在会话里；图标与面板结构以源码为准。
- 内容排版默认**中轴居中**（用户偏好）；系统原生控件除外。
- 电脑端「两套 Chat UI」的注意事项见桌面端工作区同名文档。

## Pre-commit checklist

交付 / 提交前按序：

```bash
# 以下各项已由 .githooks/pre-commit 在 commit 时自动执行（core.hooksPath=.githooks）；
# 本块是手工口径——守栏外单独跑某一项、或排查某项失败时用。

# 手机端回归（若本轮改了补丁/脚本）
node _test_ib.js && node _test_ib_structure.js && node _test_ib_attach_probe.js
node _test_deepseek_conv.js && node _test_deepseek_chunks.js
node _test_ib_brief_consistency.js    # 动了 docs/briefs/ 下的变更一览时必跑

# 对外文稿（若本轮有 issue / PR / 评论稿）
node _check_publish.js <稿路径>
node _check_docs.js
node _check_tables.js <稿路径>
```

另加纪律：**临时残留清理 → 测试 → 再提交**（顺序不可颠倒）；写操作回读核对。

## Benchmarks are not tests

只打印指标、不含断言的探针（对照页、计数脚本）**不算测试**，不能代替 `_test_*.js`。跑通探针 ≠ 验证通过。

## 常用操作

| 想做什么 | 怎么做 |
|---|---|
| **上游更新了** | 说「上游更新了」，走 skill **`upstream-update-brief`**：先出 HTML+MD 预览 → 同意后再同步 + 复核 |
| 同步镜像到上游某提交 | `node _sync_mirror.js <上游commit>` |
| 回滚镜像 main | `node _rollback_main.js <提交>` |
| 看镜像是否对齐 | `node _check_sync.js`（⚠️ 镜像已带自用补丁时改为锚点等价核对；sandbox 内跑不动，用 bash 侧 `gh`/`curl`） |
| 取上游源码快照 | `node _fetch_upstream.js <commit> --expect-sha <前缀>` |
| 部署账本功能版到镜像 | `node _deploy_ctx_ledger.js <文件> <repo> <vXXX-p> "<用途>"`（每次部署前打回滚 tag；与 `_sync_mirror.js` 互斥） |
| 恢复归档能力 | 见 `自用补丁-归档\README.md` 与项目记忆 |
| 脚本 / 产物索引 | **`_工具与产物清单.md`（唯一索引）** |
| 电脑端操作 | 见 `D:\IB-Workspace-Desktop`（补丁重放、与上游差异、变更一览） |

## 本线定位

- **手机端**：PWA + Service Worker，可部署 GitHub Pages 镜像。自用补丁（账本三层等）与上游不同源时，复核用**锚点等价核对**（判据＝逐项比补丁台账）。

## git 绑定（2026-10-19 拆分）

- `origin=PasleySage/InternalBeyond-Mobile`、`upstream=Sui-IB/InternalBeyond-Mobile`；`main`＝镜像线、永不被本地提交污染；本地资产（工具 / 文档 / 技能）在 `local-work` 分支。
- 首次入库＝2026-10-19 拆分（迁移记录 `.scratch\workspace-split\`）；**不 push**（除非用户明确指令且自测通过）。

## 文档约定

- 长期文档不写「当前 / 现在」；版本与基线一律「**截至 YYYY-MM-DD** …」。
- **对外文稿默认先出稿待批**，不直接发。细则见用户级 `~\.workbuddy\MEMORY.md`「对外文稿」。
- 上游 issue / PR 走 `docs\agents\upstream-issue-loop.md`：三道闸门 → 选路 → 六段「上游可发体」→ 待批 → 回读（「我」= 0）。

## Useful commands

```bash
# 查引用（Glob/Grep 会漏隐藏目录）
bash -lc "grep -rn 'pattern' ..."

# 清理临时文件（Remove-Item 必失败）
node -e "require('fs').unlinkSync('path')"
```

Shell / PATH / 安全删除的坑见 `docs\agents\win-shell-env.md`。
