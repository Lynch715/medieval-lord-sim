import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

// 版本链：v1 → v2 → v3 → v4，任何一档旧存档都应能一路迁到最新

// 构造一份 v2 存档：含 locked 旧臣、已招募的 maelis、无 lordId、无 liegeLordId
const v2 = JSON.parse(JSON.stringify(game.createInitialState("旧档", "oath", "standard")));
v2.version = 2;
Object.values(v2.territories).forEach(t => { delete t.lordId; });
v2.knights.forEach(k => { delete k.liegeLordId; });
v2.officers = v2.officers.filter(o => o.id !== "regent");
v2.officers.forEach(o => { delete o.rapport; delete o.submitted; if (o.id === "renard") o.side = "locked"; });
v2.officers.push({ id: "maelis", name: "梅利斯·灰帆", side: "player", loyalty: 60, stats: { force: 42, command: 55, scheme: 86, govern: 68, charm: 71 } });
v2.officers.push({ id: "elian", name: "伊莲·鸦羽", side: "neutral", loyalty: 52, stats: { force: 64, command: 72, scheme: 76, govern: 52, charm: 81 } });

const m = game.hydrateState(v2);
assert.ok(m, "v2 存档必须能迁移");
assert.equal(m.version, game.VERSION, "v2 存档应一路迁到最新版");

// 规则 1：非玩家可占领地都补上了 lordId
for (const id of game.playableTerritoryIds().filter(id => m.territories[id].owner !== "player")) {
  assert.ok(m.territories[id].lordId, `${id} 迁移后仍缺 lordId`);
}
// 规则 2：officer 记录补齐叛臣运行时字段
for (const o of m.officers) {
  assert.equal(o.rapport, 0, `${o.id} 缺少 rapport`);
  assert.equal(o.captured, false);
  assert.equal(o.submitted, false);
  assert.equal(o.promisedFief, null);
}
// 规则 3：locked 旧臣转为其座城的叛臣
const renard = m.officers.find(o => o.id === "renard");
assert.notEqual(renard.side, "locked", "旧臣不应再停留在 locked");
assert.equal(m.territories.ashgate.lordId, "renard", "雷纳德应据守灰门");
// 规则 4：已招募的 maelis 保留为无封地的己方领主
const maelis = m.officers.find(o => o.id === "maelis");
assert.ok(maelis && maelis.side === "player", "已招募的浪人应保留");
assert.equal(maelis.tier, "loyal");
assert.equal(maelis.seat, null);
// 规则 5：未招募的 elian 从名册移除
assert.equal(m.officers.find(o => o.id === "elian"), undefined, "未招募的浪人应被移除");
// 规则 6：骑士补 liegeLordId
assert.equal(m.knights.find(k => k.id === "knight_9").liegeLordId, "bran");
assert.equal(m.knights.find(k => k.id === "knight_2").liegeLordId, "player");

assert.equal(game.selfCheck(m).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m).errors)}`);

// v1 仍然能一路迁到 v3
const v1 = JSON.parse(JSON.stringify(v2));
v1.version = 1; v1.ap = 3; delete v1.clock; delete v1.jobs; delete v1.tech;
const m1 = game.migrateSave(v1);
assert.ok(m1 && m1.version === game.VERSION, "v1 应能连续迁移到最新版");
assert.ok(!("ap" in m1));

// —— 中盘存档：真实玩家的存档不是刚开局的，下面这些情形只有中盘档才会暴露 ——
const mid = JSON.parse(JSON.stringify(game.createInitialState("中盘档", "oath", "standard")));
mid.version = 2;
mid.turn = 19;
Object.values(mid.territories).forEach(t => { delete t.lordId; });
mid.knights.forEach(k => { delete k.liegeLordId; });
mid.territories.ashfield.owner = "player";   // 塞尔玛的座城已被攻下
mid.officers.forEach(o => { delete o.rapport; delete o.submitted; if (o.id === "bran") o.side = "gone"; });
const hiredKnight = mid.knights.find(k => k.id === "knight_9");   // 布兰的骑士，旧档里已被玩家招募
hiredKnight.side = "player";
hiredKnight.status = "active";
const goneKnight = mid.knights.find(k => k.id === "knight_10");
goneKnight.side = "gone";
goneKnight.status = "executed";

const mm = game.hydrateState(mid);
assert.ok(mm, "中盘 v2 存档必须能迁移");
assert.equal(game.selfCheck(mm).ok, true, `中盘档迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(mm).errors)}`);
// 已被玩家占领的座城不应再挂守将
assert.equal(mm.territories.ashfield.lordId, null, "玩家已占领的领地不应被迁移重新塞回守将");
assert.deepEqual(game.lordHoldings(mm, "selma"), [], "失去座城的领主辖地应为空");
// 已离场的领主不得被复活
assert.equal(mm.officers.find(o => o.id === "bran").side, "gone", "已离场的领主不应被迁移复活");
// 关键：已属玩家的骑士必须改挂玩家，不能按初始名册挂回原主君
assert.equal(mm.knights.find(k => k.id === "knight_9").liegeLordId, "player",
  "旧档里已被玩家招募的骑士，迁移后必须效忠玩家，否则处死其原主君时会连累玩家自己的骑士");
assert.equal(mm.knights.find(k => k.id === "knight_10").liegeLordId, null, "已离场的骑士不应挂在任何主君名下");
// 幂等
assert.deepEqual(game.hydrateState(JSON.parse(JSON.stringify(mm))), mm, "迁移必须幂等");

assert.equal(game.VERSION, 5, "存档版本应升到 5");

const SEASON_MS = game.TIME_CONFIG.seasonDurationMs;
// v3 中盘存档：有 turn、有 seasonLocks、无 timers、无 cooldowns
const v3 = JSON.parse(JSON.stringify(game.createInitialState("v3中盘", "oath", "standard")));
v3.version = 3;
v3.turn = 19;
v3.clock = { seasonIndex: 19, seasonStartedAt: Date.now(), seasonEndsAt: Date.now() + SEASON_MS, lastProcessedAt: Date.now() };
v3.seasonLocks = { "city_wolfden_scout": 1 };
delete v3.timers; delete v3.cooldowns;

const m4 = game.hydrateState(v3);
assert.ok(m4, "v3 存档必须能迁移");
assert.equal(m4.version, game.VERSION);
assert.equal(game.turnOf(m4), 19, "迁移后派生 turn 应与迁移前一致");
assert.equal(game.seasonOf(m4).id, game.SEASONS[19 % 4].id, "季节不应跳变");
assert.equal(game.yearOf(m4), Math.floor(19 / 4) + 1, "年份不应跳变");
assert.equal(m4.turn, undefined, "turn 不应再作为存储字段保留");
assert.equal(m4.seasonLocks, undefined, "seasonLocks 应被删除");
assert.deepEqual(Object.keys(m4.timers).sort(), ["aiCrown", "aiRiver", "aiWolf", "drift", "events", "season"]);
assert.ok(m4.cooldowns && typeof m4.cooldowns === "object");
assert.equal(game.selfCheck(m4).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m4).errors)}`);

// 进行中的任务剩余时间不应因迁移而跳变
const v3b = JSON.parse(JSON.stringify(v3));
const futureEnd = Date.now() + 25000;
v3b.jobs = [{ id: "job_x", type: "BUILD", territoryId: "ravenstone", startedAt: Date.now(), endAt: futureEnd, status: "running", queueKey: "build:ravenstone", payload: { buildingType: "fields", targetLevel: 2 } }];
const m4b = game.hydrateState(v3b);
assert.equal(m4b.jobs[0].endAt, futureEnd, "迁移不应改动进行中任务的完成时刻");

// v1 仍能一路迁到 v4
const v1b = JSON.parse(JSON.stringify(v3));
v1b.version = 1; v1b.ap = 3; delete v1b.clock; delete v1b.jobs; delete v1b.tech;
const m1b = game.migrateSave(v1b);
assert.ok(m1b && m1b.version === game.VERSION, "v1 应能连续迁移到最新版");
assert.ok(!("ap" in m1b));

// v4 → v5：危机改毫秒、新增加冕、领地补漂移累加器、研究队列键改按科技分
const v4 = JSON.parse(JSON.stringify(game.createInitialState("v4中盘", "oath", "standard")));
v4.version = 4;
v4.crisis = { famine: 2, debt: 0, unrest: 1, checkedTurn: 19 };
delete v4.coronation;
Object.values(v4.territories).forEach(t => { delete t.drift; });
v4.jobs = [{ id: "r1", type: "RESEARCH", startedAt: Date.now(), endAt: Date.now() + 20000, status: "running", queueKey: "research:global", payload: { branch: "agriculture", techId: "heavy_plow", level: 1 } }];

const m5 = game.hydrateState(v4);
assert.ok(m5, "v4 存档必须能迁移");
assert.equal(m5.version, 5);
assert.deepEqual(Object.keys(m5.crisis).sort(), ["famineMs", "unrestMs"], "危机字段应改为毫秒");
assert.equal(m5.crisis.famineMs, 2 * 5 * 60 * 1000, "旧的饥荒计数按每档 5 分钟折算");
assert.ok(m5.coronation && m5.coronation.atElapsedMs > 0, "应补上加冕倒计时");
assert.ok(Object.values(m5.territories).every(t => t.drift), "每块领地都应有漂移累加器");
assert.equal(m5.jobs[0].queueKey, "research:heavy_plow", "旧的全局研究队列键应迁移为按科技分键");
assert.equal(game.selfCheck(m5).ok, true, `迁移后 selfCheck 失败：${JSON.stringify(game.selfCheck(m5).errors)}`);

// 旧的 great_lord / minor_lord 结局在新体系里没有对应物
const v4b = JSON.parse(JSON.stringify(v4));
v4b.ended = true; v4b.endingReason = "great_lord";
assert.equal(game.hydrateState(v4b).endingReason, "crowned", "旧结局应折算为法统旁落");

// v1 仍能一路迁到 v5
const v1c = JSON.parse(JSON.stringify(v4));
v1c.version = 1; v1c.ap = 3; delete v1c.clock; delete v1c.jobs; delete v1c.tech;
const m1c = game.migrateSave(v1c);
assert.ok(m1c && m1c.version === 5, "v1 应能连续迁移到 v5");

console.log("migration tests passed");
