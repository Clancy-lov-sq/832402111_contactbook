'use strict';

const config = require('./config/config');
const { createLogger } = require('./utils/logger');
const { openDatabase } = require('./db/database');
const { createApp } = require('./app');

/**
 * Process entry point.
 *
 * The start-up order is fixed: configuration, database and schema, application,
 * and only then `listen`. A client therefore can never reach an API whose storage
 * is not ready, and a schema problem stops the process before it accepts a
 * connection instead of surfacing as a failed first request.
 */
function start() {
  const logger = createLogger({ level: config.logLevel });
  const database = openDatabase({ filePath: config.databasePath, logger });
  const app = createApp({ database, config, logger });

  const server = app.listen(config.port, config.host, () => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : config.port;
    logger.info(`${config.serviceName} is listening`, {
      url: `http://127.0.0.1:${port}`,
      host: config.host,
      port,
      version: config.version,
      database: config.databaseClient,
    });
    logger.info('API entry point', { url: `http://127.0.0.1:${port}/api` });
    logger.info('Health check', { url: `http://127.0.0.1:${port}/api/health` });
  });

  server.on('error', (error) => {
    logger.error('The HTTP server could not start', { reason: error.message, code: error.code });
    database.close();
    process.exitCode = 1;
  });

  let shuttingDown = false;
  /** Stops accepting connections, then closes the database. */
  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    server.close(() => {
      database.close();
      logger.info('Shutdown complete');
    });
    // A stuck keep-alive connection must not keep the process alive forever.
    setTimeout(() => {
      database.close();
      process.exit(0);
    }, 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server, database };
}

if (require.main === module) {
  start();
}

module.exports = { start };
