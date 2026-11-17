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
      <h2 class="empty__title">No matching contacts</h2>
      <p class="empty__text">
        No contact matches the current filters<span v-if="keyword"> (keyword “{{ keyword }}”)</span>.
        Try another keyword or clear the filters.
      </p>
      <div class="empty__actions">
        <button type="button" class="btn btn--ghost" data-testid="empty-clear" @click="emit('clear')">
          Clear filters
        </button>
        <button type="button" class="btn btn--primary" @click="emit('create')">
          <AppIcon name="plus" />
          New contact
        </button>
      </div>
    </template>
    <template v-else>
      <h2 class="empty__title">Your address book is empty</h2>
      <p class="empty__text">
        Add the first contact, or import a prepared Excel workbook. Bookmarked contacts
        stay in Favorites for quick access.
      </p>
      <div class="empty__actions">
        <button type="button" class="btn btn--primary" data-testid="empty-create" @click="emit('create')">
          <AppIcon name="plus" />
          New contact
        </button>
      </div>
    </template>
  </div>
</template>
