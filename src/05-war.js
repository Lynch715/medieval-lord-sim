"use strict";

// 战前预测、战斗会话与阶段选项、军团、AI 势力回合、战后处置与决策视图。

function battleEstimate(s, targetId, leaderIds, troops, planId, armyId = "army_1", explicitComposition = null, selectedKnightIds = null) {
  const t = s.territories[targetId];
  const d = TERRITORY_DEFS[targetId];
  const plan = PLANS[planId] || PLANS.steady;
  const force = averageStat(s, leaderIds, "force");
  const command = averageStat(s, leaderIds, "command");
  const scheme = averageStat(s, leaderIds, "scheme");
  let planMult = plan.mult;
  if (planId === "ambush") {
    planMult += scheme / 1400;
    if ((d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) planMult += .15;
  }
  if (planId === "assault" && leaderIds.includes("renard")) planMult += .06;
  const composition = explicitComposition ? { ...emptyComposition(), ...explicitComposition } : selectedComposition(s, troops, armyId);
  const enemyComposition = defenderComposition(s, targetId);
  const unitPower = compositionPower(composition, targetId, planId, seasonOf(s).id, s);
  const counter = counterMultiplier(composition, enemyComposition);
  const fatigue = 1;
  const effectiveMorale = leaderIds.includes("player") ? Math.max(45, s.morale) : s.morale;
  let attack = unitPower * (.62 + command / 190 + force / 330) * (.72 + effectiveMorale / 190) * planMult * fatigue * counter;
  if (leaderIds.includes("player")) attack *= 1.03;
  const knightMultiplier = knightBattleMultiplier(s, selectedKnightIds);
  attack *= knightMultiplier;
  if (leaderIds.includes("bran") && (d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) attack *= 1.08;
  if (leaderIds.includes("aveline") && (d.terrainTags || []).includes("river")) attack *= 1.08;
  const walls = t.buildings?.walls || (d.final ? 2 : 1);
  const watchtower = t.buildings?.watchtower || 0;
  const wallFactor = techLevel(s, "sappers") ? Math.max(.05, .09 - techLevel(s, "sappers") * .01) : .11;
  const enemyPower = compositionPower(enemyComposition, targetId, "steady", seasonOf(s).id);
  const enemyCounter = counterMultiplier(enemyComposition, composition);
  const enemyEquipmentFactor = Math.max(.92, Math.min(1.12, enemyPower / Math.max(1, t.guard)));
  let defense = t.guard * (1 + walls * wallFactor + watchtower * .025) * difficultyOf(s).enemy * (1 + (enemyCounter - 1) * .55) * enemyEquipmentFactor;
  if (techLevel(s, "siege_ladders") && (d.terrainTags || []).includes("fortified")) attack *= 1 + techLevel(s, "siege_ladders") * .05;
  if (techLevel(s, "trebuchet") && (d.terrainTags || []).some(tag => ["fortified", "capital"].includes(tag))) attack *= 1 + techLevel(s, "trebuchet") * .04;
  const defender = defenderLeader(s, targetId);
  if (defender) defense *= 1 + defender.stats.command / 700;
  if (defender?.id === "bran" && (d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) defense *= 1.1;
  if (defender?.id === "aveline" && (d.terrainTags || []).includes("river")) defense *= 1.08;
  const ratio = attack / Math.max(1, defense);
  let label = "胜负难料";
  if (ratio >= 1.28) label = "明显占优";
  else if (ratio >= 1.08) label = "略占上风";
  else if (ratio < .78) label = "近乎送死";
  else if (ratio < .94) label = "处于下风";
  return { attack, defense, ratio, label, planMult, composition, defenderComposition: enemyComposition, unitPower, counter, knightMultiplier, fatigue, effectiveMorale };
}

function casualtyForecast(s, targetId, leaderIds, troops, planId, armyId = "army_1") {
  const est = battleEstimate(s, targetId, leaderIds, troops, planId, armyId);
  const plan = PLANS[planId] || PLANS.steady;
  const oddsPenalty = Math.min(.1, Math.max(0, .9 / Math.max(.15, est.ratio) - 1) * .035);
  let center = troops * (.03 + Math.max(.007, 1 / Math.max(.2, est.ratio) * .014) + oddsPenalty) * plan.casualty * 3;
  if (leaderIds.includes("ysabel")) center *= .9;
  return { low: Math.max(2, Math.round(center * .72)), high: Math.max(3, Math.round(center * 1.35)) };
}

function battleRiskClass(ratio) {
  if (ratio >= 1.28) return "favorable";
  if (ratio < .78) return "deadly";
  if (ratio < .94) return "risky";
  return "uncertain";
}

function battlePowerText(ratio) {
  if (ratio >= 1.28) return "我军明显占优";
  if (ratio >= 1.08) return "我军略占上风";
  if (ratio < .78) return "这场战斗近乎送死";
  if (ratio < .94) return "我军处于下风";
  return "胜负难料";
}

function battleBreakdownText(est) {
  return "";
}

function battleFatigueText(fatigue) {
  const percent = Math.round((1 - fatigue) * 100);
  return percent > 0 ? `战争疲劳使战力降低${percent}%。` : "";
}

function battleMoraleText(effectiveMorale, morale) {
  return effectiveMorale !== morale ? `领主亲征时，本场军心最低按${Math.round(effectiveMorale)}点计算。` : "";
}

function battleMomentumText(value) {
  const momentum = Math.round(value);
  const label = momentum >= 15 ? "我军明显占优" : momentum >= 5 ? "我军略占优势" : momentum <= -15 ? "敌军明显占优" : momentum <= -5 ? "敌军略占优势" : "双方势均力敌";
  return `当前战况：${label}`;
}

function armyGroupComposition(s, armyIds = []) {
  const result = emptyComposition();
  armyIds.map(id => armyEntity(s, id)).filter(Boolean).forEach(army => {
    Object.keys(UNIT_DEFS).forEach(type => { result[type] += Math.max(0, Math.round(army.composition?.[type] || 0)); });
  });
  return result;
}

function startBattle(s, draft, rng = Math.random) {
  const arrival = draft.arrival === true;
  const armyIds = [...new Set((draft.armyIds || [draft.armyId || "army_1"]).filter(Boolean))];
  const armies = armyIds.map(id => armyEntity(s, id)).filter(army => army?.owner === "player");
  if (s.battleSession || !armies.length || armies.length !== armyIds.length) return null;
  if (!arrival && !armyIds.some(id => attackableTerritories(s, id).includes(draft.targetId))) return null;
  if (armies.some(army => !["idle", "marching"].includes(army.status))) return null;
  const army = armies[0];
  const defaultLeaderIds = armies.map(item => item.commanderId || item.leaders?.[0] || "player");
  const leaderIds = [...new Set((draft.leaderIds?.length ? draft.leaderIds : defaultLeaderIds).filter(Boolean))].slice(0, 3);
  const leaders = leaderIds.map(id => commanderById(s, id)).filter(person => person && (person.id === "player" || person.side === "player" && person.status === "active" || person.side === "player" && person.injured === 0)).slice(0, 3);
  const availableComposition = armyGroupComposition(s, armyIds);
  const availableTroops = compositionTotal(availableComposition);
  const requestedComposition = draft.composition ? { ...emptyComposition(), ...draft.composition } : null;
  const compositionValid = requestedComposition && Object.keys(UNIT_DEFS).every(type => requestedComposition[type] >= 0 && requestedComposition[type] <= (availableComposition[type] || 0));
  if (draft.composition && !compositionValid) return null;
  const troops = requestedComposition ? compositionTotal(requestedComposition) : clamp(Math.round(draft.troops), 10, availableTroops);
  if (!leaders.length || troops > availableTroops) return null;
  if (troops < 10) return null;
  const supply = draft.composition ? compositionSupply(s, requestedComposition, leaders.map(o => o.id)) : campaignSupply(s, troops, leaders.map(o => o.id), army.id);
  if (!draft.supplyAlreadyPaid && s.grain < supply) return null;
  const knightIds = (draft.knightIds || draft.commandKnightIds || []).filter(id => activeKnights(s).some(knight => knight.id === id));
  const estimateComposition = requestedComposition || selectedComposition({ ...s, armies: [{ ...army, composition: availableComposition }] }, troops, army.id);
  const est = battleEstimate(s, draft.targetId, leaderIds, troops, draft.plan, army.id, estimateComposition, knightIds.length ? knightIds : null);
  if (!draft.supplyAlreadyPaid) s.grain -= supply;
  s.warWeariness = 0;
  s.battles++;
  s.battleSession = {
    armyId: army.id,
    armyIds,
    armyOrigins: draft.armyOrigins || Object.fromEntries(armies.map(item => [item.id, item.locationId])),
    originId: draft.originId || army.locationId,
    targetId: draft.targetId,
    leaderIds: leaders.map(o => o.id),
    knightIds,
    troops,
    plan: draft.plan,
    composition: est.composition,
    lossesByType: emptyComposition(),
    ratio: est.ratio,
    stage: 0,
    momentum: clamp((est.ratio - 1) * 42, -42, 42),
    playerLoss: 0,
    enemyLoss: 0,
    history: [],
    flags: { demanded: false, pushed: false, aggression: 0 },
    seedMark: Math.round(rng() * 1e9)
  };
  armies.forEach(item => {
    item.status = "engaged";
    item.destinationId = draft.targetId;
    item.jobId = null;
    item.leaders = [item.commanderId || "player"];
  });
  pauseWorld(s, "battle");
  log(s, "warn", `${leaders.map(o => o.name).join("、")}率${troops}人（${compositionText(est.composition)}）向${TERRITORY_DEFS[draft.targetId].name}进军。`);
  return s.battleSession;
}

function stageOptions(s, session) {
  const ids = session.leaderIds;
  const scheme = averageStat(s, ids, "scheme");
  const force = averageStat(s, ids, "force");
  const charm = averageStat(s, ids, "charm");
  const options = [];
  if (session.stage === 0) {
    options.push({ id: "ridge", name: "抢下有利地形", by: "通用命令", desc: "先占据有利位置，减少开战时的伤亡。", mult: 1.05, casualty: .9 });
    if (scheme >= 64) options.push({ id: "scout", name: "从猎户小径绕过去", by: ids.includes("edmund") ? "埃德蒙" : ids.includes("ysabel") ? "伊莎贝尔" : "谋士提议", desc: "从小路绕到敌军侧面，减少第一轮伤亡。", mult: 1.1 + scheme / 1200, casualty: .7 });
    if (ids.includes("renard")) options.push({ id: "forced", name: "立即冲向敌军", by: "雷纳德", desc: "快速冲向敌军。连续选择强攻会明显增加伤亡。", mult: 1.12, casualty: 1.45, pushed: true });
  } else if (session.stage === 1) {
    options.push({ id: "shield", name: "稳住盾牌队伍", by: "通用命令", desc: "守住防线，尽量减少伤亡。", mult: 1, casualty: .75 });
    if ((session.composition?.archers || 0) >= 4) options.push({ id: "volley", name: "让弓手轮流射击", by: ids.includes("ysabel") ? "伊莎贝尔" : "弓手队长", desc: "持续射击压制敌军。在森林和河地效果更好。", mult: 1.08 + (session.composition.archers / Math.max(10, session.troops)) * .55, casualty: .68 });
    if ((force >= 68 || ids.includes("renard")) && (session.composition?.knights || 0) >= 2) options.push({ id: "charge", name: "让披甲骑士正面冲锋", by: ids.includes("renard") ? "雷纳德" : "随军骑士", desc: "平原威力最大，但连续强攻会明显增加伤亡。", mult: 1.1 + force / 2400, casualty: 1.64, pushed: true });
    if (scheme >= 67) options.push({ id: "feint", name: "故意露出左翼", by: ids.includes("edmund") ? "埃德蒙" : "谋士提议", desc: "诱使敌军离开防线，再切断退路。", mult: 1.14 + scheme / 1600, casualty: .88 });
  } else {
    options.push({ id: "press", name: "派出剩余部队强攻", by: "通用命令", desc: "争取在天黑前结束战斗，但疲惫的部队会承受更多伤亡。", mult: 1.08, casualty: 1.48, pushed: true });
    options.push({ id: "hold", name: "停止追击，守住优势", by: "通用命令", desc: "不追求大胜，优先减少伤亡。", mult: 1.01, casualty: .72 });
    if (session.momentum > 10 && charm >= 64) options.push({ id: "surrender", name: "让号手劝他们放下武器", by: ids.includes("edmund") ? "埃德蒙" : "随军使者", desc: "仅在我军占据优势时可能奏效。", mult: .96 + charm / 1900, casualty: .38, surrender: true });
    options.push({ id: "retreat", name: "下令撤退", by: ids.includes("ysabel") ? "伊莎贝尔" : "通用命令", desc: "保住剩余士兵，本场无法占领目标。", retreat: true });
  }
  return options.slice(0, 4);
}

function battleNarrative(session, choice, delta, loss, enemyLoss) {
  const target = TERRITORY_DEFS[session.targetId];
  const stageNames = ["接近敌军", "正面交战", "最后阶段"];
  const direction = delta >= 8 ? "我军取得优势" : delta <= -8 ? "我军陷入劣势" : "双方仍在僵持";
  const special = choice.surrender ? "号手发出劝降信号，部分敌军放下武器。" : choice.id === "scout" ? "斥候发现一条未设防的小路。" : choice.id === "charge" ? "披甲骑士正面冲击敌军盾牌队伍。" : choice.id === "volley" ? "弓手完成三轮齐射，敌军开始后退。" : choice.id === "feint" ? "敌军追入缺口后，退路被我军切断。" : choice.id === "hold" ? "我军停止追击并守住现有位置。" : "我军按命令继续推进。";
  return { name: stageNames[session.stage], title: `${choice.by}：${choice.name}`, text: `${special}${direction}。本阶段我军损失${loss}人，敌军约损失${enemyLoss}人。` };
}

function battleChoiceHint(choice) {
  const hints = { ridge: "稳住先手 · 伤亡较低", scout: "谋略推进 · 首轮损失较低", forced: "快速推进 · 伤亡风险高", shield: "稳住战线 · 伤亡低", volley: "弓手压制 · 需要弓手", charge: "骑士冲锋 · 伤亡风险高", feint: "制造缺口 · 依赖谋略", press: "追击推进 · 伤亡风险高", hold: "守住优势 · 可能错失战果", surrender: "劝降机会 · 只在占优时出现", retreat: "保存兵力 · 放弃本次攻城" };
  return hints[choice.id] || "改变当前战况";
}

function battleSituation(session) {
  const stage = ["接敌", "交锋", "决胜"][session.stage] || "决胜";
  const momentum = Math.round(session.momentum);
  const state = momentum >= 12 ? "我军掌握主动" : momentum <= -12 ? "敌军正在压迫战线" : "双方仍在争夺主动";
  const terrain = TERRITORY_DEFS[session.targetId]?.terrain || "战场";
  return { stage, title: `${stage}阶段 · ${state}`, text: `${terrain}地形正在影响推进。下一道军令会同时改变推进速度和伤亡。` };
}

function applyBattleChoice(s, choiceId, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const choice = stageOptions(s, session).find(o => o.id === choiceId);
  if (!choice) return null;
  if (choice.retreat) return finishBattle(s, "retreat", rng);
  const priorAggression = session.flags.aggression || 0;
  let adaptation = 1;
  let casualtySurge = 1;
  if (choice.pushed) {
    session.flags.pushed = true;
    adaptation = 1 - Math.min(.18, priorAggression * .08);
    casualtySurge = 1 + priorAggression * .22;
    session.flags.aggression = priorAggression + 1;
  } else session.flags.aggression = Math.max(0, priorAggression - 1);
  if (choice.surrender) session.flags.demanded = true;
  const wave = .71 + rng() * .58;
  const effectiveMult = choice.mult * adaptation;
  let delta = (session.ratio * effectiveMult * wave - 1) * 34;
  const counterBlow = choice.pushed && priorAggression > 0 ? priorAggression * (6 + rng() * 8) : 0;
  delta -= counterBlow;
  session.momentum = clamp(session.momentum + delta, -100, 100);
  const remaining = Math.max(1, session.troops - session.playerLoss);
  const oddsPenalty = Math.min(.1, Math.max(0, .9 / Math.max(.15, session.ratio) - 1) * .035);
  let loss = Math.max(1, Math.round(remaining * (.03 + Math.max(.007, 1 / Math.max(.2, session.ratio) * .014) + oddsPenalty) * choice.casualty * casualtySurge * (.78 + rng() * .45)));
  if (session.leaderIds.includes("ysabel")) loss = Math.max(1, Math.round(loss * .9));
  const defender = s.territories[session.targetId].guard;
  const enemyLoss = Math.max(1, Math.round(defender * .035 * effectiveMult * (.78 + rng() * .5)));
  session.playerLoss = Math.min(session.troops - 1, session.playerLoss + loss);
  session.lossesByType = allocateLosses(session.composition, session.playerLoss);
  session.enemyLoss = Math.min(defender, session.enemyLoss + enemyLoss);
  const history = battleNarrative(session, choice, delta, loss, enemyLoss);
  if (counterBlow > 0) history.text += ` 连续强攻被敌军看穿，我军优势下降${Math.round(counterBlow)}点。`;
  session.history.push(history);
  session.stage++;
  if (session.stage >= 3) {
    const surrenderWin = session.flags.demanded && session.momentum > 4;
    return finishBattle(s, session.momentum >= 8 || surrenderWin ? "win" : "loss", rng);
  }
  saveGame();
  return { ended: false, session };
}

function finishBattle(s, outcome, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const targetId = session.targetId;
  const targetName = TERRITORY_DEFS[targetId].name;
  const oldOwner = s.territories[targetId].owner;
  const lossesByType = session.lossesByType || allocateLosses(session.composition || selectedComposition(s, session.troops), session.playerLoss);
  const engagedArmies = (session.armyIds || [session.armyId || "army_1"]).map(id => armyEntity(s, id)).filter(Boolean);
  const engagedArmy = engagedArmies[0] || null;
  Object.keys(UNIT_DEFS).forEach(type => {
    let left = Math.max(0, lossesByType[type] || 0);
    engagedArmies.forEach(army => {
      if (left <= 0) return;
      const take = Math.min(left, army.composition[type] || 0);
      army.composition[type] = Math.max(0, (army.composition[type] || 0) - take);
      left -= take;
    });
  });
  syncTroops(s);
  s.casualties += session.playerLoss;
  s.warWeariness = 0;
  const leaders = session.leaderIds.map(id => commanderById(s, id)).filter(Boolean);
  // 领主不再进入受伤计时；战后只结算兵力、军心与领地归属。
  const injured = [];
  let persistentEnemyLoss = 0;
  let garrisoned = 0;
  let lostGold = 0;
  let lostGrain = 0;
  if (outcome === "win") {
    const t = s.territories[targetId];
    const desiredGarrison = Math.max(6, Math.round((session.troops - session.playerLoss) * (session.flags.demanded ? .16 : .22)));
    garrisoned = Math.min(Math.max(0, armyTotal(s, engagedArmy?.id) - 10), desiredGarrison);
    if (garrisoned > 0 && engagedArmy) {
      const moved = removeFromComposition(engagedArmy.composition, garrisoned);
      Object.keys(UNIT_DEFS).forEach(type => { territoryGarrison(s, targetId)[type] += moved[type]; });
    }
    t.owner = "player";
    delayCoronation(s, targetId);
    t.stability = 45;
    t.guard = Math.max(10, 8 + garrisoned);
    t.devastated = 2;
    t.fiefHolder = null;
    s.wins++;
    s.renown = clamp(s.renown + 8);
    gainLegitimacy(s, "battleWin");
    gainLegitimacy(s, "reclaim");
    s.morale = clamp(s.morale + 7);
    leaders.forEach(o => { if (o.merit != null) o.merit += 7 + (session.flags.demanded ? 2 : 0); if (o.loyalty != null) o.loyalty = clamp(o.loyalty + 2); });
    const fallenLord = lordAt(s, targetId);
    t.lordId = null;
    if (fallenLord) {
      const stillHolds = lordHoldings(s, fallenLord.id).length;
      if (stillHolds === 0) {
        // 失去最后一块辖地才被俘；仍有其他城的领主只是退走。
        fallenLord.captured = true;
        s.pendingDecisions.push({ type: "lord_capture", lordId: fallenLord.id, territoryId: targetId });
        log(s, "info", `${fallenLord.name}失去最后一座城，在${targetName}城下被俘。`);
      } else {
        log(s, "warn", `${fallenLord.name}退往${TERRITORY_DEFS[lordHoldings(s, fallenLord.id)[0]].name}，仍有${stillHolds}座城在手。`);
      }
      // 该领主名下的骑士按 45% 被俘，其余战死
      (s.knights || []).filter(k => k.liegeLordId === fallenLord.id && k.status === "available").forEach(knight => {
        if (rng() < .45) { knight.status = "captured"; knight.captured = true; log(s, "info", `${knight.name}在${targetName}城下被俘。`); }
        else { knight.status = "gone"; knight.side = "gone"; knight.liegeLordId = null; }
      });
    }
    log(s, "good", `${targetName}被占领。此战我军损失${session.playerLoss}人，敌军约损失${session.enemyLoss}人。另抽调${garrisoned}名士兵驻守新领地。`);
  } else if (outcome === "retreat") {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - (session.leaderIds.includes("ysabel") ? 2 : 6));
    s.renown = clamp(s.renown - 2);
    if (session.flags.pushed && session.momentum > 10 && session.leaderIds.includes("renard")) officer(s, "renard").grievance = clamp(officer(s, "renard").grievance + 8);
    log(s, "warn", `军队从${targetName}撤回，我军损失${session.playerLoss}人。敌方守军减少${persistentEnemyLoss}人，之后会缓慢补充。`);
  } else {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - 10);
    s.renown = clamp(s.renown - 3);
    s.support = clamp(s.support - 3);
    lostGold = Math.min(Math.max(0, s.gold), 4 + Math.ceil(session.playerLoss / 3));
    lostGrain = Math.min(Math.max(0, s.grain), 6 + Math.ceil(session.playerLoss / 2));
    s.gold -= lostGold;
    s.grain -= lostGrain;
    leaders.forEach(o => { if (o.loyalty != null) o.loyalty = clamp(o.loyalty - 2); if (o.grievance != null) o.grievance = clamp(o.grievance + 3); });
    log(s, "bad", `${targetName}进攻失败，我军损失${session.playerLoss}人。战败时丢失${lostGold}金币和${lostGrain}粮食；敌方守军减少${persistentEnemyLoss}人，之后会缓慢补充。`);
  }
  const resumedAt = Date.now();
  resumeWorld(s, resumedAt);
  const recoveryAt = resumedAt;
  engagedArmies.forEach(engagedArmy => {
    engagedArmy.destinationId = null;
    engagedArmy.locationId = outcome === "win" ? targetId : (session.armyOrigins?.[engagedArmy.id] || engagedArmy.locationId || "ravenstone");
    engagedArmy.leaders = [engagedArmy.commanderId || session.leaderIds[0] || "player"];
    engagedArmy.morale = s.morale;
    engagedArmy.training = s.training;
    engagedArmy.status = "idle";
    engagedArmy.jobId = null;
    startArmyRecovery(s, engagedArmy, outcome === "win" ? 90 * 1000 : 120 * 1000, recoveryAt);
  });
  const report = { targetId, targetName, outcome, losses: session.playerLoss, lossesByType, composition: clone(session.composition), enemyLoss: session.enemyLoss, persistentEnemyLoss, garrisoned, lostGold, lostGrain, history: clone(session.history), momentum: session.momentum, injured };
  s.lastBattle = report;
  recordBattle(s, {
    dir: "attack", targetId, targetName, outcome,
    ourLoss: session.playerLoss, theirLoss: session.enemyLoss
  });
  s.battleSession = null;
  // 攻下王冠谷就是胜利。原本要求「拥有全部 24 块可占领地」——
  // 那与开城条件是两套完全不同的门槛，实测 7/120 局打进了王城却没人触发统一，
  // 因为没人能把整张地图涂满。铁冠在王冠谷里，拿到它就是复国成功。
  if (outcome === "win" && TERRITORY_DEFS[targetId]?.final) s.pendingDecisions.push({ type: "iron_crown" });
  checkDefeat(s);
  saveGame();
  return { ended: true, report };
}

// 六个兵种全部计入。原先只算 levy / archers / knights，重步兵、弩手、轻骑兵
// 一律按 0 —— 摄政开局那 8 名重步兵与 5 名弩手等于白养，它的军队看着唬人，
// 真打起来只有一半兵力在出力。
function aiArmyPower(army) {
  const comp = army?.composition || {};
  return (comp.levy || 0) * .92
    + (comp.archers || 0) * 1.08
    + (comp.knights || 0) * 1.72
    + (comp.heavy_infantry || 0) * 1.34
    + (comp.crossbowmen || 0) * 1.28
    + (comp.light_cavalry || 0) * 1.22;
}

// 驻扎野战部队计入守城。0.8：野战部队守城不如城墙好使。
// 0.7：整补中的疲兵再打七折 —— 刚打完硬仗的部队不该立刻变成铜墙铁壁，
// 这也让「胜后整补 90 秒」第一次有了防守层面的意义。
const STATIONED_DEFENSE_FACTOR = .8;
const STATIONED_RECOVERING_FACTOR = .7;
// 打退了也要流血，否则驻防是白嫖；城破损失更重。
const STATIONED_LOSS_REPELLED = .04;
const STATIONED_LOSS_CAPTURED = .18;

function stationedPower(s, territoryId) {
  return stationedArmies(s, territoryId).reduce((sum, army) =>
    sum + aiArmyPower(army) * STATIONED_DEFENSE_FACTOR * (army.status === "recovering" ? STATIONED_RECOVERING_FACTOR : 1), 0);
}

// 扣除顺序按军团在 s.armies 里的下标从小到大，不按兵力或战力排序 ——
// 平衡模拟是确定性的，任何依赖运行期状态的排序都可能让两次运行结果不同。
function applyStationedLosses(s, territoryId, share) {
  const armies = stationedArmies(s, territoryId);
  const total = armies.reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  if (!armies.length || total <= 0) return 0;
  let left = Math.max(1, Math.round(total * share));
  let taken = 0;
  armies.forEach(army => {
    if (left <= 0) return;
    const removed = compositionTotal(removeFromComposition(army.composition, left));
    taken += removed;
    left -= removed;
  });
  syncTroops(s);
  return taken;
}

// 城破后撤往最近的自有领地并进入整补。距离相同时取 ownTerritoryIds 里
// 靠前的那个 —— 该函数返回顺序由 TERRITORY_DEFS 的键序决定，是确定的。
function retreatStationedArmies(s, territoryId, now = Date.now()) {
  const armies = stationedArmies(s, territoryId);
  const havens = ownTerritoryIds(s).filter(id => id !== territoryId);
  // 无处可退说明渡鸦堡也已失守，紧接着就会置 s.ended，游戏已经结束。
  if (!armies.length || !havens.length) return [];
  const haven = havens.reduce((best, id) => territoryDistance(territoryId, id) < territoryDistance(territoryId, best) ? id : best, havens[0]);
  armies.forEach(army => {
    army.locationId = haven;
    army.destinationId = null;
    army.jobId = null;
    army.status = "idle";
    startArmyRecovery(s, army, 90 * 1000, now);
  });
  return armies;
}

// AI 能打哪里，取自己版图的边界 —— 和玩家那边是同一条规则。
// 原先只看「大军脚下那一格的邻居里哪些属于玩家」，后果是摄政公爵整局一仗没打：
// 它的军队站在王冠谷，三个邻居分别属狼牙和河望，targets 恒为空。
// 追着玩家加冕的头号反派，全程是个雕像。
function aiTargets(s, factionId) {
  const mine = new Set(factionTerritories(s, factionId));
  if (!mine.size) return [];
  return Object.keys(TERRITORY_DEFS).filter(id => {
    const d = TERRITORY_DEFS[id];
    if (d.playable === false || mine.has(id)) return false;
    const owner = s.territories[id]?.owner;
    // 只打玩家和中立割据：三家 AI 互不交火，免得它们自己先分出胜负。
    if (owner !== "player" && owner !== "neutral") return false;
    // 六名大叛臣的主城是玩家的主线目标，不该被 AI 顺手拿走。
    if (owner === "neutral" && LORD_DEFS[SEAT_TO_LORD[id]]?.tier === "liege") return false;
    return d.adj.some(neighbour => mine.has(neighbour));
  });
}

// 势力每季金币收入。抽成函数是为了让「按计时器间隔摊薄」的测试与实现共用一份公式，
// 而不是在测试里再抄一遍数字 —— 这个项目已经吃过好几次「两处各写一份」的亏。
// 收入随占地浮动：被打掉地盘的势力会真的衰弱，扩张的会真的变强。
function aiSeasonIncome(s, factionId) {
  return (4 + factionTerritories(s, factionId).length * 1.6) * difficultyOf(s).income;
}

// 地盘越大能养的兵越多。这既是成长曲线，也是防止后期无限膨胀的闸门。
function aiArmyCap(s, factionId) {
  return AI_ARMY_BASE_CAP + factionTerritories(s, factionId).length * AI_ARMY_CAP_PER_TERRITORY;
}

// 把囤着的金币换成兵。没有这一步，AI 每打一仗就少一批人，越打越弱。
function reinforceAIArmy(s, factionId, share = 1, rng = Math.random) {
  const faction = s?.factions?.[factionId];
  const army = faction?.armies?.[0];
  if (!faction || !army) return 0;
  const room = aiArmyCap(s, factionId) - compositionTotal(army.composition);
  if (room <= 0) return 0;
  const taste = AI_RECRUIT_TASTE[AI_FACTION_DEFS[factionId]?.personality] || ["levy"];
  const type = taste[Math.min(taste.length - 1, Math.floor(rng() * taste.length))];
  const unit = UNIT_DEFS[type];
  if (!unit) return 0;
  const budget = Math.max(0, faction.gold) * AI_REINVEST_SHARE * share;
  const count = Math.min(room, Math.floor(budget / unit.gold));
  if (count < 1) return 0;
  faction.gold -= count * unit.gold;
  army.composition[type] = (army.composition[type] || 0) + count;
  return count;
}

// AI 吞并一块中立割据。领主本人就此出局 —— 玩家磨蹭太久，本来能谈下来的人就没了。
// 这是「世界在动」最直接的体现：地图上的机会窗口会自己关上。
function resolveAIAnnex(s, army, targetId, rng = Math.random) {
  const faction = army.owner;
  const t = s.territories[targetId];
  if (!t || t.owner !== "neutral") return null;
  const attack = aiArmyPower(army) * (.56 + (army.morale || 50) / 420) * (.9 + rng() * .2);
  const defense = t.guard + (t.buildings.walls || 0) * 8 + t.stability * .2;
  army.composition.levy = Math.max(0, (army.composition.levy || 0) - Math.max(1, Math.round((army.composition?.levy || 0) * .06)));
  if (attack <= defense * 1.15) return "repelled";
  const lord = lordAt(s, targetId);
  t.owner = faction;
  t.lordId = null;
  t.stability = 44;
  t.guard = Math.max(16, Math.round(attack * .3));
  t.devastated = 1;
  if (lord && lord.side !== "player") {
    lord.side = "gone";
    lord.captured = false;
    (s.knights || []).forEach(k => { if (k.liegeLordId === lord.id) { k.liegeLordId = null; k.side = "gone"; } });
    log(s, "warn", `${FACTIONS[faction].name}吞并了${TERRITORY_DEFS[targetId].name}，${lord.name}就此除名。他不会再听任何人的条件。`);
  } else {
    log(s, "warn", `${FACTIONS[faction].name}占据了${TERRITORY_DEFS[targetId].name}。`);
  }
  return "captured";
}

// 战斗历史。此前只有 s.lastBattle 存最后一场，敌军打过来更是完全不留记录 ——
// 日志里只有一行「XX攻占YY」，玩家事后无从复盘自己到底被谁打过几次。
// 上限 24 条：够回看一整段战役，又不会把存档撑大。
const BATTLE_LOG_LIMIT = 24;

function recordBattle(s, entry) {
  if (!s) return null;
  s.battleLog ||= [];
  s.battleLog.unshift({ turn: turnOf(s), elapsedMs: s.clock?.elapsedMs || 0, ...entry });
  s.battleLog.length = Math.min(s.battleLog.length, BATTLE_LOG_LIMIT);
  return s.battleLog[0];
}

// now 必须由调用方给出（行军任务的 completedAt）。世界由 clock 驱动，
// 这里若退回 Date.now()，撤离产生的整补任务就会和模拟时间线脱节。
function resolveAIAttack(s, army, targetId, rng = Math.random, originId = army?.locationId, now = Date.now()) {
  const faction = army.owner;
  const t = s.territories[targetId];
  if (t && t.owner === "neutral") return resolveAIAnnex(s, army, targetId, rng);
  if (!t || t.owner !== "player") return null;
  const vulnerableKeep = targetId === "ravenstone" && turnOf(s) > 16 && (t.guard < 30 || s.grain < 24 || s.support < 25);
  const decisiveRaid = faction === "wolf" && targetId === "ravenstone" && turnOf(s) > 12 && (vulnerableKeep || rng() < .12);
  const attack = aiArmyPower(army) * (.56 + (army.morale || 50) / 420) * (difficultyOf(s).enemy * (.9 + rng() * .2)) * (decisiveRaid ? 1.65 : 1);
  const defense = t.guard + (t.buildings.walls || 0) * 8 + (t.buildings.watchtower || 0) * 4 + t.stability * .2 + stationedPower(s, targetId);
  const loss = Math.max(1, Math.round((army.composition?.levy || 0) * .08));
  army.composition.levy = Math.max(0, (army.composition.levy || 0) - loss);
  if (attack > defense * (decisiveRaid ? .92 : 1.1)) {
    const oldHolder = t.fiefHolder;
    if (oldHolder && oldHolder !== "charter") {
      const holder = officer(s, oldHolder);
      if (holder) { holder.fief = null; holder.loyalty = clamp(holder.loyalty - 8); }
    }
    t.owner = faction;
    gainLegitimacy(s, "loseTerritory");
    t.fiefHolder = null;
    t.stability = 42;
    t.guard = Math.max(18, Math.round(attack * .34));
    t.devastated = 2;
    log(s, "bad", `${army.name}攻占${TERRITORY_DEFS[targetId].name}。`);
    recordBattle(s, { dir: "defend", targetId, targetName: TERRITORY_DEFS[targetId].name, outcome: "lost", attacker: FACTIONS[faction]?.name || "敌军" });
    // 先扣伤亡再撤离：applyStationedLosses 按 locationId 找军团，撤走了就找不到。
    // retreatStationedArmies 要在 t.owner 已改判之后调，这样 ownTerritoryIds 拿到的是城破后的名单。
    applyStationedLosses(s, targetId, STATIONED_LOSS_CAPTURED);
    retreatStationedArmies(s, targetId, now);
    if (targetId === "ravenstone") { s.ended = true; s.endingReason = "fallen"; }
    return "captured";
  }
  const grainLoss = Math.min(s.grain, 5 + Math.floor(rng() * 9));
  const goldLoss = Math.min(Math.max(0, s.gold), 3 + Math.floor(rng() * 7));
  s.grain -= grainLoss; s.gold -= goldLoss;
  t.stability = clamp(t.stability - 5);
  t.devastated = Math.max(t.devastated, 1);
  log(s, "warn", `${army.name}袭扰${TERRITORY_DEFS[targetId].name}，抢走${grainLoss}粮食和${goldLoss}金币。`);
  recordBattle(s, {
    dir: "defend", targetId, targetName: TERRITORY_DEFS[targetId].name,
    outcome: "raided", attacker: FACTIONS[army.owner]?.name || "敌军",
    lostGold: goldLoss, lostGrain: grainLoss
  });
  applyStationedLosses(s, targetId, STATIONED_LOSS_REPELLED);
  army.locationId = originId || army.locationId;
  return attack > defense * .92 ? "raided" : "repulsed";
}

function startAIMarch(s, factionId, army, targetId, now = Date.now()) {
  if (!army || army.status !== "idle" || !TERRITORY_DEFS[targetId]) return null;
  // 目标由 aiTargets 按版图边界给出，未必挨着大军当前所在地；和玩家的长征一样，
  // 距离体现在行军时间上，而不是「够不着就不许打」。
  if (!aiTargets(s, factionId).includes(targetId)) return null;
  const job = startJob(s, { type: "MARCH", armyId: army.id, startedAt: now, endAt: now + marchDurationForDistance(s, army.locationId, targetId), queueKey: `march:${army.id}`, payload: { originId: army.locationId, destinationId: targetId, factionId } });
  army.destinationId = targetId;
  army.status = "marching";
  army.jobId = job.id;
  return job;
}

// 每个势力由自己的计时器驱动。原本每季掷一次骰子，现在每 60~90 秒掷一次，
// 因此增长与开战概率都要按「本次间隔占一季的比例」摊薄，否则 AI 会被放大数倍。
const FACTION_TIMER_KEY = { wolf: "aiWolf", river: "aiRiver", crown: "aiCrown" };

function runFactionTurn(s, factionId, rng = Math.random, now = Date.now()) {
  if (!s || s.ended) return null;
  ensureAIFactions(s);
  const def = AI_FACTION_DEFS[factionId];
  const faction = s.factions[factionId];
  const timerKey = FACTION_TIMER_KEY[factionId];
  if (!def || !faction || !timerKey) return null;
  const share = TIMER_DEFS[timerKey].intervalMs / TIME_CONFIG.seasonDurationMs;
  faction.gold += aiSeasonIncome(s, factionId) * share;
  faction.grain += 18 * share;
  faction.knowledge += 2 * share;
  reinforceAIArmy(s, factionId, share, rng);
  const army = faction.armies.find(item => item.status === "idle");
  if (!army || turnOf(s) < 2) return null;
  const targets = aiTargets(s, factionId);
  if (!targets.length) return null;
  // 出兵概率是这套 AI 里最敏感的旋钮：目标改按版图边界取之后，摄政与河望
  // 从「几乎永远没有目标、根本不掷骰」变成每次决策都掷，实际出兵频率翻了几倍。
  // 原值 .23/.1/.16 会把机器人胜率从 38% 压到 17%，这里按 0.7 折回来。
  const base = def.personality === "aggressive" ? .16 : def.personality === "cautious" ? .07 : .11;
  // 先按「打玩家」的概率掷一次；选中中立小领时再按更低的概率掷第二次，
  // 于是蚕食中立地是长期的背景进程，而边境压力仍主要冲着玩家来。
  if (rng() > base * share) return null;
  const targetId = targets[Math.min(targets.length - 1, Math.floor(rng() * targets.length))];
  if (s.territories[targetId]?.owner === "neutral" && rng() > AI_ANNEX_CHANCE_SCALE) return null;
  return startAIMarch(s, factionId, army, targetId, now) ? "marching" : null;
}

// 正统性的涨落集中在这里，配平时只改这一处，也便于排查「谁动了正统性」。
const LEGITIMACY_DELTAS = {
  reclaim: 3,          // 收复一块旧土
  battleWin: 2,        // 会战胜利
  keepPromise: 6,      // 兑现封地承诺
  returnKnight: 2,     // 归还俘虏骑士
  loseTerritory: -3,   // 被反攻丢地
  breakPromise: -8     // 背弃封地承诺
};

function gainLegitimacy(s, reason) {
  const delta = LEGITIMACY_DELTAS[reason];
  if (!s || delta === undefined) return false;
  s.legitimacy = clamp((s.legitimacy || 0) + delta);
  return true;
}

// 危机阈值集中在这里，配平时只改这一处。
const CRISIS_LIMITS = { famineMs: 15 * 60 * 1000, unrestMs: 10 * 60 * 1000 };

function checkDefeat(s) {
  if (s.ended) return true;
  if (!owns(s, "ravenstone")) { s.ended = true; s.endingReason = "fallen"; return true; }
  s.crisis ||= { famineMs: 0, unrestMs: 0 };
  const starved = (s.crisis.famineMs || 0) >= CRISIS_LIMITS.famineMs;
  const revolted = (s.crisis.unrestMs || 0) >= CRISIS_LIMITS.unrestMs;
  if (starved || revolted || (armyTotal(s) <= 0 && s.morale < 10)) {
    s.ended = true;
    s.endingReason = "collapsed";
    return true;
  }
  return false;
}

function decisionView(s, decision) {
  if (decision.type === "world_event") {
    const event = WORLD_EVENTS.find(item => item.id === decision.eventId);
    return event ? scriptedEventView(s, event) : null;
  }
  if (decision.type === "npc_arc") {
    const event = NPC_ARCS.find(item => item.id === decision.eventId);
    return event ? scriptedEventView(s, event, event.officerId) : null;
  }
  if (decision.type === "fief_promise") {
    const lord = officer(s, decision.lordId);
    const fiefId = lord?.promisedFief;
    const d = TERRITORY_DEFS[fiefId];
    if (!lord || !d || !s.territories[fiefId]) return null;
    // 承诺结清后不再重复来讨，两条路都要把 promisedFief 清掉。
    const settle = () => { lord.promisedFief = null; lord.promisedAt = null; };
    const share = techLevel(s, "provincial_offices") ? "约四分之三" : "七成";
    return {
      kicker: "旧账", title: `${lord.name}来讨当初许下的${d.name}`,
      portrait: lord.portrait || "assets/player.webp",
      body: `<p>收下金币换旗的时候，你答应把${esc(d.name)}交给他打理。他今天带着随从来了，站在厅上没有坐下。</p>`
        + `<p>“殿下当时说的话，北境都听见了。”</p>`,
      options: [
        { name: `兑现承诺，把${d.name}封给他`, note: `该地税收降到${share}；王室正统性 +${LEGITIMACY_DELTAS.keepPromise}；他死心塌地`, effect() {
          s.territories[fiefId].fiefHolder = lord.id;
          lord.fief = fiefId;
          lord.loyalty = clamp((lord.loyalty || 0) + 30);
          lord.grievance = clamp((lord.grievance || 0) - 20);
          gainLegitimacy(s, "keepPromise");
          s.style.oath++;
          settle();
          log(s, "good", `${d.name}正式封给${lord.name}。消息传开，北境记住了渡鸦家说话算数。`);
        } },
        { name: "食言，这块地留在自己手里", note: `保住全额税收；王室正统性 ${LEGITIMACY_DELTAS.breakPromise}；他记恨，可能带兵出走`, effect() {
          lord.loyalty = clamp((lord.loyalty || 0) - 30);
          lord.grievance = clamp((lord.grievance || 0) + 45);
          gainLegitimacy(s, "breakPromise");
          s.style.iron++;
          settle();
          log(s, "bad", `${lord.name}空手离开大厅。他没有争辩，只是记下了这一笔。`);
        } }
      ]
    };
  }
  if (decision.type === "lord_capture") {
    const lord = officer(s, decision.lordId);
    const d = TERRITORY_DEFS[decision.territoryId];
    if (!lord) return null;
    const ransom = Math.round((lord.defiance || 0) * 4);
    // 赎金与放逐都让他离场，但离场理由不同，正统性代价也不同。
    const sendAway = () => { lord.captured = false; lord.side = "gone"; lord.liegeLordId = null; };
    return {
      kicker: "战后处置", title: `${lord.name}被押到你面前`, portrait: lord.portrait || "assets/player.webp",
      body: `<p>${esc(d.name)}已经换旗。${esc(lord.name)}——${esc(lord.oldTie || "父亲旧部")}——在城下被俘，等待你的处置。</p><p>他名下的骑士也在等同一个结果。</p>`,
      options: [
        { name: "接受效忠，让他重新宣誓", note: "加入你的领主议会，忠诚 45；王室正统性 +4", effect() {
          submitLord(s, lord.id, "force");
          s.legitimacy = clamp(s.legitimacy + 4); s.style.oath++;
          log(s, "good", `${lord.name}重新向渡鸦家宣誓效忠。`);
        } },
        { name: `收取赎金 ${ransom} 金币`, note: `金币 +${ransom}；王室正统性 −2；该领主离场`, effect() {
          sendAway(); s.gold += ransom; s.legitimacy = clamp(s.legitimacy - 2); s.style.wealth += 2;
          log(s, "info", `${lord.name}付清赎金后离开北境。`);
        } },
        { name: "放逐他，禁止再次返回", note: "军心 +5；王室正统性 −3", effect() {
          sendAway(); s.morale = clamp(s.morale + 5); s.legitimacy = clamp(s.legitimacy - 3); s.style.iron++;
          log(s, "warn", `${lord.name}被逐出北境。`);
        } },
        { name: "处死他，立威于北境", note: "邻近领主抵抗 −5；王室正统性 −10；其骑士永为死敌", effect() {
          lord.captured = false; lord.side = "gone";
          s.legitimacy = clamp(s.legitimacy - 10); s.style.iron += 2;
          (s.knights || []).filter(k => k.liegeLordId === lord.id && k.status !== "gone").forEach(k => {
            k.status = "hostile"; k.side = "gone"; k.captured = false;
          });
          (TERRITORY_DEFS[decision.territoryId].adj || []).forEach(id => {
            const neighbour = lordAt(s, id);
            if (neighbour) neighbour.defiance = Math.max(0, (neighbour.defiance || 0) - 5);
          });
          log(s, "bad", `${lord.name}在${d.name}城前被处死。消息传遍北境。`);
        } }
      ]
    };
  }
  if (decision.type === "first_winter") {
    return {
      kicker: "第一场雪", title: "城门外来了三十户没有粮食的人", portrait: "assets/oswin.webp",
      body: `<p>灰麦原的战乱烧掉了他们的村庄。奥斯温说仓库勉强能接济；伊莎贝尔提醒你，冬天才刚开始。</p><p>大厅里的人都在看你如何对待第一批求助者。</p>`,
      options: [
        { name: "打开粮仓，让他们进城", note: "粮食 −22，民心 +12，王室认可 +2；奥斯温忠诚 +5", disabled: s.grain < 22, effect() { s.grain -= 22; s.support = clamp(s.support + 12); s.legitimacy = clamp(s.legitimacy + 2); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty + 5); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance - 5); s.style.oath += 2; log(s, "good", "渡鸦堡为失去家园的人打开了粮仓。"); } },
        { name: "给他们10袋粮，让他们去南边", note: "粮食 −10，民心 +3；奥斯温不满 +3", disabled: s.grain < 10, effect() { s.grain -= 10; s.support = clamp(s.support + 3); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 3); s.style.wealth++; log(s, "info", "难民拿到十袋麦子，被指向了南方的道路。"); } },
        { name: "关门。城堡先养活自己人", note: "粮食不变，军心 +3，民心 −10；奥斯温忠诚 −7、不满 +12", effect() { s.morale = clamp(s.morale + 3); s.support = clamp(s.support - 10); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty - 7); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 12); s.style.iron += 2; log(s, "bad", "城门保持关闭，难民继续向南。奥斯温的忠诚下降，不满上升。"); } }
      ]
    };
  }
  if (decision.type === "cousin_demand") {
    const edmund = officer(s, "edmund");
    return {
      kicker: "家族暗流", title: "埃德蒙希望独自指挥下一次远征", portrait: "assets/edmund.webp",
      body: `<p>“让我单独领一次兵。”埃德蒙盯着桌上的军旗，“我打得赢，他们自然会闭嘴。”</p><p>已经有几名骑士开始跟随埃德蒙。让他单独领军，会增加他的功劳，也可能让他的野心更大。</p>`,
      options: [
        { name: "同意让他单独领军", note: "埃德蒙忠诚 +8、功劳 +5；王室认可 −3", effect() { edmund.loyalty = clamp(edmund.loyalty + 8); edmund.merit += 5; s.legitimacy = clamp(s.legitimacy - 3); s.style.oath++; log(s, "info", "埃德蒙接过军旗，下一次会议由他汇报商路和军情。"); } },
        { name: "当众拒绝他的请求", note: "王室认可 +4；埃德蒙忠诚 −10、不满 +14", effect() { s.legitimacy = clamp(s.legitimacy + 4); edmund.loyalty = clamp(edmund.loyalty - 10); edmund.grievance = clamp(edmund.grievance + 14); s.style.iron += 2; log(s, "warn", "埃德蒙交还军旗，忠诚下降，不满上升。"); } },
        { name: "让他先去保护商路", note: "金币 +10；埃德蒙忠诚 −3、管理功劳 +3", effect() { s.gold += 10; edmund.loyalty = clamp(edmund.loyalty - 3); edmund.merit += 3; s.style.wealth += 2; log(s, "info", "埃德蒙保护商路，带回10金币并增加3点功劳。"); } }
      ]
    };
  }
  if (decision.type === "royal_tax") {
    return {
      kicker: "王室催税", title: "摄政公爵要你补上父亲欠下的四十枚金币", portrait: "assets/ysabel.webp",
      body: `<p>使者把王室命令放在长桌上。按时缴纳会提高王室认可；拒绝缴税则会明显降低王室认可，但能提高军心和威望。</p>`,
      options: [
        { name: "支付全部40金币", note: "金币 −40，王室认可 +12", disabled: s.gold < 40, effect() { s.gold -= 40; s.legitimacy = clamp(s.legitimacy + 12); s.style.oath++; log(s, "info", "王室税金装箱南下，公爵的使者满意离开。"); } },
        { name: "只付20金币并请求延期", note: "金币 −20，王室认可 +3，威望 −2", disabled: s.gold < 20, effect() { s.gold -= 20; s.legitimacy = clamp(s.legitimacy + 3); s.renown = clamp(s.renown - 2); s.style.wealth += 2; log(s, "warn", "使者收下20金币，并把剩余欠税写入回报。"); } },
        { name: "烧掉命令，拒绝缴税", note: "威望 +8，军心 +6，王室认可 −12", effect() { s.renown = clamp(s.renown + 8); s.morale = clamp(s.morale + 6); s.legitimacy = clamp(s.legitimacy - 12); s.style.iron += 2; log(s, "warn", "使者带着烧毁的封蜡返回王城，渡鸦堡公开拒绝缴税。"); } }
      ]
    };
  }
  if (decision.type === "iron_crown") {
    const crownTechBonus = () => {
      if (techLevel(s, "royal_exchange")) s.renown = clamp(s.renown + 10 * techLevel(s, "royal_exchange"));
      if (techLevel(s, "iron_crown_doctrine")) s.morale = clamp(s.morale + 8 * techLevel(s, "iron_crown_doctrine"));
    };
    const crownTechNote = `${techLevel(s, "royal_exchange") ? `；王家汇兑额外威望 +${10 * techLevel(s, "royal_exchange")}` : ""}${techLevel(s, "iron_crown_doctrine") ? `；铁冠军令军心 +${8 * techLevel(s, "iron_crown_doctrine")}` : ""}`;
    return {
      kicker: "终章 · 铁冠", title: "王冠谷已经落入你手中", portrait: "assets/player.webp",
      body: `<p>王冠谷已经被占领，北境七块领地全部归你统治。家臣把旧王朝的铁冠送进大厅，等待你决定如何完成加冕。</p>`,
      options: [
        { name: "保留各地旧规矩，再戴上铁冠", note: `守信风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.oath++; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}保留各地旧规矩，然后戴上铁冠。`); } },
        { name: "要求所有领主跪下宣誓，再戴上铁冠", note: `强硬风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.iron += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}要求所有领主跪下宣誓，然后戴上铁冠。`); } },
        { name: "先清点国库和税册，再举行加冕", note: `经营风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.wealth += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}先清点国库和税册，随后才举行加冕。`); } }
      ]
    };
  }
  return null;
}

function pumpDecision() {
  if (!S || S.ended || !S.pendingDecisions.length || typeof document === "undefined") {
    $("modalMask")?.classList.add("hidden");
    if (S && !S.battleSession && S.pauseState?.reason === "decision") resumeWorld(S, Date.now());
    return;
  }
  if (pauseWorld(S, "decision")) renderTop();
  const view = decisionView(S, S.pendingDecisions[0]);
  if (!view) { S.pendingDecisions.shift(); saveGame(); pumpDecision(); return; }
  $("modalMask").classList.remove("hidden");
  $("modalKicker").textContent = cleanDisplayText(view.kicker);
  $("modalTitle").textContent = cleanDisplayText(view.title);
  $("modalBody").innerHTML = cleanDisplayText(view.body);
  $("modalPortrait").src = view.portrait;
  $("modalPortrait").alt = view.title;
  $("modalResources").innerHTML = [["金币", Math.round(S.gold)], ["粮食", Math.round(S.grain)], ["军队", Math.round(S.troops)], ["民心", Math.round(S.support)], ["军心", Math.round(S.morale)], ["声望", Math.round(S.renown)]].map(([label, value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("");
  $("modal").scrollTop = 0;
  $("modalOptions").innerHTML = view.options.map((opt, i) => {
    const plus = (opt.note.match(/\+/g) || []).length;
    const minus = (opt.note.match(/−/g) || []).length;
    const tone = plus && !minus ? "gain" : minus && !plus ? "risk" : plus && minus ? "mixed" : "neutral";
    return `<button class="${tone}" data-decision-option="${i}" ${opt.disabled ? "disabled" : ""}><b>${esc(cleanDisplayText(opt.name))}</b><small>${esc(cleanDisplayText(opt.note))}</small></button>`;
  }).join("");
  $("modalOptions").querySelectorAll("[data-decision-option]").forEach(button => button.addEventListener("click", () => {
    const option = view.options[Number(button.dataset.decisionOption)];
    if (!option || option.disabled) return;
    option.effect();
    S.pendingDecisions.shift();
    $("modalMask").classList.add("hidden");
    if (!S.pendingDecisions.length) resumeWorld(S, Date.now());
    saveGame();
    renderAll();
    if (!S.ended) pumpDecision();
  }));
}

function metrics(items) {
  return `<div class="metrics">${items.map(([value, label]) => { const display = typeof value === "number" ? Math.round(value) : value; return `<div class="metric"><b>${esc(display)}</b><span>${esc(label)}</span></div>`; }).join("")}</div>`;
}

function cleanDisplayText(value) {
  return String(value ?? "")
    .replace(/王室认可/g, "声望")
    .replace(/战争疲劳/g, "军心")
    .replace(/人口/g, "居民")
    .replace(/稳定/g, "民心")
    .replace(/功劳/g, "声望")
    .replace(/野心/g, "忠诚")
    .replace(/不满\s*[+]\s*(\d+)/g, "忠诚 −$1")
    .replace(/不满\s*[−-]\s*(\d+)/g, "忠诚 +$1")
    .replace(/不满上升/g, "忠诚下降")
    .replace(/不满下降/g, "忠诚上升")
    .replace(/不满/g, "忠诚");
}

function currentStyle(s) {
  return Object.entries(s.style).sort((a, b) => b[1] - a[1])[0][0];
}

