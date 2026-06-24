<script setup>
import BaseButton from './BaseButton.vue'

defineProps({
  active: {
    type: String,
    default: 'trips',
    validator: (value) => ['home', 'trips', 'logs'].includes(value),
  },
  showSearch: {
    type: Boolean,
    default: true,
  },
  searchPlaceholder: {
    type: String,
    default: '여행 검색',
  },
  userInitial: {
    type: String,
    default: 'T',
  },
  showLogs: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['create-trip'])
</script>

<template>
  <header class="topbar">
    <RouterLink class="logo" to="/">Trip<b>Log</b></RouterLink>
    <nav class="tabs" aria-label="주요 메뉴">
      <RouterLink to="/" :class="{ on: active === 'home' }">HOME</RouterLink>
      <RouterLink to="/trips" :class="{ on: active === 'trips' }">TRIPS</RouterLink>
      <RouterLink v-if="showLogs" to="/logs" :class="{ on: active === 'logs' }">LOGS</RouterLink>
    </nav>
    <div v-if="showSearch" class="search" role="search">
      <span aria-hidden="true">Search</span>
      <span>{{ searchPlaceholder }}</span>
    </div>
    <slot name="actions">
      <BaseButton variant="primary" @click="$emit('create-trip')">새 여행</BaseButton>
    </slot>
    <RouterLink class="avatar" to="/profile" aria-label="프로필">{{ userInitial }}</RouterLink>
  </header>
</template>
