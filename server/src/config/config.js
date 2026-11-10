'use strict';

const path = require('node:path');

/**
 * The only module that reads `process.env`.
 *
 * Every setting has a default that works on a fresh clone, so `npm start` needs
 * no configuration. The effective configuration is reported by `GET /api/health`,
 * which is what makes a running instance traceable to this file alone.
 */

/** Repository root: `<root>/server/src/config/config.js` -> `<root>`. */
const ROOT_DIRECTORY = path.resolve(__dirname, '..', '..', '..');

/** Reads an integer environment variable, falling back to `fallback`. */
function readInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be an integer, received "${raw}"`);
  }
  return value;
}

/** Reads a boolean environment variable given as `true`/`false`/`1`/`0`. */
function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

const config = Object.freeze({
  /** Name reported by the health check and the API landing document. */
  serviceName: 'contactbook',
  version: require('../../../package.json').version,

  /** HTTP server. */
  host: process.env.HOST || '0.0.0.0',
  port: readInteger('PORT', 8080),

  /** Comma separated list of allowed origins, or `*` during development. */
  corsOrigins: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Storage: a single SQLite file created on first start-up. */
  databaseClient: 'sqlite',
  databasePath: path.resolve(ROOT_DIRECTORY, process.env.SQLITE_PATH || 'data/contactbook.db'),

  /** Static front end built by Vite into `server/public`. */
  staticDirectory: path.resolve(ROOT_DIRECTORY, process.env.STATIC_DIR || 'server/public'),
  serveStatic: readBoolean('SERVE_STATIC', true),

  /** Logging. */
  logLevel: process.env.LOG_LEVEL || 'info',

  /** Domain limits, validated by the service layer and the import module. */
  limits: Object.freeze({
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
    maxImportRows: 2000,
    maxImportBytes: 5 * 1024 * 1024,
    maxExportRows: 5000,
    maxMethodColumnsPerType: 5,
  }),

  /** Fixed page size list offered by the front end. */
  pageSizes: Object.freeze([12, 24, 48, 96]),
});

module.exports = config;
