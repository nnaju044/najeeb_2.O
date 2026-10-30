'use strict';

const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema(
  {
    /** null => shared starter food available to every account. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameLower: { type: String, required: true },
    servingLabel: { type: String, required: true, trim: true, maxlength: 60, default: '1 serving' },
    calories: { type: Number, required: true, min: 0, max: 5000 },
    protein: { type: Number, required: true, min: 0, max: 300 },
    carbs: { type: Number, required: true, min: 0, max: 600 },
    fat: { type: Number, required: true, min: 0, max: 300 },
    category: { type: String, default: 'other', trim: true, maxlength: 40 },
    isApproximate: { type: Boolean, default: true },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true }
);

foodSchema.index({ userId: 1, nameLower: 1 });
foodSchema.index({ nameLower: 'text' });

foodSchema.pre('validate', function setNameLower(next) {
  if (this.name) this.nameLower = this.name.toLowerCase().trim();
  next();
});

module.exports = mongoose.model('Food', foodSchema);
