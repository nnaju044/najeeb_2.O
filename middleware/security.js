'use strict';

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProduction = () => process.env.NODE_ENV === 'production';

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(isProduction() ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  });
}

/** Strip Mongo operators and prototype-pollution keys from incoming data. */
function sanitize(value, depth = 0) {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const clean = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = sanitize(entry, depth + 1);
    }
    return clean;
  }
  return value;
}

function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  if (req.params && typeof req.params === 'object') req.params = sanitize(req.params);
  const cleanQuery = sanitize(req.query);
  for (const key of Object.keys(req.query)) delete req.query[key];
  Object.assign(req.query, cleanQuery);
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down for a moment.' },
});

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Export limit reached for this hour.' },
});

module.exports = { securityHeaders, sanitizeRequest, sanitize, authLimiter, apiLimiter, exportLimiter };
