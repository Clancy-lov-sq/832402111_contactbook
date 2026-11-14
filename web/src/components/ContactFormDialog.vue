<script setup>
import { computed, reactive, watch } from 'vue';

import {
  book,
  closeForm,
  saveContact,
} from '../store/contactBook';
import { methodStyle } from '../utils/presentation';
import { errorText } from '../utils/errorMessages';
import {
  METHOD_HINT,
  METHOD_PLACEHOLDER,
  isValidMethodValue,
} from '../utils/validation';
import AppIcon from './AppIcon.vue';

/**
 * The create / edit dialog.
 *
 * A contact owns one or more contact methods, so the form edits a list instead of
 * a fixed pair of fields: a row per method, each with its own type, optional
 * label, value and primary flag. The rules of the value depend on the type, which
 * is why the placeholder and the hint change together with the selection.
 */

let keySeed = 1;

/** @returns {number} a stable key for v-for */
function nextKey() {
  const key = keySeed;
  keySeed += 1;
  return key;
}

const draft = reactive({
  name: '',
  groupChoice: '',
  newGroupName: '',
  company: '',
  title: '',
  note: '',
  isBookmarked: false,
  methods: [],
});

/** Field errors keyed exactly like the backend field names. */
const errors = reactive({});

const isEditing = computed(() => Boolean(book.form.contact));
const title = computed(() => (isEditing.value ? '编辑联系人' : '新建联系人'));
const methodTypes = computed(() => (
  book.methodTypes.length > 0
    ? book.methodTypes
    : [
      { type: 'phone', label: '电话' },
      { type: 'email', label: '邮箱' },
      { type: 'wechat', label: '微信' },
      { type: 'qq', label: 'QQ' },
      { type: 'address', label: '地址' },
      { type: 'website', label: '网址' },
      { type: 'other', label: '其他' },
    ]
));

/** Clears and refills the draft every time the dialog opens. */
function resetDraft() {
  for (const key of Object.keys(errors)) {
    delete errors[key];
  }
  const contact = book.form.contact;
  draft.name = contact ? contact.name : '';
  draft.groupChoice = contact && contact.groupId ? String(contact.groupId) : '';
  draft.newGroupName = '';
  draft.company = contact ? contact.company : '';
  draft.title = contact ? contact.title : '';
  draft.note = contact ? contact.note : '';
  draft.isBookmarked = contact ? contact.isBookmarked : false;
  draft.methods = (contact ? contact.methods : []).map((method) => ({
    key: nextKey(),
    type: method.type,
    label: method.label || '',
    value: method.value,
    isPrimary: Boolean(method.isPrimary),
  }));
  if (draft.methods.length === 0) {
    addMethod('phone');
  }
}

watch(() => book.form.open, (open) => {
  if (open) {
    resetDraft();
  }
});

watch(() => book.form.serverFields, (fields) => {
  if (!fields || fields.length === 0) {
    return;
  }
  for (const field of fields) {
    errors[field.field] = errorText({ code: field.code, message: field.message });
  }
}, { deep: true });

/** @param {string} type */
function addMethod(type = 'phone') {
  const isFirst = draft.methods.length === 0;
  draft.methods.push({
    key: nextKey(),
    type,
    label: '',
    value: '',
    isPrimary: isFirst,
  });
  delete errors.methods;
}

/** @param {number} index */
function removeMethod(index) {
  const wasPrimary = draft.methods[index].isPrimary;
  draft.methods.splice(index, 1);
  if (wasPrimary && draft.methods.length > 0) {
    draft.methods[0].isPrimary = true;
  }
  for (const key of Object.keys(errors)) {
    if (key.startsWith(`methods[${index}]`)) {
      delete errors[key];
    }
  }
}

/** @param {number} index */
function setPrimary(index) {
  draft.methods.forEach((method, position) => {
    method.isPrimary = position === index;
  });
}

/** @param {string} type @returns {string} */
function placeholderFor(type) {
  return METHOD_PLACEHOLDER[type] || '联系方式';
}

/** Clears one error as soon as the user edits the field. */
function clearError(field) {
  delete errors[field];
}

/** @returns {boolean} whether the draft is valid */
function validate() {
  for (const key of Object.keys(errors)) {
    delete errors[key];
  }

  if (draft.name.trim() === '') {
    errors.name = '请填写联系人姓名';
  } else if (draft.name.trim().length > 40) {
    errors.name = '姓名最多 40 个字符';
  }

  if (draft.groupChoice === '__new__' && draft.newGroupName.trim() === '') {
    errors.group = '请填写新分组的名称';
  }

  const seen = new Set();
  draft.methods.forEach((method, index) => {
    const value = method.value.trim();
    if (value === '') {
      errors[`methods[${index}].value`] = '请填写联系方式';
      return;
    }
    if (!isValidMethodValue(method.type, value)) {
      errors[`methods[${index}].value`] = METHOD_HINT[method.type] || '格式不正确';
      return;
    }
    const key = `${method.type}:${value.toLowerCase()}`;
    if (seen.has(key)) {
      errors[`methods[${index}].value`] = '同一种联系方式不能重复';
      return;
    }
    seen.add(key);
  });

  return Object.keys(errors).length === 0;
}

/** Saves the contact and lets the store close the dialog on success. */
async function submit() {
  if (book.form.saving) {
    return;
  }
  if (!validate()) {
    return;
  }

  const groupName = draft.groupChoice === '__new__'
    ? draft.newGroupName.trim()
    : (book.stats.groups.find((group) => String(group.id) === draft.groupChoice) || {}).name || '';

  await saveContact({
    name: draft.name.trim(),
    groupName,
    company: draft.company.trim(),
    title: draft.title.trim(),
    note: draft.note.trim(),
    isBookmarked: draft.isBookmarked,
    methods: draft.methods.map((method) => ({
      type: method.type,
      label: method.label.trim(),
      value: method.value.trim(),
      isPrimary: method.isPrimary,
    })),
  });
}

/** Closes without saving. */
function cancel() {
  if (!book.form.saving) {
    closeForm();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="book.form.open" class="center-dialog" data-testid="form-dialog">
      <div class="overlay" style="position: absolute; inset: 0" @click="cancel" />
      <div class="dialog dialog--wide" role="dialog" aria-modal="true" :aria-label="title">
        <header class="dialog__head">
          <span class="dialog__icon">
            <AppIcon :name="isEditing ? 'edit' : 'users'" />
          </span>
          <div>
            <h2 class="dialog__title">{{ title }}</h2>
            <p class="dialog__subtitle">
              {{ isEditing ? '修改后立即同步到数据库' : '把电话、邮箱、微信等联系方式都放在同一位联系人下面' }}
            </p>
          </div>
          <button
            type="button"
            class="dialog__close"
            aria-label="关闭"
            data-testid="form-close"
            @click="cancel"
          >
            <AppIcon name="x" />
          </button>
        </header>

        <div class="dialog__body">
          <div class="form-grid">
            <div class="field">
              <label class="field__label" for="contact-name">
                姓名<span class="required">*</span>
              </label>
              <input
                id="contact-name"
                v-model="draft.name"
                class="input"
                :class="{ 'is-invalid': errors.name }"
                type="text"
                maxlength="40"
                placeholder="例如：苏晚晴"
                data-testid="form-name"
                @input="clearError('name')"
              />
              <p v-if="errors.name" class="field__error">{{ errors.name }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="contact-group">分组</label>
              <select
                id="contact-group"
                v-model="draft.groupChoice"
                class="select-input"
                :class="{ 'is-invalid': errors.group }"
                data-testid="form-group"
                @change="clearError('group')"
              >
                <option value="">未分组</option>
                <option v-for="group in book.stats.groups" :key="group.id" :value="String(group.id)">
                  {{ group.name }}
                </option>
                <option value="__new__">+ 新建分组…</option>
              </select>
              <input
                v-if="draft.groupChoice === '__new__'"
                v-model="draft.newGroupName"
                class="input"
                type="text"
                maxlength="20"
                placeholder="新分组的名称，例如：读书会"
                data-testid="form-new-group"
                @input="clearError('group')"
              />
              <p v-if="errors.group" class="field__error">{{ errors.group }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="contact-company">公司</label>
              <input
                id="contact-company"
                v-model="draft.company"
                class="input"
                type="text"
                maxlength="60"
                placeholder="例如：云图软件"
                data-testid="form-company"
              />
            </div>

            <div class="field">
              <label class="field__label" for="contact-title">职位</label>
              <input
                id="contact-title"
                v-model="draft.title"
                class="input"
                type="text"
                maxlength="40"
                placeholder="例如：后端工程师"
                data-testid="form-title"
              />
            </div>

            <div class="field field--full">
              <label class="field__label" for="contact-note">备注</label>
              <textarea
                id="contact-note"
                v-model="draft.note"
                class="textarea"
                maxlength="500"
                placeholder="例如：周三下午方便联系，邮件优先"
                data-testid="form-note"
              />
            </div>
          </div>

          <div class="switch-row">
            <div>
              <p class="field__label">加入收藏</p>
              <p class="field__hint">收藏的联系人会出现在“我的收藏”里，也可以按收藏时间排序。</p>
            </div>
            <button
              type="button"
              class="switch"
              :class="{ 'is-on': draft.isBookmarked }"
              role="switch"
              :aria-checked="draft.isBookmarked"
              data-testid="form-bookmark"
              @click="draft.isBookmarked = !draft.isBookmarked"
            />
          </div>

          <div class="field">
            <div class="section-label" style="margin-bottom: 2px">
              <span>联系方式 · {{ draft.methods.length }} 条</span>
            </div>
            <div class="method-editor">
              <div v-for="(method, index) in draft.methods" :key="method.key" class="method-edit">
                <select
                  v-model="method.type"
                  class="select-input"
                  :aria-label="`第 ${index + 1} 条联系方式的类型`"
                  :data-testid="`method-type-${index}`"
                >
                  <option v-for="type in methodTypes" :key="type.type" :value="type.type">
                    {{ type.label }}
                  </option>
                </select>
                <input
                  v-model="method.label"
                  class="input"
                  type="text"
                  maxlength="20"
                  placeholder="标签（可选）"
                  :data-testid="`method-label-${index}`"
                />
                <input
                  v-model="method.value"
                  class="input"
                  :class="{ 'is-invalid': errors[`methods[${index}].value`] }"
                  type="text"
                  maxlength="120"
                  :placeholder="placeholderFor(method.type)"
                  :data-testid="`method-value-${index}`"
                  @input="clearError(`methods[${index}].value`)"
                />
                <label class="method-edit__primary" title="设为主要联系方式">
                  <input
                    type="radio"
                    :name="'primary-method'"
                    :checked="method.isPrimary"
                    @change="setPrimary(index)"
                  />
                  主
                </label>
                <button
                  type="button"
                  class="method-edit__remove"
                  :aria-label="`删除第 ${index + 1} 条联系方式`"
                  :data-testid="`method-remove-${index}`"
                  @click="removeMethod(index)"
                >
                  <AppIcon name="x" />
                </button>
                <p v-if="errors[`methods[${index}].value`]" class="method-edit__error">
                  {{ errors[`methods[${index}].value`] }}
                </p>
              </div>

              <div class="chip-buttons">
                <button
                  v-for="type in methodTypes"
                  :key="type.type"
                  type="button"
                  class="chip-button"
                  :data-testid="`add-method-${type.type}`"
                  @click="addMethod(type.type)"
                >
                  <AppIcon :name="methodStyle(type.type).icon" />
                  添加{{ type.label }}
                </button>
              </div>
              <p class="field__hint">
                一条联系方式的类型决定它的格式要求；只有一条时可以忽略“主”，系统会自动把第一条设为主要联系方式。
              </p>
            </div>
          </div>
        </div>

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost" :disabled="book.form.saving" @click="cancel">
            取消
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="book.form.saving"
            data-testid="form-submit"
            @click="submit"
          >
            <AppIcon name="check" />
            {{ book.form.saving ? '保存中…' : (isEditing ? '保存修改' : '创建联系人') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
