'use strict';

const session = require('express-session');
const MongoStore = require('connect-mongo');

const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

/**
 * Session middleware backed by MongoDB (sessions survive restarts and work
 * across multiple app processes).
 */
function createSessionMiddleware({ mongoUrl, secret, secure }) {
  return session({
    name: 'lifeos.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: Boolean(secure),
      maxAge: THIRTY_DAYS,
      path: '/',
    },
    store: MongoStore.create({
      mongoUrl,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 30,
      autoRemove: 'native',
      touchAfter: 60 * 60 * 12,
    }),
  });
}

module.exports = { createSessionMiddleware, THIRTY_DAYS };
