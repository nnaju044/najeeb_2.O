'use strict';

const User = require('../models/User');

function wantsJSON(req) {
  const fullPath = req.originalUrl || req.baseUrl + req.path;
  return (
    fullPath.startsWith('/api/') ||
    fullPath.startsWith('/export/') ||
    req.xhr ||
    (req.get('accept') || '').includes('application/json')
  );
}

/** Load the signed-in user (if any) onto req.user / res.locals. */
async function loadUser(req, res, next) {
  try {
    res.locals.currentUser = null;
    if (req.session?.userId) {
      const user = await User.findById(req.session.userId).lean();
      if (!user) {
        req.session.destroy(() => {});
      } else {
        req.user = user;
        res.locals.currentUser = user;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Blocked exact pathnames that must never become a redirect destination. */
const BLOCKED_PATHS = new Set(['/login', '/register', '/app.js']);

/**
 * Filter out recursive 'next' query parameters while preserving legitimate
 * parameters in their raw form without decoding or re-encoding.
 */
function cleanQuery(query) {
  if (!query) return '';
  const pairs = query.split('&').filter(Boolean);
  const remaining = [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    let key = rawKey;
    try { key = decodeURIComponent(rawKey); } catch { /* ignore */ }
    if (key !== 'next') {
      remaining.push(pair);
    }
  }
  return remaining.join('&');
}

/**
 * Return a safe, local-only redirect target or '/' when validation fails.
 *
 * Rules:
 *  1. Must be a non-empty string starting with exactly one '/'.
 *  2. Reject external schemes (http:, https:, javascript:, data:, etc.).
 *  3. Reject protocol-relative '//…', backslashes '/\…' or '\\' anywhere.
 *  4. Reject control characters (U+0000 – U+001F, U+007F).
 *  5. Validate pathname independently from the query string:
 *     - Strip fragment/hash if present.
 *     - Decode pathname repeatedly until stable, up to a maximum of 5 passes.
 *     - If decoding has not stabilized after 5 passes, reject and return '/'.
 *     - Reject malformed percent-encoding in the pathname.
 *     - Reject decoded pathname if it contains external schemes, protocol-relative '//',
 *       backslashes '\', or control characters.
 *  6. Parse pathname safely using WHATWG URL constructor with a fixed dummy base (http://localhost):
 *     - Hostname and protocol must strictly resolve to dummy localhost.
 *     - Normalized pathname must start with exactly one '/' and not contain backslashes.
 *     - Cleaned pathname (removing trailing slashes) must not be in BLOCKED_PATHS.
 *  7. Strip recursive 'next' query parameters while preserving all other query parameters
 *     without unnecessarily decoding and re-encoding their values.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

function sanitizeTarget(raw) {
  // --- basic shape on raw input ---
  if (typeof raw !== 'string' || raw.length === 0) return '/';

  // Reject external schemes (http://, https://, javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+\-.]*:/i.test(raw)) return '/';

  // Must start with exactly one forward-slash (not '//' or '/\')
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';

  // Disallow backslashes anywhere in raw target
  if (raw.includes('\\')) return '/';

  // Reject control characters (tab, newline, null, DEL, etc.)
  if (CONTROL_CHARS.test(raw)) return '/';

  // --- separate pathname from query string and hash ---
  const hashIdx = raw.indexOf('#');
  const cleanRaw = hashIdx === -1 ? raw : raw.slice(0, hashIdx);

  const qIdx = cleanRaw.indexOf('?');
  const rawPath = qIdx === -1 ? cleanRaw : cleanRaw.slice(0, qIdx);
  const rawQuery = qIdx === -1 ? '' : cleanRaw.slice(qIdx + 1);

  // Pathname must still be non-empty and start with exactly one '/'
  if (rawPath.length === 0 || rawPath[0] !== '/' || rawPath[1] === '/' || rawPath[1] === '\\') {
    return '/';
  }

  // --- decode pathname repeatedly until stable (maximum 5 passes) ---
  let decodedPath = rawPath;
  let stabilized = false;
  for (let i = 0; i < 5; i++) {
    let next;
    try {
      next = decodeURIComponent(decodedPath);
    } catch {
      return '/'; // Reject malformed percent-encoding
    }
    if (next === decodedPath) {
      stabilized = true;
      break;
    }
    decodedPath = next;
  }

  // If decoding has not stabilized after 5 passes, reject and return '/'
  if (!stabilized) {
    return '/';
  }

  // Verify decoded pathname satisfies security rules
  if (/^[a-z][a-z0-9+\-.]*:/i.test(decodedPath)) return '/';
  if (decodedPath[0] !== '/' || decodedPath[1] === '/' || decodedPath[1] === '\\') return '/';
  if (decodedPath.includes('\\')) return '/';
  if (CONTROL_CHARS.test(decodedPath)) return '/';

  // --- parse URLs safely with dummy localhost base ---
  let parsedRaw, parsedDecoded;
  try {
    parsedRaw = new URL(rawPath, 'http://localhost');
    parsedDecoded = new URL(decodedPath, 'http://localhost');
  } catch {
    return '/';
  }

  // Hostname and protocol must strictly resolve to dummy localhost
  if (parsedRaw.hostname !== 'localhost' || parsedDecoded.hostname !== 'localhost') return '/';
  if (parsedRaw.protocol !== 'http:' || parsedDecoded.protocol !== 'http:') return '/';

  const normPath = parsedRaw.pathname;
  const normDecodedPath = parsedDecoded.pathname;

  // Pathnames must start with exactly one '/' and not contain backslashes
  if (
    !normPath.startsWith('/') ||
    normPath.startsWith('//') ||
    normPath.includes('\\') ||
    !normDecodedPath.startsWith('/') ||
    normDecodedPath.startsWith('//') ||
    normDecodedPath.includes('\\')
  ) {
    return '/';
  }

  // Blocked exact paths (normalize away trailing slashes so /login/ is also caught)
  const cleanNormPath = normPath.replace(/\/+$/, '') || '/';
  const cleanDecodedNormPath = normDecodedPath.replace(/\/+$/, '') || '/';
  if (BLOCKED_PATHS.has(cleanNormPath) || BLOCKED_PATHS.has(cleanDecodedNormPath)) {
    return '/';
  }

  // Clean query string: strip recursive 'next' parameter without altering or re-encoding other params
  const cleanQs = cleanQuery(rawQuery);
  return cleanQs ? `${normPath}?${cleanQs}` : normPath;
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJSON(req)) {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const raw = req.method === 'GET' ? (req.originalUrl || req.url) : '/';
  const target = sanitizeTarget(raw);

  return res.redirect(`/login?next=${encodeURIComponent(target)}`);
}

function requireGuest(req, res, next) {
  if (req.user) return res.redirect('/');
  return next();
}

module.exports = { loadUser, requireAuth, requireGuest, wantsJSON, sanitizeTarget };
