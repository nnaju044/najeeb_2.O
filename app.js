'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');

const { createSessionMiddleware } = require('./config/session');
const { securityHeaders, sanitizeRequest } = require('./middleware/security');
const { csrfProtection } = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const { attachChallenge } = require('./middleware/context');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');
const { formatDateLong, formatDateShort, weekdayShort, hourRangeLabel, formatTimeInTimezone } = require('./utils/date');

/**
 * Normalizes URLs received in Vercel Serverless environment.
 * When Vercel rewrites (e.g. /(.*) -> /app.js), req.url arrives as /app.js
 * while the original requested client path is passed via x-matched-path or related headers.
 */
function resolveOriginalUrl(req) {
  const headerPath =
    req.headers['x-matched-path'] ||
    req.headers['x-forwarded-uri'] ||
    req.headers['x-original-url'];

  const rawUrl = req.url || '/';
  const queryIndex = rawUrl.indexOf('?');
  const query = queryIndex !== -1 ? rawUrl.slice(queryIndex) : '';

  if (headerPath && headerPath !== '/app.js') {
    const cleanHeaderPath = headerPath.split('?')[0];
    return cleanHeaderPath + query;
  }

  // Handle direct rewrite to /app.js
  if (rawUrl === '/app.js' || rawUrl.startsWith('/app.js?')) {
    return '/' + query;
  }

  // Handle /app.js/subpath
  if (rawUrl.startsWith('/app.js/')) {
    return rawUrl.slice(7);
  }

  return rawUrl;
}

/**
 * Build the Express app. Exported as a factory so tests can spin up an isolated
 * instance against an in-memory MongoDB.
 */
function createApp({
  mongoUrl = process.env.MONGODB_URI,
  sessionSecret = process.env.SESSION_SECRET,
  secureCookies = process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== 'true',
} = {}) {
  if (!mongoUrl) throw new Error('createApp requires a mongoUrl');
  if (!sessionSecret) throw new Error('createApp requires a session secret');

  const app = express();
  app.set('trust proxy', 1);

  // Normalize Vercel rewritten URLs so Express routes match original requested paths
  app.use((req, res, next) => {
    const resolved = resolveOriginalUrl(req);
    if (req.url !== resolved) {
      req.url = resolved;
    }
    if (req.originalUrl === '/app.js' || req.originalUrl?.startsWith('/app.js?')) {
      req.originalUrl = resolved;
    }
    next();
  });

  app.set('view engine', 'ejs');
  const viewsDir = fs.existsSync(path.join(__dirname, 'views'))
    ? path.join(__dirname, 'views')
    : path.join(process.cwd(), 'views');
  app.set('views', viewsDir);
  app.disable('x-powered-by');

  app.locals.appName = 'Jeebs 2.O';
  app.locals.safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  app.locals.formatDateLong = formatDateLong;
  app.locals.formatDateShort = formatDateShort;
  app.locals.weekdayShort = weekdayShort;
  app.locals.hourRangeLabel = hourRangeLabel;
  app.locals.formatTime = formatTimeInTimezone;
  app.locals.theme = 'dark';

  app.use(securityHeaders());
  app.use(compression());
  const publicDir = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.join(process.cwd(), 'public');
  app.use(
    express.static(publicDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      etag: true,
    })
  );
  // Local copies of the frontend libraries keep the PWA working offline and
  // avoid any third-party script origin.
  app.use(
    '/vendor/chart.js',
    express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist'), { maxAge: '30d' })
  );
  app.use(
    '/vendor/lucide',
    express.static(path.join(__dirname, 'node_modules', 'lucide', 'dist', 'umd'), { maxAge: '30d' })
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(sanitizeRequest);

  app.use(
    createSessionMiddleware({
      mongoUrl,
      secret: sessionSecret,
      secure: secureCookies,
    })
  );
  app.use(loadUser);
  app.use(csrfProtection);
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.query = req.query;
    next();
  });

  app.use('/', require('./routes/auth'));
  app.use('/api', require('./routes/api'));
  app.use('/', requireAuth, attachChallenge, require('./routes/pages'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

let serverlessApp = null;
let serverlessInitPromise = null;

async function getOrCreateServerlessApp() {
  if (serverlessApp) return serverlessApp;
  if (!serverlessInitPromise) {
    serverlessInitPromise = (async () => {
      try {
        require('dotenv').config();
      } catch (_e) {}
      const mongoUrl = process.env.MONGODB_URI;
      if (!mongoUrl) {
        throw new Error('MONGODB_URI environment variable is required.');
      }
      let sessionSecret = process.env.SESSION_SECRET;
      if (!sessionSecret) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('SESSION_SECRET environment variable is required in production.');
        }
        sessionSecret = 'jeebs_2o_session_secret_dev_fallback';
      }
      const { connectDatabase } = require('./config/db');
      const { ensureGlobalLibraries } = require('./services/seedService');
      await connectDatabase(mongoUrl, { attempts: 3 });
      await ensureGlobalLibraries();
      serverlessApp = createApp({
        mongoUrl,
        sessionSecret,
        secureCookies: process.env.COOKIE_INSECURE !== 'true',
      });
      return serverlessApp;
    })();
  }
  return serverlessInitPromise;
}

/**
 * Serverless function entry point for Vercel.
 * Vercel expects the default export to be a function or server.
 */
async function serverlessHandler(req, res) {
  try {
    req.url = resolveOriginalUrl(req);
    const app = await getOrCreateServerlessApp();
    return app(req, res);
  } catch (error) {
    console.error('[vercel] Serverless error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const safeMessage = process.env.NODE_ENV === 'production'
      ? 'An internal error occurred. Please check the server logs.'
      : error.message;
    res.end(`<!DOCTYPE html><html><body><h1>Server Error</h1><p>${safeMessage}</p></body></html>`);
  }
}

// Preserve createApp named export for server.js and automated test harness
serverlessHandler.createApp = createApp;
serverlessHandler.resolveOriginalUrl = resolveOriginalUrl;
serverlessHandler.default = serverlessHandler;

module.exports = serverlessHandler;
