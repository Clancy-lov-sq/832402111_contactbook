<script setup>
import { computed } from 'vue';

import {
  askDelete,
  book,
  closeDetail,
  openEditForm,
  toggleBookmark,
} from '../store/contactBook';
import { pushToast } from '../ui/toast';
import {
  formatDateTime,
  initials,
  methodLink,
  methodStyle,
} from '../utils/presentation';
import AppIcon from './AppIcon.vue';

/**
 * The detail drawer.
 *
 * It is the one place where every value of a contact is visible at once: the full
 * method list with copy and dial actions, the company data, the note and the three
 * timestamps that describe the lifecycle of the record.
 */
const contact = computed(() => book.detail);

/** Methods in their stored order. */
const methods = computed(() => (contact.value ? contact.value.methods : []));

/** The group chip colour. */
const groupStyle = computed(() => ({
  '-chip-color': (contact.value && contact.value.groupColor) || '#64748b',
}));

const avatarStyle = computed(() => ({
  background: (contact.value && contact.value.avatarColor) || '#4f46e5',
}));

/** Copies one value and confirms it with a toast. */
async function copyValue(method) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(method.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = method.value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    pushToast({ tone: 'success', title: '已复制', message: method.value, duration: 2200 });
  } catch (error) {
    pushToast({ tone: 'error', title: '复制失败', message: '浏览器不允许访问剪贴板' });
  }
}

/** Opens the edit dialog for the contact currently shown. */
function editCurrent() {
  if (contact.value) {
    openEditForm(contact.value);
  }
}

/** Asks for confirmation before deleting the contact currently shown. */
function deleteCurrent() {
  if (contact.value) {
    askDelete(contact.value);
  }
}
</script>

<template>
  <Teleport to="body">
    <template v-if="contact">
      <div class="overlay" data-testid="detail-overlay" @click="closeDetail" />
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="`${contact.name} 的联系方式`"
        data-testid="detail-drawer"
      >
        <header class="drawer__head">
          <div class="drawer__top">
            <span class="drawer__eyebrow">联系人详情</span>
            <div class="drawer__actions">
              <button
                type="button"
                class="icon-button"
                title="编辑联系人"
                aria-label="编辑联系人"
                data-testid="detail-edit"
                @click="editCurrent"
              >
                <AppIcon name="edit" />
              </button>
              <button
                type="button"
                class="icon-button"
                title="关闭"
                aria-label="关闭详情"
                data-testid="detail-close"
                @click="closeDetail"
              >
                <AppIcon name="x" />
              </button>
            </div>
          </div>

          <div class="drawer__identity">
            <span class="avatar avatar--lg" :style="avatarStyle">{{ initials(contact.name) }}</span>
            <div>
              <div class="drawer__name-row">
                <h2 class="drawer__name" data-testid="detail-name">{{ contact.name }}</h2>
                <span v-if="contact.groupName" class="chip chip--group" :style="groupStyle">
                  {{ contact.groupName }}
                </span>
              </div>
              <p class="drawer__role">
                {{ [contact.company, contact.title].filter(Boolean).join(' · ') || '未填写公司与职位' }}
              </p>
            </div>
          </div>
        </header>

        <div class="drawer__body">
          <section>
            <div class="section-label">
              <span>联系方式</span>
              <span>{{ methods.length }} 条</span>
            </div>
            <div class="method-list">
              <div
                v-for="method in methods"
                :key="method.id || `${method.type}-${method.value}`"
                class="method-row"
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
                <div class="method-row__body">
                  <div class="method-row__meta">
                    <span>{{ methodStyle(method.type).label }}</span>
                    <span v-if="method.label">· {{ method.label }}</span>
                    <span v-if="method.isPrimary" class="method__primary">主要</span>
                  </div>
                  <p class="method-row__value">{{ method.value }}</p>
                </div>
                <div class="method-row__actions">
                  <button
                    type="button"
                    class="icon-button"
                    title="复制"
                    aria-label="复制"
                    @click="copyValue(method)"
                  >
                    <AppIcon name="copy" />
                  </button>
                  <a
                    v-if="methodLink(method)"
                    class="icon-button"
                    :href="methodLink(method)"
                    target="_blank"
                    rel="noopener"
                    title="打开"
                    aria-label="打开"
                  >
                    <AppIcon name="arrowRight" />
                  </a>
                </div>
              </div>
              <p v-if="methods.length === 0" class="muted">这位联系人还没有添加联系方式。</p>
            </div>
          </section>

          <section v-if="contact.note">
            <div class="section-label"><span>备注</span></div>
            <p class="note-block">{{ contact.note }}</p>
          </section>

          <section>
            <div class="section-label"><span>基本信息</span></div>
            <div class="meta-grid">
              <div class="meta-cell">
                <p class="meta-cell__label">公司</p>
                <p class="meta-cell__value">{{ contact.company || '—' }}</p>
              </div>
              <div class="meta-cell">
                <p class="meta-cell__label">职位</p>
                <p class="meta-cell__value">{{ contact.title || '—' }}</p>
              </div>
              <div class="meta-cell">
                <p class="meta-cell__label">分组</p>
                <p class="meta-cell__value">{{ contact.groupName || '未分组' }}</p>
              </div>
              <div class="meta-cell">
                <p class="meta-cell__label">联系方式</p>
                <p class="meta-cell__value">{{ methods.length }} 条</p>
              </div>
            </div>
          </section>

          <section>
            <div class="section-label"><span>记录时间</span></div>
            <div class="timeline">
              <div class="timeline__row">
                <span class="timeline__dot" />
                <span>创建于 {{ formatDateTime(contact.createdAt, true) }}</span>
              </div>
              <div class="timeline__row">
                <span class="timeline__dot timeline__dot--brand" />
                <span>最近更新 {{ formatDateTime(contact.updatedAt, true) }}</span>
              </div>
              <div v-if="contact.bookmarkedAt" class="timeline__row">
                <span class="timeline__dot timeline__dot--amber" />
                <span>收藏于 {{ formatDateTime(contact.bookmarkedAt, true) }}</span>
              </div>
            </div>
          </section>
        </div>

        <footer class="drawer__foot">
          <button
            type="button"
            class="btn btn--danger-ghost btn--sm"
            data-testid="detail-delete"
            @click="deleteCurrent"
          >
            <AppIcon name="trash" />
            删除联系人
          </button>
          <button
            type="button"
            class="btn btn--sm"
            :class="contact.isBookmarked ? 'btn--soft' : 'btn--ghost'"
            data-testid="detail-bookmark"
            @click="toggleBookmark(contact)"
          >
            <AppIcon name="star" />
            {{ contact.isBookmarked ? '已收藏，点击取消' : '加入收藏' }}
          </button>
        </footer>
      </aside>
    </template>
  </Teleport>
</template>
