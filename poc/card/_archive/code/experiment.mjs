// experiment.mjs — v2 미감 실험 양산
//  사진 → occupancy(경량 CV) → 코드 배치(placement) → render-core 렌더
//  산출: out/v2/<photo>_<preset>.png, out/v2/<photo>_occ.png(점유맵 디버그),
//        out/v2/sheet_<photo>.png(프리셋 가로 비교), out/v2/sheet_all.png(전체)
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import rough from 'roughjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { renderCard } from './render-core.mjs';
import { computeOccupancy, objectCandidates, mainAnchor } from './freespace.mjs';
import { layoutCard, PRESETS } from './placement.mjs';

GlobalFonts.registerFromPath('fonts/NanumPenScript-Regular.ttf', 'Nanum Pen Script');
GlobalFonts.registerFromPath('fonts/EastSeaDokdo-Regular.ttf', 'East Sea Dokdo');
GlobalFonts.registerFromPath('fonts/Dokdo-Regular.ttf', 'Dokdo');
GlobalFonts.registerFromPath('fonts/NanumBrushScript-Regular.ttf', 'Nanum Brush Script');
GlobalFonts.registerFromPath('fonts/Gugi-Regular.ttf', 'Gugi');
GlobalFonts.registerFromPath('fonts/Stylish-Regular.ttf', 'Stylish');
GlobalFonts.registerFromPath('fonts/Gaegu-Regular.ttf', 'Gaegu');

const makeCanvas = (w, h) => { const c = createCanvas(w, h); return { canvas: c, ctx: c.getContext('2d') }; };
const W = 1080, H = 1920;
const PHOTO = { x: 0, y: 420, w: 1080, h: 1080 };   // 정사각 사진 + 상/하단 여백 밴드 420px
const PRESET_KEYS = ['A_penclean', 'B_penmemo', 'C_brush', 'D_dense'];

const CONTENT = {
  IMG_9717: { title: '오늘의 만찬은\n사랑입니다', memo: '이 크림파스타\n진짜 못 잊어',
    info: { place: '전주 객리단길', date: '2024.10.19', people: 2 },
    hashtags: ['#전주여행', '#브런치맛집', '#먹스타그램'] },
  IMG_9800: { title: '면도 회도\n다 내꺼야', memo: '야끼소바\n한 입 더',
    info: { place: '부산 자갈치시장', date: '2024.09.21', people: 4 },
    hashtags: ['#부산여행', '#회와볶음면', '#먹스타그램'] },
  IMG_8247: { title: '오늘은\n분식이 진리', memo: '치즈 떡볶이\n미쳤다',
    info: { place: '대구 서문시장', date: '2024.11.16', people: 2 },
    hashtags: ['#대구먹방', '#치즈떡볶이', '#소울푸드'] },
  IMG_4663: { title: '맑은 하늘 아래\n광장을 거닐다', memo: '역사가\n멈춰선 자리',
    info: { place: '서울 광화문광장', date: '2024.04.21', people: 2 },
    hashtags: ['#도심산책', '#역사여행', '#감성스냅'] },
};

// 점유맵 디버그 오버레이 — 빨강=occupied, 투명=free. 객체 후보 bbox/anchor 표시.
function renderOcc(photo, field, comps, anchor) {
  const c = createCanvas(W, H); const ctx = c.getContext('2d');
  ctx.fillStyle = '#11100d'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(photo, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
  ctx.globalAlpha = 0.55;
  for (let j = 0; j < field.gh; j++)
    for (let i = 0; i < field.gw; i++) {
      const v = field.occ[j * field.gw + i];
      const x = PHOTO.x + i / field.gw * PHOTO.w, y = PHOTO.y + j / field.gh * PHOTO.h;
      const cw = PHOTO.w / field.gw, ch = PHOTO.h / field.gh;
      ctx.fillStyle = v > 0.5 ? `rgba(255,60,40,${v})` : `rgba(60,200,120,${0.5 - v})`;
      ctx.fillRect(x, y, cw + 1, ch + 1);
    }
  ctx.globalAlpha = 1;
  // 객체 후보 bbox
  ctx.strokeStyle = '#ffe07a'; ctx.lineWidth = 4;
  for (const k of comps.slice(0, 6)) {
    const [x1, y1, x2, y2] = k.bbox; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
  // main anchor
  ctx.fillStyle = '#3aa0ff'; ctx.beginPath(); ctx.arc(anchor[0], anchor[1], 18, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '34px "Stylish"';
  ctx.fillText('occupancy (red=occupied, green=free)  / yellow=object candidates / blue=anchor', 30, 60);
  return c;
}

async function renderSpec(spec, photo) {
  const c = createCanvas(W, H); const ctx = c.getContext('2d');
  const rc = rough.canvas(c);
  renderCard(ctx, spec, { photo, stickers: {}, rough: rc });
  return c;
}

// 가로 비교 시트 (썸네일 스케일)
function contactSheet(canvases, labels, scale = 0.26) {
  const tw = Math.round(W * scale), th = Math.round(H * scale), pad = 16, lblH = 34;
  const c = createCanvas(pad + canvases.length * (tw + pad), th + lblH + pad * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d0c0a'; ctx.fillRect(0, 0, c.width, c.height);
  canvases.forEach((cv, i) => {
    const x = pad + i * (tw + pad);
    ctx.drawImage(cv, x, pad + lblH, tw, th);
    ctx.fillStyle = '#cdbfa8'; ctx.font = '22px "Stylish"'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], x + 4, pad + lblH / 2);
  });
  return c;
}

async function main() {
  await mkdir('out/v2', { recursive: true });
  const names = Object.keys(CONTENT);
  const sheets = [];
  for (const name of names) {
    const photo = await loadImage(`images/${name}.jpg`);
    const maskPath = `out/foodmask_${name}.png`;
    const maskImg = existsSync(maskPath) ? await loadImage(maskPath) : null;
    const field = computeOccupancy(makeCanvas, photo, { gw: 48, aspect: PHOTO.h / PHOTO.w, maskImg });
    const comps = objectCandidates(field, PHOTO);
    const anchor = mainAnchor(field, PHOTO);
    // 디버그 점유맵
    await writeFile(`out/v2/${name}_occ.png`, renderOcc(photo, field, comps, anchor).toBuffer('image/png'));

    const variants = [];
    for (const key of PRESET_KEYS) {
      const content = { ...CONTENT[name] };
      if (key === 'D_dense') content.emphasis = { cx: anchor[0], cy: anchor[1], r: 210 };
      const spec = layoutCard(content, field, PHOTO, W, H, key);
      const cv = await renderSpec(spec, photo);
      await writeFile(`out/v2/${name}_${key}.png`, cv.toBuffer('image/png'));
      variants.push(cv);
    }
    const sheet = contactSheet(variants, PRESET_KEYS.map(k => `${name} · ${k}`));
    await writeFile(`out/v2/sheet_${name}.png`, sheet.toBuffer('image/png'));
    sheets.push(sheet);
    console.log(`✓ ${name}: occ(${field.gw}x${field.gh}) cand=${comps.length} → 4 presets`);
  }
  // 전체 시트 세로 결합
  const totW = Math.max(...sheets.map(s => s.width)), totH = sheets.reduce((a, s) => a + s.height + 8, 0);
  const all = createCanvas(totW, totH); const actx = all.getContext('2d');
  actx.fillStyle = '#0d0c0a'; actx.fillRect(0, 0, totW, totH);
  let yy = 0; for (const s of sheets) { actx.drawImage(s, 0, yy); yy += s.height + 8; }
  await writeFile('out/v2/sheet_all.png', all.toBuffer('image/png'));
  console.log('완료 → out/v2/sheet_all.png');
}
main().catch(e => { console.error(e); process.exit(1); });
