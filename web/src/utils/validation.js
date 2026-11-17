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
  address: '221B Baker Street, London',
  other: 'Custom contact method',
});

/** A hint shown under the form when a value is rejected. */
export const METHOD_HINT = Object.freeze({
  phone: 'At least 6 digits; spaces, brackets and +86 are allowed',
  email: 'Must contain @ and a domain, e.g. name@example.com',
  wechat: '2–40 letters, digits, underscores or dashes',
  qq: '5–12 digits',
  website: 'Start with http(s):// or write a bare domain',
  address: 'A detailed address, at most 120 characters',
  other: 'Any contact method, at most 120 characters',
});
