# P2a 叛臣领主骨架 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 20 块非玩家可占领地各自绑定一名有名有姓的叛臣领主，并把「打服」路线接线到战斗结算里（领主被俘 → 四选一处置）。

**Architecture:** `territory.lordId` 是唯一真相源，领主辖地由 territories 派生。静态表 `LORD_DEFS`（由 `OFFICER_DEFS` 更名扩展）描述人物与叛变属性；运行时状态继续存在既有的 `s.officers` 数组里。存档版本 2 → 3。

**Tech Stack:** 纯 ES2022 浏览器脚本（`app.js`，无构建、无框架），Node 内置 `assert` 跑测试，`python3 build_single.py` 打包单文件版。

**基线：** 工作区已有未提交改动（摄政公爵入册、罗德里克换立绘、`defenderLeader` 接公爵）。开工前先提交或确认保留这些改动。

**关于拆分 app.js：** 本计划**不**拆分 app.js。拆分需要先决定模块策略（ESM / 全局 / 打包器），并同步改 `index.html` 与 `build_single.py`；在本增量里引入一次性的双模式 shim，只会重演「两套设计并存」的老问题。拆分留给 P0 收尾单独处理。

---

### Task 1: 把 OFFICER_DEFS 更名为 LORD_DEFS 并扩展叛臣字段

**Files:**
- Modify: `app.js:185-197`（表定义）、`app.js:1334`、`app.js:1339`、`app.js:1439`、`app.js:1447`、`app.js:1499-1501`、`app.js:2556`、`app.js:3319`（导出）
- Modify: `tests/structure.test.mjs:20-23`

- [ ] **Step 1: 写失败测试**

在 `tests/structure.test.mjs` 中，把现有两行 `game.OFFICER_DEFS.*` 断言替换为：

```js
assert.equal(game.LORD_DEFS.regent.age, 52);
assert.equal(game.LORD_DEFS.roderic.age, 44);
assert.equal(game.OFFICER_DEFS, undefined, "OFFICER_DEFS 已更名为 LORD_DEFS");
for (const [id, def] of Object.entries(game.LORD_DEFS)) {
  assert.ok(["liege", "vassal", "loyal"].includes(def.tier), `${id} 缺少合法 tier`);
  assert.ok(def.routes && ["force", "persuade", "bribe"].every(k => Number.isFinite(def.routes[k])), `${id} 缺少 routes`);
  assert.ok(Number.isFinite(def.defiance), `${id} 缺少 defiance`);
  assert.ok(Array.isArray(def.knights), `${id} 缺少 knights 数组`);
  if (def.liege) assert.equal(game.LORD_DEFS[def.liege].tier, "liege", `${id} 的主君必须是大叛臣`);
}
assert.equal(game.LORD_DEFS.regent.routes.persuade, 0, "摄政公爵不可说服");
```

同时把文件上方两条旧断言改掉——`side` 语义变了（不再有 `locked`，领主的 side 就是其势力），玩家一方现在是玩家 + 奥斯温两人：

```js
// 原：assert.equal(fresh.officers.filter(o => o.side === "player").length, 1, "开局只应有玩家一名领主");
// 原：assert.equal(fresh.officers.find(o => o.id === "renard").side, "locked");
assert.deepEqual(fresh.officers.filter(o => o.side === "player").map(o => o.id).sort(), ["oswin", "player"], "开局只有王子与死忠管家");
assert.equal(fresh.officers.find(o => o.id === "renard").side, "neutral", "雷纳德已叛变独立");
assert.equal(fresh.officers.find(o => o.id === "selma").side, "wolf", "附庸的 side 即其势力，不再是 locked");
assert.equal(fresh.officers.filter(o => o.side === "locked").length, 0, "locked 语义已移除");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/structure.test.mjs`
Expected: FAIL — `Cannot read properties of undefined (reading 'regent')`

- [ ] **Step 3: 更名并扩展**

把 `const OFFICER_DEFS = {` 改为 `const LORD_DEFS = {`，为 8 名深写人物补字段（在各自对象里追加，不改动已有字段）：

```js
  player:  { /* 既有字段 */ tier: "loyal",  faction: "player",  seat: "ravenstone", liege: null,   oldTie: "先王之子",                     defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: ["knight_2"] },
  regent:  { /* 既有字段 */ tier: "liege",  faction: "crown",   seat: "crownvale",  liege: null,   oldTie: "父亲加冕时的监誓人",           defiance: 95, routes: { force: 1,   persuade: 0,   bribe: 0 },   knights: ["knight_17", "knight_18"] },
  oswin:   { /* 既有字段 */ tier: "loyal",  faction: "player",  seat: null,         liege: null,   oldTie: "父亲的老管家，唯一没有走的人", defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: [] },
  renard:  { /* 既有字段 */ tier: "liege",  faction: "neutral", seat: "ashgate",    liege: null,   oldTie: "父亲的骑士长",                 defiance: 70, routes: { force: 1.2, persuade: 0.6, bribe: 0.2 }, knights: ["knight_3", "knight_4"] },
  ysabel:  { /* 既有字段 */ tier: "liege",  faction: "neutral", seat: "frostfield", liege: null,   oldTie: "父亲的财政官",                 defiance: 45, routes: { force: 0.7, persuade: 1.3, bribe: 0.6 }, knights: ["knight_5"] },
  edmund:  { /* 既有字段 */ tier: "liege",  faction: "neutral", seat: "crowstep",   liege: null,   oldTie: "父亲的私生侄，另一条继承线",   defiance: 85, routes: { force: 1,   persuade: 0.4, bribe: 0.5 }, knights: ["knight_6", "knight_7"] },
  aveline: { /* 既有字段 */ tier: "liege",  faction: "river",   seat: "riverwatch", liege: null,   oldTie: "父亲的河地总管",               defiance: 62, routes: { force: 1,   persuade: 1,   bribe: 0.8 }, knights: ["knight_19", "knight_20"] },
  bran:    { /* 既有字段 */ tier: "liege",  faction: "wolf",    seat: "highpass",   liege: null,   oldTie: "父亲的北境边将",               defiance: 78, routes: { force: 1,   persuade: 0.2, bribe: 0.3 }, knights: ["knight_9", "knight_10"] },
  roderic: { /* 既有字段 */ tier: "vassal", faction: "wolf",    seat: "stonejaw",   liege: "bran", oldTie: "父亲的关隘守将，欠饷十一年",   defiance: 55, routes: { force: 0.9, persuade: 0.7, bribe: 1.2 }, knights: ["knight_11"] }
```

删除 `maelis` 与 `elian` 两条（其角色由新的叛臣体系取代）。删除 `roderic` 上的 `recruitable: true` 和 `recruitCost: 38`。

把 `app.js` 中其余 8 处 `OFFICER_DEFS` 全部改为 `LORD_DEFS`，并把导出里的 `OFFICER_DEFS` 改为 `LORD_DEFS`。

**关键：同步改掉 `createInitialState` 里的 side 判定。** 旧逻辑是「敌人用自己的 side，可招募的算 neutral，其余一律 locked」，Task 2 加入的 13 名附庸既不在敌人白名单也没有 `recruitable`，会全部被判成不可交互的 `locked`。改为由 `tier` 决定：

```js
  const officers = Object.entries(LORD_DEFS).map(([id, d]) => {
    // 领主的 side 就是其势力；只有 tier "loyal" 的人（王子、老管家）站在玩家一边。
    const side = d.tier === "loyal" ? "player" : d.faction;
    return {
      id, ...clone(d), side, recruitable: false,
      name: id === "player" ? (name.trim() || "罗恩") : d.name,
      loyalty: d.loyalty, ambition: d.ambition, grievance: 0, merit: 0, injured: 0, fief: null,
      captured: false, rapport: 0, submitted: false, promisedFief: null
    };
  });
```

注意同时删掉了旧的 `recruitCost` 计算（叛臣不再能用金币直接买）。`locked` 语义就此消失。

顺带把势力标签改准确（`app.js:96` 附近）：

```js
  neutral: { name: "独立领主", color: "#8f866c" }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/structure.test.mjs`
Expected: PASS，输出 `structure tests passed`

- [ ] **Step 5: 提交**

```bash
git add app.js tests/structure.test.mjs
git commit -m "P2a: OFFICER_DEFS 更名 LORD_DEFS 并扩展叛臣字段"
```

---

### Task 2: 加入 13 名浅写附庸与 4 种原型

**Files:**
- Modify: `app.js`（紧接 `LORD_DEFS` 定义之后）
- Modify: `tests/structure.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/structure.test.mjs`：

```js
assert.equal(Object.keys(game.LORD_DEFS).length, 22, "8 名深写 + 13 名浅写 + 摄政公爵已含在深写内");
const rebels = Object.entries(game.LORD_DEFS).filter(([, d]) => d.tier !== "loyal");
assert.equal(rebels.length, 20, "应有 20 名叛臣");
const seats = rebels.map(([, d]) => d.seat);
assert.equal(new Set(seats).size, 20, "每名叛臣占据不同的主城");
assert.ok(seats.every(id => game.TERRITORY_DEFS[id] && game.TERRITORY_DEFS[id].playable !== false), "叛臣主城必须是可占领地");
assert.ok(!seats.includes("ravenstone"), "祖堡不能被叛臣占据");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/structure.test.mjs`
Expected: FAIL — `应有 20 名叛臣`（实际 8）

- [ ] **Step 3: 实现原型表与浅写领主**

在 `LORD_DEFS` 定义之后插入：

```js
// 浅写附庸只有名字、出身和倾向，用四种原型区分行为，不单独写剧本。
const LORD_ARCHETYPES = {
  garrison: { title: "守成领主", defiance: 42, routes: { force: 1,   persuade: 0.8, bribe: 0.7 }, trait: "守成", traitText: "只想守住自己的城墙，不主动惹事。" },
  venal:    { title: "贪财领主", defiance: 35, routes: { force: 0.9, persuade: 0.5, bribe: 1.4 }, trait: "贪财", traitText: "开价明确，钱到位就换旗。" },
  loyalist: { title: "忠仆领主", defiance: 50, routes: { force: 1.1, persuade: 0.4, bribe: 0.3 }, trait: "死忠", traitText: "认死主君，除非主君先倒下。" },
  waverer:  { title: "观望领主", defiance: 30, routes: { force: 0.9, persuade: 1.2, bribe: 1   }, trait: "观望", traitText: "谁看着能赢就跟谁，最容易被说动。" }
};

// [id, 姓名, 主城, 势力, 主君, 原型, 初始骑士]
const MINOR_LORD_ROWS = [
  ["gilbert", "吉尔伯特·铺石", "duchyroad",   "crown",   "regent",  "loyalist", ["knight_21"]],
  ["alwin",   "阿尔文·麦茬",   "crownfield",  "crown",   "regent",  "garrison", ["knight_22"]],
  ["luca",    "卢卡·浅滩",     "kingsford",   "crown",   "regent",  "venal",    []],
  ["harald",  "哈拉尔·牙岩",   "wolfden",     "wolf",    "bran",    "loyalist", ["knight_12"]],
  ["morton",  "莫尔顿·泥步",   "redfen",      "wolf",    "bran",    "waverer",  []],
  ["selma",   "塞尔玛·灰穗",   "ashfield",    "wolf",    "bran",    "venal",    ["knight_13"]],
  ["otto",    "奥托·松脂",     "pineford",    "wolf",    "bran",    "garrison", ["knight_14"]],
  ["piers",   "皮尔斯·双道",   "crossford",   "river",   "aveline", "venal",    ["knight_23"]],
  ["vera",    "薇拉·苇心",     "reedbank",    "river",   "aveline", "waverer",  []],
  ["conrad",  "康拉德·盐税",   "saltbridge",  "river",   "aveline", "venal",    ["knight_24"]],
  ["hanna",   "汉娜·磨坊",     "millrun",     "river",   "aveline", "garrison", []],
  ["godwin",  "戈德温·灰枝",   "greywood",    "neutral", null,      "garrison", ["knight_15"]],
  ["miro",    "米罗·秤星",     "tradersrest", "neutral", null,      "venal",    ["knight_16"]]
];

MINOR_LORD_ROWS.forEach(([id, name, seat, faction, liege, archetypeId, knights], index) => {
  const archetype = LORD_ARCHETYPES[archetypeId];
  LORD_DEFS[id] = {
    name, title: `${archetype.title} · ${TERRITORY_DEFS[seat].name}`,
    portrait: null,                       // 浅写领主没有立绘，由家徽兜底
    side: faction, age: 34 + (index % 5) * 6,
    tier: "vassal", faction, seat, liege, archetype: archetypeId,
    oldTie: `父亲在世时管理${TERRITORY_DEFS[seat].name}的旧吏`,
    defiance: archetype.defiance, routes: { ...archetype.routes }, knights,
    trait: archetype.trait, traitText: archetype.traitText,
    stats: { force: 44 + (index % 6) * 5, command: 40 + (index % 5) * 6, scheme: 38 + (index % 7) * 5, govern: 42 + (index % 4) * 7, charm: 40 + (index % 6) * 6 },
    loyalty: 50, ambition: 30 + (index % 5) * 8
  };
});
```

注意：独立叛臣（`godwin` / `miro`）的 `liege` 为 `null`，但 `tier` 仍为 `vassal`——他们没有主君也没有附庸。Task 1 的测试只校验「有 liege 的，其 liege 必须是 liege 层级」，因此不冲突。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/structure.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/structure.test.mjs
git commit -m "P2a: 加入 13 名浅写附庸与四种领主原型"
```

---

### Task 3: territory.lordId 绑定与派生辅助函数

**Files:**
- Modify: `app.js`（`createInitialState` 内领地初始化，约 `app.js:1322-1333`）
- Modify: `app.js`（在 `ownTerritoryIds` 附近新增辅助函数）
- Create: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `tests/lords.test.mjs`：

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

const s = game.createInitialState("领主测试", "oath", "standard");

// 每块非玩家的可占领地都有守将，且守将存在于名册
const rebelHeld = game.playableTerritoryIds().filter(id => s.territories[id].owner !== "player");
assert.equal(rebelHeld.length, 20, "开局应有 20 块叛臣领地");
for (const id of rebelHeld) {
  const lordId = s.territories[id].lordId;
  assert.ok(lordId, `${id} 缺少 lordId`);
  assert.ok(game.LORD_DEFS[lordId], `${id} 的 lordId ${lordId} 不在名册中`);
}
// 玩家领地没有叛臣守将
for (const id of game.playableTerritoryIds().filter(id => s.territories[id].owner === "player")) {
  assert.equal(s.territories[id].lordId, null, `${id} 是玩家领地，不应有叛臣守将`);
}
// 派生函数
assert.equal(game.lordAt(s, "highpass").id, "bran");
assert.equal(game.lordAt(s, "ravenstone"), null);
assert.deepEqual(game.lordHoldings(s, "bran"), ["highpass"], "布兰只直辖北境关，附庸的地不算他的");
assert.deepEqual(game.lordVassals(s, "bran").map(l => l.id).sort(), ["harald", "morton", "otto", "roderic", "selma"]);
assert.deepEqual(game.lordVassals(s, "renard"), [], "独立叛臣没有附庸");

// 打下一块地后，该地不再有守将
s.territories.highpass.owner = "player";
s.territories.highpass.lordId = null;
assert.equal(game.lordAt(s, "highpass"), null);
assert.deepEqual(game.lordHoldings(s, "bran"), [], "失去全部辖地的领主辖地列表为空");

console.log("lords tests passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.lordAt is not a function`

- [ ] **Step 3: 实现绑定与派生函数**

在 `createInitialState` 的领地初始化循环里，给每条领地记录加 `lordId`。先在 `LORD_DEFS` 之后建立反查表：

```js
// 主城 → 领主 的反查表。territory.lordId 是运行时真相源，这里只提供开局初值。
const SEAT_TO_LORD = Object.fromEntries(
  Object.entries(LORD_DEFS).filter(([, d]) => d.tier !== "loyal" && d.seat).map(([id, d]) => [d.seat, id])
);
```

在领地初始化对象里追加一行：

```js
      lordId: d.owner === "player" ? null : (SEAT_TO_LORD[id] || null),
```

在 `owns` 定义之后新增：

```js
function lordAt(s, territoryId) {
  const lordId = s?.territories?.[territoryId]?.lordId;
  return lordId ? (officer(s, lordId) || null) : null;
}

// 辖地由 territories 派生，不单独存储，因此永远不会和地图对不上。
function lordHoldings(s, lordId) {
  return Object.keys(s?.territories || {}).filter(id => s.territories[id].lordId === lordId);
}

function lordVassals(s, lordId) {
  return (s?.officers || []).filter(o => LORD_DEFS[o.id]?.liege === lordId && o.side !== "player" && o.side !== "gone");
}
```

把 `lordAt, lordHoldings, lordVassals, LORD_DEFS, SEAT_TO_LORD` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs`
Expected: 两个测试都 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2a: territory.lordId 绑定与辖地派生函数"
```

---

### Task 4: 骑士依附于领主

**Files:**
- Modify: `app.js:206-220`（`KNIGHT_DEFS`）、`createKnightRoster`
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（放在文件末尾 `console.log` 之前）：

```js
const ks = game.createInitialState("骑士依附", "oath", "standard");
const beren = ks.knights.find(k => k.id === "knight_2");
assert.equal(beren.liegeLordId, "player", "开局死忠骑士效忠玩家");
assert.equal(beren.side, "player");
assert.equal(beren.status, "active");
assert.equal(ks.knights.find(k => k.id === "knight_9").liegeLordId, "bran");
assert.equal(ks.knights.find(k => k.id === "knight_17").liegeLordId, "regent");
const free = ks.knights.filter(k => k.liegeLordId === null);
assert.deepEqual(free.map(k => k.id).sort(), ["knight_1", "knight_8"], "两名游侠骑士不依附任何领主");
// 名册里每个 knights 条目都必须对应真实骑士，且不重复
const claimed = Object.values(game.LORD_DEFS).flatMap(d => d.knights);
assert.equal(new Set(claimed).size, claimed.length, "同一名骑士不能被两名领主认领");
assert.ok(claimed.every(id => ks.knights.some(k => k.id === id)), "名册引用了不存在的骑士");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `开局死忠骑士效忠玩家`（`liegeLordId` 为 undefined）

- [ ] **Step 3: 实现依附**

把 `KNIGHT_DEFS` 的 `side` 改为由主君派生，并新增 `liegeLordId`。替换 `KNIGHT_DEFS` 与 `createKnightRoster`：

```js
// 骑士归属由 LORD_DEFS[].knights 决定；liegeLordId 是运行时可变状态（可被招降、释放）。
const KNIGHT_LIEGE = {};
Object.entries(LORD_DEFS).forEach(([lordId, def]) => (def.knights || []).forEach(knightId => { KNIGHT_LIEGE[knightId] = lordId; }));

const KNIGHT_DEFS = KNIGHT_NAMES.map((name, index) => {
  const id = `knight_${index + 1}`;
  const liegeLordId = KNIGHT_LIEGE[id] || null;
  return {
    id, name, liegeLordId,
    side: liegeLordId ? LORD_DEFS[liegeLordId].faction : "neutral",
    status: liegeLordId === "player" ? "active" : "available",
    force: 48 + (index % 7) * 5,
    command: 42 + (index % 6) * 6,
    scheme: 38 + (index % 8) * 6,
    loyalty: 52 + (index % 5) * 4,
    recruitCost: 8 + (index % 4) * 3
  };
});
```

`createKnightRoster` 不变（它已经是 `clone(def)`）。

注意：`KNIGHT_DEFS` 现在依赖 `LORD_DEFS`，必须定义在 `LORD_DEFS` 与 `MINOR_LORD_ROWS` 之后。若当前位置在其之前，把 `KNIGHT_NAMES` / `KNIGHT_DEFS` / `createKnightRoster` 整块移动到 `MINOR_LORD_ROWS.forEach(...)` 之后。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs`
Expected: 两个测试都 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2a: 骑士依附于领主，取消按索引分配阵营"
```

---

### Task 5: 存档版本 3 与 v2→v3 迁移

**Files:**
- Modify: `app.js:4`（`VERSION`）、`migrateSave`、新增 `migrateV2ToV3`
- Create: `tests/migration.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `tests/migration.test.mjs`：

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

assert.equal(game.VERSION, 3, "存档版本应升到 3");

// 构造一份 v2 存档：含 locked 旧臣、已招募的 maelis、无 lordId、无 liegeLordId
const v2 = JSON.parse(JSON.stringify(game.createInitialState("旧档", "oath", "standard")));
v2.version = 2;
Object.values(v2.territories).forEach(t => { delete t.lordId; });
v2.knights.forEach(k => { delete k.liegeLordId; });
v2.officers = v2.officers.filter(o => o.id !== "regent");
v2.officers.forEach(o => { delete o.rapport; delete o.submitted; if (o.id === "renard") o.side = "locked"; });
v2.officers.push({ id: "maelis", name: "梅利斯·灰帆", side: "player", loyalty: 60, stats: { force: 42, command: 55, scheme: 86, govern: 68, charm: 71 } });
v2.officers.push({ id: "elian", name: "伊莲·鸦羽", side: "neutral", loyalty: 52, stats: { force: 64, command: 72, scheme: 76, govern: 52, charm: 81 } });

const m = game.hydrateState(v2);
assert.ok(m, "v2 存档必须能迁移");
assert.equal(m.version, 3);

// 规则 1：非玩家可占领地都补上了 lordId
for (const id of game.playableTerritoryIds().filter(id => m.territories[id].owner !== "player")) {
  assert.ok(m.territories[id].lordId, `${id} 迁移后仍缺 lordId`);
}
// 规则 2：officer 记录补齐叛臣运行时字段
for (const o of m.officers) {
  assert.equal(o.rapport, 0, `${o.id} 缺少 rapport`);
  assert.equal(o.captured, false);
  assert.equal(o.submitted, false);
  assert.equal(o.promisedFief, null);
}
// 规则 3：locked 旧臣转为其座城的叛臣
const renard = m.officers.find(o => o.id === "renard");
assert.notEqual(renard.side, "locked", "旧臣不应再停留在 locked");
assert.equal(m.territories.ashgate.lordId, "renard", "雷纳德应据守灰门");
// 规则 4：已招募的 maelis 保留为无封地的己方领主
const maelis = m.officers.find(o => o.id === "maelis");
assert.ok(maelis && maelis.side === "player", "已招募的浪人应保留");
assert.equal(maelis.tier, "loyal");
assert.equal(maelis.seat, null);
// 规则 5：未招募的 elian 从名册移除
assert.equal(m.officers.find(o => o.id === "elian"), undefined, "未招募的浪人应被移除");
// 规则 6：骑士补 liegeLordId
assert.equal(m.knights.find(k => k.id === "knight_9").liegeLordId, "bran");
assert.equal(m.knights.find(k => k.id === "knight_2").liegeLordId, "player");

assert.equal(game.selfCheck(m).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m).errors)}`);

// v1 仍然能一路迁到 v3
const v1 = JSON.parse(JSON.stringify(v2));
v1.version = 1; v1.ap = 3; delete v1.clock; delete v1.jobs; delete v1.tech;
const m1 = game.migrateSave(v1);
assert.ok(m1 && m1.version === 3, "v1 应能连续迁移到 v3");
assert.ok(!("ap" in m1));

console.log("migration tests passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/migration.test.mjs`
Expected: FAIL — `存档版本应升到 3`（实际 2）

- [ ] **Step 3: 实现迁移**

把 `app.js:4` 改为 `const VERSION = 3;`。

新增迁移函数（放在 `migrateV1ToV2` 之后）：

```js
function migrateV2ToV3(raw) {
  const migrated = clone(raw);
  migrated.version = 3;
  // 1. 按名册给每块非玩家可占领地补守将
  Object.keys(migrated.territories || {}).forEach(id => {
    const t = migrated.territories[id];
    t.lordId = t.owner === "player" ? null : (SEAT_TO_LORD[id] || t.lordId || null);
  });
  // 2/3/4/5. 整理领主名册
  migrated.officers = (migrated.officers || []).filter(o => {
    const def = LORD_DEFS[o.id];
    if (def) return true;
    return o.side === "player";               // 已招募的旧浪人保留，未招募的移除
  }).map(o => {
    const def = LORD_DEFS[o.id];
    const next = { ...o, rapport: o.rapport ?? 0, captured: o.captured ?? false, submitted: o.submitted ?? false, promisedFief: o.promisedFief ?? null };
    if (!def) return { ...next, tier: "loyal", faction: "player", seat: null, liege: null, defiance: 0, routes: { force: 0, persuade: 0, bribe: 0 }, knights: [] };
    // locked 旧臣转为其座城的叛臣
    if (next.side === "locked") next.side = def.faction;
    return { ...next, tier: def.tier, faction: def.faction, seat: def.seat, liege: def.liege, defiance: def.defiance, routes: { ...def.routes } };
  });
  // 名册里新增而存档里没有的领主（如摄政公爵、13 名附庸）补进去
  Object.entries(LORD_DEFS).forEach(([id, def]) => {
    if (migrated.officers.some(o => o.id === id)) return;
    migrated.officers.push({
      id, ...clone(def), side: def.faction, recruitable: false,
      grievance: 0, merit: 0, injured: 0, fief: null,
      rapport: 0, captured: false, submitted: false, promisedFief: null
    });
  });
  // 6. 骑士补 liegeLordId
  migrated.knights = (migrated.knights || []).map(k => ({
    ...k,
    liegeLordId: k.liegeLordId !== undefined ? k.liegeLordId : (KNIGHT_LIEGE[k.id] || null)
  }));
  migrated.migrationLog = [...(migrated.migrationLog || []), "v2-to-v3"];
  return migrated;
}
```

把 `migrateSave` 改为逐级迁移：

```js
function migrateSave(raw, now = Date.now()) {
  if (!raw) return null;
  let migrated = clone(raw);
  if (migrated.version === 1 || migrated.version == null) migrated = migrateV1ToV2(migrated, now);
  if (migrated.version === 2) migrated = migrateV2ToV3(migrated);
  if (migrated.version !== VERSION) return null;
  return hydrateV3(migrated);
}
```

把 `hydrateV2` 更名为 `hydrateV3`，并把函数内首行的版本判断改为 `raw.version !== VERSION`。同时删除 `hydrateV2` 里已失效的两行（`OFFICER_DEFS` 补录 recruitable 领主、locked→neutral 提升），它们的职责已由迁移函数接管：

```js
  // 删除这两行：
  // Object.entries(OFFICER_DEFS).filter(([, def]) => def.recruitable && ...).forEach(...)
  // raw.officers.forEach(o => { if (OFFICER_DEFS[o.id]?.recruitable && o.side === "locked") o.side = "neutral"; });
```

`migrateV1ToV2` 里的 `migrated.version = VERSION;` 改为 `migrated.version = 2;`（它只负责升到 2）。

把 `KNIGHT_LIEGE`、`migrateV2ToV3` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/migration.test.mjs && node tests/lords.test.mjs && node tests/structure.test.mjs`
Expected: 三个测试都 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/migration.test.mjs
git commit -m "P2a: 存档升到 v3，补领主绑定与骑士依附的迁移"
```

---

### Task 6: 每块地都有守将（defenderLeader 接线）

**Files:**
- Modify: `app.js`（`defenderLeader`，约 `app.js:2052-2058`）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`：

```js
const ds = game.createInitialState("守将测试", "oath", "standard");
assert.equal(game.defenderLeader(ds, "highpass").id, "bran", "北境关由布兰亲守");
assert.equal(game.defenderLeader(ds, "wolfden").id, "harald", "狼穴由附庸哈拉尔守");
assert.equal(game.defenderLeader(ds, "crownvale").id, "regent");
assert.equal(game.defenderLeader(ds, "ashgate").id, "renard", "独立叛臣也是守将");
assert.equal(game.defenderLeader(ds, "ravenstone"), null, "玩家领地没有敌方守将");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `狼穴由附庸哈拉尔守`（返回 null）

- [ ] **Step 3: 用 lordAt 替换硬编码**

```js
function defenderLeader(s, targetId) {
  if (owns(s, targetId)) return null;
  const lord = lordAt(s, targetId);
  return lord && lord.side !== "player" && lord.side !== "gone" ? lord : null;
}
```

把 `defenderLeader` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS（平衡模拟仍会打印已知缺陷警告，这是预期的）

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2a: 每块叛臣领地都有具名守将"
```

---

### Task 7: 打服路线 —— 领主被俘

**Files:**
- Modify: `app.js`（`finishBattle` 胜利分支，约 `app.js:2351-2388`）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`：

```js
const bs = game.createInitialState("被俘测试", "iron", "standard");
const fixed = v => () => v;
const sess = game.startBattle(bs, { targetId: "ashfield", leaderIds: ["player"], troops: bs.troops, plan: "assault" }, fixed(.8));
assert.ok(sess);
game.applyBattleChoice(bs, "forced", fixed(.9));
game.applyBattleChoice(bs, "charge", fixed(.9));
game.applyBattleChoice(bs, "press", fixed(.9));
assert.equal(bs.territories.ashfield.owner, "player", "灰麦原应被攻下");
assert.equal(bs.territories.ashfield.lordId, null, "攻下后该地不再有叛臣守将");
const selma = bs.officers.find(o => o.id === "selma");
assert.equal(selma.captured, true, "失去全部辖地的守将被俘");
assert.ok(bs.pendingDecisions.some(d => d.type === "lord_capture" && d.lordId === "selma"), "应产生领主处置决策");
assert.ok(!bs.pendingDecisions.some(d => d.type === "conquest"), "旧的战后处置已被领主处置取代");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `攻下后该地不再有叛臣守将`

- [ ] **Step 3: 实现被俘**

在 `finishBattle` 的 `outcome === "win"` 分支里，把 `t.fiefHolder = null;` 之后的守将处理整段替换。删除原先的 `submissive` / `waiting` 解锁逻辑与 `conquest` 决策推送，改为：

```js
    const fallenLord = lordAt(s, targetId);
    t.lordId = null;
    if (fallenLord) {
      const stillHolds = lordHoldings(s, fallenLord.id).length;
      if (stillHolds === 0) {
        // 失去最后一块辖地才被俘；仍有其他城的领主只是退走。
        fallenLord.captured = true;
        s.pendingDecisions.push({ type: "lord_capture", lordId: fallenLord.id, territoryId: targetId });
        log(s, "info", `${fallenLord.name}失去最后一座城，在${targetName}城下被俘。`);
      } else {
        log(s, "warn", `${fallenLord.name}退往${TERRITORY_DEFS[lordHoldings(s, fallenLord.id)[0]].name}，仍有${stillHolds}座城在手。`);
      }
      // 该领主名下的骑士按 45% 被俘，其余战死
      (s.knights || []).filter(k => k.liegeLordId === fallenLord.id && k.status === "available").forEach(knight => {
        if (rng() < .45) { knight.status = "captured"; knight.captured = true; log(s, "info", `${knight.name}在${targetName}城下被俘。`); }
        else { knight.status = "gone"; knight.side = "gone"; }
      });
    }
```

保留原先紧随其后的 `log(s, "good", ...)` 占领播报。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs`
Expected: PASS

`tests/structure.test.mjs` 中断言战后 `renard.injured === 0` 的那条仍成立；若报「conquest 决策缺失」，把该断言改为检查 `lord_capture`。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs tests/structure.test.mjs
git commit -m "P2a: 攻城胜利改为俘获守将并牵连其骑士"
```

---

### Task 8: 被俘领主的四选一处置

**Files:**
- Modify: `app.js`（`decisionView`，在 `conquest` 分支位置替换）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`：

```js
const cs = game.createInitialState("处置测试", "oath", "standard");
const target = cs.officers.find(o => o.id === "selma");
target.captured = true;
cs.territories.ashfield.owner = "player";
cs.territories.ashfield.lordId = null;
const view = game.decisionView(cs, { type: "lord_capture", lordId: "selma", territoryId: "ashfield" });
assert.ok(view, "应能渲染领主处置视图");
assert.deepEqual(view.options.map(o => o.name.slice(0, 4)), ["接受效忠", "收取赎金", "放逐他，", "处死他，"]);

// 接受效忠
const submit = JSON.parse(JSON.stringify(cs));
game.decisionView(submit, { type: "lord_capture", lordId: "selma", territoryId: "ashfield" }).options[0].effect();
const joined = submit.officers.find(o => o.id === "selma");
assert.equal(joined.side, "player");
assert.equal(joined.loyalty, 45, "打服的忠诚基线为 45");
assert.equal(joined.captured, false);

// 处死：正统性下降，其骑士转为死敌
const execute = JSON.parse(JSON.stringify(cs));
execute.knights.find(k => k.id === "knight_13").status = "captured";
const before = execute.legitimacy;
game.decisionView(execute, { type: "lord_capture", lordId: "selma", territoryId: "ashfield" }).options[3].effect();
assert.equal(execute.officers.find(o => o.id === "selma").side, "gone");
assert.equal(execute.legitimacy, before - 10, "处死扣 10 正统性");
assert.equal(execute.knights.find(k => k.id === "knight_13").status, "hostile", "其骑士转为死敌");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `应能渲染领主处置视图`（返回 null）

- [ ] **Step 3: 实现处置视图**

在 `decisionView` 中，把整个 `if (decision.type === "conquest") { ... }` 分支替换为：

```js
  if (decision.type === "lord_capture") {
    const lord = officer(s, decision.lordId);
    const d = TERRITORY_DEFS[decision.territoryId];
    if (!lord) return null;
    const ransom = Math.round(lord.defiance * 4);
    const release = () => { lord.captured = false; lord.side = "gone"; };
    return {
      kicker: "战后处置", title: `${lord.name}被押到你面前`, portrait: lord.portrait || "assets/player.webp",
      body: `<p>${d.name}已经换旗。${esc(lord.name)}——${esc(lord.oldTie || "父亲旧部")}——在城下被俘，等待你的处置。</p><p>他名下的骑士也在等同一个结果。</p>`,
      options: [
        { name: "接受效忠，让他重新宣誓", note: "加入你的领主议会，忠诚 45；王室正统性 +4", effect() {
          lord.side = "player"; lord.captured = false; lord.loyalty = 45; lord.grievance = clamp((lord.grievance || 0) + 10); lord.submitted = true;
          s.legitimacy = clamp(s.legitimacy + 4); s.style.oath++;
          (s.knights || []).filter(k => k.liegeLordId === lord.id && k.status === "captured").forEach(k => { k.status = "active"; k.side = "player"; k.captured = false; });
          log(s, "good", `${lord.name}重新向渡鸦家宣誓效忠。`);
        } },
        { name: `收取赎金 ${ransom} 金币`, note: `金币 +${ransom}；王室正统性 −2；该领主离场`, effect() {
          release(); s.gold += ransom; s.legitimacy = clamp(s.legitimacy - 2); s.style.wealth += 2;
          log(s, "info", `${lord.name}付清赎金后离开北境。`);
        } },
        { name: "放逐他，禁止再次返回", note: "军心 +5；王室正统性 −3", effect() {
          release(); s.morale = clamp(s.morale + 5); s.legitimacy = clamp(s.legitimacy - 3); s.style.iron++;
          log(s, "warn", `${lord.name}被逐出北境。`);
        } },
        { name: "处死他，立威于北境", note: "邻近领主抵抗 −5；王室正统性 −10；其骑士永为死敌", effect() {
          lord.captured = false; lord.side = "gone";
          s.legitimacy = clamp(s.legitimacy - 10); s.style.iron += 2;
          (s.knights || []).filter(k => k.liegeLordId === lord.id && k.status !== "gone").forEach(k => { k.status = "hostile"; k.side = "gone"; k.captured = false; });
          (TERRITORY_DEFS[decision.territoryId].adj || []).forEach(id => {
            const neighbour = lordAt(s, id);
            if (neighbour) neighbour.defiance = Math.max(0, (neighbour.defiance || 0) - 5);
          });
          log(s, "bad", `${lord.name}在${d.name}城前被处死。消息传遍北境。`);
        } }
      ]
    };
  }
```

同时删除 `decisionView` 里的 `submission` 分支（其职责已由 `lord_capture` 覆盖），并删除 `finishBattle` 中推送 `submission` 决策的那一行。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2a: 被俘领主的效忠/赎金/放逐/处死四选一处置"
```

---

### Task 9: selfCheck 扩展、将领页最小改造、平衡模拟统计

**Files:**
- Modify: `app.js`（`selfCheck`、`renderCourt`、删除 `recruitOfficer`）
- Modify: `tests/campaign-balance.sim.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`：

```js
const bad = game.createInitialState("自检测试", "oath", "standard");
bad.territories.highpass.lordId = "nobody";
const check = game.selfCheck(bad);
assert.equal(check.ok, false);
assert.ok(check.errors.some(e => e.includes("nobody")), `自检应报出无效 lordId，实际：${JSON.stringify(check.errors)}`);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `自检应报出无效 lordId`

- [ ] **Step 3: 实现三处改造**

在 `selfCheck` 的 `return` 之前插入：

```js
  if (s && s.territories) Object.entries(s.territories).forEach(([id, t]) => {
    if (t.lordId && !LORD_DEFS[t.lordId]) errors.push(`territory ${id} has unknown lordId ${t.lordId}`);
    if (t.owner === "player" && t.lordId) errors.push(`player territory ${id} still has lordId ${t.lordId}`);
  });
```

删除 `recruitOfficer` 函数（叛臣不再能用金币直接招募，该路线由 P2b 的说服/收买取代）。

在 `renderCourt` 中，把「可招募领主」整段替换为只读的叛臣名册。定位 `<div class="section-head"><h2>可招募领主</h2>` 那一整行模板，替换为：

```js
    <div class="section-head"><h2>北境叛臣</h2><span>父亲死后各自独立 · 打服后可处置</span></div>
    <div class="officer-grid">${Object.values(LORD_DEFS).filter(def => def.tier !== "loyal").map(def => {
      const lord = officer(S, def.id);
      if (!lord || lord.side === "player" || lord.side === "gone") return "";
      const holdings = lordHoldings(S, def.id);
      const liege = def.liege ? LORD_DEFS[def.liege].name : "独立";
      const status = lord.captured ? "已被俘，待处置" : holdings.length ? `据守${holdings.map(id => TERRITORY_DEFS[id].name).join("、")}` : "已失去全部辖地";
      return `<article class="officer-card enemy"><div class="card-copy"><div class="role-line"><h3>${esc(def.name)}</h3><span>${esc(def.title)}</span></div>
        <p>${esc(def.oldTie || "")}<br>主君：${esc(liege)} · 抵抗 ${lord.defiance ?? def.defiance}</p>
        <div class="loyalty-line"><span>${esc(status)}</span><b>${holdings.length}座城</b></div></div></article>`;
    }).join("")}</div>
```

删除 `renderCourt` 末尾绑定 `[data-recruit-officer]` 的那一行，以及 `module.exports` 里的 `recruitOfficer`。

最后更新 `tests/campaign-balance.sim.mjs` 的决策偏好——它仍在分支已被删除的 `conquest` 与 `submission` 类型。把 `resolveDecisions` 里的 `preferred` 计算替换为：

```js
    const preferred = decision.type === "lord_capture"
      ? available.find(option => option.name.startsWith("接受效忠"))
      : decision.type === "iron_crown"
        ? available[0]
        : available.find(option => !/[−-](?:2[5-9]|[3-9]\d)/.test(option.note));
```

并在 `run()` 的返回对象里加入被俘领主统计，便于观察打服路线是否真的在跑：

```js
    capturedLords: state.officers.filter(o => o.submitted).length,
```

在末尾的 `console.log` 汇总里加一行 `平均收服领主: avg("capturedLords"),`，并加一条断言：

```js
assert.ok(Number(avg("capturedLords")) > 0, "打服路线必须能实际收服到领主");
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/migration.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS

浏览器实跑一遍：`python3 -m http.server 8788`，开新档，进「将领」页确认叛臣名册渲染正常且无控制台报错；打下灰麦原确认弹出四选一处置。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2a: 自检校验领主绑定，将领页改为叛臣名册"
```

---

### Task 10: 同步文档与打包

**Files:**
- Modify: `README.md`
- Modify: `docs/设计说明.md`

- [ ] **Step 1: 重写 README 的「已实现」段**

`README.md` 现有条目大量与代码不符（7 领地、行动点、6 领开王冠谷、商站城约、领地政策）。把 `## 已实现` 到 `## 启动` 之间的全部内容替换为：

```markdown
## 已实现

### 世界与时间
- 12 年 48 季主战役，每季 5 分钟真实时间自动推进；金币与粮食按秒流动，四季系数不同
- 建设 30 秒、训练 20 秒、研究 45 秒起、行军按距离、胜后整补 90 秒；支持倒计时、离线补算与幂等结算
- 事件采用 Soft Pause，暂停期间不产生换季时间债

### 地图与叛臣
- 北境地图 36 个节点，其中 24 块可占领；玩家开局持有渡鸦堡、黑棘镇、麦田镇、铁溪镇
- 其余 20 块各由一名有名有姓的叛臣领主据守——他们都是先王的旧臣，在先王死后各自独立
- 层级结构：摄政公爵、布兰·狼牙、艾芙琳·多尔为大叛臣，各领若干附庸；雷纳德、伊莎贝尔、埃德蒙独立割据
- 深写领主 8 人（含唯一没有叛变的老管家奥斯温），浅写附庸 13 人，分守成、贪财、死忠、观望四种原型

### 战争
- 三阶段战役：接近敌军、正面交战、最后阶段；弓手轮射与骑士冲锋由实际编成解锁
- 六类兵种（长矛兵、弓箭手、披甲骑士、重步兵、弩手、轻骑兵），各有等级、地形表现与克制关系
- 平原、密林、山地、河网、王城地形克制；四季改变实际战力与补给
- 军团制：可从主力抽调组建由王子或骑士带领的军团，单独出征或合军
- 出征前显示胜算预测、预计伤亡与地形建议
- 攻城胜利后守将若失去最后一块辖地则被俘，可选择接受效忠、收赎金、放逐或处死；其骑士按概率被俘或战死

### 经营
- 农田、集市、兵营、城墙、粮仓、学宫、军械工坊、驿道、烽火台、神殿十类五级建设
- 农业、军事、行政、商贸、攻城五条科技树共 25 项，每项三阶，全局单研究队列
- 金币、粮食、知识、民心、军心、威望、王室正统性

### 其他
- 24 名骑士依附于各自主君，不再是花钱按钮
- 本地自动存档；存档 v1 → v2 → v3 逐级迁移
- 无后端、无 CDN、无数据上传；所有世界观与人物均为原创架空设定

## 尚未实现

- 说服与收买两条收服路线、王室正统性进入说服阻力公式（P2b）
- 季降级为纯环境系数、冷却取代 seasonLocks、离线补算放宽（P1）
- 地图分层与扩张（P3）
- 科技树成本与王冠谷门槛的配平（P4，当前 18 领门槛不可达）
```

并把「检查与封装」段的命令补全：

```bash
node --check app.js
node tests/structure.test.mjs
node tests/lords.test.mjs
node tests/migration.test.mjs
node tests/campaign-balance.sim.mjs
python3 build_single.py
```

- [ ] **Step 2: 重写 docs/设计说明.md**

现有内容描述的是已废弃的 7 领地 + 行动点版本。整个文件替换为：

```markdown
# 《模拟中世纪领主·铁冠之路》设计说明

## 一句话

父亲远征失败后，玩家继承渡鸦堡。曾臣服于父亲的领主们在他死后各自独立，玩家要把他们重新纳入渡鸦家的旗下。

## 核心循环

经营产出 → 养活人口与军队 → 收服叛臣（打服 / 说服 / 收买）→ 处理战损与战后统治 → 新领地扩大产出与边境 → 更大的冬季、功臣与反攻压力。

## 三条收服路线

- **打服**：攻城胜利后守将被俘，四选一处置。见效确定，但有战损，且处死会大幅拉低正统性。
- **说服**：派使者累积个人好感，配合王室正统性与邻近压力压低抵抗，成功后辖地与骑士一并带过来，无战损。
- **收买**：金币加封地承诺，见效最快，代价是正统性与忠诚基线，承诺未兑现会翻倍反噬。

路线效力因人而异。摄政公爵是篡位者，唯一只能打；布兰只服强者；伊莎贝尔在正统性够高时会主动回归。

## 王室正统性

不直接解锁任何东西，只降低所有说服的难度：

```
说服阻力 = defiance − (正统性 × 0.6 + 好感 × 0.8 + 邻近压力 × 0.5) × routes.persuade
```

邻近压力让打仗与说服互相供能：打下他的邻居会让他更容易谈。而屠城式扩张堆邻近压力最快，却持续拉低正统性，最终反噬后面所有人。

## 数据约定

`territory.lordId` 是领主归属的唯一真相源，领主辖地由 territories 派生，不单独存储。骑士的初始归属写在 `LORD_DEFS[].knights`，运行时归属存在 `knight.liegeLordId`。

## 实现阶段

- **P0** 清理回合制遗留（已完成）
- **P2a** 叛臣骨架与打服路线（本阶段）
- **P2b** 说服与收买路线、正统性接线、将领页重做
- **P1** 实时化：季降级为环境系数，冷却取代 seasonLocks，放宽离线补算
- **P3** 地图分层与扩张
- **P4** 数值配平

详细设计见 `docs/superpowers/specs/2026-08-09-rebel-lords-design.md`。
```

- [ ] **Step 3: 打包并确认体积正常**

Run: `python3 build_single.py`
Expected: 输出 `built .../模拟中世纪领主-单文件版.html (约 5.5 MB)`

- [ ] **Step 4: 提交**

```bash
git add README.md docs/设计说明.md
git commit -m "P2a: 同步 README 与设计说明到叛臣领主版本"
```

---

## 完成标准

- 五条命令全绿：`node --check app.js`、三个测试、平衡模拟
- 新开档：20 块非玩家领地各有具名守将，地图点开任意敌方领地能看到守将名
- 攻下一块地：若该守将失去最后一块辖地则被俘，弹出四选一处置；其骑士按 45% 被俘、其余战死
- 处死领主：正统性 −10，其骑士全部 `hostile`，相邻领主 `defiance` −5
- 旧 v2 存档能迁移到 v3 且 `selfCheck` 通过
- 浏览器无控制台报错

## 移交给 P2b 的接口

P2a 落地后，以下字段已就位但尚无消费者，由 P2b 接线：

- `officer.rapport` — 说服路线的个人好感
- `officer.promisedFief` — 收买时的封地承诺
- `officer.submitted` — 是否已宣誓效忠（用于附庸跟随判定）
- `LORD_DEFS[].routes.persuade / .bribe` — 目前只有 `force` 被消费
- `s.legitimacy` — 已有涨落，但尚未进入说服阻力公式

**P2b 注意事项：** 使者冷却必须用时间戳实现（`s.lordCooldowns[lordId] = Date.now() + ms`），**不要**使用 `seasonLocks`。`seasonLocks` 是回合制遗留，P1 实时化会整体删除它；现在用它会导致 P2b 返工。
