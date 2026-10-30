'use strict';

const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Evening snack',
  dinner: 'Dinner',
  other: 'Other',
};

const TIME_CATEGORIES = ['productive', 'unproductive', 'rest', 'sleep'];

const TIME_CATEGORY_META = {
  productive: { label: 'Productive', color: '#32B67A' },
  unproductive: { label: 'Unproductive', color: '#E05A5A' },
  rest: { label: 'Rest / personal', color: '#C9A84C' },
  sleep: { label: 'Sleep', color: '#5B8DEF' },
};

const SLEEP_QUALITIES = [
  { value: 'very_poor', label: 'Very poor', score: 1 },
  { value: 'poor', label: 'Poor', score: 2 },
  { value: 'average', label: 'Average', score: 3 },
  { value: 'good', label: 'Good', score: 4 },
  { value: 'excellent', label: 'Excellent', score: 5 },
];

const WORKOUT_TYPES = [
  { value: 'full_body', label: 'Full body' },
  { value: 'upper', label: 'Upper body' },
  { value: 'lower', label: 'Lower body' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'walk', label: 'Walk' },
  { value: 'recovery', label: 'Recovery / mobility' },
  { value: 'other', label: 'Other' },
];

const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Full body',
  'Cardio',
];

const WORK_CATEGORIES = [
  'Coding',
  'Learning',
  'Business development',
  'Content creation',
  'Research',
  'Personal projects',
  'Other',
];

const DEFAULT_TARGETS = {
  waterMl: 2500,
  proteinG: 90,
  calories: 2200,
  sleepMinutes: 480,
  workoutsPerWeek: 2,
};

const DEFAULT_HABITS = [
  { name: 'Wake up on time', icon: 'sunrise', category: 'routine' },
  { name: 'Drink sufficient water', icon: 'droplets', category: 'health' },
  { name: 'Eat balanced meals', icon: 'utensils', category: 'health' },
  { name: 'Walk after lunch', icon: 'footprints', category: 'fitness' },
  { name: 'Complete scheduled gym session', icon: 'dumbbell', category: 'fitness' },
  { name: 'Complete development work', icon: 'code', category: 'focus' },
  { name: 'Practice speaking for 30 seconds', icon: 'mic', category: 'focus' },
  { name: 'Avoid unnecessary scrolling', icon: 'smartphone-off', category: 'focus' },
  { name: 'Sleep on time', icon: 'moon', category: 'routine' },
];

const DEFAULT_EXERCISES = [
  { name: 'Chest press', muscleGroup: 'Chest', equipment: 'Machine' },
  { name: 'Bench press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { name: 'Push-up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { name: 'Lat pulldown', muscleGroup: 'Back', equipment: 'Machine' },
  { name: 'Barbell row', muscleGroup: 'Back', equipment: 'Barbell' },
  { name: 'Shoulder press', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Lateral raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { name: 'Biceps curl', muscleGroup: 'Biceps', equipment: 'Dumbbell' },
  { name: 'Triceps pushdown', muscleGroup: 'Triceps', equipment: 'Cable' },
  { name: 'Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Leg press', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Romanian deadlift', muscleGroup: 'Legs', equipment: 'Barbell' },
  { name: 'Calf raise', muscleGroup: 'Legs', equipment: 'Machine' },
  { name: 'Plank', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Hanging leg raise', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { name: 'Walking', muscleGroup: 'Cardio', equipment: 'None' },
];

const WATER_PRESETS = [150, 250, 300, 500, 750, 1000, 2000];

const TIME_PRESETS = [0, 15, 30, 45, 60];

const WORK_DURATIONS = [15, 30, 45, 60, 90];

const BEDTIME_PRESETS = ['22:00', '23:00', '00:00', '01:00', '02:00', '03:00'];
const WAKE_PRESETS = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'];

const CHALLENGE_DURATION_DAYS = 90;
const CHALLENGE_WEEKS = 13;

/** Week N covers days ((N-1)*7 + 1) .. min(N*7, 90). */
function weekDayRange(weekNumber) {
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = Math.min(weekNumber * 7, CHALLENGE_DURATION_DAYS);
  return { startDay, endDay };
}

module.exports = {
  MEAL_TYPES,
  MEAL_LABELS,
  TIME_CATEGORIES,
  TIME_CATEGORY_META,
  SLEEP_QUALITIES,
  WORKOUT_TYPES,
  MUSCLE_GROUPS,
  WORK_CATEGORIES,
  DEFAULT_TARGETS,
  DEFAULT_HABITS,
  DEFAULT_EXERCISES,
  WATER_PRESETS,
  TIME_PRESETS,
  WORK_DURATIONS,
  BEDTIME_PRESETS,
  WAKE_PRESETS,
  CHALLENGE_DURATION_DAYS,
  CHALLENGE_WEEKS,
  weekDayRange,
};
