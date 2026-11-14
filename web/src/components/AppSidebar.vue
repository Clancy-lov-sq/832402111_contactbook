<script setup>
import { computed } from 'vue';

import {
  book,
  showAll,
  showBookmarks,
  showGroup,
} from '../store/contactBook';
import AppIcon from './AppIcon.vue';

/**
 * The navigation rail.
 *
 * The counts come from the same statistics object the listing refreshes, so the
 * sidebar can never show a stale number after a create, a delete or an import.
 */
const total = computed(() => book.stats.total);
const bookmarked = computed(() => book.stats.bookmarked);
const groups = computed(() => book.stats.groups);

/** Whether the "all contacts" entry is active. */
const allActive = computed(
  () => !book.filters.bookmarked && book.filters.groupId === 'all' && !book.filters.keyword,
);

/** Whether the "bookmarks" entry is active. */
const bookmarksActive = computed(() => book.filters.bookmarked);
</script>

<template>
  <aside class="sidebar" aria-label="通讯录导航">
    <div class="brand">
      <span class="brand__mark">
        <AppIcon name="users" />
      </span>
      <div class="brand__text">
        <p class="brand__name">
          ContactBook
          <span class="brand__tag">v1</span>
        </p>
        <p class="brand__caption">通讯录 · 收藏与 Excel 双向同步</p>
      </div>
    </div>

    <nav class="sidebar__section" aria-label="视图">
      <button
        type="button"
        class="nav-item"
        :class="{ 'is-active': allActive }"
        data-testid="nav-all"
        @click="showAll()"
      >
        <span class="nav-item__icon"><AppIcon name="inbox" /></span>
        <span class="nav-item__label">全部联系人</span>
        <span class="nav-item__count">{{ total }}</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ 'is-active': bookmarksActive }"
        data-testid="nav-bookmarks"
        @click="showBookmarks()"
      >
        <span class="nav-item__icon"><AppIcon name="star" /></span>
        <span class="nav-item__label">我的收藏</span>
        <span class="nav-item__count">{{ bookmarked }}</span>
      </button>
    </nav>

    <div class="sidebar__section">
      <p class="sidebar__label">分组</p>
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="nav-item"
        :class="{ 'is-active': !book.filters.bookmarked && book.filters.groupId === group.id }"
        :data-testid="`nav-group-${group.id}`"
        @click="showGroup(group.id)"
      >
        <span class="nav-item__icon">
          <span class="group-dot" :style="{ background: group.color, color: group.color }" />
        </span>
        <span class="nav-item__label">{{ group.name }}</span>
        <span class="nav-item__count">{{ group.contactCount }}</span>
      </button>
    </div>

    <div class="sidebar__spacer" />

    <div class="sidebar-card">
      <p class="sidebar-card__title">本周动态</p>
      <div class="sidebar-card__grid">
        <div>
          <p class="sidebar-card__value">{{ book.stats.updatedLastWeek }}</p>
          <p class="sidebar-card__caption">更新过的联系人</p>
        </div>
        <div>
          <p class="sidebar-card__value">{{ book.stats.methodCount }}</p>
          <p class="sidebar-card__caption">条联系方式</p>
        </div>
      </div>
      <div class="sidebar-card__footer">
        <span class="pulse-dot" />
        SQLite 数据库已连接
      </div>
    </div>

    <p class="sidebar__hint">
      按 <kbd>Ctrl</kbd> + <kbd>K</kbd> 直接搜索姓名、电话或邮箱。
    </p>
  </aside>
</template>
