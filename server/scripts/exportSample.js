'use strict';

/**
 * Writes a sample export of the current database.
 *
 *   node server/scripts/exportSample.js [output]
 *
 * It is the same pipeline the "导出全部联系人" button uses, so the committed sample
 * workbook always matches the current exporter instead of being a hand-made file.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('../src/config/config');
const { createLogger } = require('../src/utils/logger');
const { openDatabase } = require('../src/db/database');
const { listAllContacts } = require('../src/db/contactRepository');
const { createExportBuffer } = require('../src/services/excelService');

async function main() {
  const output = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', '..', 'docs', 'samples', 'contactbook-export-sample.xlsx');

  const database = openDatabase({
    filePath: config.databasePath,
    logger: createLogger({ level: 'warn' }),
  });

  try {
    const contacts = listAllContacts(
      database,
      { keyword: '', groupId: null, bookmarked: false, methodType: null, sort: 'name' },
      config.limits.maxExportRows,
    );
    const { buffer, rowCount } = await createExportBuffer(contacts);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, buffer);
    process.stdout.write(`Exported ${rowCount} contacts to ${output}\n`);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
