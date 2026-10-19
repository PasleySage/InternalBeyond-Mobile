# 参考实现：缓存探针加强与消息上下文行

**目标仓库**：`Sui-IB/InternalBeyond-Mobile`（从本账号 fork 的分支提）
**形态**：参考实现 PR（`--draft`，正文首行 `refs #<issue号>`，**不请求合并**）
**基线**：上游 `040bf2a5` / 应用内 `v310-p`（2026-09-27）
**与镜像版差别**：PR 版不含镜像专用 `IB_VER` 后缀标记

---

## refs #（待填 issue 号）

机制写在 issue 里。本 PR 只放可对照的 diff，按修订项切开，供逐条搬进主线。

## 修订项

### 1. 缓存探针记录条数

`_ibOaiCacheDiagM` 落盘记录增加 `n`（本轮 `msgs.length`）与 `prevN`（上轮条数）；基线对象增加 `n`。

### 2. 缓存探针记录断点片段

比对出 ✗ 时，截取断点前后旧/新各约 48 字写入 `snipPrev` / `snipNow`。

### 3. 缓存探针文案输出

「缓存探针」本地指令展示条数；出 ✗ 时附「旧：…／新：…」片段。

### 4. 消息详情「上下文」行

- `genReply` 组包时计算 `ctxStat = {histN, histLim, sysChars}`
- `saveAi` 将 `ctxStat` 随消息入库
- `openMsgInfo` 在 Token 行下显示「N 条进历史 / 上限 M · system K 字」

## 不改什么

- 不改请求体、`prompt_cache_key`、缓存 TTL
- 不改历史窗口算法（`_apiHistSrcM` / `_cacheStableSliceM`）
- 不改摘要、记忆、tail 注入
- 老消息无 `ctxStat` 时该行不显示

## 自测

- 连发两条消息 → 详情出现「上下文」行，条数与发送历史一致
- 对水水说「缓存探针」→ 显示条数
- 构造一次前缀变化 → ✗ 行带旧/新片段
