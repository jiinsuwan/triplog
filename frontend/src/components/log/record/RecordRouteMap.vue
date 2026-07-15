<script setup>
// 경로 지도 (S4-LOG-01 기록 뷰) — 스키매틱. 일정 장소를 위경도로 배치해 번호 노드 + 경로선으로 보여준다.
// 실제 카카오맵 SDK 연동은 별도(키·범위 큼) — 목업처럼 경로 구조만 표현한다.
import { computed } from 'vue'
import { projectStopsToViewBox } from './recordShared.js'

const props = defineProps({
  stops: { type: Array, default: () => [] },
  // bare: 배경·최소높이 없이 부모 컨테이너를 채운다(RecordPlacementBody 처럼 자체 프레임이 있는 화면용).
  bare: { type: Boolean, default: false },
  // caption: 하단 안내 문구. 빈 문자열이면 숨긴다(부모가 자체 범례를 가질 때).
  caption: { type: String, default: '경로 = 계획한 일정 (스키매틱)' },
})

// 위경도 → 0~100 뷰박스 투영(recordShared 공유 로직 — RecordPlacementBody 지도와 동일 수식).
const nodes = computed(() => projectStopsToViewBox(props.stops))

const polyline = computed(() => nodes.value.map((n) => `${n.x},${n.y}`).join(' '))
</script>

<template>
  <div class="map" :class="{ bare }">
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" class="canvas">
      <polyline v-if="nodes.length > 1" :points="polyline" class="route" />
      <g v-for="n in nodes" :key="n.id">
        <circle :cx="n.x" :cy="n.y" r="3.4" class="node" />
        <text :x="n.x" :y="n.y + 1.2" class="node-no">{{ n.no }}</text>
      </g>
    </svg>
    <p v-if="caption" class="caption">{{ caption }}</p>
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
/* bare — 부모가 프레임(배경·테두리·범례)을 그리는 경우: 투명하게 컨테이너만 채운다.
   RecordPlacementBody(logs-mockup ①)가 쓰던 기존 시각(경로선 accent·노드 3.6·모노 숫자)을
   그대로 유지한다 — 교체 전후 픽셀 동일(#147 behavior-preserving). */
.map.bare {
  position: absolute;
  inset: 0;
  background: none;
  border-radius: 0;
  min-height: 0;
}
.map.bare .canvas {
  min-height: 0;
}
.map.bare .route {
  stroke: var(--accent);
  opacity: 0.7;
}
.map.bare .node {
  r: 3.6;
  stroke-width: 0.9;
}
.map.bare .node-no {
  font-family: var(--font-mono);
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
