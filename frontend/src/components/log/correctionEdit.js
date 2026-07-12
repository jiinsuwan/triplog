// 외곽선 보정 팝업(CorrectionDialog.vue)의 상호작용 상수 + 순수 뷰 헬퍼.
// template·script 양쪽에 흩어진 매직 스트링을 한 곳으로 모아 드리프트를 막는다.
// (SFC template 은 JS import 를 못 하므로, 컴포넌트는 이 상수들을 import 해
//  <script setup> top-level 바인딩으로 노출한다 → template 이 그 이름을 참조.)
import { clamp01 } from '@/card/outlineEdit'

// 최상위 모드: 추가(대상 잡기) / 보정(모양 다듬기·삭제).
export const MODE = { ADD: 'add', EDIT: 'edit' }
// 추가 도구 = drag 제스처 종류와 동일 토큰(점 클릭 / 박스 드래그).
export const ADD_TOOL = { TAP: 'tap', BOX: 'box' }
// 정제 점 종류 = plusMinus 토글 값(포함 / 제외).
export const MARK = { PLUS: 'plus', MINUS: 'minus' }
// item.src — 사용자가 직접 잡은 대상 / 자동 인식 대상.
export const ITEM_SRC = { USER: 'user', AUTO: 'auto' }
// 인라인 안내 종류. 값은 그대로 CSS 클래스(.cd-notice.info / .error)로도 쓰이므로 바꾸지 말 것.
export const NOTICE = { INFO: 'info', ERROR: 'error' }

// 보정 API 에러 → 사용자 안내 문구.
export function correctionError(e) {
  const status = e?.response?.status
  if (status === 503) return '인식 서버가 잠깐 응답하지 않아요. 잠시 후 다시 시도해 주세요.'
  if (status === 409) return '아직 자동 외곽선을 만드는 중이에요. 잠시 후 다시 시도해 주세요.'
  return '처리에 실패했어요. 잠시 후 다시 시도해 주세요.'
}

// 정제 커서 SVG data URL. fill=원 색, plus=십자(포함) 여부(제외는 가로선만).
export function dotCursor(fill, plus) {
  const cross = plus
    ? "<line x1='15' y1='9.5' x2='15' y2='20.5' stroke='white' stroke-width='2.6'/><line x1='9.5' y1='15' x2='20.5' y2='15' stroke='white' stroke-width='2.6'/>"
    : "<line x1='9.5' y1='15' x2='20.5' y2='15' stroke='white' stroke-width='2.6'/>"
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'>` +
    `<circle cx='15' cy='15' r='10' fill='${fill}' stroke='white' stroke-width='2.4'/>${cross}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 15 15, crosshair`
}

// object-fit:contain 으로 레터박스된 캔버스에서 클라이언트 좌표 → 사진 정규화 0~1.
// rect = 캔버스 getBoundingClientRect(표시 박스), iw/ih = 캔버스 내부 해상도(사진 픽셀).
// 실제 그려진 이미지 영역(레터박스 보정)을 기준으로 환산해야 클릭 위치와 점이 일치한다.
export function letterboxPoint(rect, iw, ih, clientX, clientY) {
  const scale = Math.min(rect.width / iw, rect.height / ih)
  const dw = iw * scale
  const dh = ih * scale
  const offX = (rect.width - dw) / 2
  const offY = (rect.height - dh) / 2
  return [clamp01((clientX - rect.left - offX) / dw), clamp01((clientY - rect.top - offY) / dh)]
}
