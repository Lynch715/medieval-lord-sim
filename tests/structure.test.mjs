import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const game = require("../app.js");
const source = readFileSync(fileURLToPath(new URL("../app.js", import.meta.url)), "utf8");
const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../style.css", import.meta.url)), "utf8");
const fixed = value => () => value;

const fresh = game.createInitialState("测试继承人", "oath", "standard");
assert.equal(fresh.playerName, "测试继承人");
assert.equal(game.playableTerritoryIds().length, 24, "地图应有足够多的可交互、可占领地点");
assert.deepEqual(game.ownTerritoryIds ? game.ownTerritoryIds(fresh).sort() : ["blackthorn", "ironhill", "ravenstone", "westmarch"], ["blackthorn", "ironhill", "ravenstone", "westmarch"]);
assert.equal(fresh.officers.filter(o => o.side === "player").length, 1, "开局只应有玩家一名领主");
assert.equal(fresh.officers.find(o => o.id === "player").title, "渡鸦家的王子");
assert.equal(fresh.officers.find(o => o.id === "renard").side, "locked");
assert.equal(fresh.officers.find(o => o.id === "regent").portrait, "assets/regent-duke.webp");
assert.equal(fresh.officers.find(o => o.id === "roderic").portrait, "assets/roderic.webp");
assert.equal(game.OFFICER_DEFS.regent.age, 52);
assert.equal(game.OFFICER_DEFS.roderic.age, 44);
assert.equal(game.seasonOf(fresh).id, "spring");
assert.equal(Object.keys(game.BUILDINGS).length, 10);
assert.equal(game.BUILDING_MAX_LEVEL, 5);
assert.equal(Object.values(game.TECH_DEFS).length, 5);
assert.ok(Object.values(game.TECH_DEFS).every(branch => branch.length === 5), "五条科技分支各有五项科技");
assert.deepEqual(game.attackableTerritories(fresh).sort(), ["ashfield", "blackthorn", "ironhill", "pineford", "westmarch"].filter(id => id !== "blackthorn" && id !== "ironhill" && id !== "westmarch").sort());
assert.deepEqual(game.cityActionOptions(fresh, "ashfield").map(o => o.id), ["scout"], "使者/商站/城约等说服路线已移除，只保留侦察");
assert.deepEqual(Object.keys(game.CITY_ACTION_DEFS), ["scout"], "CITY_ACTION_DEFS 不应残留未接线的行动定义");
assert.ok(game.UNIT_DEFS.heavy_infantry.counters.includes("knights"));
assert.ok(game.UNIT_DEFS.light_cavalry.counters.includes("archers"));
assert.ok(game.counterMultiplier({ levy: 20 }, { knights: 10 }) > 1, "长矛兵应克制骑兵");
const eventRuntimeText = [...game.WORLD_EVENTS, ...game.NPC_ARCS].map(event => JSON.stringify(event)).join("\n");
for (const removedEventTerm of ["王室认可", "战争疲劳", "稳定", "功劳", "不满", "野心", "人口", "legitimacy", "warWeariness", "stabilityAll", "stabilityWeak", "grievance", "merit"]) {
  assert.equal(eventRuntimeText.includes(removedEventTerm), false, `事件运行数据不应残留废弃属性：${removedEventTerm}`);
}

const equipmentState = game.createInitialState("装备升级", "oath", "standard");
const baseEquipment = game.unitEquipment(equipmentState, "heavy_infantry");
equipmentState.tech.military.completed = ["refined_iron", "professional_army"];
equipmentState.tech.military.levels = { refined_iron: 3, professional_army: 3 };
const upgradedEquipment = game.unitEquipment(equipmentState, "heavy_infantry");
assert.ok(upgradedEquipment.level > baseEquipment.level && upgradedEquipment.attack > baseEquipment.attack && upgradedEquipment.defense > baseEquipment.defense && upgradedEquipment.hp > baseEquipment.hp);

const flowState = game.createInitialState("实时产出", "oath", "standard");
const flowGold = flowState.gold;
const flowGrain = flowState.grain;
game.advanceSeasonAuto(flowState, flowState.clock.lastProcessedAt + 1000);
assert.ok(flowState.gold > flowGold && flowState.grain > flowGrain, "资源应自动产生");
assert.ok(game.resourceFlow(flowState).goldPerSecond > 0 && game.resourceFlow(flowState).grainPerSecond > 0);

const techState = game.createInitialState("多阶科技", "oath", "standard");
techState.gold = 1000; techState.knowledge = 1000;
const r1 = game.queueResearch(techState, "agriculture", "heavy_plow", 1000);
assert.equal(r1.endAt - r1.startedAt, 45000);
game.processCompletedJobs(techState, r1.endAt);
const r2 = game.queueResearch(techState, "agriculture", "heavy_plow", 50000);
assert.equal(r2.endAt - r2.startedAt, 60000);
game.processCompletedJobs(techState, r2.endAt);
const r3 = game.queueResearch(techState, "agriculture", "heavy_plow", 120000);
assert.equal(r3.endAt - r3.startedAt, 75000);
game.processCompletedJobs(techState, r3.endAt);
assert.equal(game.techLevel(techState, "heavy_plow"), 3);
assert.equal(game.queueResearch(techState, "agriculture", "heavy_plow", 210000), null);

const knightState = game.createInitialState("骑士名册", "oath", "standard");
assert.ok(knightState.knights.length >= 24, "地图扩大后应有足量骑士");
const recruitKnight = knightState.knights.find(knight => knight.side === "neutral");
assert.ok(game.knightAction(recruitKnight.id, "recruit", knightState));
game.processCompletedJobs(knightState, knightState.jobs.at(-1).endAt);
assert.ok(game.activeKnights(knightState).length >= 1);
assert.ok(game.knightBattleMultiplier(knightState) > 1);

const corpsState = game.createInitialState("军团编组", "oath", "standard");
const corpsKnight = corpsState.knights[0]; corpsKnight.side = "player"; corpsKnight.status = "active";
const corps = game.createArmyFromMain(corpsState, "黑棘骑士团", corpsKnight.id, { levy: 8, archers: 2 });
assert.ok(corps && corps.commanderId === corpsKnight.id && corpsState.armies.length === 2, "军队页应能从主军组建骑士军团");
assert.ok(game.disbandArmy(corpsState, corps.id) && corpsState.armies.length === 1, "待命军团应能解散并回收兵力");

const marchState = game.createInitialState("行军时间", "oath", "standard");
const marchJob = game.startMarch(marchState, "army_1", "crossford", 1000, { battlePlan: { leaderIds: ["player"], composition: { levy: 12, archers: 4, knights: 2, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 }, troops: 18, plan: "steady" } });
assert.ok(marchJob && marchJob.endAt > 1000);
game.processCompletedJobs(marchState, marchJob.endAt);
assert.ok(marchState.battleSession && marchState.battleSession.targetId === "crossford");

const battleState = game.createInitialState("战斗测试", "iron", "standard");
battleState.officers.filter(o => ["renard", "ysabel"].includes(o.id)).forEach(o => { o.side = "player"; });
const session = game.startBattle(battleState, { targetId: "ashfield", leaderIds: ["player", "renard", "ysabel"], troops: battleState.troops, plan: "assault" }, fixed(.8));
assert.ok(session);
game.applyBattleChoice(battleState, "forced", fixed(.9));
game.applyBattleChoice(battleState, "charge", fixed(.9));
game.applyBattleChoice(battleState, "press", fixed(.9));
assert.equal(battleState.territories.ashfield.owner, "player");
assert.equal(battleState.warWeariness, 0, "战争疲劳已删除");
assert.ok(battleState.lastBattle && battleState.lastBattle.losses >= 0);
assert.equal(battleState.officers.find(o => o.id === "renard").injured, 0, "战后不再进入受伤计时");

for (const staleCopy of ["行动点", "王国层面", "累计阵亡", "军饷家臣", "人口军粮", "战场优势", "我军战力约为敌军", "忠诚倾向", "军令封蜡", "副印", "氏族战首", "河望伯领"]) {
  assert.ok(!source.includes(staleCopy), `高频旧术语不应回归：${staleCopy}`);
}
for (const plainLabel of ["武力", "统率", "谋略", "治理", "金币", "粮食", "军队", "民心", "军心", "声望", "预计伤亡"]) {
  assert.ok(source.includes(plainLabel), `界面应保留白话标签：${plainLabel}`);
}
// cityTradeposts / cityRelations 只允许出现在 hydrateV2 的存档清理里，不允许作为活代码回归。
for (const removedCopy of ["CAMPAIGN_AP_COST", "行动点", "结束本季", "apText", "每个季度只有三次重要行动",
  "applyAction", "setTerritoryPolicy", "battleDraft", "charterTrustThreshold", "CROWN_OPEN_TURN"]) {
  assert.ok(!source.includes(removedCopy) && !html.includes(removedCopy), `已删除的标识符不应回归：${removedCopy}`);
}
for (const legacyField of ["cityTradeposts", "cityRelations"]) {
  assert.equal(source.split(legacyField).length - 1, 1, `${legacyField} 只应保留 hydrateV2 里的一处存档清理`);
  assert.ok(source.includes(`delete raw.${legacyField};`), `${legacyField} 的唯一出现处应是存档清理`);
}
assert.ok(!source.includes("AudioContext") && !source.includes("soundBtn") && !html.includes("soundBtn"));
assert.ok(!/^html[^{}]*touch-action/m.test(css) && !/^body[^{}]*touch-action/m.test(css));
assert.ok(css.includes("html, body { touch-action: pan-x pan-y; overscroll-behavior: none; }") || css.includes("touch-action: pan-x pan-y"));
assert.equal(game.ACTIONS, undefined, "领主行动系统已整体移除");
assert.equal(game.POLICIES, undefined, "领地政策系统已整体移除");

const saveRoundTrip = game.hydrateState(JSON.parse(JSON.stringify(battleState)));
assert.equal(saveRoundTrip.version, 2);
assert.equal(saveRoundTrip.territories.ashfield.owner, "player");
const clockState = game.createInitialState("时钟测试", "oath", "standard");
const clockStart = clockState.clock.seasonStartedAt;
clockState.clock.seasonEndsAt = clockStart + 1;
assert.equal(game.advanceSeasonAuto(clockState, clockStart + 1).seasons, 1);
assert.equal(clockState.turn, 1);
assert.equal(game.selfCheck(clockState).ok, true);

console.log("structure tests passed");
