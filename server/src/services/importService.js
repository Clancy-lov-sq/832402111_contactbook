'use strict';

const { AppError, ErrorCode } = require('../utils/errors');
const {
  findContactById,
  findDuplicateContact,
  listGroups,
} = require('../db/contactRepository');
const { parseImportWorkbook } = require('./excelService');

/**
 * Applies an import plan to the database.
 *
 * The two modes answer two honest questions:
 * - `skip` (default) imports only contacts that are not there yet. A duplicate is
 *   one with the same name and the same first contact method.
 * - `update` merges the workbook into the existing contact: non-empty cells win,
 *   empty cells keep the stored value, and new methods are appended to the ones
 *   the contact already has.
 *
 * Every row is reported with its Excel row number, so a rejected row can be
 * found and fixed in the workbook instead of being guessed at. Rows are applied
 * inside one transaction; a row that fails validation is rolled back on its own
 * savepoint and the remaining rows still commit.
 */
class ImportService {
  /**
   * @param {object} options
   * @param {import('../db/database').Database} options.database
   * @param {object} options.config
   * @param {import('./contactService').ContactService} options.contactService
   */
  constructor({ database, config, contactService }) {
    this.database = database;
    this.config = config;
    this.contactService = contactService;
  }

  /**
   * Imports one workbook buffer.
   *
   * @param {Buffer} buffer
   * @param {object} options
   * @param {'skip'|'update'} [options.mode]
   * @returns {Promise<object>} the import report
   * @throws {AppError} IMPORT_* and VALIDATION_* codes for structural problems
   */
  async importBuffer(buffer, options = {}) {
    const mode = options.mode === undefined ? 'skip' : String(options.mode);
    if (!['skip', 'update'].includes(mode)) {
      throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
        message: 'mode must be "skip" or "update"',
      });
    }

    const plan = await parseImportWorkbook(buffer, {
      maxRows: this.config.limits.maxImportRows,
    });

    const reportRows = plan.failed.map((row) => ({
      row: row.row,
      name: row.name,
      status: 'failed',
      message: row.message,
    }));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const groupsBefore = listGroups(this.database).length;

    if (plan.rows.length > 0) {
      this.database.transaction(() => {
        for (const row of plan.rows) {
          try {
            const firstMethod = row.methods.length > 0 ? row.methods[0].value : null;
            const duplicate = findDuplicateContact(this.database, row.name, firstMethod);

            if (duplicate && mode === 'skip') {
              skipped += 1;
              reportRows.push({
                row: row.row,
                name: row.name,
                status: 'skipped',
                message: `A contact with the same name and method already exists (#${duplicate.id}); skipped`,
              });
              continue;
            }

            if (duplicate) {
              const existing = findContactById(this.database, duplicate.id);
              const mergedMethods = [...existing.methods];
              const known = new Set(
                mergedMethods.map((method) => `${method.type}:${method.value.toLowerCase()}`),
              );
              for (const method of row.methods) {
                const key = `${method.type}:${method.value.toLowerCase()}`;
                if (!known.has(key) && mergedMethods.length < this.config.limits.maxMethodsPerContact) {
                  mergedMethods.push({ ...method, isPrimary: false });
                  known.add(key);
                }
              }

              this.contactService.update(existing.id, {
                name: row.name,
                groupId: row.group === '' ? existing.groupId : null,
                groupName: row.group,
                company: row.company === '' ? existing.company : row.company,
                title: row.title === '' ? existing.title : row.title,
                note: row.note === '' ? existing.note : row.note,
                isBookmarked: row.bookmarkedProvided ? row.bookmarked : existing.isBookmarked,
                methods: mergedMethods,
              });
              updated += 1;
              reportRows.push({
                row: row.row,
                name: row.name,
                status: 'updated',
                message: `Updated contact #${duplicate.id}; merged ${mergedMethods.length - existing.methods.length} new contact method(s)`,
              });
              continue;
            }

            const contact = this.contactService.create({
              name: row.name,
              groupName: row.group,
              company: row.company,
              title: row.title,
              note: row.note,
              isBookmarked: row.bookmarked,
              methods: row.methods,
            });
            created += 1;
            reportRows.push({
              row: row.row,
              name: row.name,
              status: 'created',
              message: `Created contact #${contact.id} with ${contact.methods.length} contact method(s)`,
            });
          } catch (error) {
            const message = error instanceof AppError
              ? describeValidationFailure(error)
              : String(error.message || error);
            reportRows.push({
              row: row.row,
              name: row.name,
              status: 'failed',
              message,
            });
          }
        }
      });
    }

    reportRows.sort((left, right) => left.row - right.row);
    const failed = reportRows.filter((row) => row.status === 'failed').length;

    return {
      mode,
      sheetName: plan.sheetName,
      headerRow: plan.headerRow,
      totalRows: plan.totalRows,
      created,
      updated,
      skipped,
      failed,
      imported: created + updated,
      groupsCreated: Math.max(0, listGroups(this.database).length - groupsBefore),
      columns: plan.columns,
      ignoredColumns: plan.ignored,
      rows: reportRows,
    };
  }
}

/**
 * @param {AppError} error
 * @returns {string} one line describing every rejected field
 */
function describeValidationFailure(error) {
  if (Array.isArray(error.fields) && error.fields.length > 0) {
    return error.fields.map((field) => `${field.field}: ${field.message}`).join('; ');
  }
  return error.message;
}

module.exports = { ImportService };
