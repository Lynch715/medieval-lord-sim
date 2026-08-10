# 军团调动、驻防守城与并行征兵 · 设计文档

日期：2026-08-10
状态：已确认，待实现

## 一句话

让主力能在自有版图内自由调动、让「驻扎」真的参与守城、让六个兵种各自排一条征兵队列。

## 为什么现在改

三条都是同一个症结的不同侧面：**玩家对自己的军队缺少日常操作**。

- 主力打下一块地之后就钉死在那里，除非再打一仗才能挪窝
- 就算挪回自家城里，对 AI 反攻也没有任何影响 —— 「驻防」在机制上不存在
- 一次只能训练一个兵种，六种兵的编成实际上是「一种一种慢慢攒」

结果是：中盘之后玩家在两次出征之间**无事可做**，而战线又是脆的。这次改动补上这段空白。

## 现状

### 移动

`startMarch()`（`src/04-state.js:627`）的放行条件：

```js
(!longExpedition && !TERRITORY_DEFS[originId]?.adj.includes(destinationId))  // → return null
```

其中 `longExpedition = payload.battlePlan && 目标非玩家所有`。也就是说只有两条路径能走：

1. 目标与出发地**相邻**
2. 带着 `battlePlan` 去打**敌方**领地

UI 上更窄 —— `startMarch` / `startArmyGroupMarch` 的两个调用点（`src/06-ui.js:236`、`src/06-ui.js:254`）**都带 battlePlan**。因此**当前根本没有「单纯移动」这个操作**。

### 驻防

`resolveAIAttack()`（`src/05-war.js:473`）计算防御：

```js
defense = t.guard + walls*8 + watchtower*4 + stability*.2
```

玩家军团停在这块地上时，`defense` 一分不加。停一支满编主力和一个人不停，AI 的判定结果完全相同。

**连带的现存缺陷**：AI 夺回一块玩家领地时，站在那里的玩家军团不受任何影响 —— 它会继续待在已经易主的城里，`locationId` 指向敌方领地，没有任何代码处理这个状态。

### 征兵

`canRecruitUnit()`（`src/04-state.js:583`）用 `getRunningJob(s, \`recruit:${territoryId}\`)` 判占用，`queueRecruitment()` 用同一个 key 建任务。同一块地同时只能有一条训练线，其余兵种卡显示「训练队列占用」。

## 一、军团调动

### 放行规则

`startMarch()` 增加第三条路径：**目标是自有领地时，不要求相邻、不要求战斗计划**。

```js
const redeploy = !payload.battlePlan && s.territories[destinationId]?.owner === "player";
```

原判断改为 `!longExpedition && !redeploy && !adj.includes(destinationId)` 才拒绝。

其余前置条件一律不变：军团属于玩家、状态为 `idle`、目标 `playable !== false`、该军团没有在跑的 MARCH 任务。

### 时长与成本

- 时长走已有的 `marchDurationForDistance()`（按 `MAP_POINTS` 直线距离折算）
- **不消耗粮食**。调防是被动动作，再收补给等于惩罚防守；距离换来的等待时间本身已经是代价

### 状态机

调动产生的 MARCH 任务与出征的 MARCH 任务**结构完全一致**，只是 `payload` 里没有 `battlePlan`。因此：

- 在途状态、`army.status = "marching"`、`army.jobId` 的处理无需改动
- `applyCompletedJob()` 的 MARCH 分支已经能正确处理无 battlePlan 的情况（`src/02-core.js:461`），落地即 `idle`
- 存档、离线补算（`catchUpOffline`）、暂停恢复（`resumeWorld`）全部沿用现有逻辑，零改动

### 两个入口

**地图检视区** —— 选中自家领地时，在 `territorySummary()` 的 `ops` 区插入一块「调军来此驻防」：列出所有 `status === "idle"` 且 `locationId !== 当前地` 的玩家军团，每支一个按钮，标注兵力与预计行军时长。

```
调「渡鸦第一军团」来此驻防 · 48人 · 预计 2:15
```

**军队页军团卡** —— `armyCorpsHtml()` 里，对每支 `status === "idle"` 且不在 `primaryTerritoryId(s)` 的军团，加一个「调回渡鸦堡」按钮。这是最常用的那一步，不该逼玩家先切到地图页再找到渡鸦堡。

两处入口都走同一个新函数 `redeployArmy(s, armyId, destinationId, now)`：成功返回 MARCH 任务对象，任何前置条件不满足返回 `null`（与 `startMarch` 的约定一致，UI 据此弹提示）。UI 只负责取参数和刷新。战斗进行中按 `rejectDuringBattle(S)` 拒绝。

### 只做单军团

不做「合军调动」。合军（`startArmyGroupMarch`）是出征专用概念 —— 多支军团合成一场战斗会话。调动没有这个需求，两支军团各点一次即可。

## 二、驻扎即参与守城

这是唯一动到战斗模型的部分。

### 驻扎战力

新增 `stationedArmies(s, territoryId)`（放 `src/03-domain.js`，与其他军团查询函数为邻）：`owner === "player"`、`locationId === territoryId`、状态为 `idle` 或 `recovering` 的军团。行军中（`marching`）和交战中（`engaged`）不算 —— 它们不在这里。

新增 `stationedPower(s, territoryId)`，复用已有的 `aiArmyPower()`（该函数已按六兵种加权，见 `src/05-war.js:373`）。**它必须放在 `src/05-war.js`**：`aiArmyPower` 定义在 05，而项目规矩是前面的文件不得引用后面的文件，放进 03 就是反向依赖。它本来也是战斗模型的一部分，05 才是它的正确归属。同理，两个系数常量跟着放 05，与 `BATTLE_LOG_LIMIT`、`LEGITIMACY_DELTAS`、`CRISIS_LIMITS` 一样贴在使用处。

```js
STATIONED_DEFENSE_FACTOR = 0.8     // 野战部队守城，不如城墙好使
STATIONED_RECOVERING_FACTOR = 0.7  // 整补中的疲兵打七折

power = Σ aiArmyPower(army) × 0.8 × (army.status === "recovering" ? 0.7 : 1)
```

「整补中打七折」让「胜后整补 90 秒」第一次有了防守层面的意义 —— 刚打完硬仗的部队不会立刻变成铜墙铁壁。

### 并入防御

`resolveAIAttack()` 的 defense 式子追加一项：

```js
defense = t.guard + walls*8 + watchtower*4 + stability*.2 + stationedPower(s, targetId)
```

判定阈值（`attack > defense * 1.1`，突袭时 `* .92`）不变。

### 驻扎军团的伤亡

**打退了也要流血**，否则驻防是白嫖：

- **击退**（`repulsed` / `raided`）：驻扎军团合计损失 `max(1, round(驻扎总人数 × 0.04))`
- **城破**（`captured`）：合计损失 `max(1, round(驻扎总人数 × 0.18))`

损失按 `removeFromComposition()` 从各军团依次扣除（该函数已按兵种顺序扣，与战后结算同一套规则）。扣完调 `syncTroops(s)`。

**扣除顺序按军团在 `s.armies` 里的下标从小到大**，不按兵力或战力排序 —— 平衡模拟是确定性的，任何依赖运行期状态的排序都可能让两次运行产生不同结果。

### 城破后的撤离

城破时，幸存的驻扎军团**撤往最近的自有领地**并进入整补：

```js
target = ownTerritoryIds(s) 中 territoryDistance(失陷地, id) 最小的一个
army.locationId = target
startArmyRecovery(s, army, 90 * 1000)
```

**距离相同时取 `ownTerritoryIds(s)` 里靠前的那个** —— 该函数的返回顺序由 `TERRITORY_DEFS` 的键序决定，是确定的，模拟因此可复现。

若 `ownTerritoryIds(s)` 已空，军团留在原地不动 —— 那种情况下渡鸦堡已经失守，`resolveAIAttack` 里紧接着就会置 `s.ended`，游戏已经结束。

这一段同时修掉了前面提到的现存缺陷：军团不会再滞留在易主的敌城里。

### 显示

领地检视区在守军那一行后面追加驻防信息：

```
守军 34（+38 驻防） · 民心 52
驻防：渡鸦第一军团 48人
```

没有驻扎军团时不显示这一段。

### 平衡取向

满编主力驻守的城会变得**非常难打** —— 这是有意的。代价是主力不在前线推进，而摄政的加冕倒计时一直在走。「守家还是推进」因此成为一个真实的取舍，而不是只有一个正确答案。

`STATIONED_DEFENSE_FACTOR = 0.8` 是待校准的旋钮，见下文「平衡校准」。

## 三、征兵队列每兵种一条

### 占用判定

新增 `runningRecruitJob(s, territoryId, type)`，按**任务内容**而非 queueKey 匹配：

```js
job.status === "running" && job.type === "RECRUIT"
  && job.territoryId === territoryId && job.payload?.unitType === type
```

`canRecruitUnit()` 改用它。按内容匹配而非按 key 匹配，顺带解决了存档迁移问题：旧存档里在跑的 RECRUIT 任务 queueKey 还是 `recruit:${领地}`，按内容匹配一样能识别出来，不需要写迁移代码。

`queueRecruitment()` 的 queueKey 同步改成 `recruit:${territoryId}:${type}`，保持 key 与实际语义一致。

### UI

`armyRosterHtml()` 里，`recruitJob` 从「本领地唯一的那条任务」变成每张兵种卡各查一次。「训练队列占用」这个状态随之消失 —— 每张卡要么显示征募按钮，要么显示自己的倒计时。

### 征兵地点

不做「选择征兵城市」。`recruitmentTerritoryId()` 继续跟随主力所在地（主力待命且该地属于玩家时用主力所在地，否则用首都）—— 主力现在能自由调动，这条规则因此从「被动跟随」变成了**玩家可控**：想在哪练兵，就把主力调过去。这给调动功能又加了一层用途，也省掉一个选择器。

已在训练的任务带着自己的 `territoryId`，主力中途调走不影响 —— 兵在哪练成就编入哪里的驻军，完成日志已经写明了地点。

## 平衡校准

两处改动都会推动平衡，需要用 `tests/campaign-balance.sim.mjs` 对照基准：

**基准**：120 局确定性模拟中，机器人统一 46 局（38%）、法统旁落 66 局、经营崩溃 8 局，统一中位数第 46 季。

**预期方向**：

| 改动 | 预期影响 |
|---|---|
| 并行征兵 | 扩军明显加快（六种同时开工约 85 金 / 37 粮每 20 秒），推高统一率 |
| 驻防加成 | 玩家更不容易掉地，同时主力被牵制、推进变慢 —— 方向不确定 |
| 自由调动 | 机器人不会主动使用，影响接近于零 |

**判据**：统一率落在 30%–48% 区间内视为可接受。超出则按顺序调：先动 `STATIONED_DEFENSE_FACTOR`，再动征募量或兵种成本。**不改基准去迁就实现。**

## 测试

新建 `tests/army.test.mjs`：

| 断言 | 覆盖 |
|---|---|
| 调往不相邻的自有领地 → 放行，时长按距离 | 一 · 放行规则 |
| 调往敌方领地（无 battlePlan）→ 拒绝 | 一 · 放行规则 |
| 调动任务不扣粮 | 一 · 成本 |
| 非 idle 军团（marching / recovering）→ 拒绝 | 一 · 前置条件 |
| 驻扎军团使 `resolveAIAttack` 的防御提高 | 二 · 并入防御 |
| 同样的进攻，无驻军时城破、有驻军时被击退 | 二 · 效果 |
| 整补中的军团贡献低于待命军团 | 二 · 七折 |
| 击退后驻扎军团有伤亡 | 二 · 伤亡 |
| 城破后军团撤往最近自有领地并进入整补 | 二 · 撤离 |
| 六个兵种可同时排队，互不占用 | 三 · 队列 |
| 同一兵种重复排队 → 拒绝 | 三 · 队列 |
| 旧存档格式的 RECRUIT 任务仍能正确判占用 | 三 · 兼容 |

全套回归：`node --check` × 7、六个既有测试、平衡模拟、`build_single.py`。

## 落点清单

| 文件 | 改动 |
|---|---|
| `src/02-core.js` | 新增 `runningRecruitJob()`（与 `getRunningJob()` 为邻） |
| `src/03-domain.js` | 新增 `stationedArmies()` |
| `src/04-state.js` | `startMarch()` 放行 redeploy；新增 `redeployArmy()`；`canRecruitUnit()` 与 `queueRecruitment()` 改用按兵种的占用判定 |
| `src/05-war.js` | 新增 `STATIONED_DEFENSE_FACTOR` / `STATIONED_RECOVERING_FACTOR` 常量与 `stationedPower()`；`resolveAIAttack()` 并入驻扎战力、结算驻扎伤亡、城破后撤离 |
| `src/06-ui.js` | `territorySummary()` 加驻防信息与调动入口；`armyCorpsHtml()` 加「调回渡鸦堡」；`armyRosterHtml()` 改为每兵种独立倒计时；绑定新按钮 |
| `src/07-exports.js` | 导出 `redeployArmy`、`stationedArmies`、`stationedPower`、`runningRecruitJob` |
| `tests/army.test.mjs` | 新建 |
| `README.md` | 「已实现」补三条；「检查与封装」补 `tests/army.test.mjs` |

`sources.json` 无需改动 —— 没有新增源文件。

## 不做什么

- **合军调动** —— 合军是出征概念，调动逐支点即可
- **取消行军** —— `cancelJob()` 已支持 MARCH，但没有 UI。等有人真的需要再说
- **选择征兵城市** —— 主力调动已经覆盖了这个需求
- **驻军影响 `battleEstimate`** —— 那是算敌方城池的防御，与玩家驻防无关
- **AI 军团驻防加成** —— AI 只有一支军团且几乎总在移动，加了也看不出来；等 AI 有多军团再说
