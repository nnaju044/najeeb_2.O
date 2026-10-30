'use strict';

const mongoose = require('mongoose');
const { PrayerEntry, PRAYER_NAMES } = require('../models/PrayerEntry');
const { currentDateKey, addDays, diffDays, weekdayShort, formatDateShort } = require('../utils/date');
const { badRequest } = require('../utils/httpError');

const PRAYER_META = [
  { name: 'Fajr', label: 'Fajr', period: 'Dawn', icon: 'sunrise' },
  { name: 'Dhuhr', label: 'Dhuhr', period: 'Noon', icon: 'sun' },
  { name: 'Asr', label: 'Asr', period: 'Afternoon', icon: 'sun-medium' },
  { name: 'Maghrib', label: 'Maghrib', period: 'Sunset', icon: 'sunset' },
  { name: 'Isha', label: 'Isha', period: 'Night', icon: 'moon' },
];

/**
 * Retrieve the 5 prayer records for a specific date and user.
 * Unmarked prayers default to completed: false.
 */
async function getPrayerDay(userId, dateKey) {
  const entries = await PrayerEntry.find({
    userId,
    dateKey,
  }).lean();

  const entryMap = new Map(entries.map((e) => [e.prayerName, e]));

  const prayers = PRAYER_META.map((meta) => {
    const record = entryMap.get(meta.name);
    return {
      name: meta.name,
      label: meta.label,
      period: meta.period,
      icon: meta.icon,
      completed: Boolean(record && record.completed),
      completedAt: record?.completedAt || null,
      id: record?._id?.toString() || null,
    };
  });

  const completedCount = prayers.filter((p) => p.completed).length;
  const totalCount = PRAYER_META.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  return {
    dateKey,
    prayers,
    completedCount,
    totalCount,
    percent,
  };
}

/**
 * Mark or unmark a prayer as completed for a given user, date, and prayer name.
 */
async function setPrayerStatus(userId, dateKey, prayerName, completed) {
  if (!PRAYER_NAMES.includes(prayerName)) {
    throw badRequest(`Invalid prayer name. Must be one of: ${PRAYER_NAMES.join(', ')}`);
  }

  const isCompleted = Boolean(completed);
  const now = new Date();

  await PrayerEntry.findOneAndUpdate(
    { userId, dateKey, prayerName },
    {
      $set: {
        completed: isCompleted,
        completedAt: isCompleted ? now : null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return getPrayerDay(userId, dateKey);
}

/**
 * Calculate prayer analytics for a user:
 * - Daily count and percent
 * - 7-day weekly breakdown (days & totals)
 * - 30-day monthly summary
 * - Per-prayer historical completion counts and percentages
 * - Total prayers offered and streaks
 */
async function getPrayerAnalytics(userId, targetDateKey = currentDateKey()) {
  const uid = new mongoose.Types.ObjectId(String(userId));

  // 1. Weekly breakdown (last 7 days)
  const weekStartKey = addDays(targetDateKey, -6);
  const weekEntries = await PrayerEntry.find({
    userId: uid,
    dateKey: { $gte: weekStartKey, $lte: targetDateKey },
    completed: true,
  }).lean();

  const weekCountsByDay = new Map();
  weekEntries.forEach((entry) => {
    const cur = weekCountsByDay.get(entry.dateKey) || 0;
    weekCountsByDay.set(entry.dateKey, cur + 1);
  });

  const weekDays = [];
  let weekCompletedTotal = 0;
  for (let i = 0; i < 7; i += 1) {
    const dKey = addDays(weekStartKey, i);
    const count = weekCountsByDay.get(dKey) || 0;
    weekCompletedTotal += count;
    weekDays.push({
      dateKey: dKey,
      label: weekdayShort(dKey),
      shortDate: formatDateShort(dKey),
      completedCount: count,
      totalCount: 5,
      percent: Math.round((count / 5) * 100),
      isToday: dKey === targetDateKey,
    });
  }

  const weekPossibleTotal = 7 * 5;
  const weeklyPercent = Math.round((weekCompletedTotal / weekPossibleTotal) * 100);

  // 2. 30-day summary
  const monthStartKey = addDays(targetDateKey, -29);
  const monthEntries = await PrayerEntry.find({
    userId: uid,
    dateKey: { $gte: monthStartKey, $lte: targetDateKey },
    completed: true,
  }).lean();

  const monthCompletedTotal = monthEntries.length;
  const monthPossibleTotal = 30 * 5;
  const monthlyPercent = Math.round((monthCompletedTotal / monthPossibleTotal) * 100);

  // 3. Per-prayer historical breakdown (all time)
  const allTimeCompleted = await PrayerEntry.aggregate([
    { $match: { userId: uid, completed: true } },
    { $group: { _id: '$prayerName', count: { $sum: 1 } } },
  ]);

  const allTimeCountMap = new Map(allTimeCompleted.map((r) => [r._id, r.count]));
  const totalOfferedAllTime = allTimeCompleted.reduce((acc, r) => acc + r.count, 0);

  // Distinct days recorded for completion rate calculations
  const distinctDaysResult = await PrayerEntry.aggregate([
    { $match: { userId: uid } },
    { $group: { _id: '$dateKey' } },
    { $count: 'totalDays' },
  ]);
  const activeDaysCount = Math.max(1, distinctDaysResult[0]?.totalDays || 1);

  const prayerStats = PRAYER_META.map((meta) => {
    const count = allTimeCountMap.get(meta.name) || 0;
    return {
      name: meta.name,
      label: meta.label,
      period: meta.period,
      icon: meta.icon,
      count,
      percent: Math.min(100, Math.round((count / activeDaysCount) * 100)),
    };
  });

  // 4. Consecutive days streak (days with all 5 prayers completed ending today or yesterday)
  const fullDays = await PrayerEntry.aggregate([
    { $match: { userId: uid, completed: true } },
    { $group: { _id: '$dateKey', count: { $sum: 1 } } },
    { $match: { count: 5 } },
    { $sort: { _id: -1 } },
  ]);

  const fullDaysSet = new Set(fullDays.map((f) => f._id));
  let streak = 0;
  let cursor = targetDateKey;
  // If today isn't 5/5 yet, start check from yesterday so active streak doesn't prematurely drop to 0
  if (!fullDaysSet.has(cursor)) {
    cursor = addDays(cursor, -1);
  }
  while (fullDaysSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  // Today's summary
  const todaySummary = await getPrayerDay(userId, targetDateKey);

  return {
    today: todaySummary,
    week: {
      days: weekDays,
      completed: weekCompletedTotal,
      possible: weekPossibleTotal,
      percent: weeklyPercent,
    },
    month: {
      completed: monthCompletedTotal,
      possible: monthPossibleTotal,
      percent: monthlyPercent,
      days: 30,
    },
    prayers: prayerStats,
    streak,
    totalOfferedAllTime,
  };
}

module.exports = {
  PRAYER_NAMES,
  PRAYER_META,
  getPrayerDay,
  setPrayerStatus,
  getPrayerAnalytics,
};
