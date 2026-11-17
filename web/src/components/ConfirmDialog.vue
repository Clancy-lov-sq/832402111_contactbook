<script setup>
import { book, cancelConfirm, confirmAction } from '../store/contactBook';
import AppIcon from './AppIcon.vue';

/** The generic confirmation dialog, used before a destructive action. */
</script>

<template>
  <Teleport to="body">
    <div v-if="book.confirm.open" class="center-dialog" data-testid="confirm-dialog">
      <div class="overlay" style="position: absolute; inset: 0" @click="cancelConfirm" />
      <div class="dialog confirm-dialog" role="alertdialog" aria-modal="true" :aria-label="book.confirm.title">
        <header class="dialog__head">
          <span
            class="dialog__icon"
            :style="book.confirm.tone === 'danger' ? 'background:#fdecec;color:#dc2626' : ''"
          >
            <AppIcon name="alert" />
          </span>
          <div>
            <h2 class="dialog__title">{{ book.confirm.title }}</h2>
            <p class="dialog__subtitle">Please confirm this action</p>
          </div>
        </header>
        <div class="confirm-dialog__body">{{ book.confirm.message }}</div>
        <footer class="dialog__foot">
          <button type="button" class="btn btn--ghost" :disabled="book.confirm.busy" @click="cancelConfirm">
            Cancel
          </button>
          <button
            type="button"
            class="btn"
            :class="book.confirm.tone === 'danger' ? 'btn--danger' : 'btn--primary'"
            :disabled="book.confirm.busy"
            data-testid="confirm-submit"
            @click="confirmAction"
          >
            <AppIcon name="trash" />
            {{ book.confirm.busy ? 'Working…' : book.confirm.confirmLabel }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
