<script setup>
import { computed, reactive, ref, watch } from 'vue';

import { api } from '../api/client';
import { book, closeImportDialog, downloadTemplate } from '../store/contactBook';
import { pushToast } from '../ui/toast';
import { errorText } from '../utils/errorMessages';
import AppIcon from './AppIcon.vue';

/**
 * The Excel import dialog.
 *
 * Three steps in one panel: choose a workbook, choose what to do with a duplicate,
 * read the row-by-row report. Nothing is imported before the button is pressed,
 * and a structural problem of the file is explained in place instead of ending as
 * a generic failure.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const state = reactive({
  file: null,
  mode: 'skip',
  busy: false,
  report: null,
  error: '',
  dragging: false,
});

const fileInput = ref(null);

watch(() => book.importDialog.open, (open) => {
  if (open) {
    Object.assign(state, {
      file: null,
      mode: 'skip',
      busy: false,
      report: null,
      error: '',
      dragging: false,
    });
  }
});

const failedRows = computed(() => (
  state.report ? state.report.rows.filter((row) => row.status === 'failed') : []
));
const importedRows = computed(() => (
  state.report ? state.report.rows.filter((row) => row.status !== 'failed') : []
));

/** @param {File|null} file */
function setFile(file) {
  state.report = null;
  state.error = '';
  if (!file) {
    return;
  }
  if (!/\.xlsx$/i.test(file.name)) {
    state.file = null;
    state.error = 'Only .xlsx Excel workbooks are supported — save the file as .xlsx in Excel first.';
    return;
  }
  if (file.size > MAX_BYTES) {
    state.file = null;
    state.error = 'The file must not exceed 5 MB — split it and import again.';
    return;
  }
  state.file = file;
}

/** @param {Event} event */
function onFileChange(event) {
  setFile(event.target.files && event.target.files[0]);
}

/** @param {DragEvent} event */
function onDrop(event) {
  state.dragging = false;
  setFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
}

/** Opens the file picker. */
function openPicker() {
  if (!state.busy && fileInput.value) {
    fileInput.value.click();
  }
}

/** Sends the workbook to the backend and keeps the report. */
async function submit() {
  if (!state.file || state.busy) {
    return;
  }
  state.busy = true;
  state.error = '';
  try {
    const result = await api.importWorkbook(state.file, state.mode);
    state.report = result.report;
    // The store keeps the report as well, so the dialog is not the only owner of
    // the outcome: the end-to-end capture and a future "last import" panel can
    // read it without reaching into a component.
    book.importDialog.report = result.report;
    const { created, updated } = result.report;
    const failedLabel = `${result.report.failed} failed row${result.report.failed === 1 ? '' : 's'}`;
    if (created + updated > 0) {
      pushToast({
        tone: 'success',
        title: 'Import finished',
        message: `Created ${created}, updated ${updated}, ${failedLabel}`,
      });
    } else {
      pushToast({
        tone: 'info',
        title: 'Nothing was written',
        message: `Skipped ${result.report.skipped}, ${failedLabel}`,
      });
    }
  } catch (error) {
    state.error = errorText(error);
    pushToast({ tone: 'error', title: 'Import failed', message: errorText(error) });
  } finally {
    state.busy = false;
  }
}

/** Closes the dialog (the store refreshes the listing when something changed). */
function finish() {
  closeImportDialog();
}

/** Returns to the picker to import another workbook. */
function again() {
  state.report = null;
  book.importDialog.report = null;
  state.file = null;
  state.error = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

/** @param {number} bytes @returns {string} */
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="book.importDialog.open" class="center-dialog" data-testid="import-dialog">
      <div class="overlay" style="position: absolute; inset: 0" @click="finish" />
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="Import Excel">
        <header class="dialog__head">
          <span class="dialog__icon">
            <AppIcon name="upload" />
          </span>
          <div>
            <h2 class="dialog__title">Import Excel</h2>
            <p class="dialog__subtitle">
              One contact per row, one piece of information per column; duplicates can be skipped or updated.
            </p>
          </div>
          <button type="button" class="dialog__close" aria-label="Close" @click="finish">
            <AppIcon name="x" />
          </button>
        </header>

        <div class="dialog__body">
          <template v-if="!state.report">
            <input
              ref="fileInput"
              type="file"
              accept=".xlsx"
              class="sr-only"
              data-testid="import-file-input"
              @change="onFileChange"
            />

            <div
              class="dropzone"
              :class="{ 'is-dragging': state.dragging }"
              role="button"
              tabindex="0"
              data-testid="import-dropzone"
              @click="openPicker"
              @keydown.enter="openPicker"
              @dragover.prevent="state.dragging = true"
              @dragleave.prevent="state.dragging = false"
              @drop.prevent="onDrop"
            >
              <span class="dropzone__icon"><AppIcon name="fileDown" /></span>
              <p class="dropzone__title">Choose or drop an .xlsx file</p>
              <p class="dropzone__hint">Up to 2000 rows and 5 MB per file</p>
            </div>

            <div v-if="state.file" class="file-card" data-testid="import-file-card">
              <span class="file-card__icon"><AppIcon name="file" /></span>
              <div>
                <p class="file-card__name">{{ state.file.name }}</p>
                <p class="file-card__meta">{{ formatSize(state.file.size) }} · Ready to import</p>
              </div>
              <button type="button" class="icon-button" aria-label="Remove file" @click="again">
                <AppIcon name="x" />
              </button>
            </div>

            <div class="radio-cards">
              <label class="radio-card" :class="{ 'is-active': state.mode === 'skip' }">
                <input
                  v-model="state.mode"
                  type="radio"
                  value="skip"
                  data-testid="import-mode-skip"
                />
                <span class="radio-card__title">Skip duplicates</span>
                <span class="radio-card__text">Same name and method stay untouched; only new contacts are imported.</span>
              </label>
              <label class="radio-card" :class="{ 'is-active': state.mode === 'update' }">
                <input
                  v-model="state.mode"
                  type="radio"
                  value="update"
                  data-testid="import-mode-update"
                />
                <span class="radio-card__title">Update existing</span>
                <span class="radio-card__text">Update the contact with the workbook values and merge new methods.</span>
              </label>
            </div>

            <ul class="hint-list">
              <li>
                <AppIcon name="check" />
                <span>The first row is the header and must contain a Name column; column order is free.</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>Phone and e-mail may use several columns (Phone 1, Phone 2…); WeChat, QQ, website and address need one column.</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>Bookmarked accepts yes or no; unknown group names are created automatically.</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>
                  No workbook yet? Download the
                  <button type="button" class="link-button" data-testid="import-template" @click.stop="downloadTemplate">
                    import template
                  </button>
                  — it ships with instructions.
                </span>
              </li>
            </ul>

            <div v-if="state.error" class="banner banner--error" data-testid="import-error">
              <AppIcon name="alert" />
              <span>{{ state.error }}</span>
            </div>
          </template>

          <template v-else>
            <div data-testid="import-report">
              <div class="report-summary">
                <div class="report-tile report-tile--created">
                  <p class="report-tile__value">{{ state.report.created }}</p>
                  <p class="report-tile__label">Created</p>
                </div>
                <div class="report-tile report-tile--updated">
                  <p class="report-tile__value">{{ state.report.updated }}</p>
                  <p class="report-tile__label">Updated</p>
                </div>
                <div class="report-tile report-tile--skipped">
                  <p class="report-tile__value">{{ state.report.skipped }}</p>
                  <p class="report-tile__label">Skipped</p>
                </div>
                <div class="report-tile report-tile--failed">
                  <p class="report-tile__value">{{ state.report.failed }}</p>
                  <p class="report-tile__label">Failed rows</p>
                </div>
              </div>

              <p class="field__hint" style="margin-top: 10px">
                Sheet “{{ state.report.sheetName }}”, header on row {{ state.report.headerRow }},
                {{ state.report.totalRows }} rows read, {{ state.report.columns.length }} columns recognised<span
                  v-if="state.report.ignoredColumns.length > 0"
                >, {{ state.report.ignoredColumns.length }} columns ignored</span>.
              </p>

              <div v-if="failedRows.length > 0" style="margin-top: 12px">
                <div class="section-label">
                  <span>Failed rows</span>
                  <span>{{ failedRows.length }} rows</span>
                </div>
                <div class="report-table">
                  <div v-for="row in failedRows" :key="`failed-${row.row}`" class="report-row">
                    <span class="report-row__row">Row {{ row.row }}</span>
                    <span class="report-row__name">{{ row.name }}</span>
                    <span class="tag tag--failed">Failed</span>
                    <span class="report-row__message">{{ row.message }}</span>
                  </div>
                </div>
              </div>

              <div v-if="importedRows.length > 0" style="margin-top: 12px">
                <div class="section-label">
                  <span>Imported rows</span>
                  <span>{{ importedRows.length }} rows</span>
                </div>
                <div class="report-table">
                  <div v-for="row in importedRows" :key="`ok-${row.row}`" class="report-row">
                    <span class="report-row__row">Row {{ row.row }}</span>
                    <span class="report-row__name">{{ row.name }}</span>
                    <span class="tag" :class="`tag--${row.status}`">
                      {{ row.status === 'created' ? 'Created' : (row.status === 'updated' ? 'Updated' : 'Skipped') }}
                    </span>
                    <span class="report-row__message">{{ row.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <footer class="dialog__foot">
          <template v-if="!state.report">
            <button type="button" class="btn btn--ghost" @click="finish">Cancel</button>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="!state.file || state.busy"
              data-testid="import-submit"
              @click="submit"
            >
              <AppIcon name="upload" />
              {{ state.busy ? 'Importing…' : 'Start import' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn--ghost" data-testid="import-again" @click="again">
              Import another file
            </button>
            <button type="button" class="btn btn--primary" data-testid="import-finish" @click="finish">
              <AppIcon name="check" />
              Done
            </button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
