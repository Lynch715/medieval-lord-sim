import assert from "node:assert/strict";
import game from "./_game.mjs";

// 正反馈：季报、捷报队列。
const SEASON = game.TIME_CONFIG.seasonDurationMs;
const s = game.createInitialState("季报测试", "oath", "standard");
const t0 = s.clock.lastProcessedAt;
game.drainNotices();
const goldBefore = s.gold;
s.gold -= 20; // 季中花了一笔
game.advanceWorld(s, t0 + SEASON + 1000, { maxCatchUpMs: SEASON * 2, rng: () => 0.99 });
assert.equal(s.seasonReports.length, 1, "跨过一季应当封一份季报");
const r = s.seasonReports[0];
assert.equal(r.turn, 0, "第一份季报记的是第 0 季");
assert.equal(r.label, "第1年春季");
assert.ok(r.goldIn > 0, "春季应有金币入账");
assert.ok(r.goldSpent >= 20, "季中花掉的钱应记进花销");
assert.equal(s.unreadReport, true, "新季报默认未读");
assert.ok(Math.abs((r.goldIn - r.goldSpent) - r.goldNet) <= 1, "入账 − 花销 = 结余");
assert.ok(game.drainNotices().some(n => n.kind === "season"), "换季应推一条季报捷报");
game.advanceWorld(s, t0 + SEASON * 2 + 2000, { maxCatchUpMs: SEASON * 2, rng: () => 0.99 });
assert.equal(s.seasonReports.length, 2);
assert.equal(s.seasonReports[1].label, "第1年夏季");

// 老存档没有 ledger：惰性建立，不报错
const old = game.createInitialState("老档", "oath", "standard");
delete old.ledger; delete old.seasonReports;
game.accrueTo(old, old.clock.lastProcessedAt + 1000);
assert.ok(old.ledger && Array.isArray(old.seasonReports), "老存档第一次结算时补建账本");

// 捷报只报玩家自己的事
game.drainNotices();
const b = game.createInitialState("捷报测试", "oath", "standard");
const job = game.startJob(b, { type: "BUILD", territoryId: "ravenstone", startedAt: 0, endAt: 1, queueKey: "build:ravenstone", payload: { buildingType: "fields" } });
game.finishJob(b, job, 2);
const got = game.drainNotices();
assert.equal(got.length, 1, "建成应报捷");
assert.equal(got[0].tab, "domain");

// 爵位：按领地数晋升，只升不降；章节赏赐每章一次
const m = game.createInitialState("爵位测试", "oath", "standard");
m.pendingDecisions = [];
const free = game.playableTerritoryIds().filter(id => m.territories[id].owner !== "player");
free.slice(0, 3).forEach(id => { m.territories[id].owner = "player"; });
assert.equal(game.checkMilestones(m), 1, "七块地应晋渡鸦伯");
assert.equal(game.titleRank(m).id, "earl");
const view = game.decisionView(m, m.pendingDecisions.find(d => d.type === "title_up"));
assert.ok(view && view.options.length === 1);
const adminBefore = (() => { const t = game.createInitialState("对照", "oath", "standard"); free.slice(0, 3).forEach(id => { t.territories[id].owner = "player"; }); return game.administrationCost(t); })();
assert.ok(game.administrationCost(m) <= adminBefore, "晋爵后行政开支不应更高");
free.slice(0, 3).forEach(id => { m.territories[id].owner = "wolf"; });
game.checkMilestones(m);
assert.equal(game.titleRank(m).id, "earl", "丢地不降爵");
m.pendingDecisions = [];
m.goalRewards = {};
m.territories.ravenstone.buildings.fields += 1;
m.tech.agriculture.levels = { heavy_plow: 1 }; m.tech.agriculture.completed = ["heavy_plow"];
game.armyEntity(m, "army_1").composition.levy += 40; game.syncTroops(m);
const goldBefore2 = m.gold;
game.checkMilestones(m);
const ch = m.pendingDecisions.find(d => d.type === "chapter_done");
assert.ok(ch, "第一章完成应排出章节赏赐"); {
  game.decisionView(m, ch).options[0].effect();
  assert.equal(m.gold, goldBefore2 + game.CHAPTER_REWARDS.found.gold, "第一章赏金到账");
  m.pendingDecisions = [];
  assert.equal(game.checkMilestones(m), 0, "同一章不会再发");
}

// 老存档：静默补记，不补发、不弹仪式
const legacy = game.createInitialState("老档2", "oath", "standard");
delete legacy.titleRank; delete legacy.goalRewards; delete legacy.quips;
game.playableTerritoryIds().filter(id => legacy.territories[id].owner !== "player").slice(0, 8).forEach(id => { legacy.territories[id].owner = "player"; });
legacy.wins = 3; legacy.battles = 3;
legacy.pendingDecisions = [];
game.drainNotices();
assert.equal(game.checkMilestones(legacy), 0, "老存档不补弹晋爵");
game.checkRetainerQuips(legacy);
assert.equal(game.titleRank(legacy).id, "marquess");
assert.ok(!game.drainNotices().some(n => n.kind === "quip" && /赢/.test(n.text)), "老存档不补说「头一回赢」");

// 家臣插嘴：头一回赢只说一次
const qs = game.createInitialState("插嘴", "oath", "standard");
game.drainNotices();
qs.wins = 1; qs.battles = 1;
game.checkRetainerQuips(qs); game.checkRetainerQuips(qs);
assert.equal(game.drainNotices().filter(n => n.kind === "quip").length, 1, "头一回赢只插一次嘴");

// 宝库：每件只有一个来处，一件只给一次；加成真的生效
assert.equal(game.TREASURES.length, 16);
assert.equal(new Set(game.TREASURES.map(t => JSON.stringify(t.source))).size, 16, "宝物来处不应重复");
game.TREASURES.forEach(t => assert.ok(game.TREASURE_KINDS[t.kind], `${t.id} 的加成种类未定义`));
game.TREASURES.filter(t => t.source.type === "capture").forEach(t => assert.ok(game.TERRITORY_DEFS[t.source.territoryId], `${t.id} 指向不存在的城`));
game.TREASURES.filter(t => t.source.type === "event").forEach(t => assert.ok(game.WORLD_EVENTS.some(ev => ev.id === t.source.eventId && ev.options.some(o => o[2].treasure === t.id)), `${t.id} 的事件选项没接线`));
const tr = game.createInitialState("宝库", "oath", "standard");
const g0 = game.forecast(tr).gold;
assert.ok(game.grantTreasure(tr, "toll_scale"));
assert.equal(game.grantTreasure(tr, "toll_scale"), false, "同一件不重复入库");
assert.ok(game.forecast(tr).gold >= g0, "金币加成生效");
const k0 = game.knowledgePerSeason(tr);
game.grantTreasure(tr, "plumb_bob");
assert.equal(game.knowledgePerSeason(tr), k0 + 2, "知识加成生效");
assert.ok(game.grantTreasureFor(tr, "capture", "crossford") === false, "已有的不再给");
assert.ok(game.grantTreasureFor(tr, "submit", "bran"), "布兰归附给断剑");

// 比武：夏季开一届，一年只一届；决策链走得通；结果确定
function runTourney(seedName, pick) {
  const t = game.createInitialState(seedName, "oath", "standard");
  t.pendingDecisions = [];
  t.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs; // 第一年夏
  assert.ok(game.maybeOpenTourney(t));
  assert.equal(game.maybeOpenTourney(t), false, "同一年不开第二届");
  let guard = 10, title = null;
  while (t.pendingDecisions.length && guard--) {
    const view = game.decisionView(t, t.pendingDecisions[0]);
    const opt = pick(view, t.pendingDecisions[0]);
    if (t.pendingDecisions[0].type === "tourney_end") title = view.title;
    opt.effect(); t.pendingDecisions.shift();
  }
  assert.equal(t.pendingDecisions.length, 0, "比武决策链应能走完");
  return { t, title };
}
const a1 = runTourney("比武A", v => v.options[0]);
const a2 = runTourney("比武A", v => v.options[0]);
assert.equal(a1.title, a2.title, "同样的局面，比武结果应当一样");
const p1 = runTourney("比武B", (v, d) => d.type === "tourney_invite" ? v.options.find(o => o.name === "我亲自下场") : v.options[1] || v.options[0]);
assert.ok(p1.title, "王子下场也能走完");

// 家臣野心：功劳够了上门请赏；封地生效；收回伤人
const am = game.createInitialState("野心", "oath", "standard");
am.pendingDecisions = [];
const os = game.officer(am, "oswin");
os.merit = game.RETAINER_ASK_MERIT;
game.handleOfficerPolitics(am);
const ask = am.pendingDecisions.find(d => d.type === "retainer_ask" && d.officerId === "oswin");
assert.ok(ask, "功劳够了应上门请赏");
game.handleOfficerPolitics(am);
assert.equal(am.pendingDecisions.filter(d => d.type === "retainer_ask").length, 1, "不重复排队");
const view2 = game.decisionView(am, ask);
const land = game.fiefCandidates(am)[0];
assert.ok(land && view2.options[0].name.includes(game.TERRITORY_DEFS[land].name));
const outBefore = game.territoryOutput(am, land).gold;
view2.options[0].effect();
assert.equal(am.territories[land].fiefHolder, "oswin");
assert.equal(os.fief, land);
assert.ok(game.territoryOutput(am, land).gold <= outBefore, "封出去的地，自家拿到的金币不应变多");
assert.ok(!game.fiefCandidates(am).includes(land), "封出去的地不能再封");
const loyalBefore = os.loyalty;
assert.ok(game.revokeFief(am, "oswin"));
assert.ok(os.loyalty < loyalBefore && os.grievance >= 25, "收回封地伤忠诚");
assert.equal(am.territories[land].fiefHolder, null);
console.log("rewards ok");
