// HomeView 여행 메모리(과거 여행 카드) 로드·커버 이미지 관리.
// fetch + objectURL 생성/해제 + abort를 캡슐화한다. 언마운트 시 스스로 정리.
import { ref, computed, onBeforeUnmount } from 'vue'
import { fetchCardImage, fetchMemories } from '@/api/cardApi'

export function useHomeMemories() {
  const memorySummaries = ref([])
  const memoryCoverUrls = ref({})
  let memoryController = null

  async function loadMemories() {
    memoryController?.abort()
    resetMemoryCovers()
    memoryController = new AbortController()
    const result = await fetchMemories({ signal: memoryController.signal })
    memorySummaries.value = result
    const entries = await Promise.all(
      result
        .filter((memory) => memory.coverCardId)
        .map(async (memory) => {
          const blob = await fetchCardImage(memory.coverCardId, { signal: memoryController.signal })
          return [memory.tripId, URL.createObjectURL(blob)]
        }),
    )
    memoryCoverUrls.value = Object.fromEntries(entries)
  }

  function resetMemoryCovers() {
    for (const url of Object.values(memoryCoverUrls.value)) URL.revokeObjectURL(url)
    memoryCoverUrls.value = {}
  }

  const recentMemories = computed(() =>
    memorySummaries.value.filter((memory) => memory.completed).slice(0, 3),
  )

  onBeforeUnmount(() => {
    memoryController?.abort()
    memoryController = null
    resetMemoryCovers()
  })

  return { memorySummaries, memoryCoverUrls, recentMemories, loadMemories, resetMemoryCovers }
}
