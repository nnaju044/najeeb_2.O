'use strict';

const DailyLog = require('../models/DailyLog');
const { isValidDateKey, isFutureDateKey } = require('../utils/date');
const { badRequest } = require('../utils/httpError');

const MOODS = ['great', 'good', 'okay', 'low', ''];

function validateDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(dateKey)) throw badRequest('You cannot write notes for a future day');
  return dateKey;
}

/** Upsert the free-form note for a day (one document per user per day). */
async function saveNote(userId, { dateKey, notes = '', mood = '' }) {
  validateDate(dateKey);
  if (!MOODS.includes(mood)) throw badRequest('Choose a valid mood');
  const clean = String(notes || '').slice(0, 2000);
  const log = await DailyLog.findOneAndUpdate(
    { userId, dateKey },
    { $set: { notes: clean, mood } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return log;
}

async function getNote(userId, dateKey) {
  if (!isValidDateKey(dateKey)) return null;
  return DailyLog.findOne({ userId, dateKey }).lean();
}

module.exports = { MOODS, saveNote, getNote };
