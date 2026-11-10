'use strict';

/**
 * Time helpers.
 *
 * Timestamps are stored as `YYYY-MM-DD HH:MM:SS` in the local time of the
 * server, the same shape SQLite produces with `strftime('%Y-%m-%d %H:%M:%S',
 * 'now', 'localtime')`. One format everywhere keeps string comparison in SQL
 * correct and lets the front end parse a timestamp without extra rules.
 */

/** @param {Date} [date] @returns {string} `YYYY-MM-DD HH:MM:SS` in local time */
function toSqlDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ');
}

/** @returns {string} the current local time in the storage format */
function nowText() {
  return toSqlDateTime(new Date());
}

/**
 * @param {string} text `YYYY-MM-DD HH:MM:SS`
 * @returns {Date} the parsed date (local time)
 */
function parseSqlDateTime(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || ''));
  if (!match) {
    return new Date(Number.NaN);
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

module.exports = { toSqlDateTime, nowText, parseSqlDateTime };
