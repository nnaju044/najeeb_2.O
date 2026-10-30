'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../utils/validate');
const { apiLimiter } = require('../middleware/security');
const { requireAuth } = require('../middleware/auth');
const { isValidDateKey, isValidTimeString } = require('../utils/date');
const { MEAL_TYPES, WORK_CATEGORIES, SLEEP_QUALITIES, WORKOUT_TYPES, MUSCLE_GROUPS } = require('../config/constants');

const timeController = require('../controllers/timeController');
const waterController = require('../controllers/waterController');
const foodController = require('../controllers/foodController');
const sleepController = require('../controllers/sleepController');
const gymController = require('../controllers/gymController');
const weightController = require('../controllers/weightController');
const habitController = require('../controllers/habitController');
const workController = require('../controllers/workController');
const settingsController = require('../controllers/settingsController');
const progressController = require('../controllers/progressController');
const dashboardController = require('../controllers/dashboardController');
const prayerController = require('../controllers/prayerController');
const { PRAYER_NAMES } = require('../models/PrayerEntry');

const router = express.Router();

const dateKey = z
  .string()
  .refine(isValidDateKey, 'Use a valid date (YYYY-MM-DD)');
const minutes = z.number().int().min(0).max(60);

const hourSchema = z.object({
  dateKey,
  hour: z.number().int().min(0).max(23),
  productive: minutes.default(0),
  unproductive: minutes.default(0),
  rest: minutes.default(0),
  sleep: minutes.default(0),
});

const waterSchema = z.object({
  dateKey,
  amountMl: z.number().int().min(1).max(5000),
  clientId: z.string().trim().min(6).max(100).optional(),
});

const mealItemSchema = z.object({
  foodId: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1).max(120).optional(),
  servingLabel: z.string().trim().max(60).optional(),
  servings: z.number().min(0.1).max(30),
  calories: z.number().min(0).max(5000).optional(),
  protein: z.number().min(0).max(300).optional(),
  carbs: z.number().min(0).max(600).optional(),
  fat: z.number().min(0).max(300).optional(),
});

const mealSchema = z.object({
  dateKey,
  mealType: z.enum(MEAL_TYPES),
  items: z.array(mealItemSchema).min(1).max(30),
  notes: z.string().max(500).optional(),
  clientId: z.string().trim().min(6).max(100).optional(),
});

const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  servingLabel: z.string().trim().max(60).optional(),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(300),
  carbs: z.number().min(0).max(600),
  fat: z.number().min(0).max(300),
  category: z.string().max(40).optional(),
});

const sleepSchema = z.object({
  dateKey,
  bedTime: z.string().refine(isValidTimeString, 'Use HH:MM'),
  wakeTime: z.string().refine(isValidTimeString, 'Use HH:MM'),
  quality: z.enum(SLEEP_QUALITIES.map((q) => q.value)).optional(),
  notes: z.string().max(300).optional(),
  clientId: z.string().trim().min(6).max(100).optional(),
});

const setSchema = z.object({
  reps: z.number().int().min(0).max(500).default(0),
  weightKg: z.number().min(0).max(500).default(0),
  durationSeconds: z.number().int().min(0).max(7200).optional(),
  completed: z.boolean().optional(),
});

const workoutSchema = z.object({
  dateKey,
  type: z.enum(WORKOUT_TYPES.map((t) => t.value)),
  name: z.string().trim().max(120).optional(),
  durationMinutes: z.number().int().min(0).max(600).default(0),
  effort: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().trim().optional().nullable(),
        name: z.string().trim().min(1).max(120),
        muscleGroup: z.enum(MUSCLE_GROUPS).optional(),
        notes: z.string().max(300).optional(),
        sets: z.array(setSchema).max(20).optional(),
      })
    )
    .max(30)
    .optional(),
  clientId: z.string().trim().min(6).max(100).optional(),
});

const weightSchema = z.object({
  dateKey,
  weightKg: z.number().min(20).max(400),
  heightCm: z.number().min(80).max(260).nullable().optional(),
  bodyFatPct: z.number().min(3).max(70).nullable().optional(),
  waistCm: z.number().min(30).max(250).nullable().optional(),
  notes: z.string().max(300).optional(),
  clientId: z.string().trim().min(6).max(100).optional(),
});

const habitStatusSchema = z.object({
  dateKey,
  status: z.enum(['done', 'skipped', 'na', 'clear']),
});

const habitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(40).optional(),
  category: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});

const workSchema = z.object({
  dateKey,
  startTime: z.string().refine(isValidTimeString, 'Use HH:MM'),
  durationMinutes: z.number().int().min(5).max(480),
  category: z.enum(WORK_CATEGORIES),
  project: z.string().trim().max(80).optional(),
  notes: z.string().max(500).optional(),
  clientId: z.string().trim().min(6).max(100).optional(),
});

router.use(apiLimiter, requireAuth);

// ── 24-hour tracker ──────────────────────────────────────────────────────────
router.post('/time/hour', validate(hourSchema), asyncHandler(timeController.saveHour));
router.post('/time/sleep-hour', validate(z.object({ dateKey, hour: z.number().int().min(0).max(23) })), asyncHandler(timeController.sleepHour));
router.post('/time/clear-hour', validate(z.object({ dateKey, hour: z.number().int().min(0).max(23) })), asyncHandler(timeController.clearHour));
router.post('/time/copy-day', validate(z.object({ fromDateKey: dateKey, toDateKey: dateKey })), asyncHandler(timeController.copyDay));

// ── water ────────────────────────────────────────────────────────────────────
router.post('/water', validate(waterSchema), asyncHandler(waterController.add));
router.post('/water/undo', validate(z.object({ dateKey })), asyncHandler(waterController.undo));
router.delete('/water/:id', asyncHandler(waterController.remove));

// ── food ─────────────────────────────────────────────────────────────────────
router.get('/foods', asyncHandler(foodController.searchFoods));
router.post('/foods', validate(customFoodSchema), asyncHandler(foodController.addFood));
router.post('/meals', validate(mealSchema), asyncHandler(foodController.addMeal));
router.delete('/meals/:id', asyncHandler(foodController.removeMeal));
router.get('/favorites', asyncHandler(foodController.listFavorites));
router.post(
  '/favorites',
  validate(
    z.object({
      name: z.string().trim().min(1).max(120),
      mealType: z.enum(MEAL_TYPES).optional(),
      mealId: z.string().trim().optional(),
    })
  ),
  asyncHandler(foodController.saveFavorite)
);
router.post('/favorites/:id/log', validate(z.object({ dateKey })), asyncHandler(foodController.logFavorite));
router.delete('/favorites/:id', asyncHandler(foodController.deleteFavorite));

// ── sleep ────────────────────────────────────────────────────────────────────
router.post('/sleep', validate(sleepSchema), asyncHandler(sleepController.add));
router.delete('/sleep/:id', asyncHandler(sleepController.remove));

// ── gym ──────────────────────────────────────────────────────────────────────
router.post('/workouts', validate(workoutSchema), asyncHandler(gymController.addWorkout));
router.delete('/workouts/:id', asyncHandler(gymController.removeWorkout));
router.get('/exercises', asyncHandler(gymController.listExercises));
router.post(
  '/exercises',
  validate(z.object({ name: z.string().trim().min(1).max(120), muscleGroup: z.enum(MUSCLE_GROUPS), equipment: z.string().max(60).optional(), notes: z.string().max(300).optional() })),
  asyncHandler(gymController.addExercise)
);
router.get('/progression', asyncHandler(gymController.progression));

// ── weight ───────────────────────────────────────────────────────────────────
router.post('/weights', validate(weightSchema), asyncHandler(weightController.save));
router.delete('/weights/:id', asyncHandler(weightController.remove));

// ── habits ───────────────────────────────────────────────────────────────────
router.post('/habits/:id/status', validate(habitStatusSchema), asyncHandler(habitController.setStatus));
router.post('/habits', validate(habitSchema), asyncHandler(habitController.create));
router.patch('/habits/:id', validate(habitSchema.partial()), asyncHandler(habitController.update));
router.delete('/habits/:id', asyncHandler(habitController.archive));

// ── focused work ─────────────────────────────────────────────────────────────
router.post('/work-sessions', validate(workSchema), asyncHandler(workController.add));
router.delete('/work-sessions/:id', asyncHandler(workController.remove));

// ── daily note ──────────────────────────────────────────────────────────────
router.post(
  '/daily-note',
  validate(
    z.object({
      dateKey,
      notes: z.string().max(2000).optional().default(''),
      mood: z.enum(['great', 'good', 'okay', 'low', '']).optional().default(''),
    })
  ),
  asyncHandler(dashboardController.saveNote)
);

// ── settings & analytics ─────────────────────────────────────────────────────
router.patch('/settings/theme', validate(z.object({ theme: z.enum(['dark', 'light']) })), asyncHandler(settingsController.updateTheme));
router.patch('/settings/profile', validate(z.object({ name: z.string().trim().max(80) })), asyncHandler(settingsController.updateProfile));
router.patch(
  '/settings/features',
  validate(z.object({ feature: z.enum(['prayerTracker']), enabled: z.boolean() })),
  asyncHandler(settingsController.updateFeatureToggle)
);
router.post(
  '/settings/password',
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
      confirmPassword: z.string().max(200).optional(),
    })
  ),
  asyncHandler(settingsController.updatePassword)
);
router.post(
  '/settings/reset-plan',
  validate(
    z.object({
      newStartDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date YYYY-MM-DD').optional().nullable(),
    })
  ),
  asyncHandler(settingsController.resetPlan)
);
router.get('/analytics', asyncHandler(progressController.apiAnalytics));
router.post('/reports/sync', asyncHandler(progressController.syncReports));

// ── prayer tracker ───────────────────────────────────────────────────────────
router.post(
  '/prayer/toggle',
  validate(
    z.object({
      dateKey,
      prayerName: z.enum(PRAYER_NAMES),
      completed: z.boolean(),
    })
  ),
  asyncHandler(prayerController.toggle)
);
router.get('/prayer/analytics', asyncHandler(prayerController.analytics));

// Offline replay probe: used by the client to confirm the session is alive.
router.get('/ping', (req, res) => res.json({ ok: true, at: Date.now() }));
router.get('/session', (req, res) =>
  res.json({ ok: true, csrfToken: req.session.csrfToken, user: { email: req.user.email } })
);

module.exports = router;
