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

console.log("migration tests passed");
