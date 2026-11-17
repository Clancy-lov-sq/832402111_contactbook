'use strict';

const { methodTypeSqlList } = require('../utils/methodTypes');

/**
 * The database schema.
 *
 * The schema is created on every start-up with `IF NOT EXISTS`, so a fresh clone
 * and an existing installation share exactly one code path. Nothing is ever
 * dropped or altered implicitly, which is why an older database keeps its data.
 */

/** Groups every new installation starts with; they may be renamed or extended. */
const DEFAULT_GROUPS = Object.freeze([
  Object.freeze({ name: 'Family', color: '#ef4444', sortOrder: 10 }),
  Object.freeze({ name: 'Friends', color: '#f59e0b', sortOrder: 20 }),
  Object.freeze({ name: 'Colleagues', color: '#3b82f6', sortOrder: 30 }),
  Object.freeze({ name: 'Clients', color: '#10b981', sortOrder: 40 }),
  Object.freeze({ name: 'Others', color: '#64748b', sortOrder: 90 }),
]);

/**
 * Applies the DDL and inserts the default groups when they are missing.
 *
 * @param {import('node:sqlite').DatabaseSync} database
 */
function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS contact_group (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#64748b',
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS contact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      group_id INTEGER REFERENCES contact_group (id) ON DELETE SET NULL,
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '',
      is_bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (is_bookmarked IN (0, 1)),
      bookmarked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS contact_method (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN (${methodTypeSqlList()})),
      label TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_contact_name ON contact (name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_contact_group ON contact (group_id);
    CREATE INDEX IF NOT EXISTS idx_contact_bookmarked ON contact (is_bookmarked DESC, bookmarked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contact_updated ON contact (updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_contact_method_contact ON contact_method (contact_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_contact_method_value ON contact_method (value COLLATE NOCASE);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_method_unique
      ON contact_method (contact_id, type, value COLLATE NOCASE);
  `);

  const existing = database.prepare('SELECT COUNT(*) AS total FROM contact_group').get();
  if (Number(existing.total) === 0) {
    const insert = database.prepare(
      'INSERT INTO contact_group (name, color, sort_order) VALUES (?, ?, ?)',
    );
    for (const group of DEFAULT_GROUPS) {
      insert.run(group.name, group.color, group.sortOrder);
    }
  }
}

module.exports = { createSchema, DEFAULT_GROUPS };
