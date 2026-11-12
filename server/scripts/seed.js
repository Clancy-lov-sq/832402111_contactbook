'use strict';

/**
 * Demonstration data.
 *
 *   node server/scripts/seed.js            # insert the demo contacts when the book is empty
 *   node server/scripts/seed.js --reset    # empty the book first, then insert them
 *
 * The data is inserted through the repository, not through raw SQL strings, so a
 * demo row always satisfies the same constraints a real row does. Timestamps are
 * explicit and spread over three weeks, which is what makes the "recently
 * updated" and "recently added" sortings, the bookmark ordering and the weekly
 * counter visible in the screenshots.
 */

const config = require('../src/config/config');
const { createLogger } = require('../src/utils/logger');
const { openDatabase } = require('../src/db/database');
const { DEFAULT_GROUPS } = require('../src/db/schema');
const {
  findGroupByName,
  insertContact,
  insertGroup,
  insertMethods,
} = require('../src/db/contactRepository');
const { pickAvatarColor } = require('../src/services/contactValidator');

const SEED_CONTACTS = Object.freeze([
  {
    name: '林建国',
    group: '家人',
    company: '福州无线电二厂',
    title: '退休工程师',
    note: '爸爸。周末上午方便接电话，喜欢看新闻。',
    bookmarked: true,
    createdAt: '2026-10-20 09:12:00',
    updatedAt: '2026-11-14 20:05:00',
    bookmarkedAt: '2026-10-20 09:13:00',
    methods: [
      ['phone', '138 0591 2233', '手机'],
      ['phone', '0591 8336 1188', '家庭'],
      ['wechat', 'linjg1958', '微信'],
      ['address', '福建省福州市鼓楼区五四路 128 号 3 座 502', '住址'],
    ],
  },
  {
    name: '陈秀兰',
    group: '家人',
    company: '',
    title: '',
    note: '妈妈。周三、周六在老年大学，晚上七点后在家。',
    bookmarked: true,
    createdAt: '2026-10-20 09:16:00',
    updatedAt: '2026-11-12 18:40:00',
    bookmarkedAt: '2026-10-20 09:17:00',
    methods: [
      ['phone', '139 0591 7788', '手机'],
      ['wechat', 'chenxiulan', '微信'],
    ],
  },
  {
    name: '苏晚晴',
    group: '朋友',
    company: '厦门未晚工作室',
    title: '视觉设计',
    note: '大学室友。喜欢手冲咖啡，约稿联系她。',
    bookmarked: true,
    createdAt: '2026-10-21 14:02:00',
    updatedAt: '2026-11-15 10:20:00',
    bookmarkedAt: '2026-10-25 21:30:00',
    methods: [
      ['phone', '137 1234 5678', '手机'],
      ['email', 'wanqing.su@example.com', '常用'],
      ['wechat', 'suwanqing', '微信'],
      ['qq', '44556677', 'QQ'],
    ],
  },
  {
    name: '周子墨',
    group: '朋友',
    company: '自由职业',
    title: '独立摄影师',
    note: '拍毕业照找他，作品集在个人网站。',
    bookmarked: false,
    createdAt: '2026-10-22 19:45:00',
    updatedAt: '2026-11-08 15:12:00',
    methods: [
      ['phone', '136 8888 1234', '手机'],
      ['email', 'zimo.zhou@example.com', '工作'],
      ['website', 'https://zimo.example.com', '作品集'],
    ],
  },
  {
    name: '高远',
    group: '朋友',
    company: '城市马拉松俱乐部',
    title: '跑团团长',
    note: '每周日早上西湖公园集合，配速 5:30。',
    bookmarked: false,
    createdAt: '2026-10-23 07:30:00',
    updatedAt: '2026-11-11 07:55:00',
    methods: [
      ['phone', '135 1111 2222', '手机'],
      ['wechat', 'gaoyuan_run', '微信'],
    ],
  },
  {
    name: '许知夏',
    group: '朋友',
    company: '上海知夏文化',
    title: '编辑',
    note: '书评编辑，投稿先发邮件。',
    bookmarked: false,
    createdAt: '2026-10-24 11:10:00',
    updatedAt: '2026-11-06 16:30:00',
    methods: [
      ['phone', '158 6666 7777', '手机'],
      ['email', 'zhixia.xu@example.com', '投稿'],
      ['address', '上海市徐汇区衡山路 8 号 12 楼', '公司地址'],
    ],
  },
  {
    name: '王浩然',
    group: '同事',
    company: '云图软件',
    title: '后端负责人',
    note: '接口联调找他，周三例会同步进度。',
    bookmarked: true,
    createdAt: '2026-10-25 10:00:00',
    updatedAt: '2026-11-15 09:05:00',
    bookmarkedAt: '2026-11-01 09:20:00',
    methods: [
      ['phone', '186 0000 1111', '工作手机'],
      ['email', 'haoran.wang@company.com', '工作邮箱'],
      ['wechat', 'wanghr_work', '企业微信'],
      ['qq', '123456789', 'QQ'],
    ],
  },
  {
    name: '李思远',
    group: '同事',
    company: '云图软件',
    title: '前端工程师',
    note: '负责页面交互，代码规范一起定的。',
    bookmarked: false,
    createdAt: '2026-10-25 10:05:00',
    updatedAt: '2026-11-10 20:15:00',
    methods: [
      ['phone', '188 2222 3333', '工作手机'],
      ['email', 'siyuan.li@company.com', '工作邮箱'],
    ],
  },
  {
    name: '赵敏',
    group: '同事',
    company: '云图软件',
    title: 'HRBP',
    note: '实习证明、考勤异常找她。',
    bookmarked: false,
    createdAt: '2026-10-26 09:40:00',
    updatedAt: '2026-11-03 14:22:00',
    methods: [
      ['phone', '135 4444 5555', '工作手机'],
      ['email', 'min.zhao@company.com', '工作邮箱'],
      ['wechat', 'zhaomin_hr', '企业微信'],
    ],
  },
  {
    name: '孙嘉禾',
    group: '同事',
    company: '云图软件',
    title: '测试工程师',
    note: '提测前把自测清单发她。',
    bookmarked: false,
    createdAt: '2026-10-27 13:25:00',
    updatedAt: '2026-11-13 11:48:00',
    methods: [
      ['phone', '136 5555 6666', '工作手机'],
      ['qq', '87654321', 'QQ'],
    ],
  },
  {
    name: '郑一鸣',
    group: '同事',
    company: '云图软件',
    title: '运维工程师',
    note: '部署、域名与证书问题找他。',
    bookmarked: false,
    createdAt: '2026-10-28 08:15:00',
    updatedAt: '2026-11-14 22:10:00',
    methods: [
      ['phone', '159 7777 8888', '工作手机'],
      ['email', 'yiming.zheng@company.com', '工作邮箱'],
      ['address', '深圳市南山区科技园南区 6 栋 903', '机房值班室'],
    ],
  },
  {
    name: '何雨桐',
    group: '同事',
    company: '云图软件',
    title: '产品经理',
    note: '需求评审记录在她的飞书文档里。',
    bookmarked: false,
    createdAt: '2026-10-29 15:00:00',
    updatedAt: '2026-11-09 17:35:00',
    methods: [
      ['phone', '137 9999 0000', '工作手机'],
      ['wechat', 'heyutong_pm', '企业微信'],
    ],
  },
  {
    name: '蒋文博',
    group: '客户',
    company: '博远科技',
    title: '采购总监',
    note: '重点客户，报价单走公司邮箱，节假日发问候。',
    bookmarked: true,
    createdAt: '2026-10-30 10:20:00',
    updatedAt: '2026-11-15 11:30:00',
    bookmarkedAt: '2026-11-05 10:00:00',
    methods: [
      ['phone', '139 1234 8888', '商务'],
      ['phone', '0591 8822 6600', '总机转 802'],
      ['email', 'wenbo.jiang@client.com', '商务邮箱'],
      ['wechat', 'jiangwenbo_boyuan', '微信'],
    ],
  },
  {
    name: '沈亦舟',
    group: '客户',
    company: '云舟数据',
    title: 'CTO',
    note: '技术方案对接人，关注接口性能与数据安全。',
    bookmarked: true,
    createdAt: '2026-11-01 09:00:00',
    updatedAt: '2026-11-14 16:45:00',
    bookmarkedAt: '2026-11-02 09:10:00',
    methods: [
      ['phone', '138 7777 1234', '商务'],
      ['email', 'yizhou.shen@client.com', '技术对接'],
      ['website', 'https://yunzhou.example.com', '公司官网'],
    ],
  },
  {
    name: '邓雅琴',
    group: '客户',
    company: '雅琴文创',
    title: '创始人',
    note: '小批量定制，沟通以微信为主。',
    bookmarked: false,
    createdAt: '2026-11-02 14:10:00',
    updatedAt: '2026-11-07 10:05:00',
    methods: [
      ['phone', '136 1234 9999', '手机'],
      ['wechat', 'dengyq_client', '微信'],
    ],
  },
  {
    name: '马骁',
    group: '客户',
    company: '驰远物流',
    title: '运营经理',
    note: '月底对账，需要发票信息。',
    bookmarked: false,
    createdAt: '2026-11-03 11:20:00',
    updatedAt: '2026-11-12 15:40:00',
    methods: [
      ['phone', '187 5555 4444', '手机'],
      ['email', 'xiao.ma@client.com', '对账'],
    ],
  },
  {
    name: '罗时雨',
    group: '客户',
    company: '时雨咨询',
    title: '合伙人',
    note: '合同由她那边起草，注意版本号。',
    bookmarked: false,
    createdAt: '2026-11-04 16:00:00',
    updatedAt: '2026-11-05 09:25:00',
    methods: [
      ['phone', '135 6666 3333', '手机'],
      ['qq', '556677889', 'QQ'],
    ],
  },
  {
    name: '唐婉',
    group: '其他',
    company: '福大社区',
    title: '社区活动联络人',
    note: '社区志愿活动报名用。',
    bookmarked: false,
    createdAt: '2026-11-05 09:30:00',
    updatedAt: '2026-11-08 10:10:00',
    methods: [
      ['phone', '188 9999 1111', '手机'],
      ['wechat', 'tangwan_life', '微信'],
    ],
  },
  {
    name: '房东刘姐',
    group: '其他',
    company: '',
    title: '房东',
    note: '每月 5 日交房租，水电费按表抄。',
    bookmarked: true,
    createdAt: '2026-11-06 08:45:00',
    updatedAt: '2026-11-06 08:46:00',
    bookmarkedAt: '2026-11-06 08:46:00',
    methods: [
      ['phone', '137 0591 5566', '手机'],
      ['wechat', 'liujie_fangdong', '微信'],
      ['address', '福州市台江区交通路 22 号 1 座 601', '出租房'],
    ],
  },
  {
    name: '快递驿站',
    group: '其他',
    company: '菜鸟驿站（福大店）',
    title: '驿站',
    note: '取件码短信会发到手机，晚上九点关门。',
    bookmarked: false,
    createdAt: '2026-11-07 19:15:00',
    updatedAt: '2026-11-07 19:15:00',
    methods: [
      ['phone', '0591 8888 6666', '驿站电话'],
      ['address', '福州市闽侯县学园路 2 号福大生活区东门', '取件点'],
    ],
  },
]);

/** @returns {object} the inserted statistics */
function seed({ reset = false } = {}) {
  const logger = createLogger({ level: 'warn' });
  const database = openDatabase({ filePath: config.databasePath, logger });

  try {
    const existing = Number(database.get('SELECT COUNT(*) AS total FROM contact').total);
    if (existing > 0 && !reset) {
      return { inserted: 0, skipped: true, existing };
    }

    if (reset) {
      database.transaction(() => {
        database.exec('DELETE FROM contact_method');
        database.exec('DELETE FROM contact');
        database.exec('DELETE FROM contact_group');
        database.exec("DELETE FROM sqlite_sequence WHERE name IN ('contact', 'contact_method', 'contact_group')");
      });
    }

    const inserted = database.transaction(() => {
      // Re-create the default groups with their colours: `--reset` emptied the
      // table, and an ad-hoc group would fall back to the neutral grey.
      for (const group of DEFAULT_GROUPS) {
        database.run(
          'INSERT OR IGNORE INTO contact_group (name, color, sort_order) VALUES (?, ?, ?)',
          [group.name, group.color, group.sortOrder],
        );
      }

      let count = 0;
      for (const entry of SEED_CONTACTS) {
        let group = findGroupByName(database, entry.group);
        if (!group) {
          group = insertGroup(database, entry.group);
        }

        const contactId = insertContact(database, {
          name: entry.name,
          groupId: group.id,
          company: entry.company || '',
          title: entry.title || '',
          note: entry.note || '',
          avatarColor: pickAvatarColor(entry.name),
          isBookmarked: entry.bookmarked,
          bookmarkedAt: entry.bookmarked ? entry.bookmarkedAt : null,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });

        insertMethods(
          database,
          contactId,
          entry.methods.map(([type, value, label], index) => ({
            type,
            value,
            label: label || '',
            isPrimary: index === 0,
          })),
        );
        count += 1;
      }
      return count;
    });

    const statistics = database.get(
      'SELECT COUNT(*) AS contacts, COALESCE(SUM(is_bookmarked), 0) AS bookmarks FROM contact',
    );
    return {
      inserted,
      skipped: false,
      contacts: Number(statistics.contacts),
      bookmarks: Number(statistics.bookmarks),
      database: config.databasePath,
    };
  } finally {
    database.close();
  }
}

const reset = process.argv.includes('--reset');
const result = seed({ reset });
if (result.skipped) {
  process.stdout.write(
    `The address book already contains ${result.existing} contacts; run "npm run seed:reset" to replace them.\n`,
  );
} else {
  process.stdout.write(
    `Inserted ${result.inserted} demo contacts (${result.bookmarks} bookmarked) into ${result.database}\n`,
  );
}
