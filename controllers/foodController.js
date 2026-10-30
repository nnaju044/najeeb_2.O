'use strict';

const nutritionService = require('../services/nutritionService');
const { currentDateKey, isValidDateKey, addDays, diffDays, formatDateLong, weekdayName } = require('../utils/date');
const { MEAL_TYPES, MEAL_LABELS } = require('../config/constants');
const { badRequest } = require('../utils/httpError');

function resolveDate(req) {
  const requested = req.params.dateKey || req.query.date || req.body.dateKey || currentDateKey();
  if (!isValidDateKey(requested)) throw badRequest('That date is not valid');
  return requested;
}

async function show(req, res) {
  const dateKey = resolveDate(req);
  const todayKey = currentDateKey();
  const targets = res.locals.challenge?.targets;
  const day = await nutritionService.listDay(req.user._id, dateKey);
  const [favorites, recentFoods, week] = await Promise.all([
    nutritionService.listFavorites(req.user._id),
    nutritionService.getRecentFoods(req.user._id),
    nutritionService.getRangeDailyTotals(req.user._id, addDays(dateKey, -6), dateKey),
  ]);
  const mealsByType = MEAL_TYPES.map((type) => ({
    type,
    label: MEAL_LABELS[type],
    meals: day.meals.filter((meal) => meal.mealType === type),
  }));

  return res.render('food', {
    title: 'Food',
    page: 'food',
    active: 'health',
    dateKey,
    dateLabel: formatDateLong(dateKey),
    weekday: weekdayName(dateKey),
    mealsByType,
    totals: nutritionService.summarize(day.totals, targets),
    favorites,
    recentFoods,
    week,
    mealTypes: MEAL_TYPES,
    mealLabels: MEAL_LABELS,
    prevDate: addDays(dateKey, -1),
    nextDate: diffDays(dateKey, todayKey) < 0 ? addDays(dateKey, 1) : null,
    isToday: dateKey === todayKey,
  });
}

async function searchFoods(req, res) {
  const foods = await nutritionService.searchFoods(req.user._id, req.query.q || '', req.query.limit);
  return res.json({ ok: true, foods });
}

async function addMeal(req, res) {
  const { dateKey, mealType, items, notes, clientId } = req.validated.body;
  const { meal, duplicate } = await nutritionService.createMeal(req.user._id, {
    dateKey,
    mealType,
    items,
    notes,
    clientId,
  });
  const day = await nutritionService.listDay(req.user._id, dateKey);
  return res.status(201).json({
    ok: true,
    meal,
    duplicate,
    totals: nutritionService.summarize(day.totals, res.locals.challenge?.targets),
  });
}

async function removeMeal(req, res) {
  const meal = await nutritionService.deleteMeal(req.user._id, req.params.id);
  const day = await nutritionService.listDay(req.user._id, meal.dateKey);
  return res.json({ ok: true, totals: nutritionService.summarize(day.totals, res.locals.challenge?.targets) });
}

async function addFood(req, res) {
  const food = await nutritionService.createCustomFood(req.user._id, req.validated.body);
  return res.status(201).json({ ok: true, food });
}

async function listFavorites(req, res) {
  const favorites = await nutritionService.listFavorites(req.user._id);
  return res.json({ ok: true, favorites });
}

async function saveFavorite(req, res) {
  const favorite = await nutritionService.saveFavorite(
    req.user._id,
    req.validated.body.name,
    req.validated.body.mealType,
    req.validated.body.mealId
  );
  return res.status(201).json({ ok: true, favorite });
}

async function logFavorite(req, res) {
  const meal = await nutritionService.logFavorite(req.user._id, req.params.id, req.validated.body.dateKey);
  const day = await nutritionService.listDay(req.user._id, meal.dateKey);
  return res.status(201).json({ ok: true, meal, totals: nutritionService.summarize(day.totals, res.locals.challenge?.targets) });
}

async function deleteFavorite(req, res) {
  await nutritionService.deleteFavorite(req.user._id, req.params.id);
  return res.json({ ok: true });
}

module.exports = {
  show,
  searchFoods,
  addMeal,
  removeMeal,
  addFood,
  listFavorites,
  saveFavorite,
  logFavorite,
  deleteFavorite,
  resolveDate,
};
