// overlay-exp.mjs — v3 "사진 위 다꾸 overlay" 양산 + 레퍼런스 비교 시트
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { renderOverlay } from './render-overlay.mjs';
import { computeOccupancy } from './freespace.mjs';
import { layoutOverlay } from './overlay-place.mjs';
import { toCanvasData } from './overlay-prep.mjs';
import { OVERLAY } from './overlay-data.mjs';

GlobalFonts.registerFromPath('fonts/EastSeaDokdo-Regular.ttf', 'East Sea Dokdo');
GlobalFonts.registerFromPath('fonts/NanumPenScript-Regular.ttf', 'Nanum Pen Script');
GlobalFonts.registerFromPath('fonts/Dokdo-Regular.ttf', 'Dokdo');
GlobalFonts.registerFromPath('fonts/Stylish-Regular.ttf', 'Stylish');

const makeCanvas = (w, h) => { const c = createCanvas(w, h); return { canvas: c, ctx: c.getContext('2d') }; };
const measureCtx = createCanvas(20, 20).getContext('2d');

async function loadPolys(name) {
  const p = `out/segments_${name}.json`;   // SAM 세그먼트 (radial+offset로 깔끔한 타원형 선)
  if (!existsSync(p)) return [];
  const d = JSON.parse(await readFile(p, 'utf8'));
  return d.items.map((it) => ({ cx: it.cx_norm, cy: it.cy_norm, poly: it.poly_norm }));
}

async function renderOne(name) {
  const img = await loadImage(`images/${name}.jpg`);
  const cfg = OVERLAY[name];
  const W = 1080;
  // fullFrame: 원본 비율 그대로(크롭 없음, GPT 결과 매칭용) / 아니면 F07 세로 1080×1920
  const H = cfg.fullFrame ? Math.round(W * img.height / img.width) : 1920;
  const polysPN = await loadPolys(name);
  const { data } = toCanvasData(img, W, H, cfg, polysPN);
  const maskPath = `out/foodmask_${name}.png`;
  const maskImg = existsSync(maskPath) ? await loadImage(maskPath) : null;
  const field = computeOccupancy(makeCanvas, img, { gw: 54, aspect: H / W, maskImg });
  const spec = layoutOverlay({ ctx: measureCtx, W, H, field, data });
  const c = createCanvas(W, H); const ctx = c.getContext('2d');
  renderOverlay(ctx, spec, { photo: img });
  await writeFile(`out/v3/${name}_overlay.png`, c.toBuffer('image/png'));
  console.log(`✓ ${name}: ${W}x${H} · objects=${data.objects.length} notes=${spec.notes.length} outlines=${spec.outlines.length}`);
  return c;
}

// 같은 높이로 가로 배치 (aspect 유지) — 레퍼런스와 내 결과를 한 행에서 비교
async function compareSheet(items, h = 600, gap = 18) {
  const loaded = [];
  for (const it of items) {
    if (it.divider) { loaded.push({ divider: true }); continue; }
    const img = it.canvas || await loadImage(it.path);
    const w = Math.round(h * img.width / img.height);
    loaded.push({ img, w, label: it.label, hl: it.hl });
  }
  const lblH = 34;
  let totW = gap;
  for (const it of loaded) totW += (it.divider ? gap : it.w + gap);
  const c = createCanvas(totW, h + lblH + gap * 2); const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, c.width, c.height);
  let x = gap;
  for (const it of loaded) {
    if (it.divider) {
      ctx.strokeStyle = '#3a342b'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(x + gap / 2, gap); ctx.lineTo(x + gap / 2, h + lblH); ctx.stroke(); ctx.setLineDash([]);
      x += gap; continue;
    }
    ctx.drawImage(it.img, x, gap + lblH, it.w, h);
    ctx.fillStyle = it.hl ? '#7fd6a0' : '#bfb3a0'; ctx.font = `${it.hl ? 'bold ' : ''}22px "Stylish"`; ctx.textBaseline = 'middle';
    ctx.fillText(it.label, x + 4, gap + lblH / 2);
    x += it.w + gap;
  }
  return c;
}

async function main() {
  await mkdir('out/v3', { recursive: true });
  const c9717 = await renderOne('IMG_9717');
  const c8247 = await renderOne('IMG_8247');
  const c9800 = await renderOne('IMG_9800');
  const sheet = await compareSheet([
    { path: 'ref/ref_cafe1.png', label: '레퍼런스 ①' },
    { path: 'ref/ref_cafe2.png', label: '레퍼런스 ②' },
    { divider: true },
    { canvas: c9717, label: 'v3 · 9717', hl: true },
    { canvas: c8247, label: 'v3 · 8247', hl: true },
    { canvas: c9800, label: 'v3 · 9800', hl: true },
  ]);
  await writeFile('out/v3/compare_vs_reference.png', sheet.toBuffer('image/png'));
  console.log('완료 → out/v3/compare_vs_reference.png');
}
main().catch(e => { console.error(e); process.exit(1); });
