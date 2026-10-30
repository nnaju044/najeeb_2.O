'use strict';

const WeeklyReport = require('../models/WeeklyReport');
const WeightEntry = require('../models/WeightEntry');
const metricsService = require('./metricsService');
const challengeService = require('./challengeService');
const habitService = require('./habitService');
const workoutService = require('./workoutService');
const { currentDateKey, diffDays, addDays, weekdayShort } = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');
const { DEFAULT_TARGETS, CHALLENGE_WEEKS } = require('../config/constants');

function trimScore(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/**
 * Generate (or refresh) the report for a completed challenge week. A week only
 * qualifies once its last day has passed, so a report can never claim numbers
 * from days that have not happened yet.
 */
async function generateWeekReport(userId, challenge, weekNumber, todayKey = currentDateKey()) {
  if (!challenge) return null;
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > CHALLENGE_WEEKS) {
    throw badRequest('Week must be between 1 and 13');
  }
  const bounds = challengeService.weekBounds(challenge, weekNumber);
  if (!bounds) return null;
  const isFinished = diffDays(bounds.endDate, todayKey) >= 1;
  if (!isFinished) return null;

  const rows = await metricsService.getDailyMetrics(userId, bounds.startDate, bounds.endDate, challenge.targets);
  const stats = metricsService.summarize(rows, challenge.targets);
  const withData = rows.filter((row) => row.hasData);
  const best = withData.reduce((acc, row) => (row.score > (acc?.score ?? -1) ? row : acc), null);
  const weakest = withData.reduce((acc, row) => (row.score < (acc?.score ?? Infinity) ? row : acc), null);

  const previous = await WeeklyReport.findOne({ userId, weekNumber: weekNumber - 1 }).lean();
  const achievementPercent = trimScore(stats.avgDailyScore || 0);
  const improvementPct = previous ? trimScore(achievementPercent - previous.achievementPercent) : null;

  const insights = [];
  if (stats.trackedDays < rows.length) {
    insights.push(`${rows.length - stats.trackedDays} of ${rows.length} days had no tracked hours.`);
  }
  if (stats.avgWaterMl < stats.targets.waterMl * 0.8) {
    insights.push(`Water averaged ${(stats.avgWaterMl / 1000).toFixed(1)} L against a ${(stats.targets.waterMl / 1000).toFixed(1)} L target.`);
  }
  if (stats.avgProteinG < stats.targets.proteinG * 0.8) {
    insights.push(`Protein averaged ${stats.avgProteinG} g against a ${stats.targets.proteinG} g target.`);
  }
  if (stats.workouts < stats.targets.workoutsPerWeek) {
    insights.push(`${stats.workouts} of ${stats.targets.workoutsPerWeek} planned workouts completed.`);
  }
  if (stats.avgSleepHours !== null && stats.avgSleepHours * 60 < stats.targets.sleepMinutes - 60) {
    insights.push(`Sleep averaged ${stats.avgSleepHours} h, below the ${(stats.targets.sleepMinutes / 60).toFixed(1)} h target.`);
  }
  if (!insights.length) insights.push('Every tracked target was met this week. Keep the systems that produced it.');

  const payload = {
    userId,
    weekNumber,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    daysElapsed: rows.length,
    trackedDays: stats.trackedDays,
    productivityScore: trimScore(
      stats.totals.recordedMinutes > 0
        ? (stats.totals.productiveMinutes / stats.totals.recordedMinutes) * 100
        : 0
    ),
    achievementPercent,
    improvementPct,
    bestDay: best
      ? { dateKey: best.dateKey, weekday: weekdayShort(best.dateKey), score: best.score }
      : null,
    weakestDay: weakest
      ? { dateKey: weakest.dateKey, weekday: weekdayShort(weakest.dateKey), score: weakest.score }
      : null,
    stats: {
      ...stats,
      productiveHours: Math.round((stats.totals.productiveMinutes / 60) * 10) / 10,
      unproductiveHours: Math.round((stats.totals.unproductiveMinutes / 60) * 10) / 10,
      restHours: Math.round((stats.totals.restMinutes / 60) * 10) / 10,
      sleepTrackedHours: Math.round((stats.totals.sleepTrackedMinutes / 60) * 10) / 10,
      avgSleepHours: stats.avgSleepHours,
      avgWaterMl: stats.avgWaterMl,
      avgProteinG: stats.avgProteinG,
      workouts: stats.workouts,
      habitsDone: stats.habitsDone,
    },
    insights,
    generatedAt: new Date(),
  };

  const report = await WeeklyReport.findOneAndUpdate(
    { userId, weekNumber },
    { $set: payload },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return report;
}

/** Generate every finished week (idempotent, used on demand). */
async function syncReports(userId, challenge, todayKey = currentDateKey()) {
  if (!challenge) return [];
  const info = challengeService.dayInfo(challenge, todayKey);
  const lastFinishedWeek = Math.min(
    CHALLENGE_WEEKS,
    Math.max(0, Math.floor(diffDays(challenge.startDate, todayKey) / 7))
  );
  const reports = [];
  for (let week = 1; week <= Math.max(lastFinishedWeek, 0); week += 1) {
    const report = await generateWeekReport(userId, challenge, week, todayKey);
    if (report) reports.push(report);
  }
  return reports;
}

async function listReports(userId) {
  return WeeklyReport.find({ userId }).sort({ weekNumber: -1 }).lean();
}

async function getCurrentWeekLive(userId, challenge, todayKey = currentDateKey()) {
  if (!challenge) return null;
  const info = challengeService.dayInfo(challenge, todayKey);
  const weekNumber = info.weekNumber || 1;
  const bounds = challengeService.weekBounds(challenge, weekNumber);
  if (!bounds) return null;
  const end = diffDays(bounds.endDate, todayKey) >= 0 ? todayKey : bounds.endDate;
  const start = diffDays(bounds.startDate, todayKey) >= 0 ? bounds.startDate : todayKey;
  const rows = await metricsService.getDailyMetrics(userId, start, end, challenge.targets);
  return {
    weekNumber,
    bounds,
    rows,
    stats: metricsService.summarize(rows, challenge.targets),
    daysElapsed: rows.length,
    daysTotal: bounds.endDay - bounds.startDay + 1,
  };
}

async function getFinalReport(userId, challenge, todayKey = currentDateKey()) {
  if (!challenge) return null;
  const info = challengeService.dayInfo(challenge, todayKey);
  if (info.status !== 'completed') {
    return { available: false, daysRemaining: info.remainingDays, progress: info };
  }
  const [week1, week13, weights, habitStats, workouts] = await Promise.all([
    WeeklyReport.findOne({ userId, weekNumber: 1 }).lean(),
    WeeklyReport.findOne({ userId, weekNumber: CHALLENGE_WEEKS }).lean(),
    WeightEntry.find({ userId }).sort({ dateKey: 1 }).lean(),
    habitService.getRangeStats(userId, challenge.startDate, addDays(challenge.startDate, challenge.durationDays - 1)),
    workoutService.getRangeWeekStats(userId, challenge.startDate, addDays(challenge.startDate, challenge.durationDays - 1)),
  ]);
  const startWeight = weights[0] || null;
  const endWeight = weights[weights.length - 1] || null;
  return {
    available: Boolean(week1 && week13),
    week1,
    week13,
    comparison: week1 && week13
      ? {
          achievementChange: trimScore(week13.achievementPercent - week1.achievementPercent),
          productiveHoursChange: trimScore(
            (week13.stats?.productiveHours || 0) - (week1.stats?.productiveHours || 0)
          ),
          sleepChangeHours: trimScore((week13.stats?.avgSleepHours || 0) - (week1.stats?.avgSleepHours || 0)),
          waterChangeMl: (week13.stats?.avgWaterMl || 0) - (week1.stats?.avgWaterMl || 0),
          workoutChange: (week13.stats?.workouts || 0) - (week1.stats?.workouts || 0),
          habitConsistencyChange: trimScore(
            (week13.stats?.habitConsistencyPercent || 0) - (week1.stats?.habitConsistencyPercent || 0)
          ),
        }
      : null,
    weights: {
      startKg: startWeight?.weightKg ?? null,
      endKg: endWeight?.weightKg ?? null,
      changeKg:
        startWeight && endWeight ? Math.round((endWeight.weightKg - startWeight.weightKg) * 10) / 10 : null,
      entries: weights.length,
    },
    habits: { consistencyPercent: habitStats.consistencyPercent, completed: habitStats.totalDone },
    workouts: { total: workouts.workoutCount, minutes: workouts.totalMinutes, volumeKg: workouts.volumeKg },
  };
}

async function getReport(userId, weekNumber) {
  const report = await WeeklyReport.findOne({ userId, weekNumber }).lean();
  if (!report) throw notFound('That weekly report has not been generated yet');
  return report;
}

module.exports = {
  generateWeekReport,
  syncReports,
  listReports,
  getCurrentWeekLive,
  getFinalReport,
  getReport,
};
