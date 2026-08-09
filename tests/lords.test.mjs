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

console.log("lords tests passed");
