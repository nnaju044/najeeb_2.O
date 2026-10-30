'use strict';

const challengeService = require('../services/challengeService');
const { currentDateKey } = require('../utils/date');

/** Expose the challenge and its progress to every authenticated view. */
async function attachChallenge(req, res, next) {
  try {
    res.locals.challenge = null;
    res.locals.progress = challengeService.challengeProgress(null);
    res.locals.theme = req.user?.theme || 'dark';
    if (req.user) {
      const challenge = await challengeService.getChallenge(req.user._id);
      res.locals.challenge = challenge;
      res.locals.progress = challengeService.challengeProgress(challenge, currentDateKey());
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { attachChallenge };
