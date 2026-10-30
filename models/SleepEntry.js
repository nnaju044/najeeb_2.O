'use strict';

const mongoose = require('mongoose');
const { SLEEP_QUALITIES } = require('../config/constants');
const { isValidDateKey } = require('../utils/date');

const QUALITY_VALUES = SLEEP_QUALITIES.map((q) => q.value);

/**
 * A sleep session. `dateKey` is the *morning* the user woke up on (the day the
 * sleep belongs to). Timestamps are real UTC instants, so a session that starts
 * at 23:30 and ends at 07:00 next morning is stored and summed correctly.
 */
const sleepEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    bedtime: { type: Date, required: true },
    wakeTime: { type: Date, required: true },
    durationMinutes: {
      type: Number,
      required: true,
      min: [1, 'Sleep must be at least one minute'],
      max: [18 * 60, 'A single sleep session cannot exceed 18 hours'],
    },
    quality: { type: String, enum: ['very_poor', 'poor', 'average', 'good', 'excellent', ''], default: 'average' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

sleepEntrySchema.index({ userId: 1, dateKey: 1 });
sleepEntrySchema.index({ userId: 1, bedtime: -1 });
sleepEntrySchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

sleepEntrySchema.statics.QUALITY_VALUES = QUALITY_VALUES;

module.exports = mongoose.model('SleepEntry', sleepEntrySchema);
