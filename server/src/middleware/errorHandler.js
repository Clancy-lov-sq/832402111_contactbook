'use strict';

const { AppError, ErrorCode } = require('../utils/errors');
const { failure } = require('../utils/response');

/**
 * Express error handling.
 *
 * Every failure leaves the process as the same JSON envelope, and an unexpected
 * defect is logged with its stack while the client only sees a generic 500. That
 * separation is what keeps a stack trace, a file path or a SQL fragment out of a
 * response.
 */

/** @returns {import('express').RequestHandler} answers an unknown route as JSON */
function notFoundHandler() {
  return (request, response, next) => {
    next(
      new AppError(ErrorCode.ROUTE_NOT_FOUND, {
        detail: `${request.method} ${request.originalUrl}`,
      }),
    );
  };
}

/**
 * @param {{error: Function}} logger
 * @returns {import('express').ErrorRequestHandler}
 */
function createErrorHandler(logger) {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    let appError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error && error.type === 'entity.parse.failed') {
      appError = new AppError(ErrorCode.VALIDATION_INVALID_JSON, {
        message: 'The request body is not valid JSON',
      });
    } else if (error && error.type === 'entity.too.large') {
      appError = new AppError(ErrorCode.VALIDATION_INVALID_FIELD, {
        status: 413,
        message: 'The request body is too large',
      });
    } else if (error && error.code === 'LIMIT_FILE_SIZE') {
      appError = new AppError(ErrorCode.IMPORT_FILE_TOO_LARGE, {
        message: 'The uploaded workbook is too large',
      });
    } else {
      logger.error('Unhandled request failure', {
        method: request.method,
        url: request.originalUrl,
        reason: error && error.message,
        stack: error && error.stack,
      });
      appError = new AppError(ErrorCode.INTERNAL_ERROR, {
        detail: 'The server could not complete the request',
      });
    }

    if (appError.status >= 500) {
      logger.error('Request failed', {
        method: request.method,
        url: request.originalUrl,
        code: appError.code,
        reason: appError.message,
      });
    }

    response.status(appError.status).json(failure(appError));
  };
}

module.exports = { createErrorHandler, notFoundHandler };
