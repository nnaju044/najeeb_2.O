'use strict';

const Food = require('../models/Food');
const Exercise = require('../models/Exercise');
const { Habit } = require('../models/Habit');
const { FOOD_SEED } = require('../config/foods');
const { DEFAULT_HABITS, DEFAULT_EXERCISES } = require('../config/constants');

/**
 * Starter libraries are global (userId: null) and upserted idempotently, so
 * running this on every boot never duplicates a food or an exercise.
 */
async function ensureGlobalLibraries() {
  const foodOps = FOOD_SEED.map(([name, servingLabel, calories, protein, carbs, fat, category]) => ({
    updateOne: {
      filter: { userId: null, nameLower: name.toLowerCase().trim() },
      update: {
        $setOnInsert: {
          userId: null,
          name,
          nameLower: name.toLowerCase().trim(),
          servingLabel,
          calories,
          protein,
          carbs,
          fat,
          category,
          isApproximate: true,
          isCustom: false,
        },
      },
      upsert: true,
    },
  }));

  const exerciseOps = DEFAULT_EXERCISES.map((exercise) => ({
    updateOne: {
      filter: { userId: null, nameLower: exercise.name.toLowerCase().trim() },
      update: {
        $setOnInsert: {
          userId: null,
          name: exercise.name,
          nameLower: exercise.name.toLowerCase().trim(),
          muscleGroup: exercise.muscleGroup,
          equipment: exercise.equipment,
          notes: '',
        },
      },
      upsert: true,
    },
  }));

  if (foodOps.length) await Food.bulkWrite(foodOps, { ordered: false });
  if (exerciseOps.length) await Exercise.bulkWrite(exerciseOps, { ordered: false });
}

/** Create the nine starter habits for a new account (never duplicates). */
async function seedUserHabits(userId) {
  const count = await Habit.countDocuments({ userId });
  if (count > 0) return;
  await Habit.insertMany(
    DEFAULT_HABITS.map((habit, index) => ({
      userId,
      name: habit.name,
      icon: habit.icon,
      category: habit.category,
      sortOrder: index,
    }))
  );
}

module.exports = { ensureGlobalLibraries, seedUserHabits };
