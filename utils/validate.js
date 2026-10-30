'use strict';

const { badRequest } = require('./httpError');

/**
 * Validate a request part with a zod schema and expose the parsed value on
 * `req.validated`. Unknown keys are stripped by zod (`.strict()` is opt-in).
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(req, _res, next) {
    const payload = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const result = schema.safeParse(payload);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(badRequest(details[0]?.message || 'Invalid input', details));
    }
    req.validated = req.validated || {};
    req.validated[source] = result.data;
    return next();
  };
}

module.exports = { validate };
