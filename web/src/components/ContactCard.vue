<script setup>
import { computed } from 'vue';

import { toggleBookmark } from '../store/contactBook';
import { formatDateTime, initials, methodStyle } from '../utils/presentation';
import AppIcon from './AppIcon.vue';

/**
 * One contact card of the grid.
 *
 * The card shows at most three contact methods: the primary one first, then the
 * remaining ones in their stored order. Everything else is one click away in the
 * detail drawer.
 */
const props = defineProps({
  contact: { type: Object, required: true },
});

const emit = defineEmits(['open', 'edit', 'delete']);

/** The methods to preview, primary first. */
const previewMethods = computed(() => {
  const methods = [...props.contact.methods];
  methods.sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
  return methods.slice(0, 3);
});

const extraMethodCount = computed(() => Math.max(0, props.contact.methods.length - 3));
const groupStyle = computed(() => ({ '-chip-color': props.contact.groupColor || '#64748b' }));
const avatarStyle = computed(() => ({ background: props.contact.avatarColor || '#4f46e5' }));

/** @param {Event} event */
function onBookmark(event) {
  event.stopPropagation();
  toggleBookmark(props.contact);
}

/** @param {Event} event */
function onEdit(event) {
  event.stopPropagation();
  emit('edit', props.contact);
}

/** @param {Event} event */
function onDelete(event) {
  event.stopPropagation();
  emit('delete', props.contact);
}
</script>

<template>
  <article
    class="card"
    :class="{ 'is-bookmarked': contact.isBookmarked }"
    :data-contact-id="contact.id"
    data-testid="contact-card"
    tabindex="0"
    role="button"
    :aria-label="`查看 ${contact.name} 的联系方式`"
    @click="emit('open', contact.id)"
    @keydown.enter="emit('open', contact.id)"
    @keydown.space.prevent="emit('open', contact.id)"
  >
    <button
      type="button"
      class="card__star"
      :class="{ 'is-on': contact.isBookmarked }"
      :aria-pressed="contact.isBookmarked"
      :aria-label="contact.isBookmarked ? `取消收藏 ${contact.name}` : `收藏 ${contact.name}`"
      :title="contact.isBookmarked ? '取消收藏' : '加入收藏'"
      data-testid="bookmark-button"
      @click="onBookmark"
    >
      <AppIcon name="star" />
    </button>

    <header class="card__head">
      <span class="avatar" :style="avatarStyle">{{ initials(contact.name) }}</span>
      <div class="card__identity">
        <h3 class="card__name">
          <span :data-testid="`contact-name-${contact.id}`">{{ contact.name }}</span>
        </h3>
        <p class="card__role">
          <span v-if="contact.groupName" class="chip chip--group" :style="groupStyle">
            {{ contact.groupName }}
          </span>
          <template v-if="contact.company || contact.title">
            <span v-if="contact.groupName"> · </span>
            {{ [contact.company, contact.title].filter(Boolean).join(' · ') }}
          </template>
          <span v-if="!contact.groupName && !contact.company && !contact.title" class="muted">
            未填写公司与职位
          </span>
        </p>
      </div>
    </header>

    <div v-if="previewMethods.length" class="card__methods">
      <div
        v-for="method in previewMethods"
        :key="method.id || `${method.type}-${method.value}`"
        class="method"
      >
        <span
          class="method__icon"
          :style="{
            '--method-color': methodStyle(method.type).color,
            '--method-tint': methodStyle(method.type).tint,
          }"
        >
          <AppIcon :name="methodStyle(method.type).icon" />
        </span>
        <span v-if="method.label" class="method__label">{{ method.label }}</span>
        <span class="method__value">{{ method.value }}</span>
        <span v-if="method.isPrimary" class="method__primary">主</span>
      </div>
      <p v-if="extraMethodCount > 0" class="card__method-count">
        还有 {{ extraMethodCount }} 条联系方式，点击卡片查看
      </p>
    </div>

    <div v-else class="card__methods">
      <p class="card__method-count">尚未添加联系方式</p>
    </div>

    <footer class="card__foot">
      <span class="card__time" :title="contact.updatedAt">
        <AppIcon name="clock" />
        {{ formatDateTime(contact.updatedAt) }}
      </span>
      <div class="card__actions">
        <button
          type="button"
          class="icon-button"
          title="编辑"
          aria-label="编辑"
          data-testid="card-edit"
          @click="onEdit"
        >
          <AppIcon name="edit" />
        </button>
        <button
          type="button"
          class="icon-button icon-button--danger"
          title="删除"
          aria-label="删除"
          data-testid="card-delete"
          @click="onDelete"
        >
          <AppIcon name="trash" />
        </button>
      </div>
    </footer>
  </article>
</template>
