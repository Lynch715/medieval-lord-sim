import assert from "node:assert/strict";

import game from "./_game.mjs";

// ── 事件表本身 ────────────────────────────────────────────────────────
const ids = game.WORLD_EVENTS.map(e => e.id);
assert.equal(new Set(ids).size, ids.length, "事件 id 不得重复");
assert.ok(game.WORLD_EVENTS.length >= 30, `世界事件池应不少于 30 条，实际 ${game.WORLD_EVENTS.length}`);
const seasonIds = game.SEASONS.map(s => s.id);
for (const ev of game.WORLD_EVENTS) {
  assert.ok(ev.options.length >= 1 && ev.options.length <= 3, `${ev.id} 选项数应在 1～3`);
  (ev.seasons || []).forEach(sid => assert.ok(seasonIds.includes(sid), `${ev.id} 的季节标签 ${sid} 不存在`));
  if (ev.requires?.flag) {
    const setters = game.WORLD_EVENTS.flatMap(e => e.options.map(o => o[2].flag)).filter(Boolean);
    assert.ok(setters.includes(ev.requires.flag), `${ev.id} 依赖的记号 ${ev.requires.flag} 没有任何选项会写`);
  }
}

// ── 季节：冬天不弹春季洪水 ──────────────────────────────────────────
const base = () => {
  const s = game.createInitialState("事件", "oath", "standard");
  s.lastWorldEventMs = -Infinity;
  return s;
};
{
  const s = base();
  s.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 3;   // 第一年冬
  assert.equal(game.seasonOf(s).id, "winter");
  let i = 0;
  const rng = () => ((i++ * 0.37) % 1);
  const seen = new Set();
  for (let k = 0; k < 400; k++) {
    const ev = game.pickWorldEvent(s, rng);
    if (ev) seen.add(ev.id);
  }
  assert.ok(seen.size >= 5, "冬季应有多个可抽事件");
  assert.ok(!seen.has("spring_flood") && !seen.has("autumn_mice") && !seen.has("summer_drought"), "冬季不得抽到春夏秋专属事件");
  assert.ok(seen.has("wolves_down") || seen.has("frozen_river"), "冬季应能抽到冬季事件");
}

// ── 随机：不同 rng 抽到的第一个事件不同 ───────────────────────────
{
  const a = base(); a.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 1;
  const b = base(); b.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 1;
  const first = game.pickWorldEvent(a, () => 0.1);
  const second = game.pickWorldEvent(b, () => 0.4);
  assert.ok(first && second, "夏季应能抽到事件");
  assert.notEqual(first.id, second.id, "不同随机数应抽到不同事件（不再按数组顺序）");
}

// ── 节奏：距上一个事件不足一季不弹 ─────────────────────────────────
{
  const s = base();
  s.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 2;
  s.lastWorldEventMs = s.clock.elapsedMs - 60 * 1000;
  assert.equal(game.pickWorldEvent(s, () => 0.1), null, "一分钟前刚弹过，不该再弹");
  s.lastWorldEventMs = s.clock.elapsedMs - game.TIME_CONFIG.seasonDurationMs;
  assert.ok(game.pickWorldEvent(s, () => 0.1), "隔了一季即可再弹");
  assert.equal(game.pickWorldEvent(s, () => 0.9), null, "掷骰子没过就不弹");
}

// ── 后续事件：选了「招收逃兵」，两季后按军心分岔 ──────────────────
{
  const s = base();
  s.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 4;
  const turn = game.turnOf(s);
  const deserter = game.WORLD_EVENTS.find(e => e.id === "deserter_band");
  game.applyEventEffects(s, deserter.options[0][2]);
  assert.equal(s.flags.deserters_taken, turn, "选项应留下记号，记的是当季 turn");
  assert.equal(game.pickWorldEvent(s, () => 0.1)?.requires, undefined, "未到间隔时不弹后续");
  s.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 6;
  s.morale = 60;
  assert.equal(game.pickWorldEvent(s, () => 0.99).id, "deserters_hold", "军心高：逃兵立功；后续事件不掷骰子");
  s.morale = 30;
  assert.equal(game.pickWorldEvent(s, () => 0.99).id, "deserters_run", "军心低：逃兵跑路");
  // 弹过一次就不再弹
  s.seenEvents.push("deserters_run"); s.eventSeenAt = { deserters_run: game.turnOf(s) };
  assert.notEqual(game.pickWorldEvent(s, () => 0.1)?.id, "deserters_run");
}

// ── 势力守军、加冕挪动这两种新效果 ───────────────────────────────
{
  const s = base();
  const before = s.territories.highpass.guard;
  game.applyEventEffects(s, { guardFaction: ["wolf", 8] });
  assert.equal(s.territories.highpass.guard, before + 8, "狼牙领地守军 +8");
  assert.equal(s.territories.ravenstone.guard, game.TERRITORY_DEFS.ravenstone.guard, "自家守军不动");
  const remain = game.coronationRemainingMs(s);
  game.applyEventEffects(s, { coronationMin: -10 });
  assert.equal(game.coronationRemainingMs(s), remain - 10 * 60 * 1000, "加冕提前 10 分钟");
}

// ── 池子抽干后隔 8 季可重复 ─────────────────────────────────────────
{
  const s = base();
  s.clock.elapsedMs = game.TIME_CONFIG.seasonDurationMs * 40;
  game.WORLD_EVENTS.filter(e => !e.requires).forEach(e => { s.seenEvents.push(e.id); s.eventSeenAt[e.id] = 0; });
  assert.ok(game.pickWorldEvent(s, () => 0.1), "全部见过且隔了 40 季，应能重抽");
  game.WORLD_EVENTS.filter(e => !e.requires).forEach(e => { s.eventSeenAt[e.id] = 38; });
  assert.equal(game.pickWorldEvent(s, () => 0.1), null, "两季前刚见过的不重抽");
}

console.log("events.test ok");
