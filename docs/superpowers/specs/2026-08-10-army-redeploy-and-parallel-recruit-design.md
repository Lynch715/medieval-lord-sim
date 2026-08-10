# 军团调动、驻防守城与并行征兵 · 设计文档

日期：2026-08-10
状态：已确认，待实现

## 一句话

先修掉「表单每 5 秒被渲染抹掉」这个 bug，再让主力能在自有版图内自由调动、让「驻扎」真的参与守城、让六个兵种各自排一条征兵队列。

## 为什么现在改

三条都是同一个症结的不同侧面：**玩家对自己的军队缺少日常操作**。

- 主力打下一块地之后就钉死在那里，除非再打一仗才能挪窝
- 就算挪回自家城里，对 AI 反攻也没有任何影响 —— 「驻防」在机制上不存在
- 一次只能训练一个兵种，六种兵的编成实际上是「一种一种慢慢攒」

结果是：中盘之后玩家在两次出征之间**无事可做**，而战线又是脆的。这次改动补上这段空白。

第零部分是另一回事 —— 它是玩家在报上面三条时顺带报出的 bug：组建第二军团填不进兵力。查下来是每 5 秒一次的全面板重建抹掉了表单状态。**它必须排在最前**：后三部分要往同样这两个面板加 UI，地基不修好，新加的东西会踩同一个坑。

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

## 零、修掉表单被渲染抹掉（先做）

### 症状与根因

玩家报告：组建第二军团时兵力填进去就变 0，新招募的骑士也选不上。

根因是**每 5 秒一次的全面板重建冲掉了只存在于 DOM 的表单状态**：

```
fireTimer(drift) 无条件 return true（04-state.js:773，间隔 5 秒）
  → advanceWorld 返回 steps: 1
  → updateWorldTime 见 steps 为真调 renderAll()（04-state.js:872）
  → panel.innerHTML 整块重写，表单按硬编码默认值重新生成
```

实测（隔离到只让 drift 到期，手动调一次 `updateWorldTime`）：

| 控件 | 触发前 | 一次 tick 后 |
|---|---|---|
| `[data-new-army-unit]` × 6 | `12,4,2,0,0,0` | `0,0,0,0,0,0` |
| `#newArmyName` | 黑棘骑士团 | 第二军团 |
| `#newArmyCommander` | knight_2 | knight_1 |

**骑士列表本身没有 bug。** 新招募的骑士 `side="player"`、`status="active"`，`activeKnights()` 与 `canUseCommander()` 都正常，它确实在下拉框里 —— 只是 `<select>` 渲染时不带 `selected`，5 秒内被打回第一项。最后提交时兵力已归零，`createArmyFromMain()` 返回 false，toast 又同时提到「兵力、指挥官」，于是看起来像两个毛病。

### 波及范围

两个表单，同一个根因：

1. **组建军团**（`armyCorpsHtml`）—— `#newArmyName`、`#newArmyCommander`、`[data-new-army-unit]` × 6
2. **地图出征配置**（`castleExpeditionHtml`）—— `[data-expedition-army]` 勾选框、`[data-expedition-plan]`、`[data-expedition-grain]`。**这个没被报告，但它在核心循环里**：勾选每 5 秒回到「只勾第一支」，携带粮食回到最低值

### 修法：沿用 `foldState` 的既定做法

这个项目已经为 `<details>` 折叠解决过同一类问题。`02-core.js:15` 的注释就是在讲这个坑：

> 必须存在渲染之外 —— 每次建造或研究都会 renderAll() 重建整个面板，
> 状态若只留在 DOM 上，玩家一点建造，刚展开的那块地就自己合上了。

当初只应用到了折叠，没应用到表单。照同一个形状加一个模块级 `uiDraft`，放 `src/02-core.js` 紧挨 `foldState`：

```js
const uiDraft = {
  newArmy:    { name: "第二军团", commanderId: null, units: {} },
  expedition: { targetId: null, armyIds: null, plan: null, grain: null }
};
```

**不进存档**，与 `foldState` 同理：这是「界面上填了什么」，不是游戏进度，不该占存档字段、也不该有迁移。

模板从 `uiDraft` 取值（number input 的 `value`、option 的 `selected`、checkbox 的 `checked`），控件的 `input` / `change` 事件写回 `uiDraft`。提交成功后清回默认值。

### 读取时必须夹取

草稿是上一秒的意图，世界这一秒可能已经变了。**渲染时一律按当前真实状态夹取，不能直接信草稿**：

| 情况 | 处理 |
|---|---|
| 某兵种草稿数 > 主军现有数（打完仗掉了兵） | 夹到现有数 |
| `commanderId` 指向的骑士已阵亡 / 已带别的军团 | 回退到选项列表第一项 |
| `expedition.armyIds` 里的军团已不是 `idle` | 剔除；全空则回退到「勾选第一支合格军团」 |
| `expedition.grain` 低于本次所需 / 高于现有存粮 | 夹进 `[所需, 现有存粮]` |
| `expedition.targetId` 与当前查看的目标不同 | 整块草稿视为过期，用默认值 |

不夹取的话，主力打完仗掉了兵，草稿里的旧数字会变成一次非法提交。

### 为什么不用别的办法

- **通用地在 renderAll 前后快照/还原 DOM 值** —— 代码更少，还能顺带覆盖以后新增的表单，但它会把「过期草稿」原样塞回去，上面那张夹取表里的每一种情况都会变成静默的非法提交
- **降低渲染频率 / 表单获得焦点时跳过渲染** —— 只是让它更罕见，没有消除；而且 drift 改的守军与破坏度确实要显示，不渲染是另一个 bug
- **把草稿存进 `S`** —— 会污染存档并需要迁移，`foldState` 当初就是为了避免这个才放在运行时

### 可测性

`armyCorpsHtml()` 与 `castleExpeditionHtml()` 都只返回字符串、不碰 DOM，导出后可以直接在 Node 里断言渲染结果。这是选这个方案而不是 DOM 快照方案的另一个理由 —— 后者只能靠浏览器验证。

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
| 草稿设了兵力后，`armyCorpsHtml()` 渲染出 `value="12"` 而非 `value="0"` | 零 · 草稿存活 |
| 草稿的 `commanderId` 在渲染结果里带 `selected` | 零 · 草稿存活 |
| 草稿兵力超过主军现有数 → 渲染值被夹到现有数 | 零 · 夹取 |
| 草稿指向的骑士已不可选 → 回退到第一项，不产出无效 `selected` | 零 · 夹取 |
| 出征草稿的 `targetId` 与当前目标不符 → 用默认值 | 零 · 夹取 |
| 出征草稿里已非 idle 的军团被剔除 | 零 · 夹取 |
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
| `src/02-core.js` | 新增 `uiDraft`（紧挨 `foldState`）；新增 `runningRecruitJob()`（与 `getRunningJob()` 为邻） |
| `src/03-domain.js` | 新增 `stationedArmies()` |
| `src/04-state.js` | `startMarch()` 放行 redeploy；新增 `redeployArmy()`；`canRecruitUnit()` 与 `queueRecruitment()` 改用按兵种的占用判定 |
| `src/05-war.js` | 新增 `STATIONED_DEFENSE_FACTOR` / `STATIONED_RECOVERING_FACTOR` 常量与 `stationedPower()`；`resolveAIAttack()` 并入驻扎战力、结算驻扎伤亡、城破后撤离 |
| `src/06-ui.js` | `armyCorpsHtml()` / `castleExpeditionHtml()` 改为读写 `uiDraft` 并夹取；`territorySummary()` 加驻防信息与调动入口；`armyCorpsHtml()` 加「调回渡鸦堡」；`armyRosterHtml()` 改为每兵种独立倒计时；绑定新按钮与草稿事件 |
| `src/07-exports.js` | 导出 `uiDraft`、`armyCorpsHtml`、`castleExpeditionHtml`、`redeployArmy`、`stationedArmies`、`stationedPower`、`runningRecruitJob` |
| `tests/army.test.mjs` | 新建 |
| `README.md` | 「已实现」补三条；「检查与封装」补 `tests/army.test.mjs` |

`sources.json` 无需改动 —— 没有新增源文件。

## 不做什么

- **合军调动** —— 合军是出征概念，调动逐支点即可
- **取消行军** —— `cancelJob()` 已支持 MARCH，但没有 UI。等有人真的需要再说
- **选择征兵城市** —— 主力调动已经覆盖了这个需求
- **驻军影响 `battleEstimate`** —— 那是算敌方城池的防御，与玩家驻防无关
- **AI 军团驻防加成** —— AI 只有一支军团且几乎总在移动，加了也看不出来；等 AI 有多军团再说
- **删掉 `data-castle-launch` 死代码** —— 调查第零部分时发现 `renderMap()` 里 `[data-castle-launch]` 那整个处理器（`src/06-ui.js:221-241`）绑定的 `data-castle-unit` / `data-castle-knight` / `data-castle-plan` / `data-castle-grain` 在任何模板里都不存在，是旧城堡出征 UI 被 `castleExpeditionHtml()` 取代后忘了删的残留。已单独开任务，不混进这轮改动
