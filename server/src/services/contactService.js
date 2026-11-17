'use strict';

const { AppError, ErrorCode } = require('../utils/errors');
const { METHOD_TYPES } = require('../utils/methodTypes');
const { nowText } = require('../utils/time');
const {
  countContacts,
  deleteContact,
  findContactById,
  findGroupById,
  findGroupByName,
  insertContact,
  insertGroup,
  insertMethods,
  listAllContacts,
  listContacts,
  listGroups,
  readStats,
  replaceMethods,
  setBookmark,
  updateContact,
} = require('../db/contactRepository');
const {
  normalizeContactInput,
  parseBoolean,
  parseContactId,
  parseListQuery,
} = require('./contactValidator');

/**
 * The business rules of the address book.
 *
 * The service owns validation, group resolution, the bookmark semantics and the
 * transaction boundaries; the repository owns SQL. Controllers only translate
 * HTTP to service calls, which is what keeps the rules testable without a socket.
 */
class ContactService {
  /**
   * @param {object} options
   * @param {import('../db/database').Database} options.database
   * @param {object} options.config
   */
  constructor({ database, config }) {
    this.database = database;
    this.config = config;
  }

  /**
   * Resolves a group from an id or creates it from a name.
   *
   * A request may name a group that does not exist yet; that is how the front end
   * offers custom groups and how the importer keeps an unknown group of a
   * workbook instead of silently moving the contact to "other".
   *
   * @param {object} input
   * @param {number|null} input.groupId
   * @param {string} input.groupName
   * @returns {object|null}
   */
  resolveGroup({ groupId, groupName }) {
    if (groupId !== null) {
      return findGroupById(this.database, groupId);
    }
    if (groupName === '') {
      return null;
    }
    const existing = findGroupByName(this.database, groupName);
    if (existing) {
      return existing;
    }
    return insertGroup(this.database, groupName);
  }

  /**
   * Validates one contact payload.
   * @param {object} payload
   * @returns {object}
   */
  normalize(payload) {
    return normalizeContactInput(payload, {
      limits: this.config.limits,
      resolveGroup: (input) => this.resolveGroup(input),
    });
  }

  /**
   * One page of contacts plus the numbers the dashboard shows.
   *
   * @param {object} rawQuery
   * @returns {object}
   */
  list(rawQuery = {}) {
    const query = parseListQuery(rawQuery, { limits: this.config.limits });
    const items = listContacts(this.database, query);
    const total = countContacts(this.database, query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      filters: {
        keyword: query.keyword,
        groupId: query.groupId,
        bookmarked: query.bookmarked,
        methodType: query.methodType,
        sort: query.sort,
      },
      stats: readStats(this.database),
    };
  }

  /**
   * @param {*} rawId
   * @returns {object}
   * @throws {AppError} CONTACT_NOT_FOUND
   */
  getById(rawId) {
    const id = parseContactId(rawId);
    const contact = findContactById(this.database, id);
    if (!contact) {
      throw new AppError(ErrorCode.CONTACT_NOT_FOUND, {
        detail: `No contact has the id ${id}`,
      });
    }
    return contact;
  }

  /**
   * Creates one contact and its methods in one transaction.
   *
   * @param {object} payload
   * @returns {object} the stored contact
   */
  create(payload) {
    const input = this.normalize(payload);
    return this.database.transaction(() => {
      const id = insertContact(this.database, input);
      insertMethods(this.database, id, input.methods);
      return findContactById(this.database, id);
    });
  }

  /**
   * Replaces the editable fields and the whole method list of one contact.
   *
   * The creation time and the original bookmark moment are preserved, so editing
   * a contact cannot reorder it in the "recently updated" listing or reset when
   * it was starred.
   *
   * @param {*} rawId
   * @param {object} payload
   * @returns {object}
   */
  update(rawId, payload) {
    const id = parseContactId(rawId);
    const existing = findContactById(this.database, id);
    if (!existing) {
      throw new AppError(ErrorCode.CONTACT_NOT_FOUND, {
        detail: `No contact has the id ${id}`,
      });
    }

    const input = this.normalize(payload);
    input.createdAt = existing.createdAt;
    input.updatedAt = nowText();
    input.bookmarkedAt = input.isBookmarked
      ? existing.bookmarkedAt || nowText()
      : null;

    this.database.transaction(() => {
      updateContact(this.database, id, input);
      replaceMethods(this.database, id, input.methods);
    });
    return findContactById(this.database, id);
  }

  /**
   * @param {*} rawId
   * @returns {{deletedId: number, remaining: number}}
   */
  remove(rawId) {
    const id = parseContactId(rawId);
    const changes = deleteContact(this.database, id);
    if (changes === 0) {
      throw new AppError(ErrorCode.CONTACT_NOT_FOUND, {
        detail: `No contact has the id ${id}`,
      });
    }
    const stats = readStats(this.database);
    return { deletedId: id, remaining: stats.total };
  }

  /**
   * Stars or un-stars one contact.
   *
   * @param {*} rawId
   * @param {*} rawBookmarked must be a boolean
   * @returns {object} the updated contact
   */
  setBookmark(rawId, rawBookmarked) {
    const id = parseContactId(rawId);
    const bookmarked = parseBoolean(rawBookmarked);
    if (bookmarked === null) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_BOOKMARK, {
        message: 'The bookmark flag must be a boolean',
        fields: [
          {
            field: 'bookmarked',
            code: ErrorCode.VALIDATION_INVALID_BOOKMARK,
            message: 'The bookmark flag must be a boolean',
          },
        ],
      });
    }
    const changes = setBookmark(this.database, id, bookmarked);
    if (changes === 0) {
      throw new AppError(ErrorCode.CONTACT_NOT_FOUND, {
        detail: `No contact has the id ${id}`,
      });
    }
    return findContactById(this.database, id);
  }

  /**
   * Every contact matching a filter, without pagination (export path).
   *
   * @param {object} rawQuery
   * @returns {object[]}
   */
  listForExport(rawQuery = {}) {
    const query = parseListQuery({ ...rawQuery, page: 1, pageSize: 1 }, {
      limits: this.config.limits,
    });
    return listAllContacts(this.database, query, this.config.limits.maxExportRows);
  }

  /**
   * The static description the front end loads once: method types, groups,
   * limits and the current statistics.
   *
   * @returns {object}
   */
  meta() {
    const stats = readStats(this.database);
    return {
      methodTypes: METHOD_TYPES,
      groups: listGroups(this.database),
      stats,
      limits: this.config.limits,
      pageSizes: this.config.pageSizes,
      sortOptions: [
        { value: 'updated', label: 'Last updated' },
        { value: 'created', label: 'Recently added' },
        { value: 'name', label: 'Name A–Z' },
        { value: 'bookmarked', label: 'Favorites first' },
      ],
    };
  }
}

module.exports = { ContactService };
