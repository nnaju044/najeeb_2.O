'use strict';

class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    this.expose = status < 500;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
const forbidden = (message = 'Not allowed') => new HttpError(403, message);
const notFound = (message = 'Not found') => new HttpError(404, message);
const conflict = (message, details) => new HttpError(409, message, details);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
