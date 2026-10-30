'use strict';

const weightService = require('../services/weightService');
const { currentDateKey } = require('../utils/date');

async function show(req, res) {
  const summary = await weightService.getSummary(req.user._id);
  return res.render('weight', {
    title: 'Body weight',
    page: 'weight',
    active: 'health',
    todayKey: currentDateKey(),
    summary,
  });
}

async function save(req, res) {
  const { entry, updated } = await weightService.saveEntry(req.user._id, req.validated.body);
  const summary = await weightService.getSummary(req.user._id);
  return res.status(updated ? 200 : 201).json({ ok: true, entry, updated, summary });
}

async function remove(req, res) {
  await weightService.deleteEntry(req.user._id, req.params.id);
  const summary = await weightService.getSummary(req.user._id);
  return res.json({ ok: true, summary });
}

module.exports = { show, save, remove };
