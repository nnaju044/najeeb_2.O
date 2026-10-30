'use strict';

const mongoose = require('mongoose');
const { isValidDateKey } = require('../utils/date');

const waterEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    amountMl: {
      type: Number,
      required: true,
      min: [1, 'Amount must be at least 1 ml'],
      max: [5000, 'A single water entry cannot exceed 5,000 ml'],
      validate: { validator: Number.isInteger, message: 'Amount must be a whole number of ml' },
    },
    loggedAt: { type: Date, default: Date.now },
    /** Client-generated id so offline replays never double-count an entry. */
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

waterEntrySchema.index({ userId: 1, dateKey: 1, loggedAt: 1 });
waterEntrySchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

module.exports = mongoose.model('WaterEntry', waterEntrySchema);
