'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const WaterEntry = require('../models/WaterEntry');
const SleepEntry = require('../models/SleepEntry');
const MealEntry = require('../models/MealEntry');
const WeightEntry = require('../models/WeightEntry');
const Workout = require('../models/Workout');
const { HabitCompletion } = require('../models/Habit');
const User = require('../models/User');
const sleepService = require('../services/sleepService');
const { startTestApp, stopTestApp, registerOwner, startChallenge, api } = require('./helpers/app');

let context;
let userId;
const TODAY = '2026-02-10';

test.before(async () => {
  context = await startTestApp('lifeos_tracking');
  await registerOwner(context.agent);
  await startChallenge(context.agent, '2026-01-01');
  const user = await User.findOne({ email: 'owner@example.com' });
  userId = user._id;
});

test.after(async () => {
  await stopTestApp(context);
});

/* ── water ─────────────────────────────────────────────────────────────── */

test('water entries accumulate accurately against the target', async () => {
  const first = await api(context.agent, 'post', '/api/water', { dateKey: TODAY, amountMl: 500 });
  assert.equal(first.status, 200);
  const second = await api(context.agent, 'post', '/api/water', { dateKey: TODAY, amountMl: 1000 });
  assert.equal(second.status, 200);
  assert.equal(second.body.summary.totalMl, 1500);
  assert.equal(second.body.summary.targetMl, 2500);
  assert.equal(second.body.summary.percent, 60);
  assert.equal(second.body.summary.remainingMl, 1000);
});

test('the same clientId never counts a drink twice', async () => {
  const payload = { dateKey: TODAY, amountMl: 500, clientId: 'offline-water-entry-1' };
  const first = await api(context.agent, 'post', '/api/water', payload);
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicate, false);

  const replay = await api(context.agent, 'post', '/api/water', payload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.summary.totalMl, 2000);

  const count = await WaterEntry.countDocuments({ userId, dateKey: TODAY });
  assert.equal(count, 3);
});

test('undo removes only the most recent entry', async () => {
  const before = await WaterEntry.countDocuments({ userId, dateKey: TODAY });
  const undo = await api(context.agent, 'post', '/api/water/undo', { dateKey: TODAY });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.summary.totalMl, 1500);
  const after = await WaterEntry.countDocuments({ userId, dateKey: TODAY });
  assert.equal(after, before - 1);
});

test('water entries can be deleted individually and invalid amounts are rejected', async () => {
  const target = await WaterEntry.findOne({ userId, dateKey: TODAY, amountMl: 500 });
  const deleted = await api(context.agent, 'delete', `/api/water/${target._id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.summary.totalMl, 1000);

  const invalid = await api(context.agent, 'post', '/api/water', { dateKey: TODAY, amountMl: 0 });
  assert.equal(invalid.status, 400);
});

/* ── sleep ─────────────────────────────────────────────────────────────── */

test('sleep sessions across midnight are calculated correctly', () => {
  const late = sleepService.computeSession({ dateKey: '2026-02-10', bedTime: '23:30', wakeTime: '07:00' });
  assert.equal(late.durationMinutes, 450);
  assert.equal(late.bedtime.toISOString(), '2026-02-09T18:00:00.000Z');
  assert.equal(late.wakeTime.toISOString(), '2026-02-10T01:30:00.000Z');

  const earlyMorning = sleepService.computeSession({ dateKey: '2026-02-10', bedTime: '02:00', wakeTime: '10:00' });
  assert.equal(earlyMorning.durationMinutes, 480);
  assert.equal(earlyMorning.bedtime.toISOString(), '2026-02-09T20:30:00.000Z');
  assert.equal(earlyMorning.wakeTime.toISOString(), '2026-02-10T04:30:00.000Z');

  assert.throws(() => sleepService.computeSession({ dateKey: '2026-02-10', bedTime: '10:00', wakeTime: '10:00' }));
  assert.throws(() => sleepService.computeSession({ dateKey: 'bad', bedTime: '22:00', wakeTime: '06:00' }));
});

test('sleep sessions are stored, summarised and deletable', async () => {
  const created = await api(context.agent, 'post', '/api/sleep', {
    dateKey: TODAY,
    bedTime: '02:00',
    wakeTime: '10:00',
    quality: 'good',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.entry.durationMinutes, 480);
  assert.equal(created.body.day.totalMinutes, 480);

  const second = await api(context.agent, 'post', '/api/sleep', {
    dateKey: TODAY,
    bedTime: '15:00',
    wakeTime: '15:30',
    quality: 'average',
  });
  assert.equal(second.status, 201);
  assert.equal(second.body.day.totalMinutes, 510);

  const entry = await SleepEntry.findOne({ userId, dateKey: TODAY, durationMinutes: 480 });
  const removed = await api(context.agent, 'delete', `/api/sleep/${entry._id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.day.totalMinutes, 30);
});

/* ── nutrition ─────────────────────────────────────────────────────────── */

test('meal nutrition is recalculated on the server from per-serving values', async () => {
  const search = await context.agent.get('/api/foods?q=egg').set('Accept', 'application/json');
  const egg = search.body.foods.find((food) => food.name === 'Boiled egg');
  assert.ok(egg, 'the seeded food library should contain a boiled egg');

  const meal = await api(context.agent, 'post', '/api/meals', {
    dateKey: TODAY,
    mealType: 'breakfast',
    items: [{ foodId: egg._id, servings: 2 }],
  });
  assert.equal(meal.status, 201);
  assert.equal(meal.body.meal.totals.calories, 156);
  assert.equal(meal.body.meal.totals.protein, 12.6);
  assert.equal(meal.body.totals.totals.protein, 12.6);
});

test('a client-supplied totals object cannot override computed nutrition', async () => {
  const search = await context.agent.get('/api/foods?q=banana').set('Accept', 'application/json');
  const banana = search.body.foods[0];
  const meal = await api(context.agent, 'post', '/api/meals', {
    dateKey: TODAY,
    mealType: 'snack',
    items: [{ foodId: banana._id, servings: 1 }],
    totals: { calories: 9999, protein: 9999 },
  });
  assert.equal(meal.status, 201);
  assert.equal(meal.body.meal.totals.calories, Math.round(banana.calories * 10) / 10);
  assert.notEqual(meal.body.meal.totals.calories, 9999);

  const stored = await MealEntry.findById(meal.body.meal._id);
  assert.notEqual(stored.totals.protein, 9999);
});

test('meals can be deleted and quantities change totals', async () => {
  const search = await context.agent.get('/api/foods?q=oats').set('Accept', 'application/json');
  const oats = search.body.foods[0];
  const meal = await api(context.agent, 'post', '/api/meals', {
    dateKey: TODAY,
    mealType: 'lunch',
    items: [{ foodId: oats._id, servings: 1.5 }],
  });
  assert.equal(meal.status, 201);
  assert.equal(meal.body.meal.totals.protein, Math.round(oats.protein * 1.5 * 10) / 10);

  const removed = await api(context.agent, 'delete', `/api/meals/${meal.body.meal._id}`);
  assert.equal(removed.status, 200);
  assert.equal(await MealEntry.countDocuments({ userId, mealType: 'lunch', dateKey: TODAY }), 0);
});

test('favourite meals can be saved and logged in one action', async () => {
  const saved = await api(context.agent, 'post', '/api/favorites', {
    name: 'Egg breakfast',
    mealType: 'breakfast',
  });
  assert.equal(saved.status, 201);

  const logged = await api(context.agent, 'post', `/api/favorites/${saved.body.favorite._id}/log`, {
    dateKey: '2026-02-11',
  });
  assert.equal(logged.status, 201);
  assert.ok(logged.body.meal.totals.protein > 0);
});

test('custom foods become searchable and are owned by the user', async () => {
  const created = await api(context.agent, 'post', '/api/foods', {
    name: 'Homemade beef curry',
    servingLabel: '1 bowl',
    calories: 320,
    protein: 28,
    carbs: 8,
    fat: 19,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.food.isCustom, true);

  const search = await context.agent.get('/api/foods?q=beef%20curry').set('Accept', 'application/json');
  assert.ok(search.body.foods.some((food) => food.name === 'Homemade beef curry'));
});

/* ── weight ────────────────────────────────────────────────────────────── */

test('weight keeps one record per day and reports change against the previous entry', async () => {
  const first = await api(context.agent, 'post', '/api/weights', { dateKey: '2026-02-01', weightKg: 58 });
  assert.equal(first.status, 201);
  const second = await api(context.agent, 'post', '/api/weights', { dateKey: TODAY, weightKg: 58.6, heightCm: 172 });
  assert.equal(second.status, 201);
  assert.equal(second.body.entry.weightKg, 58.6);
  assert.equal(second.body.summary.changeKg, 0.6);
  assert.equal(second.body.summary.bmi, 19.8);

  const sameDay = await api(context.agent, 'post', '/api/weights', { dateKey: TODAY, weightKg: 58.9 });
  assert.equal(sameDay.status, 200);
  assert.equal(sameDay.body.updated, true);
  assert.equal(await WeightEntry.countDocuments({ userId, dateKey: TODAY }), 1);

  const series = await WeightEntry.find({ userId }).sort({ dateKey: 1 });
  assert.deepEqual(series.map((entry) => entry.weightKg), [58, 58.9]);
});

/* ── habits ────────────────────────────────────────────────────────────── */

test('habit statuses are one-per-habit-per-day and skips do not count as failures', async () => {
  const { Habit } = require('../models/Habit');
  const habit = await Habit.findOne({ userId, name: 'Wake up on time' });

  const done = await api(context.agent, 'post', `/api/habits/${habit._id}/status`, {
    dateKey: TODAY,
    status: 'done',
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.day.done, 1);
  assert.equal(done.body.day.percent, 11.1);

  const skipped = await api(context.agent, 'post', `/api/habits/${habit._id}/status`, {
    dateKey: TODAY,
    status: 'skipped',
  });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.day.done, 0);
  assert.equal(skipped.body.day.applicable, 8);
  assert.equal(await HabitCompletion.countDocuments({ userId, habitId: habit._id, dateKey: TODAY }), 1);

  const cleared = await api(context.agent, 'post', `/api/habits/${habit._id}/status`, {
    dateKey: TODAY,
    status: 'clear',
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.day.habits.find((entry) => entry._id === habit._id.toString()).status, null);
});

test('archived habits disappear from today but keep their history', async () => {
  const { Habit } = require('../models/Habit');
  const habit = await Habit.create({ userId, name: 'Temporary habit', sortOrder: 20 });
  await api(context.agent, 'post', `/api/habits/${habit._id}/status`, { dateKey: TODAY, status: 'done' });
  const archived = await api(context.agent, 'delete', `/api/habits/${habit._id}`);
  assert.equal(archived.status, 200);

  const stillThere = await Habit.findById(habit._id);
  assert.ok(stillThere.archivedAt);
  assert.equal(await HabitCompletion.countDocuments({ userId, habitId: habit._id }), 1);
  assert.ok(!archived.body.day.habits.some((entry) => entry._id === habit._id.toString()));
});

/* ── workouts ──────────────────────────────────────────────────────────── */

test('workouts store sets, compute volume and feed strength progression', async () => {
  const created = await api(context.agent, 'post', '/api/workouts', {
    dateKey: TODAY,
    type: 'full_body',
    name: 'Full body A',
    durationMinutes: 55,
    exercises: [
      {
        name: 'Chest press',
        muscleGroup: 'Chest',
        sets: [
          { reps: 10, weightKg: 20 },
          { reps: 8, weightKg: 25 },
        ],
      },
      { name: 'Plank', muscleGroup: 'Core', sets: [{ reps: 0, weightKg: 0, durationSeconds: 60 }] },
    ],
  });
  assert.equal(created.status, 201);

  const workout = await Workout.findById(created.body.workout._id);
  assert.equal(workout.totalVolume(), 20 * 10 + 25 * 8);

  const progression = await context.agent
    .get('/api/progression?exercise=Chest%20press')
    .set('Accept', 'application/json');
  assert.equal(progression.body.points.length, 1);
  assert.equal(progression.body.points[0].maxWeightKg, 25);

  const second = await api(context.agent, 'post', '/api/workouts', {
    dateKey: '2026-02-11',
    type: 'upper',
    durationMinutes: 45,
    exercises: [{ name: 'Chest press', muscleGroup: 'Chest', sets: [{ reps: 8, weightKg: 30 }] }],
  });
  assert.equal(second.status, 201);
  const updated = await context.agent
    .get('/api/progression?exercise=Chest%20press')
    .set('Accept', 'application/json');
  assert.deepEqual(updated.body.points.map((point) => point.maxWeightKg), [25, 30]);
});

test('invalid workout types and duplicate clientIds are handled', async () => {
  const invalid = await api(context.agent, 'post', '/api/workouts', {
    dateKey: TODAY,
    type: 'moon_walk',
  });
  assert.equal(invalid.status, 400);

  const payload = { dateKey: TODAY, type: 'walk', durationMinutes: 30, clientId: 'workout-offline-1' };
  const first = await api(context.agent, 'post', '/api/workouts', payload);
  const replay = await api(context.agent, 'post', '/api/workouts', payload);
  assert.equal(first.body.duplicate, false);
  assert.equal(replay.body.duplicate, true);
  assert.equal(await Workout.countDocuments({ userId, clientId: 'workout-offline-1' }), 1);
});
