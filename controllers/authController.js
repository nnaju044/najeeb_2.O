'use strict';

const { z } = require('zod');
const User = require('../models/User');
const { HttpError } = require('../utils/httpError');
const { seedUserHabits, ensureGlobalLibraries } = require('../services/seedService');

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().max(80).optional().default(''),
  confirmPassword: z.string().max(200).optional(),
  startDate: z.string().trim().optional(),
});

function safeNext(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  // Disallow redirecting back to auth pages, internal scripts, or recursive next chains
  if (
    value === '/login' ||
    value.startsWith('/login?') ||
    value === '/register' ||
    value.startsWith('/register?') ||
    value.startsWith('/app.js') ||
    value.includes('next=')
  ) {
    return '/';
  }
  return value;
}

async function accountExists() {
  return (await User.estimatedDocumentCount()) > 0;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

const challengeService = require('../services/challengeService');
const { currentDateKey } = require('../utils/date');

async function showLogin(req, res) {
  if (req.user) return res.redirect('/');
  return res.render('login', {
    title: 'Sign in',
    page: 'auth',
    active: '',
    error: null,
    email: '',
    next: safeNext(req.query.next),
  });
}

async function login(req, res) {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('login', {
      title: 'Sign in',
      page: 'auth',
      active: '',
      error: parsed.error.issues[0].message,
      email: String(req.body.email || ''),
      next: safeNext(req.body.next),
    });
  }

  const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
  const valid = user ? await user.verifyPassword(parsed.data.password) : false;
  if (!user || !valid) {
    return res.status(401).render('login', {
      title: 'Sign in',
      page: 'auth',
      active: '',
      error: 'Email or password is incorrect',
      email: parsed.data.email,
      next: safeNext(req.body.next),
    });
  }

  // New session id on login prevents session fixation.
  await regenerateSession(req);
  req.session.userId = user._id.toString();
  await saveSession(req);
  return res.redirect(safeNext(req.body.next));
}

async function showRegister(req, res) {
  if (req.user) return res.redirect('/');
  const today = currentDateKey();
  return res.render('register', {
    title: 'Create your account',
    page: 'auth',
    active: '',
    error: null,
    email: '',
    name: '',
    startDate: today,
    today,
  });
}

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  const today = currentDateKey();
  if (!parsed.success) {
    return res.status(400).render('register', {
      title: 'Create your account',
      page: 'auth',
      active: '',
      error: parsed.error.issues[0].message,
      email: String(req.body.email || ''),
      name: String(req.body.name || ''),
      startDate: String(req.body.startDate || today),
      today,
    });
  }
  if (parsed.data.confirmPassword !== undefined && parsed.data.confirmPassword !== parsed.data.password) {
    return res.status(400).render('register', {
      title: 'Create your account',
      page: 'auth',
      active: '',
      error: 'Passwords do not match',
      email: parsed.data.email,
      name: parsed.data.name,
      startDate: String(parsed.data.startDate || today),
      today,
    });
  }

  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) {
    return res.status(409).render('register', {
      title: 'Create your account',
      page: 'auth',
      active: '',
      error: 'An account with this email already exists. Sign in instead.',
      email: parsed.data.email,
      name: parsed.data.name,
      startDate: String(parsed.data.startDate || today),
      today,
    });
  }

  await ensureGlobalLibraries();
  const passwordHash = await User.hashPassword(parsed.data.password);
  const user = await User.create({
    email: parsed.data.email,
    name: parsed.data.name || '',
    passwordHash,
  });

  // If a start date was provided, start the challenge immediately.
  // Otherwise, redirect to /challenge where the user can pick their start date.
  const { isValidDateKey, addDays } = require('../utils/date');
  let started = false;
  if (parsed.data.startDate && isValidDateKey(parsed.data.startDate)) {
    if (parsed.data.startDate <= addDays(today, 1)) {
      await challengeService.startChallenge(user._id, parsed.data.startDate);
      started = true;
    }
  }

  await regenerateSession(req);
  req.session.userId = user._id.toString();
  await saveSession(req);
  return res.redirect(started ? '/' : '/challenge');
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('lifeos.sid');
    res.redirect('/login');
  });
}

module.exports = { showLogin, login, showRegister, register, logout, credentialsSchema, registerSchema };
