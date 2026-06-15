// sample.js — 카드 렌더 레퍼런스 케이스(확정 계약 형식). 단위 테스트 + 시각 하버스 공용 입력.
//
// 좌표는 전부 0~1 사진정규화(OUTLINE_API 좌표 규약). 사진을 9:16(1080×1920)으로 두면
// cover-fit 변환이 항등(×1080, ×1920)이라 기대 좌표를 계산하기 쉽다.

export const samplePhoto = { w: 1080, h: 1920 };

export const sampleItems = [
  {
    id: 0,
    label: 'coffee cup',
    src: 'det',
    conf: 0.64,
    bbox: [0.6, 0.4, 0.75, 0.7],
    center: [0.675, 0.55],
    area: 0.03,
    polygons: [[[0.6, 0.4], [0.75, 0.4], [0.75, 0.7], [0.6, 0.7]]],
    anchors: [[0.3, 0.22, 0.9], [0.82, 0.62, 0.7]],
  },
  {
    id: 3,
    label: 'plate',
    src: 'det',
    conf: 0.58,
    bbox: [0.18, 0.5, 0.5, 0.82],
    center: [0.34, 0.66],
    area: 0.08,
    polygons: [[[0.18, 0.5], [0.5, 0.5], [0.5, 0.82], [0.18, 0.82]]],
    anchors: [[0.2, 0.88, 0.8]],
  },
  {
    id: 5,
    label: null,
    src: 'grid',
    conf: 0.3,
    bbox: [0.7, 0.15, 0.85, 0.3],
    center: [0.775, 0.225],
    area: 0.02,
    polygons: [],
    anchors: [[0.55, 0.12, 0.75]],
  },
];

export const sampleCaptions = {
  objects: [
    { itemId: 0, anchor: 0, note: ['고소한 향,', '한 모금의 여유'] },
    { itemId: 3, anchor: 0, note: ['부드러운 한 접시 ♡'] },
    { itemId: 5, anchor: 0, note: ['포근한 빛'] },
  ],
  closing: { text: '오늘의 만찬, 다 같이 ♡' },
};
