'use strict';

const mongoose = require('mongoose');
const { WORKOUT_TYPES, MUSCLE_GROUPS } = require('../config/constants');
const { isValidDateKey } = require('../utils/date');

const setSchema = new mongoose.Schema(
  {
    reps: { type: Number, min: 0, max: 500, default: 0 },
    weightKg: { type: Number, min: 0, max: 500, default: 0 },
    durationSeconds: { type: Number, min: 0, max: 7200, default: 0 },
    completed: { type: Boolean, default: true },
  },
  { _id: false }
);

const workoutExerciseSchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    muscleGroup: { type: String, enum: MUSCLE_GROUPS, default: 'Full body' },
    sets: {
      type: [setSchema],
      validate: [(sets) => sets.length <= 20, 'Too many sets (max 20)'],
    },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false }
);

const workoutSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      validate: { validator: isValidDateKey, message: 'dateKey must be YYYY-MM-DD' },
    },
    type: {
      type: String,
      enum: WORKOUT_TYPES.map((t) => t.value),
      default: 'full_body',
    },
    name: { type: String, trim: true, maxlength: 120, default: 'Workout' },
    durationMinutes: { type: Number, min: 0, max: 600, default: 0 },
    exercises: {
      type: [workoutExerciseSchema],
      validate: [(list) => list.length <= 30, 'Too many exercises (max 30)'],
    },
    completed: { type: Boolean, default: true },
    effort: { type: Number, min: 1, max: 10, default: 6 },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    clientId: { type: String, trim: true, maxlength: 100, default: undefined },
  },
  { timestamps: true }
);

workoutSchema.index({ userId: 1, dateKey: 1 });
workoutSchema.index({ userId: 1, type: 1, dateKey: -1 });
workoutSchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

/** Total weight moved (kg × reps) across every recorded set. */
workoutSchema.methods.totalVolume = function totalVolume() {
  return (this.exercises || []).reduce(
    (sum, exercise) =>
      sum +
      (exercise.sets || []).reduce(
        (setSum, set) => setSum + (Number(set.weightKg) || 0) * (Number(set.reps) || 0),
        0
      ),
    0
  );
};

module.exports = mongoose.model('Workout', workoutSchema);
