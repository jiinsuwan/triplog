// overlay-prep.mjs — 사진 좌표(photo-normalized) → 캔버스 좌표(1080×1920 cover-fit) 변환
//   F07 스펙: P0 카드 = 세로 1080×1920. 사진은 cover-fit 풀블리드(여백 밴드 없음 → 넘치는 부분 크롭).
//   객체 앵커/폴리곤은 사진 기준 정규화이므로, cover 변환을 거쳐 캔버스 정규화로 옮긴다.
//   크롭으로 화면 밖에 나간 객체는 제외한다.

// segItems: [{ cx, cy, poly }] (사진정규화) — SAM 세그먼트. 객체 앵커와 가장 가까운 마스크를 붙인다.
export function toCanvasData(img, W, H, data, segItems = []) {
  const s = Math.max(W / img.width, H / img.height);   // cover-fit
  const dw = img.width * s, dh = img.height * s;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  const pt = (px, py) => [(ox + px * dw) / W, (oy + py * dh) / H];  // 사진정규화 → 캔버스정규화
  const radf = (pr) => pr * dw / W;                                  // 폭기준 반지름 변환

  const objects = [];
  for (const o of data.objects) {
    const [cx, cy] = pt(o.cx, o.cy);
    if (cx < -0.03 || cx > 1.03 || cy < -0.03 || cy > 1.03) continue;  // 크롭되어 안 보임
    // 외곽선 대상이면 가장 가까운 SAM 마스크(거리<0.1)를 붙인다 (정밀 폴리곤 우선)
    let poly = null;
    if (o.outline !== false) {
      let best = null, bd = 0.1;
      for (const sgi of segItems) {
        const d = Math.hypot(sgi.cx - o.cx, sgi.cy - o.cy);
        if (d < bd) { bd = d; best = sgi; }
      }
      if (best) poly = best.poly.map(([px, py]) => pt(px, py));
    }
    // 정규화 수동 위치(npn) → 캔버스 px npos (노트 박스 좌상단)
    let npos = o.npos;
    if (o.npn) { const [nx, ny] = pt(o.npn[0], o.npn[1]); npos = { x: nx * W, y: ny * H }; }
    objects.push({ ...o, cx, cy, r: radf(o.r), poly, npos });
  }
  return { data: { ...data, objects }, transform: { s, dw, dh, ox, oy, pt, radf } };
}
