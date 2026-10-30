'use strict';

/**
 * Test harness: a real Express app on a real (in-memory) MongoDB, driven over
 * HTTP with supertest. No route is stubbed and no service is mocked.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

const { createApp } = require('../../app');
const { ensureGlobalLibraries } = require('../../services/seedService');

process.env.NODE_ENV = 'test';

async function startTestApp(name = 'lifeos_test') {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri(name);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await ensureGlobalLibraries();

  const app = createApp({
    mongoUrl: uri,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    secureCookies: false,
  });

  return { app, mongod, uri, agent: request.agent(app) };
}

async function stopTestApp(context) {
  await mongoose.disconnect();
  if (context?.mongod) await context.mongod.stop();
}

function csrfFrom(html) {
  const match = /name="csrf-token" content="([^"]+)"/.exec(html);
  if (!match) throw new Error('CSRF meta tag missing from page');
  return match[1];
}

async function getCsrf(agent, path = '/login') {
  const response = await agent.get(path);
  return csrfFrom(response.text);
}

async function registerOwner(agent, overrides = {}) {
  const token = await getCsrf(agent, '/register');
  const payload = {
    _csrf: token,
    email: overrides.email || 'owner@example.com',
    password: overrides.password || 'strong-password-123',
    confirmPassword: overrides.password || 'strong-password-123',
    name: overrides.name || 'Owner',
  };
  const response = await agent.post('/register').type('form').send(payload);
  return { response, token };
}

async function login(agent, email, password) {
  const token = await getCsrf(agent, '/login');
  return agent.post('/login').type('form').send({ _csrf: token, email, password });
}

async function startChallenge(agent, startDate) {
  const token = await getCsrf(agent, '/challenge');
  return agent.post('/challenge/start').type('form').send({ _csrf: token, startDate });
}

/** JSON API call with the session CSRF token. */
async function api(agent, method, path, body) {
  const sessionResponse = await agent.get('/api/session').set('Accept', 'application/json');
  const token = sessionResponse.body && sessionResponse.body.csrfToken;
  if (!token) throw new Error('Could not read the API CSRF token');
  const requestBuilder = agent[method](path).set('X-CSRF-Token', token).set('Accept', 'application/json');
  if (body !== undefined) return requestBuilder.send(body);
  return requestBuilder;
}

module.exports = {
  startTestApp,
  stopTestApp,
  getCsrf,
  registerOwner,
  login,
  startChallenge,
  api,
};
