"use strict";

// 领主与骑士的归属查询、三条收服路线、城市行动、经济产出、建筑与征募、兵种。

function lordAt(s, territoryId) {
  const lordId = s?.territories?.[territoryId]?.lordId;
  return lordId ? (officer(s, lordId) || null) : null;
}

// 辖地由 territories 派生，不单独存储，因此永远不会和地图对不上。
function lordHoldings(s, lordId) {
  if (!lordId) return [];
  return Object.keys(s?.territories || {}).filter(id => s.territories[id].lordId === lordId);
}

// 从属关系取自静态表：本作没有「附庸改换门庭」的流程，领主只会从叛臣归降为玩家方。
// 必须挡住 lordId 为空的调用，否则会把所有 liege 为 null 的独立叛臣当成某人的附庸返回。
function lordVassals(s, lordId) {
  if (!lordId) return [];
  // 优先读运行时 liege：附庸拒绝跟随主君归附时会自立门户，静态表说不出这件事。
  return (s?.officers || []).filter(o => {
    const liege = o.liege !== undefined ? o.liege : LORD_DEFS[o.id]?.liege;
    return liege === lordId && o.side !== "player" && o.side !== "gone";
  });
}

// 邻近压力：该领主全部辖地的相邻领地并集里，有多少已归玩家。
// 去重，并排除他自己的辖地——否则自己的地会被算成对自己的压力。
function adjacencyPressure(s, lordId) {
  const holdings = lordHoldings(s, lordId);
  if (!holdings.length) return 0;
  const own = new Set(holdings);
  const neighbours = new Set();
  holdings.forEach(id => (TERRITORY_DEFS[id]?.adj || []).forEach(nb => { if (!own.has(nb)) neighbours.add(nb); }));
  return Math.min(20, [...neighbours].filter(id => owns(s, id)).length * 4);
}

// 说服阻力。routes.persuade 为 0 的领主（摄政公爵）阻力恒等于 defiance，
// 无论正统性和好感堆到多高都说不动——主线的军事高潮因此得以保留。
function lordResistance(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def) return Infinity;
  const persuade = def.routes?.persuade || 0;
  const parts = persuasionLeverage(s, lordId);
  return (lord.defiance ?? def.defiance) - (parts.pressure + parts.legitimacy + parts.rapport) * persuade;
}

// 说服杠杆的三项来源，拆开返回是为了让将领页能告诉玩家「该往哪使劲」。
//
// 权重取向：说服建立在武力威慑之上，不是靠使者刷好感刷出来的。邻近压力
// （他的辖地被我方版图包住多少）是主导项，正统性与好感只是加成。
// 旧权重 0.6/0.8/0.5 让好感成了最大单项来源（上限 40 × 0.8 = 32），
// 光靠外交就能翻掉大半个北境，武力反而退成次要路线。
function persuasionLeverage(s, lordId) {
  const lord = officer(s, lordId);
  return {
    pressure: adjacencyPressure(s, lordId) * 1.2,
    legitimacy: (s?.legitimacy || 0) * 0.4,
    rapport: (lord?.rapport || 0) * 0.4
  };
}

function canPersuadeLord(s, lordId) {
  const lord = officer(s, lordId);
  if (!lord || lord.side === "player" || lord.side === "gone" || lord.captured) return false;
  if (!(LORD_DEFS[lordId]?.routes?.persuade > 0)) return false;
  return lordResistance(s, lordId) <= 0;
}

// 收买价随抵抗值上升、随该领主的贪财程度下降。bribe 为 0 者不可收买。
function lordBribeCost(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  const bribe = def?.routes?.bribe || 0;
  if (!lord || !bribe) return Infinity;
  // 自由市契约压低开价：商路铺开之后，钱在北境更好使。
  // 收买本来就要扣正统性，是三条路里最弱的一条，让商贸线的终点补贴它不会
  // 动摇「武力为主」——不收钱的篡位者仍然不收钱（bribe 为 0 时上面已返回 Infinity）。
  const charter = 1 - Math.min(.3, techLevel(s, "market_charter") * .12);
  return Math.round((lord.defiance ?? def.defiance) * 6 / bribe * charter);
}

// 打服 / 说服 / 收买三条路线共用同一个归附出口：
// 忠诚基线、辖地转移、骑士随迁只实现一次，避免三份会各自漂移的代码。
const SUBMIT_LOYALTY = { force: 45, persuade: 65, bribe: 30 };

function submitLord(s, lordId, route = "persuade", rng = Math.random) {
  const lord = officer(s, lordId);
  if (!lord || lord.side === "player" || lord.side === "gone") return false;
  lord.side = "player";
  lord.captured = false;
  lord.submitted = true;
  lord.loyalty = SUBMIT_LOYALTY[route] ?? SUBMIT_LOYALTY.persuade;
  lord.grievance = route === "force" ? clamp((lord.grievance || 0) + 10) : 0;
  // 打服时辖地已在战斗结算里易主；说服与收买则整片带过来
  if (route !== "force") {
    lordHoldings(s, lordId).forEach(id => {
      const t = s.territories[id];
      t.owner = "player";
      t.lordId = null;
      t.stability = clamp(Math.max(t.stability, 50));
    });
  }
  // 骑士随主君：在列的直接入伍，被俘的一并释放归队；已战死或转为死敌的除外
  (s.knights || []).filter(k => k.liegeLordId === lordId && k.status !== "gone" && k.status !== "hostile").forEach(k => {
    k.side = "player";
    k.liegeLordId = "player";
    k.captured = false;
    k.status = "active";
  });

  // 附庸易主会削弱其主君的抵抗意志，最多削到原值的 70%。
  // 这让「先拆他的羽翼再谈」成为一条真实可走的路。
  const liegeId = lord.liege !== undefined ? lord.liege : LORD_DEFS[lordId]?.liege;
  if (liegeId) {
    const liege = officer(s, liegeId);
    const liegeDef = LORD_DEFS[liegeId];
    if (liege && liegeDef && liege.side !== "player" && liege.side !== "gone") {
      const total = Object.values(LORD_DEFS).filter(d => d.liege === liegeId).length;
      if (total > 0) {
        const lost = Object.entries(LORD_DEFS).filter(([id, d]) => d.liege === liegeId && officer(s, id)?.side === "player").length;
        liege.defiance = Math.max(liegeDef.defiance * 0.7, liegeDef.defiance - liegeDef.defiance * 0.3 * (lost / total));
        log(s, "info", `${liege.name}又失去一名附庸，抵抗意志降到 ${Math.round(liege.defiance)}。`);
      }
    }
  }

  // 大叛臣归附后，其附庸各自做一次跟随判定。
  // 跟随者成建制倒向；不跟随者自立门户，而不是继续挂在已归附的主君名下。
  if (LORD_DEFS[lordId]?.tier === "liege") {
    lordVassals(s, lordId).forEach(vassal => {
      const chance = 0.35 + (s.legitimacy || 0) / 250 + (vassal.rapport || 0) / 200
        - (vassal.defiance ?? LORD_DEFS[vassal.id].defiance) / 300;
      if (rng() < chance) {
        submitLord(s, vassal.id, route, rng);
        log(s, "good", `${vassal.name}随${lord.name}一同归附。`);
      } else {
        vassal.liege = null;
        log(s, "warn", `${vassal.name}拒绝跟随，自立门户。`);
      }
    });
  }
  return true;
}

// UI 与测试共用的路线可用性查询：每条路要么可用，要么说清楚还差什么。
function lordRouteStatus(s, lordId) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def) return {};
  const resistance = lordResistance(s, lordId);
  const leverage = persuasionLeverage(s, lordId);
  const cost = lordBribeCost(s, lordId);
  const holdings = lordHoldings(s, lordId).length;
  const persuadable = (def.routes?.persuade || 0) > 0;
  return {
    force: {
      available: holdings > 0,
      detail: holdings > 0 ? `攻下他最后一座城即可俘获（现有 ${holdings} 座）` : "他已无城可守"
    },
    persuade: {
      available: canPersuadeLord(s, lordId),
      detail: !persuadable ? "篡位者不接受任何使者，只能兵戎相见"
        : resistance <= 0 ? "阻力已清，可要求他效忠"
        : `还需消解 ${Math.ceil(resistance)} 点阻力 · 当前杠杆：兵临城下 ${Math.round(leverage.pressure)}、正统 ${Math.round(leverage.legitimacy)}、好感 ${Math.round(leverage.rapport)}（占他的辖地邻边最有效）`
    },
    bribe: {
      available: Number.isFinite(cost) && s.gold >= cost && lord.side !== "player" && lord.side !== "gone" && !lord.captured,
      detail: !Number.isFinite(cost) ? "他不收钱" : `${cost}金 + 一块封地承诺（正统性 −${BRIBE_LEGITIMACY_COST}）`
    }
  };
}

const BRIBE_LEGITIMACY_COST = 4;
// 收买时许下的封地，过一季才来讨。留出这段间隔，是为了让「承诺」有分量：
// 玩家先拿到人和地，一季之后才要为当初随口应下的条件付账。
const FIEF_PROMISE_DUE_MS = 5 * 60 * 1000;
// 说服的正统性收益必须低于攻城拔寨（收复一块地 +3、会战胜利 +2，合计 +5）。
// 原本是 +6：说服比打仗更能涨正统性，而正统性又是说服公式里的加成项 ——
// 说服因此自我供能，每成功一次下一次更容易，滚起来就停不下来。
const PERSUADE_LEGITIMACY_GAIN = 2;

// 说服：阻力归零后要求对方重新宣誓。不花钱、无战损，且提高正统性。
function demandFealty(s, lordId) {
  if (!canPersuadeLord(s, lordId)) return false;
  const lord = officer(s, lordId);
  if (!submitLord(s, lordId, "persuade")) return false;
  s.legitimacy = clamp(s.legitimacy + PERSUADE_LEGITIMACY_GAIN);
  s.style.oath++;
  log(s, "good", `${lord.name}承认渡鸦家的继承权，重新宣誓效忠。`);
  return true;
}

// 收买：金币加封地承诺，见效最快，代价是正统性与忠诚基线。
// promisedFief 只记录，兑现与背弃的事件属后续内容阶段。
function bribeLord(s, lordId, promisedFief) {
  const lord = officer(s, lordId);
  const def = LORD_DEFS[lordId];
  if (!lord || !def || lord.side === "player" || lord.side === "gone" || lord.captured) return false;
  if (!(def.routes?.bribe > 0)) return false;
  const cost = lordBribeCost(s, lordId);
  if (!Number.isFinite(cost) || s.gold < cost) return false;
  s.gold -= cost;
  if (!submitLord(s, lordId, "bribe")) { s.gold += cost; return false; }
  lord.promisedFief = promisedFief || null;
  // 记下许诺的时刻：他不会当场催债，要过一季才来讨这块地。
  lord.promisedAt = lord.promisedFief ? (s.clock?.elapsedMs || 0) : null;
  s.legitimacy = clamp(s.legitimacy - BRIBE_LEGITIMACY_COST);
  s.style.wealth += 2;
  log(s, "warn", `${lord.name}收下${cost}金币与${promisedFief ? TERRITORY_DEFS[promisedFief]?.name || "一块封地" : "一纸空头承诺"}的许诺，换下了旧旗。`);
  return true;
}

const cityIntelActive = (s, id) => (s.cityIntel?.[id] || -1) >= turnOf(s);

// 战争迷雾。此前 cityIntel 只控制一句「斥候情报有效／会过时」的文案，守军数字
// 和守将资料始终可见 —— 斥候是纯装饰，派不派都一样。
//
// 现在只有三种情况看得见一座城的底细：
//   1. 是自己的地
//   2. 斥候情报还没过期（侦察后管两季）
//   3. 与自家版图接壤 —— 边境上的城墙和旗号是瞒不住的，但只给个大概
// 其余一律遮蔽。这样斥候才真正是「打之前先花 20 秒摸一摸」的决策。
const FOG_LEVELS = { clear: "clear", border: "border", dark: "dark" };

function intelLevel(s, id) {
  if (!s || !TERRITORY_DEFS[id]) return FOG_LEVELS.dark;
  if (s.territories?.[id]?.owner === "player") return FOG_LEVELS.clear;
  if (cityIntelActive(s, id)) return FOG_LEVELS.clear;
  const mine = new Set(ownTerritoryIds(s));
  if ((TERRITORY_DEFS[id].adj || []).some(nb => mine.has(nb))) return FOG_LEVELS.border;
  return FOG_LEVELS.dark;
}

// 遮蔽后对外给出的守军读数。接壤时给一个粗略区间，全黑时什么都不给。
function reportedGuard(s, id) {
  const level = intelLevel(s, id);
  const guard = s.territories?.[id]?.guard ?? 0;
  if (level === FOG_LEVELS.clear) return { known: true, text: String(Math.round(guard)) };
  if (level === FOG_LEVELS.border) {
    const step = 15;
    const low = Math.max(0, Math.floor(guard / step) * step);
    return { known: false, text: `约 ${low}–${low + step}` };
  }
  return { known: false, text: "未知" };
}

function cityActionLockKey(id, action) { return `${action}:${id}`; }

function cityActionAvailable(s, id, action) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || !CITY_ACTION_DEFS[action] || s.battleSession) return false;
  if (cityActionJob(s, id) || (s.cooldowns?.[cityActionLockKey(id, action)] || 0) > Date.now()) return false;
  if (action === "scout") return !owns(s, id);
  if (action === "envoy") {
    const lord = lordAt(s, id);
    return !!lord && lord.side !== "player" && lord.side !== "gone" && !lord.captured
      && (LORD_DEFS[lord.id]?.routes?.persuade || 0) > 0;
  }
  return false;
}

function cityActionCostMet(s, action) {
  const cost = CITY_ACTION_DEFS[action]?.cost || {};
  return (s.gold || 0) >= (cost.gold || 0) && (s.grain || 0) >= (cost.grain || 0);
}

function cityActionJob(s, id) {
  return getRunningJob(s, `city:${id}`);
}

function cityAction(s, id, action) {
  if (!cityActionAvailable(s, id, action)) return false;
  if (!cityActionCostMet(s, action)) return false;
  const d = TERRITORY_DEFS[id];
  const cost = CITY_ACTION_DEFS[action].cost;
  s.gold -= cost.gold || 0;
  s.grain -= cost.grain || 0;
  s.cooldowns ||= {};
  s.cooldowns[cityActionLockKey(id, action)] = Date.now() + (CITY_ACTION_COOLDOWNS[action] || 60000);
  const job = startJob(s, {
    type: "CITY_ACTION",
    territoryId: id,
    startedAt: Date.now(),
    durationMs: CITY_ACTION_DURATIONS[action],
    queueKey: `city:${id}`,
    payload: { actionId: action, gold: cost.gold || 0, grain: cost.grain || 0 }
  });
  const text = `${d.name}开始${CITY_ACTION_DEFS[action].name}，预计${formatDuration(CITY_ACTION_DURATIONS[action])}后完成。`;
  s.lastAction = { name: `${d.name} · 行动已安排`, text };
  log(s, "info", text);
  return !!job;
}

function resolveCityAction(s, id, action) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || !CITY_ACTION_DEFS[action]) return false;
  s.cityIntel ||= {};
  if (action === "envoy") {
    const lord = lordAt(s, id);
    if (!lord) return false;
    lord.rapport = Math.min(ENVOY_RAPPORT_CAP, (lord.rapport || 0) + ENVOY_RAPPORT_GAIN);
    const envoyText = `使者带着渡鸦家的礼物见到了${lord.name}，好感提高到 ${lord.rapport}。`;
    s.lastAction = { name: `${d.name} · 派使者`, text: envoyText };
    log(s, "info", envoyText);
    return true;
  }
  if (action !== "scout") return false;
  s.cityIntel[id] = turnOf(s) + 2;
  const text = `斥候从${d.name}带回城防、粮道与地形记录。`;
  s.lastAction = { name: `${d.name} · ${CITY_ACTION_DEFS[action].name}`, text };
  log(s, "info", text);
  return true;
}

function cityActionOptions(s, id) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t) return [];
  const options = ["scout", "envoy", "trade", "raid", "charter", "steward"].filter(action => cityActionAvailable(s, id, action));
  return options.map(action => {
    const def = CITY_ACTION_DEFS[action];
    const cost = [def.cost.gold ? `${def.cost.gold}金` : "", def.cost.grain ? `${def.cost.grain}粮` : ""].filter(Boolean).join(" · ");
    return { id: action, name: def.name, note: `${def.note}${cost ? `（${cost}）` : ""}`, disabled: !cityActionCostMet(s, action) };
  });
}

function crestSvg(faction, title = "") {
  const path = CREST_PATHS[faction] || CREST_PATHS.player;
  return `<svg viewBox="0 0 48 54" role="img" aria-label="${esc(title || FACTIONS[faction]?.name || "家徽")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function glyphSvg(id) {
  return `<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH_PATHS[id] || GLYPH_PATHS.levy}</svg></span>`;
}

function weakestTerritoryId(s, stat = "stability") {
  return ownTerritoryIds(s).sort((a, b) => (s.territories[a][stat] || 0) - (s.territories[b][stat] || 0))[0];
}

function applyEventEffects(s, changes = {}, officerId = null) {
  changes = normalizeEventChanges(changes);
  ["gold", "grain", "support", "morale", "renown", "legitimacy", "warWeariness"].forEach(key => {
    if (changes[key] == null) return;
    s[key] = ["support", "morale", "renown", "legitimacy", "warWeariness"].includes(key) ? clamp((s[key] || 0) + changes[key]) : (s[key] || 0) + changes[key];
  });
  if (changes.stabilityAll) ownTerritoryIds(s).forEach(id => s.territories[id].stability = clamp(s.territories[id].stability + changes.stabilityAll));
  if (changes.stabilityWeak) {
    const id = weakestTerritoryId(s, "stability");
    if (id) s.territories[id].stability = clamp(s.territories[id].stability + changes.stabilityWeak);
  }
  if (changes.guardWeak) {
    const id = weakestTerritoryId(s, "guard");
    if (id) s.territories[id].guard = Math.max(0, s.territories[id].guard + changes.guardWeak);
  }
  if (changes.loyaltyAll || changes.grievanceAll) ownedOfficers(s).filter(o => o.id !== "player").forEach(o => {
    o.loyalty = clamp(o.loyalty + (changes.loyaltyAll || 0));
    o.grievance = clamp(o.grievance + (changes.grievanceAll || 0));
  });
  Object.keys(UNIT_DEFS).forEach(type => { if (changes[type]) addUnits(s, type, changes[type]); });
  const person = officerId ? officer(s, officerId) : null;
  if (person) {
    if (changes.loyalty) person.loyalty = clamp(person.loyalty + changes.loyalty);
    if (changes.grievance) person.grievance = clamp(person.grievance + changes.grievance);
    if (changes.merit) person.merit = Math.max(0, person.merit + changes.merit);
  }
}

function scriptedEventView(s, def, officerId = null) {
  const person = officerId ? officer(s, officerId) : null;
  return {
    kicker: cleanDisplayText(def.kicker || `${person?.title || "家臣"} · 人物事件`),
    title: cleanDisplayText(def.title),
    portrait: def.portrait || person?.portrait || "assets/player.webp",
    body: `<p>${esc(cleanDisplayText(def.body))}</p>`,
    options: def.options.map(([name, note, changes, chronicle]) => ({
      name: cleanDisplayText(name), note: cleanDisplayText(note),
      disabled: (changes.gold < 0 && s.gold < Math.abs(changes.gold)) || (changes.grain < 0 && s.grain < Math.abs(changes.grain)),
      effect() {
        applyEventEffects(s, changes, officerId);
        log(s, changes.support > 0 || changes.loyalty > 0 ? "good" : changes.support < 0 || changes.grievance > 5 ? "warn" : "info", cleanDisplayText(chronicle));
      }
    }))
  };
}

function compositionTotal(comp = {}) {
  return Object.keys(UNIT_DEFS).reduce((sum, type) => sum + Math.max(0, Math.round(comp[type] || 0)), 0);
}

function emptyComposition() {
  return Object.fromEntries(Object.keys(UNIT_DEFS).map(type => [type, 0]));
}

function territoryGarrison(s, territoryId) {
  const t = s?.territories?.[territoryId];
  if (!t) return emptyComposition();
  t.garrison ||= emptyComposition();
  return t.garrison;
}

function playerComposition(s) {
  const split = playerCompositionSplit(s);
  return Object.keys(split.mobile).reduce((total, type) => { total[type] = split.mobile[type] + split.garrison[type]; return total; }, emptyComposition());
}

function playerCompositionSplit(s) {
  const mobile = emptyComposition();
  const garrison = emptyComposition();
  (s?.armies || []).filter(army => army.owner === "player").forEach(army => Object.keys(mobile).forEach(type => { mobile[type] += Math.max(0, Math.round(army.composition?.[type] || 0)); }));
  ownTerritoryIds(s).forEach(id => Object.keys(garrison).forEach(type => { garrison[type] += Math.max(0, Math.round(territoryGarrison(s, id)[type] || 0)); }));
  return { mobile, garrison };
}

function armyTotal(s, armyId = null) {
  if (armyId) return compositionTotal(armyEntity(s, armyId)?.composition);
  const armies = (s?.armies || []).filter(army => army.owner === "player").reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  const garrisons = ownTerritoryIds(s).reduce((sum, id) => sum + compositionTotal(territoryGarrison(s, id)), 0);
  return armies + garrisons;
}

function defaultArmyEntity(s) {
  return {
    id: "army_1",
    name: "渡鸦第一军团",
    owner: "player",
    locationId: "ravenstone",
    destinationId: null,
    composition: { ...emptyComposition(), ...(s.army || {}) },
    leaders: ["player"],
    commanderId: "player",
    morale: s.morale,
    training: s.training,
    supply: 100,
    status: "idle",
    jobId: null
  };
}

function playerArmies(s) {
  return (s?.armies || []).filter(army => army.owner === "player");
}

function nextArmyId(s) {
  const used = new Set((s?.armies || []).map(army => army.id));
  let index = 1;
  while (used.has(`army_${index}`)) index++;
  return `army_${index}`;
}

function armyStatusText(s, army) {
  if (!army) return "未编成";
  const job = army.jobId ? (s.jobs || []).find(item => item.id === army.jobId && item.status === "running") : null;
  if (army.status === "marching") return job ? `行军中 · ${formatDuration(getJobRemainingMs(job))}` : "行军中";
  if (army.status === "recovering") return job ? `整补中 · ${formatDuration(getJobRemainingMs(job))}` : "整补中";
  if (army.status === "engaged") return "交战中";
  if (army.status === "supporting") return "随同出征";
  return "待命";
}

function canUseCommander(s, id, ignoreArmyId = null) {
  if (playerArmies(s).some(army => army.id !== ignoreArmyId && (army.commanderId || army.leaders?.[0]) === id)) return false;
  if (id === "player") return true;
  const knight = knightById(s, id);
  if (!knight || knight.side !== "player" || knight.status !== "active") return false;
  return true;
}

function createArmyFromMain(s, name, commanderId, composition) {
  if (!s || s.battleSession) return false;
  const main = armyEntity(s, "army_1");
  const clean = { ...emptyComposition(), ...(composition || {}) };
  const total = compositionTotal(clean);
  if (!main || main.status !== "idle" || !canUseCommander(s, commanderId) || !name?.trim() || total < 10) return false;
  if (Object.keys(UNIT_DEFS).some(type => clean[type] > (main.composition[type] || 0))) return false;
  if (compositionTotal(main.composition) - total < 10) return false;
  Object.keys(UNIT_DEFS).forEach(type => { main.composition[type] = Math.max(0, (main.composition[type] || 0) - clean[type]); });
  const army = {
    id: nextArmyId(s), name: name.trim().slice(0, 18), owner: "player", locationId: main.locationId,
    destinationId: null, composition: clean, leaders: [commanderId], commanderId,
    morale: s.morale, training: s.training, supply: 100, status: "idle", jobId: null
  };
  s.armies.push(army);
  syncTroops(s);
  s.lastAction = { name: "军团编成", text: `${army.name}在${TERRITORY_DEFS[army.locationId]?.name || "驻地"}组建，由${commanderName(s, commanderId)}带领。` };
  log(s, "good", s.lastAction.text);
  return army;
}

function disbandArmy(s, armyId) {
  if (!s || s.battleSession || armyId === "army_1") return false;
  const army = armyEntity(s, armyId);
  const main = armyEntity(s, "army_1");
  if (!army || !main || army.owner !== "player" || army.status !== "idle") return false;
  if (army.locationId === main.locationId && main.status === "idle") {
    Object.keys(UNIT_DEFS).forEach(type => { main.composition[type] += army.composition[type] || 0; });
  } else {
    const garrison = territoryGarrison(s, army.locationId);
    Object.keys(UNIT_DEFS).forEach(type => { garrison[type] += army.composition[type] || 0; });
  }
  s.armies = s.armies.filter(item => item.id !== armyId);
  syncTroops(s);
  s.lastAction = { name: "军团解散", text: `${army.name}已解散，兵力${army.locationId === main.locationId ? "编回主军" : "留作当地驻军"}。` };
  log(s, "info", s.lastAction.text);
  return true;
}

function armyEntity(s, id = "army_1") {
  const own = (s?.armies || []).find(army => army.id === id);
  if (own) return own;
  return Object.values(s?.factions || {}).flatMap(faction => faction.armies || []).find(army => army.id === id) || null;
}

function ensureAIFactions(s) {
  s.factions ||= {};
  Object.entries(AI_FACTION_DEFS).forEach(([id, def]) => {
    const faction = s.factions[id] ||= { id, ...clone(def), relations: {}, tech: { completed: [] }, armies: [] };
    faction.relations ||= {};
    faction.tech ||= { completed: [] };
    faction.tech.completed ||= [];
    faction.armies = Array.isArray(faction.armies) ? faction.armies : [];
    if (!faction.armies.length) faction.armies.push({
      id: `${id}_army_1`, name: `${FACTIONS[id].name}主力`, owner: id, locationId: def.capital, destinationId: null,
      composition: { ...emptyComposition(), levy: id === "crown" ? 46 : 30, archers: id === "river" ? 15 : 8, knights: id === "crown" ? 10 : 4, heavy_infantry: id === "crown" ? 8 : 3, crossbowmen: id === "crown" ? 5 : 2, light_cavalry: id === "wolf" ? 5 : 2 },
      leaders: id === "wolf" ? ["bran"] : id === "river" ? ["aveline"] : [], morale: 62, training: 10, supply: 100, status: "idle", jobId: null
    });
  });
  return s.factions;
}

function syncArmyEntities(s) {
  if (!s) return;
  s.armies = Array.isArray(s.armies) && s.armies.length ? s.armies : [defaultArmyEntity(s)];
  s.armies.forEach(army => {
    army.name ||= army.id === "army_1" ? "渡鸦第一军团" : "北境军团";
    army.commanderId ||= army.leaders?.[0] || "player";
    army.leaders = [army.commanderId];
    army.composition = { ...emptyComposition(), ...(army.composition || {}) };
    army.morale ??= s.morale;
    army.training ??= s.training;
    army.supply = Math.max(0, Math.min(100, Number(army.supply ?? 100)));
  });
  const main = s.armies[0];
  s.army = clone(main.composition);
}

function syncTroops(s) {
  syncArmyEntities(s);
  s.troops = armyTotal(s);
  return s.troops;
}

function addUnits(s, type, amount, territoryId = primaryTerritoryId(s)) {
  const garrison = territoryGarrison(s, territoryId);
  garrison[type] = Math.max(0, Math.round((garrison[type] || 0) + amount));
  return syncTroops(s);
}

function removeFromComposition(comp, amount) {
  let left = Math.min(compositionTotal(comp), Math.max(0, Math.round(amount)));
  const removed = emptyComposition();
  for (const type of Object.keys(UNIT_DEFS)) {
    const take = Math.min(comp[type] || 0, left);
    comp[type] = Math.max(0, (comp[type] || 0) - take);
    removed[type] += take;
    left -= take;
  }
  return removed;
}

function removeTroops(s, amount) {
  let left = Math.max(0, Math.round(amount));
  const removed = emptyComposition();
  const pools = [
    ...ownTerritoryIds(s).map(id => territoryGarrison(s, id)),
    ...(s.armies || []).filter(army => army.owner === "player").map(army => army.composition)
  ];
  pools.forEach(comp => {
    if (left <= 0) return;
    const part = removeFromComposition(comp, left);
    Object.keys(removed).forEach(type => { removed[type] += part[type]; });
    left -= compositionTotal(part);
  });
  syncTroops(s);
  return removed;
}

function deployGarrison(s, territoryId, armyId = "army_1") {
  const army = armyEntity(s, armyId);
  const garrison = territoryGarrison(s, territoryId);
  if (!army || army.owner !== "player" || army.status !== "idle" || army.locationId !== territoryId || compositionTotal(garrison) <= 0) return false;
  Object.keys(UNIT_DEFS).forEach(type => {
    army.composition[type] = Math.max(0, (army.composition[type] || 0) + (garrison[type] || 0));
    garrison[type] = 0;
  });
  syncTroops(s);
  const text = `${TERRITORY_DEFS[territoryId].name}驻军编入${army.name}。`;
  s.lastAction = { name: "补充军团", text };
  log(s, "info", text);
  return true;
}

function selectedComposition(s, troops, armyId = "army_1") {
  const source = armyEntity(s, armyId)?.composition || s.army || emptyComposition();
  const total = Math.max(1, compositionTotal(source));
  const selected = clamp(Math.round(troops), 0, total);
  const ratio = selected / total;
  const result = emptyComposition();
  Object.keys(UNIT_DEFS).forEach(type => { result[type] = Math.min(source[type] || 0, Math.floor((source[type] || 0) * ratio)); });
  let missing = selected - compositionTotal(result);
  for (const type of Object.keys(UNIT_DEFS)) {
    if (missing <= 0) break;
    const room = Math.max(0, (source[type] || 0) - result[type]);
    const add = Math.min(room, missing);
    result[type] += add;
    missing -= add;
  }
  return result;
}

function compositionText(comp) {
  return Object.entries(UNIT_DEFS).filter(([type]) => (comp[type] || 0) > 0).map(([type, unit]) => `${unit.short}${Math.round(comp[type] || 0)}`).join(" · ") || "无兵力";
}

function unitTerrainMultiplier(type, tags = []) {
  if (tags.includes("plains")) return { levy: .92, archers: 1.05, knights: 2.02, heavy_infantry: 1.18, crossbowmen: 1.08, light_cavalry: 1.65 }[type] || 1;
  if (tags.includes("forest")) return { levy: .98, archers: 1.34, knights: 1.2, heavy_infantry: 1.08, crossbowmen: 1.2, light_cavalry: .86 }[type] || 1;
  if (tags.includes("mountain")) return { levy: 1.02, archers: 1.28, knights: 1.18, heavy_infantry: 1.22, crossbowmen: 1.18, light_cavalry: .82 }[type] || 1;
  if (tags.includes("river")) return { levy: .98, archers: 1.24, knights: 1.28, heavy_infantry: 1.08, crossbowmen: 1.18, light_cavalry: .9 }[type] || 1;
  if (tags.includes("capital")) return { levy: 1, archers: 1.02, knights: 1.34, heavy_infantry: 1.2, crossbowmen: 1.18, light_cavalry: .9 }[type] || 1;
  return { levy: .92, archers: 1.1, knights: 1.7, heavy_infantry: 1.15, crossbowmen: 1.12, light_cavalry: 1.25 }[type] || 1;
}

function unitLevel(s, type) {
  const unit = UNIT_DEFS[type];
  if (!unit) return 1;
  const tech = (unit.equipmentTech || []).reduce((sum, id) => sum + techLevel(s, id), 0);
  const barracks = ownTerritoryIds(s).reduce((max, id) => Math.max(max, s.territories[id].buildings?.barracks || 0), 0);
  return Math.max(1, Math.min(5, 1 + Math.floor(tech / 2) + Math.floor(barracks / 3)));
}

function unitEquipment(s, type) {
  const unit = UNIT_DEFS[type] || UNIT_DEFS.levy;
  const level = unitLevel(s, type);
  return { level, attack: Math.round(unit.attack * (1 + (level - 1) * .1) * 100), defense: Math.round(unit.defense * (1 + (level - 1) * .09) * 100), hp: Math.round(unit.hp * (1 + (level - 1) * .12)) };
}

function counterMultiplier(attacker, defender) {
  const attackTotal = Math.max(1, compositionTotal(attacker));
  const defendTotal = Math.max(1, compositionTotal(defender));
  let advantage = 0;
  Object.entries(attacker).forEach(([a, count]) => Object.entries(defender).forEach(([d, enemyCount]) => {
    if (!count || !enemyCount) return;
    const unit = UNIT_DEFS[a];
    if (unit?.counters?.includes(d)) advantage += count * enemyCount;
    if (unit?.weakTo?.includes(d)) advantage -= count * enemyCount;
  }));
  return Math.max(.74, Math.min(1.3, 1 + advantage / Math.max(1, attackTotal * defendTotal) * .55));
}

function compositionPower(comp, targetId, planId, seasonId, s = null) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  const seasonMult = seasonId === "winter" ? .88 : seasonId === "spring" ? .94 : seasonId === "summer" ? 1.04 : 1;
  return Object.keys(UNIT_DEFS).reduce((sum, type) => {
    const equipment = s ? unitEquipment(s, type) : { attack: Math.round(UNIT_DEFS[type].attack * 100) };
    let planMult = planId === "ambush" && ["archers", "crossbowmen"].includes(type) ? 1.12 : planId === "assault" && ["knights", "light_cavalry"].includes(type) ? 1.08 : 1;
    return sum + (comp[type] || 0) * (equipment.attack / 100) * unitTerrainMultiplier(type, tags) * seasonMult * planMult;
  }, 0);
}

function campaignSupply(s, troops, leaderIds = [], armyId = "army_1") {
  const comp = selectedComposition(s, troops, armyId);
  return compositionSupply(s, comp, leaderIds);
}

function compositionSupply(s, comp = {}, leaderIds = []) {
  let amount = Math.ceil(Object.entries(comp).reduce((sum, [type, count]) => sum + count * (UNIT_DEFS[type]?.supply || 1), 0) / 8);
  if (seasonOf(s).id === "winter") amount = Math.ceil(amount * 1.35);
  if (leaderIds.includes("ysabel")) amount = Math.ceil(amount * .84);
  return Math.max(1, amount);
}

function allocateLosses(comp, totalLoss) {
  const remaining = clone(comp);
  const result = emptyComposition();
  const risks = Object.fromEntries(Object.entries(UNIT_DEFS).map(([type, unit]) => [type, type === "heavy_infantry" || type === "knights" ? .48 : type === "archers" || type === "crossbowmen" ? .72 : 1]));
  let left = Math.min(Math.round(totalLoss), Object.values(comp).reduce((a, b) => a + b, 0));
  while (left > 0) {
    const candidates = Object.keys(UNIT_DEFS).filter(type => remaining[type] > 0).sort((a, b) => remaining[b] * risks[b] - remaining[a] * risks[a]);
    if (!candidates.length) break;
    const type = candidates[0];
    remaining[type]--;
    result[type]++;
    left--;
  }
  return result;
}

