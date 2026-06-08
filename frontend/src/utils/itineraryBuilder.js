export const ROUTE_MODE_OPTIONS = [
  { label: '도보', value: 'walk' },
  { label: '버스', value: 'bus' },
  { label: '지하철', value: 'subway' },
  { label: '택시', value: 'taxi' },
  { label: '자가', value: 'car' },
]

export const DEFAULT_ROUTE_MODE = ROUTE_MODE_OPTIONS[0].value

export function createRouteEdge(from, to, day = 1, mode = DEFAULT_ROUTE_MODE) {
  return {
    id: `${day}:${from}->${to}`,
    from,
    to,
    day,
    mode,
  }
}

export function appendRouteEdge(edges, from, to, day = 1, mode = DEFAULT_ROUTE_MODE) {
  const check = canConnectRouteEdge(edges, from, to, day)
  if (!check.ok) {
    return { edges, added: false, reason: check.reason }
  }

  return {
    edges: [...edges, createRouteEdge(from, to, day, mode)],
    added: true,
    reason: '',
  }
}

export function canConnectRouteEdge(edges, from, to, day = 1) {
  if (!from || !to) {
    return { ok: false, reason: '출발지와 도착지를 선택해주세요.' }
  }

  if (from === to) {
    return { ok: false, reason: '같은 장소는 연결할 수 없습니다.' }
  }

  const dayEdges = edges.filter((edge) => edge.day === day)
  if (dayEdges.some((edge) => edge.from === from && edge.to === to)) {
    return { ok: false, reason: '이미 연결된 구간입니다.' }
  }

  if (dayEdges.some((edge) => edge.from === from)) {
    return { ok: false, reason: '출발 장소는 다음 장소를 하나만 가질 수 있습니다.' }
  }

  if (dayEdges.some((edge) => edge.to === to)) {
    return { ok: false, reason: '도착 장소는 이전 장소를 하나만 가질 수 있습니다.' }
  }

  if (dayEdges.length > 0) {
    const connectedIds = new Set(dayEdges.flatMap((edge) => [edge.from, edge.to]))
    if (!connectedIds.has(from) && !connectedIds.has(to)) {
      return { ok: false, reason: '기존 경로와 이어지는 장소만 연결할 수 있습니다.' }
    }
  }

  if (wouldCreateCycle(dayEdges, from, to)) {
    return { ok: false, reason: '경로는 순환할 수 없습니다.' }
  }

  return { ok: true, reason: '' }
}

export function removeRouteEdge(edges, edgeId) {
  return edges.filter((edge) => edge.id !== edgeId)
}

export function updateRouteMode(edges, edgeId, mode) {
  return edges.map((edge) => (edge.id === edgeId ? { ...edge, mode } : edge))
}

export function getRouteOrder(edges, day = 1) {
  const dayEdges = edges.filter((edge) => edge.day === day)
  if (dayEdges.length === 0) return []

  const fromIds = new Set(dayEdges.map((edge) => edge.from))
  const toIds = new Set(dayEdges.map((edge) => edge.to))
  const start = [...fromIds].find((id) => !toIds.has(id)) ?? dayEdges[0].from
  const nextByFrom = new Map(dayEdges.map((edge) => [edge.from, edge.to]))
  const order = [start]
  const visited = new Set(order)
  let cursor = start

  while (nextByFrom.has(cursor)) {
    const next = nextByFrom.get(cursor)
    if (visited.has(next)) break
    order.push(next)
    visited.add(next)
    cursor = next
  }

  return order
}

export function getConnectedPlaceIds(edges, day = 1) {
  return [...new Set(edges.filter((edge) => edge.day === day).flatMap((edge) => [edge.from, edge.to]))]
}

function wouldCreateCycle(edges, from, to) {
  const nextByFrom = new Map(edges.map((edge) => [edge.from, edge.to]))
  nextByFrom.set(from, to)

  const visited = new Set()
  let cursor = to
  while (nextByFrom.has(cursor)) {
    if (cursor === from) return true
    if (visited.has(cursor)) return true
    visited.add(cursor)
    cursor = nextByFrom.get(cursor)
  }

  return false
}
