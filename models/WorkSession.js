'use strict';

const mongoose = require('mongoose');
const { WORK_CATEGORIES } = require('../config/constants');
const { isValidDateKey, isValidTimeString } = require('../utils/date');

const workSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    startTime: {
      type: String,
      required: true,
      validate: { validator: isValidTimeString, message: 'startTime must be HH:MM' },
    },
    durationMinutes: { type: Number, required: true, min: 5, max: 480 },
    category: { type: String, enum: WORK_CATEGORIES, default: 'Coding' },
    project: { type: String, trim: true, maxlength: 80, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    /** Productive minutes this session contributed to the 24-hour tracker. */
    allocatedMinutes: { type: Number, default: 0, min: 0 },
    /** Exact hour/minute allocation so a delete can be reversed cleanly. */
    allocations: {
      type: [
        {
          _id: false,
          hour: { type: Number, min: 0, max: 23 },
          minutes: { type: Number, min: 1, max: 60 },
        },
      ],
      default: [],
    },
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

workSessionSchema.index({ userId: 1, dateKey: 1 });
workSessionSchema.index({ userId: 1, category: 1, dateKey: -1 });
workSessionSchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

module.exports = mongoose.model('WorkSession', workSessionSchema);
