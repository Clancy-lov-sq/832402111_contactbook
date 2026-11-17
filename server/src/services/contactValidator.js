'use strict';

const { AppError, ErrorCode } = require('../utils/errors');
const { METHOD_TYPES, findMethodType } = require('../utils/methodTypes');

/**
 * Input validation of the address book.
 *
 * Validation returns normalised data instead of failing on the first problem:
 * every field is checked, all problems are collected in `fields`, and the first
 * message becomes the envelope message. The front end can then mark each
 * offending input instead of guessing which field was rejected.
 */

/** Values accepted as `true` / `false` in a boolean field. */
const TRUE_VALUES = Object.freeze(['true', '1', 'yes', 'y', 'on']);
const FALSE_VALUES = Object.freeze(['false', '0', 'no', 'n', 'off']);

/** Deterministic avatar palette; the colour of a contact never changes. */
const AVATAR_PALETTE = Object.freeze([
  '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#0891b2', '#16a34a', '#ca8a04', '#4f46e5',
]);

/**
 * Collects field level failures and turns them into one classified error.
 */
class FieldErrors {
  constructor() {
    /** @type {Array<{field: string, code: string, message: string}>} */
    this.items = [];
  }

  /**
   * @param {string} field
   * @param {string} code
   * @param {string} message
   */
  add(field, code, message) {
    this.items.push({ field, code, message });
  }

  /** @returns {boolean} */
  get isEmpty() {
    return this.items.length === 0;
  }

  /** @throws {AppError} when at least one field failed */
  throwIfAny() {
    if (this.isEmpty) {
      return;
    }
    throw new AppError(ErrorCode.VALIDATION_INVALID_FIELD, {
      message: this.items[0].message,
      fields: this.items,
    });
  }
}

/**
 * Collapses whitespace and trims a text value.
 * @param {*} value
 * @returns {string}
 */
function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/[\s\u3000]+/g, ' ').trim();
}

/**
 * @param {*} value
 * @returns {boolean|null} the boolean value, or null when it is not a boolean
 */
function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && (value === 0 || value === 1)) {
    return value === 1;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (TRUE_VALUES.includes(text)) {
      return true;
    }
    if (FALSE_VALUES.includes(text)) {
      return false;
    }
  }
  return null;
}

/**
 * Validates a method value against the rule of its type.
 *
 * @param {string} type
 * @param {string} value
 * @returns {boolean}
 */
function isValidMethodValue(type, value) {
  switch (type) {
    case 'phone':
      return /^\+?[0-9][0-9\s\-().]{4,24}$/.test(value) && (value.match(/\d/g) || []).length >= 6;
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    case 'qq':
      return /^\d{5,12}$/.test(value);
    case 'website':
      return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i.test(value);
    case 'wechat':
      return /^[A-Za-z0-9][A-Za-z0-9_\-.]{1,39}$/.test(value);
    default:
      return value.length > 0;
  }
}

/**
 * Picks a stable avatar colour from the contact name.
 * @param {string} name
 * @returns {string}
 */
function pickAvatarColor(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) % 100000;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/**
 * Normalises the methods of one contact.
 *
 * Rules: at most `maxMethodsPerContact`; a type must exist; a value must be
 * present, short enough and formatted correctly; the same type + value may not
 * appear twice; at most one method is primary, and the first method becomes
 * primary when none is marked.
 *
 * @param {*} rawMethods
 * @param {object} limits
 * @param {FieldErrors} errors
 * @returns {object[]}
 */
function normalizeMethods(rawMethods, limits, errors) {
  if (rawMethods === undefined || rawMethods === null) {
    return [];
  }
  if (!Array.isArray(rawMethods)) {
    errors.add('methods', ErrorCode.VALIDATION_INVALID_FIELD, 'methods must be an array');
    return [];
  }
  if (rawMethods.length > limits.maxMethodsPerContact) {
    errors.add(
      'methods',
      ErrorCode.VALIDATION_TOO_MANY_METHODS,
      `A contact may have at most ${limits.maxMethodsPerContact} contact methods`,
    );
    return [];
  }

  const methods = [];
  const seen = new Set();
  rawMethods.forEach((rawMethod, index) => {
    const field = `methods[${index}]`;
    if (!rawMethod || typeof rawMethod !== 'object') {
      errors.add(field, ErrorCode.VALIDATION_INVALID_FIELD, 'A contact method must be an object');
      return;
    }

    const type = normalizeText(rawMethod.type).toLowerCase();
    if (!findMethodType(type)) {
      errors.add(
        `${field}.type`,
        ErrorCode.VALIDATION_METHOD_TYPE_UNKNOWN,
        `The contact method type "${type}" is not supported`,
      );
      return;
    }

    const value = normalizeText(rawMethod.value);
    if (value === '') {
      errors.add(
        `${field}.value`,
        ErrorCode.VALIDATION_METHOD_VALUE_REQUIRED,
        `The ${findMethodType(type).label} value is required`,
      );
      return;
    }
    if (value.length > limits.maxMethodValueLength) {
      errors.add(
        `${field}.value`,
        ErrorCode.VALIDATION_METHOD_VALUE_TOO_LONG,
        `A contact method value may have at most ${limits.maxMethodValueLength} characters`,
      );
      return;
    }
    if (!isValidMethodValue(type, value)) {
      errors.add(
        `${field}.value`,
        ErrorCode.VALIDATION_METHOD_INVALID_VALUE,
        `"${value}" is not a valid ${findMethodType(type).labelEn.toLowerCase()} value`,
      );
      return;
    }

    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) {
      errors.add(
        `${field}.value`,
        ErrorCode.VALIDATION_DUPLICATE_METHOD,
        'The same contact method is listed twice',
      );
      return;
    }
    seen.add(key);

    const label = normalizeText(rawMethod.label);
    if (label.length > limits.maxMethodLabelLength) {
      errors.add(
        `${field}.label`,
        ErrorCode.VALIDATION_INVALID_FIELD,
        `A method label may have at most ${limits.maxMethodLabelLength} characters`,
      );
      return;
    }

    methods.push({
      type,
      label,
      value,
      isPrimary: parseBoolean(rawMethod.isPrimary) === true,
    });
  });

  if (methods.length > 0 && !methods.some((method) => method.isPrimary)) {
    methods[0].isPrimary = true;
  }
  let primarySeen = false;
  for (const method of methods) {
    if (method.isPrimary) {
      if (primarySeen) {
        method.isPrimary = false;
      }
      primarySeen = true;
    }
  }
  return methods;
}

/**
 * Normalises a contact payload.
 *
 * @param {*} raw
 * @param {object} options
 * @param {object} options.limits
 * @param {(input: {groupId: number|null, groupName: string}) => object|null} options.resolveGroup
 * @param {boolean} [options.partial] when true, absent fields keep their meaning
 * @returns {object} the normalised contact, ready for the repository
 * @throws {AppError} VALIDATION_INVALID_FIELD
 */
function normalizeContactInput(raw, options) {
  const { limits } = options;
  const errors = new FieldErrors();

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(ErrorCode.VALIDATION_INVALID_FIELD, {
      message: 'The request body must be a JSON object',
      fields: [{ field: 'body', code: ErrorCode.VALIDATION_INVALID_FIELD, message: 'The request body must be a JSON object' }],
    });
  }

  const name = normalizeText(raw.name);
  if (name === '') {
    errors.add(
      'name',
      ErrorCode.VALIDATION_CONTACT_NAME_REQUIRED,
      'The contact name is required',
    );
  } else if (name.length > limits.maxContactNameLength) {
    errors.add(
      'name',
      ErrorCode.VALIDATION_CONTACT_NAME_TOO_LONG,
      `The contact name may have at most ${limits.maxContactNameLength} characters`,
    );
  }

  const company = normalizeText(raw.company);
  if (company.length > limits.maxCompanyLength) {
    errors.add(
      'company',
      ErrorCode.VALIDATION_INVALID_FIELD,
      `The company may have at most ${limits.maxCompanyLength} characters`,
    );
  }

  const title = normalizeText(raw.title);
  if (title.length > limits.maxTitleLength) {
    errors.add(
      'title',
      ErrorCode.VALIDATION_INVALID_FIELD,
      `The job title may have at most ${limits.maxTitleLength} characters`,
    );
  }

  const note = normalizeText(raw.note);
  if (note.length > limits.maxNoteLength) {
    errors.add(
      'note',
      ErrorCode.VALIDATION_INVALID_FIELD,
      `The note may have at most ${limits.maxNoteLength} characters`,
    );
  }

  let bookmarked = false;
  if (raw.isBookmarked !== undefined && raw.isBookmarked !== null) {
    const parsed = parseBoolean(raw.isBookmarked);
    if (parsed === null) {
      errors.add(
        'isBookmarked',
        ErrorCode.VALIDATION_INVALID_BOOKMARK,
        'The bookmark flag must be a boolean',
      );
    } else {
      bookmarked = parsed;
    }
  }

  let groupId = null;
  if (raw.groupId !== undefined && raw.groupId !== null && raw.groupId !== '' && raw.groupId !== 0) {
    const parsed = Number(raw.groupId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.add('groupId', ErrorCode.VALIDATION_GROUP_UNKNOWN, 'The group id is not valid');
    } else {
      groupId = parsed;
    }
  }

  const groupName = normalizeText(raw.groupName);

  const methods = normalizeMethods(raw.methods, limits, errors);

  errors.throwIfAny();

  const group = options.resolveGroup({ groupId, groupName });
  if (groupId !== null && group === null) {
    throw new AppError(ErrorCode.VALIDATION_GROUP_UNKNOWN, {
      message: 'The selected group does not exist',
      fields: [{ field: 'groupId', code: ErrorCode.VALIDATION_GROUP_UNKNOWN, message: 'The selected group does not exist' }],
    });
  }

  return {
    name,
    groupId: group ? group.id : null,
    company,
    title,
    note,
    avatarColor: normalizeText(raw.avatarColor) || pickAvatarColor(name),
    isBookmarked: bookmarked,
    methods,
  };
}

/**
 * Parses and validates the query of the listing, the export and the count.
 *
 * @param {object} raw express `req.query`
 * @param {object} options
 * @param {object} options.limits
 * @returns {object} the normalised query
 * @throws {AppError} VALIDATION_INVALID_PARAMETER
 */
function parseListQuery(raw, options) {
  const { limits } = options;
  const query = {
    keyword: '',
    groupId: null,
    bookmarked: false,
    methodType: null,
    sort: 'updated',
    page: 1,
    pageSize: limits.defaultPageSize,
    offset: 0,
  };

  if (raw.keyword !== undefined) {
    const keyword = normalizeText(raw.keyword);
    if (keyword.length > limits.maxKeywordLength) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: `The keyword may have at most ${limits.maxKeywordLength} characters`,
      });
    }
    query.keyword = keyword;
  }

  if (raw.groupId !== undefined && raw.groupId !== '' && raw.groupId !== 'all') {
    if (!/^\d+$/.test(String(raw.groupId))) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'groupId must be a non-negative integer or "all"',
      });
    }
    query.groupId = Number(raw.groupId);
  }

  if (raw.bookmarked !== undefined && raw.bookmarked !== '') {
    const bookmarked = parseBoolean(raw.bookmarked);
    if (bookmarked === null) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'bookmarked must be a boolean',
      });
    }
    query.bookmarked = bookmarked;
  }

  if (raw.methodType !== undefined && raw.methodType !== '') {
    if (!findMethodType(String(raw.methodType))) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: `methodType must be one of: ${METHOD_TYPES.map((entry) => entry.type).join(', ')}`,
      });
    }
    query.methodType = String(raw.methodType);
  }

  if (raw.sort !== undefined && raw.sort !== '') {
    if (!['name', 'updated', 'created', 'bookmarked'].includes(String(raw.sort))) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'sort must be name, updated, created or bookmarked',
      });
    }
    query.sort = String(raw.sort);
  }

  if (raw.page !== undefined && raw.page !== '') {
    if (!/^\d+$/.test(String(raw.page)) || Number(raw.page) < 1) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'page must be a positive integer',
      });
    }
    query.page = Number(raw.page);
  }

  if (raw.pageSize !== undefined && raw.pageSize !== '') {
    if (!/^\d+$/.test(String(raw.pageSize))) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'pageSize must be a positive integer',
      });
    }
    query.pageSize = Math.min(Math.max(1, Number(raw.pageSize)), limits.maxPageSize);
  }

  query.offset = (query.page - 1) * query.pageSize;
  return query;
}

/**
 * Parses an id taken from the path.
 *
 * @param {*} raw
 * @returns {number}
 * @throws {AppError} VALIDATION_INVALID_PARAMETER
 */
function parseContactId(raw) {
  if (!/^\d+$/.test(String(raw)) || Number(raw) <= 0) {
    throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
      message: 'The contact id must be a positive integer',
    });
  }
  return Number(raw);
}

module.exports = {
  FieldErrors,
  AVATAR_PALETTE,
  isValidMethodValue,
  normalizeContactInput,
  normalizeMethods,
  normalizeText,
  parseBoolean,
  parseContactId,
  parseListQuery,
  pickAvatarColor,
};
