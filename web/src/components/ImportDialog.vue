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
    state.error = '只支持 .xlsx 格式的 Excel 工作簿，请先在 Excel 中另存为这个格式。';
    return;
  }
  if (file.size > MAX_BYTES) {
    state.file = null;
    state.error = '文件不能超过 5 MB，请拆分后再导入。';
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
    if (created + updated > 0) {
      pushToast({
        tone: 'success',
        title: '导入完成',
        message: `新增 ${created} 位，更新 ${updated} 位，失败 ${result.report.failed} 行`,
      });
    } else {
      pushToast({
        tone: 'info',
        title: '没有写入新数据',
        message: `跳过 ${result.report.skipped} 位，失败 ${result.report.failed} 行`,
      });
    }
  } catch (error) {
    state.error = errorText(error);
    pushToast({ tone: 'error', title: '导入失败', message: errorText(error) });
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
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="导入 Excel">
        <header class="dialog__head">
          <span class="dialog__icon">
            <AppIcon name="upload" />
          </span>
          <div>
            <h2 class="dialog__title">导入 Excel</h2>
            <p class="dialog__subtitle">
              一位联系人一行，一种信息一列；同名同联系方式的记录可以跳过或更新。
            </p>
          </div>
          <button type="button" class="dialog__close" aria-label="关闭" @click="finish">
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
              <p class="dropzone__title">选择或拖入一个 .xlsx 文件</p>
              <p class="dropzone__hint">单次最多 2000 行，文件不超过 5 MB</p>
            </div>

            <div v-if="state.file" class="file-card" data-testid="import-file-card">
              <span class="file-card__icon"><AppIcon name="file" /></span>
              <div>
                <p class="file-card__name">{{ state.file.name }}</p>
                <p class="file-card__meta">{{ formatSize(state.file.size) }} · 准备导入</p>
              </div>
              <button type="button" class="icon-button" aria-label="移除文件" @click="again">
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
                <span class="radio-card__title">跳过重复</span>
                <span class="radio-card__text">同名且联系方式相同的联系人保持不动，只导入新的。</span>
              </label>
              <label class="radio-card" :class="{ 'is-active': state.mode === 'update' }">
                <input
                  v-model="state.mode"
                  type="radio"
                  value="update"
                  data-testid="import-mode-update"
                />
                <span class="radio-card__title">更新已有</span>
                <span class="radio-card__text">用表格里的内容更新联系人，并把新的联系方式合并进去。</span>
              </label>
            </div>

            <ul class="hint-list">
              <li>
                <AppIcon name="check" />
                <span>第一行是表头，必须包含“姓名”列，列的顺序可以不同。</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>电话、邮箱可以有多列（电话1、电话2…），微信、QQ、网址、地址各一列即可。</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>“是否收藏”填“是”或“否”；分组名称不存在时会自动创建。</span>
              </li>
              <li>
                <AppIcon name="check" />
                <span>
                  还没有表格？先下载
                  <button type="button" class="link-button" data-testid="import-template" @click.stop="downloadTemplate">
                    导入模板
                  </button>
                  ，里面带填写说明。
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
                  <p class="report-tile__label">新增联系人</p>
                </div>
                <div class="report-tile report-tile--updated">
                  <p class="report-tile__value">{{ state.report.updated }}</p>
                  <p class="report-tile__label">更新联系人</p>
                </div>
                <div class="report-tile report-tile--skipped">
                  <p class="report-tile__value">{{ state.report.skipped }}</p>
                  <p class="report-tile__label">跳过重复</p>
                </div>
                <div class="report-tile report-tile--failed">
                  <p class="report-tile__value">{{ state.report.failed }}</p>
                  <p class="report-tile__label">失败行</p>
                </div>
              </div>

              <p class="field__hint" style="margin-top: 10px">
                工作表“{{ state.report.sheetName }}”第 {{ state.report.headerRow }} 行为表头，
                共读取 {{ state.report.totalRows }} 行；识别到 {{ state.report.columns.length }} 列<span
                  v-if="state.report.ignoredColumns.length > 0"
                >，忽略 {{ state.report.ignoredColumns.length }} 列</span>。
              </p>

              <div v-if="failedRows.length > 0" style="margin-top: 12px">
                <div class="section-label">
                  <span>失败的行</span>
                  <span>{{ failedRows.length }} 行</span>
                </div>
                <div class="report-table">
                  <div v-for="row in failedRows" :key="`failed-${row.row}`" class="report-row">
                    <span class="report-row__row">第 {{ row.row }} 行</span>
                    <span class="report-row__name">{{ row.name }}</span>
                    <span class="tag tag--failed">失败</span>
                    <span class="report-row__message">{{ row.message }}</span>
                  </div>
                </div>
              </div>

              <div v-if="importedRows.length > 0" style="margin-top: 12px">
                <div class="section-label">
                  <span>写入的行</span>
                  <span>{{ importedRows.length }} 行</span>
                </div>
                <div class="report-table">
                  <div v-for="row in importedRows" :key="`ok-${row.row}`" class="report-row">
                    <span class="report-row__row">第 {{ row.row }} 行</span>
                    <span class="report-row__name">{{ row.name }}</span>
                    <span class="tag" :class="`tag--${row.status}`">
                      {{ row.status === 'created' ? '新增' : (row.status === 'updated' ? '更新' : '跳过') }}
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
            <button type="button" class="btn btn--ghost" @click="finish">取消</button>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="!state.file || state.busy"
              data-testid="import-submit"
              @click="submit"
            >
              <AppIcon name="upload" />
              {{ state.busy ? '正在导入…' : '开始导入' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn--ghost" data-testid="import-again" @click="again">
              再导入一个文件
            </button>
            <button type="button" class="btn btn--primary" data-testid="import-finish" @click="finish">
              <AppIcon name="check" />
              完成
            </button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
