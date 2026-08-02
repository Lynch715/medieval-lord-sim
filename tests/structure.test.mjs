import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const game = require("../app.js");
const source = readFileSync(fileURLToPath(new URL("../app.js", import.meta.url)), "utf8");

function fixed(value) { return () => value; }

const fresh = game.createInitialState("测试领主", "oath", "standard");
assert.equal(fresh.playerName, "测试领主");
assert.equal(game.seasonOf(fresh).id, "spring");
assert.deepEqual(game.attackableTerritories(fresh).sort(), ["ashfield", "pineford"]);
assert.equal(game.subjects(fresh), 218);
assert.equal(game.armyTotal(fresh), fresh.troops);
assert.deepEqual(fresh.army, { levy: 30, archers: 8, knights: 4 });
assert.equal(game.recruitAmount(fresh, "levy"), 9, "守誓开局兵营应形成小规模增援，而非一次补满伤亡");
assert.equal(game.recruitAmount(fresh, "archers"), 6);
const hallRecruitState = game.createInitialState("征募一致性", "oath", "standard");
const hallRecruit = game.ACTIONS.find(action => action.id === "recruit");
const hallGold = hallRecruitState.gold;
const hallGrain = hallRecruitState.grain;
const hallLevy = hallRecruitState.army.levy;
hallRecruitState.usedActions.recruit = 1;
hallRecruit.run(hallRecruitState);
assert.equal(hallGold - hallRecruitState.gold, game.UNIT_DEFS.levy.gold, "议事厅与征战页的长矛兵价格应一致");
assert.equal(hallGrain - hallRecruitState.grain, game.UNIT_DEFS.levy.grain);
assert.equal(hallRecruitState.army.levy - hallLevy, game.recruitAmount(hallRecruitState, "levy"));
assert.equal(game.canRecruitUnit(hallRecruitState, "levy"), false, "同季度不得从两个页面重复征募长矛兵");
assert.ok(game.forecast(fresh).gold > 0);
assert.ok(game.forecast(fresh).grainCost > 0);
assert.ok(game.forecast(fresh).storageCap > fresh.grain, "粮仓容量应进入经营预测");
assert.equal(game.WORLD_EVENTS.length, 18, "应有18个领地动态事件");
assert.equal(game.NPC_ARCS.length, 12, "六名关键人物应各有两段个人事件");
assert.equal(game.WORLD_EVENTS.flatMap(event => event.options).length, 54, "18个领地事件应保留54个选择结果");
assert.equal(game.NPC_ARCS.flatMap(event => event.options).length, 36, "12个人物事件应保留36个选择结果");
game.NPC_ARCS.forEach(event => assert.ok(event.body.includes("“"), `${event.id}应包含符合人物身份的直接引语`));
for (const staleCopy of [
  "土地不是地图上的颜色",
  "账本，比战报更诚实",
  "粮仓替天空付了这笔账",
  "钱袋发完，制度没有留下",
  "誓言很清楚，沉默也很清楚",
  "你把一个破败封地变成了不会停下的统治机器",
  "开局的誓言只是起点",
  "正统",
  "功勋",
  "攻守比",
  "预计折损",
  "战场势头",
  "行军方略",
  "军屯边防",
  "轻徭休养",
  "败者的誓言",
  "纳入直属领地",
  "怨气",
  "忠诚倾向",
  "军令封蜡",
  "副印",
  "氏族战首",
  "河望伯领",
  "累计阵亡",
  "军饷家臣",
  "人口军粮",
  "战场优势",
  "我军战力约为敌军"
]) assert.ok(!source.includes(staleCopy), `高频作者式旧文案不应回归：${staleCopy}`);

for (const plainLabel of ["武力", "统率", "谋略", "治理", "魅力", "人员开支", "粮食消耗", "当前战况", "休养"]) {
  assert.ok(source.includes(plainLabel), `界面应保留白话标签：${plainLabel}`);
}

const beforeFields = game.territoryOutput(fresh, "ravenstone").grain;
fresh.territories.ravenstone.buildings.fields++;
assert.ok(game.territoryOutput(fresh, "ravenstone").grain > beforeFields, "农田升级应提高粮食产出");

const battleState = game.createInitialState("战斗测试", "iron", "standard");
const session = game.startBattle(battleState, {
  targetId: "ashfield",
  leaderIds: ["player", "renard", "ysabel"],
  troops: battleState.troops,
  plan: "assault"
}, fixed(.8));
assert.ok(session, "应能向相邻领地开战");
assert.equal(battleState.ap, 1, "一次远征应占用本季大部分行动力");
assert.ok(battleState.grain < 125, "远征应消耗军粮");
assert.ok(game.stageOptions(battleState, session).some(option => option.id === "forced"), "雷纳德应提出抢攻");
game.applyBattleChoice(battleState, "forced", fixed(.9));
assert.equal(battleState.battleSession.stage, 1);
assert.ok(game.stageOptions(battleState, battleState.battleSession).some(option => option.id === "charge"));
game.applyBattleChoice(battleState, "charge", fixed(.9));
assert.equal(battleState.battleSession.stage, 2);
game.applyBattleChoice(battleState, "press", fixed(.9));
assert.equal(battleState.territories.ashfield.owner, "player", "强势三阶段应能夺取灰麦原");
assert.equal(battleState.wins, 1);
assert.equal(game.armyTotal(battleState), battleState.troops, "战损后兵种合计应与军队总数一致");
assert.equal(Object.values(battleState.lastBattle.lossesByType).reduce((a, b) => a + b, 0), battleState.lastBattle.losses);
assert.ok(battleState.warWeariness > 0, "出征与伤亡应累积战争疲劳");
assert.ok(battleState.pendingDecisions.some(d => d.type === "conquest"), "夺地后必须处理统治方式");
assert.ok(battleState.lastBattle.garrisoned > 0, "夺城后必须从野战军抽调驻军");
assert.equal(battleState.campaignCooldown, 3, "胜利后应进入三个季度休整期");
const postWinActions = battleState.usedActions;
battleState.usedActions = {};
battleState.ap = 3;
assert.equal(game.startBattle(battleState, { targetId: "pineford", leaderIds: ["player", "renard"], troops: 20, plan: "steady" }, fixed(.8)), null, "休整期内不得连续滚雪球出征");
battleState.usedActions = postWinActions;

const steadyCostState = game.createInitialState("稳攻测试", "iron", "standard");
game.startBattle(steadyCostState, { targetId: "ashfield", leaderIds: ["player", "renard", "ysabel"], troops: steadyCostState.troops, plan: "steady" }, fixed(.8));
game.applyBattleChoice(steadyCostState, "ridge", fixed(.9));
game.applyBattleChoice(steadyCostState, "shield", fixed(.9));
game.applyBattleChoice(steadyCostState, "hold", fixed(.9));
assert.ok(battleState.lastBattle.losses >= steadyCostState.lastBattle.losses * 1.6, "连续强攻的伤亡应显著高于稳攻");

const defeatCostState = game.createInitialState("败战代价", "wealth", "standard");
game.startBattle(defeatCostState, { targetId: "pineford", leaderIds: ["player", "ysabel"], troops: 30, plan: "steady" }, fixed(.4));
defeatCostState.battleSession.playerLoss = 12;
defeatCostState.battleSession.enemyLoss = 5;
defeatCostState.battleSession.lossesByType = game.allocateLosses(defeatCostState.battleSession.composition, 12);
const goldBeforeDefeat = defeatCostState.gold;
const grainBeforeDefeat = defeatCostState.grain;
const defeatReport = game.finishBattle(defeatCostState, "loss", fixed(1)).report;
assert.ok(defeatReport.lostGold > 0 && defeatCostState.gold < goldBeforeDefeat, "战败应丢失随军金币");
assert.ok(defeatReport.lostGrain > 0 && defeatCostState.grain < grainBeforeDefeat, "战败应额外丢失军粮");

const retreatState = game.createInitialState("撤退测试", "wealth", "standard");
game.startBattle(retreatState, {
  targetId: "pineford",
  leaderIds: ["player", "ysabel"],
  troops: 30,
  plan: "steady"
}, fixed(.4));
game.applyBattleChoice(retreatState, "ridge", fixed(.3));
game.applyBattleChoice(retreatState, "shield", fixed(.3));
assert.ok(game.stageOptions(retreatState, retreatState.battleSession).some(option => option.id === "retreat"));
const retreat = game.applyBattleChoice(retreatState, "retreat", fixed(.3));
assert.equal(retreat.report.outcome, "retreat");
assert.equal(retreatState.territories.pineford.owner, "wolf");
assert.ok(retreat.report.persistentEnemyLoss > 0, "撤退时已经造成的敌军伤亡不应凭空恢复");
assert.equal(retreatState.territories.pineford.guard, game.TERRITORY_DEFS.pineford.guard - retreat.report.persistentEnemyLoss);
const damagedEnemyGuard = retreatState.territories.pineford.guard;
game.settleSeasonEconomy(retreatState);
assert.equal(retreatState.territories.pineford.guard, damagedEnemyGuard + 1, "受创敌军应缓慢补员，使持续进攻与等待产生取舍");

const measuredRetreat = game.createInitialState("克制撤退", "iron", "standard");
game.startBattle(measuredRetreat, { targetId: "ashfield", leaderIds: ["player", "renard"], troops: 30, plan: "assault" }, fixed(.5));
measuredRetreat.battleSession.flags.pushed = true;
measuredRetreat.battleSession.momentum = 5;
measuredRetreat.battleSession.enemyLoss = 5;
const renardGrievance = measuredRetreat.officers.find(o => o.id === "renard").grievance;
game.finishBattle(measuredRetreat, "retreat", fixed(1));
assert.equal(measuredRetreat.officers.find(o => o.id === "renard").grievance, renardGrievance, "未占尽优势时撤退不应触发雷纳德特质惩罚");

const saveRoundTrip = game.hydrateState(JSON.parse(JSON.stringify(battleState)));
assert.equal(saveRoundTrip.version, 1);
assert.equal(saveRoundTrip.territories.ashfield.owner, "player");

const legacy = game.createInitialState("旧存档", "oath", "standard");
delete legacy.army;
legacy.troops = 25;
const migrated = game.hydrateState(JSON.parse(JSON.stringify(legacy)));
assert.equal(game.armyTotal(migrated), 25, "旧存档军队总数迁移后不得膨胀");
assert.equal(migrated.territories.ravenstone.policy, "balanced");
assert.deepEqual(migrated.seenEvents, []);
assert.deepEqual(migrated.seenNpcEvents, []);

const staleFiefSave = game.createInitialState("旧封地存档", "oath", "standard");
staleFiefSave.territories.ashfield.owner = "player";
staleFiefSave.territories.ashfield.fiefHolder = "edmund";
staleFiefSave.officers.find(o => o.id === "edmund").fief = "ashfield";
staleFiefSave.officers.find(o => o.id === "edmund").side = "gone";
const repairedFiefSave = game.hydrateState(JSON.parse(JSON.stringify(staleFiefSave)));
assert.equal(repairedFiefSave.territories.ashfield.fiefHolder, null, "旧存档中离场家臣的封地应自动收回");
assert.equal(repairedFiefSave.officers.find(o => o.id === "edmund").fief, null);

const terrainState = game.createInitialState("地形测试", "iron", "standard");
terrainState.army = { levy: 0, archers: 0, knights: 30 };
game.syncTroops(terrainState);
const knightPlain = game.battleEstimate(terrainState, "ashfield", ["player", "renard"], 30, "assault");
const knightForest = game.battleEstimate(terrainState, "pineford", ["player", "renard"], 30, "assault");
assert.ok(knightPlain.unitPower > knightForest.unitPower * 1.4, "披甲骑士在平原应明显强于密林");
terrainState.army = { levy: 0, archers: 30, knights: 0 };
game.syncTroops(terrainState);
const bowPlain = game.battleEstimate(terrainState, "ashfield", ["player", "ysabel"], 30, "ambush");
const bowForest = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "ambush");
assert.ok(bowForest.unitPower > bowPlain.unitPower, "弓箭手在密林应强于开阔农田");
const pineAssault = game.battleEstimate(terrainState, "pineford", ["player", "edmund", "ysabel"], 30, "assault");
const pineAmbush = game.battleEstimate(terrainState, "pineford", ["player", "edmund", "ysabel"], 30, "ambush");
assert.ok(pineAmbush.attack > pineAssault.attack, "高谋略队伍在密林采用伏击应优于正面强攻");
terrainState.army = { levy: 8, archers: 0, knights: 4 };
assert.ok(game.compositionPower({ levy: 0, archers: 0, knights: 4 }, "ashfield", "assault") > game.compositionPower({ levy: 8, archers: 0, knights: 0 }, "ashfield", "assault"), "平原强攻时一批昂贵骑士应强于一批长矛兵");
terrainState.turn = 1;
const summerPower = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "steady").attack;
terrainState.turn = 3;
const winterPower = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "steady").attack;
assert.ok(summerPower > winterPower, "冬季应削弱远征战力");
terrainState.turn = 1;
terrainState.warWeariness = 0;
const freshPower = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "steady").attack;
terrainState.warWeariness = 80;
const tiredPower = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "steady").attack;
assert.ok(freshPower > tiredPower * 1.25, "高战争疲劳应显著压低战力");
terrainState.morale = 9;
assert.equal(game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "steady").effectiveMorale, 45, "领主亲征时军心应至少按45计算");

const governState = game.createInitialState("治政测试", "oath", "standard");
const governedGold = game.territoryOutput(governState, "ravenstone").gold;
governState.officers.find(o => o.id === "ysabel").injured = 2;
governState.officers.find(o => o.id === "oswin").injured = 2;
const unguidedGold = game.territoryOutput(governState, "ravenstone").gold;
assert.ok(governedGold > unguidedGold, "高治政家臣应实际提高领地产出");

const policyState = game.createInitialState("政策测试", "wealth", "standard");
policyState.territories.ravenstone.policy = "relief";
const reliefGold = game.territoryOutput(policyState, "ravenstone").gold;
const reliefStability = policyState.territories.ravenstone.stability;
const reliefSupport = policyState.support;
game.settleSeasonEconomy(policyState);
assert.equal(policyState.territories.ravenstone.stability, reliefStability + 4, "减税休养每季应恢复稳定");
assert.equal(policyState.support, reliefSupport + 1, "减税休养每季应恢复民心");
policyState.territories.ravenstone.policy = "extract";
const extractGold = game.territoryOutput(policyState, "ravenstone").gold;
assert.ok(extractGold > reliefGold, "提高税收的金币产出应高于减税休养");
const extractStability = policyState.territories.ravenstone.stability;
game.settleSeasonEconomy(policyState);
assert.equal(policyState.territories.ravenstone.stability, extractStability - 4, "加征赋税每季应损耗稳定");

const economyState = game.createInitialState("长期经营", "oath", "standard");
for (let i = 0; i < 48; i++) { game.settleSeasonEconomy(economyState); economyState.turn++; }
assert.ok(economyState.grain < 350, "人口口粮、种粮与仓储损耗应阻止粮食无限膨胀");
assert.ok(economyState.grain > 0, "标准难度无战争时仍应能活过完整周期");

const eventState = game.createInitialState("事件测试", "oath", "standard");
for (let turn = 1; turn <= 40; turn++) { eventState.turn = turn; game.queueSeasonEvents(eventState); }
assert.equal(eventState.seenEvents.length, 18, "十二年内应能轮到全部18个领地事件");
assert.ok(eventState.seenNpcEvents.length >= 10, "关键人物剧情应随季度持续推进");
const eventView = game.decisionView(eventState, { type: "world_event", eventId: eventState.seenEvents[0] });
assert.equal(eventView.options.length, 3, "领地事件必须提供三种真实取舍");

for (const [type, events] of [["world_event", game.WORLD_EVENTS], ["npc_arc", game.NPC_ARCS]]) {
  for (const event of events) {
    const brokeState = game.createInitialState("资源枯竭", "oath", "standard");
    brokeState.gold = 0;
    brokeState.grain = 0;
    const view = game.decisionView(brokeState, { type, eventId: event.id });
    assert.ok(view.options.some(option => !option.disabled), `${event.id}在资源归零时仍须保留可选退路`);
  }
}

const enemyArcState = game.createInitialState("敌方关系", "oath", "standard");
const aveline = enemyArcState.officers.find(o => o.id === "aveline");
const avelineBefore = aveline.loyalty;
game.decisionView(enemyArcState, { type: "npc_arc", eventId: "aveline_river_envoy" }).options[0].effect();
assert.equal(aveline.loyalty, avelineBefore + 8, "敌方人物事件的忠诚变化应与文案一致，不得重复结算");
const submission = game.decisionView(enemyArcState, { type: "submission", faction: "river" });
submission.options[0].effect();
assert.ok(aveline.loyalty > 67, "投降后的初始忠诚应保留此前建立的关系优势");

const departureState = game.createInitialState("封臣出走", "oath", "standard");
departureState.territories.ashfield.owner = "player";
departureState.territories.ashfield.fiefHolder = "edmund";
const departingEdmund = departureState.officers.find(o => o.id === "edmund");
departingEdmund.fief = "ashfield";
departingEdmund.grievance = 80;
departingEdmund.loyalty = 20;
const preDepartureStability = departureState.territories.ashfield.stability;
game.handleOfficerPolitics(departureState);
assert.equal(departingEdmund.side, "gone");
assert.equal(departingEdmund.fief, null, "家臣出走后不得继续持有封地");
assert.equal(departureState.territories.ashfield.fiefHolder, null);
assert.equal(departureState.territories.ashfield.stability, preDepartureStability - 10, "封地收回应造成地方动荡");

const lockState = game.createInitialState("战役状态", "iron", "standard");
game.startBattle(lockState, { targetId: "ashfield", leaderIds: ["player", "renard"], troops: 30, plan: "steady" }, fixed(.5));
assert.equal(game.interactionLocked(lockState), true, "战役进行中应锁住内政交互");

const unlockState = game.createInitialState("终局测试", "oath", "standard");
Object.keys(unlockState.territories).forEach(id => {
  if (id !== "crownvale") unlockState.territories[id].owner = "player";
});
assert.ok(!game.attackableTerritories(unlockState).includes("crownvale"), "即使快速统一六领，王冠谷也不应在第7年前开放");
unlockState.turn = game.CROWN_OPEN_TURN;
assert.ok(game.attackableTerritories(unlockState).includes("crownvale"), "统一六领且进入第7年后应开放王冠谷");
unlockState.army = { levy: 120, archers: 35, knights: 25 };
game.syncTroops(unlockState);
unlockState.grain = 300;
unlockState.morale = 95;
unlockState.training = 35;
game.startBattle(unlockState, {
  targetId: "crownvale",
  leaderIds: ["player", "renard", "edmund"],
  troops: 160,
  plan: "assault"
}, fixed(.9));
game.applyBattleChoice(unlockState, "forced", fixed(.9));
game.applyBattleChoice(unlockState, "charge", fixed(.9));
game.applyBattleChoice(unlockState, "press", fixed(.9));
assert.equal(unlockState.territories.crownvale.owner, "player", "王冠谷应能通过三阶段战役攻占");
assert.ok(unlockState.pendingDecisions.some(d => d.type === "iron_crown"), "统一七领后应进入铁冠终章");
const ironCrownView = game.decisionView(unlockState, { type: "iron_crown" });
assert.equal(ironCrownView.options.length, 3, "铁冠终章应保留三种加冕选择");
assert.ok(ironCrownView.body.includes("北境七块领地全部归你统治"), "铁冠终章应直接说明统一结果");
assert.ok(ironCrownView.options.some(option => option.name.includes("清点国库和税册")), "经营路线应明确写出清点国库和税册");

const famineState = game.createInitialState("饥荒测试", "oath", "standard");
famineState.grain = 0;
for (let turn = 0; turn < 2; turn++) {
  famineState.turn = turn;
  assert.equal(game.checkDefeat(famineState), false, "短期断粮应给玩家留下补救窗口");
}
famineState.turn = 2;
assert.equal(game.checkDefeat(famineState), true, "连续三个季度断粮应导致领地崩溃");
assert.equal(famineState.endingReason, "collapsed");

const growingGuardState = game.createInitialState("敌军成长", "oath", "standard");
const earlyGuardCap = game.enemyGuardCap(growingGuardState, "ashfield");
growingGuardState.turn = 28;
growingGuardState.territories.pineford.owner = "wolf";
const lateGuardCap = game.enemyGuardCap(growingGuardState, "ashfield");
assert.ok(lateGuardCap > earlyGuardCap, "敌方守军上限应随年份与控制领地增长");

console.log("structure tests passed");
