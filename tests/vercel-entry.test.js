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

test('12. sanitizeTarget rejects external URLs, protocol tricks, encoded slashes/backslashes, dot segments, and control characters', () => {
  const { sanitizeTarget } = require('../middleware/auth');

  // --- Valid local paths and dot normalization ---
  assert.equal(sanitizeTarget('/dashboard'), '/dashboard');
  assert.equal(sanitizeTarget('/'), '/');
  assert.equal(sanitizeTarget('/health?date=2026-01-01'), '/health?date=2026-01-01');
  assert.equal(sanitizeTarget('/dashboard?tab=overview'), '/dashboard?tab=overview');
  assert.equal(sanitizeTarget('/login-history'), '/login-history');
  assert.equal(sanitizeTarget('/register-device'), '/register-device');
  assert.equal(sanitizeTarget('/dashboard/./settings'), '/dashboard/settings');
  assert.equal(sanitizeTarget('/dashboard/../dashboard'), '/dashboard');

  // --- Blocked exact paths (including trailing slashes and nested queries) collapse to / ---
  assert.equal(sanitizeTarget('/login'), '/');
  assert.equal(sanitizeTarget('/login/'), '/');
  assert.equal(sanitizeTarget('/login?next=%2Fhealth'), '/');
  assert.equal(sanitizeTarget('/register'), '/');
  assert.equal(sanitizeTarget('/register/'), '/');
  assert.equal(sanitizeTarget('/register?next=%2Fhealth'), '/');
  assert.equal(sanitizeTarget('/app.js'), '/');
  assert.equal(sanitizeTarget('/app.js/'), '/');
  assert.equal(sanitizeTarget('/app.js?next=%2Fapp.js'), '/');

  // --- External absolute URLs and localhost variants are rejected ---
  assert.equal(sanitizeTarget('https://evil.example/path'), '/');
  assert.equal(sanitizeTarget('http://evil.example/path'), '/');
  assert.equal(sanitizeTarget('ftp://evil.example/path'), '/');
  assert.equal(sanitizeTarget('javascript:alert(1)'), '/');
  assert.equal(sanitizeTarget('data:text/html,<h1>x</h1>'), '/');
  assert.equal(sanitizeTarget('http://localhost'), '/');
  assert.equal(sanitizeTarget('http://localhost:3000'), '/');
  assert.equal(sanitizeTarget('http://127.0.0.1'), '/');
  assert.equal(sanitizeTarget('//localhost'), '/');
  assert.equal(sanitizeTarget('//127.0.0.1'), '/');

  // --- Protocol-relative URLs are rejected ---
  assert.equal(sanitizeTarget('//evil.example/path'), '/');
  assert.equal(sanitizeTarget('//evil.example'), '/');
  assert.equal(sanitizeTarget('///evil.example'), '/');
  assert.equal(sanitizeTarget('////evil.example'), '/');

  // --- Backslash tricks (raw and nested) are rejected ---
  assert.equal(sanitizeTarget('/\\evil.example'), '/');
  assert.equal(sanitizeTarget('/\\\\evil.example/path'), '/');
  assert.equal(sanitizeTarget('/test\\evil.example'), '/');
  assert.equal(sanitizeTarget('/dashboard\\something'), '/');

  // --- Encoded slashes and backslashes (including 1–6 layers of nested encoding) ---
  assert.equal(sanitizeTarget('/%2fevil.example'), '/');
  assert.equal(sanitizeTarget('/%2Fevil.example'), '/');
  assert.equal(sanitizeTarget('/%5cevil.example'), '/');
  assert.equal(sanitizeTarget('/%5Cevil.example'), '/');
  assert.equal(sanitizeTarget('/%2f%2fevil.example'), '/');
  assert.equal(sanitizeTarget('/%5c%5cevil.example'), '/');
  assert.equal(sanitizeTarget('/%252f%252fevil.example'), '/');
  assert.equal(sanitizeTarget('/%255cevil.example'), '/');
  assert.equal(sanitizeTarget('/%2f/evil.example'), '/');
  assert.equal(sanitizeTarget('/%5c/evil.example'), '/');

  // Verify 1–6 layers of nested encoding are all rejected
  let nestedSlash = '//evil.example';
  let nestedBackslash = '/%5cevil.example';
  let nestedTraversal = '/%2e%2e%2flogin';
  let nestedScheme = '/%2fhttps://evil.example';
  for (let layer = 1; layer <= 6; layer++) {
    nestedSlash = '/' + encodeURIComponent(nestedSlash.slice(1));
    assert.equal(sanitizeTarget(nestedSlash), '/', `Layer ${layer} nested slash must be rejected`);

    assert.equal(sanitizeTarget(nestedBackslash), '/', `Layer ${layer} nested backslash must be rejected`);
    nestedBackslash = nestedBackslash.replace(/%/g, '%25');

    assert.equal(sanitizeTarget(nestedTraversal), '/', `Layer ${layer} nested traversal must be rejected`);
    nestedTraversal = nestedTraversal.replace(/%/g, '%25');

    assert.equal(sanitizeTarget(nestedScheme), '/', `Layer ${layer} nested scheme must be rejected`);
    nestedScheme = nestedScheme.replace(/%/g, '%25');
  }

  // --- Dot segment path traversal tricks are rejected ---
  assert.equal(sanitizeTarget('/..//evil.example'), '/');
  assert.equal(sanitizeTarget('/.//evil.example'), '/');
  assert.equal(sanitizeTarget('/test/..//evil.example'), '/');
  assert.equal(sanitizeTarget('/%2e%2e//evil.example'), '/');
  assert.equal(sanitizeTarget('/%2e//evil.example'), '/');
  assert.equal(sanitizeTarget('/foo/../login'), '/');
  assert.equal(sanitizeTarget('/foo/../register'), '/');
  assert.equal(sanitizeTarget('/foo/../app.js'), '/');
  assert.equal(sanitizeTarget('/foo/../../login'), '/');
  assert.equal(sanitizeTarget('/%2e%2e%2flogin'), '/');
  assert.equal(sanitizeTarget('/..%2flogin'), '/');
  assert.equal(sanitizeTarget('/%2e%2e/login'), '/');
  assert.equal(sanitizeTarget('/%2e%2e/app.js'), '/');

  // --- Control characters are rejected ---
  assert.equal(sanitizeTarget('/dashboard\t'), '/');
  assert.equal(sanitizeTarget('/dashboard\n'), '/');
  assert.equal(sanitizeTarget('/dashboard\r'), '/');
  assert.equal(sanitizeTarget('/dashboard\0'), '/');
  assert.equal(sanitizeTarget('\x01/dashboard'), '/');

  // --- Malformed / non-string inputs ---
  assert.equal(sanitizeTarget(''), '/');
  assert.equal(sanitizeTarget(null), '/');
  assert.equal(sanitizeTarget(undefined), '/');
  assert.equal(sanitizeTarget(42), '/');
  assert.equal(sanitizeTarget('relative-path'), '/');
  assert.equal(sanitizeTarget('/%ff'), '/');
  assert.equal(sanitizeTarget('/%2'), '/');

  // --- Recursive next= stripped; other params preserved without re-encoding ---
  assert.equal(sanitizeTarget('/health?next=%2Flogin'), '/health');
  assert.equal(sanitizeTarget('/health?date=2026-01-01&next=%2Flogin'), '/health?date=2026-01-01');
  assert.equal(sanitizeTarget('/time?view=week&next=%2Fapp.js&tz=UTC'), '/time?view=week&tz=UTC');
  assert.equal(
    sanitizeTarget('/search?q=foo%2Fbar&mode=deep%20scan'),
    '/search?q=foo%2Fbar&mode=deep%20scan'
  );
  assert.equal(sanitizeTarget('/data?val=%2520&tag=test'), '/data?val=%2520&tag=test');
});

test('13. requireAuth integration: redirect behaviour for all request types', () => {
  const { requireAuth } = require('../middleware/auth');

  function runRequireAuth(url, originalUrl, method) {
    let redirectedTo = null;
    const req = {
      method: method || 'GET',
      url,
      originalUrl: originalUrl || url,
      get: () => '',
      user: null,
    };
    const res = { redirect: (loc) => { redirectedTo = loc; } };
    requireAuth(req, res, () => {});
    return redirectedTo;
  }

  // (a) Normal protected page
  assert.equal(runRequireAuth('/dashboard'), '/login?next=%2Fdashboard');

  // (b) Blocked paths → next=/
  assert.equal(runRequireAuth('/login'), '/login?next=%2F');
  assert.equal(runRequireAuth('/register'), '/login?next=%2F');
  assert.equal(runRequireAuth('/app.js'), '/login?next=%2F');

  // (c) External URL injected into originalUrl → next=/
  assert.equal(runRequireAuth('https://evil.example/steal'), '/login?next=%2F');
  assert.equal(runRequireAuth('//evil.example'), '/login?next=%2F');
  assert.equal(runRequireAuth('/\\evil.example'), '/login?next=%2F');

  // (d) Nested encoded URLs in requireAuth → next=/
  let nested = '//evil.example';
  for (let layer = 1; layer <= 6; layer++) {
    nested = '/' + encodeURIComponent(nested.slice(1));
    assert.equal(runRequireAuth(nested), '/login?next=%2F', `requireAuth must reject layer ${layer} nested URL`);
  }

  // (e) Query params preserved without unnecessary decoding / re-encoding
  assert.equal(
    runRequireAuth('/dashboard?tab=overview'),
    '/login?next=%2Fdashboard%3Ftab%3Doverview'
  );
  assert.equal(
    runRequireAuth('/search?q=foo%2Fbar&mode=deep%20scan'),
    '/login?next=%2Fsearch%3Fq%3Dfoo%252Fbar%26mode%3Ddeep%2520scan'
  );

  // (f) Nested next= stripped, other params kept
  assert.equal(
    runRequireAuth('/health?date=2026-01-01&next=%2Flogin'),
    '/login?next=%2Fhealth%3Fdate%3D2026-01-01'
  );

  // (g) POST always uses /
  assert.equal(runRequireAuth('/dashboard', '/dashboard', 'POST'), '/login?next=%2F');

  // (h) Paths starting with /login- or /register- are NOT blocked
  assert.equal(runRequireAuth('/login-history'), '/login?next=%2Flogin-history');
  assert.equal(runRequireAuth('/register-device'), '/login?next=%2Fregister-device');

  // (i) Root / is valid
  assert.equal(runRequireAuth('/'), '/login?next=%2F');

  // (j) Authenticated users pass through
  let calledNext = false;
  const authReq = { user: { _id: '123' }, method: 'GET', url: '/time', originalUrl: '/time', get: () => '' };
  requireAuth(authReq, {}, () => { calledNext = true; });
  assert.ok(calledNext, 'Authenticated requests must call next()');

  // (k) JSON API returns 401, not redirect
  let jsonStatus = null;
  let jsonBody = null;
  const apiReq = {
    method: 'GET', url: '/api/data', originalUrl: '/api/data',
    baseUrl: '', path: '/api/data',
    get: (h) => h === 'accept' ? 'application/json' : '',
    user: null, xhr: false,
  };
  const apiRes = { status: (s) => { jsonStatus = s; return { json: (b) => { jsonBody = b; } }; } };
  requireAuth(apiReq, apiRes, () => {});
  assert.equal(jsonStatus, 401);
  assert.equal(jsonBody.error, 'Please sign in again.');
});

test('14. authController safeNext and login redirect flow security', async () => {
  const { safeNext, showLogin } = require('../controllers/authController');

  // --- safeNext unit tests ---
  // Preserves legitimate internal paths and query parameters
  assert.equal(safeNext('/dashboard'), '/dashboard');
  assert.equal(safeNext('/'), '/');
  assert.equal(safeNext('/dashboard?tab=overview'), '/dashboard?tab=overview');
  assert.equal(safeNext('/health?date=2026-01-01'), '/health?date=2026-01-01');
  assert.equal(safeNext('/time?view=week&tz=UTC'), '/time?view=week&tz=UTC');
  assert.equal(safeNext('/login-history'), '/login-history');
  assert.equal(safeNext('/search?q=foo%2Fbar&mode=deep%20scan'), '/search?q=foo%2Fbar&mode=deep%20scan');

  // Rejects external origins
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext('https://evil.example/path?evil=1'), '/');
  assert.equal(safeNext('http://evil.example'), '/');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext('///evil.example'), '/');
  assert.equal(safeNext('http://localhost'), '/');
  assert.equal(safeNext('http://localhost:3000'), '/');
  assert.equal(safeNext('//localhost'), '/');
  assert.equal(safeNext('javascript:alert(1)'), '/');

  // Rejects backslashes
  assert.equal(safeNext('/\\evil.example'), '/');
  assert.equal(safeNext('/\\\\evil.example'), '/');
  assert.equal(safeNext('/test\\evil.example'), '/');

  // Rejects encoded slashes and backslashes
  assert.equal(safeNext('/%2fevil.example'), '/');
  assert.equal(safeNext('/%2Fevil.example'), '/');
  assert.equal(safeNext('/%5cevil.example'), '/');
  assert.equal(safeNext('/%5Cevil.example'), '/');
  assert.equal(safeNext('/%2f%2fevil.example'), '/');
  assert.equal(safeNext('/%252f%252fevil.example'), '/');

  // Rejects 1–6 layers of nested encoding in safeNext
  let nestedSafeSlash = '//evil.example';
  let nestedSafeBackslash = '/%5cevil.example';
  for (let layer = 1; layer <= 6; layer++) {
    nestedSafeSlash = '/' + encodeURIComponent(nestedSafeSlash.slice(1));
    assert.equal(safeNext(nestedSafeSlash), '/', `safeNext must reject layer ${layer} nested slash`);

    assert.equal(safeNext(nestedSafeBackslash), '/', `safeNext must reject layer ${layer} nested backslash`);
    nestedSafeBackslash = nestedSafeBackslash.replace(/%/g, '%25');
  }

  // Rejects dot segment traversal
  assert.equal(safeNext('/..//evil.example'), '/');
  assert.equal(safeNext('/.//evil.example'), '/');
  assert.equal(safeNext('/test/..//evil.example'), '/');
  assert.equal(safeNext('/%2e%2e//evil.example'), '/');
  assert.equal(safeNext('/foo/../login'), '/');
  assert.equal(safeNext('/foo/../app.js'), '/');
  assert.equal(safeNext('/%2e%2e%2flogin'), '/');

  // Normalizes safe internal dot segments
  assert.equal(safeNext('/dashboard/./settings'), '/dashboard/settings');
  assert.equal(safeNext('/dashboard/../dashboard'), '/dashboard');

  // Rejects blocked exact paths
  assert.equal(safeNext('/login'), '/');
  assert.equal(safeNext('/login/'), '/');
  assert.equal(safeNext('/register'), '/');
  assert.equal(safeNext('/register/'), '/');
  assert.equal(safeNext('/app.js'), '/');
  assert.equal(safeNext('/app.js/'), '/');

  // --- showLogin integration tests: crafted query parameter handling ---
  async function runShowLogin(nextQuery) {
    let renderedView = null;
    let renderedData = null;
    const req = {
      query: { next: nextQuery },
      user: null,
    };
    const res = {
      redirect: () => {},
      render: (view, data) => {
        renderedView = view;
        renderedData = data;
      },
    };
    await showLogin(req, res);
    return { renderedView, renderedData };
  }

  // External URLs in query param must be sanitized to /
  const r1 = await runShowLogin('https://evil.example');
  assert.equal(r1.renderedView, 'login');
  assert.equal(r1.renderedData.next, '/');

  const r2 = await runShowLogin('//evil.example');
  assert.equal(r2.renderedData.next, '/');

  const r3 = await runShowLogin('/\\evil.example');
  assert.equal(r3.renderedData.next, '/');

  const r4 = await runShowLogin('/%2fevil.example');
  assert.equal(r4.renderedData.next, '/');

  const r5 = await runShowLogin('/..//evil.example');
  assert.equal(r5.renderedData.next, '/');

  // Legitimate internal destinations must be preserved in showLogin
  const r6 = await runShowLogin('/dashboard?tab=overview');
  assert.equal(r6.renderedData.next, '/dashboard?tab=overview');

  const r7 = await runShowLogin('/health?date=2026-01-01');
  assert.equal(r7.renderedData.next, '/health?date=2026-01-01');
});


