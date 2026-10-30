'use strict';

const timeService = require('./timeService');
const waterService = require('./waterService');
const nutritionService = require('./nutritionService');
const sleepService = require('./sleepService');
const habitService = require('./habitService');
const workoutService = require('./workoutService');
const workService = require('./workService');
const dailyLogService = require('./dailyLogService');
const metricsService = require('./metricsService');
const challengeService = require('./challengeService');
const { currentDateKey, addDays, diffDays, weekdayShort } = require('../utils/date');
const { DEFAULT_TARGETS } = require('../config/constants');

/** Short, honest message built only from today's real numbers. */
function buildMessage({ metrics, stats }) {
  const waterPct = metrics.water.percent;
  const sleepMinutes = metrics.sleep.minutes;
  const sleepTarget = metrics.sleep.targetMinutes;
  const habitsPct = metrics.habits.percent;
  const productiveHours = metrics.time.productiveHours;

  if (!metrics.hasData) {
    return {
      tone: 'neutral',
      text: 'Nothing logged yet today. Start with one tap of water — momentum beats perfection.',
    };
  }
  if (metrics.time.recorded === 0) {
    return {
      tone: 'neutral',
      text: 'Your 24 hours are still unaccounted. Open the timeline and fill in a couple of hours.',
    };
  }
  if (productiveHours >= 4 && metrics.time.recorded >= 600) {
    return {
      tone: 'success',
      text: `${productiveHours} productive hours tracked. That is the kind of day that compounds.`,
    };
  }
  if (waterPct < 50) {
    return {
      tone: 'warning',
      text: `Water is at ${Math.round(waterPct)}% of target. One 500 ml glass closes part of the gap.`,
    };
  }
  if (sleepMinutes > 0 && sleepMinutes < sleepTarget - 60) {
    return {
      tone: 'warning',
      text: `You slept ${(sleepMinutes / 60).toFixed(1)} h — under your ${(sleepTarget / 60).toFixed(1)} h target. Protect tonight.`,
    };
  }
  if (habitsPct >= 80) {
    return { tone: 'success', text: `${Math.round(habitsPct)}% of habits done. Consistency is the win.` };
  }
  if (stats.avgDailyScore !== null && stats.avgDailyScore >= 70) {
    return {
      tone: 'success',
      text: `This week is averaging ${stats.avgDailyScore}/100. Keep the streak intact.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Small, complete records beat big, vague plans. Log the next hour.',
  };
}

async function getDashboard(userId, challenge, dateKey = currentDateKey()) {
  const todayKey = currentDateKey();
  const dayIsToday = dateKey === todayKey;
  const targets = challenge?.targets || DEFAULT_TARGETS;
  const progress = challengeService.challengeProgress(challenge, dateKey);

  const weekStart = challenge
    ? (() => {
        const bounds = challengeService.weekBounds(challenge, progress.weekNumber || 1);
        return bounds ? bounds.startDate : dateKey;
      })()
    : dateKey;
  const weekFrom = diffDays(weekStart, dateKey) >= 0 ? weekStart : dateKey;

  const [time, waterDay, mealDay, sleepDay, habitDay, workoutDay, workDay, rows, dailyLog] = await Promise.all([
    timeService.getDaySummary(userId, dateKey),
    waterService.listDay(userId, dateKey),
    nutritionService.listDay(userId, dateKey),
    sleepService.listDay(userId, dateKey),
    habitService.listWithStatus(userId, dateKey),
    workoutService.listDay(userId, dateKey),
    workService.listDay(userId, dateKey),
    metricsService.getDailyMetrics(userId, weekFrom, dateKey, targets),
    dailyLogService.getNote(userId, dateKey),
  ]);

  const metrics = rows[rows.length - 1];
  const weekStats = metricsService.summarize(rows, targets);
  const nutrition = nutritionService.summarize(mealDay.totals, targets);

  return {
    dateKey,
    dayIsToday,
    progress,
    time,
    water: {
      ...waterService.summarize(waterDay.totalMl, targets.waterMl, waterDay.entries),
      entries: waterDay.entries.slice(0, 5),
    },
    nutrition: { ...nutrition, meals: mealDay.meals },
    sleep: sleepDay,
    habits: habitDay,
    workouts: { today: workoutDay, count: workoutDay.filter((w) => w.completed).length },
    work: workDay,
    metrics,
    dailyLog: dailyLog || null,
    week: {
      rows,
      stats: weekStats,
      label: `Week ${progress.weekNumber || 1}`,
      daysElapsed: rows.length,
      startDate: weekFrom,
    },
    message: buildMessage({ metrics, stats: weekStats }),
    targets,
    previousDay: addDays(dateKey, -1),
    nextDay: dayIsToday ? null : addDays(dateKey, 1),
    weekday: weekdayShort(dateKey),
  };
}

module.exports = { getDashboard, buildMessage };
