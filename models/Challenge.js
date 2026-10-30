'use strict';

const mongoose = require('mongoose');
const { DEFAULT_TARGETS, CHALLENGE_DURATION_DAYS } = require('../config/constants');
const { isValidDateKey } = require('../utils/date');

const targetsSchema = new mongoose.Schema(
  {
    waterMl: { type: Number, min: 500, max: 6000, default: DEFAULT_TARGETS.waterMl },
    proteinG: { type: Number, min: 20, max: 300, default: DEFAULT_TARGETS.proteinG },
    calories: { type: Number, min: 1000, max: 6000, default: DEFAULT_TARGETS.calories },
    sleepMinutes: { type: Number, min: 240, max: 780, default: DEFAULT_TARGETS.sleepMinutes },
    workoutsPerWeek: { type: Number, min: 0, max: 7, default: DEFAULT_TARGETS.workoutsPerWeek },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    startDate: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'startDate must be a YYYY-MM-DD date' },
    },
    durationDays: { type: Number, default: CHALLENGE_DURATION_DAYS, min: 7, max: 365 },
    targets: { type: targetsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Challenge', challengeSchema);
