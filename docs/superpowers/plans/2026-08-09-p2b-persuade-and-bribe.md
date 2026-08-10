# P2b 说服与收买路线 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「王室正统性」从只写不读的死变量激活成核心资源，并接上说服与收买两条收服路线，让复国不再只有一路砍过去。

**Architecture:** 说服阻力是一个纯函数 `lordResistance(s, lordId)`，由静态 `defiance` 减去（正统性 + 个人好感 + 邻近压力）× 该领主的 `routes.persuade` 得出。三条路线共用同一个「归附」出口 `submitLord()`，因此忠诚基线、骑士随迁、附庸跟随判定只需实现一次。使者冷却一律用 `s.cooldowns` 时间戳，**不得引入任何按季的锁**。

**Tech Stack:** 纯 ES2022 浏览器脚本（`app.js`，无构建、无框架），Node 内置 `assert` 跑测试，`python3 build_single.py` 打包单文件版。

**基线：** HEAD 为 `d1b5191`（P1b 完成），五套测试全绿，结局分布 crowned 105 / unified 6 / collapsed 9。

**已就位的接口（P2a 留下，本阶段接线）：**

- `officer.rapport` — 个人好感，当前恒为 0
- `officer.promisedFief` — 收买时的封地承诺，当前恒为 null
- `officer.submitted` — 是否已宣誓效忠，打服路线已在用
- `LORD_DEFS[].routes.persuade / .bribe` — 当前只有 `force` 被消费
- `s.legitimacy` — 有涨落（事件与打服处置），但不进入任何公式
- `s.cooldowns` — 时间戳冷却表，当前只有侦察在用

---

### Task 1: 说服阻力公式与邻近压力

**Files:**
- Modify: `app.js`（`lordVassals` 之后新增四个纯函数）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log("lords tests passed");` 之前）：

```js
// 说服阻力 = defiance − (正统性×0.6 + 好感×0.8 + 邻近压力×0.5) × routes.persuade
const rs = game.createInitialState("阻力", "oath", "standard");
rs.legitimacy = 0;
const ysabel = rs.officers.find(o => o.id === "ysabel");   // defiance 45, persuade 1.3
ysabel.rapport = 0;
assert.equal(game.lordResistance(rs, "ysabel"), 45, "无正统性无好感时阻力等于 defiance");

// 正统性降低阻力，且按该领主的 persuade 系数放大
rs.legitimacy = 50;
const withLegit = game.lordResistance(rs, "ysabel");
assert.ok(withLegit < 45, "正统性应降低阻力");
assert.ok(Math.abs(withLegit - (45 - 50 * 0.6 * 1.3)) < 0.01, `阻力公式不符，实际 ${withLegit}`);

// 摄政公爵 persuade 为 0，阻力恒等于 defiance，永远说不动
rs.legitimacy = 100;
rs.officers.find(o => o.id === "regent").rapport = 100;
assert.equal(game.lordResistance(rs, "regent"), game.LORD_DEFS.regent.defiance, "摄政公爵不可被说服");

// 邻近压力：打下他的邻居会让他更容易谈
const ap = game.createInitialState("邻近压力", "oath", "standard");
assert.equal(game.adjacencyPressure(ap, "selma"), 0, "开局对灰麦原没有邻近压力");
ap.territories.pineford.owner = "player";
ap.territories.pineford.lordId = null;
assert.ok(game.adjacencyPressure(ap, "selma") > 0, "拿下松林渡后应对灰麦原产生邻近压力");
assert.ok(game.adjacencyPressure(ap, "selma") <= 20, "邻近压力应有上限 20");

// 阻力归零即可要求效忠
const rd = game.createInitialState("可说服", "oath", "standard");
rd.legitimacy = 100;
rd.officers.find(o => o.id === "ysabel").rapport = 40;
assert.ok(game.lordResistance(rd, "ysabel") <= 0, "高正统性 + 高好感应把伊莎贝尔的阻力压到零");
assert.equal(game.canPersuadeLord(rd, "ysabel"), true);
assert.equal(game.canPersuadeLord(rd, "regent"), false, "公爵永远不可说服");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.lordResistance is not a function`

- [ ] **Step 3: 实现四个纯函数**

在 `lordVassals` 之后插入：

```js
// 邻近压力：该领主全部辖地的相邻领地并集里，有多少已归玩家。
// 去重，并排除他自己的辖地——否则自己的地会被算成对自己的压力。
function adjacencyPressure(s, lordId) {
  const holdings = lordHoldings(s, lordId);
  if (!holdings.length) return 0;
  const own = new Set(holdings);
  const neighbours = new Set();
  holdings.forEach(id => (TERRITORY_DEFS[id]?.adj || []).forEach(nb => { if (!own.has(nb)) neighbours.add(nb); }));
  const held = [...neighbours].filter(id => owns(s, id)).length;
  return Math.min(20, held * 4);
}

// 说服阻力。routes.persuade 为 0 的领主（摄政公爵）阻力恒等于 defiance，
// 无论正统性和好感堆到多高都说不动——主线的军事高潮因此得以保留。
function lordResistance(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def) return Infinity;
  const persuade = def.routes?.persuade || 0;
  const leverage = (s.legitimacy || 0) * 0.6 + (lord.rapport || 0) * 0.8 + adjacencyPressure(s, lordId) * 0.5;
  return (lord.defiance ?? def.defiance) - leverage * persuade;
}

function canPersuadeLord(s, lordId) {
  const lord = officer(s, lordId);
  if (!lord || lord.side === "player" || lord.side === "gone" || lord.captured) return false;
  if (!(LORD_DEFS[lordId]?.routes?.persuade > 0)) return false;
  return lordResistance(s, lordId) <= 0;
}

// 收买价随抵抗值上升、随该领主的贪财程度下降。bribe 为 0 者不可收买。
function lordBribeCost(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  const bribe = def?.routes?.bribe || 0;
  if (!lord || !bribe) return Infinity;
  return Math.round((lord.defiance ?? def.defiance) * 6 / bribe);
}
```

把 `adjacencyPressure`、`lordResistance`、`canPersuadeLord`、`lordBribeCost` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2b: 说服阻力公式与邻近压力"
```

---

### Task 2: 统一的归附出口 submitLord

**Files:**
- Modify: `app.js`（新增 `submitLord`，并让 `lord_capture` 的「接受效忠」改走它）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log` 之前）：

```js
// 三条路线共用同一个归附出口，忠诚基线由路线决定
const sub = game.createInitialState("归附", "oath", "standard");
sub.knights.find(k => k.id === "knight_13").status = "captured";   // 塞尔玛的骑士
assert.ok(game.submitLord(sub, "selma", "persuade"));
const selmaS = sub.officers.find(o => o.id === "selma");
assert.equal(selmaS.side, "player");
assert.equal(selmaS.loyalty, 65, "说服的忠诚基线为 65");
assert.equal(selmaS.submitted, true);
assert.equal(selmaS.captured, false);
// 骑士随主君归附，liegeLordId 同步改指玩家
const k13 = sub.knights.find(k => k.id === "knight_13");
assert.equal(k13.side, "player");
assert.equal(k13.liegeLordId, "player", "随主君归附的骑士必须改挂玩家");
// 辖地一并带过来
assert.equal(sub.territories.ashfield.owner, "player", "说服归附应把辖地一并带过来");
assert.equal(sub.territories.ashfield.lordId, null);

// 三种路线的忠诚基线各不相同
const bases = { force: 45, persuade: 65, bribe: 30 };
for (const [route, base] of Object.entries(bases)) {
  const st = game.createInitialState(`基线${route}`, "oath", "standard");
  game.submitLord(st, "selma", route);
  assert.equal(st.officers.find(o => o.id === "selma").loyalty, base, `${route} 的忠诚基线应为 ${base}`);
}

// 已归附或已离场的领主不能重复归附
const dup = game.createInitialState("重复归附", "oath", "standard");
assert.ok(game.submitLord(dup, "selma", "persuade"));
assert.equal(game.submitLord(dup, "selma", "persuade"), false, "不能重复归附");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.submitLord is not a function`

- [ ] **Step 3: 实现统一出口**

在 `lordBribeCost` 之后插入：

```js
// 打服 / 说服 / 收买三条路线共用同一个归附出口：
// 忠诚基线、辖地转移、骑士随迁、附庸跟随判定只实现一次。
const SUBMIT_LOYALTY = { force: 45, persuade: 65, bribe: 30 };

function submitLord(s, lordId, route = "persuade") {
  const lord = officer(s, lordId);
  if (!lord || lord.side === "player" || lord.side === "gone") return false;
  lord.side = "player";
  lord.captured = false;
  lord.submitted = true;
  lord.loyalty = SUBMIT_LOYALTY[route] ?? SUBMIT_LOYALTY.persuade;
  lord.grievance = route === "force" ? clamp((lord.grievance || 0) + 10) : 0;
  // 打服时辖地已在战斗结算里易主；说服与收买则整片带过来
  if (route !== "force") {
    lordHoldings(s, lordId).forEach(id => {
      const t = s.territories[id];
      t.owner = "player";
      t.lordId = null;
      t.stability = clamp(Math.max(t.stability, 50));
    });
  }
  // 骑士随主君：在列的直接入伍，被俘的一并释放归队
  (s.knights || []).filter(k => k.liegeLordId === lordId && k.status !== "gone" && k.status !== "hostile").forEach(k => {
    k.side = "player";
    k.liegeLordId = "player";
    k.captured = false;
    k.status = "active";
  });
  return true;
}
```

把 `lord_capture` 决策里「接受效忠」的 effect 改为走这个出口（保留它原有的正统性与风格加成）：

```js
        { name: "接受效忠，让他重新宣誓", note: "加入你的领主议会，忠诚 45；王室正统性 +4", effect() {
          submitLord(s, lord.id, "force");
          s.legitimacy = clamp(s.legitimacy + 4); s.style.oath++;
          log(s, "good", `${lord.name}重新向渡鸦家宣誓效忠。`);
        } },
```

把 `submitLord`、`SUBMIT_LOYALTY` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS。打服路线的行为不应改变——若平衡数字大幅偏移，说明 `submitLord` 与原来的处置逻辑不等价，回头核对而不是调数字。

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2b: 三条路线共用统一的归附出口 submitLord"
```

---

### Task 3: 使者行动回归，走冷却时间戳

**Files:**
- Modify: `app.js`（`CITY_ACTION_DEFS` / `CITY_ACTION_DURATIONS` / `CITY_ACTION_COOLDOWNS` / `cityActionAvailable` / `resolveCityAction`）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log` 之前）：

```js
// 使者提高个人好感，冷却用时间戳而非「本季已用」
const en = game.createInitialState("使者", "oath", "standard");
en.gold = 500;
assert.deepEqual(Object.keys(game.CITY_ACTION_DEFS).sort(), ["envoy", "scout"], "说服路线恢复使者行动");
const selmaE = en.officers.find(o => o.id === "selma");
assert.equal(selmaE.rapport, 0);
assert.ok(game.cityAction(en, "ashfield", "envoy"), "对叛臣领地应可派使者");
game.processCompletedJobs(en, en.jobs.at(-1).endAt);
assert.equal(selmaE.rapport, 8, "一次使者 +8 好感");
assert.ok(en.cooldowns["envoy:ashfield"] > Date.now(), "使者应写入冷却到期时间戳");
assert.equal(game.cityActionAvailable(en, "ashfield", "envoy"), false, "冷却期内不可再派");
assert.equal(en.seasonLocks, undefined, "不得引入任何按季的锁");

// 好感有上限：单靠使者堆不到能说服布兰的程度
const cap = game.createInitialState("好感上限", "oath", "standard");
cap.gold = 5000;
const branC = cap.officers.find(o => o.id === "bran");
for (let i = 0; i < 20; i++) {
  cap.cooldowns["envoy:highpass"] = 0;
  if (!game.cityAction(cap, "highpass", "envoy")) break;
  game.processCompletedJobs(cap, cap.jobs.at(-1).endAt);
}
assert.ok(branC.rapport <= 40, `单靠使者好感上限为 40，实际 ${branC.rapport}`);

// 对自己的领地和摄政公爵的王城不派使者
assert.equal(game.cityActionAvailable(en, "ravenstone", "envoy"), false, "不对自己的领地派使者");
assert.equal(game.cityActionAvailable(en, "crownvale", "envoy"), false, "篡位者不接受使者");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `说服路线恢复使者行动`

- [ ] **Step 3: 恢复使者**

把三张城市行动表改为：

```js
const CITY_ACTION_DEFS = {
  scout: { name: "派出斥候", note: "花2金币，记录守军与地形两季。", cost: { gold: 2 } },
  envoy: { name: "派使者", note: "花8金币，提高该领主对渡鸦家的好感。", cost: { gold: 8 } }
};
const CITY_ACTION_DURATIONS = { scout: 20 * 1000, envoy: 30 * 1000 };
const CITY_ACTION_COOLDOWNS = { scout: 90 * 1000, envoy: 120 * 1000 };
const ENVOY_RAPPORT_GAIN = 8;
const ENVOY_RAPPORT_CAP = 40;   // 单靠使者堆不满，高抵抗的领主必须配合邻近压力
```

在 `cityActionAvailable` 的 `if (action === "scout")` 之后追加：

```js
  if (action === "envoy") {
    const lord = lordAt(s, id);
    return !!lord && lord.side !== "player" && lord.side !== "gone" && !lord.captured
      && (LORD_DEFS[lord.id]?.routes?.persuade || 0) > 0;
  }
```

在 `resolveCityAction` 中，把 `if (action !== "scout") return false;` 改为分支处理：

```js
  if (action === "envoy") {
    const lord = lordAt(s, id);
    if (!lord) return false;
    lord.rapport = Math.min(ENVOY_RAPPORT_CAP, (lord.rapport || 0) + ENVOY_RAPPORT_GAIN);
    const text = `使者带着渡鸦家的礼物见到了${lord.name}，好感提高到 ${lord.rapport}。`;
    s.lastAction = { name: `${d.name} · 派使者`, text };
    log(s, "info", text);
    return true;
  }
  if (action !== "scout") return false;
```

把 `ENVOY_RAPPORT_GAIN`、`ENVOY_RAPPORT_CAP` 加入 `module.exports`。

**再接上第二个好感来源：归还俘虏骑士。** 设计文档列了四个来源，其中「打赢他的邻居」已由邻近压力覆盖，「兑现旧盟约」需要新事件（属 P3 内容阶段），只有归还骑士是现成的——`knightAction(id, "release")` 已经存在。在 `applyCompletedJob` 的 `KNIGHT_ACTION` 分支里，`action === "release"` 那一段末尾追加：

```js
      const formerLiege = KNIGHT_LIEGE[knight.id] && officer(s, KNIGHT_LIEGE[knight.id]);
      if (formerLiege && formerLiege.side !== "player" && formerLiege.side !== "gone") {
        formerLiege.rapport = Math.min(100, (formerLiege.rapport || 0) + 12);
        gainLegitimacy(s, "returnKnight");
        log(s, "good", `${formerLiege.name}听说你放回了他的骑士，对渡鸦家的态度缓和了。`);
      }
```

注意 `gainLegitimacy` 在 Task 5 才定义；本任务先只加 rapport 部分，Task 5 落地后再把那一行补上。为避免忘记，把这段拆成两次改动：本任务只写 rapport 与日志，Task 5 的 Step 3 末尾再加 `gainLegitimacy(s, "returnKnight");`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

`tests/structure.test.mjs` 里有两条断言锁定「城市行动只剩侦察」（`cityActionOptions(...) === ["scout"]` 与 `Object.keys(CITY_ACTION_DEFS) === ["scout"]`），把它们改为：

```js
assert.deepEqual(game.cityActionOptions(fresh, "ashfield").map(o => o.id).sort(), ["envoy", "scout"], "叛臣领地可侦察也可派使者");
assert.deepEqual(Object.keys(game.CITY_ACTION_DEFS).sort(), ["envoy", "scout"], "说服路线已接线");
```

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs tests/structure.test.mjs
git commit -m "P2b: 使者行动回归，好感有上限且冷却用时间戳"
```

---

### Task 4: 要求效忠与收买两个动作

**Files:**
- Modify: `app.js`（新增 `demandFealty` / `bribeLord`）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log` 之前）：

```js
// 要求效忠：阻力归零才成立，成功后 +6 正统性
const df = game.createInitialState("要求效忠", "oath", "standard");
df.legitimacy = 100;
df.officers.find(o => o.id === "ysabel").rapport = 40;
assert.ok(game.lordResistance(df, "ysabel") <= 0);
const legitBefore = df.legitimacy;
assert.ok(game.demandFealty(df, "ysabel"));
assert.equal(df.officers.find(o => o.id === "ysabel").side, "player");
assert.equal(df.officers.find(o => o.id === "ysabel").loyalty, 65, "说服的忠诚基线");
assert.equal(df.legitimacy, Math.min(100, legitBefore + 6), "说服成功 +6 正统性");
assert.equal(df.territories.frostfield.owner, "player", "辖地一并带过来");

// 阻力未归零时要求效忠会被拒绝
const df2 = game.createInitialState("阻力未清", "oath", "standard");
assert.equal(game.demandFealty(df2, "ysabel"), false, "阻力未归零不应成功");
assert.equal(game.demandFealty(df2, "regent"), false, "公爵永远拒绝");

// 收买：花金币 + 封地承诺，忠诚基线低，且掉正统性
const bb = game.createInitialState("收买", "oath", "standard");
const cost = game.lordBribeCost(bb, "selma");
assert.ok(Number.isFinite(cost) && cost > 0, `塞尔玛应有明确的收买价，实际 ${cost}`);
bb.gold = cost + 100;
const bbLegit = bb.legitimacy;
assert.ok(game.bribeLord(bb, "selma", "ashfield"));
const selmaB = bb.officers.find(o => o.id === "selma");
assert.equal(selmaB.side, "player");
assert.equal(selmaB.loyalty, 30, "收买的忠诚基线最低");
assert.equal(selmaB.promisedFief, "ashfield", "收买必须附带封地承诺");
assert.equal(bb.legitimacy, bbLegit - 4, "收买掉 4 正统性");
assert.equal(bb.gold, 100, "应扣掉收买价");

// 金币不足时收买失败且不扣钱
const bb2 = game.createInitialState("钱不够", "oath", "standard");
bb2.gold = 1;
assert.equal(game.bribeLord(bb2, "selma", "ashfield"), false);
assert.equal(bb2.gold, 1, "失败不应扣钱");
// 摄政公爵 bribe 为 0，不可收买
assert.equal(game.bribeLord(bb2, "regent", "crownvale"), false, "篡位者不可收买");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.demandFealty is not a function`

- [ ] **Step 3: 实现两个动作**

在 `submitLord` 之后插入：

```js
const BRIBE_LEGITIMACY_COST = 4;
const PERSUADE_LEGITIMACY_GAIN = 6;

// 说服：阻力归零后要求对方重新宣誓。不花钱、无战损，且提高正统性。
function demandFealty(s, lordId) {
  if (!canPersuadeLord(s, lordId)) return false;
  const lord = officer(s, lordId);
  if (!submitLord(s, lordId, "persuade")) return false;
  s.legitimacy = clamp(s.legitimacy + PERSUADE_LEGITIMACY_GAIN);
  s.style.oath++;
  log(s, "good", `${lord.name}承认渡鸦家的继承权，重新宣誓效忠。`);
  return true;
}

// 收买：金币加封地承诺，见效最快，代价是正统性与忠诚基线。
// 承诺记在 promisedFief 上，兑现与否由后续事件消费。
function bribeLord(s, lordId, promisedFief) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def || lord.side === "player" || lord.side === "gone" || lord.captured) return false;
  if (!(def.routes?.bribe > 0)) return false;
  const cost = lordBribeCost(s, lordId);
  if (!Number.isFinite(cost) || s.gold < cost) return false;
  s.gold -= cost;
  if (!submitLord(s, lordId, "bribe")) { s.gold += cost; return false; }
  lord.promisedFief = promisedFief || null;
  s.legitimacy = clamp(s.legitimacy - BRIBE_LEGITIMACY_COST);
  s.style.wealth += 2;
  log(s, "warn", `${lord.name}收下${cost}金币与${promisedFief ? TERRITORY_DEFS[promisedFief]?.name || "一块封地" : "一纸空头承诺"}的许诺，换下了旧旗。`);
  return true;
}
```

把 `demandFealty`、`bribeLord`、`BRIBE_LEGITIMACY_COST`、`PERSUADE_LEGITIMACY_GAIN` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2b: 要求效忠与收买两个动作"
```

---

### Task 5: 附庸跟随判定与正统性接线

**Files:**
- Modify: `app.js`（`submitLord` 内追加跟随判定；`finishBattle` 与 `delayCoronation` 附近补正统性涨落）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log` 之前）：

```js
// 大叛臣归附后，附庸做跟随判定
const fl = game.createInitialState("附庸跟随", "oath", "standard");
fl.legitimacy = 100;
game.lordVassals(fl, "bran").forEach(v => { v.rapport = 100; });
const vassalsBefore = game.lordVassals(fl, "bran").length;
assert.ok(vassalsBefore >= 4, "布兰应有多名附庸");
game.submitLord(fl, "bran", "persuade", () => 0.01);   // rng 极低 → 必定跟随
const followed = fl.officers.filter(o => game.LORD_DEFS[o.id]?.liege === "bran" && o.side === "player");
assert.ok(followed.length > 0, "高正统性高好感时附庸应有人跟随");

// 不跟随的附庸转为独立叛臣，而不是留在原主君名下
const fl2 = game.createInitialState("不跟随", "oath", "standard");
fl2.legitimacy = 0;
game.submitLord(fl2, "bran", "persuade", () => 0.99);   // rng 极高 → 必定不跟随
const stillVassal = fl2.officers.filter(o => game.LORD_DEFS[o.id]?.liege === "bran" && o.side !== "player");
assert.ok(stillVassal.every(v => v.liege === null), "不跟随者应转为独立叛臣");

// 正统性接线：收复旧土 +3，被反攻丢地 −3
const lg = game.createInitialState("正统性", "oath", "standard");
const lgBefore = lg.legitimacy;
game.gainLegitimacy(lg, "reclaim");
assert.equal(lg.legitimacy, lgBefore + 3, "收复旧土 +3");
game.gainLegitimacy(lg, "loseTerritory");
assert.equal(lg.legitimacy, lgBefore, "丢地 −3 抵消");
assert.equal(game.gainLegitimacy(lg, "不存在的理由"), false, "未知理由不应静默改数值");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.gainLegitimacy is not a function`

- [ ] **Step 3: 实现跟随判定与正统性接线**

给 `submitLord` 增加第四个参数并在末尾追加跟随判定：

```js
function submitLord(s, lordId, route = "persuade", rng = Math.random) {
```

在 `return true;` 之前插入：

```js
  // 大叛臣归附后，其附庸各自做一次跟随判定。
  // 跟随者成建制倒向；不跟随者转为独立叛臣，而不是继续挂在已归附的主君名下。
  if (LORD_DEFS[lordId]?.tier === "liege") {
    lordVassals(s, lordId).forEach(vassal => {
      const chance = 0.35 + (s.legitimacy || 0) / 250 + (vassal.rapport || 0) / 200
        - (vassal.defiance ?? LORD_DEFS[vassal.id].defiance) / 300;
      if (rng() < chance) {
        submitLord(s, vassal.id, route, rng);
        log(s, "good", `${vassal.name}随${officer(s, lordId).name}一同归附。`);
      } else {
        vassal.liege = null;
        log(s, "warn", `${vassal.name}拒绝跟随，自立门户。`);
      }
    });
  }
```

注意 `lordVassals` 读的是静态表 `LORD_DEFS[o.id].liege`，因此把运行时的 `vassal.liege` 置空不会让它从列表里消失。为了让「自立门户」真正生效，把 `lordVassals` 改为优先读运行时字段：

```js
function lordVassals(s, lordId) {
  if (!lordId) return [];
  return (s?.officers || []).filter(o => {
    const liege = o.liege !== undefined ? o.liege : LORD_DEFS[o.id]?.liege;
    return liege === lordId && o.side !== "player" && o.side !== "gone";
  });
}
```

并在 `createInitialState` 的 officers 生成里补一行运行时 `liege`（`...clone(d)` 已经带上了静态值，这里只是让它显式可变）：无需改动，`clone(d)` 已包含 `liege`。

在 `checkDefeat` 之前新增正统性的统一入口：

```js
// 正统性的涨落集中在这里，配平时只改这一处，也便于排查「谁动了正统性」。
const LEGITIMACY_DELTAS = {
  reclaim: 3,          // 收复一块旧土
  battleWin: 2,        // 会战胜利
  keepPromise: 6,      // 兑现封地承诺
  returnKnight: 2,     // 归还俘虏骑士
  loseTerritory: -3,   // 被反攻丢地
  breakPromise: -8     // 背弃封地承诺
};

function gainLegitimacy(s, reason) {
  const delta = LEGITIMACY_DELTAS[reason];
  if (!s || delta === undefined) return false;
  s.legitimacy = clamp((s.legitimacy || 0) + delta);
  return true;
}
```

在 `finishBattle` 的胜利分支里，把原来写死的 `s.legitimacy = clamp(s.legitimacy + 3);` 改为两次调用，让「打赢」与「收复」分开计：

```js
    gainLegitimacy(s, "battleWin");
    gainLegitimacy(s, "reclaim");
```

在 `resolveAIAttack` 里 AI 夺下玩家领地的分支（`t.owner = faction;` 之后）追加：

```js
    gainLegitimacy(s, "loseTerritory");
```

把 `gainLegitimacy`、`LEGITIMACY_DELTAS` 加入 `module.exports`。

**补上 Task 3 留的尾巴：** 在 `applyCompletedJob` 的 `release` 分支里，把 Task 3 加的那段末尾补上一行 `gainLegitimacy(s, "returnKnight");`（放在 rapport 提升之后、log 之前）。

**再实现「剥离附庸削弱主君」。** 设计文档写明：附庸被剥离后，其主君的 `defiance` 按已失去的辖地比例下降，最多降 30%。这让「先拆他的羽翼再谈」成为一条真实可走的路。在 `submitLord` 的跟随判定**之前**插入：

```js
  // 附庸易主会削弱其主君的抵抗意志，最多削到原值的 70%。
  const liegeId = LORD_DEFS[lordId]?.liege;
  if (liegeId) {
    const liege = officer(s, liegeId);
    const def0 = LORD_DEFS[liegeId];
    if (liege && liege.side !== "player" && liege.side !== "gone") {
      const total = Object.values(LORD_DEFS).filter(d => d.liege === liegeId).length;
      if (total > 0) {
        const lost = Object.entries(LORD_DEFS).filter(([id, d]) => d.liege === liegeId && officer(s, id)?.side === "player").length;
        const floor = def0.defiance * 0.7;
        liege.defiance = Math.max(floor, def0.defiance - def0.defiance * 0.3 * (lost / total));
        log(s, "info", `${liege.name}又失去一名附庸，抵抗意志降到 ${Math.round(liege.defiance)}。`);
      }
    }
  }
```

并在 `tests/lords.test.mjs` 的 Task 5 测试块里追加：

```js
// 剥离附庸会削弱主君的抵抗意志，但不会削到 0
const st = game.createInitialState("剥离附庸", "oath", "standard");
const branDefiance0 = st.officers.find(o => o.id === "bran").defiance;
game.submitLord(st, "selma", "persuade", () => 0.99);
const branAfter = st.officers.find(o => o.id === "bran").defiance;
assert.ok(branAfter < branDefiance0, "附庸易主后主君抵抗应下降");
assert.ok(branAfter >= game.LORD_DEFS.bran.defiance * 0.7, "抵抗最多削到原值的 70%");
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs && node tests/campaign-balance.sim.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/lords.test.mjs
git commit -m "P2b: 附庸跟随判定与正统性统一入口"
```

---

### Task 6: 将领页与地图展示三条路线

**Files:**
- Modify: `app.js`（`renderCourt` 叛臣卡片、`territorySummary` 守将信息、按钮绑定）
- Modify: `index.html`（侧栏加正统性条）
- Modify: `tests/lords.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/lords.test.mjs`（`console.log` 之前）：

```js
// 三条路线的可用性要能被 UI 查询到，且各自给出明确的缺口说明
const ui = game.createInitialState("界面", "oath", "standard");
const opts = game.lordRouteStatus(ui, "selma");
assert.deepEqual(Object.keys(opts).sort(), ["bribe", "force", "persuade"]);
assert.equal(opts.persuade.available, false, "开局阻力未清，说服不可用");
assert.ok(opts.persuade.detail.includes("阻力"), `说服应说明还差多少阻力，实际：${opts.persuade.detail}`);
assert.ok(opts.bribe.detail.includes("金"), `收买应给出价格，实际：${opts.bribe.detail}`);

const uiReady = game.createInitialState("界面2", "oath", "standard");
uiReady.legitimacy = 100;
uiReady.officers.find(o => o.id === "ysabel").rapport = 40;
assert.equal(game.lordRouteStatus(uiReady, "ysabel").persuade.available, true, "阻力归零后说服应可用");

// 公爵三条路里只有武力
const duke = game.lordRouteStatus(ui, "regent");
assert.equal(duke.persuade.available, false);
assert.equal(duke.bribe.available, false);
assert.ok(duke.persuade.detail.includes("篡位") || duke.persuade.detail.includes("不可"), `公爵应明说不可说服，实际：${duke.persuade.detail}`);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/lords.test.mjs`
Expected: FAIL — `game.lordRouteStatus is not a function`

- [ ] **Step 3: 实现路线状态查询与界面**

在 `lordBribeCost` 之后插入：

```js
// UI 与测试共用的路线可用性查询：每条路要么可用，要么说清楚还差什么。
function lordRouteStatus(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def) return {};
  const resistance = lordResistance(s, lordId);
  const cost = lordBribeCost(s, lordId);
  return {
    force: {
      available: !owns(s, def.seat) && lordHoldings(s, lordId).length > 0,
      detail: `攻下他的最后一座城即可俘获（当前 ${lordHoldings(s, lordId).length} 座）`
    },
    persuade: {
      available: canPersuadeLord(s, lordId),
      detail: (def.routes?.persuade || 0) <= 0
        ? "篡位者不接受任何使者，只能兵戎相见"
        : resistance <= 0 ? "阻力已清，可要求他效忠" : `还需消解 ${Math.ceil(resistance)} 点阻力`
    },
    bribe: {
      available: Number.isFinite(cost) && s.gold >= cost && lord.side !== "player" && lord.side !== "gone",
      detail: !Number.isFinite(cost) ? "他不收钱" : `${cost}金 + 一块封地承诺（正统性 −${BRIBE_LEGITIMACY_COST}）`
    }
  };
}
```

在 `renderCourt` 的叛臣卡片里，把原来只显示抵抗值的那一行扩展为三路进度，并加上两个可点按钮：

```js
      const routes = lordRouteStatus(S, def.id);
      const routeHtml = `<div class="lord-routes">
        <span class="route ${routes.force.available ? "on" : ""}">打服 · ${esc(routes.force.detail)}</span>
        <span class="route ${routes.persuade.available ? "on" : ""}">说服 · ${esc(routes.persuade.detail)}</span>
        <span class="route ${routes.bribe.available ? "on" : ""}">收买 · ${esc(routes.bribe.detail)}</span>
      </div>
      <div class="lord-actions">
        ${routes.persuade.available ? `<button class="secondary-btn" data-demand-fealty="${def.id}">要求效忠</button>` : ""}
        ${routes.bribe.available ? `<button class="ghost-btn" data-bribe-lord="${def.id}">收买 · ${lordBribeCost(S, def.id)}金</button>` : ""}
      </div>`;
```

把 `routeHtml` 插到卡片的 `</div></article>` 之前，并在 `renderCourt` 末尾追加两个绑定：

```js
  panel.querySelectorAll("[data-demand-fealty]").forEach(button => button.addEventListener("click", () => {
    if (!demandFealty(S, button.dataset.demandFealty)) { toast("当前还无法让他效忠"); return; }
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-bribe-lord]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.bribeLord;
    const fief = lordHoldings(S, id)[0] || null;
    if (!bribeLord(S, id, fief)) { toast("金币不足，或此人不收钱"); return; }
    saveGame(); renderAll();
  }));
```

在 `territorySummary` 的守将信息行里，把 `抵抗 ${...}` 改为同时显示阻力：

```js
`${esc(lordDef?.oldTie || "")} · 抵抗 ${Math.round(lord.defiance ?? 0)} · 说服阻力 ${Math.max(0, Math.ceil(lordResistance(s, lord.id)))}`
```

在 `index.html` 侧栏「军政根基」里，在声望之后追加一行正统性：

```html
          <div class="meter-row"><span>正统性</span><b id="legitimacyText">35</b></div><div class="meter gold"><i id="legitimacyBar"></i></div>
```

在 `renderTop` 中补上对应渲染（紧挨着 renown 的那两行之后）：

```js
  $("legitimacyText").textContent = Math.round(S.legitimacy);
  $("legitimacyBar").style.width = `${clamp(S.legitimacy)}%`;
```

在 `style.css` 末尾追加：

```css
.lord-routes { display: grid; gap: 3px; margin: 6px 0 4px; }
.lord-routes .route { color: #8f9088; font-size: 10px; line-height: 1.45; }
.lord-routes .route.on { color: #c6b98e; }
.lord-actions { display: flex; flex-wrap: wrap; gap: 6px; }
```

把 `lordRouteStatus` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs && node tests/migration.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js index.html style.css tests/lords.test.mjs
git commit -m "P2b: 将领页与地图展示三条收服路线，侧栏加正统性"
```

---

### Task 7: 存档 v6

**Files:**
- Modify: `app.js:4`（`VERSION`）、新增 `migrateV5ToV6`、`migrateSave`、`hydrateV5` 更名
- Modify: `tests/migration.test.mjs`

- [ ] **Step 1: 写失败测试**

追加到 `tests/migration.test.mjs`（`console.log` 之前）：

```js
// v5 → v6：补齐说服路线的运行时字段
const v5 = JSON.parse(JSON.stringify(game.createInitialState("v5中盘", "oath", "standard")));
v5.version = 5;
v5.officers.forEach(o => { delete o.rapport; delete o.promisedFief; delete o.liege; });

const m6 = game.hydrateState(v5);
assert.ok(m6, "v5 存档必须能迁移");
assert.equal(m6.version, game.VERSION);
for (const o of m6.officers) {
  assert.equal(o.rapport, 0, `${o.id} 缺少 rapport`);
  assert.equal(o.promisedFief, null, `${o.id} 缺少 promisedFief`);
  assert.equal(o.liege, game.LORD_DEFS[o.id]?.liege ?? null, `${o.id} 的运行时 liege 应从静态表补齐`);
}
assert.equal(game.selfCheck(m6).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m6).errors)}`);

// v1 仍能一路迁到最新版
const v1d = JSON.parse(JSON.stringify(v5));
v1d.version = 1; v1d.ap = 3; delete v1d.clock; delete v1d.jobs; delete v1d.tech;
const m1d = game.migrateSave(v1d);
assert.ok(m1d && m1d.version === game.VERSION, "v1 应能连续迁移到最新版");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tests/migration.test.mjs`
Expected: FAIL — `assert.equal(m6.version, game.VERSION)`（v5 直接被当成最新版，字段没补齐）

- [ ] **Step 3: 实现迁移**

把 `app.js:4` 改为 `const VERSION = 6;`。

在 `migrateV4ToV5` 之后新增：

```js
function migrateV5ToV6(raw) {
  const migrated = clone(raw);
  migrated.version = 6;
  // 说服路线的运行时字段：好感、封地承诺、可变的从属关系
  (migrated.officers || []).forEach(o => {
    o.rapport ??= 0;
    o.promisedFief ??= null;
    if (o.liege === undefined) o.liege = LORD_DEFS[o.id]?.liege ?? null;
  });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v5-to-v6"];
  return migrated;
}
```

在 `migrateSave` 里追加一级：

```js
  if (migrated.version === 5) migrated = migrateV5ToV6(migrated);
```

把 `hydrateV5` 更名为 `hydrateV6`，`migrateSave` 末尾改为 `return hydrateV6(migrated);`。在 `hydrateV6` 内的 officers 归一化那一行补上三个字段：

```js
  raw.officers.forEach(o => { o.grievance ??= 0; o.merit ??= 0; o.injured ??= 0; o.fief ??= null; o.rapport ??= 0; o.promisedFief ??= null; if (o.liege === undefined) o.liege = LORD_DEFS[o.id]?.liege ?? null; });
```

把 `migrateV5ToV6` 加入 `module.exports`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check app.js && node tests/migration.test.mjs && node tests/lords.test.mjs && node tests/structure.test.mjs && node tests/clock.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app.js tests/migration.test.mjs
git commit -m "P2b: 存档升到 v6，补齐说服路线的运行时字段"
```

---

### Task 8: 平衡验收 —— 三条路线都必须被实际使用

**Files:**
- Modify: `tests/campaign-balance.sim.mjs`

- [ ] **Step 1: 让机器人会用说服与收买**

在 `fight(state, random)` 之前新增一个外交回合，并在主循环里调用它：

```js
// 机器人的外交：够得着就先谈，谈不动再打。
// 这不是最优策略，只是用来验证两条路线在实战中确实可走。
function diplomacy(state) {
  let used = { envoy: 0, persuade: 0, bribe: 0 };
  for (const [id, def] of Object.entries(game.LORD_DEFS)) {
    if (def.tier === "loyal") continue;
    const lord = state.officers.find(o => o.id === id);
    if (!lord || lord.side === "player" || lord.side === "gone" || lord.captured) continue;
    if (game.demandFealty(state, id)) { used.persuade++; continue; }
    const cost = game.lordBribeCost(state, id);
    if (Number.isFinite(cost) && state.gold > cost + 120) {
      if (game.bribeLord(state, id, game.lordHoldings(state, id)[0] || null)) { used.bribe++; continue; }
    }
    const seat = game.lordHoldings(state, id)[0];
    if (seat && state.gold > 40 && game.cityActionAvailable(state, seat, "envoy")) {
      if (game.cityAction(state, seat, "envoy")) {
        game.processCompletedJobs(state, state.jobs.at(-1).endAt);
        used.envoy++;
      }
    }
  }
  return used;
}
```

在主循环里 `fight(state, random);` 之前插入：

```js
      const diplo = diplomacy(state);
      diploTally.envoy += diplo.envoy; diploTally.persuade += diplo.persuade; diploTally.bribe += diplo.bribe;
```

在 `run(seed)` 函数体顶部（`const random = ...` 之后）声明计数器：

```js
  const diploTally = { envoy: 0, persuade: 0, bribe: 0 };
```

并在返回对象里加入：

```js
    persuaded: diploTally.persuade,
    bribed: diploTally.bribe,
    envoys: diploTally.envoy,
```

- [ ] **Step 2: 加统计与硬断言**

在末尾的 `console.log` 汇总里加三行：

```js
  平均说服归附: avg("persuaded"), 平均收买归附: avg("bribed"), 平均派出使者: avg("envoys"),
```

并在断言区追加：

```js
// 三条路线都必须在实战中确实可走，否则说明某条路线只是摆设。
assert.ok(Number(avg("submittedLords")) > 0, "打服路线必须能实际收服到领主");
assert.ok(results.some(r => r.persuaded > 0), "说服路线必须至少在部分局中成立");
assert.ok(results.some(r => r.bribed > 0), "收买路线必须至少在部分局中成立");
```

- [ ] **Step 3: 运行并记录**

Run: `node tests/campaign-balance.sim.mjs`

记录三条路线各自的使用量与新的结局分布。**若某条路线为 0，不要放宽断言**——那说明该路线在实战中不可用，回头检查阻力公式或价格，并在提交信息里写明数字与判断。

- [ ] **Step 4: 提交**

```bash
git add tests/campaign-balance.sim.mjs
git commit -m "P2b: 平衡验收，三条收服路线都必须被实际使用"
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
- 侧栏出现「正统性」并显示 35
- 将领页每张叛臣卡片显示三条路线的状态，缺口说明各不相同
- 对某个叛臣连续派使者，好感上升、冷却生效、到 40 封顶
- 把正统性调高（控制台 `S.legitimacy = 100; renderAll()`）后，低抵抗领主的卡片出现「要求效忠」按钮，点击后该领主与其辖地一并归附
- 收买按钮显示价格，点击后金币扣除、正统性下降
- 摄政公爵的卡片三条路里只有「打服」可用
- 六个页签均无控制台报错

- [ ] **Step 2: 更新文档**

`README.md` 的「地图与叛臣」段末尾追加：

```markdown
- 三条收服路线：打服（攻城俘获后四选一处置）、说服（使者累积好感，配合王室正统性与邻近压力压低抵抗）、收买（金币加封地承诺，见效最快但掉正统性）
- 王室正统性不直接解锁任何东西，只降低所有说服的难度；打仗与说服互相供能——打下他的邻居会让他更容易谈
- 大叛臣归附后其附庸各自做跟随判定，不跟随者自立门户
```

把「尚未实现」段里的 P2b 一条删除。

`docs/设计说明.md` 里把「当前进度：打服已实现（P2a），说服与收买属 P2b」改为「三条路线均已实现」，并把实现阶段里的 P2b 标为已完成。

- [ ] **Step 3: 打包并提交**

```bash
python3 build_single.py
git add README.md docs/设计说明.md
git commit -m "P2b: 同步文档到三条收服路线版本"
```

---

## 完成标准

- 六套检查全绿：`node --check` + `structure` / `lords` / `migration` / `clock` / `campaign-balance`
- 平衡模拟中说服与收买各自至少在部分局中成立，打服仍然可用
- 摄政公爵在任何正统性与好感下都无法被说服或收买
- 单靠使者无法把好感堆过 40，高抵抗领主必须配合邻近压力
- v5 存档能迁移到 v6，`selfCheck` 通过
- 浏览器无控制台报错，将领页三条路线状态可读、按钮可用
- `grep -c seasonLocks app.js` 输出 `0`（使者冷却必须走 `s.cooldowns`）

## 移交给后续阶段的接口

- `LEGITIMACY_DELTAS` — 正统性涨落集中在此，P4 配平只改这一处
- `officer.promisedFief` — 收买时的封地承诺已记录，但**尚无消费者**：兑现与背弃的事件属 P3 内容阶段
- `SUBMIT_LOYALTY` — 三条路线的忠诚基线，P4 配平入口
- `lordRouteStatus(s, lordId)` — UI 与测试共用的路线查询，P3 做领主详情页时可直接复用
