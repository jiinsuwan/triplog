// 렌더 파이프라인 go/no-go 스모크: 하드코딩 카드 spec 1장 → PNG(1080x1920)
// 목적은 "JSON→PNG 헤드리스 렌더가 산다"의 증명. 디자인 품질은 다음 단계.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import rough from 'roughjs';
import { writeFile } from 'node:fs/promises';

GlobalFonts.registerFromPath('fonts/NanumPenScript-Regular.ttf', 'Nanum Pen Script');
GlobalFonts.registerFromPath('fonts/Gaegu-Regular.ttf', 'Gaegu');

const W = 1080, H = 1920;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// 1. 배경 (따뜻한 다크)
ctx.fillStyle = '#1a1410';
ctx.fillRect(0, 0, W, H);

// 2. 사진 (상단 풀블리드, cover fit)
const img = await loadImage('images/IMG_9800.jpg');
const photoBox = { x: 0, y: 220, w: W, h: 980 };
const scale = Math.max(photoBox.w / img.width, photoBox.h / img.height);
const dw = img.width * scale, dh = img.height * scale;
ctx.save();
ctx.beginPath();
ctx.rect(photoBox.x, photoBox.y, photoBox.w, photoBox.h);
ctx.clip();
ctx.drawImage(img, photoBox.x + (photoBox.w - dw) / 2, photoBox.y + (photoBox.h - dh) / 2, dw, dh);
ctx.restore();

// 3. 캡션 (손글씨)
ctx.fillStyle = '#fffaf0';
ctx.font = '92px "Nanum Pen Script"';
ctx.fillText('오늘의 메뉴는', 70, 150);
ctx.fillText('우리만의 레스토랑', 70, 1380);

// 4. rough.js 손그림 화살표/밑줄
let roughOk = false;
try {
  const rc = rough.canvas(canvas);
  rc.line(70, 1400, 520, 1400, { stroke: '#ffd700', strokeWidth: 4, roughness: 2, seed: 42 });
  rc.circle(540, 700, 260, { stroke: '#fff', strokeWidth: 3, roughness: 2.5, seed: 7 });
  roughOk = true;
} catch (e) {
  console.error('rough.js 실패, 폴백 직선:', e.message);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(70, 1400); ctx.lineTo(520, 1400); ctx.stroke();
}

// 5. 해시태그 + 정보박스
ctx.font = '54px "Gaegu"';
ctx.fillStyle = '#ffd27f';
ctx.fillText('#캠핑맛집  #양양캠핑  #오늘은우리가셰프', 70, 1500);
ctx.fillStyle = '#cfc4b8';
ctx.font = '48px "Gaegu"';
ctx.fillText('양양 캠핑장 · 2024.10.12 · 2명', 70, 1600);

const buf = canvas.toBuffer('image/png');
await writeFile('out/smoke.png', buf);
console.log(`OK smoke.png written (${buf.length} bytes), rough.js=${roughOk}`);
