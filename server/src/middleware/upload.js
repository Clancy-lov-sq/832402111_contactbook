'use strict';

const multer = require('multer');

const { AppError, ErrorCode } = require('../utils/errors');

/**
 * Upload handling of the import endpoint.
 *
 * The workbook is kept in memory: it is at most a few megabytes, it is parsed
 * immediately, and nothing untrusted is ever written to the file system. The
 * file name is not used for anything but the reply.
 *
 * @param {object} config
 * @returns {import('express').RequestHandler}
 */
function createUploadMiddleware(config) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.limits.maxImportBytes,
      files: 1,
      fields: 4,
    },
    fileFilter(request, file, callback) {
      const name = String(file.originalname || '').toLowerCase();
      const isXlsx = name.endsWith('.xlsx');
      const isZip = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || file.mimetype === 'application/octet-stream';
      if (!isXlsx) {
        callback(
          new AppError(ErrorCode.IMPORT_FILE_UNSUPPORTED, {
            message: 'Only .xlsx workbooks can be imported; save the file as an Excel workbook first',
          }),
        );
        return;
      }
      if (!isZip) {
        callback(
          new AppError(ErrorCode.IMPORT_FILE_UNSUPPORTED, {
            message: `Unexpected content type "${file.mimetype}" for an .xlsx workbook`,
          }),
        );
        return;
      }
      callback(null, true);
    },
  });

  const single = upload.single('file');
  return (request, response, next) => {
    single(request, response, (error) => {
      if (!error) {
        next();
        return;
      }
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(ErrorCode.IMPORT_FILE_TOO_LARGE, {
            message: `The workbook must be smaller than ${Math.round(config.limits.maxImportBytes / 1024 / 1024)} MB`,
          }),
        );
        return;
      }
      next(error);
    });
  };
}

module.exports = { createUploadMiddleware };
