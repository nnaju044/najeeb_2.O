'use strict';

const { HttpError } = require('../utils/httpError');
const { wantsJSON } = require('./auth');

function notFound(req, res, next) {
  next(new HttpError(404, 'That page does not exist'));
}

function normalizeError(error) {
  if (error instanceof HttpError) return error;
  if (error?.name === 'ValidationError' && error.errors) {
    const details = Object.values(error.errors).map((entry) => ({
      path: entry.path,
      message: entry.message,
    }));
    return new HttpError(400, details[0]?.message || 'Invalid data', details);
  }
  if (error?.name === 'CastError') {
    return new HttpError(400, 'That identifier is not valid');
  }
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {}).filter((key) => key !== 'userId').join(', ');
    return new HttpError(409, `That record already exists${field ? ` (${field})` : ''}.`);
  }
  if (error?.type === 'entity.parse.failed') {
    return new HttpError(400, 'Malformed request body');
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return new HttpError(413, 'That file is too large');
  }
  return new HttpError(error?.status || 500, error?.message || 'Something went wrong');
}

function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);
  const status = normalized.status;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  if (wantsJSON(req)) {
    return res.status(status).json({
      error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Something went wrong on our side.' : normalized.message,
      details: normalized.details,
    });
  }

  return res.status(status).render('error', {
    title: status === 404 ? 'Not found' : 'Something went wrong',
    status,
    message:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong on our side. Your data is safe.'
        : normalized.message,
    page: 'error',
    active: '',
  });
}

module.exports = { notFound, errorHandler, normalizeError };
