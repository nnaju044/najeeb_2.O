'use strict';

const Achievement = require('../models/Achievement');
const WeeklyReport = require('../models/WeeklyReport');
const Workout = require('../models/Workout');
const metricsService = require('./metricsService');
const habitService = require('./habitService');
const challengeService = require('./challengeService');
const { currentDateKey, addDays } = require('../utils/date');
const { CHALLENGE_WEEKS } = require('../config/constants');

/**
 * Achievement catalogue. Every rule below is evaluated against stored records
 * only — there is no seeded progress and no client-supplied number.
 */
const CATALOGUE = [
  {
    key: 'first_week',
    title: 'First Week Completed',
    description: 'Finished all 7 days of your first challenge week.',
    icon: 'flag',
  },
  {
    key: 'water_consistency',
    title: 'Water Consistency',
    description: 'Reached at least 70% of your water target across a full week.',
    icon: 'droplets',
  },
  {
    key: 'sleep_discipline',
    title: 'Sleep Discipline',
    description: 'Five or more nights within an hour of your sleep target in one week.',
    icon: 'moon',
  },
  {
    key: 'gym_starter',
    title: 'Gym Starter',
    description: 'Completed two logged workouts.',
    icon: 'dumbbell',
  },
  {
    key: 'seven_day_consistency',
    title: 'Seven-Day Consistency',
    description: 'Seven consecutive days with at least 80% of your habits completed.',
    icon: 'flame',
  },
  {
    key: 'productivity_improver',
    title: 'Productivity Improver',
    description: 'A full week scored higher than the week before it.',
    icon: 'trending-up',
  },
  {
    key: 'milestone_30',
    title: '30-Day Milestone',
    description: 'Reached day 30 of the challenge.',
    icon: 'calendar-check',
  },
  {
    key: 'milestone_60',
    title: '60-Day Milestone',
    description: 'Reached day 60 of the challenge.',
    icon: 'calendar-check',
  },
  {
    key: 'milestone_90',
    title: '90-Day Finisher',
    description: 'Completed all 90 days of the challenge.',
    icon: 'trophy',
  },
];

const BY_KEY = Object.fromEntries(CATALOGUE.map((entry) => [entry.key, entry]));

async function award(userId, key, meta = '{}') {
  const definition = BY_KEY[key];
  if (!definition) return null;
  const metaObject = typeof meta === 'string' ? JSON.parse(meta) : meta;
  return Achievement.findOneAndUpdate(
    { userId, key },
    {
      $setOnInsert: {
        userId,
        key,
        title: definition.title,
        description: definition.description,
        earnedAt: new Date(),
        meta: metaObject,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function evaluate(userId, challenge, todayKey = currentDateKey()) {
  if (!challenge) return list(userId);
  const info = challengeService.dayInfo(challenge, todayKey);
  const weekNumber = Math.max(1, info.weekNumber || 1);

  const reports = await WeeklyReport.find({ userId }).sort({ weekNumber: 1 }).lean();
  const reportByWeek = new Map(reports.map((report) => [report.weekNumber, report]));

  // 1. First full week.
  if (reportByWeek.has(1)) {
    await award(userId, 'first_week', { week: 1 });
  }

  // 2. Water + 3. Sleep discipline: any completed week that met the bar.
  for (const report of reports) {
    if ((report.stats?.waterConsistencyPercent || 0) >= 70 && (report.trackedDays || 0) >= 5) {
      await award(userId, 'water_consistency', {
        week: report.weekNumber,
        waterConsistencyPercent: report.stats.waterConsistencyPercent,
      });
      break;
    }
  }
  for (const report of reports) {
    const nights = report.stats?.sleepConsistencyPercent || 0;
    if (nights >= 70 && (report.stats?.totals?.sleepMinutes || 0) > 0) {
      await award(userId, 'sleep_discipline', {
        week: report.weekNumber,
        consistencyPercent: nights,
      });
      break;
    }
  }

  // 4. Gym starter.
  const completedWorkouts = await Workout.countDocuments({ userId, completed: true });
  if (completedWorkouts >= 2) {
    await award(userId, 'gym_starter', { completedWorkouts });
  }

  // 5. Seven-day habit consistency (based on stored habit completions).
  const habitWindowStart = addDays(todayKey, -6);
  const habitStats = await habitService.getRangeStats(userId, habitWindowStart, todayKey);
  const strongDays = habitStats.days.filter((day) => day.applicable > 0 && day.percent >= 80).length;
  if (strongDays >= 7) {
    await award(userId, 'seven_day_consistency', {
      from: habitWindowStart,
      to: todayKey,
      consistencyPercent: habitStats.consistencyPercent,
    });
  }

  // 6. Productivity improver: a finished week scored above the one before it.
  for (let week = 2; week <= CHALLENGE_WEEKS; week += 1) {
    const current = reportByWeek.get(week);
    const previous = reportByWeek.get(week - 1);
    if (!current || !previous) continue;
    if ((current.trackedDays || 0) < 3 || (previous.trackedDays || 0) < 3) continue;
    if (current.achievementPercent > previous.achievementPercent) {
      await award(userId, 'productivity_improver', {
        week,
        from: previous.achievementPercent,
        to: current.achievementPercent,
      });
      break;
    }
  }

  // 7. Time-based milestones, tied to the challenge record itself.
  const dayReached = info.status === 'completed' ? challenge.durationDays : info.dayNumber;
  for (const milestone of [30, 60, 90]) {
    if (dayReached >= milestone) {
      await award(userId, `milestone_${milestone}`, { day: dayReached });
    }
  }

  // Persist a snapshot of the week's score so reports stay honest if data changes.
  const currentReport = reportByWeek.get(weekNumber);
  if (currentReport) {
    await metricsService.getDailyMetrics(userId, challenge.startDate, todayKey, challenge.targets);
  }

  return list(userId);
}

async function list(userId) {
  const earned = await Achievement.find({ userId }).lean();
  const byKey = new Map(earned.map((achievement) => [achievement.key, achievement]));
  return CATALOGUE.map((definition) => {
    const record = byKey.get(definition.key);
    return {
      ...definition,
      earned: Boolean(record),
      earnedAt: record?.earnedAt || null,
      meta: record?.meta || null,
    };
  });
}

module.exports = { CATALOGUE, evaluate, list, award };
