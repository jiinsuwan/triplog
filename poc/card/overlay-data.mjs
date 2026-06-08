// overlay-data.mjs — 사진별 객체 앵커 + 짧은 흰펜 코멘트 (큐레이션 콘텐츠)
//   좌표는 정규화(0..1, 캔버스 기준). 노트 "위치"는 배치 엔진이 빈공간에서 결정하고,
//   여기서는 객체 위치/문구/장식/방향힌트만 제공한다.
//   (제품에선 이 앵커가 자동 검출 또는 사용자 객체지정으로 들어온다 — 워크벤치와 동일 입력)
//
//   obj: { cx, cy, r, note:[lines], deco?, dir?, outline?:'ellipse'|'poly'|false }
//   dir: 노트를 둘 선호 방향 (이미지 바깥쪽). 'ul'|'u'|'ur'|'l'|'r'|'dl'|'d'|'dr'

export const OVERLAY = {
  // 전주 객리단길 — GPT 편집 결과(같은 사진) 매칭: 풀프레임 + 무드 톤 + 8 노트
  IMG_9717: {
    aspect: 1, warmth: 0.06, fullFrame: true,
    tone: { brightness: 0.98, contrast: 1.04, saturate: 1.05, warmth: 0.045, vignette: 0.08 },
    objects: [
      // 전반 코멘트 (특정 접시 아님 → 화살표 없음, 좌상단)
      { cx: 0.3, cy: 0.13, r: 0.04, dir: 'ul', deco: 'sparkle', outline: false, noArrow: true,
        note: ['같이 나눠 먹는', '시간이 제일 좋아 ♡'] },
      // 감자튀김 그릇 (상단 중앙, SAM 외곽선) — 노트는 그릇 위
      { cx: 0.65, cy: 0.185, r: 0.13, dir: 'u', deco: 'sparkle', npn: [0.42, 0.035],
        note: ['고소한 감자,', '손이 계속 가는 맛'] },
      // 콜라 (상단 우)
      { cx: 0.72, cy: 0.07, r: 0.05, dir: 'r', deco: 'heart', outline: false, npn: [0.82, 0.06],
        note: ['톡 쏘는 탄산으로', '느끼함 싹-!'] },
      // 크림 파스타 접시 (좌중앙, SAM 외곽선)
      { cx: 0.388, cy: 0.334, r: 0.13, dir: 'l', deco: 'heart',
        note: ['부드럽고 고소한', '한 접시 ♡'] },
      // 뇨끼/감자 접시 (우상, SAM 외곽선)
      { cx: 0.688, cy: 0.339, r: 0.125, dir: 'ur', deco: 'sparkle', npn: [0.83, 0.3],
        note: ['겉바속촉 감자', '한입에 행복'] },
      // 메인 그린 파스타 (중앙) → 노트는 GPT처럼 우하단
      { cx: 0.578, cy: 0.606, r: 0.155, dir: 'r', deco: 'heart', npn: [0.8, 0.6],
        note: ['오늘의 메인', '파스타,', '진짜 못 잊어 ♡'] },
      // 치킨 접시 (좌하, SAM 외곽선)
      { cx: 0.194, cy: 0.55, r: 0.135, dir: 'dl', deco: 'sparkle',
        note: ['한입 먹자마자', '감탄.. ✦'] },
    ],
    closing: { text: '오늘의 만찬, 다 같이 나눠 먹는 행복 ♡', deco: 'sparkle' },
  },

  // 대구 서문시장 — 분식 트레이
  IMG_8247: {
    aspect: 1, warmth: 0.04,
    objects: [
      { cx: 0.28, cy: 0.34, r: 0.16, dir: 'ul', deco: 'heart',
        note: ['치즈 듬뿍', '꾸덕한 한 입~'] },
      { cx: 0.64, cy: 0.35, r: 0.16, dir: 'ur', deco: 'sparkle',
        note: ['알록달록', '비빔 한 그릇 뚝딱'] },
      { cx: 0.42, cy: 0.72, r: 0.18, dir: 'd', deco: 'star',
        note: ['갓 튀긴 꽈배기', '바삭 + 달콤 ♡'] },
      { cx: 0.86, cy: 0.62, r: 0.08, dir: 'r', deco: 'dots', outline: false,
        note: ['소스도', '아낌없이'] },
      { cx: 0.12, cy: 0.07, r: 0.06, dir: 'ul', deco: 'smile', outline: false,
        note: ['시원한 음료', '한 모금~'] },
    ],
    closing: { text: '분식은 언제나 진리, 소소한 행복 ♡', deco: 'heart' },
  },

  // 부산 자갈치 — 야끼소바 + 회 (세로 사진)
  IMG_9800: {
    aspect: 1.333, warmth: 0.04,
    objects: [
      { cx: 0.5, cy: 0.4, r: 0.2, dir: 'ur', deco: 'sparkle',
        note: ['지글지글', '야끼소바 한 입 더!'] },
      { cx: 0.36, cy: 0.8, r: 0.16, dir: 'dl', deco: 'heart',
        note: ['싱싱한 회', '입에서 살살~'] },
      { cx: 0.84, cy: 0.52, r: 0.09, dir: 'r', deco: 'smile',
        note: ['정갈한', '밑반찬도 굿'] },
      { cx: 0.12, cy: 0.56, r: 0.07, dir: 'l', deco: 'dots', outline: false,
        note: ['매콤한', '양념장'] },
      { cx: 0.45, cy: 0.06, r: 0.07, dir: 'u', deco: 'sparkle', outline: false,
        note: ['새콤한', '무침 한 입'] },
    ],
    closing: { text: '바다 앞에서, 면도 회도 다 내꺼 ♡', deco: 'star' },
  },
};
