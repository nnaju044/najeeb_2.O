'use strict';

const Challenge = require('../models/Challenge');
const DailyLog = require('../models/DailyLog');
const HourlyTimeLog = require('../models/HourlyTimeLog');
const WaterEntry = require('../models/WaterEntry');
const MealEntry = require('../models/MealEntry');
const FavoriteMeal = require('../models/FavoriteMeal');
const SleepEntry = require('../models/SleepEntry');
const Workout = require('../models/Workout');
const WeightEntry = require('../models/WeightEntry');
const { Habit, HabitCompletion } = require('../models/Habit');
const Achievement = require('../models/Achievement');
const WeeklyReport = require('../models/WeeklyReport');
const WorkSession = require('../models/WorkSession');
const { PrayerEntry } = require('../models/PrayerEntry');
const { badRequest } = require('../utils/httpError');
const { currentDateKey } = require('../utils/date');

const COLLECTIONS = [
  { key: 'challenge', label: 'Challenge', model: Challenge, find: (userId) => Challenge.find({ userId }).lean() },
  { key: 'dailyLogs', label: 'Daily logs', model: DailyLog, find: (userId) => DailyLog.find({ userId }).sort({ dateKey: 1 }).lean() },
  {
    key: 'hourlyTimeLogs',
    label: '24-hour time logs',
    model: HourlyTimeLog,
    find: (userId) => HourlyTimeLog.find({ userId }).sort({ dateKey: 1, hour: 1 }).lean(),
  },
  { key: 'waterEntries', label: 'Water entries', model: WaterEntry, find: (userId) => WaterEntry.find({ userId }).sort({ loggedAt: 1 }).lean() },
  { key: 'meals', label: 'Meal entries', model: MealEntry, find: (userId) => MealEntry.find({ userId }).sort({ dateKey: 1 }).lean() },
  { key: 'favoriteMeals', label: 'Favourite meals', model: FavoriteMeal, find: (userId) => FavoriteMeal.find({ userId }).lean() },
  { key: 'sleepEntries', label: 'Sleep entries', model: SleepEntry, find: (userId) => SleepEntry.find({ userId }).sort({ bedtime: 1 }).lean() },
  { key: 'workouts', label: 'Workouts', model: Workout, find: (userId) => Workout.find({ userId }).sort({ dateKey: 1 }).lean() },
  { key: 'weightEntries', label: 'Weight entries', model: WeightEntry, find: (userId) => WeightEntry.find({ userId }).sort({ dateKey: 1 }).lean() },
  { key: 'habits', label: 'Habits', model: Habit, find: (userId) => Habit.find({ userId }).sort({ sortOrder: 1 }).lean() },
  { key: 'habitCompletions', label: 'Habit completions', model: HabitCompletion, find: (userId) => HabitCompletion.find({ userId }).sort({ dateKey: 1 }).lean() },
  { key: 'workSessions', label: 'Focused work sessions', model: WorkSession, find: (userId) => WorkSession.find({ userId }).sort({ dateKey: 1 }).lean() },
  { key: 'achievements', label: 'Achievements', model: Achievement, find: (userId) => Achievement.find({ userId }).sort({ earnedAt: 1 }).lean() },
  { key: 'weeklyReports', label: 'Weekly reports', model: WeeklyReport, find: (userId) => WeeklyReport.find({ userId }).sort({ weekNumber: 1 }).lean() },
  { key: 'prayerEntries', label: 'Prayer entries', model: PrayerEntry, find: (userId) => PrayerEntry.find({ userId }).sort({ dateKey: 1, prayerName: 1 }).lean() },
];

async function exportJson(userId) {
  const entries = await Promise.all(COLLECTIONS.map(async (collection) => [collection.key, await collection.find(userId)]));
  return {
    app: 'Jeebs 2.O — 90-Day Challenge',
    exportedAt: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    exportedDay: currentDateKey(),
    data: Object.fromEntries(entries),
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_DATASETS = {
  time: {
    label: 'hourly-time',
    fetch: (userId) => HourlyTimeLog.find({ userId }).sort({ dateKey: 1, hour: 1 }).lean(),
    columns: ['dateKey', 'hour', 'productive', 'unproductive', 'rest', 'sleep', 'source'],
  },
  water: {
    label: 'water',
    fetch: (userId) => WaterEntry.find({ userId }).sort({ dateKey: 1, loggedAt: 1 }).lean(),
    columns: ['dateKey', 'amountMl', 'loggedAt'],
  },
  meals: {
    label: 'meals',
    fetch: (userId) => MealEntry.find({ userId }).sort({ dateKey: 1, createdAt: 1 }).lean(),
    columns: ['dateKey', 'mealType', 'items', 'totals', 'notes'],
  },
  sleep: {
    label: 'sleep',
    fetch: (userId) => SleepEntry.find({ userId }).sort({ dateKey: 1 }).lean(),
    columns: ['dateKey', 'bedtime', 'wakeTime', 'durationMinutes', 'quality', 'notes'],
  },
  workouts: {
    label: 'workouts',
    fetch: (userId) => Workout.find({ userId }).sort({ dateKey: 1 }).lean(),
    columns: ['dateKey', 'type', 'name', 'durationMinutes', 'exercises', 'effort', 'notes'],
  },
  weight: {
    label: 'weight',
    fetch: (userId) => WeightEntry.find({ userId }).sort({ dateKey: 1 }).lean(),
    columns: ['dateKey', 'weightKg', 'heightCm', 'bodyFatPct', 'waistCm', 'notes'],
  },
  habits: {
    label: 'habit-completions',
    fetch: (userId) => HabitCompletion.find({ userId }).sort({ dateKey: 1 }).lean(),
    columns: ['dateKey', 'habitId', 'status'],
  },
  work: {
    label: 'work-sessions',
    fetch: (userId) => WorkSession.find({ userId }).sort({ dateKey: 1 }).lean(),
    columns: ['dateKey', 'startTime', 'durationMinutes', 'category', 'project', 'notes', 'allocatedMinutes'],
  },
  reports: {
    label: 'weekly-reports',
    fetch: (userId) => WeeklyReport.find({ userId }).sort({ weekNumber: 1 }).lean(),
    columns: ['weekNumber', 'startDate', 'endDate', 'achievementPercent', 'productivityScore', 'improvementPct', 'bestDay', 'weakestDay', 'insights'],
  },
  prayers: {
    label: 'prayer-entries',
    fetch: (userId) => PrayerEntry.find({ userId }).sort({ dateKey: 1, prayerName: 1 }).lean(),
    columns: ['dateKey', 'prayerName', 'completed', 'completedAt'],
  },
};

function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','));
  return [header, ...lines].join('\n');
}

async function exportCsv(userId, dataset) {
  const definition = CSV_DATASETS[dataset];
  if (!definition) throw badRequest(`Unknown export dataset: ${dataset}`);
  const rows = await definition.fetch(userId);
  return {
    filename: `jeebs-${definition.label}-${currentDateKey()}.csv`,
    csv: `${toCsv(rows, definition.columns)}\n`,
    rowCount: rows.length,
  };
}

module.exports = { COLLECTIONS, CSV_DATASETS, exportJson, exportCsv, toCsv, csvEscape };
