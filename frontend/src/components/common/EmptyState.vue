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
  <section class="empty-state">
    <div class="ic" aria-hidden="true">{{ icon }}</div>
    <div class="et">{{ title }}</div>
    <div v-if="description" class="ed">{{ description }}</div>
    <BaseButton v-if="actionLabel" variant="primary" @click="$emit('action')">
      {{ actionLabel }}
    </BaseButton>
  </section>
</template>
