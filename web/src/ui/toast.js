import { reactive } from 'vue';

/**
 * A tiny toast queue.
 *
 * The store is module level so any component can raise a message without prop
 * drilling; `ToastHost` is the only consumer that renders the queue.
 */

let nextId = 1;

/** @type {Array<{id: number, title: string, message: string, tone: string}>} */
export const toasts = reactive([]);

/**
 * Shows one toast for a few seconds.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {'default'|'success'|'error'|'info'} [options.tone]
 * @param {number} [options.duration] 0 keeps it until it is dismissed
 * @returns {number} the toast id
 */
export function pushToast(options) {
  const id = nextId;
  nextId += 1;
  toasts.push({
    id,
    title: options.title,
    message: options.message || '',
    tone: options.tone || 'default',
  });
  if (options.duration !== 0) {
    setTimeout(() => dismissToast(id), options.duration || 3600);
  }
  return id;
}

/** @param {number} id */
export function dismissToast(id) {
  const index = toasts.findIndex((toast) => toast.id === id);
  if (index >= 0) {
    toasts.splice(index, 1);
  }
}
