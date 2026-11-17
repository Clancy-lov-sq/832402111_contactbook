<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import AppIcon from './components/AppIcon.vue';
import AppSidebar from './components/AppSidebar.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import ContactCard from './components/ContactCard.vue';
import ContactDetailDrawer from './components/ContactDetailDrawer.vue';
import ContactFormDialog from './components/ContactFormDialog.vue';
import EmptyState from './components/EmptyState.vue';
import ImportDialog from './components/ImportDialog.vue';
import ToastHost from './components/ToastHost.vue';
import {
  askDelete,
  book,
  cancelConfirm,
  clearFilters,
  closeDetail,
  closeForm,
  downloadTemplate,
  exportWorkbook,
  hasFilters,
  initBook,
  loadContacts,
  openCreateForm,
  openDetail,
  openEditForm,
  openImportDialog,
  setKeyword,
  setPage,
  setPageSize,
  setSort,
  viewSubtitle,
  viewTitle,
} from './store/contactBook';

/**
 * The application shell.
 *
 * It owns three pieces of cross-cutting behaviour: the search field (which is
 * debounced in the store), the keyboard shortcuts and the outside click of the
 * export menu. Everything that changes data lives in the store.
 */

const searchInput = ref(null);
const keyword = ref('');
const sortValue = ref(book.filters.sort);

watch(() => book.filters.keyword, (value) => {
  keyword.value = value;
});

watch(() => book.filters.sort, (value) => {
  sortValue.value = value;
});

/** A taskbar-free page list: the current page plus two neighbours. */
const pageNumbers = computed(() => {
  const pages = [];
  const total = book.totalPages;
  const current = book.page;
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
});

const showSkeleton = computed(() => !book.ready || (book.loading && book.items.length === 0));

/** @param {Event} event */
function onKeywordInput(event) {
  setKeyword(event.target.value);
}

/** Clears the search and returns the focus to the field. */
function clearSearch() {
  keyword.value = '';
  setKeyword('');
  if (searchInput.value) {
    searchInput.value.focus();
  }
}

/** @param {Event} event */
function onSortChange(event) {
  setSort(event.target.value);
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  const withMeta = event.ctrlKey || event.metaKey;
  if (withMeta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (searchInput.value) {
      searchInput.value.focus();
      searchInput.value.select();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (book.form.open) {
      closeForm();
    } else if (book.importDialog.open) {
      book.importDialog.open = false;
    } else if (book.confirm.open) {
      cancelConfirm();
    } else if (book.detail) {
      closeDetail();
    }
  }
}

/** @param {MouseEvent} event */
function onDocumentClick(event) {
  if (book.exportMenuOpen && !event.target.closest('.menu')) {
    book.exportMenuOpen = false;
  }
}

onMounted(() => {
  initBook();
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
  <div class="app">
    <AppSidebar />

    <div class="workspace">
      <header class="topbar">
        <div class="search">
          <AppIcon name="search" />
          <input
            ref="searchInput"
            v-model="keyword"
            class="search__input"
            type="search"
            placeholder="Search name, company, phone, email…"
            aria-label="Search contacts"
            data-testid="search-input"
            @input="onKeywordInput"
          />
          <kbd v-if="!keyword" class="search__kbd">Ctrl K</kbd>
          <button
            v-else
            type="button"
            class="search__clear"
            aria-label="Clear search"
            data-testid="search-clear"
            @click="clearSearch"
          >
            ×
          </button>
        </div>

        <div class="topbar__actions">
          <button type="button" class="btn btn--ghost" data-testid="template-button" @click="downloadTemplate">
            <AppIcon name="fileDown" />
            <span class="btn__text">Template</span>
          </button>
          <button type="button" class="btn btn--ghost" data-testid="import-button" @click="openImportDialog">
            <AppIcon name="upload" />
            <span class="btn__text">Import</span>
          </button>
          <div class="menu">
            <button
              type="button"
              class="btn btn--ghost"
              :disabled="book.exporting"
              data-testid="export-button"
              @click="book.exportMenuOpen = !book.exportMenuOpen"
            >
              <AppIcon name="download" />
              <span class="btn__text">{{ book.exporting ? 'Exporting…' : 'Export' }}</span>
              <AppIcon name="chevronDown" class="btn__caret" />
            </button>
            <div v-if="book.exportMenuOpen" class="menu__panel" data-testid="export-menu">
              <button type="button" class="menu__item" data-testid="export-filtered" @click="exportWorkbook('filtered')">
                Export filtered · {{ book.total }} contacts
              </button>
              <button type="button" class="menu__item" data-testid="export-all" @click="exportWorkbook('all')">
                Export all contacts · {{ book.stats.total }} contacts
              </button>
            </div>
          </div>
          <button type="button" class="btn btn--primary" data-testid="create-button" @click="openCreateForm">
            <AppIcon name="plus" />
            New contact
          </button>
        </div>
      </header>

      <main class="content">
        <section class="page-head">
          <div>
            <p class="page-head__eyebrow">ContactBook · Address book</p>
            <h1 class="page-head__title" data-testid="view-title">{{ viewTitle }}</h1>
            <p class="page-head__subtitle" data-testid="view-subtitle">{{ viewSubtitle }}</p>
          </div>
          <div class="page-head__tools">
            <button
              type="button"
              class="btn btn--ghost btn--icon"
              title="Refresh"
              aria-label="Refresh list"
              data-testid="refresh-button"
              @click="loadContacts()"
            >
              <AppIcon name="database" />
            </button>
            <label class="select">
              <span>Sort</span>
              <select :value="sortValue" data-testid="sort-select" @change="onSortChange">
                <option v-for="option in book.sortOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
        </section>

        <div v-if="book.error" class="banner banner--error" data-testid="error-banner">
          <AppIcon name="alert" />
          <span>{{ book.error }}</span>
          <button type="button" class="btn btn--ghost btn--sm banner__action" @click="loadContacts()">
            Retry
          </button>
        </div>

        <div v-if="showSkeleton" class="grid" data-testid="skeleton-grid">
          <div v-for="index in 6" :key="index" class="skeleton-card" />
        </div>

        <template v-else-if="book.items.length === 0">
          <EmptyState
            :filtered="hasFilters"
            :keyword="book.filters.keyword"
            @create="openCreateForm"
            @clear="clearFilters"
          />
        </template>

        <template v-else>
          <section class="grid" data-testid="contact-grid">
            <ContactCard
              v-for="contact in book.items"
              :key="contact.id"
              :contact="contact"
              @open="openDetail"
              @edit="openEditForm"
              @delete="askDelete"
            />
          </section>

          <footer class="pagination" data-testid="pagination">
            <p class="pagination__info">
              Page {{ book.page }} of {{ book.totalPages }} · {{ book.total }} contacts
            </p>
            <div class="pagination__controls">
              <button
                type="button"
                class="pagination__page"
                :disabled="book.page <= 1"
                data-testid="page-prev"
                @click="setPage(book.page - 1)"
              >
                Previous
              </button>
              <button
                v-for="page in pageNumbers"
                :key="page"
                type="button"
                class="pagination__page"
                :class="{ 'is-current': page === book.page }"
                :aria-current="page === book.page ? 'page' : undefined"
                @click="setPage(page)"
              >
                {{ page }}
              </button>
              <button
                type="button"
                class="pagination__page"
                :disabled="book.page >= book.totalPages"
                data-testid="page-next"
                @click="setPage(book.page + 1)"
              >
                Next
              </button>
              <select
                class="pagination__size"
                :value="book.pageSize"
                aria-label="Contacts per page"
                data-testid="page-size"
                @change="setPageSize(Number($event.target.value))"
              >
                <option v-for="size in book.pageSizes" :key="size" :value="size">
                  {{ size }} / page
                </option>
              </select>
            </div>
          </footer>
        </template>
      </main>
    </div>

    <ContactDetailDrawer />
    <ContactFormDialog />
    <ImportDialog />
    <ConfirmDialog />
    <ToastHost />
  </div>
</template>
