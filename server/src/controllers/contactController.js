'use strict';

const { success } = require('../utils/response');
const { AppError, ErrorCode } = require('../utils/errors');
const { createExportBuffer, createTemplateBuffer } = require('../services/excelService');

/**
 * HTTP layer of the contact endpoints.
 *
 * A controller does three things only: read the request, call one service method,
 * answer with the shared envelope. Anything that decides something lives in the
 * service layer.
 */
class ContactController {
  /**
   * @param {object} options
   * @param {import('../services/contactService').ContactService} options.contactService
   * @param {import('../services/importService').ImportService} options.importService
   */
  constructor({ contactService, importService }) {
    this.contactService = contactService;
    this.importService = importService;
  }

  /** GET /api/contacts */
  list(request, response) {
    response.json(success(this.contactService.list(request.query)));
  }

  /** GET /api/contacts/:id */
  get(request, response) {
    response.json(success({ contact: this.contactService.getById(request.params.id) }));
  }

  /** POST /api/contacts */
  create(request, response) {
    const contact = this.contactService.create(request.body);
    response.status(201).json(success({ contact }));
  }

  /** PUT /api/contacts/:id */
  update(request, response) {
    const contact = this.contactService.update(request.params.id, request.body);
    response.json(success({ contact }));
  }

  /** DELETE /api/contacts/:id */
  remove(request, response) {
    response.json(success(this.contactService.remove(request.params.id)));
  }

  /** PATCH /api/contacts/:id/bookmark */
  bookmark(request, response) {
    const body = request.body || {};
    const flag = body.bookmarked === undefined ? body.isBookmarked : body.bookmarked;
    const contact = this.contactService.setBookmark(request.params.id, flag);
    response.json(
      success({
        contact,
        stats: this.contactService.meta().stats,
      }),
    );
  }

  /**
   * GET /api/contacts/export
   * Streams an `.xlsx` file. The filters of the listing apply, so "export what I
   * am looking at" and "export everything" are the same endpoint.
   */
  async exportContacts(request, response) {
    const contacts = this.contactService.listForExport(request.query);
    const { buffer, fileName, rowCount } = await createExportBuffer(contacts);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('X-Export-Row-Count', String(rowCount));
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }

  /** GET /api/contacts/template */
  async downloadTemplate(request, response) {
    const { buffer, fileName } = await createTemplateBuffer();
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }

  /**
   * POST /api/contacts/import
   * Multipart: `file` (the workbook) and `mode` (`skip` or `update`).
   */
  async importContacts(request, response) {
    if (!request.file) {
      throw new AppError(ErrorCode.IMPORT_FILE_REQUIRED, {
        message: 'No file was uploaded under the field name "file"',
      });
    }
    const mode = request.body && request.body.mode ? request.body.mode : 'skip';
    const report = await this.importService.importBuffer(request.file.buffer, { mode });
    response.json(
      success({
        report,
        stats: this.contactService.meta().stats,
      }),
    );
  }
}

module.exports = { ContactController };
