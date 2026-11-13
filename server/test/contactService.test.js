'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createContext, sampleContact } = require('./helpers');
const { AppError } = require('../src/utils/errors');

/** Runs one test body against a fresh context and always cleans up. */
async function withContext(callback) {
  const context = createContext();
  try {
    return await callback(context);
  } finally {
    context.dispose();
  }
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

test('creating a contact stores its methods and reuses an existing group', () => withContext(({ contactService }) => {
  const contact = contactService.create(sampleContact());
  assert.equal(contact.name, '测试联系人');
  assert.equal(contact.groupName, '朋友');
  assert.equal(contact.methods.length, 4);
  assert.deepEqual(
    contact.methods.map((method) => method.type),
    ['phone', 'phone', 'email', 'wechat'],
  );
  assert.equal(contact.methods[0].isPrimary, true);
  assert.equal(contact.isBookmarked, false);
}));

test('a group that does not exist yet is created by name', () => withContext(({ contactService }) => {
  const contact = contactService.create(sampleContact({ groupName: '读书会' }));
  assert.equal(contact.groupName, '读书会');
  const groups = contactService.meta().groups.map((group) => group.name);
  assert.ok(groups.includes('读书会'));
}));

test('the listing reports pagination, filters and statistics', () => withContext(({ contactService }) => {
  for (let index = 0; index < 5; index += 1) {
    contactService.create(sampleContact({
      name: `联系人${index}`,
      methods: [{ type: 'phone', value: `1380000100${index}` }],
      isBookmarked: index % 2 === 0,
    }));
  }
  const page = contactService.list({ page: '1', pageSize: '2', sort: 'name' });
  assert.equal(page.total, 5);
  assert.equal(page.items.length, 2);
  assert.equal(page.totalPages, 3);
  assert.equal(page.stats.total, 5);
  assert.equal(page.stats.bookmarked, 3);
  assert.equal(page.stats.methodCount, 5);
}));

test('a contact that does not exist raises CONTACT_NOT_FOUND', () => withContext(({ contactService }) => {
  const error = expectError(() => contactService.getById('999'));
  assert.equal(error.code, 'CONTACT_NOT_FOUND');
  assert.equal(error.status, 404);
}));

test('an update replaces the method list and keeps the creation time', () => withContext(({ contactService }) => {
  const created = contactService.create(sampleContact());
  const updated = contactService.update(created.id, sampleContact({
    name: '测试联系人（改）',
    methods: [
      { type: 'email', value: 'new@example.com', label: '新邮箱' },
      { type: 'address', value: '福州市鼓楼区 1 号' },
    ],
  }));
  assert.equal(updated.name, '测试联系人（改）');
  assert.equal(updated.methods.length, 2);
  assert.equal(updated.methods[0].type, 'email');
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(updated.updatedAt >= created.updatedAt);
}));

test('a bookmark stores the moment it was given and clears it again', () => withContext(({ contactService }) => {
  const created = contactService.create(sampleContact());
  const bookmarked = contactService.setBookmark(created.id, true);
  assert.equal(bookmarked.isBookmarked, true);
  assert.match(bookmarked.bookmarkedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const cleared = contactService.setBookmark(created.id, false);
  assert.equal(cleared.isBookmarked, false);
  assert.equal(cleared.bookmarkedAt, null);
}));

test('a non-boolean bookmark flag is rejected', () => withContext(({ contactService }) => {
  const created = contactService.create(sampleContact());
  const error = expectError(() => contactService.setBookmark(created.id, 'maybe'));
  assert.equal(error.code, 'VALIDATION_INVALID_BOOKMARK');
}));

test('bookmarking a contact that does not exist raises CONTACT_NOT_FOUND', () => withContext(({ contactService }) => {
  const error = expectError(() => contactService.setBookmark('999', true));
  assert.equal(error.code, 'CONTACT_NOT_FOUND');
}));

test('a deleted contact disappears from the listing', () => withContext(({ contactService }) => {
  const created = contactService.create(sampleContact());
  const result = contactService.remove(created.id);
  assert.equal(result.deletedId, created.id);
  assert.equal(result.remaining, 0);
  expectError(() => contactService.getById(created.id));
}));

test('deleting a missing contact raises CONTACT_NOT_FOUND', () => withContext(({ contactService }) => {
  const error = expectError(() => contactService.remove('999'));
  assert.equal(error.code, 'CONTACT_NOT_FOUND');
}));

test('the keyword searches the name, the note and every method value', () => withContext(({ contactService }) => {
  contactService.create(sampleContact({ name: '苏晚晴', note: '大学室友' }));
  contactService.create(sampleContact({
    name: '王浩然',
    groupName: '同事',
    note: '接口联调',
    methods: [{ type: 'email', value: 'haoran.wang@company.com' }],
  }));

  assert.equal(contactService.list({ keyword: '苏晚晴' }).total, 1);
  assert.equal(contactService.list({ keyword: '联调' }).total, 1);
  assert.equal(contactService.list({ keyword: 'company.com' }).total, 1);
  assert.equal(contactService.list({ keyword: '不存在的关键字' }).total, 0);
}));

test('the bookmark filter returns only starred contacts', () => withContext(({ contactService }) => {
  contactService.create(sampleContact({ name: '甲', isBookmarked: true }));
  contactService.create(sampleContact({ name: '乙', isBookmarked: false }));
  const page = contactService.list({ bookmarked: 'true' });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].name, '甲');
}));

test('the ungrouped filter selects contacts without a group', () => withContext(({ contactService }) => {
  contactService.create(sampleContact({ name: '有分组', groupName: '同事' }));
  const ungrouped = contactService.create(sampleContact({
    name: '无分组',
    groupName: '',
    methods: [{ type: 'phone', value: '13800002222' }],
  }));
  assert.equal(ungrouped.groupId, null);
  const page = contactService.list({ groupId: '0' });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].name, '无分组');
}));

test('contacts can be sorted by name', () => withContext(({ contactService }) => {
  contactService.create(sampleContact({ name: '陈秀兰', methods: [{ type: 'phone', value: '13800003333' }] }));
  contactService.create(sampleContact({ name: '安一', methods: [{ type: 'phone', value: '13800004444' }] }));
  contactService.create(sampleContact({ name: '周子墨', methods: [{ type: 'phone', value: '13800005555' }] }));
  const page = contactService.list({ sort: 'name' });
  assert.deepEqual(page.items.map((contact) => contact.name), ['安一', '周子墨', '陈秀兰'].sort());
}));

test('the export query ignores pagination and returns every match', () => withContext(({ contactService }) => {
  for (let index = 0; index < 12; index += 1) {
    contactService.create(sampleContact({
      name: `导出${index}`,
      methods: [{ type: 'phone', value: `1390000100${index}` }],
    }));
  }
  assert.equal(contactService.list({ pageSize: '3' }).items.length, 3);
  assert.equal(contactService.listForExport({}).length, 12);
  assert.equal(contactService.listForExport({ keyword: '导出1' }).length, 3);
}));

test('the metadata endpoint describes the method types, groups and limits', () => withContext(({ contactService }) => {
  const meta = contactService.meta();
  assert.equal(meta.methodTypes.length, 7);
  assert.equal(meta.methodTypes[0].type, 'phone');
  assert.ok(meta.groups.some((group) => group.name === '家人'));
  assert.equal(meta.limits.maxMethodsPerContact, 10);
  assert.ok(meta.sortOptions.some((option) => option.value === 'bookmarked'));
}));

test('the method order is preserved for the interface', () => withContext(({ contactService }) => {
  const contact = contactService.create(sampleContact({
    methods: [
      { type: 'wechat', value: 'first_wechat' },
      { type: 'phone', value: '13800006666' },
      { type: 'address', value: '福州市台江区 2 号' },
    ],
  }));
  assert.deepEqual(
    contact.methods.map((method) => method.type),
    ['wechat', 'phone', 'address'],
  );
  assert.deepEqual(
    contact.methods.map((method) => method.sortOrder),
    [0, 1, 2],
  );
}));
