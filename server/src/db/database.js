'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createSchema } = require('./schema');
const { AppError, ErrorCode } = require('../utils/errors');

/**
 * The SQLite connection.
 *
 * The storage layer is the only module that knows about SQL and about the
 * driver. Callers get a small, synchronous facade: `get`, `all`, `run`, `exec`
 * and `transaction`. Every value is bound as a `?` parameter, so no user input is
 * ever concatenated into a statement.
 */
class Database {
  /**
   * @param {import('node:sqlite').DatabaseSync} connection
   * @param {string} filePath
   */
  constructor(connection, filePath) {
    this.connection = connection;
    this.filePath = filePath;
    this.transactionDepth = 0;
    /** @type {Map<string, import('node:sqlite').StatementSync>} */
    this.statementCache = new Map();
  }

  /**
   * Reads one row.
   * @param {string} sql
   * @param {Array<*>} [params] positional `?` bindings
   * @returns {object|undefined}
   */
  get(sql, params = []) {
    return this.statement(sql).get(...params);
  }

  /**
   * Reads every matching row.
   * @param {string} sql
   * @param {Array<*>} [params]
   * @returns {object[]}
   */
  all(sql, params = []) {
    return this.statement(sql).all(...params);
  }

  /**
   * Executes a writing statement.
   * @param {string} sql
   * @param {Array<*>} [params]
   * @returns {{changes: number, lastInsertRowid: number}}
   */
  run(sql, params = []) {
    const result = this.statement(sql).run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  /**
   * Executes one or more statements without bindings (DDL, pragmas).
   * @param {string} sql
   */
  exec(sql) {
    this.connection.exec(sql);
  }

  /**
   * Runs `work` inside one transaction; a throw rolls everything back.
   *
   * Nested calls use savepoints, so a service method can compose helpers that
   * also ask for a transaction without breaking atomicity.
   *
   * @template T
   * @param {() => T} work
   * @returns {T}
   */
  transaction(work) {
    const isOuter = this.transactionDepth === 0;
    const savepoint = `sp_${this.transactionDepth}`;
    if (isOuter) {
      this.connection.exec('BEGIN IMMEDIATE');
    } else {
      this.connection.exec(`SAVEPOINT ${savepoint}`);
    }
    this.transactionDepth += 1;
    try {
      const result = work();
      if (isOuter) {
        this.connection.exec('COMMIT');
      } else {
        this.connection.exec(`RELEASE ${savepoint}`);
      }
      return result;
    } catch (error) {
      if (isOuter) {
        this.connection.exec('ROLLBACK');
      } else {
        this.connection.exec(`ROLLBACK TO ${savepoint}`);
        this.connection.exec(`RELEASE ${savepoint}`);
      }
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  /** Closes the connection, ignoring a second call. */
  close() {
    if (!this.connection) {
      return;
    }
    try {
      this.connection.close();
    } catch (error) {
      // Closing an already closed connection is not an error worth reporting.
    }
    this.connection = null;
  }

  /**
   * Prepares one statement and caches it under its SQL text.
   * @param {string} sql
   * @returns {import('node:sqlite').StatementSync}
   */
  statement(sql) {
    if (!this.statementCache.has(sql)) {
      this.statementCache.set(sql, this.connection.prepare(sql));
    }
    return this.statementCache.get(sql);
  }
}

/**
 * Opens (and creates when missing) the database file and applies the schema.
 *
 * @param {object} options
 * @param {string} options.filePath absolute path of the SQLite file
 * @param {object} [options.logger] optional logger
 * @returns {Database}
 */
function openDatabase(options) {
  const { filePath, logger } = options;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let connection;
  try {
    connection = new DatabaseSync(filePath);
  } catch (error) {
    throw new AppError(ErrorCode.STORAGE_FAILURE, {
      message: `The SQLite database could not be opened: ${error.message}`,
      detail: { filePath },
    });
  }

  try {
    connection.exec('PRAGMA journal_mode = WAL');
    connection.exec('PRAGMA foreign_keys = ON');
    connection.exec('PRAGMA busy_timeout = 5000');
    createSchema(connection);
  } catch (error) {
    connection.close();
    throw new AppError(ErrorCode.STORAGE_FAILURE, {
      message: `The SQLite schema could not be created: ${error.message}`,
      detail: { filePath },
    });
  }

  if (logger) {
    logger.info('Opening SQLite database', { path: filePath });
  }

  return new Database(connection, filePath);
}

module.exports = { Database, openDatabase };
