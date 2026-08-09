# P1a 时钟与调度器骨架 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复地图邻接，把 `s.turn` 改为从 `clock.elapsedMs` 派生，并用统一调度器 `s.timers` 取代 `advanceSeason()` 这个挂了 11 件事的单一心跳。

**Architecture:** 世界推进改为「推进到下一个到期事件 → 累积连续量到该时刻 → 处理该事件 → 重复」。计时器与现有 `jobs` 队列同构（都是绝对时刻驱动），因此在线推进与离线补算复用同一个循环。`accrueTo(s, at)` 累积到绝对时刻而非累积一段时长，保证幂等。

**Tech Stack:** 纯 ES2022 浏览器脚本（`app.js`，无构建、无框架），Node 内置 `assert` 跑测试，`python3 build_single.py` 打包单文件版。

**范围边界：** P1a 只改**世界如何被驱动**，不改**发生什么**。季界该做的事仍在季界做，只是由 `season` 计时器触发而非由 `turn++` 触发。连续化（知识/损耗/守军漂移/危机按时长）、加冕倒计时、开城条件属 P1b。因此 P1a 落地后行为应与现状**接近一致**——现有测试大体仍应通过，这是本增量最重要的安全属性。

**基线：** 当前 HEAD 为 `9f0e402`（P1 设计文档）。工作区应干净。

---

### Task 1: 地图邻接对称化

**Files:**
- Modify: `app.js:174` 之后（`TERRITORY_DEFS` 构建完成处）
- Modify: `tests/structure.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/structure.test.mjs`（在 `console.log("structure tests passed");` 之前）：

```js
// 邻接必须对称：attackableTerritories 读的是出发地的 adj，
// 单向声明会让目标永远无法被进攻。
const asymmetric = [];
for (const [id, d] of Object.entries(game.TERRITORY_DEFS)) {
  for (const nb of d.adj) {
    assert.ok(game.TERRITORY_DEFS[nb], `${id} 的邻居 ${nb} 不存在`);
    if (!game.TERRITORY_DEFS[nb].adj.includes(id)) asymmetric.push(`${id}→${nb}`);
  }
}
assert.deepEqual(asymmetric, [], `存在单向邻接，这些目标将永远无法被进攻：${asymmetric.join("、")}`);

// 全部可占领地都必须从开局位置可达
const reachable = new Set(["ravenstone", "blackthorn", "westmarch", "ironhill"]);
for (let grew = true; grew; ) {
  grew = false;
  for (const id of [...reachable]) {
    for (const nb of game.TERRITORY_DEFS[id].adj) {
      if (!reachable.has(nb) && game.TERRITORY_DEFS[nb].playable !== false) { reachable.add(nb); grew = true; }
    }
  }
}
const unreachable = game.playableTerritoryIds().filter(id => !reachable.has(id));
assert.deepEqual(unreachable, [], `这些可占领地从开局位置永远打不到：${unreachable.join("、")}`);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/structure.test.mjs`
Expected: FAIL — 报出 43 条单向邻接

- [ ] **Step 3: 实现对称化**

在 `app.js` 第 174 行（`TERRITORY_DEFS.ironhill.gold = 15; ...`）之后、`const playableTerritoryIds` 之前插入：

```js
// 邻接必须对称。EXTRA_TERRITORIES 里的节点各自声明了邻居，但 7 个原始核心节点
// 的 adj 从未反向补回；而 attackableTerritories 读的是出发地的 adj，
// 结果是从核心领地打不到任何扩展领地——24 块可占领地里只有 10 块真正可达。
Object.entries(TERRITORY_DEFS).forEach(([id, d]) => {
  d.adj.forEach(nb => {
    if (TERRITORY_DEFS[nb] && !TERRITORY_DEFS[nb].adj.includes(id)) TERRITORY_DEFS[nb].adj.push(id);
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs`
Expected: 三个测试都 PASS

- [ ] **Step 5: 观察平衡变化并记录**

Run: `node tests/campaign-balance.sim.mjs`

可达领地从 10 块变成 24 块，敌方进攻路径同样翻倍。把新的「平均最终领地」「结局分布」记在提交信息里。**不要**为了让数字好看而调整任何断言。

- [ ] **Step 6: 提交**

```bash
git add app.js tests/structure.test.mjs
git commit -m "P1a: 修复地图 43 条单向邻接，24 块可占领地全部可达"
```

---

### Task 2: 时钟改为 elapsedMs，turn 变派生值

**Files:**
- Modify: `app.js:323-342`（`makeClock` / `initClock` / `getSeasonRemainingMs`）
- Modify: `app.js:930-931`（`seasonOf` / `yearOf`）
- Modify: 全文件所有 `s.turn` 读取点
- Create: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `tests/clock.test.mjs`：

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

const SEASON = game.TIME_CONFIG.seasonDurationMs;

const s = game.createInitialState("时钟测试", "oath", "standard");
assert.equal(game.turnOf(s), 0, "开局在第 0 季");
assert.equal(s.turn, undefined, "turn 不应再作为存储字段存在");
assert.equal(game.seasonOf(s).id, "spring");
assert.equal(game.yearOf(s), 1);

// 季节与年份必须能从 elapsedMs 在任意时刻正确派生
const cases = [
  [0, 0, "spring", 1], [SEASON - 1, 0, "spring", 1], [SEASON, 1, "summer", 1],
  [SEASON * 2, 2, "autumn", 1], [SEASON * 3, 3, "winter", 1],
  [SEASON * 4, 4, "spring", 2], [SEASON * 47, 47, "winter", 12]
];
for (const [elapsed, turn, season, year] of cases) {
  s.clock.elapsedMs = elapsed;
  assert.equal(game.turnOf(s), turn, `elapsed=${elapsed} 应为第 ${turn} 季`);
  assert.equal(game.seasonOf(s).id, season, `elapsed=${elapsed} 应为 ${season}`);
  assert.equal(game.yearOf(s), year, `elapsed=${elapsed} 应为第 ${year} 年`);
}

// 距离换季的剩余时间
s.clock.elapsedMs = SEASON * 2 + 60000;
assert.equal(game.getSeasonRemainingMs(s), SEASON - 60000, "换季倒计时应由 elapsedMs 推出");

console.log("clock tests passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `game.turnOf is not a function`

- [ ] **Step 3: 实现新时钟**

把 `app.js:323-342` 的三个函数替换为：

```js
// clock.elapsedMs 是游戏时间的唯一真相源（不含暂停时长）。
// turn / 季节 / 年份全部由它派生，任何代码都无法靠调用函数凭空推进世界。
function makeClock(elapsedMs = 0, now = Date.now()) {
  return { startedAt: now, elapsedMs: Math.max(0, Math.round(elapsedMs)), lastProcessedAt: now };
}

function initClock(s, now = Date.now()) {
  if (!s) return null;
  s.clock = makeClock(0, now);
  return s.clock;
}

function turnOf(s) {
  return Math.floor((s?.clock?.elapsedMs || 0) / TIME_CONFIG.seasonDurationMs);
}

function getSeasonRemainingMs(s) {
  const elapsed = s?.clock?.elapsedMs || 0;
  return TIME_CONFIG.seasonDurationMs - (elapsed % TIME_CONFIG.seasonDurationMs);
}
```

把 `app.js:930-931` 改为：

```js
const seasonOf = s => SEASONS[turnOf(s) % 4];
const yearOf = s => Math.floor(turnOf(s) / 4) + 1;
```

**替换全部 `s.turn` 读取点。** 用 `grep -n "\.turn\b" app.js` 逐一定位，逐个改为 `turnOf(s)`（或在 `S` 上下文中 `turnOf(S)`）。已知的点：

- `cityIntelActive`：`(s.cityIntel?.[id] || -1) >= turnOf(s)`
- `resolveCityAction`：`s.cityIntel[id] = turnOf(s) + 2`
- `enemyGuardCap`：`const timePressure = Math.floor(turnOf(s) / 4) * 3;`
- `settleSeasonEconomy` 里的 `normalRecovery`：`Math.min(4, 2 + Math.floor(turnOf(s) / 12))`
- `queueSeasonEvents` 里的四处 `s.turn >= N` 与 `s.turn % N`
- `applyCompletedJob` 里两处 `recruitedAt = s.turn` → `turnOf(s)`
- `log()` 里 `{ turn: s.turn }` → `{ turn: turnOf(s) }`（战报按年份季节分组要用）
- `checkDefeat` 里 `s.crisis.checkedTurn`

从 `createInitialState` 的 state 字面量里**删除 `turn: 0,`**。

把 `turnOf` 加入 `module.exports`，并确认 `seasonOf`、`yearOf`、`getSeasonRemainingMs`、`TIME_CONFIG` 已导出（`getSeasonRemainingMs` 与 `yearOf`、`turnOf` 需新增）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs`
Expected: PASS

其余测试此时**预期会失败**（`advanceSeason` 还在用旧时钟字段），Task 3、4 会修好。若想确认损坏范围，可运行 `node tests/structure.test.mjs` 并记录失败点，但不要在本任务里修。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1a: 时钟改为 elapsedMs，turn 变派生值"
```

---

### Task 3: 调度器骨架与 accrueTo

**Files:**
- Modify: `app.js`（`accrueResources` 附近新增 `accrueTo`）
- Modify: `app.js`（新增 `TIMER_DEFS` / `initTimers` / `nextDueEvent` / `advanceWorld`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// accrueTo 必须累积到「绝对时刻」而非「一段时长」，因此重复调用同一时刻是空操作
const a = game.createInitialState("幂等测试", "oath", "standard");
const t0 = a.clock.lastProcessedAt;
game.accrueTo(a, t0 + 10000);
const goldAfterFirst = a.gold;
const elapsedAfterFirst = a.clock.elapsedMs;
game.accrueTo(a, t0 + 10000);
assert.equal(a.gold, goldAfterFirst, "累积到同一时刻两次不应重复计资源");
assert.equal(a.clock.elapsedMs, elapsedAfterFirst, "累积到同一时刻两次不应重复推进游戏时间");
game.accrueTo(a, t0 + 5000);
assert.equal(a.clock.elapsedMs, elapsedAfterFirst, "回退到过去的时刻应被忽略");

// 计时器表就位
const w = game.createInitialState("调度测试", "oath", "standard");
assert.deepEqual(Object.keys(w.timers).sort(), ["aiCrown", "aiRiver", "aiWolf", "events", "season"]);
for (const [key, timer] of Object.entries(w.timers)) {
  assert.ok(Number.isFinite(timer.nextAt), `${key} 缺少 nextAt`);
  assert.ok(timer.nextAt > w.clock.lastProcessedAt, `${key} 的 nextAt 应在未来`);
}

// 步进等价性：一次推进 2 小时，必须等于分 120 次每次 1 分钟
const seeded = seed => { let n = seed >>> 0; return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; }; };
const strip = st => JSON.stringify({
  gold: Math.round(st.gold), grain: Math.round(st.grain), elapsed: st.clock.elapsedMs,
  owners: Object.fromEntries(Object.entries(st.territories).map(([k, v]) => [k, v.owner])),
  jobs: st.jobs.filter(j => j.status === "running").length
});
const bulk = game.createInitialState("整块推进", "oath", "standard");
const step = game.createInitialState("分步推进", "oath", "standard");
// 两份状态必须从完全相同的时间原点出发：clock 与 timers 都要对齐，
// 否则比较的是两个不同的世界，测不出步进等价性。
step.clock = JSON.parse(JSON.stringify(bulk.clock));
step.timers = JSON.parse(JSON.stringify(bulk.timers));
const base = bulk.clock.lastProcessedAt;
const TWO_HOURS = 2 * 60 * 60 * 1000;
// rng 必须各自只创建一次并跨调用复用；每次新建会让两边抽到不同的随机序列。
const bulkRng = seeded(7);
const stepRng = seeded(7);
game.advanceWorld(bulk, base + TWO_HOURS, { rng: bulkRng, maxCatchUpMs: TWO_HOURS });
for (let i = 1; i <= 120; i++) game.advanceWorld(step, base + i * 60000, { rng: stepRng, maxCatchUpMs: TWO_HOURS });
assert.equal(strip(step), strip(bulk), "整块推进与分步推进必须得到相同世界状态");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `game.accrueTo is not a function`

- [ ] **Step 3: 实现 accrueTo 与调度器**

在 `accrueResources` 函数**之后**新增（`accrueResources` 本身保留，Task 4 删除其调用点后再删函数）：

```js
// 累积到某个绝对时刻，而非累积一段时长——这样重复调用天然幂等，
// 在线逐帧推进与离线一次性补算才可能得到完全相同的结果。
function accrueTo(s, at) {
  if (!s?.clock) return 0;
  const from = s.clock.lastProcessedAt;
  if (!Number.isFinite(at) || !(at > from)) return 0;
  const deltaMs = at - from;
  const flow = resourceFlow(s, seasonOf(s));
  const seconds = deltaMs / 1000;
  s.gold += flow.goldPerSecond * seconds;
  s.grain += flow.grainPerSecond * seconds;
  s.clock.elapsedMs += deltaMs;
  s.clock.lastProcessedAt = at;
  return seconds;
}
```

在 `TIME_CONFIG` 之后新增计时器定义：

```js
// 每个周期性系统有自己的节奏，不再全部挤在换季那一刻。
// drift（守军与稳定度慢漂移）属 P1b 连续化那批，此处先不加。
const TIMER_DEFS = {
  season:  { intervalMs: 5 * 60 * 1000, offline: true },
  aiWolf:  { intervalMs: 60 * 1000, faction: "wolf", offline: false },
  aiRiver: { intervalMs: 75 * 1000, faction: "river", offline: false },
  aiCrown: { intervalMs: 90 * 1000, faction: "crown", offline: false },
  events:  { intervalMs: 120 * 1000, offline: false }
};
```

在 `initClock` 之后新增：

```js
function initTimers(s, now = Date.now()) {
  s.timers = {};
  Object.entries(TIMER_DEFS).forEach(([key, def]) => { s.timers[key] = { nextAt: now + def.intervalMs }; });
  return s.timers;
}

// 返回最早到期的事件：计时器或任务，二者同构（都是绝对时刻驱动）。
function nextDueEvent(s, now) {
  let best = null;
  Object.entries(s.timers || {}).forEach(([key, timer]) => {
    if (timer.nextAt <= now && (!best || timer.nextAt < best.at)) best = { at: timer.nextAt, kind: "timer", key };
  });
  (s.jobs || []).forEach(job => {
    if (job.status === "running" && job.endAt <= now && (!best || job.endAt < best.at)) best = { at: job.endAt, kind: "job", key: job.id };
  });
  return best;
}
```

在 `advanceSeasonAuto` **之前**新增主循环（`fireTimer` 由 Task 4 实现，此处先留一个只推进 nextAt 的版本）：

```js
function fireTimer(s, key, at, rng, options = {}) {
  const def = TIMER_DEFS[key];
  const timer = s.timers[key];
  timer.nextAt = at + def.intervalMs;
  if (options.offline && !def.offline) return false;   // 离线不结算 AI 与事件
  return true;
}

function advanceWorld(s, now = Date.now(), options = {}) {
  if (!s || s.ended || s.battleSession || s.pauseState) return { steps: 0, jobs: 0 };
  s.clock ||= makeClock(0, now);
  s.timers ||= initTimers(s, now);
  const rng = options.rng || Math.random;
  const cap = Number.isFinite(options.maxCatchUpMs) ? options.maxCatchUpMs : TIME_CONFIG.maxCatchUpMs;
  const horizon = Math.min(now, s.clock.lastProcessedAt + cap);
  let steps = 0, jobs = 0, guard = 0;
  while (!s.ended && guard++ < 5000) {
    const next = nextDueEvent(s, horizon);
    if (!next) break;
    accrueTo(s, next.at);
    if (next.kind === "job") jobs += processCompletedJobs(s, next.at);
    else if (fireTimer(s, next.key, next.at, rng, options)) steps++;
  }
  accrueTo(s, horizon);
  jobs += processCompletedJobs(s, horizon);
  // 超出补算上限的部分直接跳过，不结算也不累积，避免离开一整天后被补算淹没
  if (horizon < now) {
    s.clock.lastProcessedAt = now;
    Object.entries(s.timers).forEach(([key, timer]) => {
      if (timer.nextAt <= now) timer.nextAt = now + TIMER_DEFS[key].intervalMs;
    });
  }
  return { steps, jobs };
}
```

在 `TIME_CONFIG` 里把 `maxOfflineSeasonCatchup: 1` 替换为：

```js
  maxCatchUpMs: 2 * 60 * 60 * 1000
```

在 `createInitialState` 里 `initClock(state);` 之后加一行 `initTimers(state, state.clock.startedAt);`。

把 `accrueTo`、`advanceWorld`、`initTimers`、`nextDueEvent`、`TIMER_DEFS` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs`
Expected: PASS，含步进等价性

若步进等价性失败，**不要**放宽断言。常见原因：`accrueTo` 在季界两侧用了不同系数（说明季界没被当作调度点）、或 `horizon` 计算让分步与整块看到不同的可处理范围。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1a: 新增 accrueTo 与统一调度器骨架"
```

---

### Task 4: 季界工作迁到 season 计时器，删除 advanceSeason

**Files:**
- Modify: `app.js`（`fireTimer` 补全、删除 `advanceSeason` / `advanceSeasonAuto` / `accrueResources`）
- Modify: `app.js`（`catchUpOffline` / `updateWorldTime` 改调 `advanceWorld`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// season 计时器到期时，原本挂在换季上的事该照常发生
const sea = game.createInitialState("换季测试", "oath", "standard");
const seaBase = sea.clock.lastProcessedAt;
const knowledgeBefore = sea.knowledge;
game.advanceWorld(sea, seaBase + game.TIME_CONFIG.seasonDurationMs + 1000, { rng: () => .5 });
assert.equal(game.turnOf(sea), 1, "过了一季，派生 turn 应为 1");
assert.ok(sea.knowledge > knowledgeBefore, "换季应产出知识");
assert.equal(game.advanceSeason, undefined, "advanceSeason 应已删除");
assert.equal(game.advanceSeasonAuto, undefined, "advanceSeasonAuto 应已删除");

// 离线：资源与任务照常结算，但不触发 AI 与事件
const off = game.createInitialState("离线测试", "oath", "standard");
const offBase = off.clock.lastProcessedAt;
const decisionsBefore = off.pendingDecisions.length;
game.advanceWorld(off, offBase + 40 * 60 * 1000, { rng: () => .01, offline: true });
assert.ok(off.gold > 58, "离线期间资源应照常累积");
assert.equal(off.pendingDecisions.length, decisionsBefore, "离线期间不应投放事件");
assert.ok(!off.log.some(l => l.text.includes("袭扰") || l.text.includes("攻占")), "离线期间不应发生 AI 进攻");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `advanceSeason 应已删除`

- [ ] **Step 3: 补全 fireTimer 并删除旧心跳**

把 `fireTimer` 替换为完整版：

```js
function fireTimer(s, key, at, rng, options = {}) {
  const def = TIMER_DEFS[key];
  const timer = s.timers[key];
  timer.nextAt = at + def.intervalMs;
  if (options.offline && !def.offline) return false;
  if (key === "season") {
    // 原本挂在 advanceSeason 上的季界工作，除 AI 与事件外全部保留在这里。
    settleSeasonEconomy(s, { resourcesAlreadyAccrued: true });
    s.officers.forEach(o => { o.injured = 0; });
    s.training = Math.max(0, s.training - Math.max(0, 2 - Math.ceil(techLevel(s, "field_doctrine") / 2)));
    s.warWeariness = 0;
    handleOfficerPolitics(s);
    if (!options.offline) {
      queueSeasonEvents(s);
      checkDefeat(s);
    }
    if (turnOf(s) >= MAX_TURNS && !s.ended) {
      s.ended = true;
      s.endingReason = ownTerritoryIds(s).length >= 5 ? "great_lord" : "minor_lord";
    }
    return true;
  }
  if (def.faction) { runFactionTurn(s, def.faction, rng, at); return true; }
  if (key === "events") { queueSeasonEvents(s); return true; }
  return false;
}
```

**删除** `advanceSeason`、`advanceSeasonAuto`、`accrueResources` 三个函数，以及 `module.exports` 里对它们的导出。

把 `catchUpOffline` 改为：

```js
function catchUpOffline(s, now = Date.now()) {
  if (!s) return 0;
  s.clock ||= makeClock(0, now);
  s.timers ||= initTimers(s, now);
  if (s.pauseState) { s.clock.lastProcessedAt = now; return 0; }
  const before = turnOf(s);
  const result = advanceWorld(s, now, { offline: true });
  const seasons = turnOf(s) - before;
  if (seasons > 0) {
    const text = `你离开期间推进了${seasons}季。离线不结算敌袭与事件，回来后照常继续。`;
    s.lastAction = { name: "离线结算完成", text };
    log(s, "info", text);
    saveGame();
  }
  return seasons;
}
```

把 `updateWorldTime` 里的 `advanceSeasonAuto(S, now)` 改为 `advanceWorld(S, now)`，并把返回值解构从 `{ seasons, jobs }` 改为 `{ steps, jobs }`，后续判断改为 `if (steps || jobs)`。

**注意一个时序陷阱：** `fireTimer` 被调用前 `accrueTo(s, next.at)` 已经把 `elapsedMs` 推过了季界，因此此刻 `seasonOf(s)` 返回的是**新的一季**，而非刚结束的那一季。`settleSeasonEconomy` 内部用 `seasonOf(s)` 计算产出与日志文案，会因此报成下一季。修法是在 `fireTimer` 的 season 分支里显式传入刚结束的季节：

```js
    const endedSeason = SEASONS[(turnOf(s) + 3) % 4];   // 刚结束的那一季
    settleSeasonEconomy(s, { resourcesAlreadyAccrued: true, season: endedSeason });
```

并让 `settleSeasonEconomy` 接受 `options.season`，其内部 `const f = forecast(s);` 改为 `const f = forecast(s, options.season || seasonOf(s));`，日志文案里的 `seasonOf(s).name` 同样改用该季节。

`runFactionTurn` 由 Task 5 实现；本任务先加一个占位实现放在 `runAiTurn` 旁边：

```js
function runFactionTurn(s, factionId, rng = Math.random, now = Date.now()) {
  return runAiTurn(s, rng, now, factionId);
}
```

并给 `runAiTurn` 增加第四个参数 `onlyFaction`，在其 `Object.entries(AI_FACTION_DEFS).forEach` 内部开头加一行：

```js
    if (onlyFaction && factionId !== onlyFaction) return;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs`
Expected: 全部 PASS

`structure.test.mjs` 里若有断言直接调用 `advanceSeasonAuto`，改为调用 `advanceWorld` 并相应调整期望；**不要**删除该断言想验证的行为。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs tests/structure.test.mjs
git commit -m "P1a: 季界工作迁入 season 计时器，删除 advanceSeason"
```

---

### Task 5: AI 拆成三个独立计时器

**Files:**
- Modify: `app.js`（`runAiTurn` / `runFactionTurn` / `enemyPressure`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// 三个势力各走各的钟：狼牙 60 秒、河望 75 秒、摄政 90 秒
const ai = game.createInitialState("AI计时器", "oath", "standard");
assert.equal(game.TIMER_DEFS.aiWolf.intervalMs, 60000);
assert.equal(game.TIMER_DEFS.aiRiver.intervalMs, 75000);
assert.equal(game.TIMER_DEFS.aiCrown.intervalMs, 90000);
// 单个势力的计时器只驱动该势力
const solo = game.createInitialState("单势力", "oath", "standard");
const wolfArmyBefore = JSON.stringify(solo.factions.wolf.armies[0]);
const riverArmyBefore = JSON.stringify(solo.factions.river.armies[0]);
game.runFactionTurn(solo, "wolf", () => .01, Date.now());
assert.notEqual(JSON.stringify(solo.factions.wolf.armies[0]), wolfArmyBefore, "狼牙的计时器应驱动狼牙");
assert.equal(JSON.stringify(solo.factions.river.armies[0]), riverArmyBefore, "狼牙的计时器不应驱动河望");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — 河望的军队也被改动（`runAiTurn` 仍遍历全部势力）

- [ ] **Step 3: 实现按势力驱动**

把 `runAiTurn` 的签名与循环改为只处理一个势力，并把「势力资源增长」按计时器间隔摊薄（原本每季一次，现在每 60~90 秒一次，不摊薄会让 AI 暴富）：

```js
function runFactionTurn(s, factionId, rng = Math.random, now = Date.now()) {
  if (!s || s.ended) return null;
  ensureAIFactions(s);
  const def = AI_FACTION_DEFS[factionId];
  const faction = s.factions[factionId];
  if (!def || !faction) return null;
  // 原本每季一次的增长，按该势力计时器占一季的比例摊薄
  const share = TIMER_DEFS[`ai${factionId[0].toUpperCase()}${factionId.slice(1)}`].intervalMs / TIME_CONFIG.seasonDurationMs;
  faction.gold += 10 * difficultyOf(s).income * share;
  faction.grain += 18 * share;
  faction.knowledge += 2 * share;
  const army = faction.armies.find(item => item.status === "idle");
  if (!army || turnOf(s) < 2) return null;
  const targets = (TERRITORY_DEFS[army.locationId]?.adj || []).filter(id => owns(s, id));
  if (!targets.length) return null;
  const chance = (def.personality === "aggressive" ? .23 : def.personality === "cautious" ? .1 : .16) * share;
  if (rng() <= chance && startAIMarch(s, factionId, army, targets[Math.floor(rng() * targets.length)], now)) return "marching";
  return null;
}
```

**删除** `runAiTurn` 与 `enemyPressure` 两个函数（`enemyPressure` 的唯一调用点在已删除的 `advanceSeason` 里），并从 `module.exports` 移除它们，加入 `runFactionTurn`。

把 Task 4 里 `fireTimer` 中的 `if (def.faction) { runFactionTurn(...) }` 保持不变即可。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1a: AI 拆成三个独立计时器，增长按间隔摊薄"
```

---

### Task 6: seasonLocks 换成 cooldowns

**Files:**
- Modify: `app.js`（`cityActionAvailable` / `cityAction` / `createInitialState` / `hydrateV3`）
- Modify: `tests/clock.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/clock.test.mjs`（`console.log` 之前）：

```js
// 冷却用时间戳，不再是「本季已用」
const cd = game.createInitialState("冷却测试", "oath", "standard");
assert.equal(cd.seasonLocks, undefined, "seasonLocks 应已删除");
assert.deepEqual(cd.cooldowns, {}, "应改用 cooldowns");
assert.ok(game.cityAction(cd, "wolfden", "scout"), "首次侦察应成功");
game.processCompletedJobs(cd, cd.jobs.at(-1).endAt);
assert.ok(cd.cooldowns["scout:wolfden"] > Date.now(), "侦察后应写入冷却到期时间");
assert.equal(game.cityActionAvailable(cd, "wolfden", "scout"), false, "冷却期内不可再次侦察");
cd.cooldowns["scout:wolfden"] = Date.now() - 1;
assert.equal(game.cityActionAvailable(cd, "wolfden", "scout"), true, "冷却过期后应恢复");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/clock.test.mjs`
Expected: FAIL — `seasonLocks 应已删除`

- [ ] **Step 3: 实现冷却**

在 `CITY_ACTION_DURATIONS` 之后新增：

```js
const CITY_ACTION_COOLDOWNS = { scout: 90 * 1000 };
```

把 `cityActionLockKey(id, action)` 的实现改为返回 `` `${action}:${id}` ``。

在 `cityActionAvailable` 中，把
```js
  if (cityActionJob(s, id) || (s.seasonLocks?.[cityActionLockKey(id, action)] || 0) >= 1) return false;
```
改为
```js
  if (cityActionJob(s, id) || (s.cooldowns?.[cityActionLockKey(id, action)] || 0) > Date.now()) return false;
```

在 `cityAction` 中，把
```js
  s.seasonLocks ||= {};
  s.seasonLocks[cityActionLockKey(id, action)] = 1;
```
改为
```js
  s.cooldowns ||= {};
  s.cooldowns[cityActionLockKey(id, action)] = Date.now() + (CITY_ACTION_COOLDOWNS[action] || 60000);
```

在 `createInitialState` 的 state 字面量里把 `seasonLocks: {},` 改为 `cooldowns: {},`。
在 `hydrateV3` 里把 `raw.seasonLocks ||= {};` 改为 `raw.cooldowns ||= {};`。

把 `cityActionAvailable`、`CITY_ACTION_COOLDOWNS` 加入 `module.exports`（`cityAction` 已导出）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/clock.test.mjs && node tests/structure.test.mjs && grep -c seasonLocks app.js`
Expected: 测试 PASS，`grep` 输出 `0`

- [ ] **Step 5: 提交**

```bash
git add app.js tests/clock.test.mjs
git commit -m "P1a: seasonLocks 换成基于时间戳的 cooldowns"
```

---

### Task 7: 存档 v4 迁移

**Files:**
- Modify: `app.js:4`（`VERSION`）、新增 `migrateV3ToV4`、`migrateSave`、`hydrateV3` 更名
- Modify: `tests/migration.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/migration.test.mjs`（`console.log` 之前）：

```js
assert.equal(game.VERSION, 4, "存档版本应升到 4");

const SEASON_MS = game.TIME_CONFIG.seasonDurationMs;
// 构造一份 v3 中盘存档：有 turn、有 seasonLocks、无 timers、无 cooldowns
const v3 = JSON.parse(JSON.stringify(game.createInitialState("v3中盘", "oath", "standard")));
v3.version = 3;
v3.turn = 19;
v3.clock = { seasonIndex: 19, seasonStartedAt: Date.now(), seasonEndsAt: Date.now() + SEASON_MS, lastProcessedAt: Date.now() };
v3.seasonLocks = { "city_wolfden_scout": 1 };
delete v3.timers; delete v3.cooldowns;

const m4 = game.hydrateState(v3);
assert.ok(m4, "v3 存档必须能迁移");
assert.equal(m4.version, 4);
// 季节与年份不跳变
assert.equal(game.turnOf(m4), 19, "迁移后派生 turn 应与迁移前一致");
assert.equal(game.seasonOf(m4).id, game.SEASONS[19 % 4].id, "季节不应跳变");
assert.equal(game.yearOf(m4), Math.floor(19 / 4) + 1, "年份不应跳变");
assert.equal(m4.turn, undefined, "turn 不应再作为存储字段保留");
assert.equal(m4.seasonLocks, undefined, "seasonLocks 应被删除");
assert.deepEqual(Object.keys(m4.timers).sort(), ["aiCrown", "aiRiver", "aiWolf", "events", "season"]);
assert.ok(m4.cooldowns && typeof m4.cooldowns === "object");
assert.equal(game.selfCheck(m4).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m4).errors)}`);

// v1 仍能一路迁到 v4
const v1b = JSON.parse(JSON.stringify(v3));
v1b.version = 1; v1b.ap = 3; delete v1b.clock; delete v1b.jobs; delete v1b.tech;
const m1b = game.migrateSave(v1b);
assert.ok(m1b && m1b.version === 4, "v1 应能连续迁移到 v4");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/migration.test.mjs`
Expected: FAIL — `存档版本应升到 4`

- [ ] **Step 3: 实现迁移**

把 `app.js:4` 改为 `const VERSION = 4;`。

在 `migrateV2ToV3` 之后新增：

```js
function migrateV3ToV4(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = 4;
  // 由旧的 turn 反推 elapsedMs，保证季节与年份不跳变
  const turn = Math.max(0, Math.round(migrated.turn || migrated.clock?.seasonIndex || 0));
  migrated.clock = { startedAt: now - turn * TIME_CONFIG.seasonDurationMs, elapsedMs: turn * TIME_CONFIG.seasonDurationMs, lastProcessedAt: now };
  delete migrated.turn;
  delete migrated.seasonLocks;
  delete migrated.campaignCooldown;
  migrated.cooldowns = migrated.cooldowns && typeof migrated.cooldowns === "object" ? migrated.cooldowns : {};
  migrated.timers = {};
  Object.entries(TIMER_DEFS).forEach(([key, def]) => { migrated.timers[key] = { nextAt: now + def.intervalMs }; });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v3-to-v4"];
  return migrated;
}
```

把 `migrateSave` 改为：

```js
function migrateSave(raw, now = Date.now()) {
  if (!raw) return null;
  let migrated = clone(raw);
  if (migrated.version === 1 || migrated.version == null) migrated = migrateV1ToV2(migrated, now);
  if (migrated.version === 2) migrated = migrateV2ToV3(migrated);
  if (migrated.version === 3) migrated = migrateV3ToV4(migrated, now);
  if (migrated.version !== VERSION) return null;
  return hydrateV4(migrated);
}
```

把 `hydrateV3` 更名为 `hydrateV4`。在其内部，把 `raw.clock ||= makeClock(raw.turn);` 改为 `raw.clock ||= makeClock(0);`，并新增一行 `raw.timers ||= initTimers(raw, Date.now());`。

把 `migrateV3ToV4` 加入 `module.exports`，并确认 `SEASONS` 已导出（测试需要）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/migration.test.mjs && node tests/clock.test.mjs && node tests/structure.test.mjs && node tests/lords.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/migration.test.mjs
git commit -m "P1a: 存档升到 v4，turn 反推 elapsedMs 且季节年份不跳变"
```

---

### Task 8: 平衡模拟改按真实时间推进

**Files:**
- Modify: `tests/campaign-balance.sim.mjs`

- [ ] **Step 1: 改造推进方式**

`run(seed)` 里原本每轮调用 `game.advanceSeason(state, { at: now })`。改为按真实时间推进：

把
```js
      now += game.TIME_CONFIG.seasonDurationMs;
      game.advanceSeason(state, { at: now });
```
改为
```js
      now += game.TIME_CONFIG.seasonDurationMs;
      game.advanceWorld(state, now, { rng: random, maxCatchUpMs: game.TIME_CONFIG.seasonDurationMs * 2 });
```

把循环条件 `while (!state.ended && state.turn < 48)` 改为 `while (!state.ended && game.turnOf(state) < 48)`。

把 `run()` 返回对象里的 `turn: Math.min(48, state.turn + 1)` 改为 `turn: Math.min(48, game.turnOf(state) + 1)`。

- [ ] **Step 2: 运行并观察**

Run: `node tests/campaign-balance.sim.mjs`

记录新的结局分布与平均领地数。**邻接修复后可达领地从 10 块变成 24 块**，预期平均领地数会显著上升。

若「统一不可达」的已知缺陷警告消失了，把对应的软警告改回硬断言：

```js
assert.ok(unified.length >= results.length * .05, "统一结局应当可达");
```

若仍未消失，保留警告并在提交信息里写明当前数字，留给 P1b 的加冕倒计时与开城条件改造处理。

- [ ] **Step 3: 提交**

```bash
git add tests/campaign-balance.sim.mjs
git commit -m "P1a: 平衡模拟改按真实时间推进"
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

开新档，逐项确认：
- 顶栏「距离换季」倒计时正常走动并在归零时换季
- 资源持续增长，无跳变
- 六个页签均无控制台报错
- 地图上从渡鸦堡出发能看到扩展领地成为可攻击目标（邻接修复的直接效果）
- 排一项建设，切走再切回，倒计时连续

- [ ] **Step 2: 离线验证**

在控制台执行 `localStorage.getItem("iron-crown-lord-save-v1")` 确认存档存在，关闭标签页等待 3 分钟后重开，确认：
- 建设/研究已推进
- 日志出现「离线结算完成」
- 未出现敌军袭扰记录

- [ ] **Step 3: 更新文档**

`README.md` 的「世界与时间」段替换为：

```markdown
### 世界与时间
- 真实时间推进：每个系统按自己的节奏走计时器，不再有「换季时一次性结算一切」的心跳
- 季节只作为环境系数（春夏秋冬改变产出、行军与战力），游戏时间由 `clock.elapsedMs` 唯一决定
- 建设 30 秒、训练 20 秒、研究 45 秒起、行军按距离、胜后整补 90 秒
- AI 三家各有独立决策节奏（60 / 75 / 90 秒）
- 离线最多补算 2 小时：资源、建设、研究、行军照常推进，但不结算敌袭与事件
- 城市行动改用冷却时间戳，不再是「本季已用」
```

`docs/设计说明.md` 的「实现阶段」段里把 P1 标注为「已完成（P1a 骨架）」，并补一行说明 P1b 待做的连续化与加冕倒计时。

- [ ] **Step 4: 打包并提交**

```bash
python3 build_single.py
git add README.md docs/设计说明.md
git commit -m "P1a: 同步文档到实时调度器版本"
```

---

## 完成标准

- 五套测试全绿：`structure` / `lords` / `migration` / `clock` / `campaign-balance`
- `grep -c "advanceSeason\|seasonLocks\|s\.turn" app.js` 输出 `0`
- 步进等价性测试通过：一次推进 2 小时 == 分 120 次每次 1 分钟
- 24 块可占领地全部可从开局位置抵达
- v3 存档迁移到 v4 后季节年份不跳变，`selfCheck` 通过
- 浏览器无控制台报错，离线 3 分钟后返回建设已推进且无敌袭

## 移交给 P1b 的接口

- `TIMER_DEFS` — 加 `drift` 计时器即可接入守军与稳定度的连续漂移
- `accrueTo(s, at)` — 知识、仓储损耗、训练衰减的连续化都写在这里
- `fireTimer(s, "season", ...)` — 目前仍在做一次性季度结算，P1b 把其中可连续化的部分搬进 `accrueTo`，剩下的变成「季度简报」
- `MAX_TURNS` 与 `great_lord` / `minor_lord` 结局 — P1b 用加冕倒计时取代
- `crownRequirements(s)` — P1b 改为「控制公爵三块直辖地」
- 研究队列并发（`1 + 学宫总等级 / 5`）— 设计文档列在 P1 范围内，但它与调度器无关，放在 P1b 一并实现

**P1b 注意事项：** 任何新的周期性系统都必须注册进 `TIMER_DEFS`，不要再往 `fireTimer` 的 `season` 分支里堆东西——那正是 `advanceSeason` 当初变成怪物的方式。
