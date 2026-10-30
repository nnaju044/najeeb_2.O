'use strict';

const mongoose = require('mongoose');
const { MEAL_TYPES } = require('../config/constants');

const favoriteMealSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    mealType: { type: String, enum: MEAL_TYPES, default: 'breakfast' },
    items: {
      type: [
        {
          foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', default: null },
          name: { type: String, required: true, trim: true, maxlength: 120 },
          servingLabel: { type: String, default: '1 serving', trim: true, maxlength: 60 },
          servings: { type: Number, required: true, min: 0.1, max: 30 },
          calories: { type: Number, required: true, min: 0, max: 5000 },
          protein: { type: Number, required: true, min: 0, max: 300 },
          carbs: { type: Number, required: true, min: 0, max: 600 },
          fat: { type: Number, required: true, min: 0, max: 300 },
        },
      ],
      validate: [(items) => items.length > 0 && items.length <= 30, 'A favourite needs 1-30 items'],
    },
    totals: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
    },
    useCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

favoriteMealSchema.index({ userId: 1, name: 1 });

favoriteMealSchema.pre('validate', function recalc(next) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of this.items || []) {
    totals.calories += (item.calories || 0) * (item.servings || 0);
    totals.protein += (item.protein || 0) * (item.servings || 0);
    totals.carbs += (item.carbs || 0) * (item.servings || 0);
    totals.fat += (item.fat || 0) * (item.servings || 0);
  }
  this.totals = {
    calories: Math.round(totals.calories * 10) / 10,
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
  next();
});

module.exports = mongoose.model('FavoriteMeal', favoriteMealSchema);
