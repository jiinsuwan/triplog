// preview.js — card-preview.html 구동부(개발 확인용, 제품 빌드와 무관).
//   세로 사진(IMG_0988, 본인 촬영)을 카드 캔버스에 cover-fit 렌더한다.
//   기본 = 카드 목표 규격 1080×1920(9:16). 사진은 3:4라 위아래가 크롭된다(제품 실제 동작).
//   토글로 사진 원본 프레임(960×1280)도 볼 수 있다(크롭 없이 객체 배치 확인용).
//   items 좌표는 사진정규화(0~1)라 어느 캔버스 크기든 cover-fit 으로 해소된다.
import { buildScene } from './buildScene.js';
import { renderCard } from './renderCore.js';
import photoUrl from './__fixtures__/sample-photo.jpg';
import rawAuto from './__fixtures__/auto_IMG_0988.json';

// auto_*.json 은 v12 내부 덤프(_norm). 계약 정본 필드명으로 매핑(buildScene 은 계약만 본다).
const items = (rawAuto.items || []).map((it) => ({
  id: it.id,
  label: it.label,
  src: it.src,
  conf: it.conf,
  bbox: it.bbox_norm,
  center: it.center_norm,
  area: it.area_frac,
  polygons: it.poly_norm,
  anchors: it.anchors,
}));

// 문구 = 실제 #71 LLM(GMS gpt-4o-mini) 1회 호출 결과(2026-06-16, IMG_0988 items 입력).
//   목업 아님 — CardCaptionService.generate() 산출 그대로. 긴 설명조는 gpt-4o-mini 특성.
const captions = {
  objects: [
    { itemId: 1, anchor: 0, note: ['맛있는 음식이 가득한 그릇입니다.', '한 입 먹고 싶어지네요!'] },
    { itemId: 5, anchor: 0, note: ['신선한 전복이 등장했습니다.', '바다의 맛을 느껴보세요!'] },
    { itemId: 10, anchor: 0, note: ['여행의 추억이 담긴 순간입니다.', '소중한 기억을 간직하세요.'] },
    { itemId: 11, anchor: 0, note: ['다양한 음식들이 준비되어 있습니다.', '눈과 입이 즐거운 시간이죠!'] },
  ],
  closing: { text: '여행의 즐거움을 만끽하세요!' },
};

// 캔버스 크기 = 카드 목표 규격(기본) / 사진 원본 프레임(토글). 사진은 둘 다 cover-fit.
//   sample-photo.jpg 는 세로(960×1280)이며 회전이 필요 없다.
const SIZES = {
  card: { W: 1080, H: 1920 }, // 제품 목표(9:16). 사진(3:4) → cover-fit 위아래 크롭
  photo: { W: rawAuto.W, H: rawAuto.H }, // 사진 원본 비율(크롭 없음, 객체 배치 확인용)
};
let CANVAS = SIZES.card;
const photoSize = { w: rawAuto.W, h: rawAuto.H };

const canvasEl = document.getElementById('card');
const ctx = canvasEl.getContext('2d');
function applyCanvasSize() {
  canvasEl.width = CANVAS.W; // width/height 재설정은 캔버스를 초기화한다(rebuild 가 다시 그림)
  canvasEl.height = CANVAS.H;
  canvasEl.style.height = '92vh';
  canvasEl.style.width = 'auto';
}
applyCanvasSize();
const toneDownEl = document.getElementById('toneDown');
const tdv = document.getElementById('tdv');
const togglesEl = document.getElementById('layerToggles');
const sizeSel = document.getElementById('sizeSel');

let scene = null;
let photoImg = null;

function rebuild() {
  scene = buildScene({ items, captions, canvas: CANVAS, photo: photoSize, style: { toneDown: Number(toneDownEl.value) / 100 } });
  togglesEl.innerHTML = '';
  scene.layers.forEach((layer) => {
    const wrap = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => { layer.visible = cb.checked; draw(); });
    const span = document.createElement('span');
    span.textContent = layer.kind === 'closing' ? '마무리 한 줄' : `${layer.lines.join(' ')} (item #${layer.itemId})`;
    wrap.append(cb, span);
    togglesEl.append(wrap);
  });
  draw();
}

function draw() {
  renderCard(ctx, scene, { photo: photoImg });
}

toneDownEl.addEventListener('input', () => {
  tdv.textContent = toneDownEl.value;
  scene.tone.toneDown = Number(toneDownEl.value) / 100;
  draw();
});

// 캔버스 크기 토글 — 카드 목표(1080×1920) ↔ 사진 원본(960×1280). 크기 바뀌면 scene 재계산.
sizeSel.addEventListener('change', () => {
  CANVAS = SIZES[sizeSel.value] || SIZES.card;
  applyCanvasSize();
  rebuild();
});

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}

const fontsReady = document.fonts
  ? document.fonts.load('40px "Ownglyph ooa"').then(() => document.fonts.ready)
  : Promise.resolve();

Promise.all([loadImage(photoUrl), fontsReady]).then(([img]) => {
  photoImg = img; // 이미 세로(960×1280) — 회전 불필요
  rebuild();
});
