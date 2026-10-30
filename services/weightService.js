'use strict';

const WeightEntry = require('../models/WeightEntry');
const { isValidDateKey, isFutureDateKey, addDays } = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/** One record per calendar day: recording twice the same day updates it. */
async function saveEntry(userId, payload) {
  if (!isValidDateKey(payload.dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(payload.dateKey)) throw badRequest('Weight cannot be recorded for a future day');
  const weightKg = Number(payload.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) {
    throw badRequest('Weight must be between 20 and 400 kg');
  }

  if (payload.clientId) {
    const existing = await WeightEntry.findOne({ userId, clientId: payload.clientId });
    if (existing) return { entry: existing, duplicate: true, updated: false };
  }

  const update = {
    weightKg: round1(weightKg),
    notes: payload.notes || '',
    clientId: payload.clientId || undefined,
  };
  if (payload.heightCm !== undefined) update.heightCm = payload.heightCm ? Number(payload.heightCm) : null;
  if (payload.bodyFatPct !== undefined) update.bodyFatPct = payload.bodyFatPct ? Number(payload.bodyFatPct) : null;
  if (payload.waistCm !== undefined) update.waistCm = payload.waistCm ? Number(payload.waistCm) : null;

  const existing = await WeightEntry.findOne({ userId, dateKey: payload.dateKey });
  if (existing) {
    Object.assign(existing, update);
    await existing.save();
    return { entry: existing, duplicate: false, updated: true };
  }

  try {
    const entry = await WeightEntry.create({ userId, dateKey: payload.dateKey, ...update });
    return { entry, duplicate: false, updated: false };
  } catch (error) {
    if (error?.code === 11000) {
      // Concurrent write for the same day: merge into the winner.
      const winner = await WeightEntry.findOneAndUpdate(
        { userId, dateKey: payload.dateKey },
        { $set: update },
        { new: true, runValidators: true }
      );
      return { entry: winner, duplicate: false, updated: true };
    }
    throw error;
  }
}

async function deleteEntry(userId, id) {
  const deleted = await WeightEntry.findOneAndDelete({ _id: id, userId });
  if (!deleted) throw notFound('Weight entry not found');
  return deleted;
}

async function getSeries(userId, fromKey, toKey) {
  return WeightEntry.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } })
    .sort({ dateKey: 1 })
    .lean();
}

async function getSummary(userId, days = 30) {
  const all = await WeightEntry.find({ userId }).sort({ dateKey: 1 }).lean();
  if (!all.length) {
    return { latest: null, previous: null, changeKg: null, weeklyAverage: null, entries: [], bmi: null };
  }
  const latest = all[all.length - 1];
  const previous = all.length > 1 ? all[all.length - 2] : null;
  const sevenDaysAgo = addDays(latest.dateKey, -6);
  const week = all.filter((entry) => entry.dateKey >= sevenDaysAgo && entry.dateKey <= latest.dateKey);
  const weeklyAverage = week.length
    ? round1(week.reduce((sum, entry) => sum + entry.weightKg, 0) / week.length)
    : null;
  const heightCm = [...all].reverse().find((entry) => entry.heightCm)?.heightCm || null;
  const bmi = heightCm ? round1(latest.weightKg / (heightCm / 100) ** 2) : null;
  return {
    latest,
    previous,
    changeKg: previous ? round1(latest.weightKg - previous.weightKg) : null,
    weeklyAverage,
    heightCm,
    bmi,
    entries: all.slice(-Math.max(1, days * 3)),
  };
}

module.exports = { saveEntry, deleteEntry, getSeries, getSummary };
