# PoC — AI 카드 생성 파이프라인 (이미지 변환 PoC)

- **상태**: Pending (Sprint 0 ~ Sprint 1 초입에서 수행)
- **소요**: 약 1주 (집중 시 5일)
- **담당**: log 트랙 주도, trip 트랙 협업 가능
- **선행 결정**: [decisions/0002-scope-pivot](../decisions/0002-scope-pivot.md) — 카드 생성은 P0 핵심 기능으로 확정
- **출처**: `archive/명세_원본/triplog_이미지변환_PoC.md` (2026-05-08 작성, 본 문서는 위치 이관본)

> **이 PoC가 통과해야 P0 카드 생성 기능이 성립한다.** 실패 시 §7 폴백 시나리오 중 하나로 전환한다 — **일정 자체는 폴백으로 보호되지만, 그 경우 Sprint 3 카드 생성의 범위·산출물(사전 템플릿 / 수동 배치 모드)은 반드시 달라진다.** "리스크 없음"이 아니라 **"일정 리스크 → 범위 리스크로 전환"**이다.
>
> ⚠️ **포맷 정정 — P0 = 세로 1080×1920**: 본 문서는 초안(2026-05-08)이라 본문 예시·스키마가 정사각 **1080×1080** 기준으로 쓰였다. 그러나 requirements v1에서 **P0 카드는 세로 1080×1920(스토리)로 확정**됐다([requirements F07](../requirements.md)). 구현·검증 시 모든 캔버스·export 치수를 **1080×1920**로 적용한다 — 정사각 1080×1080은 **P1(F09)** 포맷 토글이다.

---

## 0. 왜 이 PoC가 필요한가

TripLog의 핵심 가치(인스타 카드 자동 생성)의 성패가 **이 단계에서 결정**됩니다.

본격 개발 전에 다음을 검증해야 합니다:
- 사진을 직접 변환하지 않고도, **AI가 만든 JSON 명세 + 손글씨 폰트 + rough.js 곡선**만으로 인스타 톤이 나오는가
- 어떤 AI 모델(GPT-4o / Gemini / Claude) 조합이 가장 좋은가
- 카드 1장당 비용이 목표(~$0.025) 안에 들어오는가

**PoC 실패 시**: 폴백 시나리오(§7) 중 하나로 전환. 일정 자체는 폴백으로 보호되지만, 그 경우 Sprint 3 카드 생성의 범위·산출물(사전 템플릿 / 수동 배치 모드)은 달라진다.

---

## 1. 검증 가설

### 1-1. 핵심 가설 (Hypothesis)

> **사진을 직접 변환하지 않고도, "Vision LLM이 사진을 분석" → "텍스트 LLM이 카드 디자인 JSON 생성" → "프론트엔드가 Canvas+rough.js로 합성" 파이프라인만으로, 사용자 예시 인스타 톤의 80% 이상을 재현할 수 있다.**

### 1-2. 세부 가설과 합격 기준

| ID | 세부 가설 | 합격 기준 |
|---|---|---|
| H1 | Vision LLM이 사진 속 객체와 좌표를 정확히 출력한다 | 주요 객체 5개 중 4개 이상, bbox IoU ≥ 0.6 |
| H2 | 텍스트 LLM이 카드 디자인 JSON을 의도대로 생성한다 | 5장 중 3장 이상 미세 조정 없이 사용 가능 |
| H3 | rough.js + Bezier 곡선이 손그림 효과를 진짜처럼 만든다 | 일반인 5명에게 보여주고 "직접 그렸을 것 같다" 응답 60% 이상 |
| H4 | 결과물이 예시 인스타 톤을 80% 이상 따라간다 | 정성 평가 1~10점 척도, 평균 7점 이상 |
| H5 | 카드 1장당 비용이 $0.03 이하다 | 호출 로그 합산 측정 |
| H6 | 카드 생성 응답 시간이 5초 이하다 | 평균 응답 시간 |

---

## 2. 검증 단계

### Step 1. Vision LLM 객체 인식 비교

#### 목적
GPT-4o(vision) / Gemini 2.5 Flash / Claude Sonnet 4.6(vision) 중 **bbox 정확도 + 가격**이 가장 좋은 모델 선정.

#### 준비
**테스트 사진 5장** (다양한 카테고리)
1. 음식 사진 (캠핑 음식 — 사용자가 보낸 예시 톤과 같은 부류)
2. 풍경 (바다 + 노을)
3. 카페 인테리어 (컵·테이블·디저트)
4. 거리·골목 (간판·사람·가게)
5. 인물 + 배경 (전신 또는 반신)

**정답 bbox 라벨링** — 사진별로 사람이 직접 객체와 bbox 라벨링해서 정답지 작성. (도구: [labelImg](https://github.com/HumanSignal/labelImg) 또는 단순 좌표 수기 측정)

#### 공통 프롬프트
```
이 사진의 주요 객체를 식별하고 각 객체의 bounding box를 출력하세요.

출력 규칙:
- 좌표는 사진 너비·높이를 1로 정규화한 상대값
- bbox 형식: [x1, y1, x2, y2] (좌상단·우하단)
- salience: 0.0~1.0 (사진에서의 시각적 중요도)
- 최대 5개 객체

JSON 외 다른 텍스트는 출력하지 마세요.

{
  "objects": [
    { "name": "...", "bbox": [x1, y1, x2, y2], "salience": 0.0 }
  ],
  "mood": "한 줄 분위기 묘사",
  "dominant_colors": ["#hex", "#hex", "#hex"]
}
```

#### 측정 항목
| 항목 | 측정 방법 |
|---|---|
| bbox IoU | 정답 bbox와 모델 출력 bbox의 Intersection over Union |
| 객체명 정확도 | 정답 객체명과 모델 출력 객체명 일치율 |
| 응답 시간 | API 호출~응답 (ms) |
| 비용 | 입력 토큰·이미지 토큰 + 출력 토큰 |
| 출력 일관성 | 같은 사진 3회 호출 시 결과 차이 |

#### 산출물
모델별 비교표 (§4)

---

### Step 2. 카드 디자인 JSON 생성 검증

#### 목적
Step 1에서 추출한 객체 정보 + 사용자 메타 → **인스타 카드 레이아웃 JSON**을 LLM이 잘 만드는지 확인.

#### 입력 예시
```
사진 분석 결과:
- 객체: shrimp(0.3,0.4,0.5,0.6), bread(0.18,0.10,0.34,0.22), 
        broccoli(0.62,0.50,0.74,0.62), pan(0.78,0.70,0.92,0.82)
- 분위기: 따뜻한 야간 캠핑, 풍성한 음식
- 주된 색: #3a2a1a, #d4a574, #f0c987

여행 정보:
- 위치: 양양 캠핑장
- 날짜: 2024-10-12
- 인원: 2명
- 사용자 메모: "캠핑에서 새우구이 진짜 미쳤다, 바게트랑 같이 먹으니까 환상"

요청: 인스타 스토리용 세로 카드 (1080×1920) 레이아웃 JSON을 만들어주세요.
포함할 요소:
- 메인 캡션 (손글씨 톤, 1~2줄)
- 객체를 가리키는 화살표 1~2개
- 강조할 단어의 물결 언더라인
- 작은 장식 (♡, ✨ 등 사전 스티커 ID 참조: heart_01, sparkle_02 등)
- 해시태그 3~5개
- 하단 정보 박스 (장소·날짜·인원)

좌표는 1080×1920 기준 픽셀값으로.
```

#### 출력 JSON 스키마
```json
{
  "canvas": { "width": 1080, "height": 1920, "background": "#1a1410" },
  "photo": { "x": 0, "y": 200, "w": 1080, "h": 700, "filter": "warm" },
  "captions": [
    {
      "id": "c1",
      "text": "오늘의 메뉴는\n우리만의 레스토랑",
      "x": 80, "y": 60,
      "font": "KCCHanbit",
      "size": 48,
      "color": "#fffaf0",
      "annotations": [
        { "type": "wavy_underline", "target_words": ["레스토랑"], "color": "#ffd700" }
      ]
    }
  ],
  "arrows": [
    {
      "from_caption": "c2",
      "to_object": "shrimp",
      "style": "curly",
      "color": "#ffd700"
    }
  ],
  "object_circles": [
    { "to_object": "shrimp", "style": "rough_dotted", "color": "#fff" }
  ],
  "stickers": [
    { "id": "heart_pen_03", "x": 200, "y": 110, "rotation": 15, "scale": 0.8 },
    { "id": "sparkle_02", "x": 700, "y": 320 }
  ],
  "hashtags": ["#캠핑맛집", "#양양캠핑", "#오늘은우리가셰프"],
  "info_box": {
    "place": "양양 캠핑장",
    "date": "2024.10.12",
    "people": 2,
    "x": 60, "y": 1790
  }
}
```

#### 측정 항목
| 항목 | 합격 기준 |
|---|---|
| JSON 파싱 가능 | 100% |
| 객체 좌표 참조 정확도 | 화살표 타깃 객체가 실제 사진 속 위치와 매칭 |
| 캡션 톤 자연스러움 | 정성 평가 |
| 결과물의 직접 사용 가능률 | 5장 중 3장 이상 |

#### 비교 모델 후보
- Claude Sonnet 4.6
- GPT-4o-mini
- Gemini 2.5 Flash
- (Step 1에서 Vision으로 쓴 모델과 합칠 수 있는지도 확인)

---

### Step 3. 프론트엔드 합성 PoC

#### 목적
JSON → 실제 PNG 카드까지 렌더링까지 가는지 검증.

#### 최소 구현 요건
- Vue 3 + Konva.js 단일 페이지
- 사진 1장 + 정해진 JSON으로 Canvas 합성
- **손글씨 폰트** 적용 (Google Fonts: Gaegu / Single Day / Nanum Pen Script)
- **rough.js**로 곡선 화살표 그리기
- **Bezier 경로**로 물결 언더라인 그리기
- 정적 스티커 PNG 합성
- PNG export (1080×1920)

#### 핵심 의사 코드
```javascript
import Konva from 'konva';
import rough from 'roughjs';

function renderCard(jsonSpec, photoUrl) {
  const stage = new Konva.Stage({
    container: 'canvas',
    width: jsonSpec.canvas.width,
    height: jsonSpec.canvas.height,
  });
  const layer = new Konva.Layer();

  // 1. 배경
  layer.add(new Konva.Rect({
    fill: jsonSpec.canvas.background,
    width: stage.width(), height: stage.height(),
  }));

  // 2. 사진
  Konva.Image.fromURL(photoUrl, img => {
    img.setAttrs({ x: jsonSpec.photo.x, y: jsonSpec.photo.y, ... });
    layer.add(img);
  });

  // 3. 캡션 + 언더라인
  jsonSpec.captions.forEach(c => {
    const text = new Konva.Text({
      text: c.text, x: c.x, y: c.y, fontFamily: c.font,
      fontSize: c.size, fill: c.color,
    });
    layer.add(text);
    c.annotations?.forEach(a => {
      if (a.type === 'wavy_underline') drawWavyUnderline(layer, text, a);
    });
  });

  // 4. 화살표 (rough.js)
  jsonSpec.arrows.forEach(arr => {
    const from = lookupCaption(jsonSpec, arr.from_caption);
    const to = lookupObject(jsonSpec, arr.to_object);
    drawRoughArrow(layer, from, to, arr.style, arr.color);
  });

  // 5. 객체 동그라미
  jsonSpec.object_circles.forEach(c => drawRoughCircle(layer, c));

  // 6. 스티커
  jsonSpec.stickers.forEach(s => loadSticker(layer, s));

  // 7. 해시태그·정보 박스
  drawHashtags(layer, jsonSpec.hashtags);
  drawInfoBox(layer, jsonSpec.info_box);

  layer.draw();
  return stage.toDataURL({ pixelRatio: 2 }); // PNG
}
```

#### 합격 기준
| 항목 | 기준 |
|---|---|
| 렌더링 시간 | 사진 로드 후 1초 이내 |
| Export 정확도 | 1080×1920 PNG, 폰트 안 깨짐 |
| 손그림 자연스러움 | rough.js 효과가 원하는 톤 |

---

### Step 4. 종합 인스타 톤 평가

#### 목적
완성된 결과물이 실제 인스타 트렌드와 비교해 어디까지 도달했나.

#### 비교 대상
- 사용자가 보낸 **예시 인스타 카드** (캠핑 음식)
- 인스타 #여행스타그램 #카페일상 등 트렌드 샘플 5장

#### 평가 방식
1. **정성 평가** — 팀원 + 친구·동기 5명에게 결과물 5장 보여주기
   - 각 카드 1~10점 (인스타 톤 유사도)
   - "인스타에 그대로 올릴 의향" 5점 척도
   - 자유 코멘트
2. **블라인드 테스트** — AI 결과물과 실제 인스타 카드를 섞어서 보여주고 "어느 게 AI"인지 맞히게 함

#### 합격 기준
- 평균 톤 유사도 7점 이상
- 블라인드 테스트에서 60% 이상이 AI를 식별 못 함

---

### Step 5. 비용·속도 실측

#### 목적
실제 운영 시 비용·응답 시간이 목표 안에 드는지.

#### 측정
- 카드 5장을 끝까지 만드는 동안 모든 LLM 호출의 토큰·시간·비용 로깅
- 1장당 평균 = 합계 / 5

#### 합격 기준
- 1장당 평균 비용 ≤ $0.03
- 1장당 평균 응답 시간 ≤ 5초 (사진 업로드 후 카드 노출까지)

---

## 3. 도구·환경 설정

### 3-1. API 키 발급

| 모델 | 발급처 | 비고 |
|---|---|---|
| GPT-4o, GPT-4o-mini, gpt-image-1 | https://platform.openai.com | 신규 가입 시 무료 크레딧 (확인 필요) |
| Gemini 2.5 Flash, Imagen 3 | https://aistudio.google.com | **AI Studio는 무료 한도 제공** (분당 호출 제한 있음) |
| Claude Sonnet 4.6, Haiku 4.5 | https://console.anthropic.com | 신규 가입 시 무료 크레딧 |

### 3-2. PoC 환경 (스크립트 검증용)

**Python (Step 1, 2 검증)**
```bash
pip install openai google-generativeai anthropic Pillow python-dotenv
```
```python
# .env
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
```

**Node.js + Vue (Step 3 합성)**
```bash
npm create vue@latest triplog-poc
cd triplog-poc
npm install konva roughjs
```
```html
<!-- 손글씨 폰트 -->
<link href="https://fonts.googleapis.com/css2?family=Gaegu&family=Single+Day&family=Nanum+Pen+Script&display=swap" rel="stylesheet">
```

### 3-3. 한글 손글씨 폰트 후보
| 폰트 | 출처 | 라이선스 |
|---|---|---|
| Gaegu | Google Fonts | OFL |
| Single Day | Google Fonts | OFL |
| Nanum Pen Script | Google Fonts | OFL |
| Cafe24 써라운드 | https://fonts.cafe24.com | 무료 (상업 가능) |
| KCC한빛체 | https://www.kcc.go.kr | 무료 (상업 가능) |

---

## 4. 비교 매트릭스 (PoC 후 채울 표)

### 4-1. Vision LLM (Step 1)

| 모델 | bbox IoU 평균 | 객체명 정확도 | 응답 시간 | 1회 비용 | 무료 한도 | 비고 |
|---|---|---|---|---|---|---|
| GPT-4o | ? | ? | ? | ? | ? | ? |
| Gemini 2.5 Flash | ? | ? | ? | ? | ? | bbox 네이티브 지원 |
| Gemini 2.5 Pro | ? | ? | ? | ? | ? | ? |
| Claude Sonnet 4.6 | ? | ? | ? | ? | ? | ? |

### 4-2. 텍스트 LLM (Step 2)

| 모델 | JSON 파싱률 | 좌표 참조 정확도 | 캡션 자연스러움 | 응답 시간 | 1회 비용 |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | ? | ? | ? | ? | ? |
| Claude Haiku 4.5 | ? | ? | ? | ? | ? |
| GPT-4o-mini | ? | ? | ? | ? | ? |
| Gemini 2.5 Flash | ? | ? | ? | ? | ? |

### 4-3. 종합

| 단계 | 최종 선정 모델 | 근거 |
|---|---|---|
| Vision (객체+bbox) | TBD | TBD |
| 텍스트 (카드 JSON) | TBD | TBD |
| 텍스트 (일정 생성) | TBD | TBD |
| 텍스트 (회고록) | TBD | TBD |
| 이미지 (스티커 시트) | TBD | TBD |

---

## 5. PoC 산출물 (검증 후 작성)

1. **§4 비교 매트릭스** 채워서 모델 결정
2. **실패 사례 분석** — 어떤 사진·요청에서 결과가 나빴나, 패턴은?
3. **카드 생성 파이프라인 의사코드** (확정 버전)
4. **스티커 시트 1차** (개발 초기 일러스트 자산 80~150개)
5. **폴백 시나리오 결정** (§7 중 어떤 옵션으로 갈지)
6. **본문 기획서 v2 업데이트** — D1, D7 결정 항목 채우기

---

## 6. 검증 일정 (제안)

| Day | 작업 | 산출물 |
|---|---|---|
| Day 1 | API 키 발급, 테스트 사진 5장 + 정답 bbox 라벨링, 환경 세팅 | 테스트 데이터셋 |
| Day 2 | **Step 1** — Vision LLM 3종 비교 | §4-1 표 |
| Day 3 | **Step 2** — 텍스트 LLM 3종으로 카드 JSON 생성 | §4-2 표 |
| Day 4 | **Step 3** — Vue + Konva.js 합성 PoC | 동작하는 카드 1장 |
| Day 5 | **Step 4 + Step 5** — 정성 평가 + 비용·속도 실측 | 평가 점수, 비용 데이터 |
| Day 6 | 종합 보고서 + 모델 결정, 기획서 v2 반영 | 본 문서 §4·§5 완성 |

총 약 1주 (집중 시 5일).

---

## 7. 폴백 시나리오 (PoC 결과별 분기)

| 상황 | 1차 폴백 | 2차 폴백 |
|---|---|---|
| Vision LLM bbox 정확도 < 60% | 객체 위치 지정 UI 노출 (사용자가 사진 위 클릭으로 객체 마킹) | 객체 인식 자체를 빼고 화살표는 사용자 수동 배치 |
| LLM JSON 일관성 부족 | 디자인 템플릿 5종 사전 제작 → LLM은 "어떤 템플릿"만 선택 | 템플릿만 사용, AI는 캡션 텍스트만 생성 |
| rough.js 결과 품질 낮음 | SVG 손그림 자산 라이브러리로 화살표·언더라인도 사전 제작 | 일반 SVG 도형으로 단순화 |
| 비용 초과 | Vision + 텍스트를 Gemini Flash 단일 호출로 통합 | 무료 한도 안에서 사용량 제한 |
| 모든 게 실패 | "사용자 직접 디자인 + 사전 스티커 라이브러리 + AI 캡션만" 모드로 회귀 | 인스타 카드 기능 자체를 P1으로 강등, 회고록 글 생성에 집중 |

---

## 8. 체크리스트 (PoC 시작 전)

- [ ] 테스트 사진 5장 (음식·풍경·카페·거리·인물)
- [ ] 각 사진의 정답 bbox 사람이 직접 라벨링
- [ ] 비교 대상 인스타 카드 5장 캡처
- [ ] OpenAI API 키
- [ ] Google AI Studio API 키
- [ ] Anthropic API 키
- [ ] 손글씨 한글 폰트 다운로드 (Gaegu, KCC한빛 등)
- [ ] §4 비교 매트릭스 빈 표 준비 (스프레드시트 등)
- [ ] PoC 결과 평가에 도와줄 친구 5명 섭외

---

## 9. 참고 자료

- 사용자 제공 예시 인스타 카드 (캠핑 음식)
- rough.js: https://roughjs.com/
- Konva.js: https://konvajs.org/
- Fabric.js (대안): https://fabricjs.com/
- Google Fonts (한글): https://fonts.google.com/?subset=korean
- Cafe24 폰트: https://fonts.cafe24.com/
- 한국관광공사 TourAPI: https://api.visitkorea.or.kr/
- Gemini Vision bbox 가이드: https://ai.google.dev/gemini-api/docs/vision

---

## 10. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| v1 | 2026-05-08 | 초안 작성 |
| v2 | 2026-05-29 | 포맷 정정: P0 카드 = 세로 **1080×1920**(스토리)로 본문 치수·스키마 통일, 정사각 1080×1080은 P1(F09)로 분리. PoC 실패 = 일정 리스크가 아니라 **범위 리스크**임을 명시(요구사항 F07 충돌 해소). |
