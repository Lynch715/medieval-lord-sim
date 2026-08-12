import assert from "node:assert/strict";
import game from "./_game.mjs";

// 章节目标是纯派生的引导层：不写档、不影响世界推进。
// 这里钉死三件事：基线常量与开局值一致、谓词全部可执行、每个目标都实际可达成。

const fresh = game.createInitialState("引导测试", "oath", "standard");

// —— 基线常量必须与 createInitialState 的开局值一致 ——
// 开局建筑/领主/领地变了而 GOAL_BASELINES 没跟上，引导会「开局即完成」或永远完不成。
assert.equal(game.totalBuildingLevels(fresh), game.GOAL_BASELINES.buildingLevels,
  "开局建筑总级数与 GOAL_BASELINES.buildingLevels 不一致");
assert.equal(fresh.officers.filter(o => o.side === "player").length, game.GOAL_BASELINES.lords,
  "开局玩家方领主数与 GOAL_BASELINES.lords 不一致");
assert.equal(game.ownTerritoryIds(fresh).length, game.GOAL_BASELINES.territories,
  "开局领地数与 GOAL_BASELINES.territories 不一致");

// —— 结构自检：目标 id 全局唯一，谓词在新档上可执行且开局全部未完成 ——
const stepIds = game.GOAL_CHAPTERS.flatMap(ch => ch.steps.map(step => `${ch.id}.${step.id}`));
assert.equal(new Set(stepIds).size, stepIds.length, "目标 id 重复");
for (const ch of game.GOAL_CHAPTERS) for (const step of ch.steps) {
  assert.equal(typeof step.check(fresh), "boolean", `${ch.id}.${step.id} 的谓词没有返回布尔值`);
  assert.equal(step.check(fresh), false, `${ch.id}.${step.id} 开局就已完成，引导失去意义`);
}
const view0 = game.goalView(fresh);
assert.equal(view0.activeIndex, 0, "新档应从第一章开始");
assert.equal(view0.finished, false);

// —— 每个目标都实际可达成：逐步改造状态，全链路走到 finished ——
const s = game.createInitialState("引导测试", "oath", "standard");

// 第一章：建一级建筑 / 完成一项研究 / 主力 60
s.territories.ravenstone.buildings.fields += 1;
const firstTech = game.TECH_DEFS.agriculture[0];
s.tech.agriculture.levels = { [firstTech.id]: 1 };
game.armyEntity(s, "army_1").composition.levy += 40;
let view = game.goalView(s);
assert.deepEqual(view.chapters[0].steps.map(step => step.done), [true, true, true], "第一章目标未全部判定完成");
assert.equal(view.activeIndex, 1, "第一章完成后应推进到第二章");

// 第二章：夺回一块领地 / 收服一名领主
s.territories.pineford.owner = "player";
game.officer(s, "renard").side = "player";
view = game.goalView(s);
assert.equal(view.chapters[1].done, true, "第二章目标未全部判定完成");
assert.equal(view.activeIndex, 2);

// 第三章：与 crownRequirements 同源，四个条件逐一补齐
s.renown = 60;
s.tech.military.levels = { ...(s.tech.military.levels || {}), war_engineering: 1 };
game.armyEntity(s, "army_1").composition.levy += 40; // 主力破 80
s.territories.duchyroad.owner = "player";
view = game.goalView(s);
assert.equal(view.chapters[2].done, true, "第三章应与 crownRequirements 同时满足");
assert.deepEqual(Object.values(game.crownRequirements(s)), [true, true, true, true],
  "第三章判定与 crownRequirements 脱钩了 —— 两处条件必须同源");
assert.equal(view.activeIndex, 3);

// 第四章：攻下王冠谷，引导退场
s.territories.crownvale.owner = "player";
view = game.goalView(s);
assert.equal(view.finished, true, "全部目标完成后 finished 应为 true");

// —— 回退不是 bug：主力打光后，已完成的章节重新变为当前章 ——
game.armyEntity(s, "army_1").composition.levy = 0;
view = game.goalView(s);
assert.equal(view.finished, false, "主力打光后第一章应重新亮起（引导反映真实状态）");
assert.equal(view.activeIndex, 0);

console.log("goals tests passed");
