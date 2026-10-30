'use strict';

const Challenge = require('../models/Challenge');
const HourlyTimeLog = require('../models/HourlyTimeLog');
const DailyLog = require('../models/DailyLog');
const WaterEntry = require('../models/WaterEntry');
const MealEntry = require('../models/MealEntry');
const SleepEntry = require('../models/SleepEntry');
const Workout = require('../models/Workout');
const WeightEntry = require('../models/WeightEntry');
const { Habit, HabitCompletion } = require('../models/Habit');
const WorkSession = require('../models/WorkSession');
const Achievement = require('../models/Achievement');
const WeeklyReport = require('../models/WeeklyReport');
const { PrayerEntry } = require('../models/PrayerEntry');
const { DEFAULT_TARGETS, CHALLENGE_WEEKS } = require('../config/constants');
const { addDays, diffDays, isValidDateKey, currentDateKey } = require('../utils/date');
const { badRequest, conflict } = require('../utils/httpError');
const { seedUserHabits } = require('./seedService');

async function getChallenge(userId) {
  return Challenge.findOne({ userId });
}

async function startChallenge(userId, startDate) {
  if (!isValidDateKey(startDate)) throw badRequest('Pick a valid start date');
  const existing = await getChallenge(userId);
  if (existing) {
    throw conflict(`Your challenge already started on ${existing.startDate}`);
  }
  const challenge = await Challenge.create({
    userId,
    startDate,
    targets: { ...DEFAULT_TARGETS },
  });
  await seedUserHabits(userId);
  return challenge;
}

/**
 * Where a calendar day sits relative to the challenge.
 * status: 'no-challenge' | 'before' | 'active' | 'completed'
 */
function dayInfo(challenge, dateKey = currentDateKey()) {
  const duration = challenge?.durationDays || 90;
  if (!challenge) {
    return { status: 'no-challenge', dayNumber: 0, offset: null, duration, weekNumber: 0, remainingDays: 0 };
  }
  const offset = diffDays(challenge.startDate, dateKey);
  if (offset < 0) {
    return { status: 'before', dayNumber: 0, offset, duration, weekNumber: 0, remainingDays: duration };
  }
  const dayNumber = offset + 1;
  const active = dayNumber <= duration;
  const weekNumber = active ? weekNumberForDay(dayNumber, duration) : CHALLENGE_WEEKS;
  return {
    status: active ? 'active' : 'completed',
    dayNumber,
    offset,
    duration,
    weekNumber,
    remainingDays: Math.max(0, duration - dayNumber),
  };
}

function weekNumberForDay(dayNumber, duration = 90) {
  if (!Number.isFinite(dayNumber) || dayNumber < 1) return 0;
  const weeks = Math.ceil(duration / 7);
  return Math.min(Math.ceil(dayNumber / 7), Math.max(1, weeks));
}

/** Calendar bounds for challenge week N (1-indexed). */
function weekBounds(challenge, weekNumber) {
  const duration = challenge.durationDays || 90;
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = Math.min(weekNumber * 7, duration);
  if (weekNumber < 1 || startDay > duration) {
    return null;
  }
  return {
    weekNumber,
    startDay,
    endDay,
    startDate: addDays(challenge.startDate, startDay - 1),
    endDate: addDays(challenge.startDate, endDay - 1),
  };
}

/** Overall (time-based) challenge progress for the dashboard. */
function challengeProgress(challenge, todayKey = currentDateKey()) {
  const info = dayInfo(challenge, todayKey);
  const duration = challenge?.durationDays || 90;
  const elapsed = info.status === 'completed' ? duration : Math.max(0, Math.min(info.dayNumber, duration));
  return {
    ...info,
    startDate: challenge?.startDate || null,
    completionPercent: duration ? Math.round((elapsed / duration) * 1000) / 10 : 0,
    daysCompleted: Math.max(0, elapsed),
  };
}

async function updateTargets(userId, targets) {
  const challenge = await getChallenge(userId);
  if (!challenge) throw badRequest('Start your challenge first');
  const allowed = ['waterMl', 'proteinG', 'calories', 'sleepMinutes', 'workoutsPerWeek'];
  for (const key of allowed) {
    if (targets[key] !== undefined) challenge.targets[key] = targets[key];
  }
  await challenge.save();
  return challenge;
}

/**
 * Reset the 90-day challenge and erase all tracked personal data for this user.
 * Allows the user to start completely from scratch.
 * @param {ObjectId|string} userId
 * @param {string|null} newStartDate - Optional start date (e.g. today). If provided, immediately starts new challenge.
 */
async function resetChallengePlan(userId, newStartDate = null) {
  if (newStartDate) {
    if (!isValidDateKey(newStartDate)) throw badRequest('Pick a valid start date');
    if (newStartDate > addDays(currentDateKey(), 1)) {
      throw badRequest('Start date cannot be in the future');
    }
  }

  // Erase all tracked activity and challenge records for this user
  await Promise.all([
    HourlyTimeLog.deleteMany({ userId }),
    DailyLog.deleteMany({ userId }),
    WaterEntry.deleteMany({ userId }),
    MealEntry.deleteMany({ userId }),
    SleepEntry.deleteMany({ userId }),
    Workout.deleteMany({ userId }),
    WeightEntry.deleteMany({ userId }),
    HabitCompletion.deleteMany({ userId }),
    WorkSession.deleteMany({ userId }),
    Achievement.deleteMany({ userId }),
    WeeklyReport.deleteMany({ userId }),
    PrayerEntry.deleteMany({ userId }),
    Challenge.deleteMany({ userId }),
    Habit.deleteMany({ userId }),
  ]);

  // Re-seed the 9 default starter habits for the fresh plan
  await seedUserHabits(userId);

  // If a new start date was specified, start the new challenge right away
  let newChallenge = null;
  if (newStartDate) {
    newChallenge = await Challenge.create({
      userId,
      startDate: newStartDate,
      targets: { ...DEFAULT_TARGETS },
    });
  }

  return newChallenge;
}

module.exports = {
  getChallenge,
  startChallenge,
  resetChallengePlan,
  dayInfo,
  weekNumberForDay,
  weekBounds,
  challengeProgress,
  updateTargets,
};
