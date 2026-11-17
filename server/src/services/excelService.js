'use strict';

const ExcelJS = require('exceljs');

const { METHOD_TYPES, findMethodType } = require('../utils/methodTypes');
const { isValidMethodValue } = require('./contactValidator');
const { toSqlDateTime } = require('../utils/time');
const { AppError, ErrorCode } = require('../utils/errors');

/**
 * Excel import and export.
 *
 * One row per contact, one column per piece of information: the layout the
 * assignment asks for. A type that may appear more than once (a phone number, an
 * e-mail address) gets numbered columns (`Phone 1`, `Phone 2`, …); the number of
 * columns is derived from the data on export and read back from the header on
 * import, so an exported workbook can always be imported again without losing a
 * value.
 *
 * The importer is deliberately forgiving about the sheet shape (a title row is
 * allowed, columns may be reordered, extra columns are ignored) and strict about
 * the values it accepts: every rejected row is reported with its Excel row number
 * and a reason instead of being dropped silently.
 */

/** Fields of a contact that are exported as plain columns. */
const CONTACT_COLUMNS = Object.freeze([
  { key: 'index', header: '#', width: 6, kind: 'index' },
  { key: 'name', header: 'Name', width: 18, kind: 'field', required: true },
  { key: 'group', header: 'Group', width: 12, kind: 'field' },
  { key: 'company', header: 'Company', width: 22, kind: 'field' },
  { key: 'title', header: 'Title', width: 18, kind: 'field' },
  { key: 'note', header: 'Note', width: 32, kind: 'field' },
  { key: 'bookmarked', header: 'Bookmarked', width: 12, kind: 'field' },
  { key: 'bookmarkedAt', header: 'Bookmarked at', width: 20, kind: 'field' },
]);

/** Columns appended after the contact fields. */
const TRAILING_COLUMNS = Object.freeze([
  { key: 'createdAt', header: 'Created at', width: 20, kind: 'field' },
  { key: 'updatedAt', header: 'Updated at', width: 20, kind: 'field' },
]);

/** Header aliases accepted by the importer, per canonical field. */
const HEADER_ALIASES = Object.freeze({
  name: ['name', 'fullname', 'contact', 'contactname'],
  group: ['group', 'groupname', 'category'],
  company: ['company', 'organization', 'organisation'],
  title: ['title', 'jobtitle', 'position'],
  note: ['note', 'notes', 'remark', 'remarks'],
  bookmarked: ['bookmarked', 'bookmark', 'favorite', 'favourite', 'starred'],
  bookmarkedAt: ['bookmarkedat', 'bookmarkdate'],
  createdAt: ['createdat', 'created'],
  updatedAt: ['updatedat', 'updated', 'lastupdated'],
});

/** Regexes that recognise a numbered contact-method column (`Phone 2`). */
const METHOD_HEADER_PATTERNS = Object.freeze([
  { type: 'phone', pattern: /^(phone|phones|mobile|tel|telephone|cell)(\d*)$/ },
  { type: 'email', pattern: /^(email|emails|mail|e-mail)(\d*)$/ },
  { type: 'wechat', pattern: /^(wechat|weixin)(\d*)$/ },
  { type: 'qq', pattern: /^(qq)(\d*)$/ },
  { type: 'website', pattern: /^(website|web|url|homepage|site)(\d*)$/ },
  { type: 'address', pattern: /^(address|addr|location)(\d*)$/ },
  { type: 'other', pattern: /^(other|others|custom)(\d*)$/ },
]);

/** Column header style reused by the export and the template. */
const HEADER_FILL = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' },
});

/** @param {*} value @returns {string} */
function cellText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value instanceof Date) {
    return toSqlDateTime(value);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if (value.text !== undefined) {
      return cellText(value.text);
    }
    if (value.result !== undefined) {
      return cellText(value.result);
    }
    if (value.hyperlink !== undefined && value.text === undefined) {
      return String(value.hyperlink).trim();
    }
  }
  return String(value).trim();
}

/**
 * Converts a one-based column count into its Excel letter (`19` -> `S`).
 *
 * @param {number} count
 * @returns {string}
 */
function lastColumnLetter(count) {
  let letter = '';
  let value = Math.max(1, count);
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    value = Math.floor((value - 1) / 26);
  }
  return letter;
}

/** Removes spaces and brackets and lower-cases a header for matching. */
function canonicalizeHeader(text) {
  return String(text)
    .replace(/[\s()\[\]]/g, '')
    .toLowerCase();
}

/**
 * Splits a canonical header into its canonical field.
 *
 * @param {string} header
 * @returns {{kind: 'field'|'method'|'ignored', key?: string, type?: string, slot?: number}}
 */
function classifyHeader(header) {
  const canonical = canonicalizeHeader(header);
  if (canonical === '') {
    return { kind: 'ignored' };
  }
  if (canonical === '#' || canonical === 'no' || canonical === 'index') {
    return { kind: 'ignored', key: 'index' };
  }
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => alias === canonical)) {
      return { kind: 'field', key };
    }
  }
  for (const entry of METHOD_HEADER_PATTERNS) {
    const match = entry.pattern.exec(canonical);
    if (match) {
      return {
        kind: 'method',
        type: entry.type,
        slot: match[2] ? Number(match[2]) : 1,
      };
    }
  }
  return { kind: 'ignored' };
}

/**
 * Builds the method columns of an export from the data it has to carry.
 *
 * @param {object[]} contacts
 * @returns {Array<{type: string, slot: number, header: string}>}
 */
function buildMethodColumns(contacts) {
  const maximumByType = new Map();
  for (const contact of contacts) {
    const countByType = new Map();
    for (const method of contact.methods || []) {
      countByType.set(method.type, (countByType.get(method.type) || 0) + 1);
    }
    for (const [type, count] of countByType) {
      maximumByType.set(type, Math.max(maximumByType.get(type) || 0, count));
    }
  }

  const columns = [];
  for (const definition of METHOD_TYPES) {
    const required = Math.max(definition.minSlots, maximumByType.get(definition.type) || 0);
    const count = Math.min(Math.max(required, 1), 5);
    for (let slot = 1; slot <= count; slot += 1) {
      const numbered = count > 1;
      columns.push({
        type: definition.type,
        slot,
        header: numbered ? `${definition.excelPrefix} ${slot}` : definition.excelPrefix,
      });
    }
  }
  return columns;
}

/**
 * @param {object[]} contacts
 * @returns {Array<object>} the full column layout of an export
 */
function buildExportColumns(contacts) {
  const methodColumns = buildMethodColumns(contacts).map((column, index) => ({
    ...column,
    key: `method_${column.type}_${column.slot}`,
    width: column.type === 'address' ? 28 : 20,
    kind: 'method',
    order: index,
  }));
  return [...CONTACT_COLUMNS, ...methodColumns, ...TRAILING_COLUMNS];
}

/** Applies the shared look of a header row. */
function styleHeaderRow(worksheet, rowNumber, columnCount, titleRow) {
  const headerRow = worksheet.getRow(rowNumber);
  headerRow.height = 26;
  for (let index = 1; index <= columnCount; index += 1) {
    const cell = headerRow.getCell(index);
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  }

  if (titleRow) {
    worksheet.mergeCells(1, 1, 1, columnCount);
    const title = worksheet.getCell(1, 1);
    title.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(1).height = 28;
  }
}

/**
 * Writes one contact into one sheet row.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} rowNumber
 * @param {object} contact
 * @param {Array<object>} columns
 * @param {number} index
 */
function writeContactRow(worksheet, rowNumber, contact, columns, index) {
  const methodsByType = new Map();
  for (const method of contact.methods || []) {
    if (!methodsByType.has(method.type)) {
      methodsByType.set(method.type, []);
    }
    methodsByType.get(method.type).push(method);
  }

  const row = worksheet.getRow(rowNumber);
  columns.forEach((column, columnIndex) => {
    const cell = row.getCell(columnIndex + 1);
    let value = '';

    if (column.kind === 'index') {
      value = index + 1;
    } else if (column.kind === 'method') {
      const methods = methodsByType.get(column.type) || [];
      value = methods[column.slot - 1] ? methods[column.slot - 1].value : '';
    } else if (column.key === 'group') {
      value = contact.groupName || '';
    } else if (column.key === 'bookmarked') {
      value = contact.isBookmarked ? 'Yes' : 'No';
    } else if (column.key === 'bookmarkedAt') {
      value = contact.bookmarkedAt || '';
    } else {
      value = contact[column.key] === undefined || contact[column.key] === null
        ? ''
        : contact[column.key];
    }

    cell.value = value;
    cell.alignment = {
      vertical: 'middle',
      horizontal: column.kind === 'index' || column.key === 'bookmarked' ? 'center' : 'left',
      wrapText: column.key === 'note' || column.type === 'address',
    };
    cell.font = { size: 10, color: { argb: 'FF1F2937' } };
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } },
      right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
    };
  });

  if (contact.isBookmarked) {
    for (let columnIndex = 1; columnIndex <= columns.length; columnIndex += 1) {
      row.getCell(columnIndex).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' },
      };
    }
  }
}

/**
 * Creates the export workbook of a contact list.
 *
 * @param {object[]} contacts
 * @param {object} [options]
 * @param {string} [options.title]
 * @returns {{ workbook: ExcelJS.Workbook, columns: object[], headerRow: number }}
 */
function buildExportWorkbook(contacts, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ContactBook';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Contacts', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 20 },
  });

  const columns = buildExportColumns(contacts);
  const headerRow = 3;

  const now = new Date();
  const label = contacts.length === 1 ? 'contact' : 'contacts';
  const title =
    options.title ||
    `Contacts · ${contacts.length} ${label} · exported ${toSqlDateTime(now).slice(0, 16)}`;
  worksheet.getCell(1, 1).value = title;

  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
    worksheet.getCell(headerRow, index + 1).value = column.header;
  });
  styleHeaderRow(worksheet, headerRow, columns.length, true);

  contacts.forEach((contact, index) => {
    writeContactRow(worksheet, headerRow + 1 + index, contact, columns, index);
  });

  worksheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: columns.length },
  };
  worksheet.views = [{ state: 'frozen', ySplit: headerRow }];

  // A landscape, fit-to-width page makes the workbook printable as it is: one
  // page wide and as many pages tall as the contact list needs.
  worksheet.printArea = `A1:${lastColumnLetter(columns.length)}${headerRow + contacts.length}`;
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  worksheet.properties.pageSetUpPr = { fitToPage: true };

  // A dropdown makes the two boolean-looking columns unambiguous for the person
  // who fills the workbook in by hand.
  if (contacts.length > 0) {
    const bookmarkedColumn = columns.findIndex((column) => column.key === 'bookmarked') + 1;
    worksheet.getColumn(bookmarkedColumn).eachCell((cell, rowNumber) => {
      if (rowNumber > headerRow) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Yes,No"'],
        };
      }
    });
  }

  return { workbook, columns, headerRow };
}

/**
 * Serialises a list of contacts into an `.xlsx` buffer.
 *
 * @param {object[]} contacts
 * @returns {Promise<{buffer: Buffer, fileName: string, rowCount: number}>}
 */
async function createExportBuffer(contacts) {
  try {
    const { workbook } = buildExportWorkbook(contacts);
    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = toSqlDateTime(new Date()).replace(/[-: ]/g, '').slice(0, 12);
    return {
      buffer: Buffer.from(buffer),
      fileName: `contactbook-${stamp}.xlsx`,
      rowCount: contacts.length,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ErrorCode.EXPORT_FAILED, { detail: { reason: error.message } });
  }
}

/** Writes the "how to fill this workbook" sheet. */
function writeInstructionSheet(workbook, columns) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 96;

  const rows = [
    ['Item', 'Description'],
    ['Purpose', 'Fill this file in and import it, or re-import a previously exported workbook.'],
    ['Required column', 'Name. Every other column may stay empty.'],
    ['One row per contact', 'All columns of a row belong to the same contact; do not insert blank rows between contacts.'],
    ['Repeated methods', 'Phone and email may appear in several numbered columns (Phone 1, Phone 2…), one value per column.'],
    ['Group', 'A group name; an unknown name is created automatically, an empty cell means no group.'],
    ['Bookmarked', 'Fill in Yes or No; an empty cell is treated as No.'],
    ['Import mode', 'Skip duplicates: a contact with the same name and method is skipped. Update existing: the workbook updates it and merges new methods.'],
    ['Validation', 'Phone needs at least 6 digits, email needs @ and a domain, QQ is 5–12 digits, a website starts with http(s):// or is a bare domain.'],
    ['Row limit', 'At most 2000 rows per import and 5 MB per file.'],
    ['Columns of this file', columns.map((column) => column.header).join(' | ')],
    ['Example', 'Name=Sophie Su, Group=Friends, Phone 1=13800001111, Email 1=sophie.su@example.com, Bookmarked=Yes'],
  ];
  rows.forEach((row, index) => {
    const line = sheet.getRow(index + 1);
    line.getCell(1).value = row[0];
    line.getCell(2).value = row[1];
    if (index === 0) {
      line.getCell(1).fill = HEADER_FILL;
      line.getCell(2).fill = HEADER_FILL;
      line.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      line.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else {
      line.getCell(1).font = { bold: true, size: 10 };
      line.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
    line.getCell(2).font = { size: 10, color: { argb: 'FF1F2937' }, ...(index === 0 ? { color: { argb: 'FFFFFFFF' }, bold: true } : {}) };
    line.height = index === 0 ? 22 : 30;
  });
}

/**
 * Builds the empty import template, which is an export of zero contacts with a
 * richer instruction sheet and wider method slots.
 *
 * @returns {Promise<{buffer: Buffer, fileName: string}>}
 */
async function createTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ContactBook';
  const worksheet = workbook.addWorksheet('Contacts', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 20 },
  });

  const columns = buildExportColumns([]);
  // The template always offers three phone columns and two e-mail columns, so a
  // person who fills it in by hand does not run out of room.
  const methodColumns = [];
  for (const definition of METHOD_TYPES) {
    const count = definition.type === 'phone' || definition.type === 'email' ? 3 : 1;
    for (let slot = 1; slot <= count; slot += 1) {
      methodColumns.push({
        type: definition.type,
        slot,
        header: `${definition.excelPrefix} ${slot}`,
        key: `method_${definition.type}_${slot}`,
        width: 22,
        kind: 'method',
      });
    }
  }
  const allColumns = [...CONTACT_COLUMNS, ...methodColumns, ...TRAILING_COLUMNS];

  worksheet.getCell(1, 1).value = 'Contacts template · fill from row 4 · Name is required · instructions on the second sheet';
  allColumns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
    worksheet.getCell(3, index + 1).value = column.header;
  });
  styleHeaderRow(worksheet, 3, allColumns.length, true);

  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: allColumns.length },
  };
  worksheet.printArea = `A1:${lastColumnLetter(allColumns.length)}60`;
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  worksheet.properties.pageSetUpPr = { fitToPage: true };

  const bookmarkedColumn = allColumns.findIndex((column) => column.key === 'bookmarked') + 1;
  const groupColumn = allColumns.findIndex((column) => column.key === 'group') + 1;
  for (let rowNumber = 4; rowNumber <= 203; rowNumber += 1) {
    worksheet.getCell(rowNumber, bookmarkedColumn).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Yes,No"'],
    };
    worksheet.getCell(rowNumber, groupColumn).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Family,Friends,Colleagues,Clients,Others"'],
    };
  }

  writeInstructionSheet(workbook, allColumns);

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), fileName: 'contactbook-import-template.xlsx' };
}

/**
 * Finds the header row of a sheet.
 *
 * A sheet may carry a title above the header (the exporter writes one), so the
 * header is the first row in the first fifteen that contains a name column.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {{rowNumber: number, columns: Array<object>, ignored: string[]}|null}
 */
function findHeader(worksheet) {
  const lastCandidate = Math.min(worksheet.rowCount || 0, 15);
  for (let rowNumber = 1; rowNumber <= lastCandidate; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = [];
    const ignored = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = cellText(cell.value);
      if (header === '') {
        return;
      }
      const classification = classifyHeader(header);
      if (classification.kind === 'ignored') {
        ignored.push({ column: columnNumber, header });
        return;
      }
      columns.push({ column: columnNumber, header, ...classification });
    });

    const hasName = columns.some((column) => column.kind === 'field' && column.key === 'name');
    if (hasName) {
      return { rowNumber, columns, ignored };
    }
  }
  return null;
}

/** @param {ExcelJS.Worksheet} worksheet @returns {ExcelJS.Worksheet} */
function pickWorksheet(workbook) {
  const preferred = workbook.getWorksheet('Contacts');
  if (preferred) {
    return preferred;
  }
  let first = null;
  workbook.eachSheet((sheet) => {
    if (!first) {
      first = sheet;
    }
  });
  return first;
}

/**
 * Reads a workbook into an import plan without touching the database.
 *
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {number} [options.maxRows]
 * @returns {Promise<object>} `{ rows, failed, columns, ignored, headerRow, sheetName, totalRows }`
 * @throws {AppError} IMPORT_* codes for structural problems
 */
async function parseImportWorkbook(buffer, options = {}) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new AppError(ErrorCode.IMPORT_FAILED, {
      message: 'The file is not a readable .xlsx workbook',
      detail: { reason: error.message },
    });
  }

  const worksheet = pickWorksheet(workbook);
  if (!worksheet || worksheet.rowCount === 0) {
    throw new AppError(ErrorCode.IMPORT_WORKBOOK_EMPTY, {
      message: 'The workbook does not contain any row',
    });
  }

  const header = findHeader(worksheet);
  if (!header) {
    throw new AppError(ErrorCode.IMPORT_HEADER_MISSING, {
      message: 'The workbook has no header row containing a Name column',
      detail: { sheetName: worksheet.name },
    });
  }

  const maxRows = options.maxRows || 2000;
  const fieldColumns = new Map();
  const methodColumns = [];
  for (const column of header.columns) {
    if (column.kind === 'field') {
      fieldColumns.set(column.key, column.column);
    } else if (column.kind === 'method') {
      methodColumns.push(column);
    }
  }

  const methodCountByType = new Map();
  // A column that the workbook does not have reads as an empty value, so an
  // export without (for example) a Company column still cannot crash the parser.
  const valueOf = (row, columnNumber) => (
    columnNumber === undefined ? '' : cellText(row.getCell(columnNumber).value)
  );

  const rows = [];
  const failed = [];
  const lastRow = worksheet.rowCount;

  for (let rowNumber = header.rowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const name = valueOf(row, fieldColumns.get('name'));

    const rawMethods = [];
    for (const column of methodColumns) {
      const value = valueOf(row, column.column);
      if (value !== '') {
        rawMethods.push({ type: column.type, value, slot: column.slot });
      }
    }

    const group = valueOf(row, fieldColumns.get('group'));
    const company = valueOf(row, fieldColumns.get('company'));
    const title = valueOf(row, fieldColumns.get('title'));
    const note = valueOf(row, fieldColumns.get('note'));
    const bookmarkedText = valueOf(row, fieldColumns.get('bookmarked'));
    const emptyRow = name === '' && group === '' && company === '' && title === ''
      && note === '' && bookmarkedText === '' && rawMethods.length === 0;
    if (emptyRow) {
      continue;
    }

    if (rows.length + failed.length >= maxRows) {
      throw new AppError(ErrorCode.IMPORT_TOO_MANY_ROWS, {
        message: `The workbook contains more than ${maxRows} contact rows`,
        detail: { maxRows },
      });
    }

    const problems = [];
    if (name === '') {
      problems.push('Name is required');
    } else if (name.length > 40) {
      problems.push(`Name is longer than 40 characters (${name.length})`);
    }

    let bookmarked = false;
    let bookmarkedProvided = false;
    if (bookmarkedText !== '') {
      bookmarkedProvided = true;
      const text = bookmarkedText.toLowerCase();
      if (['yes', 'true', '1', 'y'].includes(text)) {
        bookmarked = true;
      } else if (['no', 'false', '0', 'n'].includes(text)) {
        bookmarked = false;
      } else {
        problems.push(`Bookmarked must be Yes or No, received "${bookmarkedText}"`);
      }
    }

    const methods = [];
    const seen = new Set();
    for (const raw of rawMethods) {
      const definition = findMethodType(raw.type);
      if (raw.value.length > 120) {
        problems.push(`${definition.label} value is longer than 120 characters`);
        continue;
      }
      if (!isValidMethodValue(raw.type, raw.value)) {
        problems.push(`"${raw.value}" is not a valid ${definition.label.toLowerCase()} value`);
        continue;
      }
      const key = `${raw.type}:${raw.value.toLowerCase()}`;
      if (seen.has(key)) {
        problems.push(`${definition.label} "${raw.value}" appears twice in one contact`);
        continue;
      }
      seen.add(key);
      methods.push({ type: raw.type, label: '', value: raw.value, isPrimary: false });
      methodCountByType.set(raw.type, (methodCountByType.get(raw.type) || 0) + 1);
    }

    if (methods.length > 10) {
      problems.push('A contact may have at most 10 contact methods');
    }
    if (note.length > 500) {
      problems.push('Note is longer than 500 characters');
    }

    const record = {
      row: rowNumber,
      name,
      group,
      company: company.slice(0, 60),
      title: title.slice(0, 40),
      note: note.slice(0, 500),
      bookmarked,
      bookmarkedProvided,
      methods,
    };

    if (problems.length > 0) {
      failed.push({ row: rowNumber, name: name || '(empty)', message: problems.join('; ') });
    } else {
      rows.push(record);
    }
  }

  return {
    sheetName: worksheet.name,
    headerRow: header.rowNumber,
    totalRows: rows.length + failed.length,
    rows,
    failed,
    columns: header.columns.map((column) => ({
      column: column.column,
      header: column.header,
      target: column.kind === 'method' ? `${column.type}[${column.slot}]` : column.key,
    })),
    ignored: header.ignored,
    methodCountByType: Object.fromEntries(methodCountByType),
  };
}

module.exports = {
  CONTACT_COLUMNS,
  HEADER_ALIASES,
  TRAILING_COLUMNS,
  buildExportColumns,
  buildExportWorkbook,
  buildMethodColumns,
  cellText,
  classifyHeader,
  createExportBuffer,
  createTemplateBuffer,
  findHeader,
  parseImportWorkbook,
};
