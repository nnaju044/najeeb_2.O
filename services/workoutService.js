'use strict';

const Workout = require('../models/Workout');
const Exercise = require('../models/Exercise');
const {
  isValidDateKey,
  isFutureDateKey,
  dateKeyRange,
  addDays,
  diffDays,
  currentDateKey,
} = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');
const { WORKOUT_TYPES, MUSCLE_GROUPS } = require('../config/constants');

const WORKOUT_TYPE_VALUES = WORKOUT_TYPES.map((type) => type.value);

async function listExercises(userId, query = '') {
  const filter = { $or: [{ userId: null }, { userId }] };
  if (query.trim()) {
    filter.nameLower = { $regex: query.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
  }
  return Exercise.find(filter).sort({ muscleGroup: 1, name: 1 }).limit(200).lean();
}

async function createExercise(userId, payload) {
  const name = String(payload.name || '').trim();
  if (!name) throw badRequest('Exercise name is required');
  if (!MUSCLE_GROUPS.includes(payload.muscleGroup)) throw badRequest('Choose a muscle group');
  return Exercise.create({
    userId,
    name,
    nameLower: name.toLowerCase(),
    muscleGroup: payload.muscleGroup,
    equipment: payload.equipment || '',
    notes: payload.notes || '',
  });
}

function normalizeExercises(exercises = []) {
  if (!Array.isArray(exercises)) throw badRequest('Exercises must be a list');
  if (exercises.length > 30) throw badRequest('A workout can hold at most 30 exercises');
  return exercises.map((exercise) => {
    const name = String(exercise.name || '').trim();
    if (!name) throw badRequest('Every exercise needs a name');
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    if (sets.length > 20) throw badRequest('At most 20 sets per exercise');
    return {
      exerciseId: exercise.exerciseId || null,
      name: name.slice(0, 120),
      muscleGroup: MUSCLE_GROUPS.includes(exercise.muscleGroup) ? exercise.muscleGroup : 'Full body',
      notes: String(exercise.notes || '').slice(0, 300),
      sets: sets.map((set) => {
        const reps = Number(set.reps ?? 0);
        const weightKg = Number(set.weightKg ?? 0);
        const durationSeconds = Number(set.durationSeconds ?? 0);
        if (![reps, weightKg, durationSeconds].every((value) => Number.isFinite(value) && value >= 0)) {
          throw badRequest('Set values must be zero or positive numbers');
        }
        if (reps > 500 || weightKg > 500 || durationSeconds > 7200) {
          throw badRequest('A set value is out of range');
        }
        return {
          reps: Math.round(reps),
          weightKg: Math.round(weightKg * 10) / 10,
          durationSeconds: Math.round(durationSeconds),
          completed: set.completed !== false,
        };
      }),
    };
  });
}

async function createWorkout(userId, payload) {
  if (!isValidDateKey(payload.dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(payload.dateKey)) throw badRequest('Workouts cannot be logged for a future day');
  if (!WORKOUT_TYPE_VALUES.includes(payload.type)) throw badRequest('Choose a workout type');
  if (payload.clientId) {
    const existing = await Workout.findOne({ userId, clientId: payload.clientId });
    if (existing) return { workout: existing, duplicate: true };
  }
  const exercises = normalizeExercises(payload.exercises || []);
  const durationMinutes = Number(payload.durationMinutes ?? 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 600) {
    throw badRequest('Workout duration must be between 0 and 600 minutes');
  }
  try {
    const workout = await Workout.create({
      userId,
      dateKey: payload.dateKey,
      type: payload.type,
      name: String(payload.name || WORKOUT_TYPES.find((t) => t.value === payload.type)?.label || 'Workout').slice(0, 120),
      durationMinutes: Math.round(durationMinutes),
      exercises,
      completed: payload.completed !== false,
      effort: Math.min(10, Math.max(1, Number(payload.effort) || 6)),
      notes: String(payload.notes || '').slice(0, 1000),
      clientId: payload.clientId || undefined,
    });
    return { workout, duplicate: false };
  } catch (error) {
    if (error?.code === 11000 && payload.clientId) {
      const existing = await Workout.findOne({ userId, clientId: payload.clientId });
      if (existing) return { workout: existing, duplicate: true };
    }
    throw error;
  }
}

async function deleteWorkout(userId, id) {
  const deleted = await Workout.findOneAndDelete({ _id: id, userId });
  if (!deleted) throw notFound('Workout not found');
  return deleted;
}

async function listDay(userId, dateKey) {
  return Workout.find({ userId, dateKey }).sort({ createdAt: 1 }).lean();
}

async function getHistory(userId, limit = 30) {
  return Workout.find({ userId }).sort({ dateKey: -1, createdAt: -1 }).limit(Math.min(limit, 100)).lean();
}

async function getRangeWeekStats(userId, fromKey, toKey, workoutsPerWeek = 2) {
  const workouts = await Workout.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).lean();
  const completed = workouts.filter((workout) => workout.completed);
  const byDay = new Map();
  for (const workout of completed) byDay.set(workout.dateKey, (byDay.get(workout.dateKey) || 0) + 1);
  const totalMinutes = completed.reduce((sum, workout) => sum + (workout.durationMinutes || 0), 0);
  const volume = completed.reduce((sum, workout) => {
    const docs = workout.exercises || [];
    return (
      sum +
      docs.reduce(
        (exerciseSum, exercise) =>
          exerciseSum +
          (exercise.sets || []).reduce(
            (setSum, set) => setSum + (set.weightKg || 0) * (set.reps || 0),
            0
          ),
        0
      )
    );
  }, 0);
  return {
    workouts: completed,
    workoutCount: completed.length,
    totalMinutes,
    volumeKg: Math.round(volume),
    activeDays: byDay.size,
    targetPerWeek: workoutsPerWeek,
    consistencyPercent: workoutsPerWeek > 0 ? Math.min(100, Math.round((completed.length / workoutsPerWeek) * 100)) : 0,
  };
}

/** Weekly series of completed workouts, for charts and reports. */
async function getWeeklyConsistency(userId, fromKey, toKey) {
  const keys = dateKeyRange(fromKey, toKey);
  const workouts = await Workout.find({ userId, dateKey: { $gte: fromKey, $lte: toKey }, completed: true }).lean();
  const counts = new Map();
  for (const workout of workouts) counts.set(workout.dateKey, (counts.get(workout.dateKey) || 0) + 1);
  return keys.map((key) => ({ dateKey: key, count: counts.get(key) || 0 }));
}

/** Max weight lifted per day for an exercise name (strength progression). */
async function getStrengthProgression(userId, exerciseName) {
  if (!exerciseName) throw badRequest('Choose an exercise');
  const nameLower = exerciseName.trim().toLowerCase();
  const workouts = await Workout.find({ userId, 'exercises.name': new RegExp(`^${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    .sort({ dateKey: 1 })
    .lean();
  const points = [];
  for (const workout of workouts) {
    let best = 0;
    let reps = 0;
    for (const exercise of workout.exercises || []) {
      if (exercise.name.trim().toLowerCase() !== nameLower) continue;
      for (const set of exercise.sets || []) {
        if ((set.weightKg || 0) > best) {
          best = set.weightKg;
          reps = set.reps;
        }
      }
    }
    if (best > 0) points.push({ dateKey: workout.dateKey, maxWeightKg: best, reps });
  }
  return points;
}

async function getStreak(userId) {
  const workouts = await Workout.find({ userId, completed: true }).sort({ dateKey: -1 }).lean();
  const days = [...new Set(workouts.map((workout) => workout.dateKey))].sort().reverse();
  if (!days.length) return { currentStreakDays: 0, lastWorkoutDate: null };
  const todayKey = currentDateKey();
  let streak = 0;
  let expected = days[0];
  const gapToday = diffDays(expected, todayKey);
  if (gapToday > 2) return { currentStreakDays: 0, lastWorkoutDate: days[0] };
  for (const day of days) {
    if (diffDays(day, expected) === 0) {
      streak += 1;
      expected = addDays(day, -1);
    } else if (diffDays(day, expected) > 0) {
      continue;
    } else {
      break;
    }
  }
  return { currentStreakDays: streak, lastWorkoutDate: days[0] };
}

module.exports = {
  listExercises,
  createExercise,
  createWorkout,
  deleteWorkout,
  listDay,
  getHistory,
  getRangeWeekStats,
  getWeeklyConsistency,
  getStrengthProgression,
  getStreak,
  WORKOUT_TYPE_VALUES,
};
