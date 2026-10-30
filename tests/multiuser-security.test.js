'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const User = require('../models/User');
const Challenge = require('../models/Challenge');
const WaterEntry = require('../models/WaterEntry');
const MealEntry = require('../models/MealEntry');
const SleepEntry = require('../models/SleepEntry');
const Workout = require('../models/Workout');
const WeightEntry = require('../models/WeightEntry');
const WorkSession = require('../models/WorkSession');
const { Habit } = require('../models/Habit');
const HourlyTimeLog = require('../models/HourlyTimeLog');

const { startTestApp, stopTestApp, getCsrf, login, api } = require('./helpers/app');
const { currentDateKey, addDays } = require('../utils/date');

let context;
let agentA;
let agentB;
let userA;
let userB;

const TODAY = currentDateKey();
const YESTERDAY = addDays(TODAY, -1);

test.before(async () => {
  context = await startTestApp('jeebs_multiuser_security');

  // Register User A
  agentA = request.agent(context.app);
  const tokenA = await getCsrf(agentA, '/register');
  const regA = await agentA
    .post('/register')
    .type('form')
    .send({
      _csrf: tokenA,
      email: 'user_a@example.com',
      password: 'passwordA-12345',
      confirmPassword: 'passwordA-12345',
      name: 'User Alpha',
      startDate: YESTERDAY,
    });
  assert.equal(regA.status, 302);
  userA = await User.findOne({ email: 'user_a@example.com' });

  // Register User B
  agentB = request.agent(context.app);
  const tokenB = await getCsrf(agentB, '/register');
  const regB = await agentB
    .post('/register')
    .type('form')
    .send({
      _csrf: tokenB,
      email: 'user_b@example.com',
      password: 'passwordB-12345',
      confirmPassword: 'passwordB-12345',
      name: 'User Beta',
      startDate: TODAY,
    });
  assert.equal(regB.status, 302);
  userB = await User.findOne({ email: 'user_b@example.com' });
});

test.after(async () => {
  await stopTestApp(context);
});

test('1. User A cannot read User B’s records', async () => {
  // User A logs private records
  await api(agentA, 'post', '/api/water', { dateKey: YESTERDAY, amountMl: 800 });
  await api(agentA, 'post', '/api/time/hour', {
    dateKey: YESTERDAY,
    hour: 10,
    productive: 60,
    unproductive: 0,
    rest: 0,
    sleep: 0,
  });
  await api(agentA, 'post', '/api/meals', {
    dateKey: YESTERDAY,
    mealType: 'lunch',
    items: [{ name: 'Alpha Salmon', servings: 1, calories: 450, protein: 40, carbs: 0, fat: 20 }],
  });
  await api(agentA, 'post', '/api/sleep', {
    dateKey: YESTERDAY,
    bedTime: '23:00',
    wakeTime: '07:43',
    quality: 'good',
    notes: 'Secret Alpha Sleep Note',
  });

  // User B accesses the same date views
  const waterPage = await agentB.get(`/water/${YESTERDAY}`);
  assert.equal(waterPage.status, 200);
  assert.equal(waterPage.text.includes('0.80'), false, 'User B must not see User A water intake');

  const timePage = await agentB.get(`/time/${YESTERDAY}`);
  assert.equal(timePage.status, 200);
  assert.equal(timePage.text.includes('Alpha'), false);

  const foodPage = await agentB.get(`/food/${YESTERDAY}`);
  assert.equal(foodPage.status, 200);
  assert.equal(foodPage.text.includes('Alpha Salmon'), false, 'User B must not see User A meal items');

  const sleepPage = await agentB.get(`/sleep/${YESTERDAY}`);
  assert.equal(sleepPage.status, 200);
  assert.equal(sleepPage.text.includes('07:43'), false, 'User B must not see User A unique wake time');
  assert.equal(sleepPage.text.includes('Secret Alpha Sleep Note'), false, 'User B must not see User A sleep notes');
});

test('2. User A cannot update User B’s records', async () => {
  // Find a habit belonging to User A
  const habitA = await Habit.findOne({ userId: userA._id });
  assert.ok(habitA, 'User A should have initialized habits');

  // User B attempts to change status of User A’s habit
  const statusAttempt = await api(agentB, 'post', `/api/habits/${habitA._id}/status`, {
    dateKey: YESTERDAY,
    status: 'done',
  });
  assert.equal(statusAttempt.status, 404, 'Attempting to change status of another user habit must return 404');

  // User B attempts to edit User A’s habit definition
  const editAttempt = await api(agentB, 'patch', `/api/habits/${habitA._id}`, {
    name: 'Hacked Habit Name',
  });
  assert.equal(editAttempt.status, 404, 'Attempting to patch another user habit must return 404');

  // Verify habit was not modified in DB
  const unchangedHabit = await Habit.findById(habitA._id);
  assert.equal(unchangedHabit.name, habitA.name);
});

test('3. User A cannot delete User B’s records', async () => {
  // Create test records for User A
  const waterRes = await api(agentA, 'post', '/api/water', { dateKey: YESTERDAY, amountMl: 350 });
  const waterId = waterRes.body.entry._id;

  const mealRes = await api(agentA, 'post', '/api/meals', {
    dateKey: YESTERDAY,
    mealType: 'dinner',
    items: [{ name: 'Alpha Steak', servings: 1, calories: 500, protein: 50, carbs: 0, fat: 25 }],
  });
  const mealId = mealRes.body.meal._id;

  const sleepRes = await api(agentA, 'post', '/api/sleep', {
    dateKey: YESTERDAY,
    bedTime: '22:30',
    wakeTime: '06:30',
    quality: 'good',
  });
  const sleepId = sleepRes.body.entry._id;

  const workoutRes = await api(agentA, 'post', '/api/workouts', {
    dateKey: YESTERDAY,
    type: 'upper',
    name: 'Push Workout',
    exercises: [{ name: 'Bench Press', muscleGroup: 'Chest', sets: [{ reps: 10, weightKg: 80 }] }],
  });
  assert.ok(workoutRes.body.workout, 'Workout should be created');
  const workoutId = workoutRes.body.workout._id;

  const weightRes = await api(agentA, 'post', '/api/weights', {
    dateKey: YESTERDAY,
    weightKg: 78.5,
  });
  const weightId = weightRes.body.entry._id;

  const workRes = await api(agentA, 'post', '/api/work-sessions', {
    dateKey: YESTERDAY,
    taskName: 'Alpha Secret Feature',
    category: 'Coding',
    startTime: '10:00',
    durationMinutes: 50,
  });
  const workId = workRes.body.session._id;

  // User B attempts to delete all of User A's records
  const delWater = await api(agentB, 'delete', `/api/water/${waterId}`);
  assert.equal(delWater.status, 404);
  assert.ok(await WaterEntry.findById(waterId), 'Water record must survive deletion attempt by User B');

  const delMeal = await api(agentB, 'delete', `/api/meals/${mealId}`);
  assert.equal(delMeal.status, 404);
  assert.ok(await MealEntry.findById(mealId), 'Meal record must survive deletion attempt by User B');

  const delSleep = await api(agentB, 'delete', `/api/sleep/${sleepId}`);
  assert.equal(delSleep.status, 404);
  assert.ok(await SleepEntry.findById(sleepId), 'Sleep record must survive deletion attempt by User B');

  const delWorkout = await api(agentB, 'delete', `/api/workouts/${workoutId}`);
  assert.equal(delWorkout.status, 404);
  assert.ok(await Workout.findById(workoutId), 'Workout record must survive deletion attempt by User B');

  const delWeight = await api(agentB, 'delete', `/api/weights/${weightId}`);
  assert.equal(delWeight.status, 404);
  assert.ok(await WeightEntry.findById(weightId), 'Weight record must survive deletion attempt by User B');

  const delWork = await api(agentB, 'delete', `/api/work-sessions/${workId}`);
  assert.equal(delWork.status, 404);
  assert.ok(await WorkSession.findById(workId), 'Work session must survive deletion attempt by User B');
});

test('4. User A cannot access User B’s analytics', async () => {
  // User B queries analytics
  const analyticsB = await api(agentB, 'get', '/api/analytics?preset=7d');
  assert.equal(analyticsB.status, 200);

  // User B has no recorded data, so hasData and hasTimeData are false
  assert.equal(analyticsB.body.analytics.hasData, false, 'User B analytics must not reflect User A data');
  assert.equal(analyticsB.body.analytics.hasTimeData, false, 'User B must not have time data');

  // User A queries analytics - User A has recorded data
  const analyticsA = await api(agentA, 'get', '/api/analytics?preset=7d');
  assert.equal(analyticsA.status, 200);
  assert.equal(analyticsA.body.analytics.hasData, true, 'User A should have recorded data');
  assert.equal(analyticsA.body.analytics.hasTimeData, true, 'User A should have recorded time');
});

test('5. User A cannot access User B’s exported files', async () => {
  // User B downloads JSON export
  const exportResB = await agentB.get('/export/json');
  assert.equal(exportResB.status, 200);
  const payloadB = JSON.parse(exportResB.text);

  assert.equal(payloadB.data.waterEntries.length, 0, 'User B export must contain 0 water entries');
  assert.equal(payloadB.data.meals.length, 0, 'User B export must contain 0 meal entries');
  assert.equal(payloadB.data.workouts.length, 0, 'User B export must contain 0 workouts');
  assert.equal(payloadB.data.sleepEntries.length, 0, 'User B export must contain 0 sleep entries');

  // User B downloads CSV export
  const csvResB = await agentB.get('/export/csv/water');
  assert.equal(csvResB.status, 200);
  assert.equal(csvResB.text.includes('800'), false, 'User B CSV export must not contain User A records');
  assert.equal(csvResB.text.includes('350'), false);
});

test('6. Users cannot impersonate another account by changing request parameters', async () => {
  // User B attempts to create a water entry with User A's userId in the payload
  const spoofWater = await api(agentB, 'post', '/api/water', {
    dateKey: TODAY,
    amountMl: 999,
    userId: userA._id.toString(),
  });
  assert.equal(spoofWater.status, 200);
  const createdWater = await WaterEntry.findById(spoofWater.body.entry._id);
  assert.equal(createdWater.userId.toString(), userB._id.toString(), 'Server must bind to authenticated user, ignoring spoofed userId');

  // User B attempts to post hourly log with User A's userId
  await api(agentB, 'post', '/api/time/hour', {
    dateKey: TODAY,
    hour: 14,
    productive: 45,
    unproductive: 0,
    rest: 15,
    sleep: 0,
    userId: userA._id.toString(),
  });
  const createdLog = await HourlyTimeLog.findOne({ userId: userB._id, dateKey: TODAY, hour: 14 });
  assert.ok(createdLog, 'Log must belong to user B');
  const leakedLog = await HourlyTimeLog.findOne({ userId: userA._id, dateKey: TODAY, hour: 14 });
  assert.equal(leakedLog, null, 'No log should be created for user A');

  // User B attempts to change challenge targets using User A's identity
  const targetsToken = await getCsrf(agentB, '/settings');
  await agentB
    .post('/settings/targets')
    .type('form')
    .send({
      _csrf: targetsToken,
      waterMl: 4500,
      proteinG: 180,
      calories: 3000,
      sleepMinutes: 540,
      workoutsPerWeek: 5,
      userId: userA._id.toString(),
    });

  const challengeA = await Challenge.findOne({ userId: userA._id });
  assert.equal(challengeA.targets.waterMl, 2500, 'User A targets must remain untouched');
  const challengeB = await Challenge.findOne({ userId: userB._id });
  assert.equal(challengeB.targets.waterMl, 4500, 'User B targets were updated for User B only');
});

test('7. Every user’s challenge and weekly achievements remain independent', async () => {
  const challengeA = await Challenge.findOne({ userId: userA._id });
  const challengeB = await Challenge.findOne({ userId: userB._id });

  assert.equal(challengeA.startDate, YESTERDAY);
  assert.equal(challengeB.startDate, TODAY);
  assert.notEqual(challengeA.startDate, challengeB.startDate);

  // Habits belong to each user independently
  const habitsA = await Habit.find({ userId: userA._id });
  const habitsB = await Habit.find({ userId: userB._id });
  assert.equal(habitsA.length, 9);
  assert.equal(habitsB.length, 9);

  const habitAIds = habitsA.map((h) => h._id.toString());
  const habitBIds = habitsB.map((h) => h._id.toString());
  const intersection = habitAIds.filter((id) => habitBIds.includes(id));
  assert.equal(intersection.length, 0, 'Habit documents must be strictly distinct per user');
});

test('8. Password change verifies current password and updates securely', async () => {
  // Wrong current password fails
  const badAttempt = await api(agentB, 'post', '/api/settings/password', {
    currentPassword: 'wrong-password',
    newPassword: 'new-password-12345',
    confirmPassword: 'new-password-12345',
  });
  assert.equal(badAttempt.status, 400);

  // Mismatched confirmation fails
  const mismatch = await api(agentB, 'post', '/api/settings/password', {
    currentPassword: 'passwordB-12345',
    newPassword: 'new-password-12345',
    confirmPassword: 'different-password',
  });
  assert.equal(mismatch.status, 400);

  // Successful password update
  const success = await api(agentB, 'post', '/api/settings/password', {
    currentPassword: 'passwordB-12345',
    newPassword: 'new-password-12345',
    confirmPassword: 'new-password-12345',
  });
  assert.equal(success.status, 200);

  // Sign out and verify new password works
  const token = await getCsrf(agentB, '/settings');
  await agentB.post('/logout').type('form').send({ _csrf: token });

  const freshAgent = request.agent(context.app);
  const oldLogin = await login(freshAgent, 'user_b@example.com', 'passwordB-12345');
  assert.equal(oldLogin.status, 401, 'Old password should no longer work');

  const newLogin = await login(freshAgent, 'user_b@example.com', 'new-password-12345');
  assert.equal(newLogin.status, 302, 'New password should successfully authenticate');
});
