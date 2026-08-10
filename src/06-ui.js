"use strict";

// 全部渲染、DOM 绑定与启动流程。

function renderTop() {
  syncTroops(S);
  const season = seasonOf(S);
  const f = forecast(S);
  const flow = resourceFlow(S, season);
  $("chapterText").textContent = `第${yearOf(S)}年 · ${season.name}季`;
  $("turnText").textContent = formatDuration(coronationRemainingMs(S));
  $("goldText").textContent = Math.round(S.gold);
  $("grainText").textContent = Math.round(S.grain);
  if ($("knowledgeText")) $("knowledgeText").textContent = Math.round(S.knowledge || 0);
  $("troopText").textContent = Math.round(S.troops);
  $("phaseText").textContent = season.phase;
  $("turnHint").textContent = S.battleSession ? "远征尚未结束" : `距离换季 ${formatDuration(getSeasonRemainingMs(S))}`;
  $("playerNameText").textContent = S.playerName;
  $("oathBadge").textContent = "合法继承人";
  $("territoryCount").textContent = `${ownTerritoryIds(S).length} / ${playableTerritoryIds().length}`;
  [["support", S.support], ["morale", S.morale], ["renown", S.renown], ["legitimacy", S.legitimacy]].forEach(([id, value]) => {
    if (!$(`${id}Text`)) return;
    $(`${id}Text`).textContent = Math.round(value);
    $(`${id}Bar`).style.width = `${clamp(value)}%`;
  });
  $("goldSideText").textContent = Math.round(S.gold); $("grainSideText").textContent = Math.round(S.grain); $("armySideText").textContent = Math.round(S.troops);
  $("goldBar").style.width = `${clamp(S.gold / 2)}%`; $("grainBar").style.width = `${clamp(S.grain / 4)}%`; $("armyBar").style.width = `${clamp(S.troops / 2)}%`;
  $("netGoldText").textContent = formatResourceRate(flow.goldPerSecond, "金");
  $("forecastList").innerHTML = [
    ["金币流量", formatResourceRate(flow.goldPerSecond, "金")], ["粮食流量", formatResourceRate(flow.grainPerSecond, "粮")], ["本季净金", `${f.netGold >= 0 ? "+" : "−"}${Math.abs(f.netGold)}`], ["本季净粮", `${f.netGrain >= 0 ? "+" : "−"}${Math.abs(f.netGrain)}`], ["粮仓容量", `${f.storageCap}`]
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
  $("gameNav").querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === S.tab));
}

function renderAll() {
  if (!S || typeof document === "undefined") return;
  if (S.ended) { showEnding(S); return; }
  if (S.battleSession) S.tab = "campaign";
  $("menu").classList.add("hidden");
  $("creator").classList.add("hidden");
  $("prologue").classList.add("hidden");
  $("ending").classList.add("hidden");
  $("game").classList.remove("hidden");
  renderTop();
  const renderers = { hall: renderHall, domain: renderDomain, map: renderMap, campaign: renderCampaign, court: renderCourt, chronicle: renderChronicle };
  (renderers[S.tab] || renderHall)();
  if (S.pendingDecisions.length) setTimeout(pumpDecision, 0);
}

function researchPanelHtml() {
  const running = runningResearchJobs(S);
  const atCapacity = running.length >= researchCapacity(S);
  return `<section class="research-panel"><div class="section-head"><h2>学堂与研究</h2><span>当前知识 ${Math.floor(S.knowledge || 0)} · 研究队列 ${running.length}/${researchCapacity(S)} · 每项科技三阶</span></div><div class="tech-grid">${Object.entries(TECH_DEFS).map(([branch, techs]) => {
    const done = techs.reduce((sum, tech) => sum + techLevel(S, tech.id), 0);
    const max = techs.reduce((sum, tech) => sum + techMaxLevel(tech), 0);
    const branchRunning = techs.some(tech => researchQueueJob(S, tech.id));
    const open = foldState.branches.has(branch);
    return `<details class="tech-branch domain-fold" data-fold-group="branch" data-fold-key="${branch}"${open ? " open" : ""}>
    <summary><span class="fold-title"><b>${TECH_BRANCH_NAMES[branch]}</b><small>${done} / ${max} 阶</small></span><span class="fold-meta">${branchRunning ? `<em class="fold-busy">研究中</em>` : done >= max ? `<em class="fold-idle">已满阶</em>` : `<em class="fold-idle">可研究</em>`}</span></summary>${techs.map(tech => {
    const currentLevel = techLevel(S, tech.id);
    const maxLevel = techMaxLevel(tech);
    const nextLevel = currentLevel + 1;
    const queue = researchQueueJob(S, tech.id);
    const active = !!queue;
    const unmet = tech.requires.filter(id => !techCompleted(S, id));
    const cost = techCost(tech, nextLevel);
    const duration = researchDuration(tech, nextLevel);
    const affordable = S.knowledge >= cost.knowledge && S.gold >= cost.gold;
    const label = currentLevel >= maxLevel ? `已满阶 · ${currentLevel}/${maxLevel}` : active ? `研究中 · ${nextLevel}/${maxLevel} · ${formatDuration(getJobRemainingMs(queue))}` : atCapacity ? "研究队列已满" : unmet.length ? `需要：${unmet.map(id => techDefinition(branch, id)?.name || id).join("、")}` : !affordable ? `还差 ${[
        S.knowledge < cost.knowledge ? `${Math.ceil(cost.knowledge - S.knowledge)}知` : "",
        S.gold < cost.gold ? `${Math.ceil(cost.gold - S.gold)}金` : ""
      ].filter(Boolean).join(" ")} · 需 ${cost.knowledge}知 ${cost.gold}金`
      : `研究 ${nextLevel}/${maxLevel} · ${cost.knowledge}知 · ${cost.gold}金 · ${formatDuration(duration)}`;
    const disabled = currentLevel >= maxLevel || active || atCapacity || unmet.length > 0 || !affordable;
    return `<div class="tech-card ${currentLevel >= maxLevel ? "completed" : active ? "active" : ""}"><div><b>${esc(tech.name)} <i class="tech-level-badge">${currentLevel}/${maxLevel}</i></b><small>${esc(tech.desc)} 每阶都会强化效果，研究时间逐阶增加。</small></div><button data-research-branch="${branch}" data-research="${tech.id}" ${disabled ? "disabled" : ""}>${active && queue ? `<span data-job-countdown="${queue.id}" data-job-prefix="研究中 · ">研究中 · ${nextLevel}/${maxLevel} · ${formatDuration(getJobRemainingMs(queue))}</span>` : label}</button></div>`;
  }).join("")}</details>`;
  }).join("")}</div></section>`;
}

function renderHall() {
  const panel = $("panel");
  const f = forecast(S);
  const flow = resourceFlow(S);
  const activeJobs = (S.jobs || []).filter(job => job.status === "running");
  const queueHtml = activeJobs.length ? activeJobs.map(job => {
    const label = job.type === "BUILD" ? `建设 · ${TERRITORY_DEFS[job.territoryId]?.name || "领地"}` : job.type === "RECRUIT" ? "募集兵力" : job.type === "RESEARCH" ? "科技研究" : job.type === "MARCH" ? `${job.payload?.armyIds?.length > 1 ? "合军行军" : "军团行军"} · ${TERRITORY_DEFS[job.payload?.destinationId]?.name || "目标"}` : job.type === "OFFICER_RECRUIT" ? `招募领主 · ${officer(S, job.payload?.officerId)?.name || "候选人"}` : job.type === "CITY_ACTION" ? `城市行动 · ${TERRITORY_DEFS[job.territoryId]?.name || "城市"}` : "军政指令";
    return `<div class="queue-row"><b>${label}</b><span data-job-countdown="${job.id}" data-job-prefix="">${formatDuration(getJobRemainingMs(job))}</span></div>`;
  }).join("") : `<div class="empty-state">当前没有进行中的建设、研究、募兵或行军。</div>`;
  panel.innerHTML = `
    <section class="hero-panel">
      <span class="eyebrow">STRATEGY OVERVIEW</span>
      <h2>${turnOf(S) === 0 ? "第一年春：先发展，再出征" : `第${yearOf(S)}年${seasonOf(S).name}季 · 军政总览`}</h2>
      <p>${seasonOf(S).note} 资源会自动流入，季节系数会改变金币与粮食的速度。先建设生产，再研究科技、募集兵力，最后选择出征时机。</p>
      ${metrics([[S.gold, "金币"], [S.grain, "粮食"], [armyTotal(S), "军队"], [S.support, "民心"], [S.morale, "军心"], [S.renown, "声望"]])}
    </section>
    ${S.lastAction ? `<div class="feedback-banner"><b>${esc(S.lastAction.name)}</b><p>${esc(S.lastAction.text)}</p></div>` : ""}
    <div class="strategy-overview"><article class="flow-card"><div class="section-head"><h3>实时资源流量（按小时）</h3><span>${seasonOf(S).name}季系数 · 金${formatSeasonCoefficient(seasonOf(S).gold)} / 粮${formatSeasonCoefficient(seasonOf(S).grain)}</span></div><div class="flow-values"><b>${formatResourceRate(flow.goldPerSecond, "金")}</b><b>${formatResourceRate(flow.grainPerSecond, "粮")}</b></div><p>本季预计净额：金币 ${f.netGold >= 0 ? "+" : "−"}${Math.abs(f.netGold)} · 粮食 ${f.netGrain >= 0 ? "+" : "−"}${Math.abs(f.netGrain)}</p></article><article class="queue-card"><div class="section-head"><h3>进行中的军政事务</h3><span>${activeJobs.length} 项</span></div>${queueHtml}</article></div>
    <div class="quick-actions"><button data-quick-tab="domain"><b>发展领地</b><small>建筑与科技</small></button><button data-quick-tab="court"><b>查看将领</b><small>招募领主、管理骑士</small></button><button data-quick-tab="campaign"><b>编组军队</b><small>兵种与军团</small></button><button data-quick-tab="map"><b>查看地图</b><small>选择军团出征</small></button></div>`;
  panel.querySelectorAll("[data-quick-tab]").forEach(button => button.addEventListener("click", () => { S.tab = button.dataset.quickTab; saveGame(); renderAll(); resetPageScroll(); }));
}

function officerCard(o, enemy = false) {
  if (!o) return "";
  const fief = o.fief ? `管理${TERRITORY_DEFS[o.fief]?.name}` : "未管理领地";
  const status = enemy ? `${o.recruitable ? "可招募领主" : FACTIONS[o.side]?.name || "已经离开"} · 忠诚 ${Math.round(o.loyalty)}` : o.id === "player" ? "王子本人" : `忠诚 ${Math.round(o.loyalty)}`;
  return `<article class="officer-card ${enemy ? "enemy" : ""}">
    <img src="${o.portrait}" alt="${esc(o.name)}">
    <div class="card-copy"><div class="role-line"><h3>${esc(o.name)}</h3><span>${esc(o.title)}</span></div><p>领主的统率与治理决定带兵和经营效率。</p>
    <div class="stat-chips">${OFFICER_STAT_KEYS.map(key => `<span>${STAT_LABELS[key]}${o.stats[key]}</span>`).join("")}</div>
    <div class="loyalty-line"><span>${status}</span><b>${fief}</b></div><div class="loyalty-track"><i style="width:${enemy ? 56 : clamp(o.loyalty)}%"></i></div></div>
  </article>`;
}

// 折叠块的统一写法。三个页面都用它，避免同一段 details 结构抄第三遍。
// 收起时这一行就是全部信息，所以 meta 必须写清「里面有什么、有没有在进行的事」。
function foldBlock(group, key, title, sub, meta, body, store) {
  const open = store.has(key);
  return `<details class="domain-fold" data-fold-group="${group}" data-fold-key="${key}"${open ? " open" : ""}>
    <summary><span class="fold-title"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span><span class="fold-meta">${meta}</span></summary>
    ${body}
  </details>`;
}

// 记账挂在 summary 的 click 上，而不是 details 的 toggle 上：
// toggle 是异步派发的，玩家「展开后立刻点建造」时，renderAll() 会抢在 toggle
// 之前重建面板，于是刚展开的那一项按旧状态又被合上。click 里预测翻转后的值
// 同步写入，就没有这个时间窗。keyboard 回车同样会触发 summary 的 click。
function bindFold(panel, group, store) {
  panel.querySelectorAll(`[data-fold-group="${group}"]`).forEach(node => {
    const key = node.dataset.foldKey;
    const summary = node.querySelector("summary");
    if (!summary) return;
    summary.addEventListener("click", () => { node.open ? store.delete(key) : store.add(key); });
  });
}

function renderDomain() {
  const panel = $("panel");
  // 第一次进这一页时默认展开主城，让玩家看见「点开有内容」这件事；
  // 之后完全按玩家自己的开合来，不再自动插手。
  if (!foldState.seeded) {
    foldState.seeded = true;
    const first = ownTerritoryIds(S)[0];
    if (first) foldState.territories.add(first);
  }
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">RESTORATION ECONOMY</span><h2>发展复国根基</h2><p>农田养军，市场聚财，铁匠铺和兵营把资源变成收复旧土的军力。建筑最高五级，每块领地同时只进行一项建设。</p>${metrics([[ownTerritoryIds(S).length, "收复领地"], [S.support, "民心"], [forecast(S).grain, "本季产粮"], [forecast(S).gold, "本季金币"]])}</section>
    <div class="section-head"><h2>领地建设</h2><span>点开一块领地，展开它的十类建筑</span></div>
    <div class="domain-grid">${ownTerritoryIds(S).map(domainCard).join("")}</div>${researchPanelHtml()}`;
  // 折叠状态记在 foldState 里，renderAll() 重建面板后按它还原，
  // 这样点一次建造不会把刚展开的领地合上。
  bindFold(panel, "territory", foldState.territories);
  bindFold(panel, "branch", foldState.branches);
  bindFold(panel, "court", foldState.sections);
  panel.querySelectorAll("[data-upgrade]").forEach(button => button.addEventListener("click", () => upgradeBuilding(button.dataset.territory, button.dataset.upgrade)));
  panel.querySelectorAll("[data-research]").forEach(button => button.addEventListener("click", () => {
    const job = queueResearch(S, button.dataset.researchBranch, button.dataset.research);
    if (!job) { toast("现在无法开始这项研究"); return; }
    const tech = techDefinition(button.dataset.researchBranch, button.dataset.research);
    S.lastAction = { name: "研究排队", text: `${tech.name}第${techLevel(S, tech.id) + 1}阶开始研究，预计${formatDuration(job.endAt - job.startedAt)}后完成。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
}

function domainCard(id) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const out = territoryOutput(S, id);
  const holder = t.fiefHolder === "charter" ? "村镇自治" : t.fiefHolder ? `由${officer(S, t.fiefHolder)?.name || "旧领主"}管理` : "由你管理";
  const buildJob = getRunningJob(S, `build:${id}`);
  // 折叠时这一行就是全部信息，所以要把「在建什么、还有多久」直接摆在标题里，
  // 否则玩家得把每块地挨个点开才知道哪块闲着。
  const busy = buildJob
    ? `<em class="fold-busy">${BUILDINGS[buildJob.payload?.buildingType]?.name || "建设"}中 · <span data-job-countdown="${buildJob.id}" data-job-prefix="">${formatDuration(getJobRemainingMs(buildJob))}</span></em>`
    : `<em class="fold-idle">空闲</em>`;
  const levels = Object.keys(BUILDINGS).reduce((sum, type) => sum + (t.buildings[type] || 0), 0);
  const open = foldState.territories.has(id);
  return `<details class="domain-fold" data-fold-group="territory" data-fold-key="${id}"${open ? " open" : ""}>
    <summary><span class="fold-title"><b>${d.name}</b><small>${territoryRoleName(d.type)} · ${esc(d.terrain)} · ${holder}</small></span><span class="fold-meta">${out.gold}金 ${out.grain}粮 · 守军 ${t.guard} · 建筑 ${levels}/${Object.keys(BUILDINGS).length * BUILDING_MAX_LEVEL}级 ${busy}</span></summary>
    <article class="domain-card"><div class="stat-chips"><span>本季 ${out.gold}金</span><span>${out.grain}粮</span><span>守军 ${t.guard}</span><span>${territoryRoleHint(S, id)}</span></div>
    <div class="building-grid">${Object.entries(BUILDINGS).map(([type, b]) => {
      const level = t.buildings[type];
      const cost = buildingCost(S, id, type);
      const buildJob = getRunningJob(S, `build:${id}`);
      const buildingQueued = buildJob?.payload?.buildingType === type;
      const buildLabel = buildingQueued ? `建设中 · ${formatDuration(getJobRemainingMs(buildJob))}` : buildJob ? "建设队列占用" : level >= BUILDING_MAX_LEVEL ? "已达最高级" : `升级 · ${cost}金`;
      return `<div class="building-card"><b>${glyphSvg(type)}${b.name} · ${level}/${BUILDING_MAX_LEVEL}</b><small>${b.desc}</small><button data-territory="${id}" data-upgrade="${type}" ${!canUpgrade(S, id, type) ? "disabled" : ""}>${buildingQueued ? `<span data-job-countdown="${buildJob.id}" data-job-prefix="建设中 · ">建设中 · ${formatDuration(getJobRemainingMs(buildJob))}</span>` : buildLabel}</button></div>`;
    }).join("")}</div></article></details>`;
}

function renderMap() {
  const panel = $("panel");
  const attackable = [...new Set(playerArmies(S).flatMap(army => attackableTerritories(S, army.id)))];
  const mapArmy = armyEntity(S, "army_1");
  const mapMarchJob = mapArmy?.jobId ? S.jobs.find(job => job.id === mapArmy.jobId && job.status === "running") : null;
  const mapArmyStatus = `${playerArmies(S).length}支军团 · ${playerArmies(S).filter(army => army.status === "idle").length}支待命`;
  const selectedId = S.selectedTerritoryId || "ravenstone";
  const controlled = ownTerritoryIds(S).length;
  const interactiveCount = Object.keys(TERRITORY_DEFS).length;
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE RESTORATION MAP</span><h2>把父亲的旧领土夺回来</h2><p>每个城堡和城镇都是复国路线上的一站。点击敌方城堡，查看守军、侦察情报并直接配置远征。<br><b>${mapArmyStatus}</b></p>${metrics([[`${controlled} / ${playableTerritoryIds().length}`, "已收复"], [attackable.length, "可攻目标"], [playableTerritoryIds().length, "可占领地点"], [interactiveCount, "地图地点"]])}</section>
    <div class="unification-track"><div><b>复国进度</b><span>收复父亲留下的旧土，逐步逼近王冠谷</span></div><strong>${Math.round(controlled / playableTerritoryIds().length * 100)}%</strong><i style="width:${Math.round(controlled / playableTerritoryIds().length * 100)}%"></i></div>
    <div class="section-head"><h2>北境地图</h2><span>城堡统辖附近附属镇 · 金边为可攻目标（与自家版图接壤即可，越远行军越久） · 点击目标配置远征</span></div>
    <div class="map-shell"><div class="map-legend">${Object.entries(FACTIONS).map(([id, f]) => `<span style="--crest-color:${f.color}">${crestSvg(id, f.name)}${f.name}</span>`).join("")}<span class="map-legend-note">金边目标可直接配置远征 · 斥候情报按季更新 · 手机左右滑动地图</span></div><div class="map-viewport" tabindex="0" aria-label="可横向浏览的北境地图"><div class="realm-map">${mapRoutes(S)}${Object.keys(TERRITORY_DEFS).map(id => mapNode(id, attackable)).join("")}</div></div><div class="map-inspector">${territorySummary(S, selectedId, attackable)}</div></div>`;
  panel.querySelectorAll("[data-map-territory]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.mapTerritory;
    S.selectedTerritoryId = id;
    saveGame(); renderMap();
    toast(owns(S, id) ? `${TERRITORY_DEFS[id].name}由你控制` : attackable.includes(id) ? `${TERRITORY_DEFS[id].name}已接壤，可以制定远征` : `${TERRITORY_DEFS[id].name}等待你的使者`);
  }));
  panel.querySelectorAll("[data-city-action]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.cityId;
    const action = button.dataset.cityAction;
    if (!cityAction(S, id, action)) { toast("资源不足，或本季已经安排过这项城市行动"); return; }
    saveGame(); renderMap();
    toast(S.lastAction.text);
  }));
  panel.querySelectorAll("[data-city-attack]").forEach(button => button.addEventListener("click", () => {
    S.selectedTerritoryId = button.dataset.cityAttack;
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-redeploy-army]").forEach(button => button.addEventListener("click", () => {
    if (rejectDuringBattle(S)) return;
    if (!redeployArmy(S, button.dataset.redeployArmy, button.dataset.redeployTarget)) { toast("该军团当前无法调动"); return; }
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-castle-launch]").forEach(button => button.addEventListener("click", () => {
    const targetId = button.dataset.castleLaunch;
    const army = armyEntity(S, "army_1");
    const composition = emptyComposition();
    panel.querySelectorAll(`[data-castle-unit="${targetId}"]`).forEach(input => { composition[input.dataset.unitType] = clamp(Math.round(Number(input.value) || 0), 0, Math.round(Number(input.max) || 0)); });
    const total = compositionTotal(composition);
    const knight = panel.querySelector(`[data-castle-knight="${targetId}"]`)?.value;
    const leaderIds = ["player"];
    const plan = panel.querySelector(`[data-castle-plan="${targetId}"]`)?.value || "steady";
    const minimum = compositionSupply(S, composition, leaderIds);
    const grainInput = panel.querySelector(`[data-castle-grain="${targetId}"]`);
    const carried = Math.max(0, Math.round(Number(grainInput?.value) || 0));
    if (!army || army.status !== "idle" || total < 10 || total > armyTotal(S, army.id) || Object.keys(UNIT_DEFS).some(type => composition[type] > (army.composition[type] || 0))) { toast("请先选择不超过主力现有数量的兵种，至少出兵10人"); return; }
    if (carried < minimum || carried > S.grain) { toast(`至少需要携带${minimum}粮食`); return; }
    S.grain -= carried;
    const job = startMarch(S, "army_1", targetId, Date.now(), { battlePlan: { leaderIds, knightIds: knight ? [knight] : [], composition, troops: total, plan, suppliedGrain: carried } });
    if (!job) { S.grain += carried; toast("王国主力当前无法长途出征"); return; }
    S.lastAction = { name: "远征出发", text: `王国主力携${compositionText(composition)}和${carried}粮食出发，预计${formatDuration(job.endAt - job.startedAt)}后抵达${TERRITORY_DEFS[targetId].name}。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-expedition-army]").forEach(input => input.addEventListener("change", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.armyIds = [...panel.querySelectorAll("[data-expedition-army]")].filter(item => item.checked).map(item => item.dataset.expeditionArmy);
    uiDraft.expedition.grain = null;   // 编成变了，所需粮食跟着变，旧数字作废
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-expedition-plan]").forEach(select => select.addEventListener("change", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.plan = select.value;
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-expedition-grain]").forEach(input => input.addEventListener("input", () => {
    uiDraft.expedition.targetId = selectedId;
    uiDraft.expedition.grain = Math.max(0, Math.round(Number(input.value) || 0));
  }));
  panel.querySelectorAll("[data-expedition-launch]").forEach(button => button.addEventListener("click", () => {
    const targetId = button.dataset.expeditionLaunch;
    const draft = expeditionDraftView(S, targetId);
    const armyIds = draft.armyIds;
    const armies = armyIds.map(id => armyEntity(S, id)).filter(Boolean);
    if (!armyIds.length || armies.some(army => army.status !== "idle") || compositionTotal(draft.composition) < 10) { toast("至少选择一支待命军团"); return; }
    if (draft.grain < draft.required || draft.grain > S.grain) { toast(`这支远征至少需要${draft.required}粮食`); return; }
    S.grain -= draft.grain;
    const job = startArmyGroupMarch(S, armyIds, targetId, Date.now(), { battlePlan: { leaderIds: draft.leaders, composition: draft.composition, troops: compositionTotal(draft.composition), plan: draft.plan, armyIds }, suppliedGrain: draft.grain });
    if (!job) { S.grain += draft.grain; toast("所选军团无法从当前位置合军出发"); return; }
    uiDraft.expedition = { targetId: null, armyIds: null, plan: null, grain: null };
    S.lastAction = { name: "军团远征出发", text: `${armyIds.length > 1 ? "多支军团合军" : armies[0].name}携${draft.grain}粮食前往${TERRITORY_DEFS[targetId].name}，预计${formatDuration(job.endAt - job.startedAt)}后抵达。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
}

function mapRoutes(s) {
  const zones = Object.entries(MAP_POINTS).map(([id, [cx, cy]]) => `<circle cx="${cx}" cy="${cy}" r="10" style="--zone-color:${FACTIONS[s.territories[id].owner].color}"/>`).join("");
  const routes = MAP_LINKS.map(([a, b]) => {
    const [x1, y1] = MAP_POINTS[a];
    const [x2, y2] = MAP_POINTS[b];
    const ownerA = s.territories[a].owner;
    const ownerB = s.territories[b].owner;
    const kind = ownerA === ownerB ? (ownerA === "player" ? "owned" : "enemy") : (ownerA === "player" || ownerB === "player" ? "frontier" : "contested");
    return `<line class="${kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
  return `<svg class="map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${zones}${routes}</svg>`;
}

// 三类领地的职能名。type 以前只用来分「城堡／附属镇」两个字，现在它决定
// 大区控制与防御投射，玩家必须一眼看得出手上这块地是干什么用的。
function territoryRoleName(type) {
  return type === "capital" ? "王城" : type === "castle" ? "核心城堡" : type === "fort" ? "战略要点" : "附庸城镇";
}

function territoryRoleHint(s, id) {
  const d = TERRITORY_DEFS[id];
  if (!d) return "";
  if (d.type === "castle" || d.type === "capital") {
    const held = controlsRegionOf(s, id) && s.territories[id]?.owner === "player";
    return held ? "本区核心城堡 · 已控制本区，同区领地产出与稳定获得加成"
      : "本区核心城堡 · 拿下它，同区自有领地产出与稳定一并提升";
  }
  if (d.type === "fort") return "战略要点 · 易守难养，为相邻的自有领地提高守军上限";
  return "附庸城镇 · 扩张的口粮，产出中庸";
}

function mapNode(id, attackable) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const faction = FACTIONS[t.owner];
  const mine = t.owner === "player";
  const canAttack = attackable.includes(id);
  const locked = d.final && !crownAccessMet(S);
  const minor = d.playable === false;
  const settlementType = territoryRoleName(d.type);
  const seen = reportedGuard(S, id);
  const status = canAttack ? "可出征" : mine ? `我方${settlementType} · 守军${t.guard}` : minor ? "道路节点 · 可侦察" : locked ? "条件未满足" : `守军 ${seen.text}`;
  return `<button type="button" data-map-territory="${id}" class="map-node ${mine ? "mine" : ""} ${minor ? "minor" : ""} ${canAttack ? "attackable" : ""} ${locked ? "locked" : ""}" style="--owner-color:${faction.color};left:${d.x}%;top:${d.y}%">${crestSvg(t.owner, faction.name)}<span><b>${d.name}</b><small>${status}</small></span></button>`;
}

// 出征草稿按目标绑定：换了查看目标，上一块草稿整体作废。
// 与 newArmyDraftView 同理，所有值都按当前真实状态夹取。
function expeditionDraftView(s, id) {
  const eligible = playerArmies(s).filter(army => army.status === "idle" && attackableTerritories(s, army.id).includes(id));
  const eligibleIds = eligible.map(army => army.id);
  const draft = uiDraft.expedition;
  const current = draft.targetId === id;
  let armyIds = current && Array.isArray(draft.armyIds) ? draft.armyIds.filter(armyId => eligibleIds.includes(armyId)) : [];
  if (!armyIds.length) armyIds = eligibleIds.slice(0, 1);
  const plan = current && PLANS[draft.plan] ? draft.plan : "steady";
  const composition = armyGroupComposition(s, armyIds);
  const leaders = armyIds.map(armyId => armyCommander(s, armyEntity(s, armyId)).id);
  const required = armyIds.length ? compositionSupply(s, composition, leaders) : 0;
  const maxGrain = Math.max(required, Math.floor(s.grain));
  const wanted = current && draft.grain != null ? Number(draft.grain) : required;
  const grain = clamp(Math.round(Number.isFinite(wanted) ? wanted : required), required, maxGrain);
  return { eligible, armyIds, plan, composition, leaders, required, grain, maxGrain };
}

function castleExpeditionHtml(s, id) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || t.owner === "player" || d.playable === false) return "";
  const draft = expeditionDraftView(s, id);
  const eligible = draft.eligible;
  const previewIds = draft.armyIds;
  const preview = draft.composition;
  const leaders = draft.leaders;
  const required = draft.required;
  const locked = d.final && !crownAccessMet(s);
  const disabled = locked || !eligible.length || compositionTotal(preview) < 10 || s.grain < required;
  const previewTroops = compositionTotal(preview);
  // 预测跟着实际勾选与方略走。此前恒按「第一支军团 + 稳扎稳打」推演，
  // 玩家改了配置数字却不动，等于给了一个与实际出征无关的数。
  const est = previewTroops ? battleEstimate(s, id, leaders, previewTroops, draft.plan, previewIds[0], preview) : null;
  const risk = previewTroops ? casualtyForecast(s, id, leaders, previewTroops, draft.plan, previewIds[0]) : null;
  const planLevel = intelLevel(s, id);
  const forecastHtml = !est ? ""
    : planLevel === FOG_LEVELS.border
      ? `<div class="battle-estimate ${battleRiskClass(est.ratio)}">胜算预测（未侦察）：<b>${est.label}</b><br>只是从边境远远望过去的判断，具体守军编成、预计伤亡与战力拆解都要斥候回报才有。<br>${terrainAdvice(id, preview)}</div>`
      : `<div class="battle-estimate ${battleRiskClass(est.ratio)}">胜算预测（按当前预选）：<b>${est.label}</b><br>${battlePowerText(est.ratio)}${battleBreakdownText(est)}。预计伤亡${risk.low}—${risk.high}人。${battleMoraleText(est.effectiveMorale, s.morale)}<br>${terrainAdvice(id, preview)}${seasonOf(s).id === "winter" ? " 严冬会额外削弱骑士并增加军粮消耗。" : ""}</div>`;
  return `<section class="castle-plan"><div class="castle-plan-head"><b>从这里配置远征</b><span>${eligible.length ? `可用${eligible.length}支军团 · 预计${formatDuration(Math.min(...eligible.map(army => marchDurationForDistance(s, army.locationId, id))))}` : "没有在途或待命军团"}</span></div>
    <p class="expedition-note">选择一支军团单独出征，或勾选多支军团合军。每支军团会保留自己的兵种和指挥官。</p>
    ${forecastHtml}
    <div class="expedition-army-list">${eligible.length ? eligible.map(army => { const commander = armyCommander(s, army); return `<label class="expedition-army-row"><input type="checkbox" data-expedition-army="${army.id}" ${previewIds.includes(army.id) ? "checked" : ""}><span><b>${esc(army.name)}</b><small>${esc(commander.person?.name || "未任命")} · ${commander.isKnight ? "骑士" : "王子"} · ${compositionTotal(army.composition)}人 · ${compositionText(army.composition)}</small></span></label>`; }).join("") : `<div class="empty-state">先在军队页组建军团，再回到地图出征。</div>`}</div>
    <div class="castle-plan-grid"><label>作战方式<select data-expedition-plan="${id}">${Object.entries(PLANS).map(([planId, plan]) => `<option value="${planId}" ${planId === draft.plan ? "selected" : ""}>${plan.name}</option>`).join("")}</select></label><label>携带粮食<input type="number" min="${required}" max="${draft.maxGrain}" value="${draft.grain}" data-expedition-grain="${id}"><small>当前预选至少需要${required}粮。</small></label></div>
    <button class="city-attack-btn" data-expedition-launch="${id}" ${disabled ? "disabled" : ""}>${locked ? "王冠谷 · 条件未满足" : !eligible.length ? "没有可出征军团" : s.grain < required ? "粮食不足" : `出征 · ${d.name}`}</button></section>`;
}

// 自家领地的调军入口。驻防信息也在这里显示 —— 玩家要能一眼看出
// 这座城现在有没有野战部队撑着。
function armyRedeployHtml(s, id) {
  const stationed = stationedArmies(s, id);
  const stationedLine = stationed.length
    ? `<p class="redeploy-stationed">驻防：${stationed.map(army => `${esc(army.name)} ${compositionTotal(army.composition)}人${army.status === "recovering" ? "（整补中）" : ""}`).join("、")}</p>`
    : `<p class="redeploy-stationed">当前没有军团驻防，只有守军把守。</p>`;
  const movable = playerArmies(s).filter(army => army.status === "idle" && army.locationId !== id);
  const buttons = movable.length
    ? `<div class="expedition-army-list">${movable.map(army => `<button class="secondary-btn" data-redeploy-army="${army.id}" data-redeploy-target="${id}">调「${esc(army.name)}」来此 · ${compositionTotal(army.composition)}人 · 预计${formatDuration(marchDurationForDistance(s, army.locationId, id))}</button>`).join("")}</div>`
    : "";
  return `<section class="castle-plan"><div class="castle-plan-head"><b>调军驻防</b><span>${movable.length ? `${movable.length}支待命军团可调来` : "没有可调动的待命军团"}</span></div>${stationedLine}${buttons}</section>`;
}

function territorySummary(s, id, attackable = []) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  const faction = FACTIONS[t.owner];
  const actions = cityActionOptions(s, id);
  const cityJob = cityActionJob(s, id);
  const intel = t.owner === "player" ? "自家领地"
    : cityIntelActive(s, id) ? "斥候情报有效（两季后过期）"
    : intelLevel(s, id) === FOG_LEVELS.border ? "与我方接壤，只能远远望见个大概"
    : "未侦察 · 城内情况不明";
  const actionHtml = cityJob ? `<div class="city-queue"><b>斥候行动进行中</b><span data-job-countdown="${cityJob.id}" data-job-prefix="">${formatDuration(getJobRemainingMs(cityJob))}</span><small>完成后会记录这座城的基础军情。</small></div>` : actions.length ? `<div class="city-actions">${actions.map(action => `<button data-city-action="${action.id}" data-city-id="${id}" ${action.disabled ? "disabled" : ""}><b>${action.name}</b><small>${action.note}</small></button>`).join("")}</div>` : "";
  const attack = attackable.includes(id) ? `<button class="city-attack-btn" data-city-attack="${id}">打开出征配置</button>` : "";
  const castlePlan = t.owner !== "player" && d.playable !== false ? castleExpeditionHtml(s, id) : "";
  const redeployPlan = t.owner === "player" ? armyRedeployHtml(s, id) : "";
  const settlementType = territoryRoleName(d.type);
  // 每块叛臣领地都有具名守将，地图是玩家挑目标的地方，必须能看见守的是谁。
  const lord = lordAt(s, id);
  const lordDef = lord ? LORD_DEFS[lord.id] : null;
  const level = intelLevel(s, id);
  const lordLine = lord && level === FOG_LEVELS.dark
    ? `<span class="city-lord city-fogged">城头挂着旗号，但看不清是谁在守 —— 派一队斥候过去。</span><br>`
    : lord
    ? `<span class="city-lord"><b>${esc(lord.name)}</b> · ${esc(lordDef?.title || "")}<br>${esc(lordDef?.oldTie || "")} · 抵抗 ${Math.round(lord.defiance ?? 0)} · 说服阻力 ${Math.max(0, Math.ceil(lordResistance(s, lord.id)))}${lordDef?.liege ? ` · 主君 ${esc(LORD_DEFS[lordDef.liege].name)}` : " · 独立割据"}</span><br>`
    : "";
  const seenGuard = reportedGuard(s, id);
  const guardLine = t.owner === "player" ? `守军 ${t.guard}` : `守军 ${seenGuard.text}`;
  const brief = `<div class="city-brief"><div class="city-inspector-head"><div><small style="color:${faction.color}">${faction.name} · ${settlementType}</small><h3>${d.name}</h3></div><b class="city-relation">${t.owner === "player" ? "我方领地" : lord ? "叛臣据守" : "无人据守"}</b></div><p>${lordLine}${d.terrain} · ${guardLine} · 民心 ${Math.round(S.support)}<br><span class="city-role">${territoryRoleHint(s, id)}</span><br>${esc(d.desc)}<br><span class="city-intel">${intel}</span></p>${actionHtml}</div>`;
  const ops = attack || castlePlan || redeployPlan ? `<div class="city-ops">${attack}${castlePlan}${redeployPlan}</div>` : "";
  return `<article class="${ops ? "has-ops" : ""}" style="--owner-color:${faction.color}">${brief}${ops}</article>`;
}

function terrainAdvice(targetId, composition) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  if (tags.includes("plains")) return (composition.knights || 0) + (composition.light_cavalry || 0) >= 3 ? "开阔地适合骑士冲锋。" : "开阔地缺少遮蔽，没有骑兵时突破会更依赖人数。";
  if (tags.includes("forest")) return (composition.archers || 0) + (composition.crossbowmen || 0) >= 4 ? "远射兵可借密林掩护前进，骑士难以展开。" : "密林会削弱骑兵，最好带足远射兵或谋略家臣。";
  if (tags.includes("mountain")) return "山道狭窄，弓手和长矛兵更可靠，骑士战力大幅受限。";
  if (tags.includes("river")) return "河网切碎冲锋路线，弓手能隔水压制守军。";
  return "这里的地形会影响远射和骑兵，人数、军心与作战方式更加重要。";
}

function unitUnlockLabel(s, type, territoryId) {
  const unit = UNIT_DEFS[type];
  if (unit.unlockTech && !techCompleted(s, unit.unlockTech)) return `完成${techDefinition("military", unit.unlockTech)?.name || "军事科技"}`;
  if (["knights", "heavy_infantry", "light_cavalry"].includes(type) && s.renown < 15 && (s.territories[territoryId].buildings.barracks || 0) < 2) return "需要15威望或2级兵营";
  return `征募 +${recruitAmount(s, type, territoryId)} · ${unit.gold}金/${unit.grain}粮`;
}

function armyRosterHtml() {
  const territoryId = recruitmentTerritoryId(S);
  const garrison = territoryGarrison(S, territoryId);
  const place = TERRITORY_DEFS[territoryId]?.name || "本领地";
  const army = armyEntity(S, "army_1");
  const deployable = army?.status === "idle" && army.locationId === territoryId && compositionTotal(garrison) > 0;
  const main = army?.composition || emptyComposition();
  return `<div class="army-roster"><div class="section-note">王国主力：${compositionText(main)} · ${compositionTotal(main)}人；${place}待编驻军：${compositionText(garrison)}。六个兵种各排各的队，可以同时训练；完成后先进入驻军，再由主力驻扎时编入。</div>${deployable ? `<button class="secondary-btn" data-deploy-garrison="${territoryId}">把${place}驻军编入王国主力</button>` : ""}${Object.entries(UNIT_DEFS).map(([type, unit]) => { const job = runningRecruitJob(S, territoryId, type); const label = job ? `训练中 · ${formatDuration(getJobRemainingMs(job))}` : unitUnlockLabel(S, type, territoryId); const count = garrison[type] || 0; const mainCount = main[type] || 0; const equipment = unitEquipment(S, type); return `<article class="unit-card"><div class="unit-head"><b>${glyphSvg(type)}${unit.name}</b><strong>${mainCount}<small>主力 · ${count}待编</small></strong></div><p>${unitDisplayHint(type)}<br>装备等级 ${equipment.level}</p><button data-recruit-unit="${type}" ${!canRecruitUnit(S, type, territoryId) ? "disabled" : ""}>${job ? `<span data-job-countdown="${job.id}" data-job-prefix="训练中 · ">${label}</span>` : label}</button></article>`; }).join("")}</div>`;
}

// 把草稿折算成「这一刻真正能用的值」。草稿是玩家上一秒的意图，世界这一秒
// 可能已经变了 —— 主力打完仗掉了兵、骑士阵亡或去带了别的军团。
// 一律按当前真实状态夹取，不能直接信草稿，否则会变成一次静默的非法提交。
function newArmyDraftView(s) {
  const main = armyEntity(s, "army_1");
  const comp = main?.composition || emptyComposition();
  const assigned = assignedCommanderIds(s);
  const options = [{ id: "player", name: `${s.playerName} · 王子亲征` }]
    .filter(option => canUseCommander(s, option.id))
    .concat(activeKnights(s).filter(knight => !assigned.has(knight.id)).map(knight => ({ id: knight.id, name: `${knight.name} · 骑士` })));
  const units = {};
  Object.keys(UNIT_DEFS).forEach(type => {
    units[type] = clamp(Math.round(Number(uiDraft.newArmy.units?.[type]) || 0), 0, comp[type] || 0);
  });
  const commanderId = options.some(option => option.id === uiDraft.newArmy.commanderId)
    ? uiDraft.newArmy.commanderId
    : (options[0]?.id || null);
  return { options, units, commanderId, name: uiDraft.newArmy.name ?? "第二军团", main, comp };
}

function armyCorpsHtml(s = S) {
  const armies = playerArmies(s);
  const draft = newArmyDraftView(s);
  const main = draft.main;
  const commanderOptions = draft.options;
  const home = primaryTerritoryId(s);
  const canCreate = main?.status === "idle" && compositionTotal(main.composition) >= 20 && commanderOptions.length > 0;
  return `<section class="corps-panel"><div class="section-head"><h2>军团编制</h2><span>${armies.length}支军团 · 每支由王子或骑士带领</span></div>
    <div class="corps-grid">${armies.map(army => { const commander = armyCommander(s, army); const canDisband = army.id !== "army_1" && army.status === "idle"; return `<article class="corps-card ${army.id === "army_1" ? "primary" : ""}"><div class="corps-card-head"><b>${esc(army.name)}</b><span>${army.id === "army_1" ? "主军" : "独立军团"}</span></div><p><strong>${esc(commander.person?.name || "未任命")}</strong> · ${commander.isKnight ? "骑士" : "王子"}<br>${TERRITORY_DEFS[army.locationId]?.name || "未知地点"} · ${armyStatusText(s, army)}</p><div class="stat-chips"><span>${compositionTotal(army.composition)}人</span><span>${compositionText(army.composition)}</span></div>${army.status === "idle" && army.locationId !== home ? `<button class="ghost-btn" data-redeploy-army="${army.id}" data-redeploy-target="${home}">调回${TERRITORY_DEFS[home]?.name || "主城"}</button>` : ""}${canDisband ? `<button class="ghost-btn" data-disband-army="${army.id}">解散军团</button>` : `<small class="corps-note">${army.id === "army_1" ? "主军不可解散" : "行军或交战中"}</small>`}</article>`; }).join("")}</div>
    <div class="corps-create"><div><h3>组建新军团</h3><p>从渡鸦第一军团抽调兵力，至少留下10人。组建完成后，地图上可以单独出征或合军。</p></div>
      <div class="corps-create-grid"><label>军团名称<input id="newArmyName" maxlength="18" value="${esc(draft.name)}" placeholder="例如：黑棘骑士团"></label><label>带队指挥官<select id="newArmyCommander">${commanderOptions.map(option => `<option value="${option.id}" ${option.id === draft.commanderId ? "selected" : ""}>${esc(option.name)}</option>`).join("")}</select></label></div>
      <div class="corps-unit-picks">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<label><span>${unit.name} · 主军${main?.composition[type] || 0}</span><input type="number" min="0" max="${main?.composition[type] || 0}" value="${draft.units[type]}" data-new-army-unit="${type}"></label>`).join("")}</div>
      <button class="secondary-btn" data-create-army ${canCreate ? "" : "disabled"}>${canCreate ? "组建军团" : "主军至少需要20人，且要有空闲骑士"}</button>
    </div></section>`;
}

function bindArmyControls(panel) {
  bindFold(panel, "battlelog", foldState.sections);
  // 记录草稿但不重渲染：重渲染会打断正在输入的光标。
  // 草稿本身足以让值活过下一次 renderAll()。
  panel.querySelectorAll("[data-new-army-unit]").forEach(input => input.addEventListener("input", () => {
    uiDraft.newArmy.units[input.dataset.newArmyUnit] = Math.max(0, Math.round(Number(input.value) || 0));
  }));
  panel.querySelector("#newArmyName")?.addEventListener("input", event => { uiDraft.newArmy.name = event.target.value; });
  panel.querySelector("#newArmyCommander")?.addEventListener("change", event => { uiDraft.newArmy.commanderId = event.target.value; });
  panel.querySelectorAll("[data-create-army]").forEach(button => button.addEventListener("click", () => {
    const draft = newArmyDraftView(S);
    const army = createArmyFromMain(S, uiDraft.newArmy.name || "第二军团", draft.commanderId || "player", draft.units);
    if (!army) { toast("兵力、指挥官或主军状态不符合组建条件"); return; }
    uiDraft.newArmy = { name: "第二军团", commanderId: null, units: {} };
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-disband-army]").forEach(button => button.addEventListener("click", () => {
    if (!disbandArmy(S, button.dataset.disbandArmy)) { toast("军团行军或交战中，暂时不能解散"); return; }
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-redeploy-army]").forEach(button => button.addEventListener("click", () => {
    if (rejectDuringBattle(S)) return;
    if (!redeployArmy(S, button.dataset.redeployArmy, button.dataset.redeployTarget)) { toast("该军团当前无法调动"); return; }
    saveGame(); renderAll();
  }));
}

function renderCampaign() {
  if (S.battleSession) { renderActiveBattle(); return; }
  syncTroops(S);
  const panel = $("panel");
  const armies = playerArmies(S);
  const totalMobile = armies.reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  const activeUnits = new Set(armies.flatMap(army => Object.entries(army.composition).filter(([, count]) => count > 0).map(([type]) => type))).size;
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE WAR COUNCIL</span><h2>军队与军团</h2><p>军队页负责募兵和编制。先把兵卒分成几支由王子或骑士带领的军团，再去地图选择目标出征；地图上可以单独出征，也可以多军团合军。</p>${metrics([[totalMobile, "机动兵力"], [activeUnits, "现役兵种"], [armies.length, "军团数量"], [activeKnights(S).length, "在列骑士"]])}</section>
    ${armyCorpsHtml()}
    <div class="section-head"><h2>兵种与补充</h2><span>训练完成后进入本地驻军，再编入渡鸦第一军团</span></div>${armyRosterHtml()}
    ${renderBattleLog()}`;
  bindArmyControls(panel);
  panel.querySelectorAll("[data-recruit-unit]").forEach(button => button.addEventListener("click", () => recruitUnit(button.dataset.recruitUnit)));
  panel.querySelectorAll("[data-deploy-garrison]").forEach(button => button.addEventListener("click", () => { if (!deployGarrison(S, button.dataset.deployGarrison)) toast("第一军团必须驻扎在本地且完成整补"); saveGame(); renderAll(); }));
}

function renderActiveBattle() {
  const panel = $("panel");
  const session = S.battleSession;
  const target = TERRITORY_DEFS[session.targetId];
  const enemyFaction = S.territories[session.targetId].owner;
  const enemyCommander = defenderLeader(S, session.targetId);
  const playerLeaders = session.leaderIds.map(id => commanderById(S, id)).filter(Boolean);
  const options = stageOptions(S, session);
  const stageName = ["接近敌军", "正面交战", "最后阶段"][session.stage];
  const marker = clamp(50 + session.momentum / 2, 1, 99);
  const situation = battleSituation(session);
  const phaseNames = ["接近敌军", "正面交战", "最后阶段"];
  panel.innerHTML = `<section class="battle-session"><div class="battle-visual" style="background-image:url('${battleBackground(session.targetId)}')"><div class="battle-unit-row">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<span class="battle-unit-chip">${glyphSvg(type)}<span>${unit.short}</span><b>${session.composition[type] || 0}</b></span>`).join("")}</div><div class="battle-commanders"><div class="commander-side" style="--crest-color:${FACTIONS.player.color}"><span class="crest">${crestSvg("player", FACTIONS.player.name)}</span><div><b>${playerLeaders.map(o => esc(o.name)).join("、")}</b><small>${FACTIONS.player.name} · ${compositionText(session.composition)}</small></div></div><div class="commander-side enemy" style="--crest-color:${FACTIONS[enemyFaction].color}"><span class="crest">${crestSvg(enemyFaction, FACTIONS[enemyFaction].name)}</span><div><b>${esc(enemyCommander?.name || FACTIONS[enemyFaction].name)}</b><small>${target.name} · 守军 ${S.territories[session.targetId].guard}</small></div></div></div></div><div class="battle-session-head"><span class="eyebrow">CAMPAIGN IN PROGRESS · ${esc(target.terrain)}</span><h2>${target.name}之战 · ${stageName}</h2><div class="battle-timeline">${phaseNames.map((name, index) => `<span class="battle-phase ${index < session.stage ? "done" : index === session.stage ? "active" : ""}"><i>${index + 1}</i>${name}</span>`).join("")}</div><div class="stat-chips"><span>出征 ${session.troops}</span><span>${compositionText(session.composition)}</span><span>损失 ${compositionText(session.lossesByType || {})}</span><span>${PLANS[session.plan].name}</span></div><div class="momentum-label"><span>我军劣势</span><b>${battleMomentumText(session.momentum)}</b><span>我军优势</span></div><div class="momentum-track"><i style="left:${marker}%"></i></div></div><div class="battle-situation"><b>战况推演 · ${situation.title}</b><p>${situation.text}</p></div>
    <div class="battle-stage-list">${session.history.length ? session.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("") : `<div class="empty-state">两军尚未接触。请选择第一道军令。</div>`}</div>
    <div class="battle-choices"><h3>${stageName}：选择军令</h3><div class="choice-stack">${options.map(o => `<button class="stage-choice" data-stage-choice="${o.id}"><b>${esc(o.name)}</b><small>${esc(o.by)} · ${esc(o.desc)}</small><em>${battleChoiceHint(o)}</em></button>`).join("")}</div></div></section>`;
  panel.querySelectorAll("[data-stage-choice]").forEach(button => button.addEventListener("click", () => {
    applyBattleChoice(S, button.dataset.stageChoice);
    saveGame();
    renderAll();
    if (!S.battleSession) pumpDecision();
  }));
}

function battleBackground(targetId) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  if (tags.includes("capital")) return "assets/battle-capital.webp";
  if (tags.includes("plains")) return "assets/battle-plains.webp";
  if (tags.includes("forest")) return "assets/battle-forest.webp";
  if (tags.includes("mountain")) return "assets/battle-mountain.webp";
  if (tags.includes("river")) return "assets/battle-river.webp";
  return "assets/battle-plains.webp";
}

// 战报改为可折叠的历史，并且两个方向都记：我打出去的，和别人打进来的。
// 此前只有 s.lastBattle 一条，敌军来袭更是完全不留痕迹，玩家事后无从复盘。
function renderBattleLog() {
  const entries = S.battleLog || [];
  const attacks = entries.filter(e => e.dir === "attack");
  const defends = entries.filter(e => e.dir === "defend");
  if (!entries.length && !S.lastBattle) return "";
  const row = e => {
    const when = `第${Math.floor(e.turn / 4) + 1}年${SEASONS[e.turn % 4].name}`;
    if (e.dir === "attack") {
      const label = e.outcome === "win" ? "胜" : e.outcome === "retreat" ? "撤退" : "败";
      return `<article class="log-row"><time>${when}</time><div><b class="battle-dir-out">出征 · ${esc(e.targetName)} · ${label}</b><p>我军损失 ${e.ourLoss || 0} 人，敌军约损失 ${e.theirLoss || 0} 人。</p></div></article>`;
    }
    const lost = e.outcome === "lost";
    return `<article class="log-row"><time>${when}</time><div><b class="battle-dir-in">来袭 · ${esc(e.targetName)} · ${lost ? "失守" : "遭袭扰"}</b><p>${esc(e.attacker || "敌军")}${lost ? "攻占了这里。" : `抢走 ${e.lostGrain || 0} 粮和 ${e.lostGold || 0} 金。`}</p></div></article>`;
  };
  const body = `<div class="chronicle">${entries.length ? entries.map(row).join("") : `<div class="empty-state">还没有交战记录。</div>`}</div>${S.lastBattle ? renderLastBattle(S.lastBattle) : ""}`;
  return `<div class="section-head"><h2>战报</h2><span>点开查看历次交战</span></div>
    ${foldBlock("battlelog", "log", "交战记录", `出征 ${attacks.length} 次 · 来袭 ${defends.length} 次`,
      entries.length ? `最近：${esc(entries[0].dir === "attack" ? "出征 " + entries[0].targetName : "来袭 " + entries[0].targetName)}` : "暂无",
      body, foldState.sections)}`;
}

function renderLastBattle(report) {
  const label = report.outcome === "win" ? "胜利" : report.outcome === "retreat" ? "撤退" : "战败";
  const lossText = report.lossesByType ? `（${compositionText(report.lossesByType)}）` : "";
  const costText = report.garrisoned ? ` · 抽调${report.garrisoned}人驻守` : report.lostGold || report.lostGrain ? ` · 丢失${report.lostGold || 0}金币和${report.lostGrain || 0}粮食` : "";
  return `<div class="section-head"><h2>上一场战报</h2><span>${label}</span></div><div class="battle-session"><div class="battle-result"><span class="eyebrow">战斗结果 · AFTER ACTION REPORT</span><strong>${label}</strong><p>${esc(report.targetName)} · 我军损失${report.losses}人${lossText} · 敌军约损失${report.enemyLoss}人${costText}${report.injured?.length ? ` · ${esc(report.injured.join("、"))}负伤` : ""}</p></div><div class="battle-stage-list">${report.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("")}</div></div>`;
}

function talkOfficer(id) {
  if (rejectDuringBattle(S)) return false;
  const o = officer(S, id);
  if (!o || o.side !== "player" || o.id === "player" || S.gold < 3) { toast("需要3金币"); return; }
  S.gold -= 3;
  const gain = 4;
  o.loyalty = clamp(o.loyalty + gain);
  o.grievance = clamp(o.grievance - 5);
  S.lastAction = { name: `召见${o.name}`, text: `花费3金币安排私宴与赏赐。忠诚 +${gain}，不满 −5。` };
  log(S, "info", `你在私室召见${o.name}，听取了他对领地近况的意见。`);
  saveGame(); renderAll();
}

function knightAction(id, actionId, state = S) {
  if (!state || rejectDuringBattle(state)) return false;
  const knight = knightById(state, id);
  if (!knight || getRunningJob(state, `knight:${id}`)) return false;
  const allowed = {
    // 只招得动无主游侠；有主君的骑士要先收服其主君（见 availableKnights）
    recruit: knight.status === "available" && knight.side === "neutral" && !knight.liegeLordId,
    surrender: knight.status === "captured" && knight.side !== "player",
    execute: knight.status === "captured" && knight.side !== "player",
    release: knight.status === "captured" || (knight.status === "active" && knight.side === "player")
  };
  if (!allowed[actionId]) return false;
  const cost = actionId === "recruit" ? knight.recruitCost : actionId === "surrender" ? 4 : 0;
  if (state.gold < cost) { if (state === S) toast(`需要${cost}金币`); return false; }
  state.gold -= cost;
  const job = startJob(state, {
    type: "KNIGHT_ACTION", startedAt: Date.now(), durationMs: JOB_CONFIG.KNIGHT_RECRUIT.durationMs,
    queueKey: `knight:${id}`, payload: { knightId: id, actionId, loyalty: actionId === "surrender" ? 42 : 58, gold: cost }
  });
  if (job) {
    knight.status = actionId === "recruit" ? "recruiting" : actionId === "surrender" ? "negotiating" : "processing";
    state.lastAction = { name: actionId === "recruit" ? "招募骑士排队" : actionId === "surrender" ? "招降骑士排队" : actionId === "execute" ? "处死骑士排队" : "释放骑士排队", text: `${knight.name}将在${formatDuration(job.endAt - job.startedAt)}后完成处理。` };
    log(state, "info", state.lastAction.text);
    if (state === S) { saveGame(); renderAll(); }
  }
  return !!job;
}

function knightCard(knight) {
  const job = getRunningJob(S, `knight:${knight.id}`);
  const status = knight.status === "active" ? "我方骑士" : knight.status === "captured" ? "俘虏" : knight.status === "available" ? "待招募" : knight.status === "gone" || knight.status === "executed" ? "已离场" : knight.status === "released" ? "已释放" : "处理中";
  const buttons = [];
  if (knight.status === "available" && knight.side === "neutral") buttons.push(`<button class="secondary-btn" data-knight-action="recruit" data-knight-id="${knight.id}" ${job || S.gold < knight.recruitCost ? "disabled" : ""}>${job ? `处理中 · ${formatDuration(getJobRemainingMs(job))}` : `招募 · ${knight.recruitCost}金`}</button>`);
  if (knight.status === "captured") {
    buttons.push(`<button class="secondary-btn" data-knight-action="surrender" data-knight-id="${knight.id}" ${job || S.gold < 4 ? "disabled" : ""}>招降 · 4金</button>`);
    buttons.push(`<button class="danger-btn" data-knight-action="execute" data-knight-id="${knight.id}" ${job ? "disabled" : ""}>处死</button>`);
  }
  if (knight.status === "active" || knight.status === "captured") buttons.push(`<button class="ghost-btn" data-knight-action="release" data-knight-id="${knight.id}" ${job ? "disabled" : ""}>释放</button>`);
  return `<article class="knight-card"><div class="knight-mark">骑</div><div class="card-copy"><div class="role-line"><h3>${esc(knight.name)}</h3><span>${status}</span></div><p>无立绘骑士 · 武力${knight.force} · 谋略${knight.scheme || 45}</p><div class="knight-actions">${buttons.join("")}</div></div></article>`;
}

function renderCourt() {
  const panel = $("panel");
  const own = ownedOfficers(S);
  const rebels = Object.entries(LORD_DEFS).filter(([, def]) => def.tier !== "loyal");
  const enemies = rebels.map(([id]) => officer(S, id)).filter(o => o && o.side !== "player" && o.side !== "gone");
  const captured = enemies.filter(o => o.captured);
  const averageLoyalty = own.length > 1 ? Math.round(own.filter(o => o.id !== "player").reduce((sum, o) => sum + o.loyalty, 0) / (own.length - 1)) : 100;
  const knights = S.knights || [];
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">COMMANDERS & KNIGHTS</span><h2>将领与骑士</h2><p>父亲死后，旧日臣属各自独立。打下他们的最后一座城，才能决定其去留；骑士随主君进退，只有无主的游侠才能用金币直接招募。</p>${metrics([[own.length, "我方领主"], [enemies.length, "在野叛臣"], [captured.length, "待处置俘虏"], [activeKnights(S).length, "我方骑士"]])}</section>
    <div class="section-head"><h2>将领名册</h2><span>点开一栏展开其中的卡片</span></div>
    ${foldBlock("court", "own", "我方领主", `平均忠诚 ${averageLoyalty}`, `${own.length} 人`,
      `<div class="officer-grid">${own.map(o => `<div class="officer-slot">${officerCard(o)}</div>`).join("")}</div>`, foldState.sections)}
    ${foldBlock("court", "rebels", "北境叛臣", "打服、说服或收买",
      `${enemies.length} 人在野${captured.length ? ` · <em class="fold-busy">${captured.length} 名待处置</em>` : ""}`,
      `<div class="officer-grid">${enemies.length ? enemies.map(lord => {
      const def = LORD_DEFS[lord.id];
      const holdings = lordHoldings(S, lord.id);
      const liege = def.liege ? LORD_DEFS[def.liege].name : "独立";
      const routes = lordRouteStatus(S, lord.id);
      const status = lord.captured ? "已被俘，等待处置" : holdings.length ? `据守${holdings.map(id => TERRITORY_DEFS[id].name).join("、")}` : "已失去全部辖地";
      return `<article class="officer-card enemy">${def.portrait ? `<img src="${def.portrait}" alt="${esc(def.name)}">` : `<div class="knight-mark">${esc(def.name.slice(0, 1))}</div>`}
        <div class="card-copy"><div class="role-line"><h3>${esc(def.name)}</h3><span>${esc(def.title)}</span></div>
        <p>${esc(def.oldTie || "")}<br>主君：${esc(liege)} · 抵抗 ${Math.round(lord.defiance ?? def.defiance)}</p>
        <div class="loyalty-line"><span>${esc(status)}</span><b>${holdings.length}座城</b></div>
        <div class="lord-routes">
          <span class="route ${routes.force.available ? "on" : ""}">打服 · ${esc(routes.force.detail)}</span>
          <span class="route ${routes.persuade.available ? "on" : ""}">说服 · ${esc(routes.persuade.detail)}</span>
          <span class="route ${routes.bribe.available ? "on" : ""}">收买 · ${esc(routes.bribe.detail)}</span>
        </div>
        <div class="lord-actions">
          ${routes.persuade.available ? `<button class="secondary-btn" data-demand-fealty="${lord.id}">要求效忠</button>` : ""}
          ${routes.bribe.available ? `<button class="ghost-btn" data-bribe-lord="${lord.id}">收买 · ${lordBribeCost(S, lord.id)}金</button>` : ""}
        </div></div></article>`;
    }).join("") : `<div class="empty-state">北境已经没有仍举着旧旗的叛臣。</div>`}</div>`, foldState.sections)}
    ${foldBlock("court", "knights", "骑士名册", `${availableKnights(S).length} 名游侠可招募`,
      `${activeKnights(S).length} 名在列`,
      `<div class="knight-grid">${knights.filter(k => !["gone", "executed", "released", "hostile"].includes(k.status)).map(knightCard).join("") || `<div class="empty-state">暂时没有可处理的骑士。</div>`}</div>`, foldState.sections)}`;
  bindFold(panel, "court", foldState.sections);
  panel.querySelectorAll("[data-knight-action]").forEach(button => button.addEventListener("click", () => knightAction(button.dataset.knightId, button.dataset.knightAction)));
  panel.querySelectorAll("[data-demand-fealty]").forEach(button => button.addEventListener("click", () => {
    if (!demandFealty(S, button.dataset.demandFealty)) { toast("当前还无法让他效忠"); return; }
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-bribe-lord]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.bribeLord;
    if (!bribeLord(S, id, lordHoldings(S, id)[0] || null)) { toast("金币不足，或此人不收钱"); return; }
    saveGame(); renderAll();
  }));
}

function renderChronicle() {
  const panel = $("panel");
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE CHRONICLE</span><h2>复国编年史</h2><p>这里记录建设、侦察、封赏、战争和重大事件。</p>${metrics([[S.battles, "出征次数"], [S.wins, "胜场"], [S.casualties, "累计伤亡"], [ownTerritoryIds(S).length, "控制领地"]])}</section>
    <div class="section-head"><h2>渡鸦家编年史</h2><span>最近120条</span></div><div class="chronicle">${S.log.map(item => `<article class="log-row"><time>第${Math.floor(item.turn / 4) + 1}年 · ${SEASONS[item.turn % 4].name}</time><div><b>${item.kind === "good" ? "进展" : item.kind === "bad" ? "损失" : item.kind === "warn" ? "警示" : "记录"}</b><p>${cleanDisplayText(item.text)}</p></div></article>`).join("")}</div>`;
}

function endingCopy(s) {
  const style = currentStyle(s);
  if (s.endingReason === "fallen") return { title: "渡鸦堡陷落", text: "清晨，敌军从东门进入渡鸦堡。城墙上的守军已经不足一队，渡鸦旗在午前被扯下。" };
  if (s.endingReason === "collapsed") return { title: "领地崩溃", text: "没有敌军攻破城墙。军饷拖欠后，士兵先散去；冬粮见底后，村民开始逃亡。最后一次议事，没有家臣到场。" };
  if (s.endingReason === "crowned") return { title: "铁冠加于他人之头", text: "钟声从王冠谷传来时，你还在自己的城墙上。摄政公爵完成了加冕，渡鸦家的继承权从此只是一段无人过问的旧事。" };
  if (style === "oath") return { title: "守信领主统一北境", text: "王冠谷陷落后，旧领主、村镇代表和渡鸦家的功臣在大厅宣誓效忠。你曾答应保留的土地、旧规矩和封赏，大多得到了兑现。" };
  if (style === "iron") return { title: "强硬领主统一北境", text: "最后一面敌旗落下后，各地守军被重新编制，税册和军令统一送往渡鸦堡。北境很少再发生公开反抗，城堡地牢却始终没有空过。" };
  return { title: "经营领主统一北境", text: "战争结束后，七领使用了同一套税册和度量。商路重新开放，磨坊和集市按季向渡鸦堡纳税，你的金库足以维持一支常备军。" };
}

function endingVisual(s) {
  if (s.endingReason === "fallen") return { src: "assets/battle-capital.webp", alt: "陷落的渡鸦堡", cls: "ending-fallen" };
  if (s.endingReason === "collapsed") return { src: "assets/oswin.webp", alt: "领地崩溃后的大厅", cls: "ending-collapsed" };
  if (s.endingReason === "minor_lord") return { src: "assets/player.webp", alt: "守住渡鸦堡的领主", cls: "ending-minor" };
  if (s.endingReason === "great_lord") return { src: "assets/northern-march-map.webp", alt: "北境领地图", cls: "ending-great" };
  return { src: "assets/player.webp", alt: "戴上铁冠的北境之主", cls: `ending-unified ending-${currentStyle(s)}` };
}

function showEnding(s) {
  if (typeof document === "undefined") return;
  $("menu").classList.add("hidden");
  $("creator").classList.add("hidden");
  $("prologue").classList.add("hidden");
  $("game").classList.add("hidden");
  $("modalMask").classList.add("hidden");
  $("ending").classList.remove("hidden");
  ["ending-fallen", "ending-collapsed", "ending-minor", "ending-great", "ending-unified", "ending-oath", "ending-iron", "ending-wealth"].forEach(cls => $("ending").classList.remove(cls));
  resetPageScroll();
  const copy = endingCopy(s);
  const visual = endingVisual(s);
  $("ending").classList.add(...visual.cls.split(" "));
  $("endingPortrait").src = visual.src;
  $("endingPortrait").alt = visual.alt;
  const victory = s.endingReason === "unified";
  $("endingBody").innerHTML = `<span class="eyebrow">${victory ? "THE IRON CROWN" : "THE CHRONICLE CLOSES"}</span><h1>${copy.title}</h1><div class="story-body"><p>${copy.text}</p><p class="ending-style"><b>本局统治风格：${STYLES[currentStyle(s)].short}</b></p></div><div class="ending-stats"><div><b>${turnOf(s) + 1}</b><span>经过季度</span></div><div><b>${ownTerritoryIds(s).length}</b><span>最终领地</span></div><div><b>${s.wins}</b><span>胜场</span></div><div><b>${ownedOfficers(s).length}</b><span>最终家臣</span></div></div><button id="endingRestart" class="primary-btn" type="button">重新继承渡鸦堡</button>`;
  $("endingRestart").addEventListener("click", () => {
    if (confirm("删除当前存档并重新开始？")) { deleteSave(); S = null; showMenu(); }
  });
}

function showMenu() {
  $("creator")?.classList.add("hidden");
  $("prologue")?.classList.add("hidden");
  $("game")?.classList.add("hidden");
  $("ending")?.classList.add("hidden");
  $("modalMask")?.classList.add("hidden");
  $("menu")?.classList.remove("hidden");
  resetPageScroll();
  const saved = loadGame();
  const button = $("continueBtn");
  if (saved) {
    button.classList.remove("hidden");
    button.textContent = saved.ended ? `查看结局 · ${saved.playerName}` : `继续 · 第${yearOf(saved)}年${seasonOf(saved).name}季`;
  } else button.classList.add("hidden");
}

function showCreator() {
  $("menu").classList.add("hidden");
  $("creator").classList.remove("hidden");
  resetPageScroll();
}

function renderPrologue() {
  const slide = PROLOGUE[prologueIndex];
  $("prologuePortrait").src = slide.portrait;
  $("prologuePortrait").alt = slide.title;
  $("prologueKicker").textContent = slide.kicker;
  $("prologueTitle").textContent = slide.title;
  $("prologueBody").innerHTML = slide.body.map(p => `<p>${esc(p)}</p>`).join("");
  $("prologueProgress").style.width = `${(prologueIndex + 1) / PROLOGUE.length * 100}%`;
  $("nextPrologueBtn").innerHTML = prologueIndex === PROLOGUE.length - 1 ? "进入议事厅 <span>→</span>" : "继续 <span>→</span>";
  resetPageScroll();
}

function showGame() {
  if (!S) { showMenu(); return; }
  const check = selfCheck(S);
  if (!check.ok && typeof console !== "undefined") console.warn("[iron-crown selfCheck]", check.errors);
  saveGame();
  renderAll();
  pumpDecision();
  resetPageScroll();
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
}

function resetPageScroll() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  });
}

function lockZoom() {
  ["gesturestart", "gesturechange", "gestureend"].forEach(type => document.addEventListener(type, event => event.preventDefault(), { passive: false }));
  ["touchstart", "touchmove"].forEach(type => document.addEventListener(type, event => { if (event.touches?.length > 1) event.preventDefault(); }, { passive: false }));
  document.addEventListener("wheel", event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", event => event.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", event => {
    const now = Date.now();
    if (now - lastTouchEnd < 280) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

function startWorldClock() {
  if (worldTimer) clearInterval(worldTimer);
  worldTimer = setInterval(() => updateWorldTime(Date.now()), TIME_CONFIG.uiTickMs);
}

function boot() {
  lockZoom();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      const resumedAt = Date.now();
      const offlineSeasons = hiddenAt && S ? catchUpOffline(S, resumedAt) : 0;
      hiddenAt = 0;
      if (offlineSeasons && S && !S.ended) {
        renderAll();
        pumpDecision();
      } else updateWorldTime(resumedAt);
    }
  });
  $("newGameBtn")?.addEventListener("click", showCreator);
  $("continueBtn")?.addEventListener("click", () => { S = loadGame(); showGame(); });
  $("difficultyPicker")?.querySelectorAll("[data-difficulty]").forEach(button => button.addEventListener("click", () => {
    creatorDifficulty = button.dataset.difficulty;
    $("difficultyPicker").querySelectorAll("button").forEach(other => other.classList.toggle("active", other === button));
  }));
  $("startGameBtn")?.addEventListener("click", () => {
    S = createInitialState($("playerName").value, "oath", creatorDifficulty);
    prologueIndex = 0;
    $("creator").classList.add("hidden");
    $("prologue").classList.remove("hidden");
    renderPrologue();
  });
  $("nextPrologueBtn")?.addEventListener("click", () => {
    if (prologueIndex < PROLOGUE.length - 1) { prologueIndex++; renderPrologue(); }
    else showGame();
  });
  $("gameNav")?.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    if (!S) { showMenu(); return; }
    if (S.battleSession && button.dataset.tab !== "campaign") { rejectDuringBattle(S); return; }
    S.tab = button.dataset.tab;
    saveGame();
    renderAll();
    resetPageScroll();
  }));
  $("saveBtn")?.addEventListener("click", () => { if (saveGame()) toast("进度已保存在本机"); });
  $("restartBtn")?.addEventListener("click", () => {
    if (confirm("删除当前存档并重新开始？")) { deleteSave(); S = null; showMenu(); }
  });
  showMenu();
  startWorldClock();
}

