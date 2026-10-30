'use strict';

const analyticsService = require('../services/analyticsService');
const reportService = require('../services/reportService');
const achievementService = require('../services/achievementService');
const metricsService = require('../services/metricsService');
const challengeService = require('../services/challengeService');
const { currentDateKey, formatDateShort } = require('../utils/date');
const { CHALLENGE_WEEKS } = require('../config/constants');

async function show(req, res) {
  const challenge = res.locals.challenge;
  if (!challenge) return res.redirect('/challenge');

  await reportService.syncReports(req.user._id, challenge);
  const preset = analyticsService.PRESETS.includes(req.query.range) ? req.query.range : '7d';
  const [analytics, reports, achievements, currentWeek, finalReport] = await Promise.all([
    analyticsService.getAnalytics(req.user._id, challenge, {
      preset,
      from: req.query.from,
      to: req.query.to,
    }),
    reportService.listReports(req.user._id),
    achievementService.evaluate(req.user._id, challenge),
    reportService.getCurrentWeekLive(req.user._id, challenge),
    reportService.getFinalReport(req.user._id, challenge),
  ]);

  const weekRows = currentWeek?.rows || [];
  const liveWeek = currentWeek
    ? { ...currentWeek, stats: metricsService.summarize(weekRows, challenge.targets) }
    : null;

  return res.render('progress', {
    title: 'Progress',
    page: 'progress',
    active: 'progress',
    challenge,
    progress: challengeService.challengeProgress(challenge),
    preset,
    presets: analyticsService.PRESETS.map((value) => ({
      value,
      label: analyticsService.PRESET_LABELS[value],
    })),
    analytics,
    reports,
    achievements,
    earnedCount: achievements.filter((entry) => entry.earned).length,
    liveWeek,
    finalReport,
    challengeWeeks: CHALLENGE_WEEKS,
    todayLabel: formatDateShort(currentDateKey()),
  });
}

async function apiAnalytics(req, res) {
  const challenge = res.locals.challenge;
  const analytics = await analyticsService.getAnalytics(req.user._id, challenge, {
    preset: req.query.preset,
    from: req.query.from,
    to: req.query.to,
  });
  return res.json({ ok: true, analytics });
}

async function syncReports(req, res) {
  const challenge = res.locals.challenge;
  const reports = await reportService.syncReports(req.user._id, challenge);
  const achievements = await achievementService.evaluate(req.user._id, challenge);
  return res.json({ ok: true, generated: reports.length, achievements });
}

module.exports = { show, apiAnalytics, syncReports };
