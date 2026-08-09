import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const game = require("../app.js");

const SEASON = game.TIME_CONFIG.seasonDurationMs;

const s = game.createInitialState("时钟测试", "oath", "standard");
assert.equal(game.turnOf(s), 0, "开局在第 0 季");
assert.equal(s.turn, undefined, "turn 不应再作为存储字段存在");
assert.equal(game.seasonOf(s).id, "spring");
assert.equal(game.yearOf(s), 1);

// 季节与年份必须能从 elapsedMs 在任意时刻正确派生
const cases = [
  [0, 0, "spring", 1], [SEASON - 1, 0, "spring", 1], [SEASON, 1, "summer", 1],
  [SEASON * 2, 2, "autumn", 1], [SEASON * 3, 3, "winter", 1],
  [SEASON * 4, 4, "spring", 2], [SEASON * 47, 47, "winter", 12]
];
for (const [elapsed, turn, season, year] of cases) {
  s.clock.elapsedMs = elapsed;
  assert.equal(game.turnOf(s), turn, `elapsed=${elapsed} 应为第 ${turn} 季`);
  assert.equal(game.seasonOf(s).id, season, `elapsed=${elapsed} 应为 ${season}`);
  assert.equal(game.yearOf(s), year, `elapsed=${elapsed} 应为第 ${year} 年`);
}

// 距离换季的剩余时间
s.clock.elapsedMs = SEASON * 2 + 60000;
assert.equal(game.getSeasonRemainingMs(s), SEASON - 60000, "换季倒计时应由 elapsedMs 推出");

console.log("clock tests passed");
