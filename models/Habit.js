'use strict';

const mongoose = require('mongoose');
const { isValidDateKey } = require('../utils/date');

const habitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, trim: true, maxlength: 40, default: 'circle-check' },
    category: { type: String, trim: true, maxlength: 30, default: 'routine' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    /** Soft-delete marker: history of removed habits is preserved. */
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

habitSchema.index({ userId: 1, isActive: 1, sortOrder: 1 });

const completionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Habit', required: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    status: { type: String, enum: ['done', 'skipped', 'na'], default: 'done' },
  },
  { timestamps: true }
);

completionSchema.index({ userId: 1, habitId: 1, dateKey: 1 }, { unique: true });
completionSchema.index({ userId: 1, dateKey: 1 });

const Habit = mongoose.model('Habit', habitSchema);
const HabitCompletion = mongoose.model('HabitCompletion', completionSchema);

module.exports = { Habit, HabitCompletion };
