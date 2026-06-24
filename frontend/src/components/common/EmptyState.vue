<script setup>
import BaseButton from './BaseButton.vue'

defineProps({
  icon: {
    type: String,
    default: 'TL',
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  actionLabel: {
    type: String,
    default: '',
  },
})

defineEmits(['action'])
</script>

<template>
  <section class="ds-empty-state">
    <div class="ds-empty-state__icon" aria-hidden="true">{{ icon }}</div>
    <div class="ds-empty-state__title">{{ title }}</div>
    <div v-if="description" class="ds-empty-state__description">{{ description }}</div>
    <BaseButton v-if="actionLabel" variant="primary" @click="$emit('action')">
      {{ actionLabel }}
    </BaseButton>
  </section>
</template>
