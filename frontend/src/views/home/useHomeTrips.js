// HomeView 여행 목록 분류·파생 — tripStore 기반 계획/예정/과거 분류·정렬·통계.
// 상태는 tripStore에 있고 여기선 순수 파생만 한다(HomeView.spec가 통합 검증).
import { computed } from 'vue'
import { useTripStore } from '@/stores/trip'
import { TRIP_STATUS, isPastTripStatus, normalizeTripStatus } from '@/utils/tripStatus'
import { tripDurationDays } from '@/utils/tripForm'
import { dateValue, activityValue } from './homeTripPresenters.js'

// isLoggedIn: resumeTitle 문구 분기에만 쓰는 로그인 여부(ref/computed 주입).
export function useHomeTrips(isLoggedIn) {
  const tripStore = useTripStore()

  const planningTrips = computed(() =>
    tripStore.trips.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.PLANNING),
  )
  const confirmedUpcomingTrips = computed(() =>
    tripStore.trips.filter((trip) => normalizeTripStatus(trip.status) === TRIP_STATUS.UPCOMING),
  )
  const pastTrips = computed(() => tripStore.trips.filter((trip) => isPastTripStatus(trip.status)))

  const sortedPlanningTrips = computed(() =>
    [...planningTrips.value].sort((a, b) => activityValue(b) - activityValue(a)),
  )
  const sortedUpcomingTrips = computed(() =>
    [...confirmedUpcomingTrips.value].sort((a, b) => dateValue(a.startDate) - dateValue(b.startDate)),
  )
  const sortedPastTrips = computed(() =>
    [...pastTrips.value].sort(
      (a, b) => dateValue(b.endDate || b.startDate) - dateValue(a.endDate || a.startDate),
    ),
  )

  const resumeTrip = computed(() => sortedPlanningTrips.value[0] || null)
  const upcomingTrips = computed(() => sortedUpcomingTrips.value.slice(0, 2))
  const hasPlanningTrips = computed(() => planningTrips.value.length > 0)
  const resumeTitle = computed(() => {
    if (!isLoggedIn.value) return '새 여행 시작하기'
    return hasPlanningTrips.value ? '이어서 계획하기' : '새 여행 계획하기'
  })
  const displayPastTrips = computed(() => sortedPastTrips.value)
  const totalTrips = computed(() => tripStore.trips.length)
  const totalDays = computed(() =>
    tripStore.trips.reduce((sum, trip) => sum + tripDurationDays(trip), 0),
  )

  return {
    planningTrips,
    pastTrips,
    resumeTrip,
    upcomingTrips,
    resumeTitle,
    displayPastTrips,
    totalTrips,
    totalDays,
  }
}
