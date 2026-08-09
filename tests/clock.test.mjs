import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

const SEASON = game.TIME_CONFIG.seasonDurationMs;

const s = game.createInitialState("时钟测试", "oath", "standard");
assert.equal(game.turnOf(s), 0, "开局在第 0 季");
assert.equal(s.turn, undefined, "turn 不应再作为存储字段存在");
assert.equal(game.seasonOf(s).id, "spring");
assert.equal(game.yearOf(s), 1);

// 季节与年份必须能从 elapsedMs 在任意时刻正确派生
const cases = [
  [0, 0, "spring", 1], [SEASON - 1, 0, "spring", 1], [SEASON, 1, "summer", 1],
  [SEASON * 2, 2, "autumn", 1], [SEASON * 3, 3, "winter", 1],
  [SEASON * 4, 4, "spring", 2], [SEASON * 47, 47, "winter", 12]
];
for (const [elapsed, turn, season, year] of cases) {
  s.clock.elapsedMs = elapsed;
  assert.equal(game.turnOf(s), turn, `elapsed=${elapsed} 应为第 ${turn} 季`);
  assert.equal(game.seasonOf(s).id, season, `elapsed=${elapsed} 应为 ${season}`);
  assert.equal(game.yearOf(s), year, `elapsed=${elapsed} 应为第 ${year} 年`);
}

// 距离换季的剩余时间
s.clock.elapsedMs = SEASON * 2 + 60000;
assert.equal(game.getSeasonRemainingMs(s), SEASON - 60000, "换季倒计时应由 elapsedMs 推出");

// accrueTo 必须累积到「绝对时刻」而非「一段时长」，因此重复调用同一时刻是空操作
const a = game.createInitialState("幂等测试", "oath", "standard");
const t0 = a.clock.lastProcessedAt;
game.accrueTo(a, t0 + 10000);
const goldAfterFirst = a.gold;
const elapsedAfterFirst = a.clock.elapsedMs;
game.accrueTo(a, t0 + 10000);
assert.equal(a.gold, goldAfterFirst, "累积到同一时刻两次不应重复计资源");
assert.equal(a.clock.elapsedMs, elapsedAfterFirst, "累积到同一时刻两次不应重复推进游戏时间");
game.accrueTo(a, t0 + 5000);
assert.equal(a.clock.elapsedMs, elapsedAfterFirst, "回退到过去的时刻应被忽略");

// 计时器表就位
const w = game.createInitialState("调度测试", "oath", "standard");
assert.deepEqual(Object.keys(w.timers).sort(), ["aiCrown", "aiRiver", "aiWolf", "events", "season"]);
for (const [key, timer] of Object.entries(w.timers)) {
  assert.ok(Number.isFinite(timer.nextAt), `${key} 缺少 nextAt`);
  assert.ok(timer.nextAt > w.clock.lastProcessedAt, `${key} 的 nextAt 应在未来`);
}

// 步进等价性：一次推进 2 小时，必须等于分 120 次每次 1 分钟
const seeded = seed => { let n = seed >>> 0; return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; }; };
const strip = st => JSON.stringify({
  gold: Math.round(st.gold), grain: Math.round(st.grain), elapsed: st.clock.elapsedMs,
  owners: Object.fromEntries(Object.entries(st.territories).map(([k, v]) => [k, v.owner])),
  jobs: st.jobs.filter(j => j.status === "running").length
});
const bulk = game.createInitialState("整块推进", "oath", "standard");
const step = game.createInitialState("分步推进", "oath", "standard");
// 两份状态必须从完全相同的时间原点出发：clock 与 timers 都要对齐，
// 否则比较的是两个不同的世界，测不出步进等价性。
step.clock = JSON.parse(JSON.stringify(bulk.clock));
step.timers = JSON.parse(JSON.stringify(bulk.timers));
const base = bulk.clock.lastProcessedAt;
const TWO_HOURS = 2 * 60 * 60 * 1000;
// rng 必须各自只创建一次并跨调用复用；每次新建会让两边抽到不同的随机序列。
const bulkRng = seeded(7);
const stepRng = seeded(7);
game.advanceWorld(bulk, base + TWO_HOURS, { rng: bulkRng, maxCatchUpMs: TWO_HOURS });
for (let i = 1; i <= 120; i++) game.advanceWorld(step, base + i * 60000, { rng: stepRng, maxCatchUpMs: TWO_HOURS });
assert.equal(strip(step), strip(bulk), "整块推进与分步推进必须得到相同世界状态");

// season 计时器到期时，原本挂在换季上的事该照常发生
const sea = game.createInitialState("换季测试", "oath", "standard");
const seaBase = sea.clock.lastProcessedAt;
const knowledgeBefore = sea.knowledge;
game.advanceWorld(sea, seaBase + SEASON + 1000, { rng: () => .5 });
assert.equal(game.turnOf(sea), 1, "过了一季，派生 turn 应为 1");
assert.ok(sea.knowledge > knowledgeBefore, "换季应产出知识");
assert.equal(game.advanceSeason, undefined, "advanceSeason 应已删除");
assert.equal(game.advanceSeasonAuto, undefined, "advanceSeasonAuto 应已删除");

// 季界结算必须用「刚结束的那一季」的系数，而不是刚跨入的新一季。
// accrueTo 先把 elapsedMs 推过边界，此时 seasonOf 已是新季 —— 这是个易踩的时序陷阱。
const coef = game.createInitialState("季界系数", "oath", "standard");
const coefBase = coef.clock.lastProcessedAt;
// 推进到第 2 季末（秋末），结算日志应报「秋」而非刚跨入的「冬」
game.advanceWorld(coef, coefBase + SEASON * 3, { rng: () => .5 });
const settleLogs = coef.log.filter(l => l.text.includes("季结算"));
assert.ok(settleLogs.length >= 3, `应有至少 3 条季度结算日志，实际 ${settleLogs.length}`);
const seasonsReported = settleLogs.map(l => l.text.slice(0, 1));
assert.deepEqual(seasonsReported.slice(0, 3).reverse(), ["春", "夏", "秋"],
  `季度结算应按「刚结束的那一季」报告，实际：${seasonsReported.join(",")}`);

// 离线：资源与任务照常结算，但不触发 AI 与事件
const off = game.createInitialState("离线测试", "oath", "standard");
const offBase = off.clock.lastProcessedAt;
const decisionsBefore = off.pendingDecisions.length;
game.advanceWorld(off, offBase + 40 * 60 * 1000, { rng: () => .01, offline: true });
assert.ok(off.gold > 58, "离线期间资源应照常累积");
assert.equal(off.pendingDecisions.length, decisionsBefore, "离线期间不应投放事件");
assert.ok(!off.log.some(l => l.text.includes("袭扰") || l.text.includes("攻占")), "离线期间不应发生 AI 进攻");

console.log("clock tests passed");
