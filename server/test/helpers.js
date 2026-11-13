'use strict';

const fs = require('node:fs');
const path = require('node:path');

const config = require('../src/config/config');
const { openDatabase } = require('../src/db/database');
const { ContactService } = require('../src/services/contactService');
const { ImportService } = require('../src/services/importService');
const { createApp } = require('../src/app');

/**
 * Test helpers.
 *
 * Every test file gets its own SQLite file under `.tmp-tests/` and its own
 * Express instance, so a test never sees the data of another one and the
 * developer database is never touched. The directory is in `.gitignore`.
 */

const TEST_DIRECTORY = path.resolve(__dirname, '..', '..', '.tmp-tests');

/** A logger that writes nothing, so the test output stays readable. */
const silentLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

/**
 * Creates an isolated context: database, services, application.
 *
 * @returns {object}
 */
function createContext() {
  fs.mkdirSync(TEST_DIRECTORY, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const filePath = path.join(TEST_DIRECTORY, `test-${unique}.db`);

  const testConfig = {
    ...config,
    databasePath: filePath,
    serveStatic: false,
    logLevel: 'error',
    corsOrigins: ['*'],
  };

  const database = openDatabase({ filePath, logger: silentLogger });
  const contactService = new ContactService({ database, config: testConfig });
  const importService = new ImportService({ database, config: testConfig, contactService });
  const app = createApp({ database, config: testConfig, logger: silentLogger });

  return {
    database,
    config: testConfig,
    contactService,
    importService,
    app,
    filePath,
    /** Closes the database and removes the file of this context. */
    dispose() {
      database.close();
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${filePath}${suffix}`, { force: true });
      }
    },
  };
}

/**
 * Starts the application on an ephemeral port.
 *
 * @param {object} context
 * @returns {Promise<object>} `{ baseUrl, close }`
 */
async function startServer(context) {
  const server = await new Promise((resolve) => {
    const instance = context.app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * Sends one request and parses the JSON envelope.
 *
 * @param {string} baseUrl
 * @param {string} route
 * @param {object} [options]
 * @returns {Promise<{status: number, body: object, headers: Headers}>}
 */
async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

/**
 * Uploads a workbook to the import endpoint.
 *
 * @param {string} baseUrl
 * @param {Buffer} buffer
 * @param {string} [mode]
 * @returns {Promise<{status: number, body: object}>}
 */
async function importWorkbook(baseUrl, buffer, mode = 'skip') {
  const form = new FormData();
  form.append('mode', mode);
  form.append(
    'file',
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'import.xlsx',
  );
  return request(baseUrl, '/api/contacts/import', { method: 'POST', body: form });
}

/**
 * A valid contact payload with several contact methods.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function sampleContact(overrides = {}) {
  return {
    name: '测试联系人',
    groupName: '朋友',
    company: '示例公司',
    title: '工程师',
    note: '自动化测试创建的联系人',
    isBookmarked: false,
    methods: [
      { type: 'phone', value: '13800001111', label: '手机', isPrimary: true },
      { type: 'phone', value: '0591 8888 6666', label: '办公' },
      { type: 'email', value: 'sample@example.com', label: '工作' },
      { type: 'wechat', value: 'sample_wechat', label: '' },
    ],
    ...overrides,
  };
}

module.exports = {
  createContext,
  importWorkbook,
  request,
  sampleContact,
  silentLogger,
  startServer,
  TEST_DIRECTORY,
};
