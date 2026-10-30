'use strict';

const sleepService = require('../services/sleepService');
const { currentDateKey, isValidDateKey, addDays, diffDays, formatDateLong, weekdayName, formatTimeInTimezone } = require('../utils/date');
const { BEDTIME_PRESETS, WAKE_PRESETS, SLEEP_QUALITIES } = require('../config/constants');
const { badRequest } = require('../utils/httpError');

function resolveDate(req) {
  const requested = req.params.dateKey || req.query.date || req.body.dateKey || currentDateKey();
  if (!isValidDateKey(requested)) throw badRequest('That date is not valid');
  return requested;
}

async function show(req, res) {
  const dateKey = resolveDate(req);
  const todayKey = currentDateKey();
  const target = res.locals.challenge?.targets?.sleepMinutes || 480;
  const [day, history] = await Promise.all([
    sleepService.listDay(req.user._id, dateKey),
    sleepService.getRangeDailyTotals(req.user._id, addDays(dateKey, -13), dateKey),
  ]);

  return res.render('sleep', {
    title: 'Sleep',
    page: 'sleep',
    active: 'health',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    day,
    targetMinutes: target,
    consistency: sleepService.consistency(history, target),
    history,
    bedPresets: BEDTIME_PRESETS,
    wakePresets: WAKE_PRESETS,
    qualities: SLEEP_QUALITIES,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
    formatTime: formatTimeInTimezone,
  });
}

async function add(req, res) {
  const { dateKey, bedTime, wakeTime, quality, notes, clientId } = req.validated.body;
  const { entry, duplicate } = await sleepService.addEntry(
    req.user._id,
    { dateKey, bedTime, wakeTime, quality, notes, clientId },
    res.locals.challenge
  );
  const day = await sleepService.listDay(req.user._id, dateKey);
  return res.status(201).json({ ok: true, entry, duplicate, day });
}

async function remove(req, res) {
  const entry = await sleepService.deleteEntry(req.user._id, req.params.id);
  const day = await sleepService.listDay(req.user._id, entry.dateKey);
  return res.json({ ok: true, day });
}

module.exports = { show, add, remove, resolveDate };
