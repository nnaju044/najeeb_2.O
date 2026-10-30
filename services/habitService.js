'use strict';

const { Habit, HabitCompletion } = require('../models/Habit');
const { isValidDateKey, isFutureDateKey, dateKeyRange, addDays, currentDateKey } = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');
const { seedUserHabits } = require('./seedService');

const STATUSES = ['done', 'skipped', 'na'];

async function listHabits(userId) {
  await seedUserHabits(userId);
  return Habit.find({ userId, archivedAt: null }).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

async function listWithStatus(userId, dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  const habits = await listHabits(userId);
  const completions = await HabitCompletion.find({ userId, dateKey }).lean();
  const byHabit = new Map(completions.map((completion) => [completion.habitId.toString(), completion]));
  const items = habits.map((habit) => {
    const completion = byHabit.get(habit._id.toString());
    return {
      ...habit,
      status: completion?.status || null,
      completionId: completion?._id || null,
    };
  });
  return { dateKey, habits: items, ...summarizeStatuses(items) };
}

function summarizeStatuses(items) {
  const done = items.filter((item) => item.status === 'done').length;
  const skipped = items.filter((item) => item.status === 'skipped').length;
  const na = items.filter((item) => item.status === 'na').length;
  const applicable = items.length - skipped - na;
  return {
    done,
    skipped,
    na,
    applicable,
    total: items.length,
    percent: applicable > 0 ? Math.round((done / applicable) * 1000) / 10 : 0,
  };
}

/** One tap sets a status; 'clear' removes the record entirely. */
async function setStatus(userId, habitId, { dateKey, status }) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(dateKey)) throw badRequest('Habits cannot be completed in the future');
  const habit = await Habit.findOne({ _id: habitId, userId, archivedAt: null });
  if (!habit) throw notFound('Habit not found');
  if (status === 'clear') {
    await HabitCompletion.deleteOne({ userId, habitId, dateKey });
    return { habitId, dateKey, status: null };
  }
  if (!STATUSES.includes(status)) throw badRequest('Status must be done, skipped or na');
  const completion = await HabitCompletion.findOneAndUpdate(
    { userId, habitId, dateKey },
    { $set: { status } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return { habitId, dateKey, status: completion.status };
}

async function createHabit(userId, payload) {
  const name = String(payload.name || '').trim();
  if (!name) throw badRequest('Habit name is required');
  const count = await Habit.countDocuments({ userId, archivedAt: null });
  if (count >= 30) throw badRequest('You can track up to 30 habits at a time');
  return Habit.create({
    userId,
    name: name.slice(0, 120),
    icon: String(payload.icon || 'circle-check').slice(0, 40),
    category: String(payload.category || 'routine').slice(0, 30),
    sortOrder: count,
  });
}

async function updateHabit(userId, habitId, payload) {
  const habit = await Habit.findOne({ _id: habitId, userId, archivedAt: null });
  if (!habit) throw notFound('Habit not found');
  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) throw badRequest('Habit name cannot be empty');
    habit.name = name.slice(0, 120);
  }
  if (payload.icon !== undefined) habit.icon = String(payload.icon).slice(0, 40);
  if (payload.category !== undefined) habit.category = String(payload.category).slice(0, 30);
  if (payload.isActive !== undefined) habit.isActive = Boolean(payload.isActive);
  if (payload.sortOrder !== undefined) habit.sortOrder = Number(payload.sortOrder) || 0;
  await habit.save();
  return habit;
}

/** Archive instead of delete: past completions stay meaningful. */
async function archiveHabit(userId, habitId) {
  const habit = await Habit.findOneAndUpdate(
    { _id: habitId, userId, archivedAt: null },
    { $set: { archivedAt: new Date(), isActive: false } },
    { new: true }
  );
  if (!habit) throw notFound('Habit not found');
  return habit;
}

async function getRangeStats(userId, fromKey, toKey) {
  const habits = await Habit.find({
    userId,
    $or: [{ archivedAt: null }, { createdAt: { $lte: new Date(`${toKey}T23:59:59+05:30`) } }],
  }).lean();
  const completions = await HabitCompletion.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).lean();
  const keys = dateKeyRange(fromKey, toKey);
  const activeIds = new Set(habits.map((habit) => habit._id.toString()));

  const byDay = new Map(keys.map((key) => [key, { dateKey: key, done: 0, skipped: 0, na: 0 }]));
  const byHabit = new Map(habits.map((habit) => [habit._id.toString(), { habitId: habit._id.toString(), name: habit.name, done: 0, skipped: 0, na: 0 }]));

  for (const completion of completions) {
    if (!activeIds.has(completion.habitId.toString())) continue;
    const day = byDay.get(completion.dateKey);
    const habitRow = byHabit.get(completion.habitId.toString());
    if (day && completion.status in day) day[completion.status] += 1;
    if (habitRow && completion.status in habitRow) habitRow[completion.status] += 1;
  }

  const days = keys.map((key) => {
    const row = byDay.get(key);
    const applicable = habits.length - row.skipped - row.na;
    return {
      ...row,
      total: habits.length,
      applicable,
      percent: applicable > 0 ? Math.round((row.done / applicable) * 1000) / 10 : 0,
    };
  });
  const totalDone = days.reduce((sum, day) => sum + day.done, 0);
  const totalApplicable = days.reduce((sum, day) => sum + day.applicable, 0);
  return {
    days,
    habits: [...byHabit.values()],
    totalDone,
    totalApplicable,
    consistencyPercent: totalApplicable > 0 ? Math.round((totalDone / totalApplicable) * 1000) / 10 : 0,
    activeHabits: habits.filter((habit) => !habit.archivedAt).length,
  };
}

/** Consecutive days (ending today or yesterday) with >=80% of habits done. */
async function getStreak(userId, todayKey = currentDateKey()) {
  const fromKey = addDays(todayKey, -89);
  const stats = await getRangeStats(userId, fromKey, todayKey);
  const byKey = new Map(stats.days.map((day) => [day.dateKey, day]));
  let streak = 0;
  let cursor = todayKey;
  const todayRow = byKey.get(todayKey);
  if (!todayRow || todayRow.percent < 80) {
    cursor = addDays(todayKey, -1);
  }
  for (let i = 0; i < 90; i += 1) {
    const row = byKey.get(cursor);
    if (row && row.percent >= 80) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return { currentStreakDays: streak };
}

module.exports = {
  STATUSES,
  listHabits,
  listWithStatus,
  summarizeStatuses,
  setStatus,
  createHabit,
  updateHabit,
  archiveHabit,
  getRangeStats,
  getStreak,
};
