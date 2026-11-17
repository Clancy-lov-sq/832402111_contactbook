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
const title = computed(() => (isEditing.value ? 'Edit contact' : 'New contact'));
const methodTypes = computed(() => (
  book.methodTypes.length > 0
    ? book.methodTypes
    : [
      { type: 'phone', label: 'Phone' },
      { type: 'email', label: 'Email' },
      { type: 'wechat', label: 'WeChat' },
      { type: 'qq', label: 'QQ' },
      { type: 'address', label: 'Address' },
      { type: 'website', label: 'Website' },
      { type: 'other', label: 'Other' },
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
  return METHOD_PLACEHOLDER[type] || 'Contact method';
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
    errors.name = 'Please enter a name';
  } else if (draft.name.trim().length > 40) {
    errors.name = 'A name may have at most 40 characters';
  }

  if (draft.groupChoice === '__new__' && draft.newGroupName.trim() === '') {
    errors.group = 'Please name the new group';
  }

  const seen = new Set();
  draft.methods.forEach((method, index) => {
    const value = method.value.trim();
    if (value === '') {
      errors[`methods[${index}].value`] = 'Please enter a value';
      return;
    }
    if (!isValidMethodValue(method.type, value)) {
      errors[`methods[${index}].value`] = METHOD_HINT[method.type] || 'Invalid format';
      return;
    }
    const key = `${method.type}:${value.toLowerCase()}`;
    if (seen.has(key)) {
      errors[`methods[${index}].value`] = 'This method is already listed';
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
              {{ isEditing ? 'Changes are saved to the database immediately' : 'Keep every phone number, e-mail and handle of one person together' }}
            </p>
          </div>
          <button
            type="button"
            class="dialog__close"
            aria-label="Close"
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
                Name<span class="required">*</span>
              </label>
              <input
                id="contact-name"
                v-model="draft.name"
                class="input"
                :class="{ 'is-invalid': errors.name }"
                type="text"
                maxlength="40"
                placeholder="e.g. Sophie Su"
                data-testid="form-name"
                @input="clearError('name')"
              />
              <p v-if="errors.name" class="field__error">{{ errors.name }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="contact-group">Group</label>
              <select
                id="contact-group"
                v-model="draft.groupChoice"
                class="select-input"
                :class="{ 'is-invalid': errors.group }"
                data-testid="form-group"
                @change="clearError('group')"
              >
                <option value="">No group</option>
                <option v-for="group in book.stats.groups" :key="group.id" :value="String(group.id)">
                  {{ group.name }}
                </option>
                <option value="__new__">+ New group…</option>
              </select>
              <input
                v-if="draft.groupChoice === '__new__'"
                v-model="draft.newGroupName"
                class="input"
                type="text"
                maxlength="20"
                placeholder="New group name, e.g. Book club"
                data-testid="form-new-group"
                @input="clearError('group')"
              />
              <p v-if="errors.group" class="field__error">{{ errors.group }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="contact-company">Company</label>
              <input
                id="contact-company"
                v-model="draft.company"
                class="input"
                type="text"
                maxlength="60"
                placeholder="e.g. Yuntu Software"
                data-testid="form-company"
              />
            </div>

            <div class="field">
              <label class="field__label" for="contact-title">Title</label>
              <input
                id="contact-title"
                v-model="draft.title"
                class="input"
                type="text"
                maxlength="40"
                placeholder="e.g. Backend engineer"
                data-testid="form-title"
              />
            </div>

            <div class="field field--full">
              <label class="field__label" for="contact-note">Notes</label>
              <textarea
                id="contact-note"
                v-model="draft.note"
                class="textarea"
                maxlength="500"
                placeholder="e.g. Prefers e-mail on weekday afternoons"
                data-testid="form-note"
              />
            </div>
          </div>

          <div class="switch-row">
            <div>
              <p class="field__label">Add to favorites</p>
              <p class="field__hint">Bookmarked contacts appear in Favorites and can be sorted by bookmark time.</p>
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
              <span>Contact methods · {{ draft.methods.length }}</span>
            </div>
            <div class="method-editor">
              <div v-for="(method, index) in draft.methods" :key="method.key" class="method-edit">
                <select
                  v-model="method.type"
                  class="select-input"
                  :aria-label="`Type of contact method ${index + 1}`"
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
                  placeholder="Label (optional)"
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
                <label class="method-edit__primary" title="Set as the primary contact method">
                  <input
                    type="radio"
                    :name="'primary-method'"
                    :checked="method.isPrimary"
                    @change="setPrimary(index)"
                  />
                  Primary
                </label>
                <button
                  type="button"
                  class="method-edit__remove"
                  :aria-label="`Remove contact method ${index + 1}`"
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
                  Add {{ type.label }}
                </button>
              </div>
              <p class="field__hint">
                The type of a contact method sets its format rules; with a single method you can ignore
                “Primary”, because the first one becomes primary automatically.
              </p>
            </div>
          </div>
        </div>

        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost" :disabled="book.form.saving" @click="cancel">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="book.form.saving"
            data-testid="form-submit"
            @click="submit"
          >
            <AppIcon name="check" />
            {{ book.form.saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Create contact') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
