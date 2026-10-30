'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const User = require('../models/User');
const { PrayerEntry } = require('../models/PrayerEntry');
const prayerService = require('../services/prayerService');
const { startTestApp, stopTestApp, getCsrf, registerOwner, startChallenge, api } = require('./helpers/app');
const { currentDateKey, addDays } = require('../utils/date');

let context;
let owner;
let otherUser;
let agentOther;

const TODAY = currentDateKey();
const YESTERDAY = addDays(TODAY, -1);
const PAST_DATE = addDays(TODAY, -5);

test.before(async () => {
  context = await startTestApp('jeebs_prayer_tests');
  await registerOwner(context.agent, { email: 'prayer_owner@example.com' });
  await startChallenge(context.agent, '2026-01-01');
  owner = await User.findOne({ email: 'prayer_owner@example.com' });

  // Register second user for multi-user isolation
  agentOther = request.agent(context.app);
  const token = await getCsrf(agentOther, '/register');
  await agentOther.post('/register').type('form').send({
    _csrf: token,
    email: 'prayer_other@example.com',
    password: 'passwordOther-123',
    confirmPassword: 'passwordOther-123',
    name: 'Other User',
    startDate: '2026-01-01',
  });
  otherUser = await User.findOne({ email: 'prayer_other@example.com' });
});

test.after(async () => {
  await stopTestApp(context);
});

test('1. Prayer Tracker is disabled by default for all users', async () => {
  const freshOwner = await User.findById(owner._id);
  const freshOther = await User.findById(otherUser._id);

  assert.equal(freshOwner.prayerTrackerEnabled, false, 'Owner should have prayerTrackerEnabled: false by default');
  assert.equal(freshOther.prayerTrackerEnabled, false, 'Other user should have prayerTrackerEnabled: false by default');

  // Verify dashboard does not render prayer card when disabled
  const dashRes = await context.agent.get('/');
  assert.equal(dashRes.status, 200);
  assert.equal(dashRes.text.includes('id="prayer-tracker-card"'), false, 'Dashboard must hide prayer card when disabled');
  assert.equal(dashRes.text.includes('href="/prayer"'), false, 'Dashboard must hide prayer navigation when disabled');

  // Direct visit to /prayer when disabled redirects to /settings
  const prayerPage = await context.agent.get('/prayer');
  assert.equal(prayerPage.status, 302);
  assert.equal(prayerPage.headers.location, '/settings');
});

test('2. Enabling and disabling the feature updates user preference independently', async () => {
  // Owner enables feature
  const enableRes = await api(context.agent, 'patch', '/api/settings/features', {
    feature: 'prayerTracker',
    enabled: true,
  });
  assert.equal(enableRes.status, 200);
  assert.equal(enableRes.body.enabled, true);

  const updatedOwner = await User.findById(owner._id);
  assert.equal(updatedOwner.prayerTrackerEnabled, true);

  // Other user remains disabled (independent control)
  const untouchedOther = await User.findById(otherUser._id);
  assert.equal(untouchedOther.prayerTrackerEnabled, false);

  // Dashboard for owner now shows the prayer card
  const dashRes = await context.agent.get('/');
  assert.equal(dashRes.status, 200);
  assert.equal(dashRes.text.includes('id="prayer-tracker-card"'), true, 'Dashboard must show prayer card when enabled');
  assert.equal(dashRes.text.includes('Daily prayers'), true);

  // Dashboard for other user still hides it
  const otherDash = await agentOther.get('/');
  assert.equal(otherDash.status, 200);
  assert.equal(otherDash.text.includes('id="prayer-tracker-card"'), false);
});

test('3. Marking and unmarking prayers updates completion and timestamp', async () => {
  // Mark Fajr as completed today
  const markFajr = await api(context.agent, 'post', '/api/prayer/toggle', {
    dateKey: TODAY,
    prayerName: 'Fajr',
    completed: true,
  });
  assert.equal(markFajr.status, 200);
  assert.equal(markFajr.body.day.completedCount, 1);
  assert.equal(markFajr.body.day.percent, 20);

  const fajrDoc = await PrayerEntry.findOne({ userId: owner._id, dateKey: TODAY, prayerName: 'Fajr' });
  assert.ok(fajrDoc);
  assert.equal(fajrDoc.completed, true);
  assert.ok(fajrDoc.completedAt);

  // Mark Dhuhr as completed today
  const markDhuhr = await api(context.agent, 'post', '/api/prayer/toggle', {
    dateKey: TODAY,
    prayerName: 'Dhuhr',
    completed: true,
  });
  assert.equal(markDhuhr.status, 200);
  assert.equal(markDhuhr.body.day.completedCount, 2);
  assert.equal(markDhuhr.body.day.percent, 40);

  // Unmark Fajr (undo)
  const unmarkFajr = await api(context.agent, 'post', '/api/prayer/toggle', {
    dateKey: TODAY,
    prayerName: 'Fajr',
    completed: false,
  });
  assert.equal(unmarkFajr.status, 200);
  assert.equal(unmarkFajr.body.day.completedCount, 1);
  assert.equal(unmarkFajr.body.day.percent, 20);

  const unmarkDoc = await PrayerEntry.findOne({ userId: owner._id, dateKey: TODAY, prayerName: 'Fajr' });
  assert.equal(unmarkDoc.completed, false);
  assert.equal(unmarkDoc.completedAt, null);

  // Re-mark Fajr
  await api(context.agent, 'post', '/api/prayer/toggle', {
    dateKey: TODAY,
    prayerName: 'Fajr',
    completed: true,
  });
});

test('4. Editing historical prayer records on previous dates', async () => {
  // Mark 3 prayers on PAST_DATE
  for (const prayer of ['Fajr', 'Dhuhr', 'Asr']) {
    await api(context.agent, 'post', '/api/prayer/toggle', {
      dateKey: PAST_DATE,
      prayerName: prayer,
      completed: true,
    });
  }

  const pastDay = await prayerService.getPrayerDay(owner._id, PAST_DATE);
  assert.equal(pastDay.completedCount, 3);
  assert.equal(pastDay.percent, 60);

  // Access dedicated historical date view
  const pastPage = await context.agent.get(`/prayer/${PAST_DATE}`);
  assert.equal(pastPage.status, 200);
  assert.equal(pastPage.text.includes('3 / 5'), true);

  // Edit historical date: mark Maghrib on PAST_DATE
  const editPast = await api(context.agent, 'post', '/api/prayer/toggle', {
    dateKey: PAST_DATE,
    prayerName: 'Maghrib',
    completed: true,
  });
  assert.equal(editPast.status, 200);
  assert.equal(editPast.body.day.completedCount, 4);
  assert.equal(editPast.body.day.percent, 80);
});

test('5. Duplicate prevention: multiple toggles update existing document without duplicates', async () => {
  const countBefore = await PrayerEntry.countDocuments({ userId: owner._id, dateKey: TODAY, prayerName: 'Asr' });
  assert.equal(countBefore, 0);

  // Toggle Asr multiple times
  await api(context.agent, 'post', '/api/prayer/toggle', { dateKey: TODAY, prayerName: 'Asr', completed: true });
  await api(context.agent, 'post', '/api/prayer/toggle', { dateKey: TODAY, prayerName: 'Asr', completed: false });
  await api(context.agent, 'post', '/api/prayer/toggle', { dateKey: TODAY, prayerName: 'Asr', completed: true });

  const countAfter = await PrayerEntry.countDocuments({ userId: owner._id, dateKey: TODAY, prayerName: 'Asr' });
  assert.equal(countAfter, 1, 'Compound unique index must ensure exactly one record per user, date, and prayer');
});

test('6. Multi-user security: User A cannot access or modify User B’s prayer records', async () => {
  // Owner enables tracker and has prayers logged
  // Other user enables tracker
  await api(agentOther, 'patch', '/api/settings/features', {
    feature: 'prayerTracker',
    enabled: true,
  });

  // Other user visits /prayer for TODAY: should see 0 prayers completed (Owner has Fajr, Dhuhr, Asr logged)
  const otherPrayerPage = await agentOther.get(`/prayer/${TODAY}`);
  assert.equal(otherPrayerPage.status, 200);
  assert.equal(otherPrayerPage.text.includes('0 / 5'), true, 'User B must not see User A completed prayer count');

  // Other user calls analytics API: should have 0 total prayers
  const otherAnalytics = await api(agentOther, 'get', '/api/prayer/analytics');
  assert.equal(otherAnalytics.status, 200);
  assert.equal(otherAnalytics.body.analytics.totalOfferedAllTime, 0);
  assert.equal(otherAnalytics.body.analytics.today.completedCount, 0);

  // Owner queries analytics: has logged prayers
  const ownerAnalytics = await api(context.agent, 'get', '/api/prayer/analytics');
  assert.equal(ownerAnalytics.status, 200);
  assert.ok(ownerAnalytics.body.analytics.totalOfferedAllTime > 0);
  assert.ok(ownerAnalytics.body.analytics.today.completedCount >= 3);
});

test('7. Disabling the feature preserves prayer history and re-enabling restores it', async () => {
  // Count owner's prayer records in database
  const prayerCountBefore = await PrayerEntry.countDocuments({ userId: owner._id });
  assert.ok(prayerCountBefore > 0, 'Owner should have prayer records stored');

  // Disable feature
  await api(context.agent, 'patch', '/api/settings/features', {
    feature: 'prayerTracker',
    enabled: false,
  });

  // Verify records were NOT deleted in database
  const prayerCountAfterDisable = await PrayerEntry.countDocuments({ userId: owner._id });
  assert.equal(prayerCountAfterDisable, prayerCountBefore, 'Disabling feature must never delete prayer records');

  // Dashboard hides prayer card
  const dash = await context.agent.get('/');
  assert.equal(dash.text.includes('id="prayer-tracker-card"'), false);

  // Re-enable feature
  await api(context.agent, 'patch', '/api/settings/features', {
    feature: 'prayerTracker',
    enabled: true,
  });

  // Verify dashboard restores the card with existing count
  const dashRestored = await context.agent.get('/');
  assert.equal(dashRestored.text.includes('id="prayer-tracker-card"'), true);
  assert.equal(dashRestored.text.includes('Daily prayers'), true);

  // Dedicated view restores previous data
  const restoredPage = await context.agent.get(`/prayer/${TODAY}`);
  assert.equal(restoredPage.status, 200);
  assert.equal(restoredPage.text.includes('3 / 5'), true);
});

test('8. Analytics calculations correctly aggregate weekly, monthly, and streak data', async () => {
  // Complete all 5 prayers on YESTERDAY
  for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    await api(context.agent, 'post', '/api/prayer/toggle', {
      dateKey: YESTERDAY,
      prayerName: prayer,
      completed: true,
    });
  }

  // Complete all 5 prayers on TODAY
  for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    await api(context.agent, 'post', '/api/prayer/toggle', {
      dateKey: TODAY,
      prayerName: prayer,
      completed: true,
    });
  }

  const analytics = await prayerService.getPrayerAnalytics(owner._id, TODAY);

  // Today must be 5/5 (100%)
  assert.equal(analytics.today.completedCount, 5);
  assert.equal(analytics.today.percent, 100);

  // Weekly breakdown must include the completed days
  assert.ok(analytics.week.completed >= 10);
  assert.equal(analytics.week.possible, 35);

  // Streak must be at least 2 days (YESTERDAY + TODAY were 5/5)
  assert.ok(analytics.streak >= 2, `Streak should be >= 2, got ${analytics.streak}`);

  // Per-prayer stats must contain all 5 prayers
  assert.equal(analytics.prayers.length, 5);
  assert.ok(analytics.prayers.every((p) => p.count >= 2));
});
