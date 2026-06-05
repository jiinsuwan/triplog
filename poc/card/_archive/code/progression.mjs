// progression.mjs — v1→v2→v3→레퍼런스 진행 경과 비교 시트
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
async function tile(items, h = 620, gap = 18) {
  const L = [];
  for (const it of items) { const img = await loadImage(it.path); L.push({ img, w: Math.round(h * img.width / img.height), label: it.label, hl: it.hl }); }
  const lblH = 36; let tw = gap; for (const it of L) tw += it.w + gap;
  const c = createCanvas(tw, h + lblH + gap * 2); const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, c.width, c.height);
  let x = gap; for (const it of L) {
    ctx.drawImage(it.img, x, gap + lblH, it.w, h);
    ctx.fillStyle = it.hl ? '#7fd6a0' : '#bfb3a0'; ctx.font = `${it.hl ? 'bold ' : ''}22px sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(it.label, x + 4, gap + lblH / 2); x += it.w + gap;
  }
  return c;
}
const s = await tile([
  { path: 'out/_v1_renders/IMG_9717_rich.png', label: 'v1 rich (과밀·유치)' },
  { path: 'out/v2/IMG_9717_A_penclean.png', label: 'v2 (잘못된 방향: 카드/제목형)' },
  { path: 'out/v3/IMG_9717_overlay.png', label: 'v3 (사진 위 다꾸 overlay)', hl: true },
  { path: 'ref/ref_cafe1.png', label: '레퍼런스' },
]);
await writeFile('out/v3/progression_9717.png', s.toBuffer('image/png'));
console.log('out/v3/progression_9717.png');
