'use strict';

/**
 * Classified errors.
 *
 * A failure always travels as `AppError`: a stable machine readable `code`, a
 * human readable English `message` and an HTTP status. The front end branches on
 * `code`, never on the text, so a wording change cannot break a client.
 */

const ErrorCode = Object.freeze({
  VALIDATION_INVALID_JSON: 'VALIDATION_INVALID_JSON',
  VALIDATION_INVALID_PARAMETER: 'VALIDATION_INVALID_PARAMETER',
  VALIDATION_INVALID_FIELD: 'VALIDATION_INVALID_FIELD',
  VALIDATION_CONTACT_NAME_REQUIRED: 'VALIDATION_CONTACT_NAME_REQUIRED',
  VALIDATION_CONTACT_NAME_TOO_LONG: 'VALIDATION_CONTACT_NAME_TOO_LONG',
  VALIDATION_GROUP_UNKNOWN: 'VALIDATION_GROUP_UNKNOWN',
  VALIDATION_METHOD_TYPE_UNKNOWN: 'VALIDATION_METHOD_TYPE_UNKNOWN',
  VALIDATION_METHOD_VALUE_REQUIRED: 'VALIDATION_METHOD_VALUE_REQUIRED',
  VALIDATION_METHOD_INVALID_VALUE: 'VALIDATION_METHOD_INVALID_VALUE',
  VALIDATION_METHOD_VALUE_TOO_LONG: 'VALIDATION_METHOD_VALUE_TOO_LONG',
  VALIDATION_TOO_MANY_METHODS: 'VALIDATION_TOO_MANY_METHODS',
  VALIDATION_DUPLICATE_METHOD: 'VALIDATION_DUPLICATE_METHOD',
  VALIDATION_INVALID_BOOKMARK: 'VALIDATION_INVALID_BOOKMARK',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  CONTACT_DUPLICATE: 'CONTACT_DUPLICATE',
  IMPORT_FILE_REQUIRED: 'IMPORT_FILE_REQUIRED',
  IMPORT_FILE_UNSUPPORTED: 'IMPORT_FILE_UNSUPPORTED',
  IMPORT_FILE_TOO_LARGE: 'IMPORT_FILE_TOO_LARGE',
  IMPORT_WORKBOOK_EMPTY: 'IMPORT_WORKBOOK_EMPTY',
  IMPORT_HEADER_MISSING: 'IMPORT_HEADER_MISSING',
  IMPORT_TOO_MANY_ROWS: 'IMPORT_TOO_MANY_ROWS',
  IMPORT_NO_VALID_ROW: 'IMPORT_NO_VALID_ROW',
  IMPORT_FAILED: 'IMPORT_FAILED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/** Default HTTP status of every error family. */
const DEFAULT_STATUS = Object.freeze({
  VALIDATION_INVALID_JSON: 400,
  VALIDATION_INVALID_PARAMETER: 400,
  VALIDATION_INVALID_FIELD: 400,
  VALIDATION_CONTACT_NAME_REQUIRED: 400,
  VALIDATION_CONTACT_NAME_TOO_LONG: 400,
  VALIDATION_GROUP_UNKNOWN: 400,
  VALIDATION_METHOD_TYPE_UNKNOWN: 400,
  VALIDATION_METHOD_VALUE_REQUIRED: 400,
  VALIDATION_METHOD_INVALID_VALUE: 400,
  VALIDATION_METHOD_VALUE_TOO_LONG: 400,
  VALIDATION_TOO_MANY_METHODS: 400,
  VALIDATION_DUPLICATE_METHOD: 400,
  VALIDATION_INVALID_BOOKMARK: 400,
  CONTACT_NOT_FOUND: 404,
  CONTACT_DUPLICATE: 409,
  IMPORT_FILE_REQUIRED: 400,
  IMPORT_FILE_UNSUPPORTED: 415,
  IMPORT_FILE_TOO_LARGE: 413,
  IMPORT_WORKBOOK_EMPTY: 422,
  IMPORT_HEADER_MISSING: 422,
  IMPORT_TOO_MANY_ROWS: 422,
  IMPORT_NO_VALID_ROW: 422,
  IMPORT_FAILED: 422,
  EXPORT_FAILED: 500,
  STORAGE_FAILURE: 500,
  ROUTE_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
});

/** Default English message of every code. */
const DEFAULT_MESSAGE = Object.freeze({
  VALIDATION_INVALID_JSON: 'The request body is not valid JSON',
  VALIDATION_INVALID_PARAMETER: 'A query parameter has an invalid value',
  VALIDATION_INVALID_FIELD: 'A field of the contact is invalid',
  VALIDATION_CONTACT_NAME_REQUIRED: 'The contact name is required',
  VALIDATION_CONTACT_NAME_TOO_LONG: 'The contact name is too long',
  VALIDATION_GROUP_UNKNOWN: 'The selected group does not exist',
  VALIDATION_METHOD_TYPE_UNKNOWN: 'The contact method type is not supported',
  VALIDATION_METHOD_VALUE_REQUIRED: 'A contact method has no value',
  VALIDATION_METHOD_INVALID_VALUE: 'A contact method value has an invalid format',
  VALIDATION_METHOD_VALUE_TOO_LONG: 'A contact method value is too long',
  VALIDATION_TOO_MANY_METHODS: 'A contact has too many contact methods',
  VALIDATION_DUPLICATE_METHOD: 'The same contact method is listed twice',
  VALIDATION_INVALID_BOOKMARK: 'The bookmark flag must be a boolean',
  CONTACT_NOT_FOUND: 'The contact does not exist',
  CONTACT_DUPLICATE: 'A contact with the same name and primary method already exists',
  IMPORT_FILE_REQUIRED: 'No file was uploaded',
  IMPORT_FILE_UNSUPPORTED: 'Only .xlsx files exported from Excel are supported',
  IMPORT_FILE_TOO_LARGE: 'The uploaded workbook is too large',
  IMPORT_WORKBOOK_EMPTY: 'The workbook does not contain any row',
  IMPORT_HEADER_MISSING: 'The workbook has no header row or no Name column',
  IMPORT_TOO_MANY_ROWS: 'The workbook contains more rows than the import limit',
  IMPORT_NO_VALID_ROW: 'The workbook contains no valid contact row',
  IMPORT_FAILED: 'The workbook could not be imported',
  EXPORT_FAILED: 'The workbook could not be generated',
  STORAGE_FAILURE: 'The storage layer failed',
  ROUTE_NOT_FOUND: 'The requested endpoint does not exist',
  INTERNAL_ERROR: 'An unexpected error occurred',
});

/** An error with a stable code, an HTTP status and optional field errors. */
class AppError extends Error {
  /**
   * @param {string} code one of {@link ErrorCode}
   * @param {object} [options]
   * @param {string} [options.message] override of the default message
   * @param {number} [options.status] override of the default status
   * @param {*} [options.detail] machine readable detail (never a stack trace)
   * @param {Array<object>} [options.fields] field level validation failures
   */
  constructor(code, options = {}) {
    super(options.message || DEFAULT_MESSAGE[code] || code);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status || DEFAULT_STATUS[code] || 500;
    this.detail = options.detail;
    this.fields = options.fields;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

module.exports = { AppError, ErrorCode, DEFAULT_MESSAGE, DEFAULT_STATUS };
