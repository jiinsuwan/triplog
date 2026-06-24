<script setup>
import BaseButton from './BaseButton.vue'

defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="scrim" role="presentation" @click.self="close">
      <section class="modal base-modal" role="dialog" aria-modal="true" :aria-label="title">
        <header class="base-modal__header">
          <h2>{{ title }}</h2>
          <BaseButton variant="ghost" size="small" aria-label="닫기" @click="close">닫기</BaseButton>
        </header>
        <div class="base-modal__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="base-modal__footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.base-modal {
  width: min(560px, 92vw);
}

.base-modal__header,
.base-modal__footer {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 16px 18px;
}

.base-modal__header {
  border-bottom: 1px solid var(--line);
}

.base-modal__header h2 {
  font-size: 18px;
  letter-spacing: 0;
}

.base-modal__body {
  padding: 18px;
}

.base-modal__footer {
  border-top: 1px solid var(--line);
  justify-content: flex-end;
}
</style>
