'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { createContext, sampleContact } = require('./helpers');
const {
  buildMethodColumns,
  createExportBuffer,
  createTemplateBuffer,
  parseImportWorkbook,
} = require('../src/services/excelService');
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
 * Runs an async callback that must reject and returns the rejection reason.
 * @param {Function} callback
 * @returns {Promise<Error>}
 */
async function expectRejection(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  return assert.fail('Expected a rejected promise, but it resolved');
}

/**
 * Builds an `.xlsx` buffer from a header and data rows.
 * @param {string[]} header
 * @param {Array<Array<*>>} rows
 * @returns {Promise<Buffer>}
 */
async function buildWorkbook(header, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Contacts');
  worksheet.addRow(header);
  for (const row of rows) {
    worksheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Imports a buffer through the service and returns the report. */
function importBuffer(context, buffer, mode = 'skip') {
  return context.importService.importBuffer(buffer, { mode });
}

test('the method columns provide the minimum slots of every type', () => {
  const columns = buildMethodColumns([]);
  assert.deepEqual(
    columns.map((column) => column.header),
    ['Phone 1', 'Phone 2', 'Email 1', 'Email 2', 'WeChat', 'QQ', 'Website', 'Address', 'Other'],
  );
});

test('the method columns grow with the widest contact', () => {
  const columns = buildMethodColumns([
    {
      methods: [
        { type: 'phone', value: '1' },
        { type: 'phone', value: '2' },
        { type: 'phone', value: '3' },
        { type: 'email', value: 'a@b.com' },
      ],
    },
  ]);
  assert.ok(columns.some((column) => column.header === 'Phone 3'));
  assert.ok(!columns.some((column) => column.header === 'Email 3'));
});

test('the export puts one contact per row and one value per column', () => withContext(async ({ contactService }) => {
  contactService.create(sampleContact({ name: 'Export A', isBookmarked: true }));
  contactService.create(sampleContact({
    name: 'Export B',
    methods: [{ type: 'phone', value: '13900001234' }],
  }));
  const contacts = contactService.listForExport({ sort: 'name' });
  const { buffer, fileName, rowCount } = await createExportBuffer(contacts);
  assert.equal(rowCount, 2);
  assert.match(fileName, /^contactbook-\d{12}\.xlsx$/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('Contacts');
  assert.ok(worksheet);

  const header = worksheet.getRow(3).values.slice(1);
  assert.equal(header[1], 'Name');
  assert.equal(header[2], 'Group');
  assert.ok(header.includes('Phone 1'));
  assert.ok(header.includes('Email 1'));

  // The rows follow the name order of the query, so the assertion finds the row
  // of each contact instead of relying on a collation rule.
  const rowsByName = new Map();
  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber).values.slice(1);
    rowsByName.set(row[1], { rowNumber, cells: row });
  }
  assert.equal(rowsByName.size, 2);
  assert.equal(rowsByName.get('Export A').cells[6], 'Yes');
  assert.equal(rowsByName.get('Export B').cells[6], 'No');
  // The bookmark row is highlighted, which is what makes it findable in Excel.
  assert.equal(
    worksheet.getRow(rowsByName.get('Export A').rowNumber).getCell(2).fill.fgColor.argb,
    'FFFEF3C7',
  );
}));

test('an exported workbook can be imported again without losing a value', () => withContext(async ({ contactService }) => {
  const original = contactService.create(sampleContact({
    name: 'Round Trip',
    methods: [
      { type: 'phone', value: '13800008888', label: 'Mobile' },
      { type: 'phone', value: '0591 8888 9999', label: 'Office' },
      { type: 'email', value: 'roundtrip@example.com', label: 'Work' },
      { type: 'address', value: 'No. 2 Xueyuan Road, Minhou County, Fuzhou', label: 'Home' },
    ],
  }));
  const { buffer } = await createExportBuffer(contactService.listForExport({}));

  const plan = await parseImportWorkbook(buffer);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].name, 'Round Trip');
  assert.equal(plan.rows[0].methods.length, 4);
  assert.equal(plan.rows[0].methods[0].value, '13800008888');
  assert.equal(plan.rows[0].methods[2].type, 'email');
  assert.equal(plan.rows[0].methods[2].label, '');
  assert.equal(plan.failed.length, 0);
  assert.equal(original.methods.length, 4);
}));

test('importing a workbook creates the contacts and their methods', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Name', 'Group', 'Company', 'Phone 1', 'Phone 2', 'Email 1', 'WeChat', 'Bookmarked'],
    [
      ['Sophie Su', 'Friends', 'Muyan Studio', '13712345678', '0591 8888 1111', 'sophie.su@example.com', 'sophie_su', 'Yes'],
      ['Henry Wang', 'Colleagues', 'Yuntu Software', '18600001111', '', 'henry.wang@yuntu.example.com', 'henry_wang_work', 'No'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 2);
  assert.equal(report.failed, 0);
  assert.equal(report.totalRows, 2);

  const page = context.contactService.list({ sort: 'name' });
  const su = page.items.find((contact) => contact.name === 'Sophie Su');
  assert.equal(su.groupName, 'Friends');
  assert.equal(su.methods.length, 4);
  assert.equal(su.isBookmarked, true);
  assert.equal(su.methods.filter((method) => method.type === 'phone').length, 2);
}));

test('the skip mode leaves a duplicate contact untouched', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Name', 'Phone 1', 'Email 1'],
    [['Sophie Su', '13712345678', 'sophie.su@example.com']],
  );
  const first = await importBuffer(context, buffer, 'skip');
  assert.equal(first.created, 1);

  const second = await importBuffer(context, buffer, 'skip');
  assert.equal(second.created, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.updated, 0);
  assert.equal(second.rows[0].status, 'skipped');
  assert.equal(context.contactService.list({}).total, 1);
}));

test('the update mode merges new methods into the existing contact', () => withContext(async (context) => {
  const original = context.contactService.create(sampleContact({
    name: 'Sophie Su',
    note: 'Old note',
    methods: [{ type: 'phone', value: '13712345678' }],
  }));

  const buffer = await buildWorkbook(
    ['Name', 'Note', 'Phone 1', 'Email 1'],
    [['Sophie Su', '', '13712345678', 'new@example.com']],
  );
  const report = await importBuffer(context, buffer, 'update');
  assert.equal(report.updated, 1);

  const stored = context.contactService.getById(original.id);
  assert.equal(stored.note, 'Old note');
  assert.equal(stored.methods.length, 2);
  assert.ok(stored.methods.some((method) => method.type === 'email' && method.value === 'new@example.com'));
}));

test('a malformed value is reported with its Excel row number', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Name', 'Phone 1', 'Email 1'],
    [
      ['Valid Contact', '13800001111', 'ok@example.com'],
      ['Bad Phone', 'not-a-phone', 'ok@example.com'],
      ['Bad Email', '13800002222', 'not-an-email'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 1);
  assert.equal(report.failed, 2);
  assert.deepEqual(report.rows.map((row) => row.row), [2, 3, 4]);
  assert.match(report.rows[1].message, /is not a valid phone value/);
  assert.match(report.rows[2].message, /is not a valid email value/);
  assert.equal(context.contactService.list({}).total, 1);
}));

test('English headers and reordered columns are accepted', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Phone 1', 'Name', 'Email', 'Group'],
    [['13800009999', 'English Header', 'en@example.com', 'Clients']],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 1);
  const contact = context.contactService.list({}).items[0];
  assert.equal(contact.name, 'English Header');
  assert.equal(contact.groupName, 'Clients');
  assert.deepEqual(contact.methods.map((method) => method.type), ['phone', 'email']);
}));

test('a workbook without a name column is rejected', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['Phone 1', 'Email 1'], [['13800001111', 'a@example.com']]);
  const error = await expectRejection(() => importBuffer(context, buffer));
  assert.equal(error.code, 'IMPORT_HEADER_MISSING');
  assert.equal(error.status, 422);
}));

test('a file that is not an xlsx workbook is rejected', () => withContext(async (context) => {
  const error = await expectRejection(
    () => importBuffer(context, Buffer.from('this is not a workbook')),
  );
  assert.equal(error.code, 'IMPORT_FAILED');
}));

test('the template contains the instruction sheet and no data row', () => withContext(async (context) => {
  const { buffer, fileName } = await createTemplateBuffer();
  assert.equal(fileName, 'contactbook-import-template.xlsx');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.ok(workbook.getWorksheet('Contacts'));
  assert.ok(workbook.getWorksheet('Instructions'));
  assert.equal(workbook.getWorksheet('Contacts').getRow(3).getCell(2).value, 'Name');
  const templateHeader = workbook.getWorksheet('Contacts').getRow(3).values.slice(1);
  assert.ok(templateHeader.includes('Phone 3'));
  assert.ok(templateHeader.includes('Email 3'));

  const plan = await parseImportWorkbook(buffer);
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.failed.length, 0);
  assert.equal(plan.totalRows, 0);
}));

test('the bookmark column accepts Yes and No', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Name', 'Bookmarked', 'Phone 1'],
    [
      ['Bookmarked One', 'Yes', '13800003333'],
      ['Unbookmarked One', 'No', '13800004444'],
      ['Blank One', '', '13800005555'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 3);
  const byName = new Map(context.contactService.list({}).items.map((item) => [item.name, item]));
  assert.equal(byName.get('Bookmarked One').isBookmarked, true);
  assert.equal(byName.get('Unbookmarked One').isBookmarked, false);
  assert.equal(byName.get('Blank One').isBookmarked, false);
}));

test('an unreadable bookmark value rejects the row', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['Name', 'Bookmarked', 'Phone 1'], [['Odd Flag', 'maybe', '13800006666']]);
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 0);
  assert.equal(report.failed, 1);
  assert.match(report.rows[0].message, /Bookmarked/);
}));

test('the row limit stops an oversized workbook', () => withContext(async (context) => {
  const header = ['Name', 'Phone 1'];
  const rows = Array.from({ length: 5 }, (_, index) => [`Batch ${index}`, `1380000700${index}`]);
  const buffer = await buildWorkbook(header, rows);
  const error = await expectRejection(() => parseImportWorkbook(buffer, { maxRows: 2 }));
  assert.equal(error.code, 'IMPORT_TOO_MANY_ROWS');
  assert.equal(context.contactService.list({}).total, 0);
}));

test('an unknown group name from a workbook is created', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['Name', 'Group', 'Phone 1'], [['Group Test', 'Badminton Club', '13800008888']]);
  const report = await importBuffer(context, buffer);
  assert.equal(report.groupsCreated, 1);
  const groups = context.contactService.meta().groups.map((group) => group.name);
  assert.ok(groups.includes('Badminton Club'));
}));

test('an empty workbook is rejected', () => withContext(async (context) => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Contacts');
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const error = await expectRejection(() => importBuffer(context, buffer));
  assert.equal(error.code, 'IMPORT_WORKBOOK_EMPTY');
}));
