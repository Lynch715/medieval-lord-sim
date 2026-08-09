# P1b 连续化与加冕倒计时 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仍然「每季跳一次」的量改成按秒连续变化，并用公爵加冕倒计时取代与玩家进度无关的 48 季硬停。

**Architecture:** 连续量写进 `accrueTo(s, at)`（它已经知道 deltaMs 且幂等）；整数量（守军、破坏度）走 `drift` 计时器并用浮点累加器攒够 1 再落地，保证确定性。加冕时刻记在**游戏时间** `elapsedMs` 上而非真实时间，这样暂停与离线都不会让公爵偷跑。

**Tech Stack:** 纯 ES2022 浏览器脚本（`app.js`，无构建、无框架），Node 内置 `assert` 跑测试，`python3 build_single.py` 打包单文件版。

**⚠️ 任务顺序不可调换：** Task 5（开城条件）必须在 Task 6（加冕倒计时）之前完成。当前胜利不可达（0/120 局统一）；先加硬截止再改开城条件，会让游戏在中间状态**必输**。

**基线：** HEAD 为 `697c452`（P1a 完成），五套测试全绿。

---

### Task 1: 知识与训练衰减改为按秒累积

**Files:**
- Modify: `app.js`（`accrueTo`、`settleSeasonEconomy`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log("clock tests passed");` 之前）：

```js
// 知识不再是季界一次性到账，而是按秒累积
const kn = game.createInitialState("知识连续", "oath", "standard");
const knBase = kn.clock.lastProcessedAt;
const knStart = kn.knowledge;
game.accrueTo(kn, knBase + SEASON / 2);
assert.ok(kn.knowledge > knStart, "半季后知识应已增长，而不是等到季界");
const halfGain = kn.knowledge - knStart;
game.accrueTo(kn, knBase + SEASON);
const fullGain = kn.knowledge - knStart;
assert.ok(Math.abs(fullGain - halfGain * 2) < 0.01, `整季增量应约为半季的两倍，实际 ${halfGain} → ${fullGain}`);
// 一整季的总量应与原本的每季固定值一致（开局无学宫、无驿站道路 → 每季 3）
assert.ok(Math.abs(fullGain - 3) < 0.01, `开局每季知识应为 3，实际 ${fullGain.toFixed(3)}`);

// 仓储损耗早已是连续的：forecast 的 netGrain 已经减去了 spoilage，
// 而 grainPerSecond = netGrain / 季长。这里锁死它不得被重复扣第二次。
const sp = game.createInitialState("损耗不重复扣", "oath", "standard");
const spBase = sp.clock.lastProcessedAt;
const spFlow = game.resourceFlow(sp);
const spStart = sp.grain;
game.accrueTo(sp, spBase + 10000);
const actual = sp.grain - spStart;
const expected = spFlow.grainPerSecond * 10;
assert.ok(Math.abs(actual - expected) < 1e-6,
  `粮食增量应恰好等于 grainPerSecond×秒数（损耗已含在其中），预期 ${expected.toFixed(4)} 实际 ${actual.toFixed(4)}`);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `半季后知识应已增长，而不是等到季界`

- [ ] **Step 3: 把三个量搬进 accrueTo**

把 `accrueTo` 替换为：

```js
// 累积到某个绝对时刻，而非累积一段时长——这样重复调用天然幂等，
// 在线逐帧推进与离线一次性补算才可能得到完全相同的结果。
function accrueTo(s, at) {
  if (!s?.clock) return 0;
  const from = s.clock.lastProcessedAt;
  if (!Number.isFinite(at) || !(at > from)) return 0;
  const deltaMs = at - from;
  const seconds = deltaMs / 1000;
  const seasonSeconds = TIME_CONFIG.seasonDurationMs / 1000;
  const flow = resourceFlow(s, seasonOf(s));
  s.gold += flow.goldPerSecond * seconds;
  s.grain += flow.grainPerSecond * seconds;

  // 知识：原本每季一次性 +（3 + 学宫总等级 + 驿站道路×2），改为按秒摊开
  const academyLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.academy || 0), 0);
  s.knowledge = (s.knowledge || 0) + (3 + academyLevels + techLevel(s, "relay_roads") * 2) * seconds / seasonSeconds;


  // 训练度衰减
  const decayPerSeason = Math.max(0, 2 - Math.ceil(techLevel(s, "field_doctrine") / 2));
  s.training = Math.max(0, (s.training || 0) - decayPerSeason * seconds / seasonSeconds);

  s.clock.elapsedMs += deltaMs;
  s.clock.lastProcessedAt = at;
  return seconds;
}
```

从 `settleSeasonEconomy` 中**删除**知识那两行（职责已搬走）：

```js
  // 删除：const academyLevels = ...
  // 删除：s.knowledge = Math.max(0, Math.round(...));
```

**不要动仓储损耗。** `forecast` 的 `netGrain` 已经减去了 `spoilage`，而 `grainPerSecond = netGrain / 季长` —— 损耗本来就是按秒扣的。再在 `accrueTo` 里扣一次就是重复计算。季界那条损耗日志保留，它只是把这一季渗漏掉的量报给玩家看。

从 `fireTimer` 的 season 分支中**删除**训练衰减那一行：

```js
    // 删除：s.training = Math.max(0, s.training - Math.max(0, 2 - Math.ceil(techLevel(s, "field_doctrine") / 2)));
```

`renderTop` 与总览面板显示知识时用 `Math.floor(S.knowledge)`，避免出现小数。定位 `researchPanelHtml` 里的 `Math.round(S.knowledge || 0)`，改为 `Math.floor(S.knowledge || 0)`。`canResearch` 里 `s.knowledge >= cost.knowledge` 无需改动（浮点比较正确）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS。步进等价性测试必须仍然通过——若失败说明新加的连续量在边界上重复结算了。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1b: 知识与训练衰减改为按秒连续变化"
```

---

### Task 2: drift 计时器接管守军、破坏度与稳定度

**Files:**
- Modify: `app.js`（`TIMER_DEFS`、`fireTimer`、`settleSeasonEconomy`、`createInitialState`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// drift 计时器让守军平滑恢复，而不是季界跳一次
assert.equal(game.TIMER_DEFS.drift.intervalMs, 5000);
const dr = game.createInitialState("漂移", "oath", "standard");
const drBase = dr.clock.lastProcessedAt;
const home = dr.territories.ravenstone;
home.stability = 80;                 // 满足恢复条件
home.guard = 10;                     // 远低于上限
const guardStart = home.guard;
// 推进一整季，守军恢复量应与原本每季 +1 一致
game.advanceWorld(dr, drBase + SEASON, { rng: () => .99 });
assert.ok(home.guard > guardStart, "一季内守军应有恢复");
assert.ok(home.guard - guardStart <= 2, `一季恢复量不应远超原本的每季 +1，实际 +${home.guard - guardStart}`);
assert.equal(home.guard, Math.round(home.guard), "守军必须保持整数");

// 破坏度也随时间消退
const dv = game.createInitialState("破坏度", "oath", "standard");
const dvBase = dv.clock.lastProcessedAt;
dv.territories.ravenstone.devastated = 3;
game.advanceWorld(dv, dvBase + SEASON * 2, { rng: () => .99 });
assert.ok(dv.territories.ravenstone.devastated < 3, "破坏度应随时间消退");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `game.TIMER_DEFS.drift` 为 undefined

- [ ] **Step 3: 加入 drift 计时器**

在 `TIMER_DEFS` 中追加（放在 `events` 之后）：

```js
  drift:   { intervalMs: 5 * 1000, offline: true }
```

在 `fireTimer` 中，在 `if (key === "events")` 之前插入 drift 分支：

```js
  if (key === "drift") { applyDrift(s, def.intervalMs); return true; }
```

在 `fireTimer` **之前**新增漂移函数：

```js
// 守军与破坏度是整数量，无法按秒平滑增长，因此用浮点累加器攒够 1 再落地。
// 这样长期速率与原本的「每季 +1」一致，同时保持确定性（不掷骰子）。
function applyDrift(s, intervalMs) {
  const share = intervalMs / TIME_CONFIG.seasonDurationMs;
  const bump = (t, key, perSeason) => {
    if (perSeason === 0) return 0;
    t.drift ||= {};
    t.drift[key] = (t.drift[key] || 0) + perSeason * share;
    const whole = Math.trunc(t.drift[key]);
    if (whole !== 0) t.drift[key] -= whole;
    return whole;
  };
  ownTerritoryIds(s).forEach(id => {
    const t = s.territories[id];
    const guardCap = TERRITORY_DEFS[id].guard + t.buildings.barracks * 7 + t.buildings.walls * 5 + t.buildings.watchtower * 4;
    if (t.devastated > 0) t.devastated = Math.max(0, t.devastated + bump(t, "devastated", -1));
    if (t.stability >= 65 && t.guard < guardCap) t.guard = Math.min(guardCap, t.guard + bump(t, "guard", 1));
  });
  Object.keys(s.territories).filter(id => s.territories[id].owner !== "player").forEach(id => {
    const t = s.territories[id];
    const normalRecovery = Math.min(4, 2 + Math.floor(turnOf(s) / 12));
    const perSeason = t.devastated > 0 ? 1 : Math.max(1, normalRecovery - techLevel(s, "blockade"));
    t.guard = Math.min(enemyGuardCap(s, id), t.guard + bump(t, "guard", perSeason));
    if (t.devastated > 0) t.devastated = Math.max(0, t.devastated + bump(t, "devastated", -1));
  });
}
```

从 `settleSeasonEconomy` 中**删除**两个 forEach 块（守军恢复与破坏度递减，职责已搬到 drift）：

```js
  // 删除：ownTerritoryIds(s).forEach(id => { ...guardCap... });
  // 删除：Object.keys(s.territories).filter(id => ... !== "player").forEach(id => { ...recovery... });
```

在 `createInitialState` 的领地初始化对象里追加一行，给累加器一个明确的初值：

```js
      drift: { guard: 0, devastated: 0 },
```

把 `applyDrift` 加入 `module.exports`。

**刻意不做的事：** 设计文档提到「民心与稳定度向各自基线缓慢回归」。现有代码里**没有**这种回归行为，加它属于新增玩法而非把既有行为连续化，会在没有基线的情况下改变平衡。本阶段只搬运既有行为，回归留到 P4 配平时连同数值一起设计。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1b: drift 计时器接管守军与破坏度，用浮点累加器保持整数与确定性"
```

---

### Task 3: 危机判定改为按持续时长

**Files:**
- Modify: `app.js`（`checkDefeat`、`accrueTo`、`createInitialState`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// 危机按持续时长判定，玩家有机会实时补救，而不是等季界宣判
const cr = game.createInitialState("危机", "oath", "standard");
assert.deepEqual(Object.keys(cr.crisis).sort(), ["famineMs", "unrestMs"], "危机改为毫秒累计");
const crBase = cr.clock.lastProcessedAt;
cr.grain = 0;
// 撑住 10 分钟还不该崩
game.accrueTo(cr, crBase + 10 * 60 * 1000);
cr.grain = 0;
game.checkDefeat(cr);
assert.equal(cr.ended, false, "饥荒 10 分钟不应立即崩溃");
assert.ok(cr.crisis.famineMs > 0, "饥荒时长应在累计");
// 补上粮食后计时清零
cr.grain = 500;
game.accrueTo(cr, crBase + 11 * 60 * 1000);
assert.equal(cr.crisis.famineMs, 0, "粮食补上后饥荒计时应清零");

// 持续 15 分钟才崩溃
const cr2 = game.createInitialState("饥荒崩溃", "oath", "standard");
cr2.crisis.famineMs = 15 * 60 * 1000;
cr2.grain = 0;
game.checkDefeat(cr2);
assert.equal(cr2.ended, true);
assert.equal(cr2.endingReason, "collapsed");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `危机改为毫秒累计`

- [ ] **Step 3: 实现连续危机**

在 `createInitialState` 的 state 字面量里把
```js
    crisis: { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 },
```
改为
```js
    crisis: { famineMs: 0, unrestMs: 0 },
```

在 `accrueTo` 里，紧接训练度衰减之后、`s.clock.elapsedMs += deltaMs;` 之前插入：

```js
  // 危机按持续时长累计：条件成立就攒时间，一旦解除立刻清零。
  // 玩家因此能实时补救，而不是眼睁睁等季界宣判。
  s.crisis ||= { famineMs: 0, unrestMs: 0 };
  s.crisis.famineMs = s.grain <= 0 ? s.crisis.famineMs + deltaMs : 0;
  s.crisis.unrestMs = s.support < 12 ? s.crisis.unrestMs + deltaMs : 0;
```

把 `checkDefeat` 替换为：

```js
const CRISIS_LIMITS = { famineMs: 15 * 60 * 1000, unrestMs: 10 * 60 * 1000 };

function checkDefeat(s) {
  if (s.ended) return true;
  if (!owns(s, "ravenstone")) { s.ended = true; s.endingReason = "fallen"; return true; }
  s.crisis ||= { famineMs: 0, unrestMs: 0 };
  const starved = (s.crisis.famineMs || 0) >= CRISIS_LIMITS.famineMs;
  const revolted = (s.crisis.unrestMs || 0) >= CRISIS_LIMITS.unrestMs;
  if (starved || revolted || (armyTotal(s) <= 0 && s.morale < 10)) {
    s.ended = true;
    s.endingReason = "collapsed";
    return true;
  }
  return false;
}
```

`checkDefeat` 现在很便宜且无副作用，改为在 `advanceWorld` 收尾处与 `checkCampaignEnd` 一起调用，而不是只在 season 分支里调用。在 `advanceWorld` 中把
```js
  checkCampaignEnd(s);
```
改为
```js
  if (!options.offline) checkDefeat(s);
  checkCampaignEnd(s);
```
并从 `fireTimer` 的 season 分支里删除 `checkDefeat(s);`（保留 `queueSeasonEvents(s);`）。

把 `CRISIS_LIMITS` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS。**留意平衡模拟的崩溃局数是否变化并记录**——连续判定通常会让崩溃更容易触发。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1b: 危机改为按持续时长判定，饥荒 15 分钟、民乱 10 分钟"
```

---

### Task 4: 研究队列开放并发

**Files:**
- Modify: `app.js`（`researchQueueJob`、`canResearch`、`queueResearch`、`researchPanelHtml`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// 研究并发数 = 1 + 学宫总等级 / 5
const rs = game.createInitialState("研究并发", "oath", "standard");
rs.gold = 5000; rs.knowledge = 5000;
assert.equal(game.researchCapacity(rs), 1, "开局无学宫，只有一条研究队列");
assert.ok(game.queueResearch(rs, "agriculture", "heavy_plow", 1000), "第一项研究应可开始");
assert.equal(game.queueResearch(rs, "military", "refined_iron", 1000), null, "容量为 1 时第二项应被拒绝");

// 学宫升到 5 级后可并发两项
const rs2 = game.createInitialState("研究并发2", "oath", "standard");
rs2.gold = 5000; rs2.knowledge = 5000;
rs2.territories.ravenstone.buildings.academy = 5;
assert.equal(game.researchCapacity(rs2), 2, "学宫总等级 5 应给到 2 条队列");
assert.ok(game.queueResearch(rs2, "agriculture", "heavy_plow", 1000));
assert.ok(game.queueResearch(rs2, "military", "refined_iron", 1000), "第二项应可并发");
assert.equal(game.queueResearch(rs2, "commerce", "coinage", 1000), null, "超出容量应被拒绝");
// 两项各自独立完成
const jobs = rs2.jobs.filter(j => j.status === "running" && j.type === "RESEARCH");
assert.equal(jobs.length, 2);
assert.equal(new Set(jobs.map(j => j.queueKey)).size, 2, "并发研究必须各自占用不同的队列键");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `game.researchCapacity is not a function`

- [ ] **Step 3: 实现并发**

把 `researchQueueJob` 替换为：

```js
// 「扩容队列」本身是一个成长目标：学宫每 5 级多开一条研究线。
function researchCapacity(s) {
  const academyLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.academy || 0), 0);
  return 1 + Math.floor(academyLevels / 5);
}

function runningResearchJobs(s) {
  return (s?.jobs || []).filter(job => job.status === "running" && job.type === "RESEARCH");
}

function researchQueueJob(s, techId = null) {
  const jobs = runningResearchJobs(s);
  return (techId ? jobs.find(job => job.payload?.techId === techId) : jobs[0]) || null;
}
```

在 `canResearch` 中把
```js
  if (!tech || !branchState || currentLevel >= techMaxLevel(tech) || researchQueueJob(s)) return false;
```
改为
```js
  if (!tech || !branchState || currentLevel >= techMaxLevel(tech)) return false;
  if (researchQueueJob(s, techId)) return false;                       // 同一项不能重复排队
  if (runningResearchJobs(s).length >= researchCapacity(s)) return false;
```

在 `queueResearch` 中把 `queueKey: "research:global"` 改为 `` queueKey: `research:${techId}` ``。

在 `researchPanelHtml` 中，把顶部说明里的「全局仅限一个研究队列」改为动态显示：

```js
`当前知识 ${Math.floor(S.knowledge || 0)} · 研究队列 ${runningResearchJobs(S).length}/${researchCapacity(S)} · 每项科技三阶`
```

并把每张科技卡里判断「研究队列占用」的逻辑改为按容量判断。定位 `const queue = researchQueueJob(S);` 与其后的 `active` / `label` / `disabled` 计算，替换为：

```js
  const running = runningResearchJobs(S);
  const atCapacity = running.length >= researchCapacity(S);
```

在每张卡内部：

```js
    const queue = researchQueueJob(S, tech.id);
    const active = !!queue;
    ...
    const label = currentLevel >= maxLevel ? `已满阶 · ${currentLevel}/${maxLevel}`
      : active ? `研究中 · ${nextLevel}/${maxLevel} · ${formatDuration(getJobRemainingMs(queue))}`
      : atCapacity ? "研究队列已满"
      : unmet.length ? `需要：${unmet.map(id => techDefinition(branch, id)?.name || id).join("、")}`
      : !affordable ? "知识或金币不足"
      : `研究 ${nextLevel}/${maxLevel} · ${cost.knowledge}知 · ${cost.gold}金 · ${formatDuration(duration)}`;
    const disabled = currentLevel >= maxLevel || active || atCapacity || unmet.length > 0 || !affordable;
```

把 `researchCapacity`、`runningResearchJobs` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

`tests/structure.test.mjs` 里有一段连续排三次 `heavy_plow` 的测试，它依赖「同一项科技完成后才能排下一阶」，容量改动不影响它；若报错请检查是否误改了「同一项不能重复排队」这条。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1b: 研究队列开放并发，学宫每 5 级多开一条"
```

---

### Task 5: 王冠谷开城条件改为控制公爵三块直辖地

**Files:**
- Modify: `app.js`（`crownRequirements`、`crownRequirementText`）
- Modify: `tests/lords.test.mjs`

**必须先于 Task 6 完成。** 当前胜利不可达；先加加冕硬截止会让游戏必输。

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log("lords tests passed");` 之前）：

```js
// 开城条件：先拔掉公爵的三块直辖地，而不是凑够任意数量的领地
const cw = game.createInitialState("开城条件", "oath", "standard");
cw.renown = 100;
cw.tech.military.levels = { refined_iron: 1, longbow: 1, war_engineering: 1 };
cw.tech.military.completed = ["refined_iron", "longbow", "war_engineering"];
cw.armies[0].composition = { levy: 90, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 };
game.syncTroops(cw);
assert.equal(game.crownAccessMet(cw), false, "尚未拿下公爵直辖地时不应开城");
assert.ok(game.crownRequirementText(cw).includes("公爵"), `提示应点明缺的是公爵直辖地，实际：${game.crownRequirementText(cw)}`);

["duchyroad", "crownfield", "kingsford"].forEach(id => { cw.territories[id].owner = "player"; cw.territories[id].lordId = null; });
assert.equal(game.crownAccessMet(cw), true, "三块直辖地到手后应开城");

// 单缺一块就不行
const cw2 = JSON.parse(JSON.stringify(cw));
cw2.territories.kingsford.owner = "crown";
assert.equal(game.crownAccessMet(cw2), false, "缺任意一块直辖地都不应开城");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `尚未拿下公爵直辖地时不应开城`（旧条件按领地数判定）

- [ ] **Step 3: 改写开城条件**

把 `crownRequirements` 与 `crownRequirementText` 替换为：

```js
// 公爵的三块直辖地。用「先拔掉他的屏障」取代任意的数量门槛：
// 叙事上成立，可达性明确，而且与加冕推迟机制指向同一批目标。
const DUCHY_HOLDINGS = ["duchyroad", "crownfield", "kingsford"];

function crownRequirements(s) {
  return {
    duchy: DUCHY_HOLDINGS.every(id => owns(s, id)),
    renown: (s?.renown || 0) >= 60,
    siege: techCompleted(s, "war_engineering"),
    army: armyTotal(s, "army_1") >= 80
  };
}

function crownRequirementText(s) {
  const requirements = crownRequirements(s);
  const missing = [];
  if (!requirements.duchy) {
    const left = DUCHY_HOLDINGS.filter(id => !owns(s, id)).map(id => TERRITORY_DEFS[id].name);
    missing.push(`拿下公爵直辖地（${left.join("、")}）`);
  }
  if (!requirements.renown) missing.push("威望60");
  if (!requirements.siege) missing.push("完成攻城工程");
  if (!requirements.army) missing.push("王国主力80人");
  return missing.length ? `还需：${missing.join("、")}` : "已满足进军王冠谷的条件";
}
```

把 `DUCHY_HOLDINGS` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS

**这一步之后平衡模拟里应当开始出现 `unified` 结局。** 把新的结局分布记在提交信息里。若仍为 0，先不要继续 Task 6 —— 停下来报告，因为加硬截止会让游戏必输。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P1b: 王冠谷开城条件改为控制公爵三块直辖地"
```

---

### Task 6: 加冕倒计时与结局重构

**Files:**
- Modify: `app.js`（`createInitialState`、`checkCampaignEnd`、`finishBattle`、`endingCopy`、`endingVisual`、`renderTop`、删除 `MAX_TURNS`）
- Modify: `index.html`（顶栏加倒计时位）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// 加冕倒计时记在游戏时间上，暂停与离线都不会让公爵偷跑
const co = game.createInitialState("加冕", "oath", "standard");
assert.equal(co.coronation.atElapsedMs, 48 * SEASON, "初值为 12 游戏年");
assert.equal(co.coronation.delayedMs, 0);
assert.equal(game.coronationRemainingMs(co), 48 * SEASON, "开局剩余全部时长");

// 倒计时归零 → 公爵加冕，游戏以失败结束
const co2 = game.createInitialState("加冕到点", "oath", "standard");
co2.clock.elapsedMs = 48 * SEASON;
game.checkCampaignEnd(co2);
assert.equal(co2.ended, true);
assert.equal(co2.endingReason, "crowned", "到点未收复应为法统旁落");

// 攻下公爵直辖地可推迟加冕
const co3 = game.createInitialState("推迟加冕", "oath", "standard");
const beforeDelay = co3.coronation.delayedMs;
game.delayCoronation(co3, "duchyroad");
assert.equal(co3.coronation.delayedMs, beforeDelay + 20 * 60 * 1000, "每块公爵直辖地推迟 20 分钟");
game.delayCoronation(co3, "duchyroad");
assert.equal(co3.coronation.delayedMs, beforeDelay + 20 * 60 * 1000, "同一块地不应重复推迟");
game.delayCoronation(co3, "ashfield");
assert.equal(co3.coronation.delayedMs, beforeDelay + 20 * 60 * 1000, "非公爵直辖地不推迟加冕");

// 旧的「打满 48 季」结局已删除
assert.equal(game.MAX_TURNS, undefined, "MAX_TURNS 应已删除");
const co4 = game.createInitialState("无 great_lord", "oath", "standard");
co4.clock.elapsedMs = 48 * SEASON;
game.checkCampaignEnd(co4);
assert.notEqual(co4.endingReason, "great_lord");
assert.notEqual(co4.endingReason, "minor_lord");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `co.coronation` 为 undefined

- [ ] **Step 3: 实现加冕倒计时**

在 `TIMER_DEFS` 之后新增常量：

```js
// 加冕记在游戏时间（elapsedMs）上而非真实时间，这样暂停与离线都不会让公爵偷跑。
const CORONATION_AT_MS = 48 * 5 * 60 * 1000;      // 12 游戏年
const CORONATION_DELAY_MS = 20 * 60 * 1000;       // 每拿下一块公爵直辖地推迟 20 分钟
```

**删除** `const MAX_TURNS = 48;`。

在 `createInitialState` 的 state 字面量里追加：

```js
    coronation: { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] },
```

在 `checkCampaignEnd` 之前新增：

```js
function coronationDeadlineMs(s) {
  return (s?.coronation?.atElapsedMs ?? CORONATION_AT_MS) + (s?.coronation?.delayedMs || 0);
}

function coronationRemainingMs(s) {
  return Math.max(0, coronationDeadlineMs(s) - (s?.clock?.elapsedMs || 0));
}

// 拿下公爵的直辖地会把加冕往后推。同一块地只算一次。
function delayCoronation(s, territoryId) {
  if (!s?.coronation || !DUCHY_HOLDINGS.includes(territoryId)) return false;
  s.coronation.delayedBy ||= [];
  if (s.coronation.delayedBy.includes(territoryId)) return false;
  s.coronation.delayedBy.push(territoryId);
  s.coronation.delayedMs = (s.coronation.delayedMs || 0) + CORONATION_DELAY_MS;
  log(s, "good", `${TERRITORY_DEFS[territoryId].name}易主，摄政公爵的加冕大典被迫推迟。`);
  return true;
}
```

把 `checkCampaignEnd` 替换为：

```js
// 终局判定必须独立于任何计时器：elapsedMs 会在两次计时器触发之间越过阈值。
function checkCampaignEnd(s) {
  if (!s || s.ended) return false;
  if (coronationRemainingMs(s) > 0) return false;
  s.ended = true;
  s.endingReason = "crowned";
  return true;
}
```

在 `finishBattle` 的胜利分支里，`t.owner = "player";` 之后插入：

```js
    delayCoronation(s, targetId);
```

`endingCopy` 中把 `minor_lord` 与 `great_lord` 两条替换为 `crowned`：

```js
  if (s.endingReason === "crowned") return { title: "铁冠加于他人之头", text: "钟声从王冠谷传来时，你还在自己的城墙上。摄政公爵完成了加冕，渡鸦家的继承权从此只是一段无人过问的旧事。" };
```

`endingVisual` 中同样把两条替换为：

```js
  if (s.endingReason === "crowned") return { src: "assets/regent-duke.webp", alt: "加冕的摄政公爵", cls: "ending-defeat" };
```

`renderTop` 中把
```js
  $("turnText").textContent = `${Math.min(turnOf(S) + 1, MAX_TURNS)} / ${MAX_TURNS}`;
```
改为
```js
  $("turnText").textContent = formatDuration(coronationRemainingMs(S));
```
并把 `index.html` 里对应的标签从 `<span>季度</span>` 改为 `<span>距加冕</span>`。

把 `coronationRemainingMs`、`delayCoronation`、`CORONATION_AT_MS`、`CORONATION_DELAY_MS` 加入 `module.exports`，并从导出中移除 `MAX_TURNS`。

用 `grep -n "MAX_TURNS" app.js` 确认没有残留引用（`endingCopy` 的 ending-stats 里还有一处 `Math.min(turnOf(s) + 1, MAX_TURNS)`，改为 `turnOf(s) + 1`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/migration.test.mjs && grep -c MAX_TURNS app.js`
Expected: 测试全部 PASS，`grep` 输出 `0`

- [ ] **Step 5: 提交**

```bash
git add app.js index.html tests/clock.test.mjs
git commit -m "P1b: 加冕倒计时取代 48 季硬停，攻下公爵直辖地可推迟"
```

---

### Task 7: 存档 v5 迁移

**Files:**
- Modify: `app.js:4`（`VERSION`）、新增 `migrateV4ToV5`、`migrateSave`、`hydrateV4` 更名
- Modify: `tests/migration.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/migration.test.mjs`（`console.log` 之前）：

```js
// v4 → v5：危机改毫秒、新增加冕、领地补漂移累加器
const v4 = JSON.parse(JSON.stringify(game.createInitialState("v4中盘", "oath", "standard")));
v4.version = 4;
v4.crisis = { famine: 2, debt: 0, unrest: 1, checkedTurn: 19 };
delete v4.coronation;
Object.values(v4.territories).forEach(t => { delete t.drift; });
v4.jobs = [{ id: "r1", type: "RESEARCH", startedAt: Date.now(), endAt: Date.now() + 20000, status: "running", queueKey: "research:global", payload: { branch: "agriculture", techId: "heavy_plow", level: 1 } }];

const m5 = game.hydrateState(v4);
assert.ok(m5, "v4 存档必须能迁移");
assert.equal(m5.version, 5);
assert.deepEqual(Object.keys(m5.crisis).sort(), ["famineMs", "unrestMs"], "危机字段应改为毫秒");
assert.equal(m5.crisis.famineMs, 2 * 5 * 60 * 1000, "旧的饥荒计数按每档 5 分钟折算");
assert.ok(m5.coronation && m5.coronation.atElapsedMs > 0, "应补上加冕倒计时");
assert.ok(Object.values(m5.territories).every(t => t.drift), "每块领地都应有漂移累加器");
assert.equal(m5.jobs[0].queueKey, "research:heavy_plow", "旧的全局研究队列键应迁移为按科技分键");
assert.equal(game.selfCheck(m5).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m5).errors)}`);

// v1 仍能一路迁到 v5
const v1c = JSON.parse(JSON.stringify(v4));
v1c.version = 1; v1c.ap = 3; delete v1c.clock; delete v1c.jobs; delete v1c.tech;
const m1c = game.migrateSave(v1c);
assert.ok(m1c && m1c.version === 5, "v1 应能连续迁移到 v5");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/migration.test.mjs`
Expected: FAIL — `assert.equal(m5.version, 5)`

- [ ] **Step 3: 实现迁移**

把 `app.js:4` 改为 `const VERSION = 5;`。

在 `migrateV3ToV4` 之后新增：

```js
function migrateV4ToV5(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = 5;
  // 危机从「连续 N 季」折算为毫秒累计，每档按 5 分钟计
  const old = migrated.crisis || {};
  migrated.crisis = {
    famineMs: Math.max(0, Math.round(old.famineMs ?? (old.famine || 0) * 5 * 60 * 1000)),
    unrestMs: Math.max(0, Math.round(old.unrestMs ?? (old.unrest || 0) * 5 * 60 * 1000))
  };
  migrated.coronation ||= { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] };
  migrated.coronation.delayedBy ||= [];
  Object.values(migrated.territories || {}).forEach(t => { t.drift ||= { guard: 0, devastated: 0 }; });
  // 研究队列从全局单键改为按科技分键，否则并发研究会互相顶掉
  (migrated.jobs || []).forEach(job => {
    if (job.type === "RESEARCH" && job.queueKey === "research:global" && job.payload?.techId) {
      job.queueKey = `research:${job.payload.techId}`;
    }
  });
  // 旧的「打满 48 季」结局在新体系里没有对应物
  if (migrated.endingReason === "great_lord" || migrated.endingReason === "minor_lord") migrated.endingReason = "crowned";
  migrated.migrationLog = [...(migrated.migrationLog || []), "v4-to-v5"];
  return migrated;
}
```

把 `migrateSave` 中追加一级：

```js
  if (migrated.version === 4) migrated = migrateV4ToV5(migrated, now);
```

把 `hydrateV4` 更名为 `hydrateV5`，`migrateSave` 末尾改为 `return hydrateV5(migrated);`。在 `hydrateV5` 内追加两行默认值：

```js
  raw.crisis ||= { famineMs: 0, unrestMs: 0 };
  raw.coronation ||= { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] };
```

把 `migrateV4ToV5` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/migration.test.mjs && node tests/clock.test.mjs && node tests/lords.test.mjs && node tests/structure.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/migration.test.mjs
git commit -m "P1b: 存档升到 v5，危机折算毫秒并补上加冕与漂移累加器"
```

---

### Task 8: 平衡验收 —— 三种结局都必须实际出现

**Files:**
- Modify: `tests/campaign-balance.sim.mjs`

- [ ] **Step 1: 让机器人会去打公爵直辖地**

模拟的 `bestDraft` 只按胜算挑目标，不会主动奔着开城条件去。加一个偏好：在满足其他三项条件后，优先攻打尚未到手的公爵直辖地。

把 `bestDraft` 替换为：

```js
function bestDraft(state) {
  const officers = state.officers.filter(o => o.side === "player" && !o.injured);
  const leaders = officers.sort((a, b) => (b.command + b.scheme) - (a.command + a.scheme)).slice(0, 3).map(o => o.id);
  const troops = game.armyTotal(state, "army_1");
  const targets = game.attackableTerritories(state);
  // 公爵直辖地是开城的前提，也能推迟加冕，够得着就优先打
  const priority = targets.filter(id => game.DUCHY_HOLDINGS.includes(id));
  const pool = priority.length ? priority : targets;
  let best = null;
  for (const targetId of pool) {
    for (const plan of Object.keys(game.PLANS)) {
      const estimate = game.battleEstimate(state, targetId, leaders, troops, plan, "army_1");
      if (!best || estimate.ratio > best.ratio) best = { targetId, leaderIds: leaders, troops, plan, ratio: estimate.ratio };
    }
  }
  return best;
}
```

- [ ] **Step 2: 把循环上界改为加冕截止**

`run()` 的 `while (!state.ended && game.turnOf(state) < 48)` 改为：

```js
    while (!state.ended && game.coronationRemainingMs(state) > 0) {
```

`run()` 返回对象里的 `turn: Math.min(48, game.turnOf(state) + 1)` 改为 `turn: game.turnOf(state) + 1`。

- [ ] **Step 3: 运行并记录**

Run: `node tests/campaign-balance.sim.mjs`

记录 `结局分布`。目标是 `unified`、`crowned`、`collapsed` 三者**都实际出现**。

- [ ] **Step 4: 把软警告改回硬断言**

若三种结局都出现，把文件里三处 `console.warn` 的已知缺陷分支替换为硬断言：

```js
assert.ok(unified.length >= results.length * .05, `统一结局应当可达，实际 ${unified.length}/${results.length}`);
assert.ok(collapsed >= 1, "经营崩溃或领地陷落必须是实际可出现的失败结果");
assert.ok(distinctEndings.length >= 2, `结局不应唯一，实际只有 ${distinctEndings.join("、")}`);
```

并删除三段「已知缺陷」注释。

若某一种结局仍为 0，**不要放宽断言**：保留该项的软警告，在提交信息里写明具体数字与你的判断，交给后续调整。

- [ ] **Step 5: 提交**

```bash
git add tests/campaign-balance.sim.mjs
git commit -m "P1b: 平衡验收，三种结局都应实际出现"
```

---

### Task 9: 浏览器实跑与文档

**Files:**
- Modify: `README.md`
- Modify: `docs/设计说明.md`

- [ ] **Step 1: 浏览器验证**

```bash
python3 -m http.server 8788
```

开新档逐项确认：
- 顶栏显示「距加冕」倒计时并持续减少
- 资源连续增长，知识也在涨（不再等季界）
- 学宫升到 5 级后，发展页显示「研究队列 0/2」且能同时排两项研究
- 六个页签均无控制台报错
- 攻下一块公爵直辖地后，日志出现「加冕大典被迫推迟」且顶栏倒计时变长

- [ ] **Step 2: 更新文档**

`README.md` 的「世界与时间」段末尾追加：

```markdown
- 知识、仓储损耗、训练衰减按秒连续变化；守军与破坏度由 5 秒一次的 drift 计时器平滑推进
- 危机按持续时长判定：粮食见底满 15 分钟、民心崩溃满 10 分钟才会终局，玩家有实时补救的余地
- 研究队列可扩容：学宫每 5 级多开一条并发研究线
```

把「战争」段里关于终局的描述替换为：

```markdown
- 摄政公爵正在筹备加冕，顶栏常驻倒计时；到点未夺回王冠谷即为法统旁落
- 攻下公爵的直辖地（公爵大道、王冠田、王渡）既是开城前提，也能把加冕往后推 20 分钟
```

并把「尚未实现」段里的 P1 与 P4 两条删除（已完成）。

`docs/设计说明.md` 的「实现阶段」段把 P1b 标为已完成。

- [ ] **Step 3: 打包并提交**

```bash
python3 build_single.py
git add README.md docs/设计说明.md
git commit -m "P1b: 同步文档到连续化与加冕倒计时版本"
```

---

## 完成标准

- 五套测试全绿：`structure` / `lords` / `migration` / `clock` / `campaign-balance`
- `grep -c "MAX_TURNS" app.js` 输出 `0`
- 步进等价性测试仍然通过（连续量不得在边界重复结算）
- 平衡模拟中 `unified` / `crowned` / `collapsed` 三种结局都实际出现
- v4 存档能迁移到 v5，`selfCheck` 通过，季节年份不跳变
- 浏览器无控制台报错，顶栏倒计时会因攻下公爵直辖地而变长

## 移交给后续阶段的接口

- `applyDrift(s, intervalMs)` — P3 若要加「领地叛乱」「商路收益」等慢变量，挂这里
- `CRISIS_LIMITS` — 危机阈值集中在此，P4 配平时只改这一处
- `DUCHY_HOLDINGS` — 开城与推迟加冕共用同一批目标，改地图时要一并检查
- `s.cooldowns` — P2b 的使者冷却用这套，**不要**引入任何基于季的锁
