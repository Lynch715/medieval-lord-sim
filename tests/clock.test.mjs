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
assert.deepEqual(Object.keys(w.timers).sort(), ["aiCrown", "aiRiver", "aiWolf", "drift", "events", "season"]);
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

// 三个势力各走各的钟
assert.equal(game.TIMER_DEFS.aiWolf.intervalMs, 60000);
assert.equal(game.TIMER_DEFS.aiRiver.intervalMs, 75000);
assert.equal(game.TIMER_DEFS.aiCrown.intervalMs, 90000);
assert.equal(game.runAiTurn, undefined, "runAiTurn 应已被 runFactionTurn 取代");
assert.equal(game.enemyPressure, undefined, "enemyPressure 应已删除");

// 单个势力的计时器只驱动该势力
const solo = game.createInitialState("单势力", "oath", "standard");
solo.clock.elapsedMs = SEASON * 3;   // 越过 AI 的开战门槛
const wolfBefore = JSON.stringify(solo.factions.wolf);
const riverBefore = JSON.stringify(solo.factions.river);
game.runFactionTurn(solo, "wolf", () => .01, Date.now());
assert.notEqual(JSON.stringify(solo.factions.wolf), wolfBefore, "狼牙的计时器应驱动狼牙");
assert.equal(JSON.stringify(solo.factions.river), riverBefore, "狼牙的计时器不应驱动河望");

// 势力资源增长按计时器间隔摊薄：跑满一季的份额应约等于原本每季一次的量
const acc = game.createInitialState("摊薄", "oath", "standard");
const goldStart = acc.factions.wolf.gold;
const firesPerSeason = SEASON / game.TIMER_DEFS.aiWolf.intervalMs;
for (let i = 0; i < firesPerSeason; i++) game.runFactionTurn(acc, "wolf", () => .99, Date.now());
const gained = acc.factions.wolf.gold - goldStart;
assert.ok(Math.abs(gained - 10) < 0.5, `一季内累计增长应约为 10，实际 ${gained.toFixed(2)}`);

// 冷却用时间戳，不再是「本季已用」
const cd = game.createInitialState("冷却测试", "oath", "standard");
assert.equal(cd.seasonLocks, undefined, "seasonLocks 应已删除");
assert.deepEqual(cd.cooldowns, {}, "应改用 cooldowns");
assert.ok(game.cityAction(cd, "wolfden", "scout"), "首次侦察应成功");
game.processCompletedJobs(cd, cd.jobs.at(-1).endAt);
assert.ok(cd.cooldowns["scout:wolfden"] > Date.now(), "侦察后应写入冷却到期时间");
assert.equal(game.cityActionAvailable(cd, "wolfden", "scout"), false, "冷却期内不可再次侦察");
cd.cooldowns["scout:wolfden"] = Date.now() - 1;
assert.equal(game.cityActionAvailable(cd, "wolfden", "scout"), true, "冷却过期后应恢复");

// 知识不再是季界一次性到账，而是按秒累积
const kn = game.createInitialState("知识连续", "oath", "standard");
const knBase = kn.clock.lastProcessedAt;
const knStart = kn.knowledge;
game.accrueTo(kn, knBase + SEASON / 2);
assert.ok(kn.knowledge > knStart, "半季后知识应已增长，而不是等到季界");
const halfGain = kn.knowledge - knStart;
game.accrueTo(kn, knBase + SEASON);
const fullGain = kn.knowledge - knStart;
assert.ok(Math.abs(fullGain - halfGain * 2) < 0.01, `整季增量应约为半季的两倍，实际 ${halfGain} → ${fullGain}`);
assert.ok(Math.abs(fullGain - 3) < 0.01, `开局每季知识应为 3，实际 ${fullGain.toFixed(3)}`);

// 仓储损耗早已是连续的：forecast 的 netGrain 已经减去了 spoilage，
// 而 grainPerSecond = netGrain / 季长。这里锁死它不得被重复扣第二次。
const sp = game.createInitialState("损耗不重复扣", "oath", "standard");
const spBase = sp.clock.lastProcessedAt;
const spFlow = game.resourceFlow(sp);
const spStart = sp.grain;
game.accrueTo(sp, spBase + 10000);
const spActual = sp.grain - spStart;
const spExpected = spFlow.grainPerSecond * 10;
assert.ok(Math.abs(spActual - spExpected) < 1e-6,
  `粮食增量应恰好等于 grainPerSecond×秒数（损耗已含在其中），预期 ${spExpected.toFixed(4)} 实际 ${spActual.toFixed(4)}`);

// drift 计时器让守军平滑恢复，而不是季界跳一次
assert.equal(game.TIMER_DEFS.drift.intervalMs, 5000);
const dr = game.createInitialState("漂移", "oath", "standard");
const drBase = dr.clock.lastProcessedAt;
const home = dr.territories.ravenstone;
home.stability = 80;
home.guard = 10;
const guardStart = home.guard;
game.advanceWorld(dr, drBase + SEASON, { rng: () => .99 });
assert.ok(home.guard > guardStart, "一季内守军应有恢复");
assert.ok(home.guard - guardStart <= 2, `一季恢复量不应远超原本的每季 +1，实际 +${home.guard - guardStart}`);
assert.equal(home.guard, Math.round(home.guard), "守军必须保持整数");

// 破坏度也随时间消退
const dv = game.createInitialState("破坏度", "oath", "standard");
const dvBase = dv.clock.lastProcessedAt;
dv.territories.ravenstone.devastated = 3;
game.advanceWorld(dv, dvBase + SEASON * 2, { rng: () => .99 });
assert.ok(dv.territories.ravenstone.devastated < 3, "破坏度应随时间消退");
assert.equal(dv.territories.ravenstone.devastated, Math.round(dv.territories.ravenstone.devastated), "破坏度必须保持整数");

// 危机按持续时长判定，玩家有机会实时补救，而不是等季界宣判
const cr = game.createInitialState("危机", "oath", "standard");
assert.deepEqual(Object.keys(cr.crisis).sort(), ["famineMs", "unrestMs"], "危机改为毫秒累计");
const crBase = cr.clock.lastProcessedAt;
// 亏空到即使累积一段时间后仍然见底，才算真正的饥荒
cr.grain = -100000;
game.accrueTo(cr, crBase + 10 * 60 * 1000);
game.checkDefeat(cr);
assert.equal(cr.ended, false, "饥荒 10 分钟不应立即崩溃");
assert.ok(cr.crisis.famineMs >= 10 * 60 * 1000 - 1, `饥荒时长应在累计，实际 ${cr.crisis.famineMs}`);
// 补上粮食后计时清零 —— 玩家有实时补救的余地
cr.grain = 500;
game.accrueTo(cr, crBase + 11 * 60 * 1000);
assert.equal(cr.crisis.famineMs, 0, "粮食补上后饥荒计时应清零");

const cr2 = game.createInitialState("饥荒崩溃", "oath", "standard");
cr2.crisis.famineMs = 15 * 60 * 1000;
cr2.grain = 0;
game.checkDefeat(cr2);
assert.equal(cr2.ended, true);
assert.equal(cr2.endingReason, "collapsed");

// 研究并发数 = 1 + 学宫总等级 / 5
const rs = game.createInitialState("研究并发", "oath", "standard");
rs.gold = 5000; rs.knowledge = 5000;
assert.equal(game.researchCapacity(rs), 1, "开局无学宫，只有一条研究队列");
assert.ok(game.queueResearch(rs, "agriculture", "heavy_plow", 1000), "第一项研究应可开始");
assert.equal(game.queueResearch(rs, "military", "refined_iron", 1000), null, "容量为 1 时第二项应被拒绝");

const rs2 = game.createInitialState("研究并发2", "oath", "standard");
rs2.gold = 5000; rs2.knowledge = 5000;
rs2.territories.ravenstone.buildings.academy = 5;
assert.equal(game.researchCapacity(rs2), 2, "学宫总等级 5 应给到 2 条队列");
assert.ok(game.queueResearch(rs2, "agriculture", "heavy_plow", 1000));
assert.ok(game.queueResearch(rs2, "military", "refined_iron", 1000), "第二项应可并发");
assert.equal(game.queueResearch(rs2, "commerce", "coinage", 1000), null, "超出容量应被拒绝");
const rsJobs = rs2.jobs.filter(j => j.status === "running" && j.type === "RESEARCH");
assert.equal(rsJobs.length, 2);
assert.equal(new Set(rsJobs.map(j => j.queueKey)).size, 2, "并发研究必须各自占用不同的队列键");

console.log("clock tests passed");
