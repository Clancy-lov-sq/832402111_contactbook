'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { createContext, importWorkbook, request, sampleContact, startServer } = require('./helpers');

/**
 * End-to-end tests over a real socket.
 *
 * Nothing is mocked: each request travels through Express, the controller, the
 * service, the repository and a real SQLite file, and the responses are parsed
 * exactly as the browser would parse them.
 */

let context;
let server;

before(async () => {
  context = createContext();
  server = await startServer(context);
});

after(async () => {
  await server.close();
  context.dispose();
});

test('the health check reports the database and the limits', async () => {
  const response = await request(server.baseUrl, '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database.client, 'sqlite');
  assert.equal(response.body.database.status, 'connected');
  assert.equal(typeof response.body.database.storedContacts, 'number');
  assert.equal(response.body.limits.maxMethodsPerContact, 10);
});

test('the landing document lists the endpoints', async () => {
  const response = await request(server.baseUrl, '/api');
  assert.equal(response.status, 200);
  assert.match(response.body, /POST {3}\/api\/contacts/);
  assert.match(response.body, /\/api\/contacts\/export/);
});

test('the metadata describes method types, groups and sort options', async () => {
  const response = await request(server.baseUrl, '/api/meta');
  assert.equal(response.status, 200);
  assert.equal(response.body.methodTypes.length, 7);
  assert.ok(response.body.groups.some((group) => group.name === '朋友'));
  assert.ok(response.body.sortOptions.length >= 4);
  assert.equal(response.body.stats.total, 0);
});

test('a contact with several methods is created with 201', async () => {
  const response = await request(server.baseUrl, '/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleContact({ name: '接口测试甲' })),
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.contact.name, '接口测试甲');
  assert.equal(response.body.contact.methods.length, 4);
  assert.equal(response.body.contact.methods.filter((method) => method.isPrimary).length, 1);
  context.createdId = response.body.contact.id;
});

test('the listing returns the contact and the statistics', async () => {
  const response = await request(server.baseUrl, '/api/contacts?pageSize=10');
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.items[0].id, context.createdId);
  assert.equal(response.body.stats.total, 1);
  assert.equal(response.body.page, 1);
});

test('one contact can be read by its id', async () => {
  const response = await request(server.baseUrl, `/api/contacts/${context.createdId}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.contact.name, '接口测试甲');
});

test('a contact can be updated through HTTP', async () => {
  const response = await request(server.baseUrl, `/api/contacts/${context.createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleContact({
      name: '接口测试甲（改）',
      methods: [
        { type: 'email', value: 'changed@example.com' },
        { type: 'wechat', value: 'changed_wechat' },
      ],
    })),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.contact.name, '接口测试甲（改）');
  assert.equal(response.body.contact.methods.length, 2);
});

test('the bookmark endpoint toggles the flag and returns fresh statistics', async () => {
  const response = await request(server.baseUrl, `/api/contacts/${context.createdId}/bookmark`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarked: true }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.contact.isBookmarked, true);
  assert.equal(response.body.stats.bookmarked, 1);

  const cleared = await request(server.baseUrl, `/api/contacts/${context.createdId}/bookmark`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarked: false }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.contact.isBookmarked, false);
  assert.equal(cleared.body.stats.bookmarked, 0);
});

test('invalid input answers 400 with the rejected fields', async () => {
  const response = await request(server.baseUrl, '/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '',
      methods: [{ type: 'email', value: 'not-an-email' }],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, 'VALIDATION_INVALID_FIELD');
  assert.deepEqual(response.body.fields.map((field) => field.field), ['name', 'methods[0].value']);
});

test('malformed JSON is rejected by the error handler', async () => {
  const response = await request(server.baseUrl, '/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name": ',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_INVALID_JSON');
});

test('a missing contact answers 404 with a classified code', async () => {
  const response = await request(server.baseUrl, '/api/contacts/999999');
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'CONTACT_NOT_FOUND');
});

test('an unknown route answers a JSON 404, never HTML', async () => {
  const response = await request(server.baseUrl, '/api/no-such-endpoint');
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'ROUTE_NOT_FOUND');
  assert.equal(response.body.success, false);
});

test('CORS is answered for a cross-origin page', async () => {
  const origin = 'http://127.0.0.1:5173';
  const response = await request(server.baseUrl, '/api/health', {
    headers: { Origin: origin },
  });
  assert.equal(response.status, 200);
  // The `cors` middleware echoes an allowed origin (or answers `*` when the
  // configuration itself is `*`); both forms authorise the page.
  const allowed = response.headers.get('access-control-allow-origin');
  assert.ok(allowed === '*' || allowed === origin, `unexpected CORS header: ${allowed}`);

  const preflight = await fetch(`${server.baseUrl}/api/contacts`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
    },
  });
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get('access-control-allow-methods').includes('POST'));
});

test('the export returns an xlsx attachment with one row per contact', async () => {
  const response = await fetch(`${server.baseUrl}/api/contacts/export`);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-type'),
    /spreadsheetml\.sheet/,
  );
  assert.match(response.headers.get('content-disposition'), /attachment; filename="contactbook-/);
  assert.equal(response.headers.get('x-export-row-count'), '1');

  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('通讯录');
  assert.equal(worksheet.getRow(4).getCell(2).value, '接口测试甲（改）');
});

test('the import template is downloadable', async () => {
  const response = await fetch(`${server.baseUrl}/api/contacts/template`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /contactbook-import-template\.xlsx/);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');
});

test('a workbook is imported over multipart and reported row by row', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('通讯录');
  worksheet.addRow(['姓名', '分组', '电话1', '电话2', '邮箱1', '微信', '是否收藏']);
  worksheet.addRow(['导入甲', '同事', '13900001111', '0591 8000 1111', 'jia@example.com', 'jia_wx', '是']);
  worksheet.addRow(['导入乙', '朋友', '13900002222', '', 'yi@example.com', '', '否']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const response = await importWorkbook(server.baseUrl, buffer, 'skip');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.report.created, 2);
  assert.equal(response.body.report.failed, 0);
  assert.equal(response.body.report.rows.length, 2);
  assert.equal(response.body.stats.total, 3);

  const again = await importWorkbook(server.baseUrl, buffer, 'skip');
  assert.equal(again.body.report.created, 0);
  assert.equal(again.body.report.skipped, 2);
});

test('the export of every contact can be imported again', async () => {
  const exported = await fetch(`${server.baseUrl}/api/contacts/export`);
  const buffer = Buffer.from(await exported.arrayBuffer());
  const before = (await request(server.baseUrl, '/api/contacts?pageSize=100')).body.total;

  const response = await importWorkbook(server.baseUrl, buffer, 'update');
  assert.equal(response.status, 200);
  assert.equal(response.body.report.created, 0);
  assert.equal(response.body.report.updated, before);
  assert.equal(response.body.report.failed, 0);
});

test('an import without a file answers 400', async () => {
  const form = new FormData();
  form.append('mode', 'skip');
  const response = await request(server.baseUrl, '/api/contacts/import', { method: 'POST', body: form });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'IMPORT_FILE_REQUIRED');
});

test('a file that is not an xlsx workbook is refused', async () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('plain text')], { type: 'text/plain' }), 'contacts.csv');
  const response = await request(server.baseUrl, '/api/contacts/import', { method: 'POST', body: form });
  assert.equal(response.status, 415);
  assert.equal(response.body.error, 'IMPORT_FILE_UNSUPPORTED');
});

test('a contact can be deleted and is gone from the listing', async () => {
  const response = await request(server.baseUrl, `/api/contacts/${context.createdId}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal(response.body.deletedId, context.createdId);
  assert.ok(response.body.remaining >= 2);

  const missing = await request(server.baseUrl, `/api/contacts/${context.createdId}`);
  assert.equal(missing.status, 404);
});

test('the keyword and bookmark filters travel through the query string', async () => {
  const bookmarked = await request(server.baseUrl, '/api/contacts?bookmarked=true&pageSize=100');
  assert.equal(bookmarked.status, 200);
  assert.ok(bookmarked.body.items.every((contact) => contact.isBookmarked === true));
  assert.ok(bookmarked.body.items.some((contact) => contact.name === '导入甲'));

  const keyword = await request(server.baseUrl, '/api/contacts?keyword=导入乙');
  assert.equal(keyword.body.total, 1);
  assert.equal(keyword.body.items[0].name, '导入乙');
});

test('an invalid query parameter answers 400', async () => {
  const response = await request(server.baseUrl, '/api/contacts?sort=password');
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'VALIDATION_INVALID_PARAMETER');
});
