# PR 正文（参考实现 · 与 issue 关联 · 待审）

**状态**：**已提交（2026-09-19）** —— PR **#9**（draft、不请求合并），对应 issue **#8**。线上正文与本地**逐字符一致**（已回读核对：「我」0 次，3 个折叠块 / 3 张图都在）。  
**形态**：与 issue 关联的"参考实现"PR。它不请求合并。已知 IB 按"修订单 + 单文件提交"落地，不直接合并 PR。用途是把**可对照的 diff** 挂在 issue 旁边：机制看 issue，改动看这里；issue 关闭时可以一并关掉。  
**目标仓库**：`Sui-IB/InternalBeyond-Mobile`（从本账号 fork 的分支提）  
**建议分支名**：`ref/mobile-presence-startup-wait`  
**PR 标题建议**：`在被导入端的TA主动开口前启动等待：参考实现（对应 issue #8）`  
**依据版本**：`1e2725b0`（V2.4.4）；`index.html` 3,304,065 B，sha256 `c16aca6e…30511`  
**⚠️ 号已填**：issue = **#8**、本 PR = **#9**（标题建议行、正文首行标题、`closes` 行、收口段说明各一处，均已替换）。

**内部备注（不随正文发出）**

- 改动以锚点形式维护：每处一个定位串与替换串，命中数不符即报错退出，便于按版本重放。
- 提交给上游的这份不含镜像专用项（版本标记那一处会跳过）。

---

# 主动开口的启动等待（对应 issue #8）

closes #8

### 改了什么

- 新增三个字段：开关、等待时长，以及起点模式。它们与既有的主动推送参数放在同一条手机端偏好记录里。
- 在那段巡检的判据之前加一道闸门；原生唤醒那条路径上也加了同一道，避免装了原生壳的场景绕过它。
- 设置界面在「定时推送」那一组里新增一个开关与两个下拉。
- 导入时对本端这三个字段做保全，导入完成后再写回。

### 没动什么

- 原有判据一条没改，只是前面多了一道闸门。有一处例外：等待期结束后的第一次机会不再掷随机概率，否则"等到点"会退化成"等到点再等几分钟"。
- 既有的开关语义与勿扰判断都不动，请求的构造也不改。
- 默认关闭，关掉时行为与现在完全一致。

### 验证状态

- 在 Android 端 Edge 上做了真机确认：等待期内不再主动开口；等待期结束后交回原有判据开口；等待期内用户发送消息照常收到回复；导入一份另一端的备份后，这个设置没有被抹掉。
- 等待时长与起点的各个档位各验过一次。
- 真机验证仍在进行中，更大范围的使用观察尚未完成。

**📸 实机截图**

<details>  
<summary>📸 点击查看：开关的位置（默认关闭）</summary>  
<br>  
<img width="556" height="998" alt="开关位置与相邻设置项" src="https://raw.githubusercontent.com/PasleySage/InternalBeyond-Mobile/shots/r7/01-switch-off.png" />  
</details>

<details>  
<summary>📸 点击查看：打开之后的两个下拉与说明</summary>  
<br>  
<img width="588" height="1170" alt="等待时长与起点模式" src="https://raw.githubusercontent.com/PasleySage/InternalBeyond-Mobile/shots/r7/02-opened.png" />  
</details>

<details>  
<summary>📸 点击查看：可选的等待时长档位</summary>  
<br>  
<img width="587" height="1056" alt="等待时长档位" src="https://raw.githubusercontent.com/PasleySage/InternalBeyond-Mobile/shots/r7/03-tiers.png" />  
</details>

### 收口方式

- 正文首行 `closes #8` 与 issue 互链；本 PR 为 draft，不请求合并。
- issue 关闭时可以一并关掉。
