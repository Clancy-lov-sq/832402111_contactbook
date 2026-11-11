'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');

const { ContactService } = require('./services/contactService');
const { ImportService } = require('./services/importService');
const { ContactController } = require('./controllers/contactController');
const { MetaController } = require('./controllers/metaController');
const { createApiRouter } = require('./routes');
const { createUploadMiddleware } = require('./middleware/upload');
const { requestLogger } = require('./middleware/requestLogger');
const { createErrorHandler, notFoundHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express application.
 *
 * The order of the middleware chain is part of the behaviour and is therefore
 * fixed here, in one place:
 *
 * 1. request logging;
 * 2. CORS (the development page lives on another origin);
 * 3. JSON body parsing with a size limit;
 * 4. the `/api` router;
 * 5. the static front end, with `index.html` as the single-page fallback;
 * 6. the JSON 404 and the shared error handler.
 *
 * @param {object} options
 * @param {import('./db/database').Database} options.database
 * @param {object} options.config
 * @param {object} options.logger
 * @returns {import('express').Express}
 */
function createApp({ database, config, logger }) {
  const app = express();
  app.disable('x-powered-by');

  const contactService = new ContactService({ database, config });
  const importService = new ImportService({ database, config, contactService });
  const contactController = new ContactController({ contactService, importService });
  const metaController = new MetaController({ database, config, contactService, logger });
  const upload = createUploadMiddleware(config);

  app.locals.services = { contactService, importService };
  app.locals.database = database;
  app.locals.config = config;

  app.use(requestLogger(logger));

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) {
        // curl, a server side fetch and same-origin requests have no Origin.
        callback(null, true);
        return;
      }
      const allowed = config.corsOrigins.includes('*')
        || config.corsOrigins.includes(origin);
      callback(null, allowed);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'],
    maxAge: 86400,
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter({ contactController, metaController, upload }));

  const staticIndex = path.join(config.staticDirectory, 'index.html');
  const staticDirectoryExists = fs.existsSync(config.staticDirectory);
  if (config.serveStatic && staticDirectoryExists) {
    app.use(
      express.static(config.staticDirectory, {
        extensions: ['html'],
        setHeaders(response, filePath) {
          const isHtml = filePath.endsWith('.html');
          response.setHeader(
            'Cache-Control',
            isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
          );
        },
      }),
    );

    // A single page application: every non-API GET renders the shell.
    app.get('*', (request, response, next) => {
      if (request.path.startsWith('/api')) {
        next();
        return;
      }
      if (!fs.existsSync(staticIndex)) {
        next();
        return;
      }
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(staticIndex);
    });
  }

  app.use(notFoundHandler());
  app.use(createErrorHandler(logger));

  logger.info('Express application is ready', {
    serveStatic: Boolean(config.serveStatic && staticDirectoryExists),
    staticDirectory: config.staticDirectory,
    cors: config.corsOrigins.join(','),
  });

  return app;
}

module.exports = { createApp };
