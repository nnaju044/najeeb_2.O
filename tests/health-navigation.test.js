'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, stopTestApp, registerOwner, startChallenge, api } = require('./helpers/app');
const User = require('../models/User');

let context;

test.before(async () => {
  context = await startTestApp('health_navigation_test');
  await registerOwner(context.agent);
  await startChallenge(context.agent, '2026-01-01');
  // Enable prayer tracker to test prayer navigation as well
  await User.updateOne({ email: 'owner@example.com' }, { prayerTrackerEnabled: true });
});

test.after(async () => {
  await stopTestApp(context);
});

test('1. Every individual Health tracking page renders "Back to Health" navigation', async () => {
  const pages = ['/water', '/food', '/sleep', '/weight', '/habits', '/prayer'];

  for (const pageUrl of pages) {
    const res = await context.agent.get(pageUrl);
    assert.equal(res.status, 200, `Expected 200 for ${pageUrl}`);
    assert.match(res.text, /Back to Health/, `Missing "Back to Health" link in ${pageUrl}`);
    assert.match(res.text, /data-back-to-health/, `Missing data-back-to-health attribute in ${pageUrl}`);
    assert.match(res.text, /subnav-bar/, `Missing subnav-bar wrapper in ${pageUrl}`);
    assert.match(res.text, /href="\/health/, `Back link does not point to /health in ${pageUrl}`);
  }
});

test('2. "Back to Health" preserves past date parameter when viewing historical date', async () => {
  const historicalDate = '2026-01-15';
  const historicalPages = [
    `/water/${historicalDate}`,
    `/food/${historicalDate}`,
    `/sleep/${historicalDate}`,
    `/habits/${historicalDate}`,
    `/prayer/${historicalDate}`,
  ];

  for (const pageUrl of historicalPages) {
    const res = await context.agent.get(pageUrl);
    assert.equal(res.status, 200, `Expected 200 for ${pageUrl}`);
    assert.match(
      res.text,
      new RegExp(`href="/health\\?date=${historicalDate}"`),
      `Expected back link to preserve date ${historicalDate} in ${pageUrl}`
    );
  }
});

test('3. Health overview supports date preservation via query parameter and path', async () => {
  const targetDate = '2026-01-15';

  const resQuery = await context.agent.get(`/health?date=${targetDate}`);
  assert.equal(resQuery.status, 200);
  assert.match(resQuery.text, /Health/);

  const resPath = await context.agent.get(`/health/${targetDate}`);
  assert.equal(resPath.status, 200);
  assert.match(resPath.text, /Health/);
});

test('4. Saving a health entry immediately reflects on Health overview page', async () => {
  const dateKey = '2026-01-20';

  // Add water
  const waterRes = await api(context.agent, 'post', '/api/water', {
    dateKey,
    amountMl: 750,
  });
  assert.equal(waterRes.status, 200);

  // Visit Health overview for that date
  const healthRes = await context.agent.get(`/health?date=${dateKey}`);
  assert.equal(healthRes.status, 200);
  // Verify water total is reflected
  assert.match(healthRes.text, /0\.75/);
});

test('5. Direct access to tracking detail pages provides reliable fallback link to /health', async () => {
  // Directly requesting without referer header
  const res = await context.agent.get('/water');
  assert.equal(res.status, 200);
  assert.match(res.text, /href="\/health"/);
});
