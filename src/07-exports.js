"use strict";

// 仅 module.exports，供 Node 测试使用。

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createInitialState, hydrateState, seasonOf, forecast, resourceFlow, territoryOutput, buildingCost, BUILDINGS, BUILDING_MAX_LEVEL,
    attackableTerritories, battleEstimate, startBattle, stageOptions, applyBattleChoice,
    finishBattle, defenderLeader, runFactionTurn, resolveAIAttack, resolveAIAnnex, aiTargets, aiArmyCap, aiSeasonIncome, aiArmyPower, reinforceAIArmy, compositionTotal, officer, FACTION_TIMER_KEY, startMarch, marchDurationForDistance, territoryDistance, decisionView, subjects, TERRITORY_DEFS, playableTerritoryIds, LORD_DEFS, LORD_ARCHETYPES, SEAT_TO_LORD, lordAt, lordHoldings, lordVassals, adjacencyPressure, lordResistance, persuasionLeverage, canPersuadeLord, lordBribeCost, submitLord, SUBMIT_LOYALTY, demandFealty, bribeLord, lordRouteStatus, BRIBE_LEGITIMACY_COST, FIEF_PROMISE_DUE_MS, PERSUADE_LEGITIMACY_GAIN,
    SEASONS, PLANS, UNIT_DEFS, clamp, armyTotal, syncTroops,
    selectedComposition, compositionPower, campaignSupply, allocateLosses, recruitAmount, canRecruitUnit, unitLevel, unitEquipment, counterMultiplier, defenderComposition, knightBattleMultiplier,
    settleSeasonEconomy, casualtyForecast, queueSeasonEvents, WORLD_EVENTS, NPC_ARCS,
    applyEventEffects, handleOfficerPolitics, interactionLocked, checkDefeat,
    enemyGuardCap, CRISIS_LIMITS, gainLegitimacy, LEGITIMACY_DELTAS, DUCHY_HOLDINGS, CROWN_GATE_HOLDING, battleRiskClass, crownRequirements, crownAccessMet, crownRequirementText, coronationRemainingMs, delayCoronation, CORONATION_AT_MS, CORONATION_DELAY_MS, VERSION, TIME_CONFIG, JOB_CONFIG, TECH_DEFS,
    initClock, turnOf, checkCampaignEnd, applyDrift, yearOf, getSeasonRemainingMs, updateWorldTime, accrueTo, advanceWorld, initTimers, nextDueEvent, TIMER_DEFS, processCompletedJobs, startJob, cancelJob, finishJob,
    getQueueUsage, researchCapacity, runningResearchJobs, getRunningJob, getJobRemainingMs, queueRecruitment, queueResearch, canResearch, techCompleted, techLevel, techCost, researchDuration, activeKnights, availableKnights, knightAction, armyEntity, playerArmies, createArmyFromMain, disbandArmy, startArmyGroupMarch, armyGroupComposition, commanderById, armyCommander, ensureAIFactions, recruitmentTerritoryId, deployGarrison, pauseWorld, resumeWorld, catchUpOffline, migrateV1ToV2, migrateV2ToV3,
    migrateSave, migrateV3ToV4, migrateV4ToV5, migrateV5ToV6, migrateV6ToV7, selfCheck, cityAction, cityActionOptions, cityActionAvailable, CITY_ACTION_DEFS, CITY_ACTION_COOLDOWNS, ENVOY_RAPPORT_GAIN, ENVOY_RAPPORT_CAP, RELEASE_RAPPORT_GAIN, cityActionAvailable, KNIGHT_LIEGE
  };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
