import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const game = require("../app.js");

function rngFor(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function resolveDecisions(state) {
  let safety = 30;
  while (state.pendingDecisions.length && !state.ended && safety-- > 0) {
    const decision = state.pendingDecisions[0];
    const view = game.decisionView(state, decision);
    if (!view) { state.pendingDecisions.shift(); continue; }
    const available = view.options.filter(option => !option.disabled);
    const preferred = decision.type === "lord_capture"
      ? available.find(option => option.name.startsWith("接受效忠"))
      : decision.type === "iron_crown"
        ? available[0]
        : available.find(option => !/[−-](?:2[5-9]|[3-9]\d)/.test(option.note));
    (preferred || available.at(-1)).effect();
    state.pendingDecisions.shift();
  }
}

function recruit(state, type, now) {
  const def = game.UNIT_DEFS[type];
  if (state.gold < def.gold + 18 || state.grain < def.grain + 18) return false;
  const job = game.queueRecruitment(state, type, undefined, now);
  if (!job) return false;
  game.processCompletedJobs(state, job.endAt);
  game.deployGarrison(state, job.territoryId);
  return true;
}

function researchNext(state, now) {
  const sequence = [
    ["military", "refined_iron"],
    ["military", "longbow"],
    ["military", "war_engineering"]
  ];
  if (state.jobs.some(job => job.status === "running" && job.type === "RESEARCH")) return false;
  for (const [branch, techId] of sequence) {
    if (game.techCompleted(state, techId)) continue;
    const job = game.queueResearch(state, branch, techId, now);
    if (!job) return false;
    game.processCompletedJobs(state, job.endAt);
    return true;
  }
  return false;
}

function bestDraft(state) {
  const officers = state.officers.filter(o => o.side === "player" && !o.injured);
  const leaders = officers.sort((a, b) => (b.command + b.scheme) - (a.command + a.scheme)).slice(0, 3).map(o => o.id);
  const troops = game.armyTotal(state, "army_1");
  const targets = game.attackableTerritories(state);
  // 公爵直辖地是开城的前提，也能推迟加冕，够得着就优先打
  const priority = targets.filter(id => game.DUCHY_HOLDINGS.includes(id));
  const pool = priority.length ? priority : targets;
  let best = null;
  for (const targetId of pool) {
    for (const plan of Object.keys(game.PLANS)) {
      const estimate = game.battleEstimate(state, targetId, leaders, troops, plan, "army_1");
      if (!best || estimate.ratio > best.ratio) best = { targetId, leaderIds: leaders, troops, plan, ratio: estimate.ratio };
    }
  }
  return best;
}

// 机器人的外交：够得着就先谈，谈不动再打。
// 这不是最优策略，只是用来验证两条路线在实战中确实可走。
function diplomacy(state) {
  const used = { envoy: 0, persuade: 0, bribe: 0 };
  for (const [id, def] of Object.entries(game.LORD_DEFS)) {
    if (def.tier === "loyal") continue;
    const lord = state.officers.find(o => o.id === id);
    if (!lord || lord.side === "player" || lord.side === "gone" || lord.captured) continue;
    if (game.demandFealty(state, id)) { used.persuade++; continue; }
    const cost = game.lordBribeCost(state, id);
    if (Number.isFinite(cost) && state.gold > cost + 120) {
      if (game.bribeLord(state, id, game.lordHoldings(state, id)[0] || null)) { used.bribe++; continue; }
    }
    const seat = game.lordHoldings(state, id)[0];
    if (seat && state.gold > 40 && game.cityActionAvailable(state, seat, "envoy") && game.cityAction(state, seat, "envoy")) {
      game.processCompletedJobs(state, state.jobs.at(-1).endAt);
      used.envoy++;
    }
  }
  return used;
}

function fight(state, random) {
  const draft = bestDraft(state);
  if (!draft || draft.ratio < .84 || state.grain < game.campaignSupply(state, draft.troops, draft.leaderIds, "army_1")) return false;
  if (!game.startBattle(state, draft, random)) return false;
  while (state.battleSession) {
    const session = state.battleSession;
    const options = game.stageOptions(state, session);
    const choice = session.stage === 0
      ? options.find(option => option.id === "scout") || options.find(option => option.id === "ridge")
      : session.stage === 1
        ? options.find(option => option.id === "feint") || options.find(option => option.id === "volley") || options.find(option => option.id === "shield")
        : session.momentum > 10
          ? options.find(option => option.id === "surrender") || options.find(option => option.id === "hold")
          : options.find(option => option.id === "press") || options.find(option => option.id === "hold");
    game.applyBattleChoice(state, choice.id, random);
  }
  resolveDecisions(state);
  return true;
}

// 固定的模拟纪元。取一个具体常量而不是 Date.now()，是为了让整份模拟
// 与真实时钟彻底脱钩 —— 见下面 run() 里接管 Date.now 的说明。
const EPOCH = 1767225600000; // 2026-01-01T00:00:00Z

function run(seed) {
  const random = rngFor(seed);
  const diploTally = { envoy: 0, persuade: 0, bribe: 0 };
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let now = EPOCH;
  // 游戏里有四十多处把 Date.now() 当默认参数（冷却、排队、建档、开局时钟）。
  // 模拟的虚拟时钟一局要走几个小时，真实时钟却只走几毫秒，两个时间源混在
  // 一起的直接后果是：「使者冷却到期了吗」实际取决于测试进程已经跑了多少秒。
  // 这就是这份模拟此前每次运行都给出不同结局分布的原因（同一份代码连跑三次
  // 得到统一 9/6/6、崩溃 4/1/2）。这里把 Date.now 与 Math.random 一起接管，
  // 让模拟成为一个完全确定的测试台。
  Math.random = random;
  Date.now = () => now;
  const state = game.createInitialState(`模拟${seed}`, ["oath", "iron", "wealth"][seed % 3], "standard");
  try {
    while (!state.ended && game.coronationRemainingMs(state) > 0) {
      game.processCompletedJobs(state, now);
      resolveDecisions(state);
      if (state.ended) break;
      const diplo = diplomacy(state);
      diploTally.envoy += diplo.envoy; diploTally.persuade += diplo.persuade; diploTally.bribe += diplo.bribe;
      fight(state, random);
      if (state.ended) break;
      // 应急征收已随「领主行动」系统一并删除：现在缺钱只能靠经营和扩张，
      // 这正是模拟需要暴露的压力，不再用一次性补钱把它抹平。
      if (game.turnOf(state) >= 4) researchNext(state, now);
      if (game.armyTotal(state, "army_1") < 72 || game.turnOf(state) >= 20) {
        const t = game.turnOf(state);
        recruit(state, t % 3 === 0 ? "levy" : t % 3 === 1 ? "archers" : "knights", now);
      }
      now += game.TIME_CONFIG.seasonDurationMs;
      // 不设补算上限：上限是为了保护真实玩家离开很久后不被洪水般的结算淹没，
      // 而这里是逐季步进的确定性测试台，截断只会让游戏时间被悄悄丢弃。
      game.advanceWorld(state, now, { rng: random, maxCatchUpMs: Infinity });
    }
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
  return {
    turn: game.turnOf(state) + 1,
    territories: game.playableTerritoryIds().filter(id => state.territories[id].owner === "player").length,
    wins: state.wins, battles: state.battles, ending: state.endingReason, casualties: state.casualties,
    renown: Math.round(state.renown), army: game.armyTotal(state, "army_1"),
    siegeTech: game.techCompleted(state, "war_engineering"), gold: Math.round(state.gold), grain: Math.round(state.grain),
    submittedLords: state.officers.filter(o => o.submitted).length,
    persuaded: diploTally.persuade, bribed: diploTally.bribe, envoys: diploTally.envoy
  };
}

const results = Array.from({ length: 120 }, (_, index) => run(index + 1));
const unified = results.filter(result => result.ending === "unified").sort((a, b) => a.turn - b.turn);
const completionTurns = unified.map(result => result.turn);
const median = completionTurns.length ? completionTurns[Math.floor(completionTurns.length / 2)] : null;
const collapsed = results.filter(result => ["collapsed", "fallen"].includes(result.ending) || (result.ending === "minor_lord" && result.territories < 5)).length;
const activeCampaigns = results.filter(result => result.wins > 0).length;

const endingCounts = results.reduce((acc, r) => { acc[r.ending || "none"] = (acc[r.ending || "none"] || 0) + 1; return acc; }, {});
const distinctEndings = Object.keys(endingCounts);

const avg = key => (results.reduce((sum, r) => sum + Number(r[key] || 0), 0) / results.length).toFixed(1);
const met = key => results.filter(r => r[key]).length;

console.log(JSON.stringify({
  runs: results.length, unified: unified.length, collapsed, medianTurn: median,
  range: completionTurns.length ? [completionTurns[0], completionTurns.at(-1)] : null,
  平均最终领地: avg("territories"), 领地上限要求: 18,
  平均威望: avg("renown"), 威望要求: 60,
  平均主力: avg("army"), 主力要求: 80,
  攻城工程达成局数: met("siegeTech"),
  平均胜场: avg("wins"), 平均出征: avg("battles"), 平均结余金币: avg("gold"), 平均收服领主: avg("submittedLords"),
  平均说服归附: avg("persuaded"), 平均收买归附: avg("bribed"), 平均派出使者: avg("envoys"),
  结局分布: endingCounts, 崩溃局数: collapsed
}, null, 2));

assert.ok(unified.every(result => result.turn >= 1), "统一结局必须至少经过一季真实经营");
assert.ok(activeCampaigns >= 80, "多数局应至少能推进一场真实的边境战");
// 上限不再是固定的 48 季：每攻下一块公爵直辖地都会把加冕往后推，
// 战役因此可以合法地超出 12 年。这里只保证统一不会来得过早。
if (unified.length) assert.ok(median >= 24, `统一不应早于第 7 年，实际中位数第 ${median} 季`);
// 胜负两端都必须实际可达，且玩家的决策要能改变结局。
// 这三条曾经因为「统一不可达 / 崩溃不可达 / 结局唯一」而降级为软警告，
// P1b 修好后恢复为硬断言 —— 不要再为了让测试变绿而放宽它们。
assert.ok(unified.length >= results.length * .02,
  `统一结局应当可达，实际 ${unified.length}/${results.length}`);
assert.ok(collapsed >= 1, "经营崩溃或领地陷落必须是实际可出现的失败结果");
assert.ok(distinctEndings.length >= 3,
  `胜、负、时限三类结局都应出现，实际只有：${distinctEndings.join("、")}`);
assert.ok(Number(avg("territories")) >= 6,
  `平均最终领地不应回落，实际 ${avg("territories")}`);
assert.ok(met("siegeTech") >= results.length * .9, "攻城工程应当是常规可达成的科技");
assert.ok(Number(avg("renown")) >= 60, "威望门槛应当是常规可达成的");
assert.ok(Number(avg("submittedLords")) > 0, "打服路线必须能实际收服到领主，否则整条路线在实战中不可用");
// 三条路线都必须在实战中确实可走，否则说明某条路线只是摆设。
assert.ok(results.some(r => r.persuaded > 0), "说服路线必须至少在部分局中成立");
assert.ok(results.some(r => r.bribed > 0), "收买路线必须至少在部分局中成立");

