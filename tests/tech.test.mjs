import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import game, { sourceFiles } from "./_game.mjs";

const root = new URL("../", import.meta.url);
const allSource = sourceFiles
  .map(file => readFileSync(fileURLToPath(new URL(file, root)), "utf8"))
  .join("\n");
// 科技表本身只是定义，不算「被读取」。把定义那一段切掉再判断。
const codeWithoutTechTable = allSource.replace(/const TECH_DEFS = \{[\s\S]*?\n\};/, "");

const techs = Object.entries(game.TECH_DEFS).flatMap(([branch, list]) =>
  list.map(def => ({ branch, ...def })));

// ── 元断言：每一项科技都必须真的被读取 ────────────────────────────────
// 这条是本文件最重要的断言。此前 25 项里有 3 项（统一法典、商旅驿站、自由市契约）
// 只存在于科技表中，任何代码都不读它们 —— 玩家花知识和金币买到的是纯粹的安慰剂，
// 其中两项还是别的科技的前置，等于强制先买两个空壳。
// 有了这条，再往表里加科技却忘了接线，测试会直接红。
for (const tech of techs) {
  assert.ok(codeWithoutTechTable.includes(`"${tech.id}"`),
    `科技「${tech.name}」(${tech.branch}/${tech.id}) 没有任何代码或数据表读取它，是安慰剂。\n` +
    `  要么给它真实效果，要么把它从科技表里删掉 —— 不要留在表里骗玩家的知识点。`);
}

assert.equal(techs.length, 25, "五条分支各五项");

// ── 描述里提到的建筑必须真的存在 ──────────────────────────────────────
// 「商站」曾经出现在三条商贸科技的描述里，但游戏里没有这个建筑 —— 真实建筑叫
// 「集市与商栈」，站/栈一字之差，多半是历史上抄错后一路传下来的。玩家照着描述
// 去找商站会一无所获。这里把 BUILDINGS 的名字拆成词表，凡是描述里用了建筑词的
// 都必须能在词表里对上。
const buildingVocab = Object.values(game.BUILDINGS).flatMap(b => b.name.split("与"));
const buildingLikeWords = [...new Set([...buildingVocab, "商站", "城约", "商埠"])];
for (const tech of techs) {
  for (const word of buildingLikeWords) {
    if (!tech.desc.includes(word)) continue;
    assert.ok(buildingVocab.includes(word),
      `科技「${tech.name}」的描述提到「${word}」，但游戏里没有这个建筑。\n` +
      `  现有建筑：${[...new Set(buildingVocab)].join("、")}`);
  }
}

const fresh = () => game.createInitialState("科技测试", "oath", "standard");
const withTech = (s, id, level = 1) => {
  const branch = techs.find(t => t.id === id).branch;
  s.tech[branch].completed = [...new Set([...s.tech[branch].completed, id])];
  s.tech[branch].levels = { ...s.tech[branch].levels, [id]: level };
  return s;
};

// ── 统一法典：低稳定度领地的金币产出被托底 ────────────────────────────
{
  const base = fresh();
  const seat = "ravenstone";
  base.territories[seat].stability = 20;          // 远低于 50
  const before = game.territoryOutput(base, seat).gold;

  const lawful = fresh();
  lawful.territories[seat].stability = 20;
  withTech(lawful, "law_code");
  const after = game.territoryOutput(lawful, seat).gold;
  assert.ok(after > before,
    `统一法典应当托住低稳定度领地的金币产出，实际 ${before} → ${after}`);

  // 稳定度已经高于门槛时不该再有额外加成，否则它就变成了普通的全局增益
  const high = fresh();
  high.territories[seat].stability = 90;
  const highBefore = game.territoryOutput(high, seat).gold;
  withTech(high, "law_code");
  assert.equal(game.territoryOutput(high, seat).gold, highBefore,
    "统一法典只托底，不该给高稳定度领地额外加成");
}

// ── 商旅驿站与王家汇兑：驿道每级带来的金币提高 ────────────────────────
{
  const seat = "ravenstone";
  const build = state => { state.territories[seat].buildings.roads = 3; return state; };

  const plain = build(fresh());
  const plainGold = game.territoryOutput(plain, seat).gold;

  const caravan = withTech(build(fresh()), "caravanserai");
  assert.ok(game.territoryOutput(caravan, seat).gold > plainGold,
    `商旅驿站应当提高驿道的金币产出，实际 ${plainGold} → ${game.territoryOutput(caravan, seat).gold}`);

  const royal = withTech(build(fresh()), "royal_exchange");
  assert.ok(game.territoryOutput(royal, seat).gold > plainGold,
    "王家汇兑的「驿道收益再提高」必须真的生效，不能只有统一时的威望");

  // 没有驿道的领地不该因为这两项科技凭空多收钱
  const noRoads = withTech(fresh(), "caravanserai");
  noRoads.territories[seat].buildings.roads = 0;
  const bare = fresh();
  bare.territories[seat].buildings.roads = 0;
  assert.equal(game.territoryOutput(noRoads, seat).gold, game.territoryOutput(bare, seat).gold,
    "驿道为 0 时，商旅驿站不应带来任何金币");
}

// ── 自由市契约：收买开价降低 ──────────────────────────────────────────
{
  const target = "roderic";
  const plain = fresh();
  const plainCost = game.lordBribeCost(plain, target);
  assert.ok(Number.isFinite(plainCost), "前置条件：罗德里克应当是可收买的");

  const chartered = withTech(fresh(), "market_charter");
  assert.ok(game.lordBribeCost(chartered, target) < plainCost,
    `自由市契约应当压低收买开价，实际 ${plainCost} → ${game.lordBribeCost(chartered, target)}`);

  // 不收钱的领主仍然不收钱
  const stubborn = withTech(fresh(), "market_charter");
  assert.equal(game.lordBribeCost(stubborn, "regent"), Infinity,
    "篡位者不收钱，任何商贸科技都不该改变这一点");
}

// ── 长弓与人口清册：征募量提高 ────────────────────────────────────────
{
  const plain = fresh();
  const plainArchers = game.recruitAmount(plain, "archers");
  const plainLevy = game.recruitAmount(plain, "levy");

  const bows = withTech(fresh(), "longbow");
  assert.ok(game.recruitAmount(bows, "archers") > plainArchers,
    `长弓声称「弓箭手征募量提高」，必须真的提高，实际 ${plainArchers} → ${game.recruitAmount(bows, "archers")}`);
  assert.equal(game.recruitAmount(bows, "levy"), plainLevy,
    "长弓只影响弓手，不该顺带提高长矛兵征募量");

  const census = withTech(fresh(), "census");
  assert.ok(game.recruitAmount(census, "levy") > plainLevy,
    `人口清册声称「提高征募上限」，必须真的提高，实际 ${plainLevy} → ${game.recruitAmount(census, "levy")}`);
}

// ── 科技树的体量必须对得上知识产出 ────────────────────────────────────
// 这一组断言钉住的是设计意图，不是某几个数字：
// 「每项三阶」必须是真能够到的目标，而不是写在界面上的装饰。
{
  const branchCount = Object.keys(game.TECH_DEFS).length;
  const tierCost = level => techs.reduce((sum, t) => sum + game.techCost(t, level).knowledge, 0);
  const tier1 = tierCost(1), tier2 = tierCost(2), tier3 = tierCost(3);
  const fullTree = tier1 + tier2 + tier3;

  // 48 季里的知识累计，按学宫从 0 线性堆到 target 级来积分。
  // 产出公式向实现取（knowledgePerSeason），不在测试里抄第二份。
  const budget = academyTarget => {
    const probe = game.createInitialState("预算", "oath", "standard");
    const seat = "ravenstone";
    let total = 0;
    for (let season = 0; season < 48; season++) {
      probe.territories[seat].buildings.academy = 0;
      const levels = Math.min(academyTarget, Math.round(season * academyTarget / 48));
      // knowledgePerSeason 按「自有领地学宫总级数」算，这里用一块地承载全部级数即可
      probe.territories[seat].buildings.academy = levels;
      total += game.knowledgePerSeason(probe);
    }
    return total;
  };

  const 保守 = budget(15), 积极 = budget(40), 极限 = budget(80);

  // 保守投入拿到一阶的大部分即可 —— 少投入就少拿是应该的，
  // 但不该少到「点不动几项、整棵树看着都是灰的」。
  assert.ok(保守 >= tier1 * .8,
    `保守投入（末期 15 级学宫）连一阶的八成都够不到，科技树就只剩挫败感。一阶 ${tier1}，保守预算 ${Math.round(保守)}`);

  assert.ok(积极 >= tier1 + tier2 * .6,
    `积极投入（末期 40 级学宫）应当够到二阶的大半，实际预算 ${Math.round(积极)}，一阶+六成二阶 ${Math.round(tier1 + tier2 * .6)}`);

  assert.ok(极限 >= fullTree * .9,
    `把学宫堆到极限（80 级）仍够不到全树，说明「每项三阶」是装饰。全树 ${fullTree}，极限预算 ${Math.round(极限)}`);

  // 走深不该比走宽亏太多。三阶给 3 倍线性效果，若成本超过 3 倍就没人会走深。
  const depthCost = 1 + 2 * game.TECH_LEVEL_COST_GROWTH;
  assert.ok(depthCost < 2,
    `三阶成本为一阶的 ${depthCost.toFixed(2)} 倍。效果只有 3 倍且是线性的，成本再高就没人愿意走深了`);

  // 专精一两条线必须是可行的打法，而不是只能全线摊薄
  const twoBranchesDeep = fullTree * 2 / branchCount;
  assert.ok(积极 >= twoBranchesDeep,
    `积极投入应当足以把两条分支点满，实际预算 ${Math.round(积极)}，两条线全满 ${Math.round(twoBranchesDeep)}`);
}

console.log("tech tests passed");
