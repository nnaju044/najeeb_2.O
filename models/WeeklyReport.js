'use strict';

const mongoose = require('mongoose');
const { isValidDateKey } = require('../utils/date');

const weeklyReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekNumber: { type: Number, required: true, min: 1, max: 13 },
    startDate: { type: String, required: true, validate: { validator: isValidDateKey } },
    endDate: { type: String, required: true, validate: { validator: isValidDateKey } },
    daysElapsed: { type: Number, default: 0, min: 0, max: 7 },
    trackedDays: { type: Number, default: 0, min: 0, max: 7 },
    productivityScore: { type: Number, default: 0, min: 0, max: 100 },
    achievementPercent: { type: Number, default: 0, min: 0, max: 100 },
    improvementPct: { type: Number, default: null },
    bestDay: { type: mongoose.Schema.Types.Mixed, default: null },
    weakestDay: { type: mongoose.Schema.Types.Mixed, default: null },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    insights: { type: [String], default: [] },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

weeklyReportSchema.index({ userId: 1, weekNumber: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyReport', weeklyReportSchema);
