'use strict';

const challengeService = require('../services/challengeService');
const reportService = require('../services/reportService');
const achievementService = require('../services/achievementService');
const { currentDateKey, isValidDateKey, addDays } = require('../utils/date');
const { DEFAULT_TARGETS, CHALLENGE_WEEKS } = require('../config/constants');
const { badRequest } = require('../utils/httpError');

async function show(req, res) {
  const challenge = res.locals.challenge;
  if (!challenge) {
    return res.render('challenge', {
      title: 'Start your challenge',
      page: 'challenge',
      active: 'home',
      challenge: null,
      progress: challengeService.challengeProgress(null),
      today: currentDateKey(),
      defaultStart: currentDateKey(),
      targets: DEFAULT_TARGETS,
      reports: [],
      achievements: [],
      weeks: [],
      milestones: [],
      finalReport: null,
    });
  }

  const todayKey = currentDateKey();
  await reportService.syncReports(req.user._id, challenge);
  const [reports, achievements, finalReport] = await Promise.all([
    reportService.listReports(req.user._id),
    achievementService.evaluate(req.user._id, challenge),
    reportService.getFinalReport(req.user._id, challenge, todayKey),
  ]);
  const progress = challengeService.challengeProgress(challenge, todayKey);
  const milestones = [30, 60, 90].map((day) => ({
    day,
    dateKey: addDays(challenge.startDate, day - 1),
    reached: Math.min(progress.dayNumber, challenge.durationDays) >= day,
  }));

  const weeks = Array.from({ length: CHALLENGE_WEEKS }, (_, index) => {
    const weekNumber = index + 1;
    const bounds = challengeService.weekBounds(challenge, weekNumber);
    const report = reports.find((entry) => entry.weekNumber === weekNumber) || null;
    return {
      ...bounds,
      report,
      status:
        report ? 'complete' : progress.weekNumber === weekNumber ? 'current' : bounds.startDate > todayKey ? 'upcoming' : 'missed',
    };
  });

  return res.render('challenge', {
    title: 'Challenge',
    page: 'challenge',
    active: 'home',
    challenge,
    progress,
    today: todayKey,
    defaultStart: challenge.startDate,
    targets: challenge.targets,
    reports,
    achievements,
    weeks,
    milestones,
    finalReport,
  });
}

async function start(req, res) {
  const startDate = req.body.startDate;
  if (!isValidDateKey(startDate)) throw badRequest('Choose a valid start date');
  if (startDate > addDays(currentDateKey(), 1)) {
    throw badRequest('You can start today or backdate a challenge you already began');
  }
  await challengeService.startChallenge(req.user._id, startDate);
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(201).json({ ok: true, startDate });
  }
  return res.redirect('/challenge');
}

async function updateTargets(req, res) {
  const challenge = await challengeService.updateTargets(req.user._id, req.body);
  if (req.accepts(['html', 'json']) === 'json') {
    return res.json({ ok: true, targets: challenge.targets });
  }
  return res.redirect('/settings?saved=targets');
}

module.exports = { show, start, updateTargets };
