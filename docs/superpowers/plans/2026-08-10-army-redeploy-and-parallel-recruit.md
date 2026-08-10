# 军团调动、驻防守城与并行征兵 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先修掉「表单每 5 秒被渲染抹掉」的 bug，再让军团能在自有版图内自由调动、让驻扎真的参与守城、让六个兵种各自排一条征兵队列。

**Architecture:** 四部分依次落地。第零部分引入模块级 `uiDraft`（沿用项目已有的 `foldState` 形状：运行时变量、不进存档、渲染时按当前真实状态夹取），把两个表单的状态搬出 DOM。第一部分给 `startMarch()` 加一条「目标是自有领地」的放行路径。第二部分把驻扎军团的战力并入 `resolveAIAttack()` 的防御，并补上伤亡与城破撤离。第三部分把征兵占用判定从「每领地一条」改成「每领地每兵种一条」。

**Tech Stack:** 零模块语法的经典脚本（`src/01-data.js` … `src/07-exports.js`，按 `sources.json` 顺序拼接）；Node 内置 `assert/strict` 测试，无框架、无构建步骤。

**设计文档：** `docs/superpowers/specs/2026-08-10-army-redeploy-and-parallel-recruit-design.md`

---

## 项目约定（动手前必读）

1. **`src/01-data.js` 不得出现函数声明**，它只放数据表。
2. **每个源文件必须以 `"use strict";` 开头。**
3. **`sources.json` 是文件清单的唯一真相源**，浏览器 / 打包 / 测试三处按同一顺序拼接。本计划不新增源文件，因此不动它。
4. **依赖方向：前面的文件不得引用后面的文件。** 顺序是 01-data → 02-core → 03-domain → 04-state → 05-war → 06-ui → 07-exports。
5. 测试用 `node tests/xxx.test.mjs` 单独跑，没有 test runner。测试文件结尾要 `console.log("xxx tests passed")`。
6. 提交信息用中文，参考 `git log` 的风格。

## 全量回归命令

每个 Task 的最后一步只跑相关测试；**Task 9 跑全量**：

```bash
for f in src/*.js; do node --check "$f"; done
node tests/structure.test.mjs
node tests/lords.test.mjs
node tests/migration.test.mjs
node tests/clock.test.mjs
node tests/tech.test.mjs
node tests/ai.test.mjs
node tests/map.test.mjs
node tests/army.test.mjs
node tests/campaign-balance.sim.mjs
python3 build_single.py
```

## 文件结构

| 文件 | 本计划中的职责 |
|---|---|
| `src/02-core.js` | 新增 `uiDraft`（紧挨 `foldState`）与 `runningRecruitJob()`（紧挨 `getRunningJob()`） |
| `src/03-domain.js` | 新增 `stationedArmies()`（紧挨 `playerArmies()`） |
| `src/04-state.js` | `startMarch()` 放行调防；新增 `redeployArmy()`；征兵占用判定改按兵种 |
| `src/05-war.js` | 新增驻防四个常量、`stationedPower()`、`applyStationedLosses()`、`retreatStationedArmies()`；改 `resolveAIAttack()` |
| `src/06-ui.js` | 新增 `newArmyDraftView()` / `expeditionDraftView()` / `armyRedeployHtml()`；改 `armyCorpsHtml()`、`castleExpeditionHtml()`、`territorySummary()`、`armyRosterHtml()` 与三处绑定 |
| `src/07-exports.js` | 补导出，供 Node 测试 |
| `tests/army.test.mjs` | 新建，覆盖四部分 |
| `README.md` | 「已实现」与「检查与封装」补条目 |

---

## Task 1: uiDraft 骨架与导出通路

先把测试能跑起来的最小通路打通：`uiDraft` 存在、`armyCorpsHtml()` 可以在 Node 里被调用。

**Files:**
- Modify: `src/02-core.js`（`foldState` 之后，约 17 行）
- Modify: `src/06-ui.js:382`（`armyCorpsHtml` 签名）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`（新建）

- [ ] **Step 1: 写失败的测试**

新建 `tests/army.test.mjs`：

```javascript
import assert from "node:assert/strict";
import game from "./_game.mjs";

const fresh = name => game.createInitialState(name, "oath", "standard");

// ── uiDraft 必须存在于渲染之外 ─────────────────────────────────────────
// 每 5 秒一次的 drift 计时器会让 updateWorldTime 调 renderAll()，
// 整块重写 panel.innerHTML。表单状态若只留在 DOM 上，玩家填到一半就被抹掉。
// 这正是「组建第二军团兵力填进去就变 0」的成因。
{
  assert.ok(game.uiDraft, "uiDraft 必须导出，否则表单状态无处存放");
  assert.ok(game.uiDraft.newArmy, "uiDraft.newArmy 缺失");
  assert.ok(game.uiDraft.expedition, "uiDraft.expedition 缺失");
}

// ── armyCorpsHtml 必须能脱离全局 S 被调用 ──────────────────────────────
// S 是 02-core.js 里的模块级 let，测试拿不到也设不了。渲染函数收 s 参数，
// 才可能在 Node 里断言渲染结果 —— 这是选「草稿对象」而非「DOM 快照还原」
// 方案的关键理由之一。
{
  const s = fresh("渲染");
  const html = game.armyCorpsHtml(s);
  assert.equal(typeof html, "string", "armyCorpsHtml 应返回字符串");
  assert.ok(html.includes("data-new-army-unit"), "组建军团表单应包含兵种输入框");
}

console.log("army tests passed");
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`uiDraft 必须导出，否则表单状态无处存放`

- [ ] **Step 3: 加 uiDraft**

在 `src/02-core.js` 的 `foldState` 那一行（约 17 行）**之后**插入：

```javascript
// 表单草稿。与 foldState 同理放在运行时而不是存档里：这是「界面上填了什么」，
// 不是游戏进度，不该占存档字段、也不该有迁移。
// 同样必须存在渲染之外 —— drift 计时器每 5 秒让 renderAll() 重建整个面板，
// 状态若只留在 DOM 上，玩家填到一半的组建军团表单就自己清零了。
const uiDraft = {
  newArmy: { name: "第二军团", commanderId: null, units: {} },
  expedition: { targetId: null, armyIds: null, plan: null, grain: null }
};
```

- [ ] **Step 4: 给 armyCorpsHtml 加 s 参数**

在 `src/06-ui.js`，把 `function armyCorpsHtml() {` 改成 `function armyCorpsHtml(s = S) {`，并把该函数体内**全部** `S` 替换成 `s`（共 7 处：`playerArmies(S)`、`armyEntity(S, "army_1")`、`assignedCommanderIds(S)`、`canUseCommander(S, option.id)`、`activeKnights(S)`、`S.playerName`、`armyCommander(S, army)`、`armyStatusText(S, army)`）。

函数体内不要留任何裸 `S`。`renderCampaign()` 里的调用点 `${armyCorpsHtml()}` 不用改 —— 默认参数会取全局 `S`。

- [ ] **Step 5: 补导出**

在 `src/07-exports.js` 的 `module.exports` 对象里，`FOG_LEVELS` 之后追加：

```javascript
    , uiDraft, armyCorpsHtml
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node tests/army.test.mjs`
Expected: PASS，输出 `army tests passed`

- [ ] **Step 7: 语法检查并提交**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/structure.test.mjs
git add src/02-core.js src/06-ui.js src/07-exports.js tests/army.test.mjs
git commit -m "表单草稿：加 uiDraft 骨架，渲染函数改为可脱离全局 S 调用"
```

---

## Task 2: 组建军团表单读写草稿

**Files:**
- Modify: `src/06-ui.js`（`armyCorpsHtml` 前新增 `newArmyDraftView`；改 `armyCorpsHtml` 与 `bindArmyControls`）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

在 `tests/army.test.mjs` 的 `console.log` **之前**追加：

```javascript
// ── 草稿要活过一次渲染 ────────────────────────────────────────────────
{
  const s = fresh("草稿");
  const main = game.armyEntity(s, "army_1");
  main.composition.levy = 30;
  game.uiDraft.newArmy.units = { levy: 12 };
  game.uiDraft.newArmy.name = "黑棘骑士团";
  const html = game.armyCorpsHtml(s);
  assert.ok(html.includes(`value="12"`), "草稿里的兵力必须渲染进 value，否则每 5 秒被清零");
  assert.ok(html.includes("黑棘骑士团"), "草稿里的军团名必须渲染进 value");
}

// ── 草稿是上一秒的意图，必须按当前真实状态夹取 ────────────────────────
// 主力打完仗掉了兵，草稿里的旧数字若原样渲染，就会变成一次非法提交。
{
  const s = fresh("夹取");
  const main = game.armyEntity(s, "army_1");
  main.composition.levy = 5;
  game.uiDraft.newArmy.units = { levy: 12 };
  const view = game.newArmyDraftView(s);
  assert.equal(view.units.levy, 5, "草稿数超过主军现有数时必须夹到现有数");
}

// ── 指挥官失效要回退，不能产出指向不存在选项的 selected ────────────────
{
  const s = fresh("指挥官");
  game.uiDraft.newArmy.commanderId = "knight_不存在";
  const view = game.newArmyDraftView(s);
  assert.notEqual(view.commanderId, "knight_不存在", "失效的指挥官必须回退");
  if (view.options.length) {
    assert.equal(view.commanderId, view.options[0].id, "应回退到选项列表第一项");
  }
}

// ── 选中的指挥官要带 selected，否则每次渲染都被打回第一项 ──────────────
// 这就是「新招募的骑士选不上」的真相：骑士一直在列表里，
// 只是 select 不带 selected，5 秒内被渲染打回第一项。
{
  const s = fresh("选中");
  const knights = game.activeKnights(s);
  assert.ok(knights.length >= 1, "开局应至少有一名在列骑士");
  game.uiDraft.newArmy.commanderId = knights[0].id;
  const html = game.armyCorpsHtml(s);
  assert.ok(new RegExp(`value="${knights[0].id}"\\s+selected`).test(html),
    "草稿选中的指挥官必须带 selected 渲染");
}
```

**每个测试块开头都要重置草稿**，否则块之间互相污染。在 `fresh` 定义之后加一个助手，并在上面每个块的第一行调用它：

```javascript
const resetDraft = () => {
  game.uiDraft.newArmy = { name: "第二军团", commanderId: null, units: {} };
  game.uiDraft.expedition = { targetId: null, armyIds: null, plan: null, grain: null };
};
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`game.newArmyDraftView is not a function`

- [ ] **Step 3: 新增 newArmyDraftView**

在 `src/06-ui.js` 的 `function armyCorpsHtml` **之前**插入：

```javascript
// 把草稿折算成「这一刻真正能用的值」。草稿是玩家上一秒的意图，世界这一秒
// 可能已经变了 —— 主力打完仗掉了兵、骑士阵亡或去带了别的军团。
// 一律按当前真实状态夹取，不能直接信草稿，否则会变成一次静默的非法提交。
function newArmyDraftView(s) {
  const main = armyEntity(s, "army_1");
  const comp = main?.composition || emptyComposition();
  const assigned = assignedCommanderIds(s);
  const options = [{ id: "player", name: `${s.playerName} · 王子亲征` }]
    .filter(option => canUseCommander(s, option.id))
    .concat(activeKnights(s).filter(knight => !assigned.has(knight.id)).map(knight => ({ id: knight.id, name: `${knight.name} · 骑士` })));
  const units = {};
  Object.keys(UNIT_DEFS).forEach(type => {
    units[type] = clamp(Math.round(Number(uiDraft.newArmy.units?.[type]) || 0), 0, comp[type] || 0);
  });
  const commanderId = options.some(option => option.id === uiDraft.newArmy.commanderId)
    ? uiDraft.newArmy.commanderId
    : (options[0]?.id || null);
  return { options, units, commanderId, name: uiDraft.newArmy.name ?? "第二军团", main, comp };
}
```

- [ ] **Step 4: 改 armyCorpsHtml 用草稿**

把 `armyCorpsHtml(s = S)` 函数体改成（整段替换）：

```javascript
function armyCorpsHtml(s = S) {
  const armies = playerArmies(s);
  const draft = newArmyDraftView(s);
  const main = draft.main;
  const commanderOptions = draft.options;
  const canCreate = main?.status === "idle" && compositionTotal(main.composition) >= 20 && commanderOptions.length > 0;
  return `<section class="corps-panel"><div class="section-head"><h2>军团编制</h2><span>${armies.length}支军团 · 每支由王子或骑士带领</span></div>
    <div class="corps-grid">${armies.map(army => { const commander = armyCommander(s, army); const canDisband = army.id !== "army_1" && army.status === "idle"; return `<article class="corps-card ${army.id === "army_1" ? "primary" : ""}"><div class="corps-card-head"><b>${esc(army.name)}</b><span>${army.id === "army_1" ? "主军" : "独立军团"}</span></div><p><strong>${esc(commander.person?.name || "未任命")}</strong> · ${commander.isKnight ? "骑士" : "王子"}<br>${TERRITORY_DEFS[army.locationId]?.name || "未知地点"} · ${armyStatusText(s, army)}</p><div class="stat-chips"><span>${compositionTotal(army.composition)}人</span><span>${compositionText(army.composition)}</span></div>${canDisband ? `<button class="ghost-btn" data-disband-army="${army.id}">解散军团</button>` : `<small class="corps-note">${army.id === "army_1" ? "主军不可解散" : "行军或交战中"}</small>`}</article>`; }).join("")}</div>
    <div class="corps-create"><div><h3>组建新军团</h3><p>从渡鸦第一军团抽调兵力，至少留下10人。组建完成后，地图上可以单独出征或合军。</p></div>
      <div class="corps-create-grid"><label>军团名称<input id="newArmyName" maxlength="18" value="${esc(draft.name)}" placeholder="例如：黑棘骑士团"></label><label>带队指挥官<select id="newArmyCommander">${commanderOptions.map(option => `<option value="${option.id}" ${option.id === draft.commanderId ? "selected" : ""}>${esc(option.name)}</option>`).join("")}</select></label></div>
      <div class="corps-unit-picks">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<label><span>${unit.name} · 主军${main?.composition[type] || 0}</span><input type="number" min="0" max="${main?.composition[type] || 0}" value="${draft.units[type]}" data-new-army-unit="${type}"></label>`).join("")}</div>
      <button class="secondary-btn" data-create-army ${canCreate ? "" : "disabled"}>${canCreate ? "组建军团" : "主军至少需要20人，且要有空闲骑士"}</button>
    </div></section>`;
}
```

- [ ] **Step 5: 绑定草稿写回**

在 `src/06-ui.js` 的 `bindArmyControls(panel)` 里，把 `data-create-army` 那个 forEach **之前**插入草稿记录，并在组建成功后清空草稿。整个 `bindArmyControls` 改成：

```javascript
function bindArmyControls(panel) {
  bindFold(panel, "battlelog", foldState.sections);
  // 记录草稿但不重渲染：重渲染会打断正在输入的光标。
  // 草稿本身足以让值活过下一次 renderAll()。
  panel.querySelectorAll("[data-new-army-unit]").forEach(input => input.addEventListener("input", () => {
    uiDraft.newArmy.units[input.dataset.newArmyUnit] = Math.max(0, Math.round(Number(input.value) || 0));
  }));
  panel.querySelector("#newArmyName")?.addEventListener("input", event => { uiDraft.newArmy.name = event.target.value; });
  panel.querySelector("#newArmyCommander")?.addEventListener("change", event => { uiDraft.newArmy.commanderId = event.target.value; });
  panel.querySelectorAll("[data-create-army]").forEach(button => button.addEventListener("click", () => {
    const draft = newArmyDraftView(S);
    const army = createArmyFromMain(S, uiDraft.newArmy.name || "第二军团", draft.commanderId || "player", draft.units);
    if (!army) { toast("兵力、指挥官或主军状态不符合组建条件"); return; }
    uiDraft.newArmy = { name: "第二军团", commanderId: null, units: {} };
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-disband-army]").forEach(button => button.addEventListener("click", () => {
    if (!disbandArmy(S, button.dataset.disbandArmy)) { toast("军团行军或交战中，暂时不能解散"); return; }
    saveGame(); renderAll();
  }));
}
```

- [ ] **Step 6: 补导出**

在 `src/07-exports.js` 把 Task 1 那行改成：

```javascript
    , uiDraft, armyCorpsHtml, newArmyDraftView
```

- [ ] **Step 7: 跑测试确认通过**

Run: `node tests/army.test.mjs`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
for f in src/*.js; do node --check "$f"; done
git add src/06-ui.js src/07-exports.js tests/army.test.mjs
git commit -m "修：组建军团表单不再被每 5 秒的重渲染清零"
```

---

## Task 3: 地图出征配置读写草稿

**Files:**
- Modify: `src/06-ui.js`（新增 `expeditionDraftView`；改 `castleExpeditionHtml` 与 `renderMap` 绑定）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

在 `tests/army.test.mjs` 的 `console.log` 之前追加：

```javascript
// ── 出征草稿：换了目标就作废 ──────────────────────────────────────────
{
  resetDraft();
  const s = fresh("换目标");
  const targets = game.attackableTerritories(s);
  assert.ok(targets.length >= 1, "开局应至少有一个可攻目标");
  game.uiDraft.expedition = { targetId: "另一个地方", armyIds: [], plan: "assault", grain: 999 };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.equal(view.plan, "steady", "targetId 不符时整块草稿过期，方略应回到默认");
}

// ── 出征草稿：已不是待命的军团要被剔除 ────────────────────────────────
{
  resetDraft();
  const s = fresh("剔除");
  const targets = game.attackableTerritories(s);
  game.uiDraft.expedition = { targetId: targets[0], armyIds: ["army_不存在"], plan: "steady", grain: null };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.ok(!view.armyIds.includes("army_不存在"), "不合格的军团必须被剔除");
  assert.ok(view.armyIds.length >= 1, "全被剔除后应回退到勾选第一支合格军团");
}

// ── 出征草稿：携带粮食夹进 [所需, 现有存粮] ────────────────────────────
{
  resetDraft();
  const s = fresh("粮食");
  const targets = game.attackableTerritories(s);
  game.uiDraft.expedition = { targetId: targets[0], armyIds: null, plan: "steady", grain: 999999 };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.ok(view.grain <= Math.max(view.required, Math.floor(s.grain)), "携带粮食不得超过现有存粮");
  assert.ok(view.grain >= view.required, "携带粮食不得低于本次所需");
}

// ── 勾选状态要渲染成 checked，否则每 5 秒回到「只勾第一支」 ─────────────
{
  resetDraft();
  const s = fresh("勾选");
  const targets = game.attackableTerritories(s);
  const html = game.castleExpeditionHtml(s, targets[0]);
  assert.ok(html.includes("data-expedition-army"), "出征面板应有军团勾选框");
  assert.ok(html.includes("checked"), "默认应勾选第一支合格军团");
}
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`game.expeditionDraftView is not a function`

- [ ] **Step 3: 新增 expeditionDraftView**

在 `src/06-ui.js` 的 `function castleExpeditionHtml` **之前**插入：

```javascript
// 出征草稿按目标绑定：换了查看目标，上一块草稿整体作废。
// 与 newArmyDraftView 同理，所有值都按当前真实状态夹取。
function expeditionDraftView(s, id) {
  const eligible = playerArmies(s).filter(army => army.status === "idle" && attackableTerritories(s, army.id).includes(id));
  const eligibleIds = eligible.map(army => army.id);
  const draft = uiDraft.expedition;
  const fresh = draft.targetId === id;
  let armyIds = fresh && Array.isArray(draft.armyIds) ? draft.armyIds.filter(armyId => eligibleIds.includes(armyId)) : [];
  if (!armyIds.length) armyIds = eligibleIds.slice(0, 1);
  const plan = fresh && PLANS[draft.plan] ? draft.plan : "steady";
  const composition = armyGroupComposition(s, armyIds);
  const leaders = armyIds.map(armyId => armyCommander(s, armyEntity(s, armyId)).id);
  const required = armyIds.length ? compositionSupply(s, composition, leaders) : 0;
  const maxGrain = Math.max(required, Math.floor(s.grain));
  const wanted = fresh && draft.grain != null ? Number(draft.grain) : required;
  const grain = clamp(Math.round(Number.isFinite(wanted) ? wanted : required), required, maxGrain);
  return { eligible, armyIds, plan, composition, leaders, required, grain, maxGrain };
}
```

- [ ] **Step 4: 改 castleExpeditionHtml 用草稿**

整段替换 `castleExpeditionHtml`：

```javascript
function castleExpeditionHtml(s, id) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || t.owner === "player" || d.playable === false) return "";
  const draft = expeditionDraftView(s, id);
  const eligible = draft.eligible;
  const previewIds = draft.armyIds;
  const preview = draft.composition;
  const leaders = draft.leaders;
  const required = draft.required;
  const locked = d.final && !crownAccessMet(s);
  const disabled = locked || !eligible.length || compositionTotal(preview) < 10 || s.grain < required;
  const previewTroops = compositionTotal(preview);
  // 预测跟着实际勾选与方略走。此前恒按「第一支军团 + 稳扎稳打」推演，
  // 玩家改了配置数字却不动，等于给了一个与实际出征无关的数。
  const est = previewTroops ? battleEstimate(s, id, leaders, previewTroops, draft.plan, previewIds[0], preview) : null;
  const risk = previewTroops ? casualtyForecast(s, id, leaders, previewTroops, draft.plan, previewIds[0]) : null;
  const planLevel = intelLevel(s, id);
  const forecastHtml = !est ? ""
    : planLevel === FOG_LEVELS.border
      ? `<div class="battle-estimate ${battleRiskClass(est.ratio)}">胜算预测（未侦察）：<b>${est.label}</b><br>只是从边境远远望过去的判断，具体守军编成、预计伤亡与战力拆解都要斥候回报才有。<br>${terrainAdvice(id, preview)}</div>`
      : `<div class="battle-estimate ${battleRiskClass(est.ratio)}">胜算预测（按当前预选）：<b>${est.label}</b><br>${battlePowerText(est.ratio)}${battleBreakdownText(est)}。预计伤亡${risk.low}—${risk.high}人。${battleMoraleText(est.effectiveMorale, s.morale)}<br>${terrainAdvice(id, preview)}${seasonOf(s).id === "winter" ? " 严冬会额外削弱骑士并增加军粮消耗。" : ""}</div>`;
  return `<section class="castle-plan"><div class="castle-plan-head"><b>从这里配置远征</b><span>${eligible.length ? `可用${eligible.length}支军团 · 预计${formatDuration(Math.min(...eligible.map(army => marchDurationForDistance(s, army.locationId, id))))}` : "没有在途或待命军团"}</span></div>
    <p class="expedition-note">选择一支军团单独出征，或勾选多支军团合军。每支军团会保留自己的兵种和指挥官。</p>
    ${forecastHtml}
    <div class="expedition-army-list">${eligible.length ? eligible.map(army => { const commander = armyCommander(s, army); return `<label class="expedition-army-row"><input type="checkbox" data-expedition-army="${army.id}" ${previewIds.includes(army.id) ? "checked" : ""}><span><b>${esc(army.name)}</b><small>${esc(commander.person?.name || "未任命")} · ${commander.isKnight ? "骑士" : "王子"} · ${compositionTotal(army.composition)}人 · ${compositionText(army.composition)}</small></span></label>`; }).join("") : `<div class="empty-state">先在军队页组建军团，再回到地图出征。</div>`}</div>
    <div class="castle-plan-grid"><label>作战方式<select data-expedition-plan="${id}">${Object.entries(PLANS).map(([planId, plan]) => `<option value="${planId}" ${planId === draft.plan ? "selected" : ""}>${plan.name}</option>`).join("")}</select></label><label>携带粮食<input type="number" min="${required}" max="${draft.maxGrain}" value="${draft.grain}" data-expedition-grain="${id}"><small>当前预选至少需要${required}粮。</small></label></div>
    <button class="city-attack-btn" data-expedition-launch="${id}" ${disabled ? "disabled" : ""}>${locked ? "王冠谷 · 条件未满足" : !eligible.length ? "没有可出征军团" : s.grain < required ? "粮食不足" : `出征 · ${d.name}`}</button></section>`;
}
```

- [ ] **Step 5: 绑定草稿写回并改出征处理器**

在 `src/06-ui.js` 的 `renderMap()` 里，把 `data-expedition-launch` 那个 forEach **整段替换**为下面三段（勾选框与方略要重渲染，因为预测和所需粮食跟着它们变；粮食输入只记录，不重渲染，否则光标会被打断）：

```javascript
  panel.querySelectorAll("[data-expedition-army]").forEach(input => input.addEventListener("change", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.armyIds = [...panel.querySelectorAll("[data-expedition-army]")].filter(item => item.checked).map(item => item.dataset.expeditionArmy);
    uiDraft.expedition.grain = null;   // 编成变了，所需粮食跟着变，旧数字作废
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-expedition-plan]").forEach(select => select.addEventListener("change", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.plan = select.value;
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-expedition-grain]").forEach(input => input.addEventListener("input", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.grain = Math.max(0, Math.round(Number(input.value) || 0));
  }));
  panel.querySelectorAll("[data-expedition-launch]").forEach(button => button.addEventListener("click", () => {
    const targetId = button.dataset.expeditionLaunch;
    const draft = expeditionDraftView(S, targetId);
    const armyIds = draft.armyIds;
    const armies = armyIds.map(id => armyEntity(S, id)).filter(Boolean);
    if (!armyIds.length || armies.some(army => army.status !== "idle") || compositionTotal(draft.composition) < 10) { toast("至少选择一支待命军团"); return; }
    if (draft.grain < draft.required || draft.grain > S.grain) { toast(`这支远征至少需要${draft.required}粮食`); return; }
    S.grain -= draft.grain;
    const job = startArmyGroupMarch(S, armyIds, targetId, Date.now(), { battlePlan: { leaderIds: draft.leaders, composition: draft.composition, troops: compositionTotal(draft.composition), plan: draft.plan, armyIds }, suppliedGrain: draft.grain });
    if (!job) { S.grain += draft.grain; toast("所选军团无法从当前位置合军出发"); return; }
    uiDraft.expedition = { targetId: null, armyIds: null, plan: null, grain: null };
    S.lastAction = { name: "军团远征出发", text: `${armyIds.length > 1 ? "多支军团合军" : armies[0].name}携${draft.grain}粮食前往${TERRITORY_DEFS[targetId].name}，预计${formatDuration(job.endAt - job.startedAt)}后抵达。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
```

- [ ] **Step 6: 补导出**

在 `src/07-exports.js` 把那行改成：

```javascript
    , uiDraft, armyCorpsHtml, newArmyDraftView, expeditionDraftView, castleExpeditionHtml
```

- [ ] **Step 7: 跑测试确认通过**

Run: `node tests/army.test.mjs`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/map.test.mjs
git add src/06-ui.js src/07-exports.js tests/army.test.mjs
git commit -m "修：出征配置不再被重渲染重置，预测改为跟随实际勾选"
```

---

## Task 4: 军团调动（放行规则与 redeployArmy）

**Files:**
- Modify: `src/04-state.js:627-645`（`startMarch`），其后新增 `redeployArmy`
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/army.test.mjs`：

```javascript
// ── 调动：自有领地不要求相邻 ──────────────────────────────────────────
// 此前 startMarch 只放行「相邻」或「带 battlePlan 打敌城」两条路径，
// UI 上两个调用点又都带 battlePlan —— 于是根本没有「单纯移动」这个操作，
// 主力打下一块地就钉死在那里。
{
  resetDraft();
  const s = fresh("调动");
  const own = game.ownTerritoryIds(s);
  const main = game.armyEntity(s, "army_1");
  const far = own.find(id => id !== main.locationId && !game.TERRITORY_DEFS[main.locationId].adj.includes(id));
  assert.ok(far, "开局自有领地里应有一块不与主力驻地相邻");
  const job = game.redeployArmy(s, "army_1", far, 1000);
  assert.ok(job, "调往不相邻的自有领地应当放行");
  assert.equal(job.payload.destinationId, far);
  assert.equal(main.status, "marching");
  assert.equal(job.endAt - job.startedAt, game.marchDurationForDistance(s, job.payload.originId, far),
    "行军时长应按距离算");
}

// ── 调动不扣粮 ────────────────────────────────────────────────────────
// 回防是被动动作，再收补给等于惩罚防守；距离换来的等待本身已经是代价。
{
  resetDraft();
  const s = fresh("不扣粮");
  const before = s.grain;
  const own = game.ownTerritoryIds(s);
  const main = game.armyEntity(s, "army_1");
  const target = own.find(id => id !== main.locationId);
  game.redeployArmy(s, "army_1", target, 1000);
  assert.equal(s.grain, before, "调动不应消耗粮食");
}

// ── 调往敌方领地必须拒绝 ──────────────────────────────────────────────
// 调动只是移动，不该变成一条绕过出征配置的偷袭路径。
{
  resetDraft();
  const s = fresh("拒绝敌地");
  const enemy = game.attackableTerritories(s)[0];
  assert.equal(game.redeployArmy(s, "army_1", enemy, 1000), null, "调往敌方领地应当拒绝");
}

// ── 非待命军团不能调动 ────────────────────────────────────────────────
{
  resetDraft();
  const s = fresh("非待命");
  const main = game.armyEntity(s, "army_1");
  main.status = "recovering";
  const target = game.ownTerritoryIds(s).find(id => id !== main.locationId);
  assert.equal(game.redeployArmy(s, "army_1", target, 1000), null, "整补中的军团不能调动");
}
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`game.redeployArmy is not a function`

- [ ] **Step 3: 给 startMarch 加调防放行路径**

在 `src/04-state.js`，把 `startMarch` 开头三行改成：

```javascript
function startMarch(s, armyId, destinationId, now = Date.now(), payload = {}) {
  const army = armyEntity(s, armyId);
  const originId = army?.locationId;
  const longExpedition = payload?.battlePlan && s.territories[destinationId]?.owner !== "player";
  // 调防：目标是自有领地时既不要求相邻，也不需要战斗计划。
  // 没有这条，「把主力调回自己城里驻防」这个动作在游戏里根本不存在。
  const redeploy = !payload?.battlePlan && s.territories[destinationId]?.owner === "player";
  if (!army || army.owner !== "player" || army.status !== "idle" || !TERRITORY_DEFS[destinationId] || TERRITORY_DEFS[destinationId].playable === false || (!longExpedition && !redeploy && !TERRITORY_DEFS[originId]?.adj.includes(destinationId)) || getRunningJob(s, `march:${armyId}`)) return null;
```

（其余函数体不变。）

- [ ] **Step 4: 新增 redeployArmy**

在 `src/04-state.js` 的 `startArmyGroupMarch` **之后**插入：

```javascript
// 调动只做单军团。合军是出征专用概念（多支军团合成一场战斗会话），
// 调防没有这个需求，两支军团各点一次即可。
function redeployArmy(s, armyId, destinationId, now = Date.now()) {
  if (!s || s.battleSession) return null;
  if (s.territories?.[destinationId]?.owner !== "player") return null;
  const army = armyEntity(s, armyId);
  if (!army || army.locationId === destinationId) return null;
  const job = startMarch(s, armyId, destinationId, now);
  if (!job) return null;
  const text = `${army.name}从${TERRITORY_DEFS[job.payload.originId]?.name || "驻地"}调往${TERRITORY_DEFS[destinationId].name}驻防，预计${formatDuration(job.endAt - job.startedAt)}后抵达。`;
  s.lastAction = { name: "军团调动", text };
  log(s, "info", text);
  return job;
}
```

- [ ] **Step 5: 补导出**

在 `src/07-exports.js` 那行末尾追加 `, redeployArmy`。

- [ ] **Step 6: 跑测试确认通过**

Run: `node tests/army.test.mjs`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/structure.test.mjs
node tests/clock.test.mjs
git add src/04-state.js src/07-exports.js tests/army.test.mjs
git commit -m "军团调动：自有领地之间可以自由调防，不要求相邻也不扣粮"
```

---

## Task 5: 驻扎军团查询与调动 UI

**Files:**
- Modify: `src/03-domain.js`（`playerArmies` 之后新增 `stationedArmies`）
- Modify: `src/06-ui.js`（新增 `armyRedeployHtml`；改 `territorySummary`、`armyCorpsHtml`、两处绑定）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/army.test.mjs`：

```javascript
// ── 驻扎军团：只算停在本地且不在移动中的 ──────────────────────────────
{
  resetDraft();
  const s = fresh("驻扎");
  const main = game.armyEntity(s, "army_1");
  const here = main.locationId;
  assert.equal(game.stationedArmies(s, here).length, 1, "待命的主力应算作驻扎");
  main.status = "recovering";
  assert.equal(game.stationedArmies(s, here).length, 1, "整补中的军团人还在本地，应算驻扎");
  main.status = "marching";
  assert.equal(game.stationedArmies(s, here).length, 0, "行军中的军团不在本地，不算驻扎");
}
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`game.stationedArmies is not a function`

- [ ] **Step 3: 新增 stationedArmies**

在 `src/03-domain.js` 的 `playerArmies` 函数**之后**插入：

```javascript
// 驻扎在某地的玩家军团。行军中与交战中不算 —— 它们人不在这里。
// 整补中算：疲兵也是兵，只是战力要打折（见 05-war.js 的 stationedPower）。
function stationedArmies(s, territoryId) {
  return (s?.armies || []).filter(army => army.owner === "player" && army.locationId === territoryId && ["idle", "recovering"].includes(army.status));
}
```

- [ ] **Step 4: 补导出并跑测试**

在 `src/07-exports.js` 那行末尾追加 `, stationedArmies`。

Run: `node tests/army.test.mjs`
Expected: PASS

- [ ] **Step 5: 新增 armyRedeployHtml**

在 `src/06-ui.js` 的 `function territorySummary` **之前**插入：

```javascript
// 自家领地的调军入口。驻防信息也在这里显示 —— 玩家要能一眼看出
// 这座城现在有没有野战部队撑着。
function armyRedeployHtml(s, id) {
  const stationed = stationedArmies(s, id);
  const stationedLine = stationed.length
    ? `<p class="redeploy-stationed">驻防：${stationed.map(army => `${esc(army.name)} ${compositionTotal(army.composition)}人${army.status === "recovering" ? "（整补中）" : ""}`).join("、")}</p>`
    : `<p class="redeploy-stationed">当前没有军团驻防，只有守军把守。</p>`;
  const movable = playerArmies(s).filter(army => army.status === "idle" && army.locationId !== id);
  const buttons = movable.length
    ? `<div class="expedition-army-list">${movable.map(army => `<button class="secondary-btn" data-redeploy-army="${army.id}" data-redeploy-target="${id}">调「${esc(army.name)}」来此 · ${compositionTotal(army.composition)}人 · 预计${formatDuration(marchDurationForDistance(s, army.locationId, id))}</button>`).join("")}</div>`
    : "";
  return `<section class="castle-plan"><div class="castle-plan-head"><b>调军驻防</b><span>${movable.length ? `${movable.length}支待命军团可调来` : "没有可调动的待命军团"}</span></div>${stationedLine}${buttons}</section>`;
}
```

- [ ] **Step 6: 把它接进 territorySummary**

在 `src/06-ui.js` 的 `territorySummary` 里，把这一行：

```javascript
  const castlePlan = t.owner !== "player" && d.playable !== false ? castleExpeditionHtml(s, id) : "";
```

改成两行：

```javascript
  const castlePlan = t.owner !== "player" && d.playable !== false ? castleExpeditionHtml(s, id) : "";
  const redeployPlan = t.owner === "player" ? armyRedeployHtml(s, id) : "";
```

再把结尾的 `ops` 那一行：

```javascript
  const ops = attack || castlePlan ? `<div class="city-ops">${attack}${castlePlan}</div>` : "";
```

改成：

```javascript
  const ops = attack || castlePlan || redeployPlan ? `<div class="city-ops">${attack}${castlePlan}${redeployPlan}</div>` : "";
```

- [ ] **Step 7: 军团卡加「调回主城」按钮**

在 `src/06-ui.js` 的 `armyCorpsHtml` 里，`const canCreate = ...` 之前插入：

```javascript
  const home = primaryTerritoryId(s);
```

再把军团卡里的 `${canDisband ? ...}` 那一段前面插入调回按钮，即把：

```javascript
${canDisband ? `<button class="ghost-btn" data-disband-army="${army.id}">解散军团</button>` : `<small class="corps-note">${army.id === "army_1" ? "主军不可解散" : "行军或交战中"}</small>`}
```

改成：

```javascript
${army.status === "idle" && army.locationId !== home ? `<button class="ghost-btn" data-redeploy-army="${army.id}" data-redeploy-target="${home}">调回${TERRITORY_DEFS[home]?.name || "主城"}</button>` : ""}${canDisband ? `<button class="ghost-btn" data-disband-army="${army.id}">解散军团</button>` : `<small class="corps-note">${army.id === "army_1" ? "主军不可解散" : "行军或交战中"}</small>`}
```

- [ ] **Step 8: 绑定调动按钮（两处）**

在 `src/06-ui.js` 的 `bindArmyControls(panel)` 里，`data-disband-army` 那个 forEach **之后**插入：

```javascript
  panel.querySelectorAll("[data-redeploy-army]").forEach(button => button.addEventListener("click", () => {
    if (rejectDuringBattle(S)) return;
    if (!redeployArmy(S, button.dataset.redeployArmy, button.dataset.redeployTarget)) { toast("该军团当前无法调动"); return; }
    saveGame(); renderAll();
  }));
```

在 `renderMap()` 里，`data-city-attack` 那个 forEach **之后**插入同样一段：

```javascript
  panel.querySelectorAll("[data-redeploy-army]").forEach(button => button.addEventListener("click", () => {
    if (rejectDuringBattle(S)) return;
    if (!redeployArmy(S, button.dataset.redeployArmy, button.dataset.redeployTarget)) { toast("该军团当前无法调动"); return; }
    saveGame(); renderAll();
  }));
```

- [ ] **Step 9: 跑测试并提交**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/army.test.mjs
node tests/map.test.mjs
git add src/03-domain.js src/06-ui.js src/07-exports.js tests/army.test.mjs
git commit -m "调军界面：地图检视区可调军驻防，军团卡可一键调回主城"
```

---

## Task 6: 驻扎参与守城

**Files:**
- Modify: `src/05-war.js`（`aiArmyPower` 之后新增常量与三个函数；改 `resolveAIAttack`）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/army.test.mjs`：

```javascript
// ── 驻扎战力并入守城 ──────────────────────────────────────────────────
// 此前军团停在自家城里对 resolveAIAttack 毫无影响 —— 停一支满编主力
// 和一个人不停，判定结果完全相同，「驻防」在机制上并不存在。
{
  resetDraft();
  const s = fresh("守城");
  const here = game.armyEntity(s, "army_1").locationId;
  const bare = game.stationedPower(s, here);
  assert.ok(bare > 0, "有主力驻扎时驻扎战力应大于 0");
  game.armyEntity(s, "army_1").status = "marching";
  assert.equal(game.stationedPower(s, here), 0, "军团行军后驻扎战力应归零");
}

// ── 整补中的军团贡献低于待命 ──────────────────────────────────────────
// 刚打完硬仗的疲兵不该立刻变成铜墙铁壁。这也让「胜后整补 90 秒」
// 第一次有了防守层面的意义。
{
  resetDraft();
  const s = fresh("整补折扣");
  const main = game.armyEntity(s, "army_1");
  const here = main.locationId;
  main.status = "idle";
  const full = game.stationedPower(s, here);
  main.status = "recovering";
  const tired = game.stationedPower(s, here);
  assert.ok(tired < full, "整补中的驻扎战力必须低于待命");
  assert.ok(tired > 0, "整补中仍应有贡献");
}

// ── 同样的进攻：无驻军时城破，有驻军时被击退 ──────────────────────────
{
  resetDraft();
  const s = fresh("对照");
  const main = game.armyEntity(s, "army_1");
  const target = main.locationId;
  const fixed = () => 0.5;
  const attacker = () => ({
    id: "wolf_test", name: "狼牙试探军", owner: "wolf", locationId: "highpass",
    composition: { levy: 40, archers: 10, knights: 6, heavy_infantry: 4, crossbowmen: 0, light_cavalry: 0 },
    morale: 62, status: "idle", jobId: null
  });

  // 先把主力挪走，确认这波进攻本来打得下来
  main.locationId = "__nowhere__";
  s.territories[target].guard = 4;
  s.territories[target].stability = 10;
  s.territories[target].buildings.walls = 0;
  s.territories[target].buildings.watchtower = 0;
  const without = game.resolveAIAttack(s, attacker(), target, fixed);
  assert.equal(without, "captured", "无驻军时这波进攻应当打得下来（否则本对照无效）");

  // 同样的城、同样的进攻，这次有满编主力驻防
  const s2 = fresh("对照2");
  const main2 = game.armyEntity(s2, "army_1");
  const target2 = main2.locationId;
  s2.territories[target2].guard = 4;
  s2.territories[target2].stability = 10;
  s2.territories[target2].buildings.walls = 0;
  s2.territories[target2].buildings.watchtower = 0;
  const withGarrison = game.resolveAIAttack(s2, attacker(), target2, fixed);
  assert.notEqual(withGarrison, "captured", "有满编主力驻防时不该被同一波进攻打下来");
}

// ── 击退也要流血，否则驻防是白嫖 ──────────────────────────────────────
{
  resetDraft();
  const s = fresh("驻防伤亡");
  const main = game.armyEntity(s, "army_1");
  const target = main.locationId;
  const before = game.compositionTotal(main.composition);
  s.territories[target].guard = 4;
  game.resolveAIAttack(s, {
    id: "wolf_t2", name: "狼牙袭扰", owner: "wolf", locationId: "highpass",
    composition: { levy: 20, archers: 4, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 },
    morale: 60, status: "idle", jobId: null
  }, target, () => 0.5);
  assert.ok(game.compositionTotal(main.composition) < before, "驻扎军团被打退后应有伤亡");
}

// ── 城破后驻扎军团撤离，不许滞留在敌城里 ──────────────────────────────
// 这同时修掉一个既有缺陷：AI 夺回玩家领地时，站在那儿的玩家军团
// 此前完全不受影响，会继续待在已经易主的城里。
{
  resetDraft();
  const s = fresh("撤离");
  // 用一块非主城的自有领地，免得城破直接终局
  const main = game.armyEntity(s, "army_1");
  const spot = game.ownTerritoryIds(s).find(id => id !== "ravenstone");
  main.locationId = spot;
  main.composition = { levy: 2, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 };
  s.territories[spot].guard = 1;
  s.territories[spot].stability = 5;
  s.territories[spot].buildings.walls = 0;
  s.territories[spot].buildings.watchtower = 0;
  const result = game.resolveAIAttack(s, {
    id: "wolf_t3", name: "狼牙主力", owner: "wolf", locationId: "highpass",
    composition: { levy: 90, archers: 30, knights: 20, heavy_infantry: 15, crossbowmen: 10, light_cavalry: 10 },
    morale: 80, status: "idle", jobId: null
  }, spot, () => 0.99);
  assert.equal(result, "captured", "这波进攻应当打得下来（否则本用例无效）");
  assert.notEqual(main.locationId, spot, "城破后军团不该滞留在已易主的城里");
  assert.ok(game.ownTerritoryIds(s).includes(main.locationId), "应撤往仍属于自己的领地");
  assert.equal(main.status, "recovering", "撤离后应进入整补");
}
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`game.stationedPower is not a function`

- [ ] **Step 3: 新增常量与三个函数**

在 `src/05-war.js` 的 `aiArmyPower` 函数**之后**插入：

```javascript
// 驻扎野战部队计入守城。0.8：野战部队守城不如城墙好使。
// 0.7：整补中的疲兵再打七折 —— 刚打完硬仗的部队不该立刻变成铜墙铁壁，
// 这也让「胜后整补 90 秒」第一次有了防守层面的意义。
const STATIONED_DEFENSE_FACTOR = .8;
const STATIONED_RECOVERING_FACTOR = .7;
// 打退了也要流血，否则驻防是白嫖；城破损失更重。
const STATIONED_LOSS_REPELLED = .04;
const STATIONED_LOSS_CAPTURED = .18;

function stationedPower(s, territoryId) {
  return stationedArmies(s, territoryId).reduce((sum, army) =>
    sum + aiArmyPower(army) * STATIONED_DEFENSE_FACTOR * (army.status === "recovering" ? STATIONED_RECOVERING_FACTOR : 1), 0);
}

// 扣除顺序按军团在 s.armies 里的下标从小到大，不按兵力或战力排序 ——
// 平衡模拟是确定性的，任何依赖运行期状态的排序都可能让两次运行结果不同。
function applyStationedLosses(s, territoryId, share) {
  const armies = stationedArmies(s, territoryId);
  const total = armies.reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  if (!armies.length || total <= 0) return 0;
  let left = Math.max(1, Math.round(total * share));
  let taken = 0;
  armies.forEach(army => {
    if (left <= 0) return;
    const removed = compositionTotal(removeFromComposition(army.composition, left));
    taken += removed;
    left -= removed;
  });
  syncTroops(s);
  return taken;
}

// 城破后撤往最近的自有领地并进入整补。距离相同时取 ownTerritoryIds 里
// 靠前的那个 —— 该函数返回顺序由 TERRITORY_DEFS 的键序决定，是确定的。
function retreatStationedArmies(s, territoryId, now = Date.now()) {
  const armies = stationedArmies(s, territoryId);
  const havens = ownTerritoryIds(s).filter(id => id !== territoryId);
  // 无处可退说明渡鸦堡也已失守，紧接着就会置 s.ended，游戏已经结束。
  if (!armies.length || !havens.length) return [];
  const haven = havens.reduce((best, id) => territoryDistance(territoryId, id) < territoryDistance(territoryId, best) ? id : best, havens[0]);
  armies.forEach(army => {
    army.locationId = haven;
    army.destinationId = null;
    army.jobId = null;
    army.status = "idle";
    startArmyRecovery(s, army, 90 * 1000, now);
  });
  return armies;
}
```

- [ ] **Step 4: 把驻扎战力并入 resolveAIAttack 的防御**

在 `src/05-war.js` 的 `resolveAIAttack` 里，把这一行：

```javascript
  const defense = t.guard + (t.buildings.walls || 0) * 8 + (t.buildings.watchtower || 0) * 4 + t.stability * .2;
```

改成：

```javascript
  const defense = t.guard + (t.buildings.walls || 0) * 8 + (t.buildings.watchtower || 0) * 4 + t.stability * .2 + stationedPower(s, targetId);
```

- [ ] **Step 5: 城破分支结算伤亡与撤离**

在同一函数的城破分支里，把这两行：

```javascript
    if (targetId === "ravenstone") { s.ended = true; s.endingReason = "fallen"; }
    return "captured";
```

改成（注意顺序：先扣伤亡再撤离，因为 `applyStationedLosses` 按 `locationId` 找军团；`retreatStationedArmies` 要在 `t.owner` 已改为敌方之后调用，这样 `ownTerritoryIds` 拿到的是城破后的名单）：

```javascript
    applyStationedLosses(s, targetId, STATIONED_LOSS_CAPTURED);
    retreatStationedArmies(s, targetId);
    if (targetId === "ravenstone") { s.ended = true; s.endingReason = "fallen"; }
    return "captured";
```

- [ ] **Step 6: 击退分支结算伤亡**

在同一函数结尾，把这一行：

```javascript
  army.locationId = originId || army.locationId;
  return attack > defense * .92 ? "raided" : "repulsed";
```

改成：

```javascript
  applyStationedLosses(s, targetId, STATIONED_LOSS_REPELLED);
  army.locationId = originId || army.locationId;
  return attack > defense * .92 ? "raided" : "repulsed";
```

- [ ] **Step 7: 补导出**

在 `src/07-exports.js` 那行末尾追加：

```javascript
, stationedPower, applyStationedLosses, retreatStationedArmies, STATIONED_DEFENSE_FACTOR, STATIONED_RECOVERING_FACTOR
```

- [ ] **Step 8: 跑测试确认通过**

Run: `node tests/army.test.mjs`
Expected: PASS

Run: `node tests/ai.test.mjs`
Expected: PASS（若因驻扎加成而红，说明该测试假设了「无驻军」的防御值 —— 读它的断言，把驻扎主力挪走再断言，不要改防御公式）

- [ ] **Step 9: 提交**

```bash
for f in src/*.js; do node --check "$f"; done
git add src/05-war.js src/07-exports.js tests/army.test.mjs
git commit -m "驻防：驻扎军团计入守城，打退要流血，城破要撤离"
```

---

## Task 7: 征兵队列每兵种一条

**Files:**
- Modify: `src/02-core.js`（`getRunningJob` 之后新增 `runningRecruitJob`）
- Modify: `src/04-state.js:583-609`（`canRecruitUnit`、`queueRecruitment`）
- Modify: `src/06-ui.js:382-391`（`armyRosterHtml`）
- Modify: `src/07-exports.js`
- Test: `tests/army.test.mjs`

- [ ] **Step 1: 写失败的测试**

追加到 `tests/army.test.mjs`：

```javascript
// ── 六个兵种各排各的队 ────────────────────────────────────────────────
// 此前 queueKey 是 recruit:${领地}，同一块地同时只能训练一个兵种，
// 其余兵种卡显示「训练队列占用」。放开后唯一的闸门是金币和粮食。
{
  resetDraft();
  const s = fresh("并行征兵");
  s.gold = 9999; s.grain = 9999;
  const territoryId = game.recruitmentTerritoryId(s);
  const first = game.queueRecruitment(s, "levy", territoryId, 1000);
  assert.ok(first, "第一个兵种应能排队");
  const second = game.queueRecruitment(s, "archers", territoryId, 1000);
  assert.ok(second, "第二个兵种不该被第一个占用");
  assert.notEqual(first.queueKey, second.queueKey, "两个兵种的 queueKey 必须不同");
}

// ── 同一兵种不能重复排队 ──────────────────────────────────────────────
{
  resetDraft();
  const s = fresh("重复排队");
  s.gold = 9999; s.grain = 9999;
  const territoryId = game.recruitmentTerritoryId(s);
  assert.ok(game.queueRecruitment(s, "levy", territoryId, 1000), "第一次应成功");
  assert.equal(game.queueRecruitment(s, "levy", territoryId, 1000), null, "同一兵种不能同时排两条");
}

// ── 旧存档里的 RECRUIT 任务仍要能正确判占用 ────────────────────────────
// 占用判定按任务内容匹配而不是按 queueKey，因此不需要写迁移代码。
{
  resetDraft();
  const s = fresh("旧存档");
  s.gold = 9999; s.grain = 9999;
  const territoryId = game.recruitmentTerritoryId(s);
  s.jobs = s.jobs || [];
  s.jobs.push({
    id: "legacy_job", type: "RECRUIT", territoryId, startedAt: 0, endAt: Date.now() + 99999,
    status: "running", payload: { unitType: "levy", amount: 8 }, queueKey: `recruit:${territoryId}`
  });
  assert.equal(game.canRecruitUnit(s, "levy", territoryId), false, "旧格式的在跑任务也要挡住同兵种重复排队");
  assert.equal(game.canRecruitUnit(s, "archers", territoryId), true, "旧格式任务不该挡住别的兵种");
}
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node tests/army.test.mjs`
Expected: FAIL，`第二个兵种不该被第一个占用`

- [ ] **Step 3: 新增 runningRecruitJob**

在 `src/02-core.js` 的 `getRunningJob` 函数**之后**插入：

```javascript
// 按任务内容匹配而不是按 queueKey：旧存档里在跑的 RECRUIT 任务
// queueKey 还是 recruit:${领地}，按内容匹配一样能识别，因此不需要迁移代码。
function runningRecruitJob(s, territoryId, type) {
  return (s?.jobs || []).find(job => job.status === "running" && job.type === "RECRUIT"
    && job.territoryId === territoryId && job.payload?.unitType === type) || null;
}
```

- [ ] **Step 4: 改占用判定与 queueKey**

在 `src/04-state.js` 的 `canRecruitUnit` 里，把：

```javascript
  if (!unit || !territory || territory.owner !== "player" || getRunningJob(s, `recruit:${territoryId}`) || s.gold < unit.gold || s.grain < unit.grain) return false;
```

改成：

```javascript
  if (!unit || !territory || territory.owner !== "player" || runningRecruitJob(s, territoryId, type) || s.gold < unit.gold || s.grain < unit.grain) return false;
```

在 `queueRecruitment` 里，把：

```javascript
    queueKey: `recruit:${territoryId}`,
```

改成：

```javascript
    queueKey: `recruit:${territoryId}:${type}`,
```

- [ ] **Step 5: 补导出并跑测试**

在 `src/07-exports.js` 那行末尾追加 `, runningRecruitJob`。

Run: `node tests/army.test.mjs`
Expected: PASS

- [ ] **Step 6: 改 armyRosterHtml 为每兵种独立倒计时**

在 `src/06-ui.js`，把 `armyRosterHtml` 整段替换成：

```javascript
function armyRosterHtml() {
  const territoryId = recruitmentTerritoryId(S);
  const garrison = territoryGarrison(S, territoryId);
  const place = TERRITORY_DEFS[territoryId]?.name || "本领地";
  const army = armyEntity(S, "army_1");
  const deployable = army?.status === "idle" && army.locationId === territoryId && compositionTotal(garrison) > 0;
  const main = army?.composition || emptyComposition();
  return `<div class="army-roster"><div class="section-note">王国主力：${compositionText(main)} · ${compositionTotal(main)}人；${place}待编驻军：${compositionText(garrison)}。六个兵种各排各的队，可以同时训练；完成后先进入驻军，再由主力驻扎时编入。</div>${deployable ? `<button class="secondary-btn" data-deploy-garrison="${territoryId}">把${place}驻军编入王国主力</button>` : ""}${Object.entries(UNIT_DEFS).map(([type, unit]) => { const job = runningRecruitJob(S, territoryId, type); const label = job ? `训练中 · ${formatDuration(getJobRemainingMs(job))}` : unitUnlockLabel(S, type, territoryId); const count = garrison[type] || 0; const mainCount = main[type] || 0; const equipment = unitEquipment(S, type); return `<article class="unit-card"><div class="unit-head"><b>${glyphSvg(type)}${unit.name}</b><strong>${mainCount}<small>主力 · ${count}待编</small></strong></div><p>${unitDisplayHint(type)}<br>装备等级 ${equipment.level}</p><button data-recruit-unit="${type}" ${!canRecruitUnit(S, type, territoryId) ? "disabled" : ""}>${job ? `<span data-job-countdown="${job.id}" data-job-prefix="训练中 · ">${label}</span>` : label}</button></article>`; }).join("")}</div>`;
}
```

- [ ] **Step 7: 提交**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/army.test.mjs
node tests/clock.test.mjs
git add src/02-core.js src/04-state.js src/06-ui.js src/07-exports.js tests/army.test.mjs
git commit -m "征兵：六个兵种各排各的队，唯一闸门回到金币和粮食"
```

---

## Task 8: 平衡校准

**Files:**
- Modify: `src/05-war.js`（仅在超出区间时调 `STATIONED_DEFENSE_FACTOR`）
- Modify: `README.md`

- [ ] **Step 1: 跑平衡模拟，记下结果**

Run: `node tests/campaign-balance.sim.mjs`

**基准**：120 局里机器人统一 46 局（38%）、法统旁落 66 局、经营崩溃 8 局，统一中位数第 46 季。

**判据**：统一率落在 **30%–48%** 视为可接受。

- [ ] **Step 2: 超出区间才调，且一次只动一个旋钮**

若统一率 > 48%：把 `src/05-war.js` 的 `STATIONED_DEFENSE_FACTOR` 从 `.8` 下调到 `.65`，重跑。
若统一率 < 30%：上调到 `.95`，重跑。
仍不达标再动征募量或兵种成本。

**不要改基准去迁就实现。** 每次只动一个数，重跑后记录，避免分不清是哪个改动起的作用。

- [ ] **Step 3: 跑两遍确认模拟仍是确定性的**

```bash
node tests/campaign-balance.sim.mjs > /tmp/sim1.txt
node tests/campaign-balance.sim.mjs > /tmp/sim2.txt
diff /tmp/sim1.txt /tmp/sim2.txt && echo "确定性 OK"
```

Expected: `确定性 OK`。若两次不同，说明本轮改动引入了未被测试台控制的时间或随机源 —— 大概率是 `retreatStationedArmies` 的 `now = Date.now()` 默认值。修法是从调用处把时刻传进去，不是接受抖动。

- [ ] **Step 4: 更新 README**

在 `README.md` 的「### 战争」一节末尾追加：

```markdown
- 军团可在自有版图内自由调动（不要求相邻、不扣粮），驻扎在自家城里的军团计入该城守城战力，
  整补中打七折；打退要流血，城破则撤往最近的自有领地
```

在「### 经营」一节的征募相关条目后追加：

```markdown
- 六个兵种各有独立的训练队列，可以同时训练；唯一的闸门是金币和粮食
```

在「## 检查与封装」的命令清单里，`node tests/map.test.mjs` **之后**插入一行：

```bash
node tests/army.test.mjs
```

- [ ] **Step 5: 提交**

```bash
git add README.md src/05-war.js
git commit -m "配平：驻防系数校准，README 补三条"
```

---

## Task 9: 全量回归与打包

- [ ] **Step 1: 跑全部检查**

```bash
for f in src/*.js; do node --check "$f"; done
node tests/structure.test.mjs
node tests/lords.test.mjs
node tests/migration.test.mjs
node tests/clock.test.mjs
node tests/tech.test.mjs
node tests/ai.test.mjs
node tests/map.test.mjs
node tests/army.test.mjs
node tests/campaign-balance.sim.mjs
```

Expected: 全部 PASS，无 `node --check` 报错。

- [ ] **Step 2: 打包**

Run: `python3 build_single.py`
Expected: 重新生成 `模拟中世纪领主-单文件版.html`，无报错。

- [ ] **Step 3: 浏览器实测四条**

启动 `python3 -m http.server 8788`，访问 `http://127.0.0.1:8788/`，逐条确认：

1. **表单不再被清零** —— 在军队页把兵力填好、选一个骑士，等 15 秒以上（跨过至少两次 drift），值应当还在
2. **调动可用** —— 军队页点「调回渡鸦堡」，军团进入行军，到点抵达
3. **驻防显示** —— 地图选中自家领地，检视区能看到「驻防：XX 军团 N 人」与调军按钮
4. **并行征兵** —— 六个兵种可同时点下去，各自倒计时，不再出现「训练队列占用」

**注意**：浏览器里的世界时钟每 5 秒才推进一次逻辑；若页面被切到后台超过 5 分钟，Chrome 会把定时器节流到约 1 次/分钟，此时观察不到 5 秒一次的渲染。测第 1 条时保持标签页在前台。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "打包：更新单文件版"
```

---

## 自查记录

- **规格覆盖**：设计文档四部分 → Task 1-3（零）、Task 4-5（一）、Task 6（二）、Task 7（三）；夹取表六条 → Task 2 三条 + Task 3 三条；平衡校准 → Task 8。
- **未纳入**：`data-castle-launch` 死代码（设计文档「不做什么」已注明，已单独开任务）。
- **命名一致性**：`uiDraft.newArmy` / `uiDraft.expedition`、`newArmyDraftView` / `expeditionDraftView`、`stationedArmies` / `stationedPower` / `applyStationedLosses` / `retreatStationedArmies`、`runningRecruitJob` 在计划全文与测试中拼写一致。
- **依赖方向**：`stationedArmies` 在 03-domain.js，`stationedPower` 在 05-war.js（它调 05 的 `aiArmyPower`），符合「前面的文件不得引用后面的文件」。
