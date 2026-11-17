/**
 * Readable English texts for the error codes of the backend.
 *
 * The API answers stable, machine readable codes; the interface shows one readable
 * English message per code, so the wording lives here instead of in every component.
 * An unknown code falls back to the message the server sent, which keeps a new
 * backend error visible instead of hidden.
 */

const CODE_MESSAGES = Object.freeze({
  NETWORK_UNREACHABLE: 'Cannot reach the backend — is it running?',
  INVALID_RESPONSE: 'The backend returned a response that could not be read',
  VALIDATION_INVALID_PARAMETER: 'Invalid request parameters',
  VALIDATION_INVALID_FIELD: 'Some values are not valid — please check the form',
  VALIDATION_CONTACT_NAME_REQUIRED: 'Please enter a contact name',
  VALIDATION_CONTACT_NAME_TOO_LONG: 'A name may have at most 40 characters',
  VALIDATION_GROUP_UNKNOWN: 'The selected group does not exist',
  VALIDATION_METHOD_TYPE_UNKNOWN: 'This contact method type is not supported',
  VALIDATION_METHOD_VALUE_REQUIRED: 'Please enter a value',
  VALIDATION_METHOD_INVALID_VALUE: 'This contact method has an invalid format',
  VALIDATION_DUPLICATE_METHOD: 'This contact method is already listed',
  VALIDATION_TOO_MANY_METHODS: 'A contact can have at most 10 contact methods',
  VALIDATION_INVALID_BOOKMARK: 'Invalid bookmark state',
  CONTACT_NOT_FOUND: 'The contact no longer exists',
  IMPORT_FILE_REQUIRED: 'Please choose a file to import',
  IMPORT_FILE_UNSUPPORTED: 'Only .xlsx Excel workbooks are supported',
  IMPORT_FILE_TOO_LARGE: 'The file is larger than 5 MB — please split it and import again',
  IMPORT_WORKBOOK_EMPTY: 'The workbook has no data to import',
  IMPORT_HEADER_MISSING: 'The workbook has no Name column, so it cannot be imported',
  IMPORT_TOO_MANY_ROWS: 'At most 2000 rows can be imported at once',
  IMPORT_NO_VALID_ROW: 'The workbook has no row that can be imported',
  IMPORT_FAILED: 'The file could not be read — please check that it is a valid .xlsx workbook',
  EXPORT_FAILED: 'Export failed — please try again later',
  STORAGE_FAILURE: 'The database is temporarily unavailable',
  ROUTE_NOT_FOUND: 'This API route does not exist',
  INTERNAL_ERROR: 'The server could not process the request — please try again later',
});

/** Field names used by the backend, translated for the form. */
const FIELD_LABELS = Object.freeze({
  name: 'Name',
  groupId: 'Group',
  group: 'Group',
  company: 'Company',
  title: 'Title',
  note: 'Notes',
  isBookmarked: 'Bookmark',
  methods: 'Contact methods',
});

/**
 * Returns the readable English explanation of a failed request.
 *
 * @param {Error & {code?: string, message?: string}} error
 * @returns {string}
 */
export function errorText(error) {
  if (!error) {
    return 'Unknown error';
  }
  return CODE_MESSAGES[error.code] || error.message || 'Request failed';
}

/** @param {string} field @returns {string} */
export function fieldLabel(field) {
  if (!field) {
    return '';
  }
  const match = /^methods\[(\d+)\]\.(.+)$/.exec(field);
  if (match) {
    return `Contact method ${Number(match[1]) + 1}`;
  }
  return FIELD_LABELS[field] || field;
}
