'use strict';

const mongoose = require('mongoose');
const { isValidDateKey } = require('../utils/date');

const weightEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    weightKg: { type: Number, required: true, min: 20, max: 400 },
    heightCm: { type: Number, min: 80, max: 260, default: null },
    bodyFatPct: { type: Number, min: 3, max: 70, default: null },
    waistCm: { type: Number, min: 30, max: 250, default: null },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

/** One body-weight record per calendar day. */
weightEntrySchema.index({ userId: 1, dateKey: 1 }, { unique: true });
weightEntrySchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

module.exports = mongoose.model('WeightEntry', weightEntrySchema);
