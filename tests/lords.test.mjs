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

// 空 lordId 必须返回空集：所有独立叛臣的 liege 都是 null，
// 不加这层保护会把他们全部当成「某个 null 主君的附庸」返回。
assert.deepEqual(game.lordVassals(s, null), [], "lordVassals(null) 不应返回独立叛臣");
assert.deepEqual(game.lordVassals(s, undefined), [], "lordVassals(undefined) 不应返回独立叛臣");
assert.deepEqual(game.lordHoldings(s, null), [], "lordHoldings(null) 不应返回玩家领地");

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

// 归属不变式：side 与 liegeLordId 必须同进同退，否则 Task 8「处死领主 → 其骑士转死敌」
// 会按 liegeLordId 把玩家自己招募来的骑士也一并变成死敌。
const inv = game.createInitialState("归属不变式", "oath", "standard");
const rover = inv.knights.find(k => !k.liegeLordId && k.status === "available");
assert.ok(rover, "应存在可直接招募的无主游侠");
assert.ok(game.knightAction(rover.id, "recruit", inv));
game.processCompletedJobs(inv, inv.jobs.at(-1).endAt);
const hired = inv.knights.find(k => k.id === rover.id);
assert.equal(hired.side, "player");
assert.equal(hired.liegeLordId, "player", "招募后 liegeLordId 必须改指玩家，不能停留在旧主君");

// 仍效忠叛臣的骑士不能被金币直接买走，否则整条「收服领主」路线可以被绕开
const sworn = inv.knights.find(k => k.liegeLordId && k.liegeLordId !== "player" && k.status === "available");
assert.ok(sworn, "应存在效忠于叛臣的骑士");
assert.equal(game.knightAction(sworn.id, "recruit", inv), false, `${sworn.id} 效忠 ${sworn.liegeLordId}，不应能被直接招募`);
assert.ok(game.availableKnights(inv).every(k => !k.liegeLordId), "可招募名单里不应出现有主君的骑士");

// 守将：每块叛臣领地都该有具名守将，而不是只有三名大叛臣的主城才有人守
const ds = game.createInitialState("守将测试", "oath", "standard");
assert.equal(game.defenderLeader(ds, "highpass").id, "bran", "北境关由布兰亲守");
assert.equal(game.defenderLeader(ds, "wolfden").id, "harald", "狼穴由附庸哈拉尔守");
assert.equal(game.defenderLeader(ds, "crownvale").id, "regent");
assert.equal(game.defenderLeader(ds, "ashgate").id, "renard", "独立叛臣也是守将");
assert.equal(game.defenderLeader(ds, "ravenstone"), null, "玩家领地没有敌方守将");
// 20 块叛臣领地应当无一例外都有守将
const undefended = game.playableTerritoryIds()
  .filter(id => ds.territories[id].owner !== "player")
  .filter(id => !game.defenderLeader(ds, id));
assert.deepEqual(undefended, [], `这些叛臣领地没有守将：${undefended.join("、")}`);
// 守将归降玩家后不再守卫原地
ds.officers.find(o => o.id === "harald").side = "player";
assert.equal(game.defenderLeader(ds, "wolfden"), null, "已归降的领主不应再作为敌方守将");

// Task 7: 打服路线 —— 领主被俘
// 测试 1: 攻下领主唯一辖地 → 守将被俘，产生 lord_capture 决策，conquest 决策被取代
const bs = game.createInitialState("被俘测试", "iron", "standard");
const fixedRng = v => () => v;
const sess = game.startBattle(bs, { targetId: "ashfield", leaderIds: ["player"], troops: bs.troops, plan: "assault" }, fixedRng(.8));
assert.ok(sess);
game.applyBattleChoice(bs, "ridge", fixedRng(.9));
game.applyBattleChoice(bs, "shield", fixedRng(.9));
game.applyBattleChoice(bs, "press", fixedRng(.9));
assert.equal(bs.territories.ashfield.owner, "player", "灰麦原应被攻下");
assert.equal(bs.territories.ashfield.lordId, null, "攻下后该地不再有叛臣守将");
const selma = bs.officers.find(o => o.id === "selma");
assert.equal(selma.captured, true, "失去全部辖地的守将被俘");
assert.ok(bs.pendingDecisions.some(d => d.type === "lord_capture" && d.lordId === "selma"), "应产生领主处置决策");
assert.ok(!bs.pendingDecisions.some(d => d.type === "conquest"), "旧的战后处置已被领主处置取代");

// 测试 2: 仍有其他辖地的领主不会在失去一块地时被俘，而是退走
// 给布兰额外控制 pineford（原本是 otto 的地），打下 pineford 后
// 布兰还持有 highpass，所以不会被俘。
const ms = game.createInitialState("多地测试", "iron", "standard");
ms.territories.pineford.lordId = "bran";
const msess = game.startBattle(ms, { targetId: "pineford", leaderIds: ["player"], troops: ms.troops, plan: "assault" }, fixedRng(.8));
assert.ok(msess, "应能对松林渡发起进攻");
game.applyBattleChoice(ms, "ridge", fixedRng(.9));
game.applyBattleChoice(ms, "shield", fixedRng(.9));
game.applyBattleChoice(ms, "press", fixedRng(.9));
assert.equal(ms.territories.pineford.owner, "player", "松林渡应被攻下");
const bran = ms.officers.find(o => o.id === "bran");
assert.equal(bran.captured, false, "布兰还有 highpass，不应被俘");
assert.ok(!ms.pendingDecisions.some(d => d.type === "lord_capture" && d.lordId === "bran"), "仍有辖地的领主不产生被俘决策");
// 验证退走日志（log 条目字段为 kind/text）
const warnLogs = ms.log.filter(l => l.kind === "warn" && l.text.includes("布兰"));
assert.ok(warnLogs.length > 0, "仍有辖地的领主应有退走日志");

// Task 8: 被俘领主的四选一处置
const cs = game.createInitialState("处置测试", "oath", "standard");
cs.officers.find(o => o.id === "selma").captured = true;
cs.territories.ashfield.owner = "player";
cs.territories.ashfield.lordId = null;
const capture = { type: "lord_capture", lordId: "selma", territoryId: "ashfield" };
const view = game.decisionView(cs, capture);
assert.ok(view, "应能渲染领主处置视图");
assert.equal(view.options.length, 4, "应有四个处置选项");
assert.equal(game.decisionView(cs, { type: "lord_capture", lordId: "查无此人" }), null, "找不到领主时应返回 null 而非崩溃");

const fork = () => JSON.parse(JSON.stringify(cs));

// 选项一：接受效忠。被俘的骑士随之归入麾下，且 liegeLordId 必须改指玩家
const submitState = fork();
submitState.knights.find(k => k.id === "knight_13").status = "captured";
game.decisionView(submitState, capture).options[0].effect();
const joined = submitState.officers.find(o => o.id === "selma");
assert.equal(joined.side, "player");
assert.equal(joined.loyalty, 45, "打服的忠诚基线为 45");
assert.equal(joined.captured, false);
assert.equal(joined.submitted, true);
const freedKnight = submitState.knights.find(k => k.id === "knight_13");
assert.equal(freedKnight.side, "player");
assert.equal(freedKnight.liegeLordId, "player", "随主君归降的骑士必须改挂玩家");

// 选项二：收赎金，金额随抵抗值而定
const ransomState = fork();
const goldBefore = ransomState.gold;
const expectedRansom = Math.round(ransomState.officers.find(o => o.id === "selma").defiance * 4);
game.decisionView(ransomState, capture).options[1].effect();
assert.equal(ransomState.gold, goldBefore + expectedRansom, "赎金应为抵抗值×4");
assert.equal(ransomState.officers.find(o => o.id === "selma").side, "gone");

// 选项四：处死 —— 正统性重挫，其骑士永为死敌，邻近领主抵抗下降
const executeState = fork();
executeState.knights.find(k => k.id === "knight_13").status = "captured";
const legitBefore = executeState.legitimacy;
const neighbourBefore = executeState.officers.find(o => o.id === "otto").defiance;
game.decisionView(executeState, capture).options[3].effect();
assert.equal(executeState.officers.find(o => o.id === "selma").side, "gone");
assert.equal(executeState.legitimacy, legitBefore - 10, "处死扣 10 正统性");
assert.equal(executeState.knights.find(k => k.id === "knight_13").status, "hostile", "其骑士转为死敌");
assert.ok(executeState.officers.find(o => o.id === "otto").defiance < neighbourBefore, "相邻领主的抵抗值应下降");
// 死敌骑士不得再被招募
assert.equal(game.knightAction("knight_13", "recruit", executeState), false, "死敌骑士不应还能被招募");

// Task 9: selfCheck 必须能发现领主绑定被写坏
const bad = game.createInitialState("自检测试", "oath", "standard");
bad.territories.highpass.lordId = "nobody";
const check = game.selfCheck(bad);
assert.equal(check.ok, false);
assert.ok(check.errors.some(e => e.includes("nobody")), `自检应报出无效 lordId，实际：${JSON.stringify(check.errors)}`);

const bad2 = game.createInitialState("自检测试2", "oath", "standard");
bad2.territories.ravenstone.lordId = "bran";
assert.ok(game.selfCheck(bad2).errors.some(e => e.includes("ravenstone")), "玩家领地不应残留守将");

// 金币直接招募领主的旧路线已随叛臣体系一并移除
assert.equal(game.recruitOfficer, undefined, "recruitOfficer 已删除，收服领主只能靠打服/说服/收买");

console.log("lords tests passed");
