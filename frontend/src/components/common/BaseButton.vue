<script setup>
defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'primary', 'ghost', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'small'].includes(value),
  },
  block: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    default: 'button',
  },
})

defineEmits(['click'])
</script>

<template>
  <button
    class="ds-btn"
    :class="{
      'ds-btn--primary': variant === 'primary',
      'ds-btn--ghost': variant === 'ghost',
      'ds-btn--danger': variant === 'danger',
      'ds-btn--small': size === 'small',
      'ds-btn--block': block,
    }"
    :type="type"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
