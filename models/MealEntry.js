'use strict';

const mongoose = require('mongoose');
const { MEAL_TYPES } = require('../config/constants');
const { isValidDateKey } = require('../utils/date');

const mealItemSchema = new mongoose.Schema(
  {
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    servingLabel: { type: String, default: '1 serving', trim: true, maxlength: 60 },
    servings: { type: Number, required: true, min: 0.1, max: 30 },
    // Snapshot per *serving* (backend multiplies by servings for totals).
    calories: { type: Number, required: true, min: 0, max: 5000 },
    protein: { type: Number, required: true, min: 0, max: 300 },
    carbs: { type: Number, required: true, min: 0, max: 600 },
    fat: { type: Number, required: true, min: 0, max: 300 },
  },
  { _id: false }
);

const totalsSchema = new mongoose.Schema(
  {
    calories: { type: Number, default: 0, min: 0 },
    protein: { type: Number, default: 0, min: 0 },
    carbs: { type: Number, default: 0, min: 0 },
    fat: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const mealEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    mealType: { type: String, enum: MEAL_TYPES, default: 'breakfast' },
    items: {
      type: [mealItemSchema],
      validate: [(items) => items.length > 0 && items.length <= 30, 'A meal needs 1-30 items'],
    },
    totals: { type: totalsSchema, default: () => ({}) },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

mealEntrySchema.index({ userId: 1, dateKey: 1 });
mealEntrySchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

/** Recalculate totals server-side; never trust the client's math. */
mealEntrySchema.pre('validate', function recalcTotals(next) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of this.items || []) {
    const servings = Number(item.servings) || 0;
    totals.calories += (Number(item.calories) || 0) * servings;
    totals.protein += (Number(item.protein) || 0) * servings;
    totals.carbs += (Number(item.carbs) || 0) * servings;
    totals.fat += (Number(item.fat) || 0) * servings;
  }
  this.totals = {
    calories: Math.round(totals.calories * 10) / 10,
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
  next();
});

module.exports = mongoose.model('MealEntry', mealEntrySchema);
