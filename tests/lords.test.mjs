import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

const s = game.createInitialState("领主测试", "oath", "standard");

// 每块非玩家的可占领地都有守将，且守将存在于名册
const rebelHeld = game.playableTerritoryIds().filter(id => s.territories[id].owner !== "player");
assert.equal(rebelHeld.length, 20, "开局应有 20 块叛臣领地");
for (const id of rebelHeld) {
  const lordId = s.territories[id].lordId;
  assert.ok(lordId, `${id} 缺少 lordId`);
  assert.ok(game.LORD_DEFS[lordId], `${id} 的 lordId ${lordId} 不在名册中`);
}
// 玩家领地没有叛臣守将
for (const id of game.playableTerritoryIds().filter(id => s.territories[id].owner === "player")) {
  assert.equal(s.territories[id].lordId, null, `${id} 是玩家领地，不应有叛臣守将`);
}
// 派生函数
assert.equal(game.lordAt(s, "highpass").id, "bran");
assert.equal(game.lordAt(s, "ravenstone"), null);
assert.deepEqual(game.lordHoldings(s, "bran"), ["highpass"], "布兰只直辖北境关，附庸的地不算他的");
assert.deepEqual(game.lordVassals(s, "bran").map(l => l.id).sort(), ["harald", "morton", "otto", "roderic", "selma"]);
assert.deepEqual(game.lordVassals(s, "renard"), [], "独立叛臣没有附庸");

// 打下一块地后，该地不再有守将
s.territories.highpass.owner = "player";
s.territories.highpass.lordId = null;
assert.equal(game.lordAt(s, "highpass"), null);
assert.deepEqual(game.lordHoldings(s, "bran"), [], "失去全部辖地的领主辖地列表为空");

// 空 lordId 必须返回空集：所有独立叛臣的 liege 都是 null，
// 不加这层保护会把他们全部当成「某个 null 主君的附庸」返回。
assert.deepEqual(game.lordVassals(s, null), [], "lordVassals(null) 不应返回独立叛臣");
assert.deepEqual(game.lordVassals(s, undefined), [], "lordVassals(undefined) 不应返回独立叛臣");
assert.deepEqual(game.lordHoldings(s, null), [], "lordHoldings(null) 不应返回玩家领地");

const ks = game.createInitialState("骑士依附", "oath", "standard");
const beren = ks.knights.find(k => k.id === "knight_2");
assert.equal(beren.liegeLordId, "player", "开局死忠骑士效忠玩家");
assert.equal(beren.side, "player");
assert.equal(beren.status, "active");
assert.equal(ks.knights.find(k => k.id === "knight_9").liegeLordId, "bran");
assert.equal(ks.knights.find(k => k.id === "knight_17").liegeLordId, "regent");
const free = ks.knights.filter(k => k.liegeLordId === null);
assert.deepEqual(free.map(k => k.id).sort(), ["knight_1", "knight_8"], "两名游侠骑士不依附任何领主");
// 名册里每个 knights 条目都必须对应真实骑士，且不重复
const claimed = Object.values(game.LORD_DEFS).flatMap(d => d.knights);
assert.equal(new Set(claimed).size, claimed.length, "同一名骑士不能被两名领主认领");
assert.ok(claimed.every(id => ks.knights.some(k => k.id === id)), "名册引用了不存在的骑士");

// 归属不变式：side 与 liegeLordId 必须同进同退，否则 Task 8「处死领主 → 其骑士转死敌」
// 会按 liegeLordId 把玩家自己招募来的骑士也一并变成死敌。
const inv = game.createInitialState("归属不变式", "oath", "standard");
const rover = inv.knights.find(k => !k.liegeLordId && k.status === "available");
assert.ok(rover, "应存在可直接招募的无主游侠");
assert.ok(game.knightAction(rover.id, "recruit", inv));
game.processCompletedJobs(inv, inv.jobs.at(-1).endAt);
const hired = inv.knights.find(k => k.id === rover.id);
assert.equal(hired.side, "player");
assert.equal(hired.liegeLordId, "player", "招募后 liegeLordId 必须改指玩家，不能停留在旧主君");

// 仍效忠叛臣的骑士不能被金币直接买走，否则整条「收服领主」路线可以被绕开
const sworn = inv.knights.find(k => k.liegeLordId && k.liegeLordId !== "player" && k.status === "available");
assert.ok(sworn, "应存在效忠于叛臣的骑士");
assert.equal(game.knightAction(sworn.id, "recruit", inv), false, `${sworn.id} 效忠 ${sworn.liegeLordId}，不应能被直接招募`);
assert.ok(game.availableKnights(inv).every(k => !k.liegeLordId), "可招募名单里不应出现有主君的骑士");

console.log("lords tests passed");
