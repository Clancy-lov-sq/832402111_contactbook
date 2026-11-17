<script setup>
import { computed } from 'vue';

import { dismissToast, toasts } from '../ui/toast';
import AppIcon from './AppIcon.vue';

/** The one place that renders the toast queue. */
const iconByTone = computed(() => ({
  success: 'check',
  error: 'alert',
  info: 'sparkles',
  default: 'sparkles',
}));
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite" data-testid="toast-host">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.tone}`"
        :data-testid="`toast-${toast.tone}`"
      >
        <span class="toast__icon">
          <AppIcon :name="iconByTone[toast.tone] || 'sparkles'" />
        </span>
        <div class="toast__body">
          <p class="toast__title">{{ toast.title }}</p>
          <p v-if="toast.message" class="toast__message">{{ toast.message }}</p>
        </div>
        <button class="toast__close" type="button" aria-label="Dismiss notification" @click="dismissToast(toast.id)">
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
