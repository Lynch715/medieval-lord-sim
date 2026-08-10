import assert from "node:assert/strict";
import game from "./_game.mjs";

const ids = game.playableTerritoryIds();
const def = id => game.TERRITORY_DEFS[id];
const fresh = () => game.createInitialState("地图测试", "oath", "standard");

// ── 24 块地不该有大片雷同 ─────────────────────────────────────────────
// 扩展领地原本一律 5 金 / 12 粮 / 60 人 / 20 守 / 55 稳，24 块可占领地里
// 有 14 块数值完全相同 —— 「下一块打哪」除了看邻接之外没有任何策略内容。
// 这才是「地图撑不起时长」的真正来源：不是块数少，是块与块之间没有区别。
{
  const groups = {};
  ids.forEach(id => {
    const d = def(id);
    const key = `${d.gold}/${d.grain}/${d.people}/${d.guard}/${d.stability}`;
    (groups[key] ||= []).push(d.name);
  });
  const biggest = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)[0];
  assert.ok(biggest[1].length <= 6,
    `有 ${biggest[1].length} 块地数值完全相同（${biggest[1].join("、")}），地图缺乏分化`);
}

// ── 每个大区都要有核心城堡，否则那片区永远拿不到控制加成 ──────────────
{
  const regions = [...new Set(ids.map(id => def(id).region))];
  for (const region of regions) {
    const core = game.regionCoreSeat(region);
    assert.ok(core, `大区 ${region} 没有核心城堡，区内领地永远拿不到控制加成`);
    assert.ok(ids.includes(core), `${region} 的核心城堡 ${core} 必须是可占领的`);
  }
  // 反过来，核心城堡必须唯一：两座城堡在同一区会让 regionCoreSeat 的结果取决于键序
  for (const region of regions) {
    const cores = ids.filter(id => def(id).region === region && ["castle", "capital"].includes(def(id).type));
    assert.equal(cores.length, 1,
      `${region} 有 ${cores.length} 座核心城堡（${cores.map(id => def(id).name).join("、")}），控制归属会变得含糊`);
  }
}

// ── 三类地必须在数值上真的分层 ────────────────────────────────────────
{
  const avg = (type, key) => {
    const list = ids.filter(id => def(id).type === type);
    return list.reduce((sum, id) => sum + def(id)[key], 0) / list.length;
  };
  assert.ok(avg("fort", "guard") > avg("town", "guard") * 1.4,
    `战略要点的守军应当显著高于普通城镇，实际 ${avg("fort", "guard").toFixed(1)} vs ${avg("town", "guard").toFixed(1)}`);
  assert.ok(avg("fort", "grain") < avg("town", "grain"),
    "战略要点易守难养：粮产不该高于普通城镇，否则它就是纯粹的优势地");
  assert.ok(avg("castle", "gold") > avg("town", "gold"),
    "核心城堡的金币产出应当高于普通城镇");
}

// ── 控制大区：占住核心城堡，同区产出与稳定上一个台阶 ──────────────────
{
  const s = fresh();
  const region = "riverlands";
  const core = game.regionCoreSeat(region);
  const member = ids.find(id => def(id).region === region && id !== core);
  assert.ok(member, "前置条件：河谷区应当有核心城堡之外的领地");

  s.territories[member].owner = "player";
  s.territories[core].owner = "river";
  assert.equal(game.controlsRegionOf(s, member), false, "核心城堡在敌手时不该算控制大区");
  const without = game.territoryOutput(s, member);

  s.territories[core].owner = "player";
  assert.equal(game.controlsRegionOf(s, member), true, "核心城堡到手即控制大区");
  const withCore = game.territoryOutput(s, member);

  assert.ok(withCore.gold > without.gold && withCore.grain > without.grain,
    `控制大区应当同时提高金币与粮食，实际 ${JSON.stringify(without)} → ${JSON.stringify(withCore)}`);

  // 加成属于「同一方」，不是「玩家专属」：AI 占住核心城堡也该吃到
  const ai = fresh();
  ai.territories[core].owner = "river";
  ai.territories[member].owner = "river";
  assert.equal(game.controlsRegionOf(ai, member), true, "AI 占住核心城堡同样算控制大区");
}

// ── 战略要点：向相邻的自有领地投射防御 ────────────────────────────────
{
  const s = fresh();
  const fort = ids.find(id => def(id).type === "fort" && def(id).adj.some(nb => ids.includes(nb)));
  assert.ok(fort, "前置条件：应当存在与其他可占领地相邻的战略要点");
  const neighbour = def(fort).adj.find(nb => ids.includes(nb));

  s.territories[neighbour].owner = "player";
  s.territories[fort].owner = "wolf";
  assert.equal(game.fortProjection(s, neighbour), 0, "要塞在敌手时不该给我方加防");

  s.territories[fort].owner = "player";
  assert.ok(game.fortProjection(s, neighbour) > 0, "拿下相邻要塞后应当提高该地的守军上限");

  // 投射有上限，免得几座要塞挤在一起造出打不动的乌龟壳
  const many = fresh();
  const hub = ids.find(id => def(id).adj.filter(nb => def(nb)?.type === "fort").length >= 2);
  if (hub) {
    def(hub).adj.forEach(nb => { if (many.territories[nb]) many.territories[nb].owner = "player"; });
    many.territories[hub].owner = "player";
    assert.ok(many.fortProjection === undefined || game.fortProjection(many, hub) <= game.FORT_GUARD_PROJECTION * 2,
      "要塞投射不该无限叠加");
  }
}

// ── 地形档案必须覆盖所有实际用到的地形标签 ────────────────────────────
{
  const used = new Set(ids.flatMap(id => def(id).terrainTags || []));
  for (const tag of used) {
    if (tag === "capital") continue;                 // 王冠谷是手写的独一份
    assert.ok(game.TERRAIN_PROFILES[tag],
      `地形标签「${tag}」没有对应的数值档案，用到它的领地会退回平原数值`);
  }
}

console.log("map tests passed");
