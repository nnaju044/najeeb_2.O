'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const User = require('../models/User');
const WaterEntry = require('../models/WaterEntry');
const Challenge = require('../models/Challenge');
const { exportJson, exportCsv, toCsv, csvEscape } = require('../services/exportService');
const { createApp } = require('../app');
const {
  startTestApp,
  stopTestApp,
  registerOwner,
  startChallenge,
  login,
  api,
} = require('./helpers/app');

let context;
let owner;
let other;

const TODAY = '2026-02-10';

test.before(async () => {
  context = await startTestApp('lifeos_export');
  await registerOwner(context.agent);
  await startChallenge(context.agent, '2026-01-01');
  owner = await User.findOne({ email: 'owner@example.com' });

  await api(context.agent, 'post', '/api/water', { dateKey: TODAY, amountMl: 750 });
  await api(context.agent, 'post', '/api/time/hour', {
    dateKey: TODAY,
    hour: 8,
    productive: 30,
    unproductive: 15,
    rest: 15,
  });

  // A second account, created directly because registration is closed.
  other = await User.create({
    email: 'second@example.com',
    name: 'Second',
    passwordHash: await User.hashPassword('second-password-123'),
  });
  await Challenge.create({ userId: other._id, startDate: '2026-01-10' });
  await WaterEntry.create({ userId: other._id, dateKey: TODAY, amountMl: 300 });
});

test.after(async () => {
  await stopTestApp(context);
});

test('JSON export contains every collection for that user and no secrets', async () => {
  const payload = await exportJson(owner._id);
  assert.equal(payload.timezone, 'Asia/Kolkata');
  assert.ok(payload.data.waterEntries.length >= 1);
  assert.ok(payload.data.hourlyTimeLogs.length >= 1);
  assert.ok(payload.data.challenge.length === 1);
  assert.ok(payload.data.challenge[0].startDate === '2026-01-01');
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('passwordHash'), false);
  assert.equal(serialized.includes('csrfToken'), false);
  assert.equal(
    payload.data.waterEntries.every((entry) => String(entry.userId) === owner._id.toString()),
    true
  );
});

test('CSV exports are properly escaped and scoped to the user', async () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('with,comma'), '"with,comma"');
  assert.equal(csvEscape('quote"inside'), '"quote""inside"');
  assert.equal(csvEscape({ a: 1 }), '"{""a"":1}"');
  assert.equal(toCsv([{ a: 1, b: 'x' }], ['a', 'b']), 'a,b\n1,x');

  const { csv, filename, rowCount } = await exportCsv(owner._id, 'water');
  const lines = csv.trim().split('\n');
  assert.equal(filename.startsWith('jeebs-water-'), true);
  assert.equal(lines[0], 'dateKey,amountMl,loggedAt');
  assert.equal(rowCount, lines.length - 1);
  assert.equal(
    /^2026-02-10,300,/m.test(csv),
    false,
    "the other user's 300 ml entry must not be exported"
  );

  await assert.rejects(() => exportCsv(owner._id, 'passwords'), /Unknown export dataset/);
});

test('export endpoints return downloadable files only to the signed-in user', async () => {
  const json = await context.agent.get('/export/json');
  assert.equal(json.status, 200);
  assert.match(json.headers['content-disposition'], /attachment; filename="jeebs-export-/);

  const csv = await context.agent.get('/export/csv/water');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);

  const guest = await request(context.app).get('/export/json');
  assert.equal(guest.status, 401);
});

test('one user cannot read or delete another user\u2019s data', async () => {
  const secondAgent = request.agent(context.app);
  const response = await login(secondAgent, 'second@example.com', 'second-password-123');
  assert.equal(response.status, 303);

  const ownersEntry = await WaterEntry.findOne({ userId: owner._id });
  const attempt = await api(secondAgent, 'delete', `/api/water/${ownersEntry._id}`);
  assert.equal(attempt.status, 404);

  const stillThere = await WaterEntry.findById(ownersEntry._id);
  assert.ok(stillThere);

  const analytics = await api(secondAgent, 'get', '/api/analytics?preset=7d');
  assert.equal(analytics.status, 200);
  assert.equal(analytics.body.analytics.totals.avgWaterMl, 0);

  const page = await secondAgent.get(`/water/${TODAY}`);
  assert.equal(page.status, 200);
  assert.equal(page.text.includes('0.30'), true, 'the second user sees their own 300 ml total');
  assert.equal(page.text.includes('0.75'), false, "the owner's 750 ml total must not leak");
});

test('records and sessions survive an app restart against the same database', async () => {
  const restartedApp = createApp({
    mongoUrl: context.uri,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    secureCookies: false,
  });
  const restartedAgent = request.agent(restartedApp);
  await login(restartedAgent, 'owner@example.com', 'strong-password-123');

  const waterPage = await restartedAgent.get('/water');
  assert.equal(waterPage.status, 200);
  assert.match(waterPage.text, /750/);

  const challenge = await Challenge.findOne({ userId: owner._id });
  assert.equal(challenge.startDate, '2026-01-01');
  assert.equal(await WaterEntry.countDocuments({ userId: owner._id }), 1);
});

test('duplicate prevention survives concurrent replays', async () => {
  const payload = { dateKey: TODAY, amountMl: 400, clientId: 'concurrent-offline-water' };
  const [a, b] = await Promise.all([
    api(context.agent, 'post', '/api/water', payload),
    api(context.agent, 'post', '/api/water', payload),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(await WaterEntry.countDocuments({ userId: owner._id, clientId: 'concurrent-offline-water' }), 1);
  assert.equal(await WaterEntry.countDocuments({ userId: owner._id }), 2);
});
