// render-batch.mjs — out/cards/*.json 전부를 PNG로 양산 (Node 헤드리스)
// 공용 render-core.mjs를 그대로 사용 → 웹 편집기와 렌더 결과가 1:1로 일치한다.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import rough from 'roughjs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { renderCard, STICKER_COLORS } from './render-core.mjs';

GlobalFonts.registerFromPath('fonts/NanumPenScript-Regular.ttf', 'Nanum Pen Script');
GlobalFonts.registerFromPath('fonts/Gaegu-Regular.ttf', 'Gaegu');
GlobalFonts.registerFromPath('fonts/GamjaFlower-Regular.ttf', 'Gamja Flower');
GlobalFonts.registerFromPath('fonts/Dongle-Regular.ttf', 'Dongle');
GlobalFonts.registerFromPath('fonts/SingleDay-Regular.ttf', 'Single Day');
GlobalFonts.registerFromPath('fonts/HiMelody-Regular.ttf', 'Hi Melody');

// 스티커 SVG → currentColor 치환 후 Image 로드 (id+색 캐시)
const svgCache = {}, imgCache = {};
async function getSticker(id, color) {
  const key = id + '|' + color;
  if (imgCache[key]) return imgCache[key];
  if (!svgCache[id]) svgCache[id] = await readFile(`out/stickers/${id}.svg`, 'utf8');
  const img = await loadImage(Buffer.from(svgCache[id].replace(/currentColor/g, color)));
  imgCache[key] = img;
  return img;
}
// 카드 스티커들을 각자 지정색(없으면 기본 팔레트)으로 로드 → { [id]: Image }
async function stickersFor(spec) {
  const out = {};
  for (const s of spec.stickers || []) {
    const color = s.color || STICKER_COLORS[s.id] || '#ffffff';
    try { out[s.id] = await getSticker(s.id, color); } catch (e) { console.warn(`  스티커 실패 ${s.id}: ${e.message}`); }
  }
  return out;
}

const photoCache = {};
async function getPhoto(name) {
  if (!photoCache[name]) photoCache[name] = await loadImage(`images/${name}.jpg`);
  return photoCache[name];
}

// 필름 그레인 텍스처 (1회 로드)
let grainImg;
async function getGrain() {
  if (grainImg === undefined) { try { grainImg = await loadImage('out/grain_tile.png'); } catch { grainImg = null; } }
  return grainImg;
}

// 음식 마스크 PNG — foodmask(FastSAM, soft edge) 우선, 없으면 cutout(rembg), 없으면 null
const cutoutCache = {};
async function getCutout(name) {
  if (cutoutCache[name] === undefined) {
    try { cutoutCache[name] = await loadImage(`out/foodmask_${name}.png`); }
    catch {
      try { cutoutCache[name] = await loadImage(`out/cutout_${name}.png`); }
      catch { cutoutCache[name] = null; }
    }
  }
  return cutoutCache[name];
}

// 음식 외곽 폴리곤 — segments_{name}.json에서 로드 (outlines: 'auto'일 때)
const segCache = {};
async function getOutlines(name, color) {
  if (segCache[name] === undefined) {
    try { segCache[name] = JSON.parse(await readFile(`out/segments_${name}.json`, 'utf8')).items; }
    catch { segCache[name] = []; }
  }
  return segCache[name].map((it) => ({ poly_norm: it.poly_norm, color: color || '#fff8e7', smooth: arguments[2] || 0 }));
}

async function main() {
  await mkdir('out/renders', { recursive: true });
  const files = (await readdir('out/cards')).filter((f) => f.endsWith('.json'));
  let ok = 0, fail = 0;
  for (const file of files.sort()) {
    const spec = JSON.parse(await readFile(`out/cards/${file}`, 'utf8'));
    const photoName = file.split('_').slice(0, 2).join('_'); // IMG_9800_minimal.json → IMG_9800
    try {
      const canvas = createCanvas(spec.canvas.width, spec.canvas.height);
      const ctx = canvas.getContext('2d');
      const rc = rough.canvas(canvas);
      const photo = await getPhoto(photoName);
      const stickers = await stickersFor(spec);
      const cutout = (spec.subjectFocus || spec.subjectMask) ? await getCutout(photoName) : null;
      const grain = (spec.photoTone && spec.photoTone.grain) ? await getGrain() : null;
      let renderSpec = spec;
      if (spec.outlines === 'auto') {
        renderSpec = { ...spec, outlines: await getOutlines(photoName, spec.outlineColor, spec.outlineSmooth) };
      }
      renderCard(ctx, renderSpec, { photo, stickers, cutout, grain, rough: rc });
      const buf = canvas.toBuffer('image/png');
      const outName = file.replace(/\.json$/, '.png');
      await writeFile(`out/renders/${outName}`, buf);
      console.log(`  ✓ ${outName} (${(buf.length / 1024 | 0)} KB)`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${file}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n완료: ${ok}장 렌더, ${fail}장 실패`);
}

main();
