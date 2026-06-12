// freespace.mjs — 경량 CV 기반 점유맵(occupancy) 추정 (torch/SAM 불필요)
//
// 목적(이번 사이클의 본질): "어디에 물체가 있고, 어디가 비어 있는가"를 추정해
//   텍스트/스티커/화살표가 음식·피사체를 덮지 않도록 배치 근거를 제공한다.
//
// 방식: 사진을 작은 격자로 다운스케일 → 셀별 busyness 계산
//   busyness = 0.55*엣지(Sobel) + 0.30*국소분산 + 0.15*채도
//   (음식/디테일=높음=occupied, 테이블/벽/하늘/블러=낮음=free)
//   선택: 기존 SAM foodmask가 있으면 alpha를 occupied로 합성(max).
//
// 플랫폼 중립: makeCanvas(w,h)->{canvas,ctx} 팩토리를 주입받아
//   Node(@napi-rs/canvas)·브라우저 양쪽에서 동일 코드로 동작 (render-core.mjs와 같은 원칙).

// 사진을 photo 박스 비율로 cover-fit 다운스케일해서 small 캔버스에 그린다 (배치 좌표계와 1:1 정렬)
function drawCoverSmall(ctx, img, sw, sh) {
  const s = Math.max(sw / img.width, sh / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
}

export function computeOccupancy(makeCanvas, photoImg, opts = {}) {
  const gw = opts.gw || 48;                 // 격자 가로 셀 수
  const aspect = opts.aspect || 1;          // photo 박스 h/w
  const gh = opts.gh || Math.round(gw * aspect);
  const S = opts.supersample || 5;          // 셀당 S×S 픽셀 → 분산 계산용
  const SW = gw * S, SH = gh * S;

  const { ctx } = makeCanvas(SW, SH);
  drawCoverSmall(ctx, photoImg, SW, SH);
  const data = ctx.getImageData(0, 0, SW, SH).data;

  // 픽셀별 luminance / saturation
  const lum = new Float32Array(SW * SH);
  const sat = new Float32Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx === 0 ? 0 : (mx - mn) / mx;
  }
  // Sobel gradient magnitude
  const grad = new Float32Array(SW * SH);
  for (let y = 1; y < SH - 1; y++) {
    for (let x = 1; x < SW - 1; x++) {
      const idx = y * SW + x;
      const gx = -lum[idx - SW - 1] - 2 * lum[idx - 1] - lum[idx + SW - 1]
                 + lum[idx - SW + 1] + 2 * lum[idx + 1] + lum[idx + SW + 1];
      const gy = -lum[idx - SW - 1] - 2 * lum[idx - SW] - lum[idx - SW + 1]
                 + lum[idx + SW - 1] + 2 * lum[idx + SW] + lum[idx + SW + 1];
      grad[idx] = Math.hypot(gx, gy);
    }
  }
  // 선택: foodmask alpha (cover-fit 동일 변환)
  let maskA = null;
  if (opts.maskImg) {
    const { ctx: mctx } = makeCanvas(SW, SH);
    drawCoverSmall(mctx, opts.maskImg, SW, SH);
    const md = mctx.getImageData(0, 0, SW, SH).data;
    maskA = new Float32Array(SW * SH);
    for (let i = 0; i < SW * SH; i++) maskA[i] = md[i * 4 + 3] / 255;
  }

  // 셀별 집계
  const occ = new Float32Array(gw * gh);
  const lumGrid = new Float32Array(gw * gh);     // 셀 평균 밝기 (국소 음영 강도용)
  for (let cj = 0; cj < gh; cj++) {
    for (let ci = 0; ci < gw; ci++) {
      let sumG = 0, sumS = 0, sumL = 0, sumL2 = 0, sumM = 0, n = 0;
      for (let yy = 0; yy < S; yy++) {
        for (let xx = 0; xx < S; xx++) {
          const px = ci * S + xx, py = cj * S + yy, idx = py * SW + px;
          sumG += grad[idx]; sumS += sat[idx];
          sumL += lum[idx]; sumL2 += lum[idx] * lum[idx];
          if (maskA) sumM += maskA[idx];
          n++;
        }
      }
      const meanG = sumG / n;
      const varL = Math.max(0, sumL2 / n - (sumL / n) ** 2);
      const meanS = sumS / n, meanL = sumL / n;
      // 정규화 가중합 (경험적 스케일). 채도↑·밝은 매끈 영역도 occupied로(매끈한 수프/노른자 약점 보완)
      let b = 0.48 * Math.min(1, meanG / 1.5) + 0.26 * Math.min(1, varL * 14)
            + 0.18 * meanS + 0.08 * Math.min(1, meanS * meanL * 2.2);
      // 중앙 prior — 피사체(음식)는 보통 화면 중앙. 매끈해도 중앙이면 occupied 가중.
      const cdist = Math.hypot(ci / gw - 0.5, cj / gh - 0.5) / 0.707;
      b += 0.12 * (1 - Math.min(1, cdist));
      if (maskA) b = Math.max(b, (sumM / n) * 1.0); // 마스크 영역은 확실한 occupied
      occ[cj * gw + ci] = Math.min(1, b);
      lumGrid[cj * gw + ci] = meanL;
    }
  }
  // 약한 가우시안 평활 (3x3) — 격자 노이즈 완화
  const sm = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
          const wk = (di === 0 && dj === 0) ? 4 : 1;
          s += occ[nj * gw + ni] * wk; w += wk;
        }
      sm[j * gw + i] = s / w;
    }
  return { gw, gh, occ: sm, lum: lumGrid };
}

// 사각 박스(캔버스 좌표) 아래 평균 밝기 (0..1). photo 밖은 0.3 가정.
export function boxLuminance(field, photo, x, y, w, h) {
  let sum = 0, n = 0;
  for (let a = 0; a <= 4; a++)
    for (let b = 0; b <= 4; b++) {
      const px = x + a / 4 * w, py = y + b / 4 * h;
      if (px < photo.x || px > photo.x + photo.w || py < photo.y || py > photo.y + photo.h) { sum += 0.3; n++; continue; }
      const ci = Math.min(field.gw - 1, Math.max(0, Math.floor((px - photo.x) / photo.w * field.gw)));
      const cj = Math.min(field.gh - 1, Math.max(0, Math.floor((py - photo.y) / photo.h * field.gh)));
      sum += field.lum[cj * field.gw + ci]; n++;
    }
  return sum / n;
}

// occ 격자 좌표(0..gw,0..gh) → 캔버스 픽셀 좌표 (photo 박스 기준)
export function gridToCanvas(field, photo, ci, cj) {
  return [photo.x + (ci + 0.5) / field.gw * photo.w, photo.y + (cj + 0.5) / field.gh * photo.h];
}

// 캔버스 좌표 → 격자 셀
function canvasToGrid(field, photo, x, y) {
  const ci = Math.floor((x - photo.x) / photo.w * field.gw);
  const cj = Math.floor((y - photo.y) / photo.h * field.gh);
  return [ci, cj];
}

// 사각 박스(캔버스 좌표)가 차지하는 평균 occupancy. photo 밖(여백)은 0(=free)으로 취급.
export function boxOccupancy(field, photo, x, y, w, h) {
  let sum = 0, n = 0;
  const steps = 6;
  for (let a = 0; a <= steps; a++)
    for (let b = 0; b <= steps; b++) {
      const px = x + (a / steps) * w, py = y + (b / steps) * h;
      if (px < photo.x || px > photo.x + photo.w || py < photo.y || py > photo.y + photo.h) {
        n++; continue; // 여백 = free
      }
      const [ci, cj] = canvasToGrid(field, photo, px, py);
      sum += field.occ[Math.min(field.gh - 1, Math.max(0, cj)) * field.gw + Math.min(field.gw - 1, Math.max(0, ci))];
      n++;
    }
  return sum / n;
}

// 가장 붐비는 덩어리(=주 피사체)의 무게중심을 캔버스 좌표로 — 기본 anchor 후보
export function mainAnchor(field, photo) {
  let sx = 0, sy = 0, sw = 0;
  for (let j = 0; j < field.gh; j++)
    for (let i = 0; i < field.gw; i++) {
      const v = field.occ[j * field.gw + i];
      if (v < 0.45) continue;
      sx += i * v; sy += j * v; sw += v;
    }
  if (sw === 0) return [photo.x + photo.w / 2, photo.y + photo.h / 2];
  return gridToCanvas(field, photo, sx / sw, sy / sw);
}

// 자동 분리 객체 후보 — occupancy 임계 이상 연결성분(connected components)을 라벨링해
//   각 덩어리의 bbox/중심을 캔버스 좌표로 반환 (선택형 "후보 클릭" PoC용)
export function objectCandidates(field, photo, thr = 0.5, minCells = 6) {
  const { gw, gh, occ } = field;
  const seen = new Int8Array(gw * gh);
  const comps = [];
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      if (seen[k] || occ[k] < thr) continue;
      // BFS
      const stack = [[i, j]]; seen[k] = 1;
      let minI = i, maxI = i, minJ = j, maxJ = j, cnt = 0, cx = 0, cy = 0;
      while (stack.length) {
        const [ci, cj] = stack.pop();
        cnt++; cx += ci; cy += cj;
        minI = Math.min(minI, ci); maxI = Math.max(maxI, ci);
        minJ = Math.min(minJ, cj); maxJ = Math.max(maxJ, cj);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
          const nk = nj * gw + ni;
          if (seen[nk] || occ[nk] < thr) continue;
          seen[nk] = 1; stack.push([ni, nj]);
        }
      }
      if (cnt < minCells) continue;
      const [px, py] = gridToCanvas(field, photo, cx / cnt, cy / cnt);
      const x1 = photo.x + minI / gw * photo.w, y1 = photo.y + minJ / gh * photo.h;
      const x2 = photo.x + (maxI + 1) / gw * photo.w, y2 = photo.y + (maxJ + 1) / gh * photo.h;
      comps.push({ cx: px, cy: py, bbox: [x1, y1, x2, y2], cells: cnt,
        r: Math.max(x2 - x1, y2 - y1) / 2 });
    }
  return comps.sort((a, b) => b.cells - a.cells);
}
