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
  const baselinePower = compositionPower(composition, targetId, planId, seasonOf(s).id);
  const equipmentBonus = baselinePower > 0 ? unitPower / baselinePower - 1 : 0;
  const counter = counterMultiplier(composition, enemyComposition);
  const fatigue = 1;
  const effectiveMorale = leaderIds.includes("player") ? Math.max(45, s.morale) : s.morale;
  let attack = unitPower * (.62 + command / 190 + force / 330) * (.72 + effectiveMorale / 190) * planMult * fatigue * counter;
  if (leaderIds.includes("player")) attack *= 1.03;
  const knightMultiplier = knightBattleMultiplier(s, selectedKnightIds);
  attack *= knightMultiplier;
  if (leaderIds.includes("bran") && (d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) attack *= 1.08;
  if (leaderIds.includes("aveline") && (d.terrainTags || []).includes("river")) attack *= 1.08;
  // 被动技
  if (planId === "steady" && leadersHaveSkill(s, leaderIds, "steady_line")) attack *= 1.05;
  if (!(d.terrainTags || []).includes("capital") && leadersHaveSkill(s, leaderIds, "cut_supply")) attack *= 1.05;
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
  if (defender?.id === "regent") defense *= 1.06;
  const ratio = attack / Math.max(1, defense);
  let label = "胜负难料";
  if (ratio >= 1.28) label = "明显占优";
  else if (ratio >= 1.08) label = "略占上风";
  else if (ratio < .78) label = "近乎送死";
  else if (ratio < .94) label = "处于下风";
  return { attack, defense, ratio, label, equipmentBonus, planMult, composition, defenderComposition: enemyComposition, unitPower, counter, knightMultiplier, fatigue, effectiveMorale };
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
  const pct = value => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;
  return ` · 装备${pct(est.equipmentBonus || 0)} · 兵种克制${pct(est.counter - 1)} · 作战方式${pct(est.planMult - 1)}`;
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
  const defaultLeaderIds = armies.flatMap(item => armyLeaderIds(s, item));
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
    contribution: battleBreakdownText(est).replace(/^ · /, ""),
    supply: draft.supplyAlreadyPaid ? (draft.suppliedGrain ?? supply) : supply,
    stage: 0,
    momentum: clamp((est.ratio - 1) * 42, -42, 42),
    playerLoss: 0,
    enemyLoss: 0,
    history: [],
    flags: { demanded: false, pushed: false, aggression: 0 },
    seedMark: Math.round(rng() * 1e9),
    skillsUsed: [], deeds: {}, goodStages: 0, duelDone: false, enemySkillDone: false
  };
  // 先锋：开战先占一点优势
  if (leadersHaveSkill(s, s.battleSession.leaderIds, "vanguard")) s.battleSession.momentum = clamp(s.battleSession.momentum + 6, -100, 100);
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
    const survivingKnights = (session.composition?.knights || 0) - (session.lossesByType?.knights || 0);
    const openGround = (TERRITORY_DEFS[session.targetId]?.terrainTags || []).includes("plains");
    if (session.flags.suppressed && survivingKnights >= 2 && openGround) options.push({
      id: "breakthrough", name: "骑兵突破被压制的侧翼", by: "弓骑协同", combo: true,
      desc: "上一轮弓手压住了敌阵，平原上的预备骑兵可以切入；比守住优势更冒险，但更有机会决胜。",
      mult: 1.32, casualty: 1.05, pushed: true
    });
    options.push({ id: "press", name: "派出剩余部队强攻", by: "通用命令", desc: "争取在天黑前结束战斗，但疲惫的部队会承受更多伤亡。", mult: 1.08, casualty: 1.48, pushed: true });
    options.push({ id: "hold", name: "停止追击，守住优势", by: "通用命令", desc: "不追求大胜，优先减少伤亡。", mult: 1.01, casualty: .72 });
    if (session.momentum > 10 && charm >= 64) options.push({ id: "surrender", name: "让号手劝他们放下武器", by: ids.includes("edmund") ? "埃德蒙" : "随军使者", desc: "仅在我军占据优势时可能奏效。", mult: .96 + charm / 1900, casualty: .38, surrender: true });
    options.push({ id: "retreat", name: "下令撤退", by: ids.includes("ysabel") ? "伊莎贝尔" : "通用命令", desc: "保住剩余士兵，本场无法占领目标。", retreat: true });
  }
  // 带兵者的军令技：本阶段可用、本场没用过、条件满足的，各出一张卡
  const tags = TERRITORY_DEFS[session.targetId]?.terrainTags || [];
  const knightsLeft = (session.composition?.knights || 0) - (session.lossesByType?.knights || 0);
  ids.forEach(id => {
    const person = commanderById(s, id);
    personSkills(s, id).forEach(skillId => {
      const sk = SKILLS[skillId];
      if (sk.type !== "order" || sk.stage !== session.stage) return;
      if ((session.skillsUsed || []).includes(`${skillId}:${id}`)) return;
      if (sk.terrain && !sk.terrain.some(tag => tags.includes(tag))) return;
      if (sk.needKnights && knightsLeft < sk.needKnights) return;
      if (sk.holdLine && session.momentum >= 8) return;
      options.unshift({ id: `skill:${skillId}:${id}`, skillId, leaderId: id, skill: true, name: sk.name, by: person?.name || "将领", portrait: person?.portrait || null,
        desc: sk.desc, mult: sk.mult, casualty: sk.casualty, pushed: !!sk.pushed });
    });
  });
  // 单挑：交锋阶段，守城的是有名有姓的人，就能叫阵。每场一次，不占这一阶段的军令。
  const defender = defenderLeader(s, session.targetId);
  if (session.stage === 1 && defender && !session.duelDone) {
    const champ = duelChampion(s, ids);
    if (champ) options.unshift({ id: "duel", duel: true, name: `${champ.name}出阵叫阵`, by: champ.name, portrait: champ.portrait || null,
      desc: `单挑${defender.name}（武力${personStat(defender, "force")}）。赢了优势大涨，输了${champ.name}负伤一季。不占本阶段军令。` });
  }
  return options;
}

function duelChampion(s, ids) {
  return ids.map(id => commanderById(s, id)).filter(Boolean).sort((a, b) => personStat(b, "force") - personStat(a, "force"))[0] || null;
}

function resolveDuel(s, session, rng) {
  const champ = duelChampion(s, session.leaderIds);
  const defender = defenderLeader(s, session.targetId);
  if (!champ || !defender) return null;
  session.duelDone = true;
  const chance = Math.max(.15, Math.min(.85, .5 + (personStat(champ, "force") - personStat(defender, "force")) / 60));
  const win = rng() < chance;
  const fill = text => text.replaceAll("{a}", champ.name).replaceAll("{d}", defender.name);
  const pick = (pool) => pool[Math.floor(rng() * pool.length) % pool.length];
  const delta = win ? 12 : -10;
  session.momentum = clamp(session.momentum + delta, -100, 100);
  if (win) {
    session.deeds[champ.id] = (session.deeds[champ.id] || 0) + 3;
    session.flags.duelWon = champ.id;
  } else if (knightById(s, champ.id)) champ.injuredUntil = turnOf(s) + 1;
  else if (champ.id !== "player") champ.injured = 1;
  session.history.push({ name: "单挑", title: `${champ.name} 对 ${defender.name}`, text: `${fill(pick(DUEL_LINES.challenge))}${fill(pick(DUEL_LINES[win ? "win" : "lose"]))}`, duel: true });
  saveGame();
  return { ended: false, session, duel: win };
}

// 敌将出手：守城的领主带着自己的专属技能，每场在对应阶段发动一次
function applyEnemySkill(s, session, history) {
  if (session.enemySkillDone) return;
  const defender = defenderLeader(s, session.targetId);
  if (!defender) return;
  const sig = SIGNATURE_SKILLS[defender.id];
  const def = ENEMY_SKILL_TEXT[sig] || ENEMY_SKILL_TEXT._;
  if (def.stage !== session.stage) return;
  const tags = TERRITORY_DEFS[session.targetId]?.terrainTags || [];
  if (def.terrain && !def.terrain.some(tag => tags.includes(tag))) return;
  session.enemySkillDone = true;
  session.momentum = clamp(session.momentum - def.momentum, -100, 100);
  history.text += ` ${def.text.replaceAll("{name}", defender.name)}${sig && SKILLS[sig] ? `（${defender.name}·${SKILLS[sig].name}）` : ""}`;
}

function battleNarrative(session, choice, delta, loss, enemyLoss) {
  const target = TERRITORY_DEFS[session.targetId];
  const stageNames = ["接近敌军", "正面交战", "最后阶段"];
  const direction = delta >= 8 ? "这一阵是我们的" : delta <= -8 ? "这一阵吃了亏" : "谁也没占到便宜";
  const special = choice.surrender ? "号手吹了三遍。对面有人扔了矛，有人没扔。" : choice.id === "scout" ? "斥候摸到一条没人守的小路，队伍从林子里绕了过去。" : choice.id === "charge" ? "骑士撞进了盾墙。木头和铁的声音，然后是人的。" : choice.id === "volley" ? "弓手三轮齐射，对面的前排开始往后挪。" : choice.id === "feint" ? "他们追进了缺口，然后发现缺口合上了。" : choice.id === "hold" ? "停下。守住脚下这块地。" : choice.id === "ridge" ? "先占了高处。对面得仰着头打。" : choice.id === "shield" ? "盾墙立住了，一步没退。" : choice.id === "forced" ? "不等了，直接压上去。" : choice.id === "press" ? "趁他们乱，再往前顶。" : "队伍照命令往前走。";
  return { name: stageNames[session.stage], title: `${choice.by}：${choice.name}`, text: `${special}${direction}。这一阵我方倒下${loss}人，对面大约${enemyLoss}人。` };
}

function battleChoiceHint(choice) {
  const hints = { breakthrough: "弓骑协同 · 强突破 · 中等伤亡", ridge: "稳住先手 · 伤亡较低", scout: "谋略推进 · 首轮损失较低", forced: "快速推进 · 伤亡风险高", shield: "稳住战线 · 伤亡低", volley: "弓手压制 · 需要弓手", charge: "骑士冲锋 · 伤亡风险高", feint: "制造缺口 · 依赖谋略", press: "追击推进 · 伤亡风险高", hold: "守住优势 · 可能错失战果", surrender: "劝降机会 · 只在占优时出现", retreat: "保存兵力 · 放弃本次攻城" };
  return hints[choice.id] || "改变当前战况";
}

function battleSituation(session) {
  const stage = ["接敌", "交锋", "决胜"][session.stage] || "决胜";
  const momentum = Math.round(session.momentum);
  const state = momentum >= 12 ? "我方压着打" : momentum <= -12 ? "对面压过来了" : "还在拉锯";
  const terrain = TERRITORY_DEFS[session.targetId]?.terrain || "战场";
  return { stage, title: `${stage}阶段 · ${state}`, text: `${terrain}。下一道军令决定推得多快、死多少人。` };
}

function applyBattleChoice(s, choiceId, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const choice = stageOptions(s, session).find(o => o.id === choiceId);
  if (!choice) return null;
  if (choice.retreat) return finishBattle(s, "retreat", rng);
  if (choice.duel) return resolveDuel(s, session, rng);
  let skillNote = "";
  let enemyLossMult = 1;
  if (choice.skill) {
    const sk = SKILLS[choice.skillId];
    session.skillsUsed = [...(session.skillsUsed || []), `${choice.skillId}:${choice.leaderId}`];
    session.deeds[choice.leaderId] = (session.deeds[choice.leaderId] || 0) + 2;
    if (sk.roll) {
      const person = commanderById(s, choice.leaderId);
      const defender = defenderLeader(s, session.targetId);
      const mine = personStat(person, sk.roll.stat);
      const theirs = sk.roll.vsDefender ? (defender ? personStat(defender, "force") : 55) : 50;
      const chance = Math.max(.15, Math.min(.88, sk.roll.base + (mine - theirs) / sk.roll.div));
      const ok = rng() < chance;
      choice.mult = ok ? sk.mult : sk.failMult;
      choice.casualty = ok ? sk.casualty : sk.failCasualty;
      skillNote = ok ? `${sk.name}成了。` : `${sk.name}没成，反倒吃了亏。`;
      if (!ok) session.deeds[choice.leaderId] -= 2;
    }
    if (sk.enemyLossMult && !(sk.roll && skillNote.includes("没成"))) enemyLossMult = sk.enemyLossMult;
    if (sk.resetAggression) session.flags.aggression = 0;
    if (sk.holdLine) session.flags.holdLine = true;
  }
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
  const counterBlow = (choice.pushed && priorAggression > 0 ? priorAggression * (6 + rng() * 8) : 0) * (leadersHaveSkill(s, session.leaderIds, "guard_banner") ? .5 : 1);
  delta -= counterBlow;
  session.momentum = clamp(session.momentum + delta, -100, 100);
  const remaining = Math.max(1, session.troops - session.playerLoss);
  const oddsPenalty = Math.min(.1, Math.max(0, .9 / Math.max(.15, session.ratio) - 1) * .035);
  let loss = Math.max(1, Math.round(remaining * (.03 + Math.max(.007, 1 / Math.max(.2, session.ratio) * .014) + oddsPenalty) * choice.casualty * casualtySurge * (.78 + rng() * .45)));
  if (session.leaderIds.includes("ysabel")) loss = Math.max(1, Math.round(loss * .9));
  if (leadersHaveSkill(s, session.leaderIds, "iron_wall")) loss = Math.max(1, Math.round(loss * .9));
  if (session.stage === 0 && leadersHaveSkill(s, session.leaderIds, "scouting")) loss = Math.max(1, Math.round(loss * .8));
  const defender = s.territories[session.targetId].guard;
  const enemyLoss = Math.max(1, Math.round(defender * .035 * effectiveMult * enemyLossMult * (.78 + rng() * .5)));
  session.playerLoss = Math.min(session.troops - 1, session.playerLoss + loss);
  session.lossesByType = allocateLosses(session.composition, session.playerLoss);
  session.enemyLoss = Math.min(defender, session.enemyLoss + enemyLoss);
  if (choice.id === "volley") session.flags.suppressed = delta > 0;
  if (choice.combo) session.flags.breakthrough = true;
  if (delta >= 8) session.goodStages = (session.goodStages || 0) + 1;
  const history = battleNarrative(session, choice, delta, loss, enemyLoss);
  if (skillNote) history.text = `${skillNote}${history.text}`;
  if (choice.skill) { history.skill = SKILLS[choice.skillId].name; history.skillId = choice.skillId; }
  if (choice.id === "volley") history.text += delta > 0 ? " 弓手压制成功；若平原上仍有至少2名披甲骑士，决胜阶段可发起侧翼突破。" : " 敌阵未被压制，尚不能组织弓骑协同。";
  if (choice.combo) history.text += " 前一轮弓手制造的缺口让骑兵切入敌阵，弓骑协同已生效。";
  if (session.stage === 0 && session.contribution) history.text += ` 战前准备：${session.contribution}。`;
  if (counterBlow > 0) history.text += ` 连着强攻，对面看出来了，早就等着——优势掉了${Math.round(counterBlow)}点。`;
  // 带兵的人开口。按这一阶段的走势分三档，谁带兵谁说。
  const speakerId = choice.skill ? choice.leaderId : (session.commanderId || session.leaderIds?.[0] || "player");
  const tier = delta >= 8 ? "good" : delta <= -8 ? "bad" : "even";
  const skillLines = choice.skill ? SKILLS[choice.skillId].lines : null;
  const quip = skillLines?.length ? skillLines[Math.floor(rng() * skillLines.length) % skillLines.length] : commanderBattleLine(s, speakerId, tier);
  if (quip) { history.quip = quip; history.speaker = commanderById(s, speakerId)?.name || "指挥官"; }
  applyEnemySkill(s, session, history);
  session.history.push(history);
  session.stage++;
  if (session.stage >= 3) {
    const surrenderWin = session.flags.demanded && session.momentum > 4;
    const won = session.momentum >= 8 || surrenderWin;
    // 死守不退：打不赢也只算撤回
    return finishBattle(s, won ? "win" : session.flags.holdLine ? "retreat" : "loss", rng);
  }
  saveGame();
  return { ended: false, session };
}

function markRecovered(s, id) {
  s.recoveryRewards ||= Object.fromEntries([...new Set([
    ...Object.keys(TERRITORY_DEFS).filter(tid => TERRITORY_DEFS[tid].owner === "player"),
    ...ownTerritoryIds(s), ...(s.victories || [])
  ])].map(tid => [tid, true]));
  const first = !s.recoveryRewards[id];
  s.recoveryRewards[id] = true;
  return first;
}

function conquestReward(s, id) {
  const d = TERRITORY_DEFS[id];
  if (s.recoveryRewards?.[id] || d.owner === "player" || (s.victories || []).includes(id) || s.territories[id].owner === "player") return { gold: 0, grain: 0, volunteers: 0, label: "已收复过，无首次军资" };
  if (d.type === "castle") return { gold: 30, grain: 16, volunteers: 3, label: "城堡军资" };
  if (d.type === "fort") return { gold: 16, grain: 12, volunteers: 5, label: "要塞守备归附" };
  if (d.grain >= 25) return { gold: 10, grain: 30, volunteers: 2, label: "粮镇开仓" };
  return { gold: 24, grain: 12, volunteers: 2, label: "商镇军资" };
}

function recoverySupport(s, outcome = "win") {
  const ids = ownTerritoryIds(s);
  const hospital = Math.max(0, ...ids.map(id => s.territories[id].buildings.temple || 0));
  const logistics = Math.max(0, ...ids.map(id => (s.territories[id].buildings.roads || 0) + (s.territories[id].buildings.workshop || 0)));
  return { woundRate: (outcome === "win" ? .4 : .2) + hospital * .02,
    durationMs: (outcome === "win" ? 90000 : 120000) - Math.min(30000, logistics * 3000) - treasureBonus(s, "recovery") * 1000, hospital, logistics };
}

function finishBattle(s, outcome, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const support = recoverySupport(s, outcome);
  if (outcome !== "win" && leadersHaveSkill(s, session.leaderIds, "retreat_count")) support.woundRate += .1;
  const reward = outcome === "win" ? conquestReward(s, session.targetId) : null;
  const economyBefore = forecast(s);
  const before = { gold: s.gold, grain: s.grain, renown: s.renown, legitimacy: s.legitimacy, morale: s.morale };
  const targetId = session.targetId;
  const targetName = TERRITORY_DEFS[targetId].name;
  const lossesByType = session.lossesByType || allocateLosses(session.composition || selectedComposition(s, session.troops), session.playerLoss);
  const engagedArmies = (session.armyIds || [session.armyId || "army_1"]).map(id => armyEntity(s, id)).filter(Boolean);
  const engagedArmy = engagedArmies[0] || null;
  const woundedByType = allocateLosses(lossesByType, Math.floor(session.playerLoss * support.woundRate));
  const wounded = compositionTotal(woundedByType);
  const dead = session.playerLoss - wounded;
  Object.keys(UNIT_DEFS).forEach(type => {
    let woundLeft = woundedByType[type] || 0;
    let left = Math.max(0, lossesByType[type] || 0);
    engagedArmies.forEach(army => {
      if (left <= 0) return;
      const take = Math.min(left, army.composition[type] || 0);
      army.composition[type] = Math.max(0, (army.composition[type] || 0) - take);
      army.wounded ||= emptyComposition();
      const rescued = Math.min(take, woundLeft);
      army.wounded[type] = (army.wounded[type] || 0) + rescued;
      woundLeft -= rescued;
      left -= take;
    });
  });
  syncTroops(s);
  s.casualties += dead;
  s.warWeariness = 0;
  const leaders = session.leaderIds.map(id => commanderById(s, id)).filter(Boolean);
  // 领主不再进入受伤计时；战后只结算兵力、军心与领地归属。
  const injured = [];
  let persistentEnemyLoss = 0;
  let garrisoned = 0;
  let delayedCoronation = false;
  const captives = [];
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
    const firstRecovery = markRecovered(s, targetId);
    if (firstRecovery) grantTreasureFor(s, "capture", targetId);
    if (firstRecovery) {
      s.gold += reward.gold;
      s.grain += reward.grain;
      if (engagedArmy) engagedArmy.composition.levy = (engagedArmy.composition.levy || 0) + reward.volunteers;
      log(s, "good", `${reward.label}：获得${reward.gold}金币、${reward.grain}粮食，${reward.volunteers}名长矛兵加入出征军团。`);
    }
    t.owner = "player";
    delayedCoronation = delayCoronation(s, targetId);
    t.stability = 45;
    t.guard = Math.max(10, 8 + garrisoned);
    t.devastated = 2;
    t.fiefHolder = null;
    s.wins++;
    (s.victories ||= []).push(targetId);
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
        captives.push(fallenLord.name);
        s.pendingDecisions.push({ type: "lord_capture", lordId: fallenLord.id, territoryId: targetId });
        log(s, "info", `${fallenLord.name}没城了。在${targetName}城下被按住的时候还在骂。`);
      } else {
        log(s, "warn", `${fallenLord.name}连夜退去了${TERRITORY_DEFS[lordHoldings(s, fallenLord.id)[0]].name}。他手里还有${stillHolds}座城。`);
      }
      // 该领主名下的骑士按 45% 被俘，其余战死
      (s.knights || []).filter(k => k.liegeLordId === fallenLord.id && k.status === "available").forEach(knight => {
        if (rng() < (leadersHaveSkill(s, session.leaderIds, "pursue") ? .65 : .45)) { knight.status = "captured"; knight.captured = true; captives.push(knight.name); log(s, "info", `${knight.name}在${targetName}城下被俘，马死了，人没死。`); }
        else { knight.status = "gone"; knight.side = "gone"; knight.liegeLordId = null; }
      });
    }
    t.reclaimedAt = s.clock?.elapsedMs ?? 0;
    pushNotice({ level: "major", kind: "capture", title: `收复${targetName}`, text: `旗子换过来了。留${garrisoned}人守城。`, tab: "map", territoryId: targetId });
    log(s, "good", `${targetName}是你的了。这一仗阵亡${dead}人、救回${wounded}名伤兵，对面大约${session.enemyLoss}个。留${garrisoned}人守城。`);
  } else if (outcome === "retreat") {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - (session.leaderIds.includes("ysabel") ? 2 : 6));
    s.renown = clamp(s.renown - 2);
    if (session.flags.pushed && session.momentum > 10 && session.leaderIds.includes("renard")) officer(s, "renard").grievance = clamp(officer(s, "renard").grievance + 8);
    log(s, "warn", `从${targetName}撤了回来，阵亡${dead}人，救回${wounded}名伤兵。对面也少了${persistentEnemyLoss}个守军，他们会慢慢补。`);
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
    log(s, "bad", `${targetName}没打下来。阵亡${dead}人、救回${wounded}名伤兵，跑的时候丢了${lostGold}金和${lostGrain}粮。对面守军少了${persistentEnemyLoss}个，他们会慢慢补。`);
  }
  const resumedAt = worldNow();
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
    startArmyRecovery(s, engagedArmy, support.durationMs, recoveryAt);
  });
  syncTroops(s);
  const gains = Object.fromEntries(Object.keys(before).map(key => [key, s[key] - before[key]]));
  const output = outcome === "win" ? territoryOutput(s, targetId) : null;
  const strategic = outcome === "win" ? [
    TERRITORY_DEFS[targetId].type === "castle" ? "区域核心已控制，同区自有领地产出获得加成" : "",
    TERRITORY_DEFS[targetId].type === "fort" ? "相邻自有领地守军上限提高" : "",
    delayedCoronation ? "摄政加冕推迟20分钟" : "",
    targetId === CROWN_GATE_HOLDING ? "通往王冠谷的战略门户已打开" : ""
  ].filter(Boolean) : [];
  // 带兵者的经验与头功
  const deeds = session.deeds || {};
  const xp = session.leaderIds.map(id => {
    const used = (session.skillsUsed || []).filter(key => key.endsWith(`:${id}`)).length;
    const gain = BATTLE_XP.march + (session.goodStages || 0) * BATTLE_XP.goodStage + (outcome === "win" ? BATTLE_XP.win : BATTLE_XP.loss)
      + used * BATTLE_XP.skill + (session.flags.duelWon === id ? BATTLE_XP.duel : 0);
    const person = commanderById(s, id);
    const before = person ? (ensureProgress(person), person.lv) : 0;
    gainBattleXp(s, id, gain);
    return { id, name: person?.name || "将领", gain, lv: person?.lv || 0, up: (person?.lv || 0) > before };
  });
  const mvpId = session.leaderIds.slice().sort((a, b) => (deeds[b] || 0) - (deeds[a] || 0))[0];
  const mvp = mvpId && (deeds[mvpId] || 0) > 0 ? { name: commanderById(s, mvpId)?.name, why: session.flags.duelWon === mvpId ? "阵前单挑得胜" : "军令得力" } : null;
  // 战报末尾让一个人开口：赢了且俘到守将，听守将的；否则听我方带兵的人。
  const capturedLord = outcome === "win" ? officer(s, (s.pendingDecisions.find(d => d.type === "lord_capture" && d.territoryId === targetId) || {}).lordId) : null;
  const voiceLeader = leaders.find(o => o.id !== "player" && LORD_LINES[o.id]?.battle) || leaders[0];
  const voicePool = voiceLeader && LORD_LINES[voiceLeader.id]?.battle?.[outcome === "win" ? "good" : "bad"];
  const voice = capturedLord && lordLine(s, capturedLord.id, "captured")
    ? { name: capturedLord.name, line: lordLine(s, capturedLord.id, "captured"), enemy: true }
    : voicePool?.length ? { name: voiceLeader.name, line: voicePool[turnOf(s) % voicePool.length] } : null;
  const report = { captives, voice, xp, mvp, skillsUsed: (session.skillsUsed || []).map(key => SKILLS[key.split(":")[0]]?.name).filter(Boolean), economyBefore, economyAfter: forecast(s), dead, wounded, woundedByType, reward, gains, output, strategic, recoveryMs: support.durationMs,
    contribution: session.contribution || "", supply: session.supply || 0, targetId, targetName, outcome, losses: session.playerLoss, lossesByType, composition: clone(session.composition), enemyLoss: session.enemyLoss, persistentEnemyLoss, garrisoned, lostGold, lostGrain, history: clone(session.history), momentum: session.momentum, injured };
  s.lastBattle = report;
  recordBattle(s, {
    dir: "attack", targetId, targetName, outcome,
    ourLoss: session.playerLoss, theirLoss: session.enemyLoss
  });
  s.battleSession = null;
  s.pendingDecisions.unshift({ type: "battle_result", report: clone(report) });
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
function retreatStationedArmies(s, territoryId, now = worldNow()) {
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
    log(s, "warn", `${FACTIONS[faction].name}吞了${TERRITORY_DEFS[targetId].name}。${lord.name}没了，以后谁的条件他都听不到了。`);
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
// 这里若退回 worldNow()，撤离产生的整补任务就会和模拟时间线脱节。
function resolveAIAttack(s, army, targetId, rng = Math.random, originId = army?.locationId, now = worldNow()) {
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
    log(s, "bad", `${TERRITORY_DEFS[targetId].name}丢了。${army.name}进了城。`);
    retainerQuip(s, "cityLost");
    pushNotice({ level: "bad", kind: "lost", title: `${TERRITORY_DEFS[targetId].name}失守`, text: `${army.name}进了城。`, tab: "map", territoryId: targetId });
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
  log(s, "warn", `${army.name}抢了${TERRITORY_DEFS[targetId].name}一把：${grainLoss}粮、${goldLoss}金，人没进城。`);
  pushNotice({ level: "bad", kind: "raided", title: `${TERRITORY_DEFS[targetId].name}遭劫`, text: `被抢走${grainLoss}粮、${goldLoss}金。城守住了。`, tab: "map", territoryId: targetId });
  recordBattle(s, {
    dir: "defend", targetId, targetName: TERRITORY_DEFS[targetId].name,
    outcome: "raided", attacker: FACTIONS[army.owner]?.name || "敌军",
    lostGold: goldLoss, lostGrain: grainLoss
  });
  applyStationedLosses(s, targetId, STATIONED_LOSS_REPELLED);
  army.locationId = originId || army.locationId;
  return attack > defense * .92 ? "raided" : "repulsed";
}

// 来袭预警。敌军行军是一个 MARCH 任务，所以「谁正在往哪打」完全能从任务队列
// 派生出来，不必另存状态。看不看得见分两档：
//   目标或它相邻的自有领地有烽火台 —— 从敌军出发那一刻就看见，整段行军时间都能调兵；
//   没有烽火台 —— 只在最后 THREAT_LATE_WINDOW_MS 看见，基本来不及。
// 烽火台的描述早就写着「提前发现敌军反攻」，现在它终于是真的。
const THREAT_LATE_WINDOW_MS = 15 * 1000;

function beaconCovers(s, targetId) {
  const t = s.territories[targetId];
  if (!t || t.owner !== "player") return false;
  if ((t.buildings?.watchtower || 0) > 0) return true;
  return (TERRITORY_DEFS[targetId]?.adj || []).some(nb => owns(s, nb) && (s.territories[nb]?.buildings?.watchtower || 0) > 0);
}

function incomingThreats(s, now = worldNow()) {
  if (!s?.jobs) return [];
  return s.jobs.filter(job => job.status === "running" && job.type === "MARCH" && job.payload?.factionId && owns(s, job.payload.destinationId)).map(job => {
    const faction = s.factions?.[job.payload.factionId];
    const army = faction?.armies?.find(a => a.id === job.armyId);
    const remainingMs = Math.max(0, job.endAt - now);
    const beacon = beaconCovers(s, job.payload.destinationId);
    return {
      jobId: job.id, factionId: job.payload.factionId, factionName: FACTIONS[job.payload.factionId]?.name || "敌军",
      armyName: army?.name || "敌军", troops: army ? compositionTotal(army.composition) : 0,
      targetId: job.payload.destinationId, targetName: TERRITORY_DEFS[job.payload.destinationId]?.name || "",
      remainingMs, beacon, visible: beacon || remainingMs <= THREAT_LATE_WINDOW_MS
    };
  }).filter(threat => threat.visible).sort((a, b) => a.remainingMs - b.remainingMs);
}

function startAIMarch(s, factionId, army, targetId, now = worldNow()) {
  if (!army || army.status !== "idle" || !TERRITORY_DEFS[targetId]) return null;
  // 目标由 aiTargets 按版图边界给出，未必挨着大军当前所在地；和玩家的长征一样，
  // 距离体现在行军时间上，而不是「够不着就不许打」。
  if (!aiTargets(s, factionId).includes(targetId)) return null;
  const durationMs = marchDurationForDistance(s, army.locationId, targetId);
  const job = startJob(s, { type: "MARCH", armyId: army.id, startedAt: now, endAt: now + durationMs, queueKey: `march:${army.id}`, payload: { originId: army.locationId, destinationId: targetId, factionId } });
  army.destinationId = targetId;
  army.status = "marching";
  army.jobId = job.id;
  if (owns(s, targetId) && beaconCovers(s, targetId)) {
    log(s, "warn", `烽火台亮了。${FACTIONS[factionId]?.name || "敌军"}的${army.name}（${compositionTotal(army.composition)}人）正朝${TERRITORY_DEFS[targetId].name}来，${formatDuration(durationMs)}后到。`);
  }
  return job;
}

// 每个势力由自己的计时器驱动。原本每季掷一次骰子，现在每 60~90 秒掷一次，
// 因此增长与开战概率都要按「本次间隔占一季的比例」摊薄，否则 AI 会被放大数倍。
const FACTION_TIMER_KEY = { wolf: "aiWolf", river: "aiRiver", crown: "aiCrown" };

function runFactionTurn(s, factionId, rng = Math.random, now = worldNow()) {
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
  if (decision.type === "battle_result") return {
    kicker: "战役结算", title: decision.report.outcome === "win" ? `${decision.report.targetName}，渡鸦旗再度升起` : "收拢军队，再作打算",
    portrait: "assets/player.webp", body: battleSettlementHtml(decision.report),
    options: [
      { name: "收下战报，安排下一步", note: "收益已入账；伤兵将在军团整补完成后自动归队", effect() {} },
      { name: "查看领地经营", note: "前往发展页安排补给与建设；其余战后处置仍会继续", effect() { s.tab = "domain"; } }
    ]
  };
  if (decision.type === "skill_pick") {
    const person = commanderById(s, decision.personId);
    if (!person) return null;
    ensureProgress(person);
    const choices = (decision.choices || []).filter(id => SKILLS[id] && !person.skills.includes(id));
    if (!choices.length) return null;
    return {
      kicker: `${person.name} · ${decision.level}级`, title: "学哪一手？", portrait: person.portrait || "assets/battle-plains.webp",
      body: `<p>${person.name}升到了${decision.level}级。${COMMANDER_CLASSES[person.cls].name}这条路上，眼下有两样可以学。</p>`,
      options: choices.map(id => ({ name: `${SKILLS[id].name}（${SKILLS[id].type === "order" ? "军令" : "被动"}）`, note: SKILLS[id].desc, effect() {
        person.skills.push(id);
        log(s, "good", `${person.name}学会了${SKILLS[id].name}。`);
      } }))
    };
  }
  if (decision.type === "retainer_ask") {
    const o = officer(s, decision.officerId);
    if (!o || o.side !== "player" || o.fief) return null;
    const lands = fiefCandidates(s).slice(0, 2);
    const purse = Math.max(15, Math.round((o.merit || 0) * 3));
    const gift = ownedTreasures(s)[0];
    return {
      kicker: "家臣请赏", title: `${o.name}站在厅上，没坐`, portrait: o.portrait || "assets/oswin.webp",
      body: `<p>“${retainerLine(o.id, "ask")}”</p>`,
      options: [
        ...lands.map(id => ({ name: `把${TERRITORY_DEFS[id].name}封给他`, note: `该地税收他拿三成，产出看他的治理（${o.stats?.govern ?? "?"}）；忠诚 +15，那口气消了`, effect() { grantFief(s, o.id, id); } })),
        { name: `赏${purse}金`, note: `金币 −${purse}；那口气消一半`, disabled: s.gold < purse, effect() {
          s.gold -= purse; o.grievance = clamp((o.grievance || 0) - 20); o.merit = Math.max(0, (o.merit || 0) - RETAINER_ASK_MERIT);
          log(s, "info", `${o.name}领了${purse}金，没说什么。`);
        } },
        ...(gift ? [{ name: `把宝库里的${gift.name}赏给他`, note: `${TREASURE_KINDS[gift.kind].label(gift.value)}随之没了；忠诚 +10，那口气消了`, effect() {
          s.treasures[gift.id].given = o.id; o.loyalty = clamp(o.loyalty + 10); o.grievance = 0; o.merit = Math.max(0, (o.merit || 0) - RETAINER_ASK_MERIT);
          log(s, "good", `${gift.name}赏给了${o.name}。${o.name}拿在手里看了很久。`);
        } }] : []),
        { name: "打发他回去", note: "他会记着", effect() {
          o.grievance = clamp((o.grievance || 0) + 12);
          log(s, "warn", `${o.name}被打发走了。${o.name}：“${retainerLine(o.id, "dismiss")}”`);
        } }
      ]
    };
  }
  if (decision.type === "tourney_invite") return tourneyInviteView(s, decision);
  if (decision.type === "tourney_round") return tourneyRoundView(s, decision);
  if (decision.type === "tourney_end") return tourneyEndView(s, decision);
  if (decision.type === "title_up") {
    const rank = TITLE_RANKS[decision.rank];
    if (!rank) return null;
    const bits = [`行政开支 −${Math.round(rank.adminRelief * 100)}%`, rank.legitimacy && `正统性 +${rank.legitimacy}`, rank.renown && `威望 +${rank.renown}`].filter(Boolean).join(" · ");
    return {
      kicker: `晋爵 · ${rank.name}`, title: rank.title, portrait: "assets/player.webp",
      body: rank.body.map(p => `<p>${p}</p>`).join(""),
      options: [{ name: rank.option, note: bits, effect() {
        if (rank.legitimacy) s.legitimacy = clamp((s.legitimacy || 0) + rank.legitimacy);
        if (rank.renown) s.renown = clamp(s.renown + rank.renown);
        log(s, "good", `${s.playerName}受封${rank.name}。`);
      } }]
    };
  }
  if (decision.type === "chapter_done") {
    const reward = CHAPTER_REWARDS[decision.chapterId];
    const chapter = GOAL_CHAPTERS.find(ch => ch.id === decision.chapterId);
    if (!reward || !chapter) return null;
    return {
      kicker: `${chapter.name} · 完成`, title: reward.title, portrait: "assets/oswin.webp",
      body: reward.body.map(p => `<p>${p}</p>`).join(""),
      options: [{ name: reward.option, note: reward.note, effect() {
        if (reward.gold) s.gold += reward.gold;
        if (reward.grain) s.grain += reward.grain;
        if (reward.morale) s.morale = clamp(s.morale + reward.morale);
        if (reward.legitimacy) s.legitimacy = clamp((s.legitimacy || 0) + reward.legitimacy);
        if (reward.levy) {
          const main = armyEntity(s, "army_1");
          if (main) { main.composition.levy = (main.composition.levy || 0) + reward.levy; syncTroops(s); }
        }
        log(s, "good", `${chapter.name}完成。${reward.note}。`);
      } }]
    };
  }
  if (decision.type === "world_event") {
    const event = WORLD_EVENTS.find(item => item.id === decision.eventId);
    return event ? scriptedEventView(s, event) : null;
  }
  if (decision.type === "npc_arc") {
    const event = NPC_ARCS.find(item => item.id === decision.eventId);
    if (!event) return null;
    const officerId = event.officerId || decision.officerId;
    const who = officer(s, officerId);
    // 原型事件的标题里有 {name}，换成落到的那个人
    const view = scriptedEventView(s, { ...event, title: String(event.title).replace(/\{name\}/g, who?.name || "") }, officerId);
    return view;
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
      kicker: "讨账", title: `${lord.name}来要你许的${d.name}`,
      portrait: lord.portrait || "assets/player.webp",
      body: `<p>收他的时候，你答应把${esc(d.name)}给他管。他今天带着随从来了，站在厅上，没坐。</p>`
        + `<p>“殿下当时那句话，北境都听见了。”</p>`,
      options: [
        { name: `兑现承诺，把${d.name}封给他`, note: `该地税收降到${share}；王室正统性 +${LEGITIMACY_DELTAS.keepPromise}；他死心塌地`, effect() {
          s.territories[fiefId].fiefHolder = lord.id;
          lord.fief = fiefId;
          lord.loyalty = clamp((lord.loyalty || 0) + 30);
          lord.grievance = clamp((lord.grievance || 0) - 20);
          gainLegitimacy(s, "keepPromise");
          s.style.oath++;
          recordDeed(s, "kept", lord.id);
          settle();
          log(s, "good", `${d.name}封给了${lord.name}。北境这回知道了：渡鸦家说的话，算数。`);
        } },
        { name: "食言，这块地留在自己手里", note: `保住全额税收；王室正统性 ${LEGITIMACY_DELTAS.breakPromise}；他记恨，可能带兵出走`, effect() {
          lord.loyalty = clamp((lord.loyalty || 0) - 30);
          lord.grievance = clamp((lord.grievance || 0) + 45);
          gainLegitimacy(s, "breakPromise");
          s.style.iron++;
          recordDeed(s, "broken", lord.id);
          settle();
          log(s, "bad", `${lord.name}空着手走了。没吵，一个字没说。这种人记仇记得最牢。`);
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
      kicker: "战后", title: `${lord.name}押到了厅上`, portrait: lord.portrait || "assets/player.webp",
      body: `<p>${esc(d.name)}换了旗。${esc(lord.name)}——${esc(lord.oldTie || "父亲旧部")}——被反绑着押进大厅，膝盖上全是泥。</p>${lordLine(s, lord.id, "captured") ? `<p>“${esc(lordLine(s, lord.id, "captured"))}”</p>` : ""}<p>他名下的骑士在门外等同一个结果。</p>`,
      options: [
        { name: "接受效忠，让他重新宣誓", note: "加入你的领主议会，忠诚 45；王室正统性 +4", effect() {
          submitLord(s, lord.id, "force");
          s.legitimacy = clamp(s.legitimacy + 4); s.style.oath++;
          log(s, "good", `${lord.name}跪在厅上重新宣了誓。膝盖上的泥还没干。`);
        } },
        { name: `收取赎金 ${ransom} 金币`, note: `金币 +${ransom}；王室正统性 −2；该领主离场`, effect() {
          sendAway(); s.gold += ransom; s.legitimacy = clamp(s.legitimacy - 2); s.style.wealth += 2; recordDeed(s, "ransomed", lord.id);
          log(s, "info", `${lord.name}付了${ransom}金，出了北境。钱是他的人凑的。`);
        } },
        { name: "放逐他，禁止再次返回", note: "军心 +5；王室正统性 −3", effect() {
          sendAway(); s.morale = clamp(s.morale + 5); s.legitimacy = clamp(s.legitimacy - 3); s.style.iron++; recordDeed(s, "exiled", lord.id);
          log(s, "warn", `${lord.name}被押到边境放了。没给马。`);
        } },
        { name: "处死他，立威于北境", note: "邻近领主抵抗 −5；王室正统性 −10；其骑士永为死敌", effect() {
          lord.captured = false; lord.side = "gone";
          s.legitimacy = clamp(s.legitimacy - 10); s.style.iron += 2; recordDeed(s, "executed", lord.id);
          (s.knights || []).filter(k => k.liegeLordId === lord.id && k.status !== "gone").forEach(k => {
            k.status = "hostile"; k.side = "gone"; k.captured = false;
          });
          (TERRITORY_DEFS[decision.territoryId].adj || []).forEach(id => {
            const neighbour = lordAt(s, id);
            if (neighbour) neighbour.defiance = Math.max(0, (neighbour.defiance || 0) - 5);
          });
          const last = lordLine(s, lord.id, "execute");
          log(s, "bad", `${lord.name}在${d.name}城前被处死。${last ? `最后一句话是：“${last}”` : "消息传遍北境。"}`);
        } }
      ]
    };
  }
  if (decision.type === "first_winter") {
    return {
      kicker: "第一个冬天", title: "城门外来了三十户人，没有粮", portrait: "assets/oswin.webp",
      body: `<p>灰麦原打仗，烧了他们的村。奥斯温说仓里勉强能挤出一些；伊莎贝尔说，冬天才刚开始。</p><p>大厅里所有人都在看你怎么对第一批来要饭的。</p>`,
      options: [
        { name: "开仓，放他们进城", note: "粮食 −22，民心 +12，王室认可 +2；奥斯温忠诚 +5", disabled: s.grain < 22, effect() { s.grain -= 22; s.support = clamp(s.support + 12); s.legitimacy = clamp(s.legitimacy + 2); const o = officer(s, "oswin"); if (o) { o.loyalty = clamp(o.loyalty + 5); o.grievance = clamp((o.grievance || 0) - 5); } s.style.oath += 2; log(s, "good", "仓开了。三十户人进了城，挤在马厩和下城。奥斯温一晚上没睡，在分粮。"); } },
        { name: "给十袋粮，让他们往南走", note: "粮食 −10，民心 +3；奥斯温不满 +3", disabled: s.grain < 10, effect() { s.grain -= 10; s.support = clamp(s.support + 3); const o = officer(s, "oswin"); if (o) o.grievance = clamp((o.grievance || 0) + 3); s.style.wealth++; log(s, "info", "十袋麦子，一条往南的路。他们走了，走得很慢。"); } },
        { name: "关门。先养活自己人", note: "粮食不变，军心 +3，民心 −10；奥斯温忠诚 −7、不满 +12", effect() { s.morale = clamp(s.morale + 3); s.support = clamp(s.support - 10); const o = officer(s, "oswin"); if (o) { o.loyalty = clamp(o.loyalty - 7); o.grievance = clamp((o.grievance || 0) + 12); } s.style.iron += 2; log(s, "bad", "门没开。他们在门外站到半夜，然后往南去了。奥斯温回屋的时候没跟你说晚安。"); } }
      ]
    };
  }
  if (decision.type === "cousin_demand") {
    return {
      kicker: "家事", title: "埃德蒙要单独带一次兵", portrait: "assets/edmund.webp",
      body: `<p>“让我单独领一次兵。”他盯着桌上的军旗，“我打得赢，他们自然闭嘴。堂弟，你也一样。”</p><p>已经有几个骑士跟在他后头了。让他领兵，他的功劳会涨，野心也会。</p>`,
      options: [
        { name: "让他去", note: "埃德蒙忠诚 +8、功劳 +5；王室认可 −3", effect() { const o = officer(s, "edmund"); if (o) { o.loyalty = clamp(o.loyalty + 8); o.merit += 5; } s.legitimacy = clamp(s.legitimacy - 3); s.style.oath++; log(s, "info", "他接过军旗，没说谢。下次军议是他报的商路和军情，报得比奥斯温还细。"); } },
        { name: "当众拒绝", note: "王室认可 +4；埃德蒙忠诚 −10、不满 +14", effect() { const o = officer(s, "edmund"); if (o) { o.loyalty = clamp(o.loyalty - 10); o.grievance = clamp((o.grievance || 0) + 14); } s.legitimacy = clamp(s.legitimacy + 4); s.style.iron += 2; log(s, "warn", "他把军旗放回桌上，放得很轻。“行，堂弟。”"); } },
        { name: "先让他去护商路", note: "金币 +10；埃德蒙忠诚 −3、管理功劳 +3", effect() { const o = officer(s, "edmund"); if (o) { o.loyalty = clamp(o.loyalty - 3); o.merit += 3; } s.gold += 10; s.style.wealth += 2; log(s, "info", "他去护了一季商路，带回十金。回来说，商路上没人叫他堂兄。"); } }
      ]
    };
  }
  if (decision.type === "royal_tax") {
    return {
      kicker: "王城催税", title: "摄政公爵要你补上父亲欠的四十金", portrait: "assets/ysabel.webp",
      body: `<p>使者把王命放在长桌上，封蜡是公爵的。伊莎贝尔看了一眼说，账是真的，先王确实欠了。奥斯温说，欠是欠，但收账的不该是他。</p>`,
      options: [
        { name: "全付，四十金", note: "金币 −40，王室认可 +12；公爵拿钱办事，加冕推迟 5 分钟", disabled: s.gold < 40, effect() { s.gold -= 40; s.legitimacy = clamp(s.legitimacy + 12); s.style.oath++; applyEventEffects(s, { coronationMin: 5 }); log(s, "info", "四十金装箱南下。使者走的时候第一次对你行了礼。"); } },
        { name: "付二十，求延期", note: "金币 −20，王室认可 +3，威望 −2", disabled: s.gold < 20, effect() { s.gold -= 20; s.legitimacy = clamp(s.legitimacy + 3); s.renown = clamp(s.renown - 2); s.style.wealth += 2; log(s, "warn", "使者收了二十金，把剩下的写进回报。他写得很慢，让你看着他写。"); } },
        { name: "烧了王命", note: "威望 +8，军心 +6，王室认可 −12；公爵被激怒，加冕提前 10 分钟", effect() { s.renown = clamp(s.renown + 8); s.morale = clamp(s.morale + 6); s.legitimacy = clamp(s.legitimacy - 12); s.style.iron += 2; applyEventEffects(s, { coronationMin: -10 }); log(s, "warn", "王命在火盆里烧了。使者带着烧剩的封蜡回了王城，大厅里有人在笑。"); } }
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
      kicker: "终章", title: "铁冠在桌上", portrait: "assets/player.webp",
      body: `<p>王冠谷的城门开了。家臣把那顶冠从公爵的箱子里翻出来，放在你面前的桌上。它比想象的小，比想象的重。</p><p>怎么戴，你说。</p>`,
      options: [
        { name: "各地规矩照旧。戴上", note: `守信风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.oath++; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}让各地的规矩照旧，然后戴上了铁冠。`); } },
        { name: "所有领主跪下宣誓。然后戴", note: `强硬风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.iron += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}让所有领主跪下宣了誓，然后戴上了铁冠。有人跪得快，有人跪得慢。`); } },
        { name: "先清国库和税册。再戴", note: `经营风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.wealth += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}先清了国库和税册，三天后才戴上铁冠。伊莎贝尔说这是她见过最像样的加冕。`); } }
      ]
    };
  }
  return null;
}

function pumpDecision() {
  if (!S || S.ended || !S.pendingDecisions.length || typeof document === "undefined") {
    $("modalMask")?.classList.add("hidden");
    if (S && !S.battleSession && S.pauseState?.reason === "decision") resumeWorld(S, worldNow());
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
    // 只解开自己按下的那把锁。原先是无条件 resume，于是战斗中弹出的事件
    // 一旦被回答，连战斗的暂停也会被一并解开；现在又多了「离开暂停」，
    // 不按 reason 区分的话，切回来答个事件就等于替玩家点了「继续」。
    if (!S.pendingDecisions.length && S.pauseState?.reason === "decision") resumeWorld(S, worldNow());
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



// ---------- 比武大会 ----------
// 确定性的伪随机：同一局、同一时刻、同一轮、同一打法，结果永远相同。
function tourneyRoll(s, salt) {
  let h = 2166136261 >>> 0;
  const text = `${s.clock?.elapsedMs || 0}|${s.playerName}|${salt}`;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

function tourneyChampion(s, id) {
  if (id === "player") { const p = officer(s, "player"); return { id, name: s.playerName, force: p?.stats?.force ?? 68, scheme: p?.stats?.scheme ?? 60, prince: true }; }
  const k = knightById(s, id);
  return k ? { id, name: k.name, force: k.force || 50, scheme: k.scheme || 45, prince: false } : null;
}

function tourneyOpponent(s, year, round) {
  const pool = (s.knights || []).filter(k => k.side !== "player" && !["gone", "executed"].includes(k.status));
  if (!pool.length) return { name: "无名游侠", force: 55, scheme: 50 };
  const k = pool[(year * 7 + round * 3) % pool.length];
  return { name: k.name, force: (k.force || 50) + round * 4, scheme: (k.scheme || 45) + round * 3 };
}

function maybeOpenTourney(s) {
  if (!s || s.ended || seasonOf(s).id !== "summer") return false;
  const year = yearOf(s);
  s.tourney ||= { held: [], titles: 0 };
  if (s.tourney.held.includes(year)) return false;
  s.tourney.held.push(year);
  s.pendingDecisions.push({ type: "tourney_invite", year });
  pushNotice({ level: "normal", kind: "tourney", title: `${TOURNEY_HOSTS[(year - 1) % TOURNEY_HOSTS.length]}办比武`, text: "告示贴到渡鸦堡门口了。", tab: "hall" });
  return true;
}

function tourneyInviteView(s, decision) {
  const host = TOURNEY_HOSTS[(decision.year - 1) % TOURNEY_HOSTS.length];
  const knights = activeKnights(s).slice().sort((a, b) => (b.force || 0) - (a.force || 0)).slice(0, 3);
  const enter = (id) => () => { s.pendingDecisions.splice(1, 0, { type: "tourney_round", year: decision.year, round: 1, champId: id, renown: 0, last: null }); };
  return {
    kicker: `夏季比武 · ${host}`, title: s.tourney?.titles ? "又到比武的时候了" : "北境的夏季比武",
    portrait: "assets/oswin.webp",
    body: `<p>今年的比武设在${host}。告示贴到了渡鸦堡门口，冠军赏${TOURNEY_PURSE}金，外加一件彩头。</p><p>奥斯温看了一眼告示。“${s.tourney?.titles ? "去年那件彩头还在库里摆着。再拿一件，库房就该嫌挤了。" : "去年那件彩头，听说是镀金的铁。"}”</p>`,
    options: [
      ...knights.map(k => ({ name: `派${k.name}下场`, note: `武力${k.force} · 谋略${k.scheme}；输了歇一季`, effect: enter(k.id) })),
      { name: "我亲自下场", note: "赢了威望翻倍；输了丢脸、掉军心", effect: enter("player") },
      { name: "今年不去", note: "什么也不发生", effect() { log(s, "info", `${host}的比武，渡鸦家没派人。`); } }
    ]
  };
}

function tourneyRoundView(s, decision) {
  const champ = tourneyChampion(s, decision.champId);
  if (!champ) return null;
  const opp = tourneyOpponent(s, decision.year, decision.round);
  const taunt = TOURNEY_TAUNTS[(decision.year * 5 + decision.round) % TOURNEY_TAUNTS.length];
  const resolve = (tactic) => () => {
    const roll = tourneyRoll(s, `${decision.year}-${decision.round}-${tactic}`);
    let chance;
    if (tactic === "steady") chance = .5 + (champ.force - opp.force) / 90;
    else if (tactic === "charge") chance = .42 + (champ.force - opp.force) / 70;
    else chance = .45 + (champ.scheme - opp.scheme) / 60;
    chance = Math.max(.12, Math.min(.88, chance));
    const win = roll < chance;
    const pool = TOURNEY_RESULTS[tactic][win ? "win" : "lose"];
    const text = pool[Math.floor(roll * 1000) % pool.length].replaceAll("{c}", champ.name);
    const gain = win ? (tactic === "charge" ? 6 : 3) * (champ.prince ? 2 : 1) : 0;
    const caught = !win && tactic === "trick";
    const next = { year: decision.year, champId: decision.champId, renown: decision.renown + gain, last: { text, win, opp: opp.name, caught } };
    if (win && decision.round < 3) s.pendingDecisions.splice(1, 0, { type: "tourney_round", round: decision.round + 1, ...next });
    else s.pendingDecisions.splice(1, 0, { type: "tourney_end", champion: win && decision.round === 3, round: decision.round, ...next });
  };
  return {
    kicker: `比武 · 第${decision.round}轮`, title: `对手：${opp.name}`,
    portrait: champ.prince ? "assets/player.webp" : "assets/battle-plains.webp",
    body: `${decision.last ? `<p>${decision.last.text}</p>` : ""}<p>${opp.name}隔着栅栏冲${champ.prince ? "你" : champ.name}喊：“${taunt}”</p>`,
    options: Object.entries(TOURNEY_TACTICS).map(([id, t]) => ({ name: t.name, note: t.note, effect: resolve(id) }))
  };
}

function tourneyEndView(s, decision) {
  const champ = tourneyChampion(s, decision.champId);
  if (!champ) return null;
  const title = decision.champion ? `${champ.name}夺冠` : `${champ.name}止步第${decision.round}轮`;
  const prize = decision.champion ? TREASURES.find(t => t.source.type === "tourney" && t.source.index === (s.tourney?.titles || 0) + 1) : null;
  const wanderer = decision.champion ? (s.knights || []).find(k => k.side === "neutral" && !k.liegeLordId && k.status === "available") : null;
  const body = decision.champion
    ? `<p>${decision.last.text}</p><p>${TOURNEY_CHAMPION[decision.year % TOURNEY_CHAMPION.length].replaceAll("{c}", champ.name)}</p>${wanderer ? `<p>散场的时候，一个叫${wanderer.name}的游侠牵着马等在门口，说想跟着渡鸦家干。</p>` : ""}`
    : `<p>${decision.last.text}</p>${decision.last.caught ? "<p>回城的路上，没人说话。</p>" : champ.prince ? "<p>你一瘸一拐地走下场，奥斯温递过来一块湿布，什么也没说。</p>" : `<p>${champ.name}被抬下场，嘴里还在骂。</p>`}`;
  const notes = decision.champion
    ? [`威望 +${decision.renown + 10}`, `金币 +${TOURNEY_PURSE}`, prize && `宝库：${prize.name}`, wanderer && `${wanderer.name}入列`].filter(Boolean).join(" · ")
    : [decision.renown ? `威望 +${decision.renown}` : "", decision.last.caught ? "威望 −4" : "", champ.prince ? "军心 −3" : `${champ.name}歇一季`].filter(Boolean).join(" · ");
  return {
    kicker: "比武 · 散场", title, portrait: champ.prince ? "assets/player.webp" : "assets/battle-plains.webp", body,
    options: [{ name: decision.champion ? "回渡鸦堡" : "认了", note: notes, effect() {
      s.renown = clamp(s.renown + decision.renown + (decision.champion ? 10 : 0) - (decision.last.caught ? 4 : 0));
      if (decision.champion) {
        s.gold += TOURNEY_PURSE;
        s.tourney.titles = (s.tourney.titles || 0) + 1;
        if (prize) grantTreasure(s, prize.id, `${champ.name}从比武场上拿回来的。`);
        if (!champ.prince) { const k = knightById(s, champ.id); if (k) k.loyalty = clamp((k.loyalty || 50) + 10); }
        if (wanderer) { wanderer.side = "player"; wanderer.liegeLordId = "player"; wanderer.status = "active"; wanderer.recruitedAt = turnOf(s); }
        pushNotice({ level: "major", kind: "tourney", title, text: "彩头进了宝库。", tab: "hall" });
        log(s, "good", `${title}。`);
      } else {
        if (champ.prince) s.morale = clamp(s.morale - 3);
        else { const k = knightById(s, champ.id); if (k) k.injuredUntil = turnOf(s) + 1; }
        log(s, "info", `${title}。`);
      }
    } }]
  };
}
