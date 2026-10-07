import assert from "node:assert/strict";
import game from "./_game.mjs";

// 带兵者：等级、技能、副将、单挑、敌将技能
const fixed = v => () => v;
const s = game.createInitialState("将领测试", "oath", "standard");
const prince = game.officer(s, "player");
assert.equal(prince.lv, 2, "王子起始 2 级");
assert.ok(prince.skills.includes("prince_lead"), "王子带专属技能");
const renard = game.officer(s, "renard");
assert.equal(renard.lv, 6, "大叛臣起始 6 级");
assert.equal(renard.skills.length, 3, "6 级有专属 + 两个职业技能");
Object.values(game.SKILLS).forEach(sk => assert.ok(["order", "passive"].includes(sk.type)));
Object.values(game.CLASS_SKILL_POOLS).flat().forEach(id => assert.ok(game.SKILLS[id], `职业池里的 ${id} 未定义`));
Object.values(game.SIGNATURE_SKILLS).forEach(id => assert.ok(game.SKILLS[id], `专属 ${id} 未定义`));

// 经验与升级：跨 3 级时排出学技能
const k = s.knights.find(x => x.side === "player");
game.ensureProgress(k);
k.lv = 2; k.xp = game.LEVEL_XP[1];
s.pendingDecisions = [];
const forceBefore = game.personStat(k, "force") + game.personStat(k, "command") + game.personStat(k, "scheme");
game.gainBattleXp(s, k.id, 60);
assert.ok(k.lv >= 3, "攒够经验应升级");
assert.ok(game.personStat(k, "force") + game.personStat(k, "command") + game.personStat(k, "scheme") > forceBefore, "升级长属性");
const pick = s.pendingDecisions.find(d => d.type === "skill_pick" && d.personId === k.id);
assert.ok(pick && pick.choices.length >= 1, "3 级应排出学技能");
const pv = game.decisionView(s, pick);
const n0 = k.skills.length; pv.options[0].effect();
assert.equal(k.skills.length, n0 + 1, "学会一个技能");

// 领主可带兵、副将
renard.side = "player";
assert.ok(game.canUseCommander(s, "renard"), "归附的领主能带兵");
assert.ok(game.setArmyDeputies(s, "army_1", ["renard"]));
assert.deepEqual(game.armyLeaderIds(s, game.armyEntity(s, "army_1")), ["player", "renard"]);
assert.equal(game.canUseCommander(s, "renard"), false, "已当副将的不能再去别的军团");

// 战斗：技能军令出现、只能用一次；单挑；敌将技能
const b = game.createInitialState("战斗", "oath", "standard");
const rn = game.officer(b, "renard"); rn.side = "player";
game.setArmyDeputies(b, "army_1", ["renard"]);
game.armyEntity(b, "army_1").composition.knights = 6;
const session = game.startBattle(b, { targetId: "ashfield", troops: 40, plan: "steady" }, fixed(.5));
assert.ok(session, "开战");
assert.deepEqual(session.leaderIds, ["player", "renard"], "副将跟着上战场");
game.applyBattleChoice(b, "ridge", fixed(.5));
const opts = game.stageOptions(b, b.battleSession);
const charge = opts.find(o => o.id === "skill:knight_charge:renard");
assert.ok(charge, "雷纳德的骑士长冲阵应在交锋阶段出现");
assert.ok(opts.some(o => o.id === "skill:prince_lead:player"), "王子的亲冒矢石也在");
const duel = opts.find(o => o.duel);
assert.ok(duel, "守城有将领时可以单挑");
const st = b.battleSession.stage;
game.applyBattleChoice(b, "duel", fixed(.01));
assert.equal(b.battleSession.stage, st, "单挑不占本阶段军令");
assert.ok(!game.stageOptions(b, b.battleSession).some(o => o.duel), "单挑每场一次");
game.applyBattleChoice(b, charge.id, fixed(.5));
const after = b.battleSession || null;
if (after) assert.ok(!game.stageOptions(b, after).some(o => o.id === charge.id), "技能每场一次");
console.log("commanders ok");
