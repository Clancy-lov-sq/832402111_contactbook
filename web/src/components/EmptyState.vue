<script setup>
import AppIcon from './AppIcon.vue';

/** The illustration shown when a view has no contact to display. */
defineProps({
  filtered: { type: Boolean, default: false },
  keyword: { type: String, default: '' },
});

const emit = defineEmits(['create', 'clear']);
</script>

<template>
  <div class="empty" data-testid="empty-state">
    <span class="empty__art">
      <AppIcon :name="filtered ? 'search' : 'users'" />
    </span>
    <template v-if="filtered">
      <h2 class="empty__title">没有匹配的联系人</h2>
      <p class="empty__text">
        当前筛选条件没有结果<span v-if="keyword">（关键词“{{ keyword }}”）</span>。
        试试换一个关键词，或者清除筛选看看全部联系人。
      </p>
      <div class="empty__actions">
        <button type="button" class="btn btn--ghost" data-testid="empty-clear" @click="emit('clear')">
          清除筛选
        </button>
        <button type="button" class="btn btn--primary" @click="emit('create')">
          <AppIcon name="plus" />
          新建联系人
        </button>
      </div>
    </template>
    <template v-else>
      <h2 class="empty__title">通讯录还是空的</h2>
      <p class="empty__text">
        添加第一位联系人，或者导入一份已经整理好的 Excel 表格。收藏的联系人会排在“我的收藏”里，随时可以快速找到。
      </p>
      <div class="empty__actions">
        <button type="button" class="btn btn--primary" data-testid="empty-create" @click="emit('create')">
          <AppIcon name="plus" />
          新建联系人
        </button>
      </div>
    </template>
  </div>
</template>
