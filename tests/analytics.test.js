'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Challenge = require('../models/Challenge');
const User = require('../models/User');
const WeeklyReport = require('../models/WeeklyReport');
const WaterEntry = require('../models/WaterEntry');
const metricsService = require('../services/metricsService');
const analyticsService = require('../services/analyticsService');
const reportService = require('../services/reportService');
const achievementService = require('../services/achievementService');
const { computeDayScore } = require('../services/scoreService');
const { startTestApp, stopTestApp, registerOwner, startChallenge, api } = require('./helpers/app');

let context;
let userId;
let challenge;

const WEEK1_START = '2026-01-05';
const WEEK1_END = '2026-01-11';

test.before(async () => {
  context = await startTestApp('lifeos_analytics');
  await registerOwner(context.agent);
  await startChallenge(context.agent, '2026-01-05');
  const user = await User.findOne({ email: 'owner@example.com' });
  userId = user._id;
  challenge = await Challenge.findOne({ userId });
});

test.after(async () => {
  await stopTestApp(context);
});

async function seedWeekOne() {
  const { Habit } = require('../models/Habit');
  const habits = await Habit.find({ userId });

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(`${WEEK1_START}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);

    // Six tracked hours per day: 3 productive, 2 unproductive, 1 rest.
    for (const hour of [9, 10, 11]) {
      await api(context.agent, 'post', '/api/time/hour', {
        dateKey,
        hour,
        productive: 60,
        unproductive: 0,
        rest: 0,
      });
    }
    for (const hour of [18, 19]) {
      await api(context.agent, 'post', '/api/time/hour', {
        dateKey,
        hour,
        productive: 0,
        unproductive: 60,
        rest: 0,
      });
    }
    await api(context.agent, 'post', '/api/time/hour', {
      dateKey,
      hour: 20,
      productive: 0,
      unproductive: 0,
      rest: 60,
    });
    await api(context.agent, 'post', '/api/water', { dateKey, amountMl: 2500 });
    await api(context.agent, 'post', '/api/sleep', {
      dateKey,
      bedTime: '02:00',
      wakeTime: '10:00',
      quality: 'good',
    });
    for (const habit of habits.slice(0, 9)) {
      await api(context.agent, 'post', `/api/habits/${habit._id}/status`, { dateKey, status: 'done' });
    }
  }

  await api(context.agent, 'post', '/api/workouts', {
    dateKey: WEEK1_START,
    type: 'full_body',
    durationMinutes: 50,
    exercises: [{ name: 'Squat', muscleGroup: 'Legs', sets: [{ reps: 8, weightKg: 40 }] }],
  });
  await api(context.agent, 'post', '/api/workouts', {
    dateKey: '2026-01-08',
    type: 'full_body',
    durationMinutes: 50,
    exercises: [{ name: 'Bench press', muscleGroup: 'Chest', sets: [{ reps: 8, weightKg: 30 }] }],
  });
  await api(context.agent, 'post', '/api/meals', {
    dateKey: WEEK1_START,
    mealType: 'breakfast',
    items: [
      { name: 'Oats and milk', servingLabel: '1 bowl', servings: 1, calories: 320, protein: 20, carbs: 40, fat: 8 },
    ],
  });
}

test('daily scoring uses documented weights and clamped ratios', () => {
  const full = computeDayScore({
    recordedMinutes: 1440,
    waterMl: 2500,
    waterTarget: 2500,
    proteinG: 90,
    proteinTarget: 90,
    sleepMinutes: 480,
    sleepTarget: 480,
    habitsDone: 9,
    habitsApplicable: 9,
    workoutDone: true,
  });
  assert.equal(full.score, 100);
  assert.deepEqual(full.missing, []);

  const empty = computeDayScore({ recordedMinutes: 0, waterMl: 0, waterTarget: 2500 });
  assert.equal(empty.score, 0);
  assert.ok(empty.missing.includes('time'));

  const partial = computeDayScore({
    recordedMinutes: 720,
    waterMl: 1250,
    waterTarget: 2500,
    proteinG: 45,
    proteinTarget: 90,
    sleepMinutes: 480,
    sleepTarget: 480,
    habitsDone: 4,
    habitsApplicable: 8,
    workoutDone: false,
  });
  // 0.3*50 + 0.2*50 + 0.15*50 + 0.15*50 + 0.15*100 + 0.05*0 = 15+10+7.5+7.5+15 = 55
  assert.equal(partial.score, 55);

  const overCap = computeDayScore({ recordedMinutes: 2000, waterMl: 9000, waterTarget: 2500 });
  assert.equal(overCap.components.time, 100);
  assert.equal(overCap.components.water, 100);
});

test('daily metrics aggregate every real record for a day', async () => {
  await seedWeekOne();
  const rows = await metricsService.getDailyMetrics(userId, WEEK1_START, WEEK1_END, challenge.targets);
  assert.equal(rows.length, 7);

  const day = rows[0];
  assert.equal(day.time.productive, 180);
  assert.equal(day.time.unproductive, 120);
  assert.equal(day.time.rest, 60);
  assert.equal(day.time.recorded, 360);
  assert.equal(day.time.unclassified, 1080);
  assert.equal(day.water.totalMl, 2500);
  assert.equal(day.sleep.minutes, 480);
  assert.equal(day.habits.done, 9);
  assert.equal(day.workouts.count, 1);
  assert.equal(day.hasData, true);
  assert.ok(day.score > 0 && day.score <= 100);

  const stats = metricsService.summarize(rows, challenge.targets);
  assert.equal(stats.trackedDays, 7);
  assert.equal(stats.avgProductiveHours, 3);
  assert.equal(stats.avgSleepHours, 8);
  assert.equal(stats.avgWaterMl, 2500);
  assert.equal(stats.workouts, 2);
  assert.equal(stats.habitConsistencyPercent, 100);
  assert.equal(stats.waterConsistencyPercent, 100);
});

test('a week report is only generated once the week has ended', async () => {
  const early = await reportService.generateWeekReport(userId, challenge, 1, '2026-01-08');
  assert.equal(early, null);

  const report = await reportService.generateWeekReport(userId, challenge, 1, '2026-01-12');
  assert.ok(report);
  assert.equal(report.weekNumber, 1);
  assert.equal(report.startDate, WEEK1_START);
  assert.equal(report.endDate, WEEK1_END);
  assert.equal(report.stats.productiveHours, 21);
  assert.equal(report.stats.workouts, 2);
  assert.equal(report.stats.habitsDone, 63);
  assert.equal(report.stats.avgWaterMl, 2500);
  assert.equal(report.trackedDays, 7);
  assert.ok(report.bestDay && report.weekNumber === 1);
  assert.ok(Array.isArray(report.insights) && report.insights.length > 0);

  // Regenerating is idempotent, not duplicated.
  await reportService.generateWeekReport(userId, challenge, 1, '2026-01-12');
  assert.equal(await WeeklyReport.countDocuments({ userId, weekNumber: 1 }), 1);
});

test('achievements are earned only from valid stored records', async () => {
  const earned = await achievementService.evaluate(userId, challenge, '2026-01-11');
  const byKey = Object.fromEntries(earned.map((entry) => [entry.key, entry]));

  assert.equal(byKey.first_week.earned, true);
  assert.equal(byKey.water_consistency.earned, true);
  assert.equal(byKey.sleep_discipline.earned, true);
  assert.equal(byKey.gym_starter.earned, true);
  assert.equal(byKey.seven_day_consistency.earned, true);
  assert.equal(byKey.milestone_30.earned, false);
  assert.equal(byKey.productivity_improver.earned, false);

  const stranger = await User.create({
    email: 'newcomer@example.com',
    passwordHash: await User.hashPassword('another-password-123'),
  });
  const fresh = await Challenge.create({ userId: stranger._id, startDate: '2026-01-01' });
  const freshAchievements = await achievementService.evaluate(stranger._id, fresh, '2026-01-12');
  assert.equal(
    freshAchievements.filter((entry) => entry.earned).length,
    0,
    'nothing can be earned without records, not even a milestone'
  );
  assert.equal(freshAchievements.find((entry) => entry.key === 'first_week').earned, false);
});

test('analytics series only contain recorded values and keep untracked time separate', async () => {
  const analytics = await analyticsService.getAnalytics(userId, challenge, {
    preset: 'custom',
    from: WEEK1_START,
    to: WEEK1_END,
  });
  assert.equal(analytics.rows.length, 7);
  assert.equal(analytics.series.labels.length, 7);
  assert.equal(analytics.series.productiveHours[0], 3);
  assert.equal(analytics.series.waterL[0], 2.5);
  assert.equal(analytics.series.sleepHours[0], 8);
  assert.equal(analytics.hourly.productive[9], 7 * 60);
  assert.equal(analytics.hourly.productive[3], 0);
  assert.equal(analytics.doughnut.unclassified, 7 * 1440 - 7 * 360);
  assert.ok(analytics.heatmap.length > 0);
  assert.equal(analytics.weeklySeries.labels[0], 'W1');
  assert.equal(analytics.hasData, true);
  assert.equal(analytics.hasTimeData, true);

  const empty = await metricsService.getDailyMetrics(userId, '2025-06-01', '2025-06-03', challenge.targets);
  assert.equal(empty.every((row) => row.hasData === false), true);
  const emptyStats = metricsService.summarize(empty.map((row) => ({ ...row, scored: true })), challenge.targets);
  assert.equal(emptyStats.avgProductiveHours, null);
  assert.equal(emptyStats.avgSleepHours, null);
});

test('the 90-day final report compares week 1 with week 13', async () => {
  const reports = await reportService.syncReports(userId, challenge, '2026-04-10');
  assert.equal(reports.length, 13);
  assert.equal(await WeeklyReport.countDocuments({ userId }), 13);

  const final = await reportService.getFinalReport(userId, challenge, '2026-04-10');
  assert.equal(final.available, true);
  assert.equal(final.week1.weekNumber, 1);
  assert.equal(final.week13.weekNumber, 13);
  assert.ok(final.comparison);
  assert.equal(final.weights.startKg, null);
  assert.equal(final.workouts.total, 2);

  const achievements = await achievementService.evaluate(userId, challenge, '2026-04-10');
  const byKey = Object.fromEntries(achievements.map((entry) => [entry.key, entry]));
  assert.equal(byKey.milestone_30.earned, true);
  assert.equal(byKey.milestone_60.earned, true);
  assert.equal(byKey.milestone_90.earned, true);
});

test('range presets resolve to real calendar windows', () => {
  const today = '2026-03-15';
  const last7 = analyticsService.resolveRange(challenge, { preset: '7d' }, today);
  assert.equal(last7.toKey, '2026-03-15');
  assert.equal(last7.fromKey, '2026-03-09');
  assert.equal(last7.days, 7);

  const todayRange = analyticsService.resolveRange(challenge, { preset: 'today' }, today);
  assert.equal(todayRange.fromKey, today);
  assert.equal(todayRange.toKey, today);

  const whole = analyticsService.resolveRange(challenge, { preset: 'challenge' }, today);
  assert.equal(whole.fromKey, '2026-01-05');
  assert.equal(whole.toKey, today);

  assert.throws(() => analyticsService.resolveRange(challenge, { preset: 'custom', from: 'bad', to: today }));
  assert.throws(() =>
    analyticsService.resolveRange(challenge, { preset: 'custom', from: '2026-03-10', to: '2026-03-01' })
  );
});

test('water entries for other ranges do not leak into a day summary', async () => {
  await WaterEntry.create({ userId, dateKey: '2026-09-09', amountMl: 500 });
  const analytics = await analyticsService.getAnalytics(userId, challenge, {
    preset: 'custom',
    from: WEEK1_START,
    to: WEEK1_END,
  });
  assert.equal(analytics.totals.avgWaterMl, 2500);
});
