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
    name: 'Robert Lin',
    group: 'Family',
    company: 'Fuzhou Radio Factory',
    title: 'Retired engineer',
    note: 'Father. Best reached on weekend mornings; likes to follow the news.',
    bookmarked: true,
    createdAt: '2026-10-20 09:12:00',
    updatedAt: '2026-11-14 20:05:00',
    bookmarkedAt: '2026-10-20 09:13:00',
    methods: [
      ['phone', '138 0591 2233', 'Mobile'],
      ['phone', '0591 8336 1188', 'Home'],
      ['wechat', 'robert_lin58', 'WeChat'],
      ['address', 'Room 502, Building 3, No. 128 Wusi Road, Gulou District, Fuzhou', 'Home'],
    ],
  },
  {
    name: 'Susan Lin',
    group: 'Family',
    company: '',
    title: '',
    note: 'Mother. At the senior college on Wednesdays and Saturdays; home after 7 pm.',
    bookmarked: true,
    createdAt: '2026-10-20 09:16:00',
    updatedAt: '2026-11-12 18:40:00',
    bookmarkedAt: '2026-10-20 09:17:00',
    methods: [
      ['phone', '139 0591 7788', 'Mobile'],
      ['wechat', 'susan_lin', 'WeChat'],
    ],
  },
  {
    name: 'Sophie Su',
    group: 'Friends',
    company: 'Muyan Studio',
    title: 'Visual designer',
    note: 'College roommate. Into pour-over coffee; contact her for design work.',
    bookmarked: true,
    createdAt: '2026-10-21 14:02:00',
    updatedAt: '2026-11-15 10:20:00',
    bookmarkedAt: '2026-10-25 21:30:00',
    methods: [
      ['phone', '137 1234 5678', 'Mobile'],
      ['email', 'sophie.su@example.com', 'Work'],
      ['wechat', 'sophie_su', 'WeChat'],
      ['qq', '44556677', 'QQ'],
    ],
  },
  {
    name: 'Marco Zhou',
    group: 'Friends',
    company: 'Freelance',
    title: 'Photographer',
    note: 'Shoots graduation portraits; portfolio on his website.',
    bookmarked: false,
    createdAt: '2026-10-22 19:45:00',
    updatedAt: '2026-11-08 15:12:00',
    methods: [
      ['phone', '136 8888 1234', 'Mobile'],
      ['email', 'marco.zhou@example.com', 'Work'],
      ['website', 'https://marcozhou.example.com', 'Portfolio'],
    ],
  },
  {
    name: 'Leo Gao',
    group: 'Friends',
    company: 'City Marathon Club',
    title: 'Run leader',
    note: 'Sunday morning runs at West Lake Park, pace 5:30.',
    bookmarked: false,
    createdAt: '2026-10-23 07:30:00',
    updatedAt: '2026-11-11 07:55:00',
    methods: [
      ['phone', '135 1111 2222', 'Mobile'],
      ['wechat', 'leo_gao_run', 'WeChat'],
    ],
  },
  {
    name: 'Iris Xu',
    group: 'Friends',
    company: 'Zhixia Culture',
    title: 'Editor',
    note: 'Book review editor; send pitches by email first.',
    bookmarked: false,
    createdAt: '2026-10-24 11:10:00',
    updatedAt: '2026-11-06 16:30:00',
    methods: [
      ['phone', '158 6666 7777', 'Mobile'],
      ['email', 'iris.xu@example.com', 'Pitches'],
      ['address', '12F, No. 8 Hengshan Road, Xuhui District, Shanghai', 'Office'],
    ],
  },
  {
    name: 'Henry Wang',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'Backend lead',
    note: 'Owns the API work; syncs progress at the Wednesday stand-up.',
    bookmarked: true,
    createdAt: '2026-10-25 10:00:00',
    updatedAt: '2026-11-15 09:05:00',
    bookmarkedAt: '2026-11-01 09:20:00',
    methods: [
      ['phone', '186 0000 1111', 'Work mobile'],
      ['email', 'henry.wang@yuntu.example.com', 'Work email'],
      ['wechat', 'henry_wang_work', 'WeCom'],
      ['qq', '123456789', 'QQ'],
    ],
  },
  {
    name: 'Eric Li',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'Frontend engineer',
    note: 'Owns the page interactions; co-authored the coding standard.',
    bookmarked: false,
    createdAt: '2026-10-25 10:05:00',
    updatedAt: '2026-11-10 20:15:00',
    methods: [
      ['phone', '188 2222 3333', 'Work mobile'],
      ['email', 'eric.li@yuntu.example.com', 'Work email'],
    ],
  },
  {
    name: 'Amanda Zhao',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'HR partner',
    note: 'Internship certificates and attendance questions go to her.',
    bookmarked: false,
    createdAt: '2026-10-26 09:40:00',
    updatedAt: '2026-11-03 14:22:00',
    methods: [
      ['phone', '135 4444 5555', 'Work mobile'],
      ['email', 'amanda.zhao@yuntu.example.com', 'Work email'],
      ['wechat', 'amanda_hr', 'WeCom'],
    ],
  },
  {
    name: 'Grace Sun',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'QA engineer',
    note: 'Send the self-test checklist before requesting a test round.',
    bookmarked: false,
    createdAt: '2026-10-27 13:25:00',
    updatedAt: '2026-11-13 11:48:00',
    methods: [
      ['phone', '136 5555 6666', 'Work mobile'],
      ['qq', '87654321', 'QQ'],
    ],
  },
  {
    name: 'Victor Zheng',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'DevOps engineer',
    note: 'Deployments, domains and certificates.',
    bookmarked: false,
    createdAt: '2026-10-28 08:15:00',
    updatedAt: '2026-11-14 22:10:00',
    methods: [
      ['phone', '159 7777 8888', 'Work mobile'],
      ['email', 'victor.zheng@yuntu.example.com', 'Work email'],
      ['address', 'Room 903, Building 6, South Science Park, Nanshan District, Shenzhen', 'On-call room'],
    ],
  },
  {
    name: 'Yuki He',
    group: 'Colleagues',
    company: 'Yuntu Software',
    title: 'Product manager',
    note: 'Review notes live in her shared document.',
    bookmarked: false,
    createdAt: '2026-10-29 15:00:00',
    updatedAt: '2026-11-09 17:35:00',
    methods: [
      ['phone', '137 9999 0000', 'Work mobile'],
      ['wechat', 'yuki_he_pm', 'WeCom'],
    ],
  },
  {
    name: 'William Jiang',
    group: 'Clients',
    company: 'Boyuan Technology',
    title: 'Procurement director',
    note: 'Key account. Quotes go through the company mailbox; send holiday greetings.',
    bookmarked: true,
    createdAt: '2026-10-30 10:20:00',
    updatedAt: '2026-11-15 11:30:00',
    bookmarkedAt: '2026-11-05 10:00:00',
    methods: [
      ['phone', '139 1234 8888', 'Business'],
      ['phone', '0591 8822 6600', 'Reception ext. 802'],
      ['email', 'william.jiang@boyuan.example.com', 'Business email'],
      ['wechat', 'william_jiang_boyuan', 'WeChat'],
    ],
  },
  {
    name: 'Ethan Shen',
    group: 'Clients',
    company: 'Yunzhou Data',
    title: 'CTO',
    note: 'Technical contact; cares about API performance and data security.',
    bookmarked: true,
    createdAt: '2026-11-01 09:00:00',
    updatedAt: '2026-11-14 16:45:00',
    bookmarkedAt: '2026-11-02 09:10:00',
    methods: [
      ['phone', '138 7777 1234', 'Business'],
      ['email', 'ethan.shen@yunzhou.example.com', 'Technical'],
      ['website', 'https://yunzhou.example.com', 'Company site'],
    ],
  },
  {
    name: 'Diana Deng',
    group: 'Clients',
    company: 'Yaqin Creative',
    title: 'Founder',
    note: 'Small-batch custom work; prefers WeChat.',
    bookmarked: false,
    createdAt: '2026-11-02 14:10:00',
    updatedAt: '2026-11-07 10:05:00',
    methods: [
      ['phone', '136 1234 9999', 'Mobile'],
      ['wechat', 'diana_deng', 'WeChat'],
    ],
  },
  {
    name: 'Max Ma',
    group: 'Clients',
    company: 'Chiyuan Logistics',
    title: 'Operations manager',
    note: 'Monthly reconciliation; needs the invoice details.',
    bookmarked: false,
    createdAt: '2026-11-03 11:20:00',
    updatedAt: '2026-11-12 15:40:00',
    methods: [
      ['phone', '187 5555 4444', 'Mobile'],
      ['email', 'max.ma@chiyuan.example.com', 'Billing'],
    ],
  },
  {
    name: 'Rachel Luo',
    group: 'Clients',
    company: 'Shiyu Consulting',
    title: 'Partner',
    note: 'Drafts the contract; mind the version number.',
    bookmarked: false,
    createdAt: '2026-11-04 16:00:00',
    updatedAt: '2026-11-05 09:25:00',
    methods: [
      ['phone', '135 6666 3333', 'Mobile'],
      ['qq', '556677889', 'QQ'],
    ],
  },
  {
    name: 'Tina Tang',
    group: 'Others',
    company: 'Fuzhou University Community',
    title: 'Volunteer coordinator',
    note: 'Sign-up contact for community volunteering.',
    bookmarked: false,
    createdAt: '2026-11-05 09:30:00',
    updatedAt: '2026-11-08 10:10:00',
    methods: [
      ['phone', '188 9999 1111', 'Mobile'],
      ['wechat', 'tina_tang', 'WeChat'],
    ],
  },
  {
    name: 'Landlady Liu',
    group: 'Others',
    company: '',
    title: 'Landlord',
    note: 'Rent due on the 5th; utilities are read from the meters.',
    bookmarked: true,
    createdAt: '2026-11-06 08:45:00',
    updatedAt: '2026-11-06 08:46:00',
    bookmarkedAt: '2026-11-06 08:46:00',
    methods: [
      ['phone', '137 0591 5566', 'Mobile'],
      ['wechat', 'landlady_liu', 'WeChat'],
      ['address', 'Room 601, Building 1, No. 22 Jiaotong Road, Taijiang District, Fuzhou', 'Rental'],
    ],
  },
  {
    name: 'Parcel Locker',
    group: 'Others',
    company: 'Cainiao Station (Fuzhou University)',
    title: 'Parcel pickup',
    note: 'Pickup codes arrive by text message; closes at 9 pm.',
    bookmarked: false,
    createdAt: '2026-11-07 19:15:00',
    updatedAt: '2026-11-07 19:15:00',
    methods: [
      ['phone', '0591 8888 6666', 'Station phone'],
      ['address', 'East Gate, Fuzhou University Living Area, No. 2 Xueyuan Road, Minhou County, Fuzhou', 'Pickup point'],
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
