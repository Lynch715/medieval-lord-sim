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

console.log("army tests passed");
