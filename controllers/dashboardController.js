'use strict';

const dashboardService = require('../services/dashboardService');
const achievementService = require('../services/achievementService');
const reportService = require('../services/reportService');
const dailyLogService = require('../services/dailyLogService');
const { currentDateKey, isValidDateKey } = require('../utils/date');
const { BEDTIME_PRESETS, WAKE_PRESETS, MEAL_TYPES, MEAL_LABELS, WATER_PRESETS, WORK_CATEGORIES, WORKOUT_TYPES } = require('../config/constants');

async function index(req, res) {
  const dateKey = isValidDateKey(req.query.date) ? req.query.date : currentDateKey();
  const challenge = res.locals.challenge;

  if (!challenge) {
    return res.render('dashboard', {
      title: 'Welcome',
      page: 'dashboard',
      active: 'home',
      data: null,
      needsChallenge: true,
    });
  }

  // Weekly reports and badges are refreshed from stored records on each visit.
  await reportService.syncReports(req.user._id, challenge);
  const prayerService = require('../services/prayerService');
  const [achievements, data, prayerData] = await Promise.all([
    achievementService.evaluate(req.user._id, challenge),
    dashboardService.getDashboard(req.user._id, challenge, dateKey),
    req.user.prayerTrackerEnabled ? prayerService.getPrayerDay(req.user._id, dateKey) : Promise.resolve(null),
  ]);

  return res.render('dashboard', {
    title: 'Today',
    page: 'dashboard',
    active: 'home',
    needsChallenge: false,
    data,
    prayerData,
    achievements: achievements.filter((entry) => entry.earned).slice(-3).reverse(),
    presets: { WATER_PRESETS, MEAL_TYPES, MEAL_LABELS, WORK_CATEGORIES, WORKOUT_TYPES, BEDTIME_PRESETS, WAKE_PRESETS },
  });
}

async function saveNote(req, res) {
  const note = await dailyLogService.saveNote(req.user._id, req.validated.body);
  return res.json({ ok: true, note: { dateKey: note.dateKey, notes: note.notes, mood: note.mood } });
}

module.exports = { index, saveNote };
