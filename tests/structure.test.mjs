import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const game = require("../app.js");
const source = readFileSync(fileURLToPath(new URL("../app.js", import.meta.url)), "utf8");
const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../style.css", import.meta.url)), "utf8");

function fixed(value) { return () => value; }

const fresh = game.createInitialState("测试领主", "oath", "standard");
assert.equal(fresh.playerName, "测试领主");
assert.equal(Object.keys(game.TERRITORY_DEFS).length, 36, "地图数据应包含36个城镇节点");
assert.equal(game.playableTerritoryIds().length, 7, "首批可征服区域仍保持7城战役范围");
assert.equal(fresh.armies.length, 1);
assert.equal(fresh.armies[0].locationId, "ravenstone");
assert.equal(game.seasonOf(fresh).id, "spring");
assert.equal(Object.keys(game.BUILDINGS).length, 10, "发展页应提供十类可升级建筑");
assert.equal(game.BUILDING_MAX_LEVEL, 5, "建筑等级上限应支持五级成长");
assert.equal(Object.keys(game.TECH_DEFS).length, 5, "科技树应拆分为五条分支");
assert.ok(Object.values(game.TECH_DEFS).every(branch => branch.length === 5), "每条科技分支应有五项研究");
assert.deepEqual(game.attackableTerritories(fresh).sort(), ["ashfield", "pineford"]);
assert.equal(game.cityActionOptions(fresh, "westmarch").length, 3, "外围城市应提供斥候、使者和商站操作");
assert.equal(game.cityAction(fresh, "westmarch", "envoy"), true, "中立城市应能接受使者");
assert.equal(fresh.territories.westmarch.owner, "neutral", "城市行动应在完成前保持原状态");
game.processCompletedJobs(fresh, fresh.jobs[0].endAt);
assert.equal(game.cityRelation(fresh, "westmarch"), 14, "使者应提高中立城市信任");
fresh.seasonLocks = {};
fresh.jobs = fresh.jobs.filter(job => job.status === "running");
fresh.gold = 100;
fresh.grain = 100;
fresh.cityRelations.westmarch = 30;
assert.equal(game.cityAction(fresh, "westmarch", "charter"), true, "高信任中立城市应能签订城约");
game.processCompletedJobs(fresh, fresh.jobs.find(job => job.type === "CITY_ACTION").endAt);
assert.equal(fresh.territories.westmarch.owner, "player");
assert.equal(game.subjects(fresh), 218);
assert.equal(game.armyTotal(fresh), fresh.troops);
assert.deepEqual(fresh.army, { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
assert.ok(Object.keys(game.UNIT_DEFS).length >= 6, "兵种应扩充到六种以上");
assert.ok(game.UNIT_DEFS.heavy_infantry.counters.includes("knights"), "重步兵应克制骑士");
assert.ok(game.UNIT_DEFS.light_cavalry.counters.includes("archers"), "轻骑兵应克制远射兵");
assert.ok(game.counterMultiplier({ levy: 20, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 }, { levy: 0, archers: 0, knights: 10, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 }) > 1, "长矛兵对骑士应获得克制系数");
const equipmentState = game.createInitialState("装备升级", "iron", "standard");
const baseEquipment = game.unitEquipment(equipmentState, "heavy_infantry");
equipmentState.tech.military.completed = ["refined_iron", "professional_army"];
equipmentState.tech.military.levels = { refined_iron: 3, professional_army: 3 };
const upgradedEquipment = game.unitEquipment(equipmentState, "heavy_infantry");
assert.ok(upgradedEquipment.level > baseEquipment.level && upgradedEquipment.attack > baseEquipment.attack && upgradedEquipment.defense > baseEquipment.defense && upgradedEquipment.hp > baseEquipment.hp, "军事科技应提升兵种等级、攻击、防御和生命");
equipmentState.renown = 20;
assert.equal(game.canRecruitUnit(equipmentState, "heavy_infantry"), true, "精炼铁器后应能征募重步兵");
assert.equal(game.recruitAmount(fresh, "levy"), 9, "守誓开局兵营应形成小规模增援，而非一次补满伤亡");
assert.equal(game.recruitAmount(fresh, "archers"), 6);
const hallRecruitState = game.createInitialState("征募一致性", "oath", "standard");
const hallRecruit = game.ACTIONS.find(action => action.id === "recruit");
const hallGold = hallRecruitState.gold;
const hallGrain = hallRecruitState.grain;
const hallLevy = hallRecruitState.army.levy;
assert.ok(hallRecruit.run(hallRecruitState));
assert.equal(hallGold - hallRecruitState.gold, game.UNIT_DEFS.levy.gold, "议事厅与征战页的长矛兵价格应一致");
assert.equal(hallGrain - hallRecruitState.grain, game.UNIT_DEFS.levy.grain);
assert.equal(hallRecruitState.army.levy, hallLevy, "征募进入训练队列后不应立即到账");
assert.equal(hallRecruitState.jobs.length, 1);
game.processCompletedJobs(hallRecruitState, hallRecruitState.jobs[0].endAt);
assert.equal(hallRecruitState.army.levy, hallLevy, "训练完成不应偷偷改动旧的全局兵池缓存");
assert.equal(hallRecruitState.territories.ravenstone.garrison.levy, game.recruitAmount(hallRecruitState, "levy"));
assert.equal(game.canRecruitUnit(hallRecruitState, "levy"), true, "训练完成后只要队列空闲即可继续征募");
assert.ok(game.forecast(fresh).gold > 0);
assert.ok(game.forecast(fresh).grainCost > 0);
assert.ok(game.forecast(fresh).storageCap > fresh.grain, "粮仓容量应进入经营预测");
const flowState = game.createInitialState("实时产出", "oath", "standard");
const flowStart = flowState.clock.lastProcessedAt;
const flowGold = flowState.gold;
const flowGrain = flowState.grain;
game.advanceSeasonAuto(flowState, flowStart + 1000);
assert.ok(flowState.gold > flowGold && flowState.grain > flowGrain, "资源应在没有点击操作时按秒自动产生");
assert.ok(game.resourceFlow(flowState).goldPerSecond > 0 && game.resourceFlow(flowState).grainPerSecond > 0, "当前季节应展示正向资源流量");
const techEffectState = game.createInitialState("科技审计", "oath", "standard");
const baseTechForecast = game.forecast(techEffectState);
techEffectState.tech.military.completed = ["refined_iron", "longbow", "war_engineering", "field_doctrine", "professional_army"];
techEffectState.tech.commerce.completed = ["coinage", "caravanserai", "trade_guild", "market_charter", "royal_exchange"];
techEffectState.tech.administration.completed = ["tax_registry", "relay_roads", "census", "provincial_offices", "law_code"];
techEffectState.tech.siege.completed = ["siege_ladders", "sappers", "trebuchet", "blockade", "iron_crown_doctrine"];
const advancedTechForecast = game.forecast(techEffectState);
assert.ok(advancedTechForecast.goldCost < baseTechForecast.goldCost, "常备军制应实际降低军饷");
techEffectState.cityRelations.westmarch = 18;
assert.ok(game.cityActionOptions(techEffectState, "westmarch").some(option => option.id === "charter"), "自由市契约应降低签订城约门槛");
const multiTech = game.createInitialState("多阶科技", "oath", "standard");
multiTech.gold = 1000; multiTech.knowledge = 1000;
const researchOne = game.queueResearch(multiTech, "agriculture", "heavy_plow", 1000);
assert.equal(researchOne.endAt - researchOne.startedAt, 45000, "科技第一阶研究应为45秒");
game.processCompletedJobs(multiTech, researchOne.endAt);
assert.equal(game.techLevel(multiTech, "heavy_plow"), 1);
const researchTwo = game.queueResearch(multiTech, "agriculture", "heavy_plow", 50000);
assert.equal(researchTwo.endAt - researchTwo.startedAt, 60000, "科技第二阶研究应延长到60秒");
game.processCompletedJobs(multiTech, researchTwo.endAt);
assert.equal(game.techLevel(multiTech, "heavy_plow"), 2);
const researchThree = game.queueResearch(multiTech, "agriculture", "heavy_plow", 120000);
assert.equal(researchThree.endAt - researchThree.startedAt, 75000, "科技第三阶研究应延长到75秒");
game.processCompletedJobs(multiTech, researchThree.endAt);
assert.equal(game.techLevel(multiTech, "heavy_plow"), 3);
assert.equal(game.queueResearch(multiTech, "agriculture", "heavy_plow", 210000), null, "科技达到三阶后不应继续排队");
assert.equal(multiTech.knights.length, 24, "领地扩大后应有足量无立绘骑士名册");
const recruitKnight = multiTech.knights.find(knight => knight.side === "neutral");
assert.ok(game.knightAction(recruitKnight.id, "recruit", multiTech));
game.processCompletedJobs(multiTech, multiTech.jobs.at(-1).endAt);
assert.equal(game.activeKnights(multiTech).length, 1, "骑士招募完成后应加入在列骑士");
assert.ok(game.knightBattleMultiplier(multiTech) > 1, "在列骑士应以系数提升兵种战力");
const baseMarch = game.createInitialState("行军时间", "oath", "standard");
const baseMarchJob = game.startMarch(baseMarch, "army_1", "ashfield", 1000);
const doctrineMarch = game.createInitialState("军令时间", "oath", "standard");
doctrineMarch.tech.military.completed = ["field_doctrine"];
const doctrineMarchJob = game.startMarch(doctrineMarch, "army_1", "ashfield", 1000);
assert.ok(doctrineMarchJob.endAt < baseMarchJob.endAt, "野战条令应实际缩短行军时间");
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
for (const removedCopy of ["CAMPAIGN_AP_COST", "行动点", "结束本季", "apText", "每个季度只有三次重要行动"]) {
  assert.ok(!source.includes(removedCopy) && !html.includes(removedCopy), `实时版本不应保留旧行动点文案：${removedCopy}`);
}
assert.ok(!source.includes("AudioContext") && !source.includes("soundBtn") && !html.includes("soundBtn"), "游戏不应再包含BGM或环境音入口");
assert.ok(!/^html[^{}]*touch-action/m.test(css) && !/^body[^{}]*touch-action/m.test(css), "禁止缩放规则不得锁死PC页面滚动");
assert.ok(css.includes("html, body { touch-action: pan-x pan-y; overscroll-behavior: none; }"), "手机端仍应保留触控防缩放规则");
assert.ok(game.ACTIONS.every(action => action.durationMs > 0), "议事厅每项主动行动都必须有真实完成时间");

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
assert.equal(battleState.pauseState.reason, "battle", "战役期间世界时间应进入软暂停");
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
assert.equal(battleState.armies[0].status, "recovering", "胜利后应进入军团自己的整补队列");
assert.ok(battleState.jobs.some(job => job.type === "RECOVER" && job.armyId === "army_1"));
const recoveryJob = battleState.jobs.find(job => job.type === "RECOVER" && job.armyId === "army_1");
assert.equal(game.startBattle(battleState, { targetId: "pineford", leaderIds: ["player", "renard"], troops: 20, plan: "steady" }, fixed(.8)), null, "休整期内不得连续滚雪球出征");
game.processCompletedJobs(battleState, recoveryJob.endAt);

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
assert.equal(saveRoundTrip.version, 2);
assert.equal(saveRoundTrip.territories.ashfield.owner, "player");
const oldPlayerCopy = game.createInitialState("旧称谓", "oath", "standard");
oldPlayerCopy.officers.find(item => item.id === "player").title = "领主";
oldPlayerCopy.officers.find(item => item.id === "player").traitText = "领主出战时，本场军心最低按45点计算";
const normalizedPlayerCopy = game.hydrateState(JSON.parse(JSON.stringify(oldPlayerCopy)));
assert.equal(normalizedPlayerCopy.officers.find(item => item.id === "player").title, "渡鸦领主", "旧存档玩家称谓应迁移为领主");
assert.match(normalizedPlayerCopy.officers.find(item => item.id === "player").traitText, /领主出战/);
const duplicateOfficerSave = game.createInitialState("重复候选", "oath", "standard");
duplicateOfficerSave.officers.push(JSON.parse(JSON.stringify(duplicateOfficerSave.officers.find(item => item.id === "maelis"))));
const normalizedDuplicateSave = game.hydrateState(JSON.parse(JSON.stringify(duplicateOfficerSave)));
assert.equal(normalizedDuplicateSave.officers.filter(item => item.id === "maelis").length, 1, "旧存档重复候选武将应自动去重");

const legacyV1 = game.createInitialState("V1迁移", "oath", "standard");
legacyV1.version = 1;
legacyV1.ap = 2;
delete legacyV1.clock;
delete legacyV1.jobs;
delete legacyV1.tech;
delete legacyV1.factions;
const migratedV1 = game.migrateSave(JSON.parse(JSON.stringify(legacyV1)), 1000);
assert.equal(migratedV1.version, 2);
assert.equal("ap" in migratedV1, false, "V1行动点字段应在迁移后移除");
assert.ok(migratedV1.clock.seasonEndsAt > migratedV1.clock.seasonStartedAt);
assert.deepEqual(migratedV1.jobs, []);
assert.ok(migratedV1.tech && migratedV1.factions);
assert.equal(game.selfCheck(migratedV1).ok, true);

const jobState = game.createInitialState("队列测试", "oath", "standard");
const job = game.startJob(jobState, { type: "BUILD", queueKey: "build:ravenstone", territoryId: "ravenstone", startedAt: 1000, endAt: 2000 });
assert.ok(job && jobState.jobs.length === 1);
assert.equal(game.getQueueUsage(jobState, "build:ravenstone"), 1);
assert.equal(game.processCompletedJobs(jobState, 1500), 0);
assert.equal(game.processCompletedJobs(jobState, 2000), 1);
assert.equal(game.processCompletedJobs(jobState, 3000), 0, "已完成队列不得重复结算");

const buildState = game.createInitialState("建设队列", "oath", "standard");
const fieldsLevel = buildState.territories.ravenstone.buildings.fields;
const buildJob = game.startJob(buildState, { type: "BUILD", territoryId: "ravenstone", queueKey: "build:ravenstone", startedAt: 1000, endAt: 2000, payload: { buildingType: "fields" } });
assert.ok(buildJob);
assert.equal(buildState.territories.ravenstone.buildings.fields, fieldsLevel);
assert.equal(game.processCompletedJobs(buildState, 2000), 1);
assert.equal(buildState.territories.ravenstone.buildings.fields, fieldsLevel + 1);
assert.equal(game.processCompletedJobs(buildState, 3000), 0, "建设完成也不得重复结算");

const researchState = game.createInitialState("研究队列", "oath", "standard");
const beforeResearchGrain = game.territoryOutput(researchState, "ravenstone").grain;
const researchJob = game.queueResearch(researchState, "agriculture", "heavy_plow", 1000);
assert.ok(researchJob && researchJob.queueKey === "research:global");

const officerCandidateState = game.createInitialState("武将招募", "oath", "standard");
const officerCandidate = officerCandidateState.officers.find(item => item.recruitable && item.side === "neutral");
assert.ok(officerCandidate, "初始存档应提供可招募武将");
const officerJob = game.startJob(officerCandidateState, { type: "OFFICER_RECRUIT", queueKey: `officer:${officerCandidate.id}`, startedAt: 1000, endAt: 2000, payload: { officerId: officerCandidate.id, startingLoyalty: officerCandidate.loyalty } });
assert.ok(officerJob);
assert.equal(game.processCompletedJobs(officerCandidateState, 2000), 1, "武将招募队列应能完成");
assert.equal(officerCandidateState.officers.find(item => item.id === officerCandidate.id).side, "player");
assert.equal(game.canResearch(researchState, "administration", "tax_registry"), false, "全局研究队列只能同时运行一项");
assert.equal(game.processCompletedJobs(researchState, 2000), 0);
assert.equal(game.processCompletedJobs(researchState, researchJob.endAt), 1);
assert.equal(game.techCompleted(researchState, "heavy_plow"), true);
assert.ok(game.territoryOutput(researchState, "ravenstone").grain > beforeResearchGrain, "农业科技应提高粮食产出");

const marchState = game.createInitialState("行军测试", "oath", "standard");
const marchJob = game.startMarch(marchState, "army_1", "ashfield", 1000);
assert.ok(marchJob && marchState.armies[0].status === "marching");
assert.equal(game.startMarch(marchState, "army_1", "pineford", 1100), null, "行军中的军团不得再次瞬移");
assert.equal(game.processCompletedJobs(marchState, marchJob.endAt), 1);
assert.equal(marchState.armies[0].locationId, "ashfield");

const aiState = game.createInitialState("AI测试", "oath", "standard");
aiState.turn = 2;
assert.ok(aiState.factions.wolf.armies.length === 1 && aiState.factions.wolf.gold > 0);
assert.equal(game.runAiTurn(aiState, () => 0), "marching", "敌方AI应从真实军团发起行军");
assert.ok(aiState.jobs.some(job => job.type === "MARCH" && job.armyId === "wolf_army_1"));
assert.equal(marchState.armies[0].status, "idle");

const clockState = game.createInitialState("时钟测试", "oath", "standard");
const clockStart = clockState.clock.seasonStartedAt;
clockState.clock.seasonEndsAt = clockStart + 1;
assert.equal(game.advanceSeasonAuto(clockState, clockStart + 1).seasons, 1);
assert.equal(clockState.turn, 1);

const timelineState = game.createInitialState("时间轴测试", "oath", "standard");
const timelineStart = timelineState.clock.seasonStartedAt;
timelineState.clock.seasonEndsAt = timelineStart + 1000;
const timelineJob = game.startJob(timelineState, { type: "RESEARCH", startedAt: timelineStart + 100, endAt: timelineStart + 2000, queueKey: "research:global", payload: { branch: "agriculture", techId: "heavy_plow" } });
assert.equal(game.advanceSeasonAuto(timelineState, timelineStart + 1000).seasons, 1, "换季应在真实换季时间结算");
assert.equal(timelineState.tech.agriculture.completed.includes("heavy_plow"), false, "换季不能向未来预支并完成研究");
assert.equal(game.advanceSeasonAuto(timelineState, timelineStart + 2000).jobs, 1, "Job应在自己的endAt结算");
assert.equal(timelineJob.status, "completed");

const pauseState = game.createInitialState("暂停测试", "oath", "standard");
const pauseStart = pauseState.clock.seasonStartedAt;
const pauseEnds = pauseState.clock.seasonEndsAt;
game.pauseWorld(pauseState, "battle", pauseStart + 100);
assert.equal(game.advanceSeasonAuto(pauseState, pauseEnds + 5000).seasons, 0, "软暂停期间不能产生换季时间债");
game.resumeWorld(pauseState, pauseStart + 5000);
assert.equal(pauseState.clock.seasonEndsAt, pauseEnds + 4900, "恢复时应把暂停时长加回世界时间");

const overnightState = game.createInitialState("离线保护", "oath", "standard");
const overnightStart = overnightState.clock.seasonStartedAt;
overnightState.clock.seasonEndsAt = overnightStart + 1;
overnightState.grain = 0;
overnightState.gold = -40;
overnightState.crisis = { famine: 2, debt: 2, unrest: 1, checkedTurn: -1 };
const overnightResult = game.advanceSeasonAuto(overnightState, overnightStart + 8 * 60 * 60 * 1000, { offline: true });
assert.equal(overnightResult.seasons, 1, "离线一晚最多只结算一季");
assert.equal(overnightState.ended, false, "离线期间不应直接触发领地崩溃");
assert.equal(overnightState.jobs.some(job => job.type === "MARCH"), false, "离线期间不应凭空触发敌方行军");
assert.ok(overnightState.crisis.famine < 2, "离线保护应给饥荒计数留出补救窗口");

const legacy = game.createInitialState("旧存档", "oath", "standard");
delete legacy.army;
legacy.troops = 25;
const migrated = game.hydrateState(JSON.parse(JSON.stringify(legacy)));
assert.equal(game.armyTotal(migrated), 25, "旧存档军队总数迁移后不得膨胀");
assert.equal(migrated.territories.ravenstone.policy, "balanced");
assert.deepEqual(migrated.seenEvents, []);
assert.deepEqual(migrated.seenNpcEvents, []);

const garrisonState = game.createInitialState("城市驻军", "oath", "standard");
const garrisonJob = game.queueRecruitment(garrisonState, "levy", "ravenstone", 1000);
assert.ok(garrisonJob);
game.processCompletedJobs(garrisonState, garrisonJob.endAt);
assert.ok(garrisonState.territories.ravenstone.garrison.levy > 0, "征兵完成应进入训练地驻军池");
assert.equal(garrisonState.armies[0].composition.levy, 30, "征兵完成不能直接进入远方主力军团");
assert.equal(game.deployGarrison(garrisonState, "ravenstone"), true);
assert.ok(garrisonState.armies[0].composition.levy > 30, "军团驻扎本地时才能编入驻军");

const staleFiefSave = game.createInitialState("旧封地存档", "oath", "standard");
staleFiefSave.territories.ashfield.owner = "player";
staleFiefSave.territories.ashfield.fiefHolder = "edmund";
staleFiefSave.officers.find(o => o.id === "edmund").fief = "ashfield";
staleFiefSave.officers.find(o => o.id === "edmund").side = "gone";
const repairedFiefSave = game.hydrateState(JSON.parse(JSON.stringify(staleFiefSave)));
assert.equal(repairedFiefSave.territories.ashfield.fiefHolder, null, "旧存档中离场家臣的封地应自动收回");
assert.equal(repairedFiefSave.officers.find(o => o.id === "edmund").fief, null);

const terrainState = game.createInitialState("地形测试", "iron", "standard");
terrainState.armies[0].composition = { levy: 0, archers: 0, knights: 30 };
game.syncTroops(terrainState);
const knightPlain = game.battleEstimate(terrainState, "ashfield", ["player", "renard"], 30, "assault");
const knightForest = game.battleEstimate(terrainState, "pineford", ["player", "renard"], 30, "assault");
assert.ok(knightPlain.unitPower > knightForest.unitPower * 1.4, "披甲骑士在平原应明显强于密林");
terrainState.armies[0].composition = { levy: 0, archers: 30, knights: 0 };
game.syncTroops(terrainState);
const bowPlain = game.battleEstimate(terrainState, "ashfield", ["player", "ysabel"], 30, "ambush");
const bowForest = game.battleEstimate(terrainState, "pineford", ["player", "ysabel"], 30, "ambush");
assert.ok(bowForest.unitPower > bowPlain.unitPower, "弓箭手在密林应强于开阔农田");
const pineAssault = game.battleEstimate(terrainState, "pineford", ["player", "edmund", "ysabel"], 30, "assault");
const pineAmbush = game.battleEstimate(terrainState, "pineford", ["player", "edmund", "ysabel"], 30, "ambush");
assert.ok(pineAmbush.attack > pineAssault.attack, "高谋略队伍在密林采用伏击应优于正面强攻");
terrainState.armies[0].composition = { levy: 8, archers: 0, knights: 4 };
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
unlockState.armies[0].locationId = "highpass";
unlockState.armies[0].composition = { levy: 120, archers: 35, knights: 25 };
game.syncTroops(unlockState);
unlockState.grain = 300;
unlockState.morale = 95;
unlockState.training = 35;
unlockState.renown = 60;
unlockState.tech.military.completed = ["refined_iron", "longbow", "war_engineering"];
unlockState.tech.military.level = 3;
assert.ok(game.attackableTerritories(unlockState).includes("crownvale"), "满足领地、威望、攻城工程和主力规模后应开放王冠谷");
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
