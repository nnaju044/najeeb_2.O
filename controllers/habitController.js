'use strict';

const habitService = require('../services/habitService');
const { HabitCompletion } = require('../models/Habit');
const {
  currentDateKey,
  isValidDateKey,
  addDays,
  diffDays,
  formatDateLong,
  weekdayName,
  weekdayShort,
} = require('../utils/date');
const { badRequest } = require('../utils/httpError');

function resolveDate(req) {
  const requested = req.params.dateKey || req.query.date || req.body.dateKey || currentDateKey();
  if (!isValidDateKey(requested)) throw badRequest('That date is not valid');
  return requested;
}

async function show(req, res) {
  const dateKey = resolveDate(req);
  const todayKey = currentDateKey();
  const from = addDays(dateKey, -6);
  const [day, stats, streak] = await Promise.all([
    habitService.listWithStatus(req.user._id, dateKey),
    habitService.getRangeStats(req.user._id, from, dateKey),
    habitService.getStreak(req.user._id, dateKey),
  ]);

  // Weekly grid: habit × last 7 days.
  const gridDays = Array.from({ length: 7 }, (_, index) => addDays(from, index));
  const completions = await HabitCompletion.find({
    userId: req.user._id,
    dateKey: { $in: gridDays },
  }).lean();
  const completionSet = new Set(completions.map((entry) => `${entry.habitId}:${entry.dateKey}`));

  return res.render('habits', {
    title: 'Habits',
    page: 'habits',
    active: 'health',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    day,
    stats,
    streak,
    gridDays: gridDays.map((key) => ({ key, label: weekdayShort(key) })),
    completionSet,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
  });
}

async function setStatus(req, res) {
  const { dateKey, status } = req.validated.body;
  await habitService.setStatus(req.user._id, req.params.id, { dateKey, status });
  const day = await habitService.listWithStatus(req.user._id, dateKey);
  return res.json({ ok: true, day });
}

async function create(req, res) {
  const habit = await habitService.createHabit(req.user._id, req.validated.body);
  return res.status(201).json({ ok: true, habit });
}

async function update(req, res) {
  const habit = await habitService.updateHabit(req.user._id, req.params.id, req.validated.body);
  return res.json({ ok: true, habit });
}

async function archive(req, res) {
  await habitService.archiveHabit(req.user._id, req.params.id);
  const day = await habitService.listWithStatus(req.user._id, resolveDate(req));
  return res.json({ ok: true, day });
}

module.exports = { show, setStatus, create, update, archive };
