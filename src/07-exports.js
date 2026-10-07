"use strict";

// 仅 module.exports，供 Node 测试使用。

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildingBenefit, conquestReward, markRecovered, recoverySupport, battleSettlementHtml, battleBreakdownText,
    createInitialState, hydrateState, seasonOf, forecast, resourceFlow, territoryOutput, buildingCost, BUILDINGS, BUILDING_MAX_LEVEL,
    attackableTerritories, battleEstimate, startBattle, stageOptions, applyBattleChoice,
    finishBattle, defenderLeader, runFactionTurn, resolveAIAttack, resolveAIAnnex, aiTargets, aiArmyCap, aiSeasonIncome, aiArmyPower, reinforceAIArmy, compositionTotal, officer, FACTION_TIMER_KEY, startMarch, incomingThreats, beaconCovers, THREAT_LATE_WINDOW_MS, marchDurationForDistance, territoryDistance, decisionView, subjects, TERRITORY_DEFS, playableTerritoryIds, LORD_DEFS, LORD_ARCHETYPES, SEAT_TO_LORD, lordAt, lordHoldings, lordVassals, adjacencyPressure, lordResistance, persuasionLeverage, canPersuadeLord, lordBribeCost, submitLord, SUBMIT_LOYALTY, demandFealty, bribeLord, lordRouteStatus, BRIBE_LEGITIMACY_COST, FIEF_PROMISE_DUE_MS, PERSUADE_LEGITIMACY_GAIN,
    SEASONS, PLANS, UNIT_DEFS, clamp, armyTotal, syncTroops,
    selectedComposition, compositionPower, campaignSupply, allocateLosses, recruitAmount, canRecruitUnit, unitLevel, unitEquipment, counterMultiplier, defenderComposition, knightBattleMultiplier,
    settleSeasonEconomy, casualtyForecast, queueSeasonEvents, pickWorldEvent, eventRequirementMet, WORLD_EVENTS, NPC_ARCS,
    applyEventEffects, handleOfficerPolitics, interactionLocked, checkDefeat,
    enemyGuardCap, regionCoreSeat, controlsRegionOf, fortProjection, TERRAIN_PROFILES, REGION_CONTROL_OUTPUT_BONUS, FORT_GUARD_PROJECTION, CRISIS_LIMITS, gainLegitimacy, LEGITIMACY_DELTAS, DUCHY_HOLDINGS, CROWN_GATE_HOLDING, battleRiskClass, crownRequirements, crownAccessMet, crownRequirementText, coronationRemainingMs, delayCoronation, CORONATION_AT_MS, CORONATION_DELAY_MS, VERSION, TIME_CONFIG, JOB_CONFIG, TECH_DEFS,
    initClock, worldNow, setWorldSpeed, alignWorldClock, worldSpeed, WORLD_CLOCK, WORLD_SPEEDS, turnOf, checkCampaignEnd, applyDrift, yearOf, getSeasonRemainingMs, updateWorldTime, accrueTo, advanceWorld, initTimers, nextDueEvent, TIMER_DEFS, processCompletedJobs, startJob, cancelJob, finishJob,
    getQueueUsage, researchCapacity, runningResearchJobs, getRunningJob, getJobRemainingMs, queueRecruitment, queueResearch, canResearch, techCompleted, techLevel, ownTerritoryIds, techCost, knowledgePerSeason, TECH_LEVEL_COST_GROWTH, ACADEMY_KNOWLEDGE_PER_LEVEL, researchDuration, activeKnights, availableKnights, knightAction, armyEntity, playerArmies, createArmyFromMain, disbandArmy, startArmyGroupMarch, armyGroupComposition, commanderById, armyCommander, ensureAIFactions, recruitmentTerritoryId, deployGarrison, pauseWorld, resumeWorld, catchUpOffline, migrateV1ToV2, migrateV2ToV3,
    migrateSave, migrateV7ToV8, recordBattle, recordDeed, DEED_KEYS, BATTLE_LOG_LIMIT, migrateV3ToV4, migrateV4ToV5, migrateV5ToV6, migrateV6ToV7, selfCheck, cityAction, cityActionOptions, cityActionAvailable, CITY_ACTION_DEFS, CITY_ACTION_COOLDOWNS, lordPrice, payLordPrice, lordLine, commanderBattleLine, LORD_LINES, ARCHETYPE_LINES, KNIGHT_BATTLE_LINES, envoyReplyText, LORD_PRICES, ARCHETYPE_PRICES, cityActionAvailable, KNIGHT_LIEGE, intelLevel, reportedGuard, FOG_LEVELS,
    uiDraft, armyCorpsHtml, newArmyDraftView, expeditionDraftView, castleExpeditionHtml,
    redeployArmy, stationedArmies, stationedPower, applyStationedLosses, retreatStationedArmies,
    STATIONED_DEFENSE_FACTOR, STATIONED_RECOVERING_FACTOR, runningRecruitJob, shiftScheduled,
    CIVILIAN_GRAIN_PER_HEAD, SUPPLY_PER_GRAIN, compositionSupply, applyShortage, forecast,
    GOAL_CHAPTERS, GOAL_BASELINES, goalView, totalBuildingLevels, anyTechCompleted,
    ledgerSnapshot, ensureLedger, closeSeasonLedger, pushNotice, drainNotices, NOTICE_QUEUE,
    TITLE_RANKS, CHAPTER_REWARDS, titleRank, checkMilestones, administrationCost, RETAINER_QUIPS, retainerQuip, checkRetainerQuips, seedLegacyMilestones,
    TREASURES, TREASURE_KINDS, grantTreasure, grantTreasureFor, treasureBonus, ownedTreasures, treasureOwned,
    maybeOpenTourney, tourneyRoll, TOURNEY_HOSTS, TOURNEY_RESULTS, knightById,
    grantFief, revokeFief, fiefCandidates, retainerMood, RETAINER_ASK_MERIT, RETAINER_LINES,
    SKILLS, SIGNATURE_SKILLS, CLASS_SKILL_POOLS, LEVEL_XP, ensureProgress, ensureAllProgress, personSkills, leadersHaveSkill, gainBattleXp, personStat, availableCommanders, setArmyDeputies, armyLeaderIds, canUseCommander, duelChampion, startingLevel
  };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
