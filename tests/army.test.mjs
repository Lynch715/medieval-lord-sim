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

// ── 出征草稿：换了目标就作废 ──────────────────────────────────────────
{
  resetDraft();
  const s = fresh("换目标");
  const targets = game.attackableTerritories(s);
  assert.ok(targets.length >= 1, "开局应至少有一个可攻目标");
  game.uiDraft.expedition = { targetId: "另一个地方", armyIds: [], plan: "assault", grain: 999 };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.equal(view.plan, "steady", "targetId 不符时整块草稿过期，方略应回到默认");
}

// ── 出征草稿：已不是待命的军团要被剔除 ────────────────────────────────
{
  resetDraft();
  const s = fresh("剔除");
  const targets = game.attackableTerritories(s);
  game.uiDraft.expedition = { targetId: targets[0], armyIds: ["army_不存在"], plan: "steady", grain: null };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.ok(!view.armyIds.includes("army_不存在"), "不合格的军团必须被剔除");
  assert.ok(view.armyIds.length >= 1, "全被剔除后应回退到勾选第一支合格军团");
}

// ── 出征草稿：携带粮食夹进 [所需, 现有存粮] ────────────────────────────
{
  resetDraft();
  const s = fresh("粮食");
  const targets = game.attackableTerritories(s);
  game.uiDraft.expedition = { targetId: targets[0], armyIds: null, plan: "steady", grain: 999999 };
  const view = game.expeditionDraftView(s, targets[0]);
  assert.ok(view.grain <= Math.max(view.required, Math.floor(s.grain)), "携带粮食不得超过现有存粮");
  assert.ok(view.grain >= view.required, "携带粮食不得低于本次所需");
}

// ── 勾选状态要渲染成 checked，否则每 5 秒回到「只勾第一支」 ─────────────
{
  resetDraft();
  const s = fresh("勾选");
  const targets = game.attackableTerritories(s);
  const html = game.castleExpeditionHtml(s, targets[0]);
  assert.ok(html.includes("data-expedition-army"), "出征面板应有军团勾选框");
  assert.ok(html.includes("checked"), "默认应勾选第一支合格军团");
}

// ── 调动：自有领地不要求相邻 ──────────────────────────────────────────
// 此前 startMarch 只放行「相邻」或「带 battlePlan 打敌城」两条路径，
// UI 上两个调用点又都带 battlePlan —— 于是根本没有「单纯移动」这个操作，
// 主力打下一块地就钉死在那里。
{
  resetDraft();
  const s = fresh("调动");
  const main = game.armyEntity(s, "army_1");
  // 开局四块地全与渡鸦堡相邻，构造不出「不相邻的自有领地」，
  // 因此显式收下一块远地——这正是打下新城之后的真实局面。
  const far = game.playableTerritoryIds().find(id =>
    id !== main.locationId && !game.TERRITORY_DEFS[main.locationId].adj.includes(id));
  assert.ok(far, "地图上应存在与主力驻地不相邻的可占领地");
  s.territories[far].owner = "player";
  const job = game.redeployArmy(s, "army_1", far, 1000);
  assert.ok(job, "调往不相邻的自有领地应当放行");
  assert.equal(job.payload.destinationId, far);
  assert.equal(main.status, "marching");
  assert.equal(job.endAt - job.startedAt, game.marchDurationForDistance(s, job.payload.originId, far),
    "行军时长应按距离算");
}

// ── 调动不扣粮 ────────────────────────────────────────────────────────
// 回防是被动动作，再收补给等于惩罚防守；距离换来的等待本身已经是代价。
{
  resetDraft();
  const s = fresh("不扣粮");
  const before = s.grain;
  const own = game.ownTerritoryIds(s);
  const main = game.armyEntity(s, "army_1");
  const target = own.find(id => id !== main.locationId);
  game.redeployArmy(s, "army_1", target, 1000);
  assert.equal(s.grain, before, "调动不应消耗粮食");
}

// ── 调往敌方领地必须拒绝 ──────────────────────────────────────────────
// 调动只是移动，不该变成一条绕过出征配置的偷袭路径。
{
  resetDraft();
  const s = fresh("拒绝敌地");
  const enemy = game.attackableTerritories(s)[0];
  assert.equal(game.redeployArmy(s, "army_1", enemy, 1000), null, "调往敌方领地应当拒绝");
}

// ── 非待命军团不能调动 ────────────────────────────────────────────────
{
  resetDraft();
  const s = fresh("非待命");
  const main = game.armyEntity(s, "army_1");
  main.status = "recovering";
  const target = game.ownTerritoryIds(s).find(id => id !== main.locationId);
  assert.equal(game.redeployArmy(s, "army_1", target, 1000), null, "整补中的军团不能调动");
}

// ── 驻扎军团：只算停在本地且不在移动中的 ──────────────────────────────
{
  resetDraft();
  const s = fresh("驻扎");
  const main = game.armyEntity(s, "army_1");
  const here = main.locationId;
  assert.equal(game.stationedArmies(s, here).length, 1, "待命的主力应算作驻扎");
  main.status = "recovering";
  assert.equal(game.stationedArmies(s, here).length, 1, "整补中的军团人还在本地，应算驻扎");
  main.status = "marching";
  assert.equal(game.stationedArmies(s, here).length, 0, "行军中的军团不在本地，不算驻扎");
}

console.log("army tests passed");
