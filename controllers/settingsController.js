'use strict';

const User = require('../models/User');
const challengeService = require('../services/challengeService');
const { CSV_DATASETS, exportJson, exportCsv } = require('../services/exportService');
const { DEFAULT_TARGETS } = require('../config/constants');
const { currentDateKey } = require('../utils/date');
const { badRequest } = require('../utils/httpError');

async function show(req, res) {
  return res.render('settings', {
    title: 'Settings',
    page: 'settings',
    active: 'home',
    today: currentDateKey(),
    todayKey: currentDateKey(),
    targets: res.locals.challenge?.targets || DEFAULT_TARGETS,
    datasets: Object.entries(CSV_DATASETS).map(([key, value]) => ({ key, label: value.label.replace(/-/g, ' ') })),
    saved: req.query.saved || null,
  });
}

async function updateTheme(req, res) {
  const theme = req.validated.body.theme;
  await User.updateOne({ _id: req.user._id }, { $set: { theme } });
  return res.json({ ok: true, theme });
}

async function updateProfile(req, res) {
  const name = String(req.validated.body.name || '').trim().slice(0, 80);
  await User.updateOne({ _id: req.user._id }, { $set: { name } });
  return res.json({ ok: true, name });
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.validated.body;
  if (confirmPassword && confirmPassword !== newPassword) {
    throw badRequest('New passwords do not match');
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  const valid = await user.verifyPassword(currentPassword);
  if (!valid) {
    throw badRequest('Current password is incorrect');
  }
  const passwordHash = await User.hashPassword(newPassword);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash } });
  return res.json({ ok: true, message: 'Password updated successfully' });
}

async function updateFeatureToggle(req, res) {
  const { feature, enabled } = req.validated.body;
  if (feature === 'prayerTracker') {
    await User.updateOne({ _id: req.user._id }, { $set: { prayerTrackerEnabled: Boolean(enabled) } });
    return res.json({ ok: true, feature, enabled: Boolean(enabled) });
  }
  throw badRequest('Unknown feature toggle');
}

async function downloadJson(req, res) {
  const payload = await exportJson(req.user._id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jeebs-export-${currentDateKey()}.json"`);
  return res.send(JSON.stringify(payload, null, 2));
}

async function downloadCsv(req, res) {
  const dataset = req.params.dataset;
  if (!CSV_DATASETS[dataset]) throw badRequest('Unknown dataset');
  const { filename, csv } = await exportCsv(req.user._id, dataset);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

async function resetPlan(req, res) {
  const newStartDate =
    req.validated?.body?.newStartDate !== undefined ? req.validated.body.newStartDate : req.body?.newStartDate;
  const challenge = await challengeService.resetChallengePlan(
    req.user._id,
    newStartDate ? String(newStartDate).trim() : null
  );
  return res.json({
    ok: true,
    message: '90-day challenge and tracked data have been reset successfully.',
    challenge,
  });
}

module.exports = {
  show,
  updateTheme,
  updateProfile,
  updatePassword,
  updateFeatureToggle,
  resetPlan,
  downloadJson,
  downloadCsv,
};
