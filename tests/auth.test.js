'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestApp, stopTestApp, getCsrf, registerOwner, login } = require('./helpers/app');

let context;

test.before(async () => {
  context = await startTestApp('lifeos_auth');
});

test.after(async () => {
  await stopTestApp(context);
});

test('login page is accessible to guests', async () => {
  const response = await context.agent.get('/login');
  assert.equal(response.status, 200);
  assert.match(response.text, /Sign in/);
});

test('registration creates user account and signs them in', async () => {
  const { response } = await registerOwner(context.agent);
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/challenge');

  const challengePage = await context.agent.get('/challenge');
  assert.equal(challengePage.status, 200);
  assert.match(challengePage.text, /Start your challenge/);
});

test('multiple users can register with unique emails', async () => {
  const second = require('supertest').agent(context.app);
  const token = await getCsrf(second, '/register');
  const response = await second
    .post('/register')
    .type('form')
    .send({
      _csrf: token,
      email: 'second@example.com',
      password: 'another-password-123',
      confirmPassword: 'another-password-123',
      name: 'Second User',
    });
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/challenge');
});

test('duplicate email registration is rejected', async () => {
  const third = require('supertest').agent(context.app);
  const token = await getCsrf(third, '/register');
  const response = await third
    .post('/register')
    .type('form')
    .send({
      _csrf: token,
      email: 'owner@example.com',
      password: 'another-password-123',
      confirmPassword: 'another-password-123',
    });
  assert.equal(response.status, 409);
  assert.match(response.text, /already exists/i);
});

test('password hashes are stored, never the plain password', async () => {
  const User = require('../models/User');
  const user = await User.findOne({ email: 'owner@example.com' }).select('+passwordHash');
  assert.ok(user.passwordHash.startsWith('$2'));
  assert.notEqual(user.passwordHash, 'strong-password-123');
  assert.equal(await user.verifyPassword('strong-password-123'), true);
  assert.equal(await user.verifyPassword('wrong-password'), false);
});

test('wrong credentials are rejected with a generic message', async () => {
  const other = require('supertest').agent(context.app);
  const response = await login(other, 'owner@example.com', 'not-the-password');
  assert.equal(response.status, 401);
  assert.match(response.text, /Email or password is incorrect/);
});

test('protected pages redirect to login when signed out', async () => {
  const guest = require('supertest').agent(context.app);
  const response = await guest.get('/time');
  assert.equal(response.status, 302);
  assert.match(response.headers.location, /^\/login\?next=/);
});

test('protected API returns 401 JSON instead of a redirect', async () => {
  const guest = require('supertest').agent(context.app);
  const response = await guest.get('/api/analytics?preset=7d');
  assert.equal(response.status, 401);
  assert.match(response.body.error, /sign in/i);
});

test('state-changing requests require a CSRF token', async () => {
  const other = require('supertest').agent(context.app);
  await login(other, 'owner@example.com', 'strong-password-123');
  const response = await other
    .post('/api/water')
    .set('Accept', 'application/json')
    .send({ dateKey: '2026-01-01', amountMl: 250 });
  assert.equal(response.status, 403);
});

test('login regenerates the session id and sets an httpOnly cookie', async () => {
  const other = require('supertest').agent(context.app);
  const response = await login(other, 'owner@example.com', 'strong-password-123');
  assert.equal(response.status, 302);

  const cookies = response.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('lifeos.sid='));
  assert.ok(sessionCookie, 'session cookie should be set');
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
});

test('logout clears the session', async () => {
  const other = require('supertest').agent(context.app);
  await login(other, 'owner@example.com', 'strong-password-123');
  const token = await getCsrf(other, '/settings');
  const logout = await other.post('/logout').type('form').send({ _csrf: token });
  assert.equal(logout.status, 302);

  const dashboard = await other.get('/');
  assert.equal(dashboard.status, 302);
  assert.match(dashboard.headers.location, /^\/login/);
});

test('security headers and a strict script CSP are present', async () => {
  const response = await context.agent.get('/login');
  const csp = response.headers['content-security-policy'];
  assert.ok(csp);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('password inputs include visibility toggle buttons with eye icons across login, register and settings', async () => {
  const guest = require('supertest').agent(context.app);

  // Login page
  const loginRes = await guest.get('/login');
  assert.equal(loginRes.status, 200);
  assert.match(loginRes.text, /class="password-toggle"/);
  assert.match(loginRes.text, /data-toggle-password="password"/);
  assert.match(loginRes.text, /data-lucide="eye"/);

  // Register page
  const regRes = await guest.get('/register');
  assert.equal(regRes.status, 200);
  assert.match(regRes.text, /data-toggle-password="password"/);
  assert.match(regRes.text, /data-toggle-password="confirmPassword"/);

  // Settings page (requires authentication)
  const settingsRes = await context.agent.get('/settings');
  assert.equal(settingsRes.status, 200);
  assert.match(settingsRes.text, /data-toggle-password="current-password"/);
  assert.match(settingsRes.text, /data-toggle-password="new-password"/);
  assert.match(settingsRes.text, /data-toggle-password="confirm-new-password"/);
});
