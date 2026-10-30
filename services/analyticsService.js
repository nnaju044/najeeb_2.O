'use strict';

const mongoose = require('mongoose');
const HourlyTimeLog = require('../models/HourlyTimeLog');
const WeightEntry = require('../models/WeightEntry');
const metricsService = require('./metricsService');
const {
  currentDateKey,
  addDays,
  diffDays,
  dateKeyRange,
  formatDateShort,
  weekdayShort,
  isValidDateKey,
  hourRangeLabel,
} = require('../utils/date');
const { badRequest } = require('../utils/httpError');
const { DEFAULT_TARGETS } = require('../config/constants');

const PRESETS = ['today', '7d', '30d', 'challenge', 'custom'];

const PRESET_LABELS = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  challenge: 'Whole challenge',
  custom: 'Custom range',
};

function resolveRange(challenge, { preset = '7d', from, to } = {}, todayKey = currentDateKey()) {
  const challengeEnd = challenge
    ? addDays(challenge.startDate, challenge.durationDays - 1)
    : todayKey;
  const lastChallengeDay = diffDays(challengeEnd, todayKey) >= 0 ? challengeEnd : todayKey;

  if (preset === 'custom') {
    if (!isValidDateKey(from) || !isValidDateKey(to)) throw badRequest('Custom range needs both dates');
    if (diffDays(from, to) < 0) throw badRequest('Start date must be before end date');
    if (diffDays(from, to) > 400) throw badRequest('Range is too large (max 400 days)');
    return { preset, fromKey: from, toKey: to, label: PRESET_LABELS.custom, days: diffDays(from, to) + 1 };
  }

  if (preset === 'today') {
    return { preset, fromKey: todayKey, toKey: todayKey, label: PRESET_LABELS.today, days: 1 };
  }

  if (preset === 'challenge') {
    if (!challenge) {
      return resolveRange(null, { preset: '30d' }, todayKey);
    }
    const start = diffDays(challenge.startDate, todayKey) >= 0 ? challenge.startDate : todayKey;
    return {
      preset,
      fromKey: start,
      toKey: lastChallengeDay,
      label: PRESET_LABELS.challenge,
      days: diffDays(start, lastChallengeDay) + 1,
    };
  }

  const days = preset === '30d' ? 30 : 7;
  return {
    preset,
    fromKey: addDays(todayKey, -(days - 1)),
    toKey: todayKey,
    label: PRESET_LABELS[preset] || PRESET_LABELS['7d'],
    days,
  };
}

function weeklyBuckets(rows, challenge) {
  const map = new Map();
  for (const row of rows) {
    let week;
    if (challenge) {
      week = Math.floor(diffDays(challenge.startDate, row.dateKey) / 7) + 1;
      week = Math.max(1, Math.min(13, week));
    } else {
      week = Math.floor(diffDays(rows[0]?.dateKey || row.dateKey, row.dateKey) / 7) + 1;
    }
    if (!map.has(week)) {
      map.set(week, {
        week,
        productiveMinutes: 0,
        unproductiveMinutes: 0,
        recordedMinutes: 0,
        waterMl: 0,
        proteinG: 0,
        sleepMinutes: 0,
        sleepNights: 0,
        workouts: 0,
        scoredDays: 0,
        scoreTotal: 0,
        days: 0,
      });
    }
    const bucket = map.get(week);
    bucket.days += 1;
    bucket.productiveMinutes += row.time.productive;
    bucket.unproductiveMinutes += row.time.unproductive;
    bucket.recordedMinutes += row.time.recorded;
    bucket.waterMl += row.water.totalMl;
    bucket.proteinG += row.nutrition.protein;
    bucket.sleepMinutes += row.sleep.minutes;
    if (row.sleep.minutes > 0) bucket.sleepNights += 1;
    bucket.workouts += row.workouts.count;
    bucket.scoredDays += 1;
    bucket.scoreTotal += row.score;
  }
  return [...map.values()]
    .sort((a, b) => a.week - b.week)
    .map((bucket) => ({
      week: bucket.week,
      label: `W${bucket.week}`,
      productiveHours: Math.round((bucket.productiveMinutes / 60) * 10) / 10,
      unproductiveHours: Math.round((bucket.unproductiveMinutes / 60) * 10) / 10,
      waterL: Math.round((bucket.waterMl / 1000) * 10) / 10,
      proteinG: Math.round(bucket.proteinG),
      sleepHours: bucket.sleepNights ? Math.round((bucket.sleepMinutes / bucket.sleepNights / 60) * 10) / 10 : 0,
      workouts: bucket.workouts,
      avgScore: bucket.scoredDays ? Math.round((bucket.scoreTotal / bucket.scoredDays) * 10) / 10 : 0,
    }));
}

async function getAnalytics(userId, challenge, options = {}) {
  const todayKey = options.todayKey || currentDateKey();
  const range = resolveRange(challenge, options, todayKey);
  const targets = challenge?.targets || DEFAULT_TARGETS;

  const [rows, hourlyRows, heatLogs, weights] = await Promise.all([
    metricsService.getDailyMetrics(userId, range.fromKey, range.toKey, targets),
    HourlyTimeLog.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), dateKey: { $gte: range.fromKey, $lte: range.toKey } } },
      {
        $group: {
          _id: '$hour',
          productive: { $sum: '$productive' },
          unproductive: { $sum: '$unproductive' },
          rest: { $sum: '$rest' },
          sleep: { $sum: '$sleep' },
          days: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    HourlyTimeLog.find({ userId, dateKey: { $gte: range.fromKey, $lte: range.toKey } })
      .select('dateKey hour productive unproductive rest sleep')
      .lean(),
    WeightEntry.find({ userId, dateKey: { $gte: range.fromKey, $lte: range.toKey } }).sort({ dateKey: 1 }).lean(),
  ]);

  const hourlyMap = new Map(hourlyRows.map((row) => [row._id, row]));
  const hourly = {
    labels: Array.from({ length: 24 }, (_, hour) => hourRangeLabel(hour).replace(' – ', '–')),
    productive: Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour)?.productive || 0),
    unproductive: Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour)?.unproductive || 0),
    rest: Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour)?.rest || 0),
    sleep: Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour)?.sleep || 0),
    trackedDays: hourlyRows.reduce((max, row) => Math.max(max, row.days), 0),
  };

  const totals = metricsService.summarize(rows, targets);
  const dailyLabels = rows.map((row) => (range.days <= 7 ? weekdayShort(row.dateKey) : formatDateShort(row.dateKey)));

  const doughnut = {
    productive: totals.totals.productiveMinutes,
    unproductive: totals.totals.unproductiveMinutes,
    rest: totals.totals.restMinutes,
    sleep: totals.totals.sleepTrackedMinutes,
    unclassified: Math.max(
      0,
      rows.length * 1440 -
        (totals.totals.productiveMinutes +
          totals.totals.unproductiveMinutes +
          totals.totals.restMinutes +
          totals.totals.sleepTrackedMinutes)
    ),
  };

  const heatmap = heatLogs.map((log) => ({
    dateKey: log.dateKey,
    hour: log.hour,
    productive: log.productive,
    unproductive: log.unproductive,
    rest: log.rest,
    sleep: log.sleep,
  }));

  const weekly = weeklyBuckets(rows, challenge);

  return {
    range: { ...range, rangeLabel: `${formatDateShort(range.fromKey)} – ${formatDateShort(range.toKey)}` },
    targets,
    rows,
    hourly,
    weekly,
    doughnut,
    heatmap,
    totals,
    hasData: rows.some((row) => row.hasData),
    hasTimeData: totals.totals.recordedMinutes > 0,
    series: {
      labels: dailyLabels,
      dateKeys: rows.map((row) => row.dateKey),
      productiveHours: rows.map((row) => row.time.productiveHours),
      unproductiveHours: rows.map((row) => row.time.unproductiveHours),
      restHours: rows.map((row) => row.time.restHours),
      recordedHours: rows.map((row) => Math.round((row.time.recorded / 60) * 10) / 10),
      waterL: rows.map((row) => Math.round(row.water.totalMl / 100) / 10),
      waterTargetL: Math.round((targets.waterMl / 100) / 10),
      proteinG: rows.map((row) => row.nutrition.protein),
      proteinTarget: targets.proteinG,
      calories: rows.map((row) => row.nutrition.calories),
      calorieTarget: targets.calories,
      sleepHours: rows.map((row) => row.sleep.hours),
      sleepTargetHours: Math.round((targets.sleepMinutes / 60) * 10) / 10,
      workouts: rows.map((row) => row.workouts.count),
      habitsPercent: rows.map((row) => row.habits.percent),
      scores: rows.map((row) => row.score),
      weight: {
        labels: weights.map((entry) => formatDateShort(entry.dateKey)),
        values: weights.map((entry) => entry.weightKg),
      },
    },
    weeklySeries: {
      labels: weekly.map((bucket) => bucket.label),
      productiveHours: weekly.map((bucket) => bucket.productiveHours),
      waterL: weekly.map((bucket) => bucket.waterL),
      proteinG: weekly.map((bucket) => bucket.proteinG),
      workouts: weekly.map((bucket) => bucket.workouts),
      avgScore: weekly.map((bucket) => bucket.avgScore),
    },
  };
}

module.exports = { PRESETS, PRESET_LABELS, resolveRange, getAnalytics, weeklyBuckets };
