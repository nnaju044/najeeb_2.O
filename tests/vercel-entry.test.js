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


