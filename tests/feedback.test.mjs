import assert from 'node:assert/strict';
import game from './_game.mjs';
const fresh = () => game.createInitialState('回报验收', 'oath', 'standard');
const clone = x => JSON.parse(JSON.stringify(x));
const total = s => game.playerArmies(s).reduce((n,a) => n+game.compositionTotal(a.composition)+game.compositionTotal(a.wounded || {}),0)+game.ownTerritoryIds(s).reduce((n,id)=>n+game.compositionTotal(s.territories[id].garrison),0);
function begin(s, targetId='ashfield', armyIds=['army_1']) {
  s.grain=500;
  const session=game.startBattle(s,{targetId, armyIds, troops:game.compositionTotal(game.armyGroupComposition(s,armyIds)), plan:'steady', arrival:true},()=>.5);
  assert.ok(session);
  return session;
}
function casualties(session, amount=10) {
  session.playerLoss=amount;
  session.lossesByType=game.allocateLosses(session.composition,amount);
}
{
  const s=fresh(), serialized=JSON.stringify(s);
  for (const type of Object.keys(game.BUILDINGS)) assert.ok(game.buildingBenefit(s,'ravenstone',type));
  assert.equal(JSON.stringify(s),serialized,'收益预览不得改变状态');
  const before=game.forecast(s);
  const text=game.buildingBenefit(s,'ravenstone','fields');
  const job=game.startJob(s,{type:'BUILD',territoryId:'ravenstone',payload:{buildingType:'fields'},durationMs:1});
  game.finishJob(s,job,job.endAt);
  const after=game.forecast(s);
  assert.ok(text.includes(`+${((after.grain-before.grain)/(game.TIME_CONFIG.seasonDurationMs/60000)).toFixed(1)}/分`));
  assert.ok(s.lastAction.text.includes(text),'建成提示与实际收益预览一致');
  s.territories.ravenstone.buildings.barracks=2;
  assert.match(game.buildingBenefit(s,'ravenstone','barracks'),/装备升至2级/);
  s.territories.ravenstone.buildings.fields=5;
  assert.equal(game.buildingBenefit(s,'ravenstone','fields'),'已达最高级');
}
{
  const s=fresh(), first=game.conquestReward(s,'ashfield');
  assert.ok(first.gold>0 && first.grain>0);
  const count=total(s), session=begin(s);casualties(session);
  const beforeGold=s.gold, beforeGrain=s.grain;
  const {report}=game.finishBattle(s,'win',()=>.5);
  assert.equal(report.wounded,4);assert.equal(report.dead,6);
  assert.equal(s.gold-beforeGold,first.gold);assert.equal(s.grain-beforeGrain,first.grain);
  assert.equal(total(s),count-report.dead+first.volunteers,'阵亡、伤兵、驻防、志愿兵必须守恒');
  assert.equal(game.compositionTotal(s.armies[0].wounded),4);
  assert.equal(game.finishBattle(s,'win'),null,'重复结算不得重复发奖');
  const view=game.decisionView(s,s.pendingDecisions[0]);
  assert.match(view.body,/阵亡 6人/);assert.match(view.body,/伤兵 4人/);assert.match(view.body,/驻防调拨/);
  const saved=game.hydrateState(clone(s));
  const army=saved.armies[0], job=saved.jobs.find(j=>j.id===army.jobId);
  const fighting=game.compositionTotal(army.composition);
  game.finishJob(saved,job,job.endAt);
  assert.equal(game.compositionTotal(army.composition),fighting+4);
  assert.equal(game.compositionTotal(army.wounded),0);
  assert.equal(game.finishJob(saved,job,job.endAt),false,'恢复任务只能结算一次');
  saved.territories.ashfield.owner='neutral';
  assert.equal(game.conquestReward(saved,'ashfield').gold,0,'读档后反复夺回不得刷奖励');
  begin(saved);const {report:again}=game.finishBattle(saved,'win',()=>.5);
  assert.equal(again.gains.gold,0);assert.equal(again.reward.volunteers,0);
}
{
  const s=fresh();
  const lord=game.lordAt(s,'ashfield');
  game.submitLord(s,lord.id,'persuade',()=>.5);
  s.territories.ashfield.owner='neutral';
  assert.equal(game.conquestReward(s,'ashfield').gold,0,'和平收服后再丢城不能刷首次奖励');
  const old=fresh();old.victories=['ashfield'];delete old.recoveryRewards;
  const loaded=game.hydrateState(clone(old));
  assert.equal(game.conquestReward(loaded,'ashfield').gold,0,'老档历史胜场应回填');
  assert.equal(game.conquestReward(loaded,'ravenstone').gold,0,'初始领地不发首次奖励');
}
for (const outcome of ['loss','retreat']) {
  const s=fresh(), count=total(s);const session=begin(s);casualties(session);
  const {report}=game.finishBattle(s,outcome,()=>.5);
  assert.equal(report.reward,null);assert.equal(report.wounded,2);assert.equal(report.dead,8);
  assert.equal(total(s),count-report.dead);
  assert.ok(game.conquestReward(s,'ashfield').gold>0,'失败不能消耗首次奖励');
}
{
  const s=fresh();
  const second=clone(s.armies[0]);second.id='army_2';second.name='测试第二军团';
  s.armies.push(second);const count=total(s);
  const session=begin(s,'ashfield',['army_1','army_2']);casualties(session,35);
  const {report}=game.finishBattle(s,'win',()=>.5);
  assert.equal(s.armies.reduce((n,a)=>n+game.compositionTotal(a.wounded || {}),0),report.wounded);
  assert.equal(total(s),count-report.dead+report.reward.volunteers,'合军战损守恒');
  const pre=total(s);
  for(const job of s.jobs.filter(j=>j.type==='RECOVER')) game.finishJob(s,job,job.endAt);
  assert.equal(total(s),pre,'多军团伤兵归队不应增加总人数');
}
{
  const s=fresh(), base=game.recoverySupport(s);
  s.territories.ravenstone.buildings.temple=5;
  s.territories.ravenstone.buildings.roads=5;s.territories.ravenstone.buildings.workshop=5;
  const upgraded=game.recoverySupport(s);
  assert.equal(upgraded.woundRate,.5);assert.equal(upgraded.durationMs,60000);
  assert.ok(upgraded.durationMs<base.durationMs);
  const est=game.battleEstimate(s,'ashfield',['player'],42,'steady');
  s.territories.ravenstone.buildings.barracks=3;
  const armed=game.battleEstimate(s,'ashfield',['player'],42,'steady');
  assert.ok(armed.attack>est.attack);assert.ok(armed.equipmentBonus>est.equipmentBonus);
  assert.match(game.battleBreakdownText(armed),/装备\+10%/);
}
{
  const s=fresh(), session=begin(s);
  session.stage=1;session.ratio=2;
  game.applyBattleChoice(s,'volley',()=>.5);
  assert.equal(session.flags.suppressed,true);
  assert.ok(game.stageOptions(s,session).some(o=>o.id==='breakthrough'));
  assert.ok(game.stageOptions(s,session).some(o=>o.id==='retreat'),'新增配合不能挤掉撤退');
  const {report}=game.applyBattleChoice(s,'breakthrough',()=>.5);
  assert.match(report.history.at(-1).text,/弓骑协同已生效/);
  const no=fresh(), failed=begin(no);failed.stage=1;failed.ratio=.3;
  game.applyBattleChoice(no,'volley',()=>.1);
  assert.ok(!game.stageOptions(no,failed).some(o=>o.id==='breakthrough'));
  failed.flags.suppressed=true;failed.targetId='pineford';
  assert.ok(!game.stageOptions(no,failed).some(o=>o.id==='breakthrough'),'森林不能发动平原突破');
  failed.targetId='ashfield';failed.lossesByType.knights=failed.composition.knights;
  assert.ok(!game.stageOptions(no,failed).some(o=>o.id==='breakthrough'),'骑兵伤亡后不足不能发动');
}
{
  const s=fresh(), at=1_000_000;
  game.pauseWorld(s,'manual',at);
  const j=game.queueRecruitment(s,'levy','ravenstone',at+90000);
  assert.equal(j.startedAt,at);
  assert.equal(j.endAt-at,game.JOB_CONFIG.RECRUIT.durationMs);
  game.resumeWorld(s,at+120000);
  assert.equal(j.endAt-(at+120000),game.JOB_CONFIG.RECRUIT.durationMs,'暂停中排队恢复后仍只需正常时长');
  const s2=fresh();game.pauseWorld(s2,'manual',at);
  const job=game.startJob(s2,{type:'RECOVER',startedAt:at+50000,endAt:at+137000});
  game.resumeWorld(s2,at+100000);
  assert.equal(job.endAt-(at+100000),87000,'显式endAt也保留时长');
}
{
  const s=fresh();s.grain=200;
  const session=game.startBattle(s,{targetId:'ashfield',troops:42,plan:'steady',arrival:true,supplyAlreadyPaid:true,suppliedGrain:45},()=>.5);
  assert.equal(session.supply,45,'战报记录实际携带粮食，而非抵达时重算最低补给');
  const {report}=game.finishBattle(s,'win',()=>.5);
  assert.equal(report.supply,45);
  assert.deepEqual(report.economyAfter,game.forecast(s));
  const view=game.decisionView(s,s.pendingDecisions[0]);view.options[1].effect();
  assert.equal(s.tab,'domain','战后经营入口必须进入真实发展页');
}
console.log('feedback tests passed: preview, rewards, conservation, migration, recovery, combo');
