'use strict';

const timeService = require('./timeService');
const waterService = require('./waterService');
const nutritionService = require('./nutritionService');
const sleepService = require('./sleepService');
const workoutService = require('./workoutService');
const habitService = require('./habitService');
const { computeDayScore } = require('./scoreService');
const { dateKeyRange, isValidDateKey, diffDays } = require('../utils/date');
const { badRequest } = require('../utils/httpError');
const { DEFAULT_TARGETS } = require('../config/constants');

function targetOf(targets, key) {
  const value = Number(targets?.[key]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TARGETS[key];
}

/**
 * One row per calendar day in the range, joined from the real records.
 * This is the single source for weekly reports, analytics and the dashboard,
 * so numbers always agree with each other.
 */
async function getDailyMetrics(userId, fromKey, toKey, targets = {}) {
  if (!isValidDateKey(fromKey) || !isValidDateKey(toKey)) throw badRequest('Invalid date range');
  if (diffDays(fromKey, toKey) < 0) throw badRequest('Start date must not be after end date');
  const keys = dateKeyRange(fromKey, toKey);
  const waterTarget = targetOf(targets, 'waterMl');
  const proteinTarget = targetOf(targets, 'proteinG');
  const calorieTarget = targetOf(targets, 'calories');
  const sleepTarget = targetOf(targets, 'sleepMinutes');

  const [timeRows, waterRows, nutritionRows, sleepRows, habitStats, workouts] = await Promise.all([
    timeService.getRangeDailyTotals(userId, fromKey, toKey),
    waterService.getRangeDailyTotals(userId, fromKey, toKey),
    nutritionService.getRangeDailyTotals(userId, fromKey, toKey),
    sleepService.getRangeDailyTotals(userId, fromKey, toKey),
    habitService.getRangeStats(userId, fromKey, toKey),
    workoutService.getWeeklyConsistency(userId, fromKey, toKey),
  ]);

  const habitByDay = new Map(habitStats.days.map((day) => [day.dateKey, day]));

  return keys.map((key, index) => {
    const time = timeRows[index] || { productive: 0, unproductive: 0, rest: 0, sleep: 0, recorded: 0 };
    const water = waterRows[index] || { totalMl: 0 };
    const nutrition = nutritionRows[index] || { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const sleep = sleepRows[index] || { minutes: 0 };
    const habitDay = habitByDay.get(key) || { done: 0, applicable: 0, percent: 0 };
    const workoutCount = workouts[index]?.count || 0;

    const scored = computeDayScore({
      recordedMinutes: time.recorded,
      waterMl: water.totalMl,
      waterTarget,
      proteinG: nutrition.protein,
      proteinTarget,
      sleepMinutes: sleep.minutes,
      sleepTarget,
      habitsDone: habitDay.done,
      habitsApplicable: habitDay.applicable,
      workoutDone: workoutCount > 0,
    });

    return {
      dateKey: key,
      hasData:
        time.recorded > 0 ||
        water.totalMl > 0 ||
        nutrition.calories > 0 ||
        sleep.minutes > 0 ||
        habitDay.done > 0 ||
        workoutCount > 0,
      time: {
        productive: time.productive,
        unproductive: time.unproductive,
        rest: time.rest,
        sleep: time.sleep,
        recorded: time.recorded,
        unclassified: 1440 - time.recorded,
        productiveHours: Math.round((time.productive / 60) * 10) / 10,
        unproductiveHours: Math.round((time.unproductive / 60) * 10) / 10,
        restHours: Math.round((time.rest / 60) * 10) / 10,
        sleepHours: Math.round((time.sleep / 60) * 10) / 10,
        trackedHours: time.trackedHours,
      },
      water: { totalMl: water.totalMl, targetMl: waterTarget, percent: Math.round((water.totalMl / waterTarget) * 1000) / 10 },
      nutrition: {
        ...nutrition,
        proteinTarget,
        calorieTarget,
        proteinPercent: Math.round((nutrition.protein / proteinTarget) * 1000) / 10,
      },
      sleep: {
        minutes: sleep.minutes,
        hours: Math.round((sleep.minutes / 60) * 10) / 10,
        targetMinutes: sleepTarget,
        sessions: sleep.sessions,
      },
      habits: {
        done: habitDay.done,
        applicable: habitDay.applicable,
        percent: habitDay.percent,
      },
      workouts: { count: workoutCount },
      score: scored.score,
      scoreComponents: scored.components,
      missing: scored.missing,
    };
  });
}

function average(values) {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  return Math.round((list.reduce((sum, value) => sum + value, 0) / list.length) * 10) / 10;
}

/** Aggregate a block of daily metric rows into weekly/report summary stats. */
function summarize(rows, targets = {}) {
  const waterTarget = targetOf(targets, 'waterMl');
  const proteinTarget = targetOf(targets, 'proteinG');
  const sleepTarget = targetOf(targets, 'sleepMinutes');
  const workoutTarget = targetOf(targets, 'workoutsPerWeek');

  const elapsed = rows;
  const trackedDays = rows.filter((row) => row.time.recorded > 0);
  const total = {
    productiveMinutes: rows.reduce((sum, row) => sum + row.time.productive, 0),
    unproductiveMinutes: rows.reduce((sum, row) => sum + row.time.unproductive, 0),
    restMinutes: rows.reduce((sum, row) => sum + row.time.rest, 0),
    sleepTrackedMinutes: rows.reduce((sum, row) => sum + row.time.sleep, 0),
    recordedMinutes: rows.reduce((sum, row) => sum + row.time.recorded, 0),
    waterMl: rows.reduce((sum, row) => sum + row.water.totalMl, 0),
    proteinG: rows.reduce((sum, row) => sum + row.nutrition.protein, 0),
    calories: rows.reduce((sum, row) => sum + row.nutrition.calories, 0),
    workouts: rows.reduce((sum, row) => sum + row.workouts.count, 0),
    habitsDone: rows.reduce((sum, row) => sum + row.habits.done, 0),
    habitsApplicable: rows.reduce((sum, row) => sum + row.habits.applicable, 0),
    sleepMinutes: rows.reduce((sum, row) => sum + row.sleep.minutes, 0),
  };

  const waterConsistency = rows.length
    ? Math.round((rows.filter((row) => row.water.totalMl >= waterTarget * 0.9).length / rows.length) * 1000) / 10
    : 0;
  const sleepNights = rows.filter((row) => row.sleep.minutes > 0);
  const sleepConsistency = sleepNights.length
    ? Math.round(
        (sleepNights.filter((row) => Math.abs(row.sleep.minutes - sleepTarget) <= 60).length /
          sleepNights.length) *
          1000
      ) / 10
    : 0;

  return {
    days: rows.length,
    trackedDays: trackedDays.length,
    totalRecordedHours: Math.round((total.recordedMinutes / 60) * 10) / 10,
    avgProductiveHours: trackedDays.length
      ? Math.round((total.productiveMinutes / trackedDays.length / 60) * 10) / 10
      : null,
    avgUnproductiveHours: trackedDays.length
      ? Math.round((total.unproductiveMinutes / trackedDays.length / 60) * 10) / 10
      : null,
    avgRestHours: trackedDays.length
      ? Math.round((total.restMinutes / trackedDays.length / 60) * 10) / 10
      : null,
    avgSleepHours: sleepNights.length
      ? Math.round((total.sleepMinutes / sleepNights.length / 60) * 10) / 10
      : null,
    avgWaterMl: rows.length ? Math.round(total.waterMl / rows.length) : 0,
    avgProteinG: rows.length ? Math.round((total.proteinG / rows.length) * 10) / 10 : 0,
    avgCalories: rows.length ? Math.round(total.calories / rows.length) : 0,
    workouts: total.workouts,
    workoutsPerWeekTarget: workoutTarget,
    workoutConsistencyPercent: Math.min(100, Math.round((total.workouts / workoutTarget) * 100)),
    habitsDone: total.habitsDone,
    habitConsistencyPercent:
      total.habitsApplicable > 0
        ? Math.round((total.habitsDone / total.habitsApplicable) * 1000) / 10
        : 0,
    waterConsistencyPercent: waterConsistency,
    sleepConsistencyPercent: sleepConsistency,
    avgDailyScore: average(rows.map((row) => row.score)),
    totals: total,
    targets: { waterMl: waterTarget, proteinG: proteinTarget, sleepMinutes: sleepTarget, workoutsPerWeek: workoutTarget },
  };
}

module.exports = { getDailyMetrics, summarize, average, targetOf };
