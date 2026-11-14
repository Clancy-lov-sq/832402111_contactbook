import { computed, reactive } from 'vue';

import { api, saveBlob } from '../api/client';
import { pushToast } from '../ui/toast';
import { errorText } from '../utils/errorMessages';

/**
 * The single state container of the address book.
 *
 * One reactive store keeps the listing, the filters, the statistics and the
 * dialogs consistent: every action refreshes through the same `loadContacts`,
 * so the number in the sidebar can never disagree with the cards on screen.
 */

/** @type {object} */
export const book = reactive({
  ready: false,
  loading: false,
  error: '',

  /** Listing. */
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 1,

  /** Metadata and dashboard numbers. */
  methodTypes: [],
  sortOptions: [],
  pageSizes: [12, 24, 48, 96],
  limits: {},
  stats: {
    total: 0,
    bookmarked: 0,
    methodCount: 0,
    updatedLastWeek: 0,
    groups: [],
    methodsByType: [],
  },

  /** Filters. `groupId` is `'all'`, a number, or `0` for "no group". */
  filters: {
    keyword: '',
    groupId: 'all',
    bookmarked: false,
    sort: 'updated',
  },

  /** Detail drawer. */
  detail: null,
  detailLoading: false,

  /** Create / edit dialog. */
  form: {
    open: false,
    contact: null,
    saving: false,
    serverFields: [],
  },

  /** Import dialog. */
  importDialog: {
    open: false,
    file: null,
    mode: 'skip',
    busy: false,
    report: null,
    error: '',
  },

  /** Confirmation dialog. */
  confirm: {
    open: false,
    title: '',
    message: '',
    confirmLabel: '确定',
    tone: 'danger',
    busy: false,
    action: null,
  },

  /** Export menu. */
  exportMenuOpen: false,
  exporting: false,
});

/** The title of the current view. */
export const viewTitle = computed(() => {
  if (book.filters.bookmarked) {
    return '我的收藏';
  }
  if (book.filters.groupId === 'all') {
    return '全部联系人';
  }
  const group = book.stats.groups.find((item) => item.id === book.filters.groupId);
  return group ? group.name : '未分组';
});

/** A sentence that describes what is currently listed. */
export const viewSubtitle = computed(() => {
  if (book.filters.keyword) {
    return `搜索“${book.filters.keyword}”的结果`;
  }
  if (book.filters.bookmarked) {
    return '星标过的联系人，随时快速拨号';
  }
  if (book.filters.groupId === 'all') {
    return `共 ${book.stats.total} 位联系人，${book.stats.methodCount} 条联系方式`;
  }
  return `该分组共有 ${book.total} 位联系人`;
});

/** Whether any filter differs from the default view. */
export const hasFilters = computed(
  () => book.filters.keyword !== ''
    || book.filters.groupId !== 'all'
    || book.filters.bookmarked,
);

/** The query the backend understands for the current view. */
function currentQuery() {
  return {
    keyword: book.filters.keyword,
    groupId: book.filters.groupId === 'all' ? undefined : book.filters.groupId,
    bookmarked: book.filters.bookmarked ? 'true' : '',
    sort: book.filters.sort,
    page: book.page,
    pageSize: book.pageSize,
  };
}

/**
 * Loads the page described by the current filters.
 * @returns {Promise<void>}
 */
export async function loadContacts() {
  book.loading = true;
  try {
    const result = await api.list(currentQuery());
    book.items = result.items;
    book.total = result.total;
    book.page = result.page;
    book.pageSize = result.pageSize;
    book.totalPages = result.totalPages;
    book.stats = result.stats;
    book.error = '';
  } catch (error) {
    book.error = errorText(error);
    pushToast({ tone: 'error', title: '加载失败', message: errorText(error) });
  } finally {
    book.loading = false;
  }
}

/** Loads the metadata and the first page. */
export async function initBook() {
  try {
    const meta = await api.meta();
    book.methodTypes = meta.methodTypes;
    book.sortOptions = meta.sortOptions;
    book.pageSizes = meta.pageSizes;
    book.limits = meta.limits;
    book.stats = meta.stats;
    await loadContacts();
    book.ready = true;
  } catch (error) {
    book.error = errorText(error);
    book.ready = true;
    pushToast({ tone: 'error', title: '无法加载通讯录', message: errorText(error) });
  }
}

/* ------------------------------------------------------------------------- */
/* Filters and pagination                                                     */
/* ------------------------------------------------------------------------- */

let searchTimer = null;

/**
 * Applies a keyword after a short pause, so typing does not flood the API.
 * @param {string} keyword
 */
export function setKeyword(keyword) {
  book.filters.keyword = keyword;
  book.page = 1;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchTimer = null;
    loadContacts();
  }, 260);
}

/** Jumps to a page. @param {number} page */
export function setPage(page) {
  if (page < 1 || page > book.totalPages || page === book.page) {
    return;
  }
  book.page = page;
  loadContacts();
}

/** @param {number} pageSize */
export function setPageSize(pageSize) {
  book.pageSize = pageSize;
  book.page = 1;
  loadContacts();
}

/** @param {string} sort */
export function setSort(sort) {
  book.filters.sort = sort;
  book.page = 1;
  loadContacts();
}

/** Shows every contact. */
export function showAll() {
  book.filters.groupId = 'all';
  book.filters.bookmarked = false;
  book.page = 1;
  loadContacts();
}

/** Shows the bookmarked contacts. */
export function showBookmarks() {
  book.filters.bookmarked = true;
  book.filters.groupId = 'all';
  book.page = 1;
  loadContacts();
}

/** @param {number|string} groupId */
export function showGroup(groupId) {
  book.filters.groupId = groupId;
  book.filters.bookmarked = false;
  book.page = 1;
  loadContacts();
}

/** Clears the keyword and every filter. */
export function clearFilters() {
  book.filters.keyword = '';
  book.filters.groupId = 'all';
  book.filters.bookmarked = false;
  book.filters.sort = 'updated';
  book.page = 1;
  loadContacts();
}

/* ------------------------------------------------------------------------- */
/* Bookmarks                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Stars or un-stars one contact.
 *
 * The card is updated before the request finishes, so the star reacts
 * immediately; a failure restores the previous value.
 *
 * @param {object} contact
 * @returns {Promise<void>}
 */
export async function toggleBookmark(contact) {
  const previous = contact.isBookmarked;
  const next = !previous;
  contact.isBookmarked = next;

  try {
    const result = await api.bookmark(contact.id, next);
    Object.assign(contact, result.contact);
    book.stats = result.stats;
    if (book.detail && book.detail.id === contact.id) {
      book.detail.isBookmarked = result.contact.isBookmarked;
      book.detail.bookmarkedAt = result.contact.bookmarkedAt;
    }
    pushToast({
      tone: next ? 'success' : 'default',
      title: next ? '已加入收藏' : '已取消收藏',
      message: contact.name,
    });
    if (book.filters.bookmarked) {
      await loadContacts();
    }
  } catch (error) {
    contact.isBookmarked = previous;
    pushToast({ tone: 'error', title: '收藏失败', message: errorText(error) });
  }
}

/* ------------------------------------------------------------------------- */
/* Detail drawer                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Opens the drawer and reloads the contact with its methods.
 * @param {number|string} id
 */
export async function openDetail(id) {
  book.detailLoading = true;
  book.detail = book.items.find((contact) => contact.id === Number(id)) || null;
  try {
    const result = await api.get(id);
    book.detail = result.contact;
  } catch (error) {
    pushToast({ tone: 'error', title: '无法打开联系人', message: errorText(error) });
  } finally {
    book.detailLoading = false;
  }
}

/** Closes the detail drawer. */
export function closeDetail() {
  book.detail = null;
}

/* ------------------------------------------------------------------------- */
/* Create / edit                                                              */
/* ------------------------------------------------------------------------- */

/** Opens the dialog for a new contact. */
export function openCreateForm() {
  book.form = { open: true, contact: null, saving: false, serverFields: [] };
}

/**
 * Opens the dialog for an existing contact.
 * @param {object} contact
 */
export function openEditForm(contact) {
  book.form = { open: true, contact, saving: false, serverFields: [] };
  book.detail = null;
}

/** Closes the form dialog. */
export function closeForm() {
  book.form.open = false;
  book.form.saving = false;
  book.form.serverFields = [];
}

/**
 * Saves one contact (create or update).
 *
 * Server side field errors are kept on the form so the dialog can mark the exact
 * input that failed instead of only showing a toast.
 *
 * @param {object} payload
 * @returns {Promise<boolean>} whether the contact was saved
 */
export async function saveContact(payload) {
  book.form.saving = true;
  book.form.serverFields = [];
  try {
    if (book.form.contact) {
      await api.update(book.form.contact.id, payload);
      pushToast({ tone: 'success', title: '联系人已更新', message: payload.name });
    } else {
      await api.create(payload);
      pushToast({ tone: 'success', title: '联系人已添加', message: payload.name });
    }
    book.form.open = false;
    book.form.saving = false;
    await loadContacts();
    return true;
  } catch (error) {
    book.form.saving = false;
    book.form.serverFields = error.fields || [];
    const firstProblem = error.fields && error.fields[0]
      ? errorText({ code: error.fields[0].code, message: error.fields[0].message })
      : errorText(error);
    pushToast({ tone: 'error', title: '保存失败', message: firstProblem });
    return false;
  }
}

/* ------------------------------------------------------------------------- */
/* Delete                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Asks before deleting one contact.
 * @param {object} contact
 */
export function askDelete(contact) {
  book.confirm = {
    open: true,
    title: '删除联系人',
    message: `确定要删除「${contact.name}」吗？该联系人的所有联系方式会一起删除，操作不可撤销。`,
    confirmLabel: '删除',
    tone: 'danger',
    busy: false,
    action: async () => {
      await api.remove(contact.id);
      if (book.detail && book.detail.id === contact.id) {
        book.detail = null;
      }
      await loadContacts();
      pushToast({ tone: 'success', title: '联系人已删除', message: contact.name });
    },
  };
}

/** Runs the action of the open confirmation and closes it. */
export async function confirmAction() {
  if (!book.confirm.action) {
    book.confirm.open = false;
    return;
  }
  book.confirm.busy = true;
  try {
    await book.confirm.action();
    book.confirm.open = false;
  } catch (error) {
    pushToast({ tone: 'error', title: '操作失败', message: errorText(error) });
  } finally {
    book.confirm.busy = false;
    book.confirm.action = null;
  }
}

/** Closes the confirmation without running it. */
export function cancelConfirm() {
  book.confirm.open = false;
  book.confirm.action = null;
}

/* ------------------------------------------------------------------------- */
/* Import / export                                                            */
/* ------------------------------------------------------------------------- */

/** Opens the import dialog. */
export function openImportDialog() {
  book.importDialog = {
    open: true,
    file: null,
    mode: 'skip',
    busy: false,
    report: null,
    error: '',
  };
}

/** Closes the import dialog and refreshes the listing. */
export async function closeImportDialog() {
  const imported = book.importDialog.report
    && (book.importDialog.report.created + book.importDialog.report.updated) > 0;
  book.importDialog.open = false;
  if (imported) {
    book.page = 1;
    await loadContacts();
  }
}

/**
 * Exports the current view or every contact.
 * @param {'filtered'|'all'} scope
 */
export async function exportWorkbook(scope = 'filtered') {
  book.exporting = true;
  book.exportMenuOpen = false;
  try {
    const params = scope === 'all'
      ? {}
      : {
        keyword: book.filters.keyword,
        groupId: book.filters.groupId === 'all' ? undefined : book.filters.groupId,
        bookmarked: book.filters.bookmarked ? 'true' : '',
      };
    const { blob, fileName, rowCount } = await api.exportContacts(params);
    saveBlob(blob, fileName);
    pushToast({
      tone: 'success',
      title: '导出完成',
      message: `${rowCount} 位联系人已保存为 ${fileName}`,
    });
  } catch (error) {
    pushToast({ tone: 'error', title: '导出失败', message: errorText(error) });
  } finally {
    book.exporting = false;
  }
}

/** Downloads the empty import template. */
export async function downloadTemplate() {
  try {
    const { blob, fileName } = await api.downloadTemplate();
    saveBlob(blob, fileName);
    pushToast({ tone: 'info', title: '模板已下载', message: fileName });
  } catch (error) {
    pushToast({ tone: 'error', title: '模板下载失败', message: errorText(error) });
  }
}
