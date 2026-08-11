import assert from "node:assert/strict";
import game from "./_game.mjs";

const ids = game.playableTerritoryIds();
const seasons = {};
game.SEASONS.forEach(x => { seasons[x.id] = x; });

// 造一个「占了 n 块地、带某个编成」的局面，用来量经济曲线。
// 必须从真实开局的四块地往外扩，而不是拿 ids.slice(0, n)：键序里靠前的
// 那几块恰好是高人口低粮产的，用它当「开局」量出来的曲线跟玩家的实际路径无关。
const START = ["ravenstone", "blackthorn", "westmarch", "ironhill"];
const EXPANSION = ids.filter(id => !START.includes(id));
const stage = (count, comp) => {
  const s = game.createInitialState("经济", "oath", "standard");
  const own = START.concat(EXPANSION.slice(0, Math.max(0, count - START.length)));
  Object.keys(s.territories).forEach(id => { s.territories[id].owner = "neutral"; });
  own.forEach(id => { s.territories[id].owner = "player"; });
  game.armyEntity(s, "army_1").composition = { ...comp };
  game.syncTroops(s);
  return s;
};
const yearNet = s => game.SEASONS.reduce((sum, season) => sum + game.forecast(s, season).netGrain, 0);

// ── 居民要吃饭 ────────────────────────────────────────────────────────
// 原先领地只产粮、不吃粮，占地是纯赚：4 地净 +44/季，14 地净 +102/季，
// 盈余随扩张越滚越大。冬季的说明文字里其实一直写着「军队和居民仍会继续
// 消耗粮食」——设计意图当初就写下了，只是从没实现过。
{
  const s = stage(4, { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
  const withPeople = game.forecast(s).grainCost;
  const noPeople = game.createInitialState("对照", "oath", "standard");
  // 把居民清零，粮耗应当明显下降 —— 证明口粮真的计入了
  Object.keys(noPeople.territories).forEach(id => { noPeople.territories[id].owner = "neutral"; });
  ids.slice(0, 4).forEach(id => { noPeople.territories[id].owner = "player"; });
  game.armyEntity(noPeople, "army_1").composition = { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 };
  game.syncTroops(noPeople);
  assert.ok(game.CIVILIAN_GRAIN_PER_HEAD > 0, "居民口粮系数必须存在");
  const expected = Math.ceil(game.subjects(s) / game.CIVILIAN_GRAIN_PER_HEAD);
  assert.ok(withPeople >= expected,
    `粮耗(${withPeople})应至少包含居民口粮(${expected})`);
}

// ── 扩张必须带来粮食压力，而不是纯收益 ────────────────────────────────
{
  const small = stage(4, { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
  const big = stage(16, { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
  const smallPerLand = game.forecast(small).netGrain / 4;
  const bigPerLand = game.forecast(big).netGrain / 16;
  assert.ok(bigPerLand < smallPerLand,
    `同样的军队下，每块地的净粮收益必须随扩张下降（4地 ${smallPerLand.toFixed(1)} → 16地 ${bigPerLand.toFixed(1)}）`);
}

// ── 一个秋天不该养活全年还大幅盈余 ────────────────────────────────────
// 秋季系数原本 1.55，一季就收 +137/+243/+362，冬季那点赤字随手就补上了，
// 全年净额恒为正且随扩张变大——「囤粮过冬」这个循环因此完全不存在。
{
  const mid = stage(9, { levy: 70, archers: 24, knights: 12, heavy_infantry: 10, crossbowmen: 0, light_cavalry: 0 });
  const autumn = game.forecast(mid, seasons.autumn).netGrain;
  const rest = game.SEASONS.filter(x => x.id !== "autumn").reduce((sum, x) => sum + game.forecast(mid, x).netGrain, 0);
  assert.ok(autumn < Math.abs(rest) * 3,
    `秋收(${autumn})不该压倒其余三季合计(${rest})——那样全年只有秋天在起作用`);
}

// ── 后期不投农业就养不起 ──────────────────────────────────────────────
// 农业科技最高约 2.35 倍粮产，农田与粮仓另有加成；把这条线做成真实取舍，
// 而不是「顺手点一阶就不用管」。
{
  const late = stage(16, { levy: 120, archers: 40, knights: 20, heavy_infantry: 20, crossbowmen: 10, light_cavalry: 10 });
  assert.ok(yearNet(late) < 120,
    `后期不投农业时全年净粮(${yearNet(late)})应当接近打平，否则粮食仍然吃不完`);
}

// ── 出征补给必须是一笔真花销 ──────────────────────────────────────────
// 原先 42 人出征只带 6 粮，打仗根本不构成粮食去处。
{
  const s = stage(4, { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
  const comp = game.armyEntity(s, "army_1").composition;
  const supply = game.campaignSupply(s, game.compositionTotal(comp), ["player"]);
  assert.ok(supply >= 15, `42 人出征的补给(${supply})应当是一笔真花销，而不是 6 粮`);
  const big = game.compositionSupply(s, { levy: 120, archers: 40, knights: 20, heavy_infantry: 20, crossbowmen: 10, light_cavalry: 10 }, ["player"]);
  assert.ok(big > supply * 3, `大军团出征(${big})的补给应显著高于小队(${supply})`);
}

// ── 养不起就真的养不起 ────────────────────────────────────────────────
{
  const s = stage(4, { levy: 60, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 });
  const before = game.armyTotal(s);
  s.grain = 0;
  game.applyShortage(s, 20);
  const lost = before - game.armyTotal(s);
  assert.ok(lost >= 10, `欠 20 粮应至少逃 10 人，实际 ${lost}`);
}

console.log("economy tests passed");
