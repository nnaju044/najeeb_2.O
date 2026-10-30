'use strict';

const mongoose = require('mongoose');
const { isValidDateKey } = require('../utils/date');

const dailyLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    dayNumber: { type: Number, min: 0, max: 400, default: 0 },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    mood: {
      type: String,
      enum: ['great', 'good', 'okay', 'low', ''],
      default: '',
    },
  },
  { timestamps: true }
);

dailyLogSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('DailyLog', dailyLogSchema);
