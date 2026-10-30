'use strict';

const mongoose = require('mongoose');
const { isValidDateKey, MINUTES_PER_DAY, HOURS_PER_DAY } = require('../utils/date');

/**
 * One document per tracked clock hour (0-23) per user per day.
 *
 * Invariants enforced here and in timeService:
 *  - every bucket is 0..60 whole minutes
 *  - productive + unproductive + rest + sleep <= 60
 *  - at most 24 documents per (user, day)  => at most 1,440 accounted minutes
 * Unclassified minutes are never stored; they are derived as 60 - sum(buckets).
 */
const hourlyTimeLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    hour: {
      type: Number,
      required: true,
      min: [0, 'Hour must be 0-23'],
      max: [HOURS_PER_DAY - 1, 'Hour must be 0-23'],
      validate: { validator: Number.isInteger, message: 'Hour must be a whole number' },
    },
    productive: { type: Number, default: 0, min: 0, max: 60 },
    unproductive: { type: Number, default: 0, min: 0, max: 60 },
    rest: { type: Number, default: 0, min: 0, max: 60 },
    sleep: { type: Number, default: 0, min: 0, max: 60 },
    source: {
      type: String,
      enum: ['manual', 'work_session', 'sleep', 'copy'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

hourlyTimeLogSchema.index({ userId: 1, dateKey: 1, hour: 1 }, { unique: true });
hourlyTimeLogSchema.index({ userId: 1, dateKey: 1 });

hourlyTimeLogSchema.pre('validate', function checkTotal(next) {
  const buckets = [this.productive, this.unproductive, this.rest, this.sleep].map((value) =>
    Number.isFinite(value) ? value : 0
  );
  if (buckets.some((value) => value < 0 || value > 60 || !Number.isInteger(value))) {
    return next(new Error('Every time bucket must be a whole number between 0 and 60 minutes'));
  }
  const total = buckets.reduce((sum, value) => sum + value, 0);
  if (total > 60) {
    return next(new Error(`An hour cannot exceed 60 minutes (received ${total})`));
  }
  const dayTotal = total;
  if (dayTotal > MINUTES_PER_DAY) {
    return next(new Error('A day cannot exceed 1,440 minutes'));
  }
  return next();
});

hourlyTimeLogSchema.methods.unclassified = function unclassified() {
  return 60 - (this.productive + this.unproductive + this.rest + this.sleep);
};

hourlyTimeLogSchema.methods.minutesTotal = function minutesTotal() {
  return this.productive + this.unproductive + this.rest + this.sleep;
};

module.exports = mongoose.model('HourlyTimeLog', hourlyTimeLogSchema);
