'use strict';

const SleepEntry = require('../models/SleepEntry');
const {
  isValidDateKey,
  isValidTimeString,
  parseTimeToMinutes,
  instantFromLocal,
  dateKeyRange,
  currentDateKey,
  addDays,
  isFutureDateKey,
} = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');
const { SLEEP_QUALITIES } = require('../config/constants');

const QUALITY_SCORE = Object.fromEntries(SLEEP_QUALITIES.map((q) => [q.value, q.score]));

/**
 * Turn "I woke up on this date at 10:00 and went to bed at 02:00" into real
 * UTC instants. The duration is computed modulo 24h, so 23:30 → 07:00 correctly
 * lands the bedtime on the *previous* calendar day, and 02:00 → 10:00 stays on
 * the same morning. A session can never silently spill past 18 hours.
 */
function computeSession({ dateKey, bedTime, wakeTime }) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid wake-up date is required');
  if (!isValidTimeString(bedTime) || !isValidTimeString(wakeTime)) {
    throw badRequest('Bedtime and wake-up time must use HH:MM (24-hour)');
  }
  const bedMinutes = parseTimeToMinutes(bedTime);
  const wakeMinutes = parseTimeToMinutes(wakeTime);
  const durationMinutes = (wakeMinutes - bedMinutes + 1440) % 1440;
  if (durationMinutes === 0) {
    throw badRequest('Bedtime and wake-up time cannot be the same');
  }
  if (durationMinutes > 18 * 60) {
    throw badRequest('A sleep session longer than 18 hours looks like a mistake');
  }
  const wakeTimeInstant = instantFromLocal(dateKey, wakeTime);
  const bedtimeInstant = new Date(wakeTimeInstant.getTime() - durationMinutes * 60 * 1000);
  return {
    dateKey,
    bedtime: bedtimeInstant,
    wakeTime: wakeTimeInstant,
    durationMinutes,
  };
}

/** Build a session from two full ISO timestamps (advanced/corrected entry). */
function computeSessionFromInstants({ dateKey, bedtime, wakeTime }) {
  const bed = new Date(bedtime);
  const wake = new Date(wakeTime);
  if (Number.isNaN(bed.getTime()) || Number.isNaN(wake.getTime())) {
    throw badRequest('Bedtime and wake-up must be valid timestamps');
  }
  let duration = Math.round((wake.getTime() - bed.getTime()) / 60000);
  if (duration <= 0) {
    // Crossed midnight: interpret the wake time as the following day.
    duration += 1440;
  }
  if (duration <= 0 || duration > 18 * 60) {
    throw badRequest('Sleep duration must be between 1 minute and 18 hours');
  }
  const key = isValidDateKey(dateKey) ? dateKey : currentDateKey(wake);
  return { dateKey: key, bedtime: bed, wakeTime: wake, durationMinutes: duration };
}

async function addEntry(userId, payload, challenge) {
  const quality = SLEEP_QUALITIES.some((q) => q.value === payload.quality) ? payload.quality : 'average';
  const session = payload.bedtime && payload.wakeTime
    ? computeSessionFromInstants(payload)
    : computeSession(payload);
  if (isFutureDateKey(session.dateKey)) throw badRequest('Sleep cannot be logged for a future day');

  if (payload.clientId) {
    const existing = await SleepEntry.findOne({ userId, clientId: payload.clientId });
    if (existing) return { entry: existing, duplicate: true };
  }
  try {
    const entry = await SleepEntry.create({
      userId,
      ...session,
      quality,
      notes: payload.notes || '',
      clientId: payload.clientId || undefined,
    });
    return { entry, duplicate: false, targetMinutes: challenge?.targets?.sleepMinutes || 480 };
  } catch (error) {
    if (error?.code === 11000 && payload.clientId) {
      const existing = await SleepEntry.findOne({ userId, clientId: payload.clientId });
      if (existing) return { entry: existing, duplicate: true };
    }
    throw error;
  }
}

async function deleteEntry(userId, id) {
  const deleted = await SleepEntry.findOneAndDelete({ _id: id, userId });
  if (!deleted) throw notFound('Sleep entry not found');
  return deleted;
}

async function listDay(userId, dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  const entries = await SleepEntry.find({ userId, dateKey }).sort({ bedtime: 1 }).lean();
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const scored = entries.filter((entry) => QUALITY_SCORE[entry.quality]);
  const avgQualityScore = scored.length
    ? Math.round((scored.reduce((sum, entry) => sum + QUALITY_SCORE[entry.quality], 0) / scored.length) * 10) / 10
    : null;
  return {
    entries,
    totalMinutes,
    sessionCount: entries.length,
    avgQualityScore,
    qualityLabel: avgQualityScore ? qualityLabelForScore(avgQualityScore) : null,
  };
}

function qualityLabelForScore(score) {
  const rounded = Math.round(score);
  const match = SLEEP_QUALITIES.find((q) => q.score === rounded);
  return match ? match.label : null;
}

async function getRangeDailyTotals(userId, fromKey, toKey) {
  const keys = dateKeyRange(fromKey, toKey);
  const rows = await SleepEntry.aggregate([
    { $match: { userId, dateKey: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: '$dateKey',
        minutes: { $sum: '$durationMinutes' },
        sessions: { $sum: 1 },
      },
    },
  ]);
  const map = new Map(rows.map((row) => [row._id, row]));
  return keys.map((key) => ({
    dateKey: key,
    minutes: map.get(key)?.minutes || 0,
    sessions: map.get(key)?.sessions || 0,
    recorded: Boolean(map.get(key)),
  }));
}

/** Consistency = recorded nights inside ±60 min of the target. */
function consistency(dayTotals, targetMinutes) {
  const recorded = dayTotals.filter((day) => day.recorded);
  if (!recorded.length) {
    return { recordedNights: 0, avgMinutes: 0, onTargetNights: 0, consistencyPercent: 0 };
  }
  const onTarget = recorded.filter((day) => Math.abs(day.minutes - targetMinutes) <= 60).length;
  return {
    recordedNights: recorded.length,
    avgMinutes: Math.round(recorded.reduce((sum, day) => sum + day.minutes, 0) / recorded.length),
    onTargetNights: onTarget,
    consistencyPercent: Math.round((onTarget / recorded.length) * 1000) / 10,
  };
}

async function getHistory(userId, days = 14) {
  const endKey = currentDateKey();
  const startKey = addDays(endKey, -(days - 1));
  return getRangeDailyTotals(userId, startKey, endKey);
}

module.exports = {
  computeSession,
  computeSessionFromInstants,
  addEntry,
  deleteEntry,
  listDay,
  getRangeDailyTotals,
  consistency,
  getHistory,
  qualityLabelForScore,
};
