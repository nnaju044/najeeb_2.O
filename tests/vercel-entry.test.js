'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const appEntry = require('../app');
const { startTestApp, stopTestApp } = require('./helpers/app');

test('1. Vercel entry export format: default export must be a function', () => {
  assert.equal(typeof appEntry, 'function', 'Default export must be a function for Vercel');
  assert.equal(typeof appEntry.default, 'function', 'appEntry.default must also be a function');
  assert.equal(typeof appEntry.createApp, 'function', 'createApp must be exported for backward compatibility');
});

test('2. vercel.json is valid and correctly configured', () => {
  const vercelJsonPath = path.join(__dirname, '..', 'vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist in root');
  const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert.equal(config.version, 2);
  assert.ok(config.rewrites && config.rewrites.length > 0, 'rewrites must be configured');
  assert.equal(config.rewrites[0].destination, '/app.js', 'rewrites must route to /app.js');
  assert.ok(config.functions?.['app.js']?.includeFiles, 'includeFiles for app.js must be configured');
});

test('3. serverlessHandler executes and serves the login page over HTTP', async () => {
  // Spin up an HTTP server wrapping serverlessHandler to simulate Vercel runtime
  const server = http.createServer((req, res) => {
    appEntry(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/login`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Sign in/);
    assert.match(html, /Jeebs 2\.O/);
    assert.match(html, /Najeeb_2\.O_LOGO\.png/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('4. session storage is backed by MongoStore with proxy and secure cookie configuration', () => {
  const sessionConfig = fs.readFileSync(path.join(__dirname, '..', 'config', 'session.js'), 'utf8');
  assert.match(sessionConfig, /MongoStore/, 'Must use MongoStore so sessions persist across serverless invocations');
  assert.match(sessionConfig, /proxy:\s*true/, 'Must enable proxy for reverse proxy environments like Vercel');
  assert.match(sessionConfig, /httpOnly:\s*true/, 'Must use httpOnly session cookies');
  assert.match(sessionConfig, /collectionName:\s*['"]sessions['"]/, 'Must store sessions in sessions collection');
});

test('5. production enforces required SESSION_SECRET and MONGODB_URI', () => {
  const appContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appContent, /SESSION_SECRET.*required/i, 'Must enforce SESSION_SECRET in production');
  assert.match(appContent, /MONGODB_URI.*required/i, 'Must enforce MONGODB_URI');
});

test('6. engines.node pins to Node.js 22.x LTS for Vercel', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.engines?.node, '22.x', 'package.json engines.node must be pinned to 22.x LTS');
});

test('7. resolveOriginalUrl correctly maps Vercel rewritten paths and query strings', () => {
  const resolve = appEntry.resolveOriginalUrl;
  assert.equal(typeof resolve, 'function');

  // Vercel rewrite with x-matched-path
  assert.equal(resolve({ url: '/app.js', headers: { 'x-matched-path': '/login' } }), '/login');
  assert.equal(
    resolve({ url: '/app.js?next=%2Fhealth', headers: { 'x-matched-path': '/login' } }),
    '/login?next=%2Fhealth'
  );
  assert.equal(resolve({ url: '/app.js', headers: { 'x-matched-path': '/' } }), '/');
  assert.equal(resolve({ url: '/app.js', headers: { 'x-matched-path': '/health' } }), '/health');

  // Direct access to /app.js without header
  assert.equal(resolve({ url: '/app.js', headers: {} }), '/');
  assert.equal(resolve({ url: '/app.js?next=%2Ftest', headers: {} }), '/?next=%2Ftest');

  // Standard non-rewritten URLs
  assert.equal(resolve({ url: '/time', headers: {} }), '/time');
  assert.equal(resolve({ url: '/login', headers: {} }), '/login');
});

test('8. simulated Vercel rewrite to /login returns HTTP 200 without redirect loop', async () => {
  const server = http.createServer((req, res) => {
    appEntry(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // Simulate Vercel routing to /app.js when client requested /login
    const res = await fetch(`http://127.0.0.1:${port}/app.js`, {
      headers: {
        'x-matched-path': '/login',
      },
      redirect: 'manual',
    });

    assert.equal(res.status, 200, 'Must return 200 and not redirect on /login');
    const html = await res.text();
    assert.match(html, /Sign in/);
    assert.doesNotMatch(html, /ERR_TOO_MANY_REDIRECTS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('9. simulated Vercel rewrite to / redirects to /login once without /app.js in next param', async () => {
  const server = http.createServer((req, res) => {
    appEntry(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // Simulate Vercel routing to /app.js when client requested /
    const res = await fetch(`http://127.0.0.1:${port}/app.js`, {
      headers: {
        'x-matched-path': '/',
      },
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.equal(location, '/login?next=%2F');
    assert.doesNotMatch(location, /app\.js/, 'Next parameter must never contain /app.js');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('10. direct request to /app.js sanitizes next destination and prevents nested loops', async () => {
  const server = http.createServer((req, res) => {
    appEntry(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // Client directly sends /app.js?next=%2Fapp.js
    const res = await fetch(`http://127.0.0.1:${port}/app.js?next=%2Fapp.js`, {
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.equal(location, '/login?next=%2F', 'Must collapse /app.js to root /');
    assert.doesNotMatch(location, /app\.js/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('11. static assets are accessible without authentication', async () => {
  const server = http.createServer((req, res) => {
    appEntry(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`, {
      redirect: 'manual',
    });

    assert.equal(res.status, 200, 'Static asset must return 200');
    const json = await res.json();
    assert.match(json.name, /Jeebs 2\.O/);
    assert.equal(json.short_name, 'Jeebs');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('12. requireAuth and safeNext prevent open redirects and loops', () => {
  const { requireAuth } = require('../middleware/auth');

  function runRequireAuth(url, originalUrl) {
    let redirectedTo = null;
    const req = { method: 'GET', url, originalUrl: originalUrl || url, get: () => '', user: null };
    const res = { redirect: (loc) => { redirectedTo = loc; } };
    requireAuth(req, res, () => {});
    return redirectedTo;
  }

  // 1. Unauthenticated request to /time redirects to /login?next=%2Ftime
  assert.equal(runRequireAuth('/time'), '/login?next=%2Ftime');

  // 2. Unauthenticated request to root / redirects to /login?next=%2F (not /app.js)
  assert.equal(runRequireAuth('/'), '/login?next=%2F');

  // 3. Request with /app.js collapses to /
  assert.equal(runRequireAuth('/app.js'), '/login?next=%2F');
  assert.equal(runRequireAuth('/app.js?next=%2Fapp.js'), '/login?next=%2F');

  // 4. Request already at /login never nests next
  assert.equal(runRequireAuth('/login'), '/login?next=%2F');
  assert.equal(runRequireAuth('/login?next=%2Fhealth'), '/login?next=%2F');
});




