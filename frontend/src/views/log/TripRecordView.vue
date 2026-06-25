<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchTrip } from '@/api/tripApi'
import { AppTopBar } from '@/components/common'
import TripPreviewDialog from '@/components/trip/TripPreviewDialog.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const trip = ref(null)
const dialogOpen = ref(false)
const goingEditor = ref(false)
const loading = ref(false)
const error = ref('')
const recordDialogOpen = computed({
  get: () => dialogOpen.value,
  set: (value) => {
    dialogOpen.value = value
    if (!value) closeRecord()
  },
})

onMounted(loadTrip)

async function loadTrip() {
  const tripId = Number(route.params.tripId)
  if (!Number.isInteger(tripId) || tripId <= 0) {
    error.value = '유효하지 않은 여행입니다.'
    return
  }

  loading.value = true
  error.value = ''
  try {
    trip.value = await fetchTrip(tripId)
    dialogOpen.value = true
  } catch {
    error.value = '여행 기록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function closeRecord() {
  dialogOpen.value = false
  if (goingEditor.value) return
  router.push({ name: 'trip-list' })
}

function handleOpenEditor() {
  goingEditor.value = true
}

function goPlaces(nextTrip) {
  if (!nextTrip?.id) return
  router.push({ name: 'trip-place-search', params: { tripId: nextTrip.id } })
}

function userInitial() {
  const user = auth.user
  const name = user?.nickname || user?.name || user?.email?.split('@')[0] || 'T'
  return name.slice(0, 1).toUpperCase()
}
</script>

<template>
  <div class="record-page page-bg">
    <AppTopBar
      active="logs"
      show-logs
      :show-search="false"
      :show-default-action="false"
      :user-initial="userInitial()"
    />
    <main class="record-page__body page-canvas">
      <p v-if="loading" class="record-page__state">여행 기록을 불러오는 중입니다.</p>
      <p v-else-if="error" class="record-page__state is-error">{{ error }}</p>
    </main>

    <TripPreviewDialog
      v-model="recordDialogOpen"
      :trip="trip"
      @open-places="goPlaces"
      @open-editor="handleOpenEditor"
      @deleted="closeRecord"
      @updated="trip = $event"
    />
  </div>
</template>

<style scoped>
.record-page__body {
  min-height: 320px;
}

.record-page__state {
  color: var(--ink-sub);
  font-size: 13px;
  font-weight: 700;
  margin: 0;
  padding: 28px 0;
}

.record-page__state.is-error {
  color: var(--complete);
}
</style>
