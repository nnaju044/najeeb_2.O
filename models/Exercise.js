'use strict';

const mongoose = require('mongoose');
const { MUSCLE_GROUPS } = require('../config/constants');

const exerciseSchema = new mongoose.Schema(
  {
    /** null => shared starter exercise. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameLower: { type: String },
    muscleGroup: { type: String, enum: MUSCLE_GROUPS, default: 'Full body' },
    equipment: { type: String, trim: true, maxlength: 60, default: '' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true }
);

exerciseSchema.index({ nameLower: 1 });

exerciseSchema.pre('validate', function setNameLower(next) {
  if (this.name) this.nameLower = this.name.toLowerCase().trim();
  next();
});

module.exports = mongoose.model('Exercise', exerciseSchema);
