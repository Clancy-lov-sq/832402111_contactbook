'use strict';

/** Minimal structured logger: one line per event, JSON detail on the same line. */

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/**
 * Creates a logger that drops events below `level`.
 *
 * @param {object} [options]
 * @param {string} [options.level] `debug`, `info`, `warn` or `error`
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
function createLogger(options = {}) {
  const threshold = LEVELS[options.level] || LEVELS.info;

  /** @param {string} level @param {string} message @param {object} [detail] */
  function write(level, message, detail) {
    if (LEVELS[level] < threshold) {
      return;
    }
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
    const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}${suffix}\n`);
  }

  return {
    debug: (message, detail) => write('debug', message, detail),
    info: (message, detail) => write('info', message, detail),
    warn: (message, detail) => write('warn', message, detail),
    error: (message, detail) => write('error', message, detail),
  };
}

module.exports = { createLogger, LEVELS };
