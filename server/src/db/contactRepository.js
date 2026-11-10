'use strict';

const { nowText } = require('../utils/time');

/**
 * Every SQL statement of the address book lives here.
 *
 * Rules applied throughout this module:
 * - all values are bound as positional `?` parameters, never interpolated;
 * - a keyword is escaped before it reaches a `LIKE` pattern;
 * - SQL columns are `snake_case`, JSON fields are `camelCase`, and the single
 *   conversion point is `mapContactRow` / `mapMethodRow`;
 * - sorting is chosen from a frozen map, never from the request string.
 */

/** SQL expression of the valid sort orders. */
const SORT_SQL = Object.freeze({
  name: 'c.name COLLATE NOCASE ASC, c.id ASC',
  updated: 'c.updated_at DESC, c.id DESC',
  created: 'c.created_at DESC, c.id DESC',
  bookmarked: 'c.is_bookmarked DESC, c.bookmarked_at DESC, c.name COLLATE NOCASE ASC',
});

/** Columns selected for one contact, with its group joined in. */
const CONTACT_COLUMNS = `
  c.id, c.name, c.group_id, c.company, c.title, c.note, c.avatar_color,
  c.is_bookmarked, c.bookmarked_at, c.created_at, c.updated_at,
  g.name AS group_name, g.color AS group_color,
  (SELECT COUNT(*) FROM contact_method m WHERE m.contact_id = c.id) AS method_count
`;

/**
 * Escapes the wildcards of a `LIKE` pattern.
 * @param {string} text
 * @returns {string}
 */
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Builds the WHERE clause shared by the listing, the count and the export.
 *
 * @param {object} query normalised query
 * @returns {{sql: string, params: Array<*>}}
 */
function buildFilter(query) {
  const clauses = [];
  const params = [];

  if (query.keyword) {
    const pattern = `%${escapeLike(query.keyword)}%`;
    clauses.push(`(
      c.name LIKE ? ESCAPE '\\'
      OR c.company LIKE ? ESCAPE '\\'
      OR c.title LIKE ? ESCAPE '\\'
      OR c.note LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM contact_method m
        WHERE m.contact_id = c.id AND m.value LIKE ? ESCAPE '\\'
      )
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (query.groupId === 0) {
    // Group `0` is the front-end filter "no group yet".
    clauses.push('c.group_id IS NULL');
  } else if (query.groupId !== null && query.groupId !== undefined) {
    clauses.push('c.group_id = ?');
    params.push(query.groupId);
  }

  if (query.bookmarked) {
    clauses.push('c.is_bookmarked = 1');
  }

  if (query.methodType) {
    clauses.push(
      'EXISTS (SELECT 1 FROM contact_method m WHERE m.contact_id = c.id AND m.type = ?)',
    );
    params.push(query.methodType);
  }

  if (query.updatedSince) {
    clauses.push('c.updated_at >= ?');
    params.push(query.updatedSince);
  }

  const sql = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
  return { sql, params };
}

/**
 * @param {object} row
 * @returns {object} the camelCase contact
 */
function mapContactRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    groupId: row.group_id === null ? null : Number(row.group_id),
    groupName: row.group_name || null,
    groupColor: row.group_color || null,
    company: row.company || '',
    title: row.title || '',
    note: row.note || '',
    avatarColor: row.avatar_color || '',
    isBookmarked: Number(row.is_bookmarked) === 1,
    bookmarkedAt: row.bookmarked_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    methodCount: row.method_count === undefined ? undefined : Number(row.method_count),
    methods: [],
  };
}

/**
 * @param {object} row
 * @returns {object} the camelCase contact method
 */
function mapMethodRow(row) {
  return {
    id: Number(row.id),
    type: row.type,
    label: row.label || '',
    value: row.value,
    isPrimary: Number(row.is_primary) === 1,
    sortOrder: Number(row.sort_order),
  };
}

/**
 * Reads one page of contacts and attaches their methods.
 *
 * @param {import('./database').Database} db
 * @param {object} query normalised listing query
 * @returns {object[]}
 */
function listContacts(db, query) {
  const filter = buildFilter(query);
  const order = SORT_SQL[query.sort] || SORT_SQL.updated;
  const rows = db.all(
    `SELECT ${CONTACT_COLUMNS}
     FROM contact c LEFT JOIN contact_group g ON g.id = c.group_id
     ${filter.sql}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    [...filter.params, query.pageSize, query.offset],
  );
  return attachMethods(db, rows.map(mapContactRow));
}

/**
 * Reads every contact matching a query, without pagination (export path).
 *
 * @param {import('./database').Database} db
 * @param {object} query
 * @param {number} limit hard row cap
 * @returns {object[]}
 */
function listAllContacts(db, query, limit) {
  const filter = buildFilter(query);
  const order = SORT_SQL[query.sort] || SORT_SQL.name;
  const rows = db.all(
    `SELECT ${CONTACT_COLUMNS}
     FROM contact c LEFT JOIN contact_group g ON g.id = c.group_id
     ${filter.sql}
     ORDER BY ${order}
     LIMIT ?`,
    [...filter.params, limit],
  );
  return attachMethods(db, rows.map(mapContactRow));
}

/**
 * @param {import('./database').Database} db
 * @param {object} query
 * @returns {number}
 */
function countContacts(db, query) {
  const filter = buildFilter(query);
  const row = db.get(
    `SELECT COUNT(*) AS total FROM contact c ${filter.sql}`,
    filter.params,
  );
  return Number(row.total);
}

/**
 * Loads the methods of a batch of contacts with one query.
 *
 * @param {import('./database').Database} db
 * @param {object[]} contacts
 * @returns {object[]} the same contacts with `methods` filled in
 */
function attachMethods(db, contacts) {
  if (contacts.length === 0) {
    return contacts;
  }
  const placeholders = contacts.map(() => '?').join(', ');
  const rows = db.all(
    `SELECT id, contact_id, type, label, value, is_primary, sort_order
     FROM contact_method
     WHERE contact_id IN (${placeholders})
     ORDER BY contact_id, sort_order, id`,
    contacts.map((contact) => contact.id),
  );
  const byContact = new Map(contacts.map((contact) => [contact.id, contact]));
  for (const row of rows) {
    const contact = byContact.get(Number(row.contact_id));
    if (contact) {
      contact.methods.push(mapMethodRow(row));
    }
  }
  return contacts;
}

/**
 * @param {import('./database').Database} db
 * @param {number} id
 * @returns {object|null}
 */
function findContactById(db, id) {
  const row = db.get(
    `SELECT ${CONTACT_COLUMNS}
     FROM contact c LEFT JOIN contact_group g ON g.id = c.group_id
     WHERE c.id = ?`,
    [id],
  );
  if (!row) {
    return null;
  }
  return attachMethods(db, [mapContactRow(row)])[0];
}

/**
 * @param {import('./database').Database} db
 * @param {string} name
 * @param {string|null} methodValue
 * @returns {object|null} the first contact with this name and (optionally) method value
 */
function findDuplicateContact(db, name, methodValue) {
  const row = db.get(
    `SELECT c.id, c.name
     FROM contact c
     WHERE c.name = ? COLLATE NOCASE
       AND (
         ? IS NULL
         OR EXISTS (
           SELECT 1 FROM contact_method m
           WHERE m.contact_id = c.id AND m.value = ? COLLATE NOCASE
         )
       )
     ORDER BY c.id
     LIMIT 1`,
    [name, methodValue, methodValue],
  );
  return row ? { id: Number(row.id), name: row.name } : null;
}

/**
 * Inserts one contact row.
 *
 * @param {import('./database').Database} db
 * @param {object} contact normalised contact
 * @returns {number} the new id
 */
function insertContact(db, contact) {
  const timestamp = nowText();
  const result = db.run(
    `INSERT INTO contact
       (name, group_id, company, title, note, avatar_color,
        is_bookmarked, bookmarked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contact.name,
      contact.groupId,
      contact.company,
      contact.title,
      contact.note,
      contact.avatarColor,
      contact.isBookmarked ? 1 : 0,
      contact.isBookmarked ? (contact.bookmarkedAt || timestamp) : null,
      contact.createdAt || timestamp,
      contact.updatedAt || timestamp,
    ],
  );
  return result.lastInsertRowid;
}

/**
 * Updates the scalar columns of one contact (methods are replaced separately).
 *
 * @param {import('./database').Database} db
 * @param {number} id
 * @param {object} contact
 * @returns {number} affected rows
 */
function updateContact(db, id, contact) {
  const result = db.run(
    `UPDATE contact
     SET name = ?, group_id = ?, company = ?, title = ?, note = ?, avatar_color = ?,
         is_bookmarked = ?, bookmarked_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      contact.name,
      contact.groupId,
      contact.company,
      contact.title,
      contact.note,
      contact.avatarColor,
      contact.isBookmarked ? 1 : 0,
      contact.isBookmarked ? (contact.bookmarkedAt || nowText()) : null,
      contact.updatedAt || nowText(),
      id,
    ],
  );
  return result.changes;
}

/**
 * Deletes one contact; its methods are removed by the foreign key cascade.
 *
 * @param {import('./database').Database} db
 * @param {number} id
 * @returns {number} affected rows
 */
function deleteContact(db, id) {
  return db.run('DELETE FROM contact WHERE id = ?', [id]).changes;
}

/**
 * Flips the bookmark flag and stamps the moment it was bookmarked.
 *
 * @param {import('./database').Database} db
 * @param {number} id
 * @param {boolean} bookmarked
 * @returns {number} affected rows
 */
function setBookmark(db, id, bookmarked) {
  const result = db.run(
    `UPDATE contact
     SET is_bookmarked = ?, bookmarked_at = ?, updated_at = ?
     WHERE id = ?`,
    [bookmarked ? 1 : 0, bookmarked ? nowText() : null, nowText(), id],
  );
  return result.changes;
}

/**
 * Replaces every method of one contact.
 *
 * @param {import('./database').Database} db
 * @param {number} contactId
 * @param {object[]} methods normalised methods in display order
 */
function replaceMethods(db, contactId, methods) {
  db.run('DELETE FROM contact_method WHERE contact_id = ?', [contactId]);
  insertMethods(db, contactId, methods);
}

/**
 * Appends methods to a contact, keeping the existing ones.
 *
 * @param {import('./database').Database} db
 * @param {number} contactId
 * @param {object[]} methods
 * @param {number} [startIndex] sort order of the first appended method
 */
function insertMethods(db, contactId, methods, startIndex = 0) {
  const insert = db.statement(
    `INSERT INTO contact_method (contact_id, type, label, value, is_primary, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  methods.forEach((method, index) => {
    insert.run(
      contactId,
      method.type,
      method.label || '',
      method.value,
      method.isPrimary ? 1 : 0,
      startIndex + index,
    );
  });
}

/**
 * @param {import('./database').Database} db
 * @param {number} contactId
 * @returns {object[]}
 */
function listMethods(db, contactId) {
  return db
    .all(
      `SELECT id, contact_id, type, label, value, is_primary, sort_order
       FROM contact_method WHERE contact_id = ? ORDER BY sort_order, id`,
      [contactId],
    )
    .map(mapMethodRow);
}

/**
 * Groups with their contact counts, including empty groups.
 *
 * @param {import('./database').Database} db
 * @returns {object[]}
 */
function listGroups(db) {
  return db
    .all(
      `SELECT g.id, g.name, g.color, g.sort_order, COUNT(c.id) AS contact_count
       FROM contact_group g
       LEFT JOIN contact c ON c.group_id = g.id
       GROUP BY g.id
       ORDER BY g.sort_order, g.name COLLATE NOCASE`,
    )
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      color: row.color,
      sortOrder: Number(row.sort_order),
      contactCount: Number(row.contact_count),
    }));
}

/**
 * @param {import('./database').Database} db
 * @param {number} id
 * @returns {object|null}
 */
function findGroupById(db, id) {
  const row = db.get('SELECT id, name, color FROM contact_group WHERE id = ?', [id]);
  return row ? { id: Number(row.id), name: row.name, color: row.color } : null;
}

/**
 * @param {import('./database').Database} db
 * @param {string} name
 * @returns {object|null}
 */
function findGroupByName(db, name) {
  const row = db.get(
    'SELECT id, name, color FROM contact_group WHERE name = ? COLLATE NOCASE',
    [name],
  );
  return row ? { id: Number(row.id), name: row.name, color: row.color } : null;
}

/**
 * Creates a group; the caller resolves the name first, so a duplicate name is a
 * programming error rather than a user error.
 *
 * @param {import('./database').Database} db
 * @param {string} name
 * @param {string} [color]
 * @returns {object} the new group
 */
function insertGroup(db, name, color = '#64748b') {
  const result = db.run(
    'INSERT INTO contact_group (name, color, sort_order) VALUES (?, ?, 100)',
    [name, color],
  );
  return { id: result.lastInsertRowid, name, color };
}

/**
 * Aggregate numbers for the dashboard.
 *
 * @param {import('./database').Database} db
 * @returns {object}
 */
function readStats(db) {
  const totals = db.get(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(is_bookmarked), 0) AS bookmarked,
       COALESCE(SUM(CASE WHEN updated_at >= datetime('now', 'localtime', '-7 days')
                         THEN 1 ELSE 0 END), 0) AS updated_last_week
     FROM contact`,
  );
  const methodRow = db.get('SELECT COUNT(*) AS total FROM contact_method');
  const byType = db.all(
    `SELECT type, COUNT(*) AS total FROM contact_method GROUP BY type ORDER BY total DESC`,
  );
  return {
    total: Number(totals.total),
    bookmarked: Number(totals.bookmarked),
    methodCount: Number(methodRow.total),
    updatedLastWeek: Number(totals.updated_last_week),
    groups: listGroups(db),
    methodsByType: byType.map((row) => ({ type: row.type, count: Number(row.total) })),
  };
}

module.exports = {
  SORT_SQL,
  attachMethods,
  countContacts,
  deleteContact,
  findContactById,
  findDuplicateContact,
  findGroupById,
  findGroupByName,
  insertContact,
  insertGroup,
  insertMethods,
  listAllContacts,
  listContacts,
  listGroups,
  listMethods,
  mapContactRow,
  mapMethodRow,
  readStats,
  replaceMethods,
  setBookmark,
  updateContact,
};
