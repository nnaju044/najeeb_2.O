'use strict';

const waterService = require('../services/waterService');
const nutritionService = require('../services/nutritionService');
const sleepService = require('../services/sleepService');
const weightService = require('../services/weightService');
const habitService = require('../services/habitService');
const metricsService = require('../services/metricsService');
const { currentDateKey, addDays, formatDateLong } = require('../utils/date');

async function show(req, res) {
  const todayKey = currentDateKey();
  const targets = res.locals.challenge?.targets || {};
  const [waterDay, mealDay, sleepDay, weight, habits, metrics] = await Promise.all([
    waterService.listDay(req.user._id, todayKey),
    nutritionService.listDay(req.user._id, todayKey),
    sleepService.listDay(req.user._id, todayKey),
    weightService.getSummary(req.user._id),
    habitService.listWithStatus(req.user._id, todayKey),
    metricsService.getDailyMetrics(req.user._id, todayKey, todayKey, targets),
  ]);

  return res.render('health', {
    title: 'Health',
    page: 'health',
    active: 'health',
    todayKey,
    todayLabel: formatDateLong(todayKey),
    water: waterService.summarize(waterDay.totalMl, targets.waterMl, waterDay.entries),
    nutrition: nutritionService.summarize(mealDay.totals, targets),
    sleep: sleepDay,
    sleepTarget: targets.sleepMinutes || 480,
    weight,
    habits,
    metrics: metrics[0],
    yesterday: addDays(todayKey, -1),
  });
}

module.exports = { show };
