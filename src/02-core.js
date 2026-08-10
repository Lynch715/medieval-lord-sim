"use strict";

// 运行时全局与工具、骑士名册构造、时钟与调度器、任务队列、科技与开城条件、
// 事件表规范化（末尾两行在加载期就对 01 的事件数据做规范化）。

let S = null;
let creatorDifficulty = "standard";
let prologueIndex = 0;
let toastTimer = 0;
let worldTimer = 0;
let hiddenAt = 0;

// 发展页的折叠状态。放在运行时而不是存档里：这是「界面上展开了哪几项」，
// 不是游戏进度，不该占存档字段、也不该有迁移。
// 必须存在渲染之外 —— 每次建造或研究都会 renderAll() 重建整个面板，
// 状态若只留在 DOM 上，玩家一点建造，刚展开的那块地就自己合上了。
const foldState = { territories: new Set(), branches: new Set(), seeded: false };

const $ = id => typeof document === "undefined" ? null : document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
const clone = value => JSON.parse(JSON.stringify(value));
const seasonOf = s => SEASONS[turnOf(s) % 4];
const yearOf = s => Math.floor(turnOf(s) / 4) + 1;
const difficultyOf = s => DIFFICULTIES[s.difficulty] || DIFFICULTIES.standard;
const officer = (s, id) => s.officers.find(o => o.id === id);
const ownedOfficers = s => s.officers.filter(o => o.side === "player");
const ownTerritoryIds = s => Object.keys(s.territories).filter(id => TERRITORY_DEFS[id]?.playable !== false && s.territories[id].owner === "player");
const owns = (s, id) => s.territories[id]?.owner === "player";

// 返回的是运行时 officer 记录（含 side/loyalty 等可变字段），不是 LORD_DEFS 静态条目。
// 契约：返回 null 同时代表「此地无守将」和「lordId 指向了不存在的领主」两种情况，
// 调用方无法区分——数据损坏由 selfCheck() 负责发现。
function createKnightRoster() {
  return KNIGHT_DEFS.map(def => ({ ...clone(def), captured: false, recruitedAt: 0 }));
}

function knightById(s, id) {
  return (s?.knights || []).find(knight => knight.id === id) || null;
}

// 军团指挥官只保留两类：玩家王子，或没有立绘的骑士。
// 旧存档里的领主编制仍然保留作兼容，但新军团不会再把领主当作军团长。
function commanderById(s, id) {
  if (id === "player") return officer(s, id);
  return knightById(s, id) || officer(s, id) || null;
}

function commanderName(s, id) {
  return commanderById(s, id)?.name || "未任命指挥官";
}

function commanderStats(s, id) {
  const person = commanderById(s, id);
  if (!person) return { force: 0, command: 0, scheme: 0, govern: 0, charm: 0 };
  return person.stats || { force: person.force || 0, command: person.command || 0, scheme: person.scheme || 0, govern: 0, charm: 0 };
}

function armyCommander(s, army) {
  const id = army?.commanderId || army?.leaders?.[0] || "player";
  return { id, person: commanderById(s, id), isKnight: !!knightById(s, id) };
}

function activeKnights(s) {
  return (s?.knights || []).filter(knight => knight.side === "player" && knight.status === "active");
}

function assignedCommanderIds(s) {
  return new Set((s?.armies || []).filter(army => army.owner === "player").map(army => army.commanderId || army.leaders?.[0]).filter(Boolean));
}

function knightBattleMultiplier(s, selectedIds = null) {
  const roster = selectedIds ? activeKnights(s).filter(knight => selectedIds.includes(knight.id)) : activeKnights(s);
  const coefficient = roster.reduce((sum, knight) => sum + ((knight.force || 50) + (knight.command || 45)) / 200 * .008, 0);
  return 1 + Math.min(.24, coefficient);
}

// 只有无主的游侠骑士可以直接用金币招募。仍效忠某位叛臣的骑士必须先收服其主君，
// 否则玩家可以绕开整条「收服领主」路线，花几十金把敌方骑士团买空。
function availableKnights(s) {
  return (s?.knights || []).filter(knight => knight.status === "available" && knight.side === "neutral" && !knight.liegeLordId);
}

function makeClock(elapsedMs = 0, now = Date.now()) {
  return { startedAt: now, elapsedMs: Math.max(0, Math.round(elapsedMs)), lastProcessedAt: now };
}

function initClock(s, now = Date.now()) {
  if (!s) return null;
  s.clock = makeClock(0, now);
  return s.clock;
}

function turnOf(s) {
  return Math.floor((s?.clock?.elapsedMs || 0) / TIME_CONFIG.seasonDurationMs);
}

function getSeasonRemainingMs(s) {
  const elapsed = s?.clock?.elapsedMs || 0;
  return TIME_CONFIG.seasonDurationMs - (elapsed % TIME_CONFIG.seasonDurationMs);
}

function initTimers(s, now = Date.now()) {
  s.timers = {};
  Object.entries(TIMER_DEFS).forEach(([key, def]) => { s.timers[key] = { nextAt: now + def.intervalMs }; });
  return s.timers;
}

// 返回最早到期的事件：计时器或任务，二者同构（都由绝对时刻驱动）。
function nextDueEvent(s, now) {
  let best = null;
  Object.entries(s.timers || {}).forEach(([key, timer]) => {
    if (timer.nextAt <= now && (!best || timer.nextAt < best.at)) best = { at: timer.nextAt, kind: "timer", key };
  });
  (s.jobs || []).forEach(job => {
    if (job.status === "running" && job.endAt <= now && (!best || job.endAt < best.at)) best = { at: job.endAt, kind: "job", key: job.id };
  });
  return best;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatResourceRate(value, unit) {
  // 以“每小时”展示，避免低流量出现模糊的小数；这里只改变显示单位，不改变资源结算。
  const perHour = Math.round(value * 3600);
  if (perHour === 0 && Math.abs(value) > 0) return value > 0 ? `+1${unit}/时` : `−1${unit}/时`;
  return `${perHour > 0 ? "+" : perHour < 0 ? "−" : ""}${Math.abs(perHour)}${unit}/时`;
}

function formatSeasonCoefficient(value) {
  return `${Math.round(value * 100)}%`;
}

function getQueueUsage(s, queueKey) {
  return (s?.jobs || []).filter(job => job.status === "running" && job.queueKey === queueKey).length;
}

function getRunningJob(s, queueKey) {
  return (s?.jobs || []).find(job => job.status === "running" && job.queueKey === queueKey) || null;
}

function techDefinition(branch, techId) {
  return (TECH_DEFS[branch] || []).find(tech => tech.id === techId) || null;
}

function techMaxLevel(tech) {
  return Math.max(1, Math.round(tech?.maxLevel || TECH_MAX_LEVEL));
}

function techLevel(s, techId) {
  for (const [branch, techs] of Object.entries(TECH_DEFS)) {
    const tech = techs.find(item => item.id === techId);
    if (!tech) continue;
    const state = s?.tech?.[branch] || {};
    const stored = state.levels?.[techId];
    if (Number.isFinite(stored)) return Math.max(0, Math.min(techMaxLevel(tech), Math.round(stored)));
    return state.completed?.includes(techId) ? 1 : 0;
  }
  return 0;
}

// 阶数成本增长。原本是 .55：三阶要 2.1 倍成本却只给 3 倍线性效果，
// 也就是说往深了点是亏的 —— 没人走深不只是买不起，是不划算。
// 降到 .32 后三阶为 1.64 倍成本、3 倍效果，深度终于值得投。
const TECH_LEVEL_COST_GROWTH = .32;

function techCost(tech, level) {
  const next = Math.max(1, Math.round(level || 1));
  const growth = 1 + (next - 1) * TECH_LEVEL_COST_GROWTH;
  return { knowledge: Math.round(tech.cost.knowledge * growth), gold: Math.round(tech.cost.gold * growth) };
}

function researchDuration(tech, level) {
  return (45 + Math.max(0, Math.round(level || 1) - 1) * 15) * 1000;
}

function techCompleted(s, techId) {
  return techLevel(s, techId) > 0;
}

function marchDuration(s) {
  return Math.max(20 * 1000, Math.round(JOB_CONFIG.MARCH.durationMs * (1 - techLevel(s, "field_doctrine") * .25)));
}

function territoryDistance(originId, destinationId) {
  const origin = MAP_POINTS[originId];
  const destination = MAP_POINTS[destinationId];
  if (!origin || !destination) return 1;
  return Math.max(1, Math.round(Math.hypot(destination[0] - origin[0], destination[1] - origin[1]) / 8));
}

function marchDurationForDistance(s, originId, destinationId) {
  const distance = territoryDistance(originId, destinationId);
  return Math.max(20 * 1000, Math.round(marchDuration(s) * (0.72 + distance * 0.16)));
}

// 「扩容队列」本身是一个成长目标：学宫每 5 级多开一条研究线。
function researchCapacity(s) {
  const academyLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.academy || 0), 0);
  return 1 + Math.floor(academyLevels / 5);
}

function runningResearchJobs(s) {
  return (s?.jobs || []).filter(job => job.status === "running" && job.type === "RESEARCH");
}

function researchQueueJob(s, techId = null) {
  const jobs = runningResearchJobs(s);
  return (techId ? jobs.find(job => job.payload?.techId === techId) : jobs[0]) || null;
}

function canResearch(s, branch, techId) {
  const tech = techDefinition(branch, techId);
  const branchState = s?.tech?.[branch];
  const currentLevel = techLevel(s, techId);
  const nextLevel = currentLevel + 1;
  if (!tech || !branchState || currentLevel >= techMaxLevel(tech)) return false;
  if (researchQueueJob(s, techId)) return false;                       // 同一项不能重复排队
  if (runningResearchJobs(s).length >= researchCapacity(s)) return false;
  if (tech.requires.some(id => !techCompleted(s, id))) return false;
  const cost = techCost(tech, nextLevel);
  return s.knowledge >= cost.knowledge && s.gold >= cost.gold;
}

// 公爵的三块直辖地。三块分处三个方向、各自躲在一条长廊后面，
// 要求全部到手等于三场独立的远征——实测机器人平均只能拿到 0.39 块。
// 因此开城只卡「公爵大道」这条通往王城的路（叙事上也最顺），
// 另外两块仍然有用：每拿下一块都会推迟加冕。
const DUCHY_HOLDINGS = ["duchyroad", "crownfield", "kingsford"];
const CROWN_GATE_HOLDING = "duchyroad";

function crownRequirements(s) {
  return {
    duchy: owns(s, CROWN_GATE_HOLDING),
    renown: (s?.renown || 0) >= 60,
    siege: techCompleted(s, "war_engineering"),
    army: armyTotal(s, "army_1") >= 80
  };
}

function crownAccessMet(s) {
  const requirements = crownRequirements(s);
  return Object.values(requirements).every(Boolean);
}

function crownRequirementText(s) {
  const requirements = crownRequirements(s);
  const missing = [];
  if (!requirements.duchy) missing.push(`切断${TERRITORY_DEFS[CROWN_GATE_HOLDING].name}`);
  if (!requirements.renown) missing.push("威望60");
  if (!requirements.siege) missing.push("完成攻城工程");
  if (!requirements.army) missing.push("王国主力80人");
  return missing.length ? `还需：${missing.join("、")}` : "已满足进军王冠谷的条件";
}

function primaryTerritoryId(s) {
  return ownTerritoryIds(s)[0] || "ravenstone";
}

function recruitmentTerritoryId(s) {
  const army = armyEntity(s, "army_1");
  return army && army.owner === "player" && army.status === "idle" && owns(s, army.locationId) ? army.locationId : primaryTerritoryId(s);
}

function getJobRemainingMs(job, now = Date.now()) {
  return Math.max(0, (job?.endAt || now) - now);
}

function pauseWorld(s, reason = "event", now = Date.now()) {
  if (!s || s.pauseState) return false;
  s.pauseState = { pausedAt: now, reason };
  return true;
}

function resumeWorld(s, now = Date.now()) {
  if (!s?.pauseState) return false;
  const pausedAt = s.pauseState.pausedAt;
  const delta = Math.max(0, now - pausedAt);
  if (delta > 0) {
    (s.jobs || []).filter(job => job.status === "running").forEach(job => {
      job.startedAt += delta;
      job.endAt += delta;
    });
    Object.values(s.timers || {}).forEach(timer => { timer.nextAt += delta; });
    if (s.clock) s.clock.lastProcessedAt = now;
  }
  s.pauseState = null;
  return true;
}

function startJob(s, job = {}) {
  if (!s) return null;
  s.jobs ||= [];
  const now = Number.isFinite(job.startedAt) ? job.startedAt : Date.now();
  const endAt = Number.isFinite(job.endAt) ? job.endAt : now + Math.max(0, job.durationMs || 0);
  const record = {
    id: job.id || `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: job.type || "BUILD",
    territoryId: job.territoryId || null,
    armyId: job.armyId || null,
    startedAt: now,
    endAt,
    status: "running",
    payload: job.payload || {},
    queueKey: job.queueKey || `${job.type || "BUILD"}:${job.territoryId || "global"}`
  };
  s.jobs.push(record);
  return record;
}

function finishJob(s, job, now = Date.now(), rng = Math.random) {
  if (!job || job.status !== "running") return false;
  job.status = "completed";
  job.completedAt = now;
  applyCompletedJob(s, job, rng);
  return true;
}

function cancelJob(s, jobId) {
  const job = (s?.jobs || []).find(item => item.id === jobId && item.status === "running");
  if (!job) return false;
  job.status = "cancelled";
  job.cancelledAt = Date.now();
  if (job.type === "MARCH") {
    const groupIds = job.payload?.armyIds || [job.armyId];
    groupIds.map(id => armyEntity(s, id)).filter(Boolean).forEach(army => { army.destinationId = null; army.status = "idle"; army.jobId = null; });
  }
  return true;
}

function processCompletedJobs(s, now = Date.now(), rng = Math.random) {
  let completed = 0;
  (s?.jobs || []).slice().sort((a, b) => a.endAt - b.endAt).forEach(job => {
    if (job.status === "running" && getJobRemainingMs(job, now) <= 0 && finishJob(s, job, now, rng)) completed++;
  });
  return completed;
}

function startArmyRecovery(s, army, durationMs = JOB_CONFIG.RECOVER.durationMs, now = Date.now()) {
  if (!s || !army) return null;
  const existing = army.jobId && (s.jobs || []).find(job => job.id === army.jobId && job.status === "running");
  if (existing) return existing;
  const job = startJob(s, {
    type: "RECOVER", armyId: army.id, startedAt: now, endAt: now + durationMs,
    queueKey: `recover:${army.id}`, payload: { durationMs }
  });
  army.status = "recovering";
  army.jobId = job.id;
  army.destinationId = null;
  return job;
}

function applyCompletedJob(s, job, rng = Math.random) {
  if (!s || !job) return false;
  if (job.type === "CITY_ACTION") {
    return resolveCityAction(s, job.territoryId, job.payload?.actionId);
  }
  if (job.type === "OFFICER_RECRUIT") {
    const recruit = officer(s, job.payload?.officerId);
    if (!recruit || recruit.side !== "neutral") return false;
    recruit.side = "player";
    recruit.loyalty = clamp(job.payload?.startingLoyalty || 58);
    recruit.grievance = 0;
    recruit.recruitedAt = turnOf(s);
    const text = `${recruit.name}接受封赏，正式加入你的领主议会。`;
    s.lastAction = { name: "领主招募完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "KNIGHT_ACTION") {
    const knight = knightById(s, job.payload?.knightId);
    const action = job.payload?.actionId;
    if (!knight) return false;
    if (action === "recruit" || action === "surrender") {
      knight.side = "player";
      knight.liegeLordId = "player";
      knight.status = "active";
      knight.loyalty = clamp(Math.round(job.payload?.loyalty || (action === "surrender" ? 42 : 58)));
      knight.recruitedAt = turnOf(s);
      const text = `${knight.name}披挂入列，成为你的骑士。`;
      s.lastAction = { name: "骑士加入", text };
      log(s, "good", text);
      return true;
    }
    if (action === "execute") {
      knight.status = "executed";
      knight.side = "gone";
      knight.liegeLordId = null;
      const text = `${knight.name}被处死，敌方骑士团士气受挫。`;
      s.lastAction = { name: "处死骑士", text };
      log(s, "warn", text);
      return true;
    }
    if (action === "release") {
      // 放人之前先记下他原本效忠谁——释放会清空 liegeLordId
      const formerLiege = officer(s, knight.liegeLordId);
      knight.status = "released";
      knight.side = "neutral";
      knight.liegeLordId = null;
      if (formerLiege && formerLiege.side !== "player" && formerLiege.side !== "gone") {
        formerLiege.rapport = Math.min(100, (formerLiege.rapport || 0) + RELEASE_RAPPORT_GAIN);
        gainLegitimacy(s, "returnKnight");
        log(s, "good", `${formerLiege.name}听说你放回了他的骑士，对渡鸦家的态度缓和了。`);
      }
      knight.captured = false;
      const text = `${knight.name}获释离开，今后可能在别处重新出现。`;
      s.lastAction = { name: "释放骑士", text };
      log(s, "info", text);
      return true;
    }
    return false;
  }
  if (job.type === "BUILD") {
    const territory = s.territories[job.territoryId];
    const type = job.payload?.buildingType;
    if (!territory || !BUILDINGS[type]) return false;
    territory.buildings[type] = Math.min(BUILDING_MAX_LEVEL, (territory.buildings[type] || 0) + 1);
    if (type === "barracks") territory.guard += 7;
    if (type === "walls") territory.guard += 5;
    if (type === "watchtower") territory.guard += 3;
    territory.stability = clamp(territory.stability + 3);
    s.style.wealth++;
    const text = `${TERRITORY_DEFS[job.territoryId].name}完成${BUILDINGS[type].name}第${territory.buildings[type]}级建设。`;
    s.lastAction = { name: "领地建设完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RECRUIT") {
    const type = job.payload?.unitType;
    const amount = Math.max(0, Math.round(job.payload?.amount || 0));
    if (!UNIT_DEFS[type] || amount <= 0) return false;
    addUnits(s, type, amount, job.territoryId || primaryTerritoryId(s));
    if (type === "levy") s.support = clamp(s.support - 2);
    s.style.iron++;
    const place = TERRITORY_DEFS[job.territoryId || primaryTerritoryId(s)]?.name || "本领地";
    const text = `${place}的${amount}名${UNIT_DEFS[type].name}完成训练，编入当地驻军。`;
    s.lastAction = { name: "征募完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RESEARCH") {
    const branch = job.payload?.branch;
    const techId = job.payload?.techId;
    const tech = techDefinition(branch, techId);
    if (!tech || !s.tech?.[branch]) return false;
    const nextLevel = Math.max(1, Math.min(techMaxLevel(tech), Math.round(job.payload?.level || techLevel(s, techId) + 1)));
    s.tech[branch].levels ||= {};
    s.tech[branch].levels[techId] = nextLevel;
    if (!s.tech[branch].completed.includes(techId)) s.tech[branch].completed.push(techId);
    s.tech[branch].level = Object.values(s.tech[branch].levels).reduce((sum, level) => sum + Number(level || 0), 0);
    const text = `研究完成：${tech.name}第${nextLevel}阶。${tech.desc}`;
    s.lastAction = { name: "科技研究完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "MARCH") {
    const army = armyEntity(s, job.armyId);
    const destinationId = job.payload?.destinationId;
    if (!army || !TERRITORY_DEFS[destinationId]) return false;
    const originId = job.payload?.originId || army.locationId;
    const groupIds = job.payload?.armyIds || [army.id];
    const groupArmies = groupIds.map(id => armyEntity(s, id)).filter(Boolean);
    groupArmies.forEach(item => {
      item.locationId = destinationId;
      item.destinationId = null;
      item.status = "idle";
      item.jobId = null;
    });
    // AI 抵达非自家领地即交战：打玩家是袭击，打中立割据是吞并。
    const arrivedOwner = s.territories[destinationId]?.owner;
    if (army.owner !== "player" && (arrivedOwner === "player" || arrivedOwner === "neutral")) {
      const result = resolveAIAttack(s, army, destinationId, rng, originId);
      if (result !== "captured") army.locationId = originId;
      startArmyRecovery(s, army, result === "captured" ? 110 * 1000 : 90 * 1000, job.completedAt || Date.now());
    }
    const battlePlan = job.payload?.battlePlan;
    if (army.owner === "player" && battlePlan && s.territories[destinationId]?.owner !== "player") {
      startBattle(s, { ...battlePlan, armyId: army.id, armyIds: groupIds, armyOrigins: job.payload?.armyOrigins, originId, targetId: destinationId, arrival: true, supplyAlreadyPaid: true });
    }
    const text = `${army.name}抵达${TERRITORY_DEFS[destinationId].name}。`;
    s.lastAction = { name: "行军完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RECOVER") {
    const army = armyEntity(s, job.armyId);
    if (!army) return false;
    army.status = "idle";
    army.jobId = null;
    const text = `${army.name}完成整补，可以再次行军或出征。`;
    if (army.owner === "player") s.lastAction = { name: "军团整补完成", text };
    log(s, "info", text);
    return true;
  }
  return false;
}

function unitDisplayHint(type) {
  return UNIT_DISPLAY_HINTS[type] || UNIT_DEFS[type]?.role || "适应多种战场";
}

function normalizeEventLanguage(value) {
  return String(value ?? "")
    .replace(/王室认可/g, "声望")
    .replace(/战争疲劳/g, "军心")
    .replace(/稳定度/g, "民心")
    .replace(/稳定/g, "民心")
    .replace(/功劳/g, "声望")
    .replace(/野心/g, "忠诚")
    .replace(/不满\s*[+]\s*(\d+)/g, "忠诚 −$1")
    .replace(/不满\s*[−-]\s*(\d+)/g, "忠诚 +$1")
    .replace(/不满上升/g, "忠诚下降")
    .replace(/不满下降/g, "忠诚上升")
    .replace(/人口/g, "居民");
}

function collapseEventMetrics(note) {
  let text = note;
  ["金币", "粮食", "军心", "民心", "声望", "忠诚"].forEach(label => {
    const pattern = new RegExp(`${label}\\s*([+−-])\\s*(\\d+)[，,；;]\\s*${label}\\s*([+−-])\\s*(\\d+)`, "g");
    text = text.replace(pattern, (_, signA, amountA, signB, amountB) => {
      const total = (signA === "-" || signA === "−" ? -1 : 1) * Number(amountA) + (signB === "-" || signB === "−" ? -1 : 1) * Number(amountB);
      return `${label} ${total >= 0 ? "+" : "−"}${Math.abs(total)}`;
    });
  });
  return text;
}

function normalizeEventChanges(changes = {}) {
  const next = { ...changes };
  const add = (key, value) => { next[key] = (next[key] || 0) + value; };
  if (next.legitimacy) { add("renown", next.legitimacy); delete next.legitimacy; }
  if (next.warWeariness) { add("morale", next.warWeariness); delete next.warWeariness; }
  if (next.stabilityAll) { add("support", next.stabilityAll); delete next.stabilityAll; }
  if (next.stabilityWeak) { add("support", next.stabilityWeak); delete next.stabilityWeak; }
  if (next.grievanceAll) { add("loyaltyAll", -next.grievanceAll); delete next.grievanceAll; }
  if (next.grievance) { add("loyalty", -next.grievance); delete next.grievance; }
  if (next.merit) { add("renown", next.merit); delete next.merit; }
  delete next.ambition;
  return next;
}

function normalizeEventDefinitions(events) {
  events.forEach(event => {
    event.kicker = normalizeEventLanguage(event.kicker);
    event.title = normalizeEventLanguage(event.title);
    event.body = normalizeEventLanguage(event.body);
    event.options = event.options.map(([name, note, changes, chronicle]) => [
      normalizeEventLanguage(name), collapseEventMetrics(normalizeEventLanguage(note)), normalizeEventChanges(changes), normalizeEventLanguage(chronicle)
    ]);
  });
}

normalizeEventDefinitions(WORLD_EVENTS);
normalizeEventDefinitions(NPC_ARCS);

