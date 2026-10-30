'use strict';

const waterService = require('../services/waterService');
const { currentDateKey, isValidDateKey, addDays, diffDays, formatDateLong, weekdayName } = require('../utils/date');
const { WATER_PRESETS } = require('../config/constants');

function resolveDate(req) {
  const requested = req.params.dateKey || req.query.date || req.body.dateKey || currentDateKey();
  if (!isValidDateKey(requested)) throw require('../utils/httpError').badRequest('That date is not valid');
  return requested;
}

async function summaryFor(userId, dateKey, targets) {
  const day = await waterService.listDay(userId, dateKey);
  return waterService.summarize(day.totalMl, targets?.waterMl, day.entries);
}

async function show(req, res) {
  const dateKey = resolveDate(req);
  const todayKey = currentDateKey();
  const targets = res.locals.challenge?.targets;
  const day = await waterService.listDay(req.user._id, dateKey);
  const summary = waterService.summarize(day.totalMl, targets?.waterMl, day.entries);
  const week = await waterService.getRangeDailyTotals(req.user._id, addDays(dateKey, -6), dateKey);

  return res.render('water', {
    title: 'Water',
    page: 'water',
    active: 'health',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    summary,
    week,
    presets: WATER_PRESETS,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
    targetMl: targets?.waterMl || 2500,
  });
}

async function add(req, res) {
  const { amountMl, clientId, dateKey } = req.validated.body;
  const target = res.locals.challenge?.targets?.waterMl;
  const { entry, duplicate } = await waterService.addEntry(req.user._id, {
    dateKey,
    amountMl,
    clientId,
  });
  const summary = await summaryFor(req.user._id, dateKey, { waterMl: target });
  return res.json({ ok: true, entry, duplicate, summary });
}

async function remove(req, res) {
  const entry = await waterService.removeEntry(req.user._id, req.params.id);
  const summary = await summaryFor(req.user._id, entry.dateKey, res.locals.challenge?.targets);
  return res.json({ ok: true, summary });
}

async function undo(req, res) {
  const dateKey = resolveDate(req);
  const entry = await waterService.undoLast(req.user._id, dateKey);
  const summary = await summaryFor(req.user._id, dateKey, res.locals.challenge?.targets);
  return res.json({ ok: true, removed: entry, summary });
}

module.exports = { show, add, remove, undo, resolveDate };
