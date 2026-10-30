'use strict';

const WorkSession = require('../models/WorkSession');
const HourlyTimeLog = require('../models/HourlyTimeLog');
const { allocateProductiveMinutes } = require('./timeService');
const {
  isValidDateKey,
  isFutureDateKey,
  isValidTimeString,
  parseTimeToMinutes,
  dateKeyRange,
  currentDateKey,
  addDays,
} = require('../utils/date');
const { badRequest, notFound } = require('../utils/httpError');
const { WORK_CATEGORIES } = require('../config/constants');

/**
 * Logging a focused session writes its minutes into the 24-hour tracker as
 * *productive* time — but only into unclassified capacity of the hours the
 * session actually covers, so the same minutes can never be counted twice.
 */
async function createSession(userId, payload) {
  if (!isValidDateKey(payload.dateKey)) throw badRequest('A valid date is required');
  if (isFutureDateKey(payload.dateKey)) throw badRequest('Work sessions cannot be logged for a future day');
  if (!isValidTimeString(payload.startTime)) throw badRequest('Start time must be HH:MM');
  const duration = Math.round(Number(payload.durationMinutes));
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw badRequest('A focused session must be between 5 and 480 minutes');
  }
  if (!WORK_CATEGORIES.includes(payload.category)) throw badRequest('Choose a work category');

  if (payload.clientId) {
    const existing = await WorkSession.findOne({ userId, clientId: payload.clientId });
    if (existing) return { session: existing, duplicate: true, allocated: existing.allocatedMinutes };
  }

  const startMinute = parseTimeToMinutes(payload.startTime);
  const allocations = await allocateProductiveMinutes(userId, payload.dateKey, startMinute, duration);

  try {
    const session = await WorkSession.create({
      userId,
      dateKey: payload.dateKey,
      startTime: payload.startTime,
      durationMinutes: duration,
      category: payload.category,
      project: String(payload.project || '').slice(0, 80),
      notes: String(payload.notes || '').slice(0, 500),
      allocatedMinutes: allocations.allocated,
      allocations: allocations.hours,
      clientId: payload.clientId || undefined,
    });
    return {
      session,
      duplicate: false,
      allocated: allocations.allocated,
      skipped: allocations.skipped,
    };
  } catch (error) {
    if (error?.code === 11000 && payload.clientId) {
      const existing = await WorkSession.findOne({ userId, clientId: payload.clientId });
      if (existing) return { session: existing, duplicate: true, allocated: existing.allocatedMinutes };
    }
    throw error;
  }
}

async function deleteSession(userId, id) {
  const session = await WorkSession.findOne({ _id: id, userId });
  if (!session) throw notFound('Work session not found');

  // Reverse only what this session contributed, and only from productive time.
  for (const allocation of session.allocations || []) {
    const log = await HourlyTimeLog.findOne({
      userId,
      dateKey: session.dateKey,
      hour: allocation.hour,
    });
    if (!log) continue;
    const productive = Math.max(0, log.productive - allocation.minutes);
    if (productive === 0 && log.unproductive === 0 && log.rest === 0 && log.sleep === 0) {
      await HourlyTimeLog.deleteOne({ _id: log._id });
    } else {
      log.productive = productive;
      await log.save();
    }
  }
  await session.deleteOne();
  return session;
}

async function listDay(userId, dateKey) {
  if (!isValidDateKey(dateKey)) throw badRequest('A valid date is required');
  const sessions = await WorkSession.find({ userId, dateKey }).sort({ startTime: 1 }).lean();
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  return { sessions, totalMinutes };
}

async function getRangeStats(userId, fromKey, toKey) {
  if (!isValidDateKey(fromKey) || !isValidDateKey(toKey)) throw badRequest('Invalid date range');
  const keys = dateKeyRange(fromKey, toKey);
  const sessions = await WorkSession.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).lean();
  const totalsByDay = new Map(keys.map((key) => [key, 0]));
  const byCategory = new Map();
  const byProject = new Map();
  for (const session of sessions) {
    totalsByDay.set(session.dateKey, (totalsByDay.get(session.dateKey) || 0) + session.durationMinutes);
    byCategory.set(session.category, (byCategory.get(session.category) || 0) + session.durationMinutes);
    if (session.project) {
      byProject.set(session.project, (byProject.get(session.project) || 0) + session.durationMinutes);
    }
  }
  const days = keys.map((key) => ({ dateKey: key, minutes: totalsByDay.get(key) || 0 }));
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const activeDays = days.filter((day) => day.minutes > 0).length;
  return {
    sessions,
    days,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    activeDays,
    avgSessionMinutes: sessions.length ? Math.round(totalMinutes / sessions.length) : 0,
    byCategory: [...byCategory.entries()]
      .map(([category, minutes]) => ({ category, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    byProject: [...byProject.entries()]
      .map(([project, minutes]) => ({ project, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10),
  };
}

async function getWeekMinutes(userId, todayKey = currentDateKey()) {
  const stats = await getRangeStats(userId, addDays(todayKey, -6), todayKey);
  return stats.totalMinutes;
}

module.exports = {
  createSession,
  deleteSession,
  listDay,
  getRangeStats,
  getWeekMinutes,
  WORK_CATEGORIES,
};
