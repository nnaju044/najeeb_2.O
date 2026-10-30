'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const HourlyTimeLog = require('../models/HourlyTimeLog');
const timeService = require('../services/timeService');
const User = require('../models/User');
const { startTestApp, stopTestApp, registerOwner, startChallenge, api } = require('./helpers/app');

let context;
let userId;
const DATE = '2026-02-10';

test.before(async () => {
  context = await startTestApp('lifeos_time');
  await registerOwner(context.agent);
  await startChallenge(context.agent, '2026-01-01');
  const user = await User.findOne({ email: 'owner@example.com' });
  userId = user._id;
});

test.after(async () => {
  await stopTestApp(context);
});

test('one hour can never hold more than 60 minutes', async () => {
  const ok = await api(context.agent, 'post', '/api/time/hour', {
    dateKey: DATE,
    hour: 9,
    productive: 35,
    unproductive: 15,
    rest: 10,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.day.recordedMinutes, 60);

  const over = await api(context.agent, 'post', '/api/time/hour', {
    dateKey: DATE,
    hour: 9,
    productive: 40,
    unproductive: 30,
  });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /60/);

  const unchanged = await HourlyTimeLog.findOne({ userId, dateKey: DATE, hour: 9 });
  assert.equal(unchanged.productive, 35);
});

test('a bucket above 60 or a negative value is rejected at the model layer', async () => {
  assert.throws(() => {
    const log = new HourlyTimeLog({
      userId,
      dateKey: DATE,
      hour: 4,
      productive: 61,
      unproductive: 0,
      rest: 0,
      sleep: 0,
    });
    const error = log.validateSync();
    if (error) throw error;
  });
});

test('a full day accounts for exactly 1,440 minutes and no hour record can duplicate', async () => {
  const fullDay = '2026-02-11';
  for (let hour = 0; hour < 24; hour += 1) {
    await api(context.agent, 'post', '/api/time/hour', {
      dateKey: fullDay,
      hour,
      productive: 60,
      unproductive: 0,
      rest: 0,
      sleep: 0,
    });
  }

  const summary = await timeService.getDaySummary(userId, fullDay);
  assert.equal(summary.recordedMinutes, 1440);
  assert.equal(summary.unclassifiedMinutes, 0);
  assert.equal(summary.isFullyTracked, true);
  assert.equal(summary.productivePercent, 100);

  const count = await HourlyTimeLog.countDocuments({ userId, dateKey: fullDay });
  assert.equal(count, 24);

  // Saving the same hour again updates in place instead of adding a record.
  await api(context.agent, 'post', '/api/time/hour', {
    dateKey: fullDay,
    hour: 5,
    productive: 0,
    unproductive: 60,
  });
  const after = await HourlyTimeLog.countDocuments({ userId, dateKey: fullDay });
  assert.equal(after, 24);
  const totals = await timeService.getDaySummary(userId, fullDay);
  assert.equal(totals.totals.unproductive, 60);
  assert.equal(totals.recordedMinutes, 1440);
});

test('missing time stays unclassified instead of becoming unproductive', async () => {
  const summary = await timeService.getDaySummary(userId, DATE);
  assert.equal(summary.totals.productive, 35);
  assert.equal(summary.totals.unproductive, 15);
  assert.equal(summary.totals.rest, 10);
  assert.equal(summary.recordedMinutes, 60);
  assert.equal(summary.unclassifiedMinutes, 1380);
  assert.equal(summary.productivePercent, 58.3);
  assert.equal(summary.unclassifiedMinutes > 0, true);
});

test('an hour can be marked as sleep, clearing the other buckets', async () => {
  const response = await api(context.agent, 'post', '/api/time/sleep-hour', { dateKey: DATE, hour: 2 });
  assert.equal(response.status, 200);
  const sleepHour = await HourlyTimeLog.findOne({ userId, dateKey: DATE, hour: 2 });
  assert.equal(sleepHour.sleep, 60);
  assert.equal(sleepHour.productive, 0);
  assert.equal(sleepHour.source, 'sleep');
});

test('clearing an hour removes it entirely', async () => {
  const saved = await api(context.agent, 'post', '/api/time/hour', {
    dateKey: DATE,
    hour: 14,
    productive: 20,
    unproductive: 10,
    rest: 0,
  });
  assert.equal(saved.status, 200);

  const cleared = await api(context.agent, 'post', '/api/time/clear-hour', { dateKey: DATE, hour: 14 });
  assert.equal(cleared.status, 200);
  const record = await HourlyTimeLog.findOne({ userId, dateKey: DATE, hour: 14 });
  assert.equal(record, null);
});

test('focused work allocation never double-counts a full hour', async () => {
  const day = '2026-02-12';
  await api(context.agent, 'post', '/api/time/hour', {
    dateKey: day,
    hour: 10,
    productive: 60,
    unproductive: 0,
    rest: 0,
  });

  const blocked = await api(context.agent, 'post', '/api/work-sessions', {
    dateKey: day,
    startTime: '10:00',
    durationMinutes: 60,
    category: 'Coding',
  });
  assert.equal(blocked.status, 201);
  assert.equal(blocked.body.allocated, 0);
  assert.equal(blocked.body.session.allocatedMinutes, 0);

  const hour10 = await HourlyTimeLog.findOne({ userId, dateKey: day, hour: 10 });
  assert.equal(hour10.productive, 60);

  const allocated = await api(context.agent, 'post', '/api/work-sessions', {
    dateKey: day,
    startTime: '13:00',
    durationMinutes: 45,
    category: 'Coding',
  });
  assert.equal(allocated.status, 201);
  assert.equal(allocated.body.allocated, 45);
  const hour13 = await HourlyTimeLog.findOne({ userId, dateKey: day, hour: 13 });
  assert.equal(hour13.productive, 45);

  // Deleting the session reverses exactly the minutes it contributed.
  const deleted = await api(context.agent, 'delete', `/api/work-sessions/${allocated.body.session._id}`);
  assert.equal(deleted.status, 200);
  const reversed = await HourlyTimeLog.findOne({ userId, dateKey: day, hour: 13 });
  assert.equal(reversed, null);
});

test('copying a day fills only empty hours', async () => {
  await api(context.agent, 'post', '/api/time/hour', {
    dateKey: '2026-02-13',
    hour: 16,
    productive: 30,
    unproductive: 30,
  });
  const result = await api(context.agent, 'post', '/api/time/copy-day', {
    fromDateKey: '2026-02-12',
    toDateKey: '2026-02-13',
  });
  assert.equal(result.status, 200);
  const hour16 = await HourlyTimeLog.findOne({ userId, dateKey: '2026-02-13', hour: 16 });
  assert.equal(hour16.productive, 30);
  const hour10 = await HourlyTimeLog.findOne({ userId, dateKey: '2026-02-13', hour: 10 });
  assert.equal(hour10.productive, 60);
  assert.equal(hour10.source, 'copy');
});

test('best and weakest hours are derived from records', async () => {
  const summary = await timeService.getDaySummary(userId, '2026-02-11');
  assert.equal(summary.bestHour.productive, 60);
  assert.equal(summary.trackedHourCount, 24);
  const partial = await timeService.getDaySummary(userId, DATE);
  assert.equal(partial.bestHour.productive, 35);
  assert.equal(partial.worstHour.productive, 0);
});

test('hour 24 and invalid dates are rejected', async () => {
  const badHour = await api(context.agent, 'post', '/api/time/hour', {
    dateKey: DATE,
    hour: 24,
    productive: 10,
  });
  assert.equal(badHour.status, 400);

  const badDate = await api(context.agent, 'post', '/api/time/hour', {
    dateKey: '2026-13-40',
    hour: 3,
    productive: 10,
  });
  assert.equal(badDate.status, 400);
});
