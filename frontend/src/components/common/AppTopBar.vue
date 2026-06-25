<script setup>
import { ref } from 'vue'

import BaseButton from './BaseButton.vue'
import AccountDialog from './AccountDialog.vue'

const accountOpen = ref(false)

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
  showDefaultAction: {
    type: Boolean,
    default: true,
  },
})

defineEmits(['create-trip'])
</script>

<template>
  <header class="ds-topbar">
    <div class="ds-topbar__inner">
      <RouterLink class="ds-topbar__logo" to="/">Trip<b>Log</b></RouterLink>
      <nav class="ds-tabs" aria-label="주요 메뉴">
        <RouterLink to="/" :class="{ 'is-active': active === 'home' }">HOME</RouterLink>
        <RouterLink to="/trips" :class="{ 'is-active': active === 'trips' }">TRIPS</RouterLink>
        <RouterLink v-if="showLogs" to="/logs" :class="{ 'is-active': active === 'logs' }">
          LOGS
        </RouterLink>
      </nav>
      <div v-if="showSearch" class="ds-topbar__search" aria-label="검색 예시">
        <span>{{ searchPlaceholder }}</span>
      </div>
      <div class="ds-topbar__actions">
        <slot name="actions">
          <BaseButton v-if="showDefaultAction" variant="primary" @click="$emit('create-trip')">
            새 여행
          </BaseButton>
        </slot>
      </div>
      <button type="button" class="ds-avatar" aria-label="프로필" @click="accountOpen = true">
        {{ userInitial }}
      </button>
    </div>
    <AccountDialog v-model="accountOpen" />
  </header>
</template>
