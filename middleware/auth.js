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

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJSON(req)) {
    return res.status(401).json({ error: 'Please sign in again.' });
  }
  const target = req.method === 'GET' ? req.originalUrl : '/';
  return res.redirect(`/login?next=${encodeURIComponent(target)}`);
}

function requireGuest(req, res, next) {
  if (req.user) return res.redirect('/');
  return next();
}

module.exports = { loadUser, requireAuth, requireGuest, wantsJSON };
