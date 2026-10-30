'use strict';

const workService = require('../services/workService');
const timeService = require('../services/timeService');
const { currentDateKey, addDays, formatDateLong, weekdayName } = require('../utils/date');
const { WORK_CATEGORIES, WORK_DURATIONS } = require('../config/constants');

async function show(req, res) {
  const todayKey = currentDateKey();
  const [day, week, month] = await Promise.all([
    workService.listDay(req.user._id, todayKey),
    workService.getRangeStats(req.user._id, addDays(todayKey, -6), todayKey),
    workService.getRangeStats(req.user._id, addDays(todayKey, -29), todayKey),
  ]);

  return res.render('work', {
    title: 'Focused work',
    page: 'work',
    active: 'time',
    todayKey,
    todayLabel: formatDateLong(todayKey),
    weekday: weekdayName(todayKey),
    day,
    week,
    month,
    categories: WORK_CATEGORIES,
    durations: WORK_DURATIONS,
  });
}

async function add(req, res) {
  const { session, duplicate, allocated, skipped } = await workService.createSession(req.user._id, req.validated.body);
  const day = await timeService.getDaySummary(req.user._id, session.dateKey);
  return res.status(201).json({ ok: true, session, duplicate, allocated, skipped, day });
}

async function remove(req, res) {
  const session = await workService.deleteSession(req.user._id, req.params.id);
  const day = await timeService.getDaySummary(req.user._id, session.dateKey);
  return res.json({ ok: true, day });
}

module.exports = { show, add, remove };
