import assert from "node:assert/strict";
import game from "./_game.mjs";

const fresh = () => game.createInitialState("AI测试", "oath", "standard");
const armyOf = (s, f) => s.factions[f].armies[0];
const totalOf = comp => Object.values(comp).reduce((a, b) => a + b, 0);
const fixedRng = value => () => value;

// ── 战力必须计入全部六个兵种 ──────────────────────────────────────────
// 原先 aiArmyPower 只算 levy / archers / knights，重步兵、弩手、轻骑兵
// 一律按 0 计。摄政开局那 8 名重步兵与 5 名弩手等于白养。
{
  const base = { levy: 10, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 };
  const power = comp => game.aiArmyPower({ composition: comp });
  const baseline = power(base);
  for (const type of ["heavy_infantry", "crossbowmen", "light_cavalry", "archers", "knights"]) {
    assert.ok(power({ ...base, [type]: 10 }) > baseline,
      `${type} 必须计入 AI 战力，否则这个兵种在 AI 手里是摆设`);
  }
}

// ── 目标取自己版图的边界，而不是大军脚下 ──────────────────────────────
{
  const s = fresh();
  const liegeSeats = new Set(Object.values(game.LORD_DEFS).filter(d => d.tier === "liege").map(d => d.seat));

  for (const faction of ["wolf", "river", "crown"]) {
    const targets = game.aiTargets(s, faction);
    assert.ok(targets.length > 0,
      `${faction} 开局就该有可打的目标。摄政公爵此前整局一仗没打，就是因为它的军队站在王冠谷、` +
      `邻居全不是玩家的地，targets 恒为空 —— 追着玩家加冕的头号反派全程是个雕像。`);

    for (const id of targets) {
      const owner = s.territories[id].owner;
      assert.notEqual(owner, faction, `${faction} 不该把自己的地当目标`);
      assert.ok(owner === "player" || owner === "neutral",
        `${faction} 只该打玩家和中立割据，不该与其他 AI 交火，实际目标 ${id} 属于 ${owner}`);
      assert.equal(liegeSeats.has(id), false,
        `${id} 是大叛臣的主城，AI 不该吞并它 —— 那是留给玩家的主线目标`);
      assert.ok(game.TERRITORY_DEFS[id].adj.some(nb => s.territories[nb]?.owner === faction),
        `${id} 必须与 ${faction} 的版图接壤`);
    }
  }

  // 摄政开局够不着玩家，但吃得到中立小领
  assert.ok(game.aiTargets(s, "crown").every(id => s.territories[id].owner === "neutral"),
    "摄政开局与玩家不接壤，此时只应有中立目标");
}

// ── 主力有上限，但会随版图扩大 ────────────────────────────────────────
{
  const s = fresh();
  const capBefore = game.aiArmyCap(s, "wolf");
  assert.ok(capBefore > totalOf(armyOf(s, "wolf").composition),
    "开局兵力上限应当高于初始兵力，否则 AI 一开始就没有成长空间");
  s.territories.ravenstone.owner = "wolf";
  s.territories.blackthorn.owner = "wolf";
  assert.ok(game.aiArmyCap(s, "wolf") > capBefore, "占的地越多，能养的兵越多");
}

// ── 花钱补兵：金库不该无限囤积 ────────────────────────────────────────
{
  const s = fresh();
  const army = armyOf(s, "wolf");
  s.factions.wolf.gold = 400;
  const before = totalOf(army.composition);
  const goldBefore = s.factions.wolf.gold;
  const bought = game.reinforceAIArmy(s, "wolf", 1, fixedRng(0));
  assert.ok(bought > 0, "金库充足时 AI 必须真的买兵");
  assert.ok(totalOf(army.composition) > before, "买了兵，编成就该变多");
  assert.ok(s.factions.wolf.gold < goldBefore, "买兵必须真的花钱");

  // 到顶之后不再买，也不该白扣钱
  const full = fresh();
  const fullArmy = armyOf(full, "wolf");
  full.factions.wolf.gold = 4000;
  fullArmy.composition.levy = game.aiArmyCap(full, "wolf") + 50;
  const richBefore = full.factions.wolf.gold;
  assert.equal(game.reinforceAIArmy(full, "wolf", 1, fixedRng(0)), 0, "满编后不该继续买兵");
  assert.equal(full.factions.wolf.gold, richBefore, "没买成就不该扣钱");

  // 穷的时候不该买出负数金币
  const poor = fresh();
  poor.factions.wolf.gold = 1;
  assert.equal(game.reinforceAIArmy(poor, "wolf", 1, fixedRng(0)), 0, "钱不够时不该买兵");
  assert.ok(poor.factions.wolf.gold >= 0, "金币不该被扣成负数");
}

// ── 吞并中立割据：领主出局，玩家从此谈不到他 ──────────────────────────
{
  const s = fresh();
  const targetId = "greywood";
  const lord = game.lordAt(s, targetId);
  assert.ok(lord, "前置条件：灰林应当有一名割据领主");
  assert.equal(s.territories[targetId].owner, "neutral");

  const army = armyOf(s, "crown");
  army.composition.levy = 400;                       // 压倒性兵力，确保打得下来
  s.territories[targetId].guard = 1;
  const result = game.resolveAIAttack(s, army, targetId, fixedRng(0.01));
  assert.equal(result, "captured", `压倒性兵力应当拿下中立小领，实际 ${result}`);
  assert.equal(s.territories[targetId].owner, "crown", "打下来之后该地应归摄政");
  assert.equal(game.officer(s, lord.id).side, "gone",
    "被吞并的割据领主应当出局 —— 玩家磨蹭太久，本来能谈下来的人就没了");
  assert.equal(game.canPersuadeLord(s, lord.id), false, "出局的领主不该还能被说服");
}

// ── 打不赢就不该白拿 ──────────────────────────────────────────────────
{
  const s = fresh();
  const targetId = "greywood";
  const army = armyOf(s, "crown");
  Object.keys(army.composition).forEach(k => { army.composition[k] = 0; });
  army.composition.levy = 1;
  s.territories[targetId].guard = 999;
  const result = game.resolveAIAttack(s, army, targetId, fixedRng(0.99));
  assert.notEqual(result, "captured", "一个兵不该打下有 999 守军的城");
  assert.equal(s.territories[targetId].owner, "neutral", "没打赢就不该易主");
  assert.equal(game.officer(s, game.SEAT_TO_LORD[targetId]).side, "neutral", "没打赢，人家领主还在");
}

// ── 整场战役下来，AI 不该单调衰减 ────────────────────────────────────
// 这是本文件最重要的一条：玩家完全不动跑满 48 季，此前狼牙主力会从 52 掉到 35，
// 摄政一仗不打、金币从 130 囤到 610。AI 不是静态，是在自己饿死。
{
  const EPOCH = 1767225600000;
  const originalNow = Date.now, originalRandom = Math.random;
  let n = 12345;
  const rng = () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let now = EPOCH;
  Math.random = rng; Date.now = () => now;
  let s, startWolf, startCrown;
  try {
    s = fresh();
    startWolf = totalOf(armyOf(s, "wolf").composition);
    startCrown = totalOf(armyOf(s, "crown").composition);
    for (let i = 0; i < 48 && !s.ended; i++) {
      now += game.TIME_CONFIG.seasonDurationMs;
      game.advanceWorld(s, now, { rng, maxCatchUpMs: Infinity });
    }
  } finally { Math.random = originalRandom; Date.now = originalNow; }

  const endWolf = totalOf(armyOf(s, "wolf").composition);
  assert.ok(endWolf >= startWolf * .9,
    `狼牙打了一整场仗，主力不该反而缩水：${startWolf} → ${endWolf}（补兵没接上）`);
  assert.ok(s.factions.crown.gold < 400,
    `摄政不该把金币囤到 ${Math.round(s.factions.crown.gold)} 还一个子儿不花`);
  assert.ok(totalOf(armyOf(s, "crown").composition) > startCrown,
    `摄政有钱有地，48 季下来主力该变强：${startCrown} → ${totalOf(armyOf(s, "crown").composition)}`);
  for (const f of ["wolf", "river", "crown"]) {
    assert.ok(totalOf(armyOf(s, f).composition) <= game.aiArmyCap(s, f) + 30,
      `${f} 的兵力不该无限膨胀，应当受上限约束`);
  }
}

console.log("ai tests passed");
