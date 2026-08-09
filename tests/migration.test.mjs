import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

assert.equal(game.VERSION, 3, "存档版本应升到 3");

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
assert.equal(m.version, 3);

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
assert.ok(m1 && m1.version === 3, "v1 应能连续迁移到 v3");
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

console.log("migration tests passed");
