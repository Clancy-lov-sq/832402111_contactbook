'use strict';

/**
 * The JSON envelope shared by every endpoint.
 *
 * Success: `{ success: true, ...payload }`.
 * Failure: `{ success: false, error, message, detail?, fields? }`.
 * The front end only ever branches on `success` and `error`.
 */

/**
 * Builds a success payload.
 *
 * @param {object} [payload] fields merged into the envelope
 * @returns {object}
 */
function success(payload = {}) {
  return { success: true, ...payload };
}

/**
 * Builds a failure payload from a classified error.
 *
 * @param {import('./errors').AppError} error
 * @returns {object}
 */
function failure(error) {
  const body = { success: false, error: error.code, message: error.message };
  if (error.detail !== undefined) {
    body.detail = error.detail;
  }
  if (error.fields !== undefined) {
    body.fields = error.fields;
  }
  return body;
}

module.exports = { success, failure };
