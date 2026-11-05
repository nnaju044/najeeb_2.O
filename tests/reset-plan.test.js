'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestApp, stopTestApp, registerOwner, startChallenge, api, getCsrf } = require('./helpers/app');
const Challenge = require('../models/Challenge');
const HourlyTimeLog = require('../models/HourlyTimeLog');
const WaterEntry = require('../models/WaterEntry');
const MealEntry = require('../models/MealEntry');
const SleepEntry = require('../models/SleepEntry');
const Workout = require('../models/Workout');
const WeightEntry = require('../models/WeightEntry');
const { Habit, HabitCompletion } = require('../models/Habit');
const WorkSession = require('../models/WorkSession');
const { PrayerEntry } = require('../models/PrayerEntry');
const User = require('../models/User');

let context;
let owner;

test.before(async () => {
  context = await startTestApp('jeebs_reset_plan');
  await registerOwner(context.agent);
  owner = await User.findOne({ email: 'owner@example.com' });
});

test.after(async () => {
  await stopTestApp(context);
});

test('1. Settings page renders Reset Plan section', async () => {
  const res = await context.agent.get('/settings');
  assert.equal(res.status, 200);
  assert.match(res.text, /Reset Plan/);
  assert.match(res.text, /id="btn-reset-plan"/);
  assert.match(res.text, /id="reset-start-date"/);
});

test('2. Reset plan permanently clears all tracked records and restarts challenge from scratch', async () => {
  // Start initial challenge
  await startChallenge(context.agent, '2026-10-01');

  // Populate tracked data for owner
  const dateKey = '2026-10-30';
  await Promise.all([
    HourlyTimeLog.create({ userId: owner._id, dateKey, hour: 10, productiveMinutes: 45 }),
    WaterEntry.create({ userId: owner._id, dateKey, amountMl: 500, clientId: 'water-1', loggedAt: new Date() }),
    MealEntry.create({
      userId: owner._id,
      dateKey,
      name: 'Oatmeal',
      mealType: 'breakfast',
      clientId: 'meal-1',
      items: [{ name: 'Oats', servings: 1, calories: 300, protein: 10, carbs: 50, fat: 5 }],
      totals: { calories: 300, protein: 10, carbs: 50, fat: 5 },
    }),
    SleepEntry.create({
      userId: owner._id,
      dateKey,
      bedtime: new Date('2026-10-29T23:00:00Z'),
      wakeTime: new Date('2026-10-30T07:00:00Z'),
      durationMinutes: 480,
    }),
    Workout.create({ userId: owner._id, dateKey, type: 'upper', title: 'Chest day', clientId: 'workout-1' }),
    WeightEntry.create({ userId: owner._id, dateKey, weightKg: 75.5 }),
    WorkSession.create({ userId: owner._id, dateKey, startTime: '09:00', durationMinutes: 60, task: 'Deep Work' }),
    PrayerEntry.create({ userId: owner._id, dateKey, prayerName: 'Fajr', completed: true, completedAt: new Date() }),
  ]);

  const habits = await Habit.find({ userId: owner._id });
  assert.ok(habits.length > 0);
  await HabitCompletion.create({ userId: owner._id, habitId: habits[0]._id, dateKey, status: 'done' });

  // Verify records exist
  assert.equal(await HourlyTimeLog.countDocuments({ userId: owner._id }), 1);
  assert.equal(await WaterEntry.countDocuments({ userId: owner._id }), 1);
  assert.equal(await MealEntry.countDocuments({ userId: owner._id }), 1);
  assert.equal(await SleepEntry.countDocuments({ userId: owner._id }), 1);
  assert.equal(await Workout.countDocuments({ userId: owner._id }), 1);
  assert.equal(await WeightEntry.countDocuments({ userId: owner._id }), 1);
  assert.equal(await WorkSession.countDocuments({ userId: owner._id }), 1);
  assert.equal(await PrayerEntry.countDocuments({ userId: owner._id }), 1);
  assert.equal(await HabitCompletion.countDocuments({ userId: owner._id }), 1);

  // Call reset-plan API with a new start date
  const newStartDate = '2026-10-31';
  const resetRes = await api(context.agent, 'post', '/api/settings/reset-plan', {
    newStartDate,
  });

  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.body.ok, true);
  assert.equal(resetRes.body.challenge.startDate, newStartDate);

  // Verify all tracked data is erased
  assert.equal(await HourlyTimeLog.countDocuments({ userId: owner._id }), 0);
  assert.equal(await WaterEntry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await MealEntry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await SleepEntry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await Workout.countDocuments({ userId: owner._id }), 0);
  assert.equal(await WeightEntry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await WorkSession.countDocuments({ userId: owner._id }), 0);
  assert.equal(await PrayerEntry.countDocuments({ userId: owner._id }), 0);
  assert.equal(await HabitCompletion.countDocuments({ userId: owner._id }), 0);

  // Verify challenge was restarted with new start date
  const newChallenge = await Challenge.findOne({ userId: owner._id });
  assert.equal(newChallenge.startDate, newStartDate);

  // Verify starter habits were freshly re-seeded
  const freshHabits = await Habit.find({ userId: owner._id });
  assert.equal(freshHabits.length, 9);
});

test('3. Resetting User A plan does not touch User B challenge or tracked records', async () => {
  // Create User B
  const agentB = require('supertest').agent(context.app);
  const token = await getCsrf(agentB, '/register');
  const regB = await agentB.post('/register').type('form').send({
    _csrf: token,
    name: 'User B',
    email: 'user_b_reset@example.com',
    password: 'passwordB-12345',
    confirmPassword: 'passwordB-12345',
    startDate: '2026-10-15',
  });
  assert.equal(regB.status, 303);
  const userB = await User.findOne({ email: 'user_b_reset@example.com' });

  // Populate tracked data for User B
  await Promise.all([
    HourlyTimeLog.create({ userId: userB._id, dateKey: '2026-10-20', hour: 14, productiveMinutes: 60 }),
    WaterEntry.create({ userId: userB._id, dateKey: '2026-10-20', amountMl: 1000, clientId: 'water-b1', loggedAt: new Date() }),
    PrayerEntry.create({ userId: userB._id, dateKey: '2026-10-20', prayerName: 'Dhuhr', completed: true, completedAt: new Date() }),
  ]);

  // Now User A resets their plan again
  const resetRes = await api(context.agent, 'post', '/api/settings/reset-plan', {
    newStartDate: '2026-10-31',
  });
  assert.equal(resetRes.status, 200);

  // Verify User B challenge and tracked data are 100% intact
  const challengeB = await Challenge.findOne({ userId: userB._id });
  assert.equal(challengeB.startDate, '2026-10-15');
  assert.equal(await HourlyTimeLog.countDocuments({ userId: userB._id }), 1);
  assert.equal(await WaterEntry.countDocuments({ userId: userB._id }), 1);
  assert.equal(await PrayerEntry.countDocuments({ userId: userB._id }), 1);
  assert.equal(await Habit.countDocuments({ userId: userB._id }), 9);
});

test('4. Future start dates beyond tomorrow are rejected', async () => {
  const futureRes = await api(context.agent, 'post', '/api/settings/reset-plan', {
    newStartDate: '2099-01-01',
  });
  assert.equal(futureRes.status, 400);
});
