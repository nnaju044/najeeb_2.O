'use strict';

/**
 * Daily completion score.
 *
 * Every component is a real ratio clamped to 0-100, and the weights below are
 * the only place the formula lives. Nothing here is invented: missing data
 * simply scores 0 for that component, and the UI shows which component is
 * missing rather than pretending the time was unproductive.
 */
const WEIGHTS = {
  time: 0.3,
  water: 0.2,
  habits: 0.15,
  protein: 0.15,
  sleep: 0.15,
  workout: 0.05,
};

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function ratio(value, target) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return clampPercent((value / target) * 100);
}

/**
 * @param {object} input
 * @param {number} input.recordedMinutes  minutes accounted for in the 24h tracker
 * @param {number} input.waterMl
 * @param {number} input.waterTarget
 * @param {number} input.proteinG
 * @param {number} input.proteinTarget
 * @param {number} input.sleepMinutes
 * @param {number} input.sleepTarget
 * @param {number} input.habitsDone
 * @param {number} input.habitsApplicable
 * @param {boolean} input.workoutDone
 */
function computeDayScore(input) {
  const components = {
    time: clampPercent((Math.max(0, input.recordedMinutes || 0) / 1440) * 100),
    water: ratio(input.waterMl, input.waterTarget),
    habits: ratio(input.habitsDone, input.habitsApplicable),
    protein: ratio(input.proteinG, input.proteinTarget),
    sleep: ratio(input.sleepMinutes, input.sleepTarget),
    workout: input.workoutDone ? 100 : 0,
  };

  const score =
    components.time * WEIGHTS.time +
    components.water * WEIGHTS.water +
    components.habits * WEIGHTS.habits +
    components.protein * WEIGHTS.protein +
    components.sleep * WEIGHTS.sleep +
    components.workout * WEIGHTS.workout;

  const missing = [];
  if (!input.recordedMinutes) missing.push('time');
  if (!input.waterMl) missing.push('water');
  if (!input.proteinG) missing.push('protein');
  if (!input.sleepMinutes) missing.push('sleep');
  if (!input.habitsApplicable) missing.push('habits');
  if (!input.workoutDone) missing.push('workout');

  return {
    score: Math.round(score * 10) / 10,
    components,
    weights: WEIGHTS,
    missing,
  };
}

module.exports = { WEIGHTS, computeDayScore, clampPercent };
