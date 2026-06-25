<script setup>
// 경로 지도 (S4-LOG-01 기록 뷰) — 스키매틱. 일정 장소를 위경도로 배치해 번호 노드 + 경로선으로 보여준다.
// 실제 카카오맵 SDK 연동은 별도(키·범위 큼) — 목업처럼 경로 구조만 표현한다.
import { computed } from 'vue'

const props = defineProps({
  stops: { type: Array, default: () => [] },
})

// 위경도 → 0~100 뷰박스(패딩). x=경도(서→동), y=위도(북 위쪽). 점이 1개거나 같은 좌표면 중앙 폴백.
const nodes = computed(() => {
  const pts = props.stops.filter((s) => s.place?.latitude != null && s.place?.longitude != null)
  if (pts.length === 0) return []
  const lats = pts.map((s) => Number(s.place.latitude))
  const lngs = pts.map((s) => Number(s.place.longitude))
  const minLat = Math.min(...lats)
  const minLng = Math.min(...lngs)
  const spanLat = Math.max(...lats) - minLat || 1
  const spanLng = Math.max(...lngs) - minLng || 1
  const P = 14
  const S = 100 - P * 2
  return pts.map((s) => ({
    id: s.id,
    no: s.sortOrder,
    name: s.place.name,
    x: pts.length === 1 ? 50 : P + ((Number(s.place.longitude) - minLng) / spanLng) * S,
    y: pts.length === 1 ? 50 : P + (1 - (Number(s.place.latitude) - minLat) / spanLat) * S,
  }))
})

const polyline = computed(() => nodes.value.map((n) => `${n.x},${n.y}`).join(' '))
</script>

<template>
  <div class="map">
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" class="canvas">
      <polyline v-if="nodes.length > 1" :points="polyline" class="route" />
      <g v-for="n in nodes" :key="n.id">
        <circle :cx="n.x" :cy="n.y" r="3.4" class="node" />
        <text :x="n.x" :y="n.y + 1.2" class="node-no">{{ n.no }}</text>
      </g>
    </svg>
    <p class="caption">경로 = 계획한 일정 (스키매틱)</p>
  </div>
</template>

<style scoped>
.map {
  position: relative;
  background: linear-gradient(180deg, var(--paper-card) 0%, var(--paper-dim) 100%);
  border-radius: 14px;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.canvas {
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.route {
  fill: none;
  stroke: var(--t-plum);
  stroke-width: 0.8;
  stroke-dasharray: 2 1.6;
}
.node {
  fill: var(--accent);
  stroke: var(--on-fill);
  stroke-width: 0.8;
}
.node-no {
  fill: var(--on-fill);
  font-size: 3px;
  font-weight: 800;
  text-anchor: middle;
}
.caption {
  position: absolute;
  left: 12px;
  bottom: 10px;
  margin: 0;
  font-size: 0.75rem;
  color: var(--ink-sub);
  background: color-mix(in srgb, var(--paper-card) 70%, transparent);
  padding: 2px 8px;
  border-radius: 99px;
}
</style>
