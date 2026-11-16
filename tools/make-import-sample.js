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
  const worksheet = workbook.addWorksheet('通讯录');
  worksheet.columns = [
    { header: '姓名', key: 'name', width: 14 },
    { header: '分组', key: 'group', width: 10 },
    { header: '公司', key: 'company', width: 20 },
    { header: '职位', key: 'title', width: 16 },
    { header: '备注', key: 'note', width: 26 },
    { header: '是否收藏', key: 'bookmarked', width: 10 },
    { header: '电话1', key: 'phone1', width: 18 },
    { header: '电话2', key: 'phone2', width: 18 },
    { header: '邮箱1', key: 'email1', width: 26 },
    { header: '微信', key: 'wechat', width: 16 },
    { header: 'QQ', key: 'qq', width: 12 },
    { header: '地址', key: 'address', width: 30 },
  ];

  worksheet.addRow({
    name: '周予安',
    group: '朋友',
    company: '予安建筑事务所',
    title: '建筑师',
    note: '老同学，通过导入添加',
    bookmarked: '是',
    phone1: '138 0000 5555',
    phone2: '0591 8333 2211',
    email1: 'yuan.zhou@example.com',
    wechat: 'zhouyuan_arch',
    qq: '33445566',
    address: '福州市鼓楼区湖东路 66 号',
  });

  worksheet.addRow({
    name: '陈嘉树',
    group: '同事',
    company: '云图软件',
    title: '测试工程师',
    note: '新同事，入职第一周',
    bookmarked: '否',
    phone1: '136 5555 7777',
    email1: 'jiashu.chen@company.com',
    wechat: 'chenjs_test',
  });

  worksheet.addRow({
    name: '王砚秋',
    group: '客户',
    company: '砚秋设计',
    title: '主理人',
    note: '设计展会认识，报价走邮件',
    bookmarked: '是',
    phone1: '139 6666 8888',
    email1: 'yanqiu.wang@client.com',
    address: '厦门市思明区环岛东路 18 号',
  });

  // A duplicate of a seeded contact: same name and the same phone number.
  worksheet.addRow({
    name: '苏晚晴',
    group: '朋友',
    company: '厦门未晚工作室',
    title: '视觉设计',
    note: '重复记录，应该被跳过',
    bookmarked: '否',
    phone1: '137 1234 5678',
    email1: 'wanqing.su@example.com',
  });

  // A row the importer must reject: the e-mail column has no domain.
  worksheet.addRow({
    name: '邮箱写错的示例',
    group: '其他',
    company: '',
    title: '',
    note: '这一行的邮箱不合法，用来演示错误报告',
    bookmarked: '否',
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
