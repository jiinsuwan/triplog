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
    class="btn"
    :class="{
      pri: variant === 'primary',
      ghost: variant === 'ghost',
      danger: variant === 'danger',
      sm: size === 'small',
      block,
    }"
    :type="type"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
