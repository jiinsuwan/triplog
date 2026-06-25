// CardEditor 캔버스 보조 드로잉.
// Vue 상태와 분리된 순수 Canvas 함수만 둔다. 에디터 SFC는 상태 조율과 이벤트 처리에 집중한다.

export const TEXT_LH = 1.4

export function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

export function paintEditorText(ctx, t, { W, H, fontFamily, fontScale }) {
  const size = Math.round(W * 0.05 * fontScale)
  const lines = String(t.text ?? '').split('\n')
  const lh = size * TEXT_LH
  ctx.save()
  ctx.translate(t.x * W, t.y * H)
  ctx.rotate(((t.rotation ?? 0) * Math.PI) / 180)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${size}px "${fontFamily}", sans-serif`
  ctx.lineWidth = Math.max(2, W * 0.004)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.fillStyle = t.color ?? '#ffffff'
  const y0 = -((lines.length - 1) * lh) / 2
  lines.forEach((ln, i) => {
    const y = y0 + i * lh
    ctx.strokeText(ln, 0, y)
    ctx.fillText(ln, 0, y)
  })
  ctx.restore()
}

export function measureEditorText(ctx, t, { W, fontFamily, fontScale }) {
  const size = W * 0.05 * fontScale
  ctx.font = `${Math.round(size)}px "${fontFamily}", sans-serif`
  const lines = String(t.text || ' ').split('\n')
  const lh = size * TEXT_LH
  const tw = Math.max(...lines.map((ln) => ctx.measureText(ln || ' ').width))
  const totalH = Math.max(lh, lines.length * lh)
  return { size, hw: tw / 2 + size * 0.3, hh: totalH / 2 + size * 0.08, rotOff: Math.max(20, W * 0.032) }
}

export function drawEditorTextBox(ctx, t, { W, H, fontFamily, fontScale }) {
  const m = measureEditorText(ctx, t, { W, fontFamily, fontScale })
  const r = Math.max(6, W * 0.011) * 0.5
  ctx.save()
  ctx.translate(t.x * W, t.y * H)
  ctx.rotate(((t.rotation ?? 0) * Math.PI) / 180)
  ctx.strokeStyle = '#3182f6'
  ctx.lineWidth = Math.max(1.5, W * 0.002)
  ctx.setLineDash([W * 0.006, W * 0.004])
  ctx.strokeRect(-m.hw, -m.hh, m.hw * 2, m.hh * 2)
  ctx.setLineDash([])
  const rotY = -m.hh - m.rotOff
  ctx.beginPath()
  ctx.moveTo(0, -m.hh)
  ctx.lineTo(0, rotY)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const [hx, hy] of [[-m.hw, -m.hh], [m.hw, -m.hh], [m.hw, m.hh], [-m.hw, m.hh]]) {
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, rotY, r, 0, Math.PI * 2)
  ctx.fillStyle = '#3182f6'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.restore()
}

export function drawSelectionBox(ctx, box, rotDeg, { W, H, handleScale = 0.5 }) {
  const cx = box.cx * W
  const cy = box.cy * H
  const hw = box.hw * W
  const hh = box.hh * H
  const r = Math.max(6, W * 0.011) * handleScale
  const rotOff = Math.max(20, W * 0.032)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotDeg * Math.PI) / 180)
  ctx.strokeStyle = '#3182f6'
  ctx.lineWidth = Math.max(1.5, W * 0.002)
  ctx.setLineDash([W * 0.006, W * 0.004])
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
  ctx.setLineDash([])
  const rotY = -hh - rotOff
  ctx.beginPath()
  ctx.moveTo(0, -hh)
  ctx.lineTo(0, rotY)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const [hx, hy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, rotY, r, 0, Math.PI * 2)
  ctx.fillStyle = '#3182f6'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.restore()
}

export function boxHandleAt(box, rotDeg, nx, ny, { W, H }) {
  const cx = box.cx * W
  const cy = box.cy * H
  const hw = box.hw * W
  const hh = box.hh * H
  const rotOff = Math.max(20, W * 0.032)
  const hr = Math.max(11, W * 0.02)
  const rad = (rotDeg * Math.PI) / 180
  const dx = nx * W - cx
  const dy = ny * H - cy
  const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
  const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad)
  if (Math.hypot(lx, ly - (-hh - rotOff)) < hr) return 'rotate'
  if ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].some(([hx, hy]) => Math.hypot(lx - hx, ly - hy) < hr)) return 'resize'
  return null
}

// 스티커 = 정사각 두들. scale 1 = 카드 폭의 STICKER_BASE 만큼. 흰색 이미지로 그린다.
export const STICKER_BASE = 0.14

// 스티커 박스(캔버스 0~1 중심·반폭). 정사각(px)이라 hw=W기준, hh=H기준으로 나눈다.
export function stickerBox(s, { W, H }) {
  const px = W * STICKER_BASE * (s.scale ?? 1)
  return { cx: s.x, cy: s.y, hw: px / 2 / W, hh: px / 2 / H }
}

export function paintEditorSticker(ctx, s, img, { W, H }) {
  if (!img) return
  const px = W * STICKER_BASE * (s.scale ?? 1)
  ctx.save()
  ctx.translate(s.x * W, s.y * H)
  ctx.rotate(((s.rotation ?? 0) * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0,0,0,0.45)' // 밝은 사진 위에서도 흰 선이 읽히게 옅은 그림자
  ctx.shadowBlur = Math.max(2, px * 0.05)
  ctx.drawImage(img, -px / 2, -px / 2, px, px)
  ctx.restore()
}

export function arrowHead(ctx, tipX, tipY, fromX, fromY, size) {
  const a = Math.atan2(tipY - fromY, tipX - fromX)
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - size * Math.cos(a - 0.42), tipY - size * Math.sin(a - 0.42))
  ctx.lineTo(tipX - size * Math.cos(a + 0.42), tipY - size * Math.sin(a + 0.42))
  ctx.closePath()
  ctx.fill()
}

export function paintEditorLine(ctx, l, { W, H }) {
  const x1 = l.x1 * W, y1 = l.y1 * H, x2 = l.x2 * W, y2 = l.y2 * H
  const lw = Math.max(3, W * 0.008 * (l.width ?? 1))
  const dash = l.style === 'dashed' ? [lw * 2.5, lw * 1.8] : []
  const drawStroke = (color, width, headSize) => {
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
    if (l.arrow === 'end' || l.arrow === 'both') arrowHead(ctx, x2, y2, x1, y1, headSize)
    if (l.arrow === 'both') arrowHead(ctx, x1, y1, x2, y2, headSize)
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const halo = lw + Math.max(2, lw * 0.8)
  drawStroke('rgba(0,0,0,0.55)', halo, halo * 2.6)
  drawStroke(l.color ?? '#ffffff', lw, lw * 3.4)
  ctx.restore()
}

export function lineRotHandle(l, { W, H }) {
  const mx = ((l.x1 + l.x2) / 2) * W, my = ((l.y1 + l.y2) / 2) * H
  const dxp = (l.x2 - l.x1) * W, dyp = (l.y2 - l.y1) * H
  const len = Math.hypot(dxp, dyp) || 1
  const off = Math.max(22, W * 0.035)
  return [mx + (-dyp / len) * off, my + (dxp / len) * off]
}

export function nearLine(l, nx, ny) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1
  const len2 = dx * dx + dy * dy || 1e-6
  let tt = ((nx - l.x1) * dx + (ny - l.y1) * dy) / len2
  tt = Math.max(0, Math.min(1, tt))
  const px = l.x1 + tt * dx, py = l.y1 + tt * dy
  return Math.hypot(nx - px, ny - py) < 0.02
}

export function lineEndpointAt(l, nx, ny) {
  if (Math.hypot(nx - l.x1, ny - l.y1) < 0.03) return '1'
  if (Math.hypot(nx - l.x2, ny - l.y2) < 0.03) return '2'
  return null
}
