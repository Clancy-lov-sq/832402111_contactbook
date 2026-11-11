'use strict';

const { success } = require('../utils/response');

/**
 * HTTP layer of the metadata endpoints.
 *
 * `GET /api/health` is the single request that proves the process, the HTTP
 * layer and the database are all working: it runs a real query and reports the
 * stored number of contacts.
 */
class MetaController {
  /**
   * @param {object} options
   * @param {import('../db/database').Database} options.database
   * @param {object} options.config
   * @param {import('../services/contactService').ContactService} options.contactService
   * @param {object} options.logger
   */
  constructor({ database, config, contactService, logger }) {
    this.database = database;
    this.config = config;
    this.contactService = contactService;
    this.logger = logger;
    this.startedAt = Date.now();
  }

  /** GET /api/meta */
  meta(request, response) {
    response.json(success(this.contactService.meta()));
  }

  /** GET /api/health */
  health(request, response) {
    let databaseStatus = 'connected';
    let storedContacts = null;
    try {
      const row = this.database.get('SELECT COUNT(*) AS total FROM contact');
      storedContacts = Number(row.total);
    } catch (error) {
      databaseStatus = 'error';
      this.logger.error('Health check could not query the database', { reason: error.message });
    }

    response.json(
      success({
        service: this.config.serviceName,
        version: this.config.version,
        status: databaseStatus === 'connected' ? 'ok' : 'degraded',
        database: {
          client: this.config.databaseClient,
          status: databaseStatus,
          storedContacts,
          path: this.config.databasePath,
        },
        uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
        limits: this.config.limits,
        time: new Date().toISOString(),
      }),
    );
  }

  /** GET /api — a human readable landing document. */
  index(request, response) {
    response.type('text/plain; charset=utf-8').send(
      [
        'ContactBook API',
        '',
        'GET    /api/health',
        'GET    /api/meta',
        'GET    /api/contacts?keyword=&groupId=&bookmarked=&sort=&page=&pageSize=',
        'POST   /api/contacts',
        'GET    /api/contacts/:id',
        'PUT    /api/contacts/:id',
        'DELETE /api/contacts/:id',
        'PATCH  /api/contacts/:id/bookmark',
        'GET    /api/contacts/export?keyword=&groupId=&bookmarked=',
        'GET    /api/contacts/template',
        'POST   /api/contacts/import   (multipart/form-data: file, mode=skip|update)',
        '',
        'Every response uses the envelope { success: true, ... } or',
        '{ success: false, error, message, detail? }.',
      ].join('\n'),
    );
  }
}

module.exports = { MetaController };
