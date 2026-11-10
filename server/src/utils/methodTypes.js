'use strict';

/**
 * The catalogue of contact method types.
 *
 * One list drives the database check constraint, the API validation, the Excel
 * column layout and the front-end labels, so a new type is added in one place.
 * Each entry describes how a value of that type is stored, displayed, validated
 * and exported.
 */

/** Method types in display order. */
const METHOD_TYPES = Object.freeze([
  Object.freeze({
    type: 'phone',
    label: '电话',
    labelEn: 'Phone',
    excelPrefix: '电话',
    placeholder: '138 0000 0000',
    minSlots: 2,
    validator: 'phone',
  }),
  Object.freeze({
    type: 'email',
    label: '邮箱',
    labelEn: 'Email',
    excelPrefix: '邮箱',
    placeholder: 'name@example.com',
    minSlots: 2,
    validator: 'email',
  }),
  Object.freeze({
    type: 'wechat',
    label: '微信',
    labelEn: 'WeChat',
    excelPrefix: '微信',
    placeholder: 'wechat_id',
    minSlots: 1,
    validator: 'handle',
  }),
  Object.freeze({
    type: 'qq',
    label: 'QQ',
    labelEn: 'QQ',
    excelPrefix: 'QQ',
    placeholder: '10001',
    minSlots: 1,
    validator: 'qq',
  }),
  Object.freeze({
    type: 'website',
    label: '网址',
    labelEn: 'Website',
    excelPrefix: '网址',
    placeholder: 'https://example.com',
    minSlots: 1,
    validator: 'website',
  }),
  Object.freeze({
    type: 'address',
    label: '地址',
    labelEn: 'Address',
    excelPrefix: '地址',
    placeholder: '福建省福州市…',
    minSlots: 1,
    validator: 'text',
  }),
  Object.freeze({
    type: 'other',
    label: '其他',
    labelEn: 'Other',
    excelPrefix: '其他',
    placeholder: '自定义联系方式',
    minSlots: 1,
    validator: 'text',
  }),
]);

/** Type names in the order above, used by the database constraint. */
const METHOD_TYPE_NAMES = Object.freeze(METHOD_TYPES.map((entry) => entry.type));

/** @type {Map<string, object>} type -> definition */
const METHOD_TYPE_MAP = new Map(METHOD_TYPES.map((entry) => [entry.type, entry]));

/** @type {Map<string, object>} excel prefix (lower case) -> definition */
const METHOD_PREFIX_MAP = new Map(
  METHOD_TYPES.map((entry) => [entry.excelPrefix.toLowerCase(), entry]),
);

/** @param {string} type @returns {object|undefined} */
function findMethodType(type) {
  return METHOD_TYPE_MAP.get(type);
}

/** @returns {string} the SQL `IN (...)` fragment of the accepted method types */
function methodTypeSqlList() {
  return METHOD_TYPE_NAMES.map((type) => `'${type}'`).join(', ');
}

module.exports = {
  METHOD_TYPES,
  METHOD_TYPE_NAMES,
  METHOD_TYPE_MAP,
  METHOD_PREFIX_MAP,
  findMethodType,
  methodTypeSqlList,
};
