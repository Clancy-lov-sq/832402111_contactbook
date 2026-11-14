/**
 * Client side validation of the contact form.
 *
 * The rules mirror the backend on purpose: the form can reject an obviously wrong
 * value before a request is sent, while the backend stays the authority and its
 * field errors are still displayed when a rule differs.
 */

/** @param {string} type @param {string} value @returns {boolean} */
export function isValidMethodValue(type, value) {
  switch (type) {
    case 'phone':
      return /^\+?[0-9][0-9\s\-().]{4,24}$/.test(value) && (value.match(/\d/g) || []).length >= 6;
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    case 'qq':
      return /^\d{5,12}$/.test(value);
    case 'website':
      return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i.test(value);
    case 'wechat':
      return /^[A-Za-z0-9][A-Za-z0-9_\-.]{1,39}$/.test(value);
    default:
      return value.length > 0;
  }
}

/** A short example of a valid value, shown as the input placeholder. */
export const METHOD_PLACEHOLDER = Object.freeze({
  phone: '138 0000 0000',
  email: 'name@example.com',
  wechat: 'wechat_id',
  qq: '10001',
  website: 'https://example.com',
  address: '福建省福州市……',
  other: '自定义联系方式',
});

/** A hint shown under the form when a value is rejected. */
export const METHOD_HINT = Object.freeze({
  phone: '至少 6 位数字，可带空格、括号与 +86',
  email: '需要包含 @ 和域名，例如 name@example.com',
  wechat: '2–40 位字母、数字、下划线或短横线',
  qq: '5–12 位数字',
  website: '以 http(s):// 开头，或直接写域名',
  address: '详细地址，最多 120 个字符',
  other: '任意联系方式，最多 120 个字符',
});
