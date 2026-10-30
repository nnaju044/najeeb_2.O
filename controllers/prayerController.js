'use strict';

const prayerService = require('../services/prayerService');
const { currentDateKey, isValidDateKey, addDays, diffDays, formatDateLong, weekdayName } = require('../utils/date');
const { badRequest } = require('../utils/httpError');

async function show(req, res) {
  if (!req.user.prayerTrackerEnabled) {
    return res.redirect('/settings');
  }

  const todayKey = currentDateKey();
  const requested = req.params.dateKey || req.query.date || todayKey;
  if (!isValidDateKey(requested)) throw badRequest('That date is not valid');
  if (diffDays(todayKey, requested) > 1) throw badRequest('You cannot track prayers in the future yet');

  const dateKey = requested;
  const [day, analytics] = await Promise.all([
    prayerService.getPrayerDay(req.user._id, dateKey),
    prayerService.getPrayerAnalytics(req.user._id, dateKey),
  ]);

  return res.render('prayer', {
    title: 'Daily Prayers',
    page: 'prayer',
    active: 'health',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    day,
    analytics,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
    todayKey,
  });
}

async function toggle(req, res) {
  const { dateKey, prayerName, completed } = req.validated.body;
  const day = await prayerService.setPrayerStatus(req.user._id, dateKey, prayerName, completed);
  return res.json({ ok: true, day });
}

async function analytics(req, res) {
  const targetDateKey = req.query.date && isValidDateKey(req.query.date) ? req.query.date : currentDateKey();
  const result = await prayerService.getPrayerAnalytics(req.user._id, targetDateKey);
  return res.json({ ok: true, analytics: result });
}

module.exports = {
  show,
  toggle,
  analytics,
};
