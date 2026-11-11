'use strict';

/**
 * One log line per request, written when the response has been sent.
 *
 * The duration is measured from the moment the request entered the middleware
 * chain, which is what a reviewer wants to see when a page shows a slow action.
 *
 * @param {{info: Function}} logger
 * @returns {import('express').RequestHandler}
 */
function requestLogger(logger) {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info(`${request.method} ${request.originalUrl} -> ${response.statusCode}`, {
        durationMs: Number(durationMs.toFixed(1)),
      });
    });
    next();
  };
}

module.exports = { requestLogger };
