'use strict';

const workoutService = require('../services/workoutService');
const { currentDateKey, addDays, diffDays, formatDateLong, weekdayName } = require('../utils/date');
const { WORKOUT_TYPES, MUSCLE_GROUPS } = require('../config/constants');

async function show(req, res) {
  const todayKey = currentDateKey();
  const from = addDays(todayKey, -6);
  const targets = res.locals.challenge?.targets;
  const [weekStats, history, exercises, streak, weekly] = await Promise.all([
    workoutService.getRangeWeekStats(req.user._id, from, todayKey, targets?.workoutsPerWeek ?? 2),
    workoutService.getHistory(req.user._id, 20),
    workoutService.listExercises(req.user._id),
    workoutService.getStreak(req.user._id),
    workoutService.getWeeklyConsistency(req.user._id, addDays(todayKey, -27), todayKey),
  ]);

  const exerciseName = req.query.exercise || history.flatMap((workout) => workout.exercises || [])[0]?.name || '';
  const progression = exerciseName ? await workoutService.getStrengthProgression(req.user._id, exerciseName) : [];

  return res.render('gym', {
    title: 'Gym',
    page: 'gym',
    active: 'gym',
    todayKey,
    todayLabel: formatDateLong(todayKey),
    weekday: weekdayName(todayKey),
    weekStats,
    history,
    exercises,
    streak,
    weekly,
    workoutTypes: WORKOUT_TYPES,
    muscleGroups: MUSCLE_GROUPS,
    targets: targets || { workoutsPerWeek: 2 },
    exerciseName,
    progression,
  });
}

async function addWorkout(req, res) {
  const { workout, duplicate } = await workoutService.createWorkout(req.user._id, req.validated.body);
  return res.status(201).json({ ok: true, workout, duplicate });
}

async function removeWorkout(req, res) {
  await workoutService.deleteWorkout(req.user._id, req.params.id);
  return res.json({ ok: true });
}

async function listExercises(req, res) {
  const exercises = await workoutService.listExercises(req.user._id, req.query.q || '');
  return res.json({ ok: true, exercises });
}

async function addExercise(req, res) {
  const exercise = await workoutService.createExercise(req.user._id, req.validated.body);
  return res.status(201).json({ ok: true, exercise });
}

async function progression(req, res) {
  const points = await workoutService.getStrengthProgression(req.user._id, req.query.exercise || '');
  return res.json({ ok: true, points });
}

module.exports = { show, addWorkout, removeWorkout, listExercises, addExercise, progression };
