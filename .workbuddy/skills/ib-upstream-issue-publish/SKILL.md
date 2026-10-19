---
name: ib-upstream-issue-publish
description: 把 IB 本体缺陷外发到上游（Sui-IB/InternalBeyond-Mobile 或 Sui-IB/InternalBeyond）：走 issue，必要时再挂一个"参考实现"draft PR 互链，然后逐字节回读核对；也用于收口一条已提的 issue／关闭关联 PR。当用户说"发"、"开 issue"、"提 PR"、"把这份稿子发出去"、"收口"时使用。
agent_created: true
---

# 向 IB 上游外发 issue / 参考实现 PR

**先读规范**：`docs\agents\upstream-issue-loop.md`（三道闸门、出口选路、写稿六段、收口 A/B/C）。
本 skill 只讲**怎么把那套流程跑完**。

**渠道规则（2026-09-17 开发者原话，常驻）**：上游按"修订单 + 单文件提交"落改动，**不合并任何 PR**。
⇒ 新发现**一律开 issue**（机制写进 issue）；**手上已有实现时**，在 issue 之外再挂一个"参考实现"PR 供对照
（`refs #<issue号>`、**draft**、**不请求合并**、issue 关闭时一并关掉）。

外发前先出稿待用户点头；**不用第一人称「我」**（账号即用户发言）；不暴露版本迭代；细节见用户级
`~/.workbuddy/MEMORY.md`「对外文稿」一节。

## 前置

- **环境**：`~/.workbuddy/settings.json` 的 `env.PATH` 已把 PortableGit 的 `/usr/bin`、`/mingw64/bin` 前置进 PATH，
  `gh` 需要的 `GH_CONFIG_DIR` 也在同一处 ⇒ 正常情况下本会话**免前缀**就能用 `ls`/`grep`/`gh`。
  ⚠️ settings **只在会话开始加载** ⇒ 若当时 `ls` 报 command not found、`gh` 报 401，就是没加载到，本会话手抄：
  `export PATH="/usr/bin:/mingw64/bin:$PATH"` ＋ `export GH_CONFIG_DIR="C:\Users\20513\AppData\Roaming\GitHub CLI"`。
  （旧的 `env.BASH_ENV` → `~/.workbuddy/ib-env.sh` 方案 **2026-09-19 已证伪并删除**：`BASH_ENV` 会被宿主自己的安全
  运行时接管，用户设的值到不了子 shell。别再照它排查，细节见 `~/.workbuddy/MEMORY.md`「WorkBuddy 宿主的环境注入」。）
- ⚠️ **本账号在上游不是协作者，没有 triage 权限** ⇒ `--label` / `--add-label` 一定失败（`failed to update 1 issue`），
  **不要重试**，在记录里注明"由他那边打"。
- ⚠️ gh 偶发 `Bad credentials (401)`：先 `gh auth status` + 试一次读接口，**是偶发就直接重试**。
- 取上游源码**只用** `node _fetch_upstream.js <commit> --expect-sha <前缀>`，
  别裸 `curl`、别落工作区根目录（曾经因此留下一份 3.3 MB 未声明残留）。派子代理时把这条命令写进它的 prompt。

## 步骤

### 1. 核现状、定号
```
gh api repos/<上游>/commits/main --jq '.sha'                                   # head 是否已变
gh api "repos/<上游>/issues?state=all&per_page=5" --jq '.[] | "\(.number) [\(.state)] \(.title)"'
```
（issue 与 PR 共用号段，`issues?state=all` 拿到的最大号 +1 就是下一个号。）

### 2. 机械抽正文（**绝不手抄**）
草稿文件结构 = `头部备注` + 一行 `---` + `正文`。只发 `---` 之后的部分：
```js
const t=fs.readFileSync(draft,'utf8');
const lines=t.split('\n'); const i=lines.findIndex((l,n)=>n<80&&l.trim()==='---');
const body=lines.slice(i+1).join('\n');
fs.writeFileSync('_body_XX.md', body, 'utf8');
```
"与定稿逐字节一致"这句结论，就是这么来的 —— 抽出来的正文与原稿是**同一份字节**。

### 3. 发布前自检 —— 跑脚本，别现写
```
node _check_publish.js <草稿.md> [更多草稿.md]        # 自动按 --- 切出正文再查
node _check_docs.js                                    # 顺手查记录有没有自相矛盾
```
`_check_publish.js` 断言：占位符残留 / **双下划线残留（剔除完整占位符后的 `__`，防回填不完整）** / **字面 `\uXXXX`（GitHub 上传会转成控制字符脱符形式）** / 内部字样（自用补丁、镜像、IBSP、`v262-p`、探针页）/ 版本演进字样 / 第一人称 / 代码围栏成对 / mermaid 块数。**它必须通过才进提交闸门。**
（注意：`_noThink`、`_sumLastErrM`、`fix-r6` 这类**代码里真实存在的标识符不算内部字样** —— 它们本来就在 diff 里。）

### 3.5 上传前闸门（发送前最后一道，2026-10-18 补）

两个内容事故（占位符后缀残留、`\u001e` 被 GitHub 转成 `\^^`）都是**发后**回读才抓到的。把闸门提到发送前——对**即将上传的那个 `--body-file`**：

```
node _check_publish.js --body-only _body_XX.md   # 占位符未回填时，「占位符残留」一项在意料之中；其余必须零失败
head -1 _body_XX.md; tail -1 _body_XX.md                  # 首行＝标题或 refs 行；末行符合预期
```

### 4. 开 issue
```
gh issue create --repo <上游> --title "<标题>" --body-file _body_XX.md
```
（**不要带 `--label`**，见前置。发送前先过 §3.5 闸门。）

### 5. 开"参考实现"PR（仅当手上有实现）
- 先从**基线提交**建分支：`node _push_ref_branch.js <file> <分支名> <基线提交> "<提交说明>"`
  （走 blobs→trees→commits→POST /git/refs；**ref 已存在则报错退出，不覆盖**）。
  ⚠️ 本地 git 写不落盘，别用 `git push`。
- ⚠️ 推的必须是**剔掉镜像专用项**的那一版（`IB_PR=1 node _mk_summary_patch.js …` 生成：不改 `IB_VER`、不含探针页），
  且 **diff 里只应有 `index.html`**、不新增/删除文件。
- ```
  gh pr create --draft --repo <上游> --base main --head <我方账号>:<分支> --title "<标题>" --body-file _body_pr.md
  ```
  （发送前先过 §3.5 闸门。）
- 正文**开头一行** `refs #<issue号>`，两边时间线自动互链。正文里写明"方法搬进主线后这个 PR 可直接关掉，不必合并"。

### 6. 占位符怎么填（踩过三次坑）
- 占位符**只用一种写法**（建议 `#__ISSUE__`）。曾经同时出现 `#___` 与 `#__\_` 两种形态，
  精确字符串替换只命中一处 ⇒ **PR 带着占位符发了出去**，靠事后 `gh pr edit` 补救。
- **整串精确替换（split/join），禁用宽松正则** `/#_+/g`——它只匹配 `#__` 前缀，会把
  `refs #__ISSUE__` 换成 `refs #14ISSUE__`，字母后缀 `ISSUE__` 留在正文里（2026-10-18 实测：
  线上 issue 带病约两分钟，回读抓到后 `gh issue edit` 补救）。
- **复查搜占位符的字母后缀**：`grep ISSUE__`，或跑 `_check_publish.js`（它断言正文剔除完整
  占位符后出现 `__` 即 FAIL）——**不只搜 `#_+`**（没了 `#`，残留查不出来）。
- 正例：`body.split('refs #__ISSUE__').join('refs #14')`。

### 7. 回读核对（这一步才是"发完了"）
```
gh api repos/<上游>/issues/<n> > _raw.json          # 整 JSON 拉取；勿用 --jq 直出——控制字符会被转义，字节级比对不可靠（2026-10-18 实测）
gh api repos/<上游>/pulls/<n> --jq '.draft, .state, .head.label, .base.label'
gh api "repos/<上游>/issues/<issue号>/timeline?per_page=20"   # 应出现 cross-referenced ← PR
```
正文在 node 里 `JSON.parse(_raw.json).body` 取出，与回填稿 trim 后逐字节比对。
逐项断言：线上正文 trim 后 === 草稿正文 ；`我` = 0 ；PR `draft=true` ；时间线有互链。

### 8. 收口（要回答三件事，别只说"收口"）
**回不回评论 → 谁点关闭 → 关联 PR 怎么办**，三条路见 `docs\agents\upstream-issue-loop.md` §三：
**A** 回评论＋自行关闭 / **B** 只回评论 / **C** 只关不回。
- 开立者**本来就能关**自己的 issue（不需要写权限）⇒"要不要关"是选择，不是权限问题。
- **关联 PR 与 issue 同进同退**：参考实现 PR 在对应 issue 关闭时一并关掉。
- 关闭前同样**回读核对**线上内容。

### 9. 清理与记录
- 临时件用 **node `fs.unlinkSync`**（PowerShell `Remove-Item` 走安全删除必失败）；快照用
  `node _fetch_upstream.js --clean`。
- 同步：`spec.md`（「已外发」表 + 条目表 + 优先级决定表**三处都要改**）、复核清单 §〇、
  `.workbuddy/memory/YYYY-MM-DD.md`、`MEMORY.md` 的"我方条目进度"。
- 新增/退役脚本**必须登记进 `_工具与产物清单.md`**（§〇 四栏分类 ＋ §十 发布流水线）。
- 改完跑 `node _check_docs.js`：它会查编号重复/倒退、`refs` 指向不一致、尾部多余空行，
  并把"待批与已外发共存"作为提示列出来。

## 环境坑（本机特有）

> 全页（bash coreutils 缺失与 `env.PATH` 治本、`BASH_ENV` 已证伪、检索工具会漏）见 **`docs\agents\win-shell-env.md`**；下面只留外发这条流程最常撞到的几条。

- **PATH 的真根因**（2026-09-19 查清）：注入的 PATH 缺 PortableGit 的 `usr\bin` 与 `mingw64\bin`。现在由
  `~/.workbuddy/settings.json` 的 `env.PATH` 兜住 —— 值写成 `/usr/bin;/mingw64/bin;<PATH 快照>`：**POSIX 形式**让
  MSYS 根跟着运行中的 bash 走（与 PortableGit 版本号解耦），**分隔符必须用 `;`**（用 `:` 会让 node/gh/cmd 整条 PATH 失效）。
  ⚠️ **`BASH_ENV` 这条路不通、不要再试**：宿主用 `vendor\shim\...` 的 shim 接管它（`injectSafeDeleteEnv` /
  `buildShellRuntimeEnv` 只在"原本没有"时才设自己那份），而且那个官方 shim 第 3 行自己还要用 `dirname`、
  而 `dirname` 正缺在它要补的 PATH 上 ⇒ 那行永远报错。⛔ 别去关「安全中心 → 内置运行时」（与删除保护绑定）。
- PowerShell 工具**不回显 stdout** ⇒ 一律落盘再 Read；`>` 落盘是 UTF-16 ⇒ 用
  `[IO.File]::WriteAllText(p,($o|Out-String),[Text.UTF8Encoding]::new($false))`。
- node / grep 输出经 PS 管道**乱码**（PS 5.1 按 GBK 解码）；`node -e "...中文..."` 经 bash 易被引号吃掉
  ⇒ 写成 `.js`/`.md` 文件再执行更稳。
- `gh --jq` 的引号会被 shell 吃掉 ⇒ 取 JSON 后在 node 里解析。
