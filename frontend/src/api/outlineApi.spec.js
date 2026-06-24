import { describe, it, expect, vi, beforeEach } from 'vitest'

// outlineApi 는 공용 instance 위의 얇은 래퍼다. 인스턴스를 목으로 대체해
// "어떤 호출을 어떤 인자로 보내고 응답을 어떻게 언랩하는지"만 검증한다(계약 고정).
vi.mock('@/api/instance', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import instance from '@/api/instance'
import {
  tapOutline,
  boxOutline,
  previewRefine,
  applyRefine,
  deleteOutlineItem,
} from '@/api/outlineApi'

function ok(data) {
  return Promise.resolve({ data: { code: 'SUCCESS', message: '', data } })
}

describe('outlineApi 보정', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tapOutline: point 바디로 POST 하고 {itemId,polygons} 를 언랩한다', async () => {
    instance.post.mockReturnValue(ok({ itemId: 3, polygons: [[[0.1, 0.1]]] }))

    const res = await tapOutline(7, [0.5, 0.5])

    expect(res).toEqual({ itemId: 3, polygons: [[[0.1, 0.1]]] })
    expect(instance.post).toHaveBeenCalledWith(
      '/photos/7/outline/tap',
      { point: [0.5, 0.5] },
      { signal: undefined },
    )
  })

  it('boxOutline: box 바디로 POST 한다', async () => {
    instance.post.mockReturnValue(ok({ itemId: 4, polygons: [[[0.2, 0.2]]] }))

    await boxOutline(7, [0.1, 0.1, 0.5, 0.5])

    expect(instance.post).toHaveBeenCalledWith(
      '/photos/7/outline/box',
      { box: [0.1, 0.1, 0.5, 0.5] },
      { signal: undefined },
    )
  })

  it('previewRefine: {itemId,pos,neg} 바디로 POST 하고 {itemId,polygons,absorbItemIds} 를 언랩한다', async () => {
    instance.post.mockReturnValue(ok({ itemId: 5, polygons: [[[0.2, 0.2]]], absorbItemIds: [9] }))

    const res = await previewRefine(7, { itemId: 5, pos: [[0.5, 0.5]], neg: [] })

    expect(res).toEqual({ itemId: 5, polygons: [[[0.2, 0.2]]], absorbItemIds: [9] })
    expect(instance.post).toHaveBeenCalledWith(
      '/photos/7/outline/refine',
      { itemId: 5, pos: [[0.5, 0.5]], neg: [] },
      { signal: undefined },
    )
  })

  it('applyRefine: {itemId,polygons,absorbItemIds} 바디로 /refine/apply 에 POST 한다', async () => {
    instance.post.mockReturnValue(ok({ itemId: 5, polygons: [[[0.2, 0.2]]] }))

    const res = await applyRefine(7, { itemId: 5, polygons: [[[0.2, 0.2]]], absorbItemIds: [9] })

    expect(res.itemId).toBe(5)
    expect(instance.post).toHaveBeenCalledWith(
      '/photos/7/outline/refine/apply',
      { itemId: 5, polygons: [[[0.2, 0.2]]], absorbItemIds: [9] },
      { signal: undefined },
    )
  })

  it('tapOutline: no-op 응답(itemId -1)을 그대로 반환한다', async () => {
    instance.post.mockReturnValue(ok({ itemId: -1, polygons: [] }))

    const res = await tapOutline(7, [0.5, 0.5])

    expect(res.itemId).toBe(-1)
    expect(res.polygons).toEqual([])
  })

  it('deleteOutlineItem: DELETE 를 itemId 경로로 호출한다', async () => {
    instance.delete.mockResolvedValue({ data: { code: 'SUCCESS' } })

    await deleteOutlineItem(7, 3)

    expect(instance.delete).toHaveBeenCalledWith('/photos/7/outline/items/3', { signal: undefined })
  })
})
