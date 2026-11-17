/**
 * Presentation helpers of the contact method types.
 *
 * The labels come from the backend catalogue, but the icons and the colours are a
 * front-end concern: keeping them here means a new type has exactly one place to
 * be styled.
 */

/** Icon name, label and accent colour of every method type. */
export const METHOD_STYLE = Object.freeze({
  phone: { label: 'Phone', icon: 'phone', color: '#2563eb', tint: 'rgba(37, 99, 235, 0.1)' },
  email: { label: 'Email', icon: 'mail', color: '#0891b2', tint: 'rgba(8, 145, 178, 0.1)' },
  wechat: { label: 'WeChat', icon: 'chat', color: '#16a34a', tint: 'rgba(22, 163, 74, 0.12)' },
  qq: { label: 'QQ', icon: 'penguin', color: '#0284c7', tint: 'rgba(2, 132, 199, 0.1)' },
  website: { label: 'Website', icon: 'globe', color: '#7c3aed', tint: 'rgba(124, 58, 237, 0.1)' },
  address: { label: 'Address', icon: 'pin', color: '#ea580c', tint: 'rgba(234, 88, 12, 0.1)' },
  other: { label: 'Other', icon: 'sparkles', color: '#64748b', tint: 'rgba(100, 116, 139, 0.12)' },
});

/**
 * @param {string} type
 * @returns {{icon: string, color: string, tint: string}}
 */
export function methodStyle(type) {
  return METHOD_STYLE[type] || METHOD_STYLE.other;
}

/**
 * @param {Array<object>} methods
 * @returns {object|null} the primary method, or the first one
 */
export function primaryMethod(methods = []) {
  return methods.find((method) => method.isPrimary) || methods[0] || null;
}

/**
 * The text a copied/linked value should use.
 *
 * @param {object} method
 * @returns {string}
 */
export function methodLink(method) {
  if (!method) {
    return '';
  }
  if (method.type === 'phone') {
    return `tel:${method.value.replace(/[^\d+]/g, '')}`;
  }
  if (method.type === 'email') {
    return `mailto:${method.value}`;
  }
  if (method.type === 'website') {
    return /^https?:\/\//i.test(method.value) ? method.value : `https://${method.value}`;
  }
  return '';
}

/**
 * Two-character initials of a Chinese or Latin name.
 * @param {string} name
 * @returns {string}
 */
export function initials(name = '') {
  const text = name.trim();
  if (text === '') {
    return '?';
  }
  if (/[\u4e00-\u9fa5]/.test(text[0])) {
    return text.slice(-2);
  }
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/**
 * Formats a stored timestamp for display.
 *
 * @param {string|null} value `YYYY-MM-DD HH:MM:SS`
 * @param {boolean} [withYear]
 * @returns {string}
 */
export function formatDateTime(value, withYear = false) {
  if (!value) {
    return '—';
  }
  const [date, time] = String(value).split(' ');
  if (!withYear && date) {
    return `${date.slice(5)} ${String(time || '').slice(0, 5)}`.trim();
  }
  return `${date} ${String(time || '').slice(0, 5)}`.trim();
}

/**
 * A relative description of a timestamp ("Today 09:20", "3 days ago", ...).
 *
 * @param {string|null} value
 * @returns {string}
 */
export function relativeTime(value) {
  if (!value) {
    return '—';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value));
  if (!match) {
    return value;
  }
  const then = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const dayDifference = Math.round((startOfToday - startOfThen) / 86400000);

  if (dayDifference === 0) {
    return `Today ${match[4]}:${match[5]}`;
  }
  if (dayDifference === 1) {
    return `Yesterday ${match[4]}:${match[5]}`;
  }
  if (dayDifference > 1 && dayDifference < 30) {
    return `${dayDifference} days ago`;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}
