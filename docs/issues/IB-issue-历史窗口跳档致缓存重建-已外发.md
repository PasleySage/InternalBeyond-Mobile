# 历史窗口按固定步长前移，导致提示缓存周期性整段重建

**目标仓库**：`Sui-IB/InternalBeyond-Mobile`（issue）
**形态**：只报不改，不附参考实现
**基线**：上游 `040bf2a5`（2026-09-27）

---

## 定位

两处取窗逻辑共用同一个步长公式，是前缀变化的直接来源：

`_cacheStableSliceM`（约 8555 行）

```js
function _cacheStableSliceM(list, keepCount) {
  keepCount = Math.max(1, keepCount | 0);
  const total = (list && list.length) || 0;
  if (total <= keepCount) return (list || []).slice();
  const step = Math.max(6, Math.min(24, Math.ceil(keepCount / 2)));
  const start = Math.floor((total - keepCount) / step) * step;
  return list.slice(start);
}
```

`_apiHistSrcM`（约 4312 行）用同一 `step` 决定条数：

```js
const step = Math.max(6, Math.min(24, Math.ceil(keep / 2)));
// …
const n = total <= keep ? out.length : Math.min(out.length, keep + ((total - keep) % step));
```

调用点在组包路径（约 9505 行起）：`_histLim` 由 `pa.histLimit` 决定，再交给上述两函数取历史窗口。

## 机制

当 `histLimit` 较大（例如 999）时，`Math.ceil(keepCount / 2)` 远超 24，`step` 被封顶为 **24**。

此后每新增一条消息，`total - keepCount` 递增；其对 24 取余的余数从 23 归零时：

- 窗口起点 `start` 一次向前跳 24，
- 窗口内条数从 `keep + 23` 收缩为 `keep`（`_apiHistSrcM` 的 `n`），
- 即最旧约 23 条被挤出，尾部再并入 1 条新消息，**净减约 22 条**。

对提示缓存而言，system 块保持不变，但**历史前缀从第一条起整体更换**。缓存按最长公共前缀命中，前缀在历史开头分叉 ⇒ system 之后的全部内容重新计费为未缓存输入，表现为「缓存读」从十几万掉到数千。

这是取窗算法的确定性行为，不是偶发的数据异常。`histLimit` 越接近「全部」，越容易长期停留在 `step = 24` 这一档，跳档会按约 24 条消息一次的节奏反复发生。

## 触发条件

1. 上下文消息条数设为较大值（实测环境为「全部 / 999」）。
2. 与同一角色的连续对话中，该角色的原始消息条数超过 `histLimit`。
3. 此后约每新增 24 条消息，窗口越过一个步长边界。

满足以上三条时，不需要改人设、不需要动协议开关、不需要更新版本，就会出现一次缓存重建。缩短 `histLimit` 只能拉长跳档间隔，不能消除；`step` 在 `keepCount > 48` 时恒为 24。

## 现象

观察环境：Android 端 Edge（PWA），服务商 DeepSeek，模型 deepseek-flash。

连续对话中，「缓存读」周期性从约 12.9 万掉到 **7424** 左右，「输入未缓存」同步冲到 12 万以上；下一轮又恢复到 12 万量级的缓存命中。单日 44 条请求记录里出现 4 次同签名断档，间隔均为约 12–13 次请求（约 24 条消息）。

断档后仍稳定命中的约 7424 token，与 system 块（约 1.7 万字符）的分词量级吻合，说明命中的是 system 之前与 system 本身，变化点落在历史开头。

## 验证状态

- 机制层：以上游基线源码为准，步长公式与窗口收缩行为由代码直接推出，未做二次改写。
- 计量层：用服务商侧的 token 明细（按请求的未缓存输入 / 缓存读）与上述机制对照，4 次断档的残留缓存值一致、净减条数与公式一致、间隔与 24 条步长一致。
- 探针层：应用内缓存前缀比对在同日 13:11 左右记录到断点落在 system 尾之后、历史首条内容更换，与计量结果同构。
- 真机操作序列仍在整理中；目前完成的是代码机制核对与生产用量对照。

## 没动什么

- 未修改历史窗口算法、请求体与缓存策略。
- 未向远端推送任何提交；对比用的源码为上游基线原样快照。
- 本地诊断展示字段与本 issue 描述的取窗机制无关，也不改变上述行为。

以上是抛砖引玉，若有发布节奏上的考虑，或打算换一种取窗策略，都请随意安排💗。
