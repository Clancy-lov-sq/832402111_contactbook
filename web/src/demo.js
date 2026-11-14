import {
  book,
  cancelConfirm,
  clearFilters,
  closeDetail,
  closeForm,
  exportWorkbook,
  loadContacts,
  openCreateForm,
  openDetail,
  openImportDialog,
  setKeyword,
  showAll,
  showBookmarks,
  showGroup,
  toggleBookmark,
} from './store/contactBook';
import { toasts } from './ui/toast';

/**
 * Automation hooks for the end-to-end capture script.
 *
 * The capture script drives the real application through the browser debugger
 * protocol; these functions are the small, explicit surface it uses instead of
 * reaching into component internals. They are also convenient from the browser
 * console while manually testing the page.
 */

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

/** Evaluates an expression string against the page globals. */
function evaluate(expression) {
  // eslint-disable-next-line no-eval
  return (0, eval)(expression);
}

/**
 * Waits until a JavaScript expression is true.
 * @param {string} expression
 * @param {number} [timeout]
 * @returns {Promise<boolean>}
 */
async function waitFor(expression, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    let value = false;
    try {
      value = Boolean(evaluate(expression));
    } catch (error) {
      value = false;
    }
    if (value) {
      return true;
    }
    await sleep(90);
  }
  throw new Error(`waitFor timeout: ${expression}`);
}

/** Waits until no request is in flight. */
function waitIdle(timeout = 8000) {
  return waitFor('!window.__contactbook.loading && !window.__contactbook.detailLoading', timeout);
}

/** @param {string} selector */
function click(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`No element matches ${selector}`);
  }
  element.click();
  return true;
}

/**
 * Clicks the first element whose visible text contains `text`.
 * @param {string} text
 * @param {string} [selector]
 */
function clickText(text, selector = 'button, a, label') {
  const candidates = Array.from(document.querySelectorAll(selector));
  const element = candidates.find((candidate) => candidate.textContent.trim().includes(text));
  if (!element) {
    throw new Error(`No element with text "${text}"`);
  }
  element.click();
  return true;
}

/**
 * Sets an input value the way a user would, so Vue's v-model reacts.
 * @param {string} selector
 * @param {string} value
 */
function type(selector, value) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`No element matches ${selector}`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  );
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value;
}

/** @param {string} selector @param {string} value */
function select(selector, value) {
  return type(selector, value);
}

/** @returns {object} a plain snapshot of the visible state */
function state() {
  return {
    ready: book.ready,
    loading: book.loading,
    total: book.total,
    page: book.page,
    pageSize: book.pageSize,
    totalPages: book.totalPages,
    filters: { ...book.filters },
    stats: {
      total: book.stats.total,
      bookmarked: book.stats.bookmarked,
      methodCount: book.stats.methodCount,
      groups: book.stats.groups.map((group) => ({ id: group.id, name: group.name, count: group.contactCount })),
    },
    items: book.items.map((contact) => ({
      id: contact.id,
      name: contact.name,
      isBookmarked: contact.isBookmarked,
      methods: contact.methods.length,
    })),
    detail: book.detail
      ? { id: book.detail.id, name: book.detail.name, methods: book.detail.methods.length }
      : null,
    formOpen: book.form.open,
    importOpen: book.importDialog.open,
    confirmOpen: book.confirm.open,
    toasts: toasts.map((toast) => `${toast.tone}:${toast.title}`),
  };
}

/** Installs `window.__demo` and the `window.__contactbook` state handle. */
export function installDemoHooks() {
  if (typeof window === 'undefined') {
    return;
  }

  window.__contactbook = book;
  window.__demo = {
    state,
    waitFor,
    waitIdle,
    click,
    clickText,
    type,
    select,
    search: (keyword) => {
      // A search is global: it leaves the bookmark view and the group filter, so
      // the result does not depend on the view the user happened to be in.
      book.filters.bookmarked = false;
      book.filters.groupId = 'all';
      book.filters.keyword = keyword;
      book.page = 1;
      setKeyword(keyword);
    },
    showAll,
    showBookmarks,
    showGroup,
    openCreateForm,
    openImportDialog,
    openDetail,
    closeForm,
    closeDetail,
    cancelConfirm,
    clearFilters,
    reload: () => loadContacts(),
    toggleBookmark: (contact) => toggleBookmark(contact),
    exportFiltered: () => exportWorkbook('filtered'),
    toastCount: () => toasts.length,
  };
}
