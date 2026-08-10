"use strict";

// 建档、存档迁移 v1→v7、自检、日志与存盘、任务推进、世界推进、可攻目标与守军。

function createInitialState(name, startingStyle, difficulty) {
  const territories = {};
  Object.entries(TERRITORY_DEFS).forEach(([id, d]) => {
    territories[id] = {
      owner: d.owner,
      stability: d.stability,
      guard: d.guard,
      devastated: 0,
      fiefHolder: null,
      garrison: emptyComposition(),
      drift: { guard: 0, devastated: 0 },
      lordId: d.owner === "player" ? null : (SEAT_TO_LORD[id] || null),
      buildings: { fields: id === "ravenstone" ? 1 : id === "westmarch" ? 2 : 0, market: id === "ravenstone" || id === "blackthorn" ? 1 : 0, barracks: id === "ravenstone" || id === "ironhill" ? 1 : 0, walls: id === "ravenstone" ? 1 : 0, granary: id === "ravenstone" || id === "westmarch" ? 1 : 0, academy: 0, workshop: id === "ironhill" ? 1 : 0, roads: 0, watchtower: 0, temple: 0 }
    };
  });
  const officers = Object.entries(LORD_DEFS).map(([id, d]) => {
    // 领主的 side 就是其势力；只有 tier "loyal" 的人（王子、老管家）站在玩家一边。
    const side = d.tier === "loyal" ? "player" : d.faction;
    return {
      id, ...clone(d), side, recruitable: false,
      name: id === "player" ? (name.trim() || "罗恩") : d.name,
      loyalty: d.loyalty, ambition: d.ambition, grievance: 0, merit: 0, injured: 0, fief: null,
      captured: false, rapport: 0, submitted: false, promisedFief: null
    };
  });
  const style = { oath: 0, iron: 0, wealth: 0 };
  if (style[startingStyle] != null) style[startingStyle] = 2;
  const state = {
    version: VERSION,
    playerName: name.trim() || "罗恩",
    difficulty, style,
    tab: "hall", selectedTerritoryId: "ravenstone",
    gold: 58,
    grain: 125,
    knowledge: 12,
    army: { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 },
    troops: 42,
    armies: [],
    support: 52,
    morale: 55,
    renown: 8,
    legitimacy: 35,
    training: 0,
    warWeariness: 0,
    crisis: { famineMs: 0, unrestMs: 0 },
    coronation: { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] },
    territories, officers, knights: createKnightRoster(),
    clock: null,
    pauseState: null,
    jobs: [],
    tech: clone(TECH_DEFAULTS),
    factions: {},
    cooldowns: {},
    cityIntel: {},
    battles: 0, wins: 0, casualties: 0,
    lastAction: null,
    lastBattle: null,
    battleSession: null,
    pendingDecisions: [],
    seenEvents: [],
    seenNpcEvents: [],
    flags: { firstWinter: false, cousinDemand: false, taxDemand: false },
    ended: false,
    endingReason: null,
    log: []
  };
  state.armies = [defaultArmyEntity(state)];
  ensureAIFactions(state);
  initClock(state);
  initTimers(state, state.clock.startedAt);
  log(state, "info", `${state.playerName}在雨夜接过渡鸦堡的领主印戒。`);
  return state;
}

function migrateV1ToV2(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = 2;
  delete migrated.ap;
  migrated.jobs = Array.isArray(migrated.jobs) ? migrated.jobs : [];
  migrated.tech ||= clone(TECH_DEFAULTS);
  migrated.factions ||= {};
  migrated.migrationLog = [...(migrated.migrationLog || []), "v1-to-v2"];
  return migrated;
}

function migrateV2ToV3(raw) {
  const migrated = clone(raw);
  migrated.version = 3;
  // 1. 按名册给每块非玩家可占领地补守将
  Object.keys(migrated.territories || {}).forEach(id => {
    const t = migrated.territories[id];
    t.lordId = t.owner === "player" ? null : (SEAT_TO_LORD[id] || t.lordId || null);
  });
  // 2/3/4/5. 整理领主名册
  migrated.officers = (migrated.officers || []).filter(o => {
    const def = LORD_DEFS[o.id];
    if (def) return true;
    return o.side === "player";               // 已招募的旧浪人保留，未招募的移除
  }).map(o => {
    const def = LORD_DEFS[o.id];
    const next = { ...o, rapport: o.rapport ?? 0, captured: o.captured ?? false, submitted: o.submitted ?? false, promisedFief: o.promisedFief ?? null };
    if (!def) return { ...next, tier: "loyal", faction: "player", seat: null, liege: null, defiance: 0, routes: { force: 0, persuade: 0, bribe: 0 }, knights: [] };
    // locked 旧臣转为其座城的叛臣
    if (next.side === "locked") next.side = def.faction;
    return { ...next, tier: def.tier, faction: def.faction, seat: def.seat, liege: def.liege, defiance: def.defiance, routes: { ...def.routes } };
  });
  // 名册里新增而存档里没有的领主（如摄政公爵、13 名附庸）补进去
  Object.entries(LORD_DEFS).forEach(([id, def]) => {
    if (migrated.officers.some(o => o.id === id)) return;
    migrated.officers.push({
      id, ...clone(def), side: def.faction, recruitable: false,
      grievance: 0, merit: 0, injured: 0, fief: null,
      rapport: 0, captured: false, submitted: false, promisedFief: null
    });
  });
  // 6. 骑士补 liegeLordId。必须以存档里的当前归属为准，不能无脑套用初始名册：
  // 旧档里已被玩家招募的骑士只有 side === "player"，若照 KNIGHT_LIEGE 补成原主君，
  // 日后处死该主君时会把玩家自己的骑士一并判成死敌。
  migrated.knights = (migrated.knights || []).map(k => {
    if (k.liegeLordId !== undefined) return { ...k };
    const liegeLordId = k.side === "player" ? "player"
      : k.side === "gone" ? null
      : (KNIGHT_LIEGE[k.id] || null);
    return { ...k, liegeLordId };
  });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v2-to-v3"];
  return migrated;
}

function migrateV3ToV4(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = 4;
  // 由旧的 turn 反推 elapsedMs，保证季节与年份不跳变
  const turn = Math.max(0, Math.round(migrated.turn ?? migrated.clock?.seasonIndex ?? 0));
  migrated.clock = {
    startedAt: now - turn * TIME_CONFIG.seasonDurationMs,
    elapsedMs: turn * TIME_CONFIG.seasonDurationMs,
    lastProcessedAt: now
  };
  delete migrated.turn;
  delete migrated.seasonLocks;
  delete migrated.campaignCooldown;
  migrated.cooldowns = migrated.cooldowns && typeof migrated.cooldowns === "object" ? migrated.cooldowns : {};
  migrated.timers = {};
  Object.entries(TIMER_DEFS).forEach(([key, def]) => { migrated.timers[key] = { nextAt: now + def.intervalMs }; });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v3-to-v4"];
  return migrated;
}

function migrateV4ToV5(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = 5;
  // 危机从「连续 N 季」折算为毫秒累计，每档按一季 5 分钟计
  const old = migrated.crisis || {};
  migrated.crisis = {
    famineMs: Math.max(0, Math.round(old.famineMs ?? (old.famine || 0) * TIME_CONFIG.seasonDurationMs)),
    unrestMs: Math.max(0, Math.round(old.unrestMs ?? (old.unrest || 0) * TIME_CONFIG.seasonDurationMs))
  };
  migrated.coronation ||= { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] };
  migrated.coronation.delayedBy ||= [];
  Object.values(migrated.territories || {}).forEach(t => { t.drift ||= { guard: 0, devastated: 0 }; });
  // 研究队列从全局单键改为按科技分键，否则并发研究会互相顶掉
  (migrated.jobs || []).forEach(job => {
    if (job.type === "RESEARCH" && job.queueKey === "research:global" && job.payload?.techId) {
      job.queueKey = `research:${job.payload.techId}`;
    }
  });
  // 旧的「打满 48 季」结局在新体系里没有对应物
  if (migrated.endingReason === "great_lord" || migrated.endingReason === "minor_lord") migrated.endingReason = "crowned";
  migrated.migrationLog = [...(migrated.migrationLog || []), "v4-to-v5"];
  return migrated;
}

function migrateV5ToV6(raw) {
  const migrated = clone(raw);
  migrated.version = 6;
  // 说服路线的运行时字段：好感、封地承诺、可变的从属关系。
  // liege 必须显式补齐——lordVassals 优先读运行时值，undefined 会让「自立门户」失效。
  (migrated.officers || []).forEach(o => {
    o.rapport ??= 0;
    o.promisedFief ??= null;
    if (o.liege === undefined) o.liege = LORD_DEFS[o.id]?.liege ?? null;
  });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v5-to-v6"];
  return migrated;
}

function migrateV6ToV7(raw) {
  const migrated = clone(raw);
  migrated.version = 7;
  // 封地承诺现在会到期。老档里已经许下但没有时刻的承诺，按「立刻到期」处理：
  // 玩家读档后马上会被讨这块地，这正是当初答应的事，不该因为换版本就一笔勾销。
  (migrated.officers || []).forEach(o => { o.promisedAt = o.promisedFief ? 0 : null; });
  migrated.migrationLog = [...(migrated.migrationLog || []), "v6-to-v7"];
  return migrated;
}

function migrateSave(raw, now = Date.now()) {
  if (!raw) return null;
  let migrated = clone(raw);
  if (migrated.version === 1 || migrated.version == null) migrated = migrateV1ToV2(migrated, now);
  if (migrated.version === 2) migrated = migrateV2ToV3(migrated);
  if (migrated.version === 3) migrated = migrateV3ToV4(migrated, now);
  if (migrated.version === 4) migrated = migrateV4ToV5(migrated, now);
  if (migrated.version === 5) migrated = migrateV5ToV6(migrated);
  if (migrated.version === 6) migrated = migrateV6ToV7(migrated);
  if (migrated.version !== VERSION) return null;
  return hydrateLatest(migrated);
}

function hydrateState(raw) {
  return migrateSave(raw);
}

function hydrateLatest(raw) {
  if (!raw || raw.version !== VERSION) return null;
  raw.selectedTerritoryId ||= "ravenstone";
  raw.clock ||= makeClock(0);
  raw.timers ||= initTimers(raw, Date.now());
  raw.pauseState ||= null;
  raw.jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  raw.knowledge ??= 12;
  raw.tech ||= clone(TECH_DEFAULTS);
  Object.keys(TECH_DEFAULTS).forEach(branch => {
    raw.tech[branch] ||= clone(TECH_DEFAULTS[branch]);
    raw.tech[branch].completed = Array.isArray(raw.tech[branch].completed) ? raw.tech[branch].completed : [];
    raw.tech[branch].levels = raw.tech[branch].levels && typeof raw.tech[branch].levels === "object" ? raw.tech[branch].levels : {};
    raw.tech[branch].completed.forEach(id => { if (!Number.isFinite(raw.tech[branch].levels[id])) raw.tech[branch].levels[id] = 1; });
    raw.tech[branch].level = Object.values(raw.tech[branch].levels).reduce((sum, level) => sum + Math.max(0, Math.min(TECH_MAX_LEVEL, Math.round(level || 0))), 0);
  });
  raw.factions ||= {};
  raw.cityIntel ||= {};
  delete raw.cityRelations;
  delete raw.cityTradeposts;
  raw.pendingDecisions ||= [];
  raw.seenEvents ||= [];
  raw.seenNpcEvents ||= [];
  raw.officers ||= [];
  // 早期版本在重复打开存档时可能写入同一名候选领主，按 id 去重，避免领主府出现重复卡片。
  const uniqueOfficers = new Map();
  raw.officers.forEach(o => { if (o?.id && !uniqueOfficers.has(o.id)) uniqueOfficers.set(o.id, o); });
  raw.officers = [...uniqueOfficers.values()];
  // 注：locked → neutral 的转换已由 migrateV2ToV3 负责，此处不再重复。
  const defaultKnights = createKnightRoster();
  raw.knights = Array.isArray(raw.knights) ? raw.knights : [];
  const knightMap = new Map(raw.knights.filter(knight => knight?.id).map(knight => [knight.id, knight]));
  defaultKnights.forEach(knight => { if (!knightMap.has(knight.id)) knightMap.set(knight.id, knight); });
raw.knights = [...knightMap.values()].map(knight => ({ ...knight, status: knight.status || "available", loyalty: Math.round(knight.loyalty || 50), force: Math.round(knight.force || 50), command: Math.round(knight.command || 45), scheme: Math.round(knight.scheme || 45) }));
  raw.cooldowns ||= {};
  raw.crisis ||= { famineMs: 0, unrestMs: 0 };
  raw.coronation ||= { atElapsedMs: CORONATION_AT_MS, delayedMs: 0, delayedBy: [] };
  raw.flags ||= {};
  raw.flags.firstWinter ??= false;
  raw.flags.cousinDemand ??= false;
  raw.flags.taxDemand ??= false;
  raw.style ||= { oath: 0, iron: 0, wealth: 0 };
  const buildingDefaults = Object.fromEntries(Object.keys(BUILDINGS).map(type => [type, 0]));
  Object.values(raw.territories).forEach(t => { delete t.policy; t.garrison ||= emptyComposition(); t.buildings = { ...buildingDefaults, ...(t.buildings || {}) }; });
  const legacyArmyMissing = !raw.army;
  if (legacyArmyMissing) {
    const total = Math.max(0, Math.round(raw.troops || 0));
    const knights = Math.min(4, Math.floor(total / 8));
    const archers = Math.min(8, Math.floor(total / 4));
    raw.army = { ...emptyComposition(), levy: Math.max(0, total - knights - archers), archers, knights };
  }
  if (!Array.isArray(raw.armies) || !raw.armies.length) raw.armies = [defaultArmyEntity(raw)];
  raw.armies.forEach((army, index) => {
    army.id ||= `army_${index + 1}`;
    army.name ||= index === 0 ? "渡鸦第一军团" : `第${index + 1}军团`;
    army.owner ||= "player";
    army.locationId ||= "ravenstone";
    army.destinationId ??= null;
    if (legacyArmyMissing && index === 0) army.composition = clone(raw.army);
    army.composition = { ...emptyComposition(), ...(army.composition || (index === 0 ? raw.army : {})) };
    army.leaders = Array.isArray(army.leaders) && army.leaders.length ? army.leaders : ["player"];
    army.commanderId ||= army.leaders.find(id => id === "player" || knightById(raw, id)?.status === "active") || "player";
    army.leaders = [army.commanderId];
    army.morale ??= raw.morale;
    army.training ??= raw.training;
    army.supply ??= 100;
    army.status ||= "idle";
    army.jobId ??= null;
  });
  if (raw.armies[0] && raw.armies[0].composition && raw.troops && Object.values(raw.territories).every(t => compositionTotal(t.garrison) === 0) && raw.armies.length === 1) {
    raw.armies[0].composition = clone(raw.armies[0].composition);
  }
  raw.warWeariness ??= 0;
  // 危机已改为毫秒累计；这里只补默认值，不要再补 v4 的按季计数字段，
  // 否则会把 migrateV4ToV5 刚折算好的结果又污染回去。
  raw.crisis.famineMs ??= 0;
  raw.crisis.unrestMs ??= 0;
  delete raw.crisis.famine;
  delete raw.crisis.debt;
  delete raw.crisis.unrest;
  delete raw.crisis.checkedTurn;
  raw.officers.forEach(o => { o.grievance ??= 0; o.merit ??= 0; o.injured ??= 0; o.fief ??= null; o.rapport ??= 0; o.promisedFief ??= null; o.promisedAt ??= (o.promisedFief ? 0 : null); if (o.liege === undefined) o.liege = LORD_DEFS[o.id]?.liege ?? null; });
  // 旧存档曾把玩家称为“主将”。迁移时同步为领主称谓，避免旧文案继续污染新界面。
  const playerOfficer = raw.officers.find(o => o.id === "player");
  if (playerOfficer) {
    playerOfficer.title = LORD_DEFS.player.title;
    playerOfficer.trait = LORD_DEFS.player.trait;
    playerOfficer.traitText = LORD_DEFS.player.traitText;
  }
  Object.values(raw.territories).forEach(t => {
    if (t.fiefHolder && t.fiefHolder !== "charter" && officer(raw, t.fiefHolder)?.side !== "player") t.fiefHolder = null;
  });
  raw.officers.forEach(o => {
    if (o.side !== "player" || (o.fief && raw.territories[o.fief]?.fiefHolder !== o.id)) o.fief = null;
  });
  syncTroops(raw);
  if (raw.battleSession && !raw.battleSession.composition) {
    raw.battleSession.composition = selectedComposition(raw, raw.battleSession.troops);
    raw.battleSession.lossesByType = emptyComposition();
  }
  if (raw.battleSession) {
    raw.battleSession.flags ||= { demanded: false, pushed: false, aggression: 0 };
    raw.battleSession.flags.aggression ??= 0;
  }
  ensureAIFactions(raw);
  return raw;
}

function selfCheck(s = S) {
  const errors = [];
  if (!s) errors.push("state missing");
  if (s && s.version !== VERSION) errors.push(`version ${s.version} !== ${VERSION}`);
  if (s && !Number.isFinite(s.clock?.elapsedMs)) errors.push("clock missing elapsedMs");
  if (s && !Array.isArray(s.jobs)) errors.push("jobs must be an array");
  if (s && Array.isArray(s.jobs)) {
    const ids = s.jobs.map(job => job.id);
    if (new Set(ids).size !== ids.length) errors.push("duplicate job id");
    const queues = s.jobs.filter(job => job.status === "running").map(job => job.queueKey);
    if (new Set(queues).size !== queues.length) errors.push("duplicate running queue");
  }
  if (s && !Array.isArray(s.officers)) errors.push("officers must be an array");
  if (s && Array.isArray(s.officers)) {
    const officerIds = s.officers.map(item => item?.id).filter(Boolean);
    if (new Set(officerIds).size !== officerIds.length) errors.push("duplicate officer id");
  }
  if (s && !Array.isArray(s.armies) || s && !s.armies?.length) errors.push("armies missing");
  if (s && Array.isArray(s.armies)) s.armies.forEach(army => {
    if (!army.locationId) errors.push(`army ${army.id || "unknown"} location missing`);
    if (!army.composition) errors.push(`army ${army.id || "unknown"} composition missing`);
  });
  if (s && !Number.isFinite(s.knowledge)) errors.push("knowledge missing");
  if (s && (!Number.isFinite(s.gold) || !Number.isFinite(s.grain))) errors.push("resources missing");
  if (s && !s.territories?.ravenstone) errors.push("ravenstone territory missing");
  if (s && armyTotal(s) !== Math.round(s.troops || 0)) errors.push("army total mismatch");
  if (s && s.territories) Object.entries(s.territories).forEach(([id, t]) => {
    if (t.lordId && !LORD_DEFS[t.lordId]) errors.push(`territory ${id} has unknown lordId ${t.lordId}`);
    if (t.lordId && !officer(s, t.lordId)) errors.push(`territory ${id} lordId ${t.lordId} missing from roster`);
    if (t.owner === "player" && t.lordId) errors.push(`player territory ${id} still has lordId ${t.lordId}`);
  });
  return { ok: errors.length === 0, errors };
}

function interactionLocked(s) {
  return !!s?.battleSession;
}

function rejectDuringBattle(s) {
  if (!interactionLocked(s)) return false;
  toast("远征尚未结束，必须先下达战场命令");
  return true;
}

function log(s, kind, text) {
  s.log.unshift({ turn: turnOf(s), kind, text });
  s.log = s.log.slice(0, 120);
}

function saveGame() {
  if (!S || typeof localStorage === "undefined") return false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; }
  catch (_) { return false; }
}

function loadGame() {
  if (typeof localStorage === "undefined") return null;
  try {
    const loaded = hydrateState(JSON.parse(localStorage.getItem(SAVE_KEY)));
    if (!loaded) return null;
    catchUpOffline(loaded, Date.now());
    return loaded;
  }
  catch (_) { return null; }
}

function deleteSave() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
}

function subjects(s) {
  return Math.round(ownTerritoryIds(s).reduce((sum, id) => {
    const t = s.territories[id];
    return sum + TERRITORY_DEFS[id].people * (1 - Math.min(3, t.devastated) * .08);
  }, 0));
}

function territoryOutput(s, id, season = seasonOf(s)) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  const stability = .62 + t.stability / 265;
  const damage = 1 - Math.min(3, t.devastated) * .13;
  const share = t.fiefHolder && t.fiefHolder !== "charter" ? (techLevel(s, "provincial_offices") ? .77 + Math.max(0, techLevel(s, "provincial_offices") - 1) * .015 : .7) : 1;
  const wealth = 1;
  const bestGovernor = ownedOfficers(s).filter(o => !o.injured).sort((a, b) => b.stats.govern - a.stats.govern)[0];
  const admin = 1 + Math.max(0, (bestGovernor?.stats.govern || 55) - 55) / 550;
  const diff = difficultyOf(s).income;
  const grainTech = (1 + techLevel(s, "heavy_plow") * .08) * (1 + techLevel(s, "crop_rotation") * .1) * (1 + techLevel(s, "seed_selection") * .08) * (season.id === "winter" ? 1 + techLevel(s, "winter_storage") * .12 : 1) * (season.id !== "winter" ? 1 + techLevel(s, "irrigation") * .06 : 1);
  const goldTech = (1 + techLevel(s, "tax_registry") * .08) * (1 + techLevel(s, "coinage") * .08) * (1 + techLevel(s, "trade_guild") * .08);
  // 统一法典只托底，不加成：低稳定度领地的金币不再随稳定度继续下滑，
  // 相当于把它当作稳定度 50（每多一阶再抬 10 点）来算。稳定度本来就高的领地
  // 取 Math.max 后拿到的仍是自己那一份，因此不会变成一条隐形的全局增益。
  const lawFloorAt = 40 + techLevel(s, "law_code") * 10;
  const goldStability = techLevel(s, "law_code") ? Math.max(stability, .62 + lawFloorAt / 265) : stability;
  // 驿道是这条商路上真正的载体：商旅驿站与王家汇兑各让每级驿道多带回金币。
  // 原描述里的「商站」在游戏里根本不存在，是某个被删系统留下的词。
  const roadGold = 1.5 + techLevel(s, "caravanserai") * .7 + techLevel(s, "royal_exchange") * .9;
  // 每块领地保留一小段基础余量，确保自动换季结算不是“产出刚好被开支吃完”；
  // 玩家仍需通过政策、建筑和扩张把余量放大，而不是靠反复点击应急征收维持运转。
  const grainBase = (d.grain + t.buildings.fields * 8 + 4) * grainTech;
  const goldBase = (d.gold + t.buildings.market * 3 + t.buildings.roads * roadGold + 1) * goldTech;
  return {
    grain: Math.max(0, Math.round(grainBase * season.grain * stability * damage * share * diff)),
    gold: Math.max(0, Math.round(goldBase * season.gold * goldStability * damage * share * wealth * admin * diff))
  };
}

function forecast(s, season = seasonOf(s)) {
  const gross = ownTerritoryIds(s).reduce((acc, id) => {
    const out = territoryOutput(s, id, season);
    acc.gold += out.gold;
    acc.grain += out.grain;
    return acc;
  }, { gold: 0, grain: 0 });
  const winterExtra = season.id === "winter" ? Math.max(1, ownTerritoryIds(s).length) * difficultyOf(s).winter : 0;
  const seedReserve = season.id === "autumn" ? ownTerritoryIds(s).length * 2 : 0;
  const armySplit = playerCompositionSplit(s);
  const army = armySplit.mobile;
  const garrison = armySplit.garrison;
  let grainCost = Math.max(0, Math.ceil(army.levy / 4 + army.archers / 4 + army.knights / 3 + army.heavy_infantry / 3 + army.crossbowmen / 3 + army.light_cavalry / 3 + garrison.levy / 8 + garrison.archers / 8 + garrison.knights / 6) - 1) + winterExtra + seedReserve;
  if (techLevel(s, "census")) grainCost = Math.ceil(grainCost * Math.max(.82, 1 - techLevel(s, "census") * .06));
  const armyGoldCost = army.levy * .12 + army.archers * .23 + army.knights * .55 + garrison.levy * .06 + garrison.archers * .12 + garrison.knights * .28;
  const goldCost = Math.ceil(armyGoldCost * Math.max(.64, 1 - techLevel(s, "professional_army") * .18)) + ownedOfficers(s).filter(o => o.id !== "player").length + activeKnights(s).length;
  const fieldLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.fields || 0), 0);
  const granaryLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.granary || 0), 0);
  const storageCap = 105 + ownTerritoryIds(s).length * 45 + fieldLevels * 35 + granaryLevels * 32;
  const projected = s.grain + gross.grain - grainCost;
  const spoilageRate = Math.max(.05, .18 - granaryLevels * .018);
  const spoilage = Math.max(0, Math.round((projected - storageCap) * spoilageRate));
  return { ...gross, grainCost, goldCost, storageCap, spoilage, netGold: gross.gold - goldCost, netGrain: gross.grain - grainCost - spoilage };
}

// 每季知识产出。学宫每级 1.5 点：原本是 1 点，投入与回报太不成比例 ——
// 一块地把学宫点满要 270 金和 5 次建设排队，只换来每季 5 点知识，
// 于是「要不要搞科研」根本不成为一个选择，所有人都是顺手点满一阶就不管了。
const ACADEMY_KNOWLEDGE_PER_LEVEL = 1.5;

function knowledgePerSeason(s) {
  const academyLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.academy || 0), 0);
  return 3 + academyLevels * ACADEMY_KNOWLEDGE_PER_LEVEL + techLevel(s, "relay_roads") * 2;
}

function resourceFlow(s, season = seasonOf(s)) {
  const f = forecast(s, season);
  const duration = Math.max(1, TIME_CONFIG.seasonDurationMs);
  return { goldPerSecond: f.netGold / (duration / 1000), grainPerSecond: f.netGrain / (duration / 1000), goldGrossPerSecond: f.gold / (duration / 1000), grainGrossPerSecond: f.grain / (duration / 1000), forecast: f };
}

// 累积到某个绝对时刻，而非累积一段时长——这样重复调用天然幂等，
// 在线逐帧推进与离线一次性补算才可能得到完全相同的结果。
function accrueTo(s, at) {
  if (!s?.clock) return 0;
  const from = s.clock.lastProcessedAt;
  if (!Number.isFinite(at) || !(at > from)) return 0;
  const deltaMs = at - from;
  const seconds = deltaMs / 1000;
  const seasonSeconds = TIME_CONFIG.seasonDurationMs / 1000;
  const flow = resourceFlow(s, seasonOf(s));
  s.gold += flow.goldPerSecond * seconds;
  // 仓储损耗已含在 netGrain 里（netGrain = 产出 − 消耗 − 损耗），
  // 因此这里不能再单独扣一次，否则是重复计算。
  s.grain += flow.grainPerSecond * seconds;

  // 知识：原本每季一次性结算，改为按秒摊开。公式抽成函数，测试与实现共用一份。
  s.knowledge = (s.knowledge || 0) + knowledgePerSeason(s) * seconds / seasonSeconds;

  // 训练度衰减
  const decayPerSeason = Math.max(0, 2 - Math.ceil(techLevel(s, "field_doctrine") / 2));
  s.training = Math.max(0, (s.training || 0) - decayPerSeason * seconds / seasonSeconds);

  // 危机按持续时长累计：条件成立就攒时间，一旦解除立刻清零。
  // 玩家因此能实时补救，而不是眼睁睁等季界宣判。
  s.crisis ||= { famineMs: 0, unrestMs: 0 };
  s.crisis.famineMs = s.grain <= 0 ? s.crisis.famineMs + deltaMs : 0;
  s.crisis.unrestMs = s.support < 12 ? s.crisis.unrestMs + deltaMs : 0;

  s.clock.elapsedMs += deltaMs;
  s.clock.lastProcessedAt = at;
  return seconds;
}

function buildingCost(s, id, type) {
  const level = s.territories[id].buildings[type];
  return Math.round(BUILDINGS[type].base + level * 13);
}

function canUpgrade(s, id, type) {
  const t = s.territories[id];
  return !!t && t.owner === "player" && t.buildings[type] < BUILDING_MAX_LEVEL && !getRunningJob(s, `build:${id}`) && s.gold >= buildingCost(s, id, type);
}

function upgradeBuilding(id, type) {
  if (rejectDuringBattle(S)) return false;
  if (!canUpgrade(S, id, type)) { toast("金币或等级条件不足"); return false; }
  const t = S.territories[id];
  const cost = buildingCost(S, id, type);
  S.gold -= cost;
  const targetLevel = t.buildings[type] + 1;
  startJob(S, {
    type: "BUILD",
    territoryId: id,
    startedAt: Date.now(),
    durationMs: JOB_CONFIG.BUILD.durationMs,
    queueKey: `build:${id}`,
    payload: { buildingType: type, targetLevel, cost }
  });
  const text = `${TERRITORY_DEFS[id].name}开始建设${BUILDINGS[type].name}第${targetLevel}级，预计${formatDuration(JOB_CONFIG.BUILD.durationMs)}后完成。`;
  S.lastAction = { name: "领地建设排队", text: `花费${cost}金币。${text}` };
  log(S, "info", S.lastAction.text);
  saveGame();
  renderAll();
  return true;
}

function canRecruitUnit(s, type, territoryId = recruitmentTerritoryId(s)) {
  const unit = UNIT_DEFS[type];
  const territory = s?.territories?.[territoryId];
  if (!unit || !territory || territory.owner !== "player" || getRunningJob(s, `recruit:${territoryId}`) || s.gold < unit.gold || s.grain < unit.grain) return false;
  if (unit.unlockTech && !techCompleted(s, unit.unlockTech)) return false;
  if (["knights", "heavy_infantry", "light_cavalry"].includes(type)) {
    const barracks = territory.buildings.barracks || 0;
    if (s.renown < 15 && barracks < 2) return false;
  }
  return true;
}

function queueRecruitment(s, type, territoryId = recruitmentTerritoryId(s), now = Date.now()) {
  if (!s || !canRecruitUnit(s, type, territoryId)) return null;
  const unit = UNIT_DEFS[type];
  const amount = recruitAmount(s, type, territoryId);
  s.gold -= unit.gold;
  s.grain -= unit.grain;
  return startJob(s, {
    type: "RECRUIT",
    territoryId,
    startedAt: now,
    durationMs: JOB_CONFIG.RECRUIT.durationMs,
    queueKey: `recruit:${territoryId}`,
    payload: { unitType: type, amount, gold: unit.gold, grain: unit.grain }
  });
}

function queueResearch(s, branch, techId, now = Date.now()) {
  if (!canResearch(s, branch, techId)) return null;
  const tech = techDefinition(branch, techId);
  const level = techLevel(s, techId) + 1;
  const cost = techCost(tech, level);
  s.gold -= cost.gold;
  s.knowledge -= cost.knowledge;
  return startJob(s, {
    type: "RESEARCH",
    startedAt: now,
    endAt: now + researchDuration(tech, level),
    queueKey: `research:${techId}`,
    payload: { branch, techId, level, gold: cost.gold, knowledge: cost.knowledge }
  });
}

function startMarch(s, armyId, destinationId, now = Date.now(), payload = {}) {
  const army = armyEntity(s, armyId);
  const originId = army?.locationId;
  const longExpedition = payload?.battlePlan && s.territories[destinationId]?.owner !== "player";
  if (!army || army.owner !== "player" || army.status !== "idle" || !TERRITORY_DEFS[destinationId] || TERRITORY_DEFS[destinationId].playable === false || (!longExpedition && !TERRITORY_DEFS[originId]?.adj.includes(destinationId)) || getRunningJob(s, `march:${armyId}`)) return null;
  const job = startJob(s, {
    type: "MARCH",
    armyId,
    startedAt: now,
    endAt: now + marchDurationForDistance(s, originId, destinationId),
    queueKey: `march:${armyId}`,
    payload: { originId, destinationId, ...payload }
  });
  army.destinationId = destinationId;
  army.status = "marching";
  army.jobId = job.id;
  army.leaders = army.leaders?.length ? army.leaders : ["player"];
  return job;
}

function startArmyGroupMarch(s, armyIds, destinationId, now = Date.now(), payload = {}) {
  const ids = [...new Set((armyIds || []).filter(Boolean))];
  const armies = ids.map(id => armyEntity(s, id));
  if (!ids.length || armies.some(army => !army || army.owner !== "player" || army.status !== "idle")) return null;
  if (payload?.battlePlan && !ids.some(id => attackableTerritories(s, id).includes(destinationId))) return null;
  const lead = armies[0];
  const armyOrigins = Object.fromEntries(armies.map(army => [army.id, army.locationId]));
  const job = startMarch(s, lead.id, destinationId, now, { ...payload, armyIds: ids, armyOrigins });
  if (!job) return null;
  armies.slice(1).forEach(army => {
    army.destinationId = destinationId;
    army.status = "marching";
    army.jobId = job.id;
  });
  return job;
}

function recruitAmount(s, type, territoryId = recruitmentTerritoryId(s)) {
  const unit = UNIT_DEFS[type];
  if (!unit) return 0;
  const barracks = s.territories[territoryId]?.buildings?.barracks || 0;
  const workshop = s.territories[territoryId]?.buildings?.workshop || 0;
  const trainingBonus = type === "levy" ? Math.min(5, barracks) + Math.floor(workshop / 2) : ["archers", "crossbowmen"].includes(type) ? Math.floor(Math.min(5, barracks) / 2) + Math.floor(workshop / 3) : Math.floor(barracks / 2);
  // 人口清册的「提高征募上限」与长弓的「弓箭手征募量提高」原先都只写在描述里。
  // 清册管所有兵种，长弓只管弓手（弓箭手与弩手）。
  const censusBonus = techLevel(s, "census");
  const bowBonus = ["archers", "crossbowmen"].includes(type) ? techLevel(s, "longbow") : 0;
  return unit.amount + trainingBonus + censusBonus + bowBonus;
}

function recruitUnit(type) {
  if (rejectDuringBattle(S)) return false;
  if (!canRecruitUnit(S, type)) { toast("资源、威望或兵营条件不足"); return false; }
  const unit = UNIT_DEFS[type];
  const job = queueRecruitment(S, type);
  if (!job) { toast("资源、威望或兵营条件不足"); return false; }
  S.lastAction = { name: `征募${unit.name}排队`, text: `${job.payload.amount}名${unit.name}开始训练，预计${formatDuration(JOB_CONFIG.RECRUIT.durationMs)}后加入军队。` };
  log(S, "info", S.lastAction.text);
  saveGame(); renderAll();
  return true;
}

function applyShortage(s, deficit) {
  const deserters = Math.min(armyTotal(s), Math.ceil(deficit / 3));
  removeTroops(s, deserters);
  s.support = clamp(s.support - Math.min(18, 6 + deficit));
  s.morale = clamp(s.morale - Math.min(16, 4 + deficit));
  ownTerritoryIds(s).forEach(id => s.territories[id].stability = clamp(s.territories[id].stability - 6));
  ownedOfficers(s).forEach(o => { if (o.id !== "player") o.loyalty = clamp(o.loyalty - 3); });
  log(s, "bad", `粮仓见底，${deserters}名士兵离队，村庄开始宰杀来年的种畜。`);
}

function applyUnrest(s) {
  const deserters = Math.min(armyTotal(s), Math.max(1, Math.ceil((25 - s.support) / 4)));
  removeTroops(s, deserters);
  ownTerritoryIds(s).forEach(id => { s.territories[id].stability = clamp(s.territories[id].stability - 4); s.territories[id].devastated = Math.max(s.territories[id].devastated, 1); });
  log(s, "bad", `民心跌破底线，${deserters}名驻军离队，领地生产受到影响。`);
}

function enemyGuardCap(s, id) {
  const expansionPressure = Math.max(0, ownTerritoryIds(s).length - 1) * 4;
  const timePressure = Math.floor(turnOf(s) / 4) * 3;
  return Math.round(TERRITORY_DEFS[id].guard + (expansionPressure + timePressure) * difficultyOf(s).enemy);
}

function settleSeasonEconomy(s, options = {}) {
  // 调用时 elapsedMs 可能已跨过季界，seasonOf 会返回新的一季；
  // 结算必须用刚结束的那一季的系数，因此允许显式传入。
  const season = options.season || seasonOf(s);
  const f = forecast(s, season);
  if (!options.resourcesAlreadyAccrued) {
    s.gold += f.gold - f.goldCost;
    s.grain += f.grain - f.grainCost - f.spoilage;
  }
  if (f.spoilage > 0) log(s, "warn", `粮仓容量只有${f.storageCap}，潮气、鼠害与转运损失吃掉了${f.spoilage}粮食。升级农田与磨坊可扩充仓储。`);
  if (s.grain < 0) { const deficit = Math.abs(s.grain); s.grain = 0; applyShortage(s, deficit); }
  if (s.support < 25) applyUnrest(s);
  log(s, f.netGrain >= 0 ? "good" : "warn", `${season.name}季结算：金币${f.netGold >= 0 ? "+" : ""}${f.netGold}，粮食${f.netGrain >= 0 ? "+" : ""}${f.netGrain}${f.spoilage ? `（含损耗${f.spoilage}）` : ""}。`);
}

// 守军与破坏度是整数量，无法按秒平滑增长，因此用浮点累加器攒够 1 再落地。
// 长期速率与原本的「每季 +1」一致，同时保持确定性（不掷骰子，否则步进等价性立刻崩）。
function applyDrift(s, intervalMs) {
  const share = intervalMs / TIME_CONFIG.seasonDurationMs;
  const bump = (t, key, perSeason) => {
    if (!perSeason) return 0;
    t.drift ||= {};
    t.drift[key] = (t.drift[key] || 0) + perSeason * share;
    const whole = Math.trunc(t.drift[key]);
    if (whole !== 0) t.drift[key] -= whole;
    return whole;
  };
  ownTerritoryIds(s).forEach(id => {
    const t = s.territories[id];
    const guardCap = TERRITORY_DEFS[id].guard + t.buildings.barracks * 7 + t.buildings.walls * 5 + t.buildings.watchtower * 4;
    if (t.devastated > 0) t.devastated = Math.max(0, t.devastated + bump(t, "devastated", -1));
    if (t.stability >= 65 && t.guard < guardCap) t.guard = Math.min(guardCap, t.guard + bump(t, "guard", 1));
  });
  Object.keys(s.territories).filter(id => s.territories[id].owner !== "player").forEach(id => {
    const t = s.territories[id];
    const normalRecovery = Math.min(4, 2 + Math.floor(turnOf(s) / 12));
    const perSeason = t.devastated > 0 ? 1 : Math.max(1, normalRecovery - techLevel(s, "blockade"));
    t.guard = Math.min(enemyGuardCap(s, id), t.guard + bump(t, "guard", perSeason));
    if (t.devastated > 0) t.devastated = Math.max(0, t.devastated + bump(t, "devastated", -1));
  });
}

function fireTimer(s, key, at, rng, options = {}) {
  const def = TIMER_DEFS[key];
  const timer = s.timers[key];
  timer.nextAt = at + def.intervalMs;
  if (options.offline && !def.offline) return false;   // 离线不结算 AI 与事件
  if (key === "season") {
    // 原本挂在 advanceSeason 上的季界工作，除 AI 与事件外全部保留在这里。
    // accrueTo 已把 elapsedMs 推过边界，所以要显式指明刚结束的那一季。
    const endedSeason = SEASONS[(turnOf(s) + 3) % 4];
    settleSeasonEconomy(s, { resourcesAlreadyAccrued: true, season: endedSeason });
    s.officers.forEach(o => { o.injured = 0; });
    s.warWeariness = 0;
    handleOfficerPolitics(s);
    if (!options.offline) queueSeasonEvents(s);
    return true;
  }
  if (def.faction) { runFactionTurn(s, def.faction, rng, at); return true; }
  if (key === "drift") { applyDrift(s, def.intervalMs); return true; }
  if (key === "events") { queueSeasonEvents(s); return true; }
  return false;
}

function coronationDeadlineMs(s) {
  return (s?.coronation?.atElapsedMs ?? CORONATION_AT_MS) + (s?.coronation?.delayedMs || 0);
}

function coronationRemainingMs(s) {
  return Math.max(0, coronationDeadlineMs(s) - (s?.clock?.elapsedMs || 0));
}

// 拿下公爵的直辖地会把加冕往后推。同一块地只算一次。
function delayCoronation(s, territoryId) {
  if (!s?.coronation || !DUCHY_HOLDINGS.includes(territoryId)) return false;
  s.coronation.delayedBy ||= [];
  if (s.coronation.delayedBy.includes(territoryId)) return false;
  s.coronation.delayedBy.push(territoryId);
  s.coronation.delayedMs = (s.coronation.delayedMs || 0) + CORONATION_DELAY_MS;
  log(s, "good", `${TERRITORY_DEFS[territoryId].name}易主，摄政公爵的加冕大典被迫推迟。`);
  return true;
}

// 终局判定必须独立于任何计时器：elapsedMs 会在两次计时器触发之间越过阈值。
function checkCampaignEnd(s) {
  if (!s || s.ended) return false;
  if (coronationRemainingMs(s) > 0) return false;
  s.ended = true;
  s.endingReason = "crowned";
  return true;
}

function advanceWorld(s, now = Date.now(), options = {}) {
  if (!s || s.ended || s.battleSession || s.pauseState) return { steps: 0, jobs: 0 };
  s.clock ||= makeClock(0, now);
  s.timers ||= initTimers(s, now);
  const rng = options.rng || Math.random;
  const cap = Number.isFinite(options.maxCatchUpMs) ? options.maxCatchUpMs : TIME_CONFIG.maxCatchUpMs;
  const horizon = Math.min(now, s.clock.lastProcessedAt + cap);
  let steps = 0, jobs = 0, guard = 0;
  while (!s.ended && guard++ < 5000) {
    const next = nextDueEvent(s, horizon);
    if (!next) break;
    accrueTo(s, next.at);
    if (next.kind === "job") jobs += processCompletedJobs(s, next.at, rng);
    else if (fireTimer(s, next.key, next.at, rng, options)) steps++;
  }
  accrueTo(s, horizon);
  jobs += processCompletedJobs(s, horizon, rng);
  if (!options.offline) checkDefeat(s);
  checkCampaignEnd(s);
  // 超出补算上限的部分直接跳过，不结算也不累积，避免离开一整天后被补算淹没
  if (horizon < now) {
    s.clock.lastProcessedAt = now;
    Object.entries(s.timers).forEach(([key, timer]) => {
      if (timer.nextAt <= now) timer.nextAt = now + TIMER_DEFS[key].intervalMs;
    });
  }
  return { steps, jobs };
}

function catchUpOffline(s, now = Date.now()) {
  if (!s) return 0;
  s.clock ||= makeClock(0, now);
  s.timers ||= initTimers(s, now);
  if (s.pauseState) { s.clock.lastProcessedAt = now; return 0; }
  const before = turnOf(s);
  advanceWorld(s, now, { offline: true });
  const seasons = turnOf(s) - before;
  if (seasons > 0) {
    const text = `你离开期间推进了${seasons}季。离线不结算敌袭与事件，回来后照常继续。`;
    s.lastAction = { name: "离线结算完成", text };
    log(s, "info", text);
    saveGame();
  }
  return seasons;
}

function updateJobCountdowns(now = Date.now()) {
  if (typeof document === "undefined" || !S) return;
  document.querySelectorAll("[data-job-countdown]").forEach(node => {
    const job = (S.jobs || []).find(item => item.id === node.dataset.jobCountdown);
    if (!job || job.status !== "running") return;
    const effectiveNow = S.pauseState?.pausedAt || now;
    node.textContent = `${node.dataset.jobPrefix || ""}${formatDuration(getJobRemainingMs(job, effectiveNow))}`;
  });
}

function updateWorldTime(now = Date.now()) {
  if (!S || S.ended || S.pauseState) {
    updateJobCountdowns(now);
    return { steps: 0, jobs: 0 };
  }
  S.clock ||= makeClock(0, now);
  const shouldProcessLogic = now - (S.clock.lastProcessedAt || 0) >= TIME_CONFIG.logicTickMs;
  const result = shouldProcessLogic ? advanceWorld(S, now) : { steps: 0, jobs: 0 };
  const { steps, jobs } = result;
  updateJobCountdowns(now);
  if (steps || jobs) {
    saveGame();
    renderAll();
    pumpDecision();
  } else if (typeof document !== "undefined" && !$("game")?.classList.contains("hidden")) {
    renderTop();
  }
  return { steps, jobs };
}

function handleOfficerPolitics(s) {
  ownedOfficers(s).forEach(o => {
    if (o.id === "player") return;
    if (o.merit >= 12 && !o.fief) {
      const ambitionPressure = Math.ceil(o.ambition / 24) + (o.merit >= 24 ? 1 : 0);
      o.grievance = clamp(o.grievance + ambitionPressure);
    }
    if (o.grievance >= 70 && o.loyalty < 38) {
      const gone = Math.min(armyTotal(s), 6 + Math.round(o.command / 15));
      removeTroops(s, gone);
      if (o.fief && s.territories[o.fief]) {
        const fiefId = o.fief;
        s.territories[fiefId].fiefHolder = null;
        s.territories[fiefId].stability = clamp(s.territories[fiefId].stability - 10);
        o.fief = null;
        log(s, "warn", `${TERRITORY_DEFS[fiefId].name}失去管理者，重新改由你管理，地方稳定下降。`);
      }
      o.side = "gone";
      log(s, "bad", `${o.name}因长期没有得到领地管理权，带着${gone}名追随者离开渡鸦堡。`);
    }
  });
}

function queueSeasonEvents(s) {
  const season = seasonOf(s);
  // 收买时许下的封地到期了：他来讨那块地。
  // 用 pendingDecisions 里是否已有同一条来去重，就不必再多存一个「已排队」标志位。
  (s.officers || []).forEach(o => {
    if (o.side !== "player" || !o.promisedFief || !s.territories[o.promisedFief]) return;
    if ((s.clock?.elapsedMs || 0) - (o.promisedAt ?? 0) < FIEF_PROMISE_DUE_MS) return;
    if (s.pendingDecisions.some(d => d.type === "fief_promise" && d.lordId === o.id)) return;
    s.pendingDecisions.push({ type: "fief_promise", lordId: o.id });
  });
  if (season.id === "winter" && !s.flags.firstWinter) {
    s.flags.firstWinter = true;
    s.pendingDecisions.push({ type: "first_winter" });
  }
  if (turnOf(s) >= 5 && !s.flags.cousinDemand && officer(s, "edmund")?.side === "player") {
    s.flags.cousinDemand = true;
    s.pendingDecisions.push({ type: "cousin_demand" });
  }
  if (turnOf(s) >= 10 && !s.flags.taxDemand) {
    s.flags.taxDemand = true;
    s.pendingDecisions.push({ type: "royal_tax" });
  }
  if (turnOf(s) >= 2 && turnOf(s) % 2 === 0) {
    const nextWorld = WORLD_EVENTS.find(event => !s.seenEvents.includes(event.id));
    if (nextWorld) {
      s.seenEvents.push(nextWorld.id);
      s.pendingDecisions.push({ type: "world_event", eventId: nextWorld.id });
    }
  }
  if (turnOf(s) >= 3 && turnOf(s) % 3 === 0) {
    const nextNpc = NPC_ARCS.find(event => {
      if (s.seenNpcEvents.includes(event.id) || turnOf(s) < event.minTurn) return false;
      const person = officer(s, event.officerId);
      if (!person || person.side === "gone") return false;
      return event.side !== "player" || person.side === "player";
    });
    if (nextNpc) {
      s.seenNpcEvents.push(nextNpc.id);
      s.pendingDecisions.push({ type: "npc_arc", eventId: nextNpc.id });
    }
  }
}

// 能打哪里，取决于自家版图的边界，而不是大军此刻站在哪一格。
//
// 原先这里只返回「与大军所在地相邻」的敌方领地。附庸成片归附之后，大军会被自家
// 领地整个包住：全图还剩六七块敌领（含公爵大道与王冠谷），可攻列表却是空的，战役
// 就此静默停摆 —— 没有失败提示，只是再也打不了任何一仗，一路空转到加冕倒计时归零。
// 确定性平衡模拟里 120 局全是这样：统一 0 局，结局只剩「铁冠加于他人之头」。
//
// startMarch 早就实现了「长征」（带作战计划打非我方领地时跳过相邻检查），
// marchDurationForDistance 也按图上直线距离拉长行军时间；但所有调用点都先经过这里
// 过滤，那套机制从来没被触发过。改按版图边界取目标后长征随之生效：越远的目标行军
// 越久，扩张仍必须连成一片，地图重新完整可争。
function attackableTerritories(s, armyId = "army_1") {
  const mine = new Set(ownTerritoryIds(s));
  const army = armyEntity(s, armyId);
  if (!army || army.owner !== "player" || army.status !== "idle") return [];
  return Object.keys(TERRITORY_DEFS).filter(id => {
    const d = TERRITORY_DEFS[id];
    if (d.playable === false) return false;
    if (mine.has(id)) return false;
    if (d.final && !crownAccessMet(s)) return false;
    return d.adj.some(neighbour => mine.has(neighbour));
  });
}

function factionTerritories(s, faction) {
  return Object.keys(s.territories).filter(id => s.territories[id].owner === faction);
}

// 每块叛臣领地都有具名守将，不再只有三名大叛臣的主城才有人守。
function defenderLeader(s, targetId) {
  if (owns(s, targetId)) return null;
  const lord = lordAt(s, targetId);
  return lord && lord.side !== "player" && lord.side !== "gone" ? lord : null;
}

function averageStat(s, ids, stat) {
  const people = ids.map(id => commanderStats(s, id)).filter(Boolean);
  if (!people.length) return 0;
  return people.reduce((sum, person) => sum + (person[stat] || 0), 0) / people.length;
}

function defenderComposition(s, targetId) {
  const t = s.territories[targetId];
  const guard = Math.max(1, Math.round(t?.guard || 1));
  const owner = t?.owner;
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  const share = owner === "crown" ? { levy: .35, archers: .2, knights: .12, heavy_infantry: .15, crossbowmen: .12, light_cavalry: .06 } : owner === "river" ? { levy: .4, archers: .28, knights: .08, heavy_infantry: .08, crossbowmen: .1, light_cavalry: .06 } : owner === "wolf" ? { levy: .5, archers: .18, knights: .12, heavy_infantry: .05, crossbowmen: .03, light_cavalry: .12 } : tags.includes("fortified") ? { levy: .4, archers: .2, knights: .08, heavy_infantry: .16, crossbowmen: .12, light_cavalry: .04 } : { levy: .5, archers: .22, knights: .1, heavy_infantry: .06, crossbowmen: .06, light_cavalry: .06 };
  const result = emptyComposition();
  Object.keys(UNIT_DEFS).forEach(type => { result[type] = Math.round(guard * (share[type] || 0)); });
  result.levy = Math.max(0, result.levy + guard - compositionTotal(result));
  return result;
}

