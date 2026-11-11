'use strict';

const express = require('express');

/**
 * Wraps an async handler so a rejected promise reaches the error middleware
 * instead of becoming an unhandled rejection.
 *
 * @param {Function} handler
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * The route table under `/api`.
 *
 * The static file paths of the export and the template are declared before
 * `/contacts/:id`, so `export` is never read as a contact id.
 *
 * @param {object} options
 * @param {import('../controllers/contactController').ContactController} options.contactController
 * @param {import('../controllers/metaController').MetaController} options.metaController
 * @param {import('express').RequestHandler} options.upload
 * @returns {import('express').Router}
 */
function createApiRouter({ contactController, metaController, upload }) {
  const router = express.Router();

  router.get('/', metaController.index.bind(metaController));
  router.get('/health', metaController.health.bind(metaController));
  router.get('/meta', metaController.meta.bind(metaController));

  router.get('/contacts/export', asyncHandler(contactController.exportContacts.bind(contactController)));
  router.get('/contacts/template', asyncHandler(contactController.downloadTemplate.bind(contactController)));
  router.post(
    '/contacts/import',
    upload,
    asyncHandler(contactController.importContacts.bind(contactController)),
  );

  router.get('/contacts', contactController.list.bind(contactController));
  router.post('/contacts', contactController.create.bind(contactController));
  router.get('/contacts/:id', contactController.get.bind(contactController));
  router.put('/contacts/:id', contactController.update.bind(contactController));
  router.delete('/contacts/:id', contactController.remove.bind(contactController));
  router.patch('/contacts/:id/bookmark', contactController.bookmark.bind(contactController));

  return router;
}

module.exports = { createApiRouter };
