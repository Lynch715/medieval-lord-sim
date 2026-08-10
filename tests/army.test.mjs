import assert from "node:assert/strict";
import game from "./_game.mjs";

const fresh = name => game.createInitialState(name, "oath", "standard");

// 草稿是模块级单例，块与块之间必须清干净，否则互相污染。
const resetDraft = () => {
  game.uiDraft.newArmy = { name: "第二军团", commanderId: null, units: {} };
  game.uiDraft.expedition = { targetId: null, armyIds: null, plan: null, grain: null };
};

// ── uiDraft 必须存在于渲染之外 ─────────────────────────────────────────
// 每 5 秒一次的 drift 计时器会让 updateWorldTime 调 renderAll()，
// 整块重写 panel.innerHTML。表单状态若只留在 DOM 上，玩家填到一半就被抹掉。
// 这正是「组建第二军团兵力填进去就变 0」的成因。
{
  assert.ok(game.uiDraft, "uiDraft 必须导出，否则表单状态无处存放");
  assert.ok(game.uiDraft.newArmy, "uiDraft.newArmy 缺失");
  assert.ok(game.uiDraft.expedition, "uiDraft.expedition 缺失");
}

// ── armyCorpsHtml 必须能脱离全局 S 被调用 ──────────────────────────────
// S 是 02-core.js 里的模块级 let，测试拿不到也设不了。渲染函数收 s 参数，
// 才可能在 Node 里断言渲染结果 —— 这是选「草稿对象」而非「DOM 快照还原」
// 方案的关键理由之一。
{
  resetDraft();
  const s = fresh("渲染");
  const html = game.armyCorpsHtml(s);
  assert.equal(typeof html, "string", "armyCorpsHtml 应返回字符串");
  assert.ok(html.includes("data-new-army-unit"), "组建军团表单应包含兵种输入框");
}

// ── 草稿要活过一次渲染 ────────────────────────────────────────────────
{
  resetDraft();
  const s = fresh("草稿");
  const main = game.armyEntity(s, "army_1");
  main.composition.levy = 30;
  game.uiDraft.newArmy.units = { levy: 12 };
  game.uiDraft.newArmy.name = "黑棘骑士团";
  const html = game.armyCorpsHtml(s);
  assert.ok(html.includes(`value="12"`), "草稿里的兵力必须渲染进 value，否则每 5 秒被清零");
  assert.ok(html.includes("黑棘骑士团"), "草稿里的军团名必须渲染进 value");
}

// ── 草稿是上一秒的意图，必须按当前真实状态夹取 ────────────────────────
// 主力打完仗掉了兵，草稿里的旧数字若原样渲染，就会变成一次非法提交。
{
  resetDraft();
  const s = fresh("夹取");
  const main = game.armyEntity(s, "army_1");
  main.composition.levy = 5;
  game.uiDraft.newArmy.units = { levy: 12 };
  const view = game.newArmyDraftView(s);
  assert.equal(view.units.levy, 5, "草稿数超过主军现有数时必须夹到现有数");
}

// ── 指挥官失效要回退，不能产出指向不存在选项的 selected ────────────────
{
  resetDraft();
  const s = fresh("指挥官");
  game.uiDraft.newArmy.commanderId = "knight_不存在";
  const view = game.newArmyDraftView(s);
  assert.notEqual(view.commanderId, "knight_不存在", "失效的指挥官必须回退");
  if (view.options.length) {
    assert.equal(view.commanderId, view.options[0].id, "应回退到选项列表第一项");
  }
}

// ── 选中的指挥官要带 selected，否则每次渲染都被打回第一项 ──────────────
// 这就是「新招募的骑士选不上」的真相：骑士一直在列表里，
// 只是 select 不带 selected，5 秒内被渲染打回第一项。
{
  resetDraft();
  const s = fresh("选中");
  const knights = game.activeKnights(s);
  assert.ok(knights.length >= 1, "开局应至少有一名在列骑士");
  game.uiDraft.newArmy.commanderId = knights[0].id;
  const html = game.armyCorpsHtml(s);
  assert.ok(new RegExp(`value="${knights[0].id}"\\s+selected`).test(html),
    "草稿选中的指挥官必须带 selected 渲染");
}

console.log("army tests passed");
