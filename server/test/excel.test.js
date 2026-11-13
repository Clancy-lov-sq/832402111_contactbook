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
  const worksheet = workbook.addWorksheet('通讯录');
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
    ['电话1', '电话2', '邮箱1', '邮箱2', '微信', 'QQ', '网址', '地址', '其他'],
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
  assert.ok(columns.some((column) => column.header === '电话3'));
  assert.ok(!columns.some((column) => column.header === '邮箱3'));
});

test('the export puts one contact per row and one value per column', () => withContext(async ({ contactService }) => {
  contactService.create(sampleContact({ name: '导出甲', isBookmarked: true }));
  contactService.create(sampleContact({
    name: '导出乙',
    methods: [{ type: 'phone', value: '13900001234' }],
  }));
  const contacts = contactService.listForExport({ sort: 'name' });
  const { buffer, fileName, rowCount } = await createExportBuffer(contacts);
  assert.equal(rowCount, 2);
  assert.match(fileName, /^contactbook-\d{12}\.xlsx$/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('通讯录');
  assert.ok(worksheet);

  const header = worksheet.getRow(3).values.slice(1);
  assert.equal(header[1], '姓名');
  assert.equal(header[2], '分组');
  assert.ok(header.includes('电话1'));
  assert.ok(header.includes('邮箱1'));

  // The rows follow the name order of the query, so the assertion finds the row
  // of each contact instead of relying on a collation rule.
  const rowsByName = new Map();
  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber).values.slice(1);
    rowsByName.set(row[1], { rowNumber, cells: row });
  }
  assert.equal(rowsByName.size, 2);
  assert.equal(rowsByName.get('导出甲').cells[6], '是');
  assert.equal(rowsByName.get('导出乙').cells[6], '否');
  // The bookmark row is highlighted, which is what makes it findable in Excel.
  assert.equal(
    worksheet.getRow(rowsByName.get('导出甲').rowNumber).getCell(2).fill.fgColor.argb,
    'FFFEF3C7',
  );
}));

test('an exported workbook can be imported again without losing a value', () => withContext(async ({ contactService }) => {
  const original = contactService.create(sampleContact({
    name: '往返测试',
    methods: [
      { type: 'phone', value: '13800008888', label: '手机' },
      { type: 'phone', value: '0591 8888 9999', label: '办公' },
      { type: 'email', value: 'roundtrip@example.com', label: '工作' },
      { type: 'address', value: '福州市闽侯县学园路 2 号', label: '住址' },
    ],
  }));
  const { buffer } = await createExportBuffer(contactService.listForExport({}));

  const plan = await parseImportWorkbook(buffer);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].name, '往返测试');
  assert.equal(plan.rows[0].methods.length, 4);
  assert.equal(plan.rows[0].methods[0].value, '13800008888');
  assert.equal(plan.rows[0].methods[2].type, 'email');
  assert.equal(plan.rows[0].methods[2].label, '');
  assert.equal(plan.failed.length, 0);
  assert.equal(original.methods.length, 4);
}));

test('importing a workbook creates the contacts and their methods', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['姓名', '分组', '公司', '电话1', '电话2', '邮箱1', '微信', '是否收藏'],
    [
      ['苏晚晴', '朋友', '未晚工作室', '13712345678', '0591 8888 1111', 'wanqing@example.com', 'suwanqing', '是'],
      ['王浩然', '同事', '云图软件', '18600001111', '', 'haoran@company.com', 'wanghr', '否'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 2);
  assert.equal(report.failed, 0);
  assert.equal(report.totalRows, 2);

  const page = context.contactService.list({ sort: 'name' });
  const su = page.items.find((contact) => contact.name === '苏晚晴');
  assert.equal(su.groupName, '朋友');
  assert.equal(su.methods.length, 4);
  assert.equal(su.isBookmarked, true);
  assert.equal(su.methods.filter((method) => method.type === 'phone').length, 2);
}));

test('the skip mode leaves a duplicate contact untouched', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['姓名', '电话1', '邮箱1'],
    [['苏晚晴', '13712345678', 'wanqing@example.com']],
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
    name: '苏晚晴',
    note: '旧备注',
    methods: [{ type: 'phone', value: '13712345678' }],
  }));

  const buffer = await buildWorkbook(
    ['姓名', '备注', '电话1', '邮箱1'],
    [['苏晚晴', '', '13712345678', 'new@example.com']],
  );
  const report = await importBuffer(context, buffer, 'update');
  assert.equal(report.updated, 1);

  const stored = context.contactService.getById(original.id);
  assert.equal(stored.note, '旧备注');
  assert.equal(stored.methods.length, 2);
  assert.ok(stored.methods.some((method) => method.type === 'email' && method.value === 'new@example.com'));
}));

test('a malformed value is reported with its Excel row number', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['姓名', '电话1', '邮箱1'],
    [
      ['正常联系人', '13800001111', 'ok@example.com'],
      ['坏号码', 'not-a-phone', 'ok@example.com'],
      ['坏邮箱', '13800002222', 'not-an-email'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 1);
  assert.equal(report.failed, 2);
  assert.deepEqual(report.rows.map((row) => row.row), [2, 3, 4]);
  assert.match(report.rows[1].message, /不是有效的电话格式/);
  assert.match(report.rows[2].message, /不是有效的邮箱格式/);
  assert.equal(context.contactService.list({}).total, 1);
}));

test('English headers and reordered columns are accepted', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['Phone 1', 'Name', 'Email', 'Group'],
    [['13800009999', 'English Header', 'en@example.com', '客户']],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 1);
  const contact = context.contactService.list({}).items[0];
  assert.equal(contact.name, 'English Header');
  assert.equal(contact.groupName, '客户');
  assert.deepEqual(contact.methods.map((method) => method.type), ['phone', 'email']);
}));

test('a workbook without a name column is rejected', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['电话1', '邮箱1'], [['13800001111', 'a@example.com']]);
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
  assert.ok(workbook.getWorksheet('通讯录'));
  assert.ok(workbook.getWorksheet('填写说明'));
  assert.equal(workbook.getWorksheet('通讯录').getRow(3).getCell(2).value, '姓名');
  const templateHeader = workbook.getWorksheet('通讯录').getRow(3).values.slice(1);
  assert.ok(templateHeader.includes('电话3'));
  assert.ok(templateHeader.includes('邮箱3'));

  const plan = await parseImportWorkbook(buffer);
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.failed.length, 0);
  assert.equal(plan.totalRows, 0);
}));

test('the bookmark column accepts 是 and 否', () => withContext(async (context) => {
  const buffer = await buildWorkbook(
    ['姓名', '是否收藏', '电话1'],
    [
      ['收藏的人', '是', '13800003333'],
      ['未收藏的人', '否', '13800004444'],
      ['留空的人', '', '13800005555'],
    ],
  );
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 3);
  const byName = new Map(context.contactService.list({}).items.map((item) => [item.name, item]));
  assert.equal(byName.get('收藏的人').isBookmarked, true);
  assert.equal(byName.get('未收藏的人').isBookmarked, false);
  assert.equal(byName.get('留空的人').isBookmarked, false);
}));

test('an unreadable bookmark value rejects the row', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['姓名', '是否收藏', '电话1'], [['奇怪标记', '也许', '13800006666']]);
  const report = await importBuffer(context, buffer);
  assert.equal(report.created, 0);
  assert.equal(report.failed, 1);
  assert.match(report.rows[0].message, /是否收藏/);
}));

test('the row limit stops an oversized workbook', () => withContext(async (context) => {
  const header = ['姓名', '电话1'];
  const rows = Array.from({ length: 5 }, (_, index) => [`批量${index}`, `1380000700${index}`]);
  const buffer = await buildWorkbook(header, rows);
  const error = await expectRejection(() => parseImportWorkbook(buffer, { maxRows: 2 }));
  assert.equal(error.code, 'IMPORT_TOO_MANY_ROWS');
  assert.equal(context.contactService.list({}).total, 0);
}));

test('an unknown group name from a workbook is created', () => withContext(async (context) => {
  const buffer = await buildWorkbook(['姓名', '分组', '电话1'], [['分组测试', '羽毛球群', '13800008888']]);
  const report = await importBuffer(context, buffer);
  assert.equal(report.groupsCreated, 1);
  const groups = context.contactService.meta().groups.map((group) => group.name);
  assert.ok(groups.includes('羽毛球群'));
}));

test('an empty workbook is rejected', () => withContext(async (context) => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('通讯录');
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const error = await expectRejection(() => importBuffer(context, buffer));
  assert.equal(error.code, 'IMPORT_WORKBOOK_EMPTY');
}));
