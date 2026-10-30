'use strict';

const crypto = require('crypto');
const { HttpError } = require('../utils/httpError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

/**
 * Session-bound double-submit CSRF protection. The token lives in the session
 * (never in a readable cookie) and is echoed by forms via `_csrf` or by fetch
 * calls via the `X-CSRF-Token` header.
 */
function csrfProtection(req, res, next) {
  if (!req.session) return next(new HttpError(500, 'Session unavailable'));

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  const submitted = req.get('x-csrf-token') || req.body?._csrf || req.query?._csrf;
  if (!submitted) {
    return next(new HttpError(403, 'Your session expired. Refresh the page and try again.'));
  }
  const a = sha256(submitted);
  const b = sha256(req.session.csrfToken);
  if (!crypto.timingSafeEqual(a, b)) {
    return next(new HttpError(403, 'Security token mismatch. Refresh the page and try again.'));
  }
  return next();
}

module.exports = { csrfProtection };
