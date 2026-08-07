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
    const preferred = decision.type === "conquest"
      ? available.find(option => option.name.includes("自治"))
      : decision.type === "submission"
        ? available.find(option => option.name.includes("接受效忠"))
        : decision.type === "iron_crown"
          ? available[0]
          : available.find(option => !/[−-](?:2[5-9]|[3-9]\d)/.test(option.note));
    (preferred || available.at(-1)).effect();
    state.pendingDecisions.shift();
  }
}

function recruit(state, type) {
  const def = game.UNIT_DEFS[type];
  if (state.gold < def.gold + 18 || state.grain < def.grain + 18) return false;
  const job = game.queueRecruitment(state, type, undefined, Date.now());
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
  let best = null;
  for (const targetId of game.attackableTerritories(state)) {
    for (const plan of Object.keys(game.PLANS)) {
      const estimate = game.battleEstimate(state, targetId, leaders, troops, plan, "army_1");
      if (!best || estimate.ratio > best.ratio) best = { targetId, leaderIds: leaders, troops, plan, ratio: estimate.ratio };
    }
  }
  return best;
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

function run(seed) {
  const random = rngFor(seed);
  const state = game.createInitialState(`模拟${seed}`, ["oath", "iron", "wealth"][seed % 3], "standard");
  const originalRandom = Math.random;
  let now = Date.now();
  Math.random = random;
  try {
    while (!state.ended && state.turn < 48) {
      game.processCompletedJobs(state, now);
      resolveDecisions(state);
      if (state.ended) break;
      fight(state, random);
      if (state.ended) break;
      if (state.gold < 30 && !state.seasonLocks?.tax) {
        const tax = game.ACTIONS.find(action => action.id === "tax");
        tax.run(state);
        state.seasonLocks ||= {};
        state.seasonLocks.tax = 1;
      }
      if (state.turn >= 4) researchNext(state, now);
      if (game.armyTotal(state, "army_1") < 72 || state.turn >= 20) {
        recruit(state, state.turn % 3 === 0 ? "levy" : state.turn % 3 === 1 ? "archers" : "knights");
      }
      now += game.TIME_CONFIG.seasonDurationMs;
      game.advanceSeason(state, { at: now });
    }
  } finally {
    Math.random = originalRandom;
  }
  return { turn: Math.min(48, state.turn + 1), territories: Object.values(state.territories).filter(t => t.owner === "player").length, wins: state.wins, battles: state.battles, ending: state.endingReason, casualties: state.casualties };
}

const results = Array.from({ length: 120 }, (_, index) => run(index + 1));
const unified = results.filter(result => result.ending === "unified").sort((a, b) => a.turn - b.turn);
const completionTurns = unified.map(result => result.turn);
const median = completionTurns.length ? completionTurns[Math.floor(completionTurns.length / 2)] : null;
const collapsed = results.filter(result => ["collapsed", "fallen"].includes(result.ending) || (result.ending === "minor_lord" && result.territories < 5)).length;
const activeCampaigns = results.filter(result => result.wins > 0).length;

assert.ok(unified.every(result => result.turn >= 1), "统一结局必须至少经过一季真实经营");
assert.ok(activeCampaigns >= 80, "多数局应至少能推进一场真实的边境战");
if (unified.length) assert.ok(median >= 24 && median <= 48, "统一节奏不应早于第7年且不应超过完整12年");
assert.ok(collapsed >= 1, "经营崩溃或领地陷落必须是实际可出现的失败结果");

console.log(JSON.stringify({ runs: results.length, unified: unified.length, collapsed, medianTurn: median, range: completionTurns.length ? [completionTurns[0], completionTurns.at(-1)] : null }, null, 2));
