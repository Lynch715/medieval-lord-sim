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

console.log("clock tests passed");
