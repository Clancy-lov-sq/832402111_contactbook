'use strict';

/**
 * Builds the workbook used by the import demonstration.
 *
 *   node tools/make-import-sample.js
 *
 * It intentionally contains four kinds of row so the import report of the blog is
 * a real report: three new contacts, one duplicate of a seeded contact (same name
 * and phone), and one row with a malformed e-mail address.
 */

const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const outputDirectory = path.resolve(__dirname, '..', 'screenshots', 'fixtures');

async function main() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Contacts');
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 18 },
    { header: 'Group', key: 'group', width: 12 },
    { header: 'Company', key: 'company', width: 22 },
    { header: 'Title', key: 'title', width: 18 },
    { header: 'Note', key: 'note', width: 30 },
    { header: 'Bookmarked', key: 'bookmarked', width: 12 },
    { header: 'Phone 1', key: 'phone1', width: 18 },
    { header: 'Phone 2', key: 'phone2', width: 18 },
    { header: 'Email 1', key: 'email1', width: 26 },
    { header: 'WeChat', key: 'wechat', width: 16 },
    { header: 'QQ', key: 'qq', width: 12 },
    { header: 'Address', key: 'address', width: 32 },
  ];

  worksheet.addRow({
    name: 'Fiona Zhou',
    group: 'Friends',
    company: 'Yuan Architects',
    title: 'Architect',
    note: 'Old classmate; added through the import',
    bookmarked: 'Yes',
    phone1: '138 0000 5555',
    phone2: '0591 8333 2211',
    email1: 'fiona.zhou@example.com',
    wechat: 'fiona_zhou',
    qq: '33445566',
    address: 'No. 66 Hudong Road, Gulou District, Fuzhou',
  });

  worksheet.addRow({
    name: 'Jason Chen',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'QA engineer',
    note: 'New colleague, first week',
    bookmarked: 'No',
    phone1: '136 5555 7777',
    email1: 'jason.chen@yuntu.example.com',
    wechat: 'jason_chen_qa',
  });

  worksheet.addRow({
    name: 'Wendy Wang',
    group: 'Clients',
    company: 'Yanqiu Design',
    title: 'Founder',
    note: 'Met at the design fair; quotes by e-mail',
    bookmarked: 'Yes',
    phone1: '139 6666 8888',
    email1: 'wendy.wang@yanqiu.example.com',
    address: 'No. 18 Huandao East Road, Siming District, Xiamen',
  });

  // A duplicate of a seeded contact: same name and the same phone number.
  worksheet.addRow({
    name: 'Sophie Su',
    group: 'Friends',
    company: 'Muyan Studio',
    title: 'Visual designer',
    note: 'Duplicate record, should be skipped',
    bookmarked: 'No',
    phone1: '137 1234 5678',
    email1: 'sophie.su@example.com',
  });

  // A row the importer must reject: the e-mail column has no domain.
  worksheet.addRow({
    name: 'Broken Email Sample',
    group: 'Others',
    company: '',
    title: '',
    note: 'The e-mail of this row is invalid, to demonstrate the error report',
    bookmarked: 'No',
    phone1: '135 0000 0000',
    email1: 'not-an-email',
  });

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  header.height = 24;

  fs.mkdirSync(outputDirectory, { recursive: true });
  const filePath = path.join(outputDirectory, 'import-demo.xlsx');
  await workbook.xlsx.writeFile(filePath);
  process.stdout.write(`written ${filePath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
