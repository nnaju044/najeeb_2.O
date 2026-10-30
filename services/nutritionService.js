'use strict';

const Food = require('../models/Food');
const MealEntry = require('../models/MealEntry');
const FavoriteMeal = require('../models/FavoriteMeal');
const mongoose = require('mongoose');
const { badRequest, notFound } = require('../utils/httpError');
const { isValidDateKey, isFutureDateKey, dateKeyRange } = require('../utils/date');
const { MEAL_TYPES } = require('../config/constants');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

async function searchFoods(userId, query = '', limit = 25) {
  const filter = { $or: [{ userId: null }, { userId }] };
  if (query && query.trim()) {
    filter.nameLower = { $regex: escapeRegex(query.trim().toLowerCase()) };
  }
  const foods = await Food.find(filter)
    .sort({ isCustom: 1, name: 1 })
    .limit(Math.min(Math.max(Number(limit) || 25, 1), 100))
    .lean();
  return foods;
}

async function listFavorites(userId) {
  return FavoriteMeal.find({ userId }).sort({ useCount: -1, updatedAt: -1 }).limit(24).lean();
}

/** Foods the user actually eats, ranked by how often they were logged. */
async function getRecentFoods(userId, limit = 12) {
  const rows = await MealEntry.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    { $unwind: '$items' },
    { $match: { 'items.foodId': { $ne: null } } },
    {
      $group: {
        _id: '$items.foodId',
        name: { $first: '$items.name' },
        servingLabel: { $first: '$items.servingLabel' },
        calories: { $first: '$items.calories' },
        protein: { $first: '$items.protein' },
        carbs: { $first: '$items.carbs' },
        fat: { $first: '$items.fat' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: Math.min(Math.max(Number(limit) || 12, 1), 30) },
  ]);
  return rows.map((row) => ({
    _id: row._id,
    name: row.name,
    servingLabel: row.servingLabel,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    usageCount: row.count,
  }));
}

/**
 * Resolve submitted meal items against the food library (or accept an inline
 * custom food) and snapshot per-serving nutrition. Totals are always computed
 * by the model, never taken from the request.
 */
async function resolveItems(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('Add at least one food to the meal');
  }
  if (items.length > 30) throw badRequest('A meal can hold at most 30 foods');

  const resolved = [];
  for (const item of items) {
    const servings = Number(item.servings ?? 1);
    if (!Number.isFinite(servings) || servings <= 0 || servings > 30) {
      throw badRequest('Serving quantity must be between 0.1 and 30');
    }
    if (item.foodId) {
      const food = await Food.findOne({ _id: item.foodId, $or: [{ userId: null }, { userId }] }).lean();
      if (!food) throw badRequest('One of the selected foods no longer exists');
      resolved.push({
        foodId: food._id,
        name: food.name,
        servingLabel: food.servingLabel,
        servings,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      });
    } else {
      const name = String(item.name || '').trim();
      if (!name) throw badRequest('Custom food needs a name');
      const nutrients = ['calories', 'protein', 'carbs', 'fat'].map((key) => Number(item[key]));
      if (nutrients.some((value) => !Number.isFinite(value) || value < 0 || value > 5000)) {
        throw badRequest('Custom food nutrition values must be positive numbers');
      }
      resolved.push({
        foodId: null,
        name: name.slice(0, 120),
        servingLabel: String(item.servingLabel || '1 serving').slice(0, 60),
        servings,
        calories: nutrients[0],
        protein: nutrients[1],
        carbs: nutrients[2],
        fat: nutrients[3],
      });
    }
  }
  return resolved;
}

async function createMeal(userId, { dateKey, mealType, items, notes, clientId }) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(dateKey)) throw badRequest('Meals cannot be logged for a future day');
  if (!MEAL_TYPES.includes(mealType)) throw badRequest('Unknown meal type');
  if (clientId) {
    const existing = await MealEntry.findOne({ userId, clientId });
    if (existing) return { meal: existing, duplicate: true };
  }
  const resolved = await resolveItems(userId, items);
  try {
    const meal = await MealEntry.create({
      userId,
      dateKey,
      mealType,
      items: resolved,
      notes: notes || '',
      clientId: clientId || undefined,
    });
    return { meal, duplicate: false };
  } catch (error) {
    if (error?.code === 11000 && clientId) {
      const existing = await MealEntry.findOne({ userId, clientId });
      if (existing) return { meal: existing, duplicate: true };
    }
    throw error;
  }
}

async function deleteMeal(userId, mealId) {
  const deleted = await MealEntry.findOneAndDelete({ _id: mealId, userId });
  if (!deleted) throw notFound('Meal not found');
  return deleted;
}

async function listDay(userId, dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  const meals = await MealEntry.find({ userId, dateKey }).sort({ createdAt: 1 }).lean();
  const totals = meals.reduce(
    (acc, meal) => {
      acc.calories += meal.totals?.calories || 0;
      acc.protein += meal.totals?.protein || 0;
      acc.carbs += meal.totals?.carbs || 0;
      acc.fat += meal.totals?.fat || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    meals,
    totals: {
      calories: round1(totals.calories),
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat),
    },
  };
}

function summarize(totals, targets = {}) {
  const proteinTarget = Number(targets.proteinG) || 90;
  const calorieTarget = Number(targets.calories) || 2200;
  return {
    totals,
    proteinTarget,
    calorieTarget,
    proteinRemaining: Math.max(0, round1(proteinTarget - totals.protein)),
    caloriesRemaining: Math.max(0, Math.round(calorieTarget - totals.calories)),
    proteinPercent: Math.min(100, Math.round((totals.protein / proteinTarget) * 1000) / 10),
    caloriePercent: Math.min(100, Math.round((totals.calories / calorieTarget) * 1000) / 10),
  };
}

async function getRangeDailyTotals(userId, fromKey, toKey) {
  const keys = dateKeyRange(fromKey, toKey);
  const rows = await MealEntry.aggregate([
    { $match: { userId, dateKey: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: '$dateKey',
        calories: { $sum: '$totals.calories' },
        protein: { $sum: '$totals.protein' },
        carbs: { $sum: '$totals.carbs' },
        fat: { $sum: '$totals.fat' },
      },
    },
  ]);
  const map = new Map(rows.map((row) => [row._id, row]));
  return keys.map((key) => ({
    dateKey: key,
    calories: round1(map.get(key)?.calories || 0),
    protein: round1(map.get(key)?.protein || 0),
    carbs: round1(map.get(key)?.carbs || 0),
    fat: round1(map.get(key)?.fat || 0),
  }));
}

async function createCustomFood(userId, payload) {
  const name = String(payload.name || '').trim();
  if (!name) throw badRequest('Food name is required');
  const nutrients = ['calories', 'protein', 'carbs', 'fat'].map((key) => Number(payload[key]));
  if (nutrients.some((value) => !Number.isFinite(value) || value < 0 || value > 5000)) {
    throw badRequest('Nutrition values must be positive numbers');
  }
  const existing = await Food.findOne({ userId, nameLower: name.toLowerCase() });
  if (existing) throw badRequest('You already have a food with that name');
  return Food.create({
    userId,
    name,
    nameLower: name.toLowerCase(),
    servingLabel: String(payload.servingLabel || '1 serving').slice(0, 60),
    calories: nutrients[0],
    protein: nutrients[1],
    carbs: nutrients[2],
    fat: nutrients[3],
    category: String(payload.category || 'other').slice(0, 40),
    isCustom: true,
    isApproximate: true,
  });
}

async function saveFavorite(userId, name, mealType, mealId) {
  const normalized = String(name || '').trim();
  if (!normalized) throw badRequest('Give the favourite a name');
  const meal = mealId
    ? await MealEntry.findOne({ _id: mealId, userId }).lean()
    : await MealEntry.findOne({ userId }).sort({ createdAt: -1 }).lean();
  if (!meal) throw badRequest('Log a meal first, then save it as a favourite');
  const favorite = await FavoriteMeal.findOneAndUpdate(
    { userId, name: normalized },
    {
      $set: {
        mealType: mealType || meal.mealType,
        items: meal.items,
        totals: meal.totals,
      },
      $setOnInsert: { userId, name: normalized, useCount: 0 },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return favorite;
}

async function logFavorite(userId, favoriteId, dateKey) {
  const favorite = await FavoriteMeal.findOne({ _id: favoriteId, userId });
  if (!favorite) throw notFound('Favourite meal not found');
  const { meal } = await createMeal(userId, {
    dateKey,
    mealType: favorite.mealType,
    items: favorite.items.map((item) => ({
      foodId: item.foodId,
      name: item.name,
      servingLabel: item.servingLabel,
      servings: item.servings,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    })),
    notes: `From favourite: ${favorite.name}`,
  });
  await FavoriteMeal.updateOne({ _id: favorite._id }, { $inc: { useCount: 1 } });
  return meal;
}

async function deleteFavorite(userId, favoriteId) {
  const deleted = await FavoriteMeal.findOneAndDelete({ _id: favoriteId, userId });
  if (!deleted) throw notFound('Favourite meal not found');
  return deleted;
}

module.exports = {
  searchFoods,
  listFavorites,
  getRecentFoods,
  resolveItems,
  createMeal,
  deleteMeal,
  listDay,
  summarize,
  getRangeDailyTotals,
  createCustomFood,
  saveFavorite,
  logFavorite,
  deleteFavorite,
};
