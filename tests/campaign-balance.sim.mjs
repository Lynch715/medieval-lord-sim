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
  const key = `unit_${type}`;
  if (state.ap < 1 || state.usedActions[key] || state.gold < def.gold || state.grain < def.grain) return false;
  state.gold -= def.gold;
  state.grain -= def.grain;
  state.ap--;
  state.usedActions[key] = 1;
  state.army[type] += game.recruitAmount(state, type);
  game.syncTroops(state);
  return true;
}

function bestDraft(state) {
  const officers = state.officers.filter(o => o.side === "player" && !o.injured);
  const leaders = officers.sort((a, b) => (b.command + b.scheme) - (a.command + a.scheme)).slice(0, 3).map(o => o.id);
  const troops = game.armyTotal(state);
  let best = null;
  for (const targetId of game.attackableTerritories(state)) {
    for (const plan of Object.keys(game.PLANS)) {
      const estimate = game.battleEstimate(state, targetId, leaders, troops, plan);
      if (!best || estimate.ratio > best.ratio) best = { targetId, leaderIds: leaders, troops, plan, ratio: estimate.ratio };
    }
  }
  return best;
}

function fight(state, random) {
  const draft = bestDraft(state);
  if (!draft || draft.ratio < .84 || state.grain < game.campaignSupply(state, draft.troops, draft.leaderIds)) return false;
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
  Math.random = random;
  try {
    while (!state.ended && state.turn < 48) {
      resolveDecisions(state);
      if (state.ended) break;
      if (state.campaignCooldown === 0 && state.ap >= game.CAMPAIGN_AP_COST) fight(state, random);
      if (state.ended) break;
      if (state.ap > 0 && (game.armyTotal(state) < 72 || state.turn >= 20)) {
        recruit(state, state.turn % 3 === 0 ? "levy" : state.turn % 3 === 1 ? "archers" : "knights");
      }
      game.advanceSeason(state);
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
const collapsed = results.filter(result => ["collapsed", "fallen"].includes(result.ending)).length;

assert.ok(unified.every(result => result.turn >= game.CROWN_OPEN_TURN), "任何统一结局都不得早于第7年");
assert.ok(unified.length >= 50, "审慎策略应让多数局具备完成统一的可能");
assert.ok(median >= 24 && median <= 40, "统一节奏中位数应落在第7年至第10年");
assert.ok(collapsed >= 1, "经营崩溃或领地陷落必须是实际可出现的失败结果");

console.log(JSON.stringify({ runs: results.length, unified: unified.length, collapsed, medianTurn: median, range: completionTurns.length ? [completionTurns[0], completionTurns.at(-1)] : null }, null, 2));
