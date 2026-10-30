'use strict';

const WaterEntry = require('../models/WaterEntry');
const { isValidDateKey, isFutureDateKey, dateKeyRange } = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');

function validateDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  return dateKey;
}

/**
 * Add water. `clientId` makes the write idempotent, so an offline retry or a
 * double-tap can never count the same drink twice.
 */
async function addEntry(userId, { dateKey, amountMl, clientId, loggedAt }) {
  validateDate(dateKey);
  if (isFutureDateKey(dateKey)) throw badRequest('Water cannot be logged for a future day');
  const amount = Math.round(Number(amountMl));
  if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
    throw badRequest('Water amount must be between 1 and 5,000 ml');
  }
  if (clientId) {
    const existing = await WaterEntry.findOne({ userId, clientId });
    if (existing) return { entry: existing, duplicate: true };
  }
  try {
    const entry = await WaterEntry.create({
      userId,
      dateKey,
      amountMl: amount,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      clientId: clientId || undefined,
    });
    return { entry, duplicate: false };
  } catch (error) {
    if (error?.code === 11000 && clientId) {
      const existing = await WaterEntry.findOne({ userId, clientId });
      if (existing) return { entry: existing, duplicate: true };
    }
    throw error;
  }
}

async function listDay(userId, dateKey) {
  validateDate(dateKey);
  const entries = await WaterEntry.find({ userId, dateKey }).sort({ loggedAt: -1 }).lean();
  const totalMl = entries.reduce((sum, entry) => sum + entry.amountMl, 0);
  return { entries, totalMl, count: entries.length };
}

async function removeEntry(userId, entryId) {
  const deleted = await WaterEntry.findOneAndDelete({ _id: entryId, userId });
  if (!deleted) throw notFound('Water entry not found');
  return deleted;
}

async function undoLast(userId, dateKey) {
  validateDate(dateKey);
  const last = await WaterEntry.findOne({ userId, dateKey }).sort({ loggedAt: -1, createdAt: -1 });
  if (!last) throw notFound('No water entry to undo');
  await last.deleteOne();
  return last;
}

function summarize(totalMl, targetMl, entries = []) {
  const target = Number(targetMl) || 2500;
  const percent = target > 0 ? Math.min(100, Math.round((totalMl / target) * 1000) / 10) : 0;
  return {
    totalMl,
    targetMl: target,
    remainingMl: Math.max(0, target - totalMl),
    percent,
    overTarget: totalMl > target,
    entryCount: entries.length,
    entries,
  };
}

/** Daily totals (with zero-filled days) for charts and weekly reports. */
async function getRangeDailyTotals(userId, fromKey, toKey) {
  const keys = dateKeyRange(fromKey, toKey);
  const rows = await WaterEntry.aggregate([
    { $match: { userId, dateKey: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: '$dateKey',
        totalMl: { $sum: '$amountMl' },
        count: { $sum: 1 },
      },
    },
  ]);
  const map = new Map(rows.map((row) => [row._id, row]));
  return keys.map((key) => ({
    dateKey: key,
    totalMl: map.get(key)?.totalMl || 0,
    count: map.get(key)?.count || 0,
  }));
}

module.exports = { addEntry, listDay, removeEntry, undoLast, summarize, getRangeDailyTotals };
