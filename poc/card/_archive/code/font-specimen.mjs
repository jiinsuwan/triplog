// font-specimen.mjs — 보유 손글씨 폰트 전종을 같은 문구로 렌더해 "얇은 흰 펜" 적합도 비교
// 출력: out/v2/font_specimen.png  (어두운 따뜻한 배경 + 흰 글씨 + 약한 halo)
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';

const FONTS = [
  ['Nanum Pen Script', 'fonts/NanumPenScript-Regular.ttf', '기존'],
  ['East Sea Dokdo', 'fonts/EastSeaDokdo-Regular.ttf', '신규·얇은펜'],
  ['Dokdo', 'fonts/Dokdo-Regular.ttf', '신규·마커펜'],
  ['Nanum Brush Script', 'fonts/NanumBrushScript-Regular.ttf', '신규·붓'],
  ['Gugi', 'fonts/Gugi-Regular.ttf', '신규·붓굵게'],
  ['Stylish', 'fonts/Stylish-Regular.ttf', '신규·얇은고딕손글씨'],
  ['Single Day', 'fonts/SingleDay-Regular.ttf', '기존'],
  ['Gaegu', 'fonts/Gaegu-Regular.ttf', '기존·둥근'],
  ['Gamja Flower', 'fonts/GamjaFlower-Regular.ttf', '기존·둥근'],
  ['Hi Melody', 'fonts/HiMelody-Regular.ttf', '기존·둥근'],
  ['Dongle', 'fonts/Dongle-Regular.ttf', '기존·둥근'],
];
for (const [fam, path] of FONTS) GlobalFonts.registerFromPath(path, fam);

const W = 1200, rowH = 230, H = rowH * FONTS.length + 40;
const cv = createCanvas(W, H);
const ctx = cv.getContext('2d');
// 따뜻한 어두운 배경 (카드 톤)
const g = ctx.createLinearGradient(0, 0, 0, H);
g.addColorStop(0, '#2b2419'); g.addColorStop(1, '#1c1812');
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

const TITLE = '오늘의 만찬은 사랑입니다';
const BODY = '친구랑 배부르게 · 이 파스타 진짜 못 잊어';

FONTS.forEach(([fam, _p, note], i) => {
  const y = 40 + i * rowH;
  // 구분선
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y - 14); ctx.lineTo(W - 40, y - 14); ctx.stroke();
  // 라벨
  ctx.font = '22px "Stylish"'; ctx.fillStyle = '#8a7f6e'; ctx.textBaseline = 'top';
  ctx.fillText(`${fam}  —  ${note}`, 44, y);
  // 제목 (흰 펜 + 약한 halo)
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `78px "${fam}"`;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#fbf5e9';
  ctx.fillText(TITLE, 44, y + 100);
  ctx.restore();
  // 본문
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `40px "${fam}"`;
  ctx.fillStyle = '#cdbfa8';
  ctx.fillText(BODY, 44, y + 165);
  ctx.restore();
});

await writeFile('out/v2/font_specimen.png', cv.toBuffer('image/png'));
console.log('out/v2/font_specimen.png 생성');
