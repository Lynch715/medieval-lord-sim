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

// ── 驻扎战力并入守城 ──────────────────────────────────────────────────
// 此前军团停在自家城里对 resolveAIAttack 毫无影响 —— 停一支满编主力
// 和一个人不停，判定结果完全相同，「驻防」在机制上并不存在。
{
  resetDraft();
  const s = fresh("守城");
  const here = game.armyEntity(s, "army_1").locationId;
  assert.ok(game.stationedPower(s, here) > 0, "有主力驻扎时驻扎战力应大于 0");
  game.armyEntity(s, "army_1").status = "marching";
  assert.equal(game.stationedPower(s, here), 0, "军团行军后驻扎战力应归零");
}

// ── 整补中的军团贡献低于待命 ──────────────────────────────────────────
// 刚打完硬仗的疲兵不该立刻变成铜墙铁壁。这也让「胜后整补 90 秒」
// 第一次有了防守层面的意义。
{
  resetDraft();
  const s = fresh("整补折扣");
  const main = game.armyEntity(s, "army_1");
  const here = main.locationId;
  main.status = "idle";
  const full = game.stationedPower(s, here);
  main.status = "recovering";
  const tired = game.stationedPower(s, here);
  assert.ok(tired < full, "整补中的驻扎战力必须低于待命");
  assert.ok(tired > 0, "整补中仍应有贡献");
}

// ── 同样的进攻：无驻军时城破，有驻军时被击退 ──────────────────────────
{
  resetDraft();
  // 强度取在两个阈值中间，两边都留足余量：
  // attack ≈ 22.5；裸城阈值 6.6（打得下来），有 42 人主力驻防时阈值 44.6（打不下来）。
  // 别贴着阈值标定 —— 差 0.5% 的用例会在任何一次配平里莫名其妙地红。
  const attacker = () => ({
    id: "wolf_test", name: "狼牙试探军", owner: "wolf", locationId: "highpass",
    composition: { levy: 25, archers: 5, knights: 2, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 },
    morale: 62, status: "idle", jobId: null
  });
  const strip = (state, id) => {
    state.territories[id].guard = 4;
    state.territories[id].stability = 10;
    state.territories[id].buildings.walls = 0;
    state.territories[id].buildings.watchtower = 0;
  };

  // 先把主力挪走，确认这波进攻本来打得下来
  const s = fresh("对照");
  const main = game.armyEntity(s, "army_1");
  const target = main.locationId;
  main.locationId = "__nowhere__";
  strip(s, target);
  assert.equal(game.resolveAIAttack(s, attacker(), target, () => 0.5), "captured",
    "无驻军时这波进攻应当打得下来（否则本对照无效）");

  // 同样的城、同样的进攻，这次有满编主力驻防
  const s2 = fresh("对照2");
  const target2 = game.armyEntity(s2, "army_1").locationId;
  strip(s2, target2);
  assert.notEqual(game.resolveAIAttack(s2, attacker(), target2, () => 0.5), "captured",
    "有满编主力驻防时不该被同一波进攻打下来");
}

// ── 击退也要流血，否则驻防是白嫖 ──────────────────────────────────────
{
  resetDraft();
  const s = fresh("驻防伤亡");
  const main = game.armyEntity(s, "army_1");
  const target = main.locationId;
  const before = game.compositionTotal(main.composition);
  s.territories[target].guard = 4;
  game.resolveAIAttack(s, {
    id: "wolf_t2", name: "狼牙袭扰", owner: "wolf", locationId: "highpass",
    composition: { levy: 20, archers: 4, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 },
    morale: 60, status: "idle", jobId: null
  }, target, () => 0.5);
  assert.ok(game.compositionTotal(main.composition) < before, "驻扎军团被打退后应有伤亡");
}

// ── 城破后驻扎军团撤离，不许滞留在敌城里 ──────────────────────────────
// 这同时修掉一个既有缺陷：AI 夺回玩家领地时，站在那儿的玩家军团
// 此前完全不受影响，会继续待在已经易主的城里。
{
  resetDraft();
  const s = fresh("撤离");
  // 用一块非主城的自有领地，免得城破直接终局
  const main = game.armyEntity(s, "army_1");
  const spot = game.ownTerritoryIds(s).find(id => id !== "ravenstone");
  main.locationId = spot;
  main.composition = { levy: 2, archers: 0, knights: 0, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 };
  s.territories[spot].guard = 1;
  s.territories[spot].stability = 5;
  s.territories[spot].buildings.walls = 0;
  s.territories[spot].buildings.watchtower = 0;
  const result = game.resolveAIAttack(s, {
    id: "wolf_t3", name: "狼牙主力", owner: "wolf", locationId: "highpass",
    composition: { levy: 90, archers: 30, knights: 20, heavy_infantry: 15, crossbowmen: 10, light_cavalry: 10 },
    morale: 80, status: "idle", jobId: null
  }, spot, () => 0.99);
  assert.equal(result, "captured", "这波进攻应当打得下来（否则本用例无效）");
  assert.notEqual(main.locationId, spot, "城破后军团不该滞留在已易主的城里");
  assert.ok(game.ownTerritoryIds(s).includes(main.locationId), "应撤往仍属于自己的领地");
  assert.equal(main.status, "recovering", "撤离后应进入整补");
}

console.log("army tests passed");
