'use strict';

const mongoose = require('mongoose');

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

const prayerEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'dateKey must be YYYY-MM-DD'],
    },
    prayerName: {
      type: String,
      required: true,
      enum: PRAYER_NAMES,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate entries for the same user, date, and prayer
prayerEntrySchema.index({ userId: 1, dateKey: 1, prayerName: 1 }, { unique: true });
prayerEntrySchema.index({ userId: 1, dateKey: 1 });

module.exports = {
  PrayerEntry: mongoose.model('PrayerEntry', prayerEntrySchema),
  PRAYER_NAMES,
};
