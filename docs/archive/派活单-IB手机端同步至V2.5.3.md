# 派活单 · IB 手机端镜像同步到上游 V2.5.3

**状态**：待执行  
**执行者**：其它 agent（本单自包含，无需回看会话）  
**产出验收**：镜像线上 = 上游 `bf6a86a8` 功能一致；fix-r6 / fix-r7 已留档；`_check_sync.js` 全绿

---

## 1. 背景（一句话）

镜像 `PasleySage/InternalBeyond-Mobile` 现带自用补丁 fix-r6 + fix-r7（基于上游 `1e2725b0` / V2.4.4）；上游已出到 V2.5.3（`bf6a86a8`）。**用户已拍板：fix-r6 / fix-r7 都留档，功能上与上游完全同步，不叠回。**

## 2. 关键事实（动手前先核，不对就停）

| 项 | 值 |
| --- | --- |
| 上游 | `Sui-IB/InternalBeyond-Mobile` |
| 镜像 fork | `PasleySage/InternalBeyond-Mobile` |
| 基线（本地补丁所依） | `1e2725b0`（V2.4.4） |
| 同步目标 HEAD | `bf6a86a8`（V2.5.3，2026-09-25） |
| 区间 | 4 commits：`ffa1056f` `5104f831` `f545d578` `bf6a86a8` |
| 变更文件 | 仅 `index.html` +1034 −228 |
| index.html | 3,304,065 → **3,462,557** 字节 |
| ib-sw.js | blob `6f48fcbb` **四版未变** → 不重缓 SW 脚本 |
| DB_VER | **未变** → 不走库升级 |
| 应用内版本 | 上游 `v290-p` / 2026-09-25（撤补丁后回到此值） |
| 镜像现状 | `main=3718804`（`v262-p-r7`），本地 10 提交：fix-r6×6 + fix-r7×4 + 验证版清理 |

**开工前用 node + gh 再读一次上游 main 与镜像 main**，若上游 HEAD 已不是 `bf6a86a8`，停，回报用户。

## 3. 决策（已定，不要重问）

1. **fix-r6（摘要修复）**：上游已用更完整实现重做（`_noThink` / `_sumWhyM` / `_dsThinkOffM` / `_finTruncM`）。**采用上游版；fix-r6 整套留档，不叠回。**
2. **fix-r7（启动等待）**：上游做了同向的「打开应用后先安静」。**功能上跟上游；fix-r7 整套留档，不叠回。**
3. **归档四项**（诊断面板 / 耗时埋点 / VersionError 自愈 / SW 完整性）：上游仍未采纳，**继续只放归档，不上线**。
4. **`ib-ver.html` 探针页**：镜像专属，**保留**（不参与上游同步）。

## 4. 执行步骤（按序，不可跳）

### 4.1 留档 fix-r6 / fix-r7

- 目标目录：`D:\InternalBeyond\Android\自用补丁-归档\`
- 动作：
  1. 从当前镜像 `index.html`（`3718804` 或本地若已有）摘出 fix-r6 / fix-r7 的**落点说明**（锚点、标识符、用户定稿文案）。
  2. 可从本地补丁提交说明与 `.workbuddy\memory\2026-09-19.md` 交叉核对（fix-r6 13 处锚点、fix-r7 12 处；版本标记 `v262-p-r7`）。
  3. 落成 `自用补丁-归档\fix-r6-摘要修复.md` 与 `fix-r7-启动等待.md`（或合并一份 `fix-r6-r7-留档.md`），写清：用途、锚点、与上游 V2.5.x 的对应关系（已被上游哪一版覆盖 / 同向替代）、用户定稿文案原样保留。
  4. 更新 `自用补丁-归档\README.md`：加上这两项，注明「2026-09-25 随 V2.5.3 同步撤下，功能由上游覆盖」。
- **不要**把补丁代码重新打进线上 `index.html`。

### 4.2 镜像重建为上游 V2.5.3

- 取上游 `bf6a86a8` 的 `index.html` **原样字节**（`curl -sL -o` 或 `gh api git/blobs`，**禁止**字符串中转写盘）。
- 覆盖镜像 `index.html`；`ib-ver.html` 保留不动。
- 可用现有 `Android\_mk_mirror.js` 的思路，但本轮**不应用任何补丁清单**（fix-r6/r7 都撤）；直接以上游文件为产物。
- 写完比对 **git blob sha** 应等于上游 contents 的 `sha`（`e7e334e`…→ 注意 V2.5.3 是 `2b2e5c46bdfc02e44bdea655ed904321f1cbb2a0`）。

### 4.3 推送镜像 main

- 目标：镜像 `main` 的 `index.html` 与上游 `bf6a86a8` **逐字节一致**（`ib-ver.html` 可另留）。
- 建议：打 tag 归档当前 `3718804`（如 `archive/ib-selfpatch-v262p-r7`）→ 以上游树为基础建新提交（或 force 快进，若历史允许）→ push。
- **注意**：镜像当前有 10 个本地提交，**不是** fast-forward。按需 `tag` 后重建提交；**不要**无 tag 强推丢历史。

### 4.4 复核（全部做，缺一不算完）

用 `Android\_check_sync.js`（或按下列项手核）：

1. 镜像 `main` 的 `index.html` blob sha = 上游 `bf6a86a8` 的 contents sha。
2. 文件字节数 = **3,462,557**。
3. 线上 Pages：`gh api repos/PasleySage/InternalBeyond-Mobile/pages/builds/latest` → `status=built`，`commit` = 新镜像提交。
4. 线上 `index.html`：`curl -sL -o tmp` + sha256 与镜像仓库一致；内含 `IB_VER='v290-p'`，**不含** `v262-p-r7`、**不含** `fix-r6` / `fix-r7` / `pres-wait` / `_sumLastErrM`。
5. `ib-ver.html` 仍 HTTP 200（若保留）。
6. 归档目录已有 fix-r6 / fix-r7 留档文件，且归档 README 已更新。

**坑（已踩，照做）**：Pages 构建约 45s，用 PowerShell `Start-Sleep`，不要在 `execSync` 里 `timeout /t`。大文件校验用 `curl -o` 落盘 + sha256，不要走 stdout。抓取失败重试 2～3 轮。`>` 重定向是 UTF-16，node 输出用 `[IO.File]::WriteAllText`。

### 4.5 副作用告知（写进完成汇报）

- 首次打开需联网一次（SW 按原缓存名 `ib-cache-v3` 抓新 `index.html`）。
- **不**走库升级（`DB_VER` 未变）。
- 应用内版本从 `v262-p-r7` 变为 `v290-p`。
- fix-r6 的摘要真因文案、fix-r7 的「打开应用后等待」开关将**不再出现**；替代能力见变更一览第 1、2 组。

### 4.6 复测清单（真机 / 浏览器）

- 摘要：DeepSeek 等开思考型号上是否不再必失败；「立即更新」失败是否说真因。
- Presence：「打开应用后先安静」冷启动 / 换设备导入后是否安静一段。
- 低端机：长列表滚动、退到后台动画是否停。
- Bubble Lab 明暗两套气泡；收藏夹按月翻。
- Zone Glass / Zone Text；卡片投影开关有圆钮；聊天顶栏两根滑杆有进度。
- Beyond 单条全文；`ws_blog_edit` / `ws_delete`。

## 5. 明确不要做

- 不要把 fix-r6 / fix-r7 功能叠回线上。
- 不要动 `ib-sw.js`（上游未改）。
- 不要动电脑端 `Windows\`（另一条线）。
- 不要改上游仓库。
- 不要在未打 tag 的情况下 force 覆盖镜像历史。

## 6. 参考文件

| 文件 | 用途 |
| --- | --- |
| `Android\IB-upstream-V2.5.3变更一览.html` / `.md` | 本轮变更与重叠判定（本单的事实来源） |
| `Android\_check_sync.js` | 同步复核 |
| `Android\_deploy_patch_main.js` / `_verify_live.js` / `_rollback_main.js` | 部署 / 线上校验 / 回滚 |
| `Android\自用补丁-归档\README.md` | 留档落点 |
| `.workbuddy\memory\2026-09-19.md` | fix-r6 / fix-r7 锚点与上线记录 |

## 7. 完成后汇报格式

1. 镜像提交号 + 是否打了归档 tag  
2. `_check_sync.js` 六项复核结果（逐条绿/红）  
3. 归档文件路径  
4. 副作用是否已告知用户  
5. 复测清单里**未做**的项（如有）及原因  
