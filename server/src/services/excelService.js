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
 * e-mail address) gets numbered columns (`电话1`, `电话2`, …); the number of
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
  { key: 'index', header: '序号', width: 6, kind: 'index' },
  { key: 'name', header: '姓名', width: 14, kind: 'field', required: true },
  { key: 'group', header: '分组', width: 10, kind: 'field' },
  { key: 'company', header: '公司', width: 22, kind: 'field' },
  { key: 'title', header: '职位', width: 14, kind: 'field' },
  { key: 'note', header: '备注', width: 30, kind: 'field' },
  { key: 'bookmarked', header: '是否收藏', width: 10, kind: 'field' },
  { key: 'bookmarkedAt', header: '收藏时间', width: 20, kind: 'field' },
]);

/** Columns appended after the contact fields. */
const TRAILING_COLUMNS = Object.freeze([
  { key: 'createdAt', header: '创建时间', width: 20, kind: 'field' },
  { key: 'updatedAt', header: '更新时间', width: 20, kind: 'field' },
]);

/** Header aliases accepted by the importer, per canonical field. */
const HEADER_ALIASES = Object.freeze({
  name: ['姓名', '名字', '联系人', '联系人姓名', 'name', 'contactname'],
  group: ['分组', '组别', '分组名称', '群组', 'group', 'groupname'],
  company: ['公司', '单位', '公司名称', 'company'],
  title: ['职位', '职务', 'title', 'jobtitle'],
  note: ['备注', '说明', 'note', 'remark', 'remarks'],
  bookmarked: ['是否收藏', '收藏', 'bookmark', 'bookmarked', 'favorite', 'starred'],
  bookmarkedAt: ['收藏时间', 'bookmarkedat'],
  createdAt: ['创建时间', 'createdat'],
  updatedAt: ['更新时间', '修改时间', 'updatedat'],
});

/** Regexes that recognise a numbered contact-method column (`电话2`). */
const METHOD_HEADER_PATTERNS = Object.freeze([
  { type: 'phone', pattern: /^(电话|手机|手机号|手机号码|电话号码|联系电话|phone|mobile|tel)(\d*)$/ },
  { type: 'email', pattern: /^(邮箱|电子邮箱|邮件|电子邮件|email|e-mail|mail)(\d*)$/ },
  { type: 'wechat', pattern: /^(微信|微信号|wechat|weixin)(\d*)$/ },
  { type: 'qq', pattern: /^(qq|qq号)(\d*)$/ },
  { type: 'website', pattern: /^(网址|网站|website|url|web|homepage)(\d*)$/ },
  { type: 'address', pattern: /^(地址|住址|通讯地址|address|addr)(\d*)$/ },
  { type: 'other', pattern: /^(其他|其它|自定义|other|others)(\d*)$/ },
]);

/** Column header style reused by the export and the template. */
const HEADER_FILL = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' },
});

/** @param {*} value @returns {string} */
function cellText(value) {  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
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
    .replace(/[\s\u3000（）()【】[\]]/g, '')
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
  if (canonical === '序号' || canonical === 'no' || canonical === 'index') {
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
        header: numbered ? `${definition.excelPrefix}${slot}` : definition.excelPrefix,
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
      value = contact.isBookmarked ? '是' : '否';
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

  const worksheet = workbook.addWorksheet('通讯录', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 20 },
  });

  const columns = buildExportColumns(contacts);
  const headerRow = 3;

  const now = new Date();
  const title =
    options.title ||
    `通讯录 · 共 ${contacts.length} 位联系人 · 导出于 ${toSqlDateTime(now).slice(0, 16)}`;
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
          formulae: ['"是,否"'],
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
  const sheet = workbook.addWorksheet('填写说明');
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 96;

  const rows = [
    ['项目', '说明'],
    ['用途', '本文件既可以直接填写后导入，也可以作为一次导出的结果再次导入。'],
    ['必填列', '姓名。其余列都可以留空。'],
    ['一行一位联系人', '同一行的所有列都属于同一位联系人；不要在同一位联系人下面插入空行。'],
    ['重复的联系方式', '电话、邮箱等可以出现在多个编号列中（电话1、电话2…），一列一个值。'],
    ['分组', '填写分组名称。不存在分组会自动创建，留空表示未分组。'],
    ['是否收藏', '填写“是”或“否”；留空按“否”处理。'],
    ['导入模式', '跳过重复：同名且联系方式相同的联系人被跳过；更新已有：用表格内容更新联系人并合并联系方式。'],
    ['校验规则', '电话至少 6 位数字，邮箱需包含 @ 与域名，QQ 为 5–12 位数字，网址以 http(s):// 开头或为域名形式。'],
    ['行数上限', '单次最多导入 2000 行，文件不超过 5 MB。'],
    ['本表列顺序', columns.map((column) => column.header).join(' | ')],
    ['示例', '姓名=林澄月，分组=朋友，电话1=13800001111，邮箱1=chengyue@example.com，是否收藏=是'],
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
  const worksheet = workbook.addWorksheet('通讯录', {
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
        header: `${definition.excelPrefix}${slot}`,
        key: `method_${definition.type}_${slot}`,
        width: 22,
        kind: 'method',
      });
    }
  }
  const allColumns = [...CONTACT_COLUMNS, ...methodColumns, ...TRAILING_COLUMNS];

  worksheet.getCell(1, 1).value = '通讯录模板 · 请从第 4 行开始填写 · 姓名必填 · 填写说明见第二个工作表';
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
      formulae: ['"是,否"'],
    };
    worksheet.getCell(rowNumber, groupColumn).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"家人,朋友,同事,客户,其他"'],
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
  const preferred = workbook.getWorksheet('通讯录');
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
      message: 'The workbook has no header row containing a 姓名 (Name) column',
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
  // export without (for example) a 公司 column still cannot crash the parser.
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
      problems.push('姓名不能为空');
    } else if (name.length > 40) {
      problems.push(`姓名超过 40 个字符（当前 ${name.length} 个）`);
    }

    let bookmarked = false;
    let bookmarkedProvided = false;
    if (bookmarkedText !== '') {
      bookmarkedProvided = true;
      const text = bookmarkedText.toLowerCase();
      if (['是', 'true', '1', 'yes', 'y', '收藏'].includes(text)) {
        bookmarked = true;
      } else if (['否', 'false', '0', 'no', 'n'].includes(text)) {
        bookmarked = false;
      } else {
        problems.push(`“是否收藏”只能填写“是”或“否”，当前为“${bookmarkedText}”`);
      }
    }

    const methods = [];
    const seen = new Set();
    for (const raw of rawMethods) {
      const definition = findMethodType(raw.type);
      if (raw.value.length > 120) {
        problems.push(`${definition.label}的值超过 120 个字符`);
        continue;
      }
      if (!isValidMethodValue(raw.type, raw.value)) {
        problems.push(`“${raw.value}”不是有效的${definition.label}格式`);
        continue;
      }
      const key = `${raw.type}:${raw.value.toLowerCase()}`;
      if (seen.has(key)) {
        problems.push(`${definition.label}“${raw.value}”在同一个联系人中出现两次`);
        continue;
      }
      seen.add(key);
      methods.push({ type: raw.type, label: '', value: raw.value, isPrimary: false });
      methodCountByType.set(raw.type, (methodCountByType.get(raw.type) || 0) + 1);
    }

    if (methods.length > 10) {
      problems.push('一位联系人最多 10 条联系方式');
    }
    if (note.length > 500) {
      problems.push('备注超过 500 个字符');
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
