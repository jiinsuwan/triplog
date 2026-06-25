import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/instance', () => ({
  default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}))

import instance from '@/api/instance'
import {
  deleteTripCard,
  fetchCardCaption,
  fetchCardImage,
  fetchMemories,
  fetchTripCards,
  saveTripCard,
} from '@/api/cardApi'

function ok(data) {
  return Promise.resolve({ data: { code: 'SUCCESS', message: '', data } })
}

describe('cardApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetchCardCaption: 긴 AI 호출은 timeout 없이 대기하고 data.data 를 반환한다', async () => {
    const resultBody = { response: { objects: [] }, warnings: [] }
    const controller = new AbortController()
    instance.post.mockReturnValue(ok(resultBody))

    const result = await fetchCardCaption(3, { signal: controller.signal })

    expect(result).toEqual(resultBody)
    expect(instance.post).toHaveBeenCalledWith('/photos/3/card-caption', null, {
      signal: controller.signal,
      timeout: 0,
    })
  })

  it('saveTripCard: photoId 와 PNG 파일을 multipart 로 업로드한다', async () => {
    const saved = { id: 9, tripId: 7, photoId: 3 }
    const blob = new Blob(['png'], { type: 'image/png' })
    const controller = new AbortController()
    instance.post.mockReturnValue(ok(saved))

    const result = await saveTripCard(7, 3, blob, { signal: controller.signal })

    expect(result).toEqual(saved)
    const [url, body, config] = instance.post.mock.calls[0]
    expect(url).toBe('/trips/7/cards')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('photoId')).toBe('3')
    expect(body.get('file')).toBeInstanceOf(File)
    expect(body.get('file').name).toBe('triplog-card-3.png')
    expect(config.signal).toBe(controller.signal)
    expect(config.timeout).toBe(0)
  })

  it('fetchTripCards: 여행별 저장 카드를 반환한다', async () => {
    instance.get.mockReturnValue(ok([{ id: 1 }, { id: 2 }]))

    const result = await fetchTripCards(7)

    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(instance.get).toHaveBeenCalledWith('/trips/7/cards', { signal: undefined })
  })

  it('fetchMemories: 추억 목록을 반환한다', async () => {
    const controller = new AbortController()
    instance.get.mockReturnValue(ok([{ tripId: 7, cardCount: 1 }]))

    const result = await fetchMemories({ signal: controller.signal })

    expect(result).toEqual([{ tripId: 7, cardCount: 1 }])
    expect(instance.get).toHaveBeenCalledWith('/memories', { signal: controller.signal })
  })

  it('fetchCardImage: raw blob 을 그대로 반환한다', async () => {
    const blob = new Blob(['binary'], { type: 'image/png' })
    instance.get.mockResolvedValue({ data: blob })

    const result = await fetchCardImage(11)

    expect(result).toBe(blob)
    expect(instance.get).toHaveBeenCalledWith('/cards/11/image', {
      signal: undefined,
      responseType: 'blob',
    })
  })

  it('deleteTripCard: 카드 삭제 API를 호출한다', async () => {
    instance.delete.mockReturnValue(ok(null))

    await deleteTripCard(11)

    expect(instance.delete).toHaveBeenCalledWith('/cards/11')
  })
})
