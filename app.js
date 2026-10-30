'use strict';

const path = require('path');
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
 * Build the Express app. Exported as a factory so tests can spin up an isolated
 * instance against an in-memory MongoDB.
 */
function createApp({ mongoUrl, sessionSecret, secureCookies = false }) {
  if (!mongoUrl) throw new Error('createApp requires a mongoUrl');
  if (!sessionSecret) throw new Error('createApp requires a session secret');

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
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
  app.use(
    express.static(path.join(__dirname, 'public'), {
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

module.exports = { createApp };
