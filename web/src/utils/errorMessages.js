/**
 * Chinese texts for the error codes of the backend.
 *
 * The API answers stable, machine readable codes; the interface is Chinese, so the
 * code is translated here instead of turning the API contract into a localised one.
 * An unknown code falls back to the message the server sent, which keeps a new
 * backend error visible instead of hidden.
 */

const CODE_MESSAGES = Object.freeze({
  NETWORK_UNREACHABLE: '无法连接后端服务，请确认服务已经启动',
  INVALID_RESPONSE: '后端返回了无法解析的响应',
  VALIDATION_INVALID_PARAMETER: '请求参数不合法',
  VALIDATION_INVALID_FIELD: '输入内容不符合要求，请检查表单',
  VALIDATION_CONTACT_NAME_REQUIRED: '请填写联系人姓名',
  VALIDATION_CONTACT_NAME_TOO_LONG: '姓名最多 40 个字符',
  VALIDATION_GROUP_UNKNOWN: '所选分组不存在',
  VALIDATION_METHOD_TYPE_UNKNOWN: '不支持这种联系方式类型',
  VALIDATION_METHOD_VALUE_REQUIRED: '请填写联系方式',
  VALIDATION_METHOD_INVALID_VALUE: '联系方式的格式不正确',
  VALIDATION_DUPLICATE_METHOD: '同一联系方式不能重复添加',
  VALIDATION_TOO_MANY_METHODS: '一位联系人最多 10 条联系方式',
  VALIDATION_INVALID_BOOKMARK: '收藏状态不合法',
  CONTACT_NOT_FOUND: '联系人不存在或已被删除',
  IMPORT_FILE_REQUIRED: '请选择要导入的文件',
  IMPORT_FILE_UNSUPPORTED: '只支持 .xlsx 格式的 Excel 文件',
  IMPORT_FILE_TOO_LARGE: '文件超过 5 MB，请拆分后再导入',
  IMPORT_WORKBOOK_EMPTY: '表格中没有可导入的数据',
  IMPORT_HEADER_MISSING: '表格缺少“姓名”列，无法导入',
  IMPORT_TOO_MANY_ROWS: '单次最多导入 2000 行',
  IMPORT_NO_VALID_ROW: '表格中没有一条可以导入的记录',
  IMPORT_FAILED: '文件无法解析，请确认它是有效的 .xlsx 工作簿',
  EXPORT_FAILED: '导出失败，请稍后再试',
  STORAGE_FAILURE: '数据库暂时不可用',
  ROUTE_NOT_FOUND: '接口不存在',
  INTERNAL_ERROR: '服务器处理失败，请稍后再试',
});

/** Field names used by the backend, translated for the form. */
const FIELD_LABELS = Object.freeze({
  name: '姓名',
  groupId: '分组',
  group: '分组',
  company: '公司',
  title: '职位',
  note: '备注',
  isBookmarked: '收藏',
  methods: '联系方式',
});

/**
 * Returns the Chinese explanation of a failed request.
 *
 * @param {Error & {code?: string, message?: string}} error
 * @returns {string}
 */
export function errorText(error) {
  if (!error) {
    return '未知错误';
  }
  return CODE_MESSAGES[error.code] || error.message || '请求失败';
}

/** @param {string} field @returns {string} */
export function fieldLabel(field) {
  if (!field) {
    return '';
  }
  const match = /^methods\[(\d+)\]\.(.+)$/.exec(field);
  if (match) {
    return `第 ${Number(match[1]) + 1} 条联系方式`;
  }
  return FIELD_LABELS[field] || field;
}
