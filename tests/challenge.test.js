'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const challengeService = require('../services/challengeService');
const { startTestApp, stopTestApp, registerOwner, startChallenge } = require('./helpers/app');

let context;

test.before(async () => {
  context = await startTestApp('lifeos_challenge');
});

test.after(async () => {
  await stopTestApp(context);
});

test('day numbers map from the start date, including before and after the challenge', () => {
  const challenge = { startDate: '2026-01-01', durationDays: 90 };
  assert.equal(challengeService.dayInfo(challenge, '2025-12-31').status, 'before');
  assert.equal(challengeService.dayInfo(challenge, '2025-12-31').dayNumber, 0);
  assert.equal(challengeService.dayInfo(challenge, '2026-01-01').dayNumber, 1);
  assert.equal(challengeService.dayInfo(challenge, '2026-01-07').dayNumber, 7);
  assert.equal(challengeService.dayInfo(challenge, '2026-01-08').dayNumber, 8);
  assert.equal(challengeService.dayInfo(challenge, '2026-03-31').dayNumber, 90);
  assert.equal(challengeService.dayInfo(challenge, '2026-03-31').status, 'active');
  assert.equal(challengeService.dayInfo(challenge, '2026-04-01').status, 'completed');
});

test('weeks are seven-day blocks that cap at 13 and day 90', () => {
  const challenge = { startDate: '2026-01-01', durationDays: 90 };
  assert.equal(challengeService.weekNumberForDay(1), 1);
  assert.equal(challengeService.weekNumberForDay(7), 1);
  assert.equal(challengeService.weekNumberForDay(8), 2);
  assert.equal(challengeService.weekNumberForDay(85), 13);
  assert.equal(challengeService.weekNumberForDay(90), 13);

  const week13 = challengeService.weekBounds(challenge, 13);
  assert.equal(week13.startDay, 85);
  assert.equal(week13.endDay, 90);
  assert.equal(week13.startDate, '2026-03-26');
  assert.equal(week13.endDate, '2026-03-31');
  assert.equal(challengeService.weekBounds(challenge, 14), null);
});

test('overall progress is time based and never negative or over 100%', () => {
  const challenge = { startDate: '2026-01-01', durationDays: 90 };
  const before = challengeService.challengeProgress(challenge, '2025-12-20');
  assert.equal(before.completionPercent, 0);
  assert.equal(before.remainingDays, 90);

  const mid = challengeService.challengeProgress(challenge, '2026-01-31');
  assert.equal(mid.dayNumber, 31);
  assert.equal(mid.remainingDays, 59);
  assert.ok(mid.completionPercent > 34 && mid.completionPercent < 35);

  const after = challengeService.challengeProgress(challenge, '2026-06-01');
  assert.equal(after.completionPercent, 100);
  assert.equal(after.remainingDays, 0);
});

test('the challenge start date is permanent and cannot be restarted', async () => {
  await registerOwner(context.agent);
  const started = await startChallenge(context.agent, '2026-01-01');
  assert.equal(started.status, 302);

  const again = await startChallenge(context.agent, '2026-02-01');
  assert.equal(again.status, 409);

  const Challenge = require('../models/Challenge');
  const challenge = await Challenge.findOne({});
  assert.equal(challenge.startDate, '2026-01-01');
  assert.equal(challenge.targets.waterMl, 2500);
  assert.equal(challenge.targets.proteinG, 90);
});

test('invalid or future start dates are rejected', async () => {
  const Challenge = require('../models/Challenge');
  const original = await Challenge.findOne({});

  const invalid = await startChallenge(context.agent, 'not-a-date');
  assert.equal(invalid.status, 400);

  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 10);
  const futureResponse = await startChallenge(context.agent, future.toISOString().slice(0, 10));
  assert.equal(futureResponse.status, 400);

  const unchanged = await Challenge.findOne({});
  assert.equal(unchanged.startDate, original.startDate);
});

test('starting a challenge seeds the nine starter habits exactly once', async () => {
  const { Habit } = require('../models/Habit');
  const habits = await Habit.find({});
  assert.equal(habits.length, 9);
  assert.ok(habits.some((habit) => habit.name === 'Drink sufficient water'));

  // A second start attempt is refused, so habits are never duplicated.
  const again = await startChallenge(context.agent, '2026-01-01');
  assert.equal(again.status, 409);
  assert.equal(await Habit.countDocuments({}), 9);
});
