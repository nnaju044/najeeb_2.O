'use strict';

const timeService = require('../services/timeService');
const { currentDateKey, isValidDateKey, addDays, diffDays, formatDateLong, weekdayName } = require('../utils/date');
const { badRequest } = require('../utils/httpError');

const MAX_BACKDAYS = 400;

async function show(req, res) {
  const todayKey = currentDateKey();
  const requested = req.params.dateKey || req.query.date || todayKey;
  if (!isValidDateKey(requested)) throw badRequest('That date is not valid');
  if (diffDays(todayKey, requested) > 1) throw badRequest('You cannot track hours in the future yet');
  if (diffDays(requested, todayKey) > MAX_BACKDAYS) throw badRequest('That date is too far back');

  const dateKey = requested;
  const day = await timeService.getDaySummary(req.user._id, dateKey);
  const weekFrom = addDays(dateKey, -6);
  const week = await timeService.getRangeDailyTotals(req.user._id, weekFrom, dateKey);

  return res.render('time', {
    title: '24 hours',
    page: 'time',
    active: 'time',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    day,
    week,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
    yesterday: addDays(dateKey, -1),
  });
}

async function saveHour(req, res) {
  const { dateKey, hour, productive, unproductive, rest, sleep } = req.validated.body;
  const result = await timeService.saveHour(req.user._id, {
    dateKey,
    hour,
    buckets: {
      productive: productive ?? 0,
      unproductive: unproductive ?? 0,
      rest: rest ?? 0,
      sleep: sleep ?? 0,
    },
  });
  const day = await timeService.getDaySummary(req.user._id, dateKey);
  return res.json({ ok: true, hour: result.hour, cleared: result.cleared, day });
}

async function sleepHour(req, res) {
  const { dateKey, hour } = req.validated.body;
  await timeService.markSleepHour(req.user._id, { dateKey, hour });
  const day = await timeService.getDaySummary(req.user._id, dateKey);
  return res.json({ ok: true, day });
}

async function clearHour(req, res) {
  const { dateKey, hour } = req.validated.body;
  await timeService.clearHour(req.user._id, { dateKey, hour });
  const day = await timeService.getDaySummary(req.user._id, dateKey);
  return res.json({ ok: true, day });
}

async function copyDay(req, res) {
  const { fromDateKey, toDateKey } = req.validated.body;
  const result = await timeService.copyDay(req.user._id, { fromDateKey, toDateKey });
  const day = await timeService.getDaySummary(req.user._id, toDateKey);
  return res.json({ ok: true, copied: result.copied, day });
}

module.exports = { show, saveHour, sleepHour, clearHour, copyDay };
