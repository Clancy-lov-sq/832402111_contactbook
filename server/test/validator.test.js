'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidMethodValue,
  normalizeContactInput,
  normalizeMethods,
  parseBoolean,
  parseContactId,
  parseListQuery,
  pickAvatarColor,
} = require('../src/services/contactValidator');
const { AppError } = require('../src/utils/errors');

/** A resolver that behaves like "the group does not exist yet". */
const noGroups = () => null;

/** Validates without a database and returns the normalised contact. */
function normalize(payload) {
  return normalizeContactInput(payload, {
    limits: {
      maxContactNameLength: 40,
      maxCompanyLength: 60,
      maxTitleLength: 40,
      maxNoteLength: 500,
      maxMethodsPerContact: 10,
      maxMethodLabelLength: 20,
      maxMethodValueLength: 120,
      maxKeywordLength: 60,
      defaultPageSize: 24,
      maxPageSize: 100,
    },
    resolveGroup: noGroups,
  });
}

/**
 * Runs a callback that must throw and returns the thrown error.
 * @param {Function} callback
 * @returns {Error}
 */
function expectError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return assert.fail('Expected a classified error, but nothing was thrown');
}

test('a contact name is required', () => {
  const error = expectError(() => normalize({ name: '   ' }));
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'VALIDATION_INVALID_FIELD');
  assert.equal(error.fields[0].field, 'name');
  assert.equal(error.status, 400);
});

test('the name is trimmed and inner whitespace is collapsed', () => {
  const contact = normalize({ name: '  Alex   Chen  ' });
  assert.equal(contact.name, 'Alex Chen');
});

test('a name longer than the limit is rejected', () => {
  const error = expectError(() => normalize({ name: 'name'.repeat(41) }));
  assert.equal(error.fields[0].code, 'VALIDATION_CONTACT_NAME_TOO_LONG');
});

test('several contact methods are accepted and the first becomes primary', () => {
  const contact = normalize({
    name: 'Alex Chen',
    methods: [
      { type: 'phone', value: '13800001111' },
      { type: 'email', value: 'chengyue@example.com' },
      { type: 'wechat', value: 'chengyue_lin' },
    ],
  });
  assert.equal(contact.methods.length, 3);
  assert.equal(contact.methods[0].isPrimary, true);
  assert.equal(contact.methods[1].isPrimary, false);
});

test('an explicit primary method is kept and a second primary is cleared', () => {
  const contact = normalize({
    name: 'Alex Chen',
    methods: [
      { type: 'phone', value: '13800001111', isPrimary: false },
      { type: 'email', value: 'chengyue@example.com', isPrimary: true, label: 'Primary' },
      { type: 'wechat', value: 'chengyue_lin', isPrimary: true },
    ],
  });
  assert.deepEqual(contact.methods.map((method) => method.isPrimary), [false, true, false]);
  assert.equal(contact.methods[1].label, 'Primary');
});

test('an unknown method type is rejected', () => {
  const error = expectError(
    () => normalize({ name: 'Alex Chen', methods: [{ type: 'telegram', value: '@lin' }] }),
  );
  assert.equal(error.fields[0].code, 'VALIDATION_METHOD_TYPE_UNKNOWN');
  assert.equal(error.fields[0].field, 'methods[0].type');
});

test('an empty method value is rejected', () => {
  const error = expectError(
    () => normalize({ name: 'Alex Chen', methods: [{ type: 'email', value: '   ' }] }),
  );
  assert.equal(error.fields[0].code, 'VALIDATION_METHOD_VALUE_REQUIRED');
});

test('a phone value must contain at least six digits', () => {
  assert.equal(isValidMethodValue('phone', '12345'), false);
  assert.equal(isValidMethodValue('phone', '0591-8888-6666'), true);
  assert.equal(isValidMethodValue('phone', '+86 138 0000 1111'), true);
  assert.equal(isValidMethodValue('phone', 'hello world'), false);
});

test('an e-mail value must look like an address', () => {
  assert.equal(isValidMethodValue('email', 'chengyue@example.com'), true);
  assert.equal(isValidMethodValue('email', 'chengyue.example.com'), false);
  assert.equal(isValidMethodValue('email', 'chengyue@example'), false);
});

test('a QQ number must be five to twelve digits', () => {
  assert.equal(isValidMethodValue('qq', '44556677'), true);
  assert.equal(isValidMethodValue('qq', '4455'), false);
  assert.equal(isValidMethodValue('qq', '4455abc'), false);
});

test('a website may be a full URL or a bare domain', () => {
  assert.equal(isValidMethodValue('website', 'https://zimo.example.com'), true);
  assert.equal(isValidMethodValue('website', 'zimo.example.com'), true);
  assert.equal(isValidMethodValue('website', 'not a website'), false);
});

test('the same method may not be listed twice', () => {
  const error = expectError(
    () => normalize({
      name: 'Alex Chen',
      methods: [
        { type: 'phone', value: '13800001111' },
        { type: 'phone', value: '13800001111' },
      ],
    }),
  );
  assert.equal(error.fields[0].code, 'VALIDATION_DUPLICATE_METHOD');
});

test('more methods than the limit are rejected', () => {
  const methods = Array.from({ length: 11 }, (_, index) => ({
    type: 'phone',
    value: `1380000${String(index).padStart(4, '0')}`,
  }));
  const error = expectError(() => normalize({ name: 'Alex Chen', methods }));
  assert.equal(error.fields[0].code, 'VALIDATION_TOO_MANY_METHODS');
});

test('the bookmark flag only accepts a boolean shape', () => {
  assert.equal(parseBoolean(true), true);
  assert.equal(parseBoolean('false'), false);
  assert.equal(parseBoolean('Yes'), true);
  assert.equal(parseBoolean('No'), false);
  assert.equal(parseBoolean('maybe'), null);
  const error = expectError(() => normalize({ name: 'Alex Chen', isBookmarked: 'maybe' }));
  assert.equal(error.fields[0].code, 'VALIDATION_INVALID_BOOKMARK');
});

test('an unknown group id is reported on the groupId field', () => {
  const error = expectError(() => normalizeContactInput(
    { name: 'Alex Chen', groupId: 404 },
    {
      limits: {
        maxContactNameLength: 40,
        maxCompanyLength: 60,
        maxTitleLength: 40,
        maxNoteLength: 500,
        maxMethodsPerContact: 10,
        maxMethodLabelLength: 20,
        maxMethodValueLength: 120,
      },
      resolveGroup: () => null,
    },
  ));
  assert.equal(error.code, 'VALIDATION_GROUP_UNKNOWN');
  assert.equal(error.fields[0].field, 'groupId');
});

test('the avatar colour is stable for one name', () => {
  assert.equal(pickAvatarColor('Alex Chen'), pickAvatarColor('Alex Chen'));
  assert.match(pickAvatarColor('Alex Chen'), /^#[0-9a-f]{6}$/);
});

test('a contact id must be a positive integer', () => {
  assert.equal(parseContactId('12'), 12);
  assert.throws(() => parseContactId('0'), AppError);
  assert.throws(() => parseContactId('abc'), AppError);
});

test('the listing query has safe defaults', () => {
  const query = parseListQuery({}, { limits: { defaultPageSize: 24, maxPageSize: 100, maxKeywordLength: 60 } });
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 24);
  assert.equal(query.sort, 'updated');
  assert.equal(query.keyword, '');
  assert.equal(query.bookmarked, false);
  assert.equal(query.groupId, null);
  assert.equal(query.offset, 0);
});

test('the listing query accepts a filter and a page', () => {
  const query = parseListQuery(
    { keyword: '  sophie  ', groupId: '2', bookmarked: 'true', sort: 'name', page: '3', pageSize: '12' },
    { limits: { defaultPageSize: 24, maxPageSize: 100, maxKeywordLength: 60 } },
  );
  assert.equal(query.keyword, 'sophie');
  assert.equal(query.groupId, 2);
  assert.equal(query.bookmarked, true);
  assert.equal(query.sort, 'name');
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 12);
  assert.equal(query.offset, 24);
});

test('the page size is clamped and an invalid sort is rejected', () => {
  const query = parseListQuery(
    { pageSize: '5000' },
    { limits: { defaultPageSize: 24, maxPageSize: 100, maxKeywordLength: 60 } },
  );
  assert.equal(query.pageSize, 100);
  assert.throws(
    () => parseListQuery({ sort: 'password' }, { limits: { defaultPageSize: 24, maxPageSize: 100, maxKeywordLength: 60 } }),
    AppError,
  );
});

test('an unknown method type is rejected as a query filter', () => {
  assert.throws(
    () => parseListQuery({ methodType: 'pigeon' }, { limits: { defaultPageSize: 24, maxPageSize: 100, maxKeywordLength: 60 } }),
    AppError,
  );
});

test('normalizeMethods returns an empty list when there is no method', () => {
  const errors = { items: [], add() {} };
  assert.deepEqual(normalizeMethods(undefined, { maxMethodsPerContact: 10, maxMethodValueLength: 120, maxMethodLabelLength: 20 }, errors), []);
});
