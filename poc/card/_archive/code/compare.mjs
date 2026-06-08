// compare.mjs — v1(기존) vs v2(신규) before/after 비교 시트
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';

async function tile(items, scale = 0.34, gap = 20, lblH = 40) {
  const imgs = [];
  for (const it of items) { try { imgs.push({ ...it, img: await loadImage(it.path) }); } catch { imgs.push({ ...it, img: null }); } }
  const tw = Math.round(1080 * scale), th = Math.round(1920 * scale);
  const c = createCanvas(gap + items.length * (tw + gap), th + lblH + gap * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, c.width, c.height);
  imgs.forEach((it, i) => {
    const x = gap + i * (tw + gap);
    if (it.img) ctx.drawImage(it.img, x, gap + lblH, tw, th);
    ctx.fillStyle = it.hl ? '#7fd6a0' : '#bfb3a0';
    ctx.font = `${it.hl ? 'bold ' : ''}24px sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(it.label, x + 4, gap + lblH / 2);
  });
  return c;
}

const r = 'out/_v1_renders', v = 'out/v2';
const sheet = await tile([
  { path: `${r}/IMG_9717_rich.png`, label: 'v1 · rich (기존)' },
  { path: `${v}/IMG_9717_A_penclean.png`, label: 'v2 · A 펜미니멀', hl: true },
  { path: `${v}/IMG_9717_B_penmemo.png`, label: 'v2 · B 펜메모', hl: true },
  { path: `${v}/IMG_9717_C_brush.png`, label: 'v2 · C 붓제목', hl: true },
]);
await writeFile(`${v}/before_after_9717.png`, sheet.toBuffer('image/png'));

// v2 베스트픽 — 사진별 A/B 한 장씩 모은 그리드
const best = await tile([
  { path: `${v}/IMG_9717_A_penclean.png`, label: '9717 · A' },
  { path: `${v}/IMG_9800_B_penmemo.png`, label: '9800 · B' },
  { path: `${v}/IMG_8247_A_penclean.png`, label: '8247 · A' },
  { path: `${v}/IMG_4663_C_brush.png`, label: '4663 · C' },
], 0.32);
await writeFile(`${v}/best_picks.png`, best.toBuffer('image/png'));
console.log('out/v2/before_after_9717.png, best_picks.png 생성');
