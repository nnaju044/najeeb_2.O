'use strict';

const HourlyTimeLog = require('../models/HourlyTimeLog');
const {
  MINUTES_PER_DAY,
  HOURS_PER_DAY,
  hourRangeLabel,
  diffDays,
  dateKeyRange,
  isValidDateKey,
  isFutureDateKey,
} = require('../utils/date');
const { badRequest } = require('../utils/httpError');

const BUCKETS = ['productive', 'unproductive', 'rest', 'sleep'];

const PERIODS = [
  { key: 'night', label: 'Night (9 PM – 5 AM)', hours: [21, 22, 23, 0, 1, 2, 3, 4] },
  { key: 'morning', label: 'Morning (5 AM – 12 PM)', hours: [5, 6, 7, 8, 9, 10, 11] },
  { key: 'afternoon', label: 'Afternoon (12 – 5 PM)', hours: [12, 13, 14, 15, 16] },
  { key: 'evening', label: 'Evening (5 – 9 PM)', hours: [17, 18, 19, 20] },
];

function toInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}

/** Normalise and validate the four buckets for a single hour. */
function normalizeBuckets(input = {}) {
  const buckets = {};
  for (const key of BUCKETS) {
    const value = toInteger(input[key] ?? 0);
    if (value < 0 || value > 60) {
      throw badRequest(`${key} minutes must be between 0 and 60`);
    }
    buckets[key] = value;
  }
  const total = BUCKETS.reduce((sum, key) => sum + buckets[key], 0);
  if (total > 60) {
    throw badRequest(`That hour adds up to ${total} minutes. An hour can only hold 60.`);
  }
  return { ...buckets, total, unclassified: 60 - total };
}

function validateHour(hour) {
  const value = toInteger(hour, NaN);
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw badRequest('Hour must be between 0 and 23');
  }
  return value;
}

function validateDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  return dateKey;
}

/**
 * Upsert a single hour. The unique index on (userId, dateKey, hour) guarantees
 * one record per hour, so the day can never exceed 24 × 60 = 1,440 minutes.
 */
async function saveHour(userId, { dateKey, hour, buckets, source = 'manual' }) {
  validateDateKey(dateKey);
  if (isFutureDateKey(dateKey)) throw badRequest('You cannot record hours in the future');
  const safeHour = validateHour(hour);
  const normalized = normalizeBuckets(buckets);
  const update = {
    productive: normalized.productive,
    unproductive: normalized.unproductive,
    rest: normalized.rest,
    sleep: normalized.sleep,
    source,
  };

  try {
    const doc = await HourlyTimeLog.findOneAndUpdate(
      { userId, dateKey, hour: safeHour },
      { $set: update, $setOnInsert: { userId, dateKey, hour: safeHour } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (normalized.total === 0) {
      // Clearing an hour removes the record entirely, keeping "untracked" honest.
      await HourlyTimeLog.deleteOne({ _id: doc._id });
      return { hour: safeHour, cleared: true, buckets: { ...normalized } };
    }
    return { hour: safeHour, cleared: false, buckets: { ...normalized }, log: doc };
  } catch (error) {
    if (error?.code === 11000) {
      const doc = await HourlyTimeLog.findOneAndUpdate(
        { userId, dateKey, hour: safeHour },
        { $set: update },
        { new: true, runValidators: true }
      );
      return { hour: safeHour, cleared: false, buckets: { ...normalized }, log: doc };
    }
    throw error;
  }
}

/** Mark a whole hour as sleep (clears the other buckets). */
async function markSleepHour(userId, { dateKey, hour }) {
  return saveHour(userId, {
    dateKey,
    hour,
    buckets: { productive: 0, unproductive: 0, rest: 0, sleep: 60 },
    source: 'sleep',
  });
}

async function clearHour(userId, { dateKey, hour }) {
  validateDateKey(dateKey);
  const safeHour = validateHour(hour);
  await HourlyTimeLog.deleteOne({ userId, dateKey, hour: safeHour });
  return { hour: safeHour, cleared: true };
}

async function clearDay(userId, dateKey) {
  validateDateKey(dateKey);
  const result = await HourlyTimeLog.deleteMany({ userId, dateKey });
  return { deleted: result.deletedCount || 0 };
}

async function getLogs(userId, dateKey) {
  validateDateKey(dateKey);
  return HourlyTimeLog.find({ userId, dateKey }).sort({ hour: 1 }).lean();
}

/**
 * Full accounting for one day. Untracked minutes are reported separately and
 * are never folded into "unproductive".
 */
function buildDaySummary(logs, dateKey) {
  const byHour = new Map(logs.map((log) => [log.hour, log]));
  const totals = { productive: 0, unproductive: 0, rest: 0, sleep: 0 };

  const hours = Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
    const log = byHour.get(hour);
    const buckets = {
      productive: log?.productive || 0,
      unproductive: log?.unproductive || 0,
      rest: log?.rest || 0,
      sleep: log?.sleep || 0,
    };
    const total = BUCKETS.reduce((sum, key) => sum + buckets[key], 0);
    for (const key of BUCKETS) totals[key] += buckets[key];
    return {
      hour,
      label: hourRangeLabel(hour),
      ...buckets,
      total,
      unclassified: 60 - total,
      tracked: Boolean(log),
    };
  });

  const recordedMinutes = BUCKETS.reduce((sum, key) => sum + totals[key], 0);
  const unclassifiedMinutes = MINUTES_PER_DAY - recordedMinutes;
  const awakeRecorded = recordedMinutes - totals.sleep;

  const percentOfRecorded = (value) =>
    recordedMinutes > 0 ? Math.round((value / recordedMinutes) * 1000) / 10 : 0;
  const percentOfDay = (value) => Math.round((value / MINUTES_PER_DAY) * 1000) / 10;

  const trackedHours = hours.filter((h) => h.tracked);
  const best = trackedHours.reduce(
    (acc, h) => (h.productive > (acc?.productive ?? -1) ? h : acc),
    null
  );
  const worst = trackedHours.reduce(
    (acc, h) => (h.productive < (acc?.productive ?? Infinity) ? h : acc),
    null
  );

  const periodTotals = PERIODS.map((period) => {
    const productive = period.hours.reduce((sum, hour) => sum + (byHour.get(hour)?.productive || 0), 0);
    const minutes = period.hours.reduce((sum, hour) => {
      const log = byHour.get(hour);
      return (
        sum +
        (log ? log.productive + log.unproductive + log.rest + log.sleep : 0)
      );
    }, 0);
    return { ...period, productive, tracked: minutes > 0 };
  }).filter((period) => period.tracked);

  const topPeriod = periodTotals.reduce(
    (acc, period) => (period.productive > (acc?.productive ?? -1) ? period : acc),
    null
  );

  return {
    dateKey,
    hours,
    totals,
    minutes: totals,
    recordedMinutes,
    unclassifiedMinutes,
    awakeRecorded,
    accountedPercent: percentOfDay(recordedMinutes),
    sleepPercent: percentOfDay(totals.sleep),
    productivePercent: percentOfRecorded(totals.productive),
    unproductivePercent: percentOfRecorded(totals.unproductive),
    restPercent: percentOfRecorded(totals.rest),
    sleepOfRecordedPercent: percentOfRecorded(totals.sleep),
    productiveMinutesOfDay: percentOfDay(totals.productive),
    trackedHourCount: trackedHours.length,
    bestHour: best ? { hour: best.hour, label: best.label, productive: best.productive } : null,
    worstHour: worst ? { hour: worst.hour, label: worst.label, productive: worst.productive } : null,
    bestPeriod: topPeriod ? { key: topPeriod.key, label: topPeriod.label, productive: topPeriod.productive } : null,
    isFullyTracked: recordedMinutes === MINUTES_PER_DAY,
    isEmpty: recordedMinutes === 0,
  };
}

async function getDaySummary(userId, dateKey) {
  const logs = await getLogs(userId, dateKey);
  return buildDaySummary(logs, dateKey);
}

/** Aggregate totals for a date range, used by charts and reports. */
async function getRangeDailyTotals(userId, fromKey, toKey) {
  if (!isValidDateKey(fromKey) || !isValidDateKey(toKey)) throw badRequest('Invalid date range');
  const keys = dateKeyRange(fromKey, toKey);
  const logs = await HourlyTimeLog.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).lean();
  const map = new Map(keys.map((key) => [key, { dateKey: key, productive: 0, unproductive: 0, rest: 0, sleep: 0, recorded: 0, trackedHours: 0 }]));
  for (const log of logs) {
    const row = map.get(log.dateKey);
    if (!row) continue;
    row.productive += log.productive || 0;
    row.unproductive += log.unproductive || 0;
    row.rest += log.rest || 0;
    row.sleep += log.sleep || 0;
    row.recorded += (log.productive || 0) + (log.unproductive || 0) + (log.rest || 0) + (log.sleep || 0);
    row.trackedHours += 1;
  }
  return keys.map((key) => map.get(key));
}

/**
 * Allocate focused-work minutes into the hourly tracker without ever
 * double-counting: minutes only fill *unclassified* capacity of the hours the
 * session actually covers. Returns how much was applied.
 */
async function allocateProductiveMinutes(userId, dateKey, startMinuteOfDay, durationMinutes) {
  validateDateKey(dateKey);
  const start = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(startMinuteOfDay)));
  const duration = Math.max(0, Math.min(MINUTES_PER_DAY - start, Math.round(durationMinutes)));
  if (duration === 0) return { allocated: 0, skipped: 0, hours: [] };

  const existing = new Map((await getLogs(userId, dateKey)).map((log) => [log.hour, log]));
  const originalProductive = new Map(
    [...existing.entries()].map(([hour, log]) => [hour, log.productive || 0])
  );
  const allocations = new Map();
  let remaining = duration;
  let cursor = start;
  let allocated = 0;
  // Minutes may only be attributed inside the real clock window of the session.
  const endMinute = Math.min(MINUTES_PER_DAY, start + duration);

  while (remaining > 0 && cursor < endMinute) {
    const hour = Math.floor(cursor / 60);
    const minuteInHour = cursor % 60;
    const overlap = Math.min(60 - minuteInHour, endMinute - cursor);
    const log = existing.get(hour);
    const currentTotal = log
      ? (log.productive || 0) + (log.unproductive || 0) + (log.rest || 0) + (log.sleep || 0)
      : 0;
    const capacity = Math.max(0, 60 - currentTotal);
    const take = Math.min(overlap, capacity, remaining);
    if (take > 0) {
      const entry = allocations.get(hour) || {
        productive: log?.productive || 0,
        unproductive: log?.unproductive || 0,
        rest: log?.rest || 0,
        sleep: log?.sleep || 0,
      };
      entry.productive += take;
      allocations.set(hour, entry);
      existing.set(hour, entry);
      allocated += take;
    }
    remaining -= take;
    cursor += overlap;
  }

  for (const [hour, buckets] of allocations) {
    await saveHour(userId, { dateKey, hour, buckets, source: 'work_session' });
  }

  return {
    allocated,
    skipped: duration - allocated,
    hours: [...allocations.entries()].map(([hour, buckets]) => ({
      hour,
      minutes: buckets.productive - (originalProductive.get(hour) || 0),
    })).filter((allocation) => allocation.minutes > 0),
  };
}

/** Copy tracked hours from one day into another (only empty hours are filled). */
async function copyDay(userId, { fromDateKey, toDateKey }) {
  validateDateKey(fromDateKey);
  validateDateKey(toDateKey);
  if (fromDateKey === toDateKey) throw badRequest('Pick a different day to copy from');
  const source = await getLogs(userId, fromDateKey);
  if (!source.length) throw badRequest('That day has no tracked hours to copy');
  const target = new Map((await getLogs(userId, toDateKey)).map((log) => [log.hour, log]));
  const operations = source
    .filter((log) => !target.has(log.hour))
    .map((log) => ({
      updateOne: {
        filter: { userId, dateKey: toDateKey, hour: log.hour },
        update: {
          $set: {
            productive: log.productive,
            unproductive: log.unproductive,
            rest: log.rest,
            sleep: log.sleep,
            source: 'copy',
          },
          $setOnInsert: { userId, dateKey: toDateKey, hour: log.hour },
        },
        upsert: true,
      },
    }));
  if (!operations.length) return { copied: 0 };
  await HourlyTimeLog.bulkWrite(operations, { ordered: false });
  return { copied: operations.length };
}

/** Day numbers inside the challenge for a date key, without a DB round trip. */
function dayNumberFromOffset(offset) {
  return Number.isFinite(offset) ? offset + 1 : 0;
}

module.exports = {
  BUCKETS,
  PERIODS,
  normalizeBuckets,
  saveHour,
  markSleepHour,
  clearHour,
  clearDay,
  getLogs,
  buildDaySummary,
  getDaySummary,
  getRangeDailyTotals,
  allocateProductiveMinutes,
  copyDay,
  dayNumberFromOffset,
  diffDays,
};
